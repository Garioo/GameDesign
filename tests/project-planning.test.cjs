// Task dependencies, milestones and recurring tasks (supabase/migrate-project-planning.sql).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createPhaseFixture, id } = require("./fixtures/phase-db.cjs");

// Fixture: board 3 has stages 5 (Explore) and 6 (Playable); card 10 in 5, card 11 in 6.
// Stage 6 is made a done stage here.
async function makeDb() {
  const db = await createPhaseFixture();
  await db.exec(`reset role;
    create type work_status as enum ('todo', 'in_progress', 'in_review', 'done');
    create table milestones (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references projects(id) on delete cascade,
      name text not null, due_date date, status work_status not null default 'todo',
      position int not null default 0, created_at timestamptz not null default now());
    alter table milestones enable row level security;
    create policy m_all on milestones for all to authenticated using (can_access_project(project_id)) with check (can_edit_project(project_id));
    grant select, insert, update, delete on milestones to authenticated;
    ${fs.readFileSync("supabase/migrate-project-planning.sql", "utf8")}
    update board_columns set is_completed = (id = '${id(6)}');
    set role authenticated;`);
  return db;
}
const asViewer = (db) => db.exec("reset role; set test.role = 'viewer'; set role authenticated;");

/** Move a task the way the scheduling RPCs do (task stage changes are guarded). */
const moveTo = (db, card, column) =>
  db.exec(`reset role; select set_config('gantt.writing', 'yes', false);
    update board_cards set column_id = '${column}' where id = '${card}';
    select set_config('gantt.writing', '', false); set role authenticated;`);

test("records dependencies and refuses loops", async () => {
  const db = await makeDb();
  try {
    await db.query("insert into card_dependencies(project_id, blocker, blocked) values ($1, $2, $3)", [id(1), id(10), id(11)]);
    await assert.rejects(
      db.query("insert into card_dependencies(project_id, blocker, blocked) values ($1, $2, $3)", [id(1), id(11), id(10)]),
      /waiting on each other/,
    );
    await assert.rejects(
      db.query("insert into card_dependencies(project_id, blocker, blocked) values ($1, $2, $2)", [id(1), id(10)]),
      /check/,
    );
    await assert.rejects(
      db.query("insert into card_dependencies(project_id, blocker, blocked) values ($1, $2, $3)", [id(2), id(10), id(11)]),
    );
    // Deleting a task drops its links.
    await db.exec(`reset role; delete from board_cards where id = '${id(11)}'; set role authenticated;`);
    assert.equal((await db.query("select count(*)::int n from card_dependencies")).rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test("viewers can read but not change dependencies", async () => {
  const db = await makeDb();
  try {
    await asViewer(db);
    await assert.rejects(
      db.query("insert into card_dependencies(project_id, blocker, blocked) values ($1, $2, $3)", [id(1), id(10), id(11)]),
    );
    assert.equal((await db.query("select spawn_recurring_tasks($1) n", [id(1)])).rows[0].n, 0);
  } finally {
    await db.close();
  }
});

test("tasks join a milestone and leave it when it's deleted", async () => {
  const db = await makeDb();
  try {
    const m = (await db.query("insert into milestones(project_id, name, due_date, description) values ($1, 'Hand-in', '2026-12-01', 'Final report') returning id", [id(1)])).rows[0].id;
    await db.query("update board_cards set milestone_id = $1 where id = $2", [m, id(10)]);
    assert.equal((await db.query("select milestone_id from board_cards where id = $1", [id(10)])).rows[0].milestone_id, m);
    await assert.rejects(db.query("insert into milestones(project_id, name) values ($1, '   ')", [id(1)]), /milestones_name_length/);
    await db.query("delete from milestones where id = $1", [m]);
    assert.equal((await db.query("select milestone_id from board_cards where id = $1", [id(10)])).rows[0].milestone_id, null);
  } finally {
    await db.close();
  }
});

test("repeats a task: one open copy at a time, never twice for a period", async () => {
  const db = await makeDb();
  try {
    const rule = (await db.query("select set_task_recurrence($1, 'week') r", [id(10)])).rows[0].r;
    assert.ok(rule);
    assert.equal((await db.query("select recurrence_id from board_cards where id = $1", [id(10)])).rows[0].recurrence_id, rule);
    assert.equal((await db.query("select spawn_recurring_tasks($1) n", [id(1)])).rows[0].n, 0, "not due yet");

    // Due, but the first copy is still open: skip this period.
    await db.query("update recurring_tasks set next_run = current_date - 3 where id = $1", [rule]);
    assert.equal((await db.query("select spawn_recurring_tasks($1) n", [id(1)])).rows[0].n, 0);
    const next = (await db.query("select next_run > current_date later from recurring_tasks where id = $1", [rule])).rows[0];
    assert.equal(next.later, true, "the schedule still moves on");

    // Finished: the next due period creates a fresh copy in the first open stage.
    await moveTo(db, id(10), id(6));
    await db.query("update recurring_tasks set next_run = current_date where id = $1", [rule]);
    assert.equal((await db.query("select spawn_recurring_tasks($1) n", [id(1)])).rows[0].n, 1);
    assert.equal((await db.query("select spawn_recurring_tasks($1) n", [id(1)])).rows[0].n, 0, "no second copy");
    const copies = (await db.query("select title, column_id, priority from board_cards where recurrence_id = $1 and id <> $2", [rule, id(10)])).rows;
    assert.deepEqual(copies, [{ title: "Prototype", column_id: id(5), priority: "high" }]);

    // Stop repeating: copies stay, unlinked.
    await db.query("select set_task_recurrence($1, null)", [id(10)]);
    assert.equal((await db.query("select count(*)::int n from recurring_tasks")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int n from board_cards where title = 'Prototype'")).rows[0].n, 2);
  } finally {
    await db.close();
  }
});
