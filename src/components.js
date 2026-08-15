/**
 * React components for the terminal surface. One layer, five pieces:
 * TerminalRoot (state + wiring), StatusBar, Scrollback (sections → blocks),
 * typed block renderers (UserBlock / AssistantBlock / ToolBlock /
 * SystemLine / PendingLine / TurnHead), PromptBar (input + history).
 * Rendering is JSX-free: a tiny `h()` helper over react/jsx-runtime keeps
 * the bundle build-less.
 */

/** Minimal JSX substitute: h(tag, props, ...children).
 * `key` is split out and passed through the jsx-runtime key slot (React
 * requires keys on the element, not spread inside props). Children are only
 * attached when present, so void elements (input) never receive a children
 * prop. */
function h(tag, props, ...children) {
  const { key, ...rest } = props ?? {};
  if (children.length > 0) rest.children = children.length === 1 ? children[0] : children;
  return react_jsx_runtime.jsx(tag, rest, key);
}

/** Read-only observable source for the no-current-session state: the bound
 * session hook stays mounted and reads undefined until a session appears. */
const ABSENT_SOURCE = {
  getSnapshot: () => void 0,
  subscribe: () => () => {}
};

/** Duration as "12ms" / "1.4s" / "2m14s". */
function fmtDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

/** Spinner frames for the working indicator. */
const SPINNER = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

/** Collapsible reasoning block: hidden by default behind a "thinking……"
 * toggle; clicking expands/collapses the reasoning text. The main message
 * stays fully visible — only the thinking process is tucked away. */
function ReasoningBlock({ text, running }) {
  const [open, setOpen] = react.useState(false);
  const body = currentMode() === "plain"
    ? truncate(text ?? "", LIMITS.textParseCap)
    : renderMarkdown(text, "r");
  return h("div", { className: "term-reason", "data-open": open ? "true" : void 0 }, [
    h("button", {
      type: "button",
      className: "tr-toggle",
      key: "tg",
      onClick: () => setOpen((v) => !v),
      title: open ? "collapse reasoning" : "show reasoning"
    }, `${open ? "▾" : "▸"} thinking${running ? "…▌" : "……"}`),
    open ? h("div", { className: "tr-body", key: "body" }, body) : null
  ]);
}

/** Assistant blocks → node list; appends the streaming cursor when running.
 * In plain (safe) mode text renders as raw truncated lines — no parsing —
 * so pathological content can never stall the page. */
function blocksToNodes(blocks, running, interrupted) {
  const nodes = [];
  const plain = currentMode() === "plain";
  blocks.forEach((block, index) => {
    const key = `b${index}`;
    if (block.kind === "text") {
      if (plain) {
        nodes.push(h("div", { className: "term-para", key }, truncate(block.text ?? "", LIMITS.textParseCap)));
      } else {
        const rendered = renderMarkdown(block.text, key);
        if (rendered !== null) nodes.push(rendered);
      }
    } else if (block.kind === "reasoning") {
      nodes.push(h(ReasoningBlock, { text: block.text ?? "", running, key }));
    } else if (block.kind === "tool-call") {
      nodes.push(
        h("div", { className: "term-line", "data-tone": "tool", key },
          h("span", { className: "term-prompt" }, "→ "), `${block.name}${block.argsRaw ? ` ${jsonArgs(block.argsRaw)}` : ""}`)
      );
    } else {
      nodes.push(h("div", { className: "term-line", "data-tone": "faint", key }, `[${block.kind ?? "block"}]`));
    }
  });
  if (interrupted) nodes.push(h("span", { className: "term-interrupt", key: "int" }, "  ⚡ interrupted"));
  if (running) nodes.push(h("span", { className: "term-run", key: "run" }, "▌"));
  return nodes;
}

/** L0: turn separator — `── 14:02:31 ─ USER ────────`. */
function TurnHead({ head }) {
  return h("div", { className: "term-head" }, [
    h("span", { className: "th-time", key: "t" }, fmtTime(head.time)),
    h("span", { className: "th-role", key: "r" }, head.role)
  ]);
}

/** L1: user input block — accent-bordered, tinted, `$` prompt inside. */
function UserBlock({ group }) {
  const steer = group.type === "steering";
  const content = currentMode() === "plain"
    ? h("div", { className: "tu-text", key: "t" }, truncate(group.text ?? "", LIMITS.textParseCap))
    : h("div", { className: "tu-text", key: "t" }, renderMarkdown(group.text, "u"));
  return h("div", { className: "term-user", "data-steer": steer ? "true" : void 0 }, [
    h("span", { className: "tu-prompt", key: "p" }, steer ? "⚡" : "$"),
    content
  ]);
}

/** L2: assistant output — primary text, code boxes, cursor/interrupt marks. */
function AssistantBlock({ group }) {
  return h("div", { className: "term-assistant" },
    blocksToNodes(group.blocks ?? [], group.running === true, group.interrupted === true));
}

/** L3: tool tree — call line, status, nested output. */
function ToolBlock({ group }) {
  const glyph = group.status === "running" ? "…" : group.status === "error" ? "✗" : "✓";
  const statusText = group.status === "running"
    ? "running"
    : group.status === "error"
      ? "failed"
      : "done";
  const duration = group.status === "done" && group.callTime !== null
    ? fmtDuration((group.time ?? 0) - group.callTime)
    : "";
  const kids = [
    h("div", { className: "tt-call", key: "call" }, [
      h("span", { className: "tt-glyph", key: "g" }, "└─"),
      h("span", { className: "tt-name", key: "n" }, group.name),
      group.args ? h("span", { className: "tt-args", key: "a" }, ` ${group.args}`) : null,
      group.nested > 0 ? h("span", { className: "tt-meta", key: "m" }, `+${group.nested} nested`) : null
    ]),
    h("div", { className: "tt-status", key: "s" },
      `${glyph} ${statusText}${duration ? ` · ${duration}` : ""}`)
  ];
  if (group.output !== void 0) {
    const lines = group.output.split("\n");
    const shown = lines.slice(0, LIMITS.toolOutputLineCap);
    const hidden = lines.length - shown.length;
    kids.push(h("div", { className: "tt-out", key: "o" },
      `${shown.join("\n")}${hidden > 0 ? `\n... ${hidden} more lines` : ""}`));
  }
  return h("div", { className: "term-tool", "data-status": group.status }, kids);
}

/** L4: system notice line (compaction, retry, errors, context…). */
function SystemLine({ group, children }) {
  return h("div", { className: "term-system", "data-tone": group.tone ?? "dim" }, [
    group.text,
    children
  ]);
}

