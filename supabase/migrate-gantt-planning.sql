-- Apply after migrate-board-gantt.sql and before deploying the new client.
-- Safe to rerun: existing planning data and custom completion settings are preserved.
begin;
alter table public.board_cards add column if not exists firm_deadline date;
do $$ begin
 if not exists (
   select 1 from pg_constraint
   where conrelid = 'public.board_cards'::regclass
     and conname = 'board_cards_firm_deadline'
 ) then
   alter table public.board_cards add constraint board_cards_firm_deadline
     check(firm_deadline is null or deadline is null or deadline <= firm_deadline);
 end if;
 -- Only infer legacy completion on the first installation. A custom stage
 -- named Done may intentionally have completion turned off later.
 if not exists (
   select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'board_columns'
     and column_name = 'is_completed'
 ) then
   alter table public.board_columns add column is_completed boolean not null default false;
   update public.board_columns set is_completed = true where lower(trim(name)) = 'done';
 end if;
end; $$;
create table if not exists public.gantt_dependencies (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 predecessor uuid not null references public.board_cards(id) on delete cascade,
 successor uuid not null references public.board_cards(id) on delete cascade,
 kind text not null check(kind in ('FS','SS','FF')), gap integer not null default 0 check(gap >= 0),
 unique(predecessor, successor), check(predecessor <> successor)
);
create table if not exists public.gantt_milestones (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 board_id uuid references public.boards(id) on delete cascade, name text not null check(length(trim(name)) between 1 and 120), day date not null
);
create table if not exists public.gantt_milestone_tasks (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 milestone_id uuid not null references public.gantt_milestones(id) on delete cascade,
 card_id uuid not null references public.board_cards(id) on delete cascade, unique(milestone_id,card_id)
);
create table if not exists public.gantt_views (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120), settings jsonb not null default '{}'
);
create index if not exists gantt_dependencies_workspace on public.gantt_dependencies(project_id);
create index if not exists gantt_dependencies_successor on public.gantt_dependencies(successor);
create index if not exists gantt_milestones_workspace on public.gantt_milestones(project_id);
create index if not exists gantt_milestones_board on public.gantt_milestones(board_id);
create index if not exists gantt_milestone_tasks_workspace on public.gantt_milestone_tasks(project_id);
create index if not exists gantt_milestone_tasks_card on public.gantt_milestone_tasks(card_id);
create index if not exists gantt_views_owner on public.gantt_views(project_id,user_id);
do $$ declare t text; begin
 foreach t in array array['gantt_dependencies','gantt_milestones','gantt_milestone_tasks','gantt_views'] loop
 execute format('alter table public.%I enable row level security',t);
 if t = 'gantt_views' then
 execute format('drop policy if exists personal on public.%I',t);
 execute format('create policy personal on public.%I for all to authenticated using (user_id=auth.uid() and public.can_access_project(project_id)) with check (user_id=auth.uid() and public.can_access_project(project_id))',t);
 else
 execute format('drop policy if exists readers on public.%I',t);
 execute format('drop policy if exists editors on public.%I',t);
 execute format('create policy readers on public.%I for select to authenticated using (public.can_access_project(project_id))',t);
 execute format('create policy editors on public.%I for all to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id))',t);
 end if;
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
 execute format('alter publication supabase_realtime add table public.%I',t);
 end if;
 end loop;
end; $$;

-- A single snapshot token includes card metadata: undo cannot overwrite later edits.
create or replace function public.gantt_snapshot(p_project uuid) returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('cards',coalesce((select jsonb_agg(to_jsonb(c) order by id) from board_cards c where project_id=p_project),'[]'),
 'columns',coalesce((select jsonb_agg(to_jsonb(c) order by id) from board_columns c where project_id=p_project),'[]'),
 'dependencies',coalesce((select jsonb_agg(to_jsonb(d) order by id) from gantt_dependencies d where project_id=p_project),'[]'),
 'milestones',coalesce((select jsonb_agg(to_jsonb(m) order by id) from gantt_milestones m where project_id=p_project),'[]'),
 'links',coalesce((select jsonb_agg(to_jsonb(l) order by id) from gantt_milestone_tasks l where project_id=p_project),'[]'));
$$;

