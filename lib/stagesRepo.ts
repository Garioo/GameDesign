import { supabase } from "./supabase";
import type { ScheduleSnapshot } from "./ganttRepo";
export interface StageDraft {
  id: string;
  name: string;
  color: string;
  completed: boolean;
}
export interface StageSnapshot {
  schedule: ScheduleSnapshot;
  board: { id: string; name: string; color?: string; end_date?: string | null } | null;
}
export async function loadStageSnapshot(
  project: string,
  board: string,
): Promise<StageSnapshot> {
  const { data, error } = await supabase.rpc("board_stage_snapshot", {
    p_project: project,
    p_board: board,
  });
  if (error) throw new Error(error.message);
  return data;
}
export async function saveBoardStages(
  project: string,
  board: string | null,
  expected: StageSnapshot | null,
  name: string,
  stages: StageDraft[],
  transfers: Record<string, string> = {},
  /** Sets the board's own color; omit to leave it as-is (or '#64748b' on creation). Omitting the
   *  key entirely (rather than sending null) also keeps this call compatible with a workspace
   *  that hasn't applied the board-color migration yet, as long as no color change is requested. */
  color?: string,
): Promise<string> {
  const params: Record<string, unknown> = {
    p_project: project,
    p_board: board,
    p_expected: expected,
    p_name: name,
    p_stages: stages,
    p_transfers: transfers,
  };
  if (color !== undefined) params.p_color = color;
  const { data, error } = await supabase.rpc("save_board_stages", params);
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "Custom stages are not available yet. The workspace needs the custom-stages (and, for board colors, board-color) database update."
        : error.message,
    );
  return data;
}