/** Command output dock: a FIXED-SIZE area above the input bar holding the
 * local log. Three zones with a clear color language:
 *   · RED    — errors (failed commands, send failures, window errors)
 *   · AMBER  — warnings (stalls, declined actions) — same-type messages
 *              collapse into one always-current line
 *   · default— everything else (echoes, \help, \sessions …)
 * The alert strips sit at the BOTTOM — errors last, right above the input
 * bar — so a fresh mistake lands at the bottom as a reminder. Bounded by
 * construction — max height + ring pruning — hidden entirely while empty. */
function CommandLog({ localLog }) {
  const scrollRef = react.useRef(null);
  const stickRef = react.useRef(true);
  react.useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [localLog]);
  const onScroll = react.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);
  if (localLog.length === 0) return null;

  const errors = [];
  const warnings = [];
  const normal = [];
  for (const entry of localLog) {
    if (entry.tone === "red") errors.push(entry);
    else if (entry.tone === "amber") warnings.push(entry);
    else normal.push(entry);
  }
  const alertStrip = (kind, entries) => {
    if (entries.length === 0) return null;
    const latest = entries[entries.length - 1];
    const text = kind === "error"
      ? `✗ ${entries.length} 错误 error${entries.length > 1 ? "s" : ""}: ${latest.text}`
      : `⚠ ${entries.length} 警告 warning${entries.length > 1 ? "s" : ""}: ${latest.text}`;
    return h("div", { className: "tcl-alert", "data-kind": kind, key: kind }, [
      h("span", { className: "ta-text", key: "t" }, text),
      h("span", { className: "ta-hint", key: "h" }, "\\diag 详情")
    ]);
  };

  // Body: normal entries with consecutive identical lines collapsed (×N).
  const body = [];
  for (const entry of normal) {
    const prev = body[body.length - 1];
    if (prev !== void 0 && prev.entry.text === entry.text && prev.entry.tone === entry.tone) {
      prev.count += 1;
      prev.key = entry.key;
      continue;
    }
    body.push({ entry, count: 1, key: entry.key });
  }
  const children = [
    h("div", { className: "tcl-head", key: "head" },
      `· command output · ${localLog.length} lines — \\clear clears`)
  ];
  for (const row of body) {
    children.push(h(SystemLine, {
      group: { ...row.entry, tone: row.entry.tone ?? "fg" },
      key: row.key
    }, row.count > 1 ? h("span", { className: "tcl-x", key: "x" }, ` ×${row.count}`) : null));
  }
  // Reading order: header → normal body → warnings → errors LAST, right
  // above the input bar, so a fresh mistake lands at the bottom as a
  // reminder instead of getting buried at the top.
  children.push(alertStrip("warn", warnings));
  children.push(alertStrip("error", errors));
  return h("div", { className: "term-cmdlog", ref: scrollRef, onScroll }, children);
}

/** Completed-turn marker: `── ✓ turn complete · 2m14s ──`. Answers "did the
 * task finish" right where the turn's output ends. */
function TurnEndBlock({ group }) {
  const duration = group.duration !== void 0 ? ` · ${fmtDuration(group.duration)}` : "";
  return h("div", { className: "term-turnend" }, [
    h("span", { className: "te-ok", key: "ok" }, "✓"),
    h("span", { key: "txt" }, `turn complete${duration}`)
  ]);
}

/** Pending interaction banner (question / approval). */
function PendingLine({ group }) {
  return h("div", { className: "term-pending" }, [
    h("span", { key: "t" }, `⚠ ${group.text}`),
    group.hint ? h("span", { className: "tp-hint", key: "h" }, group.hint) : null
  ]);
}

/** Dispatch one typed group to its block renderer. */
function BlockOf({ group }) {
  switch (group.type) {
    case "user":
    case "steering":
      return h(UserBlock, { group });
    case "assistant":
      return h(AssistantBlock, { group });
    case "tool":
      return h(ToolBlock, { group });
    case "pending":
      return h(PendingLine, { group });
    case "turn-end":
      return h(TurnEndBlock, { group });
    default:
      return h(SystemLine, { group });
  }
}

/** Top bar: brand, current session, live activity, clock. While the agent
 * runs, a spinner animates and the elapsed time ticks up; idle shows a
 * check; pending interactions warn. This is the at-a-glance answer to
 * "is the task still running?". */
