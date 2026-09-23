-- Page edit history: who wrote what on a page.
--
-- Every change to a block's text is recorded in page_edits with its author and
-- the text before and after. Rows are written ONLY by the SECURITY DEFINER
-- trigger below (clients can't insert them), so nobody can forge authorship.
-- Members read the history of their workspace's pages.
--
-- Typing produces many saves, so one person's edits to the same block within
-- 10 minutes fold into one row (the first "before" is kept, "after" moves on).
-- An edit that ends up back where it started removes its row, and a block
-- that is added and deleted inside that window leaves nothing behind.
-- Position-only saves, type changes and checkbox ticks are not text edits and
-- are skipped. System work (seeding, migrations) has no caller and is skipped.
--
-- Apply after schema.sql. Safe to rerun.
begin;

create table if not exists public.page_edits (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  page_id     uuid not null references public.pages(id) on delete cascade,
  block_id    uuid not null, -- no FK: history outlives deleted blocks
  block_type  text not null,
  author      uuid references public.profiles(id) on delete set null,
  kind        text not null check (kind in ('added', 'edited', 'removed')),
  before_text text not null default '',
  after_text  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_page_edits_page on public.page_edits(page_id, updated_at desc);
create index if not exists idx_page_edits_fold on public.page_edits(block_id, author, updated_at desc);

alter table public.page_edits enable row level security;
drop policy if exists page_edits_select on public.page_edits;
create policy page_edits_select on public.page_edits
  for select using (public.can_access_project(project_id));
revoke insert, update, delete on public.page_edits from authenticated, anon;
grant select on public.page_edits to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.page_edits;
exception when duplicate_object then null; end $$;

-- The readable text of a block (what a person "wrote"). Images keep their
-- caption only: their src can be a large data URL.
create or replace function public.block_text(p_type text, p_content jsonb)
returns text language sql immutable set search_path = public as $$
  select coalesce(case p_type
    when 'table' then (
      select string_agg(r.line, e'\n' order by r.n)
      from (
        select row_n n, (select string_agg(c, ' | ' order by cell_n)
                         from jsonb_array_elements_text(row_v) with ordinality x(c, cell_n)) line
        from jsonb_array_elements(case when jsonb_typeof(p_content->'rows') = 'array' then p_content->'rows' else '[]'::jsonb end)
          with ordinality y(row_v, row_n)
        where jsonb_typeof(row_v) = 'array'
      ) r)
    when 'script' then p_content->>'path'
    when 'googleDrive' then p_content->'driveFile'->>'name'
    else p_content->>'text'
  end, '');
$$;

-- Writing into an empty block counts as adding text; emptying one as removing it.
create or replace function public.page_edit_kind(p_before text, p_after text)
returns text language sql immutable as $$
  select case when p_before = '' then 'added' when p_after = '' then 'removed' else 'edited' end;
$$;

create or replace function public.record_page_edit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_author uuid := auth.uid();
  v_block uuid := coalesce(new.id, old.id);
  v_page uuid := coalesce(new.page_id, old.page_id);
  v_type text := coalesce(new.type, old.type);
  v_before text := case when tg_op = 'INSERT' then '' else public.block_text(old.type, old.content) end;
  v_after text := case when tg_op = 'DELETE' then '' else public.block_text(new.type, new.content) end;
  v_project uuid;
  v_row public.page_edits;
begin
  if v_author is null or v_before = v_after then return null; end if;
  -- A page being deleted cascades to its blocks; there's nothing left to log against.
  select project_id into v_project from public.pages where id = v_page;
  if v_project is null then return null; end if;

  select * into v_row from public.page_edits
  where block_id = v_block and author = v_author and updated_at > now() - interval '10 minutes'
  order by updated_at desc limit 1
  for update;

  if found then
    if v_row.before_text = v_after then
      delete from public.page_edits where id = v_row.id; -- back where it started
    else
      update public.page_edits
      set after_text = v_after, block_type = v_type, updated_at = now(), kind = public.page_edit_kind(v_row.before_text, v_after)
      where id = v_row.id;
    end if;
    return null;
  end if;

  insert into public.page_edits(project_id, page_id, block_id, block_type, author, kind, before_text, after_text)
  values (v_project, v_page, v_block, v_type, v_author, public.page_edit_kind(v_before, v_after), v_before, v_after);
  return null;
end $$;
revoke all on function public.record_page_edit() from public, anon, authenticated;

drop trigger if exists blocks_page_edits on public.blocks;
create trigger blocks_page_edits after insert or update of content, type or delete on public.blocks
for each row execute function public.record_page_edit();

notify pgrst, 'reload schema';
commit;
