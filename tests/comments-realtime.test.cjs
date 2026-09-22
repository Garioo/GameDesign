const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

test("comments join the realtime publication with full replica identity", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table comments(id uuid primary key default gen_random_uuid(), page_id uuid, author uuid, body text);
      create publication supabase_realtime;
    `);
    const migration = fs.readFileSync("supabase/migrate-comments-realtime.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration); // idempotent — applying it twice must not error

    const pub = await db.query(
      "select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='comments'",
    );
    assert.equal(pub.rows.length, 1, "comments should be in the supabase_realtime publication");

    const replident = await db.query("select relreplident from pg_class where oid='public.comments'::regclass");
    assert.equal(replident.rows[0].relreplident, "f", "comments should have REPLICA IDENTITY FULL");
  } finally {
    await db.close();
  }
});
