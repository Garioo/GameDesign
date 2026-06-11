-- ============================================================================
-- EMBERWICK — security hardening: server-side input limits
--
-- The web client validates input in lib/validate.ts, but any project member
-- can talk to PostgREST directly with their JWT, so the database must enforce
-- the same limits. Run AFTER schema.sql, in the Supabase SQL Editor:
--   supabase db execute --file supabase/security.sql
--
-- Safe to re-run: constraints are dropped before being recreated. They are
-- added NOT VALID so pre-existing oversized rows don't block the migration;
-- new writes are checked immediately. Validate old rows later with:
--   alter table public.<t> validate constraint <name>;
-- ============================================================================

-- profiles -------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_limits;
alter table public.profiles add constraint profiles_limits check (
  char_length(coalesce(name, ''))     <= 80  and
  char_length(coalesce(initials, '')) <= 4   and
  char_length(coalesce(role, ''))     <= 60  and
  char_length(coalesce(email, ''))    <= 320 and
  color ~ '^#[0-9a-fA-F]{6}$'
) not valid;

-- projects -------------------------------------------------------------------
alter table public.projects drop constraint if exists projects_limits;
alter table public.projects add constraint projects_limits check (
  char_length(name)                      <= 120 and
  char_length(coalesce(tagline, ''))     <= 300 and
  char_length(coalesce(genre, ''))       <= 60  and
  (repo is null or repo = '' or repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')
) not valid;

-- sections -------------------------------------------------------------------
alter table public.sections drop constraint if exists sections_limits;
alter table public.sections add constraint sections_limits check (
  char_length(name) <= 120
) not valid;

-- pages ----------------------------------------------------------------------
alter table public.pages drop constraint if exists pages_limits;
alter table public.pages add constraint pages_limits check (
  char_length(title)                  <= 300  and
  char_length(coalesce(summary, '')) <= 2000 and
  coalesce(array_length(tags, 1), 0) <= 20
) not valid;

-- blocks — content carries rich text and data-URL images ----------------------
alter table public.blocks drop constraint if exists blocks_limits;
alter table public.blocks add constraint blocks_limits check (
  pg_column_size(content) <= 2000000
) not valid;

-- canvases — whole tldraw scene as jsonb --------------------------------------
alter table public.canvases drop constraint if exists canvases_limits;
alter table public.canvases add constraint canvases_limits check (
  char_length(name)         <= 120 and
  pg_column_size(data) <= 4000000
) not valid;

-- comments -------------------------------------------------------------------
alter table public.comments drop constraint if exists comments_limits;
alter table public.comments add constraint comments_limits check (
  char_length(body) between 1 and 5000
) not valid;

-- milestones / activity --------------------------------------------------------
alter table public.milestones drop constraint if exists milestones_limits;
alter table public.milestones add constraint milestones_limits check (
  char_length(name) <= 200
) not valid;

alter table public.activity drop constraint if exists activity_limits;
alter table public.activity add constraint activity_limits check (
  char_length(action)                <= 60 and
  char_length(coalesce(target, '')) <= 300
) not valid;

-- ============================================================================
-- Done. See docs/SECURITY.md for the auth rate-limit and storage settings
-- that must be configured in the Supabase dashboard (not expressible in SQL).
-- ============================================================================
