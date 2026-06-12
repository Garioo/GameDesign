# Security

Last audited: 2026-06-11.

## Architecture context (read this first)

This app has **no first-party server endpoints**: no `app/api` routes, no
middleware, no server actions. The browser talks directly to Supabase
(PostgREST + GoTrue + Storage) using the public anon key, and every request is
authorized by Row-Level Security (`supabase/schema.sql`). The practical
consequence: rate limiting and final input enforcement live in **Supabase**,
not in this repo's JavaScript. Anything enforced only in the client can be
bypassed by a user calling the REST API with their own JWT.

## Rate limiting

There are no endpoints in this codebase to wrap with a limiter; the real
endpoints are Supabase's. Configure these in the dashboard (they are project
settings, not code):

### Auth — max 5 attempts / 15 minutes

Dashboard → **Authentication → Rate Limits**:

- **Sign-ups and sign-ins**: the dashboard expresses this per IP per
  5-minute window — set it to **2 per 5 minutes** (≈ 5–6 per 15 minutes, the
  strictest available approximation of "5 per 15 min").
- **Token refreshes**: lower from the default (1800/5 min/IP) to something
  sane, e.g. 50 per 5 minutes.
- Sign-in is OAuth-only (GitHub/Google), so password and OTP brute-force do
  not apply; the limits above still throttle abuse of the
  `/auth/v1/authorize` and `/auth/v1/token` endpoints.

If the project is linked with the Supabase CLI, the same can be kept in
`supabase/config.toml` and applied with `supabase config push`:

```toml
[auth.rate_limit]
sign_in_sign_ups = 2   # per 5 minutes per IP
token_refresh    = 50  # per 5 minutes per IP
```

### Data API

Supabase does not offer per-table rate limits on PostgREST. Current
mitigations: RLS on every table, and the size CHECK constraints in
`supabase/security.sql` (run it — see below). If abuse ever becomes real,
the upgrade path is: put Vercel's WAF / Cloudflare in front, or move writes
behind Next.js route handlers backed by Upstash Ratelimit. Do **not** add an
in-memory limiter in this repo — with no server runtime it would be dead
code, and on serverless it wouldn't share state between invocations anyway.

## Secrets

Audit result (working tree **and** full git history of all branches):

- **No hardcoded API keys, tokens or passwords in source.** The only secrets
  file is `.env.local`, which is gitignored and has never been committed.
  The one `.env*` file ever committed (`.env.example`, commit `bd0d780`)
  contained placeholders only.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is bundled into the frontend **by design**
  (Supabase's anon key is public; RLS is the security boundary). Same for the
  tldraw license key, which tldraw documents as safe to expose.
- The **service_role key must never appear** in this repo or in any
  `NEXT_PUBLIC_*` variable. `.env.example` documents this.
- The GitHub OAuth **provider token is stored in localStorage**
  (`lib/github.ts`) with `repo` scope — see Remaining risks.

## Input validation & payload limits

Two layers, added 2026-06-11:

1. **Client (`lib/validate.ts`)** — every repo write trims, length-caps and
   byte-caps user input: comments ≤ 5 000 chars, titles ≤ 300, summaries
   ≤ 2 000, names ≤ 120, ≤ 20 tags, ≤ 500 blocks/page, block content ≤ 2 MB,
   canvas scenes ≤ 4 MB, profile color must be `#rrggbb`, linked repo must
   match `owner/name`. GIF/SVG uploads over ~1 MB are rejected before
   encoding.
2. **Database (`supabase/security.sql`)** — the same limits as CHECK
   constraints, so direct REST calls can't bypass them. **This file must be
   run in the Supabase SQL editor; it is not applied automatically.**

Rich text (block HTML) is sanitized with a strict allowlist
(`b/strong/i/em/code/br` + normalized mention chips) on **both write and
read** (`app/doc/BlockEditor.tsx`). Read-side sanitization was added in this
audit — previously a member writing raw HTML through the REST API could get
it rendered in other members' browsers (stored XSS). Comments and all other
user text render through React text nodes, which escape by default.

## Remaining risks (open findings)

Ordered by priority:

1. **GitHub `repo`-scoped token in localStorage** (`lib/github.ts`). Any
   future XSS = read/write access to all of the user's repos. Mitigations to
   consider: request `public_repo` (or a fine-grained GitHub App) instead of
   `repo`; or proxy GitHub calls through a server route so the token never
   reaches the browser. Highest-value hardening left.
2. **`ensure_workspace()` auto-joins any authenticated user as editor** of
   the legacy shared workspace (`supabase/schema.sql`). Sign-up is open
   (anyone with a GitHub/Google account), so a stranger who signs in and has
   no memberships lands in the shared workspace with edit rights. If the
   legacy fallback is no longer needed, drop the function or gate it on an
   allowlist.
3. ~~**Any member can edit or delete anyone's comments**~~ — **fixed
   2026-06-12**: `comments_update` is now author-only, deletes are
   author-or-project-owner, and resolve/reopen goes through the
   `set_comment_resolved()` SECURITY DEFINER function. The same change
   introduced the full owner/editor/viewer role model (owner-managed
   membership and invites, trigger-protected `projects.owner`, read-only
   viewers) — see `docs/RISK_REVIEW.md` H1–H3/H5.
4. **`canvas-assets` storage bucket is public-read with unrestricted
   upload** for any authenticated Supabase user (not just workspace
   members), no MIME or size policy. Configure in dashboard → Storage →
   bucket settings: cap file size (e.g. 5 MB), restrict MIME types to
   `image/*`. Uploaded SVGs are served from `*.supabase.co`, so they can't
   script against the app origin, but the bucket can be abused as free
   hosting.
5. **All profile emails are visible to every authenticated user**
   (`profiles_select using (true)`). Acceptable for a small team tool;
   tighten to "members of a shared project" if the user base grows.
6. **No Content-Security-Policy.** Baseline headers (X-Frame-Options,
   nosniff, Referrer-Policy, Permissions-Policy) were added in
   `next.config.ts`; a strict CSP needs nonce wiring through Next and
   allowances for Supabase/GitHub/tldraw origins — worth doing, not done.
7. **Client validation can throw `ValidationError`** where some UI paths
   don't surface errors gracefully yet (e.g. extremely long names entered in
   inline rename fields). The DB constraint still protects the data either
   way.

## Operator checklist

- [ ] Run `supabase/security.sql` in the SQL editor (constraints).
- [ ] Set Auth rate limits (sign-in/up ≈ 2 per 5 min, token refresh ~50).
- [ ] Cap size + MIME types on the `canvas-assets` bucket.
- [ ] Rotate the Supabase anon key if it was ever paired with a leaked
      service_role key (no evidence of that — precaution only).
- [ ] Decide on findings 1–2 above (token scope, legacy shared workspace).
