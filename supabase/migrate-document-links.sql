-- Shared external documents in the Pages sidebar.
begin;
create table if not exists public.document_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  url text not null check (char_length(url) <= 2048 and url ~ '^https://[^[:space:]]+$'),
  created_at timestamptz not null default now(),
  unique(project_id, url)
);
create index if not exists document_links_project on public.document_links(project_id, created_at);
alter table public.document_links enable row level security;
drop policy if exists document_links_read on public.document_links;
create policy document_links_read on public.document_links for select to authenticated
  using (public.can_access_project(project_id));
drop policy if exists document_links_insert on public.document_links;
create policy document_links_insert on public.document_links for insert to authenticated
  with check (public.can_edit_project(project_id));
drop policy if exists document_links_update on public.document_links;
create policy document_links_update on public.document_links for update to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
drop policy if exists document_links_delete on public.document_links;
create policy document_links_delete on public.document_links for delete to authenticated
  using (public.can_edit_project(project_id));
grant select, insert, update, delete on public.document_links to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.document_links;
exception when duplicate_object then null; end $$;
notify pgrst, 'reload schema';
commit;
