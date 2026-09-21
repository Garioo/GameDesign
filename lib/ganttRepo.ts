import { supabase } from "./supabase";

export interface ScheduleCard {
  id: string;
  title: string;
  column_id: string;
  parent_id?: string | null;
  timeline_position?: number;
  start_date: string | null;
  deadline: string | null;
  firm_deadline: string | null;
  [key: string]: unknown;
}
export interface Dependency {
  id: string;
  predecessor: string;
  successor: string;
  kind: "FS" | "SS" | "FF";
  gap: number;
}
export interface Milestone {
  id: string;
  name: string;
  day: string;
  board_id: string | null;
}
export interface ScheduleSnapshot {
  cards: ScheduleCard[];
  columns: { id: string; board_id:string; name:string; color:string; position:number; is_completed: boolean }[];
  dependencies: Dependency[];
  milestones: Milestone[];
  links: { id: string; milestone_id: string; card_id: string }[];
}
export interface ScheduleResult {
  snapshot: ScheduleSnapshot;
  before: ScheduleCard[];
  moved: number;
}
export interface ViewSettings {
  boards: string[];
  query: string;
  owner: string;
  category: string;
  completed: boolean;
  days: number;
  collapsed: string[];
}
export interface SavedView {
  id: string;
  name: string;
  settings: ViewSettings;
}
export async function loadSchedule(project: string): Promise<ScheduleSnapshot> {
  const { data, error } = await supabase.rpc("gantt_snapshot", {
    p_project: project,
  });
  if (error)
    throw new Error(
      `Could not load scheduling. Apply the Gantt planning migration first. ${error.message}`,
    );
  return data;
}
export async function mutateSchedule(
  project: string,
  snapshot: ScheduleSnapshot,
  action: Record<string, unknown>,
): Promise<ScheduleResult> {
  const card = action.card as Record<string, unknown> | undefined;
  const hierarchy = action.op === 'create_tasks' || action.op === 'reorder_tasks' || (action.op === 'card' && card && 'parent_id' in card);
  const { data, error } = await supabase.rpc(hierarchy ? "gantt_mutate_hierarchy" : "gantt_mutate", {
    p_project: project,
    p_expected: snapshot,
    p_action: action,
  });
  if (error) throw new Error(hierarchy && error.code === 'PGRST202'
    ? 'Subtasks need the task-hierarchy database update. Run migrate-task-hierarchy.sql in Supabase first.'
    : error.message);
  return data;
}
export async function loadViews(project: string): Promise<SavedView[]> {
  const { data, error } = await supabase
    .from("gantt_views")
    .select("id,name,settings")
    .eq("project_id", project)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function saveView(
  project: string,
  name: string,
  settings: ViewSettings,
) {
  const { error } = await supabase
    .from("gantt_views")
    .insert({ project_id: project, name: name.trim().slice(0, 120), settings });
  if (error) throw new Error(error.message);
}
