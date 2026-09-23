import { supabase } from "./supabase";

/* ---------------------------------------------------------------------------
 * A page's edit history: who changed which block's text, and from what to
 * what. Rows are written only by the blocks trigger in
 * supabase/migrate-page-edits.sql; the client just reads them.
 * ------------------------------------------------------------------------- */

export interface PageEdit {
  id: string;
  blockId: string;
  blockType: string;
  kind: "added" | "edited" | "removed";
  before: string;
  after: string;
  /** When this run of edits started / last changed. */
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; initials: string; color: string } | null;
}

type One<T> = T | T[] | null;
const one = <T>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

interface Row {
  id: string;
  block_id: string;
  block_type: string;
  kind: PageEdit["kind"];
  before_text: string;
  after_text: string;
  created_at: string;
  updated_at: string;
  author: One<{ id: string; name: string | null; initials: string | null; color: string | null }>;
}

export async function listPageEdits(
  pageId: string,
  { limit = 40, before }: { limit?: number; before?: string } = {},
): Promise<PageEdit[]> {
  let q = supabase
    .from("page_edits")
    .select("id, block_id, block_type, kind, before_text, after_text, created_at, updated_at, author:author (id, name, initials, color)")
    .eq("page_id", pageId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("updated_at", before);
  const { data, error } = await q;
  if (error) {
    throw new Error(error.code === "42P01" || error.code === "PGRST205"
      ? "Edit history needs a database update. Apply supabase/migrate-page-edits.sql."
      : `listPageEdits failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const a = one(r.author);
    return {
      id: r.id,
      blockId: r.block_id,
      blockType: r.block_type,
      kind: r.kind,
      before: r.before_text,
      after: r.after_text,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      author: a
        ? { id: a.id, name: a.name || "Member", initials: a.initials || (a.name || "M").slice(0, 2).toUpperCase(), color: a.color || "#a59a8c" }
        : null,
    };
  });
}
