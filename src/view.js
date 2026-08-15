/**
 * View model: conversation snapshot → structured terminal document.
 *
 * The model is a list of SECTIONS, each a conversation turn (grouped by the
 * view node's turn coordinate) holding typed line groups. Rendering
 * hierarchy, four levels:
 *
 *   L1 user input   — accent-bordered block, highest emphasis
 *   L2 assistant    — primary output text, code boxes, streaming cursor
 *   L3 tool         — indented tree (call line, status, nested output)
 *   L4 system       — dim notices (compaction, retry, errors, context…)
 *
 * plus a turn header (role + time) opening every user/assistant turn, and a
 * tail section for pending interactions and send/open errors.
 *
 * Node shape (the chat VIEW nodes): payload in `.data`, kind is the view
 * kind, `chat.order` holds keys in anchor order, `location` carries the
 * turn coordinate. Kinds: user / steering / context / assistant-step /
 * tool-call / command / compaction / manual-compaction / model-retry /
 * turn-error / turn-max-tokens / turn-tail / unknown (ui-conversation)
 * plus workflow-run (ui-workflow-run) and command-input (ui-goal).
 */

/** Turn coordinate of a view node (numeric turn id), or undefined. */
function turnOf(node) {
  const loc = node?.location;
  if (loc?.kind === "step" || loc?.kind === "turn") return loc.turn?.turn;
  return void 0;
}

/** Turn header for the first content group of a turn (null = no header). */
function headOf(group) {
  if (group.type === "user" || group.type === "steering") return { role: "user", time: group.time };
  if (group.type === "assistant") return { role: "assistant", time: group.time };
  return null;
}

/** Map one chat view node to a typed terminal group, or null when unrenderable. */
function groupOf(node) {
  const data = node?.data;
  switch (node?.kind) {
    case "user":
      return { type: "user", time: data?.time, text: textOfParts(data?.content) };
    case "steering":
      return { type: "steering", time: data?.time, text: textOfParts(data?.content) };
    case "context":
      return { type: "system", tone: "dim", time: data?.time, text: `context injected (${data?.form ?? data?.source?.kind ?? "?"})` };
    case "assistant-step": {
      const running = data?.status === "running";
      const final = data?.finalNode;
      const blocks = running
        ? (Array.isArray(data?.blocks) ? data.blocks : [])
        : (Array.isArray(final?.blocks) ? final.blocks : []);
      return {
        type: "assistant",
        time: data?.time ?? final?.time,
        blocks,
        running,
        interrupted: final?.interrupted === true
      };
    }
    case "tool-call": {
      const root = data?.root;
      if (root === void 0 || typeof root?.kind !== "string") {
        // Running tool: the root call block (no final result yet).
        return {
          type: "tool",
          status: "running",
          name: root?.name ?? "tool",
          args: jsonArgs(root?.argsRaw),
          nested: Array.isArray(root?.subCalls) && root.subCalls.length > 0 ? root.subCalls.length : 0,
          time: root?.time,
          output: void 0
        };
      }
      const output = truncate(textOfToolResult(root).replace(/\s+$/u, ""), 4000);
      return {
        type: "tool",
        status: root.isError ? "error" : "done",
        name: toolResultName(root),
        args: jsonArgs(root?.call?.argsRaw),
        nested: Array.isArray(root?.subCalls) && root.subCalls.length > 0 ? root.subCalls.length : 0,
        time: root.time,
        callTime: root.callTime ?? null,
        output: output === "" ? void 0 : output
      };
    }
    case "command": {
      const name = data?.name ?? "?";
      const args = data?.args;
      const argsText = typeof args === "string" ? args : args ? JSON.stringify(args) : "";
      const outcome = data?.outcome ? ` → ${data.outcome.kind}${data.outcome.text ? `: ${truncate(data.outcome.text, 80)}` : ""}` : "";
      // No prefix span: "/name" must read as one token.
      return { type: "system", tone: "purple", time: data?.time, text: `/${name}${argsText ? ` ${argsText}` : ""}${outcome}` };
    }
    case "compaction": {
      const shadow = data?.shadowedItemCount === null || data?.shadowedItemCount === void 0
        ? ""
        : `  (shadowed ${data.shadowedItemCount}${data.shadowedTokenCount == null ? "" : `, ${formatCount(data.shadowedTokenCount)} tokens`})`;
      return { type: "system", tone: "dim", time: data?.time, text: `context compaction${shadow}` };
    }
    case "manual-compaction": {
      const commandName = data?.command?.data?.name ?? "compact";
      return { type: "system", tone: "dim", time: data?.compaction?.data?.time, text: `context compaction (via /${commandName})` };
    }
    case "model-retry": {
      const current = data?.current ?? data?.attempts?.at(-1);
      if (!current) return null;
      return { type: "system", tone: "amber", time: current.time, text: `retry ${current.retry} (${current.retryState ?? "scheduled"})` };
    }
    case "turn-error": {
      const message = data?.error?.message ?? data?.message ?? "";
      return { type: "system", tone: "red", time: data?.time, text: `turn error${message ? `: ${message}` : ""}` };
    }
    case "turn-max-tokens":
      return { type: "system", tone: "amber", time: data?.time, text: "turn stopped: max tokens reached" };
    case "turn-tail":
      // Completed-turn marker: the section pass fills in the duration from
      // the turn's first content time to the turn/end time.
      return { type: "turn-end", time: data?.time, turn: data?.turn };
    case "unknown":
      return { type: "system", tone: "faint", time: data?.time, text: "unrecognized event" };
    case "workflow-run": {
      const status = data?.status ?? "";
      const agents = Array.isArray(data?.agents) && data.agents.length > 0 ? `  (${data.agents.length} agents)` : "";
      return { type: "system", tone: "cyan", time: data?.time ?? data?.startedAt, text: `workflow ${data?.runId ?? "?"}${status ? ` [${status}]` : ""}${agents}` };
    }
    case "command-input":
      return { type: "system", tone: "dim", time: data?.time, text: data?.text ?? "" };
    default:
      return { type: "system", tone: "faint", text: `[${node?.kind ?? "?"}]` };
  }
}

