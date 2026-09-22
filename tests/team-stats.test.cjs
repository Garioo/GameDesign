const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

process.env.TZ = "Europe/Copenhagen";
const compiled = { exports: {} };
new Function("exports", "require", ts.transpileModule(fs.readFileSync("lib/teamStats.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText)(compiled.exports, require);
const { leaderboard, weeklyTotals, weekStreak, doneTasks, startOfWeek } = compiled.exports;

// Wednesday 23 September 2026, week 39.
const now = new Date("2026-09-23T12:00:00");
const card = (id, owners) => ({ id, title: id, sub: "", kind: "", tags: [], priority: null, ownerIds: owners });
const boards = [{
  id: "b", name: "Board", color: "", cols: [
    { id: "todo", name: "To do", color: "", isCompleted: false, cards: [card("o1", ["ann"]), card("o2", ["ann", "bo"])] },
    { id: "done", name: "Done", color: "", isCompleted: true, cards: [
      card("a", ["ann"]), card("b", ["ann", "bo"]), card("c", ["bo"]), card("d", ["bo"]),
      card("e", ["cy"]), card("f", []), card("g", ["cy"]),
    ] },
  ],
}];
const completions = new Map(Object.entries({
  a: "2026-09-22T09:00:00Z", // this week
  b: "2026-09-21T06:00:00Z", // this week, shared
  c: "2026-09-15T10:00:00Z", // last week
  d: "2026-09-08T10:00:00Z", // two weeks ago
  e: "2026-08-20T10:00:00Z", // last month
  f: "2026-09-22T10:00:00Z", // unassigned
  // g: done before tracking began
}));

test("weeks start on Monday in local time", () => {
  assert.equal(startOfWeek(now).toString(), new Date("2026-09-21T00:00:00").toString());
});

test("leaderboard credits every assignee and respects the period", () => {
  const people = ["ann", "bo", "cy"];
  const week = leaderboard(boards, completions, people, "week", now);
  assert.deepEqual(week.map((r) => [r.id, r.done, r.open]), [["ann", 2, 2], ["bo", 1, 1], ["cy", 0, 0]]);
  const month = leaderboard(boards, completions, people, "month", now);
  assert.deepEqual(month.map((r) => [r.id, r.done]), [["bo", 3], ["ann", 2], ["cy", 0]]);
  const all = leaderboard(boards, completions, people, "all", now);
  assert.deepEqual(all.map((r) => [r.id, r.done]), [["bo", 3], ["cy", 2], ["ann", 2]]); // ties: fewer open tasks first
});

test("streaks count consecutive weeks and survive a still-empty current week", () => {
  const done = doneTasks(boards, completions);
  const bo = done.filter((t) => t.ownerIds.includes("bo"));
  assert.equal(weekStreak(bo, now), 3); // weeks 37, 38, 39
  assert.equal(weekStreak(done.filter((t) => t.ownerIds.includes("cy")), now), 0);
  assert.equal(weekStreak(bo.filter((t) => t.id === "c"), now), 1);
});

test("weekly totals cover the last eight weeks, oldest first", () => {
  const weeks = weeklyTotals(doneTasks(boards, completions), now);
  assert.equal(weeks.length, 8);
  assert.deepEqual(weeks.slice(-3).map((w) => w.done), [1, 1, 3]);
});

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
test("finishing, reopening and stage switches are tracked; the migration runs without a signed-in user", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create table projects(id uuid primary key);
      create function can_access_project(p uuid) returns boolean language sql stable as $$
        select current_setting('test.member', true) = 'yes' $$;
      create table activity(id serial, card_id uuid, action text, meta jsonb, created_at timestamptz);
      create table board_columns(id uuid primary key, project_id uuid, is_completed boolean not null default false);
      create table board_cards(id uuid primary key, project_id uuid, column_id uuid references board_columns(id));
      insert into projects values ('${id(9)}');
      insert into board_columns values ('${id(1)}', '${id(9)}', false), ('${id(2)}', '${id(9)}', true), ('${id(3)}', '${id(9)}', true);
      insert into board_cards values ('${id(10)}', '${id(9)}', '${id(1)}'), ('${id(11)}', '${id(9)}', '${id(2)}'), ('${id(12)}', '${id(9)}', '${id(2)}');
      insert into activity(card_id, action, meta, created_at) values ('${id(12)}', 'card.moved', '{"done":true}', '2026-03-04T00:00:00Z');
      -- Stand-ins for the real guards on these tables (migrate-gantt-planning.sql and
      -- migrate-task-hierarchy.sql): both reject writes when nobody is signed in, like the
      -- Supabase SQL editor. The hierarchy one is deferred to commit.
      create function gantt_write_guard() returns trigger language plpgsql as $g$
      begin
        if pg_trigger_depth() = 1 and current_setting('test.member', true) is distinct from 'yes' then
          raise exception 'Editor access is required';
        end if;
        return coalesce(new, old);
      end $g$;
      create function gantt_hierarchy_guard() returns trigger language plpgsql as $g$
      begin
        if not can_access_project(coalesce(new.project_id, old.project_id)) then raise exception 'Workspace access is required'; end if;
        return null;
      end $g$;
      create trigger gantt_guard before insert or update or delete on board_cards for each row execute function gantt_write_guard();
      create trigger gantt_guard before insert or update or delete on board_columns for each row execute function gantt_write_guard();
      create constraint trigger gantt_hierarchy_guard after insert or update or delete on board_cards
        deferrable initially deferred for each row execute function gantt_hierarchy_guard();
      create constraint trigger gantt_hierarchy_guard after insert or update or delete on board_columns
        deferrable initially deferred for each row execute function gantt_hierarchy_guard();
      create publication supabase_realtime;
    `);
    // Runs like the Supabase SQL editor: nobody signed in.
    await db.exec(fs.readFileSync("supabase/migrate-card-completed-at.sql", "utf8"));
    const at = async (n) => (await db.query(`select completed_at from card_completions where card_id='${id(n)}'`)).rows[0]?.completed_at ?? null;
    // Backfill: the logged move into done; no log means no known finish day.
    assert.equal((await at(12)).toISOString(), "2026-03-04T00:00:00.000Z");
    assert.equal(await at(11), null);
    assert.equal(await at(10), null);

    await db.exec("select set_config('test.member', 'yes', false)"); // the app's signed-in member from here on
    await db.exec(`update board_cards set column_id='${id(2)}' where id='${id(10)}'`);
    const first = await at(10);
    assert.ok(first && Date.now() - first.getTime() < 60_000);
    await db.exec(`update board_cards set column_id='${id(3)}' where id='${id(10)}'`); // done → done keeps the day
    assert.equal((await at(10)).getTime(), first.getTime());
    await db.exec(`update board_cards set column_id='${id(1)}' where id='${id(10)}'`); // reopened
    assert.equal(await at(10), null);
    await db.exec(`insert into board_cards values ('${id(13)}', '${id(9)}', '${id(2)}')`);
    assert.equal(await at(13), null); // copies and direct inserts don't count as new work

    // Turning a stage into a done stage finishes its tasks now; turning it back reopens them.
    await db.exec(`update board_columns set is_completed=true where id='${id(1)}'`);
    assert.ok(await at(10));
    await db.exec(`update board_columns set is_completed=false where id='${id(1)}'`);
    assert.equal(await at(10), null);

    // Rerunning is harmless and keeps what's recorded.
    await db.exec(`update board_cards set column_id='${id(2)}' where id='${id(10)}'`);
    await db.exec("select set_config('test.member', '', false)");
    await db.exec(fs.readFileSync("supabase/migrate-card-completed-at.sql", "utf8"));
    assert.ok(await at(10));
    assert.equal((await at(12)).toISOString(), "2026-03-04T00:00:00.000Z");
  } finally {
    await db.close();
  }
});
