-- Event categories on the calendar (each has its own colour).
--
--   calendar_events.kind   'interview' | 'meeting' | 'group' | 'agenda' | 'course' | 'other'
--
-- Events from subscribed calendars aren't stored; the client shows them as 'course'.
-- Apply after migrate-event-recurrence.sql. Safe to rerun.
begin;

alter table public.calendar_events add column if not exists kind text not null default 'other';
alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
alter table public.calendar_events add constraint calendar_events_kind_check
  check (kind in ('interview', 'meeting', 'group', 'agenda', 'course', 'other'));

commit;
