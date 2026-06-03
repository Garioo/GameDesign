-- ============================================================================
-- EMBERWICK · Game Design System — Supabase schema
-- Full GDD domain: profiles, projects, members, sections, pages, blocks,
-- comments, milestones, activity. Row-Level Security on every table.
--
-- Run in: Supabase Dashboard -> SQL Editor (paste + Run), or via the CLI:
--   supabase db execute --file supabase/schema.sql
-- Safe to re-run: types are guarded, tables use IF NOT EXISTS, policies are
-- dropped before being recreated.
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'work_status') then
    create type work_status as enum ('todo', 'wip', 'review', 'done', 'block');
  end if;
end$$;

-- ----------------------------------------------------------------------------
-- Shared helper: keep updated_at fresh
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

-- ============================================================================
-- Tables
-- ============================================================================

-- profiles — one row per auth user
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text,
  role       text,
  color      text not null default '#5a83d6',
  initials   text,
  created_at timestamptz not null default now()
);

-- projects — a game design document
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  tagline    text,
  genre      text,
  progress   int  not null default 0 check (progress between 0 and 100),
  owner      uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- project_members — who can see / edit a project
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'editor',  -- owner | editor | viewer
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- sections — top-level groupings inside a project
create table if not exists public.sections (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  icon       text,
  color      text,
  status     work_status not null default 'todo',
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

-- pages — documents; self-referencing parent_id powers the nested tree
create table if not exists public.pages (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  section_id uuid references public.sections(id) on delete set null,
  parent_id  uuid references public.pages(id) on delete cascade,
  title      text not null default 'Untitled page',
  kind       text,
  status     work_status not null default 'todo',
  owner      uuid references public.profiles(id) on delete set null,
  summary    text,
  tags       text[] not null default '{}',
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- blocks — ordered body of a page (the block editor)
-- type: p | h | quote | callout | list | table | media | links | hr
-- content: type-specific payload, e.g.
--   p/h:     {"text": "..."}
--   quote:   {"text": "...", "by": "..."}
--   callout: {"tone": "accent", "title": "...", "text": "..."}
--   list:    {"items": ["...", "..."]}
--   table:   {"cols": ["..."], "rows": [["..."]]}
--   media:   {"label": "...", "ratio": "16 / 8"}
--   links:   {"ids": ["<page_id>", ...]}
create table if not exists public.blocks (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  type       text not null,
  content    jsonb not null default '{}'::jsonb,
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- comments — threaded discussion on a page (parent_id = reply target)
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  parent_id  uuid references public.comments(id) on delete cascade,
  author     uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- milestones — project timeline
create table if not exists public.milestones (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  due_date   date,
  status     work_status not null default 'todo',
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

-- activity — feed of who did what
create table if not exists public.activity (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor      uuid references public.profiles(id) on delete set null,
  action     text not null,
  target     text,
  page_id    uuid references public.pages(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Indexes (foreign keys + ordering)
-- ----------------------------------------------------------------------------
create index if not exists idx_members_user      on public.project_members(user_id);
create index if not exists idx_sections_project   on public.sections(project_id, position);
create index if not exists idx_pages_project       on public.pages(project_id);
create index if not exists idx_pages_section       on public.pages(section_id, position);
create index if not exists idx_pages_parent        on public.pages(parent_id);
create index if not exists idx_blocks_page         on public.blocks(page_id, position);
create index if not exists idx_comments_page       on public.comments(page_id);
create index if not exists idx_milestones_project  on public.milestones(project_id, position);
create index if not exists idx_activity_project    on public.activity(project_id, created_at desc);

-- ============================================================================
-- Triggers
-- ============================================================================

-- new auth user -> profile row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- new project -> owner becomes a member automatically
create or replace function public.handle_new_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner, 'owner')
  on conflict do nothing;
  return new;
end$$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- updated_at maintenance
drop trigger if exists set_projects_updated on public.projects;
create trigger set_projects_updated before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists set_pages_updated on public.pages;
create trigger set_pages_updated before update on public.pages
  for each row execute function public.set_updated_at();

drop trigger if exists set_blocks_updated on public.blocks;
create trigger set_blocks_updated before update on public.blocks
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Access helpers (SECURITY DEFINER so they bypass RLS and avoid recursion)
-- ============================================================================
create or replace function public.can_access_project(p_project uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_page(p_page uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.pages pg
    join public.project_members m on m.project_id = pg.project_id
    where pg.id = p_page and m.user_id = auth.uid()
  );
$$;

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.sections        enable row level security;
alter table public.pages           enable row level security;
alter table public.blocks          enable row level security;
alter table public.comments        enable row level security;
alter table public.milestones      enable row level security;
alter table public.activity        enable row level security;

-- profiles ----------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- projects ----------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (public.can_access_project(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated using (public.can_access_project(id)) with check (public.can_access_project(id));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated using (owner = auth.uid());

-- project_members ---------------------------------------------------------
drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members
  for select to authenticated using (user_id = auth.uid() or public.can_access_project(project_id));

drop policy if exists members_insert on public.project_members;
create policy members_insert on public.project_members
  for insert to authenticated with check (public.can_access_project(project_id));

drop policy if exists members_delete on public.project_members;
create policy members_delete on public.project_members
  for delete to authenticated using (public.can_access_project(project_id));

-- sections ----------------------------------------------------------------
drop policy if exists sections_all on public.sections;
create policy sections_all on public.sections
  for all to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

-- pages -------------------------------------------------------------------
drop policy if exists pages_all on public.pages;
create policy pages_all on public.pages
  for all to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

-- blocks ------------------------------------------------------------------
drop policy if exists blocks_all on public.blocks;
create policy blocks_all on public.blocks
  for all to authenticated
  using (public.can_access_page(page_id))
  with check (public.can_access_page(page_id));

-- comments ----------------------------------------------------------------
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated using (public.can_access_page(page_id));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated with check (public.can_access_page(page_id) and author = auth.uid());

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated using (author = auth.uid()) with check (author = auth.uid());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated using (author = auth.uid() or public.can_access_page(page_id));

-- milestones --------------------------------------------------------------
drop policy if exists milestones_all on public.milestones;
create policy milestones_all on public.milestones
  for all to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

-- activity ----------------------------------------------------------------
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity
  for select to authenticated using (public.can_access_project(project_id));

drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity
  for insert to authenticated with check (public.can_access_project(project_id) and actor = auth.uid());

-- ============================================================================
-- Done. Tables are created with RLS; access flows through project_members.
-- ============================================================================