function StatusBar({ sessions, snapshot, sessionId, session, onPrevSession, onNextSession, onTogglePreview, previewOpen }) {
  const [now, setNow] = react.useState(() => wallClock());
  const running = snapshot?.running === true;
  const pending = snapshot?.pending?.length ?? 0;
  const queued = snapshot?.queue?.length ?? 0;
  const [frame, setFrame] = react.useState(0);
  const runStartRef = react.useRef(null);
  const [elapsed, setElapsed] = react.useState(0);
  // Compact session/system details live in the top bar: permission mode and
  // context pressure (projection faces; absent → undefined).
  const useFace = (key) => react.useMemo(
    () => bindSnapshotSelector(
      session?.projections?.faceOf ? session.projections.faceOf(key) : ABSENT_SOURCE
    ),
    [session, key]
  );
  const permissions = useFace("permissions")((v) => v);
  const pressure = useFace("contextPressure")((v) => v);
  const ctxPct = (pressure?.contextWindow ?? 0) > 0
    ? Math.min(100, Math.round(((pressure?.pressureTokens ?? 0) / pressure.contextWindow) * 100))
    : null;
  react.useEffect(() => {
    const clock = setInterval(() => setNow(wallClock()), 1000);
    if (running) {
      runStartRef.current = runStartRef.current ?? Date.now();
      const spin = setInterval(() => {
        setFrame((f) => f + 1);
        setElapsed(Date.now() - runStartRef.current);
      }, 120);
      return () => {
        clearInterval(clock);
        clearInterval(spin);
      };
    }
    runStartRef.current = null;
    return () => clearInterval(clock);
  }, [running]);
  const s = sessionId === void 0 ? void 0 : sessions?.byId?.[sessionId];
  const activity = running
    ? [
      h("span", { className: "ts-spin", key: "sp" }, SPINNER[frame % SPINNER.length]),
      h("span", { className: "ts-run", key: "run" }, `running ${fmtDuration(elapsed)}`)
    ]
    : pending > 0
      ? [
        h("span", { className: "ts-dot", "data-warn": "true", key: "dot" }),
        h("span", { key: "run" }, `pending ${pending}`)
      ]
      : [
        h("span", { className: "ts-ok", key: "dot" }, "✓"),
        h("span", { key: "run" }, "idle")
      ];
  const right = [
    ...activity,
    queued > 0 ? h("span", { className: "ts-sep", key: "q" }, `queued ${queued}`) : null,
    h("span", { className: "ts-sep", key: "ph" }, sessions?.phase ?? ""),
    h("span", { className: "ts-sep", key: "clk" }, now)
  ];
  // Sessions live in the top bar: ‹ › cycles the list (the terminal has
  // commands, so no separate session panel is needed).
  const nav = sessionId === void 0 ? null : h("span", { className: "ts-nav", key: "nav" }, [
    h("button", { type: "button", className: "ts-navbtn", key: "p", title: "previous session", onClick: onPrevSession }, "‹"),
    h("button", { type: "button", className: "ts-navbtn", key: "n", title: "next session", onClick: onNextSession }, "›")
  ]);
  // Visible affordances: version marker (proves the build is live), the
  // preview-card toggle, and the cross-session pending badge — the new
  // features must be discoverable, not hidden behind commands alone.
  const previewBtn = h("button", {
    type: "button",
    className: "ts-navbtn",
    "data-active": previewOpen ? "true" : void 0,
    key: "pv",
    title: previewOpen ? "close preview (\\preview)" : "open preview card (\\preview)",
    onClick: onTogglePreview
  }, previewOpen ? "✕⧉" : "⧉");
  return h("div", { className: "term-status" }, [
    h("span", { className: "ts-brand", key: "b" }, "dsh▮terminal"),
    h("span", { className: "ts-ver", key: "v" }, "v0.5"),
    h("span", { className: "ts-sep", key: "s1" }, "·"),
    h("span", { key: "id" }, sessionId ? `session ${shortId(sessionId)}` : "no session"),
    nav,
    previewBtn,
    s?.displayTitle ? h("span", { className: "ts-sep", key: "t" }, `· ${truncate(s.displayTitle, 40)}`) : null,
    (permissions?.currentValue !== void 0 || ctxPct !== null)
      ? h("span", { className: "ts-sep ts-meta", key: "meta" },
        [permissions?.currentValue ?? "", ctxPct !== null ? `ctx ${ctxPct}%` : ""].filter(Boolean).join(" · "))
      : null,
    h("span", { className: "ts-right", key: "r" }, right)
  ]);
}

/** Scrollable scrollback: the conversation document only — command output
 * lives in the fixed-size CommandLog dock above the input bar. Every state
 * is visible: connecting, no session, blank session, history loading. With
 * a docked `panel` open (e.g. "diag") the panel content replaces the
 * conversation view — the status bar and the input bar stay mounted. */
function Scrollback({ model, snapshot, clearedKeys, listPhase, sessionId, panel }) {
  const scrollRef = react.useRef(null);
  const stickRef = react.useRef(true);
  const sections = react.useMemo(
    () => model.sections
      .map((section) => ({
        ...section,
        items: section.items.filter((group) => group.key === void 0 || !clearedKeys.has(group.key))
      }))
      .filter((section) => section.items.length > 0),
    [model, clearedKeys]
  );
  react.useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [sections, snapshot, panel]);
  const onScroll = react.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  const children = [];
  if (panel === "diag") {
    children.push(
      h("div", { className: "term-system", "data-tone": "accent", key: "dhead" },
        "diagnostic panel — type \\diag or \\exit to close (input bar stays active)")
    );
    const lines = diagContentLines(diagRecord());
    lines.forEach((line, index) => {
      children.push(h("div", { className: "term-line", "data-tone": "dim", key: `d${index}` }, line));
    });
    return h("div", { className: "term-scroll", ref: scrollRef, onScroll }, children);
  }
  const connecting = listPhase !== void 0 && listPhase !== "ready";
  if (connecting) {
    children.push(
      h("div", { className: "term-system", "data-tone": "dim", key: "conn" },
        `connecting to the host… (sessions: ${listPhase})`)
    );
  } else if (sessionId === void 0) {
    children.push(
      h("div", { className: "term-system", "data-tone": "amber", key: "ns" },
        "no current session — type \\new to start one, \\sessions to list existing")
    );
  } else if (sections.length === 0 && snapshot !== void 0) {
    const opening = snapshot.openState === "cold" || snapshot.openState === "loading";
    children.push(
      h("div", { className: "term-system", "data-tone": opening ? "dim" : "amber", key: "blank" },
        opening
          ? "loading conversation history…"
          : "blank session — type a message below, or \\sessions / \\open to switch to an older conversation")
    );
  }
  sections.forEach((section, sectionIndex) => {
    if (section.head !== null) {
      children.push(h(TurnHead, { head: section.head, key: `h${sectionIndex}` }));
    }
    section.items.forEach((group, index) => {
      children.push(h(BlockOf, { group, key: group.key ?? `${sectionIndex}-${index}` }));
    });
  });
  return h("div", { className: "term-scroll", ref: scrollRef, onScroll }, children);
}

/** One key/value row in the details sidebar. */
function DetailsRow({ k, v, tone }) {
  return h("div", { className: "td-row", key: k }, [
    h("span", { className: "td-k", key: "k" }, k),
    h("span", { className: "td-v", "data-tone": tone ?? void 0, key: "v" }, v)
  ]);
}

/** File extension of a path (lowercase, no dot). */
function extOf(path) {
  const base = String(path).split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

/** Small file-type glyph for the files list. */
function fileGlyph(path) {
  const ext = extOf(path);
  if (ext === "html" || ext === "htm") return "🌐";
  if (["js", "ts", "jsx", "tsx", "py", "css", "json", "md", "sh", "ps1", "yml", "yaml", "xml"].includes(ext)) return "📄";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext)) return "🖼";
  return "📎";
}

/** Common keywords for the light highlighter (works across languages). */
const HL_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
  "switch", "case", "break", "continue", "new", "class", "extends", "import",
  "export", "from", "default", "try", "catch", "finally", "throw", "async",
  "await", "yield", "typeof", "instanceof", "in", "of", "this", "super", "null",
  "undefined", "true", "false", "void", "static", "public", "private", "get",
  "set", "def", "elif", "lambda", "pass", "None", "True", "False", "and", "or",
  "not", "with", "as", "assert", "global", "nonlocal", "int", "str", "list",
  "dict", "print", "struct", "enum", "match", "fn", "let", "mut", "impl",
  "SELECT", "INSERT", "UPDATE", "DELETE", "FROM", "WHERE", "CREATE", "TABLE",
  "ALTER", "INDEX", "PRIMARY", "KEY", "VALUES", "SET"
]);

