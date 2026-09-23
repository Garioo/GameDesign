/* ---------------------------------------------------------------------------
 * Links to pages and canvases inside plain-text fields (board task
 * descriptions). Stored inline as `[[Title]](<ref>)`, where <ref> is a page
 * id or "canvas:<id>" — the same refs page mentions use (app/doc/mentions.ts).
 * While editing, the text box shows just `[[Title]]`; the ids are kept aside
 * and put back on save (decodePageLinksForEditing / encodeEditedPageLinks).
 * ------------------------------------------------------------------------- */

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const pageLinkRe = () => new RegExp(`\\[\\[([^\\]\\n]+)\\]\\]\\(((?:canvas:)?${UUID})\\)`, "g");

export interface PageLink {
  title: string;
  ref: string;
}

const cleanTitle = (title: string) => title.replace(/[[\]\n]/g, "").trim() || "Untitled";

export function encodePageLink(title: string, ref: string): string {
  return `[[${cleanTitle(title)}]](${ref})`;
}

export interface PageLinkSegment {
  text: string;
  link?: PageLink;
}

/** Split stored text into plain-text and link segments for rendering. */
export function splitPageLinks(text: string): PageLinkSegment[] {
  const out: PageLinkSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(pageLinkRe())) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: m[1], link: { title: m[1], ref: m[2] } });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Stored text with each link reduced to its title (card previews, search, copy). */
export function stripPageLinks(text: string): string {
  return text.replace(pageLinkRe(), (_m, title: string) => title);
}

/** What the text box shows: `[[Title]]`, plus the links it stood for. */
export function decodePageLinksForEditing(text: string): { text: string; links: PageLink[] } {
  const links: PageLink[] = [];
  const shown = text.replace(pageLinkRe(), (_m, title: string, ref: string) => {
    links.push({ title, ref });
    return `[[${title}]]`;
  });
  return { text: shown, links };
}

/**
 * The inverse of decodePageLinksForEditing: each `[[Title]]` with a known
 * link gets its ref back. A `[[Title]]` nobody picked stays plain text.
 */
export function encodeEditedPageLinks(text: string, links: PageLink[]): string {
  const byTitle = new Map<string, string>();
  for (const l of links) byTitle.set(cleanTitle(l.title), l.ref);
  return text.replace(/\[\[([^\]\n]+)\]\](?!\()/g, (whole, title: string) => {
    const ref = byTitle.get(title);
    return ref ? encodePageLink(title, ref) : whole;
  });
}
