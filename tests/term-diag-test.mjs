// Verify the on-page diagnostic overlay: window errors surface a visible
// overlay with phase + error + root-slot roster.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

// The bundle under test is THIS repo's build; the seed modules (react, the
// DSH client packages) resolve from an installed DSH web profile (override
// with DSH_PROFILE_NM, e.g. "node_modules" in CI). The default expands the
// current user's home at runtime — no hardcoded paths.
const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE_NM = process.env.DSH_PROFILE_NM ?? join(homedir(), ".dsh", "profiles", "node_modules");
const BUNDLE = join(HERE, "..", "lib", "client.js");
const req = createRequire(resolve(PROFILE_NM, "x.js"));

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://127.0.0.1/" });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

let registered = null;
window.__ModuleLoader__ = { load: (h) => { registered = h; } };
new Function("require", "window", "document", "navigator", readFileSync(BUNDLE, "utf8"))(
  (spec) => req(spec), window, window.document, window.navigator
);
const plugin = registered.factory((spec) => req(spec));

const ctx = {
  sessions: { list: { getSnapshot: () => ({ ids: [], byId: {}, current: undefined, phase: "idle" }), subscribe: () => () => {} }, binding: () => undefined, open() {} },
  workspaces: { startSession() {} },
  theme: { getTheme: () => ({ id: "dark" }), setTheme() {} },
  slots: {
    register: (opts, comp) => () => {},
    snapshot: (root) => [{
      name: "root", kind: "single", scope: "root",
      occupants: [
        { registrant: "@deepseek-ai/dsh-client-ui-layout", priority: 0, active: false },
        { registrant: "@dsh-local/ui-terminal", priority: -1, active: true }
      ], children: []
    }]
  },
  on: () => () => {},
  effect: (fn) => { const r = fn(); return typeof r === "function" ? r : () => {}; }
};
plugin.apply(ctx);

// simulate an uncaught window error (ErrorEvent carries error + message)
const boom = new window.Error("test-explosion");
window.dispatchEvent(new window.ErrorEvent("error", { error: boom, message: "test-explosion" }));

const overlay = document.getElementById("dsh-term-diag");
if (!overlay) throw new Error("overlay not rendered");
const text = overlay.textContent;
console.log("overlay rendered:", text.length > 0);
console.log("shows phase:", text.includes("registered"));
console.log("shows error:", text.includes("test-explosion"));
console.log("shows roster:", text.includes("@dsh-local/ui-terminal") && text.includes("@deepseek-ai/dsh-client-ui-layout"));
console.log("DIAG TEST PASSED");
