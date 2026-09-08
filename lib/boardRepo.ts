import { supabase } from "./supabase";
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
  tags: string[];
  priority: string | null;
  ownerIds: string[];
  canvasId?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  dragging?: boolean;
}

export interface BoardColumn {
  id: string;
  name: string;
  color: string;
  cards: BoardCard[];
}

export interface Board {
  id: string;
  name: string;
  color: string;
  cols: BoardColumn[];
}

interface CardRow {
  id: string;
  column_id: string;
  title: string;
  sub: string;
  kind: string;
  tags: string[] | null;
  priority: string | null;
  owners: string[] | null;
  canvas_id?: string | null;
  start_date?: string | null;
  deadline: string | null;
  position: number;
}

const DEFAULT_COLUMNS = [
  { name: "To Do", color: "#a59a8c" },
  { name: "In Progress", color: "#cf6a2c" },
  { name: "Review", color: "#d9a441" },
  { name: "Done", color: "#4caf7d" },
];

/** Load every board in the workspace, columns and cards nested and ordered. */
export async function loadBoards(workspaceId: string): Promise<Board[]> {
  const [boardsRes, colsRes, cardsRes] = await Promise.all([
    supabase
      .from("boards")
      .select("id, name, color, position")
      .eq("project_id", workspaceId)
      .order("position", { ascending: true }),
    supabase
      .from("board_columns")
      .select("id, board_id, name, color, position")
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
      tags: r.tags ?? [],
      priority: r.priority,
      ownerIds: r.owners ?? [],
      canvasId: r.canvas_id,
      startDate: r.start_date,
      deadline: r.deadline,
    };
    (cardsByCol.get(r.column_id) ?? cardsByCol.set(r.column_id, []).get(r.column_id)!).push(card);
  }

  const colsByBoard = new Map<string, BoardColumn[]>();
  for (const r of (colsRes.data ?? []) as { id: string; board_id: string; name: string; color: string }[]) {
    const col: BoardColumn = { id: r.id, name: r.name, color: r.color, cards: cardsByCol.get(r.id) ?? [] };
    (colsByBoard.get(r.board_id) ?? colsByBoard.set(r.board_id, []).get(r.board_id)!).push(col);
  }

  return ((boardsRes.data ?? []) as { id: string; name: string; color: string }[]).map((b) => ({
    id: b.id,
    name: b.name,
    color: b.color,
    cols: colsByBoard.get(b.id) ?? [],
  }));
}

/** Create a board with the four default columns; returns the nested board. */
export async function createBoard(
  workspaceId: string,
  name: string,
  color = "#cf6a2c",
): Promise<Board> {
  const clean = cleanText(name, LIMITS.name, "Board name") || "Untitled board";
  const { data: maxRow } = await supabase
    .from("boards")
    .select("position")
    .eq("project_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((maxRow?.position as number | undefined) ?? -1) + 1;

  const { data: board, error } = await supabase
    .from("boards")
    .insert({ project_id: workspaceId, name: clean, color, position })
    .select("id, name, color")
    .single();
  if (error || !board) throw new Error(`createBoard failed: ${error?.message}`);

  const { data: cols, error: colErr } = await supabase
    .from("board_columns")
    .insert(DEFAULT_COLUMNS.map((c, i) => ({
      board_id: board.id,
      project_id: workspaceId,
      name: c.name,
      color: c.color,
      position: i,
    })))
    .select("id, name, color, position");
  if (colErr) throw new Error(`createBoard columns failed: ${colErr.message}`);

  return {
    id: board.id,
    name: board.name,
    color: board.color,
    cols: (cols ?? [])
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, name: c.name, color: c.color, cards: [] })),
  };
}

/** Append a column to a board. */
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

/** Append a card to a column. Only id/title/deadline vary at creation time. */
export async function createCard(
  workspaceId: string,
  columnId: string,
  title: string,
  deadline: string | null,
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
    .insert({ column_id: columnId, project_id: workspaceId, title: clean, deadline, position })
    .select("id, title, sub, kind, tags, priority, owners, deadline")
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
    deadline: data.deadline,
  };
}

