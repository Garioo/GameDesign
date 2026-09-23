import { supabase } from "./supabase";
import type { CommentRow } from "./commentsRepo";
import type { ProfileInfo } from "./docsRepo";

/* ---------------------------------------------------------------------------
 * Share links for a single page (supabase/migrate-page-shares.sql).
 *
 * Editors create, list and revoke links (page_shares, RLS: editors only).
 * Guests never touch the tables: they read the page and comment through the
 * shared_page / *_shared_page_comment functions, which only work for the page
 * the token belongs to.
 * ------------------------------------------------------------------------- */

const NEEDS_MIGRATION = "Sharing a single page needs a database update. Apply supabase/migrate-page-shares.sql in Supabase.";
const isMissing = (e: { code?: string }) => ["42P01", "PGRST205", "PGRST202", "42883"].includes(e.code ?? "");

export interface PageShare {
  id: string;
  token: string;
  allowComments: boolean;
  createdAt: string;
  createdBy: string | null;
}

export const shareUrl = (token: string) => `${window.location.origin}/share/${token}`;

/** Active (not revoked) links for a page, newest first. */
export async function listPageShares(pageId: string): Promise<PageShare[]> {
  const { data, error } = await supabase
    .from("page_shares")
    .select("id, token, allow_comments, created_at, created_by")
    .eq("page_id", pageId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(isMissing(error) ? NEEDS_MIGRATION : `listPageShares failed: ${error.message}`);
  return ((data ?? []) as { id: string; token: string; allow_comments: boolean; created_at: string; created_by: string | null }[]).map((r) => ({
    id: r.id,
    token: r.token,
    allowComments: r.allow_comments,
    createdAt: r.created_at,
    createdBy: r.created_by,
  }));
}

export async function createPageShare(pageId: string, allowComments = true): Promise<PageShare> {
  // project_id comes from the page (trigger), before the editor check runs.
  const { data, error } = await supabase
    .from("page_shares")
    .insert({ page_id: pageId, allow_comments: allowComments })
    .select("id, token, allow_comments, created_at, created_by")
    .single();
  if (error) {
    throw new Error(isMissing(error) ? NEEDS_MIGRATION : error.code === "42501" ? "Only editors can share pages." : `createPageShare failed: ${error.message}`);
  }
  const r = data as { id: string; token: string; allow_comments: boolean; created_at: string; created_by: string | null };
  return { id: r.id, token: r.token, allowComments: r.allow_comments, createdAt: r.created_at, createdBy: r.created_by };
}

export async function setShareComments(id: string, allowComments: boolean): Promise<void> {
  const { error } = await supabase.from("page_shares").update({ allow_comments: allowComments }).eq("id", id);
  if (error) throw new Error(`setShareComments failed: ${error.message}`);
}

/** Stop a link working. Kept (revoked) rather than deleted, so it can't be recreated. */
export async function revokePageShare(id: string): Promise<void> {
  const { error } = await supabase.from("page_shares").update({ revoked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`revokePageShare failed: ${error.message}`);
}

/* ---------- guest side ---------- */

export interface SharedPage {
  allowComments: boolean;
  /** The viewer's user id, or null when signed out. */
  me: string | null;
  workspace: string;
  page: { id: string; title: string; summary: string | null; status: string; updatedAt: string };
  blocks: { id: string; type: string; content: Record<string, unknown> }[];
  comments: CommentRow[];
  people: ProfileInfo[];
}

/** The shared page, or null when the link doesn't exist, was revoked or the page was trashed. */
export async function loadSharedPage(token: string): Promise<SharedPage | null> {
  const { data, error } = await supabase.rpc("shared_page", { p_token: token });
  if (error) throw new Error(isMissing(error) ? NEEDS_MIGRATION : error.message);
  if (!data) return null;
  const d = data as {
    allow_comments: boolean;
    me: string | null;
    workspace: string | null;
    page: { id: string; title: string; summary: string | null; status: string; updated_at: string };
    blocks: SharedPage["blocks"];
    comments: CommentRow[];
    people: { id: string; name: string; initials: string | null; color: string | null }[];
  };
  return {
    allowComments: d.allow_comments,
    me: d.me,
    workspace: d.workspace ?? "",
    page: { id: d.page.id, title: d.page.title, summary: d.page.summary, status: d.page.status, updatedAt: d.page.updated_at },
    blocks: d.blocks ?? [],
    comments: d.comments ?? [],
    people: (d.people ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      initials: p.initials || p.name.slice(0, 2).toUpperCase(),
      color: p.color || "#a59a8c",
    })),
  };
}

export async function commentOnSharedPage(
  token: string,
  input: { body: string; parentId?: string | null; blockId?: string | null; quote?: string | null },
): Promise<void> {
  const body = input.body.trim();
  if (!body) throw new Error("Write a comment first.");
  const { error } = await supabase.rpc("comment_on_shared_page", {
    p_token: token,
    p_body: body.slice(0, 5000),
    p_parent: input.parentId ?? null,
    p_block: input.blockId ?? null,
    p_quote: input.quote ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function editSharedPageComment(token: string, commentId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("edit_shared_page_comment", { p_token: token, p_comment: commentId, p_body: body.trim().slice(0, 5000) });
  if (error) throw new Error(error.message);
}

export async function deleteSharedPageComment(token: string, commentId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_shared_page_comment", { p_token: token, p_comment: commentId });
  if (error) throw new Error(error.message);
}
