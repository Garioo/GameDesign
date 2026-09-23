const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// Alice (1) owns project 1, Bob (2) edits it, Carl (3) is in project 2 only.
async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles(id uuid primary key);
    create table projects(id uuid primary key);
    create table project_members(project_id uuid, user_id uuid, role text, primary key(project_id, user_id));
    create function can_access_project(p_project uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from project_members where project_id = p_project and user_id = auth.uid()) $$;
    create table pages(id uuid primary key, project_id uuid references projects(id));
    create table blocks(id uuid primary key default gen_random_uuid(), page_id uuid not null references pages(id) on delete cascade,
      type text not null, content jsonb not null default '{}', position int not null default 0);
    create publication supabase_realtime;
    insert into projects values ('${id(1)}'), ('${id(2)}');
    insert into profiles values ('${id(1)}'), ('${id(2)}'), ('${id(3)}');
    insert into project_members values ('${id(1)}', '${id(1)}', 'owner'), ('${id(1)}', '${id(2)}', 'editor'), ('${id(2)}', '${id(3)}', 'owner');
    insert into pages values ('${id(10)}', '${id(1)}');
    grant usage on schema auth to authenticated;
    grant select, insert, update, delete on blocks, pages to authenticated;
  `);
  await db.exec(fs.readFileSync("supabase/migrate-page-edits.sql", "utf8"));
  return db;
}
const asUser = (db, uid) => db.exec(`reset role; select set_config('test.uid', '${uid}', false); set role authenticated;`);
const asSystem = (db) => db.exec(`reset role; select set_config('test.uid', '', false);`);
const setText = (db, block, text) =>
  db.query("update blocks set content = jsonb_build_object('text', $2::text) where id = $1", [block, text]);
const edits = async (db) =>
  (await db.query("select author, kind, before_text, after_text from page_edits order by created_at, author")).rows;
const aged = (db) => db.exec("reset role; update page_edits set updated_at = updated_at - interval '11 minutes';");

test("typing into a block folds into one row per person with the first before-text", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("insert into blocks(id, page_id, type, content) values ($1, $2, 'text', '{\"text\":\"\"}')", [id(20), id(10)]);
    assert.deepEqual(await edits(db), []); // an empty new block isn't writing anything
    await setText(db, id(20), "Hel");
    await setText(db, id(20), "Hello world");
    await db.query("update blocks set position = 5 where id = $1", [id(20)]); // not a text edit
    assert.deepEqual(await edits(db), [{ author: id(1), kind: "added", before_text: "", after_text: "Hello world" }]);

    await asUser(db, id(2));
    await setText(db, id(20), "Hello there world");
    const rows = await edits(db);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1], { author: id(2), kind: "edited", before_text: "Hello world", after_text: "Hello there world" });
  } finally {
    await db.close();
  }
});

test("edits outside the window start a new row; undone edits and add-then-delete vanish", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("insert into blocks(id, page_id, type, content) values ($1, $2, 'text', '{\"text\":\"Draft\"}')", [id(20), id(10)]);
    await aged(db);
    await asUser(db, id(1));
    await setText(db, id(20), "Draft two");
    await setText(db, id(20), "Draft"); // back where this edit started
    assert.deepEqual((await edits(db)).map((r) => r.kind), ["added"]);

    await db.query("insert into blocks(id, page_id, type, content) values ($1, $2, 'h2', '{\"text\":\"Temp\"}')", [id(21), id(10)]);
    await db.query("delete from blocks where id = $1", [id(21)]);
    assert.equal((await edits(db)).length, 1);

    await db.query("delete from blocks where id = $1", [id(20)]);
    assert.deepEqual((await edits(db)).map((r) => [r.kind, r.before_text, r.after_text]), [
      ["added", "", "Draft"],
      ["removed", "Draft", ""],
    ]);
  } finally {
    await db.close();
  }
});

test("tables are recorded as text, system writes and page deletes are skipped", async () => {
  const db = await makeDb();
  try {
    await asSystem(db);
    await db.query("insert into blocks(id, page_id, type, content) values ($1, $2, 'text', '{\"text\":\"Seed\"}')", [id(20), id(10)]);
    assert.deepEqual(await edits(db), []);

    await asUser(db, id(2));
    await db.query(
      "insert into blocks(id, page_id, type, content) values ($1, $2, 'table', $3)",
      [id(21), id(10), JSON.stringify({ text: "", rows: [["Stat", "Value"], ["HP", "100"]] })],
    );
    assert.equal((await edits(db))[0].after_text, "Stat | Value\nHP | 100");

    await db.exec(`delete from pages where id = '${id(10)}'`);
    assert.deepEqual(await edits(db), []); // cascaded away with the page
  } finally {
    await db.close();
  }
});

test("only members read a page's history, and nobody can write it directly", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("insert into blocks(id, page_id, type, content) values ($1, $2, 'text', '{\"text\":\"Secret\"}')", [id(20), id(10)]);
    assert.equal((await db.query("select * from page_edits")).rows.length, 1);
    await asUser(db, id(3));
    assert.equal((await db.query("select * from page_edits")).rows.length, 0);
    await asUser(db, id(1));
    await assert.rejects(
      db.query("insert into page_edits(project_id, page_id, block_id, block_type, author, kind) values ($1, $2, $3, 'text', $4, 'added')",
        [id(1), id(10), id(20), id(2)]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
