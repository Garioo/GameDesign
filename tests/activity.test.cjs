const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

// Alice (1) owns project 1, Bob (2) edits it, Carl (3) is not a member yet.
async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles(id uuid primary key, name text, initials text, color text default '#000');
    create table projects(id uuid primary key, owner uuid);
    create table project_members(project_id uuid, user_id uuid, role text, primary key(project_id, user_id));
    create function can_access_project(p_project uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from project_members where project_id = p_project and user_id = auth.uid()) $$;
    create function can_edit_project(p_project uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from project_members where project_id = p_project and user_id = auth.uid() and role in ('owner','editor')) $$;
    create function is_project_owner(p_project uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from projects where id = p_project and owner = auth.uid()) $$;
    create table pages(id uuid primary key default gen_random_uuid(), project_id uuid references projects(id), parent_id uuid references pages(id) on delete cascade,
      title text, status text default 'todo', owner uuid);
    create table comments(id uuid primary key default gen_random_uuid(), page_id uuid not null references pages(id) on delete cascade,
      parent_id uuid, author uuid, body text, created_at timestamptz not null default now(),
      updated_at timestamptz, resolved_at timestamptz, resolved_by uuid);
    create table boards(id uuid primary key default gen_random_uuid(), project_id uuid, name text);
    create table board_columns(id uuid primary key default gen_random_uuid(), project_id uuid, board_id uuid references boards(id), name text, is_completed boolean default false);
    create table board_cards(id uuid primary key default gen_random_uuid(), project_id uuid, column_id uuid references board_columns(id), title text, owners uuid[] not null default '{}');
    create table canvases(id uuid primary key default gen_random_uuid(), project_id uuid, name text);
    create table activity(id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
      actor uuid, action text not null, target text, page_id uuid references pages(id) on delete set null, created_at timestamptz not null default now());
    create publication supabase_realtime;
    insert into projects values ('${id(1)}', '${id(1)}');
    insert into profiles values ('${id(1)}', 'Alice', 'AL'), ('${id(2)}', 'Bob', 'BO'), ('${id(3)}', 'Carl', 'CA');
    insert into project_members values ('${id(1)}', '${id(1)}', 'owner'), ('${id(1)}', '${id(2)}', 'editor');
    insert into pages(id, project_id, title) values ('${id(10)}', '${id(1)}', 'Combat');
    insert into pages(id, project_id, parent_id, title) values ('${id(11)}', '${id(1)}', '${id(10)}', 'Combos');
    insert into boards values ('${id(20)}', '${id(1)}', 'Gameplay');
    insert into board_columns values ('${id(21)}', '${id(1)}', '${id(20)}', 'To do', false), ('${id(22)}', '${id(1)}', '${id(20)}', 'Done', true);
    insert into board_cards(id, project_id, column_id, title) values ('${id(30)}', '${id(1)}', '${id(21)}', 'Fix the bug');
    alter table activity enable row level security;
    create policy activity_select on activity for select to authenticated using (can_access_project(project_id));
    create policy activity_insert on activity for insert to authenticated with check (true);
    grant usage on schema auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);
  for (const name of ["notifications", "card-comments", "page-trash", "activity"]) {
    await db.exec(fs.readFileSync(`supabase/migrate-${name}.sql`, "utf8"));
  }
  return db;
}
const asUser = (db, uid) => db.exec(`set role authenticated; select set_config('test.uid', '${uid}', false);`);
const feed = async (db) => (await db.query("select actor, action, target, page_id, card_id, meta from activity order by created_at, action")).rows;

