-- Event attendees: workspace members (attendees, profile ids) and people
-- outside Foundry by name (guests) on calendar events. Members who are added
-- to an event get an 'event' notification ("Nicolai added you to an event").
--
-- Apply after migrate-calendar-event-ranges.sql and migrate-activity.sql (it
-- extends the notification kinds that file defines). Safe to rerun.
begin;

alter table public.calendar_events add column if not exists attendees uuid[] not null default '{}';
alter table public.calendar_events add column if not exists guests text[] not null default '{}';

-- Each guest name is 1–120 characters once trimmed. A function, because a
-- check constraint can't contain a subquery over unnest().
create or replace function public.event_guests_valid(p_guests text[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(g is not null and char_length(btrim(g)) between 1 and 120), true)
  from unnest(p_guests) g
$$;

alter table public.calendar_events drop constraint if exists calendar_events_attendee_limits;
alter table public.calendar_events add constraint calendar_events_attendee_limits check (
  cardinality(attendees) <= 100
  and cardinality(guests) <= 100
  and public.event_guests_valid(guests)
);

-- Keep this list in sync with migrate-activity.sql, which defines the others.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mention', 'assignment', 'reply', 'page_owner', 'event'));

-- Notify members newly added to an event's attendees (not the person adding
-- them, and only current members of the event's workspace). The snippet
-- carries the title and when, e.g. "Sprint review · Friday 26 September 10:00".
create or replace function public.notify_event_attendees() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_newly uuid[];
  v_uid uuid;
  v_snippet text;
begin
  if tg_op = 'UPDATE' then
    v_newly := array(select unnest(new.attendees) except select unnest(old.attendees));
  else
    v_newly := array(select distinct unnest(new.attendees));
  end if;
  if coalesce(cardinality(v_newly), 0) = 0 then return new; end if;
  v_snippet := new.title || ' · ' || to_char(new.date, 'FMDay FMDD FMMonth')
    || coalesce(' ' || to_char(new.start_time, 'HH24:MI'), '');
  foreach v_uid in array v_newly loop
    if v_uid is not distinct from v_actor then continue; end if;
    if not exists (select 1 from public.project_members where project_id = new.project_id and user_id = v_uid) then
      continue;
    end if;
    insert into public.notifications(project_id, user_id, actor_id, kind, snippet, link)
    values (new.project_id, v_uid, v_actor, 'event', left(v_snippet, 200),
            '/calendar?date=' || new.date || '&event=' || new.id);
  end loop;
  return new;
end $$;

drop trigger if exists calendar_events_notify_attendees on public.calendar_events;
create trigger calendar_events_notify_attendees after insert or update of attendees on public.calendar_events
for each row execute function public.notify_event_attendees();

notify pgrst, 'reload schema';
commit;
