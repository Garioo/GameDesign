// Event attendees (supabase/migrate-event-attendees.sql): members and outside
// guests on calendar events, and the 'event' notification for newly added
// members. Standalone fixture like notifications.test.cjs, since it needs real
// profiles/project_members rows and a switchable auth.uid().
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
    insert into profiles values ('${id(1)}', 'Nicolai', 'NI', '#111'), ('${id(2)}', 'Bob', 'BO', '#222'), ('${id(3)}', 'Carl', 'CA', '#333');
    insert into project_members values ('${id(1)}', '${id(1)}', 'owner'), ('${id(1)}', '${id(2)}', 'editor');
    grant usage on schema auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);
  for (const f of ["migrate-notifications", "migrate-calendar-events", "migrate-calendar-event-ranges", "migrate-event-attendees", "migrate-event-attendees"]) {
    await db.exec(fs.readFileSync(`supabase/${f}.sql`, "utf8"));
  }
  return db;
}
const asUser = (db, uid) => db.exec(`set role authenticated; select set_config('test.uid', '${uid}', false);`);
const inbox = async (db, uid) => {
  await asUser(db, uid);
  return (await db.query("select kind, actor_id, snippet, link from notifications order by created_at")).rows;
};

test("adding members to an event notifies them once, not the organiser or non-members", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    const ev = (await db.query(
      `insert into calendar_events(project_id, title, date, start_time, attendees, guests)
       values ($1, 'Sprint review', '2026-09-25', '10:00', $2, $3) returning *`,
      [id(1), [id(1), id(2), id(3)], ["Anna from Sony"]],
    )).rows[0];
    assert.deepEqual(ev.guests, ["Anna from Sony"]);

    const bob = await inbox(db, id(2));
    assert.equal(bob.length, 1);
    assert.equal(bob[0].kind, "event");
    assert.equal(bob[0].actor_id, id(1));
    assert.equal(bob[0].snippet, "Sprint review · Friday 25 September 10:00");
    assert.equal(bob[0].link, `/calendar?date=2026-09-25&event=${ev.id}`);
    assert.equal((await inbox(db, id(1))).length, 0, "the organiser isn't notified about themselves");
    assert.equal((await inbox(db, id(3))).length, 0, "non-members aren't notified");

    // Editing other fields, or re-saving the same attendees, sends nothing new.
    await asUser(db, id(1));
    await db.query("update calendar_events set title = 'Sprint review (moved)', attendees = $2 where id = $1", [ev.id, [id(2), id(1)]]);
    assert.equal((await inbox(db, id(2))).length, 1);

    // Removing and re-adding someone notifies them again.
    await asUser(db, id(1));
    await db.query("update calendar_events set attendees = '{}' where id = $1", [ev.id]);
    await db.query("update calendar_events set attendees = $2 where id = $1", [ev.id, [id(2)]]);
    assert.equal((await inbox(db, id(2))).length, 2);
  } finally {
    await db.close();
  }
});

test("guest names must be non-blank and at most 120 characters", async () => {
  const db = await makeDb();
  try {
    await asUser(db, id(1));
    const insert = (guests) => db.query(
      "insert into calendar_events(project_id, title, date, guests) values ($1, 'Meeting', '2026-09-25', $2)", [id(1), guests]);
    await insert(["Anna", "Ben Smith"]);
    await assert.rejects(insert(["   "]), /check constraint/);
    await assert.rejects(insert(["x".repeat(121)]), /check constraint/);
  } finally {
    await db.close();
  }
});
