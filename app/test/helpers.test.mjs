// Plain-node unit tests for src/lib/helpers.js — no framework, no fixtures.
// Run: npm test (from app/), or: node test/helpers.test.mjs
import assert from 'node:assert/strict';
import { toLocalISO, addOneMonth, computeNextDue, writeStrippingMissing } from '../src/lib/helpers.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; }
  catch (e) { console.error(`✗ ${name}\n  ${e.message}`); process.exitCode = 1; }
};

// ── toLocalISO ───────────────────────────────────────────────────────────────
test('toLocalISO formats local y-m-d with zero padding', () => {
  assert.equal(toLocalISO(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(toLocalISO(new Date(2026, 11, 31)), '2026-12-31');
});
test('toLocalISO uses LOCAL date, not UTC (the evening-rollover bug)', () => {
  // 11pm local on Jan 5 must stay Jan 5 regardless of timezone.
  assert.equal(toLocalISO(new Date(2026, 0, 5, 23, 0, 0)), '2026-01-05');
});

// ── addOneMonth ──────────────────────────────────────────────────────────────
test('addOneMonth clamps to short months (Aug 31 → Sep 30)', () => {
  assert.equal(toLocalISO(addOneMonth(new Date(2026, 7, 31))), '2026-09-30');
});
test('addOneMonth Jan 31 → Feb 28 (non-leap)', () => {
  assert.equal(toLocalISO(addOneMonth(new Date(2026, 0, 31))), '2026-02-28');
});
test('addOneMonth Jan 31 → Feb 29 (leap year)', () => {
  assert.equal(toLocalISO(addOneMonth(new Date(2028, 0, 31))), '2028-02-29');
});
test('addOneMonth crosses year end (Dec 15 → Jan 15)', () => {
  assert.equal(toLocalISO(addOneMonth(new Date(2026, 11, 15))), '2027-01-15');
});

// ── computeNextDue ───────────────────────────────────────────────────────────
test('non-recurring task → null', () => {
  assert.equal(computeNextDue({ due_date: '2026-07-03', recurrence: null }), null);
  assert.equal(computeNextDue({ due_date: '2026-07-03', recurrence: { freq: 'none' } }), null);
  assert.equal(computeNextDue(null), null);
});
test('daily advances one day', () => {
  assert.equal(
    computeNextDue({ due_date: '2026-07-03', recurrence: { freq: 'daily' } }),
    '2026-07-04');
});
test('daily crosses month end', () => {
  assert.equal(
    computeNextDue({ due_date: '2026-07-31', recurrence: { freq: 'daily' } }),
    '2026-08-01');
});
test('monthly anchors day-of-month', () => {
  assert.equal(
    computeNextDue({ due_date: '2026-07-15', recurrence: { freq: 'monthly' } }),
    '2026-08-15');
});
test('monthly on the 31st SKIPS short months (Jan 31 → Mar 31, no drift)', () => {
  assert.equal(
    computeNextDue({ due_date: '2026-01-31', recurrence: { freq: 'monthly' } }),
    '2026-03-31');
});
test('monthly crosses year end', () => {
  assert.equal(
    computeNextDue({ due_date: '2026-12-10', recurrence: { freq: 'monthly' } }),
    '2027-01-10');
});
test('weekly picks the next listed weekday', () => {
  // 2026-07-03 is a Friday (5). Days [1,5] (Mon+Fri) → next is Monday 07-06.
  assert.equal(
    computeNextDue({ due_date: '2026-07-03', recurrence: { freq: 'weekly', days: [1, 5] } }),
    '2026-07-06');
});
test('weekly wraps to next week when today is the last listed day', () => {
  // Friday with only [5] → next Friday, 7 days out.
  assert.equal(
    computeNextDue({ due_date: '2026-07-03', recurrence: { freq: 'weekly', days: [5] } }),
    '2026-07-10');
});
test('weekly with empty days → null', () => {
  assert.equal(
    computeNextDue({ due_date: '2026-07-03', recurrence: { freq: 'weekly', days: [] } }),
    null);
});

// ── writeStrippingMissing ────────────────────────────────────────────────────
const col = (name) => ({ message: `column "${name}" does not exist` });

test('success first try: no drops, data through', async () => {
  const r = await writeStrippingMissing(async () => ({ data: [{ id: 1 }], error: null }), { a: 1 }, ['b']);
  assert.equal(r.error, null);
  assert.deepEqual(r.data, [{ id: 1 }]);
  assert.deepEqual(r.droppedCols, []);
});
test('drops one missing optional column and retries', async () => {
  const calls = [];
  const r = await writeStrippingMissing(async (p) => {
    calls.push({ ...p });
    return calls.length === 1 ? { data: null, error: col('due_time') } : { data: [{ id: 2 }], error: null };
  }, { title: 'x', due_time: '09:00' }, ['due_time']);
  assert.equal(r.error, null);
  assert.deepEqual(r.droppedCols, ['due_time']);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].due_time, undefined);
  assert.equal(calls[1].title, 'x');
});
test('drops two columns across two retries', async () => {
  let n = 0;
  const r = await writeStrippingMissing(async () => {
    n++;
    if (n === 1) return { data: null, error: col('recurrence') };
    if (n === 2) return { data: null, error: col('space_id') };
    return { data: [{ id: 3 }], error: null };
  }, { title: 'x', recurrence: {}, space_id: 'z' }, ['recurrence', 'space_id']);
  assert.equal(r.error, null);
  assert.deepEqual(r.droppedCols, ['recurrence', 'space_id']);
});
test('non-column error (RLS/network) stops immediately and surfaces', async () => {
  let n = 0;
  const r = await writeStrippingMissing(async () => {
    n++;
    return { data: null, error: { message: 'permission denied for table tasks' } };
  }, { title: 'x', due_time: '09:00' }, ['due_time']);
  assert.equal(n, 1);
  assert.match(r.error.message, /permission denied/);
  assert.deepEqual(r.droppedCols, []);
});
test('missing column NOT in payload does not loop', async () => {
  let n = 0;
  const r = await writeStrippingMissing(async () => {
    n++;
    return { data: null, error: col('due_time') };
  }, { title: 'x' }, ['due_time']); // due_time not in payload → nothing to strip
  assert.equal(n, 1);
  assert.ok(r.error);
});

// Async tests queue microtasks — report on exit.
process.on('beforeExit', () => {
  if (process.exitCode) console.error(`\n${passed} passed, with FAILURES above.`);
  else console.log(`✓ all ${passed} tests passed`);
});
