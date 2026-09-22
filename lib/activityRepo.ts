import { supabase } from "./supabase";

/* ---------------------------------------------------------------------------
 * The team activity feed. Rows are written only by database triggers
 * (supabase/migrate-activity.sql); the client just reads them. Live titles of
 * the page/task/canvas are embedded so renamed things read correctly; the
 * row's `target` is the name at the time, used when the thing is gone.
 * ------------------------------------------------------------------------- */

export type ActivityAction =
  | "page.created"
  | "page.status"
  | "page.trashed"
  | "page.restored"
  | "card.created"
  | "card.moved"
  | "card.assigned"
  | "comment.added"
  | "canvas.created"
  | "member.joined";

export interface ActivityItem {
  id: string;
  action: ActivityAction | string;
  target: string | null;
  pageId: string | null;
  cardId: string | null;
  canvasId: string | null;
  meta: {
    from?: string;
    to?: string;
    done?: boolean;
    board?: string;
    board_name?: string;
    count?: number;
    users?: string[];
    snippet?: string;
    subpages?: number;
    role?: string;
  };
  createdAt: string;
  actor: { id: string; name: string; initials: string; color: string } | null;
  /** Live names; null when the thing was deleted. */
  pageTitle: string | null;
  pageTrashed: boolean;
  cardTitle: string | null;
  canvasName: string | null;
}

type One<T> = T | T[] | null;
const one = <T>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

interface Row {
  id: string;
  action: string;
  target: string | null;
  page_id: string | null;
  card_id: string | null;
  canvas_id: string | null;
  meta: ActivityItem["meta"] | null;
  created_at: string;
  actor: One<{ id: string; name: string | null; initials: string | null; color: string | null }>;
  page: One<{ title: string; deleted_at: string | null }>;
  card: One<{ title: string }>;
  canvas: One<{ name: string }>;
}

export async function listActivity(
  workspaceId: string,
  { limit = 30, before, pageId, cardId }: { limit?: number; before?: string; pageId?: string; cardId?: string } = {},
): Promise<ActivityItem[]> {
  let q = supabase
    .from("activity")
    .select(
      "id, action, target, page_id, card_id, canvas_id, meta, created_at, " +
        "actor:actor (id, name, initials, color), page:page_id (title, deleted_at), card:card_id (title), canvas:canvas_id (name)",
    )
    .eq("project_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("created_at", before);
  if (pageId) q = q.eq("page_id", pageId);
  if (cardId) q = q.eq("card_id", cardId);
  const { data, error } = await q;
  if (error) {
    throw new Error(error.code === "PGRST200" || error.code === "42703"
      ? "The activity feed needs a database update. Apply supabase/migrate-activity.sql."
      : `listActivity failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const actor = one(r.actor);
    const page = one(r.page);
    return {
      id: r.id,
      action: r.action,
      target: r.target,
      pageId: r.page_id,
      cardId: r.card_id,
      canvasId: r.canvas_id,
      meta: r.meta ?? {},
      createdAt: r.created_at,
      actor: actor
        ? { id: actor.id, name: actor.name || "Member", initials: actor.initials || (actor.name || "M").slice(0, 2).toUpperCase(), color: actor.color || "#a59a8c" }
        : null,
      pageTitle: page?.title ?? null,
      pageTrashed: !!page?.deleted_at,
      cardTitle: one(r.card)?.title ?? null,
      canvasName: one(r.canvas)?.name ?? null,
    };
  });
}
