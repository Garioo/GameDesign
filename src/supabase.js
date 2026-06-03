// supabase.js — auth client + session hook
// Reads credentials from Vite env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// When unset, isConfigured is false and the app falls back to guest access.
import React from "react";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anon);
export const supabase = isConfigured ? createClient(url, anon) : null;

export function useSession() {
  const [session, setSession] = React.useState(null);
  const [loading, setLoading] = React.useState(isConfigured);

  React.useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}
