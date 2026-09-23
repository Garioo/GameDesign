# EMBERWICK — Game Design System

A real-time, collaborative **game design document (GDD)** editor. Teams write living design
docs together — organized as sections → pages → blocks — with live presence (see who's online)
and per-keystroke editing that broadcasts to everyone instantly.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Supabase (Postgres + Realtime + Auth)

## Quick start

```bash
npm install

# Create .env.local in the repo root with your Supabase project keys:
#   NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
#   NEXT_PUBLIC_SITE_URL=https://game-design-two.vercel.app

npm run dev   # http://localhost:3000
```

You also need a Supabase project with `supabase/schema.sql` applied, **then every
`supabase/migrate-*.sql` file, in the order listed in [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md#running-locally)**
(the base schema alone can't create a board — most features live in these migrations), and OAuth
providers (Google / GitHub) enabled. Add `https://game-design-two.vercel.app/auth/callback`
as the production redirect URL. See the full setup in
[docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md#running-locally).

## Scripts

| Command         | Purpose                              |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the dev server on port 3000    |
| `npm run build` | Production build                     |
| `npm start`     | Run the production build             |
| `npm run lint`  | ESLint (Next.js defaults)            |

## Routes

| Path             | Description                                   |
| ---------------- | --------------------------------------------- |
| `/`              | Landing page                                  |
| `/login`         | OAuth sign-in (Google / GitHub)               |
| `/auth/callback` | OAuth redirect handler                        |
| `/doc`           | The collaborative editor (requires auth)      |
| `/board`         | Kanban boards; **All boards** (sidebar or board picker) stacks every board as its own section, drag-and-drop stays within a board |
| `/work`          | My Work: tasks assigned to you across every board, grouped by priority, plus unread mentions and to-dos on pages you own |

## Documentation

- **[docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)** — full onboarding: architecture,
  project structure, features, data model, and how to run it locally. **Start here if you're new.**
- **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)** — git workflow and push rules. **Read this
  before pushing code** so we avoid merge conflicts.

## Standalone calendar events

Apply `supabase/migrate-calendar-events.sql` after the base schema and security setup.
For existing event tables, also apply `supabase/migrate-calendar-event-ranges.sql` to add end dates.
To subscribe the workspace to a Moodle calendar (Calendar → **Calendars**), apply `supabase/migrate-calendar-feeds.sql`. Events are fetched server-side by `app/api/calendar-feed/route.ts`, since Moodle doesn't allow browser requests from other sites.
The Calendar's **New event** action creates shared workspace events with inclusive start and end dates,
optional start/end times, location, and notes. Events are stored in `calendar_events`,
independently of Board and Gantt tasks. Month, Week, and Day views share the same
events; multi-day events span each covered date and wrap at week boundaries. Workspace members can read events; owners
and editors can create, edit, and delete them. Event times are shared wall-clock
times, displayed as entered (no attendee time-zone conversion).

Board tasks don't appear on the Calendar: a task carries only a priority (High/Medium/Low), not
dates — scheduling lives at the phase level instead (see **Phase planning** below). The
`board_cards.start_date`/`deadline`/`firm_deadline`/`calendar_end_only` columns and their RPC
support still exist for backward compatibility, but the app no longer reads or writes them for
tasks.

Each board also has an end date, shown next to its task count in All boards (Board page). By
default it's automatic — the latest of any legacy task deadline still on the board, which is
null once a board's tasks have all been created or edited since this change — or it can be
pinned to a specific date from **End date** in the board's Manage stages dialog. Apply
`supabase/migrate-board-end-date.sql` first; the board group headers in the kanban view carry
each board's color (`boardColor` from `lib/boardColors.ts`), matching the sidebar.

A board's own color can be set (not just auto-assigned) from the same dialog — apply
`supabase/migrate-board-color.sql` for this.

**Copy board** (the board's "More"/overflow menu, both single-board and All boards) duplicates
a board: its stages and every task, including subtask hierarchy and any dependency that's
fully internal to the board. Canvas links and milestones are deliberately not copied — see the
comment at the top of `supabase/migrate-board-copy.sql`, which this needs applied first.


## Page trash and global search

Apply `supabase/migrate-page-trash.sql`. Deleting a page now moves it, and its
sub-pages, to a trash (Pages sidebar → **Trash**) instead of hard-deleting it.
An undo toast appears right after the delete. Restoring brings back exactly the
pages trashed together; a page whose parent is still trashed returns at the top
level. Pages stay in the trash for 30 days and are purged the next time someone
in the workspace trashes a page. Only owners and editors can trash, restore or
delete forever.

**⌘K** now works on every screen with the dock. It searches pages (titles and
body text), canvases, boards, tasks (title, description, tags) and calendar
events. Canvases open via `?c=`, boards via `?board=`, and events via
`/calendar?date=YYYY-MM-DD`.

## Task details: links, discussion, subtasks, tags

Apply `supabase/migrate-card-comments.sql` (after the notifications and
comments-realtime migrations). The task dialog now has:

- **A shareable link.** Opening a task puts `?board=<id>&card=<id>` in the URL, and
  **Copy link** copies it. Opening that URL opens the task on its board. Task
  assignment and task @mention notifications link straight to the task.
- **A discussion thread.** The same comments as pages: threads, @mentions (which
  notify), edit, resolve, and live updates. Viewers can comment too.
- **Subtasks.** Direct subtasks are listed with their stage and a done count.
  Clicking one opens it, and editors can add one in place. Cards on the board show
  a `☑ done/total` badge.
- **Tags.** Add them with Enter or a comma, and remove them with × or Backspace
  (max 20).

The notification bell can also dismiss notifications now.

## My Work and task moves

Apply `supabase/migrate-move-card.sql` **before deploying this client**: dragging
a task between stages and changing its stage from My Work both call
`move_board_card`. It moves the task and writes the destination stage's order in
one transaction. That replaces the old snapshot round-trip, which failed with
"The schedule changed" whenever a teammate edited the board. Moves stay within
the task's own board, and only editors can make them.

**My Work** (`/work`, in the dock, and linked from the "tasks for me" count on
Home) lists every task you're assigned to, grouped High → Medium → Low → no
priority. Within a group, tasks are ordered by board, then stage, then position.
Each row shows the board color, category and subtask progress. Editors can change
a task's stage and priority inline, and the task title opens it on its board.
Tasks in done stages sit behind **Show done**. The side rail lists unread mentions
and assignments, and open to-dos on pages you own, which you can tick off there.
The page updates live.

## Activity feed and more notifications

Apply `supabase/migrate-activity.sql` after the page-trash and card-comments
migrations. It redefines `trash_page`/`restore_page` so that each trash or
restore logs one entry.

- **What gets recorded:** pages created, status changed, trashed or restored;
  tasks created, moved to another stage (or completed) or assigned; comments on
  pages and tasks; canvases created; members joining through an invite.
  Rows are written only by database triggers. The client can't insert them, so
  nobody can forge an entry.
- **Repeats are folded together:** within 10 minutes, the same person doing the
  same kind of thing to the same item updates one row instead of adding more
  (e.g. "added 5 tasks to Gameplay", "left 3 comments on Combat"). A status or
  stage change that is reversed inside that window disappears.
- **Not recorded:** block text edits. Those go to the page's version history (below).
- **Where it shows:** a **Team activity** feed on Home, and a collapsed
  **History** section in each page's side panel and each task dialog.
- **New notifications:** **replies** (everyone else in a comment thread hears
  about a new reply, unless it @-mentions them, in which case they get the
  mention instead) and **page ownership** (you're made owner of a page by
  someone else).

## Version history

Apply `supabase/migrate-page-edits.sql` (safe to rerun if an earlier version of
it is already applied). The clock button in a page's top bar opens a
full-screen **Version history**, like Google Docs:

- **Versions on the right**, grouped by day. A version is an editing session:
  edits that follow each other within 20 minutes belong together. Each shows
  when it happened and who edited, with their colour.
- **The page as it was** in the middle. With **Show changes** on, the chosen
  version's edits are marked in the editor's colour: added words underlined
  and tinted, deleted words struck through, and a colour bar beside every
  block it touched. Deleted blocks stay visible, struck through.
- **Restore this version** (owners and editors) puts the page back the way it
  was. The restore is itself recorded, so it can be undone from the history.

How it's recorded: a trigger on `blocks` writes `page_edits` rows with the
signed-in author, the block's text and content before and after, and its
position. Clients can't write the table, so authorship can't be forged, and
members can read it. One person's edits to the same block within 10 minutes
fold into one row. Not recorded: moving blocks, changing a block's type,
ticking to-dos, seeding, and image data. History starts when the migration is
applied. Pages are rebuilt backwards from the current blocks. A deleted block
comes back under the block that was above it when it was deleted, struck
through and labelled "Deleted by …".

## Phase planning

Apply `supabase/migrate-phase-planning.sql` **once, before deploying this client**,
following the existing board-end-date, card-calendar-mode, nested-timeline, and
board-copy migrations. It runs in one transaction and preserves task dates,
legacy task dependencies, milestones, and calendar data. Take the usual database
backup before applying a production migration. Do not rerun the older Gantt or
board-copy migrations afterward: phase planning wraps their RPCs.

`/table` is an independent Gantt workspace. Each board has one main phase; each
category used on that board automatically creates a subphase. Board links include
`?board=<id>&category=<id>` to show the matching tasks. Shared category names are
workspace-wide; scheduling is per board/category pair. Progress counts every card
(including subtasks) equally, based on completed workflow stages.

`planning_phases` holds the board's independent baseline dates and category date
windows. `phase_snapshot` returns effective parent ranges, task counts, and links;
`phase_mutate` handles date edits, movement, renaming, dependencies, and undo under
a workspace lock with snapshot conflict detection. Only editor-authorized RPCs can
write phase schedules. Parent ranges expand around active subphases. Whole-phase
movement also shifts retained inactive subphase windows so they remain aligned
when tasks return. Phase changes never move task dates.

The initial migration seeds dates from existing tasks and honors the board end-date
override. New category subphases seed dates when first used; later task date changes
do not change their schedule. Empty subphases retain their dates and suspend links.
Returning links are validated individually; conflicts stay suspended with a reason
and a **Retry link** action. Deleting a category removes its subphases and links;
tasks remain uncategorized. Copy board includes phase dates and only dependencies
whose endpoints both belong to that board.

Verification: `node --test tests/*.test.cjs`, `npx tsc --noEmit`, and `npm run build`.
With a local server and Playwright installed, run `tests/browser-timeline.cjs`,
`tests/browser-board.cjs`, and `tests/browser-calendar.cjs` using `APP_URL` and,
if needed, `PLAYWRIGHT_MODULE`. These browser checks intercept Supabase HTTP
requests and execute mutations only in an isolated PGlite database.
