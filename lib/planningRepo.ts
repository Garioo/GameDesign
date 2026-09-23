import { supabase } from "./supabase";
import type { CardDependency, Every, Milestone, RecurringRule } from "./planning";

/* ---------------------------------------------------------------------------
 * Milestones, task dependencies and recurring tasks
 * (supabase/migrate-project-planning.sql). RLS: members read, editors write.
 * ------------------------------------------------------------------------- */

const NEEDS_MIGRATION = "Milestones, dependencies and repeating tasks need a database update. Apply supabase/migrate-project-planning.sql in Supabase.";

function planningError(error: { code?: string; message: string }, what: string): Error {
  return new Error(
    ["42P01", "PGRST205", "42703", "PGRST202", "PGRST204"].includes(error.code ?? "") ? NEEDS_MIGRATION : `${what} failed: ${error.message}`,
  );
}

/** Rejected by RLS without an error (no row back): the caller can't edit here. */
function ensureWrote(rows: unknown[] | null, what: string) {
  if (!rows?.length) throw new Error(`Only editors can ${what}.`);
}

/* ---------- milestones ---------- */

interface MilestoneRow {
  id: string;
  name: string;
  due_date: string | null;
  description: string | null;
  board_id: string | null;
  completed_at: string | null;
  position: number;
}
const toMilestone = (r: MilestoneRow): Milestone => ({
  id: r.id,
  name: r.name,
  dueDate: r.due_date,
  description: r.description ?? "",
  boardId: r.board_id,
  completedAt: r.completed_at,
  position: r.position,
});

export async function listMilestones(workspaceId: string): Promise<Milestone[]> {
  const { data, error } = await supabase
    .from("milestones")
    .select("id, name, due_date, description, board_id, completed_at, position")
    .eq("project_id", workspaceId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw planningError(error, "listMilestones");
  return ((data ?? []) as MilestoneRow[]).map(toMilestone);
}

export interface MilestoneInput {
  name: string;
  dueDate: string | null;
  description?: string;
  boardId?: string | null;
}

export async function createMilestone(workspaceId: string, input: MilestoneInput): Promise<Milestone> {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Give the milestone a name.");
  const { data, error } = await supabase
    .from("milestones")
    .insert({
      project_id: workspaceId,
      name,
      due_date: input.dueDate || null,
      description: (input.description ?? "").slice(0, 2000),
      board_id: input.boardId ?? null,
    })
    .select("id, name, due_date, description, board_id, completed_at, position")
    .single();
  if (error) throw planningError(error, "createMilestone");
  return toMilestone(data as MilestoneRow);
}

export async function updateMilestone(
  id: string,
  patch: Partial<MilestoneInput> & { completed?: boolean },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 120);
    if (!name) throw new Error("Give the milestone a name.");
    row.name = name;
  }
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate || null;
  if (patch.description !== undefined) row.description = patch.description.slice(0, 2000);
  if (patch.boardId !== undefined) row.board_id = patch.boardId;
  if (patch.completed !== undefined) row.completed_at = patch.completed ? new Date().toISOString() : null;
  const { data, error } = await supabase.from("milestones").update(row).eq("id", id).select("id");
  if (error) throw planningError(error, "updateMilestone");
  ensureWrote(data, "change milestones");
}

export async function deleteMilestone(id: string): Promise<void> {
  const { data, error } = await supabase.from("milestones").delete().eq("id", id).select("id");
  if (error) throw planningError(error, "deleteMilestone");
  ensureWrote(data, "delete milestones");
}

/** Put a task under a milestone (or take it out with null). */
export async function setCardMilestone(cardId: string, milestoneId: string | null): Promise<void> {
  const { data, error } = await supabase.from("board_cards").update({ milestone_id: milestoneId }).eq("id", cardId).select("id");
  if (error) throw planningError(error, "setCardMilestone");
  ensureWrote(data, "change tasks");
}

/* ---------- dependencies ---------- */

export async function listDependencies(workspaceId: string): Promise<CardDependency[]> {
  const { data, error } = await supabase.from("card_dependencies").select("id, blocker, blocked").eq("project_id", workspaceId);
  if (error) throw planningError(error, "listDependencies");
  return (data ?? []) as CardDependency[];
}

/** `blocked` waits for `blocker` to be done. */
export async function addDependency(workspaceId: string, blocker: string, blocked: string): Promise<CardDependency> {
  const { data, error } = await supabase
    .from("card_dependencies")
    .insert({ project_id: workspaceId, blocker, blocked })
    .select("id, blocker, blocked")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That task is already linked.");
    if (/waiting on each other/.test(error.message)) throw new Error("These tasks would end up waiting on each other.");
    throw planningError(error, "addDependency");
  }
  return data as CardDependency;
}

export async function removeDependency(id: string): Promise<void> {
  const { data, error } = await supabase.from("card_dependencies").delete().eq("id", id).select("id");
  if (error) throw planningError(error, "removeDependency");
  ensureWrote(data, "change dependencies");
}

/* ---------- recurring tasks ---------- */

export async function listRecurring(workspaceId: string): Promise<RecurringRule[]> {
  const { data, error } = await supabase.from("recurring_tasks").select("id, board_id, every, next_run").eq("project_id", workspaceId);
  if (error) throw planningError(error, "listRecurring");
  return ((data ?? []) as { id: string; board_id: string; every: Every; next_run: string }[]).map((r) => ({
    id: r.id,
    boardId: r.board_id,
    every: r.every,
    nextRun: r.next_run,
  }));
}

/** Make a task repeat (its current fields become the template), change how often, or stop with null. */
export async function setTaskRecurrence(cardId: string, every: Every | null): Promise<void> {
  const { error } = await supabase.rpc("set_task_recurrence", { p_card: cardId, p_every: every });
  if (error) throw planningError(error, "setTaskRecurrence");
}

/** Create any repeating tasks that are due. Returns how many were made (0 for viewers). */
export async function spawnRecurring(workspaceId: string): Promise<number> {
  const { data, error } = await supabase.rpc("spawn_recurring_tasks", { p_project: workspaceId });
  if (error) throw planningError(error, "spawnRecurring");
  return typeof data === "number" ? data : 0;
}

/** Everything planning-related for a workspace; a missing migration yields empty lists. */
export async function loadPlanning(workspaceId: string): Promise<{
  milestones: Milestone[];
  dependencies: CardDependency[];
  recurring: RecurringRule[];
  missing: boolean;
}> {
  try {
    const [milestones, dependencies, recurring] = await Promise.all([
      listMilestones(workspaceId),
      listDependencies(workspaceId),
      listRecurring(workspaceId),
    ]);
    return { milestones, dependencies, recurring, missing: false };
  } catch (e) {
    if (e instanceof Error && e.message === NEEDS_MIGRATION) return { milestones: [], dependencies: [], recurring: [], missing: true };
    throw e;
  }
}
