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
  board: { id: string; name: string } | null;
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
): Promise<string> {
  const { data, error } = await supabase.rpc("save_board_stages", {
    p_project: project,
    p_board: board,
    p_expected: expected,
    p_name: name,
    p_stages: stages,
    p_transfers: transfers,
  });
  if (error)
    throw new Error(
      error.code === "PGRST202"
        ? "Custom stages are not available yet. The workspace needs the custom-stages database update."
        : error.message,
    );
  return data;
}
