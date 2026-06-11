import { supabase } from "./supabase";

/* ---------------------------------------------------------------------------
 * Settings: own profile, workspace (project) info, and membership.
 * RLS: profiles_update lets users edit their own row, projects_update lets
 * any member edit the project, members_delete lets a member remove their
 * own membership row.
 * ------------------------------------------------------------------------- */

export interface WorkspaceInfo {
  name: string;
  tagline: string;
  genre: string;
  repo: string; // linked GitHub repository, "owner/name" ("" = none)
}

export async function getWorkspaceInfo(projectId: string): Promise<WorkspaceInfo | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("name, tagline, genre, repo")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(`getWorkspaceInfo failed: ${error.message}`);
  if (!data) return null;
  return {
    name: data.name ?? "",
    tagline: data.tagline ?? "",
    genre: data.genre ?? "",
    repo: data.repo ?? "",
  };
}

export async function updateWorkspaceInfo(
  projectId: string,
  patch: Partial<WorkspaceInfo>,
): Promise<void> {
  const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
  if (error) throw new Error(`updateWorkspaceInfo failed: ${error.message}`);
}

export interface ProfilePatch {
  name: string;
  initials: string;
  color: string;
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<void> {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw new Error(`updateProfile failed: ${error.message}`);
}

/** Mark the first-run onboarding flow as completed. */
export async function completeOnboarding(userId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw new Error(`completeOnboarding failed: ${error.message}`);
}

/** Remove the caller's own membership row. The caller should sign out after. */
export async function leaveWorkspace(projectId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(`leaveWorkspace failed: ${error.message}`);
}
