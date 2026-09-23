# Project Overview — EMBERWICK

This is the full onboarding reference. If you only read one doc before touching the code, read
this one (and [CONTRIBUTING.md](CONTRIBUTING.md) before you push).

## What it is

EMBERWICK is a web-based, **collaborative game design document (GDD) editor**. A team uses it to
build and maintain a living design doc for a game. Content is organized hierarchically:

```
Project (workspace)
  └─ Section        e.g. "Core Loops", "World", "Systems"
       └─ Page      a single design doc with metadata (status, owner, tags, links)
            └─ Block text / heading / bullet / quote / callout / divider / table
```

It is collaboration-first: multiple people can be in the same page at once. Edits broadcast live,
and a presence indicator shows who is currently online.

## Tech stack

| Layer       | Technology                                                       |
| ----------- | ---------------------------------------------------------------- |
| Framework   | Next.js 15.1.6 (App Router)                                      |
| UI          | React 19                                                          |
| Language    | TypeScript 5.7.3 (strict mode, `@/*` path alias → repo root)     |
| Backend     | Supabase — Postgres, Realtime, Auth                              |
| Client SDK  | `@supabase/supabase-js` ^2.107                                  |
| Styling     | Plain CSS — `app/globals.css` (design tokens + BEM-like classes) |
| Icons       | Inline SVG (lucide-style), no icon library                       |

There is **no external UI or rich-text library** — the block editor is custom.

## Project structure

```
app/                       Next.js App Router
  page.tsx                 Landing page ("/")
  layout.tsx               Root layout (fonts, metadata, globals.css)
  globals.css              Global styles + design tokens (~35 KB) ⚠ hot file
  login/page.tsx           OAuth sign-in (Google / GitHub)
  auth/callback/           OAuth redirect handler
  doc/
    page.tsx               Core editor screen — wires everything together (~37 KB)
    BlockEditor.tsx        Notion-style block editor (block types, metadata card)
    Sidebar.tsx            Section/page tree, create/rename/delete/reorder
    CommandPalette.tsx     ⌘K / Ctrl-K quick search + navigation
    data.ts                Domain types + seed data ⚠ hot file

lib/
  supabase.ts              Supabase client init + demo WORKSPACE_ID constant
  session.ts               Session / auth helpers
  docsRepo.ts              DB operations — load/create/save sections, pages, blocks

supabase/
  schema.sql               Full Postgres schema + RLS policies ⚠ hot file
```

