// Full client-side smoke test: jsdom + react-dom/client render of the
// terminal bundle, then simulated typing/Enter interactions.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

// The bundle under test is THIS repo's build; the seed modules (react, the
// DSH client packages) resolve from an installed DSH web profile.
const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_NM = process.env.DSH_PROFILE_NM ?? "C:/Users/Li Bojian/.dsh/profiles/node_modules";
const BUNDLE = join(HERE, "..", "lib", "client.js");
const req = createRequire(resolve(PROFILE_NM, "x.js"));

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://127.0.0.1:3080/",
  pretendToBeVisual: true
});
const { window } = dom;
// jsdom versions differ on PointerEvent; the drag handlers only read
// clientX/clientY, so MouseEvent is a sufficient stand-in.
if (typeof window.PointerEvent !== "function") {
  window.PointerEvent = window.MouseEvent;
}
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

// --- load the bundle ---
let registered = null;
window.__ModuleLoader__ = { load: (h) => { registered = h; } };
new Function("require", "window", "document", "navigator", readFileSync(BUNDLE, "utf8"))(
  (spec) => req(spec), window, window.document, window.navigator
);
if (!registered) throw new Error("no factory registered");
const plugin = registered.factory((spec) => req(spec));
console.log("exports:", Object.keys(plugin).join(", "));

