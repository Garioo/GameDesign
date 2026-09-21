-- Per-task calendar mode: pin a multi-day task to its end date instead of spanning start → end.
alter table public.board_cards add column if not exists calendar_end_only boolean not null default false;
