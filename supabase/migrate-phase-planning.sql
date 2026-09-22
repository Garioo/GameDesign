-- Apply after board-copy, board-end-date, calendar and task-hierarchy migrations.
-- Phase dates live in a one-to-one board schedule row; child rows share the same
-- scheduler and use a stable category id. Task dates are never written here.
begin;
alter table public.board_cards add column if not exists category_id uuid references public.board_categories(id) on delete set null;
-- Previously categories were names, so identical names are one logical category.
delete from public.board_categories a using public.board_categories b
where a.project_id=b.project_id and a.name=b.name and a.id>b.id;
alter table public.board_categories enable row level security;
drop policy if exists board_categories_all on public.board_categories;
create policy category_readers on public.board_categories for select to authenticated using(public.can_access_project(project_id));
create policy category_editors on public.board_categories for all to authenticated using(public.can_edit_project(project_id)) with check(public.can_edit_project(project_id));
create unique index if not exists board_categories_project_name on public.board_categories(project_id,name);
insert into public.board_categories(project_id,name)
select distinct project_id,kind from public.board_cards where coalesce(kind,'')<>''
on conflict(project_id,name) do nothing;
alter table public.board_cards disable trigger gantt_guard;
alter table public.board_cards disable trigger gantt_hierarchy_guard;
update public.board_cards c set category_id=k.id from public.board_categories k
where c.project_id=k.project_id and c.kind=k.name and c.category_id is null;
alter table public.board_cards enable trigger gantt_guard;
alter table public.board_cards enable trigger gantt_hierarchy_guard;

create table public.planning_phases (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 board_id uuid not null references public.boards(id) on delete cascade,
 category_id uuid references public.board_categories(id) on delete cascade,
 start_date date, end_date date,
 check(start_date is null or end_date is null or end_date>=start_date),
 unique(board_id,category_id)
);
create unique index planning_main_phase on public.planning_phases(board_id) where category_id is null;
create index planning_phases_project on public.planning_phases(project_id);
create table public.phase_dependencies (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 predecessor uuid not null references public.planning_phases(id) on delete cascade,
 successor uuid not null references public.planning_phases(id) on delete cascade,
 kind text not null check(kind in ('FS','SS','FF')), gap integer not null default 0 check(gap>=0),
 suspended boolean not null default false, reason text,
 check(predecessor<>successor), unique(predecessor,successor)
);
create index phase_dependencies_project on public.phase_dependencies(project_id);
alter table public.planning_phases enable row level security;
alter table public.phase_dependencies enable row level security;
create policy readers on public.planning_phases for select to authenticated using(public.can_access_project(project_id));
create policy readers on public.phase_dependencies for select to authenticated using(public.can_access_project(project_id));
grant select on public.planning_phases,public.phase_dependencies to authenticated;

insert into planning_phases(id,project_id,board_id,start_date,end_date)
select b.id,b.project_id,b.id,
 case when min(c.start_date)<=coalesce(b.end_date,max(c.deadline)) or coalesce(b.end_date,max(c.deadline)) is null then min(c.start_date) end,
 case when min(c.start_date)<=coalesce(b.end_date,max(c.deadline)) or min(c.start_date) is null then coalesce(b.end_date,max(c.deadline)) end
from boards b left join board_columns col on col.board_id=b.id left join board_cards c on c.column_id=col.id group by b.id;
insert into planning_phases(project_id,board_id,category_id,start_date,end_date)
select c.project_id,col.board_id,c.category_id,
case when min(c.start_date)<=max(c.deadline) or max(c.deadline) is null then min(c.start_date) end,
case when min(c.start_date)<=max(c.deadline) or min(c.start_date) is null then max(c.deadline) end
from board_cards c join board_columns col on col.id=c.column_id where c.category_id is not null
group by c.project_id,col.board_id,c.category_id;

