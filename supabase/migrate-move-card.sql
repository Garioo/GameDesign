-- Move a task to a stage and set that stage's card order in one transaction.
--
-- Replaces the client's old two-step move (a full schedule round-trip that
-- re-sent legacy task dates, then one UPDATE per card for positions), which
-- could fail with "The schedule changed" whenever a teammate edited anything
-- and could leave positions half-written. Tasks carry no dates any more, so
-- a stage move is just column_id + positions.
--
-- Rules: editors only; the stage must be on the task's own board (boards keep
-- their own stages, and subtasks must share their parent's board). Ids in
-- p_ordered that aren't in the destination stage are ignored.
--
-- Apply after migrate-phase-planning.sql. Safe to rerun.
begin;

create or replace function public.move_board_card(p_card uuid, p_column uuid, p_ordered uuid[])
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_project uuid;
  v_from_board uuid;
  v_to_board uuid;
begin
  select k.project_id, c.board_id into v_project, v_from_board
  from public.board_cards k join public.board_columns c on c.id = k.column_id
  where k.id = p_card;
  if v_project is null then raise exception 'Task not found'; end if;
  if not public.can_edit_project(v_project) then raise exception 'Editor access is required'; end if;
  -- Same lock as the schedule RPCs, so moves serialize with other planning writes.
  perform pg_advisory_xact_lock(hashtextextended(v_project::text, 841));

  select board_id into v_to_board from public.board_columns where id = p_column and project_id = v_project;
  if v_to_board is null then raise exception 'Choose a stage in this workspace'; end if;
  if v_to_board <> v_from_board then raise exception 'Tasks can only move between stages of their own board'; end if;

  -- Stage changes are guarded (migrate-gantt-planning.sql); this is a sanctioned writer.
  perform set_config('gantt.writing', 'yes', true);
  update public.board_cards set column_id = p_column
  where id = p_card and column_id is distinct from p_column;
  perform set_config('gantt.writing', 'no', true);

  update public.board_cards k set position = o.ordinal - 1
  from unnest(coalesce(p_ordered, '{}')) with ordinality as o(id, ordinal)
  where k.id = o.id and k.column_id = p_column and k.position is distinct from o.ordinal - 1;
end $$;

revoke all on function public.move_board_card(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.move_board_card(uuid, uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
