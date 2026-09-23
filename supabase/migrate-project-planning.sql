-- Project planning on the board: task dependencies ("blocked by"),
-- milestones that tasks belong to, and recurring tasks.
--
--   card_dependencies  blocker → blocked. A task is blocked while any of its
--                      blockers sits in a stage that isn't a done stage.
--                      Both tasks must be in the workspace, and the links
--                      can't loop (A waits on B waits on A).
--   milestones         the base schema's table, now used: name, due date,
--                      description, optional board, and when it was reached.
--                      board_cards.milestone_id puts a task under one.
--   recurring_tasks    a rule that re-creates a task every day / week /
--                      2 weeks / month. spawn_recurring_tasks() creates the
--                      copies that are due (the board calls it on load), at
--                      most one per rule per call, skipping a period while the
--                      previous copy is still open. Copies point back at their
--                      rule through board_cards.recurrence_id.
--
-- Task dates stay untouched: tasks don't carry dates (phases do), so
-- recurrence runs on the rule's own schedule and deadlines live on milestones.
--
-- Apply after migrate-phase-planning.sql. Safe to rerun.
begin;

/* ---------------- task dependencies ---------------- */
create table if not exists public.card_dependencies (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  blocker    uuid not null references public.board_cards(id) on delete cascade,
  blocked    uuid not null references public.board_cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists idx_card_deps_project on public.card_dependencies(project_id);
create index if not exists idx_card_deps_blocked on public.card_dependencies(blocked);

create or replace function public.card_dependency_check() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from board_cards where id = new.blocker and project_id = new.project_id)
     or not exists (select 1 from board_cards where id = new.blocked and project_id = new.project_id) then
    raise exception 'Both tasks must be in this workspace';
  end if;
  -- Following "blocks" links from the blocked task must never reach the blocker.
  if exists (
    with recursive chain(id) as (
      select d.blocked from card_dependencies d where d.blocker = new.blocked
      union
      select d.blocked from card_dependencies d join chain c on d.blocker = c.id
    )
    select 1 from chain where id = new.blocker
  ) then
    raise exception 'These tasks would end up waiting on each other';
  end if;
  return new;
end $$;
drop trigger if exists card_dependency_check on public.card_dependencies;
create trigger card_dependency_check before insert or update on public.card_dependencies
  for each row execute function public.card_dependency_check();

alter table public.card_dependencies enable row level security;
drop policy if exists card_deps_select on public.card_dependencies;
create policy card_deps_select on public.card_dependencies
  for select to authenticated using (public.can_access_project(project_id));
drop policy if exists card_deps_insert on public.card_dependencies;
create policy card_deps_insert on public.card_dependencies
  for insert to authenticated with check (public.can_edit_project(project_id));
drop policy if exists card_deps_delete on public.card_dependencies;
create policy card_deps_delete on public.card_dependencies
  for delete to authenticated using (public.can_edit_project(project_id));
revoke update on public.card_dependencies from authenticated, anon;
grant select, insert, delete on public.card_dependencies to authenticated;

/* ---------------- milestones ---------------- */
alter table public.milestones add column if not exists description text not null default '';
alter table public.milestones add column if not exists board_id uuid references public.boards(id) on delete set null;
alter table public.milestones add column if not exists completed_at timestamptz;
alter table public.milestones drop constraint if exists milestones_name_length;
alter table public.milestones add constraint milestones_name_length
  check (char_length(btrim(name)) between 1 and 120) not valid;
alter table public.milestones drop constraint if exists milestones_description_length;
alter table public.milestones add constraint milestones_description_length
  check (char_length(description) <= 2000) not valid;
create index if not exists idx_milestones_project_due on public.milestones(project_id, due_date);

alter table public.board_cards add column if not exists milestone_id uuid references public.milestones(id) on delete set null;
create index if not exists idx_board_cards_milestone on public.board_cards(milestone_id) where milestone_id is not null;

/* ---------------- recurring tasks ---------------- */
create table if not exists public.recurring_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  board_id    uuid not null references public.boards(id) on delete cascade,
  -- Stage new copies go to; null or gone = the board's first open stage.
  column_id   uuid references public.board_columns(id) on delete set null,
  title       text not null check (char_length(btrim(title)) between 1 and 300),
  sub         text not null default '',
  owners      uuid[] not null default '{}',
  priority    text,
  category_id uuid,
  milestone_id uuid references public.milestones(id) on delete set null,
  every       text not null check (every in ('day', 'week', '2weeks', 'month')),
  next_run    date not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists idx_recurring_project on public.recurring_tasks(project_id, next_run);

alter table public.board_cards add column if not exists recurrence_id uuid references public.recurring_tasks(id) on delete set null;
create index if not exists idx_board_cards_recurrence on public.board_cards(recurrence_id) where recurrence_id is not null;

