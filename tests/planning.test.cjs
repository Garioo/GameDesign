// Planning helpers: blocked tasks, milestone progress, countdowns (lib/planning.ts).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const out = ts.transpileModule(fs.readFileSync(require.resolve("../lib/planning.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", out)(mod, mod.exports);
const { openBlockers, blockedIds, milestoneProgress, daysUntil, countdown, urgency, sortMilestones } = mod.exports;

const tasks = new Map(
  [
    { id: "a", title: "Research", done: true, milestoneId: "m1" },
    { id: "b", title: "Draft", done: false, milestoneId: "m1" },
    { id: "c", title: "Review", done: false, milestoneId: "m1" },
    { id: "d", title: "Print", done: false, milestoneId: null },
  ].map((t) => [t.id, t]),
);
const deps = [
  { id: "1", blocker: "a", blocked: "b" }, // done blocker: b is free
  { id: "2", blocker: "b", blocked: "c" }, // c waits on b
  { id: "3", blocker: "c", blocked: "d" },
];

test("only unfinished blockers block", () => {
  assert.deepEqual(openBlockers("b", deps, tasks), []);
  assert.deepEqual(openBlockers("c", deps, tasks).map((t) => t.id), ["b"]);
  assert.deepEqual([...blockedIds(deps, tasks)].sort(), ["c", "d"]);
});

test("milestone progress counts done, open and blocked tasks", () => {
  const p = milestoneProgress("m1", [...tasks.values()], blockedIds(deps, tasks));
  assert.equal(p.total, 3);
  assert.equal(p.done, 1);
  assert.equal(p.blocked, 1);
  assert.deepEqual(p.open.map((t) => t.id), ["b", "c"]);
});

test("countdowns read naturally", () => {
  assert.equal(daysUntil("2026-10-01", "2026-09-23"), 8);
  assert.equal(countdown("2026-09-23", "2026-09-23"), "Today");
  assert.equal(countdown("2026-09-24", "2026-09-23"), "Tomorrow");
  assert.equal(countdown("2026-09-28", "2026-09-23"), "In 5 days");
  assert.equal(countdown("2026-10-21", "2026-09-23"), "4 weeks left");
  assert.equal(countdown("2026-09-20", "2026-09-23"), "3 days ago");
  assert.equal(urgency({ dueDate: "2026-09-20", completedAt: null }, "2026-09-23"), "overdue");
  assert.equal(urgency({ dueDate: "2026-09-29", completedAt: null }, "2026-09-23"), "soon");
  assert.equal(urgency({ dueDate: "2026-09-20", completedAt: "x" }, "2026-09-23"), "done");
});

test("open milestones come first by date, undated after, reached last", () => {
  const list = [
    { name: "Reached", dueDate: "2026-01-01", completedAt: "x", position: 0 },
    { name: "Someday", dueDate: null, completedAt: null, position: 0 },
    { name: "Late", dueDate: "2026-12-01", completedAt: null, position: 0 },
    { name: "Soon", dueDate: "2026-10-01", completedAt: null, position: 0 },
  ];
  assert.deepEqual(sortMilestones(list).map((m) => m.name), ["Soon", "Late", "Someday", "Reached"]);
});
