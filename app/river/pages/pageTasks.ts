import { createCard, loadBoards, setCardOwner, setCardPages, type Board } from "@/lib/boardRepo";

/** The board a page "belongs" to: the one holding most of the tasks linked to it (else the first board). */
export function boardForPage(boards: Board[], pageId: string): Board | null {
  const counts = new Map<string, number>();
  for (const b of boards) for (const c of b.cols) for (const k of c.cards) if (k.pageIds.includes(pageId)) counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return boards.find((b) => b.id === best) ?? boards[0] ?? null;
}

/**
 * "Make task" from selected text: a new task on the page's board, assigned to
 * you and linked back to the page. Returns the board's name for the toast.
 */
export async function makeTaskFromPage(workspaceId: string, userId: string, pageId: string, text: string): Promise<string> {
  const boards = await loadBoards(workspaceId);
  const board = boardForPage(boards, pageId);
  if (!board) throw new Error("Create a board first, then tasks can be made from pages.");
  const column = board.cols.find((c) => !c.isCompleted) ?? board.cols[0];
  if (!column) throw new Error(`${board.name} has no stages yet.`);
  const title = text.replace(/\s+/g, " ").trim().slice(0, 200) || "Untitled";
  const card = await createCard(workspaceId, column.id, title);
  await setCardOwner(card.id, userId, true);
  await setCardPages(card.id, [pageId]);
  return board.name;
}