-- Prevent REST updates bypassing the scheduling transaction. Ordinary metadata writes
-- remain supported and acquire the same workspace lock before changing a record.
create or replace function public.gantt_write_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if pg_trigger_depth()=1 and not public.can_edit_project(coalesce(new.project_id,old.project_id)) then
 raise exception 'Editor access is required';
 end if;
 if tg_op='UPDATE' then
 if new.project_id is distinct from old.project_id then raise exception 'Moving records between workspaces is not supported'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(new.project_id,old.project_id)::text, 841));
 if current_setting('gantt.writing',true) is distinct from 'yes' then
 if tg_table_name in ('gantt_dependencies','gantt_milestones','gantt_milestone_tasks') and not (tg_op='DELETE' and pg_trigger_depth()>1) then
 raise exception 'Use the scheduling operation to change dependencies or milestones';
 elsif tg_table_name='board_cards' and tg_op='UPDATE' then
 if new.start_date is distinct from old.start_date or new.deadline is distinct from old.deadline or new.firm_deadline is distinct from old.firm_deadline or new.column_id is distinct from old.column_id then
 raise exception 'Use the scheduling operation to change dates or status';
 end if;
 end if;
 end if;
 return coalesce(new,old);
end; $$;
do $$ declare t text; begin
 foreach t in array array['boards','board_cards','board_columns','gantt_dependencies','gantt_milestones','gantt_milestone_tasks'] loop
 execute format('drop trigger if exists gantt_guard on public.%I',t);
 execute format('create trigger gantt_guard before insert or update or delete on public.%I for each row execute function public.gantt_write_guard()',t);
 end loop;
end; $$;

