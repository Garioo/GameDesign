/* ---------------------------------------------------------------------------
 * Word-level diff for the page edit history: which words were removed and
 * which were added between two versions of a block's text. Plain LCS over
 * word/space tokens; very long texts fall back to "all removed, all added"
 * instead of building a huge table.
 * ------------------------------------------------------------------------- */

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

const MAX_CELLS = 250_000;

const tokenize = (s: string): string[] => s.match(/\s+|[^\s]+/g) ?? [];

/** Merge neighbouring parts of the same kind. */
function push(out: DiffPart[], kind: DiffPart["kind"], text: string) {
  const last = out[out.length - 1];
  if (last?.kind === kind) last.text += text;
  else out.push({ kind, text });
}

export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const out: DiffPart[] = [];
  if (a.length * b.length > MAX_CELLS) {
    if (before) out.push({ kind: "removed", text: before });
    if (after) out.push({ kind: "added", text: after });
    return out;
  }
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const w = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(out, "same", a[i]);
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      push(out, "removed", a[i++]);
    } else {
      push(out, "added", b[j++]);
    }
  }
  while (i < a.length) push(out, "removed", a[i++]);
  while (j < b.length) push(out, "added", b[j++]);
  return out;
}

/** Block text is stored as sanitized HTML; history shows it as plain text. */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n+$/, "");
}
