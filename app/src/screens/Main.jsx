import React from 'react';
import { supabase } from '../lib/supabase';
import { AnchorTabs, Modal } from '../Components';

const COLOR_MAP = {
  red:        '#E63946',
  coral:      '#FF6B35',
  amber:      '#FFD60A',
  green:      '#2DC653',
  teal:       '#00B4D8',
  blue:       '#4361EE',
  periwinkle: '#7B2FBE',
  plum:       '#C77DFF',
  lilac:      '#F72585',
  rose:       '#FF86C8',
  black:      '#2D2D2D',
};
const getColor = c => COLOR_MAP[c] || '#999';
const getInitial = n => (n || '?')[0].toUpperCase();

// Render text with @[Name] mentions highlighted as styled spans.
// `members` is an optional array of profiles used to look up each
// mentioned user — if found, the mention chip is prefixed with that
// user's avatar (emoji or color dot) and colored in their profile
// color, so mentions visually match the rest of the app's identity
// styling. Falls back to a neutral chip if no matching profile.
function renderWithMentions(text, isMe, members) {
  if (!text) return null;
  const parts = text.split(/(@\[[^\]]+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^@\[([^\]]+)\]$/);
    if (m) {
      const name = m[1];
      const profile = Array.isArray(members)
        ? members.find(p => p?.display_name === name)
        : null;
      const color = profile ? getColor(profile.color) : null;
      const avatar = profile?.avatar;
      const isEmojiAvatar = typeof avatar === 'string' && avatar.length > 0
        && !avatar.startsWith('data:image')
        && !/^https?:\/\//.test(avatar);
      return (
        <span
          key={i}
          className={'mention-tag' + (isMe ? ' mention-me' : '')}
          style={color ? { color, '--mention-c': color } : undefined}
        >
          {isEmojiAvatar && (
            <span className="mention-emoji" aria-hidden>{avatar}</span>
          )}
          @{name}
        </span>
      );
    }
    return part;
  });
}

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

function SwipeToDelete({ children, onDelete, disabled, label = 'Delete' }) {
  const REVEAL = 76;
  const ENGAGE = 10;
  const SNAP_OPEN = 32;

  const [offset, setOffset] = React.useState(0);
  const stateRef = React.useRef({
    startX: 0, startY: 0, dragging: false,
    axis: null, startOffset: 0, moved: false,
  });
  const wrapRef = React.useRef(null);

  // Close when user clicks/taps anywhere outside this row while open
  React.useEffect(() => {
    if (offset === 0) return;
    const handler = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOffset(0);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [offset]);

  const onPointerDown = (e) => {
    if (disabled) return;
    // NOTE: we deliberately do NOT call setPointerCapture here. Capturing on
    // pointerdown redirects the subsequent click event to this wrapper and
    // prevents the child's onClick from firing — which broke tapping rows
    // that had swipe enabled. We only capture once a horizontal drag has
    // actually engaged (see onPointerMove below).
    stateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      target: e.currentTarget,
      dragging: true,
      axis: null,
      captured: false,
      startOffset: offset,
      moved: false,
    };
  };

  const onPointerMove = (e) => {
    const s = stateRef.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    if (!s.axis) {
      if (Math.abs(dx) < ENGAGE && Math.abs(dy) < ENGAGE) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      // Only now, once we've committed to a horizontal swipe, capture the
      // pointer so the user can drag past the element bounds.
      if (s.axis === 'x') {
        try { e.currentTarget.setPointerCapture?.(e.pointerId); s.captured = true; } catch {}
      }
    }
    if (s.axis !== 'x') return;
    s.moved = true;
    const next = Math.min(0, Math.max(-REVEAL, s.startOffset + dx));
    setOffset(next);
  };

  const onPointerUp = (e) => {
    const s = stateRef.current;
    if (!s.dragging) return;
    s.dragging = false;
    if (s.captured) {
      try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
      s.captured = false;
    }
    if (s.axis === 'x' && s.moved) {
      setOffset(offset < -SNAP_OPEN ? -REVEAL : 0);
    }
  };

  // Suppress click that happens after a drag, OR close-on-tap when open
  const onClickCapture = (e) => {
    if (stateRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      stateRef.current.moved = false;
      return;
    }
    if (offset !== 0) {
      e.preventDefault();
      e.stopPropagation();
      setOffset(0);
    }
  };

  if (disabled) return <>{children}</>;

  const open = offset <= -SNAP_OPEN;
  const fade = Math.min(1, -offset / REVEAL);

  return (
    <div ref={wrapRef} style={{ position: 'relative', overflow: 'hidden', borderRadius: 'inherit' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOffset(0); onDelete?.(); }}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        style={{
          position: 'absolute',
          right: 0, top: 0, bottom: 0,
          width: REVEAL,
          background: '#7A1818',
          color: '#FFFFFF',
          border: 0,
          padding: 0,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.04em',
          cursor: open ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: fade,
          pointerEvents: open ? 'auto' : 'none',
        }}
      >{label}</button>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        style={{
          transform: `translateX(${offset}px)`,
          transition: stateRef.current.dragging ? 'none' : 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
          touchAction: 'pan-y',
          background: 'inherit',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Dot({ profile, size = '' }) {
  const avatar = profile?.avatar;
  const isImage = typeof avatar === 'string' && (avatar.startsWith('data:image') || /^https?:\/\//.test(avatar));
  const color = getColor(profile?.color);
  const base = `dot ${size}`.trim();

  if (isImage) {
    return (
      <span
        className={base + ' avatar-img'}
        style={{
          '--c': color,
          backgroundImage: `url(${avatar})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    );
  }
  if (avatar) {
    return (
      <span
        className={base + ' avatar-emoji'}
        style={{ '--c': color, background: color }}
      >{avatar}</span>
    );
  }
  return (
    <span
      className={base}
      style={{ '--c': color, background: color }}
    />
  );
}

function ProfileButton({ profile, onClick }) {
  const avatar = profile?.avatar;
  const isImage = typeof avatar === 'string' && (avatar.startsWith('data:image') || /^https?:\/\//.test(avatar));
  const color = getColor(profile?.color);
  const baseStyle = { background: color };
  if (isImage) {
    return (
      <button
        className="fb-prof has-avatar"
        style={{
          ...baseStyle,
          backgroundImage: `url(${avatar})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        onClick={onClick}
        title="Settings"
        aria-label="Settings"
      />
    );
  }
  return (
    <button
      className={'fb-prof' + (avatar ? ' has-emoji' : '')}
      style={baseStyle}
      onClick={onClick}
      title="Settings"
    >
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%',
        lineHeight: 1,
      }}>{avatar || getInitial(profile?.display_name)}</span>
    </button>
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
  const isCancelled = !!task.cancelled_at;
  const overdue = !task.completed && !isCancelled && dueDateOverdue(task.due_date);
  // Only the assignee can check off or delete a task.
  // Unassigned tasks can be acted on by anyone in the group.
  const canActOnTask = !isCancelled && (!task.assigned_to || task.assigned_to === myId);
  const dimText = task.completed || isCancelled;
  return (
    <SwipeToDelete onDelete={onDelete} disabled={!canActOnTask}>
    <div
      className={'trow' + (task.completed ? ' done' : '') + (isCancelled ? ' cancelled' : '')}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: 'var(--surface-glass-strong)', borderBottom: '1px solid var(--rule)', cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <button
        disabled={!canActOnTask}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          border: `2.5px solid ${isCancelled ? '#7A1818' : color}`,
          background: task.completed ? color : 'transparent',
          cursor: canActOnTask ? 'pointer' : 'not-allowed',
          opacity: canActOnTask ? 1 : 0.45,
          flexShrink: 0, marginTop: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        }}
        onClick={(e) => { e.stopPropagation(); if (canActOnTask) onToggle(); }}
        title={isCancelled ? 'This task was cancelled' : (canActOnTask ? '' : 'Only the assignee can complete this task')}
      >
        {task.completed && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>✓</span>}
        {isCancelled && !task.completed && <span style={{ color: '#7A1818', fontSize: 12, fontWeight: 800, lineHeight: 1 }}>×</span>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 500,
          textDecoration: dimText ? 'line-through' : 'none',
          opacity: dimText ? 0.55 : 1,
          wordBreak: 'break-word',
        }}>
          {task.title}
          {isCancelled && (
            <span style={{
              marginLeft: 8,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.10em',
              color: '#7A1818',
              padding: '2px 6px',
              borderRadius: 6,
              background: 'rgba(122, 24, 24, 0.10)',
              border: '1px solid rgba(122, 24, 24, 0.25)',
              verticalAlign: 'middle',
            }}>Cancelled</span>
          )}
        </div>
        {task.due_date && !isCancelled && (
          <div style={{ fontSize: 11, marginTop: 2, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', color: overdue ? '#E27457' : 'var(--ink-mid)' }}>
            {formatDue(task.due_date)}
          </div>
        )}
      </div>
    </div>
    </SwipeToDelete>
  );
}

// ─── Tasks Section ────────────────────────────────────────────────────────────
function TasksSection({ tasks, members, myId, getProfile, onToggle, onAdd, onDelete, onShowTask, collapsed, onToggleCollapse }) {
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
    <section className={'fb-sec' + (collapsed ? ' collapsed' : '')} id="sec-tasks">
      <div className="fb-sec-hd">
        <div>
          <h2 className="fb-sec-title">Tasks</h2>
        </div>
        <div className="fb-sec-hd-right">
          <div className="fb-sec-meta">{openCount} open</div>
          <SectionToggle collapsed={collapsed} onClick={onToggleCollapse} />
        </div>
      </div>

      {!collapsed && (<>
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
      </>)}
    </section>
  );
}

// ─── Calendar Section ─────────────────────────────────────────────────────────
function CalendarSection({ events, members, getProfile, myId, onAdd, onDayClick, onDelete, onShowMonth, onShowEvent, collapsed, onToggleCollapse }) {
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
    <section className={'fb-sec' + (collapsed ? ' collapsed' : '')} id="sec-calendar">
      <div className="fb-sec-hd">
        <div>
          <h2 className="fb-sec-title">Calendar</h2>
        </div>
        <div className="fb-sec-hd-right">
          <button
            className="copy-btn"
            onClick={() => onShowMonth?.({ monthName: MONTH_NAMES[calMonth], year: calYear, events: monthEvents })}
            title="View all events this month"
          >
            {monthEvents.length} {monthEvents.length === 1 ? 'event' : 'events'}
          </button>
          <SectionToggle collapsed={collapsed} onClick={onToggleCollapse} />
        </div>
      </div>

      {!collapsed && (<>
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
                  <div key={e.id} className="evt-chip" style={{ background: getColor(p?.color || e.color), fontSize: 9, padding: '1px 3px', borderRadius: 3, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginTop: 1, cursor: 'pointer' }} title={e.title}>
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
                <SwipeToDelete key={e.id} onDelete={() => onDelete(e.id)} disabled={e.created_by !== myId}>
                <div
                  className="upcoming-row"
                  style={{ borderLeft: `5px solid ${getColor(p?.color || e.color)}`, cursor: 'pointer' }}
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
                </div>
                </SwipeToDelete>
              );
            })}
          </div>
        </div>
      )}
      </>)}
    </section>
  );
}

