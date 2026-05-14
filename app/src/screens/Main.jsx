import React from 'react';
import { supabase } from '../lib/supabase';
import { AnchorTabs, Modal } from '../Components';
import { ShaderButton } from '../ShaderButton';

const COLOR_MAP = {
  coral: '#E27457', blue: '#4A78B5', green: '#5C9B6F', amber: '#B8862E',
  plum: '#8861A8',  teal: '#3E8E8A', rose: '#C6577E',  moss:  '#5C7A37',
};
const getColor = c => COLOR_MAP[c] || '#999';
const getInitial = n => (n || '?')[0].toUpperCase();

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

      <ShaderButton onClick={onAdd} label="Add task" />

      <div style={{ marginTop: 10 }}>
        {grouped.length === 0 && unassigned.length === 0 && doneItems.length === 0 && (
          <div className="kbd-hint" style={{ padding: '20px 0' }}>NO TASKS — ADD ONE ABOVE</div>
        )}
        {grouped.length === 0 && unassigned.length === 0 && doneItems.length > 0 && (
          <div className="kbd-hint" style={{ padding: '20px 0' }}>ALL DONE — NICE WORK</div>
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
    </section>
  );
}

// ─── Calendar Section ─────────────────────────────────────────────────────────
function CalendarSection({ events, members, getProfile, onAdd, onDelete }) {
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
        <div className="fb-sec-meta">{events.length} events</div>
      </div>

      <div className="cal-bar">
        <div className="mo">{MONTH_NAMES[calMonth]} <em style={{ fontWeight: 700, opacity: 0.6 }}>{calYear}</em></div>
        <div className="nav">
          <button aria-label="prev" onClick={prevMonth}>‹</button>
          <button aria-label="today" onClick={goToday}>●</button>
          <button aria-label="next" onClick={nextMonth}>›</button>
        </div>
      </div>

      <div className="cal-dows">
        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>

      <div className="cal-grid">
        {cells.map((c, i) => {
          const isToday = c.m === 'curr' && isCurrentMonth && c.d === todayD;
          const evs = c.m === 'curr' ? (eventsByDay[c.d] || []) : [];
          return (
            <div key={i} className={'cal-cell' + (c.m !== 'curr' ? ' dim' : '') + (isToday ? ' today' : '')}>
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

      <div style={{ marginTop: 12 }}>
        <ShaderButton onClick={onAdd} label="Add event" />
      </div>

      {upcoming.length > 0 && (
        <>
          <div className="divider-label">Upcoming</div>
          <div className="upcoming">
            {upcoming.map(e => {
              const p = getProfile(e.created_by);
              const d = new Date(e.date + 'T00:00:00');
              return (
                <div key={e.id} className="upcoming-row" style={{ borderLeft: `5px solid ${getColor(e.color || p?.color)}` }}>
                  <div className="when">
                    {MONTH_NAMES[d.getMonth()].slice(0, 3).toUpperCase()}
                    <span className="d">{d.getDate()}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="ti">{e.title}</div>
                    <div className="sub">
                      {e.start_time && <span>{e.start_time}{e.end_time ? `–${e.end_time}` : ''}</span>}
                      {e.start_time && <span>·</span>}
                      {p && <><Dot profile={p} /><span>{p.display_name}</span></>}
                    </div>
                  </div>
                  <button onClick={() => onDelete(e.id)} style={{ opacity: 0.25, fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>×</button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Notes Section ────────────────────────────────────────────────────────────
function NotesSection({ notes, getProfile, onAdd, onDelete, onTogglePin }) {
  const sorted = [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.created_at) - new Date(a.created_at));

  return (
    <section className="fb-sec" id="sec-notes">
      <div className="fb-sec-hd">
        <div>
          <h2 className="fb-sec-title">Bulletin Board</h2>
        </div>
        <div className="fb-sec-meta">{notes.length} notes</div>
      </div>

      <div className="note-quick" onClick={onAdd}>
        <span className="plus">+</span>
        <span>Add a note for the family…</span>
      </div>

      <div className="notes">
        {sorted.length === 0 && (
          <div className="kbd-hint" style={{ padding: '20px 0' }}>NO NOTES YET — ADD ONE ABOVE</div>
        )}
        {sorted.map(n => {
          const author = getProfile(n.created_by);
          const when = new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          return (
            <div key={n.id} className={'note-card' + (n.pinned ? ' pinned' : '')} style={{ position: 'relative' }}>
              <div className="note-meta">
                <Dot profile={author} />
                <span className="nm">{author?.display_name}</span>
                <span className="when">{when}</span>
              </div>
              <div className="note-body">{n.content}</div>
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                <button
                  onClick={() => onTogglePin(n.id, n.pinned)}
                  style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', opacity: n.pinned ? 0.8 : 0.25 }}
                  title={n.pinned ? 'Unpin' : 'Pin'}
                >📌</button>
                <button onClick={() => onDelete(n.id)} style={{ opacity: 0.25, fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>×</button>
              </div>
            </div>
          );
        })}
      </div>
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
function AddEventModal({ open, onClose, members, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = React.useState('');
  const [date, setDate] = React.useState(today);
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [colorOwner, setColorOwner] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (!title.trim() || !date) return;
    setSaving(true);
    const owner = members.find(m => m.id === colorOwner);
    await onSave({ title: title.trim(), date, start_time: startTime || null, end_time: endTime || null, color: owner?.color || 'coral' });
    setTitle(''); setDate(today); setStartTime(''); setEndTime(''); setColorOwner(null);
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

// ─── Add Note Modal ───────────────────────────────────────────────────────────
function AddNoteModal({ open, onClose, profile, onSave }) {
  const [body, setBody] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    if (!body.trim()) return;
    setSaving(true);
    await onSave(body.trim());
    setBody('');
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
    </Modal>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export function MainApp({ profile, onSettings }) {
  const [tab, setTab] = React.useState('notes');
  const [modal, setModal] = React.useState(null);
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
  const addNote = async (content) => {
    const { data: row } = await supabase.from('notes').insert({ group_id: profile.group_id, created_by: profile.id, content }).select().single();
    if (row) setNotes(prev => [row, ...prev]);
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
  const scrollToSec = (id, smooth = true) => {
    const wrap = scrollRef.current;
    if (!wrap) return;
    const el = wrap.querySelector('#sec-' + id);
    if (!el) return;
    const headH = wrap.querySelector('.fb-stickyhead')?.getBoundingClientRect().height || 0;
    const top = wrap.scrollTop + (el.getBoundingClientRect().top - wrap.getBoundingClientRect().top) - headH + 1;
    wrap.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  };

  React.useEffect(() => {
    const wrap = scrollRef.current;
    if (!wrap) return;
    let raf;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const ids = ['notes', 'tasks', 'calendar'];
        const headH = wrap.querySelector('.fb-stickyhead')?.getBoundingClientRect().height || 0;
        let cur = ids[0];
        for (const id of ids) {
          const el = wrap.querySelector('#sec-' + id);
          if (!el) continue;
          if (el.getBoundingClientRect().top - wrap.getBoundingClientRect().top - headH - 30 <= 0) cur = id;
        }
        setTab(cur);
      });
    };
    wrap.addEventListener('scroll', onScroll);
    return () => wrap.removeEventListener('scroll', onScroll);
  }, []);

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
            <div className="fb-wordmark">Family<span>board</span></div>
            <button className="fb-grp-pill">
              <Dot profile={profile} />
              <span className="nm">{groupName}</span>
              <span className="car">▾</span>
            </button>
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
          <NotesSection notes={notes} getProfile={getProfile} onAdd={() => setModal('note')} onDelete={deleteNote} onTogglePin={togglePin} />
          <TasksSection tasks={tasks} members={members} myId={profile?.id} getProfile={getProfile} onToggle={toggleTask} onAdd={() => setModal('task')} onDelete={deleteTask} />
          <CalendarSection events={events} members={members} getProfile={getProfile} onAdd={() => setModal('event')} onDelete={deleteEvent} />
        </div>
      </div>

      <AddTaskModal open={modal === 'task'} onClose={() => setModal(null)} members={members} myId={profile?.id} onSave={addTask} />
      <AddEventModal open={modal === 'event'} onClose={() => setModal(null)} members={members} onSave={addEvent} />
      <AddNoteModal open={modal === 'note'} onClose={() => setModal(null)} profile={profile} onSave={addNote} />
    </div>
  );
}
