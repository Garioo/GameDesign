const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPhaseFixture, id } = require("./fixtures/phase-db.cjs");
test("phase planning lifecycle and atomic scheduling", async (t) => {
  const db = await createPhaseFixture();
  const rawQuery = db.query.bind(db);
  let inScenario = false;
  db.query = async (...args) => {
    if (!inScenario) return rawQuery(...args);
    await db.exec("savepoint statement");
    try {
      const r = await rawQuery(...args);
      await db.exec("release savepoint statement");
      return r;
    } catch (e) {
      await db.exec(
        "rollback to savepoint statement;release savepoint statement",
      );
      throw e;
    }
  };
  const snap = async () =>
    (await db.query("select phase_snapshot($1) s", [id(1)])).rows[0].s;
  const mutate = async (action, expected) =>
    (
      await db.query("select phase_mutate($1,$2,$3) r", [
        id(1),
        expected ?? (await snap()),
        action,
      ])
    ).rows[0].r;
  const dates = (node, start, end) =>
    mutate({ op: "dates", id: node, start, end });
  const link = (a, b, kind = "FS", gap = 0) =>
    mutate({ op: "dependency", predecessor: a, successor: b, kind, gap });
  const child = (await snap()).phases.find((p) => p.category_id).id;
  async function scenario(name, fn) {
    await t.test(name, async () => {
      await db.exec("begin");
      inScenario = true;
      try {
        await fn();
      } finally {
        inScenario = false;
        await db.exec("rollback");
      }
    });
  }
  await scenario("backfill links names and seeds phases once", async () => {
    const s = await snap();
    assert.equal(s.phases.length, 3);
    assert.equal(s.phases[0].effective_start, "2026-09-14");
    assert.equal(s.phases[0].effective_end, "2026-09-18");
    assert.equal(s.phases.find((p) => p.id === child).total, 1);
    assert.equal(
      (
        await db.query("select category_id from board_cards where id=$1", [
          id(10),
        ])
      ).rows[0].category_id,
      id(70),
    );
  });
  await scenario(
    "phase expansion preserves manual baseline and never moves tasks",
    async () => {
      const tasks = (
        await db.query(
          "select id,start_date,deadline from board_cards order by id",
        )
      ).rows;
      await dates(child, "2026-09-10", "2026-09-24");
      let s = await snap();
      assert.equal(s.phases[0].start_date, "2026-09-14");
      assert.equal(s.phases[0].effective_start, "2026-09-10");
      assert.equal(s.phases[0].effective_end, "2026-09-24");
      await dates(child, "2026-09-15", "2026-09-16");
      s = await snap();
      assert.equal(s.phases[0].effective_start, "2026-09-14");
      assert.equal(s.phases[0].effective_end, "2026-09-18");
      assert.deepEqual(
        (
          await db.query(
            "select id,start_date,deadline from board_cards order by id",
          )
        ).rows,
        tasks,
      );
    },
  );
  await scenario(
    "whole phase movement shifts child, blocks clipping and reverses with undo",
    async () => {
      const before = await snap();
      const r = await mutate({ op: "move", id: id(3), days: 4 });
      assert.equal(
        r.snapshot.phases.find((p) => p.id === child).start_date,
        "2026-09-18",
      );
      await assert.rejects(dates(id(3), "2026-09-19", "2026-09-25"), /contain/);
      await mutate({ op: "undo", before: r.before }, r.snapshot);
      assert.deepEqual(await snap(), before);
    },
  );
  for (const kind of ["FS", "SS", "FF"])
    await scenario(
      `${kind} dependency cascades forward and preserves duration`,
      async () => {
        await dates(id(4), "2026-09-01", "2026-09-03");
        const r = await link(id(3), id(4), kind, 2);
        const b = r.snapshot.phases.find((p) => p.id === id(4));
        assert.equal(
          b.start_date,
          kind === "FS"
            ? "2026-09-21"
            : kind === "SS"
              ? "2026-09-16"
              : "2026-09-18",
        );
        assert.equal(
          Date.parse(b.end_date) - Date.parse(b.start_date),
          2 * 86400000,
        );
        const later = b.start_date;
        await mutate({ op: "move", id: id(3), days: -3 });
        assert.equal(
          (await snap()).phases.find((p) => p.id === id(4)).start_date,
          later,
        );
      },
    );
  await scenario(
    "rejects cycles, own children, invalid dates and foreign endpoints atomically",
    async () => {
      await dates(id(4), "2026-10-01", "2026-10-03");
      await link(child, id(4));
      const before = await snap();
      await assert.rejects(link(id(4), id(3)), /cycle/);
      assert.deepEqual(await snap(), before);
      await assert.rejects(link(id(3), child), /own subphase/);
      await assert.rejects(link(child, id(3)), /own subphase/);
      await assert.rejects(link(id(3), id(900)), /workspace/);
      await assert.rejects(
        dates(child, "2026-10-03", "2026-10-01"),
        /End must/,
      );
      await assert.rejects(dates(child, null, null), /scheduled/);
    },
  );
  await scenario(
    "completion counts all cards, including subtasks and uncategorized cards",
    async () => {
      await db.exec(
        `update board_columns set is_completed=true where id='${id(6)}'`,
      );
      let s = await snap();
      assert.equal(s.phases[0].completed, 1);
      assert.equal(s.phases[0].total, 2);
      assert.equal(s.phases.find((p) => p.id === child).completed, 0);
      await db.exec(
        `insert into board_cards(id,project_id,column_id,parent_id,title,kind,position) values('${id(12)}','${id(1)}','${id(5)}','${id(10)}','Sound child','mechanic',1)`,
      );
      s = await snap();
      assert.equal(s.phases[0].total, 3);
      assert.equal(s.phases.find((p) => p.id === child).total, 2);
    },
  );
  await scenario(
    "category rename preserves schedule and stable assignment; new category appears automatically",
    async () => {
      await db.query("update board_categories set name=$1 where id=$2", [
        "Sound",
        id(70),
      ]);
      let s = await snap();
      assert.equal(s.phases.find((p) => p.id === child).title, "Sound");
      assert.equal(s.phases.find((p) => p.id === child).end_date, "2026-09-16");
      assert.equal(
        (await db.query("select kind from board_cards where id=$1", [id(10)]))
          .rows[0].kind,
        "Sound",
      );
      await db.query("update board_cards set kind=$1 where id=$2", [
        "Animation",
        id(11),
      ]);
      s = await snap();
      assert.ok(s.phases.some((p) => p.title === "Animation" && p.active));
    },
  );
  await scenario(
    "empty subphase retains dates, suspends and restores its links",
    async () => {
      await dates(id(4), "2026-10-01", "2026-10-03");
      await link(child, id(4));
      await db.query("update board_cards set category_id=null where id=$1", [
        id(10),
      ]);
      let s = await snap();
      assert.equal(s.phases.find((p) => p.id === child).active, false);
      assert.equal(s.dependencies[0].suspended, true);
      await db.query("update board_cards set category_id=$1 where id=$2", [
        id(70),
        id(10),
      ]);
      s = await snap();
      assert.equal(s.phases.find((p) => p.id === child).active, true);
      assert.equal(s.dependencies[0].suspended, false);
      assert.equal(
        s.phases.find((p) => p.id === child).start_date,
        "2026-09-14",
      );
    },
  );
  await scenario(
    "conflicting returning links remain suspended rather than blocking a task edit",
    async () => {
      await dates(id(4), "2026-10-01", "2026-10-03");
      await link(child, id(4));
      await db.query("update board_cards set category_id=null where id=$1", [
        id(10),
      ]);
      await link(id(4), id(3));
      await db.query("update board_cards set category_id=$1 where id=$2", [
        id(70),
        id(10),
      ]);
      const s = await snap();
      assert.ok(s.dependencies.find((d) => d.predecessor === child).suspended);
      assert.match(
        s.dependencies.find((d) => d.predecessor === child).reason,
        /cycle/,
      );
    },
  );
  await scenario(
    "category deletion removes subphases and links but preserves tasks",
    async () => {
      await dates(id(4), "2026-10-01", "2026-10-03");
      await link(child, id(4));
      await db.query("delete from board_categories where id=$1", [id(70)]);
      const s = await snap();
      assert.equal(s.phases.length, 2);
      assert.equal(s.dependencies.length, 0);
      const c = (
        await db.query("select kind,category_id from board_cards where id=$1", [
          id(10),
        ])
      ).rows[0];
      assert.equal(c.kind, "");
      assert.equal(c.category_id, null);
    },
  );
  await scenario(
    "copy retains subphase dates and internal links, excludes external links",
    async () => {
      await db.query("update board_cards set kind=$1 where id=$2", [
        "Art",
        id(11),
      ]);
      let s = await snap();
      const other = s.phases.find((p) => p.category_name === "Art").id;
      await dates(other, "2026-09-17", "2026-09-18");
      await dates(id(4), "2026-10-01", "2026-10-03");
      await link(child, other);
      await link(other, id(4));
      const copied = (
        await db.query("select copy_board($1,$2) id", [id(1), id(3)])
      ).rows[0].id;
      s = await snap();
      const nodes = s.phases.filter((p) => p.board_id === copied);
      assert.equal(nodes.length, 3);
      assert.equal(nodes.find((p) => !p.category_id).start_date, "2026-09-14");
      assert.equal(
        nodes.find((p) => p.category_id === id(70)).start_date,
        "2026-09-14",
      );
      assert.equal(
        s.dependencies.filter((d) => nodes.some((n) => n.id === d.predecessor))
          .length,
        1,
      );
    },
  );
  await scenario(
    "board deletion cascades phases and links without affecting other boards",
    async () => {
      await dates(id(4), "2026-10-01", "2026-10-03");
      await link(child, id(4));
      await db.query("delete from boards where id=$1", [id(3)]);
      const s = await snap();
      assert.equal(s.phases.length, 1);
      assert.equal(s.phases[0].id, id(4));
      assert.equal(s.dependencies.length, 0);
    },
  );
  await scenario(
    "stable category IDs work through the existing task RPC",
    async () => {
      await db.query(
        "insert into board_categories(id,project_id,name) values($1,$2,$3)",
        [id(71), id(1), "Sound"],
      );
      const tasks = (await db.query("select gantt_snapshot($1) s", [id(1)]))
        .rows[0].s;
      const original = tasks.cards.find((c) => c.id === id(10));
      await db.query("select gantt_mutate($1,$2,$3)", [
        id(1),
        tasks,
        {
          op: "card",
          card: { ...original, category_id: id(71), kind: "old display name" },
        },
      ]);
      const c = (
        await db.query("select category_id,kind from board_cards where id=$1", [
          id(10),
        ])
      ).rows[0];
      assert.equal(c.category_id, id(71));
      assert.equal(c.kind, "Sound");
      assert.ok(
        (await snap()).phases.some((p) => p.category_id === id(71) && p.active),
      );
    },
  );
  await scenario(
    "stale snapshots, viewer writes and foreign reads are rejected",
    async () => {
      const before = await snap();
      await dates(id(4), "2026-10-01", "2026-10-02");
      await assert.rejects(
        mutate({ op: "move", id: id(3), days: 1 }, before),
        /changed/,
      );
      await db.exec("set test.role='viewer'");
      await assert.rejects(
        mutate({ op: "move", id: id(3), days: 1 }),
        /Editor access/,
      );
      assert.ok((await snap()).phases.length);
      await assert.rejects(
        db.query("select phase_snapshot($1)", [id(2)]),
        /access/,
      );
      await assert.rejects(
        db.query("select phase_shift($1,1)", [id(3)]),
        /permission denied/,
      );
      await db.exec("set test.role='editor'");
    },
  );
  await db.close();
});
