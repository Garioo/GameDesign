import { supabase } from "./supabase";
import type { TLAssetStore } from "tldraw";

/* ---------------------------------------------------------------------------
 * tldraw asset store backed by Supabase Storage.
 *
 * Without this, tldraw inlines images as base64 inside the scene JSON, which
 * bloats every save and breaks realtime sync (broadcast messages are capped
 * around 256KB). Here the file goes to the public `canvas-assets` bucket and
 * only the URL travels with the scene.
 * ------------------------------------------------------------------------- */

const BUCKET = "canvas-assets";
const PUBLIC_MARKER = `/object/public/${BUCKET}/`;

/** True when a src URL points into our canvas-assets bucket. */
export function isCanvasAssetUrl(src: string): boolean {
  return src.includes(PUBLIC_MARKER);
}

/** Delete uploaded files by their public URLs (e.g. when shapes are erased). */
export async function removeAssetUrls(srcs: string[]): Promise<void> {
  const paths = srcs
    .map((src) => {
      const i = src.indexOf(PUBLIC_MARKER);
      return i >= 0 ? decodeURIComponent(src.slice(i + PUBLIC_MARKER.length)) : null;
    })
    .filter((p): p is string => !!p);
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.error(`asset cleanup failed: ${error.message}`);
}

export const canvasAssetStore: TLAssetStore = {
  async upload(_asset, file) {
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined,
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw new Error(`Image upload failed: ${error.message}`);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { src: data.publicUrl };
  },
};
