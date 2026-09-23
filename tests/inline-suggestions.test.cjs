// Inline comments & suggested edits (supabase/migrate-inline-suggestions.sql):
// the shape constraint on anchored comments, and settle_suggestion() being
// editor-only and resolving the thread.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select current_setting('test.uid', true)::uuid $$;
    create table projects(id uuid primary key);
    create table project_members(project_id uuid, user_id uuid, role text, primary key(project_id, user_id));
    create function can_edit_project(p_project uuid) returns boolean language sql stable as $$
      select exists(select 1 from project_members where project_id = p_project and user_id = auth.uid() and role in ('owner','editor')) $$;
    create table pages(id uuid primary key, project_id uuid references projects(id));
    create table comments(
      id uuid primary key default gen_random_uuid(), page_id uuid references pages(id), card_id uuid,
      parent_id uuid references comments(id) on delete cascade, author uuid not null, body text not null,
      created_at timestamptz not null default now(), updated_at timestamptz, resolved_at timestamptz, resolved_by uuid);
    -- As in security.sql before this migration: every comment needs text.
    alter table comments add constraint comments_limits check (char_length(body) between 1 and 5000) not valid;
    insert into projects values ('${id(1)}');
    insert into project_members values ('${id(1)}', '${id(1)}', 'editor'), ('${id(1)}', '${id(2)}', 'viewer');
    insert into pages values ('${id(10)}', '${id(1)}');
    grant usage on schema auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);
  const migration = fs.readFileSync("supabase/migrate-inline-suggestions.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration); // safe to rerun
  return db;
}
const asUser = (db, uid) => db.exec(`set role authenticated; select set_config('test.uid', '${uid}', false);`);
const addSuggestion = (db, anchor) => db.query(
  `insert into comments(page_id, author, body, anchor, quote, suggestion)
   values ($1, $2, '', $3, 'old text', 'new text') returning id`, [id(10), id(2), anchor]);

test("anchored comments must be root page comments with a quote", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    // Plain comments are unaffected.
    const plain = (await db.query(`insert into comments(page_id, author, body) values ($1, $2, 'hi') returning id`, [id(10), id(1)])).rows[0];
    // Inline comment: anchor + quote, no suggestion.
    await db.query(`insert into comments(page_id, author, body, anchor, quote) values ($1, $2, 'why?', $3, 'some text')`, [id(10), id(1), id(50)]);
    await assert.rejects(
      db.query(`insert into comments(page_id, author, body, anchor) values ($1, $2, 'x', $3)`, [id(10), id(1), id(51)]),
      /comments_inline_shape/, "an anchor needs a quote");
    await assert.rejects(
      db.query(`insert into comments(page_id, parent_id, author, body, anchor, quote) values ($1, $2, $3, 'x', $4, 'q')`, [id(10), plain.id, id(1), id(52)]),
      /comments_inline_shape/, "replies can't be anchored");
    await assert.rejects(
      db.query(`insert into comments(page_id, author, body, suggestion) values ($1, $2, 'x', 'new')`, [id(10), id(1)]),
      /comments_inline_shape/, "a suggestion needs an anchor");
    await assert.rejects(
      db.query(`insert into comments(page_id, author, body, anchor, quote) values ($1, $2, 'dup', $3, 'q')`, [id(10), id(1), id(50)]),
      /duplicate key/, "anchors are unique");
  } finally {
    await db.close();
  }
});

test("a suggestion may have an empty note, a plain comment may not", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await addSuggestion(db, id(70)); // body ''
    await assert.rejects(
      db.query(`insert into comments(page_id, author, body, anchor, quote) values ($1, $2, '', $3, 'q')`, [id(10), id(1), id(71)]),
      /comments_limits/);
    await assert.rejects(db.query(`insert into comments(page_id, author, body) values ($1, $2, '')`, [id(10), id(1)]), /comments_limits/);
  } finally {
    await db.close();
  }
});

test("only editors can accept or reject a suggestion, which resolves it", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(2));
    const sug = (await addSuggestion(db, id(60))).rows[0];

    // The viewer who suggested it can't settle it.
    await assert.rejects(db.query("select settle_suggestion($1, 'accepted')", [sug.id]), /Only editors/);
    await asUser(db, id(1));
    await assert.rejects(db.query("select settle_suggestion($1, 'maybe')", [sug.id]), /Unknown suggestion status/);

    await db.query("select settle_suggestion($1, 'accepted')", [sug.id]);
    const row = (await db.query("select suggestion_status, resolved_at, resolved_by from comments where id = $1", [sug.id])).rows[0];
    assert.equal(row.suggestion_status, "accepted");
    assert.ok(row.resolved_at);
    assert.equal(row.resolved_by, id(1));

    // Plain comments aren't suggestions.
    const plain = (await db.query(`insert into comments(page_id, author, body, anchor, quote) values ($1, $2, 'note', $3, 'q') returning id`, [id(10), id(1), id(61)])).rows[0];
    await assert.rejects(db.query("select settle_suggestion($1, 'rejected')", [plain.id]), /Suggestion not found/);
  } finally {
    await db.close();
  }
});