test("system writes (no caller) are not logged", async () => {
  const db = await makeDb();
  try {
    await db.exec(`insert into pages(project_id, title) values ('${id(1)}', 'Seeded')`);
    assert.equal((await db.query("select count(*)::int n from activity")).rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test("page status changes fold together, and a change undone in the window disappears", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("update pages set status = 'wip' where id = $1", [id(10)]);
    await db.query("update pages set status = 'review' where id = $1", [id(10)]);
    let rows = await feed(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, "page.status");
    assert.equal(rows[0].meta.from, "todo");
    assert.equal(rows[0].meta.to, "review");
    await db.query("update pages set status = 'todo' where id = $1", [id(10)]);
    assert.equal((await feed(db)).length, 0);
  } finally {
    await db.close();
  }
});

test("tasks: bursts of creation fold per board; stage moves record from/to and done", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(2));
    await db.query("insert into board_cards(project_id, column_id, title) values ($1,$2,'A'), ($1,$2,'B')", [id(1), id(21)]);
    await db.query("update board_cards set column_id = $1 where id = $2", [id(22), id(30)]);
    const rows = await feed(db);
    const created = rows.find((r) => r.action === "card.created");
    assert.equal(created.meta.count, 2);
    assert.equal(created.meta.board_name, "Gameplay");
    const moved = rows.find((r) => r.action === "card.moved");
    assert.deepEqual([moved.meta.from, moved.meta.to, moved.meta.done], ["To do", "Done", true]);
    assert.equal(moved.card_id, id(30));
  } finally {
    await db.close();
  }
});

test("assignments merge the added users", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("update board_cards set owners = $1 where id = $2", [[id(2)], id(30)]);
    await db.query("update board_cards set owners = $1 where id = $2", [[id(2), id(1)], id(30)]);
    const rows = (await feed(db)).filter((r) => r.action === "card.assigned");
    assert.equal(rows.length, 1);
    assert.deepEqual([...rows[0].meta.users].sort(), [id(1), id(2)]);
  } finally {
    await db.close();
  }
});

test("trash logs one entry for the page, not one per sub-page", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("select trash_page($1)", [id(10)]);
    await db.query("select restore_page($1)", [id(10)]);
    const rows = await feed(db);
    assert.deepEqual(rows.map((r) => r.action), ["page.trashed", "page.restored"]);
    assert.equal(rows[0].meta.subpages, 1);
  } finally {
    await db.close();
  }
});

test("clients cannot write activity directly", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await assert.rejects(
      db.query("insert into activity(project_id, actor, action) values ($1,$2,'page.created')", [id(1), id(2)]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("joining through an invite is logged; creating your own workspace is not", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(3));
    await db.exec(`reset role`);
    await db.exec(`set role authenticated`);
    await db.query("insert into project_members values ($1,$2,'viewer')", [id(1), id(3)]);
    const rows = await feed(db);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, "member.joined");
    assert.equal(rows[0].actor, id(3));
  } finally {
    await db.close();
  }
});

test("a reply notifies the rest of the thread, except people it @-mentions", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    const root = (await db.query("insert into comments(page_id, author, body) values ($1,$2,'Thoughts?') returning id", [id(10), id(1)])).rows[0].id;
    await asUser(db, id(2));
    await db.query("insert into comments(page_id, parent_id, author, body) values ($1,$2,$3,'Looks good')", [id(10), root, id(2)]);
    await asUser(db, id(1));
    let mine = (await db.query("select kind, snippet, link from notifications")).rows;
    assert.deepEqual(mine, [{ kind: "reply", snippet: "Looks good", link: `/doc?page=${id(10)}` }]);

    // Alice replies and mentions Bob: Bob gets the mention, not also a reply.
    await db.query("insert into comments(page_id, parent_id, author, body) values ($1,$2,$3,$4)", [
      id(10), root, id(1), `@[Bob](user:${id(2)}) agreed`,
    ]);
    await asUser(db, id(2));
    const bobs = (await db.query("select kind from notifications order by created_at")).rows.map((r) => r.kind);
    assert.deepEqual(bobs, ["mention"]);
  } finally {
    await db.close();
  }
});

test("being made page owner notifies the new owner (not yourself)", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    await db.query("update pages set owner = $1 where id = $2", [id(2), id(10)]);
    await db.query("update pages set owner = $1 where id = $2", [id(1), id(11)]);
    await asUser(db, id(2));
    const rows = (await db.query("select kind, snippet, link from notifications")).rows;
    assert.deepEqual(rows, [{ kind: "page_owner", snippet: "Combat", link: `/doc?page=${id(10)}` }]);
    await asUser(db, id(1));
    assert.equal((await db.query("select count(*)::int n from notifications")).rows[0].n, 0);
  } finally {
    await db.close();
  }
});