// --- fake snapshot + session ---
// Nodes use the REAL view-node shape: payload in `.data`, view kinds,
// `location` carries the turn coordinate for turn grouping.
const now = Date.now();
const turn1 = { kind: "turn", turn: { turn: 1 } };
const step1 = { kind: "step", turn: { turn: 1 }, step: { step: 1 } };
const turn2 = { kind: "turn", turn: { turn: 2 } };
const nodes = {
  n1: { kind: "user", key: "n1", anchorSeq: 1, location: turn1, data: { kind: "user", seq: 1, time: now - 5000, content: [{ type: "text", text: "hello terminal" }], source: { kind: "user" } } },
  n2: { kind: "assistant-step", key: "n2", anchorSeq: 2, location: step1, data: { status: "settled", turn: 1, step: 1, time: now - 4000, finalNode: { kind: "assistant", seq: 2, time: now - 4000, turn: 1, step: 1, blocks: [
    { kind: "reasoning", text: "let me think through this step by step" },
    { kind: "text", text: "# Title\n**bold** and *italic* with `inline code` and [link](https://example.com).\n\n- item one\n- item two\n\n```\ncode block\n```\n\n| name | status |\n| --- | --- |\n| bash | done |\n\n> quoted wisdom" }
  ] } } },
  n3: { kind: "tool-call", key: "n3", anchorSeq: 3, location: step1, data: { root: { callId: "c1", name: "bash", argsRaw: '{"command":"ls"}', time: now - 3000, subCalls: [] } } },
  n4: { kind: "tool-call", key: "n4", anchorSeq: 4, location: step1, data: { root: { kind: "tool-result", callId: "c1", call: { name: "bash" }, time: now - 2000, callTime: now - 3000, content: [{ type: "text", text: "total 4" }, { type: "text", text: "drwxr-xr-x 1 user user" }], isError: false, callView: { card: "diff", title: "Write C:\\proj\\index.html", diffs: [{ path: "C:\\proj\\index.html", oldText: null, newText: "<!doctype html><html><body><h1>Hi from preview</h1></body></html>" }], locations: [{ path: "C:\\proj\\index.html" }] } } } },
  n10: { kind: "tool-call", key: "n10", anchorSeq: 10, location: step1, data: { root: { kind: "tool-result", callId: "c9", call: { name: "write" }, time: now - 1900, callTime: now - 2900, content: [{ type: "text", text: "wrote app.js" }], isError: false, callView: { card: "diff", title: "Write C:\\proj\\app.js", diffs: [{ path: "C:\\proj\\app.js", oldText: null, newText: "const greet = (name) => {\n  // hello\n  return `hi ${name}`;\n};\n" }], locations: [{ path: "C:\\proj\\app.js" }] } } } },
  n5: { kind: "command", key: "n5", anchorSeq: 5, location: step1, data: { kind: "command", seq: 5, time: now - 1500, commandId: "cmd1", name: "compact", args: null, outcome: { kind: "success" } } },
  n6: { kind: "turn-tail", key: "n6", anchorSeq: 6, location: step1, data: { closing: {}, time: now - 1200 } },
  n7: { kind: "unknown", key: "n7", anchorSeq: 7, location: turn2, data: { kind: "unknown", seq: 7, time: now - 1000 } },
  n8: { kind: "user", key: "n8", anchorSeq: 8, location: turn2, data: { kind: "user", seq: 8, time: now - 900, content: [{ type: "text", text: "second turn" }], source: { kind: "user" } } },
  n9: { kind: "steering", key: "n9", anchorSeq: 9, location: turn2, data: { kind: "steering", seq: 9, time: now - 800, content: [{ type: "text", text: "steer now" }], source: { kind: "user" } } }
};
const snapshot = {
  sessionId: "session-test1234",
  chat: { order: ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8", "n9", "n10"], nodes: { get: (k) => nodes[k], values: () => Object.values(nodes) } },
  nodes: Object.values(nodes), pending: [], queue: [], running: false,
  composerPhase: "active", openState: "open", blank: false,
  promptError: null, lastAgentError: null, openError: null, hasMore: false
};
const promptCalls = [];
const openCalls = [];
const projFaces = new Map();
const projRecords = new Map();
const projStore = (key) => {
  if (!projFaces.has(key)) {
    const record = { value: void 0, listeners: new Set() };
    projRecords.set(key, record);
    projFaces.set(key, {
      subscribe: (fn) => { record.listeners.add(fn); return () => record.listeners.delete(fn); },
      getSnapshot: () => record.value
    });
  }
  return projFaces.get(key);
};
const setProj = (key, value) => {
  projStore(key);
  projRecords.get(key).value = value;
  for (const fn of [...projRecords.get(key).listeners]) fn();
};
let currentSnapshot = snapshot;
const sessionListeners = new Set();
const approvalResponses = [];
const questionResponses = [];
const fakeSession = {
  subscribe: (fn) => { sessionListeners.add(fn); return () => sessionListeners.delete(fn); },
  getSnapshot: () => currentSnapshot,
  prompt: async (content, mode) => { promptCalls.push({ content, mode }); return { ok: true, value: { accepted: true } }; },
  cancel: async () => ({ ok: true }),
  projections: { faceOf: (key) => projStore(key) },
  _setRunning(running) {
    currentSnapshot = { ...currentSnapshot, running };
    for (const fn of [...sessionListeners]) fn();
  },
  _setPending(pending) {
    currentSnapshot = { ...currentSnapshot, pending };
    for (const fn of [...sessionListeners]) fn();
  }
};
// A blank session (what the browser lands on after a restart): snapshot
// exists but the chat is empty — the scrollback must say so instead of
// rendering nothing.
const blankSnapshot = {
  sessionId: "session-blank1234",
  chat: { order: [], nodes: { get: () => void 0 } },
  nodes: [], pending: [], queue: [], running: false,
  composerPhase: "blank", openState: "open", blank: true,
  promptError: null, lastAgentError: null, openError: null, hasMore: false
};
const blankSession = {
  subscribe: () => () => {},
  getSnapshot: () => blankSnapshot,
  prompt: async () => ({ ok: true, value: { accepted: true } }),
  cancel: async () => ({ ok: true })
};
// Mutable list store: the test starts with NO current session (binding
// undefined) and later switches to having one — the exact hook-order
// transition that crashed the real browser boot. Each mutation replaces the
// snapshot object (uSES compares by reference; the real store does the same).
const sessions = (() => {
  const listeners = new Set();
  const customSessions = new Map();
  let listState = {
    ids: [],
    byId: {},
    current: undefined, phase: "pending"
  };
  return {
    list: {
      getSnapshot: () => listState,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }
    },
    binding: (id) => {
      if (id === "session-test1234") return { session: fakeSession };
      if (id === "session-blank1234") return { session: blankSession };
      if (id === "session-big1234") return { session: bigSession };
      if (id === "session-child9999") return { session: fakeSession };
      return undefined;
    },
    open(id) { openCalls.push(id); }, clear() {},
    _setTreeSession() {
      listState = {
        ids: ["session-test1234", "session-child9999"],
        byId: {
          "session-test1234": { id: "session-test1234", displayTitle: "root task", running: false, blank: false, cwd: "C:\\proj", updatedAt: 3 },
          "session-child9999": { id: "session-child9999", displayTitle: "child fork", running: true, blank: false, parentId: "session-test1234", updatedAt: 2 }
        },
        subagentsByParent: {
          "session-test1234": { entries: [{ id: "sub-11111111", kind: "child", label: "research agent", activity: "running" }] }
        },
        current: "session-test1234", phase: "ready"
      };
      for (const fn of [...listeners]) fn();
    },
    _setCustomSession(id, title, session) {
      customSessions.set(id, { id, title, session });
    },
    _setSessionById(id) {
      const entry = customSessions.get(id);
      listState = {
        ids: [id],
        byId: { [id]: { id, displayTitle: entry.title, running: false, blank: false, cwd: "C:\\proj" } },
        current: id, phase: "ready"
      };
      for (const fn of [...listeners]) fn();
    },
    _setSession() {
      listState = {
        ids: ["session-test1234"],
        byId: { "session-test1234": { id: "session-test1234", displayTitle: "test session", running: false, blank: false, cwd: "C:\\proj" } },
        current: "session-test1234", phase: "ready"
      };
      for (const fn of [...listeners]) fn();
    },
    _setTwoSessions() {
      listState = {
        ids: ["session-test1234", "session-big1234"],
        byId: {
          "session-test1234": { id: "session-test1234", displayTitle: "test session", running: false, blank: false, cwd: "C:\\proj" },
          "session-big1234": { id: "session-big1234", displayTitle: "big session", running: false, blank: false, cwd: "C:\\proj" }
        },
        current: "session-test1234", phase: "ready"
      };
      for (const fn of [...listeners]) fn();
    },
    _setBlankSession() {
      listState = {
        ids: ["session-blank1234"],
        byId: { "session-blank1234": { id: "session-blank1234", displayTitle: "", running: false, blank: true, cwd: "C:\\proj" } },
        current: "session-blank1234", phase: "ready"
      };
      for (const fn of [...listeners]) fn();
    }
  };
})();

