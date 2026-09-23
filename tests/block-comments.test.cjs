// Comments on a block without marking the text (supabase/migrate-block-comments.sql).
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
    insert into projects values ('${id(1)}');
    insert into pages values ('${id(10)}', '${id(1)}');
  `);
  await db.exec(fs.readFileSync("supabase/migrate-inline-suggestions.sql", "utf8"));
  const migration = fs.readFileSync("supabase/migrate-block-comments.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration); // safe to rerun
  return db;
}
const insert = (db, cols) => {
  const keys = Object.keys(cols);
  return db.query(
    `insert into comments(${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
    Object.values(cols),
  );
};
const base = { page_id: id(10), author: id(2), body: "Please expand this" };

test("a block comment carries the block and a quote, no anchor", async () => {
  const db = await makeDb();
  try {
    await insert(db, { ...base, block_id: id(50), quote: "Our method" });
    await assert.rejects(insert(db, { ...base, block_id: id(50) }), /comments_inline_shape/, "needs the quote");
    await assert.rejects(insert(db, { ...base, block_id: id(50), quote: "x", anchor: id(60) }), /comments_inline_shape/);
    await assert.rejects(insert(db, { ...base, block_id: id(50), quote: "x", suggestion: "y" }), /comments_inline_shape/);
  } finally {
    await db.close();
  }
});

test("inline comments, plain comments and replies still work", async () => {
  const db = await makeDb();
  try {
    await insert(db, { ...base, anchor: id(61), quote: "marked text" });
    await insert(db, { ...base });
    await assert.rejects(insert(db, { ...base, quote: "loose quote" }), /comments_inline_shape/);
  } finally {
    await db.close();
  }
});
