"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { captureGithubToken } from "@/lib/github";
import "../../login/auth.css";

/**
 * Lands here after the OAuth provider redirects back. The browser Supabase
 * client (detectSessionInUrl) parses the auth response and stores the session;
 * we wait for it, then send the user into the app.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Surface provider errors passed back in the query string.
    const params = new URLSearchParams(window.location.search);
    const errDesc = params.get("error_description") ?? params.get("error");
    if (errDesc) {
      setError(errDesc);
      return;
    }

    let done = false;
    const finish = (path: string) => {
      if (done) return;
      done = true;
      router.replace(path);
    };

    // If the session is already available, go straight in.
    supabase.auth.getSession().then(({ data }) => {
      captureGithubToken(data.session); // GitHub token only exists right now
      if (data.session) finish("/doc");
    });

    // Otherwise wait for the client to finish exchanging the code/token.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      captureGithubToken(session);
      if (session) finish("/doc");
    });

    // Fallback so we never hang forever on a failed exchange.
    const timer = setTimeout(() => {
      if (!done) setError("Sign-in timed out. Please try again.");
    }, 8000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <main className="auth">
      <div className="auth-card">
        {error ? (
          <>
            <h1 className="auth-title">Sign-in failed</h1>
            <p className="auth-error">{error}</p>
            <div className="auth-providers">
              <button
                type="button"
                className="auth-btn"
                onClick={() => router.replace("/login")}
              >
                <span>Back to sign in</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="auth-title">Signing you in…</h1>
            <p className="auth-sub">One moment while we finish up.</p>
          </>
        )}
      </div>
    </main>
  );
}
