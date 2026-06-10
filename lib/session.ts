import { supabase } from "./supabase";
import { captureGithubToken } from "./github";

export interface SessionInfo {
  userId: string;
  workspaceId: string;
  name: string;
  initials: string;
  color: string;
}

export const PALETTE = ["#5a83d6", "#3f9d6e", "#d4763a", "#b7553d", "#7b61c9", "#c2417a"];
const NAMES = ["Ash", "Wren", "Juniper", "Soot", "Cinder", "Pike", "Bram", "Hazel", "Fen", "Marlow"];

function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

/**
 * If the user is signed in (Google or GitHub), ensure they belong to the shared
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

  // Create the shared project (if needed) and join it.
  const { data: workspaceId, error: rpcError } = await supabase.rpc("ensure_workspace");
  if (rpcError) throw new Error(`ensure_workspace failed: ${rpcError.message}`);

  // Give the anonymous user a friendly identity if the profile is blank.
  const name = pick(NAMES, userId);
  const color = pick(PALETTE, userId);
  const initials = name.slice(0, 2).toUpperCase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, initials, color")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.name) {
    await supabase
      .from("profiles")
      .update({ name, initials, color })
      .eq("id", userId);
  }

  return {
    userId,
    workspaceId: workspaceId as string,
    name: profile?.name ?? name,
    initials: profile?.initials ?? initials,
    color: profile?.color ?? color,
  };
}
