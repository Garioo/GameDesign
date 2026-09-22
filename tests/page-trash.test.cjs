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
    create table profiles(id uuid primary key);
    create table projects(id uuid primary key);
    create table project_members(project_id uuid, user_id uuid, role text, primary key(project_id, user_id));
    create function can_edit_project(p_project uuid) returns boolean language sql stable as $$
      select exists(select 1 from project_members where project_id = p_project and user_id = auth.uid() and role in ('owner','editor')) $$;
    create table pages(id uuid primary key, project_id uuid references projects(id), parent_id uuid references pages(id) on delete cascade);
    insert into projects values ('${id(1)}'), ('${id(2)}');
    insert into profiles values ('${id(1)}'), ('${id(2)}'), ('${id(3)}');
    insert into project_members values ('${id(1)}', '${id(1)}', 'owner'), ('${id(1)}', '${id(2)}', 'viewer'), ('${id(2)}', '${id(3)}', 'owner');
    -- 10 ─ 11 ─ 12, plus sibling 13 under 10; 20 is unrelated.
    insert into pages values ('${id(10)}', '${id(1)}', null), ('${id(11)}', '${id(1)}', '${id(10)}'),
      ('${id(12)}', '${id(1)}', '${id(11)}'), ('${id(13)}', '${id(1)}', '${id(10)}'), ('${id(20)}', '${id(1)}', null);
    grant usage on schema auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);
  await db.exec(fs.readFileSync("supabase/migrate-page-trash.sql", "utf8"));
  return db;
}
const asUser = (db, uid) => db.exec(`set role authenticated; select set_config('test.uid', '${uid}', false);`);
const trashed = async (db) =>
  (await db.query("select id from pages where deleted_at is not null order by id")).rows.map((r) => r.id);

test("trashing a page trashes its descendants; restore brings back the same set", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("select trash_page($1)", [id(13)]); // sibling trashed separately first
    await db.query("select trash_page($1)", [id(10)]);
    assert.deepEqual(await trashed(db), [id(10), id(11), id(12), id(13)]);
    const who = (await db.query("select deleted_by from pages where id = $1", [id(12)])).rows[0];
    assert.equal(who.deleted_by, id(1));

    await db.query("select restore_page($1)", [id(10)]);
    // 13 went to the trash on its own, so it stays there.
    assert.deepEqual(await trashed(db), [id(13)]);
  } finally {
    await db.close();
  }
});

test("restoring a child whose parent is still trashed moves it to the top level", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("select trash_page($1)", [id(10)]);
    await db.query("select restore_page($1)", [id(11)]);
    const row = (await db.query("select parent_id, deleted_at from pages where id = $1", [id(11)])).rows[0];
    assert.equal(row.parent_id, null);
    assert.equal(row.deleted_at, null);
    assert.deepEqual(await trashed(db), [id(10), id(13)]); // 12 came back with 11
  } finally {
    await db.close();
  }
});

test("viewers and non-members cannot trash or restore", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(2));
    await assert.rejects(db.query("select trash_page($1)", [id(20)]), /Not allowed/);
    await asUser(db, id(3));
    await assert.rejects(db.query("select trash_page($1)", [id(20)]), /Not allowed/);
    await asUser(db, id(1));
    await db.query("select trash_page($1)", [id(20)]);
    await asUser(db, id(2));
    await assert.rejects(db.query("select restore_page($1)", [id(20)]), /Not allowed/);
  } finally {
    await db.close();
  }
});

test("pages trashed over 30 days ago are purged on the next trash", async () => {
  const db = await makeDb();
  try {
    await db.exec(`update pages set deleted_at = now() - interval '31 days' where id = '${id(20)}'`);
    await asUser(db, id(1));
    await db.query("select trash_page($1)", [id(13)]);
    const left = (await db.query("select id from pages where id = $1", [id(20)])).rows;
    assert.equal(left.length, 0);
    assert.deepEqual(await trashed(db), [id(13)]);
  } finally {
    await db.close();
  }
});
