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
  ownerId: string | null;
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
  owner: string | null;
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
      .select("id, column_id, title, sub, kind, tags, priority, owner, deadline, position")
      .eq("project_id", workspaceId)
      .order("position", { ascending: true }),
  ]);

  const cardsByCol = new Map<string, BoardCard[]>();
  for (const r of (cardsRes.data ?? []) as CardRow[]) {
    const card: BoardCard = {
      id: r.id,
      title: r.title,
      sub: r.sub,
      kind: r.kind,
      tags: r.tags ?? [],
      priority: r.priority,
      ownerId: r.owner,
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
    .select("id, title, sub, kind, tags, priority, owner, deadline")
    .single();
  if (error || !data) throw new Error(`createCard failed: ${error?.message}`);
  return {
    id: data.id,
    title: data.title,
    sub: data.sub,
    kind: data.kind,
    tags: data.tags ?? [],
    priority: data.priority,
    ownerId: data.owner,
    deadline: data.deadline,
  };
}

/** Persist edits from the card modal. */
export async function updateCard(card: BoardCard): Promise<void> {
  const { error } = await supabase
    .from("board_cards")
    .update({
      title: cleanText(card.title, LIMITS.title, "Card title") || "Untitled card",
      sub: cleanText(card.sub ?? "", LIMITS.summary, "Card description"),
      kind: card.kind ?? "",
      tags: card.tags ?? [],
      priority: card.priority,
      owner: card.ownerId,
      deadline: card.deadline || null,
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

const SEED_BOARDS: { name: string; color: string; cards: Record<string, Omit<BoardCard, "id" | "ownerId">[]> }[] = [
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