let captured = null;
const openPathCalls = [];
const ctx = {
  sessions,
  workspaces: { startSession() {}, openPath: async (path) => { openPathCalls.push(path); } },
  theme: { getTheme: () => ({ id: "dark" }), setTheme() {} },
  slots: { register: (opts, comp) => { captured = { opts, comp }; return () => {}; } },
  on: () => () => {},
  effect: (fn) => { const r = fn(); return typeof r === "function" ? r : () => {}; }
};
plugin.apply(ctx);
console.log("root opts:", JSON.stringify(captured.opts));

// --- render ---
const React = req("react");
const { createRoot } = req("react-dom/client");
const { act } = req("react-dom/test-utils");
const container = document.createElement("div");
document.body.appendChild(container);
let root;
await act(async () => { root = createRoot(container); root.render(React.createElement(captured.comp, {})); await new Promise((r) => setTimeout(r, 30)); });

const q = (sel) => container.querySelector(sel);
const text = () => container.textContent;
console.log("term-root:", q(".term-root") !== null, "mode:", q(".term-root")?.getAttribute("data-term-mode"));
// Phase 1: no current session yet — the terminal shows the hint and keeps
// its hook order stable against the absent session source.
console.log("no-session hint:", text().includes("no current session"));
console.log("placeholder:", q(".term-field")?.getAttribute("placeholder"));

// Phase 2: the first session appears — the exact transition that crashed
// the browser boot (conditional hook call shifted the hook order).
await act(async () => {
  sessions._setSession();
  await new Promise((r) => setTimeout(r, 30));
});
console.log("after session appears — term-root:", q(".term-root") !== null);
for (const probe of ["hello terminal", "Title", "bold", "italic", "inline code", "link", "item one", "code block", "quoted wisdom", "bash", "total 4", "drwxr-xr-x", "test1234", "idle", "/compact", "second turn", "steer now"]) {
  console.log(`contains ${JSON.stringify(probe)}:`, text().includes(probe));
}
// Markdown syntax must NOT leak as literal source.
console.log("no raw ** :", !text().includes("**"));
console.log("no raw ## :", !text().includes("##"));
console.log("no raw backtick:", !text().includes("`"));
console.log("no raw []() :", !text().includes("](https://"));
console.log("no raw | table sep:", !text().includes("| --- |"));
// Markdown structures render with their classes.
console.log("heading h1:", q(".term-h1") !== null, "| h1 text:", q(".term-h1")?.textContent.trim());
console.log("strong:", q(".term-assistant strong") !== null, "| em:", q(".term-assistant em") !== null, "| inline code:", q(".ti-code") !== null);
console.log("link w/ url:", q(".ti-url")?.textContent.trim());
console.log("list items:", container.querySelectorAll(".term-li").length);
console.log("table rows:", container.querySelectorAll(".term-table .trow").length, "| head bold:", q('.term-table .trow[data-head="true"]') !== null);
console.log("quote:", q(".term-quote") !== null, "| hr:", q(".term-hr") !== null);
// Structure: turn heads group the conversation, blocks carry their classes.
const heads = container.querySelectorAll(".term-head");
console.log("turn heads:", heads.length, "| roles:", Array.from(heads).map((el) => el.querySelector(".th-role")?.textContent).join(","));
console.log("user block:", q(".term-user") !== null, "| user prompt:", q(".term-user .tu-prompt")?.textContent);
console.log("assistant block:", q(".term-assistant") !== null);
const tools = container.querySelectorAll(".term-tool");
console.log("tool blocks:", tools.length, "| statuses:", Array.from(tools).map((el) => el.getAttribute("data-status")).join(","));
console.log("tool glyph+name:", q(".term-tool .tt-name")?.textContent, "| tool output:", q(".term-tool .tt-out") !== null);
console.log("steering user block:", q('.term-user[data-steer="true"]') !== null);
// Kind names must never leak into the rendered text, and divider nodes
// (turn-tail) must render nothing.
console.log("no kind leak (assistant-step):", !text().includes("assistant-step"));
console.log("no kind leak (turn-tail):", !text().includes("turn-tail"));
console.log("unknown marker:", text().includes("unrecognized event"));
console.log("has term-code:", q(".term-code") !== null);
console.log("prompt prefix:", q(".term-prefix")?.textContent.trim());
console.log("status dot idle:", q(".ts-dot") !== null);

