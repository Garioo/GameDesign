import type { Board, BoardCard } from "./boardRepo";

export type PriorityKey = "high" | "medium" | "low" | "none";
export const PRIORITY_ORDER: PriorityKey[] = ["high", "medium", "low", "none"];

/** One task assigned to the viewer, with where it lives. */
export interface MyTask {
  card: BoardCard;
  board: Board;
  boardIndex: number;
  columnId: string;
  columnName: string;
  columnColor: string;
  columnIndex: number;
  cardIndex: number;
  done: boolean;
  /** Direct-subtask progress, when it has subtasks. */
  subtasks?: { done: number; total: number };
}

export const priorityKey = (p: string | null | undefined): PriorityKey =>
  p === "high" || p === "medium" || p === "low" ? p : "none";

/**
 * Every task where `userId` is an assignee, ordered by board, then stage,
 * then position on the stage — the order within each priority group.
 */
export function myTasks(boards: Board[], userId: string): MyTask[] {
  const subtaskStats = new Map<string, { done: number; total: number }>();
  for (const b of boards) for (const c of b.cols) for (const k of c.cards) {
    if (!k.parentId) continue;
    const s = subtaskStats.get(k.parentId) ?? { done: 0, total: 0 };
    s.total++;
    if (c.isCompleted) s.done++;
    subtaskStats.set(k.parentId, s);
  }
  const out: MyTask[] = [];
  boards.forEach((board, boardIndex) =>
    board.cols.forEach((col, columnIndex) =>
      col.cards.forEach((card, cardIndex) => {
        if (!card.ownerIds.includes(userId)) return;
        out.push({
          card,
          board,
          boardIndex,
          columnId: col.id,
          columnName: col.name,
          columnColor: col.color,
          columnIndex,
          cardIndex,
          done: !!col.isCompleted,
          subtasks: subtaskStats.get(card.id),
        });
      }),
    ),
  );
  return out.sort((a, b) => a.boardIndex - b.boardIndex || a.columnIndex - b.columnIndex || a.cardIndex - b.cardIndex);
}

/** Open tasks grouped High → Medium → Low → no priority; empty groups are left out. */
export function groupByPriority(tasks: MyTask[]): { key: PriorityKey; tasks: MyTask[] }[] {
  return PRIORITY_ORDER
    .map((key) => ({ key, tasks: tasks.filter((t) => priorityKey(t.card.priority) === key) }))
    .filter((g) => g.tasks.length > 0);
}