/** Lightweight syntax highlighting: comments / strings / numbers / keywords.
 * Readability-first, regex-based — no parser, bounded work. */
function highlightCode(text) {
  if (typeof text !== "string" || text === "") return null;
  const source = text.length > LIMITS.textParseCap ? truncate(text, LIMITS.textParseCap) : text;
  const re = /(\/\/[^\n]*|#[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)\b/g;
  const nodes = [];
  let last = 0;
  let seq = 0;
  let match;
  while ((match = re.exec(source)) !== null) {
    if (match.index > last) nodes.push(source.slice(last, match.index));
    const key = `h${seq++}`;
    if (match[1] !== void 0) {
      nodes.push(h("span", { className: "hl-com", key }, match[1]));
    } else if (match[2] !== void 0) {
      nodes.push(h("span", { className: "hl-str", key }, match[2]));
    } else if (match[3] !== void 0) {
      nodes.push(h("span", { className: "hl-num", key }, match[3]));
    } else if (HL_KEYWORDS.has(match[4])) {
      nodes.push(h("span", { className: "hl-kw", key }, match[4]));
    } else {
      nodes.push(match[4]);
    }
    last = match.index + match[0].length;
  }
  if (last < source.length) nodes.push(source.slice(last));
  return nodes;
}

/** One clickable approval card in the sidebar (allow / reject). */
function PendingApprovalCard({ wait, log }) {
  const payload = wait.payload ?? {};
  const doApprove = () => {
    try {
      respondApproval(wait, "allowed-once");
    } catch (error) {
      log(`approve failed: ${error.message}`, "red");
    }
  };
  const doDecline = () => {
    try {
      respondApproval(wait, "rejected");
    } catch (error) {
      log(`decline failed: ${error.message}`, "red");
    }
  };
  return h("div", { className: "td-pending" }, [
    h("div", { className: "tp-title", key: "t" }, `⚠ ${payload.reason ?? payload.toolName ?? "approval"}`),
    h("div", { className: "tp-actions", key: "a" }, [
      h("button", { className: "td-btn", "data-ok": "true", onClick: doApprove, key: "ok" }, "✓ 允许"),
      h("button", { className: "td-btn", "data-bad": "true", onClick: doDecline, key: "bad" }, "✗ 拒绝")
    ])
  ]);
}

/** One clickable question card in the sidebar (option buttons or hint). */
function PendingQuestionCard({ wait, question, log }) {
  const options = Array.isArray(question.options) ? question.options : [];
  const answer = (raw) => {
    try {
      respondQuestion(wait, question, raw);
    } catch (error) {
      log(`answer failed: ${error.message}`, "red");
    }
  };
  const kids = [h("div", { className: "tp-title", key: "t" }, `? ${question.prompt ?? question.title ?? "question"}`)];
  if (options.length > 0) {
    kids.push(h("div", { className: "tp-actions", key: "a" },
      options.map((option, index) => h("button", {
        className: "td-btn",
        "data-ok": "true",
        onClick: () => answer(option.value ?? option.label ?? ""),
        key: index
      }, option.label ?? option.value ?? "?"))));
  } else {
    kids.push(h("div", { className: "td-empty", key: "h" }, "answer with \\answer <n> <text>"));
  }
  return h("div", { className: "td-pending" }, kids);
}

/** Collect pending approvals/questions across ALL listed sessions. The host
 * streams approval/question frames per session; materializing a session's
 * scope (binding) delivers its buffered waits with live respond carriers,
 * so the center can act on every session, not just the current one. Bounded
 * by a session cap — this is a polling view, not a scope storm. */
function collectPendings(sessions, list, cap = 12) {
  const groups = [];
  for (const id of list?.ids ?? []) {
    if (groups.length >= cap) break;
    let binding;
    try {
      binding = sessions.binding(id);
    } catch {
      continue; // a broken scope must not kill the whole center
    }
    if (binding === void 0) continue;
    const pending = binding.session.getSnapshot().pending;
    if (!Array.isArray(pending) || pending.length === 0) continue;
    groups.push({ id, waits: pending });
  }
  return groups;
}

/** The processing center: every session's pending approvals and questions
 * in one hierarchical, traceable view — session headers, per-item cards,
 * one-click actions (the waits carry live respond carriers), and a jump
 * button back to the owning session. `headless` suppresses the summary
 * line when hosted inside the bubble (which owns its own header). */
function PendingCenter({ groups, list, log, onJump, headless }) {
  const total = groups.reduce((n, g) => n + g.waits.length, 0);
  const kids = [];
  if (!headless) {
    kids.push(h("div", { className: "pc-head", key: "h" },
      `pending center — ${total} item(s) across ${groups.length} session(s) · auto-refresh 2.5s`));
  }
  if (groups.length === 0) {
    kids.push(h("div", { className: "pc-empty", key: "e" },
      "✓ no pending approvals or questions in any session"));
  }
  groups.forEach((group, gi) => {
    const summary = list?.byId?.[group.id];
    kids.push(h("div", { className: "pc-sess", key: `s${gi}` }, [
      h("div", { className: "pc-sesshead", key: "h" }, [
        h("button", {
          type: "button",
          className: "pc-jump",
          key: "j",
          title: `open session ${group.id}`,
          onClick: () => onJump(group.id)
        }, "⤷"),
        h("span", { className: "pc-sessname", key: "n" },
          `session ${shortId(group.id)} · ${truncate(summary?.displayTitle ?? group.id, 36)} (${group.waits.length})`)
      ]),
      h("div", { className: "pc-items", key: "i" },
        group.waits.map((wait, wi) => {
          if (wait.kind === "approval") {
            const payload = wait.payload ?? {};
            // Traceability line: which tool / call requested this decision.
            const trace = [payload.toolName, payload.callId].filter(Boolean).join(" · ");
            return h("div", { className: "pc-item", key: `a${wi}` }, [
              h(PendingApprovalCard, { wait, log, key: "card" }),
              trace ? h("div", { className: "pc-trace", key: "tr" }, trace) : null
            ]);
          }
          const questions = Array.isArray(wait.payload?.questions) ? wait.payload.questions : [];
          if (questions.length === 0) return null;
          return h("div", { className: "pc-item", key: `q${wi}` },
            questions.map((question, qi) => h(PendingQuestionCard, {
              wait,
              question,
              log,
              key: `q${wi}-${qi}`
            })));
        }))
    ]));
  });
  return h("div", { className: "pc-root" }, kids);
}

/** The pending bubble: an entry pill at the input line's bottom-left corner
 * that pops a floating card upward — the conversation stays fully visible
 * behind it (no view replacement). Hidden entirely while nothing is pending
 * and the bubble is closed. */
function PendingBubble({ groups, list, log, open, onToggle, onJump }) {
  const total = groups.reduce((n, g) => n + g.waits.length, 0);
  if (total === 0 && !open) return null;
  const kids = [];
  if (open) {
    kids.push(h("div", { className: "pb-backdrop", key: "bd", onPointerDown: onToggle }));
    kids.push(h("div", { className: "pb-pop", key: "pop" }, [
      h("div", { className: "pb-head", key: "h" }, [
        h("span", { className: "pb-title", key: "t" }, `pending · ${total} item(s) · ${groups.length} session(s)`),
        h("span", { className: "pb-hint", key: "z" }, "\\pending · \\exit closes"),
        h("button", { type: "button", className: "pb-close", key: "x", onClick: onToggle }, "✕")
      ]),
      h("div", { className: "pb-body", key: "b" },
        h(PendingCenter, { groups, list, log, onJump, headless: true }))
    ]));
  }
  return h("div", { className: "pb-root", "data-open": open ? "true" : void 0 }, [
    h("button", {
      type: "button",
      className: "pb-btn",
      "data-hot": total > 0 ? "true" : void 0,
      key: "btn",
      title: "pending approvals/questions across ALL sessions (\\pending)",
      onClick: onToggle
    }, `⚠ ${total}`),
    ...kids
  ]);
}

/** ZONE 2 — task output panel: produced files (list only), todos, pending
 * approvals/questions, goal and plan. Clicking a file opens its DETAILED
 * preview in zone 3, never inline here. */
function TaskZone({ session, sessionId, snapshot, log, workspaces, previewPath, onOpenFile }) {
  const useFace = (key) => react.useMemo(
    () => bindSnapshotSelector(
      session?.projections?.faceOf ? session.projections.faceOf(key) : ABSENT_SOURCE
    ),
    [session, key]
  );
  const todos = useFace("todos")((v) => v);
  const goal = useFace("goal")((v) => v);
  const plan = useFace("plan")((v) => v);

  const files = react.useMemo(() => producedFiles(snapshot), [snapshot]);
  const kids = [];
  // ── 产物 files (list only; detail opens in zone 3) ──
  kids.push(h("span", { className: "td-sec", key: "s-files" }, `产物 files (${files.length})`));
  if (files.length === 0) {
    kids.push(h("div", { className: "td-empty", key: "f-empty" },
      "files the agent writes/edits appear here — click to preview in the right pane"));
  } else {
    files.forEach((file, index) => {
      kids.push(h("div", {
        className: "td-file",
        "data-active": file.path === previewPath ? "true" : void 0,
        key: `f${index}`
      }, [
        h("span", { className: "tf-glyph", key: "g" }, fileGlyph(file.path)),
        h("span", {
          className: "tf-name",
          title: file.path,
          key: "n",
          onClick: () => onOpenFile(file.path)
        }, String(file.path).split(/[\\/]/).pop()),
        h("button", {
          className: "td-btn tf-open",
          key: "o",
          title: `open ${file.path} with the system app`,
          onClick: () => { workspaces?.openPath(file.path).catch((error) => log(`open failed: ${error.message}`, "red")); }
        }, "⧉")
      ]));
    });
  }
  // ── 待办 tasks ──
  kids.push(h("span", { className: "td-sec", key: "s-tasks" }, "待办 tasks"));
  const todoList = Array.isArray(todos) ? todos : [];
  if (todoList.length === 0) {
    kids.push(h("div", { className: "td-empty", key: "t-empty" },
      session === void 0 ? "no session selected" : "no todos — the agent's todo list appears here"));
  } else {
    todoList.forEach((todo, index) => {
      const mark = todo.status === "in_progress" ? "▶" : todo.status === "completed" ? "✓" : " ";
      kids.push(h("div", { className: "td-todo", "data-status": todo.status ?? "pending", key: `t${index}` }, [
        h("span", { className: "td-mark", key: "m" }, mark),
        h("span", { className: "td-text", key: "x" }, todo.content)
      ]));
    });
  }
  // ── 待处理 pending (one-click actions) ──
  const pending = Array.isArray(snapshot?.pending) ? snapshot.pending : [];
  const approvals = pending.filter((wait) => wait.kind === "approval");
  const questions = [];
  for (const wait of pending) {
    if (wait.kind !== "question" || !Array.isArray(wait.payload?.questions)) continue;
    for (const question of wait.payload.questions) questions.push({ wait, question });
  }
  if (approvals.length > 0 || questions.length > 0) {
    kids.push(h("span", { className: "td-sec", key: "s-pending" }, `待处理 pending (${approvals.length + questions.length})`));
    approvals.forEach((wait, index) => kids.push(h(PendingApprovalCard, { wait, log, key: `pa${index}` })));
    questions.forEach((entry, index) => kids.push(h(PendingQuestionCard, { wait: entry.wait, question: entry.question, log, key: `pq${index}` })));
  }
  // ── 目标 goal / 计划 plan ──
  if (goal && goal.phase !== "complete") {
    kids.push(h("span", { className: "td-sec", key: "s-goal" }, "目标 goal"));
    kids.push(h(DetailsRow, { k: "phase", v: goal.phase ?? "active", key: "g-ph" }));
    if (goal.objective) kids.push(h("div", { className: "td-row", key: "g-obj" }, truncate(goal.objective, 64)));
  }
  if (plan?.active) {
    kids.push(h("span", { className: "td-sec", key: "s-plan" }, "计划 plan"));
    kids.push(h(DetailsRow, { k: "state", v: plan.pending ? "pending" : "active", tone: "amber", key: "p-st" }));
  }
  return h("div", { className: "term-sidebar" }, kids);
}

/** ZONE 3 — preview pane: the DETAILED view of one produced file. Code is
 * syntax-highlighted, HTML renders in a sandboxed iframe (渲染/源码 toggle),
 * images render directly; ⧉ opens with the system app. Content comes from
 * the captured tool view, or is fetched live through the host /wsfiles
 * route when the capture is empty. */
function PreviewZone({ file, mode, onMode, onClose, workspaces, log }) {
  const [remote, setRemote] = react.useState(null); // {text}|{image}|{web}|{error}
  react.useEffect(() => {
    setRemote(null);
    if (!file) return;
    if (typeof file.content === "string" && file.content !== "") return;
    let cancelled = false;
    wsfiles(file.path)
      .then((result) => {
        if (cancelled) return;
        if (result.kind === "listing") setRemote({ error: "not a file" });
        else if (result.kind === "image") setRemote({ image: true });
        else if (result.kind === "web") setRemote({ web: true });
        else setRemote({ text: result.text ?? "" });
      })
      .catch((error) => {
        if (!cancelled) setRemote({ error: error.message });
      });
    return () => { cancelled = true; };
  }, [file]);
  if (file === void 0) return null;

  const ext = extOf(file.path);
  const isHtml = ext === "html" || ext === "htm";
  const name = String(file.path).split(/[\\/]/).pop();
  const content = typeof file.content === "string" && file.content !== "" ? file.content : remote?.text;
  const webSrc = isHtml ? `/wsfiles?path=${encodeURIComponent(file.path)}` : void 0;

  const body = [];
  if (remote?.error !== void 0) {
    body.push(h("div", { className: "pz-msg", "data-tone": "error", key: "e" }, `✗ ${remote.error}`));
  } else if (isHtml && (content !== void 0 || remote?.web === true)) {
    if (mode === "render") {
      body.push(h("iframe", {
        className: "pz-frame",
        key: "fr",
        sandbox: "allow-scripts",
        title: `preview ${file.path}`,
        srcDoc: content,
        src: content ? void 0 : webSrc
      }));
    } else if (content !== void 0) {
      const lines = content.split("\n");
      body.push(h("pre", { className: "tf-code pz-code", key: "cd" }, [
        h("span", { className: "tf-count", key: "ln" }, `· ${lines.length} lines · ${content.length} chars`),
        highlightCode(content)
      ]));
    } else {
      body.push(h("div", { className: "pz-msg", key: "ns" }, "source unavailable"));
    }
  } else if (remote?.image === true) {
    body.push(h("img", { className: "pz-img", key: "im", src: `/wsfiles?path=${encodeURIComponent(file.path)}`, alt: name }));
  } else if (content !== void 0) {
    const lines = content.split("\n");
    body.push(h("pre", { className: "tf-code pz-code", key: "cd" }, [
      h("span", { className: "tf-count", key: "ln" }, `· ${lines.length} lines · ${content.length} chars`),
      highlightCode(content)
    ]));
  } else {
    body.push(h("div", { className: "pz-msg", key: "ld" }, "loading…"));
  }

  return h("div", { className: "term-previewzone" }, [
    h("div", { className: "pz-head", key: "head" }, [
      h("span", { className: "pz-title", key: "t" }, `${fileGlyph(file.path)} ${name}`),
      isHtml && (content !== void 0 || remote?.web === true)
        ? h("button", { type: "button", className: "td-btn pz-btn", key: "m", onClick: onMode },
          mode === "render" ? "源码" : "渲染")
        : null,
      h("button", {
        type: "button",
        className: "td-btn pz-btn",
        key: "o",
        title: `open ${file.path} with the system app`,
        onClick: () => { workspaces?.openPath(file.path).catch((error) => log(`open failed: ${error.message}`, "red")); }
      }, "⧉"),
      h("button", { type: "button", className: "td-btn pz-btn pz-close", key: "x", title: "close preview", onClick: onClose }, "✕")
    ]),
    h("div", { className: "pz-body", key: "body" }, body)
  ]);
}

/** Bottom bar: prompt prefix + input + hint. The hint reflects the panel
 * state — with a panel open, \exit is the way out; it always stays usable.
 * While the agent runs, a spinner leads the prompt prefix (its own tiny
 * ticker — the surrounding tree must not re-render every frame). */
function PromptBar({ value, onChange, onKeyDown, inputRef, cwd, hasSession, panel, running }) {
  const [frame, setFrame] = react.useState(0);
  react.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setFrame((f) => f + 1), 120);
    return () => clearInterval(id);
  }, [running]);
  return h("div", { className: "term-inputbar" }, [
    h("span", { className: "term-prefix", key: "pfx" }, [
      running ? h("span", { className: "tp-spin", key: "sp" }, `${SPINNER[frame % SPINNER.length]} `) : null,
      h("span", { className: "tp-user", key: "u" }, "user@dsh"),
      ":",
      h("span", { className: "tp-cwd", key: "c" }, cwd ? cwdTail(cwd) : "~"),
      " $"
    ]),
    h("input", {
      className: "term-field",
      key: "in",
      ref: inputRef,
      value,
      onChange,
      onKeyDown,
      spellCheck: false,
      autoComplete: "off",
      autoFocus: true,
      placeholder: hasSession ? "type a message, or \\help" : "\\new starts a session"
    }),
    h("span", { className: "term-hint", key: "hint" },
      panel === "diag" ? "\\exit closes" : "\\help · \\gui")
  ]);
}

