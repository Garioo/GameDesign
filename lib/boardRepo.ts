import { supabase } from "./supabase";
import { loadSchedule, mutateSchedule } from './ganttRepo';
import { cleanText, LIMITS } from "./validate";

/* ---------------------------------------------------------------------------
 * Boards — kanban boards › columns › cards, persisted per workspace with the
 * same RLS pattern as canvases. The page subscribes to postgres_changes on
 * the three tables and refetches via loadBoards(); writes here are simple
 * row-level CRUD so concurrent edits from teammates merge naturally.
 * ------------------------------------------------------------------------- */

export interface BoardCard {
  id: string;
  title: string;
  sub: string;
  kind: string;
  categoryId?: string | null;
  tags: string[];
  priority: string | null;
  ownerIds: string[];
  canvasId?: string | null;
  /** Legacy per-task deadline, kept only so a board's automatic end date can still be inferred from old data (see automaticBoardEndDate). Tasks no longer set or edit this. */
  deadline?: string | null;
  columnId?: string;
  parentId?: string | null;
  timelinePosition?: number;
  dragging?: boolean;
}

export interface BoardColumn {
  isCompleted?: boolean;
  id: string;
  name: string;
  color: string;
  cards: BoardCard[];
}

export interface Board {
  id: string;
  name: string;
  color: string;
  /** Manual override for the board's end date; null means "automatic" (see boardEndDate). */
  endDateOverride: string | null;
  cols: BoardColumn[];
}

/** The board's own inferred finish date: the latest deadline among its tasks, or null with none set. */
export function automaticBoardEndDate(board: Pick<Board, "cols">): string | null {
  const deadlines = board.cols.flatMap((col) => col.cards.map((card) => card.deadline)).filter((d): d is string => !!d);
  return deadlines.length ? deadlines.reduce((latest, d) => (d > latest ? d : latest)) : null;
}

/** The end date to show for a board: its manual override if set, otherwise the automatic one. */
export function boardEndDate(board: Board): string | null {
  return board.endDateOverride ?? automaticBoardEndDate(board);
}

interface CardRow {
  id: string;
  column_id: string;
  parent_id?: string | null;
  timeline_position?: number;
  title: string;
  sub: string;
  kind: string;
  category_id?: string | null;
  tags: string[] | null;
  priority: string | null;
  owners: string[] | null;
  canvas_id?: string | null;
  deadline: string | null;
  position: number;
}

/** Load every board in the workspace, columns and cards nested and ordered. */
export async function loadBoards(workspaceId: string): Promise<Board[]> {
  const [boardsRes, colsRes, cardsRes] = await Promise.all([
    supabase
      .from("boards")
      .select("*")
      .eq("project_id", workspaceId)
      .order("position", { ascending: true }),
    supabase
      .from("board_columns")
      .select("*")
      .eq("project_id", workspaceId)
      .order("position", { ascending: true }),
    supabase
      .from("board_cards")
      .select("*")
      .eq("project_id", workspaceId)
      .order("position", { ascending: true }),
  ]);

  for (const result of [boardsRes, colsRes, cardsRes]) {
    if (result.error) throw new Error(result.error.message);
  }

  const cardsByCol = new Map<string, BoardCard[]>();
  for (const r of (cardsRes.data ?? []) as CardRow[]) {
    const card: BoardCard = {
      id: r.id,
      title: r.title,
      sub: r.sub,
      kind: r.kind,
      categoryId: r.category_id ?? null,
      tags: r.tags ?? [],
      priority: r.priority,
      ownerIds: r.owners ?? [],
      canvasId: r.canvas_id,
      deadline: r.deadline,
      columnId: r.column_id,
      parentId: r.parent_id ?? null,
      timelinePosition: r.timeline_position,
    };
    (cardsByCol.get(r.column_id) ?? cardsByCol.set(r.column_id, []).get(r.column_id)!).push(card);
  }

  const colsByBoard = new Map<string, BoardColumn[]>();
  for (const r of (colsRes.data ?? []) as { id: string; board_id: string; name: string; color: string; is_completed?: boolean }[]) {
    const col: BoardColumn = { id: r.id, name: r.name, color: r.color, isCompleted: r.is_completed, cards: cardsByCol.get(r.id) ?? [] };
    (colsByBoard.get(r.board_id) ?? colsByBoard.set(r.board_id, []).get(r.board_id)!).push(col);
  }

  return ((boardsRes.data ?? []) as { id: string; name: string; color: string; end_date?: string | null }[]).map((b) => ({
    id: b.id,
    name: b.name,
    color: b.color,
    endDateOverride: b.end_date ?? null,
    cols: colsByBoard.get(b.id) ?? [],
  }));
}