// ─── Notes Section ────────────────────────────────────────────────────────────
// Collapse / expand chevron used in every section header.
// `collapsed` is the section's current state — false = expanded (arrow ▾),
// true = collapsed (arrow flipped to ▸). Clicking fires onClick, which lives
// in MainApp and does the state flip + scroll-to-next-section.
function SectionToggle({ collapsed, onClick }) {
  return (
    <button
      type="button"
      className={'fb-sec-toggle' + (collapsed ? ' collapsed' : '')}
      onClick={onClick}
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Expand section' : 'Collapse section and jump to next'}
      title={collapsed ? 'Expand' : 'Collapse'}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path
          d="M3 5l4 4 4-4"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

// ─── Renderer for an individual feed post (type-aware) ──────────────────────
function FeedPost({ n, author, isMe, prevNote, nextNote, myId, members, replyToNote, replyToAuthor, onOpenNote, onDelete, onTogglePin, onShowMember, onVote, inPinned = false }) {
  const when = new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const type = n.type || 'message';
  const canDelete = n.created_by === myId;
  const authorColor = getColor(author?.color);

  // Shared bubble caption — sits BELOW every bubble, on the same side
  // as the bubble (right for "me", left for "them"). Avatar precedes
  // the name; name is colored to the author's profile color. Tapping
  // the caption opens the member detail sheet (same as tapping the
  // old side avatar did).
  const Caption = () => (
    <div
      className="chat-caption"
      onClick={(e) => { e.stopPropagation(); if (author) onShowMember?.(author); }}
    >
      <Dot profile={author} />
      <span className="chat-caption-name" style={{ color: authorColor }}>
        {author?.display_name}
      </span>
    </div>
  );

  // "↩ Replying to …" header — rendered above the bubble when this
  // post is a reply to another post. Clicking it opens the original
  // post's detail modal so the user can see the full context.
  const ReplyRef = () => {
    if (!replyToNote) return null;
    const refColor = getColor(replyToAuthor?.color);
    const refType = replyToNote.type || 'message';
    let snippet = '';
    if (refType === 'photos') {
      const count = Array.isArray(replyToNote.payload?.photos)
        ? replyToNote.payload.photos.length : 0;
      snippet = count > 1 ? `${count} photos` : 'photo';
    } else if (refType === 'poll') {
      snippet = replyToNote.payload?.question || 'poll';
    } else {
      snippet = (replyToNote.content || '').slice(0, 80);
    }
    return (
      <button
        type="button"
        className="chat-reply-ref"
        onClick={(e) => { e.stopPropagation(); onOpenNote?.(replyToNote); }}
        title="Show original post"
      >
        <span className="chat-reply-ref-arrow" aria-hidden>↩</span>
        <Dot profile={replyToAuthor} />
        <span className="chat-reply-ref-name" style={{ color: refColor }}>
          {replyToAuthor?.display_name || 'Unknown'}
        </span>
        {snippet && <span className="chat-reply-ref-snippet">{snippet}</span>}
      </button>
    );
  };

  // Hoverable iMessage-style reply affordance. Clicking it opens the
  // post's detail modal where the user can type a reply (which posts
  // a new message with `payload.reply_to = n.id`, threading them
  // together).
  const ReplyButton = () => (
    <button
      type="button"
      className="chat-reply-btn"
      onClick={(e) => { e.stopPropagation(); onOpenNote?.(n); }}
      title="Reply"
      aria-label="Reply to this post"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M6 3L2 7l4 4M2 7h7a3 3 0 013 3v1" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  // ── Announcement: full-width red, bold/italic, no bubble ────────────────
  if (type === 'announcement') {
    return (
      <SwipeToDelete onDelete={() => onDelete(n.id)} disabled={!canDelete}>
        <div className="announcement-card" onClick={() => onOpenNote?.(n)}>
          {n.pinned && !inPinned && (
            <span className="announcement-pin" title="Pinned">📌</span>
          )}
          <div className="announcement-head">
            <span className="announcement-siren" aria-hidden>💡</span>
            <span className="announcement-label">URGENT</span>
          </div>
          <div className="announcement-text">
            {renderWithMentions(n.content, false, members)}
          </div>
          <div className="announcement-meta">
            <span
              className="member-link"
              onClick={(e) => { e.stopPropagation(); if (author) onShowMember?.(author); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            >
              <Dot profile={author} />
              <span className="announcement-author" style={{ color: authorColor }}>
                {author?.display_name}
              </span>
            </span>
            <span className="announcement-time">{when}</span>
          </div>
        </div>
      </SwipeToDelete>
    );
  }

  // ── Quick Update / Reminder: normal bubble with red "REMINDER" label ──
  if (type === 'quick_update') {
    return (
      <SwipeToDelete onDelete={() => onDelete(n.id)} disabled={!canDelete}>
        <div className={`chat-row ${isMe ? 'me' : 'them'}`} style={{ marginTop: 10 }}>
          <div className="chat-bubble-wrap">
            <ReplyRef />
            <div
              className="chat-bubble has-tail"
              style={{ '--bubble-c': authorColor }}
              onClick={() => onOpenNote?.(n)}
            >
              {n.pinned && !inPinned && (
                <span className="chat-pin" title="Pinned" style={{ pointerEvents: 'none' }}>📌</span>
              )}
              <div className="quick-update-label">REMINDER</div>
              <div className="chat-text">{renderWithMentions(n.content, isMe, members)}</div>
              <div className="chat-time">{when}</div>
            </div>
            <Caption />
          </div>
          <ReplyButton />
        </div>
      </SwipeToDelete>
    );
  }

  // ── Photos: image grid inside (or instead of) a bubble ──────────────────
  if (type === 'photos') {
    const photos = (n.payload && Array.isArray(n.payload.photos)) ? n.payload.photos : [];
    return (
      <SwipeToDelete onDelete={() => onDelete(n.id)} disabled={!canDelete}>
        <div className={`chat-row ${isMe ? 'me' : 'them'}`} style={{ marginTop: 10 }}>
          <div className="chat-bubble-wrap">
            <ReplyRef />
            <div
              className="chat-bubble photo-bubble has-tail"
              style={{ '--bubble-c': authorColor }}
              onClick={() => onOpenNote?.(n)}
            >
              {n.pinned && !inPinned && (
                <span className="chat-pin" title="Pinned" style={{ pointerEvents: 'none' }}>📌</span>
              )}
              <div className={'photo-grid count-' + Math.min(photos.length, 4)}>
                {photos.length > 1 && (
                  <span className="photo-count-badge" aria-hidden>
                    <span aria-hidden>🖼️</span>
                    {photos.length}
                  </span>
                )}
                {photos.slice(0, 4).map((src, i) => (
                  <div key={i} className="photo-cell">
                    <img src={src} alt="" />
                    {i === 3 && photos.length > 4 && (
                      <div className="photo-more">+{photos.length - 4}</div>
                    )}
                  </div>
                ))}
              </div>
              {n.content && (
                <div className="chat-text" style={{ marginTop: 8 }}>{renderWithMentions(n.content, isMe, members)}</div>
              )}
              <div className="chat-time">{when}</div>
            </div>
            <Caption />
          </div>
          <ReplyButton />
        </div>
      </SwipeToDelete>
    );
  }

  // ── Poll: question + option list with circular vote buttons ─────────────
  if (type === 'poll') {
    const question = n.payload?.question || n.content || '';
    const options = Array.isArray(n.payload?.options) ? n.payload.options : [];
    const votes = n.payload?.votes && typeof n.payload.votes === 'object' ? n.payload.votes : {};
    const myVoteId = Object.keys(votes).find(oid => Array.isArray(votes[oid]) && votes[oid].includes(myId));
    const totalVotes = Object.values(votes).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
    return (
      <SwipeToDelete onDelete={() => onDelete(n.id)} disabled={!canDelete}>
        <div className={`chat-row ${isMe ? 'me' : 'them'}`} style={{ marginTop: 10 }}>
          <div className="chat-bubble-wrap" style={{ maxWidth: '86%' }}>
            <ReplyRef />
            <div
              className="chat-bubble poll-bubble has-tail"
              style={{ '--bubble-c': authorColor }}
              onClick={(e) => {
                // Don't pop the modal when clicking an option (handled by option click)
                if (e.target.closest('.poll-option')) return;
                onOpenNote?.(n);
              }}
            >
              {n.pinned && !inPinned && (
                <span className="chat-pin" title="Pinned" style={{ pointerEvents: 'none' }}>📌</span>
              )}
              <div className="poll-label">POLL</div>
              <div className="poll-question">{question}</div>
              <div className="poll-options">
                {options.map(opt => {
                  const count = Array.isArray(votes[opt.id]) ? votes[opt.id].length : 0;
                  const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                  const isMine = myVoteId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      className={'poll-option' + (isMine ? ' selected' : '')}
                      onClick={(e) => { e.stopPropagation(); onVote && onVote(n.id, opt.id); }}
                    >
                      <span className={'poll-radio' + (isMine ? ' checked' : '')}>
                        {isMine && <span className="poll-radio-inner" />}
                      </span>
                      <span className="poll-option-text">{opt.text}</span>
                      <span className="poll-option-count">{count}</span>
                      <span className="poll-option-bar" style={{ width: pct + '%' }} />
                    </button>
                  );
                })}
              </div>
              <div className="poll-footer">
                <span className="poll-total">{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
                <span className="chat-time" style={{ marginTop: 0 }}>{when}</span>
              </div>
            </div>
            <Caption />
          </div>
          <ReplyButton />
        </div>
      </SwipeToDelete>
    );
  }

  // ── Default: plain message bubble. Streak grouping has been removed —
  //    every message now carries its own avatar + name caption directly
  //    below the bubble, so each post is self-attributed regardless of
  //    neighbors. Tail shows on every bubble for visual consistency.
  return (
    <SwipeToDelete onDelete={() => onDelete(n.id)} disabled={!canDelete}>
      <div className={`chat-row ${isMe ? 'me' : 'them'}`} style={{ marginTop: 10 }}>
        <div className="chat-bubble-wrap">
          <ReplyRef />
          <div
            className="chat-bubble has-tail"
            style={{ '--bubble-c': authorColor }}
            onClick={() => onOpenNote?.(n)}
          >
            <div className="chat-text">{renderWithMentions(n.content, isMe, members)}</div>
            <div className="chat-time">{when}</div>
          </div>
          <Caption />
        </div>
        <ReplyButton />
      </div>
    </SwipeToDelete>
  );
}

function NotesSection({ notes, members, getProfile, myId, onAdd, onDelete, onTogglePin, onOpenNote, onShowMember, onVote, onReply, collapsed, onToggleCollapse }) {
  // Pinned section — shows:
  //   • every Urgent (announcement) — auto-pinned, lives only here
  //   • every Reminder (quick_update) — auto-pinned, lives only here
  //   • any other non-message post that the user pinned manually
  const pinned = notes
    .filter(n => {
      const type = n.type || 'message';
      if (type === 'announcement' || type === 'quick_update') return true;
      return n.pinned && type !== 'message';
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Main feed: NEWEST first (top). Urgent + Reminder are explicitly
  // excluded — they exist ONLY in the Pinned section so they don't
  // get buried beneath the day's chatter.
  const sorted = notes
    .filter(n => {
      const type = n.type || 'message';
      return type !== 'announcement' && type !== 'quick_update';
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <section className={'fb-sec' + (collapsed ? ' collapsed' : '')} id="sec-notes">
      <div className="fb-sec-hd">
        <div>
          <h2 className="fb-sec-title">Home Feed</h2>
        </div>
        <div className="fb-sec-hd-right">
          <div className="fb-sec-meta">{notes.length} {notes.length === 1 ? 'post' : 'posts'}</div>
          <SectionToggle collapsed={collapsed} onClick={onToggleCollapse} />
        </div>
      </div>

      {!collapsed && (<>

      {/* Whole feed lives in one shaded glass box — same family as the
          Tasks "To-do" container — so the section reads as a single
          unified surface. Pinned is its own (slightly more saturated)
          sub-box nested inside, so the two regions visually separate. */}
      {(pinned.length > 0 || sorted.length > 0) ? (
        <div className="feed-box">
          {/* Pinned sub-section — only shown when something is pinned */}
          {pinned.length > 0 && (
            <div className="pinned-section">
              <div className="pinned-header">
                <span className="pinned-icon">📌</span>
                <span className="pinned-label">PINNED</span>
                <span className="pinned-count">{pinned.length}</span>
              </div>
              <div className="pinned-list">
                {pinned.map(n => {
                  const author = getProfile(n.created_by);
                  const isMe = n.created_by === myId;
                  return (
                    <FeedPost
                      key={'pin-' + n.id}
                      n={n}
                      author={author}
                      isMe={isMe}
                      prevNote={null}
                      nextNote={null}
                      myId={myId}
                      members={members}
                      onOpenNote={onOpenNote}
                      onDelete={onDelete}
                      onTogglePin={onTogglePin}
                      onShowMember={onShowMember}
                      onVote={onVote}
                      inPinned={true}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {sorted.length > 0 && (
            <div className="chat-feed">
              {sorted.map((n, i) => {
                const author = getProfile(n.created_by);
                const isMe = n.created_by === myId;
                const prevNote = i > 0 ? sorted[i - 1] : null;
                const nextNote = i < sorted.length - 1 ? sorted[i + 1] : null;
                // Resolve the post being replied-to (if this post is
                // itself a reply) so FeedPost can render a small
                // "↩ Replying to …" link above the bubble.
                const replyToId = n.payload && n.payload.reply_to;
                const replyToNote = replyToId
                  ? notes.find(x => x.id === replyToId) || null
                  : null;
                const replyToAuthor = replyToNote
                  ? getProfile(replyToNote.created_by)
                  : null;
                return (
                  <FeedPost
                    key={n.id}
                    n={n}
                    author={author}
                    isMe={isMe}
                    prevNote={prevNote}
                    nextNote={nextNote}
                    myId={myId}
                    members={members}
                    replyToNote={replyToNote}
                    replyToAuthor={replyToAuthor}
                    onOpenNote={onOpenNote}
                    onDelete={onDelete}
                    onTogglePin={onTogglePin}
                    onShowMember={onShowMember}
                    onVote={onVote}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="kbd-hint" style={{ padding: '24px 0' }}>NO POSTS YET — TAP "POST" BELOW</div>
      )}

      <button className="fb-btn solid" onClick={onAdd} style={{ marginTop: 14 }}>
        <span className="plus">+</span> Post
      </button>
      </>)}
    </section>
  );
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────
function AddTaskModal({ open, onClose, members, myId, onSave }) {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [assignee, setAssignee] = React.useState(myId || null);
  const [dueOpt, setDueOpt] = React.useState('today');
  const [dueDate, setDueDate] = React.useState('');
  const [repeatFreq, setRepeatFreq] = React.useState('none'); // none | daily | weekly | monthly
  const [repeatDays, setRepeatDays] = React.useState([]);     // 0-6 (Sun-Sat) for weekly
  const [repeatTime, setRepeatTime] = React.useState('');     // HH:MM
  const [saving, setSaving] = React.useState(false);

  const getDueDate = () => {
    const d = new Date();
    if (dueOpt === 'today') return d.toISOString().slice(0, 10);
    if (dueOpt === 'tomorrow') { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
    if (dueOpt === 'week') { d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
    if (dueOpt === 'pick') return dueDate || null;
    return null;
  };

  const getRecurrence = () => {
    if (repeatFreq === 'none') return null;
    const r = { freq: repeatFreq };
    if (repeatTime) r.time = repeatTime;
    if (repeatFreq === 'weekly') r.days = repeatDays.slice().sort();
    return r;
  };

  const toggleDay = (d) => {
    setRepeatDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const reset = () => {
    setTitle(''); setDescription(''); setAssignee(myId || null);
    setDueOpt('today'); setDueDate('');
    setRepeatFreq('none'); setRepeatDays([]); setRepeatTime('');
  };

  const buildPayload = () => ({
    title: title.trim(),
    description: description.trim() || null,
    assigned_to: assignee,
    due_date: getDueDate(),
    recurrence: getRecurrence(),
  });

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave(buildPayload());
    reset();
    setSaving(false);
    onClose();
  };

  const saveAndAnother = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave(buildPayload());
    setTitle(''); setDescription('');
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
        <label>Details <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value.slice(0, 500))}
          placeholder="Instructions, links, things to bring…"
          rows={3}
          maxLength={500}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', border: '1.5px solid var(--rule, #141414)', borderRadius: 8, background: 'var(--cream, #FFFEF7)', color: 'var(--ink, #141414)', outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', textAlign: 'right', marginTop: 4 }}>
          {description.length} / 500
        </div>
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

      <div className="field">
        <label>Repeat</label>
        <div className="date-row">
          {[
            ['none',    "Doesn't repeat"],
            ['daily',   'Daily'],
            ['weekly',  'Weekly'],
            ['monthly', 'Monthly'],
          ].map(([k, lbl]) => (
            <button key={k} className={'pick' + (repeatFreq === k ? ' on' : '')} onClick={() => setRepeatFreq(k)}>{lbl}</button>
          ))}
        </div>

        {repeatFreq === 'weekly' && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-muted)', marginBottom: 6 }}>
              On these days
            </div>
            <div className="date-row">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                <button
                  key={day}
                  className={'pick' + (repeatDays.includes(i) ? ' on' : '')}
                  onClick={() => toggleDay(i)}
                  style={{ minWidth: 0, padding: '8px 10px' }}
                >{day}</button>
              ))}
            </div>
          </div>
        )}

        {repeatFreq !== 'none' && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-muted)', marginBottom: 6 }}>
              At time <span style={{ fontWeight: 400, opacity: 0.6 }}>· optional</span>
            </div>
            <input type="time" value={repeatTime} onChange={e => setRepeatTime(e.target.value)} style={{ width: '100%' }} />
          </div>
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

function EventCard({ event, getProfile, myId, onDelete, onClick }) {
  const p = getProfile(event.created_by);
  const color = getColor(p?.color || event.color);
  const timeStr = event.start_time
    ? `${fmtTime(event.start_time)}${event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}`
    : 'All day';
  return (
    <SwipeToDelete onDelete={() => onDelete(event.id)} disabled={event.created_by !== myId}>
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
    </div>
    </SwipeToDelete>
  );
}

// ─── Event Details Modal (single event) ───────────────────────────────────────
function EventDetailsModal({ open, event, getProfile, myId, onClose, onDelete, onShowMember }) {
  if (!open || !event) return null;
  const p = getProfile(event.created_by);
  const color = getColor(p?.color || event.color);
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
        <label>Attendees</label>
        {Array.isArray(event.attendees) && event.attendees.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {event.attendees.map(uid => {
              const ap = getProfile(uid);
              return (
                <span
                  key={uid}
                  className="member-link"
                  onClick={() => ap && onShowMember && onShowMember(ap)}
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
                    cursor: ap ? 'pointer' : 'default',
                  }}
                >
                  <Dot profile={ap} />
                  <span>{ap?.display_name || 'Unknown'}</span>
                  {uid === myId && <span className="userbadge"><span className="you">you</span></span>}
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

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Created by</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          {p ? (
            <span
              className="member-link"
              onClick={() => onShowMember && onShowMember(p)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            >
              <Dot profile={p} />
              <span>{p.display_name}</span>
              {p.id === myId && <span className="userbadge"><span className="you">you</span></span>}
            </span>
          ) : (
            <span>Unknown</span>
          )}
        </div>
      </div>

      {event.created_by === myId && (
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => { onDelete(event.id); onClose(); }}
            className="danger-btn"
          >Delete event</button>
        </div>
      )}
    </Modal>
  );
}

function DayDetailsModal({ open, date, events, getProfile, myId, onClose, onAddEvent, onDelete, onShowEvent }) {
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
              myId={myId}
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
function MonthEventsModal({ open, onClose, monthName, year, events, getProfile, myId, onDelete, onShowEvent }) {
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
                      myId={myId}
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
  const [postType, setPostType] = React.useState('message');
  const [body, setBody] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [makeTask, setMakeTask] = React.useState(false);
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskAssignee, setTaskAssignee] = React.useState(profile?.id || null);
  const [taskDueOpt, setTaskDueOpt] = React.useState('today');
  const [taskDueDate, setTaskDueDate] = React.useState('');

  // Photo upload state
  const [photos, setPhotos] = React.useState([]); // array of dataURLs
  const photoInputRef = React.useRef(null);

  // Poll state
  const [pollQuestion, setPollQuestion] = React.useState('');
  const [pollOptions, setPollOptions] = React.useState(['', '']);

  // @mention state
  const editorRef = React.useRef(null);
  const [mentionAnchor, setMentionAnchor] = React.useState(null); // { query } | null

  // Extract plain text (with @[Name] markers) from the contentEditable editor
  const getEditorText = () => {
    const el = editorRef.current;
    if (!el) return '';
    function extract(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.tagName === 'BR') return '\n';
      if (node.dataset && node.dataset.mention) return '@[' + node.dataset.mention + ']';
      const isBlock = node !== el && (node.tagName === 'DIV' || node.tagName === 'P');
      const children = Array.from(node.childNodes).map(extract).join('');
      return isBlock ? '\n' + children : children;
    }
    return extract(el).replace(/^\n+/, '');
  };

  // Get serialized text before the cursor (for @mention detection)
  const getTextBeforeCursor = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorRef.current) return '';
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const preRange = document.createRange();
    preRange.selectNodeContents(editorRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const frag = preRange.cloneContents();
    function extract(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.tagName === 'BR') return '\n';
      if (node.dataset && node.dataset.mention) return '@[' + node.dataset.mention + ']';
      return Array.from(node.childNodes).map(extract).join('');
    }
    return Array.from(frag.childNodes).map(extract).join('');
  };

  // Reset everything each time the modal opens
  React.useEffect(() => {
    if (open) {
      if (editorRef.current) editorRef.current.innerHTML = '';
      setPostType('message');
      setBody('');
      setMakeTask(false);
      setTaskTitle('');
      setTaskAssignee(profile?.id || null);
      setTaskDueOpt('today');
      setTaskDueDate('');
      setMentionAnchor(null);
      setPhotos([]);
      setPollQuestion('');
      setPollOptions(['', '']);
      setTimeout(() => editorRef.current?.focus(), 50);
    }
  }, [open, profile?.id]);

  // Photo upload helpers — turn user-selected files into compressed data URLs
  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    // Hard cap: 10 photos per post (good for the chat feed)
    const remaining = 10 - photos.length;
    const toRead = files.slice(0, remaining);
    toRead.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        // Downscale through a canvas so we don't store 10 MB photos in the DB
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) { height = Math.round((height / width) * maxDim); width = maxDim; }
            else { width = Math.round((width / height) * maxDim); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setPhotos(prev => prev.length >= 10 ? prev : [...prev, compressed]);
        };
        img.onerror = () => {
          // Fallback to the raw data URL if canvas fails
          setPhotos(prev => prev.length >= 10 ? prev : [...prev, dataUrl]);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
    // Reset so the user can pick the same file again later
    e.target.value = '';
  };

  const removePhoto = (idx) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  // Poll option helpers
  const setPollOption = (idx, val) => {
    setPollOptions(prev => prev.map((o, i) => i === idx ? val : o));
  };
  const addPollOption = () => {
    setPollOptions(prev => prev.length < 5 ? [...prev, ''] : prev);
  };
  const removePollOption = (idx) => {
    setPollOptions(prev => prev.length > 2 ? prev.filter((_, i) => i !== idx) : prev);
  };

  // Keep task title auto-suggesting from the note's first line if the user hasn't typed their own
  const [titleEdited, setTitleEdited] = React.useState(false);
  React.useEffect(() => {
    if (!titleEdited) {
      const firstLine = body.split('\n')[0].trim().slice(0, 100);
      setTaskTitle(firstLine);
    }
  }, [body, titleEdited]);

  // @mention detection on every input in the contentEditable editor
  const handleInput = () => {
    const text = getEditorText();
    setBody(text);
    const before = getTextBeforeCursor();
    const m = before.match(/@([^@\[\]\n]*)$/);
    if (m) {
      setMentionAnchor({ query: m[1].toLowerCase().trim() });
    } else {
      setMentionAnchor(null);
    }
  };

  // Paste as plain text to prevent HTML injection into the editor
  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (text) {
      document.execCommand('insertText', false, text);
      handleInput();
    }
  };

  // Insert a styled mention chip into the contentEditable editor
  const insertMention = (member) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { setMentionAnchor(null); return; }

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setMentionAnchor(null); return; }

    const offset = range.startOffset;
    const textBefore = node.textContent.slice(0, offset);
    const atMatch = textBefore.match(/@([^@\[\]\n]*)$/);
    if (!atMatch) { setMentionAnchor(null); return; }

    const atStart = offset - atMatch[0].length;
    const afterText = node.textContent.slice(offset);

    // Truncate the text node to remove the @query
    node.textContent = node.textContent.slice(0, atStart);

    // Build the mention chip element
    const color = getColor(member.color);
    const chip = document.createElement('span');
    chip.contentEditable = 'false';
    chip.dataset.mention = member.display_name;
    chip.className = 'mention-chip-inline';
    chip.style.setProperty('--chip-c', color);

    const dotEl = document.createElement('span');
    dotEl.className = 'mention-chip-dot';
    dotEl.style.background = color;

    const nameEl = document.createElement('span');
    nameEl.textContent = member.display_name;
    nameEl.style.color = color;

    chip.appendChild(dotEl);
    chip.appendChild(nameEl);

    // Insert chip after the truncated text node
    const parent = node.parentNode;
    const nextSib = node.nextSibling;
    if (nextSib) {
      parent.insertBefore(chip, nextSib);
    } else {
      parent.appendChild(chip);
    }

    // Add a regular space + any remaining text after the cursor
    const spaceNode = document.createTextNode(' ' + afterText);
    chip.after(spaceNode);

    // Move cursor to just after the space
    const newRange = document.createRange();
    newRange.setStart(spaceNode, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setMentionAnchor(null);
    setBody(getEditorText());
  };

  const otherMembers = (members || []).filter(m => m.id !== profile?.id);
  const mentionMatches = mentionAnchor !== null
    ? otherMembers.filter(m =>
        !mentionAnchor.query || m.display_name?.toLowerCase().startsWith(mentionAnchor.query)
      )
    : [];

  const getDueDate = () => {
    const d = new Date();
    if (taskDueOpt === 'today') return d.toISOString().slice(0, 10);
    if (taskDueOpt === 'tomorrow') { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
    if (taskDueOpt === 'week') { d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
    if (taskDueOpt === 'pick') return taskDueDate || null;
    return null;
  };

  const save = async () => {
    const content = getEditorText().trim();
    let payload = null;

    // Validate per type
    if (postType === 'message' || postType === 'announcement' || postType === 'quick_update') {
      if (!content) { alert('Please enter a message before posting.'); return; }
    } else if (postType === 'photos') {
      if (photos.length === 0) { alert('Please add at least one photo.'); return; }
      payload = { photos };
    } else if (postType === 'poll') {
      const q = pollQuestion.trim();
      const opts = pollOptions.map(o => o.trim()).filter(Boolean);
      if (!q) { alert('Please enter a poll question.'); return; }
      if (opts.length < 2) { alert('Please add at least two answer options.'); return; }
      payload = {
        question: q,
        options: opts.map((text, i) => ({ id: 'opt-' + Date.now() + '-' + i, text })),
        votes: {},
      };
    }

    // Tasks can be created from any post (only really makes sense for messages/quick updates, but allowed)
    if (makeTask && !taskTitle.trim()) {
      alert('Task title is empty. Either uncheck "Create task from note?" or enter a title.'); return;
    }

    // Pinning rules (the manual "Pin to top" checkbox was removed):
    //   announcement (Urgent)  → ALWAYS pinned, lives only in pinned section
    //   quick_update (Reminder) → ALWAYS pinned, lives only in pinned section
    //   everything else        → never auto-pinned (users can pin later
    //                            from the post-detail modal)
    const finalPinned =
      postType === 'announcement' ? true :
      postType === 'quick_update' ? true :
      false;

    setSaving(true);
    const taskPayload = makeTask
      ? { title: taskTitle.trim(), assigned_to: taskAssignee, due_date: getDueDate() }
      : null;
    try {
      await onSave({
        content: content || (postType === 'poll' ? pollQuestion.trim() : ''),
        type: postType,
        payload,
        pinned: finalPinned,
      }, taskPayload);
    } catch (e) {
      alert('Error: ' + (e?.message || String(e)));
    }
    setSaving(false);
    onClose();
  };

  // Post type configuration — drives the segmented control
  // Internal type IDs stay the same so existing posts in Supabase keep
  // rendering — only the display labels and icons changed:
  //   'announcement' → "Urgent" (light bulb)
  //   'quick_update' → "Reminder" (bell)
  const POST_TYPES = [
    { id: 'message',      label: 'Message',  icon: '💬' },
    { id: 'announcement', label: 'Urgent',   icon: '💡' },
    { id: 'quick_update', label: 'Reminder', icon: '🔔' },
    { id: 'photos',       label: 'Photos',   icon: '📷' },
    { id: 'poll',         label: 'Poll',     icon: '📊' },
  ];

  // Title shows the active post type
  const typeLabels = { message: 'Message', announcement: 'Urgent', quick_update: 'Reminder', photos: 'Photos', poll: 'Poll' };
  const titleNode = <>New <em>{typeLabels[postType] || 'Post'}</em></>;

  // Helper — render the contentEditable message editor (used by message, announcement, quick_update)
  const renderMessageEditor = (labelText, placeholder, extraClass) => (
    <div className="field">
      <label>
        {labelText}
        {otherMembers.length > 0 && (
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>
            — type @ to tag someone
          </span>
        )}
      </label>
      <div style={{ position: 'relative' }}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          data-gramm="false"
          data-gramm_editor="false"
          className={'mention-editor' + (extraClass ? ' ' + extraClass : '')}
          onInput={handleInput}
          onKeyDown={(e) => { if (e.key === 'Escape') setMentionAnchor(null); }}
          onPaste={handlePaste}
        />
        {!body && (
          <span className="mention-editor-placeholder">{placeholder}</span>
        )}
        {mentionAnchor !== null && mentionMatches.length > 0 && (
          <div className="mention-picker">
            {mentionMatches.map(m => (
              <button
                key={m.id}
                className="mention-pick-item"
                onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              >
                <Dot profile={m} />
                <span style={{ color: getColor(m.color) }}>{m.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={titleNode}
      footer={<button className="fb-btn solid" onClick={save} disabled={saving}>{saving ? 'Posting…' : 'Post'}</button>}>

      {/* Post type segmented control */}
      <div className="field">
        <label>Post type</label>
        <div className="post-type-row">
          {POST_TYPES.map(t => (
            <button
              key={t.id}
              className={'post-type-btn' + (postType === t.id ? ' on' : '')}
              onClick={() => setPostType(t.id)}
              type="button"
            >
              <span className="post-type-icon" aria-hidden>{t.icon}</span>
              <span className="post-type-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

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

      {/* ── Type-specific content ───────────────────────────────────── */}
      {postType === 'message' && renderMessageEditor('Message', "What's on your mind?")}

      {postType === 'announcement' && (
        <>
          <div className="announcement-notice">
            <span aria-hidden style={{ fontSize: 16 }}>💡</span>
            <span>Everyone in the group will get a notification.</span>
          </div>
          {renderMessageEditor('Urgent', 'Important news for the whole group…', 'announcement-editor')}
        </>
      )}

      {postType === 'quick_update' && (
        <>
          <div className="quick-update-notice">
            <span className="quick-update-label" style={{ display: 'inline-block', padding: 0 }}>REMINDER</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>· auto-pinned to the top of the Home Feed</span>
          </div>
          {renderMessageEditor('Reminder', 'Don’t forget to…')}
        </>
      )}

      {postType === 'photos' && (
        <>
          <div className="field">
            <label>Photos <span style={{ fontWeight: 400, opacity: 0.5 }}>· up to 10</span></label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="fb-btn"
              onClick={() => photoInputRef.current?.click()}
              style={{ marginBottom: photos.length > 0 ? 10 : 0 }}
            >
              <span className="plus">+</span> Add photos
            </button>
            {photos.length > 0 && (
              <div className="photo-thumbs">
                {photos.map((src, idx) => (
                  <div key={idx} className="photo-thumb">
                    <img src={src} alt="" />
                    <button
                      type="button"
                      className="photo-thumb-remove"
                      onClick={() => removePhoto(idx)}
                      title="Remove photo"
                      aria-label="Remove photo"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {renderMessageEditor('Caption (optional)', 'Say something about these photos…')}
        </>
      )}

      {postType === 'poll' && (
        <>
          <div className="field">
            <label>Question</label>
            <input
              value={pollQuestion}
              onChange={e => setPollQuestion(e.target.value.slice(0, 140))}
              placeholder="What should we have for dinner?"
              maxLength={140}
            />
          </div>
          <div className="field">
            <label>Answer options <span style={{ fontWeight: 400, opacity: 0.5 }}>· up to 5</span></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pollOptions.map((opt, idx) => (
                <div key={idx} className="poll-option-input">
                  <span className="poll-option-num">{idx + 1}</span>
                  <input
                    value={opt}
                    onChange={e => setPollOption(idx, e.target.value.slice(0, 80))}
                    placeholder={['Pizza', 'Tacos', 'Stir fry', 'Soup', 'Cereal'][idx] || 'Option…'}
                    maxLength={80}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removePollOption(idx)}
                      className="poll-option-remove"
                      aria-label="Remove option"
                    >×</button>
                  )}
                </div>
              ))}
              {pollOptions.length < 5 && (
                <button
                  type="button"
                  className="fb-btn"
                  onClick={addPollOption}
                  style={{ marginTop: 2 }}
                >
                  <span className="plus">+</span> Add option
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* The "Pin to top of Home Feed" checkbox was removed —
          Urgent + Reminder posts auto-pin, and everything else can be
          pinned later from the post-detail modal. */}

      {/* ── Create-task option (only for Message + Reminder) ────── */}
      {(postType === 'message' || postType === 'quick_update') && (
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
            Create task from post?
          </label>
        </div>
      )}

      {makeTask && (postType === 'message' || postType === 'quick_update') && (
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

// ─── Member Details Modal ────────────────────────────────────────────────────
function MemberDetailsModal({ open, member, notes, tasks, events, onClose, onShowNote, onShowTask, onShowEvent }) {
  if (!open || !member) return null;

  const memberNotes = (notes || []).filter(n => n.created_by === member.id);
  const openTasks = (tasks || []).filter(t => t.assigned_to === member.id && !t.completed);
  const doneTasks = (tasks || []).filter(t => t.assigned_to === member.id && t.completed);
  const memberEvents = (events || [])
    .filter(e => e.created_by === member.id || (Array.isArray(e.attendees) && e.attendees.includes(member.id)))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const itemStyle = {
    padding: '10px 12px',
    background: 'var(--surface-glass-strong)',
    border: '1px solid var(--border-glass)',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: 1.4,
    transition: 'all 0.2s var(--ease)',
  };
  const sectionLabelStyle = {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--text-muted)',
    marginBottom: 10,
  };
  const emptyStyle = { fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' };

  return (
    <Modal open={open} onClose={onClose} title="Profile">
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '4px 0 18px',
        marginBottom: 20,
        borderBottom: '1px solid var(--border-soft)',
      }}>
        <span
          className="dot xl"
          style={{ '--c': getColor(member.color), background: getColor(member.color), width: 44, height: 44 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Satoshi, Inter, system-ui, sans-serif',
            fontSize: 22, fontWeight: 700, lineHeight: 1.15,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}>{member.display_name}</div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10, color: 'var(--text-muted)',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            marginTop: 4,
          }}>
            {memberNotes.length} {memberNotes.length === 1 ? 'post' : 'posts'} ·{' '}
            {openTasks.length + doneTasks.length} {openTasks.length + doneTasks.length === 1 ? 'task' : 'tasks'} ·{' '}
            {memberEvents.length} {memberEvents.length === 1 ? 'event' : 'events'}
          </div>
        </div>
      </div>

      {/* Home Feed posts */}
      <div style={{ marginBottom: 22 }}>
        <div style={sectionLabelStyle}>Home Feed posts</div>
        {memberNotes.length === 0 ? (
          <div style={emptyStyle}>No posts yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memberNotes.map(n => (
              <div key={n.id} style={itemStyle} onClick={() => onShowNote && onShowNote(n)}>
                <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap', textOverflow: 'ellipsis' }}>
                  {n.content}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tasks */}
      <div style={{ marginBottom: 22 }}>
        <div style={sectionLabelStyle}>
          Tasks {openTasks.length > 0 && <span style={{ color: 'var(--kinnekt-purple)' }}>· {openTasks.length} open</span>}
        </div>
        {openTasks.length === 0 && doneTasks.length === 0 ? (
          <div style={emptyStyle}>No tasks assigned.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {openTasks.map(t => {
              const overdue = dueDateOverdue(t.due_date);
              return (
                <div key={t.id} style={{ ...itemStyle, borderLeft: `4px solid ${getColor(member.color)}` }} onClick={() => onShowTask && onShowTask(t)}>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  {t.due_date && (
                    <div style={{ fontSize: 10, marginTop: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em', textTransform: 'uppercase', color: overdue ? '#E27457' : 'var(--text-muted)' }}>
                      {formatDue(t.due_date)}
                    </div>
                  )}
                </div>
              );
            })}
            {doneTasks.length > 0 && (
              <>
                <div style={{ ...sectionLabelStyle, fontSize: 9, marginTop: 8, marginBottom: 6, opacity: 0.7 }}>
                  Completed · {doneTasks.length}
                </div>
                {doneTasks.map(t => (
                  <div key={t.id} style={{ ...itemStyle, borderLeft: `4px solid ${getColor(member.color)}`, opacity: 0.55 }} onClick={() => onShowTask && onShowTask(t)}>
                    <div style={{ fontWeight: 500, textDecoration: 'line-through' }}>{t.title}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Events */}
      <div>
        <div style={sectionLabelStyle}>Events</div>
        {memberEvents.length === 0 ? (
          <div style={emptyStyle}>No events.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memberEvents.map(e => {
              const role = e.created_by === member.id ? 'creator' : 'attending';
              const evColor = getColor(e.color || member.color);
              const [y, mo, da] = e.date.split('-').map(Number);
              const dateLabel = new Date(y, mo - 1, da).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <div key={e.id} style={{ ...itemStyle, borderLeft: `4px solid ${evColor}` }} onClick={() => onShowEvent && onShowEvent(e)}>
                  <div style={{ fontWeight: 600 }}>{e.title}</div>
                  <div style={{ fontSize: 10, marginTop: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {dateLabel}{e.start_time ? ` · ${fmtTime(e.start_time)}` : ''} · {role}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Note Details Modal ───────────────────────────────────────────────────────
// ─── Task Details Modal ───────────────────────────────────────────────────────
function TaskDetailsModal({ open, task, notes, myId, getProfile, onClose, onToggle, onDelete, onOpenNote, onShowMember, onCancelTask }) {
  const [cancelMode, setCancelMode] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelling, setCancelling] = React.useState(false);

  React.useEffect(() => {
    if (open) { setCancelMode(false); setCancelReason(''); }
  }, [open, task?.id]);

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
  const recurrenceLabel = (() => {
    const r = task.recurrence;
    if (!r || !r.freq || r.freq === 'none') return null;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const t = r.time ? ` at ${fmtTime(r.time)}` : '';
    if (r.freq === 'daily') return `Every day${t}`;
    if (r.freq === 'weekly') {
      const days = Array.isArray(r.days) && r.days.length > 0
        ? r.days.map(i => dayNames[i]).join(', ')
        : 'no day selected';
      return `Weekly · ${days}${t}`;
    }
    if (r.freq === 'monthly') return `Every month${t}`;
    return null;
  })();

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

      {recurrenceLabel && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Repeats</label>
          <div style={{
            fontSize: 13, fontWeight: 600,
            color: 'var(--kinnekt-purple)',
          }}>↻ {recurrenceLabel}</div>
        </div>
      )}

      {task.description && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Details</label>
          <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{task.description}</div>
        </div>
      )}

      {task.cancelled_at && (
        <div style={{
          marginBottom: 14,
          padding: '12px 14px',
          background: 'rgba(122, 24, 24, 0.06)',
          border: '1px solid rgba(122, 24, 24, 0.30)',
          borderRadius: 10,
          color: '#7A1818',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>
            Cancelled
          </div>
          {task.cancellation_reason && (
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {task.cancellation_reason}
            </div>
          )}
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

      <div style={{
        marginTop: 22,
        paddingTop: 14,
        borderTop: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 6 }}>
              Assigned to
            </div>
            {assignee ? (
              <span
                className="member-link"
                onClick={() => onShowMember && onShowMember(assignee)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <Dot profile={assignee} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{assignee.display_name}</span>
                {assignee.id === myId && <span className="userbadge"><span className="you">you</span></span>}
              </span>
            ) : (
              <span style={{ fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>Unassigned</span>
            )}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 6 }}>
              Created by
            </div>
            {creator ? (
              <span
                className="member-link"
                onClick={() => onShowMember && onShowMember(creator)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <Dot profile={creator} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{creator.display_name}</span>
                {creator.id === myId && <span className="userbadge"><span className="you">you</span></span>}
              </span>
            ) : (
              <span style={{ fontSize: 14 }}>Unknown</span>
            )}
            {createdAt && <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>{createdAt}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {task.created_by === myId && !task.cancelled_at && !cancelMode && onCancelTask && (
            <button
              onClick={() => setCancelMode(true)}
              className="copy-btn"
              style={{ marginLeft: 0 }}
            >Cancel task</button>
          )}
          {(!task.assigned_to || task.assigned_to === myId) && (
            <button
              onClick={() => { onDelete(task.id); onClose(); }}
              className="danger-btn"
            >Delete task</button>
          )}
        </div>
      </div>

      {cancelMode && (
        <div style={{
          marginTop: 14,
          padding: '14px',
          background: 'rgba(122, 24, 24, 0.05)',
          border: '1px solid rgba(122, 24, 24, 0.25)',
          borderRadius: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#7A1818', marginBottom: 8 }}>
            Cancel this task?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 10 }}>
            {assignee && assignee.id !== myId
              ? <>The assignee, <strong>{assignee.display_name}</strong>, will be notified so they don't do duplicate work.</>
              : <>The task will be marked as cancelled.</>
            }
          </div>
          <textarea
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value.slice(0, 300))}
            placeholder="Reason (optional) — e.g. already taken care of"
            rows={2}
            maxLength={300}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', border: '1px solid rgba(122,24,24,0.30)', borderRadius: 8, background: 'rgba(255,255,255,0.6)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setCancelMode(false); setCancelReason(''); }}
              className="fb-btn"
              style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}
              disabled={cancelling}
            >Back</button>
            <button
              onClick={async () => {
                setCancelling(true);
                await onCancelTask(task.id, cancelReason.trim() || null);
                setCancelling(false);
                onClose();
              }}
              className="danger-btn"
              disabled={cancelling}
            >{cancelling ? 'Cancelling…' : 'Confirm cancel'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function NoteDetailsModal({ open, note, tasks, myId, myGroupId, members, getProfile, onClose, onDelete, onToggleTask, onShowMember, onNoteUpdated, onTogglePin, onVote }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [comments, setComments] = React.useState([]);
  const [newComment, setNewComment] = React.useState('');
  const [postingComment, setPostingComment] = React.useState(false);
  // Currently-zoomed photo (data URL) — when non-null, the fullscreen
  // lightbox overlay is rendered. We can't use `target="_blank"` to pop
  // photos open because they're stored as base64 data URLs and modern
  // browsers block opening those in new tabs for security, which is
  // exactly what was causing the "blank tab" bug.
  const [zoomedPhoto, setZoomedPhoto] = React.useState(null);

  // Esc key closes the lightbox
  React.useEffect(() => {
    if (!zoomedPhoto) return;
    const onKey = (e) => { if (e.key === 'Escape') setZoomedPhoto(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomedPhoto]);

  // Reset edit mode whenever we open a different note
  React.useEffect(() => {
    setEditing(false);
    setDraft(note?.content || '');
    setNewComment('');
    setZoomedPhoto(null);
  }, [note?.id]);

  // Load replies when the modal opens. Replies are now plain
  // bulletin-board posts (rows in `notes`) that carry a
  // `payload.reply_to = <this note id>` reference — they appear here
  // AND in the main Home Feed simultaneously, which is what
  // "comments post directly as messages to bulletin board" means.
  React.useEffect(() => {
    if (!open || !note?.id) return;
    let cancelled = false;
    supabase
      .from('notes')
      .select('*')
      .eq('payload->>reply_to', note.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setComments([]); return; }
        setComments(data || []);
      });
    return () => { cancelled = true; };
  }, [open, note?.id]);

  if (!open || !note) return null;
  const author = getProfile(note.created_by);
  const when = new Date(note.created_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const linked = (tasks || []).filter(t => t.note_id === note.id);
  const isCreator = note.created_by === myId;

  const saveEdit = async () => {
    if (!draft.trim()) return;
    setSavingEdit(true);
    const { error } = await supabase
      .from('notes')
      .update({ content: draft.trim() })
      .eq('id', note.id);
    setSavingEdit(false);
    if (error) { alert('Could not save note: ' + error.message); return; }
    if (onNoteUpdated) onNoteUpdated({ ...note, content: draft.trim() });
    setEditing(false);
  };

  // Replies are stored as regular `notes` rows with
  // `payload.reply_to = note.id`, so they show up in the main feed
  // alongside other bulletin-board posts AND in this thread view.
  const postComment = async () => {
    const text = newComment.trim();
    if (!text || !myId || !myGroupId) return;
    setPostingComment(true);
    const { data, error } = await supabase
      .from('notes')
      .insert({
        group_id: myGroupId,
        created_by: myId,
        content: text,
        type: 'message',
        payload: { reply_to: note.id },
        pinned: false,
      })
      .select()
      .single();
    setPostingComment(false);
    if (error) {
      alert('Could not post reply: ' + error.message);
      return;
    }
    setComments(prev => [...prev, data]);
    setNewComment('');
  };

  const deleteComment = async (id) => {
    setComments(prev => prev.filter(c => c.id !== id));
    await supabase.from('notes').delete().eq('id', id);
  };

  const noteType = note.type || 'message';
  const photoCount = (noteType === 'photos' && Array.isArray(note.payload?.photos))
    ? note.payload.photos.length
    : 0;
  const TYPE_TITLES = { message: 'Message', announcement: 'Urgent', quick_update: 'Reminder', photos: 'Photos', poll: 'Poll' };
  // For a single-photo post, hide the "Photos" type label so the
  // modal reads as just the photo + comments + tasks + author —
  // no redundant chrome at the top.
  const modalTitle = (noteType === 'photos' && photoCount === 1)
    ? ''
    : (TYPE_TITLES[noteType] || 'Post');
  // Dynamic delete-button text — reads as the noun for what's being
  // deleted (e.g. "Delete photo" / "Delete photos" / "Delete reminder")
  // instead of a generic "Delete note".
  const deleteLabel =
    noteType === 'photos'        ? (photoCount > 1 ? 'Delete photos' : 'Delete photo') :
    noteType === 'announcement'  ? 'Delete urgent'                                     :
    noteType === 'quick_update'  ? 'Delete reminder'                                   :
    noteType === 'poll'          ? 'Delete poll'                                       :
                                   'Delete message';

  // ── Type-specific body rendering for the details view ─────────────
  const renderBody = () => {
    if (noteType === 'announcement') {
      return (
        <div className="announcement-card detail-mode">
          <div className="announcement-head">
            <span className="announcement-siren" aria-hidden>💡</span>
            <span className="announcement-label">URGENT</span>
          </div>
          <div className="announcement-text detail-text">
            {renderWithMentions(note.content, false, members)}
          </div>
        </div>
      );
    }
    if (noteType === 'quick_update') {
      return (
        <div style={{
          padding: '14px 16px',
          background: 'var(--surface-glass-strong)',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--r-md)',
          fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
        }}>
          <div className="quick-update-label" style={{ marginBottom: 6, padding: 0 }}>REMINDER</div>
          {renderWithMentions(note.content, false, members)}
        </div>
      );
    }
    if (noteType === 'photos') {
      const photos = (note.payload && Array.isArray(note.payload.photos)) ? note.payload.photos : [];
      return (
        <div>
          <div className="photo-detail-grid">
            {photos.map((src, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setZoomedPhoto(src)}
                className="photo-detail-cell"
                aria-label="Zoom photo"
              >
                <img src={src} alt="" />
              </button>
            ))}
          </div>
          {note.content && (
            <div style={{
              padding: '14px 16px', marginTop: 12,
              background: 'var(--surface-glass-strong)',
              border: '1px solid var(--border-glass)',
              borderRadius: 'var(--r-md)',
              fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
            }}>
              {renderWithMentions(note.content, false, members)}
            </div>
          )}
        </div>
      );
    }
    if (noteType === 'poll') {
      const question = note.payload?.question || note.content || '';
      const options = Array.isArray(note.payload?.options) ? note.payload.options : [];
      const votes = note.payload?.votes && typeof note.payload.votes === 'object' ? note.payload.votes : {};
      const myVoteId = Object.keys(votes).find(oid => Array.isArray(votes[oid]) && votes[oid].includes(myId));
      const totalVotes = Object.values(votes).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0);
      return (
        <div style={{
          padding: '14px 16px',
          background: 'var(--surface-glass-strong)',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--r-md)',
        }}>
          <div className="poll-label" style={{ marginBottom: 6 }}>POLL</div>
          <div className="poll-question" style={{ marginBottom: 12, fontSize: 17 }}>{question}</div>
          <div className="poll-options detail-mode">
            {options.map(opt => {
              const voterIds = Array.isArray(votes[opt.id]) ? votes[opt.id] : [];
              const count = voterIds.length;
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
              const isMine = myVoteId === opt.id;
              return (
                <button
                  key={opt.id}
                  className={'poll-option' + (isMine ? ' selected' : '')}
                  onClick={() => onVote && onVote(note.id, opt.id)}
                  style={{ '--bubble-c': 'var(--kinnekt-purple)' }}
                >
                  <span className={'poll-radio' + (isMine ? ' checked' : '')}>
                    {isMine && <span className="poll-radio-inner" />}
                  </span>
                  <span className="poll-option-text">{opt.text}</span>
                  <span className="poll-option-count">{count}</span>
                  <span className="poll-option-bar" style={{ width: pct + '%' }} />
                </button>
              );
            })}
          </div>
          <div className="poll-footer detail-mode" style={{ marginTop: 10 }}>
            <span className="poll-total">{totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}</span>
          </div>
        </div>
      );
    }
    // Default — plain message
    return (
      <div style={{
        padding: '14px 16px',
        background: 'var(--surface-glass-strong)',
        border: '1px solid var(--border-glass)',
        borderRadius: 'var(--r-md)',
        fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
      }}>
        {renderWithMentions(note.content, false, members)}
      </div>
    );
  };

  // Pin button is hidden for plain messages (can't be pinned) AND for
  // Urgent + Reminder (they're auto-pinned forever — exposing an
  // unpin button would let a user hide them from every view).
  const canPin = noteType !== 'message' && noteType !== 'announcement' && noteType !== 'quick_update';
  const canEdit = isCreator && (noteType === 'message' || noteType === 'announcement' || noteType === 'quick_update');

  return (
    <>
    <Modal open={open} onClose={onClose} title={modalTitle}>
      {editing && canEdit ? (
        <div style={{ marginBottom: 14 }}>
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={5}
            style={{
              width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 14,
              padding: '12px 14px', border: '1.5px solid var(--kinnekt-purple)', borderRadius: 'var(--r-md)',
              background: 'var(--surface-glass-strong)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setEditing(false); setDraft(note.content || ''); }}
              className="fb-btn"
              style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}
              disabled={savingEdit}
            >Cancel</button>
            <button
              onClick={saveEdit}
              className="fb-btn solid"
              style={{ width: 'auto', padding: '8px 18px', fontSize: 13 }}
              disabled={savingEdit || !draft.trim()}
            >{savingEdit ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative', marginBottom: 14 }}>
          {renderBody()}
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
            {canPin && onTogglePin && (
              <button
                onClick={() => onTogglePin(note.id, note.pinned)}
                style={{
                  background: note.pinned ? 'rgba(106, 77, 255, 0.20)' : 'rgba(106, 77, 255, 0.10)',
                  border: '1px solid rgba(106, 77, 255, 0.30)',
                  color: 'var(--kinnekt-purple)',
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 999,
                  cursor: 'pointer',
                }}
                title={note.pinned ? 'Unpin from feed' : 'Pin to top'}
              >📌 {note.pinned ? 'Unpin' : 'Pin'}</button>
            )}
            {canEdit && (
              <button
                onClick={() => { setDraft(note.content || ''); setEditing(true); }}
                style={{
                  background: 'rgba(106, 77, 255, 0.10)',
                  border: '1px solid rgba(106, 77, 255, 0.30)',
                  color: 'var(--kinnekt-purple)',
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 999,
                  cursor: 'pointer',
                }}
                title="Edit"
              >Edit</button>
            )}
          </div>
        </div>
      )}

      {/* Replies (formerly "Comments" — section header removed).
          Replies are now plain bulletin-board posts with
          `payload.reply_to = note.id`, so they also appear in the
          main Home Feed. The list below shows the thread for this
          particular post; the composer at the bottom posts a new
          reply. */}
      <div style={{ marginBottom: 14, paddingTop: 14, borderTop: '1px solid var(--border-soft)' }}>
        {comments.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 10 }}>
            No replies yet — be the first.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {comments.map(c => {
              const cAuthor = getProfile(c.created_by);
              const cWhen = new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
              const canDeleteComment = c.created_by === myId || isCreator;
              return (
                <div
                  key={c.id}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--surface-glass)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 10,
                    fontSize: 13, lineHeight: 1.4,
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span
                      className="member-link"
                      onClick={() => cAuthor && onShowMember && onShowMember(cAuthor)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: cAuthor ? 'pointer' : 'default' }}
                    >
                      <Dot profile={cAuthor} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{cAuthor?.display_name || 'Unknown'}</span>
                      {c.created_by === myId && <span className="userbadge"><span className="you">you</span></span>}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontStyle: 'italic', color: 'var(--text-muted)' }}>{cWhen}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
                  {canDeleteComment && (
                    <button
                      onClick={() => deleteComment(c.id)}
                      style={{
                        position: 'absolute', top: 6, right: 6,
                        opacity: 0.4, fontSize: 14,
                        background: 'none', border: 'none',
                        cursor: 'pointer', padding: '2px 4px',
                      }}
                      title="Delete comment"
                    >×</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={newComment}
            onChange={e => setNewComment(e.target.value.slice(0, 300))}
            placeholder="Write a reply…"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); } }}
            style={{
              flex: 1,
              fontFamily: 'inherit', fontSize: 13,
              padding: '9px 12px',
              border: '1px solid var(--border-glass)',
              borderRadius: 999,
              background: 'var(--surface-glass)',
              color: 'var(--ink)',
              outline: 'none',
              minWidth: 0,
            }}
            maxLength={300}
            disabled={postingComment}
          />
          <button
            onClick={postComment}
            disabled={!newComment.trim() || postingComment}
            className="fb-btn solid"
            style={{
              width: 'auto', padding: '9px 18px', fontSize: 13,
              opacity: (!newComment.trim() || postingComment) ? 0.45 : 1,
              cursor: (!newComment.trim() || postingComment) ? 'not-allowed' : 'pointer',
            }}
          >{postingComment ? '…' : 'Post'}</button>
        </div>
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

      <div style={{
        marginTop: 22,
        paddingTop: 14,
        borderTop: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 6 }}>
            Posted by
          </div>
          <span
            className="member-link"
            onClick={() => author && onShowMember && onShowMember(author)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: author ? 'pointer' : 'default' }}
          >
            <Dot profile={author} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{author?.display_name || 'Unknown'}</span>
            {author?.id === myId && <span className="userbadge"><span className="you">you</span></span>}
          </span>
          <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>{when}</div>
        </div>
        {note.created_by === myId && (
          <button
            onClick={() => { onDelete(note.id); onClose(); }}
            className="danger-btn"
          >{deleteLabel}</button>
        )}
      </div>
    </Modal>

    {/* Fullscreen photo lightbox — opens when a photo cell is clicked.
        Click the backdrop or close button (or hit Esc) to dismiss.
        Stays inside the React tree so data URLs render reliably (no
        new-tab popup-blocker / data-URL restrictions). */}
    {zoomedPhoto && (
      <div
        className="photo-lightbox"
        onClick={() => setZoomedPhoto(null)}
        role="dialog"
        aria-label="Photo viewer"
      >
        <button
          type="button"
          className="photo-lightbox-close"
          onClick={(e) => { e.stopPropagation(); setZoomedPhoto(null); }}
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <img
          src={zoomedPhoto}
          alt=""
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    </>
  );
}

// ─── Notifications Menu ──────────────────────────────────────────────────────
function NotificationsMenu({ notifications, onMarkOne, onMarkAll, onOpenTask, onOpenEvent, onOpenNote, onDelete, onClearAll }) {
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
    if (n.type === 'task_cancelled') {
      return (
        <>
          <span className="fb-bell-icon-circle" style={{ background: '#7A1818' }}>⊘</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fb-bell-text">
              <strong>{p.by_name || 'Someone'}</strong> cancelled a task assigned to you
            </div>
            <div className="fb-bell-sub">{p.task_title}{p.reason ? ` · ${p.reason}` : ''}</div>
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
    if (n.type === 'note_tagged') {
      return (
        <>
          <span className="fb-bell-icon-circle" style={{ background: getColor(p.by_color), fontWeight: 800, fontSize: 15 }}>@</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fb-bell-text">
              <strong>{p.by_name || 'Someone'}</strong> tagged you in a post
            </div>
            {p.preview && <div className="fb-bell-sub">{p.preview}</div>}
          </div>
        </>
      );
    }
    if (n.type === 'announcement') {
      return (
        <>
          <span className="fb-bell-icon-circle" style={{ background: '#E63946', fontSize: 14 }}>💡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fb-bell-text">
              <strong>{p.by_name || 'Someone'}</strong> posted an Urgent
            </div>
            {p.preview && <div className="fb-bell-sub">{p.preview}</div>}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {unread > 0 && (
            <button className="fb-link" onClick={onMarkAll} style={{ fontSize: 11 }}>Mark all read</button>
          )}
          {notifications.length > 0 && onClearAll && (
            <button
              type="button"
              className="fb-bell-clear-all"
              onClick={onClearAll}
              title="Delete every notification"
            >Clear all</button>
          )}
        </div>
      </div>
      <div className="fb-bell-list">
        {notifications.length === 0 ? (
          <div className="fb-bell-empty">No notifications yet</div>
        ) : (
          notifications.slice(0, 20).map(n => {
            const handleClick = () => {
              if (!n.read) onMarkOne(n.id);
              const id = n.payload?.task_id || n.payload?.event_id || n.payload?.note_id;
              if (!id) return;
              if ((n.type === 'task_assigned' || n.type === 'task_cancelled') && onOpenTask) onOpenTask(id);
              else if (n.type === 'event_invited' && onOpenEvent) onOpenEvent(id);
              else if ((n.type === 'note_tagged' || n.type === 'announcement') && onOpenNote) onOpenNote(id);
            };
            return (
              <div
                key={n.id}
                className={'fb-bell-item' + (n.read ? '' : ' unread')}
                onClick={handleClick}
              >
                {renderItem(n)}
                <span className="fb-bell-when">{formatRelative(n.created_at)}</span>
                {onDelete && (
                  <button
                    type="button"
                    className="fb-bell-item-x"
                    onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                    title="Delete notification"
                    aria-label="Delete notification"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })
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
  const [detailMemberId, setDetailMemberId] = React.useState(null);
  const [members, setMembers] = React.useState([]);
  const [tasks, setTasks] = React.useState([]);
  const [events, setEvents] = React.useState([]);
  const [notes, setNotes] = React.useState([]);
  const [notifications, setNotifications] = React.useState([]);
  const [bellOpen, setBellOpen] = React.useState(false);
  const bellMenuRef = React.useRef(null);
  const [loading, setLoading] = React.useState(true);
  const scrollRef = React.useRef(null);

  // Per-section collapse state. Clicking the chevron in a section header
  // collapses that section's body and (if there's a next section) smooth-
  // scrolls to it — a quick way to walk Home Feed → Tasks → Calendar.
  const [collapsed, setCollapsed] = React.useState({
    notes: false, tasks: false, calendar: false,
  });
  const SECTION_ORDER = ['notes', 'tasks', 'calendar'];
  const toggleCollapse = (id) => {
    const wasCollapsed = collapsed[id];
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
    // Wait two frames so React commits the state change and the browser
    // re-flows the layout (collapsed body removes its height) before we
    // compute the scroll target.
    const scrollAfterLayout = (target) => {
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToSec(target)));
    };
    if (wasCollapsed) {
      // Expanding — bring this section to the top of the viewport.
      scrollAfterLayout(id);
    } else {
      // Collapsing — jump to the next section if there is one.
      const i = SECTION_ORDER.indexOf(id);
      const next = SECTION_ORDER[i + 1];
      if (next) scrollAfterLayout(next);
    }
  };

  React.useEffect(() => {
    if (!profile?.group_id) return;
    Promise.all([
      supabase.from('profiles').select('*').eq('group_id', profile.group_id),
      supabase.from('tasks').select('*').eq('group_id', profile.group_id).order('created_at', { ascending: false }),
      supabase.from('events').select('*').eq('group_id', profile.group_id).order('date', { ascending: true }),
      supabase.from('notes').select('*').eq('group_id', profile.group_id).order('created_at', { ascending: false }),
    ]).then(([m, t, e, n]) => {
      const allTasks = t.data || [];
      // Auto-delete completed tasks older than 72 hours (only those the
      // current user is allowed to delete via RLS — typically tasks
      // assigned to them or unassigned). Others stay until their owner
      // signs in and triggers their own cleanup pass.
      const cutoff = Date.now() - 72 * 60 * 60 * 1000;
      const stale = allTasks.filter(task =>
        task.completed && task.completed_at && new Date(task.completed_at).getTime() < cutoff
      );
      const fresh = stale.length === 0
        ? allTasks
        : allTasks.filter(task => !stale.some(s => s.id === task.id));
      setMembers(m.data || []);
      setTasks(fresh);
      setEvents(e.data || []);
      setNotes(n.data || []);
      setLoading(false);
      if (stale.length > 0) {
        // Fire-and-forget — RLS will reject any we can't delete
        supabase.from('tasks').delete().in('id', stale.map(s => s.id));
      }
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
    const next = !completed;
    const completedAt = next ? new Date().toISOString() : null;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: next, completed_at: completedAt } : t));
    let { error } = await supabase.from('tasks').update({ completed: next, completed_at: completedAt }).eq('id', id);
    // Fall back without completed_at if the column hasn't been migrated yet
    if (error && /completed_at/i.test(error.message || '')) {
      await supabase.from('tasks').update({ completed: next }).eq('id', id);
    }
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
    let payload = { group_id: profile.group_id, created_by: profile.id, ...data };
    // Optional columns that older schemas may not have — strip on error.
    const optional = ['description', 'recurrence'];
    let row = null;
    let error = null;
    for (let i = 0; i < 4; i++) {
      ({ data: row, error } = await supabase.from('tasks').insert(payload).select().single());
      if (!error) break;
      let stripped = null;
      const msg = (error.message || '').toLowerCase();
      for (const col of optional) {
        if (payload[col] !== undefined && msg.includes(col)) {
          const { [col]: _, ...rest } = payload;
          payload = rest;
          stripped = col;
          break;
        }
      }
      if (!stripped) break;
    }
    if (error || !row) {
      if (error) alert('Could not save task: ' + error.message);
      return;
    }
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
  };
  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  };

  const cancelTask = async (id, reason) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const cancelledAt = new Date().toISOString();
    setTasks(prev => prev.map(t => t.id === id ? { ...t, cancelled_at: cancelledAt, cancellation_reason: reason || null } : t));
    let payload = { cancelled_at: cancelledAt, cancellation_reason: reason || null };
    let { error } = await supabase.from('tasks').update(payload).eq('id', id);
    if (error) {
      // Fall back: strip whichever optional column is missing, retry
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('cancellation_reason')) {
        const { cancellation_reason: _r, ...rest } = payload;
        ({ error } = await supabase.from('tasks').update(rest).eq('id', id));
      }
      if (error && msg.includes('cancelled_at')) {
        alert('Cancellation columns missing — run:\n\nalter table public.tasks add column if not exists cancelled_at timestamptz;\nalter table public.tasks add column if not exists cancellation_reason text;');
        // revert optimistic UI
        setTasks(prev => prev.map(t => t.id === id ? { ...t, cancelled_at: null, cancellation_reason: null } : t));
        return;
      }
    }
    // Notify the assignee (if it's not the canceller)
    if (task.assigned_to && task.assigned_to !== profile.id) {
      notify([task.assigned_to], 'task_cancelled', {
        task_id: task.id,
        task_title: task.title,
        reason: reason || null,
        by_name: profile.display_name,
        by_color: profile.color,
      });
    }
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
  // Accepts either: addNote(content, taskPayload)  — legacy signature
  //           or: addNote({content, type, payload, pinned}, taskPayload)  — new
  const addNote = async (arg, taskPayload) => {
    const isObj = arg && typeof arg === 'object' && !Array.isArray(arg);
    const content = isObj ? (arg.content || '') : (arg || '');
    const type    = isObj ? (arg.type || 'message') : 'message';
    const payload = isObj ? (arg.payload || null) : null;
    const pinned  = isObj ? !!arg.pinned : false;

    // Build the insert payload — strip optional columns on schema errors
    let insertRow = {
      group_id: profile.group_id,
      created_by: profile.id,
      content,
      type,
      payload,
      pinned,
    };
    const optionalCols = ['type', 'payload', 'pinned'];
    let noteRow = null;
    let nErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      ({ data: noteRow, error: nErr } = await supabase
        .from('notes')
        .insert(insertRow)
        .select()
        .single());
      if (!nErr) break;
      const msg = (nErr.message || '').toLowerCase();
      let stripped = null;
      for (const col of optionalCols) {
        if (insertRow[col] !== undefined && msg.includes(col)) {
          const { [col]: _, ...rest } = insertRow;
          insertRow = rest;
          stripped = col;
          break;
        }
      }
      if (!stripped) break;
    }
    if (nErr || !noteRow) {
      const m = nErr?.message || 'unknown error';
      if (/type|payload/i.test(m)) {
        alert('Home Feed needs a one-time database update.\n\nRun this in Supabase → SQL Editor:\n\nalter table public.notes add column if not exists type text default \'message\';\nalter table public.notes add column if not exists payload jsonb default \'{}\';');
      } else {
        alert('Could not save post: ' + m);
      }
      return;
    }
    setNotes(prev => [noteRow, ...prev]);

    // Notify tagged members — parse @[Name] from content
    const tagMatches = [...(content || '').matchAll(/@\[([^\]]+)\]/g)];
    if (tagMatches.length > 0) {
      const taggedIds = [...new Set(
        tagMatches
          .map(m => members.find(mb => mb.display_name === m[1])?.id)
          .filter(id => id && id !== profile.id)
      )];
      if (taggedIds.length > 0) {
        notify(taggedIds, 'note_tagged', {
          note_id: noteRow.id,
          by_name: profile.display_name,
          by_color: profile.color,
          preview: content.replace(/@\[([^\]]+)\]/g, '@$1').slice(0, 80),
        });
      }
    }

    // Announcements: notify EVERY other group member with siren payload
    if (type === 'announcement') {
      const others = members.filter(m => m.id !== profile.id).map(m => m.id);
      if (others.length > 0) {
        notify(others, 'announcement', {
          note_id: noteRow.id,
          by_name: profile.display_name,
          by_color: profile.color,
          preview: (content || '').replace(/@\[([^\]]+)\]/g, '@$1').slice(0, 100),
        });
      }
    }

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

  // Vote on a poll — updates the note's payload.votes
  const voteOnPoll = async (noteId, optionId) => {
    const note = notes.find(n => n.id === noteId);
    if (!note || note.type !== 'poll') return;
    const payload = note.payload || {};
    const options = Array.isArray(payload.options) ? payload.options : [];
    if (!options.some(o => o.id === optionId)) return;

    const oldVotes = payload.votes && typeof payload.votes === 'object' ? payload.votes : {};
    // Remove my vote from any existing option, then add to the new one
    // (single-choice polls — toggle off if clicking the same option)
    const myCurrent = Object.keys(oldVotes).find(k => Array.isArray(oldVotes[k]) && oldVotes[k].includes(profile.id));
    const newVotes = {};
    Object.keys(oldVotes).forEach(k => {
      newVotes[k] = (Array.isArray(oldVotes[k]) ? oldVotes[k] : []).filter(uid => uid !== profile.id);
    });
    if (myCurrent !== optionId) {
      newVotes[optionId] = [...(newVotes[optionId] || []), profile.id];
    }

    const newPayload = { ...payload, votes: newVotes };
    // Optimistic UI
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, payload: newPayload } : n));
    const { error } = await supabase.from('notes').update({ payload: newPayload }).eq('id', noteId);
    if (error) {
      // Revert on failure
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, payload } : n));
      if (/payload/i.test(error.message || '')) {
        alert('Polls need a database update.\n\nRun:\nalter table public.notes add column if not exists payload jsonb default \'{}\';');
      } else {
        alert('Could not save vote: ' + error.message);
      }
    }
  };

  const deleteNote = async (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    await supabase.from('notes').delete().eq('id', id);
  };
  const deleteNotification = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  };
  const clearAllNotifications = async () => {
    if (notifications.length === 0) return;
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return;
    const ids = notifications.map(n => n.id);
    // Optimistic empty so the menu feels instant.
    setNotifications([]);
    const { error } = await supabase.from('notifications').delete().in('id', ids);
    if (error) {
      // Best-effort restore — the user will see them reappear and can retry.
      console.error('Clear all notifications failed:', error);
      alert('Could not clear notifications: ' + error.message);
    }
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
          <div className="fb-stickyhead-head" style={{position:'relative'}}>
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
                      onOpenTask={(id) => { setBellOpen(false); setDetailTaskId(id); }}
                      onOpenEvent={(id) => { setBellOpen(false); setDetailEventId(id); }}
                      onOpenNote={(id) => { setBellOpen(false); setDetailNoteId(id); }}
                      onDelete={deleteNotification}
                      onClearAll={clearAllNotifications}
                    />
                  )}
                </div>
                <ProfileButton profile={profile} onClick={onSettings} />
              </div>
            </div>
          </div>
          <AnchorTabs active={tab} onChange={id => { setTab(id); scrollToSec(id); }} />
        </div>

        <div className="fb-sec-wrap">
          <NotesSection notes={notes} members={members} getProfile={getProfile} myId={profile?.id} onAdd={() => setModal('note')} onDelete={deleteNote} onTogglePin={togglePin} onOpenNote={(n) => setDetailNoteId(n.id)} onShowMember={(p) => setDetailMemberId(p.id)} onVote={voteOnPoll} collapsed={collapsed.notes} onToggleCollapse={() => toggleCollapse('notes')} />
          <TasksSection tasks={tasks} members={members} myId={profile?.id} getProfile={getProfile} onToggle={toggleTask} onAdd={() => setModal('task')} onDelete={deleteTask} onShowTask={(t) => setDetailTaskId(t.id)} collapsed={collapsed.tasks} onToggleCollapse={() => toggleCollapse('tasks')} />
          <CalendarSection
            events={events}
            members={members}
            getProfile={getProfile}
            myId={profile?.id}
            onAdd={() => { setEventInitDate(null); setModal('event'); }}
            onDayClick={(iso) => setDayDetailsDate(iso)}
            onDelete={deleteEvent}
            onShowMonth={(payload) => setMonthModalData(payload)}
            onShowEvent={(ev) => setDetailEventId(ev.id)}
            collapsed={collapsed.calendar}
            onToggleCollapse={() => toggleCollapse('calendar')}
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
        myId={profile?.id}
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
        myId={profile?.id}
        onDelete={(id) => { deleteEvent(id); setMonthModalData(d => d ? { ...d, events: d.events.filter(e => e.id !== id) } : d); }}
        onShowEvent={(e) => setDetailEventId(e.id)}
      />
      <EventDetailsModal
        open={!!detailEventId}
        event={events.find(e => e.id === detailEventId) || null}
        getProfile={getProfile}
        myId={profile?.id}
        onClose={() => setDetailEventId(null)}
        onDelete={(id) => deleteEvent(id)}
        onShowMember={(p) => { setDetailEventId(null); setDetailMemberId(p.id); }}
      />
      <NoteDetailsModal
        open={!!detailNoteId}
        note={notes.find(n => n.id === detailNoteId) || null}
        tasks={tasks}
        myId={profile?.id}
        myGroupId={profile?.group_id}
        members={members}
        getProfile={getProfile}
        onClose={() => setDetailNoteId(null)}
        onDelete={(id) => deleteNote(id)}
        onToggleTask={toggleTask}
        onShowMember={(p) => { setDetailNoteId(null); setDetailMemberId(p.id); }}
        onNoteUpdated={(updated) => setNotes(prev => prev.map(n => n.id === updated.id ? updated : n))}
        onTogglePin={togglePin}
        onVote={voteOnPoll}
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
        onCancelTask={cancelTask}
        onOpenNote={(n) => { setDetailTaskId(null); setDetailNoteId(n.id); }}
        onShowMember={(p) => { setDetailTaskId(null); setDetailMemberId(p.id); }}
      />
      <MemberDetailsModal
        open={!!detailMemberId}
        member={members.find(m => m.id === detailMemberId) || null}
        notes={notes}
        tasks={tasks}
        events={events}
        onClose={() => setDetailMemberId(null)}
        onShowNote={(n) => { setDetailMemberId(null); setDetailNoteId(n.id); }}
        onShowTask={(t) => { setDetailMemberId(null); setDetailTaskId(t.id); }}
        onShowEvent={(e) => { setDetailMemberId(null); setDetailEventId(e.id); }}
      />
    </div>
  );
}
