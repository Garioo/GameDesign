import type { Board, BoardCard, BoardColumn } from './boardRepo';

export interface TaskRow {
  card: BoardCard;
  col: BoardColumn;
  depth: number;
  children: BoardCard[];
  completedChildren: number;
}

/** A single tree projection for task labels, bars, and dependency anchors. */
export function taskRows(
  board: Board,
  options: { collapsed: string[]; completed: boolean; matches: (card: BoardCard) => boolean; filtering: boolean },
): TaskRow[] {
  const tasks = board.cols.flatMap(col => col.cards.map(card => ({ card, col })));
  const byId = new Map(tasks.map(task => [task.card.id, task]));
  const children = new Map<string | null, typeof tasks>();
  for (const task of tasks) {
    const parent = task.card.parentId && byId.has(task.card.parentId) ? task.card.parentId : null;
    const group = children.get(parent) ?? [];
    group.push(task);
    children.set(parent, group);
  }
  for (const group of children.values()) group.sort((a, b) =>
    (a.card.timelinePosition ?? 0) - (b.card.timelinePosition ?? 0));
  const visible = new Set<string>();
  // Matching descendants always retain their entire ancestor path.
  for (const task of tasks) {
    if (!options.matches(task.card) || (!options.completed && task.col.isCompleted)) continue;
    let current: typeof task | undefined = task;
    const seen = new Set<string>();
    while (current && !seen.has(current.card.id)) {
      seen.add(current.card.id);
      visible.add(current.card.id);
      current = byId.get(current.card.parentId ?? '');
    }
  }
  const rows: TaskRow[] = [];
  const stack = (children.get(null) ?? []).map(task => ({ task, depth: 0 })).reverse();
  const visited = new Set<string>();
  const collapsed = new Set(options.collapsed);
  while (stack.length) {
    const { task, depth } = stack.pop()!;
    if (visited.has(task.card.id) || !visible.has(task.card.id)) continue;
    visited.add(task.card.id);
    const direct = children.get(task.card.id) ?? [];
    rows.push({ ...task, depth, children: direct.map(t => t.card), completedChildren: direct.filter(t => t.col.isCompleted).length });
    if (!collapsed.has(task.card.id) || options.filtering) {
      for (let i = direct.length - 1; i >= 0; i--) stack.push({ task: direct[i], depth: depth + 1 });
    }
  }
  return rows;
}

export function parentChoices(board: Board | undefined, taskId: string): { id: string; title: string }[] {
  if (!board) return [];
  const rows = taskRows(board, { collapsed: [], completed: true, matches: () => true, filtering: false });
  const excluded = new Set([taskId]);
  const paths = new Map<string, string>();
  return rows.flatMap(({ card }) => {
    if (card.parentId && excluded.has(card.parentId)) excluded.add(card.id);
    const path = [paths.get(card.parentId ?? ''), card.title].filter(Boolean).join(' / ');
    paths.set(card.id, path);
    return excluded.has(card.id) ? [] : [{ id: card.id, title: path }];
  });
}

export const TIMELINE_ROW_HEIGHT = 44;
export const TIMELINE_ENTRY_HEIGHT = 116;

/** Entry belongs after the complete visible subtree, not between its descendants. */
export function entryIndex(rows: TaskRow[], parentId: string | null): number {
  if (!parentId) return rows.length;
  const index = rows.findIndex(row => row.card.id === parentId);
  if (index < 0) return -1;
  let end = index + 1;
  while (end < rows.length && rows[end].depth > rows[index].depth) end++;
  return end;
}
