# Linked board canvases and live sidebars

Run these SQL files in the existing Supabase project's SQL editor before deploying:

1. `supabase/migrate-board-canvas-link.sql`
2. `supabase/migrate-sidebar-realtime.sql`

The first stores `board_cards.canvas_id` and installs the atomic
`open_board_card_canvas` function. It reuses the saved canvas, locks the card
while creating a canvas, and validates editor access and workspace ownership.
Deleting a canvas clears the link so the next open can create a replacement.
Deleting a card leaves its canvas intact.

“Open as canvas” creates and links a canvas only once. Later opens reuse it and
omit the seed-note parameter. “Link existing canvas” lets users attach earlier
canvases, including those made before this feature. Names are not used to guess
links, because different cards may have identical titles. Changing a link leaves
the previously linked canvas intact.

Board/Gantt, canvas folders and document sidebar metadata subscribe to inserts,
updates and deletes. They refresh from the current workspace on connection,
reconnection and returning to the tab. Deletes use an unfiltered event followed
by a workspace-scoped read. If the channel is unavailable, visible pages retry
every 30 seconds. The document editor preserves local block content during
sidebar refreshes. The document canvas picker also receives live updates.

Verification: production build; `node --test tests/*.test.cjs`; SQL exercised in
an isolated PostgreSQL-compatible database (reuse, existing links, deleted
canvas, cross-workspace and viewer rejection); browser tests with simulated
Supabase responses. Hosted writes and realtime delivery still require applying
the migrations and testing an authenticated workspace.