create or replace function public.gantt_mutate(p_project uuid, p_expected jsonb, p_action jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare before_state jsonb; after_state jsonb; item jsonb; edge record; task record; needed date; shift integer;
 pass integer; changed boolean; n integer; affected integer; op text := p_action->>'op';
begin
 if not public.can_edit_project(p_project) then raise exception 'Editor access is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,841));
 before_state := public.gantt_snapshot(p_project);
 if before_state is distinct from p_expected then raise exception 'The schedule changed. Refresh and retry.'; end if;
 perform set_config('gantt.writing','yes',true);
 if op='card' then
 item := p_action->'card';
 if (item->>'deadline')::date > (item->>'firm_deadline')::date then raise exception 'Scheduled end exceeds the firm deadline'; end if;
 update board_cards set start_date=(item->>'start_date')::date, deadline=(item->>'deadline')::date,
 firm_deadline=(item->>'firm_deadline')::date where id=(item->>'id')::uuid and project_id=p_project;
 if not found then raise exception 'Task not found'; end if;
 if item ? 'title' then
 if length(trim(item->>'title')) not between 1 and 500 then raise exception 'Task title must contain 1 to 500 characters'; end if;
 update board_cards set title=item->>'title', sub=item->>'sub', kind=item->>'kind', tags=array(select jsonb_array_elements_text(item->'tags')),
 priority=item->>'priority', owners=array(select jsonb_array_elements_text(item->'owners'))::uuid[]
 where id=(item->>'id')::uuid and project_id=p_project;
 end if;
 if item ? 'column_id' then
 if not exists(select 1 from board_columns where id=(item->>'column_id')::uuid and project_id=p_project) then raise exception 'Invalid column'; end if;
 update board_cards set column_id=(item->>'column_id')::uuid where id=(item->>'id')::uuid and project_id=p_project;
 end if;
 elsif op='dependency' then
 if not exists(select 1 from board_cards where id=(p_action->>'predecessor')::uuid and project_id=p_project)
 or not exists(select 1 from board_cards where id=(p_action->>'successor')::uuid and project_id=p_project) then raise exception 'Both tasks must belong to this workspace'; end if;
 insert into gantt_dependencies(project_id,predecessor,successor,kind,gap) values(p_project,(p_action->>'predecessor')::uuid,(p_action->>'successor')::uuid,p_action->>'kind',(p_action->>'gap')::integer);
 elsif op='delete_dependency' then
 delete from gantt_dependencies where id=(p_action->>'id')::uuid and project_id=p_project;
 elsif op='column' then
 update board_columns set is_completed=(p_action->>'completed')::boolean where id=(p_action->>'id')::uuid and project_id=p_project;
 elsif op='milestone' then
 item := p_action->'milestone';
 if item->>'board_id' is not null and not exists(select 1 from boards where id=(item->>'board_id')::uuid and project_id=p_project) then raise exception 'Invalid milestone board'; end if;
 insert into gantt_milestones(id,project_id,board_id,name,day) values((item->>'id')::uuid,p_project,(item->>'board_id')::uuid,item->>'name',(item->>'day')::date)
 on conflict(id) do update set name=excluded.name,day=excluded.day,board_id=excluded.board_id where gantt_milestones.project_id=p_project;
 if not found then raise exception 'Milestone not found in this workspace'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_action->'tasks') v where not exists(select 1 from board_cards c where c.id=v.value::uuid and c.project_id=p_project)) then raise exception 'Milestone tasks must belong to this workspace'; end if;
 delete from gantt_milestone_tasks where milestone_id=(item->>'id')::uuid and project_id=p_project;
 insert into gantt_milestone_tasks(project_id,milestone_id,card_id) select p_project,(item->>'id')::uuid,value::uuid from jsonb_array_elements_text(p_action->'tasks');
 elsif op='delete_milestone' then
 delete from gantt_milestones where id=(p_action->>'id')::uuid and project_id=p_project;
 elsif op='undo' then
 -- Undo is limited to dates, and requires an unchanged complete snapshot.
 for item in select * from jsonb_array_elements(p_action->'dates') loop
 update board_cards set start_date=(item->>'start_date')::date,deadline=(item->>'deadline')::date,firm_deadline=(item->>'firm_deadline')::date
 where id=(item->>'id')::uuid and project_id=p_project;
 end loop;
 else raise exception 'Unknown scheduling operation'; end if;

 if exists(select 1 from gantt_dependencies d left join board_cards a on a.id=d.predecessor left join board_cards b on b.id=d.successor
 where d.project_id=p_project and (a.project_id<>p_project or b.project_id<>p_project or a.start_date is null or a.deadline is null or b.start_date is null or b.deadline is null)) then
 raise exception 'Linked tasks require start and end dates in this workspace. Remove links before clearing dates.'; end if;
 if exists(with recursive walk(root,node,path,cycle) as (
 select predecessor,successor,array[predecessor,successor],false from gantt_dependencies where project_id=p_project
 union all select w.root,d.successor,w.path||d.successor,d.successor=any(w.path) from walk w join gantt_dependencies d on d.predecessor=w.node where d.project_id=p_project and not w.cycle)
 select 1 from walk where cycle) then raise exception 'Dependencies cannot form a cycle'; end if;
 select count(*) into n from board_cards where project_id=p_project;
 for pass in 0..n loop
 changed := false;
 for edge in select d.*,a.start_date a_start,a.deadline a_end from gantt_dependencies d join board_cards a on a.id=d.predecessor where d.project_id=p_project order by d.id loop
 select c.*,col.is_completed into task from board_cards c join board_columns col on col.id=c.column_id where c.id=edge.successor;
 needed := case edge.kind when 'FS' then edge.a_end+1+edge.gap when 'SS' then edge.a_start+edge.gap else edge.a_end+edge.gap end;
 shift := needed - case when edge.kind='FF' then task.deadline else task.start_date end;
 if shift>0 then
 if task.is_completed then raise exception 'Completed task "%" blocks this change',task.title; end if;
 if task.deadline+shift>task.firm_deadline then raise exception 'Firm deadline for "%" blocks this change',task.title; end if;
 update board_cards set start_date=start_date+shift,deadline=deadline+shift where id=task.id;
 changed := true;
 end if;
 end loop;
 exit when not changed;
 if pass=n then raise exception 'Schedule could not converge'; end if;
 end loop;
 select * into task from board_cards where project_id=p_project and firm_deadline is not null and deadline>firm_deadline limit 1;
 if found then raise exception 'Firm deadline for "%" blocks this change',task.title; end if;
 if exists(select 1 from gantt_milestone_tasks l join gantt_milestones m on m.id=l.milestone_id join board_cards c on c.id=l.card_id join board_columns col on col.id=c.column_id
 where l.project_id=p_project and (c.project_id<>p_project or m.project_id<>p_project or (m.board_id is not null and col.board_id<>m.board_id) or c.deadline is null)) then raise exception 'Milestone prerequisites need end dates and must belong to its board/workspace'; end if;
 select m.name into task from gantt_milestone_tasks l join gantt_milestones m on m.id=l.milestone_id join board_cards c on c.id=l.card_id where l.project_id=p_project and c.deadline>m.day limit 1;
 if found then raise exception 'Fixed milestone "%" blocks this change',task.name; end if;
 after_state:=public.gantt_snapshot(p_project);
 select count(*) into affected from jsonb_array_elements(before_state->'cards') a join jsonb_array_elements(after_state->'cards') b on a->>'id'=b->>'id'
 where a->'start_date' is distinct from b->'start_date' or a->'deadline' is distinct from b->'deadline';
 perform set_config('gantt.writing','no',true);
 return jsonb_build_object('snapshot',after_state,'before',before_state->'cards','moved',affected);
end; $$;
revoke all on function public.gantt_mutate(uuid,jsonb,jsonb) from public,anon;
revoke all on function public.gantt_snapshot(uuid) from public,anon;
grant execute on function public.gantt_mutate(uuid,jsonb,jsonb),public.gantt_snapshot(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
