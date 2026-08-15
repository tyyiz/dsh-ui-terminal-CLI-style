/**
 * Preview card: a right-side (or floating) panel showing workspace files —
 * source code, images, and web pages (iframe) — fed by the host /wsfiles
 * route. Docked mode resizes via the divider drag; float mode drags by the
 * header and resizes by the corner handle. Geometry persists in localStorage.
 */

/** Persisted geometry: dock width, float rect, and the last mode/tab. */
function previewStore() {
  try {
    const raw = window.localStorage.getItem("dsh.term.preview");
    if (raw) return JSON.parse(raw);
  } catch {
    // storage unavailable — defaults
  }
  return { width: 420, float: false, rect: { x: 120, y: 60, w: 520, h: 420 } };
}

/** Persist a patch (merged over the current store). */
function savePreviewStore(patch) {
  try {
    window.localStorage.setItem("dsh.term.preview", JSON.stringify({ ...previewStore(), ...patch }));
  } catch {
    // ignore
  }
}

/** One fetch to the /wsfiles route; resolves {kind:"listing", entries} or
 * {kind:"file", text, mime, url} / {kind:"web", url} / {kind:"image", url}. */
async function wsfiles(path) {
  const url = `/wsfiles?path=${encodeURIComponent(path ?? "")}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`wsfiles ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const data = await response.json();
    return { kind: "listing", path: data.path ?? "", entries: data.entries ?? [] };
  }
  if (type.includes("text/html")) {
    return { kind: "web", url };
  }
  if (type.startsWith("image/")) {
    return { kind: "image", url };
  }
  const text = await response.text();
  return { kind: "file", text, mime: type, url };
}

/** Kind of preview for a file name (web / image / code). */
function fileKind(name) {
  const lower = String(name ?? "").toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "web";
  if (lower.match(/\.(png|jpe?g|gif|webp|svg|ico)$/)) return "image";
  return "code";
}

/** Split a path into segments for the breadcrumb. */
function pathSegments(path) {
  return String(path ?? "").split(/[\\/]/).filter(Boolean);
}

/** Join breadcrumb segments back into a path. */
function joinSegments(segments) {
  return segments.join("/");
}

/** Pointer-drag helper: call start(event) then move/resize callbacks. */
function startDrag(event, onMove, onEnd) {
  event.preventDefault();
  const move = (ev) => onMove(ev);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    onEnd?.();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** The preview card body: file browser tab + content tab. The browser tab
 * auto-loads the current directory whenever it becomes visible or the
 * breadcrumb moves. */
function PreviewBody({ state, setState }) {
  const { tab, crumb, entries, loading, error, file } = state;

  const openPath = async (path) => {
    setState((s) => ({ ...s, loading: true, error: null, crumb: pathSegments(path) }));
    try {
      const result = await wsfiles(path);
      if (result.kind === "listing") {
        setState((s) => ({ ...s, loading: false, entries: result.entries, tab: "browser", crumb: pathSegments(result.path) }));
      } else {
        setState((s) => ({ ...s, loading: false, file: result, tab: "content" }));
      }
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error: error.message }));
    }
  };

  // Auto-load the directory when the browser tab is shown or the crumb
  // moves (stable crumb key keeps the effect from re-firing per render).
  const crumbKey = crumb.join("/");
  const loadedKeyRef = react.useRef(null);
  react.useEffect(() => {
    if (tab !== "browser") return;
    if (loadedKeyRef.current === crumbKey && entries.length > 0) return;
    loadedKeyRef.current = crumbKey;
    openPath(crumbKey);
  }, [tab, crumbKey]);

  const openEntry = (entry) => {
    const next = [...crumb, entry.name];
    if (entry.type === "dir") {
      openPath(joinSegments(next));
    } else {
      setState((s) => ({ ...s, file: { kind: "pending" }, tab: "content" }));
      openPath(joinSegments(next));
    }
  };

  const kids = [];
  if (tab === "browser") {
    kids.push(
      h("div", { className: "pv-browser", key: "browser" }, [
        h("div", { className: "pv-crumb", key: "crumb" }, [
          h("button", { type: "button", className: "pv-link", key: "root", onClick: () => openPath("") }, "⌂"),
          crumb.map((part, index) => h("span", { key: index }, [
            h("span", { className: "pv-sep", key: "s" }, " / "),
            h("button", {
              type: "button",
              className: "pv-link",
              key: "b",
              onClick: () => openPath(joinSegments(crumb.slice(0, index + 1)))
            }, part)
          ]))
        ]),
        loading
          ? h("div", { className: "pv-msg", key: "l" }, "loading…")
          : error
            ? h("div", { className: "pv-msg", "data-tone": "error", key: "e" }, `✗ ${error}`)
            : h("div", { className: "pv-list", key: "list" },
                entries.map((entry, index) => h("button", {
                  type: "button",
                  className: "pv-entry",
                  "data-type": entry.type,
                  key: `${entry.name}-${index}`,
                  onClick: () => openEntry(entry)
                }, [
                  h("span", { className: "pv-glyph", key: "g" }, entry.type === "dir" ? "▸" : "·"),
                  h("span", { className: "pv-name", key: "n" }, entry.name)
                ])))
      ])
    );
  } else {
    const f = file;
    if (f === null || f === void 0 || f.kind === "pending") {
      kids.push(h("div", { className: "pv-msg", key: "m" }, "no file open — use \\preview <path> or the 目录 tab"));
    } else if (f.kind === "image") {
      kids.push(h("img", { className: "pv-img", src: f.url, alt: "", key: "i" }));
    } else if (f.kind === "web") {
      kids.push(h("iframe", { className: "pv-frame", src: f.url, sandbox: "", key: "f" }));
    } else {
      kids.push(h("pre", { className: "pv-code", key: "c" }, f.text ?? ""));
    }
  }
  return h("div", { className: "pv-body" }, kids);
}

