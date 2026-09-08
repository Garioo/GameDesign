# Board timeline

The Gantt dock item opens `/table`. Board and Gantt share the same workspace,
boards, columns, cards, assignees, categories and realtime subscription. The
last selected board is remembered per workspace when switching views.

## Database setup

Before deploying, run `supabase/migrate-board-gantt.sql` in the project's
Supabase SQL editor. It adds nullable `board_cards.start_date` and enforces
start date ≤ deadline. Existing cards and deadlines are preserved. New
installations can use the updated `supabase/schema.sql`.

The existing board read remains compatible before migration. Saving timeline
dates requires the migration; an unavailable column produces an inline error.

Select **All boards** in the Gantt sidebar (or the board dropdown on mobile)
to combine every board in the workspace. Groups show the board and column name;
search and deadline filters apply across all boards. Date and card edits still
update the original card. Select a single board to add columns.

## Scheduling

Select a row or bar to edit its start and deadline, then save. Date-only writes
update the original board card without overwriting its title or assignees.
Clear dates and save to unschedule a card. Cards with only one date render a
single-day marker. Click “Edit board card” for the existing detail editor.

Use 2-, 4- or 12-week ranges, previous/next, Today, or First task to navigate.
Search, category and deadline filters apply to the selected board. Collapsible
groups follow its columns. Workspace viewers cannot save timeline dates.

## Verification

Run `node --test tests/gantt.test.cjs` and `npm run build`.
Browser checks with intercepted Supabase responses cover timeline rendering,
saving and reloading dates, failed-save feedback, and updates in both directions
between the board and Gantt. Live database writes and realtime delivery require
an authenticated workspace and the migration.
