# dsh-ui-terminal

[![CI](https://github.com/tyyiz/bonjourli/actions/workflows/ci.yml/badge.svg)](https://github.com/tyyiz/bonjourli/actions/workflows/ci.yml)

A CLI-style **terminal interface** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI. It shadows the built-in `root` slot (priority −1; the stock `AppFrame` registers at 0 and "lowest renders") with a full-screen command-line view over sessions, conversations, and tool activity — plus a workspace file preview card and a cross-session processing center.

The stock plugins and their services keep running underneath; the terminal is a presentation layer, not a fork.

## Preview

```
┌─────────────────────────────────────────────────────────┬──────────────┐
│ dsh▮terminal v0.5 · session 71c893cb ‹ › ⧉ · 标题 · idle │  preview     │
├─────────────────────────────────────────────────────────┤  目录 │ 内容  │
│ ── 14:02:31 ─ USER ───────────────────────              │  ⌂ / src      │
│ ┃ $ 帮我优化一下这个网页的布局                           │  ▸ node_modules│
│ ── 14:02:33 ─ ASSISTANT ────────────────────            │  · 高副低代.html│
│ 好的，我来分析当前结构…                                  │  ⛶ ✕          │
│ ▸ thinking……                                            │               │
│   └─ bash {"command":"ls"}                               │  <iframe /     │
│      ✓ done · 12ms                                      │   code view>   │
│      ┆ index.html  …                                    │               │
│ ────────────────────────────────────────                │               │
│ · command output · 3 lines — \clear clears              │               │
│ user@dsh:proj $ █                        (⚠ 2)          │               │
└─────────────────────────────────────────────────────────┴──────────────┘
        ↑ input bar always live        ↑ pending bubble (all sessions)
```

- **Terminal conversation view** — turn grouping, four-level hierarchy:
  - L1 user input (accent-bordered block) · L2 assistant output (markdown-rendered, collapsible `thinking……` reasoning, green code) · L3 tool tree (`→ bash {…}` / `✓ done · 1.2s` / nested output) · L4 system notices
- **Command-driven** — `\help`, `\new`, `\sessions`, `\open`, `\answer`, `\approve`, `\pending`, `\preview`, `\dir`, `\diag`, `\perf`, `\safe`, `\theme`, `\gui`, `\exit` …
- **Right preview card** — workspace file browser (目录) + source / web-page (iframe) / image preview; resizable via the divider, floatable (`⛶` drag + corner resize); fed by the host `/wsfiles` route with realpath traversal protection
- **Processing center bubble** — all sessions' pending approvals/questions aggregated (2.5 s poll), grouped per session with trace lines (tool · callId), one-click cross-session approve/decline/answer, anchored bottom-right as a popover
- **Always-live input bar** — panels and bubbles never replace the interface; `\exit` closes anything
- **Anti-freeze guard** — windowed model build (tail 200 nodes), per-block parse caps, render-time auto-downgrade to plain mode, heartbeat stall audit (`\perf`)
- Sessions live in the top bar (`‹ ›`), dark/light palettes (`\theme`)

## Install

Requirements: a running `dsh web` profile (`$DSH_HOME/profiles/web`).

```sh
# 1. add the package as a profile dependency (pnpm resolves git deps; the
#    prepare script builds lib/client.js automatically)
cd "$DSH_HOME/profiles/web"
pnpm add "git+https://github.com/tyyiz/bonjourli.git"

# 2. register the plugin row in $DSH_HOME/profiles/web/cordis.patch.yml:
# - insert:
#     - id: ui-terminal
#       name: '@dsh-local/ui-terminal'
#       inject: [webServer, workspaceRegistry]

# 3. restart the dsh server, open http://127.0.0.1:3080 and Ctrl+F5
```

The row's `inject` mounts the host half (the `/wsfiles` workspace-file route);
`webServer` and `workspaceRegistry` are provided by the web profile bundle.

## Usage

```
\help               show the command table
\new                start a new session
\sessions           list sessions          \open <index|id>   switch
\status / \state    session + snapshot info
\pending            toggle the pending bubble (all sessions)
\preview [path]     toggle preview card / open a file
\dir                toggle the file directory browser
\answer <n> <text>  answer pending question n
\approve / \decline allow / reject pending approval n
\cancel             cancel the running turn
\clear              clear scrollback + command dock
\diag               toggle the diagnostic panel
\perf               render/freeze audit    \safe [on|off]     plain mode
\theme [mode]       palette                \exit              close panels
\gui                leave for the stock interface (refresh to return)
```

Anything else typed is sent to the current session as a message
(`Enter` sends, `↑`/`↓` history, `Ctrl+C` clears the line).

## Development

```sh
node build.js          # concatenates src/* into lib/client.js (no toolchain)
npm i                  # dev deps: jsdom, react, react-dom, @deepseek-ai/dsh-client-web-react
npm test               # jsdom render/interaction suite, standalone:
                       # DSH_PROFILE_NM defaults to a DSH profile's node_modules;
                       # set it to "node_modules" to run against the local deps
```

While the dsh server runs, client-hmr polls the bundle — edit → `node build.js`
→ refresh is enough. Host-half changes (lib/index.js) need a server restart.

CI (`.github/workflows/ci.yml`) runs `npm ci` → `node build.js` → syntax
checks → `npm test` (with `DSH_PROFILE_NM=node_modules`) on every push.

### Structure

```
lib/index.js   host half: /wsfiles route (workspace files, traversal-safe)
lib/client.js  built browser bundle (GENERATED — do not edit)
build.js       tiny bundler over src/*.js
src/css.js     stylesheet: palettes + hierarchy + bubble/preview styles
src/util.js    pure helpers            src/guard.js  anti-freeze + audit
src/view.js    snapshot → structured document (turns, typed groups)
src/markdown.js  lightweight markdown renderer (block + inline)
src/commands.js  \command table and runner
src/components.js React surface (TerminalRoot, Scrollback, StatusBar,
                  PreviewCard, PendingBubble, ProcessingCenter, …)
src/preview.js workspace preview card    src/diag.js  diagnostics
src/plugin.js  inject/apply + root-slot mount
```

## AI-generated notice

This project was **written by an AI coding assistant** (a DeepSeek model running
inside DeepSeek Harness) in interactive sessions with the repository owner,
including feature design, implementation, debugging, and testing. Human review
was limited to usage feedback; the code has not been independently audited by
a professional security team.

Please treat it accordingly:

- **Purpose** — a personal-use UI layer for the owner's own DeepSeek Harness
  web GUI. It is not an official DeepSeek product, is not endorsed by
  DeepSeek, and is provided as-is.
- **Intended use** — this repository is designed to run **only on the owner's
  own computer** (the machine where the `dsh web` server runs and where the
  browser connects over loopback). Nothing in it calls third-party services:
  the bundle contains **zero external URLs** and exactly **one same-origin
  `fetch`** (the `/wsfiles` workspace-file route).
- **Before trusting it** — review `lib/index.js` (the only host-side surface)
  and the `src/` sources yourself. The test suite (`npm test`) documents
  expected behavior; it is not a security audit.
- **No guarantees** — no warranty, no support, no liability (see LICENSE).
  If you did not receive this repository from its owner, do not install it.

### Security review (performed 2026-08-15)

| Surface | Finding |
|---|---|
| Outbound network (browser bundle) | none — 0 external URLs; the only `fetch` targets the same-origin `/wsfiles?path=…` route |
| Dynamic code | none — no `eval`, no `new Function`, no remote script injection in the bundle |
| Host route (`/wsfiles`) | read-only (`GET`/`HEAD` only); every path resolved via `realpath` and must stay under the workspace root (`..`/symlink escapes → HTTP 400, verified); MIME table only, no directory writes |
| Browser storage | `localStorage` used for UI geometry only (`dsh.term.preview` — dock width / float rect); no session data, no credentials |
| Secrets | none embedded in source; no API keys, tokens, or passwords anywhere in the repo (scanned) |
| Runtime APIs used | only the standard DSH client services (`sessions`, `workspaces`, `theme`, `slots`) and the same-origin `/api/respond` approval flow — the same endpoints the stock GUI uses |
| Sandbox note | the preview card can READ workspace files through `/wsfiles` (read-only) and the processing center can APPROVE/DECLINE pending requests — these are the UI's features; if you do not want them, disable the plugin (below) |

Attack-surface summary: the only new host-side code is a read-only file
router confined to the workspace directory. There is no telemetry, no update
channel, no external resource loading, and nothing that writes outside the
workspace.

## Disable / uninstall

The UI can be removed at three levels, from quickest to most thorough.

### 1. Temporarily switch back to the stock interface (no uninstall)

- Type `\gui` in the terminal — the default DeepSeek Harness interface
  returns immediately (the terminal plugin stays installed).
- Refresh the page to re-enter the terminal.

### 2. Disable the plugin (keeps the files)

- Edit `$DSH_HOME/profiles/web/cordis.patch.yml` and **comment out** (or
  delete) the `ui-terminal` row:

  ```yaml
  # - insert:
  #     - id: ui-terminal
  #       name: '@dsh-local/ui-terminal'
  #       inject: [webServer, workspaceRegistry]
  ```

- Restart the dsh server (`dsh web`). The stock GUI returns; the plugin
  files stay in place so you can re-enable later by uncommenting.

### 3. Full uninstall (removes the files)

```sh
# a) remove the profile dependency
cd "$DSH_HOME/profiles/web"
pnpm remove @dsh-local/ui-terminal

# b) remove the row from $DSH_HOME/profiles/web/cordis.patch.yml
#    (the same block as in step 2)

# c) restart the dsh server
dsh web
```

### 4. Clean up browser-side leftovers (optional)

- `localStorage` keys written by the UI: `dsh.term.preview` (preview-card
  geometry). Remove them from the browser's site data for
  `http://127.0.0.1:3080` (DevTools → Application → Local Storage) or just
  clear site data.
- Hard-refresh (`Ctrl+F5`) once after uninstalling so the old bundle is
  dropped from the page cache.

After any of steps 2–4 the terminal is gone: the root slot falls back to the
stock `AppFrame`, no `/wsfiles` route is mounted, and no terminal code runs
in the page.

## License

MIT
