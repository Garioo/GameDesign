import { supabase } from "./supabase";
import { appUrl } from "./siteUrl";

/* ---------------------------------------------------------------------------
 * Workspaces (projects) the user belongs to, plus invite links.
 * RLS: projects_insert lets a user create a project they own (the
 * on_project_created trigger adds their membership), invites_insert lets any
 * member mint a link, and the redeem_invite() RPC joins the caller.
 * ------------------------------------------------------------------------- */

export interface WorkspaceSummary {
  id: string;
  name: string;
  tagline: string;
  genre: string;
  role: string; // caller's role: owner | editor | viewer
  memberCount: number;
}

/** All workspaces the user is a member of, newest first. */
export async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("role, project:project_id (id, name, tagline, genre, created_at)")
    .eq("user_id", userId);
  if (error) throw new Error(`listWorkspaces failed: ${error.message}`);

  interface ProjectRow {
    id: string;
    name: string;
    tagline: string | null;
    genre: string | null;
    created_at: string;
  }
  const rows: { role: string; project: ProjectRow }[] = [];
  for (const row of (data ?? []) as { role: string; project: ProjectRow | ProjectRow[] | null }[]) {
    const p = Array.isArray(row.project) ? row.project[0] : row.project;
    if (p?.id) rows.push({ role: row.role, project: p });
  }
  rows.sort((a, b) => b.project.created_at.localeCompare(a.project.created_at));

  // one round trip for all member counts
  const ids = rows.map((r) => r.project.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: memberRows, error: countError } = await supabase
      .from("project_members")
      .select("project_id")
      .in("project_id", ids);
    if (countError) throw new Error(`listWorkspaces counts failed: ${countError.message}`);
    for (const m of (memberRows ?? []) as { project_id: string }[]) {
      counts.set(m.project_id, (counts.get(m.project_id) ?? 0) + 1);
    }
  }

  return rows.map((r) => ({
    id: r.project.id,
    name: r.project.name,
    tagline: r.project.tagline ?? "",
    genre: r.project.genre ?? "",
    role: r.role,
    memberCount: counts.get(r.project.id) ?? 1,
  }));
}

/** Create a workspace owned by the caller; the DB trigger adds membership. */
export async function createWorkspace(
  userId: string,
  name: string,
  tagline = "",
  genre = "",
): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, tagline, genre, owner: userId })
    .select("id")
    .single();
  if (error) throw new Error(`createWorkspace failed: ${error.message}`);
  return data.id as string;
}

/** Mint an invite link for a workspace. Valid 14 days (DB default). */
export async function createInviteLink(projectId: string, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({ project_id: projectId, created_by: userId })
    .select("token")
    .single();
  if (error) throw new Error(`createInviteLink failed: ${error.message}`);
  return appUrl(`/join?token=${data.token}`);
}

/** Redeem an invite token; returns the joined workspace id. */
export async function redeemInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("redeem_invite", { p_token: token });
  if (error) throw new Error(`redeem_invite failed: ${error.message}`);
  return data as string;
}
