-- Pages linked to a task, shown in the task view. Run in the Supabase SQL editor before deploying.
begin;
alter table public.board_cards add column if not exists page_ids uuid[] not null default '{}';
commit;
notify pgrst, 'reload schema';
