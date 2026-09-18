const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
test("transactional Gantt scheduling, permissions, rollback, and undo", async (t) => {
  const db = new PGlite();
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${id(99)}');create function auth.uid() returns uuid language sql as 'select ''${id(99)}''::uuid';
 create table projects(id uuid primary key);insert into projects values('${id(1)}'),('${id(2)}');
 create function can_access_project(uuid) returns boolean language sql as 'select $1 = ''${id(1)}''::uuid';create function can_edit_project(uuid) returns boolean language sql as 'select can_access_project($1) and current_setting(''test.role'') = ''editor''';
 create table boards(id uuid primary key,project_id uuid references projects(id));insert into boards values('${id(3)}','${id(1)}'),('${id(4)}','${id(1)}');
 create table board_columns(id uuid primary key,project_id uuid references projects(id),board_id uuid references boards(id) on delete cascade,name text);insert into board_columns values('${id(5)}','${id(1)}','${id(3)}','To Do'),('${id(6)}','${id(1)}','${id(4)}','Done');
 create table board_cards(id uuid primary key,project_id uuid references projects(id),column_id uuid references board_columns(id) on delete cascade,title text,sub text,kind text,tags text[],owners uuid[],priority text,start_date date,deadline date,check(deadline>=start_date));
 insert into board_cards values('${id(10)}','${id(1)}','${id(5)}','Prototype','','','{}','{}',null,'2026-03-27','2026-03-29'),('${id(11)}','${id(1)}','${id(5)}','Playtest','','','{}','{}',null,'2026-03-30','2026-03-31'),('${id(12)}','${id(1)}','${id(6)}','Release','','','{}','{}',null,'2026-04-05','2026-04-06');
 create publication supabase_realtime;set test.role='editor';`);
  await db.exec(fs.readFileSync("supabase/migrate-gantt-planning.sql", "utf8"));
  await db.exec(
    "grant usage on schema auth to authenticated;grant select,insert,update,delete on all tables in schema public to authenticated;set role authenticated;",
  );
  const snapshot = async () =>
    (await db.query("select gantt_snapshot($1) s", [id(1)])).rows[0].s;
  const mutate = async (action, expected = undefined) =>
    (
      await db.query("select gantt_mutate($1,$2,$3) r", [
        id(1),
        expected ?? (await snapshot()),
        action,
      ])
    ).rows[0].r;
  const card = (n, start, end, firm = null) => ({
    op: "card",
    card: { id: id(n), start_date: start, deadline: end, firm_deadline: firm },
  });
  const link = (a, b, kind = "FS", gap = 0) =>
    mutate({
      op: "dependency",
      predecessor: id(a),
      successor: id(b),
      kind,
      gap,
    });
  async function scenario(name, fn) {
    await t.test(name, async () => {
      await db.exec("begin");
      try {
        await fn();
      } finally {
        await db.exec("rollback");
      }
    });
  }
  await scenario(
    "preserves dates and marks Done columns during migration",
    async () => {
      const s = await snapshot();
      assert.equal(s.cards[0].deadline, "2026-03-29");
      assert.equal(s.columns.find((c) => c.id === id(6)).is_completed, true);
    },
  );
  await scenario(
    "finish-to-start cascade preserves duration across DST and undo restores all dates",
    async () => {
      await link(10, 11);
      const before = await snapshot();
      const result = await mutate(card(10, "2026-03-30", "2026-04-01"));
      assert.equal(result.moved, 2);
      assert.equal(
        result.snapshot.cards.find((c) => c.id === id(11)).start_date,
        "2026-04-02",
      );
      assert.equal(
        result.snapshot.cards.find((c) => c.id === id(11)).deadline,
        "2026-04-03",
      );
      const undone = await mutate(
        { op: "undo", dates: result.before },
        result.snapshot,
      );
      assert.deepEqual(undone.snapshot, before);
    },
  );
  await scenario(
    "start-to-start with gap and earlier movement never pulls successors back",
    async () => {
      await link(10, 11, "SS", 5);
      assert.equal((await snapshot()).cards[1].start_date, "2026-04-01");
      await mutate(card(10, "2026-03-20", "2026-03-22"));
      assert.equal((await snapshot()).cards[1].start_date, "2026-04-01");
    },
  );
  await scenario("finish-to-finish preserves successor duration", async () => {
    await link(10, 11, "FF", 4);
    const c = (await snapshot()).cards[1];
    assert.equal(c.deadline, "2026-04-02");
    assert.equal(c.start_date, "2026-04-01");
  });
  await scenario("completed successor blocks whole cascade", async () => {
    await link(10, 12);
    const s = await snapshot();
    await db.exec("savepoint change");
    await assert.rejects(
      mutate(card(10, "2026-04-06", "2026-04-08")),
      /Completed task/,
    );
    await db.exec("rollback to change");
    assert.deepEqual(await snapshot(), s);
  });
  await scenario("firm deadline blocks cascade", async () => {
    await mutate(card(11, "2026-03-30", "2026-03-31", "2026-04-01"));
    await link(10, 11);
    await assert.rejects(
      mutate(card(10, "2026-04-02", "2026-04-04")),
      /firm_deadline|Firm deadline/,
    );
  });
  await scenario("fixed milestone rejects late prerequisite", async () => {
    await mutate({
      op: "milestone",
      milestone: {
        id: id(20),
        name: "Demo",
        day: "2026-04-01",
        board_id: id(3),
      },
      tasks: [id(10)],
    });
    await assert.rejects(
      mutate(card(10, "2026-04-01", "2026-04-03")),
      /Fixed milestone/,
    );
  });
  await scenario("cycles rejected", async () => {
    await link(10, 11);
    await assert.rejects(link(11, 10), /cycle/);
  });
  await scenario("duplicate relationships rejected", async () => {
    await link(10, 11);
    await assert.rejects(link(10, 11, "SS"), /unique/);
  });
  await scenario("self links rejected", async () => {
    await assert.rejects(link(10, 10), /check constraint/);
  });
  await scenario("linked tasks cannot clear dates", async () => {
    await link(10, 11);
    await assert.rejects(mutate(card(10, null, null)), /require start and end/);
  });
  await scenario("stale edits rejected after metadata changes", async () => {
    const s = await snapshot();
    await db.query("update board_cards set title=$1 where id=$2", [
      "Changed",
      id(10),
    ]);
    await assert.rejects(
      mutate(card(10, "2026-03-28", "2026-03-30"), s),
      /Refresh and retry/,
    );
  });
  await scenario("REST date writes cannot bypass validation", async () => {
    await assert.rejects(
      db.query("update board_cards set deadline=$1 where id=$2", [
        "2026-04-01",
        id(10),
      ]),
      /scheduling operation/,
    );
  });
  await scenario("deleting task cascades dependency links", async () => {
    await link(10, 11);
    await db.query("delete from board_cards where id=$1", [id(10)]);
    assert.equal((await snapshot()).dependencies.length, 0);
  });
  await scenario("viewer cannot schedule", async () => {
    await db.exec("set test.role='viewer'");
    await assert.rejects(
      mutate(card(10, "2026-03-28", "2026-03-30")),
      /Editor access/,
    );
  });
  await scenario("viewer can save personal views", async () => {
    await db.exec("set test.role='viewer'");
    await db.query("insert into gantt_views(project_id,name) values($1,$2)", [
      id(1),
      "My tasks",
    ]);
    assert.equal((await db.query("select * from gantt_views")).rows.length, 1);
  });
  await scenario("views cannot escape workspace", async () => {
    await assert.rejects(
      db.query("insert into gantt_views(project_id,name) values($1,$2)", [
        id(2),
        "Other",
      ]),
      /row-level security/,
    );
  });
  await scenario('branching cross-board chains use the strongest prerequisite',async()=>{
    await mutate({op:'column',id:id(6),completed:false});
    await link(10,11);await link(10,12,'SS',1);await link(11,12,'FS',2);
    const result=await mutate(card(10,'2026-04-01','2026-04-03'));
    assert.equal(result.moved,3);
    assert.equal(result.snapshot.cards.find(c=>c.id===id(12)).start_date,'2026-04-08');
    assert.equal(result.snapshot.cards.find(c=>c.id===id(12)).deadline,'2026-04-09');
  });
  await scenario('undo refuses intervening edits',async()=>{
    const result=await mutate(card(10,'2026-03-28','2026-03-30'));
    await db.query('update board_cards set title=$1 where id=$2',['A teammate edited this',id(11)]);
    await assert.rejects(mutate({op:'undo',dates:result.before},result.snapshot),/Refresh and retry/);
  });
  await scenario('negative gaps rejected',async()=>{await assert.rejects(link(10,11,'FS',-1),/check constraint/);});
  await scenario('undated dependency rejected',async()=>{await mutate(card(11,null,null));await assert.rejects(link(10,11),/require start and end/);});
  await scenario('milestone cannot move earlier than a prerequisite',async()=>{
    const milestone={id:id(20),name:'Demo',day:'2026-04-01',board_id:null};
    await mutate({op:'milestone',milestone,tasks:[id(10)]});
    await assert.rejects(mutate({op:'milestone',milestone:{...milestone,day:'2026-03-28'},tasks:[id(10)]}),/Fixed milestone/);
  });
  await scenario('moving task outside its milestone board rejected',async()=>{
    await mutate({op:'milestone',milestone:{id:id(20),name:'Demo',day:'2026-04-01',board_id:id(3)},tasks:[id(10)]});
    const action=card(10,'2026-03-27','2026-03-29');action.card.column_id=id(6);
    await assert.rejects(mutate(action),/must belong to its board/);
  });
  await scenario('deleting board removes its milestones and links',async()=>{
    await mutate({op:'milestone',milestone:{id:id(20),name:'Demo',day:'2026-04-01',board_id:id(3)},tasks:[id(10)]});
    await db.query('delete from boards where id=$1',[id(3)]);
    assert.equal((await snapshot()).milestones.length,0);assert.equal((await snapshot()).links.length,0);
  });
  await scenario('viewer cannot mutate metadata through legacy board access',async()=>{
    await db.exec("set test.role='viewer'");
    await assert.rejects(db.query('update board_cards set title=$1 where id=$2',['Changed',id(10)]),/Editor access/);
  });
  await db.close();
});
