// Pure helpers extracted from Main.jsx so they can be unit-tested with plain
// node (test/helpers.test.mjs) — no React, no Supabase, no DOM.

// Local-timezone ISO date helpers. `new Date().toISOString()` is UTC —
// for US users any evening use made "Today" resolve to tomorrow's date
// (due dates, default event dates, the date-picker highlight). These
// format y-m-d from the *local* clock instead.
export const toLocalISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export const localTodayISO = () => toLocalISO(new Date());

// Add one calendar month, clamping the day to the target month's length so
// e.g. Aug 31 → Sep 30 (not the overflow Oct 1 that a bare setMonth gives).
export const addOneMonth = (d) => {
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
};

// Given a recurring task ({ due_date, recurrence: { freq, days } }), the next
// scheduled occurrence after its current due_date — or null if the task
// isn't recurring. Same recurrence shape used by events. Computed in local
// time so a US-evening "next Wednesday" doesn't slip a day.
export function computeNextDue(task) {
  const r = task && task.recurrence;
  if (!r || !r.freq || r.freq === 'none') return null;
  const base = task.due_date ? new Date(task.due_date + 'T12:00:00') : new Date();
  let d = null;
  if (r.freq === 'daily') {
    d = new Date(base); d.setDate(d.getDate() + 1);
  } else if (r.freq === 'monthly') {
    // Anchor on the original day-of-month and SKIP months that don't have it
    // (e.g. the 31st), matching the calendar's monthly expansion. A naive
    // setMonth(+1) overflows Jan 31 → Mar 3 and — because each respawn feeds
    // its own output back as the next due date — the "31st" drifts permanently.
    const anchorDay = base.getDate();
    let y = base.getFullYear();
    let m = base.getMonth(); // 0-based
    for (let i = 0; i < 12; i++) {
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      const cand = new Date(y, m, anchorDay);
      if (cand.getMonth() === m) { d = cand; break; } // month actually has that day
    }
  } else if ((r.freq === 'weekly' || r.freq === 'custom') && Array.isArray(r.days) && r.days.length > 0) {
    const sorted = [...r.days].sort((a, b) => a - b);
    const cur = base.getDay(); // 0-6 (Sun-Sat)
    const nextDay = sorted.find(x => x > cur) ?? sorted[0];
    const diff = nextDay > cur ? nextDay - cur : 7 - cur + nextDay;
    d = new Date(base); d.setDate(d.getDate() + diff);
  }
  if (!d) return null;
  return toLocalISO(d);
}

// Run a Supabase write, and if the DB rejects a column an older schema is
// missing ("column X does not exist"), strip that column and retry. runQuery is
// caller-supplied so this covers both insert(...).select().single() and
// update(...).eq(...). Returns { data, error, droppedCols } — callers keep their
// own per-column "that field didn't save" warnings by reading droppedCols.
export async function writeStrippingMissing(runQuery, payload, optionalCols) {
  const droppedCols = [];
  let data = null, error = null;
  for (let i = 0; i <= optionalCols.length; i++) {
    ({ data = null, error } = await runQuery(payload));
    if (!error) break;
    const msg = (error.message || '').toLowerCase();
    const col = optionalCols.find(c => payload[c] !== undefined && msg.includes(c));
    if (!col) break; // a non-column error (RLS/network) — stop and surface it
    const { [col]: _drop, ...rest } = payload;
    payload = rest;
    droppedCols.push(col);
  }
  return { data, error, droppedCols };
}