// Reasoning is COLLAPSED by default behind the "thinking……" toggle; the
// main message stays fully visible.
console.log("reasoning toggle present:", q(".tr-toggle") !== null);
console.log("reasoning collapsed (body hidden):", !text().includes("let me think through"));
console.log("reasoning toggle label:", q(".tr-toggle")?.textContent.trim());
await act(async () => {
  q(".tr-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
});
console.log("reasoning expanded after click:", text().includes("let me think through"));
console.log("main message still visible when reasoning open:", text().includes("Title"));
await act(async () => {
  q(".tr-toggle").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
});
console.log("reasoning collapsed again:", !text().includes("let me think through"));

// Phase 3: switch to a BLANK session — the scrollback must show the empty
// state instead of rendering nothing (the real-browser symptom).
await act(async () => {
  sessions._setBlankSession();
  await new Promise((r) => setTimeout(r, 30));
});
console.log("blank-session empty state:", text().includes("blank session"));
console.log("blank-state hints sessions:", text().includes("\\sessions"));

// Phase 4: back to the content session (hook stays stable across switches).
await act(async () => {
  sessions._setSession();
  await new Promise((r) => setTimeout(r, 30));
});
console.log("back to content session:", text().includes("hello terminal"));

// Phase 5: guard — windowed model bounds huge logs.
const bigNodes = {};
for (let k = 0; k < 1200; k += 1) {
  bigNodes[`big${k}`] = { kind: "user", key: `big${k}`, anchorSeq: k, location: { kind: "turn", turn: { turn: Math.floor(k / 2) } }, data: { kind: "user", seq: k, time: now - 100000 + k, content: [{ type: "text", text: `message ${k}` }], source: { kind: "user" } } };
}
const bigOrder = Object.keys(bigNodes);
const bigSnapshot = {
  sessionId: "session-big1234",
  chat: { order: bigOrder, nodes: { get: (k) => bigNodes[k], values: () => Object.values(bigNodes) } },
  nodes: [], pending: [], queue: [], running: false,
  composerPhase: "active", openState: "open", blank: false,
  promptError: null, lastAgentError: null, openError: null, hasMore: false
};
const bigSession = { subscribe: () => () => {}, getSnapshot: () => bigSnapshot, prompt: async () => ({ ok: true }), cancel: async () => ({ ok: true }) };
sessions._setCustomSession("session-big1234", "big session", bigSession);
await act(async () => {
  sessions._setSessionById("session-big1234");
  await new Promise((r) => setTimeout(r, 30));
});
console.log("window note shown:", text().includes("older lines hidden"));
console.log("window tail visible:", text().includes("message 1199"));
console.log("window head hidden:", !text().includes("message 0"));

// Phase 6: guard — plain (safe) mode renders raw capped text, no parsing.
plugin.termGuard.setMode("plain");
await act(async () => {
  sessions._setSession();
  await new Promise((r) => setTimeout(r, 30));
});
console.log("plain mode active:", plugin.termGuard.currentMode() === "plain");
console.log("plain: no markdown parse (no .term-h1):", q(".term-h1") === null);
console.log("plain: no strong:", q(".term-assistant strong") === null);
console.log("plain: raw ** still visible:", text().includes("**"));
plugin.termGuard.setMode("full");
await act(async () => {
  sessions._setSession();
  await new Promise((r) => setTimeout(r, 30));
});
console.log("back to full mode:", plugin.termGuard.currentMode() === "full", "| h1 again:", q(".term-h1") !== null);

// Phase 7: guard — audit records exist.
console.log("audit events recorded:", plugin.termGuard.perf.events.length > 0);
console.log("audit summary ok:", plugin.termGuard.perfSummary().mode === "full");

// Phase 7b: working indicators — idle shows ✓; running shows the spinner +
// elapsed timer in the status bar and at the prompt; turn-end markers show
// the completion with duration.
console.log("idle status ✓:", q(".ts-ok") !== null, "| idle text:", q(".ts-right")?.textContent.includes("idle"));
console.log("turn complete marker:", text().includes("turn complete"));
console.log("turn duration shown:", text().includes("3.8s"));
await act(async () => {
  fakeSession._setRunning(true);
  await new Promise((r) => setTimeout(r, 150));
});
console.log("running spinner in status:", q(".ts-spin") !== null);
console.log("running timer text:", q(".ts-right")?.textContent.includes("running"));
console.log("spinner in prompt:", q(".tp-spin") !== null);
await act(async () => {
  fakeSession._setRunning(false);
  await new Promise((r) => setTimeout(r, 30));
});
console.log("back to idle:", q(".ts-ok") !== null, "| prompt spinner gone:", q(".tp-spin") === null);

// Phase 8: docked diagnostic panel — \diag opens a panel INSIDE the
// terminal; the input bar must stay present and usable; \exit closes it.
const input = q(".term-field");
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
const typeAndEnter = async (value) => {
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 20));
  });
};
await typeAndEnter("\\diag");
console.log("panel open — diag content shown:", text().includes("dsh terminal diagnostic"));
console.log("panel open — conversation hidden:", !text().includes("hello terminal"));
console.log("panel open — INPUT BAR STILL PRESENT:", q(".term-field") !== null);
console.log("panel open — hint says exit:", q(".term-hint")?.textContent.includes("\\exit"));
console.log("panel open — status bar still present:", q(".term-status") !== null);
await typeAndEnter("\\exit");
console.log("panel closed — conversation back:", text().includes("hello terminal"));
console.log("panel closed — input bar still present:", q(".term-field") !== null);
console.log("panel closed — hint normal:", q(".term-hint")?.textContent.includes("\\help"));
await typeAndEnter("\\diag");
await typeAndEnter("\\diag");
console.log("panel toggles off with \\diag:", !text().includes("dsh terminal diagnostic"));

