-- Team activity feed + two more notification kinds.
--
-- Activity rows are written ONLY by the SECURITY DEFINER triggers/RPCs below
-- (the client insert policy is dropped), so nobody can forge "X did Y".
-- Members read their workspace's feed. What gets logged:
--   pages      created · status changed · trashed · restored
--   tasks      created (bursts on one board fold into one row) · moved stage
--              (and whether into a done stage) · assigned
--   comments   added on a page or a task (bursts on one thread fold together)
--   canvases   created
--   members    joined through an invite
-- Block text edits are NOT logged: pages.updated_at already drives
-- "Recently edited". Repeats by the same person on the same thing within 10
-- minutes update one row instead of adding more, and a status/stage change
-- that is undone inside that window removes its row.
--
-- Notifications gain 'reply' (someone answered a thread you're in) and 
-- 'page_owner' (you were made owner of a page).
--
-- Apply after migrate-page-trash.sql and migrate-card-comments.sql (this
-- redefines trash_page/restore_page to log once per action). Safe to rerun.
begin;

-- ---- activity table: richer targets, trigger-only writes ----
alter table public.activity add column if not exists card_id uuid references public.board_cards(id) on delete set null;
alter table public.activity add column if not exists canvas_id uuid references public.canvases(id) on delete set null;
alter table public.activity add column if not exists meta jsonb not null default '{}'::jsonb;
create index if not exists idx_activity_page on public.activity(page_id, created_at desc) where page_id is not null;
create index if not exists idx_activity_card on public.activity(card_id, created_at desc) where card_id is not null;

drop policy if exists activity_insert on public.activity;
revoke insert, update, delete on public.activity from authenticated, anon;
grant select on public.activity to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.activity;
exception when duplicate_object then null; end $$;

-- Append (or fold into a recent matching row) one activity entry by the caller.
create or replace function public.log_activity(
  p_project uuid, p_action text, p_target text,
  p_page uuid, p_card uuid, p_canvas uuid,
  p_meta jsonb, p_key text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_row public.activity;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  -- System work (migrations, seeding) has no caller and isn't team activity.
  if v_actor is null or p_project is null then return; end if;
  if p_key is not null then
    v_meta := v_meta || jsonb_build_object('k', p_key);
    select * into v_row from public.activity
    where project_id = p_project and actor = v_actor and action = p_action
      and meta->>'k' = p_key and created_at > now() - interval '10 minutes'
    order by created_at desc limit 1
    for update;
    if found then
      v_meta := v_row.meta || v_meta;
      if v_row.meta ? 'from' then v_meta := v_meta || jsonb_build_object('from', v_row.meta->'from'); end if;
      if v_row.meta ? 'count' then
        v_meta := v_meta || jsonb_build_object('count', coalesce((v_row.meta->>'count')::int, 1) + coalesce((p_meta->>'count')::int, 1));
      end if;
      if v_row.meta ? 'users' and p_meta ? 'users' then
        v_meta := v_meta || jsonb_build_object('users', (
          select jsonb_agg(distinct u) from (
            select jsonb_array_elements(v_row.meta->'users') u
            union select jsonb_array_elements(p_meta->'users')
          ) x));
      end if;
      -- Changed and changed back inside the window: nothing happened.
      if v_meta ? 'from' and v_meta->'from' = v_meta->'to' then
        delete from public.activity where id = v_row.id;
        return;
      end if;
      update public.activity
      set meta = v_meta, target = left(coalesce(p_target, v_row.target), 300), created_at = now(),
          page_id = coalesce(p_page, page_id), card_id = coalesce(p_card, card_id), canvas_id = coalesce(p_canvas, canvas_id)
      where id = v_row.id;
      return;
    end if;
  end if;
  insert into public.activity(project_id, actor, action, target, page_id, card_id, canvas_id, meta)
  values (p_project, v_actor, p_action, left(p_target, 300), p_page, p_card, p_canvas, v_meta);
end $$;
revoke all on function public.log_activity(uuid, text, text, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;

-- ---- pages ----
create or replace function public.activity_pages() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.project_id, 'page.created', new.title, new.id, null, null, '{}', null);
  elsif new.deleted_at is null and new.status is distinct from old.status then
    perform public.log_activity(new.project_id, 'page.status', new.title, new.id, null, null,
      jsonb_build_object('from', old.status, 'to', new.status), 'page:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists pages_activity on public.pages;
create trigger pages_activity after insert or update of status on public.pages
for each row execute function public.activity_pages();

-- ---- board tasks ----
create or replace function public.activity_cards() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_col record;
  v_old_col record;
  v_added uuid[];
begin
  select c.name, c.is_completed, c.board_id, b.name board_name into v_col
  from public.board_columns c join public.boards b on b.id = c.board_id where c.id = new.column_id;
  if not found then return new; end if;

  if tg_op = 'INSERT' then
    -- Board copies write through the scheduler; don't log each copied task.
    if current_setting('gantt.writing', true) is distinct from 'yes' then
      perform public.log_activity(new.project_id, 'card.created', new.title, null, new.id, null,
        jsonb_build_object('count', 1, 'board', v_col.board_id, 'board_name', v_col.board_name), 'board:' || v_col.board_id);
    end if;
    v_added := new.owners;
  else
    if new.column_id is distinct from old.column_id then
      select name into v_old_col from public.board_columns where id = old.column_id;
      perform public.log_activity(new.project_id, 'card.moved', new.title, null, new.id, null,
        jsonb_build_object('from', v_old_col.name, 'to', v_col.name, 'done', coalesce(v_col.is_completed, false), 'board', v_col.board_id),
        'card:' || new.id);
    end if;
    v_added := array(select unnest(new.owners) except select unnest(coalesce(old.owners, '{}')));
  end if;

  if v_added is not null and array_length(v_added, 1) > 0 then
    perform public.log_activity(new.project_id, 'card.assigned', new.title, null, new.id, null,
      jsonb_build_object('users', to_jsonb(v_added), 'board', v_col.board_id), 'assign:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists board_cards_activity on public.board_cards;
create trigger board_cards_activity after insert or update of column_id, owners on public.board_cards
for each row execute function public.activity_cards();

-- ---- comments ----
create or replace function public.activity_comments() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_snippet text := left(regexp_replace(new.body, '@\[([^\]]+)\]\(user:[0-9a-fA-F-]{36}\)', '@\1', 'g'), 140);
  v_title text;
  v_board uuid;
begin
  if new.page_id is not null then
    select title into v_title from public.pages where id = new.page_id;
  else
    select k.title, c.board_id into v_title, v_board
    from public.board_cards k join public.board_columns c on c.id = k.column_id where k.id = new.card_id;
  end if;
  perform public.log_activity(public.comment_project(new.page_id, new.card_id), 'comment.added', v_title,
    new.page_id, new.card_id, null,
    jsonb_build_object('count', 1, 'snippet', v_snippet, 'board', v_board),
    'comments:' || coalesce(new.page_id, new.card_id));
  return new;
end $$;
drop trigger if exists comments_activity on public.comments;
create trigger comments_activity after insert on public.comments
for each row execute function public.activity_comments();

-- ---- canvases ----
create or replace function public.activity_canvases() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity(new.project_id, 'canvas.created', new.name, null, null, new.id, '{}', null);
  return new;
end $$;
drop trigger if exists canvases_activity on public.canvases;
create trigger canvases_activity after insert on public.canvases
for each row execute function public.activity_canvases();

-- ---- members (the workspace creator's own membership isn't a "join") ----
create or replace function public.activity_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id = auth.uid()
     and not exists (select 1 from public.projects where id = new.project_id and owner = new.user_id) then
    perform public.log_activity(new.project_id, 'member.joined', null, null, null, null,
      jsonb_build_object('role', new.role), null);
  end if;
  return new;
end $$;
drop trigger if exists project_members_activity on public.project_members;
create trigger project_members_activity after insert on public.project_members
for each row execute function public.activity_members();

-- ---- trash / restore: one entry per action, not per sub-page ----
create or replace function public.trash_page(p_page uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_title text;
  v_now timestamptz := now();
  v_count int;
begin
  select project_id, title into v_project, v_title from public.pages where id = p_page and deleted_at is null;
  if v_project is null then
    raise exception 'Page not found' using errcode = 'P0002';
  end if;
  if not public.can_edit_project(v_project) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  with recursive tree as (
    select id from public.pages where id = p_page
    union all
    select p.id from public.pages p join tree t on p.parent_id = t.id
    where p.deleted_at is null
  )
  update public.pages set deleted_at = v_now, deleted_by = auth.uid()
  where id in (select id from tree);
  get diagnostics v_count = row_count;

  delete from public.pages
  where project_id = v_project and deleted_at < v_now - interval '30 days';

  perform public.log_activity(v_project, 'page.trashed', v_title, p_page, null, null,
    jsonb_build_object('subpages', v_count - 1), null);
end;
$$;

create or replace function public.restore_page(p_page uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_title text;
  v_deleted timestamptz;
  v_parent uuid;
begin
  select project_id, title, deleted_at, parent_id into v_project, v_title, v_deleted, v_parent
  from public.pages where id = p_page;
  if v_project is null or v_deleted is null then
    raise exception 'Page not in trash' using errcode = 'P0002';
  end if;
  if not public.can_edit_project(v_project) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  with recursive tree as (
    select id from public.pages where id = p_page
    union all
    select p.id from public.pages p join tree t on p.parent_id = t.id
    where p.deleted_at = v_deleted
  )
  update public.pages set deleted_at = null, deleted_by = null
  where id in (select id from tree);

  if v_parent is not null and exists (
    select 1 from public.pages where id = v_parent and deleted_at is not null
  ) then
    update public.pages set parent_id = null where id = p_page;
  end if;

  perform public.log_activity(v_project, 'page.restored', v_title, p_page, null, null, '{}', null);
end;
$$;
revoke all on function public.trash_page(uuid) from public, anon;
revoke all on function public.restore_page(uuid) from public, anon;
grant execute on function public.trash_page(uuid) to authenticated;
grant execute on function public.restore_page(uuid) to authenticated;

-- ---- notifications: replies and page ownership ----
-- 'event' belongs to migrate-event-attendees.sql; it's listed here too so
-- rerunning this file after that one doesn't reject existing event rows.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mention', 'assignment', 'reply', 'page_owner', 'event'));

-- Everyone else in the thread (root author + earlier repliers) hears about a
-- reply, unless this reply already @-mentions them (they get the mention).
create or replace function public.notify_comment_reply() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_link text;
  v_snippet text;
  v_uid uuid;
begin
  if new.parent_id is null then return new; end if;
  v_project := public.comment_project(new.page_id, new.card_id);
  if v_project is null then return new; end if;
  v_link := case when new.page_id is not null then '/doc?page=' || new.page_id else public.card_link(new.card_id) end;
  if v_link is null then return new; end if;
  v_snippet := left(regexp_replace(new.body, '@\[([^\]]+)\]\(user:[0-9a-fA-F-]{36}\)', '@\1', 'g'), 200);
  for v_uid in
    select distinct author from public.comments
    where (id = new.parent_id or parent_id = new.parent_id) and id <> new.id and author <> new.author
  loop
    if position('(user:' || v_uid::text || ')' in lower(new.body)) > 0 then continue; end if;
    if not exists (select 1 from public.project_members where project_id = v_project and user_id = v_uid) then continue; end if;
    insert into public.notifications(project_id, user_id, actor_id, kind, snippet, link)
    values (v_project, v_uid, new.author, 'reply', v_snippet, v_link);
  end loop;
  return new;
end $$;
drop trigger if exists comments_notify_reply on public.comments;
create trigger comments_notify_reply after insert on public.comments
for each row execute function public.notify_comment_reply();

create or replace function public.notify_page_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner is null or new.owner is not distinct from old.owner or new.owner = auth.uid() or new.deleted_at is not null then
    return new;
  end if;
  if not exists (select 1 from public.project_members where project_id = new.project_id and user_id = new.owner) then
    return new;
  end if;
  insert into public.notifications(project_id, user_id, actor_id, kind, snippet, link)
  values (new.project_id, new.owner, auth.uid(), 'page_owner', left(new.title, 200), '/doc?page=' || new.id);
  return new;
end $$;
drop trigger if exists pages_notify_owner on public.pages;
create trigger pages_notify_owner after update of owner on public.pages
for each row execute function public.notify_page_owner();

notify pgrst, 'reload schema';
commit;
