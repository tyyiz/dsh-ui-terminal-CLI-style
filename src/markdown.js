/**
 * Lightweight Markdown renderer for assistant/user prose blocks.
 *
 * The browser bundle can only import the platform seed modules (no external
 * libraries), so this is a small self-contained parser: a block pass
 * (fenced code, headings, rules, quotes, lists, tables, paragraphs) plus an
 * inline pass (code spans, bold, italic, strikethrough, links). Output is
 * React nodes styled by the terminal stylesheet.
 *
 * Scope rule: markdown belongs to prose — tool output and system lines stay
 * verbatim.
 */

/** Display width: CJK and wide glyphs count as two columns. */
function charWidth(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x1100 && code <= 0x115f) return 2;   // Hangul Jamo
  if (code >= 0x2e80 && code <= 0xa4cf) return 2;   // CJK, Yi
  if (code >= 0xac00 && code <= 0xd7a3) return 2;   // Hangul syllables
  if (code >= 0xf900 && code <= 0xfaff) return 2;   // CJK compat
  if (code >= 0xfe10 && code <= 0xfe6f) return 2;   // vertical forms
  if (code >= 0xff00 && code <= 0xff60) return 2;   // fullwidth forms
  if (code >= 0xffe0 && code <= 0xffe6) return 2;   // fullwidth signs
  return 1;
}
function dispWidth(text) {
  let width = 0;
  for (const ch of String(text)) width += charWidth(ch);
  return width;
}

/** Inline token source (no flags): code, bold, strike, italic (incl.
 * underscore form), links. Ordered so the strongest delimiters win.
 * Instances are created per call — a shared /g regex would let recursion
 * reset lastIndex mid-scan and loop forever (browser freeze, heap OOM). */
const INLINE_SOURCE = "(`[^`\\n]+`)|(\\*\\*[^*\\n]+\\*\\*)|(__[^_\\n]+__)|(~~[^~\\n]+~~)|(\\*[^*\\s][^*\\n]*\\*)|(?<![A-Za-z0-9_])_([^_\\n]+)_(?![A-Za-z0-9_])|(\\[[^\\]\\n]+\\]\\([^)\\n]+\\))";

/** Inline pass: one text run → mixed text / styled span nodes. */
function renderInline(text, keyPrefix) {
  const re = new RegExp(INLINE_SOURCE, "g");
  const nodes = [];
  let last = 0;
  let seq = 0;
  let match;
  let guard = 0;
  while ((match = re.exec(text)) !== null) {
    // Belt and braces: the scan must always advance, or something is
    // pathological (zero-length match / stuck lastIndex) — stop instead of
    // freezing the tab.
    if (match.index < last || match[0].length === 0 || ++guard > 100000) break;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}i${seq++}`;
    if (token.startsWith("`")) {
      nodes.push(h("code", { className: "ti-code", key }, token.slice(1, -1)));
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(h("strong", { key }, renderInline(token.slice(2, -2), key)));
    } else if (token.startsWith("~~")) {
      nodes.push(h("s", { key }, renderInline(token.slice(2, -2), key)));
    } else if (token.startsWith("[")) {
      const inner = token.slice(1, -1);
      const cut = inner.lastIndexOf("](");
      const label = inner.slice(0, cut);
      const url = inner.slice(cut + 2);
      nodes.push(h("span", { className: "ti-link", key }, [
        label,
        h("span", { className: "ti-url", key: "u" }, ` <${url}>`)
      ]));
    } else {
      nodes.push(h("em", { key }, renderInline(token.slice(1, -1), key)));
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Does this line start a non-paragraph block? (used by the paragraph loop) */
function isBlockStart(line) {
  return /^\s*(```|~~~)/u.test(line)
    || /^\s*#{1,6}\s+/u.test(line)
    || /^\s*>\s?/u.test(line)
    || /^\s*[-*+]\s+/u.test(line)
    || /^\s*\d+[.)]\s+/u.test(line)
    || /^\s*\|.*\|\s*$/u.test(line)
    || /^\s*([-*_])\s*(\1\s*){2,}\s*$/u.test(line);
}

/** Block pass: split a prose string into typed blocks. */
function splitBlocks(text) {
  const lines = String(text).split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)\s*([\w+-]*)\s*$/u.exec(line);
    if (fence) {
      const close = fence[1];
      const content = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s*${close}\\s*$`).test(lines[i])) {
        content.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ type: "code", text: content.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }
    if (/^\s*([-*_])\s*(\1\s*){2,}\s*$/u.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }
    if (/^\s*>\s?/u.test(line)) {
      const content = [];
      while (i < lines.length && /^\s*>\s?/u.test(lines[i])) {
        content.push(lines[i].replace(/^\s*>\s?/u, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: content.join("\n") });
      continue;
    }
    if (/^\s*[-*+]\s+/u.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/u.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/u, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/u.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/u.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/u, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }
    if (/^\s*\|.*\|\s*$/u.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/u.test(lines[i])) {
        rows.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    const content = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      content.push(lines[i]);
      i += 1;
    }
    if (content.length > 0) blocks.push({ type: "para", text: content.join("\n") });
    else i += 1; // blank line
  }
  return blocks;
}