/** Create a board only with an explicitly supplied workflow. */
export async function createBoard(workspaceId:string,name:string,stages:import('./stagesRepo').StageDraft[]):Promise<Board>{
  const {saveBoardStages}=await import('./stagesRepo');
  const id=await saveBoardStages(workspaceId,null,null,name,stages);
  const board=(await loadBoards(workspaceId)).find(b=>b.id===id);
  if(!board)throw new Error('Board was created but could not be loaded. Refresh to retry.');
  return board;
}

/** Duplicate a board: its stages and every task (hierarchy and internal dependencies included).
 *  Canvas links and milestones are intentionally not copied — see migrate-board-copy.sql. */
export async function copyBoard(workspaceId: string, boardId: string): Promise<Board> {
  const { data, error } = await supabase.rpc("copy_board", { p_project: workspaceId, p_board: boardId });
  if (error) throw new Error(error.code === "PGRST202"
    ? "Copying boards needs a database update. Apply the board-copy migration in Supabase."
    : error.message);
  const board = (await loadBoards(workspaceId)).find(b => b.id === data);
  if (!board) throw new Error("Board was copied but could not be loaded. Refresh to retry.");
  return board;
}

/** Set (or, with null, clear) a manual override for the board's end date; clearing reverts to the automatic latest-deadline date. */
export async function updateBoardEndDate(id: string, date: string | null): Promise<void> {
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a valid end date.");
  const { error } = await supabase.from("boards").update({ end_date: date }).eq("id", id).select("id").single();
  if (error) throw new Error(error.code === "PGRST204" || error.code === "42703"
    ? "The board end date needs a database update. Apply the board-end-date migration in Supabase."
    : error.message);
}

