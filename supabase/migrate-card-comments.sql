-- Comments on board tasks, not just pages.
--
-- A comment now belongs to exactly one page OR one board card. Access,
-- moderation and resolve rules are the same as for page comments, resolved
-- through whichever parent the comment has. @-mentions in card comments
-- notify like page mentions and link straight to the card
-- (/board?board=<id>&card=<id>); task-assignment notifications get the same
-- deep link.
--
-- Apply after schema.sql, migrate-notifications.sql and
-- migrate-comments-realtime.sql. Safe to rerun.
begin;

alter table public.comments alter column page_id drop not null;
alter table public.comments add column if not exists card_id uuid references public.board_cards(id) on delete cascade;
create index if not exists idx_comments_card on public.comments(card_id) where card_id is not null;

alter table public.comments drop constraint if exists comments_one_target;
alter table public.comments add constraint comments_one_target check (num_nonnulls(page_id, card_id) = 1);

-- The project a comment lives in, through its page or its card.
create or replace function public.comment_project(p_page uuid, p_card uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select coalesce(
    (select project_id from public.pages where id = p_page),
    (select project_id from public.board_cards where id = p_card)
  );
$$;
revoke all on function public.comment_project(uuid, uuid) from public, anon;
grant execute on function public.comment_project(uuid, uuid) to authenticated;

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated using (public.can_access_project(public.comment_project(page_id, card_id)));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (public.can_access_project(public.comment_project(page_id, card_id)) and author = auth.uid());

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update to authenticated
  using (author = auth.uid())
  with check (author = auth.uid() and public.can_access_project(public.comment_project(page_id, card_id)));

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete to authenticated
  using (author = auth.uid() or public.is_project_owner(public.comment_project(page_id, card_id)));

create or replace function public.set_comment_resolved(p_comment uuid, p_resolved boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  v_project uuid;
begin
  if caller is null then
    raise exception 'set_comment_resolved requires an authenticated user';
  end if;

  select public.comment_project(page_id, card_id) into v_project from public.comments where id = p_comment;
  if v_project is null or not public.can_access_project(v_project) then
    raise exception 'Comment not found';
  end if;

  update public.comments
  set resolved_at = case when p_resolved then now() else null end,
      resolved_by = case when p_resolved then caller else null end
  where id = p_comment;
end$$;
grant execute on function public.set_comment_resolved(uuid, boolean) to authenticated;

-- Where a card lives in the UI.
create or replace function public.card_link(p_card uuid)
returns text language sql security definer stable set search_path = public as $$
  select '/board?board=' || c.board_id || '&card=' || k.id
  from public.board_cards k join public.board_columns c on c.id = k.column_id
  where k.id = p_card;
$$;
revoke all on function public.card_link(uuid) from public, anon;

create or replace function public.notify_comment_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
  v_link text;
  v_snippet text;
  v_uid uuid;
  v_match text;
begin
  v_project := public.comment_project(new.page_id, new.card_id);
  if v_project is null then return new; end if;
  v_link := case when new.page_id is not null then '/doc?page=' || new.page_id else public.card_link(new.card_id) end;
  if v_link is null then return new; end if;
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
  v_link := '/board?board=' || v_board || '&card=' || new.id;
  foreach v_uid in array v_newly loop
    if v_uid = v_actor then continue; end if;
    insert into public.notifications(project_id, user_id, actor_id, kind, snippet, link)
    values (new.project_id, v_uid, v_actor, 'assignment', left(new.title, 200), v_link);
  end loop;
  return new;
end $$;

notify pgrst, 'reload schema';
commit;