// Phase 9: window errors surface as scrollback lines (no full-page overlay).
const boom = new window.Error("test-explosion");
window.dispatchEvent(new window.ErrorEvent("error", { error: boom, message: "test-explosion" }));
await new Promise((r) => setTimeout(r, 20));
console.log("error logged as line:", text().includes("test-explosion"));
console.log("no full-page overlay:", document.getElementById("dsh-term-diag") === null);
console.log("input bar alive after error:", q(".term-field") !== null);

// Phase 10: approvals & questions resolved from the terminal — banners show
// the details with action hints, and \approve / \decline / \answer /
// \reject deliver the exact wire responses.
const approvalWait = {
  kind: "approval", key: "a:rpc1", sessionId: "session-test1234",
  payload: { approvalId: "appr-1", toolName: "bash", reason: "run a shell command", callId: "c1" },
  respond: async (result) => { approvalResponses.push(result); return { accepted: true }; }
};
const questionWait = {
  kind: "question", key: "q:rpc2", sessionId: "session-test1234",
  payload: { questions: [{ id: "q1", prompt: "continue?", options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] }] },
  respond: async (result) => { questionResponses.push(result); return { accepted: true }; }
};
await act(async () => {
  fakeSession._setPending([approvalWait, questionWait]);
  await new Promise((r) => setTimeout(r, 30));
});
console.log("approval banner:", text().includes("approval 1:"));
console.log("approval detail:", text().includes("run a shell command") && text().includes("bash"));
console.log("approval hint:", text().includes("\\approve 1 to allow"));
console.log("question banner:", text().includes("question 1:") && text().includes("Yes | No"));
console.log("question hint:", text().includes("\\answer 1"));
await typeAndEnter("\\approve");
console.log("approve response:", JSON.stringify(approvalResponses[0]?.value));
await act(async () => {
  fakeSession._setPending([approvalWait, questionWait]);
  await new Promise((r) => setTimeout(r, 30));
});
await typeAndEnter("\\decline");
console.log("decline response:", JSON.stringify(approvalResponses[1]?.value));
await typeAndEnter("\\answer 1 yes");
console.log("answer response:", JSON.stringify(questionResponses[0]?.value));
await act(async () => {
  fakeSession._setPending([approvalWait, questionWait]);
  await new Promise((r) => setTimeout(r, 30));
});
await typeAndEnter("\\reject 1");
console.log("reject response:", JSON.stringify(questionResponses[1]?.ok ?? questionResponses[1]?.error?.code));
await act(async () => {
  fakeSession._setPending([]);
  await new Promise((r) => setTimeout(r, 30));
});
await typeAndEnter("\\approve");
console.log("no-pending guard:", text().includes("no pending approval"));

// Phase 11: session directory tree (\sessions) + right preview sidebar.
setProj("todos", [
  { content: "task one", status: "in_progress" },
  { content: "task two", status: "completed" },
  { content: "task three", status: "pending" }
]);
setProj("tokenUsage", { uncachedInputTokens: 120000, outputTokens: 3500, cacheReadTokens: 80000, cacheWriteTokens: 0 });
setProj("permissions", { options: [], currentValue: "workspace-write" });
setProj("contextPressure", { pressureTokens: 250000, projectedTokens: 250000, contextWindow: 1000000 });
setProj("sessionStats", { turns: 4, steps: 12, llmMs: 0, toolMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0 });
setProj("plan", { active: true, pending: false });
await act(async () => {
  sessions._setTreeSession();
  await new Promise((r) => setTimeout(r, 30));
});
console.log("sidebar present:", q(".term-sidebar") !== null);
console.log("sidebar tasks:", container.querySelectorAll(".td-todo").length, "| todo text:", q(".td-todo .td-text")?.textContent);
console.log("todo in_progress:", q('.td-todo[data-status="in_progress"]') !== null, "| done:", q('.td-todo[data-status="completed"]') !== null);
console.log("status-bar session meta:", q(".ts-meta")?.textContent.includes("workspace-write") && q(".ts-meta")?.textContent.includes("25%"));
console.log("sidebar plan:", text().includes("active"));
console.log("sessions tree removed from sidebar:", container.querySelectorAll(".td-session").length === 0);
console.log("zone3 hidden before selection:", q(".term-previewzone") === null);
await typeAndEnter("\\details off");
console.log("details off — sidebar gone:", q(".term-sidebar") === null);
await typeAndEnter("\\details on");
console.log("details on — sidebar back:", q(".term-sidebar") !== null);
openCalls.length = 0;
await typeAndEnter("\\sessions");
console.log("tree header:", text().includes("SESSION TREE"));
console.log("tree root line:", text().includes("root task"));
console.log("tree child guide:", text().includes("└─") || text().includes("├─"));
console.log("tree subagent:", text().includes("⊕") && text().includes("research agent"));
await typeAndEnter("\\open 2");
console.log("open by tree index 2 → child:", JSON.stringify(openCalls));

