import type { Board } from "./boardRepo";

/** Card id → when it was finished (see loadCompletions). */
export type Completions = Map<string, string>;

/* ---------------------------------------------------------------------------
 * Team stats: who finished how many board tasks, and when. A task counts for
 * every assignee (shared work is credited in full to each); unassigned done
 * tasks count toward the team total only. Time windows use the task's
 * finish time from card_completions, so done tasks without one (finished
 * before tracking began, or copied in) count toward "all time" only.
 * ------------------------------------------------------------------------- */

export type StatsPeriod = "week" | "month" | "all";

export interface DoneTask {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  ownerIds: string[];
  completedAt: Date | null;
}

export interface PersonStats {
  id: string;
  done: number;
  /** Open tasks assigned to this person right now. */
  open: number;
  /** Consecutive weeks, ending this week or last, with at least one finished task. */
  streak: number;
}

/** Monday 00:00 local time of the week holding `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function periodStart(period: StatsPeriod, now: Date): Date | null {
  if (period === "week") return startOfWeek(now);
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

export function doneTasks(boards: Board[], completions: Completions): DoneTask[] {
  return boards.flatMap((b) => b.cols.filter((c) => c.isCompleted).flatMap((c) => c.cards.map((k) => ({
    id: k.id,
    title: k.title,
    boardId: b.id,
    boardName: b.name,
    ownerIds: k.ownerIds,
    completedAt: completions.has(k.id) ? new Date(completions.get(k.id)!) : null,
  }))));
}

export function inPeriod(task: DoneTask, period: StatsPeriod, now: Date): boolean {
  const from = periodStart(period, now);
  return !from || (!!task.completedAt && task.completedAt >= from);
}

/** Per-person totals for the period, most finished first (ties: fewer open, then id). */
export function leaderboard(boards: Board[], completions: Completions, peopleIds: string[], period: StatsPeriod, now: Date): PersonStats[] {
  const done = doneTasks(boards, completions);
  const open = boards.flatMap((b) => b.cols.filter((c) => !c.isCompleted).flatMap((c) => c.cards));
  return peopleIds
    .map((id) => {
      const mine = done.filter((t) => t.ownerIds.includes(id));
      return {
        id,
        done: mine.filter((t) => inPeriod(t, period, now)).length,
        open: open.filter((k) => k.ownerIds.includes(id)).length,
        streak: weekStreak(mine, now),
      };
    })
    .sort((a, b) => b.done - a.done || a.open - b.open || a.id.localeCompare(b.id));
}

/** Weeks in a row with a finished task. This week may still be empty without breaking it. */
export function weekStreak(tasks: DoneTask[], now: Date): number {
  const weeks = new Set(tasks.filter((t) => t.completedAt).map((t) => startOfWeek(t.completedAt!).getTime()));
  const cursor = startOfWeek(now);
  if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  while (weeks.has(cursor.getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/** Team completions per week for the last `count` weeks, oldest first. */
export function weeklyTotals(tasks: DoneTask[], now: Date, count = 8): { start: Date; done: number }[] {
  const current = startOfWeek(now);
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(current);
    start.setDate(start.getDate() - 7 * (count - 1 - i));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, done: tasks.filter((t) => t.completedAt && t.completedAt >= start && t.completedAt < end).length };
  });
}
