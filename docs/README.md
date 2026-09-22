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

## Documentation

- **[docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)** — full onboarding: architecture,
  project structure, features, data model, and how to run it locally. **Start here if you're new.**
- **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)** — git workflow and push rules. **Read this
  before pushing code** so we avoid merge conflicts.

## Standalone calendar events

Apply `supabase/migrate-calendar-events.sql` after the base schema and security setup.
For existing event tables, also apply `supabase/migrate-calendar-event-ranges.sql` to add end dates.
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
