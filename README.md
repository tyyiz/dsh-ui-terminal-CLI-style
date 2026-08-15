# dsh-ui-terminal

A CLI-style **terminal interface** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI. It shadows the built-in `root` slot (priority −1; the stock `AppFrame` registers at 0 and "lowest renders") with a full-screen command-line view over sessions, conversations, and tool activity — plus a workspace file preview card and a cross-session processing center.

The stock plugins and their services keep running underneath; the terminal is a presentation layer, not a fork.

## Features

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
pnpm add "git+https://github.com/<your-org>/dsh-ui-terminal.git"

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
npm i                  # installs jsdom for the tests
npm test               # jsdom render/interaction suite (paths at the top of
                       # tests/ point at a DSH profile's node_modules)
```

While the dsh server runs, client-hmr polls the bundle — edit → `node build.js`
→ refresh is enough. Host-half changes (lib/index.js) need a server restart.

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

## How to disable

Remove the `ui-terminal` row from `cordis.patch.yml` (and the dependency),
then restart the dsh server — the plugin roster is composed at boot.

## License

MIT
