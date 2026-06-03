// SignIn.jsx — auth start screen (email/password + OAuth)
import React, { useState } from "react";
import { Icon } from "./ui.jsx";
import { data } from "./data.js";
import { supabase, isConfigured } from "./supabase.js";

const Google = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" style={{ flex: "none" }}>
    <path fill="#4285F4" d="M21.6 12.2c0-.6-.05-1.2-.16-1.8H12v3.4h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.1z"/>
    <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0012 22z"/>
    <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1A10 10 0 002 12c0 1.6.4 3.1 1.1 4.6L6.4 14z"/>
    <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0012 2 10 10 0 003.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1z"/>
  </svg>
);

export function SignIn({ onGuest }) {
  const { game } = data;
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setNotice("");
    if (!isConfigured) { setErr("Supabase isn't configured yet — add your keys to .env, or continue as guest."); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password: pw });
        if (error) throw error;
        setNotice("Check your inbox to confirm your email, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      }
    } catch (e2) {
      setErr(e2.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider) => {
    setErr(""); setNotice("");
    if (!isConfigured) { setErr("Supabase isn't configured yet — add your keys to .env, or continue as guest."); return; }
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (error) setErr(error.message);
  };

  return (
    <div className="signin-wrap">
      <div className="signin-card card">
        <div className="signin-brand">
          <span className="signin-logo"><Icon name="flame" size={22} stroke={1.8} /></span>
          <div>
            <div className="signin-game">{game.name}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>Game Design System</div>
          </div>
        </div>

        <h1 className="disp signin-title">{mode === "signup" ? "Create your account" : "Sign in to continue"}</h1>
        <p className="muted signin-sub">{game.tagline}</p>

        <div className="signin-oauth">
          <button type="button" className="btn signin-oauth-btn" onClick={() => oauth("google")}>
            <Google /> Continue with Google
          </button>
          <button type="button" className="btn signin-oauth-btn" onClick={() => oauth("github")}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" style={{ flex: "none" }}>
              <path d="M12 2a10 10 0 00-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 015 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0012 2z"/>
            </svg>
            Continue with GitHub
          </button>
        </div>

        <div className="signin-divider"><span>or</span></div>

        <form onSubmit={submit} className="signin-form">
          <label className="signin-label">Email</label>
          <input className="signin-input" type="email" value={email} required autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
          <label className="signin-label">Password</label>
          <input className="signin-input" type="password" value={pw} required autoComplete={mode === "signup" ? "new-password" : "current-password"}
            onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />

          {err && <div className="signin-msg err">{err}</div>}
          {notice && <div className="signin-msg ok">{notice}</div>}

          <button type="submit" className="btn pri signin-submit" disabled={busy}>
            {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="signin-foot">
          {mode === "signup" ? (
            <>Already have an account? <button className="signin-link" onClick={() => { setMode("signin"); setErr(""); }}>Sign in</button></>
          ) : (
            <>New here? <button className="signin-link" onClick={() => { setMode("signup"); setErr(""); }}>Create an account</button></>
          )}
        </div>

        {!isConfigured && (
          <button className="signin-guest" onClick={onGuest}>Continue as guest →</button>
        )}
      </div>
    </div>
  );
}
