/**
 * Command runner: `\command [args]` lines typed at the terminal prompt.
 * Pure logic over the `env` the Terminal component hands in — no React
 * imports, so the table stays testable and the renderer stays dumb.
 */

const COMMANDS = [
  { name: "help", usage: "\\help", summary: "show this help", zh: "显示帮助" },
  { name: "new", usage: "\\new", summary: "start a new session", zh: "新建会话" },
  { name: "sessions", usage: "\\sessions", summary: "list sessions", zh: "列出会话" },
  { name: "open", usage: "\\open <index|id>", summary: "open a session", zh: "打开会话" },
  { name: "status", usage: "\\status", summary: "show session status", zh: "显示状态" },
  { name: "state", usage: "\\state", summary: "show raw conversation snapshot state", zh: "显示快照原始状态" },
  { name: "cancel", usage: "\\cancel", summary: "cancel the running turn", zh: "取消当前回合" },
  { name: "clear", usage: "\\clear", summary: "clear the scrollback", zh: "清屏" },
  { name: "details", usage: "\\details [on|off]", summary: "toggle the right preview sidebar (todos/session)", zh: "切换右侧预览栏" },
  { name: "preview", usage: "\\preview [path|close]", summary: "toggle the preview card / open a file", zh: "切换预览卡片/打开文件" },
  { name: "dir", usage: "\\dir", summary: "toggle the file directory browser", zh: "开关文件目录" },
  { name: "answer", usage: "\\answer <n> <text|option>", summary: "answer pending question n", zh: "回答待处理问题" },
  { name: "approve", usage: "\\approve [n]", summary: "allow pending approval n (default 1)", zh: "批准审批" },
  { name: "decline", usage: "\\decline [n]", summary: "reject pending approval n (default 1)", zh: "拒绝审批" },
  { name: "reject", usage: "\\reject [n]", summary: "cancel pending question n (default 1)", zh: "取消待处理问题" },
  { name: "theme", usage: "\\theme [dark|light|system]", summary: "switch terminal palette", zh: "切换配色" },
  { name: "safe", usage: "\\safe [on|off]", summary: "force plain (safe) rendering", zh: "强制安全渲染模式" },
  { name: "perf", usage: "\\perf", summary: "show render/freeze audit stats", zh: "显示渲染性能审计" },
  { name: "diag", usage: "\\diag", summary: "toggle the diagnostic panel (docked)", zh: "切换诊断面板（停靠式）" },
  { name: "pending", usage: "\\pending", summary: "processing center: pendings across ALL sessions", zh: "处理中心：所有会话的待办" },
  { name: "exit", usage: "\\exit", summary: "close any open panel / dismiss notices", zh: "关闭面板/退出" },
  { name: "gui", usage: "\\gui", summary: "leave terminal for the default interface", zh: "切换到默认界面" },
  { name: "terminal", usage: "\\terminal", summary: "return to this terminal", zh: "回到终端界面" }
];

/** Split a command line into (raw command, args string, arg list). */
function parseLine(line) {
  const rest = line.slice(1).trim();
  const firstSpace = rest.search(/\s/u);
  const name = (firstSpace === -1 ? rest : rest.slice(0, firstSpace)).toLowerCase();
  const args = firstSpace === -1 ? "" : rest.slice(firstSpace + 1).trim();
  return { name, args, argv: args === "" ? [] : args.split(/\s+/u) };
}

/** Flat tree-walk order of sessions (roots → children → subagents), the
 * numbering \sessions prints and \open accepts. Sessions whose parent is
 * listed nest under it; catalog subagents (kind "child") nest too. */
function flatSessionOrder(sessions) {
  const list = sessions.list.getSnapshot();
  const byId = list.byId ?? {};
  const childrenOf = new Map();
  const roots = [];
  for (const id of list.ids ?? []) {
    const parent = byId[id]?.parentId;
    if (parent !== void 0 && byId[parent] !== void 0) {
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent).push(id);
    } else {
      roots.push(id);
    }
  }
  const subagentsOf = (parentId) => (list.subagentsByParent?.[parentId]?.entries ?? [])
    .filter((entry) => entry.kind === "child");
  const order = [];
  const walk = (id) => {
    order.push({ id, kind: "session" });
    const kids = (childrenOf.get(id) ?? [])
      .slice()
      .sort((a, b) => (byId[b]?.updatedAt ?? 0) - (byId[a]?.updatedAt ?? 0));
    for (const kid of kids) walk(kid);
    for (const sub of subagentsOf(id)) {
      order.push({ id: sub.id, kind: "subagent", label: sub.label, activity: sub.activity });
    }
  };
  for (const root of roots) walk(root);
  return order;
}