alter table public.recurring_tasks enable row level security;
drop policy if exists recurring_select on public.recurring_tasks;
create policy recurring_select on public.recurring_tasks
  for select to authenticated using (public.can_access_project(project_id));
drop policy if exists recurring_write on public.recurring_tasks;
create policy recurring_write on public.recurring_tasks
  for all to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
grant select, insert, update, delete on public.recurring_tasks to authenticated;

create or replace function public.recurrence_step(p_day date, p_every text) returns date
language sql immutable as $$
  select case p_every
    when 'day' then p_day + 1
    when 'week' then p_day + 7
    when '2weeks' then p_day + 14
    else (p_day + interval '1 month')::date
  end
$$;

-- Turn a task into (or change) a repeating one; its current fields are the template.
create or replace function public.set_task_recurrence(p_card uuid, p_every text) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  c record;
  v_board uuid;
  v_rule uuid;
begin
  select k.*, col.board_id into c
  from board_cards k join board_columns col on col.id = k.column_id where k.id = p_card;
  if not found then raise exception 'Task not found'; end if;
  if not public.can_edit_project(c.project_id) then raise exception 'Editor access is required'; end if;
  v_board := c.board_id;
  if p_every is null then
    -- Stop repeating: existing copies stay, they just lose the link.
    if c.recurrence_id is not null then delete from recurring_tasks where id = c.recurrence_id; end if;
    return null;
  end if;
  if p_every not in ('day', 'week', '2weeks', 'month') then raise exception 'Unknown repeat interval %', p_every; end if;
  if c.recurrence_id is not null and exists (select 1 from recurring_tasks where id = c.recurrence_id) then
    update recurring_tasks
    set every = p_every, title = c.title, sub = c.sub, owners = coalesce(c.owners, '{}'), priority = c.priority,
        category_id = c.category_id, milestone_id = c.milestone_id,
        next_run = public.recurrence_step(current_date, p_every)
    where id = c.recurrence_id
    returning id into v_rule;
  else
    insert into recurring_tasks (project_id, board_id, column_id, title, sub, owners, priority, category_id, milestone_id, every, next_run)
    values (c.project_id, v_board, c.column_id, coalesce(nullif(btrim(c.title), ''), 'Repeating task'), coalesce(c.sub, ''),
            coalesce(c.owners, '{}'), c.priority, c.category_id, c.milestone_id, p_every, public.recurrence_step(current_date, p_every))
    returning id into v_rule;
    update board_cards set recurrence_id = v_rule where id = p_card;
  end if;
  return v_rule;
end $$;

-- Create the copies that are due. Editors only (others get 0, so viewers can
-- load the board without errors); serialised per workspace so two open tabs
-- can't both create the same copy.
create or replace function public.spawn_recurring_tasks(p_project uuid) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  r record;
  v_col uuid;
  v_pos integer;
  v_made integer := 0;
  v_next date;
begin
  if not public.can_edit_project(p_project) then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project::text, 842));
  for r in select * from recurring_tasks where project_id = p_project and next_run <= current_date order by next_run loop
    -- Next period after today, so missed periods don't pile up.
    v_next := r.next_run;
    while v_next <= current_date loop v_next := public.recurrence_step(v_next, r.every); end loop;
    update recurring_tasks set next_run = v_next where id = r.id;
    -- Still open from last time: skip this period.
    continue when exists (
      select 1 from board_cards k join board_columns col on col.id = k.column_id
      where k.recurrence_id = r.id and not coalesce(col.is_completed, false)
    );
    select col.id into v_col from board_columns col
    where col.id = r.column_id and col.board_id = r.board_id and not coalesce(col.is_completed, false);
    if v_col is null then
      select col.id into v_col from board_columns col
      where col.board_id = r.board_id
      order by coalesce(col.is_completed, false), col.position limit 1;
    end if;
    continue when v_col is null;
    select coalesce(max(position), -1) + 1 into v_pos from board_cards where column_id = v_col;
    insert into board_cards (id, project_id, column_id, title, sub, kind, tags, owners, priority, category_id, milestone_id, recurrence_id, position)
    values (gen_random_uuid(), p_project, v_col, r.title, r.sub, '', '{}', r.owners, r.priority,
            (select id from board_categories where id = r.category_id and project_id = p_project),
            r.milestone_id, r.id, v_pos);
    v_made := v_made + 1;
  end loop;
  return v_made;
end $$;

revoke all on function public.set_task_recurrence(uuid, text), public.spawn_recurring_tasks(uuid) from public, anon;
grant execute on function public.set_task_recurrence(uuid, text), public.spawn_recurring_tasks(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['card_dependencies', 'milestones', 'recurring_tasks'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