-- Counts and active state are derived, never cached. Hidden categories keep their dates.
create view public.phase_rows with (security_invoker=true) as
with counts as (
 select p.*,b.name board_name,b.color,b.position board_position,k.name category_name,
 count(c.id)::integer total,count(c.id) filter(where col.is_completed)::integer completed
 from planning_phases p join boards b on b.id=p.board_id
 left join board_categories k on k.id=p.category_id
 left join board_columns col on col.board_id=p.board_id
 left join board_cards c on c.column_id=col.id and (p.category_id is null or c.category_id=p.category_id)
 group by p.id,b.id,k.id
)
select p.*,coalesce(p.category_name,p.board_name) title,
 p.category_id is null or p.total>0 active,
 case when p.category_id is null then least(p.start_date,(select min(s.start_date) from counts s where s.board_id=p.board_id and s.category_id is not null and s.total>0)) else p.start_date end effective_start,
 case when p.category_id is null then greatest(p.end_date,(select max(s.end_date) from counts s where s.board_id=p.board_id and s.category_id is not null and s.total>0)) else p.end_date end effective_end
from counts p;

create function public.phase_snapshot(p_project uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.can_access_project(p_project) then raise exception 'Workspace access is required'; end if;
 return jsonb_build_object('phases',coalesce((select jsonb_agg(to_jsonb(p) order by board_position,board_id,category_id nulls first,id) from phase_rows p where project_id=p_project),'[]'::jsonb),
 'dependencies',coalesce((select jsonb_agg(to_jsonb(d) order by id) from phase_dependencies d where project_id=p_project),'[]'::jsonb));
end; $$;

-- Internal helpers are callable only by the owning functions/triggers.
create function public.phase_shift(p_id uuid,p_days integer) returns void
language sql security definer set search_path=public as $$
 update planning_phases p set start_date=p.start_date+p_days,end_date=p.end_date+p_days
 from planning_phases root where root.id=p_id and (p.id=root.id or (root.category_id is null and p.board_id=root.board_id));
$$;
create function public.phase_reconcile(p_project uuid) returns void
language plpgsql security definer set search_path=public as $$
declare edge record; predecessor_row record; successor_row record; amount integer; changed boolean; pass integer; n integer;
begin
 if exists(select 1 from phase_dependencies d join phase_rows a on a.id=d.predecessor join phase_rows b on b.id=d.successor
 where d.project_id=p_project and not d.suspended and
 (a.project_id<>p_project or b.project_id<>p_project or not a.active or not b.active or a.effective_start is null or a.effective_end is null or b.effective_start is null or b.effective_end is null)) then
 raise exception 'Dependencies require scheduled, active phases in this workspace'; end if;
 if exists(select 1 from phase_dependencies d join planning_phases a on a.id=d.predecessor join planning_phases b on b.id=d.successor
 where d.project_id=p_project and not d.suspended and a.board_id=b.board_id and (a.category_id is null or b.category_id is null)) then
 raise exception 'A phase cannot depend on its own subphase'; end if;
 -- Expand every parent endpoint to its active children: children influence a
 -- parent finish, and moving a parent moves its children. This catches feedback
 -- loops that are invisible in the explicit dependency graph alone.
 if exists(with recursive edges as (
 select distinct src.id a,dst.id b from phase_dependencies d
 join planning_phases a on a.id=d.predecessor join planning_phases b on b.id=d.successor
 join phase_rows src on src.id=a.id or (a.category_id is null and src.board_id=a.board_id and src.active)
 join phase_rows dst on dst.id=b.id or (b.category_id is null and dst.board_id=b.board_id and dst.active)
 where d.project_id=p_project and not d.suspended
 ), walk(node,path,cycle) as (
 select b,array[a,b],a=b from edges union all
 select e.b,w.path||e.b,e.b=any(w.path) from walk w join edges e on e.a=w.node where not w.cycle
 ) select 1 from walk where cycle) then raise exception 'Phase dependencies cannot form a cycle (including parent expansion)'; end if;
 select count(*) into n from planning_phases where project_id=p_project;
 for pass in 0..n loop
 changed:=false;
 for edge in select * from phase_dependencies where project_id=p_project and not suspended order by id loop
 select * into predecessor_row from phase_rows where id=edge.predecessor;
 select * into successor_row from phase_rows where id=edge.successor;
 amount:=case edge.kind when 'FS' then predecessor_row.effective_end+1+edge.gap-successor_row.effective_start when 'SS' then predecessor_row.effective_start+edge.gap-successor_row.effective_start else predecessor_row.effective_end+edge.gap-successor_row.effective_end end;
 if amount>0 then perform phase_shift(successor_row.id,amount); changed:=true; end if;
 end loop;
 exit when not changed;
 if pass=n then raise exception 'Phase schedule could not converge'; end if;
 end loop;
end; $$;

create function public.phase_mutate(p_project uuid,p_expected jsonb,p_action jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare before_state jsonb; node record; item jsonb; new_start date; new_end date; op text:=p_action->>'op';
begin
 if not public.can_edit_project(p_project) then raise exception 'Editor access is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,841));
 before_state:=phase_snapshot(p_project);
 if before_state is distinct from p_expected then raise exception 'The phase schedule changed. Refresh and retry.'; end if;
 if op in ('dates','move','rename') then
 select * into node from phase_rows where id=(p_action->>'id')::uuid and project_id=p_project and active;
 if not found then raise exception 'Phase not found'; end if;
 if op='move' then
 if node.effective_start is null or node.effective_end is null then raise exception 'Set both dates before moving a phase'; end if;
 perform phase_shift(node.id,(p_action->>'days')::integer);
 elsif op='rename' then
 if length(trim(p_action->>'title')) not between 1 and 120 then raise exception 'Enter a title of 1–120 characters'; end if;
 if node.category_id is null then update boards set name=trim(p_action->>'title') where id=node.board_id;
 else update board_categories set name=trim(p_action->>'title') where id=node.category_id; end if;
 else
 new_start:=(p_action->>'start')::date; new_end:=(p_action->>'end')::date;
 if new_start>new_end then raise exception 'End must be on or after start'; end if;
 if node.category_id is null and exists(select 1 from phase_rows where board_id=node.board_id and category_id is not null and active and (effective_start<new_start or effective_end>new_end)) then
 raise exception 'Phase dates must contain its scheduled subphases'; end if;
 update planning_phases set start_date=new_start,end_date=new_end where id=node.id;
 end if;
 elsif op='dependency' then
 if not exists(select 1 from planning_phases where id=(p_action->>'predecessor')::uuid and project_id=p_project) or not exists(select 1 from planning_phases where id=(p_action->>'successor')::uuid and project_id=p_project) then raise exception 'Both phases must belong to this workspace'; end if;
 insert into phase_dependencies(project_id,predecessor,successor,kind,gap) values(p_project,(p_action->>'predecessor')::uuid,(p_action->>'successor')::uuid,p_action->>'kind',(p_action->>'gap')::integer);
 elsif op='delete_dependency' then
 delete from phase_dependencies where id=(p_action->>'id')::uuid and project_id=p_project;
 elsif op='resume_dependency' then
 update phase_dependencies set suspended=false,reason=null where id=(p_action->>'id')::uuid and project_id=p_project;
 elsif op='undo' then
 -- Restore dates and dependencies together; task state must still match expected.
 for item in select * from jsonb_array_elements(p_action->'before'->'phases') loop
 update planning_phases set start_date=(item->>'start_date')::date,end_date=(item->>'end_date')::date where id=(item->>'id')::uuid and project_id=p_project;
 end loop;
 delete from phase_dependencies where project_id=p_project;
 for item in select * from jsonb_array_elements(p_action->'before'->'dependencies') loop
 if not exists(select 1 from planning_phases where id=(item->>'predecessor')::uuid and project_id=p_project) or not exists(select 1 from planning_phases where id=(item->>'successor')::uuid and project_id=p_project) then raise exception 'Invalid undo endpoint'; end if;
 insert into phase_dependencies(id,project_id,predecessor,successor,kind,gap,suspended,reason) values((item->>'id')::uuid,p_project,(item->>'predecessor')::uuid,(item->>'successor')::uuid,item->>'kind',(item->>'gap')::integer,(item->>'suspended')::boolean,item->>'reason');
 end loop;
 else raise exception 'Unknown phase operation'; end if;
 perform phase_reconcile(p_project);
 return jsonb_build_object('snapshot',phase_snapshot(p_project),'before',before_state);
end; $$;

create function public.phase_card_category() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.project_id::text,841));
 if (tg_op='INSERT' and new.category_id is not null) or (tg_op='UPDATE' and new.category_id is distinct from old.category_id) then
 if new.category_id is null then new.kind:=''; else
 select name into new.kind from board_categories where id=new.category_id and project_id=new.project_id;
 if not found then raise exception 'Category must belong to this workspace'; end if;
 end if;
 elsif tg_op='INSERT' or new.kind is distinct from old.kind then
 if coalesce(new.kind,'')='' then new.category_id:=null; else
 insert into board_categories(project_id,name) values(new.project_id,new.kind) on conflict(project_id,name) do nothing;
 select id into new.category_id from board_categories where project_id=new.project_id and name=new.kind;
 end if;
 end if;
 return new;
