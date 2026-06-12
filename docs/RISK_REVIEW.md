# High-Risk & Bad Code Implementations — Review

Reviewed: 2026-06-12. Scope: all of `app/`, `lib/`, `supabase/schema.sql`, `supabase/security.sql`.

> **Status update (2026-06-12, same day):** the ownership/roles work resolved **H1, H2, H3, H5**
> and part of M1 (`deleteComment` now throws). `projects.owner` is trigger-protected, roles are a
> closed set, membership and invites are owner-managed, viewers are read-only, and comment edits
> are author-only with resolve via a SECURITY DEFINER RPC. **Re-run `supabase/schema.sql` in the
> SQL editor to apply.** Still open: H4 (storage), H6 (GitHub token), H7 (`ensure_workspace`),
> M1 (canvas repo), M2–M6, and the L items.
Complements [SECURITY.md](SECURITY.md) (audited 2026-06-11) — findings already listed there are
marked **(known)**; everything else is new.

Architecture reminder: there is no first-party server. The browser talks straight to Supabase
with the anon key, so **RLS is the only enforcement layer** — any "the UI doesn't allow it"
argument is void, because every member can call PostgREST directly with their JWT.

---

## High severity

### H1. Any member can take ownership of a project (privilege escalation) — NEW
`supabase/schema.sql` — `projects_update` policy (~line 401):

```sql
create policy projects_update on public.projects
  for update to authenticated
  using (public.can_access_project(id)) with check (public.can_access_project(id));
```

The policy does not restrict **which columns** can change. Any member (even one invited as
`viewer`) can run `UPDATE projects SET owner = <my uid>` via the REST API. Ownership then
grants `projects_delete` (`owner = auth.uid()`), so a hostile viewer can seize and **delete the
entire workspace**.

**Fix:** keep member-wide updates for name/tagline/genre/repo, but protect `owner` — either a
`WITH CHECK (owner = (select owner from projects where id = ...))` style guard via a trigger, or
move ownership transfer into a SECURITY DEFINER function that verifies the caller is the current
owner.

### H2. Membership table is a free-for-all — NEW
`supabase/schema.sql` — `members_insert` / `members_delete` (~lines 414–420):

- **Insert:** any member can add *any user id* with *any role string* — including `'owner'`.
  There is no CHECK constraint on `project_members.role`, so arbitrary text is accepted.
- **Delete:** any member can delete *any other member's* row, including the project owner's.
  A hostile editor can eject the whole team from the workspace.

**Fix:** add `check (role in ('owner','editor','viewer'))` on the column; restrict insert/delete
to owners (or self-delete for "leave workspace", which is all `lib/settingsRepo.ts:leaveWorkspace`
actually needs), and route invitations exclusively through `redeem_invite()`.

### H3. Invite minting accepts arbitrary roles — NEW
`supabase/schema.sql` — `workspace_invites` (~line 163) + `invites_insert` policy (~line 494).
The client (`lib/workspacesRepo.ts:createInviteLink`) never sets `role`, but a direct REST insert
can set `role = 'owner'`. `redeem_invite()` copies `invite.role` verbatim into `project_members`,
so any member can mint an owner-level invite for anyone.

**Fix:** CHECK constraint on `workspace_invites.role` (`editor`/`viewer` only), or clamp the role
inside `redeem_invite()`.

### H4. Any authenticated user can delete every file in `canvas-assets` — NEW (worse than known)
`supabase/schema.sql` — storage policies (~lines 515–521). SECURITY.md flags the unrestricted
*upload*; the **delete** policy is worse:

```sql
create policy canvas_assets_delete on storage.objects
  for delete to authenticated using (bucket_id = 'canvas-assets');
```

Sign-up is open (any Google/GitHub account), so any stranger can sign in and wipe every image in
every workspace's canvases. Paths are flat UUIDs with no owner/workspace prefix, so a
per-workspace policy isn't even expressible yet.

**Fix:** prefix object paths with the workspace id (`<project_id>/<uuid>.<ext>` in
`lib/canvasAssets.ts`), then scope insert/delete policies with
`can_access_project((storage.foldername(name))[1]::uuid)`. Add MIME/size caps in bucket settings.

### H5. Any member can rewrite or reattribute anyone's comments — partly (known)
`supabase/schema.sql` — `comments_update` (~line 462). SECURITY.md notes body edits; it's broader:
the update policy doesn't restrict columns, so a member can also change **`author`** (forge who
said something) or **`page_id`** (move a comment to another page). `comments_delete` likewise
allows deleting others' comments.

**Fix:** author-only policy for `body`/`author` changes; member-wide resolve via a SECURITY
DEFINER function that touches only `resolved_at`/`resolved_by`. Also note
`lib/commentsRepo.ts` lets the *client* supply `updated_at`/`resolved_at` timestamps — move
those server-side (trigger) so they can't be forged.

### H6. GitHub `repo`-scoped token in localStorage, never cleared on sign-out — (known, plus new gap)
`lib/github.ts` stores the OAuth provider token (full `repo` scope) in localStorage — known
finding #1. **New:** none of the five `supabase.auth.signOut()` call sites
(`app/home/page.tsx:403`, `app/doc/page.tsx:802/814`, `app/components/SettingsButton.tsx:89/99`,
`app/doc/canvas/page.tsx:392`) removes `gdd.github-token`. On a shared machine the next person
using the browser profile inherits read/write access to all of the previous user's repos even
after they signed out.

**Fix (minimum):** add a `clearGithubToken()` and call it on every sign-out. Better: request
`public_repo` or a fine-grained app token, or proxy GitHub through a server route.

