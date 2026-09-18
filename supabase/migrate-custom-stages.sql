-- Run once after migrate-gantt-planning.sql. Existing stages and cards are preserved.
begin;
create or replace function public.board_stage_snapshot(p_project uuid,p_board uuid)
returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('schedule',public.gantt_snapshot(p_project),'board',
 (select to_jsonb(b) from boards b where id=p_board and project_id=p_project));
$$;

create or replace function public.save_board_stages(
 p_project uuid,p_board uuid,p_expected jsonb,p_name text,p_stages jsonb,p_transfers jsonb default '{}'
) returns uuid language plpgsql security invoker set search_path=public as $$
declare target uuid:=p_board; stage jsonb; removed record; destination uuid; offset_position integer;
begin
 if not public.can_edit_project(p_project) then raise exception 'Editor access is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,841));
 if jsonb_typeof(p_stages) is distinct from 'array' or jsonb_array_length(p_stages)<1 then raise exception 'Add at least one stage'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120 then raise exception 'Board name must contain 1 to 120 characters'; end if;
 if exists(select 1 from jsonb_array_elements(p_stages) s where s->>'id' is null or s->>'name' is null or length(trim(s->>'name')) not between 1 and 120 or coalesce(s->>'color','') !~ '^#[0-9A-Fa-f]{6}$' or jsonb_typeof(s->'completed') is distinct from 'boolean') then raise exception 'Each stage needs a name, a valid color, and a completion setting'; end if;
 if exists(select 1 from jsonb_array_elements(p_stages) s group by lower(trim(s->>'name')) having count(*)>1) then raise exception 'Stage names must be unique within a board'; end if;
 if exists(select 1 from jsonb_array_elements(p_stages) s group by (s->>'id')::uuid having count(*)>1) then raise exception 'Stage IDs must be unique'; end if;
 if target is not null then
 if not exists(select 1 from boards where id=target and project_id=p_project) then raise exception 'Board not found'; end if;
 if public.board_stage_snapshot(p_project,target) is distinct from p_expected then raise exception 'The board changed while you were editing. Reload stages before saving.'; end if;
 else
 insert into boards(project_id,name,color,position) select p_project,trim(p_name),'#64748b',coalesce(max(position),-1)+1 from boards where project_id=p_project returning id into target;
 end if;
 perform set_config('gantt.writing','yes',true);
 update boards set name=trim(p_name) where id=target and project_id=p_project;
 for stage in select value from jsonb_array_elements(p_stages) loop
 -- An existing ID may only belong to the board being edited. RLS and the
 -- primary key also reject colliding IDs hidden from the caller.
 if exists(select 1 from board_columns where id=(stage->>'id')::uuid and (board_id<>target or project_id<>p_project)) then raise exception 'Stage belongs to another board'; end if;
 insert into board_columns(id,project_id,board_id,name,color,position,is_completed)
 values((stage->>'id')::uuid,p_project,target,trim(stage->>'name'),stage->>'color',0,(stage->>'completed')::boolean)
 on conflict(id) do update set name=excluded.name,color=excluded.color,is_completed=excluded.is_completed
 where board_columns.board_id=target and board_columns.project_id=p_project;
 if not found then raise exception 'Stage is unavailable'; end if;
 end loop;
 update board_columns c set position=s.ordinality-1 from jsonb_array_elements(p_stages) with ordinality s(value,ordinality)
 where c.id=(s.value->>'id')::uuid and c.board_id=target and c.project_id=p_project;
 for removed in select * from board_columns where board_id=target and project_id=p_project and id not in(select (value->>'id')::uuid from jsonb_array_elements(p_stages)) loop
 if exists(select 1 from board_cards where column_id=removed.id) then
 destination:=(p_transfers->>removed.id::text)::uuid;
 if destination is null or not exists(select 1 from jsonb_array_elements(p_stages) s where (s->>'id')::uuid=destination) then raise exception 'Choose a destination for tasks in "%"',removed.name; end if;
 select coalesce(max(position),-1)+1 into offset_position from board_cards where column_id=destination;
 update board_cards c set column_id=destination,position=offset_position+r.n-1
 from (select id,row_number() over(order by position,id)::integer n from board_cards where column_id=removed.id) r where c.id=r.id;
 end if;
 delete from board_columns where id=removed.id and board_id=target and project_id=p_project;
 end loop;
 -- Reuse the scheduling engine's complete graph and fixed-date validation.
 -- Empty date restoration performs validation without replacing task metadata.
 perform public.gantt_mutate(p_project,public.gantt_snapshot(p_project),jsonb_build_object('op','undo','dates','[]'::jsonb));
 perform set_config('gantt.writing','no',true);
 return target;
end;
$$;
revoke all on function public.board_stage_snapshot(uuid,uuid),public.save_board_stages(uuid,uuid,jsonb,text,jsonb,jsonb) from public,anon;
grant execute on function public.board_stage_snapshot(uuid,uuid),public.save_board_stages(uuid,uuid,jsonb,text,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
