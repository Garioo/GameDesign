const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createPhaseFixture, id } = require("./fixtures/phase-db.cjs");

// Fixture: board 3 (Gameplay) has stages 5 (Explore) and 6 (Playable); board 4 (Art) has stage 7.
// Card 10 "Prototype" sits in 5, card 11 "Test build" in 6.
async function makeDb() {
  const db = await createPhaseFixture();
  await db.exec(`reset role;${fs.readFileSync("supabase/migrate-move-card.sql", "utf8")}set role authenticated;`);
  return db;
}
const cardsIn = async (db, column) =>
  (await db.query("select id from board_cards where column_id = $1 order by position, id", [column])).rows.map((r) => r.id);

test("moves a task and writes the destination order in one call", async () => {
  const db = await makeDb();
  try {
    await db.query("select move_board_card($1,$2,$3)", [id(10), id(6), [id(10), id(11)]]);
    assert.deepEqual(await cardsIn(db, id(6)), [id(10), id(11)]);
    assert.deepEqual(await cardsIn(db, id(5)), []);
    // Reorder within the stage.
    await db.query("select move_board_card($1,$2,$3)", [id(10), id(6), [id(11), id(10)]]);
    assert.deepEqual(await cardsIn(db, id(6)), [id(11), id(10)]);
  } finally {
    await db.close();
  }
});

test("keeps legacy task dates untouched", async () => {
  const db = await makeDb();
  try {
    const before = (await db.query("select start_date, deadline from board_cards where id = $1", [id(10)])).rows[0];
    await db.query("select move_board_card($1,$2,$3)", [id(10), id(6), [id(10)]]);
    const after = (await db.query("select start_date, deadline from board_cards where id = $1", [id(10)])).rows[0];
    assert.deepEqual(after, before);
  } finally {
    await db.close();
  }
});

test("rejects moves to another board's stage and viewers", async () => {
  const db = await makeDb();
  try {
    await assert.rejects(db.query("select move_board_card($1,$2,$3)", [id(10), id(7), [id(10)]]), /own board/);
    await db.exec("set test.role = 'viewer'");
    await assert.rejects(db.query("select move_board_card($1,$2,$3)", [id(10), id(6), [id(10)]]), /Editor access/);
    assert.deepEqual(await cardsIn(db, id(5)), [id(10)]);
  } finally {
    await db.close();
  }
});

test("ignores ids that are not in the destination stage", async () => {
  const db = await makeDb();
  try {
    await db.query("select move_board_card($1,$2,$3)", [id(10), id(6), [id(99), id(10), id(11)]]);
    assert.deepEqual(await cardsIn(db, id(6)), [id(10), id(11)]);
  } finally {
    await db.close();
  }
});
