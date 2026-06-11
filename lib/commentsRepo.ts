import { supabase } from "./supabase";
import { cleanText, LIMITS } from "./validate";

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

export interface CommentMetaRow {
  page_id: string;
  author: string; // profiles.id
  created_at: string; // ISO timestamp
}

/**
 * Recent comment metadata across many pages, newest first — enough for the
 * home dashboard's "For you" view without pulling comment bodies.
 */
export async function listRecentCommentMeta(
  pageIds: string[],
  limit = 200,
): Promise<CommentMetaRow[]> {
  if (pageIds.length === 0) return [];
  const { data, error } = await supabase
    .from("comments")
    .select("page_id, author, created_at")
    .in("page_id", pageIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentCommentMeta failed: ${error.message}`);
  return (data ?? []) as CommentMetaRow[];
}

/** Post a comment (or a reply, when parentId is given). */
export async function addComment(
  pageId: string,
  author: string,
  body: string,
  parentId: string | null = null,
): Promise<void> {
  const text = cleanText(body, LIMITS.comment, "Comment");
  if (!text) return;
  const { error } = await supabase
    .from("comments")
    .insert({ page_id: pageId, author, body: text, parent_id: parentId });
  if (error) throw new Error(`addComment failed: ${error.message}`);
}

/** Edit a comment's body (the UI only offers this on the caller's own rows). */
export async function editComment(id: string, body: string): Promise<void> {
  const text = cleanText(body, LIMITS.comment, "Comment");
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
