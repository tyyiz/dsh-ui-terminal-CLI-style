/**
 * Host half of the terminal plugin: mounts the /wsfiles route on the web
 * server, serving workspace files to the browser preview card.
 *
 *   GET /wsfiles?path=<rel|abs>   → directory: JSON listing {entries:[…]}
 *                                → file: content with a MIME by extension
 *
 * Safety: every request resolves through realpath and must stay under the
 * workspace root — `..` segments and symlink escapes are rejected. The
 * browser has no direct filesystem access; this route is the only door, and
 * it serves nothing but the workspace.
 */
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative } from "node:path";

/** Text/binary MIME table for the preview card. */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".py": "text/plain; charset=utf-8",
  ".sh": "text/plain; charset=utf-8",
  ".ps1": "text/plain; charset=utf-8",
  ".yaml": "text/plain; charset=utf-8",
  ".yml": "text/plain; charset=utf-8",
  ".toml": "text/plain; charset=utf-8",
  ".xml": "text/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm"
};

/** Resolve a request path under the workspace root; null when it escapes. */
async function resolveUnder(root, raw) {
  const candidate = raw === "" ? root : isAbsolute(raw) ? raw : join(root, raw);
  let norm;
  let rootReal;
  try {
    norm = await realpath(candidate);
    rootReal = await realpath(root);
  } catch {
    return null; // missing or unreadable
  }
  const rel = relative(rootReal, norm);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return norm;
}

/** The workspace root this deployment serves (first registered workspace). */
function workspaceRoot(ctx) {
  const list = ctx.workspaceRegistry.list();
  return list.length > 0 ? list[0].path : void 0;
}

/** One request: listing JSON for directories, file bytes otherwise. */
async function handleWsfiles(ctx, req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  const root = workspaceRoot(ctx);
  if (root === void 0) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("no workspace registered");
    return;
  }
  const raw = new URL(req.url ?? "/", "http://x").searchParams.get("path") ?? "";
  const resolved = await resolveUnder(root, raw);
  if (resolved === null) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("path escapes the workspace");
    return;
  }
  try {
    const info = await stat(resolved);
    if (info.isDirectory()) {
      const entries = await readdir(resolved, { withFileTypes: true });
      const items = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "dir" : entry.isFile() ? "file" : "other"
      }));
      items.sort((a, b) => a.type === b.type
        ? a.name.localeCompare(b.name, void 0, { numeric: true })
        : a.type === "dir" ? -1 : 1);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-cache"
      });
      res.end(JSON.stringify({ path: raw, entries: items }));
      return;
    }
    if (!info.isFile()) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(resolved);
    res.writeHead(200, {
      "content-type": MIME[extname(resolved).toLowerCase()] ?? "application/octet-stream",
      "content-length": body.length,
      "cache-control": "no-cache"
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(String(error));
  }
}

/** Cordis plugin: the loader hands all exports as the plugin object. */
export const inject = ["webServer", "workspaceRegistry"];

/** Mount the workspace file route for this fiber. */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/wsfiles",
    handler: (req, res) => handleWsfiles(ctx, req, res)
  }), "ui-terminal: /wsfiles route");
}
