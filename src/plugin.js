/**
 * Plugin entry (browser half). Registers the terminal into the built-in
 * 'root' slot at priority -1 so it shadows the stock AppFrame (registered
 * at 0; the slot system renders the lowest priority). The registration is
 * kept in a module-level handle so \gui can unmount it (stock UI returns)
 * and \terminal can re-mount it — no page reload needed for either.
 */

/** Client services the runner must resolve before applying this plugin. */
const inject = ["slots", "sessions", "workspaces", "theme"];

/** Module-level root registration handle (single occupant per priority). */
let rootCtx = null;
let disposeRoot = null;

/** The terminal's own error boundary: a component crash reports to the
 * on-page overlay instead of letting the slot machinery abdicate us. */
const TermBoundary = diagBoundary();

/** Register the terminal as the root occupant (idempotent). */
function mount(ctx) {
  if (disposeRoot !== null) return;
  disposeRoot = ctx.slots.register(
    {
      name: "root",
      priority: -1
    },
    (props) => h(TermBoundary, null,
      h(TerminalRoot, {
        ctx,
        mount,
        unmount,
        sessions: ctx.sessions,
        workspaces: ctx.workspaces,
        ...props
      })
    )
  );
  diagPhase("registered");
}

/** Unregister the terminal; the stock interface becomes the root occupant. */
function unmount() {
  if (disposeRoot === null) return;
  disposeRoot();
  disposeRoot = null;
  diagPhase("unmounted");
}

/** Plugin body: inject the stylesheet and mount the terminal for this fiber. */
function apply(ctx) {
  rootCtx = ctx;
  diagInstall();
  diagAttachSlots(ctx.slots);
  diagPhase("apply");
  if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${TERMINAL_CSS_ID}"]`) === null) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "@dsh-local/ui-terminal";
    tag.dataset.pluginCss = TERMINAL_CSS_ID;
    tag.textContent = TERMINAL_CSS;
    document.head.appendChild(tag);
  }
  diagPhase("css");
  ctx.effect(() => {
    try {
      mount(ctx);
    } catch (error) {
      diagError("mount", error);
      diagRenderOverlay();
      throw error;
    }
    return () => unmount();
  }, "ui-terminal: root registration");
}

/** Debug/test surface for the performance guard (audit + mode control). */
const termGuard = {
  currentMode,
  setMode,
  observeRender,
  perfSummary,
  perf,
  LIMITS
};