/** Monospace table: cells padded to the widest column, │ separators. */
function renderTable(rows, key) {
  const split = (line) => {
    let l = line.trim();
    if (l.startsWith("|")) l = l.slice(1);
    if (l.endsWith("|")) l = l.slice(0, -1);
    return l.split("|").map((cell) => cell.trim());
  };
  const parsed = rows.map(split);
  const isSep = (cells) => cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/u.test(cell));
  const sepIndex = parsed.findIndex(isSep);
  const head = sepIndex === -1 ? null : parsed[0];
  const body = parsed.filter((row, index) => index !== sepIndex && row !== parsed[0]);
  const all = head ? [head, ...body] : parsed.filter((row) => !isSep(row));
  const colCount = Math.max(1, ...all.map((row) => row.length));
  const widths = [];
  for (let col = 0; col < colCount; col += 1) {
    widths[col] = Math.max(...all.map((row) => dispWidth(row[col] ?? "")));
  }
  return h("div", { className: "term-table", key },
    all.map((row, index) => h("div", {
      className: "trow",
      "data-head": head !== null && index === 0 ? "true" : void 0,
      key: index
    }, `│ ${row.map((cell, col) => `${cell}${" ".repeat(widths[col] - dispWidth(cell))}`).join(" │ ")} │`)));
}

/** One block → node(s). */
function renderBlock(block, key) {
  switch (block.type) {
    case "code":
      return h("span", { className: "term-code", key }, block.text);
    case "heading": {
      const cls = block.level <= 1 ? "term-h1" : block.level <= 3 ? "term-h2" : "term-h3";
      return h("div", { className: cls, key }, renderInline(block.text, key));
    }
    case "hr":
      return h("div", { className: "term-hr", key });
    case "quote":
      return h("div", { className: "term-quote", key }, renderInline(block.text, key));
    case "list":
      return h("div", { className: "term-list", key },
        block.items.map((item, index) => h("div", { className: "term-li", key: index }, [
          h("span", { className: "tl-bullet", key: "b" }, block.ordered ? `${index + 1}.` : "•"),
          ...renderInline(item, `${key}l${index}`)
        ])));
    case "table":
      return renderTable(block.rows, key);
    default:
      return h("div", { className: "term-para", key }, renderInline(block.text, key));
  }
}

/**
 * Render a prose string as React nodes.
 * Bounded: text longer than the parse cap renders as raw truncated text
 * (no parsing), and every loop carries iteration guards — pathological
 * content can never freeze the page.
 * @returns inline nodes for a single paragraph (plain text stays inline),
 *          block nodes for structured content, or null for empty input.
 */
function renderMarkdown(text, keyPrefix) {
  if (typeof text !== "string" || text === "") return null;
  if (text.length > LIMITS.textParseCap) {
    return [h("div", { className: "term-para", key: `${keyPrefix}cap` }, truncate(text, LIMITS.textParseCap))];
  }
  const blocks = splitBlocks(text);
  if (blocks.length === 0) return null;
  if (blocks.length === 1 && blocks[0].type === "para") {
    return renderInline(blocks[0].text, keyPrefix);
  }
  return blocks.map((block, index) => renderBlock(block, `${keyPrefix}b${index}`));
}
