import { supabase } from "./supabase";
import { cleanText, LIMITS } from "./validate";

/* ---------------------------------------------------------------------------
 * Threaded comments on a page or a board task. Backed by the `public.comments` table
 * (see supabase/schema.sql). RLS lets any project member read/insert and
 * authors delete their own — so we always insert with author = the signed-in
 * user id, and the UI only offers delete on the caller's own rows.
 * ------------------------------------------------------------------------- */

export interface CommentRow {
  id: string;
  page_id: string | null; // set for page comments
  card_id: string | null; // set for task comments (supabase/migrate-card-comments.sql)
  parent_id: string | null; // reply target, or null for a top-level comment
  author: string; // profiles.id
  body: string;
  created_at: string; // ISO timestamp
  updated_at: string | null; // set when the body was edited
  resolved_at: string | null; // set on root comments when the thread is resolved
  resolved_by: string | null; // profiles.id of whoever resolved it
}

/** What a comment thread hangs off: a page or a board task. */
export type CommentTarget = { pageId: string } | { cardId: string };

const targetColumn = (t: CommentTarget) =>
  "pageId" in t ? { column: "page_id", id: t.pageId } : { column: "card_id", id: t.cardId };

/** All comments on a page (or task), oldest first (so threads read top-to-bottom). */
export async function listComments(target: string | CommentTarget): Promise<CommentRow[]> {
  const { column, id } = targetColumn(typeof target === "string" ? { pageId: target } : target);
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq(column, id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listComments failed: ${error.message}`);
  return ((data ?? []) as CommentRow[]).map((r) => ({ ...r, card_id: r.card_id ?? null }));
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

/** Post a comment (or a reply, when parentId is given) on a page id or a target. */
export async function addComment(
  target: string | CommentTarget,
  author: string,
  body: string,
  parentId: string | null = null,
): Promise<void> {
  const text = cleanText(body, LIMITS.comment, "Comment");
  if (!text) return;
  const { column, id } = targetColumn(typeof target === "string" ? { pageId: target } : target);
  const { error } = await supabase
    .from("comments")
    .insert({ [column]: id, author, body: text, parent_id: parentId });
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

/**
 * Resolve / reopen a thread (root comments only). Any member may resolve —
 * comment UPDATE is author-only under RLS, so this goes through the
 * set_comment_resolved() SECURITY DEFINER function instead.
 */
export async function setCommentResolved(id: string, resolved: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_comment_resolved", {
    p_comment: id,
    p_resolved: resolved,
  });
  if (error) throw new Error(`setCommentResolved failed: ${error.message}`);
}

/** Delete a comment (RLS: the author, or the project owner; replies cascade via FK). */
export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) throw new Error(`deleteComment failed: ${error.message}`);
}
