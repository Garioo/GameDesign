const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// lib/boardRepo.ts pulls in supabase and sibling repos at module scope; stub those out so the
// pure date-math helpers (automaticBoardEndDate/boardEndDate) can be exercised without a DB.
const compiled = { exports: {} };
const out = ts.transpileModule(fs.readFileSync('lib/boardRepo.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const stubbedRequire = (id) => {
  if (id === './supabase') return { supabase: {} };
  if (id === './gantt') return { localToday: () => '2026-01-01' };
  if (id === './ganttRepo') return {};
  if (id === './validate') return { cleanText: (t) => t, LIMITS: { name: 200, title: 200, summary: 2000 } };
  return require(id);
};
new Function('exports', 'require', out)(compiled.exports, stubbedRequire);
const { automaticBoardEndDate, boardEndDate } = compiled.exports;

const card = (deadline) => ({ id: 'c', title: '', sub: '', kind: '', tags: [], priority: null, ownerIds: [], deadline });
const col = (...cards) => ({ id: 'col', name: '', color: '#000', cards });

test('automatic end date is the latest task deadline on the board', () => {
  const board = { cols: [col(card('2026-09-14'), card('2026-09-22')), col(card('2026-09-18'))] };
  assert.equal(automaticBoardEndDate(board), '2026-09-22');
});

test('automatic end date ignores tasks with no deadline and is null with none set', () => {
  assert.equal(automaticBoardEndDate({ cols: [col(card(null))] }), null);
  assert.equal(automaticBoardEndDate({ cols: [] }), null);
});

test('a manual override wins over the automatic date; clearing it falls back to automatic', () => {
  const board = { endDateOverride: '2026-12-01', cols: [col(card('2026-09-22'))] };
  assert.equal(boardEndDate(board), '2026-12-01');
  assert.equal(boardEndDate({ ...board, endDateOverride: null }), '2026-09-22');
});