/** Compact count: 517 / 12.2K / 1.2M (one decimal under three digits). */
function formatCount(n) {
  const scaled = (v) => v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  if (n < 1e3) return String(n);
  if (n < 1e6) return `${scaled(n / 1e3)}K`;
  return `${scaled(n / 1e6)}M`;
}

/** Look up a pending approval's paired tool call (by callId) in the loaded
 * chat window, for the command-line preview. Best effort. */
function findPendingCall(snapshot, callId) {
  if (typeof callId !== "string" || callId === "") return void 0;
  const chat = snapshot?.chat;
  const values = typeof chat?.nodes?.values === "function" ? chat.nodes.values() : [];
  for (const node of values) {
    if (node?.kind !== "tool-call") continue;
    const root = node.data?.root;
    if (!root) continue;
    if (root.callId === callId) return root;
    for (const child of root.subCalls ?? []) if (child?.callId === callId) return child;
  }
  return void 0;
}

/** Pending-interaction (approval/question) lines appended at the tail.
 * Numbering is per kind (1-based), matching \approve / \decline / \answer /
 * \reject — every banner carries its action hint so the terminal can
 * resolve interactions without leaving the input bar. */
function pendingLines(snapshot) {
  const pending = Array.isArray(snapshot.pending) ? snapshot.pending : [];
  const lines = [];
  let approvalIndex = 0;
  let questionIndex = 0;
  for (const wait of pending) {
    if (wait.kind === "approval") {
      approvalIndex += 1;
      const payload = wait.payload ?? {};
      const headline = payload.reason ?? `approval requested${payload.toolName ? `: ${payload.toolName}` : ""}`;
      const call = findPendingCall(snapshot, payload.callId);
      const command = call ? `\n  ┆ ${call.name ?? "tool"} ${jsonArgs(call.argsRaw)}` : "";
      lines.push({
        type: "pending",
        time: Date.now(),
        text: `approval ${approvalIndex}: ${headline}${command}`,
        hint: `\\approve ${approvalIndex} to allow · \\decline ${approvalIndex} to reject`
      });
      continue;
    }
    if (wait.kind === "question" && Array.isArray(wait.payload?.questions)) {
      for (const question of wait.payload.questions) {
        questionIndex += 1;
        const options = Array.isArray(question.options) && question.options.length > 0
          ? `  [${question.options.map((o) => o?.label ?? o?.value ?? "?").join(" | ")}]`
          : "";
        lines.push({
          type: "pending",
          time: Date.now(),
          text: `question ${questionIndex}: ${question.prompt ?? question.title ?? "…"}${options}`,
          hint: `\\answer ${questionIndex} <option|text> · \\reject ${questionIndex} to cancel`
        });
      }
      continue;
    }
    lines.push({
      type: "pending",
      time: Date.now(),
      text: `${wait.kind} requested (${shortId(wait.key ?? "")})`,
      hint: "use \\gui for the interactive dialog"
    });
  }
  return lines;
}

/** Queue + failure tail lines (send/open errors and the agent's last error). */
function tailLines(snapshot) {
  const lines = [];
  const queue = Array.isArray(snapshot.queue) ? snapshot.queue : [];
  for (const item of queue) {
    const preview = textOfParts(item.content);
    lines.push({ type: "system", tone: "dim", time: Date.now(), text: `queued: ${truncate(preview, 160)}` });
  }
  if (snapshot.promptError) {
    lines.push({
      type: "system",
      tone: "red",
      time: Date.now(),
      text: `send failed: ${snapshot.promptError.error?.code ?? "error"}: ${snapshot.promptError.error?.message ?? ""}`
    });
  }
  if (snapshot.openError) {
    lines.push({ type: "system", tone: "red", time: Date.now(), text: `history open failed: ${String(snapshot.openError)}` });
  }
  if (snapshot.lastAgentError) {
    lines.push({ type: "system", tone: "red", time: Date.now(), text: `agent error: ${String(snapshot.lastAgentError)}` });
  }
  return lines;
}

