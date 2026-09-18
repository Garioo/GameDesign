# Gantt planning

`/table` is a workspace timeline over the original board cards. New users see all
boards and a month of work, with tasks listed directly under each board. The neutral, compact layout
has a resizable task list, collapsible navigation, white task cards with subtle
stage-color accents, category labels and assignees, dependency
connectors, fixed milestones, an unscheduled tray, and personal saved views.

## Rollout

1. In the project's Supabase SQL editor, apply `supabase/migrate-board-gantt.sql`
   if it has not already been applied.
2. Apply `supabase/migrate-gantt-planning.sql` before deploying this
   client. For a fresh installation, run `supabase/schema.sql` first, then this
   planning migration. The migration preserves existing dates, marks existing
   Done columns as completed, adds the planning tables, and publishes their changes.
3. Apply `supabase/migrate-custom-stages.sql` before deploying the custom-stage UI.
   It adds atomic board creation and stage editing; existing stages keep their IDs,
   names, completion settings, and task links. No sample boards or stages are added.
4. Deploy the updated application and reload existing browser sessions. Coordinate
   these steps: older clients cannot change dates/status after the migration,
   because those writes must now use the scheduling RPC.

The planning and custom-stage migrations can be rerun without resetting saved
data or custom stage completion settings.

No new environment variables or Google configuration are needed. This repository
change does not itself apply SQL to the hosted database or deploy to Vercel.

## Interaction

The planning shell fills the viewport, with a compact shared header and bottom
navigation. Columns expand across the board; timeline days expand on wide screens
and remain horizontally scrollable when space is limited.

- Drag a bar to move it; drag either edge to resize. Arrow keys move a focused bar
  by one day; Shift + arrow changes its end. Escape cancels a drag. Explicit dates
  remain available in the full task editor.
- On touch screens, swipe to scroll and hold a task for 400 ms before dragging.
  Selected tasks expose resize handles. Task details use an expandable bottom sheet.
- Drag an undated task from the tray onto the timeline to create a one-day schedule,
  or open it and set dates. Existing cards with one date remain one-day bars.
- More → Dependencies & milestones manages scheduling relationships and fixed dates.
  More → Manage stages controls stage names, colors, order, and completion settings.
  Completed tasks are faded and can be filtered out.
- New boards start with editable To do, In progress, In review, and Done stages.
  Done is marked completed. Add basic stages fills in missing preset names on an
  existing board without replacing its stages; save to apply the changes.
  Boards require at least one named stage.
  Removing a populated stage requires a destination in the same board. Tasks retain
  their IDs, assignments, dates, dependencies, and canvas links. Conflicting edits
  require reloading the setup dialog before saving.
- The timeline does not insert status/stage headings or show stage names beside
  task titles. Old collapsed-stage preferences no longer hide tasks; board
  collapsing applies when multiple boards are visible; a single board shows its
  tasks directly without a duplicate heading. Completion filters still apply.
- Saved views and the task-list width control are in More. The unscheduled tray starts collapsed
  and displays its task count.
- Saved views belong to the signed-in user. They store board selections, filters,
  zoom and collapsed groups. Last-used settings are remembered on this device.

## Date and dependency rules

`board_cards.start_date` and the existing `deadline` field are the inclusive
scheduled start/end. `firm_deadline` is a separate optional limit. All arithmetic
uses calendar dates, including weekends; it is independent of daylight-saving time.

Dependencies allow FS (finish, then next-day start), SS (start-to-start), and FF
(finish-to-finish), plus a nonnegative whole-day gap. Both tasks need full schedules.
Self-links, duplicate task pairs, cycles and cross-workspace links are rejected.
Cascades only push work later and preserve durations. Multiple prerequisites use
the strongest constraint. Earlier changes never pull downstream work forward.

Automatic changes cannot move completed tasks, exceed firm deadlines, or pass a
fixed milestone. One conflict rejects the entire operation, including the initial
edit. Milestone prerequisites must have end dates; board milestones accept only
cards in that board. Remove relationships before clearing linked dates.

## Consistency and permissions

`gantt_snapshot` reads a complete workspace scheduling snapshot. `gantt_mutate`
accepts that expected snapshot plus a card, dependency, milestone, column, or undo
operation. A workspace advisory transaction lock serializes scheduling changes.
The function checks edit permission, rejects stale snapshots, validates the graph,
computes the cascade, and commits all affected rows together. Guard triggers prevent
ordinary REST date/status writes from bypassing it and also enforce editor access
on legacy board tables. Deletions clean up links through foreign keys.

Undo restores dates for the whole operation, retaining card metadata. It requires
the exact post-operation snapshot; even an unrelated intervening card edit causes
undo to refuse rather than overwrite another user's work. This intentionally
conservative first version sends full snapshots, so very large workspaces may
benefit from a future server revision-token optimization.

Board and timeline edits share the same operation. Realtime subscriptions refresh
cards and planning records, with reconnect/focus recovery. Viewers can read the
schedule and save personal views, but cannot change scheduling or board structure.

## Verification

Run `node --test tests/*.test.cjs`, `npx tsc --noEmit`, and `npm run build`.
`tests/gantt-scheduling.test.cjs` executes the migration and scheduling RPC in real
PostgreSQL via PGlite. It covers all dependency types, branching cross-board chains,
rollback, fixed dates, invalid links, stale edits, undo, permissions and deletion
cleanup. Existing tests cover date arithmetic and sidebar subscription recovery.
`tests/custom-stages.test.cjs` checks atomic board creation, names, colors, order,
completion, task transfers, preserved links, permissions, and concurrent edits.

Browser verification uses intercepted Supabase requests backed by the same SQL
fixture, avoiding changes to production data. Verified interactions include drag,
resize, whole-operation undo, tray scheduling, dependency creation, saved views,
board-to-timeline refresh in a second tab, mobile hold-to-drag, swipe without writes,
and the expandable mobile editor. Hosted Supabase realtime transport
and production rollout still require verification after the migration is applied.
