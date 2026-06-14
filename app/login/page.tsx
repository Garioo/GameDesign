"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import "./auth.css";

type Provider = "google" | "github";

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If a session already exists, skip the login screen.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/home");
    });
  }, [router]);

  async function signIn(provider: Provider) {
    setError(null);
    setPending(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // Come back to whatever origin we signed in from, so localhost dev
        // sessions land on localhost instead of production. Each origin's
        // /auth/callback must be allowlisted in Supabase → Auth → URL
        // Configuration → Redirect URLs.
        redirectTo: `${window.location.origin}/auth/callback`,
        // repo scope lets script blocks read the user's private repositories
        ...(provider === "github" ? { scopes: "repo" } : {}),
      },
    });
    // On success the browser is redirected to the provider, so we only reach
    // here on failure.
    if (error) {
      setError(error.message);
      setPending(null);
    }
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <h1 className="auth-title">Foundry</h1>
        <p className="auth-sub">Sign in to open your team's design docs.</p>

        {error && <p className="auth-error">{error}</p>}

        <div className="auth-providers">
          <button
            type="button"
            className="auth-btn"
            onClick={() => signIn("google")}
            disabled={pending !== null}
          >
            <GoogleIcon />
            <span>{pending === "google" ? "Redirecting…" : "Continue with Google"}</span>
          </button>

          <button
            type="button"
            className="auth-btn"
            onClick={() => signIn("github")}
            disabled={pending !== null}
          >
            <GitHubIcon />
            <span>{pending === "github" ? "Redirecting…" : "Continue with GitHub"}</span>
          </button>
        </div>

        <p className="auth-fine">
          By continuing you agree to keep your design docs tidy.
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="#1b1f23"
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}
