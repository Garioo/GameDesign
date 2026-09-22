// Minimal standalone fixture (not the shared timeline fixture — this needs
// real profiles/project_members/pages/comments rows and a switchable
// auth.uid(), which the lightweight board fixtures don't model).
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
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select current_setting('test.uid', true)::uuid $$;
    create table profiles(id uuid primary key, name text, initials text, color text default '#000');
    create table projects(id uuid primary key, owner uuid);
    create table project_members(project_id uuid, user_id uuid, role text, primary key(project_id, user_id));
    create function can_access_project(p_project uuid) returns boolean language sql stable as $$
      select exists(select 1 from project_members where project_id = p_project and user_id = auth.uid()) $$;
    create function can_edit_project(p_project uuid) returns boolean language sql stable as $$
      select exists(select 1 from project_members where project_id = p_project and user_id = auth.uid() and role in ('owner','editor')) $$;
    create table pages(id uuid primary key default gen_random_uuid(), project_id uuid references projects(id));
    create table comments(id uuid primary key default gen_random_uuid(), page_id uuid references pages(id) on delete cascade, parent_id uuid, author uuid, body text, created_at timestamptz not null default now());
    create table boards(id uuid primary key default gen_random_uuid(), project_id uuid);
    create table board_columns(id uuid primary key default gen_random_uuid(), project_id uuid, board_id uuid references boards(id));
    create table board_cards(id uuid primary key default gen_random_uuid(), project_id uuid, column_id uuid references board_columns(id), title text, owners uuid[] not null default '{}');
    create publication supabase_realtime;
    insert into projects values ('${id(1)}', '${id(1)}');
    insert into profiles values ('${id(1)}', 'Alice', 'AL', '#111'), ('${id(2)}', 'Bob', 'BO', '#222'), ('${id(3)}', 'Carl', 'CA', '#333');
    insert into project_members values ('${id(1)}', '${id(1)}', 'owner'), ('${id(1)}', '${id(2)}', 'editor');
    insert into pages values ('${id(10)}', '${id(1)}');
    insert into boards values ('${id(20)}', '${id(1)}');
    insert into board_columns values ('${id(21)}', '${id(1)}', '${id(20)}');
    insert into board_cards(id, project_id, column_id, title) values ('${id(30)}', '${id(1)}', '${id(21)}', 'Fix the bug');
    grant usage on schema auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);
  await db.exec(fs.readFileSync("supabase/migrate-notifications.sql", "utf8"));
  return db;
}
// RLS scopes `notifications` to `user_id = auth.uid()`, so every read/write
// against it below must run as the recipient being checked, not the actor.
const asUser = (db, uid) => db.exec(`set role authenticated; select set_config('test.uid', '${uid}', false);`);

test("mentioning a project member in a comment notifies them, not the mentioner", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("insert into comments(page_id, author, body) values ($1,$2,$3)", [
      id(10), id(1), `@[Bob](user:${id(2)}) can you fix this`,
    ]);

    await asUser(db, id(2));
    const rows = (await db.query("select * from notifications")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "mention");
    assert.equal(rows[0].actor_id, id(1));
    assert.equal(rows[0].snippet, "@Bob can you fix this");
    assert.equal(rows[0].link, `/doc?page=${id(10)}`);
    assert.equal(rows[0].read_at, null);

    // The enriched view resolves the actor's live profile.
    const enriched = (await db.query("select * from notification_rows")).rows[0];
    assert.equal(enriched.actor_name, "Alice");
    assert.equal(enriched.actor_initials, "AL");

    // Self-mentions and mentions of non-members are silently skipped.
    await asUser(db, id(1));
    await db.query("insert into comments(page_id, author, body) values ($1,$2,$3)", [
      id(10), id(1), `@[Alice](user:${id(1)}) note to self, and @[Nobody](user:${id(3)}) who left the project`,
    ]);
    assert.equal((await db.query("select * from notifications")).rows.length, 0); // Alice has none of her own
    await asUser(db, id(3));
    assert.equal((await db.query("select * from notifications")).rows.length, 0); // Carl isn't a project member
  } finally {
    await db.close();
  }
});

test("mentioned member can only see and mark their own notifications", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("insert into comments(page_id, author, body) values ($1,$2,$3)", [
      id(10), id(1), `@[Bob](user:${id(2)}) ping`,
    ]);

    await asUser(db, id(2));
    const notifId = (await db.query("select id from notifications")).rows[0].id;

    // The actor (Alice) isn't the recipient, so it's invisible to her and she can't mark it read.
    await asUser(db, id(1));
    assert.equal((await db.query("select * from notifications")).rows.length, 0);
    assert.equal((await db.query("update notifications set read_at=now() where id=$1 returning id", [notifId])).rows.length, 0);

    await asUser(db, id(2));
    assert.equal((await db.query("select * from notifications")).rows.length, 1);
    await db.query("update notifications set read_at=now() where id=$1", [notifId]);
    assert.ok((await db.query("select read_at from notifications where id=$1", [notifId])).rows[0].read_at);
  } finally {
    await db.close();
  }
});

test("assigning a card owner notifies the new assignee once, not on every re-save", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("update board_cards set owners = array[$1]::uuid[] where id=$2", [id(2), id(30)]);

    await asUser(db, id(2));
    let rows = (await db.query("select * from notifications")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "assignment");
    assert.equal(rows[0].actor_id, id(1));
    assert.equal(rows[0].snippet, "Fix the bug");
    assert.equal(rows[0].link, `/board?board=${id(20)}`);

    // Re-saving the same owners (e.g. an unrelated title edit) doesn't renotify.
    await asUser(db, id(1));
    await db.query("update board_cards set owners = array[$1]::uuid[] where id=$2", [id(2), id(30)]);
    await asUser(db, id(2));
    rows = (await db.query("select * from notifications")).rows;
    assert.equal(rows.length, 1);

    // Assigning yourself doesn't notify: clear the owners, then have Bob add
    // himself back as a fresh (newly-added) owner while acting as himself.
    await db.query("update board_cards set owners = '{}' where id=$1", [id(30)]);
    await db.query("update board_cards set owners = array[$1]::uuid[] where id=$2", [id(2), id(30)]);
    assert.equal((await db.query("select * from notifications where kind='assignment'")).rows.length, 1); // still just the earlier one
  } finally {
    await db.close();
  }
});
