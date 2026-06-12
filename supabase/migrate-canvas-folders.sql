-- ============================================================================
-- One-time migration: canvas folders (2026-06-12)
-- Run this in the Supabase dashboard SQL editor:
--   https://supabase.com/dashboard/project/zitenhimsajmmlhojdtc/sql/new
-- Paste the whole file, press "Run". Safe to re-run.
-- (Already merged into schema.sql for fresh databases.)
-- ============================================================================

-- canvas_folders — sidebar grouping for canvases
create table if not exists public.canvas_folders (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

-- canvases can live in a folder; deleting a folder unfiles its canvases
alter table public.canvases add column if not exists folder_id
  uuid references public.canvas_folders(id) on delete set null;

create index if not exists idx_canvases_folder        on public.canvases(folder_id);
create index if not exists idx_canvas_folders_project on public.canvas_folders(project_id, position);

alter table public.canvas_folders enable row level security;

drop policy if exists canvas_folders_all on public.canvas_folders;
create policy canvas_folders_all on public.canvas_folders
  for all to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

alter table public.canvas_folders drop constraint if exists canvas_folders_limits;
alter table public.canvas_folders add constraint canvas_folders_limits check (
  char_length(name) <= 120
) not valid;

-- make PostgREST pick up the new table immediately
notify pgrst, 'reload schema';