/** Render the session directory tree as display lines (index, guides,
 * flags). Walk order matches flatSessionOrder exactly, so \open <n> uses
 * the same numbering the tree prints. */
function sessionTreeLines(sessions) {
  const list = sessions.list.getSnapshot();
  const byId = list.byId ?? {};
  const childrenOf = new Map();
  const roots = [];
  for (const id of list.ids ?? []) {
    const parent = byId[id]?.parentId;
    if (parent !== void 0 && byId[parent] !== void 0) {
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent).push(id);
    } else {
      roots.push(id);
    }
  }
  const subagentsOf = (parentId) => (list.subagentsByParent?.[parentId]?.entries ?? [])
    .filter((entry) => entry.kind === "child");
  const lines = [];
  let index = 0;
  const walk = (id, prefix, isLast, isRoot) => {
    index += 1;
    const s = byId[id];
    const kids = (childrenOf.get(id) ?? [])
      .slice()
      .sort((a, b) => (byId[b]?.updatedAt ?? 0) - (byId[a]?.updatedAt ?? 0));
    const subs = subagentsOf(id);
    const connector = isRoot ? "" : isLast ? "└─ " : "├─ ";
    const flags = `${s?.running ? " ●" : ""}${s?.blank ? " (blank)" : ""}`;
    lines.push({
      index,
      kind: "session",
      id,
      current: id === list.current,
      text: `${prefix}${connector}${shortId(id)}  ${s?.displayTitle ?? ""}${flags}`
    });
    // Continuation prefix: a last root has none; a non-last root keeps "│";
    // non-roots continue with "   " (last) or "│  ".
    const childPrefix = prefix + (isLast ? (isRoot ? "" : "   ") : "│  ");
    kids.forEach((kid, kidIndex) => {
      walk(kid, childPrefix, kidIndex === kids.length - 1 && subs.length === 0, false);
    });
    subs.forEach((sub, subIndex) => {
      index += 1;
      lines.push({
        index,
        kind: "subagent",
        id: sub.id,
        current: sub.id === list.current,
        text: `${childPrefix}${subIndex === subs.length - 1 ? "└─ " : "├─ "}⊕ ${sub.label ?? shortId(sub.id)}${sub.activity === "running" ? " ●" : ""}`
      });
    });
  };
  roots.forEach((root, rootIndex) => {
    walk(root, "", rootIndex === roots.length - 1, true);
  });
  return lines;
}

/** Resolve a session target: a 1-based index from \sessions (tree order),
 * or an id prefix. */
function resolveSessionTarget(sessions, target) {
  const order = flatSessionOrder(sessions);
  if (/^\d+$/u.test(target)) {
    const index = Number(target);
    const entry = order[index - 1];
    if (entry === void 0) return { error: `no session at index ${index} (${order.length} listed)` };
    return { id: entry.id };
  }
  const needle = target.toLowerCase();
  const matches = order.filter((entry) => entry.id.toLowerCase().includes(needle));
  if (matches.length === 0) return { error: `no session matching "${target}"` };
  if (matches.length > 1) return { error: `"${target}" matches ${matches.length} sessions; use a longer prefix` };
  return { id: matches[0].id };
}

/** Flatten the current session's pending interactions by kind:
 * approvals (waits) and questions (wait + question pairs), each 1-based. */
function pendingKinds(env) {
  const snapshot = env.session?.getSnapshot();
  const pending = Array.isArray(snapshot?.pending) ? snapshot.pending : [];
  const approvals = pending.filter((wait) => wait.kind === "approval");
  const questions = [];
  for (const wait of pending) {
    if (wait.kind !== "question" || !Array.isArray(wait.payload?.questions)) continue;
    for (const question of wait.payload.questions) questions.push({ wait, question });
  }
  return { approvals, questions };
}

