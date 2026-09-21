-- Standalone workspace events. No relationship to boards or scheduling tasks.
begin;
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  date date not null,
  end_date date check (end_date >= date),
  start_time time,
  end_time time,
  location text not null default '' check (char_length(location) <= 500),
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  constraint calendar_events_time_order check (end_time is null or (start_time is not null and (coalesce(end_date, date) > date or end_time > start_time)))
);
create index if not exists calendar_events_project_date on public.calendar_events(project_id, date);
alter table public.calendar_events enable row level security;
drop policy if exists calendar_events_read on public.calendar_events;
create policy calendar_events_read on public.calendar_events for select to authenticated using (public.can_access_project(project_id));
drop policy if exists calendar_events_insert on public.calendar_events;
create policy calendar_events_insert on public.calendar_events for insert to authenticated with check (public.can_edit_project(project_id));
drop policy if exists calendar_events_update on public.calendar_events;
create policy calendar_events_update on public.calendar_events for update to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
drop policy if exists calendar_events_delete on public.calendar_events;
create policy calendar_events_delete on public.calendar_events for delete to authenticated using (public.can_edit_project(project_id));
grant select, insert, update, delete on public.calendar_events to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.calendar_events;
exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
commit;
