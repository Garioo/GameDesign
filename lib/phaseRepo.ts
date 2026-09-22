import { supabase } from "./supabase";
import { dayNumber } from "./gantt";

export interface Phase {
  id: string;
  project_id: string;
  board_id: string;
  category_id: string | null;
  title: string;
  board_name: string;
  color: string;
  start_date: string | null;
  end_date: string | null;
  effective_start: string | null;
  effective_end: string | null;
  total: number;
  completed: number;
  active: boolean;
}
export interface PhaseDependency {
  id: string;
  predecessor: string;
  successor: string;
  kind: "FS" | "SS" | "FF";
  gap: number;
  suspended: boolean;
  reason: string | null;
}
export interface PhaseSnapshot {
  phases: Phase[];
  dependencies: PhaseDependency[];
}
export type PhaseAction =
  | { op: "dates"; id: string; start: string | null; end: string | null }
  | { op: "move"; id: string; days: number }
  | { op: "rename"; id: string; title: string }
  | {
      op: "dependency";
      predecessor: string;
      successor: string;
      kind: PhaseDependency["kind"];
      gap: number;
    }
  | { op: "delete_dependency" | "resume_dependency"; id: string }
  | { op: "undo"; before: PhaseSnapshot };
export interface PhaseResult {
  snapshot: PhaseSnapshot;
  before: PhaseSnapshot;
}
export async function loadPhases(project: string): Promise<PhaseSnapshot> {
  const { data, error } = await supabase.rpc("phase_snapshot", {
    p_project: project,
  });
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "Phase planning needs a database update. Apply migrate-phase-planning.sql, then refresh."
        : error.message,
    );
  return data;
}
export async function mutatePhases(
  project: string,
  expected: PhaseSnapshot,
  action: PhaseAction,
): Promise<PhaseResult> {
  const { data, error } = await supabase.rpc("phase_mutate", {
    p_project: project,
    p_expected: expected,
    p_action: action,
  });
  if (error) throw new Error(error.message);
  return data;
}
export function phasePercent(phase: Pick<Phase, "total" | "completed">) {
  return phase.total ? Math.round((phase.completed / phase.total) * 100) : 0;
}
export function phaseDuration(
  phase: Pick<Phase, "effective_start" | "effective_end">,
) {
  return phase.effective_start && phase.effective_end
    ? dayNumber(phase.effective_end) - dayNumber(phase.effective_start) + 1
    : null;
}
export function phaseRangeLabel(phase?: Phase) {
  if (!phase) return "Phase unscheduled";
  const duration = phaseDuration(phase);
  return duration === null
    ? "Phase unscheduled"
    : `${phase.effective_start} – ${phase.effective_end} · ${duration} ${duration === 1 ? "day" : "days"}`;
}
export function phaseBoardHref(phase: Phase) {
  return `/board?board=${encodeURIComponent(phase.board_id)}${phase.category_id ? `&category=${encodeURIComponent(phase.category_id)}` : ""}`;
}