### H7. `ensure_workspace()` auto-joins strangers into the shared workspace — (known)
`supabase/schema.sql` (~line 274). Any authenticated user with zero memberships who has
`onboarded_at` set is silently added as `editor` of the shared bootstrap project. Open sign-up
makes this a real exposure. Drop the function (it's documented as legacy) or gate it.

---

## Medium severity

### M1. Silent data loss in the canvas repo — NEW
`lib/canvasRepo.ts` ignores Supabase errors in `listCanvases`, `renameCanvas`, `reorderCanvases`,
`deleteCanvas` and — worst — **`saveCanvasScene` (line 95)**: if the UPDATE fails (constraint,
RLS, network), the promise resolves normally and the user believes the scene is saved. Compare
`lib/docsRepo.ts`, which throws on every error. `lib/commentsRepo.ts:deleteComment` has the same
swallow.

**Fix:** check `error` and throw in all of them; surface in the existing save-state UI.

### M2. `saveBlocks` last-writer-wins race deletes concurrent edits — NEW
`lib/docsRepo.ts:455-477`: the save reads existing block ids, upserts the local array, then
deletes everything not in it. With the realtime collaboration this app ships, two members editing
the same page on the debounce boundary will have one client **delete blocks the other just
created**, and whole-array upserts overwrite remote block text. The broadcast channel papers over
it in the happy path but isn't a consistency mechanism.

**Fix (pragmatic):** per-block writes keyed on `updated_at` (optimistic concurrency), or compute a
diff against the last-loaded state instead of "everything not mine dies". A full fix is CRDT/OT
territory — at minimum, scope deletes to blocks the local client actually removed.

### M3. Multi-row reorders are non-atomic — NEW
`lib/docsRepo.ts:reorderSections` / `updatePagePlacement`, `lib/canvasRepo.ts:reorderCanvases`
fire N parallel single-row UPDATEs with no transaction. A partial failure (or two users
reordering at once) leaves duplicate/contradictory `position` values.

**Fix:** one RPC (`security invoker` plpgsql function) that applies the whole ordering in a
single statement.

### M4. Post-login redirect accepts protocol-relative URLs — NEW
`app/auth/callback/page.tsx:36`: `if (stored?.startsWith("/")) path = stored;` — the value
`"//evil.com"` passes this check and `router.replace("//evil.com")` navigates off-site right
after sign-in (classic phishing position). Exploitation requires getting the value into
localStorage (today only `/join` writes it), so this is a hardening gap rather than a live hole.

**Fix:** `stored.startsWith("/") && !stored.startsWith("//")`.

### M5. Emails of every user visible to every authenticated user — (known)
`profiles_select using (true)` + `profiles.email` populated by the auth trigger. Any signed-in
stranger can enumerate all users' emails via REST. Tighten to shared-project members, or stop
selecting/storing email in `profiles` (it lives in `auth.users` anyway).

### M6. No Content-Security-Policy — (known)
Given H6 (a high-value token in localStorage), XSS impact here is repo-wide on GitHub, which
makes CSP more than a nice-to-have for this app.

---

## Low severity / code quality

- **L1 — `lib/supabase.ts:18`:** `createClient(url ?? "", anonKey ?? "")` turns missing env vars
  into confusing downstream fetch failures after only a `console.error`. Throw at module load in
  dev instead.
- **L2 — `lib/siteUrl.ts:1`:** hardcoded fallback `https://game-design-two.vercel.app` means
  invite links minted from any other deployment (preview URLs, self-hosts) point at the wrong
  origin unless `NEXT_PUBLIC_SITE_URL` is set. Prefer `window.location.origin` on the client.
- **L3 — `app/doc/BlockEditor.tsx:200` (`sanitizeHtml`):** parsing untrusted HTML by assigning
  `innerHTML` on a detached `<div>` cannot execute scripts, but it **does** fetch `<img src>`
  resources during parsing (tracking-pixel side channel for hostile block content arriving via
  realtime/REST). Use `DOMParser` (inert document) instead. The allowlist logic itself is sound.
- **L4 — media block image URL (`app/doc/BlockEditor.tsx:1458-1479`):** the "paste an image URL"
  input accepts any string and renders it as `<img src>`. Not a script vector in modern browsers,
  but allows mixed-content/tracking URLs persisted into shared docs. Validate scheme
  (`https:`/`data:image/`).
- **L5 — `lib/docsRepo.ts:loadWorkspace`:** loads **all blocks of every page** in the workspace
  eagerly (blocks may be up to 2 MB each per the data-URL design), and the section sort at
  line 203 does `pageRows.find(...)` inside the comparator — O(n²). Fine today, a wall at scale;
  fetch blocks per-page on open, precompute a section index for the sort.
- **L6 — `lib/session.ts:108-113`:** when a profile has no name, `ensureSession` writes a
  pseudo-random name/color derived from the user id — a side-effecting write inside what reads
  like a getter, racing the onboarding flow that sets the real name. Harmless today, surprising
  later.
- **L7 — duplicated max-position pattern:** `createSection`, `createPage`, `createCanvas` all do
  read-max-then-insert, which can collide under concurrency (duplicate `position`). The UI
  tolerates ties, so cosmetic — but a DB-side `position` default or RPC would remove the race.

---

## Suggested order of work

1. **RLS hardening migration** — H1, H2, H3, H5 are all one SQL file: column-protecting
   triggers/policies for `projects.owner`, role CHECK constraints, owner-only membership
   management, author-only comment edits. Highest impact, lowest effort.
2. **Storage scoping** — H4 (path prefix + scoped policies + bucket MIME/size caps).
3. **Token hygiene** — H6 (clear on sign-out now; rescope/proxy later) and M4 (one-line fix).
4. **Error swallowing** — M1 (canvas repo is silent-data-loss in production today).
5. Decide on H7 (drop legacy `ensure_workspace`), then the medium/low backlog.
