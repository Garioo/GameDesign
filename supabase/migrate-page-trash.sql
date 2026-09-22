-- Page trash: deleting a page moves it (and its sub-pages) to a trash instead
-- of hard-deleting it. Trashed pages stay readable to members (so the Trash
-- dialog can list them) but the client filters them out of the workspace.
-- Pages trashed more than 30 days ago are purged whenever someone trashes a
-- page in the same workspace, so no scheduled job is needed.
--
-- Apply after schema.sql. Safe to rerun.
begin;

alter table public.pages add column if not exists deleted_at timestamptz;
alter table public.pages add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
create index if not exists idx_pages_trash on public.pages(project_id, deleted_at) where deleted_at is not null;

-- Trash a page and every live descendant with one shared timestamp, so a
-- restore can bring back exactly the pages that went into the trash together.
create or replace function public.trash_page(p_page uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_now timestamptz := now();
begin
  select project_id into v_project from public.pages where id = p_page and deleted_at is null;
  if v_project is null then
    raise exception 'Page not found' using errcode = 'P0002';
  end if;
  if not public.can_edit_project(v_project) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  with recursive tree as (
    select id from public.pages where id = p_page
    union all
    select p.id from public.pages p join tree t on p.parent_id = t.id
    where p.deleted_at is null
  )
  update public.pages set deleted_at = v_now, deleted_by = auth.uid()
  where id in (select id from tree);

  delete from public.pages
  where project_id = v_project and deleted_at < v_now - interval '30 days';
end;
$$;

-- Restore a trashed page plus the descendants trashed with it. If its parent
-- is still in the trash, the page comes back at the top level of its section.
create or replace function public.restore_page(p_page uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_deleted timestamptz;
  v_parent uuid;
begin
  select project_id, deleted_at, parent_id into v_project, v_deleted, v_parent
  from public.pages where id = p_page;
  if v_project is null or v_deleted is null then
    raise exception 'Page not in trash' using errcode = 'P0002';
  end if;
  if not public.can_edit_project(v_project) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  with recursive tree as (
    select id from public.pages where id = p_page
    union all
    select p.id from public.pages p join tree t on p.parent_id = t.id
    where p.deleted_at = v_deleted
  )
  update public.pages set deleted_at = null, deleted_by = null
  where id in (select id from tree);

  if v_parent is not null and exists (
    select 1 from public.pages where id = v_parent and deleted_at is not null
  ) then
    update public.pages set parent_id = null where id = p_page;
  end if;
end;
$$;

revoke all on function public.trash_page(uuid) from public, anon;
revoke all on function public.restore_page(uuid) from public, anon;
grant execute on function public.trash_page(uuid) to authenticated;
grant execute on function public.restore_page(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
