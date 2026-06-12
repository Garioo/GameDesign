import { supabase } from "./supabase";
import { isCanvasAssetUrl, removeAssetUrls } from "./canvasAssets";
import { assertMaxBytes, cleanText, LIMITS } from "./validate";

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
  folderId: string | null;
}

export interface CanvasFolderInfo {
  id: string;
  name: string;
  position: number;
}

/** Anything the canvas editor wants to persist (shapes, etc.). */
export type CanvasScene = Record<string, unknown>;

/** List a workspace's canvases, ordered. */
export async function listCanvases(workspaceId: string): Promise<CanvasInfo[]> {
  const { data } = await supabase
    .from("canvases")
    .select("id, name, position, updated_at, folder_id")
    .eq("project_id", workspaceId)
    .order("position", { ascending: true });
  return ((data ?? []) as { id: string; name: string; position: number; updated_at: string; folder_id: string | null }[]).map(
    (r) => ({ id: r.id, name: r.name, position: r.position, updatedAt: r.updated_at, folderId: r.folder_id }),
  );
}

/** Create a blank canvas (optionally inside a folder) and return it with its assigned position. */
export async function createCanvas(
  workspaceId: string,
  name = "Untitled canvas",
  folderId: string | null = null,
): Promise<CanvasInfo> {
  name = cleanText(name, LIMITS.name, "Canvas name") || "Untitled canvas";
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
    .insert({ project_id: workspaceId, name, position, folder_id: folderId })
    .select("id, name, position, updated_at, folder_id")
    .single();
  if (error || !data) throw new Error(`createCanvas failed: ${error?.message}`);
  return { id: data.id, name: data.name, position: data.position, updatedAt: data.updated_at, folderId: data.folder_id };
}

/** Rename a canvas. */
export async function renameCanvas(id: string, name: string): Promise<void> {
  const clean = cleanText(name, LIMITS.name, "Canvas name");
  if (!clean) return;
  await supabase.from("canvases").update({ name: clean }).eq("id", id);
}

/** Delete a canvas, cleaning up any images it had uploaded to Storage. */
export async function deleteCanvas(id: string): Promise<void> {
  try {
    const scene = (await loadCanvasScene(id)) as {
      document?: { store?: Record<string, { typeName?: string; props?: { src?: string } }> };
    };
    const srcs = Object.values(scene.document?.store ?? {})
      .filter((r) => r.typeName === "asset")
      .map((r) => r.props?.src)
      .filter((s): s is string => !!s && isCanvasAssetUrl(s));
    if (srcs.length) await removeAssetUrls(srcs);
  } catch (e) {
    console.error("canvas asset cleanup failed", e); // still delete the canvas
  }
  await supabase.from("canvases").delete().eq("id", id);
}

/** Move a canvas into a folder (or out of one with null). */
export async function moveCanvasToFolder(id: string, folderId: string | null): Promise<void> {
  await supabase.from("canvases").update({ folder_id: folderId }).eq("id", id);
}

/* ---------------------------------------------------------------------------
 * Folders — sidebar grouping for canvases.
 * ------------------------------------------------------------------------- */

/** List a workspace's canvas folders, ordered. */
export async function listCanvasFolders(workspaceId: string): Promise<CanvasFolderInfo[]> {
  const { data } = await supabase
    .from("canvas_folders")
    .select("id, name, position")
    .eq("project_id", workspaceId)
    .order("position", { ascending: true });
  return (data ?? []) as CanvasFolderInfo[];
}

/** Create a folder and return it with its assigned position. */
export async function createCanvasFolder(
  workspaceId: string,
  name: string,
): Promise<CanvasFolderInfo> {
  name = cleanText(name, LIMITS.name, "Folder name") || "Untitled folder";
  const { data: maxRow } = await supabase
    .from("canvas_folders")
    .select("position")
    .eq("project_id", workspaceId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = ((maxRow?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabase
    .from("canvas_folders")
    .insert({ project_id: workspaceId, name, position })
    .select("id, name, position")
    .single();
  if (error || !data) throw new Error(`createCanvasFolder failed: ${error?.message}`);
  return data as CanvasFolderInfo;
}

/** Find a folder by name (case-insensitive) or create it. Used by the board's
    "Open as canvas" so spun-off canvases all land in one place. */
export async function ensureCanvasFolder(
  workspaceId: string,
  name: string,
): Promise<CanvasFolderInfo> {
  const { data } = await supabase
    .from("canvas_folders")
    .select("id, name, position")
    .eq("project_id", workspaceId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (data) return data as CanvasFolderInfo;
  return createCanvasFolder(workspaceId, name);
}

/** Rename a folder. */
export async function renameCanvasFolder(id: string, name: string): Promise<void> {
  const clean = cleanText(name, LIMITS.name, "Folder name");
  if (!clean) return;
  await supabase.from("canvas_folders").update({ name: clean }).eq("id", id);
}

/** Delete a folder. Its canvases survive — folder_id is set null by the FK,
    so they reappear in the unfiled list. */
export async function deleteCanvasFolder(id: string): Promise<void> {
  await supabase.from("canvas_folders").delete().eq("id", id);
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
  assertMaxBytes(scene, LIMITS.sceneBytes, "Canvas scene");
  await supabase.from("canvases").update({ data: scene }).eq("id", id);
}