// Phase 12: actionable sidebar — pending cards with one-click buttons,
// context-pressure bar, and the clickable session tree.
approvalResponses.length = 0;
questionResponses.length = 0;
await act(async () => {
  fakeSession._setPending([approvalWait, questionWait]);
  await new Promise((r) => setTimeout(r, 30));
});
console.log("sidebar pending cards:", container.querySelectorAll(".td-pending").length);
const allowBtn = container.querySelector(".td-pending .td-btn[data-ok='true']");
console.log("approve button present:", allowBtn !== null);
await act(async () => {
  allowBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
});
console.log("sidebar approve response:", JSON.stringify(approvalResponses[0]?.value));
const questionCard = container.querySelectorAll(".td-pending")[1];
console.log("question option buttons:", questionCard?.querySelectorAll(".td-btn").length ?? 0);
const questionOption = questionCard?.querySelector(".td-btn");
await act(async () => {
  questionOption.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
});
console.log("sidebar question answer:", JSON.stringify(questionResponses[0]?.value));
await act(async () => {
  fakeSession._setPending([]);
  await new Promise((r) => setTimeout(r, 30));
});
console.log("ctx pct in status-bar meta:", q(".ts-meta")?.textContent.includes("ctx 25%"));

// Phase 13: produced files list in zone 2; DETAIL preview opens in zone 3.
await act(async () => {
  sessions._setSession();
  await new Promise((r) => setTimeout(r, 30));
});
console.log("files section:", text().includes("产物 files (2)"));
console.log("html file listed:", text().includes("index.html"));
console.log("js file listed:", text().includes("app.js"));
const htmlName = Array.from(container.querySelectorAll(".tf-name")).find((el) => el.textContent === "index.html");
await act(async () => {
  htmlName?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
});
console.log("zone3 opened on click:", q(".term-previewzone") !== null);
console.log("preview NOT inline in zone2:", q(".term-sidebar .tf-pview") === null && q(".term-sidebar .pz-frame") === null);
const frame = q(".term-previewzone .pz-frame");
console.log("html preview iframe in zone3:", frame !== null, "| sandbox:", frame?.getAttribute("sandbox"), "| srcdoc has content:", frame?.getAttribute("srcdoc")?.includes("Hi from preview") ?? false);
console.log("zone2 file highlighted:", q('.td-file[data-active="true"]')?.textContent.includes("index.html") ?? false);
const jsName = Array.from(container.querySelectorAll(".tf-name")).find((el) => el.textContent === "app.js");
await act(async () => {
  jsName?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
});
console.log("code preview in zone3:", q(".term-previewzone .pz-code") !== null, "| content:", q(".term-previewzone .pz-code")?.textContent.includes("const greet"));
console.log("highlight keyword:", q(".pz-code .hl-kw") !== null, "| comment:", q(".pz-code .hl-com") !== null, "| string:", q(".pz-code .hl-str") !== null);
openPathCalls.length = 0;
await act(async () => {
  const btn = q(".term-previewzone .pz-btn[title*='system app']") ?? q(".term-previewzone .pz-btn");
  btn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
});
console.log("zone3 openPath called:", JSON.stringify(openPathCalls));
await act(async () => {
  const closeBtn = Array.from(container.querySelectorAll(".term-previewzone .pz-btn")).find((el) => el.textContent === "✕");
  closeBtn?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
});
console.log("zone3 closed:", q(".term-previewzone") === null);


// --- interact: type a prompt and press Enter ---
await typeAndEnter("ls -la");
console.log("prompt calls:", promptCalls.length);
console.log("prompt text:", JSON.stringify(promptCalls[0]?.content), "mode:", promptCalls[0]?.mode);

// --- interact: \help ---
await act(async () => {
  setter.call(input, "\\help");
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 20));
});
console.log("help echoed:", text().includes("$ \\help"));
console.log("help table:", text().includes("DeepSeek Harness Terminal — commands:"));
console.log("help row:", text().includes("\\sessions"));

