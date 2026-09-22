const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/gantt.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const compiled = { exports: {} };
new Function('module', 'exports', source)(compiled, compiled.exports);
const { dayNumber, dayKey, barRange, weekday, isoWeek } = compiled.exports;
const first = dayNumber('2026-09-08');

test('calendar arithmetic is stable across DST and leap days', () => {
  assert.equal(dayNumber('2026-03-30') - dayNumber('2026-03-28'), 2);
  assert.equal(dayKey(dayNumber('2028-02-29') + 1), '2028-03-01');
});
test('bars clip at either edge of the visible range', () => {
  assert.deepEqual(barRange('2026-09-06', '2026-09-10', first, 10), { left: 0, width: 30 });
  assert.deepEqual(barRange('2026-09-17', '2026-09-25', first, 10), { left: 90, width: 10 });
});
test('a deadline without a start date is a one-day marker', () => {
  assert.deepEqual(barRange(null, '2026-09-08', first, 10), { left: 0, width: 10 });
});
test('unscheduled, inverted and off-screen intervals have no bar', () => {
  assert.equal(barRange(null, null, first, 10), null);
  assert.equal(barRange('2026-09-10', '2026-09-09', first, 10), null);
  assert.equal(barRange('2026-10-01', '2026-10-02', first, 10), null);
});

test('weekdays and ISO week numbers, including year boundaries', () => {
  assert.equal(weekday(dayNumber('2026-09-21')), 0); // Monday
  assert.equal(weekday(dayNumber('2026-09-27')), 6); // Sunday
  assert.equal(weekday(dayNumber('1969-12-29')), 0); // before the epoch
  assert.equal(isoWeek(dayNumber('2026-09-23')), 39);
  assert.equal(isoWeek(dayNumber('2026-01-01')), 1); // Thursday → week 1
  assert.equal(isoWeek(dayNumber('2027-01-01')), 53); // Friday → last week of 2026
  assert.equal(isoWeek(dayNumber('2027-01-04')), 1);
  assert.equal(isoWeek(dayNumber('2024-12-30')), 1); // Monday of 2025's week 1
});
