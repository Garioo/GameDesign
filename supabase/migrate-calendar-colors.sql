-- Workspace-chosen colours for calendar event categories.
--
--   projects.calendar_colors   { "<kind>": "#rrggbb", ... } — kinds without an entry
--                              keep their built-in colour (see EVENT_KINDS in
--                              lib/calendarEventsRepo.ts)
--
-- Editors already update their workspace row (projects_update policy). Apply after
-- migrate-event-kind.sql. Safe to rerun.
begin;

alter table public.projects add column if not exists calendar_colors jsonb not null default '{}'::jsonb;
-- Check constraints can't hold subqueries, so the rule lives in an immutable function
-- (same pattern as event_agenda_valid in migrate-event-recurrence.sql).
create or replace function public.calendar_colors_valid(p_colors jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p_colors) = 'object'
    and not exists (
      select 1 from jsonb_each(p_colors) e
      where e.key not in ('interview', 'meeting', 'group', 'agenda', 'course', 'other')
         or jsonb_typeof(e.value) <> 'string'
         or e.value #>> '{}' !~ '^#[0-9A-Fa-f]{6}$'
    );
$$;

alter table public.projects drop constraint if exists projects_calendar_colors_check;
alter table public.projects add constraint projects_calendar_colors_check check (public.calendar_colors_valid(calendar_colors));

commit;
