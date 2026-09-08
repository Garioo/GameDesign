-- Add scheduling to existing board cards. Run once in the Supabase SQL editor.
-- Existing deadlines and unscheduled cards are preserved.
begin;
alter table public.board_cards add column if not exists start_date date;
alter table public.board_cards drop constraint if exists board_cards_schedule_order;
alter table public.board_cards add constraint board_cards_schedule_order
  check (start_date is null or deadline is null or deadline >= start_date);
notify pgrst, 'reload schema';
commit;
