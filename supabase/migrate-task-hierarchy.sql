-- Run after migrate-gantt-planning.sql and migrate-custom-stages.sql.
-- Safe to rerun. Existing tasks stay at the top level; deleting a parent keeps its children.
begin;
alter table public.board_cards add column if not exists parent_id uuid references public.board_cards(id) on delete set null;
create index if not exists board_cards_parent on public.board_cards(parent_id);

create or replace function public.gantt_validate_task_hierarchy(p_project uuid)
returns void language plpgsql security invoker set search_path=public as $$
begin
 if not public.can_access_project(p_project) then raise exception 'Workspace access is required'; end if;
 if exists (
  select 1 from board_cards child
  left join board_cards parent on parent.id=child.parent_id and parent.project_id=p_project
  left join board_columns cc on cc.id=child.column_id
  left join board_columns pc on pc.id=parent.column_id
  where child.project_id=p_project and child.parent_id is not null
    and (parent.id is null or parent.id=child.id or parent.parent_id is not null
      or cc.board_id is distinct from pc.board_id)
 ) then raise exception 'Choose a top-level parent task in the same board. Subtasks cannot contain other subtasks.'; end if;
 if exists (
  select 1 from board_cards child join board_cards parent on parent.id=child.parent_id
  join board_columns cc on cc.id=child.column_id join board_columns pc on pc.id=parent.column_id
  where child.project_id=p_project and pc.is_completed and not cc.is_completed
 ) then raise exception 'Complete all subtasks before completing their parent. Reopen the parent before adding or reopening a subtask.'; end if;
end; $$;

create or replace function public.gantt_hierarchy_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 perform public.gantt_validate_task_hierarchy(coalesce(new.project_id,old.project_id));
 return null;
end; $$;
-- Validate the final transaction state so stage transfers and multi-row changes stay atomic.
drop trigger if exists gantt_hierarchy_guard on public.board_cards;
create constraint trigger gantt_hierarchy_guard after insert or update or delete on public.board_cards
 deferrable initially deferred for each row execute function public.gantt_hierarchy_guard();
drop trigger if exists gantt_hierarchy_guard on public.board_columns;
create constraint trigger gantt_hierarchy_guard after insert or update or delete on public.board_columns
 deferrable initially deferred for each row execute function public.gantt_hierarchy_guard();

create or replace function public.gantt_mutate_hierarchy(p_project uuid,p_expected jsonb,p_action jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare before_state jsonb; result jsonb; parent_task record; target_column record; task_title text; parent uuid;
begin
 if not public.can_edit_project(p_project) then raise exception 'Editor access is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,841));
 before_state:=public.gantt_snapshot(p_project);
 if before_state is distinct from p_expected then raise exception 'The schedule changed. Refresh and retry.'; end if;
 if p_action->>'op'='create_tasks' then
  if jsonb_typeof(p_action->'titles') is distinct from 'array' then raise exception 'Enter at least one task title'; end if;
  if jsonb_array_length(p_action->'titles') not between 1 and 100 then raise exception 'Add between 1 and 100 tasks at a time'; end if;
  if exists(select 1 from jsonb_array_elements(p_action->'titles') title where jsonb_typeof(title) <> 'string') then raise exception 'Task titles must be text'; end if;
  parent:=(p_action->>'parent_id')::uuid;
  if parent is not null then
   select c.*,col.board_id into parent_task from board_cards c join board_columns col on col.id=c.column_id where c.id=parent and c.project_id=p_project;
   if not found or parent_task.parent_id is not null then raise exception 'Choose a top-level parent task in this workspace'; end if;
  end if;
  select * into target_column from board_columns where id=(p_action->>'column_id')::uuid and project_id=p_project;
  if not found then raise exception 'Choose a stage for the new tasks'; end if;
  if target_column.is_completed then raise exception 'Choose an unfinished stage for new tasks'; end if;
  if parent is not null and target_column.board_id<>parent_task.board_id then raise exception 'Subtasks must be in the same board as their parent'; end if;
  for task_title in select jsonb_array_elements_text(p_action->'titles') loop
   if length(trim(task_title)) not between 1 and 500 then raise exception 'Task titles must contain 1 to 500 characters'; end if;
   insert into board_cards(id,project_id,column_id,parent_id,title,position,start_date,deadline)
   select gen_random_uuid(),p_project,target_column.id,parent,trim(task_title),coalesce(max(position),-1)+1,coalesce((p_action->>'day')::date,current_date),coalesce((p_action->>'day')::date,current_date) from board_cards where column_id=target_column.id;
  end loop;
  result:=public.gantt_mutate(p_project,public.gantt_snapshot(p_project),jsonb_build_object('op','undo','dates','[]'::jsonb));
 elsif p_action->>'op'='card' then
  if not (p_action->'card' ? 'parent_id') then raise exception 'A parent selection is required'; end if;
  update board_cards set parent_id=(p_action->'card'->>'parent_id')::uuid where id=(p_action->'card'->>'id')::uuid and project_id=p_project;
  if not found then raise exception 'Task not found'; end if;
  result:=public.gantt_mutate(p_project,public.gantt_snapshot(p_project),p_action);
 else raise exception 'Unknown hierarchy operation'; end if;
 perform public.gantt_validate_task_hierarchy(p_project);
 return jsonb_set(result,'{before}',before_state->'cards');
end; $$;
revoke all on function public.gantt_mutate_hierarchy(uuid,jsonb,jsonb), public.gantt_validate_task_hierarchy(uuid), public.gantt_hierarchy_guard() from public,anon;
grant execute on function public.gantt_mutate_hierarchy(uuid,jsonb,jsonb), public.gantt_validate_task_hierarchy(uuid), public.gantt_hierarchy_guard() to authenticated;
notify pgrst,'reload schema';
commit;
