/**
 * Small pure helpers shared by the view model and the command runner.
 * No React, no cordis: plain functions over plain data.
 */

/** "HH:MM:SS" from an epoch-ms timestamp (event times are ms since epoch). */
function fmtTime(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Live wall clock for the status bar. */
function wallClock() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Short stable tail of a long id ("session-14a862c2-…" → last 8 chars). */
function shortId(id) {
  if (typeof id !== "string" || id === "") return "—";
  return id.slice(-8);
}

/** Truncate text by characters (code points), appending an ellipsis marker. */
function truncate(text, max) {
  if (typeof text !== "string") return text;
  const chars = [...text];
  if (chars.length <= max) return text;
  return `${chars.slice(0, max).join("")}… [truncated]`;
}

/** Flatten a message content part list to plain text; non-text parts become markers. */
function textOfParts(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (part === null || typeof part !== "object") return String(part ?? "");
      if (part.type === "text") return part.text ?? "";
      if (part.type === "image") return part.name ? `[image: ${part.name}]` : "[image]";
      return `[${part.type ?? "part"}]`;
    })
    .join("");
}

/** Compact single-line rendering of a tool-call argument payload. */
function jsonArgs(argsRaw) {
  if (typeof argsRaw !== "string" || argsRaw === "") return "";
  try {
    const value = JSON.parse(argsRaw);
    const text = JSON.stringify(value);
    return text.length > 160 ? `${text.slice(0, 160)}…` : text;
  } catch {
    const flat = argsRaw.replace(/\s+/g, " ").trim();
    return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
  }
}

/** Tool-result payload → text (defensive against every wire shape seen:
 * string, array of {type:"text"} parts, {text}, {content}, or anything). */
function textOfToolResult(node) {
  const content = node?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part !== null && typeof part === "object") {
          if (typeof part.text === "string") return part.text;
          if (typeof part.content === "string") return part.content;
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  if (content !== null && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (typeof content.content === "string") return content.content;
    if (Array.isArray(content.content)) return textOfToolResult({ content: content.content });
  }
  if (content === void 0) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

/** Title for a tool-result line: prefer the correlated call name, else the call id. */
function toolResultName(node) {
  if (node?.call?.name) return node.call.name;
  if (typeof node?.callId === "string" && node.callId !== "") return node.callId;
  return "tool";
}

/** Match a \answer value against a question's options; returns the value to send. */
function resolveAnswer(question, raw) {
  const options = Array.isArray(question.options) ? question.options : [];
  const wanted = String(raw).trim().toLowerCase();
  if (wanted === "") return { selected: [], custom: String(raw).trim() };
  for (const option of options) {
    const label = String(option?.label ?? "").toLowerCase();
    const value = String(option?.value ?? option?.label ?? "");
    if (label === wanted || value === wanted) {
      return { selected: [value], custom: "" };
    }
  }
  return { selected: [], custom: String(raw).trim() };
}

/** Base-name of a path for the prompt prefix ("C:\\Users\\x\\proj" → "proj"). */
function cwdTail(cwd) {
  if (typeof cwd !== "string" || cwd === "") return "";
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : cwd;
}