end; $$;
create trigger phase_card_category before insert or update on public.board_cards for each row execute function public.phase_card_category();

create function public.phase_sync() returns trigger
language plpgsql security definer set search_path=public as $$
declare p uuid; returning_edge record;
begin
 p:=case when tg_op='DELETE' then old.project_id else new.project_id end;
 perform pg_advisory_xact_lock(hashtextextended(p::text,841));
 insert into planning_phases(id,project_id,board_id) select id,project_id,id from boards where project_id=p on conflict do nothing;
 insert into planning_phases(project_id,board_id,category_id,start_date,end_date)
 select c.project_id,col.board_id,c.category_id,
 case when min(c.start_date)<=max(c.deadline) or max(c.deadline) is null then min(c.start_date) end,
 case when min(c.start_date)<=max(c.deadline) or min(c.start_date) is null then max(c.deadline) end
 from board_cards c join board_columns col on col.id=c.column_id
 where c.project_id=p and c.category_id is not null group by c.project_id,col.board_id,c.category_id on conflict do nothing;
 update phase_dependencies d set suspended=true,reason='Category has no tasks'
 where d.project_id=p and exists(select 1 from phase_rows n where n.id in(d.predecessor,d.successor) and not n.active);
 update phase_dependencies d set suspended=true,reason='Waiting for scheduled tasks'
 where d.project_id=p and not d.suspended and exists(select 1 from phase_rows n where n.id in(d.predecessor,d.successor) and (n.effective_start is null or n.effective_end is null));
 -- Try each returning link independently. Failed reactivation leaves a visible
 -- suspended link; it must never block an ordinary task/category edit.
 for returning_edge in select * from phase_dependencies where project_id=p and suspended and reason in ('Category has no tasks','Waiting for scheduled tasks') order by id loop
 if not exists(select 1 from phase_rows n where n.id in(returning_edge.predecessor,returning_edge.successor) and (not n.active or n.effective_start is null or n.effective_end is null)) then
 begin
 update phase_dependencies set suspended=false,reason=null where id=returning_edge.id;
 perform phase_reconcile(p);
 exception when others then
 update phase_dependencies set suspended=true,reason='Review required: '||sqlerrm where id=returning_edge.id;
 end;
 end if;
 end loop;
 perform phase_reconcile(p);
 return null;
