import { supabase } from "./supabase";

/* ---------------------------------------------------------------------------
 * Canvases — freeform visual boards. Each canvas stores its scene (shapes,
 * drawings, images) in a `data` jsonb column. This repo handles the list-level
 * CRUD (create / rename / delete / reorder) plus loading and saving the scene.
 * ------------------------------------------------------------------------- */

export interface CanvasInfo {
  id: string;
  name: string;
  position: number;
  updatedAt: string;
}

/** Anything the canvas editor wants to persist (shapes, etc.). */
export type CanvasScene = Record<string, unknown>;

/** List a workspace's canvases, ordered. */
export async function listCanvases(workspaceId: string): Promise<CanvasInfo[]> {
  const { data } = await supabase
    .from("canvases")
    .select("id, name, position, updated_at")
    .eq("project_id", workspaceId)
    .order("position", { ascending: true });
  return ((data ?? []) as { id: string; name: string; position: number; updated_at: string }[]).map(
    (r) => ({ id: r.id, name: r.name, position: r.position, updatedAt: r.updated_at }),
  );
}

/** Create a blank canvas and return it with its assigned position. */
export async function createCanvas(
  workspaceId: string,
  name = "Untitled canvas",
): Promise<CanvasInfo> {
  const { data: maxRow } = await supabase
    .from("canvases")
    .select("position")
    .eq("project_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((maxRow?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("canvases")
    .insert({ project_id: workspaceId, name, position })
    .select("id, name, position, updated_at")
    .single();
  if (error || !data) throw new Error(`createCanvas failed: ${error?.message}`);
  return { id: data.id, name: data.name, position: data.position, updatedAt: data.updated_at };
}

/** Rename a canvas. */
export async function renameCanvas(id: string, name: string): Promise<void> {
  await supabase.from("canvases").update({ name }).eq("id", id);
}

/** Delete a canvas. */
export async function deleteCanvas(id: string): Promise<void> {
  await supabase.from("canvases").delete().eq("id", id);
}

/** Persist new positions for a set of canvases. */
export async function reorderCanvases(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, i) => supabase.from("canvases").update({ position: i }).eq("id", id)),
  );
}

/** Load a single canvas's scene. */
export async function loadCanvasScene(id: string): Promise<CanvasScene> {
  const { data } = await supabase.from("canvases").select("data").eq("id", id).maybeSingle();
  return ((data?.data as CanvasScene) ?? {}) as CanvasScene;
}

/** Persist a canvas's scene. */
export async function saveCanvasScene(id: string, scene: CanvasScene): Promise<void> {
  await supabase.from("canvases").update({ data: scene }).eq("id", id);
}
