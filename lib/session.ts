import { supabase } from "./supabase";
import { captureGithubToken, clearGithubToken } from "./github";

export interface SessionInfo {
  userId: string;
  /** Empty string until the user has onboarded into (or been invited to) a workspace. */
  workspaceId: string;
  /** The user's role in the active workspace ("viewer" until one resolves). */
  role: "owner" | "editor" | "viewer";
  name: string;
  initials: string;
  color: string;
  /** False until the first-run onboarding flow has been completed. */
  onboarded: boolean;
}

export const PALETTE = ["#5a83d6", "#3f9d6e", "#d4763a", "#b7553d", "#7b61c9", "#c2417a"];
/** Display names for PALETTE entries, same order (swatch labels/tooltips). */
export const PALETTE_NAMES = ["Blue", "Green", "Orange", "Rust", "Violet", "Magenta"];
const NAMES = ["Ash", "Wren", "Juniper", "Soot", "Cinder", "Pike", "Bram", "Hazel", "Fen", "Marlow"];

/** Suggest avatar initials from a display name ("Marius Qvarnström" → "MQ"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const second = words.length > 1 ? words[1][0] : (words[0][1] ?? "");
  return (words[0][0] + second).toUpperCase();
}

function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

/** localStorage key remembering which workspace the user last opened. */
const ACTIVE_WORKSPACE_KEY = "gd-active-workspace";

/** Remember the workspace to open on the next ensureSession() call. */
export function setActiveWorkspace(workspaceId: string): void {
  try {
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
  } catch {
    /* storage unavailable (private mode) — session still works, just unsticky */
  }
}

/**
 * Sign out and scrub per-user state from localStorage — most importantly the
 * GitHub provider token (repo scope), which must not outlive the session on
 * a shared machine. Every sign-out path should go through here.
 */
export async function signOutAndClear(): Promise<void> {
  clearGithubToken();
  try {
    localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    /* storage unavailable — nothing stored */
  }
  await supabase.auth.signOut();
}

/**
 * The remembered workspace id, if any — a hint for rendering cached data
 * before ensureSession() resolves. Membership is NOT verified here.
 */
export function storedActiveWorkspace(): string | null {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

/**
 * Resolve which workspace this session should open (and the caller's role in
 * it): the remembered one if the user is still a member, otherwise their
 * first membership. Users with no memberships get "" — the onboarding flow
 * creates their first workspace. (The legacy ensure_workspace() auto-join of
 * the shared bootstrap workspace is gone: strangers signing in no longer
 * gain edit access to anything.)
 */
async function resolveWorkspace(
  userId: string,
): Promise<{ workspaceId: string; role: SessionInfo["role"] }> {
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id, role")
    .eq("user_id", userId);
  if (error) throw new Error(`resolveWorkspace failed: ${error.message}`);

  const memberships = (data ?? []).map((r) => ({
    workspaceId: r.project_id as string,
    role: (r.role as SessionInfo["role"]) ?? "viewer",
  }));
  const stored = storedActiveWorkspace();
  const remembered = stored && memberships.find((m) => m.workspaceId === stored);
  if (remembered) return remembered;
  if (memberships.length > 0) return memberships[0];
  return { workspaceId: "", role: "viewer" };
}

/**
 * If the user is signed in (Google or GitHub), ensure they belong to a
 * workspace and have a presentable profile, then return their session info.
 * Returns `null` when there is no session — the caller should redirect to /login.
 */
export async function ensureSession(): Promise<SessionInfo | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;
  captureGithubToken(session); // present right after an OAuth sign-in
  const userId = session.user.id;

  // Give the anonymous user a friendly identity if the profile is blank.
  const name = pick(NAMES, userId);
  const color = pick(PALETTE, userId);
  const initials = name.slice(0, 2).toUpperCase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, initials, color, onboarded_at")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.name) {
    await supabase
      .from("profiles")
      .update({ name, initials, color })
      .eq("id", userId);
  }

  const onboarded = !!profile?.onboarded_at;
  const { workspaceId, role } = await resolveWorkspace(userId);
  if (workspaceId) setActiveWorkspace(workspaceId);

  return {
    userId,
    workspaceId,
    role,
    name: profile?.name ?? name,
    initials: profile?.initials ?? initials,
    color: profile?.color ?? color,
    onboarded,
  };
}