// --- command output lives in the FIXED dock, not the conversation area ---
const cmdlogEl = q(".term-cmdlog");
const scrollEl = q(".term-scroll");
console.log("command dock present:", cmdlogEl !== null);
console.log("help table in command dock:", cmdlogEl?.textContent.includes("commands:") ?? false);
console.log("help NOT in conversation scrollback:", !scrollEl?.textContent.includes("commands:"));
console.log("command echo in dock:", cmdlogEl?.textContent.includes("$ \\help") ?? false);
console.log("conversation NOT in dock:", !cmdlogEl?.textContent.includes("hello terminal"));
console.log("conversation still in scrollback:", scrollEl?.textContent.includes("hello terminal") ?? false);

// --- command output is bounded: flood the log, only the tail is kept ---
for (let i = 0; i < 30; i += 1) await typeAndEnter("\\status");
const dockLines = Array.from(container.querySelectorAll(".term-cmdlog > *")).length;
console.log("dock bounded after flood:", dockLines < 250, "| lines:", dockLines);

// --- \clear empties the dock ---
await typeAndEnter("\\clear");
console.log("command dock cleared:", q(".term-cmdlog") === null);

// Phase 14: command dock alert zones — errors red, warnings amber,
// normal default; same-type notices collapse; errors land at the BOTTOM
// and are REAL-TIME: a new command clears the previous alerts.
await typeAndEnter("\\badcmd");
console.log("error alert strip:", q('.tcl-alert[data-kind="error"]') !== null);
console.log("error text:", q('.tcl-alert[data-kind="error"]')?.textContent.includes("unknown command"));
const dock = q(".term-cmdlog");
const dockChildren = dock ? Array.from(dock.children) : [];
console.log("error strip is LAST child (bottom reminder):", dockChildren.length > 0 && dockChildren[dockChildren.length - 1]?.getAttribute("data-kind") === "error");
await typeAndEnter("\\status");
console.log("REAL-TIME: old error cleared by new command:", q('.tcl-alert[data-kind="error"]') === null);
await typeAndEnter("\\safe on");
console.log("warning alert strip:", q('.tcl-alert[data-kind="warn"]') !== null);
console.log("warning text:", q('.tcl-alert[data-kind="warn"]')?.textContent.includes("safe"));
const dockAfter = Array.from(q(".term-cmdlog")?.children ?? []);
console.log("warning strip is LAST child (only warning present):", dockAfter[dockAfter.length - 1]?.getAttribute("data-kind") === "warn");
await typeAndEnter("\\safe off");
console.log("REAL-TIME: command warning cleared too:", q('.tcl-alert[data-kind="warn"]') === null);
await typeAndEnter("\\status");
console.log("normal tone fg:", q('.term-system[data-tone="fg"]') !== null);

// Stall collapse: two real main-thread blocks → ONE always-current line.
// The heartbeat interval is 500ms — wait 700ms after each block so the
// catch-up tick fires (and its state update flushes) before asserting.
const blockMainThread = async (ms) => {
  await act(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { /* busy wait — simulates a freeze */ }
    await new Promise((r) => setTimeout(r, 700));
  });
};
await blockMainThread(1700); // stall 1
await blockMainThread(1700); // stall 2
const warnStrips = Array.from(container.querySelectorAll('.tcl-alert[data-kind="warn"]'));
const stallText = warnStrips.map((el) => el.textContent).join(" ");
console.log("stall fired (perf):", plugin.termGuard.perf.events.filter((e) => e.kind === "stall").length >= 1);
console.log("stall collapsed to one warning strip:", warnStrips.length === 1 && stallText.includes("stall"));
console.log("stall count updated:", /第 \d+ 次/.test(stallText));
console.log("stall longest shown:", stallText.includes("最长"));
await typeAndEnter("\\status");
console.log("persistent stall warning survives a command:", q('.tcl-alert[data-kind="warn"]')?.textContent.includes("stall") ?? false);

// --- command echo did not send a prompt ---
console.log("prompt calls still 1:", promptCalls.length === 1);

