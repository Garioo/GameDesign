-- Subscribed calendars (Moodle calendar export links) shown on the workspace calendar.
-- Members see the feed's name; the link itself carries the subscriber's Moodle token, so it
-- is not selectable directly — /api/calendar-feed reads it through calendar_feed_url().
begin;
create table if not exists public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null default 'Moodle' check (char_length(btrim(label)) between 1 and 80),
  url text not null check (
    char_length(url) <= 2000
    and url ~ '^https://[^/?#@]+(/[^?#]*)?/calendar/export_execute\.php\?'
  ),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists calendar_feeds_project on public.calendar_feeds(project_id);
alter table public.calendar_feeds enable row level security;
drop policy if exists calendar_feeds_read on public.calendar_feeds;
create policy calendar_feeds_read on public.calendar_feeds for select to authenticated using (public.can_access_project(project_id));
drop policy if exists calendar_feeds_insert on public.calendar_feeds;
create policy calendar_feeds_insert on public.calendar_feeds for insert to authenticated
  with check (public.can_edit_project(project_id) and created_by = auth.uid());
drop policy if exists calendar_feeds_update on public.calendar_feeds;
create policy calendar_feeds_update on public.calendar_feeds for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
drop policy if exists calendar_feeds_delete on public.calendar_feeds;
create policy calendar_feeds_delete on public.calendar_feeds for delete to authenticated using (public.can_edit_project(project_id));
-- Column grants keep `url` out of ordinary reads. Not added to the realtime publication,
-- since change payloads would include it.
revoke all on public.calendar_feeds from anon, authenticated;
grant select (id, project_id, label, created_by, created_at) on public.calendar_feeds to authenticated;
grant insert (project_id, label, url), update (label, url), delete on public.calendar_feeds to authenticated;

create or replace function public.calendar_feed_url(p_feed uuid) returns text
language sql stable security definer set search_path = public as $$
  select url from public.calendar_feeds where id = p_feed and public.can_access_project(project_id)
$$;
revoke all on function public.calendar_feed_url(uuid) from public, anon;
grant execute on function public.calendar_feed_url(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
