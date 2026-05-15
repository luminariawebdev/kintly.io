import React from 'react';
import { supabase } from '../lib/supabase';
import { AnchorTabs, Modal } from '../Components';

const COLOR_MAP = {
  coral: '#FF9F8A', peach: '#FFC18C', amber: '#FFD787', lemon: '#F0E68C',
  moss:  '#C8D685', green: '#98D4A8', teal:  '#7FCDC1', blue:  '#87BDE8',
  periwinkle: '#A8AEE5', plum: '#BFA0E5', lilac: '#DAAEDA', rose: '#F2A4C2',
};
const getColor = c => COLOR_MAP[c] || '#999';
const getInitial = n => (n || '?')[0].toUpperCase();

function KinnektLogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-label="kinnekt logo">
      <defs>
        <linearGradient id="kk-g1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE49B" />
          <stop offset="100%" stopColor="#FFB019" />
        </linearGradient>
        <linearGradient id="kk-g2" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFC03C" />
          <stop offset="100%" stopColor="#FF7A2C" />
        </linearGradient>
        <linearGradient id="kk-g3" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF9A3C" />
          <stop offset="60%" stopColor="#FF7A4A" />
          <stop offset="100%" stopColor="#FF5A55" />
        </linearGradient>
      </defs>
      {/* Dot (head of the i) */}
      <circle cx="22" cy="12" r="6.5" fill="url(#kk-g1)" />
      {/* Vertical pill (body) */}
      <rect x="16" y="22" width="12" height="44" rx="6" fill="url(#kk-g1)" />
      {/* Upper-right diagonal of the K */}
      <rect x="22" y="38" width="32" height="12" rx="6" fill="url(#kk-g2)" transform="rotate(-45 22 44)" />
      {/* Lower-right diagonal of the K */}
      <rect x="22" y="38" width="32" height="12" rx="6" fill="url(#kk-g3)" transform="rotate(45 22 44)" />
    </svg>
  );
}

// Synthesized bubble pop — short downward freq sweep with quick decay.
let __audioCtx = null;
async function ensureAudio() {
  if (!__audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    __audioCtx = new AC();
  }
  if (__audioCtx.state === 'suspended') {
    try { await __audioCtx.resume(); } catch { /* ignore */ }
  }
  return __audioCtx;
}
async function playPop() {
  try {
    const ctx = await ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    // body of the pop — sine sweep down
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, t0);
    osc.frequency.exponentialRampToValueAtTime(180, t0 + 0.09);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.55, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.15);
    // little click on top to make it crisper
    const click = ctx.createOscillator();
    const cg = ctx.createGain();
    click.type = 'triangle';
    click.frequency.setValueAtTime(2400, t0);
    cg.gain.setValueAtTime(0.0001, t0);
    cg.gain.exponentialRampToValueAtTime(0.25, t0 + 0.003);
    cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    click.connect(cg).connect(ctx.destination);
    click.start(t0);
    click.stop(t0 + 0.05);
  } catch { /* audio unavailable */ }
}

// Prime the audio context on the first user interaction so subsequent
// plays don't get suppressed by autoplay policy.
if (typeof window !== 'undefined' && !window.__popPrimed) {
  window.__popPrimed = true;
  const prime = () => {
    ensureAudio();
    window.removeEventListener('pointerdown', prime);
    window.removeEventListener('keydown', prime);
  };
  window.addEventListener('pointerdown', prime, { once: true });
  window.addEventListener('keydown', prime, { once: true });
}

function Dot({ profile, size = '' }) {
  return (
    <span
      className={`dot ${size}`}
      style={{ '--c': getColor(profile?.color), background: getColor(profile?.color) }}
    />
  );
}

