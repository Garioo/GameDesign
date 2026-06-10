import { supabase } from "./supabase";

/* ---------------------------------------------------------------------------
 * Threaded comments on a page. Backed by the `public.comments` table
 * (see supabase/schema.sql). RLS lets any project member read/insert and
 * authors delete their own — so we always insert with author = the signed-in
 * user id, and the UI only offers delete on the caller's own rows.
 * ------------------------------------------------------------------------- */

export interface CommentRow {
  id: string;
  page_id: string;
  parent_id: string | null; // reply target, or null for a top-level comment
  author: string; // profiles.id
  body: string;
  created_at: string; // ISO timestamp
  updated_at: string | null; // set when the body was edited
  resolved_at: string | null; // set on root comments when the thread is resolved
  resolved_by: string | null; // profiles.id of whoever resolved it
}

/** All comments on a page, oldest first (so threads read top-to-bottom). */
export async function listComments(pageId: string): Promise<CommentRow[]> {
  const { data } = await supabase
    .from("comments")
    .select("id, page_id, parent_id, author, body, created_at, updated_at, resolved_at, resolved_by")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true });
  return (data ?? []) as CommentRow[];
}

/** Post a comment (or a reply, when parentId is given). */
export async function addComment(
  pageId: string,
  author: string,
  body: string,
  parentId: string | null = null,
): Promise<void> {
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase
    .from("comments")
    .insert({ page_id: pageId, author, body: text, parent_id: parentId });
  if (error) throw new Error(`addComment failed: ${error.message}`);
}

/** Edit a comment's body (the UI only offers this on the caller's own rows). */
export async function editComment(id: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) return;
  const { error } = await supabase
    .from("comments")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`editComment failed: ${error.message}`);
}

/** Resolve / reopen a thread (any member may; root comments only). */
export async function setCommentResolved(
  id: string,
  resolved: boolean,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("comments")
    .update(
      resolved
        ? { resolved_at: new Date().toISOString(), resolved_by: userId }
        : { resolved_at: null, resolved_by: null },
    )
    .eq("id", id);
  if (error) throw new Error(`setCommentResolved failed: ${error.message}`);
}

/** Delete a comment (RLS allows the author; replies cascade via FK). */
export async function deleteComment(id: string): Promise<void> {
  await supabase.from("comments").delete().eq("id", id);
}
