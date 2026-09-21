-- Per-board end date: null means "automatic" (the latest deadline among the board's tasks);
-- a value here is a manual override chosen in the board's Manage stages dialog.
alter table public.boards add column if not exists end_date date;