/**
 * Root terminal component: owns the input/history/scrollback state and
 * wires services into the command runner. Registered into the 'root' slot
 * at priority -1 (the built-in AppFrame registers at 0; lowest renders).
 */
function TerminalRoot({ ctx, mount, unmount, sessions, workspaces }) {
  const [input, setInput] = react.useState("");
  const [localLog, setLocalLog] = react.useState([]);
  const [clearedKeys, setClearedKeys] = react.useState(() => new Set());
  const [themeId, setThemeId] = react.useState(() => ctx.theme.getTheme().id);
  const [panel, setPanel] = react.useState(null); // null | "diag" — docked panels
  const [details, setDetails] = react.useState(true); // zone 2/3 panels
  // Zone-3 preview selection (file path + html render/source mode).
  const [previewPath, setPreviewPath] = react.useState(null);
  const [previewMode, setPreviewMode] = react.useState("render");
  // Workspace preview card (source / web / images) — resizable + draggable.
  const [previewOpen, setPreviewOpen] = react.useState(false);
  const [previewState, setPreviewState] = react.useState(initialPreviewState);
  const [pvWidth, setPvWidth] = react.useState(() => previewStore().width);
  const [, bumpRender] = react.useReducer((x) => x + 1, 0);
  const inputRef = react.useRef(null);
  const renderStartRef = react.useRef(0);
  const historyRef = react.useRef([]);
  const histIdxRef = react.useRef(-1);
  const logSeqRef = react.useRef(0);
  renderStartRef.current = performance.now();

  const useSessions = react.useMemo(() => bindSnapshotSelector(sessions.list), [sessions]);
  const list = useSessions((s) => s);
  const sessionId = list.current;

  const toggleDiag = react.useCallback(() => setPanel((p) => (p === "diag" ? null : "diag")), []);
  const exitPanel = react.useCallback(() => {
    setPanel(null);
    setPendingBubble(false);
  }, []);
  // Processing center as a BUBBLE anchored at the input line's bottom-left:
  // a floating popover over the content, never a view replacement.
  const [pendingBubble, setPendingBubble] = react.useState(false);
  const togglePending = react.useCallback(() => setPendingBubble((v) => !v), []);
  // Poll pending approvals/questions across ALL sessions (bounded); feeds
  // both the status-bar badge and the \pending processing center. Paused
  // while the tab is hidden.
  const [pendingGroups, setPendingGroups] = react.useState([]);
  react.useEffect(() => {
    const refresh = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setPendingGroups(collectPendings(sessions, list, 12));
    };
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [sessions, list]);
  const toggleDetails = react.useCallback((next) => {
    setDetails(next === void 0 ? (d) => !d : next);
  }, []);

  // Preview card: open a path (file → content tab; dir → browser tab) or
  // toggle the card. All file access goes through the host /wsfiles route.
  const togglePreview = react.useCallback((path) => {
    if (typeof path === "string" && path !== "") {
      setPreviewOpen(true);
      setPreviewState((s) => ({ ...s, loading: true, error: null, crumb: pathSegments(path), tab: "content", file: null }));
      wsfiles(path)
        .then((result) => {
          if (result.kind === "listing") {
            setPreviewState((s) => ({ ...s, loading: false, entries: result.entries, crumb: pathSegments(result.path), tab: "browser" }));
          } else {
            setPreviewState((s) => ({ ...s, loading: false, file: result, tab: "content" }));
          }
        })
        .catch((error) => setPreviewState((s) => ({ ...s, loading: false, error: error.message })));
      return;
    }
    setPreviewOpen((v) => !v);
  }, []);
  const toggleDir = react.useCallback(() => {
    if (previewOpen && previewState.tab === "browser") {
      setPreviewOpen(false);
      return;
    }
    setPreviewOpen(true);
    setPreviewState((s) => ({ ...s, tab: "browser" }));
  }, [previewOpen, previewState.tab]);
  const closePreview = react.useCallback(() => setPreviewOpen(false), []);
  // Dock-width divider drag (persisted).
  const onPvDividerDrag = react.useCallback((event) => {
    const startX = event.clientX;
    const startW = pvWidth;
    startDrag(event, (ev) => {
      const w = Math.min(900, Math.max(260, startW + (startX - ev.clientX)));
      setPvWidth(w);
      savePreviewStore({ width: w });
    });
  }, [pvWidth]);

  const logLine = react.useCallback((text, tone) => {
    logSeqRef.current += 1;
    const key = `log${logSeqRef.current}`; // capture at call time: the state
    // updater runs later, when the ref would have moved on (all entries would
    // otherwise share the final key).
    // Pruned hard: the command dock is a fixed-size area, not a growing log.
    setLocalLog((prev) => [...prev, { type: "system", key, text, tone: tone ?? "fg" }].slice(-200));
  }, []);

  // Upsert one log entry by key: replaces the existing entry (same key) or
  // appends — used to COLLAPSE same-type notices (e.g. stalls) into a
  // single always-current line.
  const upsertLog = react.useCallback((key, text, tone) => {
    setLocalLog((prev) => {
      const next = prev.some((entry) => entry.key === key)
        ? prev.map((entry) => (entry.key === key ? { ...entry, text, tone: tone ?? entry.tone } : entry))
        : [...prev, { type: "system", key, text, tone: tone ?? "fg" }];
      return next.slice(-200);
    });
  }, []);

  // Window errors surface as scrollback lines while the terminal is alive
  // (no full-page takeover — the input bar stays usable); the overlay is
  // reserved for terminal crashes.
  react.useEffect(() => {
    diagSetNotifier(() => {
      const record = diagRecord();
      const last = record.errors[record.errors.length - 1];
      if (last) logLine(`✗ [${last.type}] ${last.message} — \\diag for details`, "red");
    });
    return () => diagSetNotifier(null);
  }, [logLine]);

  // Live-refresh a docked panel (audit ring grows over time).
  react.useEffect(() => {
    if (panel === null) return;
    const timer = setInterval(() => bumpRender(), 1000);
    return () => clearInterval(timer);
  }, [panel, bumpRender]);

  const binding = sessionId === void 0 ? void 0 : sessions.binding(sessionId);
  // The session hook is ALWAYS called (never conditionally): with no binding
  // it reads an absent source that stays undefined, exactly like the
  // framework's maybeObservableHook. A conditional call would shift the hook
  // order when the first session appears and corrupt React's memo state
  // (areHookInputsEqual reads a stale deps slot → TypeError on .length).
  const useSession = react.useMemo(
    () => bindSnapshotSelector(binding === void 0 ? ABSENT_SOURCE : binding.session),
    [binding]
  );
  const snapshot = useSession((s) => s);

  // Session cycling from the top bar (‹ ›) — sessions live in the status
  // bar. Declared here, after the list/sessionId bindings (accessing `list`
  // before its const declaration would hit the TDZ and crash the render).
  const switchSession = react.useCallback((delta) => {
    const ids = list.ids;
    if (ids.length === 0) return;
    const idx = sessionId === void 0 ? 0 : ids.indexOf(sessionId);
    sessions.open(ids[(idx + delta + ids.length) % ids.length]);
  }, [list, sessionId, sessions]);

  // Bounded model build: measured, windowed, mode-aware. The measurement
  // feeds the guard, which downgrades to plain mode when renders get slow.
  const model = react.useMemo(() => {
    const start = performance.now();
    const built = buildModel(snapshot, { nodeWindow: LIMITS.nodeWindow });
    return { ...built, ms: performance.now() - start };
  }, [snapshot]);

  // Zone-3 selection resolves against the produced-files index.
  const previewFile = react.useMemo(() => {
    if (previewPath === null) return void 0;
    return producedFiles(snapshot).find((file) => file.path === previewPath);
  }, [previewPath, snapshot]);

  // Heartbeat + clock: one interval. A tick gap over the stall threshold
  // records a freeze audit entry and COLLAPSES the notice: repeated stalls
  // keep ONE always-current amber line (count + longest) instead of a stack
  // of identical messages.
  const lastTickRef = react.useRef(performance.now());
  const stallStatsRef = react.useRef({ count: 0, longest: 0 });
  react.useEffect(() => {
    const resetBaseline = () => {
      lastTickRef.current = performance.now();
    };
    // Returning to the foreground must not look like a stall: background
    // tabs throttle timers, so the first tick after focus would otherwise
    // report a huge gap that is not a real main-thread block.
    const onVisibility = () => {
      if (document.visibilityState === "visible") resetBaseline();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(() => {
      const now = performance.now();
      // Background tabs are timer-throttled by the browser; a large gap
      // while hidden is expected and must not be counted as a stall.
      if (document.visibilityState === "hidden") {
        lastTickRef.current = now;
        return;
      }
      const gap = now - lastTickRef.current;
      lastTickRef.current = now;
      if (gap > LIMITS.stallMs) {
        recordStall(gap, model.ms);
        const stats = stallStatsRef.current;
        stats.count += 1;
        stats.longest = Math.max(stats.longest, gap);
        const hint = `⚠ stall: 主线程阻塞 ~${Math.round(gap / 1000)}s（第 ${stats.count} 次，最长 ${Math.round(stats.longest / 1000)}s）— \\diag 详情`;
        upsertLog("stall", hint, "amber");
      }
    }, LIMITS.heartbeatMs);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [model, upsertLog]);

  // Render-cost observation: after each commit, feed the guard; a slow
  // render downgrades the rendering mode for the next pass (and the bump
  // forces an immediate re-render in the new mode).
  react.useLayoutEffect(() => {
    const before = currentMode();
    const commitMs = Math.max(0, performance.now() - renderStartRef.current);
    observeRender(commitMs, model.stats.nodes, model.stats.chars);
    if (currentMode() !== before) bumpRender();
  }, [model]);
  react.useEffect(() => {
    const off = ctx.on("theme/change", (snap) => setThemeId(snap.id));
    return off;
  }, [ctx]);
  const mode = themeId === "light"
    ? "light"
    : themeId === "system"
      ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : "dark";

  const clearScrollback = react.useCallback(() => {
    setLocalLog([]);
    setClearedKeys(new Set(snapshot?.chat?.order ?? []));
  }, [snapshot]);

  const env = react.useMemo(
    () => ({
      ctx,
      sessions,
      workspaces,
      session: binding === void 0 ? void 0 : binding.session,
      themeId: () => themeId,
      log: logLine,
      clear: clearScrollback,
      toggleDiag,
      exitPanel,
      togglePending,
      panelOpen: () => panel !== null,
      pendingOpen: () => pendingBubble,
      pendingCount: () => pendingGroups.reduce((n, g) => n + g.waits.length, 0),
      toggleDetails,
      detailsOpen: () => details,
      togglePreview,
      toggleDir,
      closePreview,
      previewOpen: () => previewOpen,
      exitToGui: () => unmount(),
      enterTerminal: () => mount(ctx)
    }),
    [ctx, sessions, workspaces, binding, themeId, logLine, clearScrollback, toggleDiag, exitPanel, togglePending, panel, pendingBubble, pendingGroups, toggleDetails, details, togglePreview, toggleDir, closePreview, previewOpen, mount, unmount]
  );

  const submit = react.useCallback(() => {
    const line = input;
    if (line.trim() === "") return;
    // Real-time alerts: each new command starts a CLEAN alert slate — the
    // previous command's errors and command-scoped warnings vanish (they
    // belonged to that command). The persistent background notice (stall)
    // survives so a system condition is never silently dropped.
    setLocalLog((prev) => prev.filter((entry) =>
      entry.tone !== "red" && (entry.tone !== "amber" || entry.key === "stall")
    ));
    if (line.trim().startsWith("\\")) logLine(`$ ${line}`, "faint");
    historyRef.current = [...historyRef.current, line].slice(-200);
    histIdxRef.current = -1;
    setInput("");
    runLine(env, line);
  }, [input, env, logLine]);

  const onKeyDown = react.useCallback((event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const history = historyRef.current;
      if (history.length === 0) return;
      histIdxRef.current = histIdxRef.current === -1 ? history.length - 1 : Math.max(0, histIdxRef.current - 1);
      setInput(history[histIdxRef.current]);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const history = historyRef.current;
      if (history.length === 0 || histIdxRef.current === -1) return;
      histIdxRef.current += 1;
      setInput(histIdxRef.current >= history.length ? "" : history[histIdxRef.current]);
      if (histIdxRef.current >= history.length) histIdxRef.current = -1;
      return;
    }
    if (event.ctrlKey && event.key === "c") {
      event.preventDefault();
      setInput("");
    }
  }, [submit]);

  const onRootClick = react.useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return h("div", { className: "term-root", "data-term-mode": mode, onClick: onRootClick }, [
    h(StatusBar, {
      sessions: list,
      snapshot,
      sessionId,
      session: binding === void 0 ? void 0 : binding.session,
      onPrevSession: () => switchSession(-1),
      onNextSession: () => switchSession(1),
      onTogglePreview: togglePreview,
      previewOpen,
      key: "sb"
    }),
    h("div", { className: "term-body", key: "body" }, [
      h(Scrollback, {
        model,
        snapshot,
        clearedKeys,
        listPhase: list.phase,
        sessionId,
        panel,
        key: "sc"
      }),
      // Zone 2 — task output (files/todos/pending); zone 3 — detail preview.
      details && panel === null
        ? h(TaskZone, {
          session: binding === void 0 ? void 0 : binding.session,
          sessionId,
          snapshot,
          log: logLine,
          workspaces,
          previewPath,
          onOpenFile: (path) => setPreviewPath(path),
          key: "side"
        })
        : null,
      details && panel === null && previewPath !== null
        ? h(PreviewZone, {
          file: previewFile,
          mode: previewMode,
          onMode: () => setPreviewMode((m) => (m === "render" ? "source" : "render")),
          onClose: () => setPreviewPath(null),
          workspaces,
          log: logLine,
          key: "pz"
        })
        : null,
      previewOpen
        ? [
          h("div", { className: "term-pv-divider", key: "dv", onPointerDown: onPvDividerDrag }),
          h(PreviewCard, {
            state: previewState,
            setState: setPreviewState,
            onClose: closePreview,
            width: pvWidth,
            key: "pv"
          })
        ]
        : null
    ]),
    h(CommandLog, { localLog, key: "cl" }),
    h(PromptBar, {
      value: input,
      onChange: (event) => setInput(event.target.value),
      onKeyDown,
      inputRef,
      cwd: sessionId === void 0 ? void 0 : list.byId?.[sessionId]?.cwd,
      hasSession: sessionId !== void 0,
      panel,
      running: snapshot?.running === true,
      key: "pb"
    }),
    h(PendingBubble, {
      groups: pendingGroups,
      list,
      log: logLine,
      open: pendingBubble,
      onToggle: togglePending,
      onJump: (id) => sessions.open(id),
      key: "bub"
    })
  ]);
}
