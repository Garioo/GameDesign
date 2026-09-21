-- Duplicate a board: its stages and every task (with subtask hierarchy and internal
-- dependencies). Deliberately NOT copied: canvas links (a canvas is a live shared document —
-- copying the id would make both cards edit the same page) and milestones (splitting a
-- milestone's cross-board task list onto a copy is ambiguous, so it's left for the user to
-- recreate if they want one on the copy).
begin;
create or replace function public.copy_board(p_project uuid, p_board uuid) returns uuid
language plpgsql security invoker set search_path=public as $$
declare
  new_board uuid;
  new_position integer;
  card record;
  new_card_id uuid;
begin
  if not public.can_edit_project(p_project) then raise exception 'Editor access is required'; end if;
  if not exists(select 1 from boards where id=p_board and project_id=p_project) then raise exception 'Board not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project::text,841));

  select coalesce(max(position),-1)+1 into new_position from boards where project_id=p_project;
  insert into boards(project_id,name,color,position,end_date)
    select project_id, left(trim(name)||' (copy)',120), color, new_position, end_date
    from boards where id=p_board and project_id=p_project
    returning id into new_board;

  -- Old id -> new id, built explicitly (rather than via a bare INSERT ... RETURNING) so later
  -- steps can look up what a source row became.
  create temporary table _col_map(old_id uuid primary key, new_id uuid) on commit drop;
  with src as (
    select id as old_id, gen_random_uuid() as new_id, project_id, name, color, position, is_completed
    from board_columns where board_id=p_board and project_id=p_project
  ), ins as (
    insert into board_columns(id,board_id,project_id,name,color,position,is_completed)
    select new_id,new_board,project_id,name,color,position,is_completed from src
    returning id
  )
  insert into _col_map(old_id,new_id) select old_id,new_id from src;

  create temporary table _card_map(old_id uuid primary key, new_id uuid) on commit drop;
  -- Cards are inserted one at a time, parents before children, siblings in their original
  -- order — board_cards has a trigger that always appends a new row to the end of its
  -- sibling group, so processing them in exactly this order reconstructs the same tree and
  -- ordering. sort_path also lets each new card's parent_id be resolved from _card_map
  -- immediately, since by the time a child is reached its parent has already been copied.
  for card in
    with recursive ordered as (
      select c.id, c.column_id, c.parent_id, c.title, c.sub, c.kind, c.tags, c.priority, c.owners,
        c.deadline, c.start_date, c.firm_deadline, c.calendar_end_only, c.position,
        array[c.position] as sort_path
      from board_cards c join board_columns col on col.id=c.column_id
      where col.board_id=p_board and col.project_id=p_project and c.parent_id is null
      union all
      select c.id, c.column_id, c.parent_id, c.title, c.sub, c.kind, c.tags, c.priority, c.owners,
        c.deadline, c.start_date, c.firm_deadline, c.calendar_end_only, c.position,
        o.sort_path || c.position
      from board_cards c join ordered o on c.parent_id = o.id
    )
    select * from ordered order by sort_path
  loop
    insert into board_cards(id,column_id,project_id,title,sub,kind,tags,priority,owners,
      deadline,start_date,firm_deadline,calendar_end_only,parent_id,position)
    values (gen_random_uuid(), (select new_id from _col_map where old_id=card.column_id), p_project,
      card.title, card.sub, card.kind, card.tags, card.priority, card.owners,
      card.deadline, card.start_date, card.firm_deadline, card.calendar_end_only,
      (select new_id from _card_map where old_id=card.parent_id), card.position)
    returning id into new_card_id;
    insert into _card_map(old_id,new_id) values (card.id,new_card_id);
  end loop;

  -- Dependencies where both ends are on this board (cross-board dependencies, if any exist,
  -- are left on the original — the copy's card wouldn't be what the other board expects).
  perform set_config('gantt.writing','yes',true);
  insert into gantt_dependencies(project_id,predecessor,successor,kind,gap)
  select p_project, pm.new_id, sm.new_id, d.kind, d.gap
  from gantt_dependencies d
  join _card_map pm on pm.old_id = d.predecessor
  join _card_map sm on sm.old_id = d.successor
  where d.project_id = p_project;
  perform set_config('gantt.writing','no',true);

  return new_board;
end;
$$;
revoke all on function public.copy_board(uuid,uuid) from public,anon;
grant execute on function public.copy_board(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
