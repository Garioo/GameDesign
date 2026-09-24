-- Team links (Discord, Overleaf, Google Drive, GitHub) shown in the top bar.
-- Run in the Supabase SQL editor before deploying.
begin;
alter table public.projects add column if not exists links jsonb not null default '{}'::jsonb;
commit;
notify pgrst, 'reload schema';
