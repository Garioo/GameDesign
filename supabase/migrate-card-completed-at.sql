-- When each board task was finished, for the Team scoreboard on Home.
--
-- One row per finished task in card_completions: written when a task moves into a done
-- stage, deleted when it moves back out, kept when it moves between two done stages.
-- Switching a stage to/from "done" finishes/reopens every task in it at that moment.
-- Tasks inserted straight into a done stage (e.g. by copying a board) get no row, so
-- copies don't count as new work.
--
-- Kept in its own table rather than a board_cards column on purpose: board_cards carries
-- the scheduler's write guard and a deferred hierarchy check, both of which demand a
-- signed-in member — so any backfill UPDATE of board_cards fails from the SQL editor.
-- Nothing here writes board_cards. Only these triggers write card_completions, so the
-- stats can't be padded from the client.
--
-- Apply after migrate-activity.sql (the backfill reads the activity feed). Safe to rerun.
begin;
create table if not exists public.card_completions (
  card_id uuid primary key references public.board_cards(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  completed_at timestamptz not null default now()
);
create index if not exists card_completions_project on public.card_completions(project_id, completed_at);
alter table public.card_completions enable row level security;
drop policy if exists card_completions_read on public.card_completions;
create policy card_completions_read on public.card_completions for select to authenticated
  using (public.can_access_project(project_id));
revoke all on public.card_completions from anon, authenticated;
grant select on public.card_completions to authenticated;

-- A task changed stage.
create or replace function public.track_card_completion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  now_done boolean;
  was_done boolean;
begin
  if new.column_id is not distinct from old.column_id then return null; end if;
  select is_completed into now_done from board_columns where id = new.column_id;
  select is_completed into was_done from board_columns where id = old.column_id;
  if coalesce(now_done, false) then
    if not coalesce(was_done, false) then
      insert into card_completions(card_id, project_id) values (new.id, new.project_id)
      on conflict (card_id) do update set completed_at = now();
    end if;
  else
    delete from card_completions where card_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists board_cards_completion on public.board_cards;
create trigger board_cards_completion after update of column_id on public.board_cards
  for each row execute function public.track_card_completion();

-- A stage was switched to or from "done".
create or replace function public.track_stage_completion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_completed and not coalesce(old.is_completed, false) then
    insert into card_completions(card_id, project_id)
    select id, project_id from board_cards where column_id = new.id
    on conflict (card_id) do update set completed_at = now();
  elsif coalesce(old.is_completed, false) and not new.is_completed then
    delete from card_completions where card_id in (select id from board_cards where column_id = new.id);
  end if;
  return null;
end $$;
drop trigger if exists board_columns_completion on public.board_columns;
create trigger board_columns_completion after update of is_completed on public.board_columns
  for each row execute function public.track_stage_completion();

-- Backfill tasks already done with the day they were moved into done, from the activity
-- feed. Tasks with no logged move have no known finish day: they count for "all time"
-- only, never for a week or month.
insert into public.card_completions(card_id, project_id, completed_at)
select c.id, c.project_id, max(a.created_at)
from public.board_cards c
join public.board_columns col on col.id = c.column_id and col.is_completed
join public.activity a on a.card_id = c.id and a.action = 'card.moved' and (a.meta->>'done')::boolean
group by c.id, c.project_id
on conflict (card_id) do nothing;

do $$ begin
  alter publication supabase_realtime add table public.card_completions;
exception when duplicate_object or undefined_object then null; end $$;
notify pgrst, 'reload schema';
commit;
