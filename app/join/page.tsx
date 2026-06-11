"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { setActiveWorkspace } from "@/lib/session";
import { redeemInvite } from "@/lib/workspacesRepo";
import "../login/auth.css";

/**
 * Invite landing page: /join?token=<uuid>. Signed-in users are added to the
 * workspace and sent home; signed-out users are bounced to /login first (the
 * auth callback replays the stored redirect so the token isn't lost).
 */
export default function JoinPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = new URLSearchParams(window.location.search).get("token");
      if (!token) {
        setError("This invite link is missing its token.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session) {
        // Resume here after OAuth (read back by app/auth/callback).
        try {
          localStorage.setItem("gd-post-login-redirect", `/join?token=${token}`);
        } catch {
          /* private mode: the user can re-open the invite link after login */
        }
        router.replace("/login");
        return;
      }

      const workspaceId = await redeemInvite(token);
      if (cancelled) return;
      setActiveWorkspace(workspaceId);
      router.replace("/home");
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Could not join the workspace.");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="auth">
      <div className="auth-card">
        {error ? (
          <>
            <h1 className="auth-title">Couldn’t join</h1>
            <p className="auth-error">{error}</p>
            <div className="auth-providers">
              <button type="button" className="auth-btn" onClick={() => router.replace("/home")}>
                <span>Go home</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="auth-title">Joining workspace…</h1>
            <p className="auth-sub">One moment while we add you to the team.</p>
          </>
        )}
      </div>
    </main>
  );
}
