/**
 * Terminal palette + layout stylesheet, injected as one tagged <style> node
 * (house convention: data-plugin / data-plugin-css so HMR bookkeeping can
 * claim and replace it). Two palettes ride the `data-term-mode` attribute:
 * "dark" (phosphor terminal) and "light" (paper terminal).
 *
 * Display hierarchy (four levels):
 *   L1 .term-user      — accent border + tinted block (user input)
 *   L2 .term-assistant — primary text, code boxes, streaming cursor
 *   L3 .term-tool      — indented tree: call line, status, nested output
 *   L4 .term-system    — dim notices; .term-pending amber banners
 *   .term-head         — turn separator (role + time) above each turn
 */
const TERMINAL_CSS = `
.term-root{
  --term-bg:#0a0d0b; --term-surface:#0e120f; --term-border:#1d261e;
  --term-fg:#bac6ba; --term-dim:#5d6a5d; --term-faint:#465146;
  --term-accent:#7ddb8a; --term-cyan:#79c0ff; --term-amber:#e3b341;
  --term-red:#ff7b72; --term-purple:#bc8cff; --term-code-bg:#101612;
  --term-code-border:#243024; --term-caret:#7ddb8a;
  --term-tool:#79c0ff; --term-code-fg:#7ee787;
  background:var(--term-bg); color:var(--term-fg);
  font-family:"Cascadia Code","JetBrains Mono",Consolas,"SFMono-Regular",Menlo,monospace;
  font-size:13.5px; line-height:1.6;
  height:100%; width:100%; display:flex; flex-direction:column;
  overflow:hidden; box-sizing:border-box; position:relative;
}
.term-root[data-term-mode="light"]{
  --term-bg:#f6f3e9; --term-surface:#efecdf; --term-border:#d6d1bf;
  --term-fg:#252a21; --term-dim:#6d7462; --term-faint:#9aa08c;
  --term-accent:#1f7a3d; --term-cyan:#0f5f8a; --term-amber:#8a6d1a;
  --term-red:#b3362c; --term-purple:#6f42c1; --term-code-bg:#efecdd;
  --term-code-border:#d0cab4; --term-caret:#1f7a3d;
  --term-tool:#0f5f8a; --term-code-fg:#1a7f37;
}
.term-root *{box-sizing:border-box}
.term-root ::selection{background:var(--term-accent); color:var(--term-bg)}

/* top status bar */
.term-status{
  flex:none; display:flex; align-items:center; gap:10px;
  height:30px; padding:0 12px;
  background:var(--term-surface); border-bottom:1px solid var(--term-border);
  font-size:12px; color:var(--term-dim); user-select:none;
}
.term-status .ts-brand{color:var(--term-accent); font-weight:700; letter-spacing:.08em}
.term-status .ts-ver{color:var(--term-faint); font-size:10.5px; border:1px solid var(--term-border); border-radius:4px; padding:0 5px; line-height:1.4}
.term-status .ts-navbtn[data-active="true"]{color:var(--term-accent); border-color:var(--term-accent)}
.term-status .ts-sep{color:var(--term-faint)}
.term-status .ts-right{margin-left:auto; display:flex; align-items:center; gap:10px; white-space:nowrap; overflow:hidden}
.term-status .ts-dot{display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--term-dim)}
.term-status .ts-dot[data-live="true"]{background:var(--term-accent); box-shadow:0 0 6px var(--term-accent)}
.term-status .ts-dot[data-warn="true"]{background:var(--term-amber)}
.term-status .ts-spin{color:var(--term-accent); font-weight:700}
.term-status .ts-run{color:var(--term-accent); font-weight:600}
.term-status .ts-ok{color:var(--term-accent); font-weight:700}

/* scrollback + right preview sidebar */
.term-body{flex:1;min-height:0;display:flex}
.term-scroll{
  flex:1; min-width:0; overflow-y:auto; overscroll-behavior:contain;
  padding:8px 16px 18px; scrollbar-width:thin;
}
.term-scroll::-webkit-scrollbar{width:8px}
.term-scroll::-webkit-scrollbar-thumb{background:var(--term-faint); border-radius:4px}
.term-scroll::-webkit-scrollbar-track{background:transparent}
.term-sidebar{
  flex:none; width:300px; min-width:220px; max-width:420px;
  border-left:1px solid var(--term-border); background:var(--term-surface);
  overflow-y:auto; padding:8px 12px 16px;
  scrollbar-width:thin; font-size:12.5px; line-height:1.55;
}
.term-sidebar[data-wide="true"]{width:480px; max-width:56vw}
.term-sidebar::-webkit-scrollbar{width:8px}
.term-sidebar::-webkit-scrollbar-thumb{background:var(--term-faint); border-radius:4px}

/* zone 3 — detail preview pane */
.term-previewzone{
  flex:none; width:460px; max-width:50vw; min-width:280px;
  border-left:1px solid var(--term-border); background:var(--term-surface);
  display:flex; flex-direction:column; min-height:0;
}
.pz-head{
  flex:none; display:flex; align-items:center; gap:6px;
  padding:6px 12px; border-bottom:1px solid var(--term-border);
  font-size:12.5px;
}
.pz-head .pz-title{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--term-cyan); font-weight:600}
.pz-head .pz-btn{flex:none; padding:1px 10px; font-size:11.5px}
.pz-head .pz-close{color:var(--term-dim)}
.pz-body{flex:1; min-height:0; overflow:auto; padding:10px 14px; scrollbar-width:thin}
.pz-body::-webkit-scrollbar{width:8px}
.pz-body::-webkit-scrollbar-thumb{background:var(--term-faint); border-radius:4px}
.pz-msg{color:var(--term-dim); font-style:italic; padding:6px 0}
.pz-msg[data-tone="error"]{color:var(--term-red); font-style:normal}
.pz-frame{display:block; width:100%; height:100%; min-height:280px; border:none; background:#fff; border-radius:6px}
.pz-img{display:block; max-width:100%; border-radius:6px}
.pz-code{max-height:none; height:auto}

/* ---- preview card: right of the sidebar, resizable divider, floatable ---- */
.term-pv-divider{flex:none; width:6px; cursor:col-resize; touch-action:none; background:transparent}
.term-pv-divider:hover{background:var(--term-border)}
.term-preview{
  flex:none; display:flex; flex-direction:column;
  background:var(--term-surface); border-left:1px solid var(--term-border);
  height:100%; min-width:0; min-height:0;
}
.term-preview[data-float="true"]{
  position:fixed; z-index:60; border:1px solid var(--term-border);
  border-radius:10px; box-shadow:0 14px 44px rgba(0,0,0,.5);
}
.term-root[data-term-mode="light"] .term-preview[data-float="true"]{box-shadow:0 14px 44px rgba(0,0,0,.25)}
.pv-header{
  flex:none; display:flex; align-items:center; gap:4px; height:34px;
  padding:0 6px 0 10px; border-bottom:1px solid var(--term-border);
  user-select:none; cursor:default;
}
.term-preview[data-float="true"] .pv-header{cursor:move}
.pv-title{color:var(--term-accent); font-weight:700; font-size:11.5px; letter-spacing:.08em; margin-right:8px}
.pv-tab{background:none; border:none; color:var(--term-dim); font:inherit; font-size:12px; cursor:pointer; padding:2px 8px; border-radius:4px}
.pv-tab:hover{color:var(--term-fg)}
.pv-tab[data-active="true"]{color:var(--term-accent); background:rgba(125,219,138,.08)}
.pv-spacer{flex:1}
.pv-float,.pv-close{background:none; border:none; color:var(--term-dim); font:inherit; font-size:12px; cursor:pointer; padding:2px 7px; border-radius:4px}
.pv-float:hover,.pv-close:hover{color:var(--term-fg); background:var(--term-border)}
.pv-body{flex:1; min-height:0; overflow:auto; padding:8px 10px; scrollbar-width:thin}
.pv-crumb{display:flex; flex-wrap:wrap; align-items:center; gap:2px; font-size:12px; color:var(--term-dim); margin-bottom:6px}
.pv-link{background:none; border:none; color:var(--term-cyan); font:inherit; font-size:12px; cursor:pointer; padding:1px 2px}
.pv-link:hover{text-decoration:underline}
.pv-sep{color:var(--term-faint)}
.pv-list{display:flex; flex-direction:column; gap:1px}
.pv-entry{
  display:flex; align-items:center; gap:8px; width:100%;
  background:none; border:none; color:var(--term-fg); font:inherit; font-size:12.5px;
  text-align:left; cursor:pointer; padding:3px 6px; border-radius:4px;
}
.pv-entry:hover{background:var(--term-border)}
.pv-entry .pv-glyph{flex:none; color:var(--term-faint)}
.pv-entry[data-type="dir"] .pv-glyph{color:var(--term-tool)}
.pv-entry[data-type="dir"] .pv-name{color:var(--term-cyan)}
.pv-name{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.pv-msg{color:var(--term-dim); font-size:12px; padding:8px 2px; white-space:pre-wrap}
.pv-msg[data-tone="error"]{color:var(--term-red)}
.pv-code{
  margin:0; padding:10px; background:var(--term-code-bg);
  border:1px solid var(--term-code-border); border-radius:6px;
  color:var(--term-code-fg); font:inherit; font-size:12px;
  white-space:pre-wrap; word-break:break-word;
}
.pv-frame{display:block; width:100%; height:100%; border:none; background:#fff}
.pv-img{max-width:100%; display:block}
.pv-corner{position:absolute; right:0; bottom:0; width:16px; height:16px; cursor:nwse-resize; touch-action:none}

/* top-bar session switcher */
.ts-nav{display:inline-flex; gap:2px; margin-left:4px}
.ts-navbtn{
  background:none; border:1px solid var(--term-border); color:var(--term-dim);
  font:inherit; font-size:11px; line-height:1; cursor:pointer;
  border-radius:4px; padding:2px 7px;
}
.ts-navbtn:hover{color:var(--term-accent); border-color:var(--term-accent)}

/* processing center (all-session pending approvals/questions) */
.pc-root{display:flex; flex-direction:column; gap:10px; padding:4px 0 12px}
.pc-head{color:var(--term-faint); font-size:11.5px; letter-spacing:.06em; user-select:none}
.pc-empty{color:var(--term-accent); padding:6px 2px}
.pc-sess{border:1px solid var(--term-border); border-radius:8px; overflow:hidden; background:var(--term-surface)}
.pc-sesshead{display:flex; align-items:center; gap:8px; padding:5px 10px; border-bottom:1px solid var(--term-border); background:var(--term-code-bg)}
.pc-sessname{color:var(--term-cyan); font-weight:600; font-size:12.5px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.pc-jump{
  flex:none; background:none; border:1px solid var(--term-border); color:var(--term-dim);
  font:inherit; font-size:11px; cursor:pointer; border-radius:4px; padding:1px 7px;
}
.pc-jump:hover{color:var(--term-accent); border-color:var(--term-accent)}
.pc-items{display:flex; flex-direction:column; gap:6px; padding:8px 10px}
.pc-trace{color:var(--term-faint); font-size:11px; padding:2px 2px 0}

/* pending bubble: entry pill at the input line's bottom-RIGHT, popover up */
.pb-root{position:absolute; right:12px; bottom:44px; z-index:55}
.pb-btn{
  display:inline-flex; align-items:center; gap:5px;
  background:var(--term-surface); border:1px solid var(--term-border);
  color:var(--term-dim); font:inherit; font-size:11.5px; cursor:pointer;
  border-radius:999px; padding:3px 10px; box-shadow:0 2px 10px rgba(0,0,0,.35);
}
.pb-root[data-open="true"] .pb-btn{border-color:var(--term-amber); color:var(--term-amber)}
.pb-btn[data-hot="true"]{color:var(--term-amber); border-color:var(--term-amber)}
.pb-btn:hover{border-color:var(--term-amber)}
.pb-backdrop{position:fixed; inset:0; z-index:53; background:transparent}
.pb-pop{
  position:absolute; right:0; bottom:38px; z-index:54;
  width:min(430px, calc(100vw - 24px)); max-height:60vh;
  display:flex; flex-direction:column;
  background:var(--term-surface); border:1px solid var(--term-border);
  border-radius:10px; box-shadow:0 14px 44px rgba(0,0,0,.5);
  overflow:hidden;
}
.term-root[data-term-mode="light"] .pb-pop{box-shadow:0 14px 44px rgba(0,0,0,.25)}
.pb-head{
  flex:none; display:flex; align-items:center; gap:10px;
  padding:6px 10px; border-bottom:1px solid var(--term-border);
  background:var(--term-code-bg);
}
.pb-title{color:var(--term-amber); font-size:12px; font-weight:700}
.pb-hint{flex:1; color:var(--term-faint); font-size:10.5px; text-align:right}
.pb-close{background:none; border:none; color:var(--term-dim); font:inherit; font-size:12px; cursor:pointer; padding:1px 6px; border-radius:4px}
.pb-close:hover{color:var(--term-fg); background:var(--term-border)}
.pb-body{flex:1; min-height:0; overflow-y:auto; padding:2px 10px 10px}

/* produced files + preview */
.td-file{display:flex; align-items:center; gap:6px; padding:2px 4px; border-radius:5px; min-width:0}
.td-file:hover{background:var(--term-code-bg)}
.td-file[data-active="true"]{background:var(--term-code-bg)}
.td-file .tf-glyph{flex:none}
.td-file .tf-name{flex:1; min-width:0; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--term-fg)}
.td-file .tf-name:hover{color:var(--term-accent); text-decoration:underline}
.td-file .tf-open{flex:none; padding:0 7px; font-size:12px}
.tf-pview{border:1px solid var(--term-border); border-radius:8px; margin:6px 0 2px; overflow:hidden; background:var(--term-bg)}
.tf-phead{display:flex; align-items:center; gap:8px; padding:5px 10px; border-bottom:1px solid var(--term-border); background:var(--term-surface)}
.tf-phead .tf-ptitle{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--term-cyan); font-size:12px}
.tf-phead .tf-mode{flex:none; padding:1px 10px}
.tf-frame{display:block; width:100%; height:340px; border:none; background:#fff}
.tf-code{
  display:block; margin:0; padding:8px 12px; max-height:340px; overflow:auto;
  font:12.5px/1.6 Consolas,monospace; color:var(--term-fg);
  white-space:pre; scrollbar-width:thin;
}
.tf-count{display:block; color:var(--term-faint); font-size:11px; margin-bottom:4px}
.tf-code .hl-com{color:var(--term-dim); font-style:italic}
.tf-code .hl-str{color:var(--term-accent)}
.tf-code .hl-num{color:var(--term-cyan)}
.tf-code .hl-kw{color:var(--term-purple); font-weight:700}
.td-sec{
  display:block; margin:12px 0 4px; padding-bottom:2px;
  color:var(--term-faint); font-size:10.5px; letter-spacing:.16em;
  text-transform:uppercase; border-bottom:1px solid var(--term-border);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
/* compact session header at the top of the sidebar */
.td-sesshead{
  display:block; padding:2px 0 6px; margin-bottom:2px;
  border-bottom:1px solid var(--term-border);
}
.td-sesshead .tsh-title{display:flex; align-items:center; gap:8px; min-width:0}
.td-sesshead .tsh-mark{flex:none; color:var(--term-accent); font-weight:700}
.td-sesshead .tsh-mark[data-live="true"]{color:var(--term-accent); text-shadow:0 0 6px var(--term-accent)}
.td-sesshead .tsh-name{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--term-fg); font-weight:600}
.td-sesshead .tsh-meta{color:var(--term-dim); font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px}
.td-row{display:flex; gap:8px; padding:1px 0; min-width:0}
.td-row .td-k{flex:none; min-width:62px; color:var(--term-faint)}
.td-row .td-v{color:var(--term-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.td-row .td-v[data-tone="accent"]{color:var(--term-accent)}
.td-row .td-v[data-tone="amber"]{color:var(--term-amber)}
.td-row .td-v[data-tone="red"]{color:var(--term-red)}
.td-todo{display:flex; gap:8px; padding:2px 0; min-width:0}
.td-todo .td-mark{flex:none; width:16px; color:var(--term-faint)}
.td-todo .td-text{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.td-todo[data-status="in_progress"] .td-mark{color:var(--term-accent)}
.td-todo[data-status="in_progress"] .td-text{color:var(--term-accent)}
.td-todo[data-status="completed"]{color:var(--term-faint); text-decoration:line-through}
.td-todo[data-status="pending"]{color:var(--term-dim)}
.td-empty{color:var(--term-faint); font-style:italic; padding:2px 0}
.td-pending{border:1px solid var(--term-border); border-radius:6px; padding:6px 8px; margin:4px 0; background:var(--term-code-bg)}
.td-pending .tp-title{color:var(--term-amber); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
.td-pending .tp-actions{display:flex; gap:6px; margin-top:6px}
.td-btn{
  flex:1; text-align:center; padding:2px 6px; cursor:pointer;
  border:1px solid var(--term-border); border-radius:5px;
  background:transparent; color:var(--term-dim); font:inherit; font-size:11.5px;
}
.td-btn:hover{background:var(--term-surface); color:var(--term-fg)}
.td-btn[data-ok="true"]{color:var(--term-accent)}
.td-btn[data-bad="true"]{color:var(--term-red)}
.td-session{display:flex; gap:4px; padding:2px 4px; border-radius:4px; cursor:pointer; min-width:0}
.td-session:hover{background:var(--term-code-bg)}
.td-session[data-current="true"]{color:var(--term-accent)}
.td-session .ts-guide{flex:none; color:var(--term-faint)}
.td-session .ts-name{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.td-bar{height:6px; border-radius:3px; background:var(--term-code-bg); overflow:hidden; margin:3px 0 4px}
.td-bar .td-fill{height:100%; background:var(--term-accent)}
.td-bar[data-hot="true"] .td-fill{background:var(--term-amber)}
.td-bar[data-danger="true"] .td-fill{background:var(--term-red)}
.term-line{white-space:pre-wrap; word-break:break-word; min-height:1.6em; padding:1px 0}
.term-line[data-tone="dim"]{color:var(--term-dim)}
.term-line[data-tone="faint"]{color:var(--term-faint)}
.term-line[data-tone="amber"]{color:var(--term-amber)}
.term-line[data-tone="red"]{color:var(--term-red)}
.term-line[data-tone="accent"]{color:var(--term-accent)}
.term-line[data-tone="cyan"]{color:var(--term-cyan)}
.term-line[data-tone="purple"]{color:var(--term-purple)}
.term-line[data-tone="tool"]{color:var(--term-tool)}
.term-prompt{color:var(--term-accent); font-weight:700}

/* ---- completed-turn marker ---- */
.term-turnend{
  display:flex; align-items:center; gap:10px;
  color:var(--term-faint); font-size:11.5px; margin:6px 0 10px; user-select:none;
}
.term-turnend::before,.term-turnend::after{content:"";flex:1;border-top:1px dotted var(--term-border)}
.term-turnend .te-ok{color:var(--term-accent); font-weight:700}

/* ---- turn separator (L0 structure) ---- */
.term-head{display:flex;align-items:center;gap:10px;margin:12px 0 6px;user-select:none}
.term-head::after{content:"";flex:1;border-top:1px dashed var(--term-border)}
.term-head .th-time{color:var(--term-faint);font-size:11.5px}
.term-head .th-role{color:var(--term-dim);font-size:11px;text-transform:uppercase;letter-spacing:.14em;font-weight:700}

/* ---- L1: user input block ---- */
.term-user{
  border-left:3px solid var(--term-accent);
  border-radius:0 8px 8px 0;
  padding:3px 12px; margin:4px 0;
  background:rgba(125,219,138,.06);
}
.term-root[data-term-mode="light"] .term-user{background:rgba(31,122,61,.07)}
.term-user .tu-prompt{color:var(--term-accent);font-weight:700;margin-right:10px}
.term-user .tu-text{color:var(--term-fg)}
.term-user[data-steer="true"]{border-left-color:var(--term-amber)}

/* ---- L2: assistant output ---- */
.term-assistant{padding:2px 0;margin:2px 0;white-space:pre-wrap}
.term-run{display:inline-block;animation:term-blink 1.06s steps(1) infinite;color:var(--term-accent)}
.term-interrupt{color:var(--term-amber)}
@keyframes term-blink{50%{opacity:0}}

/* collapsible reasoning: hidden behind a "thinking……" toggle by default */
.term-reason{margin:4px 0}
.term-reason .tr-toggle{
  background:none; border:none; padding:0; margin:0;
  color:var(--term-purple); font:inherit; cursor:pointer;
  opacity:.8; user-select:none;
}
.term-reason .tr-toggle:hover{opacity:1; text-decoration:underline}
.term-reason .tr-body{
  color:var(--term-purple); opacity:.85;
  border-left:1px solid var(--term-border);
  padding:2px 12px; margin:2px 0 2px 2px;
  white-space:pre-wrap;
}

/* code: fixed code color (green family) in both palettes */
.term-code{
  display:block; background:var(--term-code-bg);
  border:1px solid var(--term-code-border); border-radius:6px;
  padding:6px 12px; margin:6px 0;
  white-space:pre-wrap; word-break:break-word;
  color:var(--term-code-fg);
}

/* markdown rendering (prose blocks) */
.term-para{display:block;white-space:pre-wrap}
.term-h1{display:block;font-weight:700;font-size:1.18em;color:var(--term-accent);margin:10px 0 4px;white-space:pre-wrap}
.term-h2{display:block;font-weight:700;font-size:1.08em;margin:8px 0 3px;white-space:pre-wrap}
.term-h3{display:block;font-weight:700;margin:6px 0 2px;white-space:pre-wrap}
.term-hr{display:block;border-top:1px solid var(--term-border);margin:10px 0}
.term-quote{border-left:2px solid var(--term-border);padding:2px 14px;margin:6px 0;color:var(--term-dim);font-style:italic;white-space:pre-wrap}
.term-list{display:block;margin:6px 0;padding-left:2px}
.term-li{display:block;padding:1px 0 1px 18px;text-indent:-18px;white-space:pre-wrap}
.term-li .tl-bullet{color:var(--term-accent);margin-right:8px}
.term-table{display:block;margin:8px 0;border:1px solid var(--term-border);border-radius:6px;padding:6px 12px;white-space:pre;overflow-x:auto}
.term-table .trow{display:block}
.term-table .trow[data-head="true"]{font-weight:700;color:var(--term-accent)}
.ti-code{background:var(--term-code-bg);border:1px solid var(--term-code-border);border-radius:4px;padding:0 5px;font-size:.92em;color:var(--term-code-fg)}
.ti-link{color:var(--term-cyan)}
.ti-url{color:var(--term-faint);font-size:.9em}
.term-assistant em{font-style:italic}
.term-assistant strong{font-weight:700}

/* ---- L3: tool tree — fixed tool color, tinted unit; only errors break
 * the color discipline (red keeps its semantic meaning). ---- */
.term-tool{
  margin:4px 0 4px 4px; padding:3px 0 3px 10px;
  border-left:1px solid var(--term-tool);
  background:rgba(121,192,255,.04);
}
.term-root[data-term-mode="light"] .term-tool{background:rgba(15,95,138,.05)}
.term-tool[data-status="running"]{border-left-color:var(--term-cyan)}
.term-tool[data-status="error"]{border-left-color:var(--term-red)}
.term-tool .tt-glyph{color:var(--term-tool);margin-right:8px}
.term-tool .tt-name{color:var(--term-tool);font-weight:600}
.term-tool .tt-args{color:var(--term-dim)}
.term-tool .tt-meta{color:var(--term-faint);font-size:11.5px;margin-left:10px}
.term-tool .tt-status{display:block;margin:1px 0 1px 2px;color:var(--term-tool)}
.term-tool[data-status="error"] .tt-status{color:var(--term-red)}
.term-tool .tt-out{display:block;margin:2px 0 2px 4px;white-space:pre-wrap;word-break:break-word;padding-left:6px;border-left:1px solid var(--term-border);color:var(--term-dim)}

/* ---- L4: system notices + pending banners ---- */
.term-system{padding:1px 0;color:var(--term-dim)}
.term-system[data-tone="red"]{color:var(--term-red)}
.term-system[data-tone="amber"]{color:var(--term-amber)}
.term-system[data-tone="cyan"]{color:var(--term-cyan)}
.term-system[data-tone="purple"]{color:var(--term-purple)}
.term-system[data-tone="faint"]{color:var(--term-faint)}
.term-pending{
  border-left:3px solid var(--term-amber);
  border-radius:0 8px 8px 0;
  padding:3px 12px; margin:4px 0;
  background:rgba(227,179,65,.07);
}
.term-root[data-term-mode="light"] .term-pending{background:rgba(138,109,26,.08)}
.term-pending .tp-hint{display:block;color:var(--term-faint);font-size:11.5px}

/* command output dock: fixed-size area between scrollback and input bar */
.term-cmdlog{
  flex:none; max-height:150px; overflow-y:auto; overscroll-behavior:contain;
  background:var(--term-surface); border-top:1px solid var(--term-border);
  padding:4px 16px 6px; font-size:12.5px; line-height:1.55;
  scrollbar-width:thin;
}
.term-cmdlog::-webkit-scrollbar{width:8px}
.term-cmdlog::-webkit-scrollbar-thumb{background:var(--term-faint);border-radius:4px}
.term-cmdlog .tcl-head{color:var(--term-faint);font-size:11px;letter-spacing:.08em;margin-bottom:2px;user-select:none}
.term-cmdlog .tcl-x{color:var(--term-faint);font-size:11px;margin-left:6px}
.term-system[data-tone="fg"]{color:var(--term-fg)}

/* alert strips: red errors / amber warnings pinned above the log body */
.term-cmdlog .tcl-alert{
  display:flex; align-items:center; gap:10px;
  font-size:12px; padding:3px 10px; margin:2px 0 4px; border-radius:5px;
}
.term-cmdlog .tcl-alert .ta-text{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.term-cmdlog .tcl-alert .ta-hint{flex:none; color:var(--term-faint); font-size:11px}
.term-cmdlog .tcl-alert[data-kind="error"]{
  color:var(--term-red);
  background:rgba(255,123,114,.08);
  border-left:3px solid var(--term-red);
}
.term-cmdlog .tcl-alert[data-kind="warn"]{
  color:var(--term-amber);
  background:rgba(227,179,65,.08);
  border-left:3px solid var(--term-amber);
}
.term-root[data-term-mode="light"] .term-cmdlog .tcl-alert[data-kind="error"]{background:rgba(179,54,44,.08)}
.term-root[data-term-mode="light"] .term-cmdlog .tcl-alert[data-kind="warn"]{background:rgba(138,109,26,.09)}

/* local log caret + entries */
.term-caretline{border-top:1px dashed var(--term-border);margin:8px 0 4px}

/* prompt bar */
.term-inputbar{
  flex:none; display:flex; align-items:center; gap:8px;
  height:38px; padding:0 12px;
  background:var(--term-surface); border-top:1px solid var(--term-border);
}
.term-prefix{color:var(--term-accent); white-space:nowrap; user-select:none}
.term-prefix .tp-user{color:var(--term-fg); font-weight:700}
.term-prefix .tp-cwd{color:var(--term-cyan)}
.term-prefix .tp-spin{color:var(--term-accent); font-weight:700}
.term-field{
  flex:1; min-width:0; background:transparent; border:none; outline:none;
  color:var(--term-fg); caret-color:var(--term-caret);
  font:inherit; padding:0;
}
.term-hint{flex:none; color:var(--term-faint); font-size:11.5px; user-select:none}
`;

/** Tag id used both for injection and for the claim/cleanup pass. */
const TERMINAL_CSS_ID = "@dsh-local/ui-terminal/Terminal.css";