/** Append a column to a board.
export async function createColumn(
  workspaceId: string,
  boardId: string,
  name: string,
  color = "#a59a8c",
): Promise<BoardColumn> {
  const clean = cleanText(name, LIMITS.name, "Column name") || "Untitled column";
  const { data: maxRow } = await supabase
    .from("board_columns")
    .select("position")
    .eq("board_id", boardId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((maxRow?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("board_columns")
    .insert({ board_id: boardId, project_id: workspaceId, name: clean, color, position })
    .select("id, name, color")
    .single();
  if (error || !data) throw new Error(`createColumn failed: ${error?.message}`);
  return { id: data.id, name: data.name, color: data.color, cards: [] };
}

/** New tasks carry no dates — only a title, and later a priority set from the card modal. */
export async function createCard(
  workspaceId: string,
  columnId: string,
  title: string,
): Promise<BoardCard> {
  const clean = cleanText(title, LIMITS.title, "Card title") || "Untitled card";
  const { data: maxRow } = await supabase
    .from("board_cards")
    .select("position")
    .eq("column_id", columnId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((maxRow?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("board_cards")
    .insert({ column_id: columnId, project_id: workspaceId, title: clean, position })
    .select("id, title, sub, kind, tags, priority, owners")
    .single();
  if (error || !data) throw new Error(`createCard failed: ${error?.message}`);
  return {
    id: data.id,
    title: data.title,
    sub: data.sub,
    kind: data.kind,
    tags: data.tags ?? [],
    priority: data.priority,
    ownerIds: data.owners ?? [],
    columnId,
  };
}

/**
 * Move a card into a column and persist the target column's new card order.
 * orderedCardIds is the full ordered list of card ids in the destination
 * column after the move (including the moved card).
 */
export async function moveCard(
  cardId: string,
  toColumnId: string,
  orderedCardIds: string[],
): Promise<void> {
  const {data, error} = await supabase.from('board_cards').select('project_id').eq('id',cardId).single();
  if (error) throw new Error(`moveCard failed: ${error.message}`);
  const snapshot = await loadSchedule(data.project_id);
  const card = snapshot.cards.find(c=>c.id===cardId);
  if(!card) throw new Error('Task unavailable');
  await mutateSchedule(data.project_id,snapshot,{op:'card',card:{id:card.id,start_date:card.start_date,deadline:card.deadline,firm_deadline:card.firm_deadline,column_id:toColumnId}});
  await Promise.all(
    orderedCardIds.map((id, i) =>
      supabase.from("board_cards").update({ position: i }).eq("id", id),
    ),
  );
}

/** Persist a board's column order. */
export async function reorderColumns(orderedColumnIds: string[]): Promise<void> {
  await Promise.all(
    orderedColumnIds.map((id, i) =>
      supabase.from("board_columns").update({ position: i }).eq("id", id),
    ),
  );
}

/* ── categories (the editable card "kind" list) ──────────────────────────── */

export interface BoardCategory {
  id: string;
  name: string;
}

/** Categories are workspace records; reads never create records for viewers. */
export async function listCategories(workspaceId: string): Promise<BoardCategory[]> {
  const {data,error}=await supabase.from("board_categories").select("id,name").eq("project_id",workspaceId).order("position",{ascending:true});
  if(error)throw new Error(error.message);
  return data ?? [];
}

/** Add a category. */
export async function createCategory(workspaceId: string, name: string): Promise<BoardCategory> {
  const clean = cleanText(name, LIMITS.tag, "Category name");
  if (!clean) throw new Error("Category name is empty");
  const { data: maxRow } = await supabase
    .from("board_categories")
    .select("position")
    .eq("project_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((maxRow?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("board_categories")
    .insert({ project_id: workspaceId, name: clean, position })
    .select("id, name")
    .single();
  if (error || !data) throw new Error(`createCategory failed: ${error?.message}`);
  return data as BoardCategory;
}

/** Rename a category and re-label every card that uses it. */
export async function renameCategory(
  workspaceId: string,
  id: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const clean = cleanText(newName, LIMITS.tag, "Category name");
  if (!clean) return;
  const { error } = await supabase.from("board_categories").update({ name: clean }).eq("id", id);
  if (error) throw new Error(`renameCategory failed: ${error.message}`);

}

/** Delete a category; cards that used it become uncategorised. */
export async function deleteCategory(
  workspaceId: string,
  id: string,
  name: string,
): Promise<void> {
  const { error } = await supabase.from("board_categories").delete().eq("id", id);
  if (error) throw new Error(`deleteCategory failed: ${error.message}`);

}

/** Delete a card. */
export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from("board_cards").delete().eq("id", id);
  if (error) throw new Error(`deleteCard failed: ${error.message}`);
}

/** Delete a column; its cards cascade in the database. */
export async function deleteColumn(id: string): Promise<void> {
  const { error } = await supabase.from("board_columns").delete().eq("id", id);
  if (error) throw new Error(`deleteColumn failed: ${error.message}`);
}

/** Delete a board; its columns and cards cascade in the database. */
export async function deleteBoard(id: string): Promise<void> {
  const { error } = await supabase.from("boards").delete().eq("id", id);
  if (error) throw new Error(`deleteBoard failed: ${error.message}`);
}

/** Atomically reuse, create, or explicitly link a canvas for the original card. */
export async function openBoardCardCanvas(cardId: string, existingCanvasId?: string): Promise<{ id: string; created: boolean }> {
  const { data, error } = await supabase.rpc("open_board_card_canvas", {
    p_card_id: cardId,
    p_existing_canvas_id: existingCanvasId ?? null,
  }).single();
  if (error) throw new Error(error.code === "PGRST202"
    ? "Canvas linking is not set up yet. Run supabase/migrate-board-canvas-link.sql in Supabase, then retry."
    : `Could not open canvas: ${error.message}`);
  const result = data as { canvas_id: string; created: boolean } | null;
  if (!result?.canvas_id) throw new Error("Could not resolve the linked canvas.");
  return { id: result.canvas_id, created: result.created };
}
