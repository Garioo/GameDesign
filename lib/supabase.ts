import { createClient } from "@supabase/supabase-js";

// Browser Supabase client (singleton). Anon key is safe to expose; RLS guards data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Accept multiple common env var spellings so the dev experience is forgiving.
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANONKEY ??
  process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced clearly in the console rather than a cryptic runtime failure.
  console.error(
    `Supabase env missing: NEXT_PUBLIC_SUPABASE_URL=${!!url}, NEXT_PUBLIC_SUPABASE_ANON_KEY=${!!anonKey}`,
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Fixed id of the shared workspace project (mirrors supabase/foundation.sql).
export const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
