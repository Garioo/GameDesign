// Versions rebuilt from the page edit log (lib/pageVersions.ts).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const out = ts.transpileModule(fs.readFileSync(require.resolve("../lib/pageVersions.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", out)(mod, mod.exports);
const { groupVersions, versionStates, showVersion } = mod.exports;

const at = (min) => new Date(Date.UTC(2026, 8, 23, 10, 0) + min * 60000).toISOString();
const row = (id, blockId, author, from, to, before, after, position = 0) => ({
  id, blockId, blockType: "text", authorId: author, createdAt: at(from), updatedAt: at(to),
  beforeContent: before === null ? null : { text: before }, afterContent: after === null ? null : { text: after }, position,
});
const blk = (id, text) => ({ id, type: "text", content: { text } });
const texts = (blocks) => blocks.map((b) => `${b.id}:${b.content.text}`);

// Timeline: 10:00 Alice writes "Intro" (a) and "Old" (b)
//           11:00 Bob edits a → "Intro v2", deletes b, adds c "New"
const rows = [
  row("r1", "a", "alice", 0, 3, null, "Intro"),
  row("r2", "b", "alice", 2, 4, null, "Old", 1),
  row("r3", "a", "bob", 60, 62, "Intro", "Intro v2"),
  row("r4", "b", "bob", 61, 61, "Old", null, 1),
  row("r5", "c", "bob", 63, 70, null, "New", 1),
];
const current = [blk("a", "Intro v2"), blk("c", "New")];

test("rows group into sessions, newest first", () => {
  const v = groupVersions(rows);
  assert.deepEqual(v.map((x) => x.rows.map((r) => r.id)), [["r3", "r4", "r5"], ["r1", "r2"]]);
  assert.deepEqual(v[0].authorIds, ["bob"]);
  assert.equal(v[0].end, at(70));
});

test("each version's page is rebuilt from the current blocks", () => {
  const v = groupVersions(rows);
  const latest = versionStates(current, v, 0);
  assert.deepEqual(texts(latest.after), ["a:Intro v2", "c:New"]);
  assert.deepEqual(texts(latest.before), ["a:Intro", "b:Old"]);
  const first = versionStates(current, v, 1);
  assert.deepEqual(texts(first.after), ["a:Intro", "b:Old"]);
  assert.deepEqual(first.before, []);
});

test("a version shows what it added, changed and deleted, in place", () => {
  const v = groupVersions(rows);
  const { before, after } = versionStates(current, v, 0);
  const shown = showVersion(before, after, v[0].rows);
  assert.deepEqual(shown.map((s) => [s.block.id, s.status, s.authorIds]), [
    ["a", "changed", ["bob"]],
    ["b", "removed", ["bob"]],
    ["c", "added", ["bob"]],
  ]);
  assert.equal(shown[0].was.text, "Intro");
});

test("a deleted block comes back under the block that was above it, even after blocks were added above", () => {
  // Now: [x, y, a, z]; x and y were added later on top. b was deleted from
  // under a while its recorded position was a stale 0.
  const log = [
    { ...row("r1", "b", "alice", 0, 1, "Gone", null, 0), prevBlockId: "a" },
    row("r2", "x", "bob", 30, 31, null, "X", 0),
    row("r3", "y", "bob", 32, 33, null, "Y", 1),
  ];
  const now = [blk("x", "X"), blk("y", "Y"), blk("a", "A"), blk("z", "Z")];
  const v = groupVersions(log, 60000); // [r2, r3], [r1]
  const { before, after } = versionStates(now, v, 1);
  assert.deepEqual(texts(before), ["a:A", "b:Gone", "z:Z"]);
  assert.deepEqual(texts(after), ["a:A", "z:Z"]);
  const shown = showVersion(before, after, v[1].rows);
  assert.deepEqual(shown.map((x) => [x.block.id, x.status]), [["a", "same"], ["b", "removed"], ["z", "same"]]);
});
