-- Inline comments and suggested edits on page text.
--
-- Selecting text on a page and choosing Comment or Suggest edit wraps it in
-- <mark data-comment="<anchor>"> or <del data-suggestion="<anchor>"> inside
-- the block's HTML, and posts a root page comment carrying the same anchor:
--   quote       the selected text, shown above the comment in the side panel
--   suggestion  the proposed replacement ('' = delete it); null = plain comment
--   suggestion_status  null while open, then 'accepted' or 'rejected'
-- Accepting swaps the struck-through text for the suggestion; rejecting keeps
-- the original. Either way the thread is resolved.
--
-- Apply after migrate-card-comments.sql. Safe to rerun.
begin;

alter table public.comments add column if not exists anchor uuid;
alter table public.comments add column if not exists quote text;
alter table public.comments add column if not exists suggestion text;
alter table public.comments add column if not exists suggestion_status text;

alter table public.comments drop constraint if exists comments_inline_shape;
alter table public.comments add constraint comments_inline_shape check (
  (anchor is null and quote is null and suggestion is null and suggestion_status is null)
  or (anchor is not null and parent_id is null and page_id is not null
      and quote is not null and char_length(quote) between 1 and 2000
      and (suggestion is null or char_length(suggestion) <= 2000)
      and (suggestion_status is null or (suggestion is not null and suggestion_status in ('accepted', 'rejected'))))
);
create unique index if not exists idx_comments_anchor on public.comments(anchor) where anchor is not null;

-- A suggestion's note is optional, so its body may be empty. Same definition
-- as security.sql, so rerunning either file keeps this.
alter table public.comments drop constraint if exists comments_limits;
alter table public.comments add constraint comments_limits check (
  char_length(body) between 1 and 5000
  or (body = '' and suggestion is not null)
) not valid;

-- Accept or reject a suggestion: page editors only (it rewrites page text,
-- which the client does before calling this). Resolves the thread too.
create or replace function public.settle_suggestion(p_comment uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_page uuid;
  v_suggestion text;
begin
  if auth.uid() is null then
    raise exception 'settle_suggestion requires an authenticated user';
  end if;
  if p_status not in ('accepted', 'rejected') then
    raise exception 'Unknown suggestion status %', p_status;
  end if;
  select page_id, suggestion into v_page, v_suggestion from public.comments
  where id = p_comment and anchor is not null;
  if not found or v_suggestion is null then
    raise exception 'Suggestion not found';
  end if;
  if not public.can_edit_project((select project_id from public.pages where id = v_page)) then
    raise exception 'Only editors can accept or reject suggestions' using errcode = '42501';
  end if;
  update public.comments
  set suggestion_status = p_status, resolved_at = now(), resolved_by = auth.uid()
  where id = p_comment;
end $$;
revoke all on function public.settle_suggestion(uuid, text) from public, anon;
grant execute on function public.settle_suggestion(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