function formatDue(dueDate) {
  if (!dueDate) return null;
  const d = new Date(dueDate + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return 'This week';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dueDateOverdue(dueDate) {
  if (!dueDate) return false;
  const d = new Date(dueDate + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}

function buildCalendar(year, month) {
  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push({ d: daysInPrev - first + 1 + i, m: 'prev' });
  for (let i = 1; i <= daysInMonth; i++) cells.push({ d: i, m: 'curr' });
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) cells.push({ d: i, m: 'next' });
  return cells;
}

// ─── Task Row ────────────────────────────────────────────────────────────────
function TaskRow({ task, assignee, onToggle, onDelete }) {
  const color = getColor(assignee?.color);
  const overdue = !task.completed && dueDateOverdue(task.due_date);
  return (
    <div className={'trow' + (task.completed ? ' done' : '')} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--rule)' }}>
      <button
        style={{ width: 22, height: 22, borderRadius: '50%', border: `2.5px solid ${color}`, background: task.completed ? color : 'transparent', cursor: 'pointer', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
        onClick={onToggle}
      >
        {task.completed && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>✓</span>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, textDecoration: task.completed ? 'line-through' : 'none', opacity: task.completed ? 0.45 : 1, wordBreak: 'break-word' }}>{task.title}</div>
        {task.due_date && (
          <div style={{ fontSize: 11, marginTop: 2, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', color: overdue ? '#E27457' : 'var(--ink-mid)' }}>
            {formatDue(task.due_date)}
          </div>
        )}
      </div>
      <button onClick={onDelete} style={{ opacity: 0.25, fontSize: 16, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}>×</button>
    </div>
  );
}

// ─── Tasks Section ────────────────────────────────────────────────────────────
function TasksSection({ tasks, members, myId, getProfile, onToggle, onAdd, onDelete }) {
  const [filter, setFilter] = React.useState('today');
  const [showDone, setShowDone] = React.useState(false);

  const filtered = tasks.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'today') {
      if (!t.due_date) return !t.completed;
      const diff = Math.round((new Date(t.due_date + 'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000);
      return diff <= 0;
    }
    if (filter === 'week') {
      if (!t.due_date) return true;
      const diff = Math.round((new Date(t.due_date + 'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000);
      return diff <= 7;
    }
    return true;
  });

  const openItems = filtered.filter(t => !t.completed);
  const doneItems = filtered.filter(t => t.completed);

  const grouped = members.map(m => ({
    member: m,
    items: openItems.filter(t => t.assigned_to === m.id),
  })).filter(g => g.items.length > 0);

  const unassigned = openItems.filter(t => !t.assigned_to);
  const openCount = tasks.filter(t => !t.completed).length;

  return (
    <section className="fb-sec" id="sec-tasks">
      <div className="fb-sec-hd">
        <div>
          <h2 className="fb-sec-title">Tasks</h2>
        </div>
        <div className="fb-sec-meta">{openCount} open</div>
      </div>

      <div className="fb-chips">
        {[['today', 'Today'], ['week', 'This week'], ['all', 'All']].map(([k, label]) => (
          <button key={k} className={'fb-chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      <button className="fb-btn" onClick={onAdd}>
        <span className="plus">+</span> Add task
      </button>

      {grouped.length === 0 && unassigned.length === 0 && doneItems.length === 0 ? (
        <div className="kbd-hint" style={{ padding: '20px 0' }}>NO TASKS — ADD ONE ABOVE</div>
      ) : (
        <div className="fb-listbox">
          <div className="fb-listbox-legend">To-do</div>
          {grouped.length === 0 && unassigned.length === 0 && doneItems.length > 0 && (
            <div className="kbd-hint" style={{ padding: '14px 0 6px' }}>ALL DONE — NICE WORK</div>
          )}
          {grouped.map(g => (
            <div key={g.member.id}>
              <div className="assignee-hd">
                <div className="left">
                  <Dot profile={g.member} size="lg" />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{g.member.display_name}</span>
                  {g.member.id === myId && <span className="userbadge"><span className="you">you</span></span>}
                </div>
                <span className="count">{g.items.length}</span>
              </div>
              <div className="tasklist">
                {g.items.map(t => (
                  <TaskRow key={t.id} task={t} assignee={g.member} onToggle={() => onToggle(t.id, t.completed)} onDelete={() => onDelete(t.id)} />
                ))}
              </div>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div>
              <div className="assignee-hd">
                <div className="left"><span style={{ fontWeight: 600, fontSize: 14, opacity: 0.5 }}>Unassigned</span></div>
                <span className="count">{unassigned.length}</span>
              </div>
              <div className="tasklist">
                {unassigned.map(t => (
                  <TaskRow key={t.id} task={t} assignee={null} onToggle={() => onToggle(t.id, t.completed)} onDelete={() => onDelete(t.id)} />
                ))}
              </div>
            </div>
          )}

          {doneItems.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <button
                onClick={() => setShowDone(s => !s)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', background: 'none', border: 0, borderTop: '1px solid var(--rule)', cursor: 'pointer', font: 'inherit' }}
              >
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.55 }}>
                  Completed · {doneItems.length}
                </span>
                <span style={{ opacity: 0.5, fontSize: 12 }}>{showDone ? '▴ hide' : '▾ show'}</span>
              </button>
              {showDone && (
                <div className="tasklist">
                  {doneItems.map(t => (
                    <TaskRow key={t.id} task={t} assignee={getProfile(t.assigned_to)} onToggle={() => onToggle(t.id, t.completed)} onDelete={() => onDelete(t.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Calendar Section ─────────────────────────────────────────────────────────
function CalendarSection({ events, members, getProfile, onAdd, onDayClick, onDelete, onShowMonth, onShowEvent }) {
  const now = new Date();
  const [calYear, setCalYear] = React.useState(now.getFullYear());
  const [calMonth, setCalMonth] = React.useState(now.getMonth());

  const cells = buildCalendar(calYear, calMonth);
  const todayD = now.getDate();
  const isCurrentMonth = calYear === now.getFullYear() && calMonth === now.getMonth();

  const monthEvents = events.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  });

  const eventsByDay = {};
  monthEvents.forEach(e => {
    const day = new Date(e.date + 'T00:00:00').getDate();
    eventsByDay[day] = eventsByDay[day] || [];
    eventsByDay[day].push(e);
  });

  const upcoming = events
    .filter(e => new Date(e.date + 'T00:00:00') >= new Date(new Date().setHours(0,0,0,0)))
    .slice(0, 5);

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const goToday = () => { setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); };

  return (
    <section className="fb-sec" id="sec-calendar">
      <div className="fb-sec-hd">
        <div>
          <h2 className="fb-sec-title">Calendar</h2>
        </div>
        <button
          className="copy-btn"
          onClick={() => onShowMonth?.({ monthName: MONTH_NAMES[calMonth], year: calYear, events: monthEvents })}
          title="View all events this month"
        >
          {monthEvents.length} {monthEvents.length === 1 ? 'event' : 'events'}
        </button>
      </div>

      <div className="cal-bar">
        <button className="cal-nav" aria-label="Previous month" onClick={prevMonth}>‹</button>
        <div className="mo">{MONTH_NAMES[calMonth]} {calYear}</div>
        <button className="cal-nav" aria-label="Next month" onClick={nextMonth}>›</button>
      </div>

      <div className="cal-dows">
        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>

      <div className="cal-grid">
        {cells.map((c, i) => {
          const isToday = c.m === 'curr' && isCurrentMonth && c.d === todayD;
          const evs = c.m === 'curr' ? (eventsByDay[c.d] || []) : [];
          let cellYear = calYear, cellMonth = calMonth;
          if (c.m === 'prev') { cellMonth = calMonth - 1; if (cellMonth < 0) { cellMonth = 11; cellYear--; } }
          else if (c.m === 'next') { cellMonth = calMonth + 1; if (cellMonth > 11) { cellMonth = 0; cellYear++; } }
          const cellIso = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;
          return (
            <div
              key={i}
              className={'cal-cell' + (c.m !== 'curr' ? ' dim' : '') + (isToday ? ' today' : '')}
              onClick={() => onDayClick?.(cellIso)}
              role="button"
              tabIndex={0}
            >
              <span className="num">{c.d}</span>
              {evs.slice(0, 2).map(e => {
                const p = getProfile(e.created_by);
                return (
                  <div key={e.id} className="evt-chip" style={{ background: getColor(e.color || p?.color), fontSize: 9, padding: '1px 3px', borderRadius: 3, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: 1, cursor: 'pointer' }} title={e.title}>
                    {e.title}
                  </div>
                );
              })}
              {evs.length > 2 && <span className="more">+{evs.length - 2}</span>}
            </div>
          );
        })}
      </div>

      <div className="evt-legend">
        {members.map(m => (
          <span key={m.id} className="lg-item">
            <Dot profile={m} /> {m.display_name}
          </span>
        ))}
      </div>

      <button className="fb-btn" onClick={onAdd} style={{ marginTop: 12 }}>
        <span className="plus">+</span> Add event
      </button>

      {upcoming.length > 0 && (
        <div className="upcoming-box">
          <div className="upcoming-legend">Upcoming</div>
          <div className="upcoming">
            {upcoming.map(e => {
              const p = getProfile(e.created_by);
              const d = new Date(e.date + 'T00:00:00');
              return (
                <div
                  key={e.id}
                  className="upcoming-row"
                  style={{ borderLeft: `5px solid ${getColor(e.color || p?.color)}`, cursor: 'pointer' }}
                  onClick={() => onShowEvent?.(e)}
                >
                  <div className="when">
                    {MONTH_NAMES[d.getMonth()].slice(0, 3).toUpperCase()}
                    <span className="d">{d.getDate()}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="ti">{e.title}</div>
                    <div className="sub">
                      {e.start_time && <span>{fmtTime(e.start_time)}{e.end_time ? `–${fmtTime(e.end_time)}` : ''}</span>}
                      {e.start_time && <span>·</span>}
                      {p && <><Dot profile={p} /><span>{p.display_name}</span></>}
                    </div>
                  </div>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }}
                    style={{ opacity: 0.25, fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                  >×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Notes Section ────────────────────────────────────────────────────────────
function NotesSection({ notes, getProfile, onAdd, onDelete, onTogglePin, onOpenNote }) {
  const sorted = [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.created_at) - new Date(a.created_at));

  return (
    <section className="fb-sec" id="sec-notes">
      <div className="fb-sec-hd">
        <div>
          <h2 className="fb-sec-title">Bulletin Board</h2>
        </div>
        <div className="fb-sec-meta">{notes.length} notes</div>
      </div>

      <button className="fb-btn" onClick={onAdd}>
        <span className="plus">+</span> Add note
      </button>

      {sorted.length === 0 ? (
        <div className="kbd-hint" style={{ padding: '20px 0' }}>NO NOTES YET — ADD ONE ABOVE</div>
      ) : (
        <div className="fb-listbox">
          <div className="fb-listbox-legend">Posts</div>
          <div className="notes" style={{ margin: 0 }}>
        {sorted.map(n => {
          const author = getProfile(n.created_by);
          const when = new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
          return (
            <div
              key={n.id}
              className={'note-card' + (n.pinned ? ' pinned' : '')}
              style={{ position: 'relative', cursor: 'pointer' }}
              onClick={() => onOpenNote?.(n)}
            >
              <div className="note-meta">
                <Dot profile={author} />
                <span className="nm">{author?.display_name}</span>
                <span className="when">{when}</span>
              </div>
              <div className="note-body">{n.content}</div>
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onTogglePin(n.id, n.pinned); }}
                  style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', opacity: n.pinned ? 0.8 : 0.25 }}
                  title={n.pinned ? 'Unpin' : 'Pin'}
                >📌</button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                  style={{ opacity: 0.25, fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                >×</button>
              </div>
            </div>
          );
        })}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────
function AddTaskModal({ open, onClose, members, myId, onSave }) {
  const [title, setTitle] = React.useState('');
  const [assignee, setAssignee] = React.useState(myId || null);
  const [dueOpt, setDueOpt] = React.useState('today');
  const [dueDate, setDueDate] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const getDueDate = () => {
    const d = new Date();
    if (dueOpt === 'today') return d.toISOString().slice(0, 10);
    if (dueOpt === 'tomorrow') { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
    if (dueOpt === 'week') { d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
    if (dueOpt === 'pick') return dueDate || null;
    return null;
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), assigned_to: assignee, due_date: getDueDate() });
    setTitle(''); setAssignee(myId || null); setDueOpt('today'); setDueDate('');
    setSaving(false);
    onClose();
  };

  const saveAndAnother = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), assigned_to: assignee, due_date: getDueDate() });
    setTitle('');
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={<>Add <em>task</em></>}
      footer={
        <>
          <button className="fb-btn solid" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save task'}</button>
          <button className="fb-link" onClick={saveAndAnother} style={{ alignSelf: 'center' }}>or save &amp; add another</button>
        </>
      }>
      <div className="field">
        <label>Title</label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing?" onKeyDown={e => e.key === 'Enter' && save()} />
      </div>
      <div className="field">
        <label>Assign to</label>
        <div className="assignee-picker">
          {members.map(m => (
            <button key={m.id} className={'pick' + (assignee === m.id ? ' on' : '')} onClick={() => setAssignee(m.id)} style={assignee === m.id ? { '--pick-c': getColor(m.color) } : {}}>
              <Dot profile={m} />
              <span>{m.display_name}</span>
              {m.id === myId && <span className="userbadge"><span className="you">you</span></span>}
            </button>
          ))}
          <button className={'pick unassign' + (assignee === null ? ' on' : '')} onClick={() => setAssignee(null)}>Unassigned</button>
        </div>
      </div>
      <div className="field">
        <label>Due</label>
        <div className="date-row">
          {[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['none', 'No date'], ['pick', 'Pick…']].map(([k, lbl]) => (
            <button key={k} className={'pick' + (dueOpt === k ? ' on' : '')} onClick={() => setDueOpt(k)}>{lbl}</button>
          ))}
        </div>
        {dueOpt === 'pick' && (
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ marginTop: 8, width: '100%' }} />
        )}
      </div>
    </Modal>
  );
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────
function AddEventModal({ open, onClose, members, onSave, initialDate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [date, setDate] = React.useState(initialDate || today);
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [colorOwner, setColorOwner] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  // Each time the modal opens, reset date from initialDate (or today)
  React.useEffect(() => {
    if (open) setDate(initialDate || today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate]);

  const save = async () => {
    if (!title.trim() || !date) return;
    setSaving(true);
    const owner = members.find(m => m.id === colorOwner);
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      date,
      start_time: startTime || null,
      end_time: endTime || null,
      color: owner?.color || 'coral',
    });
    setTitle(''); setDescription(''); setLocation(''); setDate(today); setStartTime(''); setEndTime(''); setColorOwner(null);
    setSaving(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={<>Add <em>event</em></>}
      footer={<button className="fb-btn solid" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save event'}</button>}>
      <div className="field">
        <label>Title</label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Soccer practice" />
      </div>
      <div className="field">
        <label>Description <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value.slice(0, 500))}
          placeholder="Things to bring, notes…"
          rows={3}
          maxLength={500}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', border: '1.5px solid var(--rule, #141414)', borderRadius: 8, background: 'var(--cream, #FFFEF7)', color: 'var(--ink, #141414)', outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', textAlign: 'right', marginTop: 4 }}>
          {description.length} / 500
        </div>
      </div>
      <div className="field">
        <label>Location <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <input
          value={location}
          onChange={e => setLocation(e.target.value.slice(0, 200))}
          placeholder="Address or place name"
          maxLength={200}
        />
      </div>
      <div className="field">
        <label>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Starts</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
        </div>
        <div className="field">
          <label>Ends</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Color from</label>
        <div className="assignee-picker">
          {members.map(m => (
            <button key={m.id} className={'pick' + (colorOwner === m.id ? ' on' : '')} onClick={() => setColorOwner(m.id)}>
              <Dot profile={m} /><span>{m.display_name}</span>
            </button>
          ))}
          <button className={'pick unassign' + (colorOwner === null ? ' on' : '')} onClick={() => setColorOwner(null)}>Default</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Day Details Modal ────────────────────────────────────────────────────────
function fmtTime(t) {
  if (!t) return '';
  const [hh, mm] = t.split(':').map(Number);
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

function EventCard({ event, getProfile, onDelete, onClick }) {
  const p = getProfile(event.created_by);
  const color = getColor(event.color || p?.color);
  const timeStr = event.start_time
    ? `${fmtTime(event.start_time)}${event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}`
    : 'All day';
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 12px', background: 'var(--paper)',
        border: '1.5px solid var(--ink)', borderRadius: 10,
        borderLeft: `6px solid ${color}`,
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{event.title}</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mute)', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>{timeStr}</span>
          {p && (
            <>
              <span>·</span>
              <Dot profile={p} />
              <span>{p.display_name}</span>
            </>
          )}
        </div>
        {event.location && (
          <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span aria-hidden="true">📍</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.location}</span>
          </div>
        )}
        {event.description && (
          <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
            {event.description}
          </div>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(event.id); }}
        style={{ opacity: 0.3, fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
        title="Delete event"
      >×</button>
    </div>
  );
}

// ─── Event Details Modal (single event) ───────────────────────────────────────
function EventDetailsModal({ open, event, getProfile, onClose, onDelete }) {
  if (!open || !event) return null;
  const p = getProfile(event.created_by);
  const color = getColor(event.color || p?.color);
  const [y, m, d] = event.date.split('-').map(Number);
  const jsDate = new Date(y, m - 1, d);
  const longDate = jsDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = event.start_time
    ? `${fmtTime(event.start_time)}${event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}`
    : 'All day';
  const mapsUrl = event.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}` : null;

  return (
    <Modal open={open} onClose={onClose} title="Event">
      <div style={{
        borderLeft: `6px solid ${color}`,
        padding: '4px 0 4px 14px',
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15, marginBottom: 8 }}>{event.title}</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--mute)', letterSpacing: '0.04em' }}>
          {longDate}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--mute)', letterSpacing: '0.04em', marginTop: 2 }}>
          {timeStr}
        </div>
      </div>

      {event.location && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Location</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true">📍</span>
            <span style={{ flex: 1, fontSize: 14 }}>{event.location}</span>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="copy-btn"
              style={{ textDecoration: 'none' }}
            >open in maps ↗</a>
          </div>
        </div>
      )}

      {event.description && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Description</label>
          <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{event.description}</div>
        </div>
      )}

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Created by</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          {p && <Dot profile={p} />}
          <span>{p?.display_name || 'Unknown'}</span>
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { onDelete(event.id); onClose(); }}
          className="copy-btn"
          style={{ color: '#B23030', borderColor: '#B23030', background: 'rgba(178, 48, 48, 0.06)' }}
        >Delete event</button>
      </div>
    </Modal>
  );
}

function DayDetailsModal({ open, date, events, getProfile, onClose, onAddEvent, onDelete, onShowEvent }) {
  if (!open || !date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const jsDate = new Date(y, m - 1, d);
  const dayLabel = jsDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const dayEvents = events
    .filter(e => e.date === date)
    .slice()
    .sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99'));

  return (
    <Modal open={open} onClose={onClose} title={dayLabel}
      footer={
        <button className="fb-btn solid" onClick={onAddEvent}>
          <span className="plus">+</span> Add event on this day
        </button>
      }>
      {dayEvents.length === 0 ? (
        <div style={{ padding: '8px 0 4px', fontSize: 14, color: 'var(--mute)', fontStyle: 'italic' }}>
          No events on this day.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dayEvents.map(e => (
            <EventCard
              key={e.id}
              event={e}
              getProfile={getProfile}
              onDelete={onDelete}
              onClick={onShowEvent ? () => onShowEvent(e) : undefined}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── Month Events Modal ───────────────────────────────────────────────────────
function MonthEventsModal({ open, onClose, monthName, year, events, getProfile, onDelete, onShowEvent }) {
  if (!open) return null;

  // Group events by ISO date and sort dates ascending
  const grouped = {};
  events.forEach(e => { (grouped[e.date] ||= []).push(e); });
  const sortedDates = Object.keys(grouped).sort();

  return (
    <Modal open={open} onClose={onClose} title={`${monthName} ${year}`}>
      {events.length === 0 ? (
        <div style={{ padding: '8px 0 4px', fontSize: 14, color: 'var(--mute)', fontStyle: 'italic' }}>
          No events this month.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {sortedDates.map(date => {
            const [y, m, d] = date.split('-').map(Number);
            const label = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const dayEvents = grouped[date].slice().sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99'));
            return (
              <div key={date}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--mute)', marginBottom: 8 }}>
                  {label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dayEvents.map(e => (
                    <EventCard
                      key={e.id}
                      event={e}
                      getProfile={getProfile}
                      onDelete={onDelete}
                      onClick={onShowEvent ? () => onShowEvent(e) : undefined}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ─── Add Note Modal ───────────────────────────────────────────────────────────
function AddNoteModal({ open, onClose, profile, members, onSave }) {
  const [body, setBody] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [makeTask, setMakeTask] = React.useState(false);
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskAssignee, setTaskAssignee] = React.useState(profile?.id || null);
  const [taskDueOpt, setTaskDueOpt] = React.useState('today');
  const [taskDueDate, setTaskDueDate] = React.useState('');

  // Reset everything each time the modal opens
  React.useEffect(() => {
    if (open) {
      setBody('');
      setMakeTask(false);
      setTaskTitle('');
      setTaskAssignee(profile?.id || null);
      setTaskDueOpt('today');
      setTaskDueDate('');
    }
  }, [open, profile?.id]);

  // Keep task title auto-suggesting from the note's first line if the user hasn't typed their own
  const [titleEdited, setTitleEdited] = React.useState(false);
  React.useEffect(() => {
    if (!titleEdited) {
      const firstLine = body.split('\n')[0].trim().slice(0, 100);
      setTaskTitle(firstLine);
    }
  }, [body, titleEdited]);

  const getDueDate = () => {
    const d = new Date();
    if (taskDueOpt === 'today') return d.toISOString().slice(0, 10);
    if (taskDueOpt === 'tomorrow') { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
    if (taskDueOpt === 'week') { d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
    if (taskDueOpt === 'pick') return taskDueDate || null;
    return null;
  };

  const save = async () => {
    if (!body.trim()) { alert('Please enter a note before posting.'); return; }
    if (makeTask && !taskTitle.trim()) { alert('Task title is empty. Either uncheck "Create task from note?" or enter a title.'); return; }
    setSaving(true);
    const taskPayload = makeTask
      ? { title: taskTitle.trim(), assigned_to: taskAssignee, due_date: getDueDate() }
      : null;
    try {
      await onSave(body.trim(), taskPayload);
    } catch (e) {
      alert('Error: ' + (e?.message || String(e)));
    }
    setSaving(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={<>Pin a <em>note</em></>}
      footer={<button className="fb-btn solid" onClick={save} disabled={saving}>{saving ? 'Posting…' : 'Post note'}</button>}>
      <div className="field">
        <label>Posting as</label>
        <div className="assignee-picker">
          <button className="pick on" style={{ '--pick-c': getColor(profile?.color) }}>
            <Dot profile={profile} />
            <span>{profile?.display_name}</span>
            <span className="userbadge"><span className="you">you</span></span>
          </button>
        </div>
      </div>
      <div className="field">
        <label>Note</label>
        <textarea
          autoFocus
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="What's on your mind?"
          rows={4}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', border: '1.5px solid var(--rule)', borderRadius: 8, background: 'var(--cream)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div className="field" style={{ marginTop: 4 }}>
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', width: '100%',
            background: makeTask ? 'rgba(20, 20, 20, 0.08)' : 'transparent',
            border: '1.5px solid var(--ink)', borderRadius: 8,
            cursor: 'pointer', font: 'inherit', fontSize: 14, fontWeight: 600,
            color: 'var(--ink)', textAlign: 'left',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={makeTask}
            onChange={e => setMakeTask(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#141414', margin: 0, cursor: 'pointer' }}
          />
          Create task from note?
        </label>
      </div>

      {makeTask && (
        <div style={{ background: 'rgba(20, 20, 20, 0.03)', borderRadius: 8, padding: '12px', marginTop: 4 }}>
          <div className="field">
            <label>Task title</label>
            <input
              value={taskTitle}
              onChange={e => { setTaskTitle(e.target.value); setTitleEdited(true); }}
              placeholder="What needs doing?"
            />
          </div>
          <div className="field">
            <label>Assign to</label>
            <div className="assignee-picker">
              {(members || []).map(m => (
                <button key={m.id} className={'pick' + (taskAssignee === m.id ? ' on' : '')} onClick={() => setTaskAssignee(m.id)} style={taskAssignee === m.id ? { '--pick-c': getColor(m.color) } : {}}>
                  <Dot profile={m} />
                  <span>{m.display_name}</span>
                  {m.id === profile?.id && <span className="userbadge"><span className="you">you</span></span>}
                </button>
              ))}
              <button className={'pick unassign' + (taskAssignee === null ? ' on' : '')} onClick={() => setTaskAssignee(null)}>Unassigned</button>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Due</label>
            <div className="date-row">
              {[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['none', 'No date'], ['pick', 'Pick…']].map(([k, lbl]) => (
                <button key={k} className={'pick' + (taskDueOpt === k ? ' on' : '')} onClick={() => setTaskDueOpt(k)}>{lbl}</button>
              ))}
            </div>
            {taskDueOpt === 'pick' && (
              <input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} style={{ marginTop: 8, width: '100%' }} />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Note Details Modal ───────────────────────────────────────────────────────
function NoteDetailsModal({ open, note, tasks, getProfile, onClose, onDelete, onToggleTask }) {
  if (!open || !note) return null;
  const author = getProfile(note.created_by);
  const when = new Date(note.created_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const linked = (tasks || []).filter(t => t.note_id === note.id);

  return (
    <Modal open={open} onClose={onClose} title="Note">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Dot profile={author} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{author?.display_name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontStyle: 'italic', color: 'var(--mute)' }}>{when}</span>
      </div>

      <div style={{
        padding: '12px 14px',
        background: 'var(--paper)',
        border: '1.5px solid var(--ink)', borderRadius: 10,
        fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
        marginBottom: 14,
      }}>
        {note.content}
      </div>

      <div style={{ borderTop: '1px dashed rgba(20, 20, 20, 0.2)', paddingTop: 14 }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--mute)', marginBottom: 8 }}>
          Linked task{linked.length === 1 ? '' : 's'}
        </div>
        {linked.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--mute)', fontStyle: 'italic' }}>
            No task linked to this note.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {linked.map(t => {
              const assn = getProfile(t.assigned_to);
              const dueLabel = formatDue(t.due_date);
              const dueColor = dueDateOverdue(t.due_date) && !t.completed ? '#E27457' : 'var(--mute)';
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px',
                  background: 'var(--paper)',
                  border: '1.5px solid var(--ink)', borderRadius: 10,
                  borderLeft: `6px solid ${getColor(assn?.color)}`,
                }}>
                  <button
                    onClick={() => onToggleTask(t.id, t.completed)}
                    style={{
                      width: 22, height: 22, borderRadius: '50%',
                      border: `2.5px solid ${getColor(assn?.color)}`,
                      background: t.completed ? getColor(assn?.color) : 'transparent',
                      cursor: 'pointer', flexShrink: 0, marginTop: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    {t.completed && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>✓</span>}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, textDecoration: t.completed ? 'line-through' : 'none', opacity: t.completed ? 0.5 : 1, wordBreak: 'break-word' }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em', color: 'var(--mute)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      {assn ? (
                        <><Dot profile={assn} /><span>{assn.display_name}</span></>
                      ) : (
                        <span style={{ opacity: 0.6 }}>Unassigned</span>
                      )}
                      {dueLabel && (
                        <>
                          <span>·</span>
                          <span style={{ color: dueColor }}>{dueLabel}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { onDelete(note.id); onClose(); }}
          className="copy-btn"
          style={{ color: '#B23030', borderColor: '#B23030', background: 'rgba(178, 48, 48, 0.06)' }}
        >Delete note</button>
      </div>
    </Modal>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export function MainApp({ profile, onSettings }) {
  const [tab, setTab] = React.useState('notes');
  const [modal, setModal] = React.useState(null);
  const [eventInitDate, setEventInitDate] = React.useState(null);
  const [dayDetailsDate, setDayDetailsDate] = React.useState(null);
  const [monthModalData, setMonthModalData] = React.useState(null);
  const [detailEventId, setDetailEventId] = React.useState(null);
  const [detailNoteId, setDetailNoteId] = React.useState(null);
  const [groupMenuOpen, setGroupMenuOpen] = React.useState(false);
  const groupMenuRef = React.useRef(null);

  // Close group menu on outside click
  React.useEffect(() => {
    if (!groupMenuOpen) return;
    const onDocClick = (e) => {
      if (!groupMenuRef.current) return;
      if (!groupMenuRef.current.contains(e.target)) setGroupMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [groupMenuOpen]);
  const [members, setMembers] = React.useState([]);
  const [tasks, setTasks] = React.useState([]);
  const [events, setEvents] = React.useState([]);
  const [notes, setNotes] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (!profile?.group_id) return;
    Promise.all([
      supabase.from('profiles').select('*').eq('group_id', profile.group_id),
      supabase.from('tasks').select('*').eq('group_id', profile.group_id).order('created_at', { ascending: false }),
      supabase.from('events').select('*').eq('group_id', profile.group_id).order('date', { ascending: true }),
      supabase.from('notes').select('*').eq('group_id', profile.group_id).order('created_at', { ascending: false }),
    ]).then(([m, t, e, n]) => {
      setMembers(m.data || []);
      setTasks(t.data || []);
      setEvents(e.data || []);
      setNotes(n.data || []);
      setLoading(false);
    });
  }, [profile?.group_id]);

  const getProfile = id => members.find(m => m.id === id);

  // Task CRUD
  const toggleTask = async (id, completed) => {
    if (!completed) playPop(); // play only when checking ON
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !completed } : t));
    await supabase.from('tasks').update({ completed: !completed }).eq('id', id);
  };
  const addTask = async (data) => {
    const { data: row } = await supabase.from('tasks').insert({ group_id: profile.group_id, created_by: profile.id, ...data }).select().single();
    if (row) setTasks(prev => [row, ...prev]);
  };
  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  };

  // Event CRUD
  const addEvent = async (data) => {
    const { data: row } = await supabase.from('events').insert({ group_id: profile.group_id, created_by: profile.id, ...data }).select().single();
    if (row) setEvents(prev => [...prev, row].sort((a, b) => a.date.localeCompare(b.date)));
  };
  const deleteEvent = async (id) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    await supabase.from('events').delete().eq('id', id);
  };

  // Note CRUD
  const addNote = async (content, taskPayload) => {
    const { data: noteRow, error: nErr } = await supabase
      .from('notes')
      .insert({ group_id: profile.group_id, created_by: profile.id, content })
      .select()
      .single();
    if (nErr || !noteRow) {
      alert('Could not save note: ' + (nErr?.message || 'unknown error'));
      return;
    }
    setNotes(prev => [noteRow, ...prev]);

    if (!taskPayload || !taskPayload.title) return;

    const basePayload = {
      group_id: profile.group_id,
      created_by: profile.id,
      assigned_to: taskPayload.assigned_to,
      due_date: taskPayload.due_date,
      title: taskPayload.title,
    };

    // Try with note_id first; fall back to a plain insert if the
    // note_id column doesn't exist or any other note_id-related issue.
    let { data: taskRow, error: tErr } = await supabase
      .from('tasks')
      .insert({ ...basePayload, note_id: noteRow.id })
      .select()
      .single();

    if (tErr) {
      ({ data: taskRow, error: tErr } = await supabase
        .from('tasks')
        .insert(basePayload)
        .select()
        .single());
    }

    if (tErr || !taskRow) {
      alert('Note saved but task could not be created: ' + (tErr?.message || 'no row returned'));
      return;
    }
    setTasks(prev => [taskRow, ...prev]);
  };
  const deleteNote = async (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    await supabase.from('notes').delete().eq('id', id);
  };
  const togglePin = async (id, pinned) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !pinned } : n));
    await supabase.from('notes').update({ pinned: !pinned }).eq('id', id);
  };

  // Scroll sync
  const suppressScrollSync = React.useRef(0);
  const scrollToSec = (id, smooth = true) => {
    const wrap = scrollRef.current;
    if (!wrap) return;
    const el = wrap.querySelector('#sec-' + id);
    if (!el) return;
    const headH = wrap.querySelector('.fb-stickyhead')?.getBoundingClientRect().height || 0;
    const top = wrap.scrollTop + (el.getBoundingClientRect().top - wrap.getBoundingClientRect().top) - headH + 1;
    // Suppress scroll-driven setTab while the smooth scroll is animating
    suppressScrollSync.current = Date.now() + 700;
    wrap.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  };

  React.useEffect(() => {
    if (loading) return;
    const wrap = scrollRef.current;
    if (!wrap) return;
    let raf;
    const compute = () => {
      if (Date.now() < suppressScrollSync.current) return;
      const ids = ['notes', 'tasks', 'calendar'];
      const headH = wrap.querySelector('.fb-stickyhead')?.getBoundingClientRect().height || 0;
      let cur = ids[0];
      for (const id of ids) {
        const el = wrap.querySelector('#sec-' + id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - wrap.getBoundingClientRect().top - headH - 30 <= 0) cur = id;
      }
      setTab(cur);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    wrap.addEventListener('scroll', onScroll, { passive: true });
    compute(); // run once on mount to set the initial active tab
    return () => {
      cancelAnimationFrame(raf);
      wrap.removeEventListener('scroll', onScroll);
    };
  }, [loading]);

  if (loading) {
    return (
      <div className="fb-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: 0.4, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Loading…</div>
      </div>
    );
  }

  const groupName = profile?.group?.name || 'My Family';

  return (
    <div className="fb-screen">
      <div className="fb-scroll" ref={scrollRef}>
        <div className="fb-stickyhead">
          <div className="fb-stickyhead-row">
            <div className="fb-brand">
              <KinnektLogo size={36} />
              <div className="fb-slogan">Connect. Coordinate. Together.</div>
            </div>
            <div className="fb-grp-wrap" ref={groupMenuRef}>
              <button className="fb-grp-pill" onClick={() => setGroupMenuOpen(o => !o)} aria-expanded={groupMenuOpen}>
                <Dot profile={profile} />
                <span className="nm">{groupName}</span>
                <span className="car">▾</span>
              </button>
              {groupMenuOpen && (
                <div className="fb-grp-menu" role="menu">
                  <div className="fb-grp-menu-hd">Your groups</div>
                  <div className="fb-grp-menu-item current">
                    <Dot profile={profile} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{groupName}</span>
                    <span style={{ fontSize: 11, opacity: 0.55 }}>current</span>
                  </div>
                  <div className="fb-grp-menu-empty">No other groups available</div>
                </div>
              )}
            </div>
            <button
              className="fb-prof"
              style={{ background: getColor(profile?.color) }}
              onClick={onSettings}
              title="Settings"
            >
              {getInitial(profile?.display_name)}
            </button>
          </div>
          <AnchorTabs active={tab} onChange={id => { setTab(id); scrollToSec(id); }} />
        </div>

        <div className="fb-sec-wrap">
          <NotesSection notes={notes} getProfile={getProfile} onAdd={() => setModal('note')} onDelete={deleteNote} onTogglePin={togglePin} onOpenNote={(n) => setDetailNoteId(n.id)} />
          <TasksSection tasks={tasks} members={members} myId={profile?.id} getProfile={getProfile} onToggle={toggleTask} onAdd={() => setModal('task')} onDelete={deleteTask} />
          <CalendarSection
            events={events}
            members={members}
            getProfile={getProfile}
            onAdd={() => { setEventInitDate(null); setModal('event'); }}
            onDayClick={(iso) => setDayDetailsDate(iso)}
            onDelete={deleteEvent}
            onShowMonth={(payload) => setMonthModalData(payload)}
            onShowEvent={(ev) => setDetailEventId(ev.id)}
          />
        </div>
      </div>

      <AddTaskModal open={modal === 'task'} onClose={() => setModal(null)} members={members} myId={profile?.id} onSave={addTask} />
      <AddEventModal open={modal === 'event'} onClose={() => setModal(null)} members={members} onSave={addEvent} initialDate={eventInitDate} />
      <AddNoteModal open={modal === 'note'} onClose={() => setModal(null)} profile={profile} members={members} onSave={addNote} />
      <DayDetailsModal
        open={!!dayDetailsDate}
        date={dayDetailsDate}
        events={events}
        getProfile={getProfile}
        onClose={() => setDayDetailsDate(null)}
        onAddEvent={() => { setEventInitDate(dayDetailsDate); setDayDetailsDate(null); setModal('event'); }}
        onDelete={(id) => deleteEvent(id)}
        onShowEvent={(e) => setDetailEventId(e.id)}
      />
      <MonthEventsModal
        open={!!monthModalData}
        onClose={() => setMonthModalData(null)}
        monthName={monthModalData?.monthName}
        year={monthModalData?.year}
        events={monthModalData?.events || []}
        getProfile={getProfile}
        onDelete={(id) => { deleteEvent(id); setMonthModalData(d => d ? { ...d, events: d.events.filter(e => e.id !== id) } : d); }}
        onShowEvent={(e) => setDetailEventId(e.id)}
      />
      <EventDetailsModal
        open={!!detailEventId}
        event={events.find(e => e.id === detailEventId) || null}
        getProfile={getProfile}
        onClose={() => setDetailEventId(null)}
        onDelete={(id) => deleteEvent(id)}
      />
      <NoteDetailsModal
        open={!!detailNoteId}
        note={notes.find(n => n.id === detailNoteId) || null}
        tasks={tasks}
        getProfile={getProfile}
        onClose={() => setDetailNoteId(null)}
        onDelete={(id) => deleteNote(id)}
        onToggleTask={toggleTask}
      />
    </div>
  );
}
