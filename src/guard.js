/**
 * Performance guard: bounded rendering + freeze audit.
 *
 * The terminal must never freeze the page. Three layers:
 *
 *  1. BOUNDED WORK — the model is built over a tail WINDOW of nodes only
 *     (never the whole log), prose parsing is capped per block, and every
 *     loop carries iteration guards. A render's cost is capped regardless
 *     of how pathological the session log is.
 *  2. AUTO-DOWNGRADE — renders are timed; a slow render flips the mode
 *     from "full" (markdown, trees) to "plain" (raw truncated lines) and
 *     the window shrinks, until renders are healthy again for a while.
 *  3. FREEZE AUDIT — a main-thread heartbeat measures stalls between
 *     ticks; any gap over the stall threshold is recorded together with
 *     the render stats that preceded it, surfaced by \diag and \perf.
 */

const LIMITS = {
  nodeWindow: 200,      // max chat nodes rendered (tail window)
  textParseCap: 8000,   // chars of prose parsed as markdown per block
  toolOutputCap: 4000,  // chars of tool output shown per tool
  toolOutputLineCap: 40, // max tool-output lines rendered per tool
  slowRenderMs: 80,     // render+commit slower than this downgrades the mode
  stallMs: 1500,        // heartbeat gap above this counts as a stall
  heartbeatMs: 500      // heartbeat interval
};

/** Audit ring: every measured render, downgrade, upgrade, and stall. */
const perf = { events: [], max: 64 };

/** Rendering mode: "full" (markdown + structure) | "plain" (raw, capped). */
let mode = "full";
let downgradedAt = 0;

function recordPerf(entry) {
  perf.events.push(entry);
  if (perf.events.length > perf.max) perf.events.shift();
}

function currentMode() {
  return mode;
}

/** Manual mode switch (\safe). */
function setMode(next) {
  mode = next === "plain" ? "plain" : "full";
  downgradedAt = mode === "plain" ? Date.now() : 0;
  recordPerf({ t: Date.now(), ms: 0, nodes: 0, chars: 0, mode, kind: "manual" });
}

/**
 * Observe one render+commit's cost. Downgrades to plain mode when the
 * commit exceeded the budget (and stays there while commits stay slow);
 * upgrades back to full mode only after a sustained healthy spell on a
 * small document, so a pathological log cannot flip-flop the page.
 * @returns the mode the NEXT render should use.
 */
function observeRender(ms, nodes, chars) {
  recordPerf({ t: Date.now(), ms: Math.round(ms), nodes, chars, mode, kind: "render" });
  if (ms > LIMITS.slowRenderMs) {
    if (mode !== "plain" || ms > LIMITS.slowRenderMs * 4) {
      mode = "plain";
      downgradedAt = Date.now();
      recordPerf({ t: Date.now(), ms: Math.round(ms), nodes, chars, mode: "plain", kind: "downgrade" });
    }
  } else if (
    mode === "plain"
    && Date.now() - downgradedAt > 8000
    && nodes <= 100
    && chars <= 50000
  ) {
    mode = "full";
    recordPerf({ t: Date.now(), ms: Math.round(ms), nodes, chars, mode: "full", kind: "upgrade" });
  }
  return mode;
}

/** Record a detected main-thread stall (heartbeat gap), once per stall. */
function recordStall(gapMs, preceding) {
  recordPerf({ t: Date.now(), ms: Math.round(gapMs), nodes: 0, chars: 0, mode, kind: "stall", preceding: preceding ?? void 0 });
}

/** Compact audit summary for \perf and the diagnostic overlay. */
function perfSummary() {
  const last = perf.events.slice(-12);
  return {
    mode,
    window: LIMITS.nodeWindow,
    last: last.map((entry) => `${entry.kind} ${entry.ms}ms${entry.nodes ? ` n=${entry.nodes}` : ""}${entry.chars ? ` c=${entry.chars}` : ""}`)
  };
}

/** Prose renderer with the parse cap applied: plain truncated when over. */
function cappedText(text) {
  if (typeof text !== "string" || text === "") return text;
  return truncate(text, LIMITS.textParseCap);
}
