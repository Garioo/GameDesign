import { supabase } from "./supabase";

/* ---------------------------------------------------------------------------
 * Notifications: @-mentions in comments and task assignments. Rows are
 * inserted server-side only (SECURITY DEFINER triggers in
 * supabase/migrate-notifications.sql) — the client only ever reads its own
 * and marks them read/dismissed, both enforced by RLS.
 * ------------------------------------------------------------------------- */

export interface NotificationRow {
  id: string;
  project_id: string;
  user_id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_initials: string | null;
  actor_color: string | null;
  kind: "mention" | "assignment" | "reply" | "page_owner" | "event";
  snippet: string;
  link: string;
  read_at: string | null;
  created_at: string;
}

function notificationsError(error: { code?: string; message: string }) {
  return new Error(
    error.code === "PGRST205" || error.code === "42P01"
      ? "Notifications need a database update. Apply supabase/migrate-notifications.sql in Supabase."
      : error.message,
  );
}

/** Recent notifications for the signed-in user in this workspace, newest first. */
/** "mentioned you in a comment", "replied to your thread", … — the sentence after the actor's name. */
export function notificationVerb(n: Pick<NotificationRow, "kind" | "link">): string {
  const onTask = n.link.includes("card=");
  switch (n.kind) {
    case "mention": return onTask ? "mentioned you on a task" : "mentioned you in a comment";
    case "reply": return onTask ? "replied on a task thread" : "replied to a thread you're in";
    case "page_owner": return "made you owner of a page";
    case "event": return "added you to an event";
    default: return "assigned you a task";
  }
}

export async function listNotifications(workspaceId: string, limit = 50): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notification_rows")
    .select("*")
    .eq("project_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw notificationsError(error);
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw notificationsError(error);
}

export async function markAllNotificationsRead(workspaceId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("project_id", workspaceId)
    .is("read_at", null);
  if (error) throw notificationsError(error);
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw notificationsError(error);
}