/**
 * Build the structured terminal document from a conversation snapshot.
 * Bounded by design: only the TAIL window of chat nodes is walked (the
 * walk starts at the newest node and stops once the window is full), so
 * the cost is capped no matter how large the session log is. Hidden older
 * nodes are reported as a dim note group. Pending/tail lines always render.
 * @returns { sections, stats:{nodes, chars, hidden} }.
 */
function buildModel(snapshot, limits) {
  const window = limits?.nodeWindow ?? 500;
  const sections = [];
  let hidden = 0;
  let chars = 0;
  let nodes = 0;
  if (snapshot) {
    const chat = snapshot.chat;
    const order = Array.isArray(chat?.order) ? chat.order : [];
    const nodesMap = chat?.nodes;
    const groups = [];
    // Walk the tail: newest → oldest until the window is full.
    for (let i = order.length - 1; i >= 0 && groups.length < window; i -= 1) {
      const node = typeof nodesMap?.get === "function" ? nodesMap.get(order[i]) : void 0;
      if (!node || node.visibility === "hidden") continue;
      const group = groupOf(node);
      if (!group) continue;
      group.key = order[i];
      group.turn = turnOf(node);
      groups.push(group);
      chars += String(group.text ?? group.output ?? "").length;
      nodes += 1;
    }
    hidden = order.length > nodes ? order.length - nodes : 0;
    // Oldest-first for display (we walked newest-first).
    groups.reverse();
    let current = null;
    for (const group of groups) {
      const turn = group.turn ?? void 0;
      if (current === null || current.turn !== turn) {
        current = { turn, head: headOf(group), startTime: void 0, items: [] };
        sections.push(current);
      } else if (current.head === null) {
        // A system node opened the turn; a later user/assistant group still
        // earns the turn a header.
        current.head = headOf(group);
      }
      // Track the turn's first content time for the completion marker.
      if (current.startTime === void 0 && typeof group.time === "number") current.startTime = group.time;
      current.items.push(group);
    }
    // Turn-completion markers: duration = turn end − first content time.
    for (const section of sections) {
      const last = section.items[section.items.length - 1];
      if (last?.type === "turn-end" && typeof last.time === "number") {
        const start = typeof section.startTime === "number" ? section.startTime : last.time;
        last.duration = Math.max(0, last.time - start);
      }
    }
    if (hidden > 0) {
      sections.unshift({
        turn: void 0,
        head: null,
        items: [{ type: "system", tone: "faint", text: `… ${hidden} older lines hidden (performance window, \\perf to inspect)` }]
      });
    }
    const pending = pendingLines(snapshot);
    const tail = tailLines(snapshot);
    if (pending.length > 0 || tail.length > 0) {
      sections.push({ turn: void 0, head: null, items: [...pending, ...tail] });
    }
  }
  return { sections, stats: { nodes, chars, hidden } };
}

/**
 * Produced files: walk the loaded tool-call nodes and collect the paths the
 * mutation tools wrote or edited, with their content when the call view
 * carried it (diff cards embed `newText`; fallback is the result text).
 * Same recognition rule as ui-deliverables: a diff card, or a generic card
 * whose kind is `edit`. Paths keep first-seen order, deduped; the FIRST
 * non-empty content wins (a full-file write beats later edit snippets).
 * @returns [{ path, content }] — bounded by the window, cheap to call.
 */
function producedFiles(snapshot) {
  const byPath = new Map();
  const order = [];
  const add = (path, content) => {
    if (typeof path !== "string" || path === "") return;
    const existing = byPath.get(path);
    if (existing === void 0) {
      byPath.set(path, { path, content });
      order.push(path);
    } else if ((existing.content === void 0 || existing.content === "") && typeof content === "string" && content !== "") {
      existing.content = content;
    }
  };
  const collectFromView = (view, resultText) => {
    if (view === null || typeof view !== "object") return;
    let paths = [];
    if (view.card === "diff") {
      paths = (view.locations ?? []).map((location) => location.path);
      const diffs = Array.isArray(view.diffs) ? view.diffs : [];
      for (const diff of diffs) {
        if (typeof diff?.path === "string" && typeof diff.newText === "string") {
          add(diff.path, diff.newText);
        }
      }
    } else if (view.card === "generic" && view.kind === "edit") {
      paths = (view.locations ?? []).map((location) => location.path);
    }
    for (const path of paths) add(path, resultText);
  };
  const chat = snapshot?.chat;
  const values = typeof chat?.nodes?.values === "function" ? chat.nodes.values() : [];
  for (const node of values) {
    if (node?.kind !== "tool-call") continue;
    const root = node.data?.root;
    if (!root) continue;
    collectFromView(root.callView ?? null, textOfToolResult(root));
    const walkSub = (call) => {
      if (!call) return;
      collectFromView(call.callView ?? null, textOfToolResult(call));
      for (const child of call.subCalls ?? []) walkSub(child);
    };
    for (const child of root.subCalls ?? []) walkSub(child);
  }
  return order.map((path) => byPath.get(path));
}