/** Resolve one approval wait by 1-based index (default 1); logs on failure. */
function approvalAt(env, argv) {
  const { approvals } = pendingKinds(env);
  if (approvals.length === 0) {
    env.log("no pending approval", "amber");
    return null;
  }
  const index = Number(argv[0]);
  const n = Number.isInteger(index) && index >= 1 ? index : 1;
  const wait = approvals[n - 1];
  if (wait === void 0) {
    env.log(`approval index ${n} out of range (1..${approvals.length})`, "red");
    return null;
  }
  return wait;
}

/** Resolve one pending question by flat 1-based index; logs on failure. */
function questionAt(env, argv) {
  const { questions } = pendingKinds(env);
  if (questions.length === 0) {
    env.log("no pending question", "amber");
    return null;
  }
  const index = Number(argv[0]);
  const n = Number.isInteger(index) && index >= 1 ? index : 1;
  const entry = questions[n - 1];
  if (entry === void 0) {
    env.log(`question index ${n} out of range (1..${questions.length})`, "red");
    return null;
  }
  return entry;
}

/** Answer a pending question with an option label or free text. */
function answerQuestion(env, argv) {
  const entry = questionAt(env, argv);
  if (entry === null) return;
  const raw = argv.slice(1).join(" ").trim();
  if (raw === "") return env.log("usage: \\answer <n> <text|option>", "amber");
  try {
    respondQuestion(entry.wait, entry.question, raw);
    env.log(`answered question${resolveAnswer(entry.question, raw).selected.length > 0 ? " (option)" : ""}`, "accent");
  } catch (error) {
    env.log(`answer failed: ${error.message}`, "red");
  }
}

/** Shared wire helpers — used by both the \commands and the sidebar buttons. */

/** Deliver a question answer (option label/value match or free text). */
function respondQuestion(wait, question, raw) {
  const resolved = resolveAnswer(question, raw);
  wait.respond({
    ok: true,
    value: {
      sessionId: wait.sessionId,
      answer: [{ questionId: question.id, selected: resolved.selected, custom: resolved.custom }]
    }
  });
}

/** Deliver an approval outcome ("allowed-once" | "rejected"). */
function respondApproval(wait, outcome) {
  const payload = wait.payload ?? {};
  wait.respond({
    ok: true,
    value: {
      sessionId: wait.sessionId,
      approvalId: payload.approvalId,
      outcome
    }
  });
}

/** Cancel a pending question (the host resolves the tool call cancelled). */
function respondQuestionCancel(wait) {
  wait.respond({
    ok: false,
    error: {
      code: "cancelled",
      message: "rejected from the terminal",
      details: {}
    }
  });
}

/** Approve one pending approval (outcome "allowed-once"). */
function approvePending(env, argv) {
  const wait = approvalAt(env, argv);
  if (wait === null) return;
  const payload = wait.payload ?? {};
  try {
    respondApproval(wait, "allowed-once");
    env.log(`approved ${payload.toolName ?? "request"} (${shortId(payload.approvalId ?? "")})`, "accent");
  } catch (error) {
    env.log(`approve failed: ${error.message}`, "red");
  }
}

/** Reject one pending approval (outcome "rejected"). */
function declinePending(env, argv) {
  const wait = approvalAt(env, argv);
  if (wait === null) return;
  const payload = wait.payload ?? {};
  try {
    respondApproval(wait, "rejected");
    env.log(`declined ${payload.toolName ?? "request"} (${shortId(payload.approvalId ?? "")})`, "amber");
  } catch (error) {
    env.log(`decline failed: ${error.message}`, "red");
  }
}

/** Cancel one pending question (the host resolves the tool call cancelled). */
function rejectPending(env, argv) {
  const entry = questionAt(env, argv);
  if (entry === null) return;
  try {
    respondQuestionCancel(entry.wait);
    env.log(`rejected question`, "amber");
  } catch (error) {
    env.log(`reject failed: ${error.message}`, "red");
  }
}

