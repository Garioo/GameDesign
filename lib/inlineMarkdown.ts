/* ---------------------------------------------------------------------------
 * Bold / italic in plain-text notes (calendar event notes): `**bold**` and
 * `_italic_`, toggled with ⌘B / ⌘I in a textarea and rendered when shown.
 * Notes stay plain text, so search and exports keep working, and nothing
 * here ever produces HTML — the renderer builds React elements from the tree.
 * ------------------------------------------------------------------------- */

export type MdNode = string | { bold: MdNode[] } | { italic: MdNode[] };

// **…** anywhere on one line; _…_ only at word boundaries, so snake_case and
// file_names_like_this stay plain.
const TOKEN_RE = /\*\*([^\n]+?)\*\*|(?<![\p{L}\p{N}_])_([^_\n]+?)_(?![\p{L}\p{N}_])/u;

/** Parse text into plain / bold / italic nodes (nesting allowed). */
export function parseInlineMarkdown(text: string): MdNode[] {
  const out: MdNode[] = [];
  let rest = text;
  while (rest) {
    const m = TOKEN_RE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    if (m[1] !== undefined) out.push({ bold: parseInlineMarkdown(m[1]) });
    else out.push({ italic: parseInlineMarkdown(m[2]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/** Plain text with the markers removed (for previews / search snippets). */
export function stripInlineMarkdown(text: string): string {
  const flat = (nodes: MdNode[]): string =>
    nodes.map((n) => (typeof n === "string" ? n : flat("bold" in n ? n.bold : n.italic))).join("");
  return flat(parseInlineMarkdown(text));
}

/**
 * ⌘B / ⌘I in a textarea: wrap the selection in `marker`, or unwrap it when
 * it's already wrapped (markers just outside or just inside the selection).
 * With nothing selected, inserts an empty pair and puts the caret inside.
 */
export function toggleInlineMarker(
  value: string,
  start: number,
  end: number,
  marker: "**" | "_",
): { value: string; start: number; end: number } {
  const len = marker.length;
  const selected = value.slice(start, end);
  // Markers just outside the selection: **|text|**
  if (value.slice(start - len, start) === marker && value.slice(end, end + len) === marker) {
    return { value: value.slice(0, start - len) + selected + value.slice(end + len), start: start - len, end: end - len };
  }
  // Markers inside the selection: |**text**|
  if (selected.length >= 2 * len && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(len, selected.length - len);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  return { value: value.slice(0, start) + marker + selected + marker + value.slice(end), start: start + len, end: end + len };
}
