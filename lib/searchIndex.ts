import type { DesignDoc } from "@/app/doc/data";
import { plainLinkedText } from "./pageLinks";
import { loadBoards } from "./boardRepo";
import { listCalendarEvents } from "./calendarEventsRepo";
import { listCanvases } from "./canvasRepo";
import { loadWorkspace } from "./docsRepo";

export type SearchKind = "page" | "canvas" | "board" | "card" | "event";

/** One thing the ⌘K palette can jump to. */
export interface SearchItem {
  key: string;
  kind: SearchKind;
  title: string;
  /** Shown to the right when the item matched on its title (section, board, date…). */
  hint: string;
  /** Extra text searched when the title doesn't match (page bodies, card descriptions). */
  body?: string;
  href: string;
}

/** Plain searchable text of a page: block text without inline HTML, plus table cells. */
export function pageBody(doc: DesignDoc): string {
  return doc.blocks
    .map((b) => b.text.replace(/<[^>]+>/g, "") + (b.rows ? " " + b.rows.flat().join(" ") : ""))
    .join("\n");
}

export function pageItems(docs: DesignDoc[]): SearchItem[] {
  return docs.map((d) => ({
    key: `page:${d.id}`,
    kind: "page",
    title: d.title || "Untitled page",
    hint: d.group,
    body: pageBody(d),
    href: `/doc?page=${d.id}`,
  }));
}

// A source that fails (e.g. a migration not yet applied) must not empty the palette.
const safely = <T>(p: Promise<T[]>): Promise<T[]> =>
  p.catch((e) => {
    console.error("Search index source failed", e);
    return [];
  });

/**
 * Everything searchable in a workspace. Pass `skipPages` when the caller
 * already has live page data (the doc editor) and supplies its own items.
 */
export async function loadSearchIndex(workspaceId: string, { skipPages = false } = {}): Promise<SearchItem[]> {
  const [docs, canvases, boards, events] = await Promise.all([
    skipPages ? Promise.resolve([]) : safely(loadWorkspace(workspaceId)),
    safely(listCanvases(workspaceId)),
    safely(loadBoards(workspaceId)),
    safely(listCalendarEvents(workspaceId)),
  ]);

  const items: SearchItem[] = pageItems(docs);
  for (const c of canvases) {
    items.push({ key: `canvas:${c.id}`, kind: "canvas", title: c.name || "Untitled canvas", hint: "Canvas", href: `/doc/canvas?c=${c.id}` });
  }
  for (const b of boards) {
    const board = encodeURIComponent(b.id);
    items.push({ key: `board:${b.id}`, kind: "board", title: b.name, hint: "Board", href: `/board?board=${board}` });
    for (const col of b.cols) {
      for (const card of col.cards) {
        items.push({
          key: `card:${card.id}`,
          kind: "card",
          title: card.title || "Untitled task",
          hint: `${b.name} · ${col.name}`,
          body: [card.sub ? plainLinkedText(card.sub) : "", card.tags.join(" ")].filter(Boolean).join("\n"),
          href: `/board?board=${board}&card=${encodeURIComponent(card.id)}`,
        });
      }
    }
  }
  for (const e of events) {
    items.push({
      key: `event:${e.id}`,
      kind: "event",
      title: e.title,
      hint: e.end_date && e.end_date !== e.date ? `${e.date} → ${e.end_date}` : e.date,
      body: [e.location, e.notes ? plainLinkedText(e.notes) : ""].filter(Boolean).join("\n"),
      href: `/calendar?date=${e.date}`,
    });
  }
  return items;
}
