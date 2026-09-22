const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// Alice (1) owns project 1, Bob (2) edits it, Carl (3) only belongs to project 2.
async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select current_setting('test.uid', true)::uuid $$;
    create table profiles(id uuid primary key, name text, initials text, color text default '#000');
    create table projects(id uuid primary key, owner uuid);
    create table project_members(project_id uuid, user_id uuid, role text, primary key(project_id, user_id));
    create function can_access_project(p_project uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from project_members where project_id = p_project and user_id = auth.uid()) $$;
    create function is_project_owner(p_project uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from projects where id = p_project and owner = auth.uid()) $$;
    create table pages(id uuid primary key default gen_random_uuid(), project_id uuid references projects(id));
    create table comments(id uuid primary key default gen_random_uuid(), page_id uuid not null references pages(id) on delete cascade,
      parent_id uuid, author uuid, body text, created_at timestamptz not null default now(),
      updated_at timestamptz, resolved_at timestamptz, resolved_by uuid);
    create table boards(id uuid primary key default gen_random_uuid(), project_id uuid);
    create table board_columns(id uuid primary key default gen_random_uuid(), project_id uuid, board_id uuid references boards(id));
    create table board_cards(id uuid primary key default gen_random_uuid(), project_id uuid, column_id uuid references board_columns(id), title text, owners uuid[] not null default '{}');
    create publication supabase_realtime;
    insert into projects values ('${id(1)}', '${id(1)}'), ('${id(2)}', '${id(3)}');
    insert into profiles values ('${id(1)}', 'Alice', 'AL'), ('${id(2)}', 'Bob', 'BO'), ('${id(3)}', 'Carl', 'CA');
    insert into project_members values ('${id(1)}', '${id(1)}', 'owner'), ('${id(1)}', '${id(2)}', 'editor'), ('${id(2)}', '${id(3)}', 'owner');
    insert into pages values ('${id(10)}', '${id(1)}');
    insert into boards values ('${id(20)}', '${id(1)}');
    insert into board_columns values ('${id(21)}', '${id(1)}', '${id(20)}');
    insert into board_cards(id, project_id, column_id, title) values ('${id(30)}', '${id(1)}', '${id(21)}', 'Fix the bug');
    alter table comments enable row level security;
    grant usage on schema auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);
  await db.exec(fs.readFileSync("supabase/migrate-notifications.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrate-card-comments.sql", "utf8"));
  return db;
}
const asUser = (db, uid) => db.exec(`set role authenticated; select set_config('test.uid', '${uid}', false);`);

test("a mention in a card comment notifies with a link to the card", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("insert into comments(card_id, author, body) values ($1,$2,$3)", [
      id(30), id(1), `@[Bob](user:${id(2)}) please check`,
    ]);
    await asUser(db, id(2));
    const rows = (await db.query("select kind, link, snippet from notifications")).rows;
    assert.deepEqual(rows, [{ kind: "mention", link: `/board?board=${id(20)}&card=${id(30)}`, snippet: "@Bob please check" }]);
    // Bob sees the card thread.
    assert.equal((await db.query("select * from comments where card_id = $1", [id(30)])).rows.length, 1);
  } finally {
    await db.close();
  }
});

test("page comments keep their page link", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("insert into comments(page_id, author, body) values ($1,$2,$3)", [id(10), id(1), `@[Bob](user:${id(2)}) hi`]);
    await asUser(db, id(2));
    assert.equal((await db.query("select link from notifications")).rows[0].link, `/doc?page=${id(10)}`);
  } finally {
    await db.close();
  }
});

test("assignment notifications deep-link to the card", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("update board_cards set owners = $1 where id = $2", [[id(2)], id(30)]);
    await asUser(db, id(2));
    assert.equal((await db.query("select link from notifications")).rows[0].link, `/board?board=${id(20)}&card=${id(30)}`);
  } finally {
    await db.close();
  }
});

test("outsiders can neither read nor write card comments", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("insert into comments(card_id, author, body) values ($1,$2,'secret')", [id(30), id(1)]);
    await asUser(db, id(3));
    assert.equal((await db.query("select * from comments")).rows.length, 0);
    await assert.rejects(
      db.query("insert into comments(card_id, author, body) values ($1,$2,'hi')", [id(30), id(3)]),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});

test("a comment needs exactly one target", async () => {
  const db = await makeDb();
  try {
    // As the table owner, so the check constraint (not RLS) is what rejects.
    await assert.rejects(db.query("insert into comments(author, body) values ($1,'x')", [id(1)]), /comments_one_target/);
    await assert.rejects(
      db.query("insert into comments(page_id, card_id, author, body) values ($1,$2,$3,'x')", [id(10), id(30), id(1)]),
      /comments_one_target/,
    );
  } finally {
    await db.close();
  }
});

test("members resolve card comments; outsiders cannot", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    const { rows } = await db.query("insert into comments(card_id, author, body) values ($1,$2,'done?') returning id", [id(30), id(1)]);
    const cid = rows[0].id;
    await asUser(db, id(2));
    await db.query("select set_comment_resolved($1, true)", [cid]);
    assert.equal((await db.query("select resolved_by from comments where id = $1", [cid])).rows[0].resolved_by, id(2));
    await asUser(db, id(3));
    await assert.rejects(db.query("select set_comment_resolved($1, false)", [cid]), /Comment not found/);
  } finally {
    await db.close();
  }
});
