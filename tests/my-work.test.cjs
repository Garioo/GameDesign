const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const compiled = { exports: {} };
new Function(
  "exports",
  ts.transpileModule(fs.readFileSync("lib/myWork.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
)(compiled.exports);
const { myTasks, groupByPriority } = compiled.exports;

const card = (id, owners, priority = null, parentId = null) => ({ id, title: id, sub: "", kind: "", tags: [], priority, ownerIds: owners, parentId });
const boards = [
  {
    id: "b1", name: "Gameplay", color: "#000", endDateOverride: null,
    cols: [
      { id: "todo", name: "To do", color: "#111", cards: [card("a", ["me"], "low"), card("b", ["you"], "high"), card("sub1", ["you"], null, "a")] },
      { id: "done", name: "Done", color: "#222", isCompleted: true, cards: [card("c", ["me", "you"], "high"), card("sub2", [], null, "a")] },
    ],
  },
  {
    id: "b2", name: "Art", color: "#333", endDateOverride: null,
    cols: [{ id: "sketch", name: "Sketch", color: "#444", cards: [card("d", ["me"], "high"), card("e", ["me"])] }],
  },
];

test("only tasks assigned to the user, in board/stage/position order", () => {
  const mine = myTasks(boards, "me");
  assert.deepEqual(mine.map((t) => t.card.id), ["a", "c", "d", "e"]);
  assert.equal(mine.find((t) => t.card.id === "c").done, true);
  assert.equal(mine.find((t) => t.card.id === "d").columnName, "Sketch");
});

test("subtask progress counts direct subtasks in done stages", () => {
  const a = myTasks(boards, "me").find((t) => t.card.id === "a");
  assert.deepEqual(a.subtasks, { done: 1, total: 2 });
  assert.equal(myTasks(boards, "me").find((t) => t.card.id === "d").subtasks, undefined);
});

test("groups by priority High → Medium → Low → none, skipping empty groups", () => {
  const open = myTasks(boards, "me").filter((t) => !t.done);
  const groups = groupByPriority(open);
  assert.deepEqual(groups.map((g) => g.key), ["high", "low", "none"]);
  assert.deepEqual(groups.map((g) => g.tasks.map((t) => t.card.id)), [["d"], ["a"], ["e"]]);
});
