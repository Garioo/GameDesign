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
