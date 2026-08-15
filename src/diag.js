/**
 * On-page diagnostics: a window-level error trap plus a visible overlay that
 * reports what happened when the terminal cannot mount. Invisible on
 * success; on failure it shows the captured errors, the plugin phase, and
 * the live 'root' slot roster (who won) so the cause is one refresh away.
 * Exposed as window.__dshTermDiag for console inspection.
 */

/** Global diagnostic record (created lazily; survives plugin reloads). */
function diagRecord() {
  const existing = typeof window !== "undefined" ? window.__dshTermDiag : void 0;
  if (existing) return existing;
  const record = {
    phase: "booting",
    events: [],
    errors: []
  };
  if (typeof window !== "undefined") window.__dshTermDiag = record;
  return record;
}

/** Advance the phase ledger. */
function diagPhase(phase) {
  const record = diagRecord();
  record.phase = phase;
  record.events.push([phase, Date.now()]);
}

/** Record one captured error. */
function diagError(type, error) {
  const record = diagRecord();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  if (record.errors.some((entry) => entry.message === message)) return;
  record.errors.push({ type, message, stack, at: Date.now() });
}

/** Terminal-mounted notifier: when the terminal UI is alive, window errors
 * are reported through it (log lines) instead of a full-page overlay, so
 * the input bar always stays usable. Falls back to the overlay only when
 * no notifier is registered (boot-time errors, crashed terminal). */
let diagNotifier = null;

/** Register/unregister the terminal's error notifier. */
function diagSetNotifier(fn) {
  diagNotifier = fn;
}

/** Route one captured error: notifier when the terminal is alive, else overlay. */
function diagNotify() {
  if (diagNotifier !== null) {
    try {
      diagNotifier();
      return;
    } catch {
      // notifier failed — fall through to the overlay.
    }
  }
  diagRenderOverlay();
}

/** Install window-level error traps (idempotent). */
function diagInstall() {
  if (typeof window === "undefined" || window.__dshTermDiagInstalled) return;
  window.__dshTermDiagInstalled = true;
  window.addEventListener("error", (event) => {
    diagError("window.error", event.error ?? event.message);
    diagNotify();
  });
  window.addEventListener("unhandledrejection", (event) => {
    diagError("unhandledrejection", event.reason);
    diagNotify();
  });
}

/** Shared diagnostic content lines (the docked panel and the crash overlay
 * render the same data). */
function diagContentLines(record) {
  const lines = [
    "── dsh terminal diagnostic ─────────────────────────────",
    `phase: ${record.phase}`,
    `errors: ${record.errors.length}`
  ];
  for (const error of record.errors) {
    lines.push("", `✗ [${error.type}] ${error.message}`);
    if (error.stack) lines.push(error.stack.split("\n").slice(0, 6).join("\n"));
  }
  lines.push("", `events: ${record.events.map(([p]) => p).join(" → ")}`);
  // Performance guard audit: mode, window, and the recent render/stall ring.
  try {
    const summary = perfSummary();
    lines.push("", `guard mode: ${summary.mode}   node window: ${summary.window}`);
    lines.push("audit (last 12):");
    lines.push(summary.last.map((line) => `  ${line}`).join("\n") || "  (no events yet)");
  } catch {
    // guard not wired yet — the panel still shows the rest.
  }
  const roster = diagSlotRoster();
  lines.push("", "root slot roster:");
  lines.push(roster.length > 0 ? roster.join("\n") : "  (no snapshot available)");
  return lines;
}

/** Build the crash-fallback overlay DOM (fixed, topmost, monospace). */
function diagOverlayNode(record) {
  const box = document.createElement("div");
  box.style.cssText = [
    "position:fixed", "inset:0", "z-index:2147483647",
    "background:rgba(20,4,4,.96)", "color:#ffb4ab",
    "font:13px/1.7 Consolas,monospace", "padding:20px 28px",
    "overflow:auto", "white-space:pre-wrap"
  ].join(";");
  box.textContent = [...diagContentLines(record), "", "─ terminal crashed — press Ctrl+R to reload ─"].join("\n");
  return box;
}

/** Read the live 'root' slot roster through the registry snapshot. */
function diagSlotRoster() {
  const record = diagRecord();
  const slots = record.slots;
  if (!slots) return [];
  try {
    const tree = slots.snapshot("root");
    const node = tree[0];
    if (!node) return ["  (root slot undeclared — impossible: it is built-in)"];
    return node.occupants.map((entry) => {
      const who = entry.registrant ?? entry.key ?? entry.id ?? "?";
      return `  ${entry.active ? "▶" : " "} ${String(entry.priority).padStart(2)}  ${who}`;
    });
  } catch (error) {
    return [`  (snapshot failed: ${error.message})`];
  }
}

/** Render (or update) the overlay with the current record; no-op while clean. */
function diagRenderOverlay() {
  if (typeof document === "undefined") return;
  const record = diagRecord();
  const previous = document.getElementById("dsh-term-diag");
  if (previous) previous.remove();
  const node = diagOverlayNode(record);
  node.id = "dsh-term-diag";
  document.documentElement.appendChild(node);
}

/** Expose the slots registry to the diagnostics (called at apply time). */
function diagAttachSlots(slots) {
  diagRecord().slots = slots;
}

/** Hand the diagnostics to the terminal's own React error boundary. */
function diagBoundary() {
  return class extends react.Component {
    state = { failed: false };
    static getDerivedStateFromError(error) {
      diagError("terminal component", error);
      return { failed: true };
    }
    componentDidCatch() {
      diagRenderOverlay();
    }
    render() {
      if (this.state.failed) return null; // the overlay carries the report
      return this.props.children;
    }
  };
}
