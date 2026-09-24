import { supabase } from "./supabase";
import { cleanText, HEX_COLOR_RE, LIMITS, REPO_RE, ValidationError } from "./validate";

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
  const clean: Partial<WorkspaceInfo> = {};
  if (patch.name !== undefined) {
    clean.name = cleanText(patch.name, LIMITS.name, "Workspace name");
    if (!clean.name) throw new ValidationError("Workspace name is required");
  }
  if (patch.tagline !== undefined) clean.tagline = cleanText(patch.tagline, LIMITS.tagline, "Tagline");
  if (patch.genre !== undefined) clean.genre = cleanText(patch.genre, LIMITS.genre, "Genre");
  if (patch.repo !== undefined) {
    clean.repo = patch.repo.trim();
    if (clean.repo && !REPO_RE.test(clean.repo)) {
      throw new ValidationError('Repository must look like "owner/name"');
    }
  }
  const { error } = await supabase.from("projects").update(clean).eq("id", projectId);
  if (error) throw new Error(`updateWorkspaceInfo failed: ${error.message}`);
}

export interface ProfilePatch {
  name: string;
  initials: string;
  color: string;
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<void> {
  const clean: ProfilePatch = {
    name: cleanText(patch.name, LIMITS.profileName, "Name"),
    initials: cleanText(patch.initials, LIMITS.initials, "Initials").toUpperCase(),
    color: patch.color.trim(),
  };
  if (!clean.name) throw new ValidationError("Name is required");
  if (!HEX_COLOR_RE.test(clean.color)) throw new ValidationError("Color must be #rrggbb");
  const { error } = await supabase.from("profiles").update(clean).eq("id", userId);
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

/* ---------------------------------------------------------------------------
 * Workspace links: the team's Discord, Overleaf, Drive and GitHub, shown as
 * icons in the top bar (supabase/migrate-workspace-links.sql).
 * ------------------------------------------------------------------------- */

export const WORKSPACE_LINK_KINDS = ["discord", "overleaf", "drive", "github"] as const;
export type WorkspaceLinkKind = (typeof WORKSPACE_LINK_KINDS)[number];
export type WorkspaceLinks = Partial<Record<WorkspaceLinkKind, string>>;

/** The saved links; GitHub falls back to the workspace's linked repository. */
export async function getWorkspaceLinks(projectId: string): Promise<WorkspaceLinks> {
  const { data, error } = await supabase.from("projects").select("links, repo").eq("id", projectId).maybeSingle();
  if (error) {
    // Before the migration there is no links column: show just the repository, if any.
    if (!error.message.includes("links")) throw new Error(`getWorkspaceLinks failed: ${error.message}`);
    const { data: old } = await supabase.from("projects").select("repo").eq("id", projectId).maybeSingle();
    return old?.repo ? { github: `https://github.com/${old.repo}` } : {};
  }
  const saved = (data?.links ?? {}) as WorkspaceLinks;
  const links: WorkspaceLinks = {};
  for (const kind of WORKSPACE_LINK_KINDS) if (typeof saved[kind] === "string" && saved[kind]) links[kind] = saved[kind];
  if (!links.github && data?.repo) links.github = `https://github.com/${data.repo}`;
  return links;
}

/** Only http(s) addresses are kept; a bare "discord.gg/…" gets https:// added. */
export function cleanWorkspaceLink(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try { url = new URL(withScheme); } catch { throw new ValidationError(`“${text}” isn't a web address`); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ValidationError("Links must start with https://");
  if (url.href.length > 2000) throw new ValidationError("That link is too long");
  return url.href;
}

export async function updateWorkspaceLinks(projectId: string, links: WorkspaceLinks): Promise<void> {
  const clean: WorkspaceLinks = {};
  for (const kind of WORKSPACE_LINK_KINDS) {
    const url = cleanWorkspaceLink(links[kind] ?? "");
    if (url) clean[kind] = url;
  }
  const { data, error } = await supabase.from("projects").update({ links: clean }).eq("id", projectId).select("id");
  if (error) {
    throw new Error(error.message.includes("links")
      ? "Workspace links need a database update. Apply supabase/migrate-workspace-links.sql in Supabase."
      : `updateWorkspaceLinks failed: ${error.message}`);
  }
  // RLS filters instead of erroring: no row back means viewer access.
  if (!data?.length) throw new Error("Only editors can change the workspace links.");
}
