-- Run after migrate-task-hierarchy.sql. Owner/admin migration; safe to rerun.
-- Apply before deploying the nested timeline client.
-- Existing task relationships and dates are preserved; deleting a parent keeps its children.
begin;
alter table public.board_cards add column if not exists parent_id uuid references public.board_cards(id) on delete set null;
create index if not exists board_cards_parent on public.board_cards(parent_id);

-- These existing guards assume an authenticated editor. The owner-only data
-- backfill runs inside this transaction before the guards are restored.
alter table public.board_cards add column if not exists timeline_position bigint;
alter table public.board_cards disable trigger gantt_guard;
alter table public.board_cards disable trigger gantt_hierarchy_guard;
with ranked as (
 select c.id, row_number() over(partition by col.board_id,c.parent_id order by col.position,col.id,c.position,c.id)-1 as ordinal
 from board_cards c join board_columns col on col.id=c.column_id
)
update board_cards c set timeline_position=r.ordinal from ranked r where c.id=r.id and c.timeline_position is null;
alter table public.board_cards enable trigger gantt_guard;
alter table public.board_cards enable trigger gantt_hierarchy_guard;
alter table public.board_cards alter column timeline_position set not null;
create index if not exists board_cards_timeline_order on public.board_cards(parent_id,timeline_position);

-- All creation paths, including legacy board clients, append within the tree.
create or replace function public.gantt_timeline_position() returns trigger
language plpgsql security invoker set search_path=public as $$
declare destination uuid; source uuid; append_position boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.project_id::text,841));
 select board_id into destination from board_columns where id=new.column_id;
 append_position := tg_op='INSERT';
 if tg_op='UPDATE' then
  select board_id into source from board_columns where id=old.column_id;
  append_position := new.parent_id is distinct from old.parent_id or destination is distinct from source;
  if not append_position and new.timeline_position is distinct from old.timeline_position
   and current_setting('gantt.timeline_ordering',true) is distinct from 'yes' then
   raise exception 'Use the timeline reorder operation';
  end if;
 end if;
 if append_position then
  select coalesce(max(c.timeline_position),-1)+1 into new.timeline_position
  from board_cards c join board_columns col on col.id=c.column_id
  where col.board_id=destination and c.parent_id is not distinct from new.parent_id and c.id<>new.id;
 end if;
 return new;
end; $$;
drop trigger if exists gantt_timeline_position on public.board_cards;
create trigger gantt_timeline_position before insert or update on public.board_cards
 for each row execute function public.gantt_timeline_position();
revoke all on function public.gantt_timeline_position() from public,anon;
grant execute on function public.gantt_timeline_position() to authenticated;

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
    and (parent.id is null or parent.id=child.id
      or cc.board_id is distinct from pc.board_id)
 ) then raise exception 'Choose a different parent task in the same board.'; end if;
 if exists (
  with recursive ancestry as (
   select id, parent_id, array[id] as path, false as cycle from board_cards where project_id=p_project
   union all
   select a.id, p.parent_id, a.path || p.id, p.id=any(a.path)
   from ancestry a join board_cards p on p.id=a.parent_id
   where not a.cycle
  ) select 1 from ancestry where cycle
 ) then raise exception 'A task cannot be its own ancestor. Choose a parent outside its descendants.'; end if;
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
declare before_state jsonb; result jsonb; parent_task record; target_column record; task_title text; parent uuid; ordered_ids uuid[]; sibling_ids uuid[]; target_board uuid;
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
   if not found then raise exception 'Choose a parent task in this workspace'; end if;
  end if;
  select * into target_column from board_columns where id=(p_action->>'column_id')::uuid and project_id=p_project;
  if not found then raise exception 'Choose a stage for the new tasks'; end if;
  if target_column.is_completed then raise exception 'Choose an unfinished stage for new tasks'; end if;
  if parent is not null and target_column.board_id<>parent_task.board_id then raise exception 'Subtasks must be in the same board as their parent'; end if;
  for task_title in select jsonb_array_elements_text(p_action->'titles') loop
   if length(trim(task_title)) not between 1 and 500 then raise exception 'Task titles must contain 1 to 500 characters'; end if;
   insert into board_cards(id,project_id,column_id,parent_id,title,position,start_date,deadline)
   select gen_random_uuid(),p_project,target_column.id,parent,trim(task_title),coalesce(max(position),-1)+1,case when p_action ? 'day' then (p_action->>'day')::date else current_date end,case when p_action ? 'day' then (p_action->>'day')::date else current_date end from board_cards where column_id=target_column.id;
  end loop;
  result:=public.gantt_mutate(p_project,public.gantt_snapshot(p_project),jsonb_build_object('op','undo','dates','[]'::jsonb));
 elsif p_action->>'op'='reorder_tasks' then
  target_board := (p_action->>'board_id')::uuid;
  parent := (p_action->>'parent_id')::uuid;
  if not exists(select 1 from boards where id=target_board and project_id=p_project) then
   raise exception 'Choose a board in this workspace';
  end if;
  if jsonb_typeof(p_action->'ids') is distinct from 'array' then raise exception 'Provide the complete sibling order'; end if;
  select array_agg(value::uuid order by ordinal) into ordered_ids
   from jsonb_array_elements_text(p_action->'ids') with ordinality as entries(value,ordinal);
  select array_agg(c.id order by c.id) into sibling_ids from board_cards c
   join board_columns col on col.id=c.column_id
   where c.project_id=p_project and col.board_id=target_board and c.parent_id is not distinct from parent;
  if ordered_ids is null or sibling_ids is null
   or cardinality(ordered_ids)<>cardinality(sibling_ids)
   or (select array_agg(x order by x) from unnest(ordered_ids) x) is distinct from sibling_ids then
   raise exception 'Provide every sibling exactly once';
  end if;
  perform set_config('gantt.timeline_ordering','yes',true);
  update board_cards c set timeline_position=entries.ordinal-1
   from unnest(ordered_ids) with ordinality entries(id,ordinal) where c.id=entries.id;
  perform set_config('gantt.timeline_ordering','no',true);
  result:=jsonb_build_object('snapshot',public.gantt_snapshot(p_project),'moved',0);
 elsif p_action->>'op'='card' then
  if not (p_action->'card' ? 'parent_id') then raise exception 'A parent selection is required'; end if;
  update board_cards set parent_id=(p_action->'card'->>'parent_id')::uuid where id=(p_action->'card'->>'id')::uuid and project_id=p_project;
  if not found then raise exception 'Task not found'; end if;
  -- Hierarchy-only edits must not clear dates omitted by the caller.
  result:=public.gantt_mutate(p_project,public.gantt_snapshot(p_project),
   jsonb_set(p_action,'{card}',(select jsonb_build_object('start_date',c.start_date,
    'deadline',c.deadline,'firm_deadline',c.firm_deadline) from board_cards c
    where c.id=(p_action->'card'->>'id')::uuid) || (p_action->'card')));
 else raise exception 'Unknown hierarchy operation'; end if;
 perform public.gantt_validate_task_hierarchy(p_project);
 return jsonb_set(result,'{before}',before_state->'cards');
end; $$;
revoke all on function public.gantt_mutate_hierarchy(uuid,jsonb,jsonb), public.gantt_validate_task_hierarchy(uuid), public.gantt_hierarchy_guard() from public,anon;
grant execute on function public.gantt_mutate_hierarchy(uuid,jsonb,jsonb), public.gantt_validate_task_hierarchy(uuid), public.gantt_hierarchy_guard() to authenticated;
notify pgrst,'reload schema';
commit;
