// Shared helpers for inline @-mentions.
//
// A mention is serialized inside block HTML as:
//   <a data-mention="" data-page="<ref>" contenteditable="false" href="…">Title</a>
// where <ref> is a page id, "canvas:<id>" for canvas boards (the same
// convention pages.links uses), "section:<id>" for a sidebar section, and in
// plain-text links (lib/pageLinks.ts) also "board:<id>" / "task:<id>". The
// sanitizer in BlockEditor normalizes every mention to exactly that attribute
// set on each read/write; data-page is the
// source of truth and labels are re-derived from current titles for display.

export interface MentionTarget {
  ref: string; // page id, or "canvas:" / "section:" / "board:" / "task:" + id
  title: string;
  group: string; // section / board name (or "Canvas", "Section", "Board") shown in the autocomplete
  kind: "page" | "canvas" | "section" | "board" | "task";
}

// Page and canvas ids are DB-generated uuids, so anything else is rejected.
export const MENTION_REF_RE =
  /^(canvas:|section:|board:|task:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route for a mention ref. Always derived from data-page, never trusted. */
export function mentionHref(ref: string): string {
  if (ref.startsWith("canvas:")) return `/doc/canvas?c=${ref.slice("canvas:".length)}`;
  if (ref.startsWith("section:")) return `/doc?section=${ref.slice("section:".length)}`;
  if (ref.startsWith("board:")) return `/board?board=${ref.slice("board:".length)}`;
  // The board page finds the task's board itself and opens the task.
  if (ref.startsWith("task:")) return `/board?card=${ref.slice("task:".length)}`;
  return `/doc?page=${ref}`;
}

/** Attribute token for cheap "does this block mention X" substring scans. */
export function mentionToken(ref: string): string {
  return `data-page="${ref}"`;
}

const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Rewrite mention chip labels so they show the current titles. Pure string
 * work (no DOM) so it can run over every page's blocks cheaply; returns a
 * string equal to the input when nothing needed updating.
 */
export function relabelMentions(html: string, titles: Map<string, string>): string {
  if (!html.includes("data-mention")) return html;
  let out = html;
  for (const [ref, title] of titles) {
    const token = mentionToken(ref);
    if (!out.includes(token)) continue;
    // Refs are uuid-shaped (validated by the sanitizer), so the token is
    // regex-safe without escaping.
    const re = new RegExp(`(<a[^>]*${token}[^>]*>)[^<]*(</a>)`, "g");
    const label = escapeText(title);
    out = out.replace(re, (_, open: string, close: string) => open + label + close);
  }
  return out === html ? html : out;
}

/** Flatten a block's inline HTML to plain text (for backlink snippets). */
export function stripInlineHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
