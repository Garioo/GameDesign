-- Comments never auto-updated for other viewers: the client already
-- subscribes to postgres_changes on public.comments (app/doc/page.tsx) and
-- refetches the open page's thread on any change, but the table was never
-- added to the supabase_realtime publication, so Postgres never emitted
-- those events in the first place — only a manual reload picked up new/
-- edited/deleted/resolved comments from other people.
--
-- Replica identity FULL is needed too: by default a DELETE's "old row"
-- payload only carries the primary key, but the client's delete handler
-- needs the deleted comment's page_id to know whether to refetch.
begin;

alter table public.comments replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
commit;