/** Run one line: a \command, or a plain user prompt. */
function runLine(env, line) {
  const trimmed = line.trim();
  if (trimmed === "") return;
  if (trimmed.startsWith("\\")) {
    runCommand(env, trimmed);
    return;
  }
  const session = env.session;
  if (!session) {
    env.log("no current session — start one with \\new", "amber");
    return;
  }
  session.prompt([{ type: "text", text: trimmed }], "queue");
}

function runCommand(env, line) {
  const { name, args, argv } = parseLine(line);
  const { ctx, sessions, workspaces, log } = env;
  switch (name) {
    case "help": {
      log("DeepSeek Harness Terminal — commands:", "accent");
      for (const cmd of COMMANDS) log(`  ${cmd.usage.padEnd(32)} ${cmd.summary}  (${cmd.zh})`);
      log("  anything else is sent to the current session as a prompt.", "dim");
      break;
    }
    case "new": {
      if (workspaces) {
        workspaces.startSession();
        log("starting a new session…", "accent");
      } else {
        log("workspaces service unavailable", "red");
      }
      break;
    }
    case "sessions": {
      const list = sessions.list.getSnapshot();
      if (list.ids.length === 0) {
        log("no sessions yet — \\new starts one", "dim");
        break;
      }
      const lines = sessionTreeLines(sessions);
      const subagents = lines.filter((line) => line.kind === "subagent").length;
      log(`SESSION TREE (${list.ids.length} sessions${subagents > 0 ? `, ${subagents} subagents` : ""}) — \\open <n>`, "accent");
      for (const line of lines) {
        const tone = line.kind === "subagent" ? "dim" : line.current ? "accent" : "fg";
        log(`${line.current ? "▶" : " "} ${String(line.index).padStart(3)}  ${line.text}`, tone);
      }
      break;
    }
    case "open": {
      if (!argv[0]) return log("usage: \\open <index|id>", "amber");
      const resolved = resolveSessionTarget(sessions, argv[0]);
      if (resolved.error) return log(resolved.error, "red");
      sessions.open(resolved.id);
      log(`opened ${shortId(resolved.id)}`, "accent");
      break;
    }
    case "status": {
      const list = sessions.list.getSnapshot();
      const id = list.current;
      const s = id === void 0 ? void 0 : list.byId[id];
      const snapshot = env.session?.getSnapshot();
      log(`phase: ${list.phase}   current: ${id ? shortId(id) : "—"}   sessions: ${list.ids.length}`, "fg");
      if (s) log(`title: ${s.displayTitle ?? s.title ?? id}   running: ${s.running}   blank: ${s.blank}   cwd: ${s.cwd ?? "—"}`, "dim");
      if (snapshot) {
        log(`composer: ${snapshot.composerPhase}   open: ${snapshot.openState}   pending: ${snapshot.pending?.length ?? 0}   queue: ${snapshot.queue?.length ?? 0}`, "dim");
      }
      break;
    }
    case "state": {
      const list = sessions.list.getSnapshot();
      const id = list.current;
      const snapshot = env.session?.getSnapshot();
      log(`current: ${id ?? "—"}   list phase: ${list.phase}   listed: ${list.ids.length}`, "fg");
      if (snapshot === void 0) {
        log("session snapshot: undefined (no scope yet)", "amber");
        break;
      }
      const chat = snapshot.chat;
      const order = Array.isArray(chat?.order) ? chat.order : [];
      const values = typeof chat?.nodes?.values === "function" ? chat.nodes.values() : [];
      log(`openState: ${snapshot.openState}   composer: ${snapshot.composerPhase}   blank: ${snapshot.blank}   running: ${snapshot.running}`, "dim");
      log(`chat.order: ${order.length}   chat.nodes: ${values.length}   hasMore: ${snapshot.hasMore}   loadingOlder: ${snapshot.loadingOlder}`, "dim");
      log(`openError: ${snapshot.openError ?? "none"}   promptError: ${snapshot.promptError?.error?.code ?? "none"}   lastAgentError: ${snapshot.lastAgentError ?? "none"}`, "dim");
      log(`pending: ${snapshot.pending?.length ?? 0}   queue: ${snapshot.queue?.length ?? 0}   views: ${typeof snapshot.views === "object" && snapshot.views !== null ? Object.keys(snapshot.views).join(",") || "{}" : "?"}`, "dim");
      if (order.length > 0) {
        const sample = order.slice(0, 6).map((key) => `${chat.nodes.get(key)?.kind ?? "?"}`).join(", ");
        log(`first kinds: ${sample}`, "cyan");
      }
      break;
    }
    case "cancel": {
      if (!env.session) return log("no current session", "red");
      env.session.cancel().then(() => log("cancelled the running turn", "amber"));
      break;
    }
    case "clear": {
      // Fully clears: the conversation view AND the command dock both empty
      // out — no confirmation line, so the dock actually disappears.
      env.clear();
      break;
    }
    case "details": {
      const arg = (argv[0] ?? "").toLowerCase();
      const next = arg === "on" ? true : arg === "off" ? false : !env.detailsOpen();
      env.toggleDetails(next);
      log(`details sidebar: ${next ? "on" : "off"}`, next ? "accent" : "dim");
      break;
    }
    case "preview": {
      const arg = argv.join(" ").trim();
      if (arg === "close") {
        env.closePreview();
        log("preview closed", "accent");
        break;
      }
      if (arg !== "") {
        env.togglePreview(arg);
        log(`opening ${truncate(arg, 60)} in preview…`, "accent");
        break;
      }
      env.togglePreview();
      log(`preview card ${env.previewOpen() ? "opened" : "closed"} (\\preview <path> opens a file)`, "accent");
      break;
    }
    case "dir": {
      env.toggleDir();
      log(`file directory ${env.previewOpen() ? "shown" : "closed"}`, "accent");
      break;
    }
    case "answer": {
      const waitIndex = Number(argv[0]);
      if (!Number.isInteger(waitIndex) || waitIndex < 1) return log("usage: \\answer <n> <text|option>", "amber");
      const value = argv.slice(1).join(" ");
      if (value === "") return log("usage: \\answer <n> <text|option>", "amber");
      answerQuestion(env, argv);
      break;
    }
    case "approve":
      approvePending(env, argv);
      break;
    case "decline":
      declinePending(env, argv);
      break;
    case "reject":
      rejectPending(env, argv);
      break;
    case "theme": {
      const themes = ["dark", "light", "system"];
      const wanted = (argv[0] ?? "").toLowerCase();
      const next = themes.includes(wanted) ? wanted : themes[(themes.indexOf(env.themeId()) + 1) % themes.length];
      ctx.theme.setTheme(next);
      log(`palette: ${next}`, "accent");
      break;
    }
    case "diag": {
      env.toggleDiag();
      log("diagnostic panel " + (env.panelOpen() ? "opened" : "closed") + " — \\exit closes it too", "amber");
      break;
    }
    case "pending": {
      env.togglePending();
      const count = env.pendingCount();
      log(`pending bubble ${env.pendingOpen() ? "opened" : "closed"} — ${count} pending item(s) across all sessions (\\exit closes)`, count > 0 ? "amber" : "accent");
      break;
    }
    case "exit":
      env.exitPanel();
      log("panel closed", "accent");
      break;
    case "safe": {
      const arg = (argv[0] ?? "").toLowerCase();
      const next = arg === "on" ? "plain" : arg === "off" ? "full" : currentMode() === "plain" ? "full" : "plain";
      setMode(next);
      log(`rendering mode: ${next} (${next === "plain" ? "safe — raw truncated lines" : "full — markdown + structure"})`, next === "plain" ? "amber" : "accent");
      break;
    }
    case "perf": {
      const summary = perfSummary();
      log(`rendering mode: ${summary.mode}   node window: ${summary.window}   audit events: ${perf.events.length}`, "fg");
      for (const line of summary.last) log(`  ${line}`, "dim");
      log("a 'stall' event means the main thread froze (gap > 1.5s); 'downgrade' means slow renders auto-switched to safe mode", "faint");
      break;
    }
    case "gui":
      env.exitToGui();
      log("switched to the default interface — refresh the page to return to the terminal", "amber");
      break;
    case "terminal":
      env.enterTerminal();
      log("terminal restored", "accent");
      break;
    default:
      log(`unknown command \\${name} — type \\help`, "red");
  }
}
