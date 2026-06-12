import { supabase } from "./supabase";
import { appUrl } from "./siteUrl";
import { cleanText, LIMITS, ValidationError } from "./validate";

/* ---------------------------------------------------------------------------
 * Workspaces (projects) the user belongs to, membership management, and
 * invite links. The owner grants access: RLS only lets the project owner
 * mint invites, change member roles (editor/viewer), and remove members.
 * Non-owners can remove themselves (leave). Ownership transfer is an UPDATE
 * of projects.owner — DB triggers validate it and sync membership roles.
 * ------------------------------------------------------------------------- */

export type MemberRole = "owner" | "editor" | "viewer";
/** Roles an invite or a role change can grant (never "owner"). */
export type GrantableRole = Exclude<MemberRole, "owner">;

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
  name = cleanText(name, LIMITS.name, "Workspace name");
  if (!name) throw new ValidationError("Workspace name is required");
  tagline = cleanText(tagline, LIMITS.tagline, "Tagline");
  genre = cleanText(genre, LIMITS.genre, "Genre");
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, tagline, genre, owner: userId })
    .select("id")
    .single();
  if (error) throw new Error(`createWorkspace failed: ${error.message}`);
  return data.id as string;
}

/** Mint an invite link for a workspace (owner only). Valid 14 days (DB default). */
export async function createInviteLink(
  projectId: string,
  userId: string,
  role: GrantableRole = "editor",
): Promise<string> {
  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({ project_id: projectId, created_by: userId, role })
    .select("token")
    .single();
  if (error) throw new Error(`createInviteLink failed: ${error.message}`);
  return appUrl(`/join?token=${data.token}`);
}

export interface WorkspaceMember {
  id: string; // profiles.id
  name: string;
  initials: string;
  color: string;
  role: MemberRole;
}

/** Workspace members with their roles, owner first then by name. */
export async function listWorkspaceMembers(projectId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("role, profile:user_id (id, name, initials, color)")
    .eq("project_id", projectId);
  if (error) throw new Error(`listWorkspaceMembers failed: ${error.message}`);

  interface ProfileRow {
    id: string;
    name: string | null;
    initials: string | null;
    color: string | null;
  }
  const out: WorkspaceMember[] = [];
  for (const row of (data ?? []) as { role: string; profile: ProfileRow | ProfileRow[] | null }[]) {
    const p = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    if (!p?.id) continue;
    out.push({
      id: p.id,
      name: p.name || "Guest",
      initials: p.initials || (p.name || "G").slice(0, 2).toUpperCase(),
      color: p.color || "#a59a8c",
      role: (row.role as MemberRole) ?? "editor",
    });
  }
  out.sort((a, b) =>
    a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.name.localeCompare(b.name),
  );
  return out;
}

/** Change another member's role between editor and viewer (owner only). */
export async function setMemberRole(
  projectId: string,
  userId: string,
  role: GrantableRole,
): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(`setMemberRole failed: ${error.message}`);
}

/** Remove a member from the workspace (owner only; never the owner's row). */
export async function removeMember(projectId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(`removeMember failed: ${error.message}`);
}

/**
 * Transfer workspace ownership to another member (owner only — enforced by
 * the protect_project_owner trigger). The caller becomes an editor.
 */
export async function transferOwnership(projectId: string, newOwnerId: string): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ owner: newOwnerId })
    .eq("id", projectId);
  if (error) throw new Error(`transferOwnership failed: ${error.message}`);
}

/** Redeem an invite token; returns the joined workspace id. */
export async function redeemInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc("redeem_invite", { p_token: token });
  if (error) throw new Error(`redeem_invite failed: ${error.message}`);
  return data as string;
}
