/* ---------------------------------------------------------------------------
 * Pure helpers for project planning: which tasks are blocked, how far a
 * milestone has come, and friendly countdowns. The data comes from
 * lib/planningRepo.ts (supabase/migrate-project-planning.sql).
 * ------------------------------------------------------------------------- */

export type Every = "day" | "week" | "2weeks" | "month";
export const EVERY_LABEL: Record<Every, string> = {
  day: "Daily",
  week: "Weekly",
  "2weeks": "Every 2 weeks",
  month: "Monthly",
};

export interface Milestone {
  id: string;
  name: string;
  /** "YYYY-MM-DD", or null when it has no date yet. */
  dueDate: string | null;
  description: string;
  /** null = the whole workspace. */
  boardId: string | null;
  completedAt: string | null;
  position: number;
}

export interface CardDependency {
  id: string;
  blocker: string;
  blocked: string;
}

export interface RecurringRule {
  id: string;
  boardId: string;
  every: Every;
  nextRun: string;
}

/** A task as planning needs it: its id, title and whether it's in a done stage. */
export interface PlanTask {
  id: string;
  title: string;
  done: boolean;
  milestoneId?: string | null;
}

/** Open tasks that `taskId` is waiting on. */
export function openBlockers(taskId: string, deps: CardDependency[], tasks: Map<string, PlanTask>): PlanTask[] {
  return deps
    .filter((d) => d.blocked === taskId)
    .map((d) => tasks.get(d.blocker))
    .filter((t): t is PlanTask => !!t && !t.done);
}

/** Ids of every task with at least one open blocker. */
export function blockedIds(deps: CardDependency[], tasks: Map<string, PlanTask>): Set<string> {
  const out = new Set<string>();
  for (const d of deps) {
    const blocker = tasks.get(d.blocker);
    if (blocker && !blocker.done) out.add(d.blocked);
  }
  return out;
}

export interface MilestoneProgress {
  total: number;
  done: number;
  /** Open tasks that are waiting on something unfinished. */
  blocked: number;
  open: PlanTask[];
}

export function milestoneProgress(milestoneId: string, tasks: PlanTask[], blocked: Set<string>): MilestoneProgress {
  const mine = tasks.filter((t) => t.milestoneId === milestoneId);
  const open = mine.filter((t) => !t.done);
  return { total: mine.length, done: mine.length - open.length, blocked: open.filter((t) => blocked.has(t.id)).length, open };
}

/** Whole days from `today` to `day` (both "YYYY-MM-DD"); negative when past. */
export function daysUntil(day: string, today: string): number {
  const [a, b] = [day, today].map((d) => {
    const [y, m, dd] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, dd);
  });
  return Math.round((a - b) / 86400000);
}

/** "Today", "Tomorrow", "In 5 days", "3 weeks left", "2 days ago"… */
export function countdown(day: string, today: string): string {
  const n = daysUntil(day, today);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n < 0) return `${-n} days ago`;
  if (n < 14) return `In ${n} days`;
  if (n < 60) return `${Math.round(n / 7)} weeks left`;
  return `${Math.round(n / 30)} months left`;
}

/** How urgent a milestone is, for colouring: overdue, due within a week, or later. */
export function urgency(m: Pick<Milestone, "dueDate" | "completedAt">, today: string): "done" | "overdue" | "soon" | "later" | "undated" {
  if (m.completedAt) return "done";
  if (!m.dueDate) return "undated";
  const n = daysUntil(m.dueDate, today);
  return n < 0 ? "overdue" : n <= 7 ? "soon" : "later";
}

/** Milestones in the order to show them: open ones by date (undated last), then reached ones. */
export function sortMilestones<T extends Pick<Milestone, "dueDate" | "completedAt" | "position" | "name">>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (!!a.completedAt !== !!b.completedAt) return a.completedAt ? 1 : -1;
    if (a.dueDate !== b.dueDate) return !a.dueDate ? 1 : !b.dueDate ? -1 : a.dueDate.localeCompare(b.dueDate);
    return a.position - b.position || a.name.localeCompare(b.name);
  });
}

/** Today as "YYYY-MM-DD" in local time. */
export function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
