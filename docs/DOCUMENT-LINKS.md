# External documents in Pages

Use **Pages → Documents & links → + Add link** to save a Google Docs, Sheets,
Slides, Forms, Drive or other HTTPS document link in the workspace sidebar.
Give it an optional name, then choose **Attach link**. Each link opens the
original document in a new tab and retains its existing sharing permissions.
Removing a sidebar link does not delete or modify the original document.

Editors can add and remove links. Viewers can open them. Sidebar entries are
shared across the workspace and use the existing live-update/reconnect helper.
External links are also available when there are no internal pages yet.

Before deploying, run `supabase/migrate-document-links.sql` in Supabase's SQL
editor. It creates the RLS-protected `document_links` table and adds it to the
Realtime publication. New installations can run the updated `schema.sql`.

Verification: production build, URL validation tests, browser checks with
simulated API responses (save errors, reload persistence, removal, focus refresh
and viewer controls), and an isolated PostgreSQL-compatible migration/RLS test
covering duplicate links, viewer permissions and workspace isolation. Hosted
verification requires applying the migration in the connected workspace.