/** Persist edits from the card modal. */
export async function updateCard(card: BoardCard): Promise<void> {
  validateSchedule(card.startDate, card.deadline);
  const { error } = await supabase
    .from("board_cards")
    .update({
      title: cleanText(card.title, LIMITS.title, "Card title") || "Untitled card",
      sub: cleanText(card.sub ?? "", LIMITS.summary, "Card description"),
      kind: card.kind ?? "",
      tags: card.tags ?? [],
      priority: card.priority,
      owners: card.ownerIds ?? [],
      deadline: card.deadline || null,
      ...(card.startDate !== undefined ? { start_date: card.startDate || null } : {}),
    })
    .eq("id", card.id);
  if (error) throw new Error(`updateCard failed: ${error.message}`);
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
  const { error } = await supabase
    .from("board_cards")
    .update({ column_id: toColumnId })
    .eq("id", cardId);
  if (error) throw new Error(`moveCard failed: ${error.message}`);
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

const DEFAULT_CATEGORIES = ["mechanic", "vision", "economy", "lore"];

/** List the workspace's categories, seeding the defaults on first visit. */
export async function listCategories(workspaceId: string): Promise<BoardCategory[]> {
  const { data } = await supabase
    .from("board_categories")
    .select("id, name")
    .eq("project_id", workspaceId)
    .order("position", { ascending: true });
  if (data && data.length > 0) return data as BoardCategory[];

  const { data: seeded, error } = await supabase
    .from("board_categories")
    .insert(DEFAULT_CATEGORIES.map((name, i) => ({ project_id: workspaceId, name, position: i })))
    .select("id, name");
  if (error) throw new Error(`seed categories failed: ${error.message}`);
  return (seeded ?? []) as BoardCategory[];
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
  await supabase
    .from("board_cards")
    .update({ kind: clean })
    .eq("project_id", workspaceId)
    .eq("kind", oldName);
}

/** Delete a category; cards that used it become uncategorised. */
export async function deleteCategory(
  workspaceId: string,
  id: string,
  name: string,
): Promise<void> {
  const { error } = await supabase.from("board_categories").delete().eq("id", id);
  if (error) throw new Error(`deleteCategory failed: ${error.message}`);
  await supabase
    .from("board_cards")
    .update({ kind: "" })
    .eq("project_id", workspaceId)
    .eq("kind", name);
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

/* ── seeding ──────────────────────────────────────────────────────────────── */

const SEED_BOARDS: { name: string; color: string; cards: Record<string, Omit<BoardCard, "id" | "ownerIds">[]> }[] = [
  {
    name: "Core Gameplay", color: "#cf6a2c",
    cards: {
      "To Do": [
        { title: "Loot table balancing pass", sub: "Review drop rates across all tier-3 zones and normalise rare item frequency.", kind: "economy", tags: ["v2.3", "balance"], priority: "high", deadline: null },
        { title: "Stealth system rework", sub: "Replace line-of-sight cone with radius + alertness model.", kind: "mechanic", tags: ["gameplay"], priority: "medium", deadline: null },
        { title: "Companion dialogue trees", sub: "Branch 4 new NPC threads off the merchant questline.", kind: "lore", tags: ["narrative"], priority: null, deadline: null },
      ],
      "In Progress": [
        { title: "World map fog of war", sub: "Implement per-tile discovery states with save persistence.", kind: "mechanic", tags: ["exploration", "save"], priority: "high", deadline: null },
        { title: "Seasonal economy events", sub: "Festival price swings and limited-time vendor stock.", kind: "economy", tags: ["events"], priority: "medium", deadline: null },
      ],
      "Review": [
        { title: "Core vision statement", sub: "Align team on the 3-pillar design philosophy doc.", kind: "vision", tags: ["design"], priority: null, deadline: null },
      ],
      "Done": [
        { title: "Save/load system", sub: "Slot-based save with autosave at checkpoints.", kind: "mechanic", tags: ["core", "done"], priority: null, deadline: null },
      ],
    },
  },
  { name: "Economy & Items", color: "#4caf7d", cards: {} },
  { name: "World & Narrative", color: "#8a54b5", cards: {} },
];

/** First visit: give an empty workspace its starter boards. */
export async function seedBoardsIfEmpty(workspaceId: string): Promise<void> {
  const { count } = await supabase
    .from("boards")
    .select("id", { count: "exact", head: true })
    .eq("project_id", workspaceId);
  if ((count ?? 0) > 0) return;

  for (const seed of SEED_BOARDS) {
    const board = await createBoard(workspaceId, seed.name, seed.color);
    for (const col of board.cols) {
      const cards = seed.cards[col.name] ?? [];
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const { error } = await supabase.from("board_cards").insert({
          column_id: col.id,
          project_id: workspaceId,
          title: c.title,
          sub: c.sub,
          kind: c.kind,
          tags: c.tags,
          priority: c.priority,
          position: i,
        });
        if (error) throw new Error(`seed card failed: ${error.message}`);
      }
    }
  }
}

/** Date-only writes avoid overwriting concurrent edits to titles or owners. */
export async function updateCardSchedule(id: string, startDate: string | null, deadline: string | null): Promise<void> {
  validateSchedule(startDate, deadline);
  const { error } = await supabase.from("board_cards")
    .update({ start_date: startDate, deadline }).eq("id", id).select("id").single();
  if (error) throw new Error(error.message.includes("start_date")
    ? "Start dates are not set up yet. Run supabase/migrate-board-gantt.sql in Supabase, then retry."
    : `Could not save schedule: ${error.message}`);
}

function validateSchedule(start?: string | null, end?: string | null) {
  for (const value of [start, end]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)))) {
      throw new Error("Choose a valid date.");
    }
  }
  if (start && end && start > end) throw new Error("Deadline must be on or after the start date.");
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
