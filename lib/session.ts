import { supabase } from "./supabase";
import { captureGithubToken } from "./github";

export interface SessionInfo {
  userId: string;
  /** Empty string until the user has onboarded into (or been invited to) a workspace. */
  workspaceId: string;
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
 * Resolve which workspace this session should open: the remembered one if the
 * user is still a member, otherwise their first membership. Users who haven't
 * onboarded yet get "" — the onboarding flow creates their first workspace.
 * (The shared bootstrap workspace remains only as a legacy fallback for
 * onboarded users with no memberships left.)
 */
async function resolveWorkspace(userId: string, onboarded: boolean): Promise<string> {
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", userId);
  if (error) throw new Error(`resolveWorkspace failed: ${error.message}`);

  const memberships = (data ?? []).map((r) => r.project_id as string);
  const stored = storedActiveWorkspace();
  if (stored && memberships.includes(stored)) return stored;
  if (memberships.length > 0) return memberships[0];
  if (!onboarded) return "";

  const { data: workspaceId, error: rpcError } = await supabase.rpc("ensure_workspace");
  if (rpcError) throw new Error(`ensure_workspace failed: ${rpcError.message}`);
  return workspaceId as string;
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
  const workspaceId = await resolveWorkspace(userId, onboarded);
  if (workspaceId) setActiveWorkspace(workspaceId);

  return {
    userId,
    workspaceId,
    name: profile?.name ?? name,
    initials: profile?.initials ?? initials,
    color: profile?.color ?? color,
    onboarded,
  };
}