// Phase 15: preview card — mock the host /wsfiles route, then exercise
// \preview (toggle / open file), \dir (directory browser), close, float.
// NOTE: the bundle calls the GLOBAL fetch (not window.fetch), so the mock
// must patch globalThis.fetch — Node's native fetch would hit the real
// server instead.
const fakeResp = (body, type) => ({
  ok: true,
  status: 200,
  headers: { get: (name) => (name.toLowerCase() === "content-type" ? type : null) },
  json: async () => JSON.parse(body),
  text: async () => body
});
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.startsWith("/wsfiles")) {
    const path = new URL(u, "http://x").searchParams.get("path") ?? "";
    if (path === "") {
      return fakeResp(JSON.stringify({ path: "", entries: [{ name: "src", type: "dir" }, { name: "高副低代.html", type: "file" }] }), "application/json; charset=utf-8");
    }
    if (path === "src") {
      return fakeResp(JSON.stringify({ path: "src", entries: [{ name: "app.js", type: "file" }] }), "application/json; charset=utf-8");
    }
    if (path === "高副低代.html") {
      return fakeResp("<!doctype html><h1>hi</h1>", "text/html; charset=utf-8");
    }
    if (path === "src/app.js") {
      return fakeResp("const x = 1;", "text/javascript; charset=utf-8");
    }
  }
  throw new Error("unexpected fetch " + u);
};
await typeAndEnter("\\preview");
await new Promise((r) => setTimeout(r, 40));
console.log("preview card open:", q(".term-preview") !== null);
console.log("preview header present:", q(".pv-header") !== null);
console.log("dir entries listed (root auto-load):", text().includes("高副低代.html") && text().includes("src"));
await typeAndEnter("\\dir");
console.log("dir toggles OFF when browser tab already shown:", q(".term-preview") === null);
await typeAndEnter("\\dir");
await new Promise((r) => setTimeout(r, 40));
console.log("dir toggles back ON:", q(".term-preview") !== null);
await typeAndEnter("\\preview 高副低代.html");
await new Promise((r) => setTimeout(r, 40));
console.log("html opens as web preview (iframe):", q(".pv-frame") !== null);
console.log("iframe src uses wsfiles:", q(".pv-frame")?.getAttribute("src").includes("/wsfiles") ?? false);
await typeAndEnter("\\preview src/app.js");
await new Promise((r) => setTimeout(r, 40));
console.log("code file shows content:", q(".pv-code")?.textContent.includes("const x = 1") ?? false);
await typeAndEnter("\\preview close");
console.log("preview closed:", q(".term-preview") === null);
await typeAndEnter("\\preview");
await act(async () => {
  q(".pv-float").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
});
console.log("float mode on:", q(".term-preview")?.getAttribute("data-float") === "true");
console.log("input bar alive with preview:", q(".term-field") !== null);
await typeAndEnter("\\preview close");
console.log("preview closed after float:", q(".term-preview") === null);

// Phase 16: pending BUBBLE — entry pill at the input line's bottom-left;
// clicking pops a floating card over the content (no view replacement).
const crossApprovalResponses = [];
const crossQuestionResponses = [];
const crossApproval = {
  kind: "approval", key: "a:rpcX", sessionId: "session-big1234",
  payload: { approvalId: "appr-x", toolName: "pwsh", reason: "modify a file", callId: "cx" },
  respond: async (result) => { crossApprovalResponses.push(result); return { accepted: true }; }
};
const crossQuestion = {
  kind: "question", key: "q:rpcY", sessionId: "session-test1234",
  payload: { questions: [{ id: "q2", prompt: "proceed across sessions?", options: [{ label: "OK", value: "ok" }] }] },
  respond: async (result) => { crossQuestionResponses.push(result); return { accepted: true }; }
};
bigSnapshot.pending = [crossApproval]; // the OTHER session's pending
fakeSession._setPending([crossQuestion]); // current session's pending
await act(async () => {
  sessions._setTwoSessions();
  await new Promise((r) => setTimeout(r, 30));
});
await new Promise((r) => setTimeout(r, 2800)); // wait for the 2.5s poll
console.log("bubble pill shows total 2:", q(".pb-btn")?.textContent.includes("2") ?? false);
console.log("no top-bar badge anymore:", q(".ts-pendingbtn") === null);
console.log("bubble closed by default:", q(".pb-pop") === null);
await typeAndEnter("\\pending");
await new Promise((r) => setTimeout(r, 60));
console.log("bubble popover open:", q(".pb-pop") !== null);
console.log("no view replacement (no panel header):", !text().includes("diagnostic panel —"));
console.log("terminal chrome intact with bubble:",
  q(".term-status") !== null && q(".term-scroll") !== null && q(".term-field") !== null && q(".term-cmdlog") !== null);
const pcSessions = container.querySelectorAll(".pc-sess").length;
console.log("two session groups (hierarchy):", pcSessions === 2, "| groups:", pcSessions);
console.log("trace: other session id shown:", text().includes("big1234"));
console.log("trace: tool + reason shown:", text().includes("pwsh") && text().includes("modify a file"));
console.log("current-session question shown:", text().includes("proceed across sessions"));
const centerAllowBtn = Array.from(container.querySelectorAll(".td-btn")).find((b) => b.textContent.includes("允许"));
await act(async () => {
  centerAllowBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
});
console.log("cross-session approve sent:", JSON.stringify(crossApprovalResponses[0]?.value));
await typeAndEnter("\\pending");
console.log("bubble closed by \\pending:", q(".pb-pop") === null);
await typeAndEnter("\\pending");
await act(async () => {
  q(".pb-backdrop").dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
});
console.log("bubble closes on outside click:", q(".pb-pop") === null);
console.log("SMOKE TEST PASSED");
process.exit(0); // the terminal's wall-clock interval keeps the loop alive