Files marked ⚠ are **hot files** — frequently touched and conflict-prone. Coordinate before
making large edits to them (see [CONTRIBUTING.md](CONTRIBUTING.md#coordinate-on-hot-files)).

## Features / screens

- **Home (`/`)** — landing page with a sign-in entry point.
- **Login (`/login`)** — OAuth via Google / GitHub; redirects to `/doc` when authenticated.
- **Doc editor (`/doc`)** — the main app:
  - **Sidebar** — hierarchical tree of sections and pages; create, rename, delete, and reorder.
  - **Block editor** — inline-editable title/subtitle and an ordered list of typed blocks
    (`text`, `h2`, `h3`, `bullet`, `quote`, `callout`, `divider`, `table`).
  - **Metadata card** — page status (todo / in progress / in review / done), owner, tags, and
    cross-page links.
  - **Right rail** — linked references (pages that point at this one), last-edited timestamp,
    and online team-member avatars.
  - **Command palette (⌘K / Ctrl-K)** — jump to any page or create a new page/section.

## Data model

Defined in [`supabase/schema.sql`](../supabase/schema.sql). **Row-Level Security (RLS) is enabled
on all tables.** Tables:

| Table             | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| `profiles`        | User profile (name, color, initials for avatars)         |
| `projects`        | Workspaces (name, tagline, genre, progress, owner)       |
| `project_members` | Access control (project_id, user_id, role)               |
| `sections`        | Top-level groupings (name, icon, color, position)        |
| `pages`           | Design docs (title, kind, status, owner, tags, parent)   |
| `blocks`          | Page body content (type, content JSONB, position)        |
| `comments`        | Threaded discussion (page_id, parent_id)                 |
| `milestones`      | Project timeline                                         |
| `activity`        | Team activity feed, written only by triggers (`migrate-activity.sql`) |

## Real-time patterns

Live collaboration in `app/doc/` is built on two mechanisms working together:

- **Debounced DB writes** (~600 ms) persist edits to Postgres without a write per keystroke.
- **Supabase broadcast** (throttled ~90 ms) pushes in-flight edits to other clients immediately,
  so the editor feels live before the debounced save lands.
- **Presence channel** tracks who is currently viewing a page and renders their avatars.

When changing editor sync behavior, keep the debounce/broadcast split in mind — they tune the
trade-off between "feels instant" and "doesn't hammer the database."

## Running locally

1. **Install:** `npm install`
2. **Supabase project:** create one, then apply `supabase/schema.sql` to its database (SQL editor
   or `supabase db push`), followed by **every** `supabase/migrate-*.sql` file — the base schema
   alone is missing most features (e.g. it can't create a board at all, since that RPC only
   exists in `migrate-custom-stages.sql`). Apply them in this order — later ones depend on
   earlier ones, per each file's own header comment:
   1. `migrate-board-gantt.sql`
   2. `migrate-gantt-planning.sql`
   3. `migrate-custom-stages.sql`
   4. `migrate-task-hierarchy.sql`
   5. `migrate-nested-timeline.sql`
   6. `migrate-board-canvas-link.sql`
   7. `migrate-canvas-folders.sql`
   8. `migrate-document-links.sql`
   9. `migrate-sidebar-realtime.sql`
   10. `migrate-calendar-events.sql`
   11. `migrate-calendar-event-ranges.sql`
   12. `migrate-card-calendar-mode.sql`
   13. `migrate-board-end-date.sql`
   14. `migrate-board-color.sql`
   15. `migrate-board-copy.sql`
   16. `migrate-phase-planning.sql` — apply once before deploying the phase-only Gantt client; keep last because it wraps the task and board-copy RPCs.
   17. `migrate-page-trash.sql` — page trash/restore (`trash_page`, `restore_page`); independent of the planning migrations.
   18. `migrate-card-comments.sql` — comments on board tasks; apply after `migrate-notifications.sql` and `migrate-comments-realtime.sql` (it replaces their comment policies and notification triggers).
   19. `migrate-move-card.sql` — `move_board_card`: moves a task between stages of its board and writes that stage's order in one transaction; apply after `migrate-phase-planning.sql`.
   20. `migrate-activity.sql` — team activity feed (trigger-written `activity` rows) plus `reply` and `page_owner` notifications; apply after `migrate-page-trash.sql` and `migrate-card-comments.sql` (it redefines `trash_page`/`restore_page`).
   21. `migrate-calendar-feeds.sql` — subscribed Moodle calendars on the workspace calendar. The export link is hidden from normal reads (column grants) and read by `/api/calendar-feed` through `calendar_feed_url()`; apply after `migrate-calendar-events.sql`.
   22. `migrate-card-completed-at.sql` — `card_completions` (when each task was finished), kept by triggers as tasks enter/leave done stages; feeds the Team scoreboard on Home. A separate table so the migration never writes `board_cards`, whose guards require a signed-in member. Apply after `migrate-activity.sql` (the backfill reads the activity feed).
   23. `migrate-event-attendees.sql` — attendees on calendar events: workspace members (who get an `event` notification when added) and outside guests by name. Apply after `migrate-calendar-event-ranges.sql` and `migrate-activity.sql` (it extends the notification kinds).
   24. `migrate-inline-suggestions.sql` — inline comments and suggested edits on page text: anchor/quote/suggestion columns on `comments` and `settle_suggestion()` (editors accept or reject). Apply after `migrate-card-comments.sql`.

   All of them are written to be safe to rerun, so applying the whole list again after a new one
   is added won't touch existing data.
3. **Auth providers:** enable Google and/or GitHub OAuth in Supabase Auth, with the production
   redirect URL set to `https://game-design-two.vercel.app/auth/callback`.
4. **Environment:** create `.env.local` in the repo root:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   NEXT_PUBLIC_SITE_URL=https://game-design-two.vercel.app
   ```
   The anon key is safe for the browser (RLS protects the data). **Never commit service-role keys.**
5. **Run:** `npm run dev` → http://localhost:3000

### Scripts

| Command         | Purpose                           |
| --------------- | --------------------------------- |
| `npm run dev`   | Dev server on port 3000           |
| `npm run build` | Production build                  |
| `npm start`     | Run the production build          |
| `npm run lint`  | ESLint (Next.js defaults)         |

## Environment & notes

- **Demo workspace:** `lib/supabase.ts` defines a hardcoded `WORKSPACE_ID`
  (`11111111-1111-1111-1111-111111111111`) used by the current demo. Replace this when wiring up
  real multi-workspace selection.
- **Secrets:** only `NEXT_PUBLIC_*` keys belong in client code. Keep `.env.local` out of commits
  for anything sensitive.