end; $$;
create trigger phase_sync_card after insert or update or delete on public.board_cards for each row execute function public.phase_sync();
create trigger phase_sync_board after insert on public.boards for each row execute function public.phase_sync();

create function public.phase_category_guard() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if pg_trigger_depth()=1 and not public.can_edit_project(coalesce(new.project_id,old.project_id)) then raise exception 'Editor access is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(new.project_id,old.project_id)::text,841));
 if tg_op='UPDATE' and new.project_id is distinct from old.project_id then raise exception 'Moving categories between workspaces is not supported'; end if;
 return coalesce(new,old);
end; $$;
create trigger phase_category_guard before insert or update or delete on public.board_categories for each row execute function public.phase_category_guard();

create function public.phase_category_rename() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.project_id::text,841));
 update board_cards set kind=new.name where category_id=new.id;
 return null;
end; $$;
create trigger phase_category_rename after update of name on public.board_categories for each row when(old.name is distinct from new.name) execute function public.phase_category_rename();

-- The old task RPC accepts names. Resolve an explicitly supplied stable id in
-- the same transaction, then delegate to the established task scheduler.
alter function public.gantt_mutate(uuid,jsonb,jsonb) rename to gantt_mutate_before_phases;
create function public.gantt_mutate(p_project uuid,p_expected jsonb,p_action jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare label text;
begin
 if not public.can_edit_project(p_project) then raise exception 'Editor access is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,841));
 if p_action->>'op'='card' and p_action->'card' ? 'category_id' then
 if p_action->'card'->>'category_id' is null then label:=''; else
 select name into label from board_categories where id=(p_action->'card'->>'category_id')::uuid and project_id=p_project;
 if not found then raise exception 'Category must belong to this workspace'; end if;
 end if;
 p_action:=jsonb_set(p_action,'{card,kind}',to_jsonb(label));
 end if;
 return gantt_mutate_before_phases(p_project,p_expected,p_action);
end; $$;

-- Wrap board copy after its existing task/hierarchy copy has completed.
alter function public.copy_board(uuid,uuid) rename to copy_board_before_phases;
create function public.copy_board(p_project uuid,p_board uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if not public.can_edit_project(p_project) then raise exception 'Editor access is required'; end if;
 result:=copy_board_before_phases(p_project,p_board);
 insert into planning_phases(project_id,board_id,category_id,start_date,end_date)
 select p_project,result,category_id,start_date,end_date from planning_phases where board_id=p_board and category_id is not null
 on conflict(board_id,category_id) do update set start_date=excluded.start_date,end_date=excluded.end_date;
 update planning_phases dest set start_date=src.start_date,end_date=src.end_date from planning_phases src where src.board_id=p_board and src.category_id is null and dest.board_id=result and dest.category_id is null;
 insert into phase_dependencies(project_id,predecessor,successor,kind,gap,suspended,reason)
 select p_project,na.id,nb.id,d.kind,d.gap,d.suspended,d.reason from phase_dependencies d
 join planning_phases a on a.id=d.predecessor and a.board_id=p_board join planning_phases b on b.id=d.successor and b.board_id=p_board
 join planning_phases na on na.board_id=result and na.category_id is not distinct from a.category_id
 join planning_phases nb on nb.board_id=result and nb.category_id is not distinct from b.category_id;
 return result;
end; $$;

do $$ declare f text; begin
 foreach f in array array['phase_snapshot(uuid)','phase_shift(uuid,integer)','phase_reconcile(uuid)','phase_mutate(uuid,jsonb,jsonb)','phase_card_category()','phase_sync()','phase_category_rename()','phase_category_guard()','gantt_mutate(uuid,jsonb,jsonb)','copy_board(uuid,uuid)'] loop
 execute 'revoke all on function public.'||f||' from public,anon,authenticated';
 end loop;
end; $$;
grant execute on function public.phase_snapshot(uuid),public.phase_mutate(uuid,jsonb,jsonb),public.gantt_mutate(uuid,jsonb,jsonb),public.copy_board(uuid,uuid) to authenticated;
alter publication supabase_realtime add table public.planning_phases,public.phase_dependencies;
notify pgrst,'reload schema';
commit;
