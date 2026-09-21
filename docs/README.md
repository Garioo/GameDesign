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

Board tasks appear on the same grid. The **All boards** option (default) shows tasks from every
board, each colored by its board (`lib/boardColors.ts` assigns a palette color to boards still on
the default gray, and the sidebar dots use the same colors). In the default **Scheduled period**
mode a task spans from its start date to its deadline; the other date modes pin it to one date.
A task can opt out of spanning: apply `supabase/migrate-card-calendar-mode.sql`, then tick
**Calendar: show on end date only** in the task's edit dialog and the calendar pins that task
to its scheduled end instead.

Each board also has an end date, shown next to its task count in All boards (Board page) and
in the Gantt's per-board group header (`lib/boardRepo.ts`'s `boardEndDate`). By default it's
automatic — the latest deadline among the board's tasks — or it can be pinned to a specific
date from **End date** in the board's Manage stages dialog. Apply
`supabase/migrate-board-end-date.sql` first; the board group headers in both the kanban and
Gantt All boards views also carry each board's color (`boardColor` from `lib/boardColors.ts`),
matching the sidebar and calendar.

A board's own color can be set (not just auto-assigned) from the same dialog — apply
`supabase/migrate-board-color.sql` for this.

**Copy board** (the board's "More"/overflow menu, both single-board and All boards) duplicates
a board: its stages and every task, including subtask hierarchy and any dependency that's
fully internal to the board. Canvas links and milestones are deliberately not copied — see the
comment at the top of `supabase/migrate-board-copy.sql`, which this needs applied first.
