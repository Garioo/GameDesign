// Sharing one page with outsiders (supabase/migrate-page-shares.sql): the
// link opens that page only; signed-in guests can comment there and nowhere else.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const EDITOR = id(1);
const GUEST = id(7);
const OTHER_GUEST = id(8);

async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create type work_status as enum ('todo', 'in_progress', 'in_review', 'done');
    create table profiles(id uuid primary key, name text, initials text, color text);
    create table projects(id uuid primary key, name text);
    create table project_members(project_id uuid, user_id uuid, role text, primary key(project_id, user_id));
    -- security definer, as in schema.sql: callers can't read project_members themselves.
    create function can_edit_project(p uuid) returns boolean language sql stable security definer as $$
      select exists(select 1 from project_members where project_id = p and user_id = auth.uid() and role in ('owner','editor')) $$;
    create table pages(id uuid primary key, project_id uuid references projects(id), title text, summary text,
      status work_status not null default 'todo', updated_at timestamptz default now(), deleted_at timestamptz);
    create table blocks(id uuid primary key, page_id uuid references pages(id) on delete cascade, type text, content jsonb,
      position int default 0, created_at timestamptz default now());
    create table comments(
      id uuid primary key default gen_random_uuid(), page_id uuid references pages(id), card_id uuid,
      parent_id uuid references comments(id) on delete cascade, author uuid not null references profiles(id), body text not null,
      created_at timestamptz not null default now(), updated_at timestamptz, resolved_at timestamptz, resolved_by uuid);
    insert into profiles values ('${EDITOR}', 'Ada', 'AD', '#5a83d6'), ('${GUEST}', 'Prof. Grey', 'PG', '#3f9d6e'), ('${OTHER_GUEST}', 'Bob', 'BO', '#d4763a');
    insert into projects values ('${id(2)}', 'Thesis');
    insert into project_members values ('${id(2)}', '${EDITOR}', 'owner');
    insert into pages(id, project_id, title) values ('${id(10)}', '${id(2)}', 'Method'), ('${id(11)}', '${id(2)}', 'Secret plans');
    insert into blocks values ('${id(20)}', '${id(10)}', 'text', '{"text":"We interview 12 people."}', 0, now()),
                              ('${id(21)}', '${id(11)}', 'text', '{"text":"Not for guests."}', 0, now());
    grant usage on schema auth to authenticated, anon;
  `);
  await db.exec(fs.readFileSync("supabase/migrate-inline-suggestions.sql", "utf8"));
  await db.exec(fs.readFileSync("supabase/migrate-block-comments.sql", "utf8"));
  const migration = fs.readFileSync("supabase/migrate-page-shares.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration); // safe to rerun
  return db;
}
const as = (db, uid, role = "authenticated") =>
  db.exec(`reset role; select set_config('test.uid', '${uid ?? ""}', false); set role ${role};`);
const share = async (db, page = id(10)) => {
  await as(db, EDITOR);
  return (await db.query("insert into page_shares(page_id) values ($1) returning token", [page])).rows[0].token;
};
const read = async (db, token) => (await db.query("select shared_page($1) v", [token])).rows[0].v;

test("anyone with the link reads that page — and only that page", async () => {
  const db = await makeDb();
  try {
    const token = await share(db);
    assert.match(token, /^[0-9a-f]{64}$/);
    await as(db, null, "anon");
    const v = await read(db, token);
    assert.equal(v.page.title, "Method");
    assert.equal(v.workspace, "Thesis");
    assert.deepEqual(v.blocks.map((b) => b.id), [id(20)]);
    assert.deepEqual(v.people, [], "signed-out visitors don't see the member list");
    assert.equal(await read(db, "0".repeat(64)), null);
  } finally {
    await db.close();
  }
});

test("signed-in guests comment on the shared page, not elsewhere", async () => {
  const db = await makeDb();
  try {
    const token = await share(db);
    await as(db, null, "anon");
    await assert.rejects(db.query("select comment_on_shared_page($1, 'Hi')", [token]), /permission denied|Sign in/);

    await as(db, GUEST);
    const root = (await db.query("select comment_on_shared_page($1, 'Why 12?') c", [token])).rows[0].c;
    await db.query("select comment_on_shared_page($1, 'Say more', null, $2, 'We interview 12 people.')", [token, id(20)]);
    await db.query("select comment_on_shared_page($1, 'Follow-up', $2)", [token, root]);
    await assert.rejects(
      db.query("select comment_on_shared_page($1, 'Sneaky', null, $2, 'x')", [token, id(21)]),
      /isn't on this page/,
    );
    const v = await read(db, token);
    assert.equal(v.comments.length, 3);
    assert.equal(v.comments.find((c) => c.block_id).quote, "We interview 12 people.");
    assert.ok(v.people.some((p) => p.id === EDITOR), "signed-in guests can @-mention members");

    // Guests can't see share links (or their tokens) directly: RLS hides every row.
    assert.equal((await db.query("select * from page_shares")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("guests edit and delete only their own comments", async () => {
  const db = await makeDb();
  try {
    const token = await share(db);
    await as(db, GUEST);
    const mine = (await db.query("select comment_on_shared_page($1, 'Typo here') c", [token])).rows[0].c;
    await db.query("select edit_shared_page_comment($1, $2, 'Typo fixed')", [token, mine]);
    await as(db, OTHER_GUEST);
    await assert.rejects(db.query("select delete_shared_page_comment($1, $2)", [token, mine]), /only delete your own/);
    await assert.rejects(db.query("select edit_shared_page_comment($1, $2, 'hijack')", [token, mine]), /only edit your own/);
    await as(db, GUEST);
    await db.query("select delete_shared_page_comment($1, $2)", [token, mine]);
    assert.equal((await read(db, token)).comments.length, 0);
  } finally {
    await db.close();
  }
});

test("revoking, turning comments off or trashing the page closes the link", async () => {
  const db = await makeDb();
  try {
    const token = await share(db);
    await db.query("update page_shares set allow_comments = false where token = $1", [token]);
    await as(db, GUEST);
    await assert.rejects(db.query("select comment_on_shared_page($1, 'Hi')", [token]), /turned off/);
    assert.equal((await read(db, token)).allow_comments, false);

    await as(db, EDITOR);
    await db.query("update page_shares set revoked_at = now() where token = $1", [token]);
    await as(db, GUEST);
    assert.equal(await read(db, token), null);

    const second = await share(db);
    await db.exec(`reset role; update pages set deleted_at = now() where id = '${id(10)}';`);
    await as(db, GUEST);
    assert.equal(await read(db, second), null);
  } finally {
    await db.close();
  }
});

test("only editors of the workspace can create share links", async () => {
  const db = await makeDb();
  try {
    await as(db, GUEST);
    await assert.rejects(db.query("insert into page_shares(page_id) values ($1)", [id(10)]));
  } finally {
    await db.close();
  }
});
