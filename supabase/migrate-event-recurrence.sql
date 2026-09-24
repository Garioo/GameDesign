-- Repeating calendar events with an agenda checklist.
--
--   calendar_events.repeat         null (one-off) or 'day' | 'week' | '2weeks' | 'month'
--   calendar_events.repeat_until   last day an occurrence may start on (null = forever)
--   calendar_events.skipped_dates  occurrences deleted one at a time ("delete this one")
--   calendar_events.agenda         [{ "id": "...", "text": "..." }] — the checklist;
--                                  for a repeating event it's the template every
--                                  occurrence starts from
--   calendar_events.repeat_weekends  false = no occurrences on Saturday / Sunday
--   calendar_agenda_checks         which items are ticked, per occurrence, so each
--                                  week's standup starts unticked
--   calendar_event_notes           meeting notes of one occurrence of a repeating
--                                  event (every occurrence starts empty; one-offs
--                                  keep using calendar_events.notes)
--
-- Occurrences are computed in the client (lib/calendarRecurrence.ts); only the
-- rule is stored. Apply after migrate-event-attendees.sql. Safe to rerun.
begin;

alter table public.calendar_events add column if not exists repeat text;
alter table public.calendar_events add column if not exists repeat_until date;
alter table public.calendar_events add column if not exists skipped_dates date[] not null default '{}';
alter table public.calendar_events add column if not exists agenda jsonb not null default '[]'::jsonb;
alter table public.calendar_events add column if not exists repeat_weekends boolean not null default true;

create or replace function public.event_agenda_valid(p_agenda jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p_agenda) = 'array'
    and jsonb_array_length(p_agenda) <= 50
    and coalesce((
      select bool_and(
        jsonb_typeof(item) = 'object'
        and char_length(coalesce(item->>'id', '')) between 1 and 64
        and char_length(btrim(coalesce(item->>'text', ''))) between 1 and 300
      )
      from jsonb_array_elements(p_agenda) item
    ), true)
$$;

alter table public.calendar_events drop constraint if exists calendar_events_repeat_rule;
alter table public.calendar_events add constraint calendar_events_repeat_rule check (
  (repeat is null or repeat in ('day', 'week', '2weeks', 'month'))
  and (repeat_until is null or (repeat is not null and repeat_until >= date))
  and cardinality(skipped_dates) <= 1000
);
alter table public.calendar_events drop constraint if exists calendar_events_agenda_valid;
alter table public.calendar_events add constraint calendar_events_agenda_valid check (public.event_agenda_valid(agenda));

create table if not exists public.calendar_agenda_checks (
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  -- Start date of the occurrence the tick belongs to (the event's date for a one-off).
  occurrence date not null,
  item_id text not null check (char_length(item_id) between 1 and 64),
  project_id uuid not null references public.projects(id) on delete cascade,
  checked_by uuid default auth.uid(),
  checked_at timestamptz not null default now(),
  primary key (event_id, occurrence, item_id)
);
create index if not exists calendar_agenda_checks_project on public.calendar_agenda_checks(project_id);

alter table public.calendar_agenda_checks enable row level security;
drop policy if exists calendar_agenda_checks_read on public.calendar_agenda_checks;
create policy calendar_agenda_checks_read on public.calendar_agenda_checks for select to authenticated
  using (public.can_access_project(project_id));
-- The tick's project must be its event's project, so RLS on one can't be
-- dodged by pointing at the other.
drop policy if exists calendar_agenda_checks_insert on public.calendar_agenda_checks;
create policy calendar_agenda_checks_insert on public.calendar_agenda_checks for insert to authenticated
  with check (
    public.can_edit_project(project_id)
    and exists (select 1 from public.calendar_events e where e.id = event_id and e.project_id = calendar_agenda_checks.project_id)
  );
drop policy if exists calendar_agenda_checks_delete on public.calendar_agenda_checks;
create policy calendar_agenda_checks_delete on public.calendar_agenda_checks for delete to authenticated
  using (public.can_edit_project(project_id));
grant select, insert, delete on public.calendar_agenda_checks to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.calendar_agenda_checks;
exception when duplicate_object then null; end $$;

create table if not exists public.calendar_event_notes (
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  occurrence date not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 5000),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (event_id, occurrence)
);
create index if not exists calendar_event_notes_project on public.calendar_event_notes(project_id);

alter table public.calendar_event_notes enable row level security;
drop policy if exists calendar_event_notes_read on public.calendar_event_notes;
create policy calendar_event_notes_read on public.calendar_event_notes for select to authenticated
  using (public.can_access_project(project_id));
drop policy if exists calendar_event_notes_insert on public.calendar_event_notes;
create policy calendar_event_notes_insert on public.calendar_event_notes for insert to authenticated
  with check (
    public.can_edit_project(project_id)
    and exists (select 1 from public.calendar_events e where e.id = event_id and e.project_id = calendar_event_notes.project_id)
  );
drop policy if exists calendar_event_notes_update on public.calendar_event_notes;
create policy calendar_event_notes_update on public.calendar_event_notes for update to authenticated
  using (public.can_edit_project(project_id))
  with check (
    public.can_edit_project(project_id)
    and exists (select 1 from public.calendar_events e where e.id = event_id and e.project_id = calendar_event_notes.project_id)
  );
drop policy if exists calendar_event_notes_delete on public.calendar_event_notes;
create policy calendar_event_notes_delete on public.calendar_event_notes for delete to authenticated
  using (public.can_edit_project(project_id));
grant select, insert, update, delete on public.calendar_event_notes to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.calendar_event_notes;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
commit;
