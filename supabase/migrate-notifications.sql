-- Notifications: @-mentions in comments, and task assignment.
-- Apply after the base schema (needs profiles, projects, project_members,
-- pages, comments, board_cards, can_access_project/can_edit_project).
--
-- Rows are only ever inserted by the two SECURITY DEFINER trigger functions
-- below — there is no client insert policy — so a client can't forge a
-- notification "from" someone else or spam another member's inbox.
--
-- Comment mentions are plain-text tokens the composer inserts:
--   @[Display Name](user:<uuid>)
-- which the mention trigger extracts and the UI renders as a plain "@Name".
begin;

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade, -- recipient
  actor_id   uuid references public.profiles(id) on delete set null,          -- who triggered it
  kind       text not null check (kind in ('mention', 'assignment')),
  snippet    text not null,
  link       text not null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());
grant select, update, delete on public.notifications to authenticated;

-- Enriched read: joins the actor's live profile so the UI never has to.
create or replace view public.notification_rows with (security_invoker = true) as
select n.*, p.name actor_name, p.initials actor_initials, p.color actor_color
from public.notifications n
left join public.profiles p on p.id = n.actor_id;
grant select on public.notification_rows to authenticated;

-- ---- mentions: @[Name](user:<uuid>) tokens in a new comment ----
create or replace function public.notify_comment_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_link text;
  v_snippet text;
  v_uid uuid;
  v_match text;
begin
  select project_id into v_project from public.pages where id = new.page_id;
  if v_project is null then return new; end if;
  v_link := '/doc?page=' || new.page_id;
  v_snippet := left(regexp_replace(new.body, '@\[([^\]]+)\]\(user:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\)', '@\1', 'g'), 200);
  for v_match in select (regexp_matches(new.body, '\(user:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)', 'g'))[1] loop
    v_uid := v_match::uuid;
    if v_uid = new.author then continue; end if;
    if not exists (select 1 from public.project_members where project_id = v_project and user_id = v_uid) then continue; end if;
    insert into public.notifications(project_id, user_id, actor_id, kind, snippet, link)
    values (v_project, v_uid, new.author, 'mention', v_snippet, v_link);
  end loop;
  return new;
end $$;

drop trigger if exists comments_notify_mentions on public.comments;
create trigger comments_notify_mentions after insert on public.comments
for each row execute function public.notify_comment_mentions();

-- ---- assignment: a task's owners array gains a new member ----
create or replace function public.notify_card_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_board uuid;
  v_link text;
  v_newly uuid[];
  v_uid uuid;
begin
  if tg_op = 'UPDATE' then
    v_newly := array(select unnest(new.owners) except select unnest(coalesce(old.owners, '{}')));
  else
    v_newly := new.owners;
  end if;
  if v_newly is null or array_length(v_newly, 1) is null then return new; end if;
  select c.board_id into v_board from public.board_columns c where c.id = new.column_id;
  if v_board is null then return new; end if;
  v_link := '/board?board=' || v_board;
  foreach v_uid in array v_newly loop
    if v_uid = v_actor then continue; end if;
    insert into public.notifications(project_id, user_id, actor_id, kind, snippet, link)
    values (new.project_id, v_uid, v_actor, 'assignment', left(new.title, 200), v_link);
  end loop;
  return new;
end $$;

drop trigger if exists board_cards_notify_assignment on public.board_cards;
create trigger board_cards_notify_assignment after insert or update of owners on public.board_cards
for each row execute function public.notify_card_assignment();

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
commit;
