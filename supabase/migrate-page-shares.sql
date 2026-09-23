-- Share one page with someone outside the workspace.
--
-- An editor creates a share link for a page (page_shares: a long random
-- token). Whoever has the link can read that page — title, blocks, comments
-- — and, once signed in, comment on it and reply. Nothing else in the
-- workspace opens up: guests never become members, the table policies on
-- pages / blocks / comments are unchanged, and every guest read or write goes
-- through the SECURITY DEFINER functions below, which only ever touch the
-- one page the token belongs to. Revoking a link (or trashing the page)
-- closes it immediately.
--
--   shared_page(token)                     page, blocks, comments, people (anon + signed in)
--   comment_on_shared_page(token, …)       add a comment, reply or block comment (signed in)
--   edit_shared_page_comment(token, …)     change your own comment
--   delete_shared_page_comment(token, id)  delete your own comment
--
-- Apply after migrate-page-trash.sql and migrate-block-comments.sql. Safe to rerun.
begin;

create table if not exists public.page_shares (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  page_id        uuid not null references public.pages(id) on delete cascade,
  -- 256 random bits as hex; the link is the only credential, so it must be unguessable.
  token          text not null unique
                 default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  allow_comments boolean not null default true,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz
);
create index if not exists idx_page_shares_page on public.page_shares(page_id);

-- The share's workspace is always its page's workspace.
create or replace function public.page_share_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select project_id into new.project_id from pages where id = new.page_id;
  if new.project_id is null then raise exception 'Page not found'; end if;
  if tg_op = 'UPDATE' and (new.token <> old.token or new.page_id <> old.page_id) then
    raise exception 'A share link can''t be moved to another page';
  end if;
  return new;
end $$;
drop trigger if exists page_share_project on public.page_shares;
create trigger page_share_project before insert or update on public.page_shares
  for each row execute function public.page_share_project();

alter table public.page_shares enable row level security;
drop policy if exists page_shares_select on public.page_shares;
create policy page_shares_select on public.page_shares
  for select to authenticated using (public.can_edit_project(project_id));
drop policy if exists page_shares_insert on public.page_shares;
create policy page_shares_insert on public.page_shares
  for insert to authenticated with check (public.can_edit_project(project_id));
drop policy if exists page_shares_update on public.page_shares;
create policy page_shares_update on public.page_shares
  for update to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));
drop policy if exists page_shares_delete on public.page_shares;
create policy page_shares_delete on public.page_shares
  for delete to authenticated using (public.can_edit_project(project_id));
grant select, insert, update, delete on public.page_shares to authenticated;

-- The live share behind a token: not revoked, and its page not in the trash.
create or replace function public.active_page_share(p_token text)
returns public.page_shares language sql security definer stable set search_path = public as $$
  select s.* from page_shares s join pages p on p.id = s.page_id
  where s.token = p_token and s.revoked_at is null and p.deleted_at is null
  limit 1
$$;
revoke all on function public.active_page_share(text) from public, anon, authenticated;

create or replace function public.shared_page(p_token text) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  s page_shares;
begin
  s := public.active_page_share(p_token);
  if s.id is null then return null; end if;
  return jsonb_build_object(
    'allow_comments', s.allow_comments,
    'me', auth.uid(),
    'workspace', (select name from projects where id = s.project_id),
    'page', (select jsonb_build_object('id', p.id, 'title', p.title, 'summary', p.summary, 'status', p.status, 'updated_at', p.updated_at)
             from pages p where p.id = s.page_id),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'type', b.type, 'content', b.content) order by b.position, b.created_at)
                        from blocks b where b.page_id = s.page_id), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
                            'id', c.id, 'page_id', c.page_id, 'card_id', null, 'parent_id', c.parent_id, 'author', c.author,
                            'body', c.body, 'created_at', c.created_at, 'updated_at', c.updated_at,
                            'resolved_at', c.resolved_at, 'resolved_by', c.resolved_by, 'anchor', c.anchor, 'quote', c.quote,
                            'suggestion', c.suggestion, 'suggestion_status', c.suggestion_status, 'block_id', c.block_id)
                          order by c.created_at)
                          from comments c where c.page_id = s.page_id), '[]'::jsonb),
    -- Names for comment authors; signed-in guests also get the members, to @-mention them.
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', coalesce(nullif(pr.name, ''), 'Member'),
                                                            'initials', pr.initials, 'color', pr.color))
                        from profiles pr
                        where pr.id in (select author from comments where page_id = s.page_id)
                           or (auth.uid() is not null and pr.id in (select user_id from project_members where project_id = s.project_id))
                           or pr.id = auth.uid()), '[]'::jsonb)
  );
end $$;

create or replace function public.comment_on_shared_page(
  p_token text, p_body text, p_parent uuid default null, p_block uuid default null, p_quote text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s page_shares;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to comment'; end if;
  s := public.active_page_share(p_token);
  if s.id is null then raise exception 'This share link no longer works'; end if;
  if not s.allow_comments then raise exception 'Comments are turned off for this link'; end if;
  if p_parent is not null and not exists (
    select 1 from comments where id = p_parent and page_id = s.page_id and parent_id is null
  ) then
    raise exception 'That thread isn''t on this page';
  end if;
  if p_block is not null and not exists (select 1 from blocks where id = p_block and page_id = s.page_id) then
    raise exception 'That paragraph isn''t on this page';
  end if;
  insert into comments (page_id, author, body, parent_id, block_id, quote)
  values (s.page_id, auth.uid(), btrim(p_body), p_parent,
          case when p_parent is null then p_block end,
          case when p_parent is null and p_block is not null then coalesce(nullif(left(btrim(p_quote), 2000), ''), '(this block)') end)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.edit_shared_page_comment(p_token text, p_comment uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  s page_shares;
begin
  s := public.active_page_share(p_token);
  if s.id is null or auth.uid() is null then raise exception 'This share link no longer works'; end if;
  update comments set body = btrim(p_body), updated_at = now()
  where id = p_comment and page_id = s.page_id and author = auth.uid();
  if not found then raise exception 'You can only edit your own comments'; end if;
end $$;

create or replace function public.delete_shared_page_comment(p_token text, p_comment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s page_shares;
begin
  s := public.active_page_share(p_token);
  if s.id is null or auth.uid() is null then raise exception 'This share link no longer works'; end if;
  delete from comments where id = p_comment and page_id = s.page_id and author = auth.uid();
  if not found then raise exception 'You can only delete your own comments'; end if;
end $$;

revoke all on function public.shared_page(text), public.comment_on_shared_page(text, text, uuid, uuid, text),
  public.edit_shared_page_comment(text, uuid, text), public.delete_shared_page_comment(text, uuid) from public;
grant execute on function public.shared_page(text) to anon, authenticated;
grant execute on function public.comment_on_shared_page(text, text, uuid, uuid, text),
  public.edit_shared_page_comment(text, uuid, text), public.delete_shared_page_comment(text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
