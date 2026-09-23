import { supabase } from "./supabase";
import type { BlockContent, EditRow } from "./pageVersions";
import type { DigestEdit } from "./digest";

/* ---------------------------------------------------------------------------
 * A page's edit log: who changed which block, from what to what. Rows are
 * written only by the blocks trigger in supabase/migrate-page-edits.sql; the
 * client reads them and builds versions from them (lib/pageVersions.ts).
 * ------------------------------------------------------------------------- */

export interface EditAuthor {
  id: string;
  name: string;
  initials: string;
  color: string;
}

type One<T> = T | T[] | null;
const one = <T>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

interface Row {
  id: string;
  block_id: string;
  block_type: string;
  before_content: BlockContent | null;
  after_content: BlockContent | null;
  position: number;
  prev_block_id: string | null;
  created_at: string;
  updated_at: string;
  author: One<{ id: string; name: string | null; initials: string | null; color: string | null }>;
}

/** Newest rows first (by last change). `before` pages further back. */
export async function listPageEdits(
  pageId: string,
  { limit = 300, before }: { limit?: number; before?: string } = {},
): Promise<{ rows: EditRow[]; authors: Map<string, EditAuthor> }> {
  let q = supabase
    .from("page_edits")
    .select("id, block_id, block_type, before_content, after_content, position, prev_block_id, created_at, updated_at, author:author (id, name, initials, color)")
    .eq("page_id", pageId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("updated_at", before);
  const { data, error } = await q;
  if (error) {
    throw new Error(error.code === "42P01" || error.code === "PGRST205" || error.code === "42703"
      ? "Version history needs a database update. Apply supabase/migrate-page-edits.sql."
      : `listPageEdits failed: ${error.message}`);
  }
  const authors = new Map<string, EditAuthor>();
  const rows = ((data ?? []) as unknown as Row[]).map((r): EditRow => {
    const a = one(r.author);
    if (a && !authors.has(a.id)) {
      authors.set(a.id, {
        id: a.id,
        name: a.name || "Member",
        initials: a.initials || (a.name || "M").slice(0, 2).toUpperCase(),
        color: a.color || "#a59a8c",
      });
    }
    return {
      id: r.id,
      blockId: r.block_id,
      blockType: r.block_type,
      authorId: a?.id ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      beforeContent: r.before_content,
      afterContent: r.after_content,
      position: r.position,
      prevBlockId: r.prev_block_id,
    };
  });
  return { rows, authors };
}

interface WorkspaceEditRow {
  page_id: string;
  author: string | null;
  kind: "added" | "edited" | "removed";
  before_text: string;
  after_text: string;
  updated_at: string;
  page: One<{ title: string; deleted_at: string | null }>;
}

/**
 * Every edit row in a workspace between two instants (for the weekly
 * digest), with the page's live title. Pages through the log in chunks.
 */
export async function listWorkspaceEdits(workspaceId: string, from: Date, to: Date): Promise<DigestEdit[]> {
  const out: DigestEdit[] = [];
  const CHUNK = 1000;
  for (let offset = 0; offset < 20 * CHUNK; offset += CHUNK) {
    const { data, error } = await supabase
      .from("page_edits")
      .select("page_id, author, kind, before_text, after_text, updated_at, page:page_id (title, deleted_at)")
      .eq("project_id", workspaceId)
      .gte("updated_at", from.toISOString())
      .lt("updated_at", to.toISOString())
      .order("updated_at", { ascending: false })
      .range(offset, offset + CHUNK - 1);
    if (error) {
      throw new Error(error.code === "42P01" || error.code === "PGRST205" || error.code === "42703"
        ? "The digest needs the page history table. Apply supabase/migrate-page-edits.sql."
        : `listWorkspaceEdits failed: ${error.message}`);
    }
    const rows = (data ?? []) as unknown as WorkspaceEditRow[];
    for (const r of rows) {
      const page = one(r.page);
      out.push({
        pageId: r.page_id,
        pageTitle: page?.title ?? null,
        pageTrashed: !!page?.deleted_at,
        authorId: r.author,
        kind: r.kind,
        beforeText: r.before_text ?? "",
        afterText: r.after_text ?? "",
        updatedAt: r.updated_at,
      });
    }
    if (rows.length < CHUNK) break;
  }
  return out;
}
