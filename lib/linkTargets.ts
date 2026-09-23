/* ---------------------------------------------------------------------------
 * Everything a plain-text field can link to with [[ / @ (lib/pageLinks.ts):
 * pages, sections, canvases, boards and tasks, as MentionTargets.
 * ------------------------------------------------------------------------- */

import type { MentionTarget } from "@/app/doc/mentions";
import type { Board } from "./boardRepo";
import { loadBoards } from "./boardRepo";
import { listCanvases } from "./canvasRepo";
import { listPageTargets, listSections } from "./docsRepo";

/** Boards and their tasks as link targets (task group = its board's name). */
export function boardLinkTargets(boards: Board[]): MentionTarget[] {
  return [
    ...boards.map((b): MentionTarget => ({ ref: `board:${b.id}`, title: b.name, group: "Board", kind: "board" })),
    ...boards.flatMap((b) =>
      b.cols.flatMap((c) =>
        c.cards.map((k): MentionTarget => ({ ref: `task:${k.id}`, title: k.title || "Untitled task", group: b.name, kind: "task" })),
      ),
    ),
  ];
}

/**
 * All link targets in a workspace. Pass boards you already have loaded to
 * skip fetching them again. A part that fails to load is left out.
 */
export async function loadLinkTargets(workspaceId: string, boards?: Board[]): Promise<MentionTarget[]> {
  const [pages, sections, canvases, loadedBoards] = await Promise.all([
    listPageTargets(workspaceId).catch(() => []),
    listSections(workspaceId).catch(() => []),
    listCanvases(workspaceId).catch(() => []),
    boards ? Promise.resolve(boards) : loadBoards(workspaceId).catch(() => [] as Board[]),
  ]);
  return [
    ...pages.map((p): MentionTarget => ({ ref: p.id, title: p.title, group: p.group, kind: "page" })),
    ...sections.map((s): MentionTarget => ({ ref: `section:${s.id}`, title: s.name, group: "Section", kind: "section" })),
    ...canvases.map((c): MentionTarget => ({ ref: `canvas:${c.id}`, title: c.name, group: "Canvas", kind: "canvas" })),
    ...boardLinkTargets(loadedBoards),
  ];
}
