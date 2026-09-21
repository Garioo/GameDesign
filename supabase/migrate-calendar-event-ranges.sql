-- Upgrade existing events to inclusive multi-day ranges. Null end_date = same day.
begin;
alter table public.calendar_events add column if not exists end_date date;
alter table public.calendar_events drop constraint if exists calendar_events_check;
alter table public.calendar_events drop constraint if exists calendar_events_time_order;
alter table public.calendar_events drop constraint if exists calendar_events_date_order;
alter table public.calendar_events add constraint calendar_events_date_order check (end_date >= date);
alter table public.calendar_events add constraint calendar_events_time_order
  check (end_time is null or (start_time is not null and (coalesce(end_date, date) > date or end_time > start_time)));
notify pgrst, 'reload schema';
commit;
