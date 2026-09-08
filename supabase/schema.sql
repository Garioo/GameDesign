-- ============================================================================
-- GDD · Game Design System — Supabase schema
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

-- added later: set when the user completes the first-run onboarding flow
alter table public.profiles add column if not exists onboarded_at timestamptz;

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

-- added later: linked GitHub repository ("owner/name") for script blocks
alter table public.projects add column if not exists repo text;

-- project_members — who can see / edit a project
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'editor',  -- owner | editor | viewer
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Roles are a closed set. 'owner' rows are managed exclusively by the
-- ownership triggers below — RLS never lets a client write that value.
alter table public.project_members drop constraint if exists project_members_role_check;
alter table public.project_members add constraint project_members_role_check
  check (role in ('owner', 'editor', 'viewer')) not valid;

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

-- canvases — freeform visual boards (the data jsonb holds nodes/edges/etc.)
create table if not exists public.canvases (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null default 'Untitled canvas',
  data       jsonb not null default '{}'::jsonb,
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- canvas_folders — sidebar grouping for canvases (e.g. the auto-created
-- "Scrum board" folder that collects canvases spun off from board cards)
create table if not exists public.canvas_folders (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

-- added later: canvases can live in a folder (idempotent for existing databases);
-- deleting a folder keeps its canvases, they just become unfiled
alter table public.canvases add column if not exists folder_id uuid references public.canvas_folders(id) on delete set null;

-- comments — threaded discussion on a page (parent_id = reply target)
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages(id) on delete cascade,
  parent_id  uuid references public.comments(id) on delete cascade,
  author     uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

-- added later: edit + resolve metadata (idempotent for existing databases)
alter table public.comments add column if not exists updated_at  timestamptz;
alter table public.comments add column if not exists resolved_at timestamptz;
alter table public.comments add column if not exists resolved_by uuid references public.profiles(id);

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

-- workspace_invites — shareable invite links; redeemed via redeem_invite()
create table if not exists public.workspace_invites (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  role       text not null default 'editor',  -- role granted on redeem
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);

-- Invites can only grant editor or viewer — ownership is never invite-able.
alter table public.workspace_invites drop constraint if exists workspace_invites_role_check;
alter table public.workspace_invites add constraint workspace_invites_role_check
  check (role in ('editor', 'viewer')) not valid;

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
create index if not exists idx_canvases_project     on public.canvases(project_id, position);
create index if not exists idx_canvases_folder      on public.canvases(folder_id);
create index if not exists idx_canvas_folders_project on public.canvas_folders(project_id, position);
create index if not exists idx_comments_page       on public.comments(page_id);
create index if not exists idx_milestones_project  on public.milestones(project_id, position);
create index if not exists idx_activity_project    on public.activity(project_id, created_at desc);
create index if not exists idx_invites_project     on public.workspace_invites(project_id);

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

drop trigger if exists set_canvases_updated on public.canvases;
create trigger set_canvases_updated before update on public.canvases
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

-- The caller owns the project (projects.owner is the source of truth).
create or replace function public.is_project_owner(p_project uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project and p.owner = auth.uid()
  );
$$;

-- The caller may write project content (owner or editor; viewers read only).
create or replace function public.can_edit_project(p_project uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function public.can_edit_page(p_page uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.pages pg
    join public.project_members m on m.project_id = pg.project_id
    where pg.id = p_page and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  );
$$;

-- The caller owns the project a page belongs to (comment moderation).
create or replace function public.can_moderate_page(p_page uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.pages pg
    join public.projects p on p.id = pg.project_id
    where pg.id = p_page and p.owner = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- Ownership protection (fixes: any member could UPDATE projects.owner and
-- seize + delete the workspace). Only the current owner may transfer, and only
-- to an existing member. auth.uid() is null for service-role / SQL-editor
-- sessions, which bypass RLS anyway — those pass through untouched.
-- ----------------------------------------------------------------------------
create or replace function public.protect_project_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner is distinct from old.owner and auth.uid() is not null then
    if auth.uid() is distinct from old.owner then
      raise exception 'Only the workspace owner can transfer ownership';
    end if;
    if not exists (
      select 1 from public.project_members m
      where m.project_id = old.id and m.user_id = new.owner
    ) then
      raise exception 'New owner must already be a member of the workspace';
    end if;
  end if;
  return new;
end$$;

drop trigger if exists protect_project_owner on public.projects;
create trigger protect_project_owner before update on public.projects
  for each row execute function public.protect_project_owner();

-- After a transfer, keep membership roles in step with projects.owner:
-- the new owner's row becomes 'owner', the previous owner becomes 'editor'.
create or replace function public.sync_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner is distinct from old.owner then
    update public.project_members set role = 'editor'
      where project_id = new.id and user_id = old.owner and role = 'owner';
    insert into public.project_members (project_id, user_id, role)
      values (new.id, new.owner, 'owner')
      on conflict (project_id, user_id) do update set role = 'owner';
  end if;
  return new;
end$$;

drop trigger if exists sync_owner_membership on public.projects;
create trigger sync_owner_membership after update on public.projects
  for each row execute function public.sync_owner_membership();

-- ensure_workspace() — REMOVED. It auto-joined any authenticated user as an
-- editor of the shared bootstrap workspace; with open OAuth sign-up that
-- meant strangers gained edit access. Onboarding/invites are the only ways
-- into a workspace now. The drop is kept here so re-running this file
-- removes the function from existing databases.
drop function if exists public.ensure_workspace();

-- Redeem an invite link: a non-member holding a valid token joins the project.
-- SECURITY DEFINER because members_insert RLS only allows existing members to
-- add rows — the invitee is by definition not a member yet.
create or replace function public.redeem_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  invite record;
begin
  if caller is null then
    raise exception 'redeem_invite requires an authenticated user';
  end if;

  select * into invite
  from public.workspace_invites
  where token = p_token and expires_at > now();

  if not found then
    raise exception 'Invite link is invalid or has expired';
  end if;

  -- the trigger normally creates the profile, but be safe (mirrors ensure_workspace)
  insert into public.profiles (id, email, name)
  values (
    caller,
    auth.jwt() ->> 'email',
    split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)
  )
  on conflict (id) do nothing;

  -- clamp the granted role: invites may only confer editor or viewer
  insert into public.project_members (project_id, user_id, role)
  values (
    invite.project_id,
    caller,
    case when invite.role in ('editor', 'viewer') then invite.role else 'editor' end
  )
  on conflict (project_id, user_id) do nothing;

  return invite.project_id;
end$$;

grant execute on function public.redeem_invite(uuid) to authenticated;

-- Resolve / reopen a comment thread. Any member may resolve (that's the
-- collaborative workflow), but body/author edits stay author-only via RLS —
-- this SECURITY DEFINER function is the only path that touches the resolved
-- columns for other people's comments.
create or replace function public.set_comment_resolved(p_comment uuid, p_resolved boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v_page uuid;
begin
  if caller is null then
    raise exception 'set_comment_resolved requires an authenticated user';
  end if;

  select page_id into v_page from public.comments where id = p_comment;
  if not found or not public.can_access_page(v_page) then
    raise exception 'Comment not found';
  end if;

  update public.comments
  set resolved_at = case when p_resolved then now() else null end,
      resolved_by = case when p_resolved then caller else null end
  where id = p_comment;
end$$;

grant execute on function public.set_comment_resolved(uuid, boolean) to authenticated;

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;
alter table public.sections        enable row level security;
alter table public.pages           enable row level security;
alter table public.blocks          enable row level security;
alter table public.canvases        enable row level security;
alter table public.canvas_folders  enable row level security;
alter table public.comments        enable row level security;
alter table public.milestones      enable row level security;
alter table public.activity        enable row level security;
alter table public.workspace_invites enable row level security;

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
-- owner = auth.uid() matters at INSERT … RETURNING time: the membership row
-- is added by an AFTER trigger, so can_access_project() is still false when
-- the SELECT policy is checked against the freshly created project.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (owner = auth.uid() or public.can_access_project(id));

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated with check (owner = auth.uid());

-- Owners and editors may edit project info; the owner column itself is
-- guarded by the protect_project_owner trigger (transfer = owner only).
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated using (public.can_edit_project(id)) with check (public.can_edit_project(id));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated using (owner = auth.uid());

-- project_members ---------------------------------------------------------
drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members
  for select to authenticated using (user_id = auth.uid() or public.can_access_project(project_id));

-- Membership is managed by the owner. The two system paths that add rows
-- (handle_new_project trigger, redeem_invite RPC) are SECURITY DEFINER and
-- bypass RLS, so these policies only govern direct client writes.
drop policy if exists members_insert on public.project_members;
create policy members_insert on public.project_members
  for insert to authenticated
  with check (public.is_project_owner(project_id) and role in ('editor', 'viewer'));

-- Owner changes other members between editor/viewer. Never their own row,
-- and never to 'owner' — ownership transfer goes through projects.owner.
drop policy if exists members_update on public.project_members;
create policy members_update on public.project_members
  for update to authenticated
  using (public.is_project_owner(project_id) and user_id <> auth.uid())
  with check (
    public.is_project_owner(project_id)  -- row can't be moved to another project
    and user_id <> auth.uid()
    and role in ('editor', 'viewer')
  );

-- Non-owners may remove themselves (leave); the owner may remove anyone
-- else. The owner cannot leave without transferring ownership first.
drop policy if exists members_delete on public.project_members;
create policy members_delete on public.project_members
  for delete to authenticated using (
    (user_id = auth.uid() and not public.is_project_owner(project_id))
    or (public.is_project_owner(project_id) and user_id <> auth.uid())
  );

-- Content tables: every member reads, owners + editors write (viewers are
-- read-only — that's what makes the 'viewer' role mean something).

-- sections ----------------------------------------------------------------
drop policy if exists sections_all on public.sections;
drop policy if exists sections_select on public.sections;
create policy sections_select on public.sections
  for select to authenticated using (public.can_access_project(project_id));

drop policy if exists sections_insert on public.sections;
create policy sections_insert on public.sections
  for insert to authenticated with check (public.can_edit_project(project_id));

drop policy if exists sections_update on public.sections;
create policy sections_update on public.sections
  for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

drop policy if exists sections_delete on public.sections;
create policy sections_delete on public.sections
  for delete to authenticated using (public.can_edit_project(project_id));

-- pages -------------------------------------------------------------------
drop policy if exists pages_all on public.pages;
drop policy if exists pages_select on public.pages;
create policy pages_select on public.pages
  for select to authenticated using (public.can_access_project(project_id));

drop policy if exists pages_insert on public.pages;
create policy pages_insert on public.pages
  for insert to authenticated with check (public.can_edit_project(project_id));

drop policy if exists pages_update on public.pages;
create policy pages_update on public.pages
  for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

drop policy if exists pages_delete on public.pages;
create policy pages_delete on public.pages
  for delete to authenticated using (public.can_edit_project(project_id));

-- blocks ------------------------------------------------------------------
drop policy if exists blocks_all on public.blocks;
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks
  for select to authenticated using (public.can_access_page(page_id));

drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks
  for insert to authenticated with check (public.can_edit_page(page_id));

drop policy if exists blocks_update on public.blocks;
create policy blocks_update on public.blocks
  for update to authenticated
  using (public.can_edit_page(page_id)) with check (public.can_edit_page(page_id));

drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks
  for delete to authenticated using (public.can_edit_page(page_id));

-- canvases ----------------------------------------------------------------
drop policy if exists canvases_all on public.canvases;
drop policy if exists canvases_select on public.canvases;
create policy canvases_select on public.canvases
  for select to authenticated using (public.can_access_project(project_id));

drop policy if exists canvases_insert on public.canvases;
create policy canvases_insert on public.canvases
  for insert to authenticated with check (public.can_edit_project(project_id));

drop policy if exists canvases_update on public.canvases;
create policy canvases_update on public.canvases
  for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

drop policy if exists canvases_delete on public.canvases;
create policy canvases_delete on public.canvases
  for delete to authenticated using (public.can_edit_project(project_id));

-- canvas_folders ------------------------------------------------------------
drop policy if exists canvas_folders_all on public.canvas_folders;
create policy canvas_folders_all on public.canvas_folders
  for all to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

-- comments ----------------------------------------------------------------
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated using (public.can_access_page(page_id));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated with check (public.can_access_page(page_id) and author = auth.uid());

-- Authors edit their own comments only (and can't reattribute them) —
-- resolve/reopen for other people's threads goes through the
-- set_comment_resolved() SECURITY DEFINER function instead.
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using (author = auth.uid())
  with check (author = auth.uid() and public.can_access_page(page_id));

-- Authors delete their own; the project owner may moderate any comment.
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated using (author = auth.uid() or public.can_moderate_page(page_id));

-- milestones --------------------------------------------------------------
drop policy if exists milestones_all on public.milestones;
drop policy if exists milestones_select on public.milestones;
create policy milestones_select on public.milestones
  for select to authenticated using (public.can_access_project(project_id));

drop policy if exists milestones_insert on public.milestones;
create policy milestones_insert on public.milestones
  for insert to authenticated with check (public.can_edit_project(project_id));

drop policy if exists milestones_update on public.milestones;
create policy milestones_update on public.milestones
  for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

drop policy if exists milestones_delete on public.milestones;
create policy milestones_delete on public.milestones
  for delete to authenticated using (public.can_edit_project(project_id));

-- activity ----------------------------------------------------------------
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity
  for select to authenticated using (public.can_access_project(project_id));

drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity
  for insert to authenticated with check (public.can_edit_project(project_id) and actor = auth.uid());

-- workspace_invites ---------------------------------------------------------
-- The owner grants access: only they mint, see, and revoke invite links.
-- Redemption goes through the SECURITY DEFINER redeem_invite() so
-- non-members never read this table.
drop policy if exists invites_select on public.workspace_invites;
create policy invites_select on public.workspace_invites
  for select to authenticated using (public.is_project_owner(project_id));

drop policy if exists invites_insert on public.workspace_invites;
create policy invites_insert on public.workspace_invites
  for insert to authenticated
  with check (
    public.is_project_owner(project_id)
    and created_by = auth.uid()
    and role in ('editor', 'viewer')
  );

drop policy if exists invites_delete on public.workspace_invites;
create policy invites_delete on public.workspace_invites
  for delete to authenticated using (public.is_project_owner(project_id));

-- ============================================================================
-- Boards (kanban) — boards › board_columns › board_cards.
-- project_id is denormalised onto columns/cards so RLS and realtime filters
-- stay one-hop (same approach as can_access_project everywhere else).
-- ============================================================================
create table if not exists public.boards (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null default 'Untitled board',
  color      text not null default '#cf6a2c',
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.board_columns (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null default 'Untitled column',
  color      text not null default '#a59a8c',
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.board_cards (
  id         uuid primary key default gen_random_uuid(),
  column_id  uuid not null references public.board_columns(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  title      text not null default '',
  sub        text not null default '',
  kind       text not null default '',
  tags       text[] not null default '{}',
  priority   text,
  owner      uuid references public.profiles(id) on delete set null,
  deadline   date,
  start_date date,
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Gantt scheduling for existing installations.
alter table public.board_cards add column if not exists start_date date;
alter table public.board_cards drop constraint if exists board_cards_schedule_order;
alter table public.board_cards add constraint board_cards_schedule_order
  check (start_date is null or deadline is null or deadline >= start_date);

-- added later: multiple assignees per card (migrates the old single owner)
alter table public.board_cards add column if not exists owners uuid[] not null default '{}';
update public.board_cards set owners = array[owner]
  where owner is not null and owners = '{}';

create index if not exists idx_boards_project       on public.boards(project_id, position);
create index if not exists idx_board_cols_board     on public.board_columns(board_id, position);
create index if not exists idx_board_cols_project   on public.board_columns(project_id);
create index if not exists idx_board_cards_column   on public.board_cards(column_id, position);
create index if not exists idx_board_cards_project  on public.board_cards(project_id);

drop trigger if exists set_boards_updated on public.boards;
create trigger set_boards_updated before update on public.boards
  for each row execute function public.set_updated_at();

drop trigger if exists set_board_cards_updated on public.board_cards;
create trigger set_board_cards_updated before update on public.board_cards
  for each row execute function public.set_updated_at();

alter table public.boards        enable row level security;
alter table public.board_columns enable row level security;
alter table public.board_cards   enable row level security;

drop policy if exists boards_all on public.boards;
create policy boards_all on public.boards
  for all to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

drop policy if exists board_columns_all on public.board_columns;
create policy board_columns_all on public.board_columns
  for all to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

drop policy if exists board_cards_all on public.board_cards;
create policy board_cards_all on public.board_cards
  for all to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

-- board_categories — workspace-level card categories (the editable "kind" list)
create table if not exists public.board_categories (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_board_cats_project on public.board_categories(project_id, position);

alter table public.board_categories enable row level security;

drop policy if exists board_categories_all on public.board_categories;
create policy board_categories_all on public.board_categories
  for all to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

-- realtime: board tables stream postgres_changes to subscribed clients
do $$ begin
  alter publication supabase_realtime add table public.boards;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.board_categories;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.board_columns;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.board_cards;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Storage: canvas-assets bucket (images dropped/inserted on canvases).
-- Public-read so asset URLs render without signing. Objects live under
-- <project_id>/<uuid>.<ext> and writes are scoped to that workspace's
-- owner/editors — previously ANY authenticated user could upload to (and
-- delete from!) the whole bucket. Legacy root-level files (no project
-- prefix) stay readable but are no longer client-deletable.
-- File size / MIME caps are bucket settings (dashboard), not SQL.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('canvas-assets', 'canvas-assets', true)
on conflict (id) do nothing;

-- True when `name` is "<uuid-of-a-project-the-caller-can-edit>/...".
-- (uuid format is checked before casting so non-uuid folders are just false.)
create or replace function public.can_write_canvas_asset(name text)
returns boolean language sql security definer stable set search_path = public as $$
  select case
    when array_length(storage.foldername(name), 1) >= 1
     and (storage.foldername(name))[1]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.can_edit_project(((storage.foldername(name))[1])::uuid)
    else false
  end;
$$;

drop policy if exists canvas_assets_read on storage.objects;
create policy canvas_assets_read on storage.objects
  for select to public using (bucket_id = 'canvas-assets');

drop policy if exists canvas_assets_insert on storage.objects;
create policy canvas_assets_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'canvas-assets' and public.can_write_canvas_asset(name));

drop policy if exists canvas_assets_delete on storage.objects;
create policy canvas_assets_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'canvas-assets' and public.can_write_canvas_asset(name));

-- ============================================================================
-- Done. Tables are created with RLS; access flows through project_members.
-- ============================================================================


-- Persistent card-to-canvas links. Run in the Supabase SQL editor before deploying.
begin;
alter table public.board_cards add column if not exists canvas_id uuid
  references public.canvases(id) on delete set null;

-- Lock the card so simultaneous clicks cannot create duplicate canvases.
-- SECURITY INVOKER preserves the caller's row-level access rules.
create or replace function public.open_board_card_canvas(p_card_id uuid, p_existing_canvas_id uuid default null)
returns table (canvas_id uuid, created boolean)
language plpgsql security invoker set search_path = public
as $$
declare
  card public.board_cards%rowtype;
  target_id uuid;
  folder uuid;
begin
  select * into card from public.board_cards where id = p_card_id for update;
  if not found then raise exception 'Card not found or access denied'; end if;
  if not public.can_edit_project(card.project_id) then
    raise exception 'Editor access is required to link a canvas';
  end if;

  if p_existing_canvas_id is not null then
    select id into target_id from public.canvases
      where id = p_existing_canvas_id and project_id = card.project_id;
    if target_id is null then raise exception 'Choose a canvas in this workspace'; end if;
    update public.board_cards set canvas_id = target_id where id = card.id;
    return query select target_id, false;
    return;
  end if;

  if card.canvas_id is not null then
    select id into target_id from public.canvases
      where id = card.canvas_id and project_id = card.project_id;
    if target_id is null then raise exception 'Linked canvas is unavailable'; end if;
    return query select target_id, false;
    return;
  end if;

  -- Serialize folder creation within the workspace as well.
  perform pg_advisory_xact_lock(hashtextextended(card.project_id::text, 0));
  select id into folder from public.canvas_folders
    where project_id = card.project_id and name = 'Scrum board' order by position, id limit 1;
  if folder is null then
    insert into public.canvas_folders(project_id, name, position)
      select card.project_id, 'Scrum board', coalesce(max(position), -1) + 1
      from public.canvas_folders where project_id = card.project_id
      returning id into folder;
  end if;
  insert into public.canvases(project_id, name, folder_id, position)
    select card.project_id, coalesce(nullif(left(trim(card.title), 120), ''), 'Untitled canvas'), folder,
      coalesce(max(position), -1) + 1 from public.canvases where project_id = card.project_id
    returning id into target_id;
  update public.board_cards set canvas_id = target_id where id = card.id;
  return query select target_id, true;
end;
$$;
revoke all on function public.open_board_card_canvas(uuid, uuid) from public, anon;
grant execute on function public.open_board_card_canvas(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
-- Ensure every sidebar source is published. Safe to run repeatedly.
do $$
declare table_name text;
begin
  foreach table_name in array array['boards', 'board_columns', 'board_cards', 'board_categories', 'canvases', 'canvas_folders', 'pages', 'sections'] loop
    if not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