/** The card shell: header (tabs, float, close) + body. Width is controlled
 * by the parent (the divider drag lives in TerminalRoot); float rect is
 * owned here. */
function PreviewCard({ state, setState, onClose, width, onResize }) {
  const store = previewStore();
  const [float, setFloat] = react.useState(store.float);
  const [rect, setRect] = react.useState(store.rect);
  const persist = (patch) => savePreviewStore(patch);

  const tab = state.tab;
  const onHeaderDrag = (event) => {
    if (event.target.closest("button")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = rect;
    startDrag(event, (ev) => {
      const r = { ...startRect, x: startRect.x + (ev.clientX - startX), y: startRect.y + (ev.clientY - startY) };
      setRect(r);
      persist({ rect: r });
    });
  };
  const onCornerDrag = (event) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = rect;
    startDrag(event, (ev) => {
      const r = {
        ...startRect,
        w: Math.min(1200, Math.max(300, startRect.w + (ev.clientX - startX))),
        h: Math.min(900, Math.max(240, startRect.h + (ev.clientY - startY)))
      };
      setRect(r);
      persist({ rect: r });
    });
  };
  const toggleFloat = () => {
    const next = !float;
    setFloat(next);
    persist({ float: next });
  };

  return h("div", {
    className: "term-preview",
    "data-float": float ? "true" : void 0,
    style: float ? { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` } : { width: `${width}px` }
  }, [
    h("div", {
      className: "pv-header",
      key: "head",
      onPointerDown: float ? onHeaderDrag : void 0
    }, [
      h("span", { className: "pv-title", key: "t" }, "preview"),
      h("button", {
        type: "button",
        className: "pv-tab",
        "data-active": tab === "browser" ? "true" : void 0,
        key: "tb",
        onClick: () => setState((s) => ({ ...s, tab: "browser" }))
      }, "目录"),
      h("button", {
        type: "button",
        className: "pv-tab",
        "data-active": tab === "content" ? "true" : void 0,
        key: "tc",
        onClick: () => setState((s) => ({ ...s, tab: "content" }))
      }, "内容"),
      h("span", { className: "pv-spacer", key: "sp" }),
      h("button", {
        type: "button",
        className: "pv-float",
        key: "fl",
        title: float ? "dock to the right" : "float as a draggable card",
        onClick: toggleFloat
      }, float ? "⧉" : "⛶"),
      h("button", {
        type: "button",
        className: "pv-close",
        key: "x",
        title: "close preview (\\preview)",
        onClick: onClose
      }, "✕")
    ]),
    h(PreviewBody, { state, setState, key: "body" }),
    float ? h("div", { className: "pv-corner", key: "cr", onPointerDown: onCornerDrag }) : null
  ]);
}

/** Initial preview state. */
function initialPreviewState() {
  return { tab: "browser", crumb: [], entries: [], loading: false, error: null, file: null };
}
