-- Persistent card-to-canvas links. Run in the Supabase SQL editor before deploying.
begin;
alter table public.board_cards add column if not exists canvas_id uuid
  references public.canvases(id) on delete set null;

-- Lock the card so simultaneous clicks cannot create duplicate canvases.
-- SECURITY INVOKER preserves the caller's row-level access rules.
create or replace function public.open_board_card_canvas(p_card_id uuid, p_existing_canvas_id uuid default null)
returns table (canvas_id uuid, created boolean)
language plpgsql security invoker set search_path = public
as $$
declare
  card public.board_cards%rowtype;
  target_id uuid;
  folder uuid;
begin
  select * into card from public.board_cards where id = p_card_id for update;
  if not found then raise exception 'Card not found or access denied'; end if;
  if not public.can_edit_project(card.project_id) then
    raise exception 'Editor access is required to link a canvas';
  end if;

  if p_existing_canvas_id is not null then
    select id into target_id from public.canvases
      where id = p_existing_canvas_id and project_id = card.project_id;
    if target_id is null then raise exception 'Choose a canvas in this workspace'; end if;
    update public.board_cards set canvas_id = target_id where id = card.id;
    return query select target_id, false;
    return;
  end if;

  if card.canvas_id is not null then
    select id into target_id from public.canvases
      where id = card.canvas_id and project_id = card.project_id;
    if target_id is null then raise exception 'Linked canvas is unavailable'; end if;
    return query select target_id, false;
    return;
  end if;

  -- Serialize folder creation within the workspace as well.
  perform pg_advisory_xact_lock(hashtextextended(card.project_id::text, 0));
  select id into folder from public.canvas_folders
    where project_id = card.project_id and name = 'Scrum board' order by position, id limit 1;
  if folder is null then
    insert into public.canvas_folders(project_id, name, position)
      select card.project_id, 'Scrum board', coalesce(max(position), -1) + 1
      from public.canvas_folders where project_id = card.project_id
      returning id into folder;
  end if;
  insert into public.canvases(project_id, name, folder_id, position)
    select card.project_id, coalesce(nullif(left(trim(card.title), 120), ''), 'Untitled canvas'), folder,
      coalesce(max(position), -1) + 1 from public.canvases where project_id = card.project_id
    returning id into target_id;
  update public.board_cards set canvas_id = target_id where id = card.id;
  return query select target_id, true;
end;
$$;
revoke all on function public.open_board_card_canvas(uuid, uuid) from public, anon;
grant execute on function public.open_board_card_canvas(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
