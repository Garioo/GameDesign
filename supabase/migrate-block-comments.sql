-- Comments on a block, without touching the page text.
--
-- Inline comments (migrate-inline-suggestions.sql) mark the selected text in
-- the block's HTML, which only editors can write. Supervisors and other
-- viewers review pages without editing them, so their comments point at the
-- block instead: block_id plus the quoted text, and no mark in the page.
-- Anyone who can comment on the page can post one (same insert policy).
--
-- Apply after migrate-inline-suggestions.sql. Safe to rerun.
begin;

-- No foreign key: a thread outlives its block being deleted (it just can't jump there).
alter table public.comments add column if not exists block_id uuid;
create index if not exists idx_comments_block on public.comments(block_id) where block_id is not null;

alter table public.comments drop constraint if exists comments_inline_shape;
alter table public.comments add constraint comments_inline_shape check (
  -- a plain comment or reply
  (anchor is null and block_id is null and quote is null and suggestion is null and suggestion_status is null)
  -- an inline comment / suggested edit on marked text
  or (anchor is not null and block_id is null and parent_id is null and page_id is not null
      and quote is not null and char_length(quote) between 1 and 2000
      and (suggestion is null or char_length(suggestion) <= 2000)
      and (suggestion_status is null or (suggestion is not null and suggestion_status in ('accepted', 'rejected'))))
  -- a comment on a block (optionally quoting part of it)
  or (block_id is not null and anchor is null and parent_id is null and page_id is not null
      and quote is not null and char_length(quote) between 1 and 2000
      and suggestion is null and suggestion_status is null)
);

notify pgrst, 'reload schema';
commit;
