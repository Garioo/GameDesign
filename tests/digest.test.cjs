// Weekly digest built from page edits and activity (lib/digest.ts).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const out = ts.transpileModule(fs.readFileSync(require.resolve("../lib/digest.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", out)(mod, mod.exports);
const { buildDigest, weekRange, weekStart, dateParam, wordCount } = mod.exports;

// Local-time helpers: the digest works in the viewer's timezone.
const local = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const range = weekRange("2026-09-23"); // a Wednesday → week of Mon 21 Sep

const edit = (pageId, authorId, kind, before, after, at, title = `Page ${pageId}`) => ({
  pageId, pageTitle: title, pageTrashed: false, authorId, kind, beforeText: before, afterText: after, updatedAt: at,
});
const act = (action, actorId, at, extra = {}) => ({
  action, actorId, pageId: null, cardId: null, cardTitle: null, pageTitle: null, target: null, meta: {}, createdAt: at, ...extra,
});

test("weeks start on Monday in local time", () => {
  assert.equal(dateParam(range.start), "2026-09-21");
  assert.equal(dateParam(range.end), "2026-09-28");
  assert.equal(dateParam(weekStart(new Date(2026, 8, 27))), "2026-09-21"); // Sunday belongs to the week before it
  assert.equal(dateParam(weekStart(new Date(2026, 8, 28))), "2026-09-28");
  assert.equal(dateParam(weekRange("nonsense", new Date(2026, 8, 23)).start), "2026-09-21");
});

test("counts words", () => {
  assert.equal(wordCount("  one two\nthree "), 3);
  assert.equal(wordCount(""), 0);
});

test("summarises pages, people and word counts inside the week only", () => {
  const d = buildDigest(
    [
      edit("p1", "alice", "added", "", "a new paragraph here", local(2026, 9, 21)),
      edit("p1", "bob", "edited", "one two three", "one two", local(2026, 9, 22)),
      edit("p1", "alice", "edited", "x", "x y z", local(2026, 9, 23)),
      edit("p2", "bob", "removed", "gone now", "", local(2026, 9, 24)),
      edit("p3", "alice", "edited", "", "last week", local(2026, 9, 20)), // Sunday before: excluded
    ],
    [],
    range,
  );
  assert.equal(d.totals.pagesEdited, 2);
  assert.equal(d.totals.editors, 2);
  assert.equal(d.totals.edits, 4);
  assert.equal(d.totals.wordsAdded, 4 + 2);
  assert.equal(d.totals.wordsRemoved, 1 + 2);
  assert.deepEqual(d.pages.map((p) => p.pageId), ["p1", "p2"]);
  assert.deepEqual(d.pages[0].authorIds, ["alice", "bob"]);
  assert.equal(d.pages[0].blocksAdded, 1);
  assert.equal(d.pages[1].blocksRemoved, 1);
  const alice = d.people.find((p) => p.id === "alice");
  assert.equal(alice.edits, 2);
  assert.equal(alice.wordsAdded, 6);
  assert.deepEqual(alice.pages, [{ pageId: "p1", title: "Page p1", edits: 2 }]);
  assert.equal(d.perDay[0], 1); // Monday
  assert.equal(d.perDay[6], 0); // Sunday
});

test("collapses a task's moves into first stage → last stage and drops round trips", () => {
  const d = buildDigest(
    [],
    [
      act("card.moved", "bob", local(2026, 9, 22, 9), { cardId: "c1", cardTitle: "Jump", meta: { from: "Todo", to: "Doing" } }),
      act("card.moved", "alice", local(2026, 9, 24, 9), { cardId: "c1", cardTitle: "Jump", meta: { from: "Doing", to: "Done", done: true } }),
      act("card.moved", "bob", local(2026, 9, 23, 9), { cardId: "c2", target: "Old name", meta: { from: "Todo", to: "Doing" } }),
      act("card.moved", "bob", local(2026, 9, 23, 10), { cardId: "c2", meta: { from: "Doing", to: "Todo" } }),
      act("card.created", "alice", local(2026, 9, 21), { cardId: "c3", cardTitle: "New task" }),
      act("page.created", "bob", local(2026, 9, 21), { pageId: "p9", pageTitle: "Lore" }),
      act("comment.added", "alice", local(2026, 9, 25)),
    ],
    range,
  );
  assert.equal(d.moves.length, 1);
  assert.deepEqual(
    { from: d.moves[0].from, to: d.moves[0].to, done: d.moves[0].done, actorId: d.moves[0].actorId, moves: d.moves[0].moves },
    { from: "Todo", to: "Done", done: true, actorId: "alice", moves: 2 },
  );
  assert.equal(d.totals.tasksDone, 1);
  assert.equal(d.totals.tasksCreated, 1);
  assert.equal(d.totals.pagesCreated, 1);
  assert.equal(d.totals.comments, 1);
  assert.equal(d.newPages[0].title, "Lore");
  const alice = d.people.find((p) => p.id === "alice");
  assert.equal(alice.tasksDone, 1);
  assert.equal(alice.comments, 1);
  assert.equal(d.people[0].id, "bob"); // three moves and a new page outweigh one finished task
});
