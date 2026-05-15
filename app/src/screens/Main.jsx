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

function KinnektLogo({ size = 54 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-label="Kinnekt">
      <defs>
        <linearGradient id="kk-dot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A6CFF" />
          <stop offset="100%" stopColor="#5683FF" />
        </linearGradient>
        <linearGradient id="kk-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A6CFF" />
          <stop offset="100%" stopColor="#6FA9FF" />
        </linearGradient>
        <linearGradient id="kk-u" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#5683FF" />
          <stop offset="100%" stopColor="#85C0FF" />
        </linearGradient>
        <linearGradient id="kk-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3DD9C5" />
          <stop offset="45%" stopColor="#FFA88A" />
          <stop offset="100%" stopColor="#FF7878" />
        </linearGradient>
      </defs>
      {/* Dot — the head of the i */}
      <circle cx="22" cy="12" r="6.8" fill="url(#kk-dot)" />
      {/* Vertical pill — body of the i, left stroke of the K */}
      <rect x="16" y="22" width="12" height="44" rx="6" fill="url(#kk-v)" />
      {/* Upper-right diagonal — blue gradient */}
      <rect x="22" y="38" width="32" height="12" rx="6" fill="url(#kk-u)" transform="rotate(-45 22 44)" />
      {/* Lower-right diagonal — cyan → coral */}
      <rect x="22" y="38" width="32" height="12" rx="6" fill="url(#kk-d)" transform="rotate(45 22 44)" />
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
function TaskRow({ task, assignee, myId, onToggle, onDelete, onClick }) {
  const color = getColor(assignee?.color);
  const overdue = !task.completed && dueDateOverdue(task.due_date);
  // Only the assignee can check off or delete a task.
  // Unassigned tasks can be acted on by anyone in the group.
  const canActOnTask = !task.assigned_to || task.assigned_to === myId;
  return (
    <div
      className={'trow' + (task.completed ? ' done' : '')}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--rule)', cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <button
        disabled={!canActOnTask}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          border: `2.5px solid ${color}`,
          background: task.completed ? color : 'transparent',
          cursor: canActOnTask ? 'pointer' : 'not-allowed',
          opacity: canActOnTask ? 1 : 0.45,
          flexShrink: 0, marginTop: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
        onClick={(e) => { e.stopPropagation(); if (canActOnTask) onToggle(); }}
        title={canActOnTask ? '' : 'Only the assignee can complete this task'}
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
      {canActOnTask && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ opacity: 0.25, fontSize: 16, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
          title="Delete task"
        >×</button>
      )}
    </div>
  );
}

