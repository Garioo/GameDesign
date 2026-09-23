/* ---------------------------------------------------------------------------
 * Copying several page blocks at once (app/doc/BlockEditor.tsx block
 * selection). The clipboard gets:
 *   text/plain  Markdown-ish text, for any app
 *   text/html   semantic HTML (headings, lists, tables) for rich editors, on a
 *               wrapper carrying the blocks themselves as JSON so pasting back
 *               into a page recreates them exactly (types, to-dos, tables…).
 * ------------------------------------------------------------------------- */

import type { Block, BlockType } from "@/app/doc/data";

const BLOCK_TYPES: BlockType[] = [
  "text", "h2", "h3", "bullet", "numbered", "todo", "quote", "callout",
  "divider", "table", "image", "script", "curve", "googleDrive",
];
const MARKER = "data-foundry-blocks";

/** Inline block HTML → plain text (keeps line breaks, decodes entities). */
function inlineText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Markdown-ish plain text, one block per line (numbered lists count up). */
export function blocksToPlainText(blocks: Block[]): string {
  let n = 0;
  return blocks
    .map((b) => {
      n = b.type === "numbered" ? n + 1 : 0;
      const text = inlineText(b.text ?? "");
      switch (b.type) {
        case "h2": return `## ${text}`;
        case "h3": return `### ${text}`;
        case "bullet": return `- ${text}`;
        case "numbered": return `${n}. ${text}`;
        case "todo": return `- [${b.checked ? "x" : " "}] ${text}`;
        case "quote": return `> ${text}`;
        case "divider": return "---";
        case "table": return (b.rows ?? []).map((r) => r.join("\t")).join("\n");
        case "image": return b.src && !b.src.startsWith("data:") ? b.src : text;
        case "script": return b.path ?? "";
        default: return text;
      }
    })
    .join("\n");
}

/** Semantic HTML for other editors, wrapped with the blocks as JSON for pasting back. */
export function blocksToHtml(blocks: Block[]): string {
  const parts: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) parts.push(`</${list}>`);
    list = null;
  };
  for (const b of blocks) {
    const inner = b.text ?? "";
    const want = b.type === "bullet" || b.type === "todo" ? "ul" : b.type === "numbered" ? "ol" : null;
    if (want !== list) {
      closeList();
      if (want) parts.push(`<${want}>`);
      list = want;
    }
    switch (b.type) {
      case "h2": parts.push(`<h2>${inner}</h2>`); break;
      case "h3": parts.push(`<h3>${inner}</h3>`); break;
      case "bullet":
      case "numbered": parts.push(`<li>${inner}</li>`); break;
      case "todo": parts.push(`<li>${b.checked ? "☑" : "☐"} ${inner}</li>`); break;
      case "quote": parts.push(`<blockquote>${inner}</blockquote>`); break;
      case "divider": parts.push("<hr>"); break;
      case "table":
        parts.push(
          "<table>" +
            (b.rows ?? []).map((r, i) => "<tr>" + r.map((c) => (i === 0 ? `<th>${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`)).join("") + "</tr>").join("") +
            "</table>",
        );
        break;
      case "image": if (b.src) parts.push(`<p><img src="${escapeHtml(b.src)}" alt="${escapeHtml(inlineText(inner))}"></p>`); break;
      default: parts.push(`<p>${inner}</p>`);
    }
  }
  closeList();
  const payload = encodeURIComponent(JSON.stringify(blocks.map(({ id: _id, ...rest }) => rest)));
  return `<div ${MARKER}="${payload}">${parts.join("")}</div>`;
}

/**
 * Blocks copied from a page, if this clipboard HTML carries them (without
 * ids — the caller assigns fresh ones). Anything malformed returns null.
 */
export function parseCopiedBlocks(html: string): Omit<Block, "id">[] | null {
  const m = html.match(new RegExp(`${MARKER}="([^"]+)"`));
  if (!m) return null;
  try {
    const data: unknown = JSON.parse(decodeURIComponent(m[1]));
    if (!Array.isArray(data) || data.length === 0) return null;
    const out: Omit<Block, "id">[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") return null;
      const b = item as Record<string, unknown>;
      if (!BLOCK_TYPES.includes(b.type as BlockType) || typeof (b.text ?? "") !== "string") return null;
      out.push({ ...(b as Omit<Block, "id">), text: (b.text as string) ?? "" });
    }
    return out;
  } catch {
    return null;
  }
}