// ─── Tasks Section ────────────────────────────────────────────────────────────
function TasksSection({ tasks, members, myId, getProfile, onToggle, onAdd, onDelete, onShowTask }) {
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
                  <TaskRow key={t.id} task={t} assignee={g.member} myId={myId} onToggle={() => onToggle(t.id, t.completed)} onDelete={() => onDelete(t.id)} onClick={onShowTask ? () => onShowTask(t) : undefined} />
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
                  <TaskRow key={t.id} task={t} assignee={null} myId={myId} onToggle={() => onToggle(t.id, t.completed)} onDelete={() => onDelete(t.id)} onClick={onShowTask ? () => onShowTask(t) : undefined} />
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
                    <TaskRow key={t.id} task={t} assignee={getProfile(t.assigned_to)} myId={myId} onToggle={() => onToggle(t.id, t.completed)} onDelete={() => onDelete(t.id)} onClick={onShowTask ? () => onShowTask(t) : undefined} />
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
function AddEventModal({ open, onClose, members, myId, onSave, initialDate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [date, setDate] = React.useState(initialDate || today);
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [attendees, setAttendees] = React.useState([]);
  const [saving, setSaving] = React.useState(false);

  // Each time the modal opens, reset state
  React.useEffect(() => {
    if (open) {
      setDate(initialDate || today);
      setAttendees([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialDate]);

  const toggleAttendee = (id) => {
    setAttendees(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const save = async () => {
    if (!title.trim() || !date) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      date,
      start_time: startTime || null,
      end_time: endTime || null,
      attendees,
    });
    setTitle(''); setDescription(''); setLocation(''); setDate(today); setStartTime(''); setEndTime(''); setAttendees([]);
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
        <label>Attendees <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <div className="assignee-picker">
          {members.map(m => (
            <button
              key={m.id}
              className={'pick' + (attendees.includes(m.id) ? ' on' : '')}
              onClick={() => toggleAttendee(m.id)}
              style={attendees.includes(m.id) ? { '--pick-c': getColor(m.color) } : {}}
            >
              <Dot profile={m} />
              <span>{m.display_name}</span>
              {m.id === myId && <span className="userbadge"><span className="you">you</span></span>}
            </button>
          ))}
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

      <div className="field" style={{ marginBottom: 14 }}>
        <label>Created by</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          {p && <Dot profile={p} />}
          <span>{p?.display_name || 'Unknown'}</span>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Attendees</label>
        {Array.isArray(event.attendees) && event.attendees.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {event.attendees.map(uid => {
              const ap = getProfile(uid);
              return (
                <span
                  key={uid}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px',
                    background: 'var(--surface-glass)',
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '999px',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  <Dot profile={ap} />
                  <span>{ap?.display_name || 'Unknown'}</span>
                </span>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--mute)', fontStyle: 'italic' }}>
            No attendees added.
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => { onDelete(event.id); onClose(); }}
          className="danger-btn"
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
// ─── Task Details Modal ───────────────────────────────────────────────────────
function TaskDetailsModal({ open, task, notes, myId, getProfile, onClose, onToggle, onDelete, onOpenNote }) {
  if (!open || !task) return null;
  const assignee = getProfile(task.assigned_to);
  const creator = getProfile(task.created_by);
  const color = getColor(assignee?.color);
  const overdue = !task.completed && dueDateOverdue(task.due_date);
  const canActOnTask = !task.assigned_to || task.assigned_to === myId;
  const dueLabel = task.due_date ? formatDue(task.due_date) : null;
  const dueLongLabel = task.due_date
    ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const createdAt = task.created_at
    ? new Date(task.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  const linkedNote = task.note_id ? (notes || []).find(n => n.id === task.note_id) : null;

  return (
    <Modal open={open} onClose={onClose} title="Task">
      <div style={{
        borderLeft: `6px solid ${color}`,
        padding: '4px 0 4px 14px',
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <button
            disabled={!canActOnTask}
            onClick={() => { if (canActOnTask) onToggle(task.id, task.completed); }}
            title={canActOnTask ? '' : 'Only the assignee can complete this task'}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              border: `3px solid ${color}`,
              background: task.completed ? color : 'transparent',
              cursor: canActOnTask ? 'pointer' : 'not-allowed',
              opacity: canActOnTask ? 1 : 0.45,
              flexShrink: 0, marginTop: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
          >
            {task.completed && <span style={{ color: '#fff', fontSize: 14, fontWeight: 800, lineHeight: 1 }}>✓</span>}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 22, fontWeight: 700, lineHeight: 1.2,
              textDecoration: task.completed ? 'line-through' : 'none',
              opacity: task.completed ? 0.55 : 1,
              wordBreak: 'break-word',
            }}>{task.title}</div>
            {task.completed && (
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--mute)', marginTop: 6 }}>
                Completed
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label>Assigned to</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          {assignee ? (
            <>
              <Dot profile={assignee} />
              <span style={{ fontWeight: 600 }}>{assignee.display_name}</span>
            </>
          ) : (
            <span style={{ opacity: 0.55, fontStyle: 'italic' }}>Unassigned</span>
          )}
        </div>
      </div>

      {dueLabel && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Due</label>
          <div style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: overdue ? '#E27457' : 'var(--mute)',
              fontWeight: 600,
            }}>{dueLabel}</span>
            {dueLongLabel && <span style={{ color: 'var(--mute)' }}>· {dueLongLabel}</span>}
          </div>
        </div>
      )}

      {linkedNote && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>From note</label>
          <div
            onClick={() => onOpenNote?.(linkedNote)}
            style={{
              padding: '10px 12px',
              background: 'rgba(20, 20, 20, 0.04)',
              border: '1px solid rgba(20, 20, 20, 0.15)',
              borderRadius: 8,
              fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap',
              maxHeight: 110, overflow: 'auto',
              cursor: onOpenNote ? 'pointer' : 'default',
            }}
          >
            {linkedNote.content}
          </div>
        </div>
      )}

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Created by</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          {creator && <Dot profile={creator} />}
          <span>{creator?.display_name || 'Unknown'}</span>
          {createdAt && <span style={{ marginLeft: 'auto', fontSize: 11, fontStyle: 'italic', color: 'var(--mute)' }}>{createdAt}</span>}
        </div>
      </div>

      {(!task.assigned_to || task.assigned_to === myId) && (
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => { onDelete(task.id); onClose(); }}
            className="danger-btn"
          >Delete task</button>
        </div>
      )}
    </Modal>
  );
}

function NoteDetailsModal({ open, note, tasks, myId, getProfile, onClose, onDelete, onToggleTask }) {
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
              const taskActionable = !t.assigned_to || t.assigned_to === myId;
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px',
                  background: 'var(--paper)',
                  border: '1.5px solid var(--ink)', borderRadius: 10,
                  borderLeft: `6px solid ${getColor(assn?.color)}`,
                }}>
                  <button
                    disabled={!taskActionable}
                    onClick={() => { if (taskActionable) onToggleTask(t.id, t.completed); }}
                    title={taskActionable ? '' : 'Only the assignee can complete this task'}
                    style={{
                      width: 22, height: 22, borderRadius: '50%',
                      border: `2.5px solid ${getColor(assn?.color)}`,
                      background: t.completed ? getColor(assn?.color) : 'transparent',
                      cursor: taskActionable ? 'pointer' : 'not-allowed',
                      opacity: taskActionable ? 1 : 0.45,
                      flexShrink: 0, marginTop: 1,
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
          className="danger-btn"
        >Delete note</button>
      </div>
    </Modal>
  );
}

// ─── Notifications Menu ──────────────────────────────────────────────────────
function NotificationsMenu({ notifications, onMarkOne, onMarkAll }) {
  const unread = notifications.filter(n => !n.read).length;

  const formatRelative = (iso) => {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 172800) return 'yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderItem = (n) => {
    const p = n.payload || {};
    if (n.type === 'task_assigned') {
      return (
        <>
          <span className="fb-bell-icon-circle" style={{ background: getColor(p.by_color) }}>✓</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fb-bell-text">
              <strong>{p.by_name || 'Someone'}</strong> assigned a task to you
            </div>
            <div className="fb-bell-sub">{p.task_title}{p.due_date ? ` · due ${formatDue(p.due_date)}` : ''}</div>
          </div>
        </>
      );
    }
    if (n.type === 'event_invited') {
      const d = p.event_date ? new Date(p.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      return (
        <>
          <span className="fb-bell-icon-circle" style={{ background: getColor(p.by_color) }}>★</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fb-bell-text">
              <strong>{p.by_name || 'Someone'}</strong> added you to an event
            </div>
            <div className="fb-bell-sub">{p.event_title}{d ? ` · ${d}` : ''}{p.start_time ? ` ${fmtTime(p.start_time)}` : ''}</div>
          </div>
        </>
      );
    }
    return (
      <div style={{ flex: 1 }}>
        <div className="fb-bell-text">{p.text || 'Notification'}</div>
      </div>
    );
  };

  return (
    <div className="fb-bell-menu" role="menu">
      <div className="fb-bell-hd">
        <span>Notifications</span>
        {unread > 0 && (
          <button className="fb-link" onClick={onMarkAll} style={{ fontSize: 11 }}>Mark all read</button>
        )}
      </div>
      <div className="fb-bell-list">
        {notifications.length === 0 ? (
          <div className="fb-bell-empty">No notifications yet</div>
        ) : (
          notifications.slice(0, 20).map(n => (
            <div
              key={n.id}
              className={'fb-bell-item' + (n.read ? '' : ' unread')}
              onClick={() => !n.read && onMarkOne(n.id)}
            >
              {renderItem(n)}
              <span className="fb-bell-when">{formatRelative(n.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
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
  const [detailTaskId, setDetailTaskId] = React.useState(null);
  const [members, setMembers] = React.useState([]);
  const [tasks, setTasks] = React.useState([]);
  const [events, setEvents] = React.useState([]);
  const [notes, setNotes] = React.useState([]);
  const [notifications, setNotifications] = React.useState([]);
  const [bellOpen, setBellOpen] = React.useState(false);
  const bellMenuRef = React.useRef(null);
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

    // Load notifications (silently no-op if table missing)
    supabase.from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { if (data) setNotifications(data); });

    // Realtime subscription to new notifications for this user
    const channel = supabase
      .channel('kinnekt-notifications-' + profile.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, ({ new: row }) => {
        setNotifications(prev => [row, ...prev.filter(n => n.id !== row.id)]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.group_id, profile?.id]);

  // Close bell menu on outside click
  React.useEffect(() => {
    if (!bellOpen) return;
    const onDocClick = (e) => {
      if (!bellMenuRef.current) return;
      if (!bellMenuRef.current.contains(e.target)) setBellOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [bellOpen]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read).map(n => n.id);
    if (unread.length === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).in('id', unread);
  };
  const markOneRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  };

  const getProfile = id => members.find(m => m.id === id);

  // Task CRUD
  const toggleTask = async (id, completed) => {
    if (!completed) playPop(); // play only when checking ON
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !completed } : t));
    await supabase.from('tasks').update({ completed: !completed }).eq('id', id);
  };
  const notify = async (targetIds, type, payload) => {
    if (!targetIds || targetIds.length === 0) return;
    const rows = targetIds.map(uid => ({
      user_id: uid,
      group_id: profile.group_id,
      type,
      payload,
    }));
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) {
      // Most likely the notifications table or RLS policies are missing.
      // Don't crash the calling save — but flag it once for the user.
      if (!window.__kinnektNotifWarned) {
        window.__kinnektNotifWarned = true;
        console.warn('Notification insert failed (run the notifications SQL migration):', error.message);
      }
    }
  };

  const addTask = async (data) => {
    const { data: row } = await supabase.from('tasks').insert({ group_id: profile.group_id, created_by: profile.id, ...data }).select().single();
    if (row) {
      setTasks(prev => [row, ...prev]);
      if (row.assigned_to && row.assigned_to !== profile.id) {
        notify([row.assigned_to], 'task_assigned', {
          task_id: row.id,
          task_title: row.title,
          due_date: row.due_date,
          by_name: profile.display_name,
          by_color: profile.color,
        });
      }
    }
  };
  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  };

  // Event CRUD
  const addEvent = async (data) => {
    const { attendees = [], ...rest } = data;
    let payload = {
      group_id: profile.group_id,
      created_by: profile.id,
      color: profile.color || 'coral',
      ...rest,
      attendees,
    };

    // Optional columns that may not exist in older schemas — strip them on error.
    const optionalCols = ['description', 'location', 'attendees'];
    const droppedCols = [];

    let row = null;
    let error = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      ({ data: row, error } = await supabase.from('events').insert(payload).select().single());
      if (!error) break;
      // Parse missing-column name from PostgREST error and strip it.
      const msg = error.message || '';
      let stripped = null;
      for (const col of optionalCols) {
        if (payload[col] !== undefined && msg.toLowerCase().includes(col)) {
          const { [col]: _, ...next } = payload;
          payload = next;
          stripped = col;
          droppedCols.push(col);
          break;
        }
      }
      if (!stripped) break;
    }

    if (error || !row) {
      alert('Could not save event: ' + (error?.message || 'no row returned'));
      return;
    }

    // Warn loudly if attendees couldn't be saved — almost always means the
    // SQL migration hasn't been run on the Supabase database.
    if (droppedCols.includes('attendees') && attendees.length > 0) {
      alert(
        'Event saved, but attendees could NOT be stored.\n\n' +
        'The "attendees" column is missing from your events table.\n' +
        'Run this in your Supabase SQL Editor:\n\n' +
        'alter table public.events add column if not exists attendees uuid[] default \'{}\';'
      );
    }

    setEvents(prev => [...prev, row].sort((a, b) => a.date.localeCompare(b.date)));
    const attendeeIds = attendees.filter(id => id !== profile.id);
    if (attendeeIds.length > 0) {
      notify(attendeeIds, 'event_invited', {
        event_id: row.id,
        event_title: row.title,
        event_date: row.date,
        start_time: row.start_time,
        by_name: profile.display_name,
        by_color: profile.color,
      });
    }
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

  return (
    <div className="fb-screen">
      <div className="fb-scroll" ref={scrollRef}>
        <div className="fb-stickyhead">
          <div className="fb-stickyhead-head">
            <div className="fb-brand-block">
              <KinnektLogo size={54} />
              <span className="fb-brand-text">Kinnekt</span>
            </div>
            <div className="fb-stickyhead-right">
              <div className="fb-head-top">
                <div className="fb-bell-wrap" ref={bellMenuRef}>
                  <button
                    className={'fb-bell' + (unreadCount > 0 ? ' has-unread' : '')}
                    onClick={() => setBellOpen(o => !o)}
                    title="Notifications"
                    aria-label="Notifications"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    {unreadCount > 0 && <span className="fb-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                  </button>
                  {bellOpen && (
                    <NotificationsMenu
                      notifications={notifications}
                      onClose={() => setBellOpen(false)}
                      onMarkOne={markOneRead}
                      onMarkAll={markAllRead}
                    />
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
            </div>
          </div>
          <AnchorTabs active={tab} onChange={id => { setTab(id); scrollToSec(id); }} />
        </div>

        <div className="fb-sec-wrap">
          <NotesSection notes={notes} getProfile={getProfile} onAdd={() => setModal('note')} onDelete={deleteNote} onTogglePin={togglePin} onOpenNote={(n) => setDetailNoteId(n.id)} />
          <TasksSection tasks={tasks} members={members} myId={profile?.id} getProfile={getProfile} onToggle={toggleTask} onAdd={() => setModal('task')} onDelete={deleteTask} onShowTask={(t) => setDetailTaskId(t.id)} />
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
      <AddEventModal open={modal === 'event'} onClose={() => setModal(null)} members={members} myId={profile?.id} onSave={addEvent} initialDate={eventInitDate} />
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
        myId={profile?.id}
        getProfile={getProfile}
        onClose={() => setDetailNoteId(null)}
        onDelete={(id) => deleteNote(id)}
        onToggleTask={toggleTask}
      />
      <TaskDetailsModal
        open={!!detailTaskId}
        task={tasks.find(t => t.id === detailTaskId) || null}
        notes={notes}
        myId={profile?.id}
        getProfile={getProfile}
        onClose={() => setDetailTaskId(null)}
        onToggle={toggleTask}
        onDelete={deleteTask}
        onOpenNote={(n) => { setDetailTaskId(null); setDetailNoteId(n.id); }}
      />
    </div>
  );
}
