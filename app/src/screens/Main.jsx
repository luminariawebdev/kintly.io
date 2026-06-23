import React from 'react';
import { supabase } from '../lib/supabase';
import { AnchorTabs, Modal, EmojiInput } from '../Components';

const COLOR_MAP = {
  red:        '#E63946',
  coral:      '#FF6B35',
  // peach / lemon / moss are offered on the signup screen — without
  // entries here they fell through to the #999 gray fallback on every
  // dot, bubble, and chip until the user changed colors in Settings.
  peach:      '#FFC18C',
  amber:      '#FFD60A',
  lemon:      '#F0E68C',
  moss:       '#C8D685',
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

// Carries the logged-in user's profile id through the whole tree so
// any byline / chip / reference can swap "their name" for the word
// "you" without prop-drilling `myId` everywhere. Set by MainApp via
// <MyIdContext.Provider> and read by <MemberName>.
const MyIdContext = React.createContext(null);

// Same idea, but for Spaces — exposes the list, an opener, and a
// profile lookup so any child component (TaskRow, EventCard, ListCard,
// FeedPost) can render a SpaceTag chip — colored by the Space creator's
// profile color — from just `spaceId`, without prop-drilling.
const SpacesContext = React.createContext({ spaces: [], showSpace: null, getProfile: () => null });

// Local-timezone ISO date helpers. `new Date().toISOString()` is UTC —
// for US users any evening use made "Today" resolve to tomorrow's date
// (due dates, default event dates, the date-picker highlight). These
// format y-m-d from the *local* clock instead.
const toLocalISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const localTodayISO = () => toLocalISO(new Date());

// Format an "HH:MM" 24-hour time string for display as 12-hour
// w/ AM/PM. Returns '' for empty / invalid input so the caller can
// show its own placeholder ("Pick a time").
const formatTime12 = (v) => {
  if (!v || !/^\d{1,2}:\d{2}$/.test(v)) return '';
  const [hStr, mStr] = v.split(':');
  let h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${period}`;
};

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
          {name}
        </span>
      );
    }
    return part;
  });
}

// Plain-text form of @[Name] mentions ("@Name") for attributes like
// title tooltips, where JSX spans can't go.
function plainMentions(text) {
  return (text || '').replace(/@\[([^\]]+)\]/g, '@$1');
}

// KinnektLogo moved to ../Components and consumed by SettingsScreen — the
// brand mark lives on the Settings page now, not the top sticky header, so
// the slider/tab bar can ride flush near the top of the screen.

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

function Dot({ profile, size = '', style }) {
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
          ...style,
        }}
      />
    );
  }
  if (avatar) {
    // Emoji avatar: drop the colored circle + ring so the emoji shows
    // bare ("escapes" the dot). The color circle is only for members
    // with no avatar. (Settings uses its own avatar markup, so its
    // circle-with-emoji is unaffected.)
    return (
      <span
        className={base + ' avatar-emoji'}
        style={{ ...style }}
      >{avatar}</span>
    );
  }
  return (
    <span
      className={base}
      style={{ '--c': color, background: color, ...style }}
    />
  );
}

/**
 * Renders a person's name as a third-person byline (e.g. next to the
 * profile dot in an event row or post caption). When that person is
 * the logged-in user, swaps the displayed text to "you" rendered in
 * the current user's profile color (via the global `--me-color` CSS
 * variable that MainApp keeps in sync). So a row that would have
 * read "🌸 mom" reads as "🌸 you" when mom is logged in — matching
 * the styling of the small "you" badge used elsewhere.
 *
 * The caller's `style` prop is preserved, but `color` is overridden
 * in the me-case so the text stays in `--me-color` even when the
 * caller passes an author-color override (which already equals
 * `--me-color` in that branch — this just makes the intent explicit).
 */
function MemberName({ profile, isMe, style, className }) {
  const ctxMyId = React.useContext(MyIdContext);
  if (!profile) return null;
  // Caller can force the decision with `isMe`, but in most spots we
  // just look at the global MyIdContext so the helper "just works"
  // without prop-drilling.
  const me = isMe ?? (ctxMyId && profile.id === ctxMyId);
  const color = getColor(profile.color);
  const text = me ? 'you' : profile.display_name;
  // `.member-name` gives the colored rounded-pill treatment so a name
  // always reads in its owner's color (the pill is neutralized inside
  // picker/member chips via CSS, where the chip is already the box).
  // `.me-name` is kept so the existing `.pick.on .me-name → white`
  // override still applies for the logged-in user.
  const cls = ['member-name', me ? 'me-name' : '', className].filter(Boolean).join(' ');
  return <span className={cls} style={{ '--member-c': color, '--me-color': color, ...style }}>{text}</span>;
}

// Live date + time banner shown above the home feed. Uses the device's
// own local timezone (no forced zone), so it follows the user wherever
// they are — straight from the device clock, no network call. Self-
// contained so its 1s tick only re-renders this component, not the app.
function LiveClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
  const tzAbbr = (new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(now).find(p => p.type === 'timeZoneName') || {}).value || '';
  return (
    <div className="live-clock" aria-label={`${dateStr}, ${timeStr} ${tzAbbr}`}>
      <div className="live-clock-date">{dateStr}</div>
      <div className="live-clock-time">{timeStr}<span className="live-clock-tz">{tzAbbr}</span></div>
    </div>
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

// Expand recurring events into their visible instances within a date
// window. Each instance shares the master row's `id`, so RSVPs and
// detail-modal lookups still hit the master row. The instance carries
// its own `date` (the occurrence date) so calendar grid + Upcoming
// list place it on the right day, plus an `_occDate` marker so the
// detail modal can show "occurrence date" vs "first started on" if
// needed. Non-recurring events pass through 1:1.
//
// Rules (mirrors task recurrence shape):
//   freq='daily'   — every day from start_date onward
//   freq='weekly'  — every selected weekday on/after start_date
//   freq='monthly' — same day-of-month every month
//   freq='custom'  — every selected weekday (same as weekly, just
//                    enters via a different picker UI)
//
// The window keeps the work bounded — we expand from `windowStart`
// (typically 60 days back) to `windowEnd` (typically 180 days fwd).
function expandRecurringEvents(rawEvents, windowStart, windowEnd) {
  if (!Array.isArray(rawEvents)) return [];
  const out = [];
  const startMs = windowStart.getTime();
  const endMs   = windowEnd.getTime();
  const toIso = toLocalISO;
  for (const e of rawEvents) {
    // Multi-day event: expand the single row into one entry per day.
    if (e.end_date && e.end_date > e.date) {
      const [sy, sm, sd] = e.date.split('-').map(Number);
      const [ey, em, ed] = e.end_date.split('-').map(Number);
      const spanStart = new Date(Math.max(startMs, new Date(sy, sm - 1, sd).getTime()));
      const spanEnd   = new Date(Math.min(endMs,   new Date(ey, em - 1, ed).getTime()));
      let cur = new Date(spanStart); cur.setHours(0,0,0,0);
      while (cur.getTime() <= spanEnd.getTime()) {
        out.push({ ...e, date: toIso(cur), _isMultiDay: true });
        cur.setDate(cur.getDate() + 1);
      }
      continue;
    }

    const r = e.recurrence;
    if (!r || !r.freq || r.freq === 'none') {
      out.push(e);
      continue;
    }
    // Anchor: the original event date is the FIRST occurrence. Don't
    // emit any instance before it (a weekly-Wednesday event starting
    // on the 14th shouldn't show on the previous Wednesday).
    const [ay, am, ad] = (e.date || '').split('-').map(Number);
    if (!ay) { out.push(e); continue; }
    const anchor = new Date(ay, am - 1, ad);
    const anchorMs = anchor.getTime();
    const scanStart = new Date(Math.max(startMs, anchorMs));
    scanStart.setHours(0, 0, 0, 0);

    if (r.freq === 'daily') {
      let cur = new Date(scanStart);
      while (cur.getTime() <= endMs) {
        out.push({ ...e, date: toIso(cur), _occDate: toIso(cur), _isRecurrence: true });
        cur.setDate(cur.getDate() + 1);
      }
      continue;
    }
    if (r.freq === 'weekly' || r.freq === 'custom') {
      const days = Array.isArray(r.days) && r.days.length > 0
        ? r.days
        : [anchor.getDay()]; // fall back to original weekday if no days set
      let cur = new Date(scanStart);
      while (cur.getTime() <= endMs) {
        if (days.includes(cur.getDay())) {
          out.push({ ...e, date: toIso(cur), _occDate: toIso(cur), _isRecurrence: true });
        }
        cur.setDate(cur.getDate() + 1);
      }
      continue;
    }
    if (r.freq === 'monthly') {
      let cur = new Date(scanStart);
      cur.setDate(anchor.getDate());
      // If we jumped past scanStart by setting the day, walk back one month
      if (cur.getTime() < scanStart.getTime()) cur.setMonth(cur.getMonth() + 1);
      while (cur.getTime() <= endMs) {
        // Guard for months without the anchor day (e.g. Feb 30 → skip)
        if (cur.getDate() === anchor.getDate()) {
          out.push({ ...e, date: toIso(cur), _occDate: toIso(cur), _isRecurrence: true });
        }
        cur.setMonth(cur.getMonth() + 1);
        cur.setDate(anchor.getDate());
      }
      continue;
    }
    // Unknown freq — render as one-off
    out.push(e);
  }
  return out;
}

// Given a recurring task, return the ISO date (YYYY-MM-DD) of its next
// scheduled occurrence after its current due_date — or null if the task
// isn't recurring. Same recurrence shape used by events
// ({ freq, days, time }). Computed in local time so a US-evening "next
// Wednesday" doesn't slip a day.
function computeNextDue(task) {
  const r = task && task.recurrence;
  if (!r || !r.freq || r.freq === 'none') return null;
  const base = task.due_date ? new Date(task.due_date + 'T12:00:00') : new Date();
  let d = null;
  if (r.freq === 'daily') {
    d = new Date(base); d.setDate(d.getDate() + 1);
  } else if (r.freq === 'monthly') {
    d = new Date(base); d.setMonth(d.getMonth() + 1);
  } else if ((r.freq === 'weekly' || r.freq === 'custom') && Array.isArray(r.days) && r.days.length > 0) {
    const sorted = [...r.days].sort((a, b) => a - b);
    const cur = base.getDay(); // 0-6 (Sun-Sat)
    const nextDay = sorted.find(x => x > cur) ?? sorted[0];
    const diff = nextDay > cur ? nextDay - cur : 7 - cur + nextDay;
    d = new Date(base); d.setDate(d.getDate() + diff);
  }
  if (!d) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Completed tasks auto-vanish 72h after they're checked off (the DB purge
// lives in fetchAll; the Tasks section also hides them live at this mark).
const COMPLETED_TTL_MS = 72 * 60 * 60 * 1000;

// Remaining time before a completed task disappears, e.g. "2d 6h" / "5h".
// null when there's no completed_at (older rows) or it's already past due.
function completedTtlLabel(completedAt, now = Date.now()) {
  if (!completedAt) return null;
  const remaining = COMPLETED_TTL_MS - (now - new Date(completedAt).getTime());
  if (remaining <= 0) return null;
  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  if (hours >= 24) {
    const d = Math.floor(hours / 24);
    const h = hours % 24;
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  return `${hours}h`;
}

// Force a re-render on a fixed interval (used so the completed-task
// countdown ticks down even when nothing else changes — every 6 hours).
function useRerenderEvery(ms) {
  const [, force] = React.useReducer(x => (x + 1) % 1e9, 0);
  React.useEffect(() => {
    const id = setInterval(force, ms);
    return () => clearInterval(id);
  }, [ms]);
}

// ─── Task Row ────────────────────────────────────────────────────────────────
function TaskRow({ task, assignee, myId, onToggle, onDelete, onClick, ttl }) {
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
            {formatDue(task.due_date)}{task.due_time ? ` · ${formatTime12(task.due_time)}` : ''}
          </div>
        )}
        {ttl && (
          <div style={{ fontSize: 10, marginTop: 3, fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }} title="This completed task auto-removes 72h after completion">
            <span aria-hidden>🗑</span> disappears in {ttl}
          </div>
        )}
        {task.space_id && (
          <div style={{ marginTop: 6 }}><SpaceTag spaceId={task.space_id} /></div>
        )}
      </div>
    </div>
    </SwipeToDelete>
  );
}

// ─── Tasks Section ────────────────────────────────────────────────────────────
// The four big sections are memoized so MainApp-level state churn that
// doesn't touch their props (bell menu, scroll-driven tab sync, modal
// opens) skips re-rendering hundreds of rows. MainApp passes only
// useCallback'd handlers and primitive/stable values for this to work.
const TasksSection = React.memo(function TasksSection({ tasks, members, myId, getProfile, onToggle, onAdd, onAddPersonal, onDelete, onShowTask, collapsed, onToggleCollapse, filter, setFilter }) {
  const [showDone, setShowDone] = React.useState(false);
  // Personal view gets its own completed-toggle so expanding "Completed"
  // in one view doesn't silently expand it in the other.
  const [showDonePersonal, setShowDonePersonal] = React.useState(false);
  // Two-view toggle: 'group' shows the shared tasks grouped by
  // assignee, 'personal' shows only this user's private todos.
  const [view, setView] = React.useState('group');

  // Re-render every 6h so the completed-task "disappears in …" countdown
  // ticks down and rows past the 72h mark drop out, even with the app
  // left open. `now` is read fresh each render.
  useRerenderEvery(6 * 60 * 60 * 1000);
  const now = Date.now();
  const isFresh = (t) => !t.completed_at || (now - new Date(t.completed_at).getTime()) < COMPLETED_TTL_MS;

  const applyFilter = (list) => list.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'week') {
      if (!t.due_date) return true;
      const diff = Math.round((new Date(t.due_date + 'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000);
      return diff <= 7;
    }
    return true;
  });

  // Personal todos are flagged is_private and only ever surfaced to
  // the creator (RLS enforces this server-side too). Everything else
  // is "shared" — grouped by assignee like before.
  const sharedTasks   = tasks.filter(t => !t.is_private);
  const personalTasks = tasks.filter(t => t.is_private && t.created_by === myId);

  const filtered = applyFilter(sharedTasks);
  const filteredPersonal = applyFilter(personalTasks);

  const openItems = filtered.filter(t => !t.completed);
  const doneItems = filtered.filter(t => t.completed && isFresh(t));
  const openPersonal = filteredPersonal.filter(t => !t.completed);
  const donePersonal = filteredPersonal.filter(t => t.completed && isFresh(t));

  const grouped = members.map(m => ({
    member: m,
    items: openItems.filter(t => t.assigned_to === m.id),
  })).filter(g => g.items.length > 0);

  const unassigned = openItems.filter(t => !t.assigned_to);
  const openCount = sharedTasks.filter(t => !t.completed).length;
  const personalCount = personalTasks.filter(t => !t.completed).length;

  return (
    <section className={'fb-sec' + (collapsed ? ' collapsed' : '')} id="sec-tasks">
      <div className="fb-sec-hd">
        <div className="fb-sec-hd-left">
          <h2 className="fb-sec-title">Tasks</h2>
          <SectionToggle collapsed={collapsed} onClick={onToggleCollapse} />
        </div>
        <div className="fb-sec-hd-right">
          <div className="fb-sec-meta">{view === 'group' ? `${openCount} open` : `${personalCount} open`}</div>
        </div>
      </div>

      {!collapsed && (<>
      {/* View toggle: shared group tasks vs the current user's
          private todos. Counts shown so the inactive tab still
          surfaces unread/pending work. */}
      <div className="task-view-toggle">
        <button
          type="button"
          className={'task-view-tab' + (view === 'group' ? ' on' : '')}
          onClick={() => setView('group')}
        >
          Group
          <span className="task-view-count">{openCount}</span>
        </button>
        <button
          type="button"
          className={'task-view-tab' + (view === 'personal' ? ' on' : '')}
          onClick={() => setView('personal')}
        >
          🔒 Personal
          <span className="task-view-count">{personalCount}</span>
        </button>
      </div>

      <div className="fb-chips">
        {[['week', 'This week'], ['all', 'All']].map(([k, label]) => (
          <button key={k} className={'fb-chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {view === 'group' && (<>
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
                  <MemberName profile={g.member} isMe={g.member.id === myId} style={{ fontSize: 14 }} />
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
                    <TaskRow key={t.id} task={t} assignee={getProfile(t.assigned_to)} myId={myId} onToggle={() => onToggle(t.id, t.completed)} onDelete={() => onDelete(t.id)} onClick={onShowTask ? () => onShowTask(t) : undefined} ttl={completedTtlLabel(t.completed_at, now)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </>)}

      {/* ── Personal todos view ────────────────────────────────────
          Private to the current user — RLS hides these rows from
          every other group member. Same layout as a flat tasklist
          since assignee is always "me". */}
      {view === 'personal' && (<>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>🔒 Only you can see these.</div>
        <button className="fb-btn" onClick={onAddPersonal || onAdd}>
          <span className="plus">+</span> Add personal task
        </button>
        {openPersonal.length === 0 && donePersonal.length === 0 ? (
          <div className="kbd-hint" style={{ padding: '20px 0' }}>NO PERSONAL TODOS — ADD ONE ABOVE</div>
        ) : (
          <div className="fb-listbox">
            <div className="fb-listbox-legend">Your private list</div>
            {openPersonal.length > 0 && (
              <div className="tasklist">
                {openPersonal.map(t => (
                  <TaskRow key={t.id} task={t} assignee={getProfile(t.assigned_to)} myId={myId} onToggle={() => onToggle(t.id, t.completed)} onDelete={() => onDelete(t.id)} onClick={onShowTask ? () => onShowTask(t) : undefined} />
                ))}
              </div>
            )}
            {donePersonal.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <button
                  onClick={() => setShowDonePersonal(s => !s)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', background: 'none', border: 0, borderTop: '1px solid var(--rule)', cursor: 'pointer', font: 'inherit' }}
                >
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.55 }}>
                    Completed · {donePersonal.length}
                  </span>
                  <span style={{ opacity: 0.5, fontSize: 12 }}>{showDonePersonal ? '▴ hide' : '▾ show'}</span>
                </button>
                {showDonePersonal && (
                  <div className="tasklist">
                    {donePersonal.map(t => (
                      <TaskRow key={t.id} task={t} assignee={getProfile(t.assigned_to)} myId={myId} onToggle={() => onToggle(t.id, t.completed)} onDelete={() => onDelete(t.id)} onClick={onShowTask ? () => onShowTask(t) : undefined} ttl={completedTtlLabel(t.completed_at, now)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </>)}
      </>)}
    </section>
  );
});

// ─── Calendar Section ─────────────────────────────────────────────────────────
const CalendarSection = React.memo(function CalendarSection({ events, expandedEvents, members, getProfile, myId, onAdd, onAddPersonal, onDayClick, onDelete, onShowMonth, onShowEvent, collapsed, onToggleCollapse, view, setView }) {
  const now = new Date();
  const [calYear, setCalYear] = React.useState(now.getFullYear());
  const [calMonth, setCalMonth] = React.useState(now.getMonth());
  // 'group' shows shared events; 'personal' shows only events the
  // current user created with is_private=true. State lives in MainApp
  // so the day-details popup can scope its list to the same view.

  const cells = buildCalendar(calYear, calMonth);
  const todayD = now.getDate();
  const isCurrentMonth = calYear === now.getFullYear() && calMonth === now.getMonth();

  const groupOpenCount = events.filter(e => !e.is_private).length;
  const personalOpenCount = events.filter(e => e.is_private && e.created_by === myId).length;

  // MainApp already expands recurring events into per-occurrence
  // instances (expandedEvents) for the day modal — reuse that result
  // here instead of running the expansion a second time, and just
  // scope it to the Group/Personal toggle. Expansion preserves
  // is_private/created_by, so filtering after expanding is equivalent.
  const expanded = React.useMemo(() => {
    if (view === 'personal') {
      return expandedEvents.filter(e => e.is_private && e.created_by === myId);
    }
    return expandedEvents.filter(e => !e.is_private);
  }, [expandedEvents, view, myId]);

  const monthEvents = expanded.filter(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  });

  // Keyed by full ISO date so dim cells (prev/next month days visible
  // in the grid) can render their events too. monthEvents stays
  // scoped to the current month for the section header count and the
  // "view all" modal.
  const eventsByDate = {};
  expanded.forEach(e => {
    eventsByDate[e.date] = eventsByDate[e.date] || [];
    eventsByDate[e.date].push(e);
  });

  // Upcoming events are filtered by the tab above the list.
  //   week  = today through end of the current calendar week (Saturday)
  //   month = today through end of the current calendar month
  //   all   = everything from today onward (within the expansion window)
  // Default to "week" since that's the most common quick-glance view.
  const [upcomingFilter, setUpcomingFilter] = React.useState('week');
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const endOfWeek = new Date(todayStart);
  endOfWeek.setDate(endOfWeek.getDate() + (6 - todayStart.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);
  const endOfMonth = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0, 23, 59, 59, 999);
  const upcomingRangeEnd =
    upcomingFilter === 'week'  ? endOfWeek  :
    upcomingFilter === 'month' ? endOfMonth :
    null; // 'all' — no upper bound
  const upcoming = expanded
    .filter(e => {
      const d = new Date(e.date + 'T00:00:00');
      if (d < todayStart) return false;
      if (upcomingRangeEnd && d > upcomingRangeEnd) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time || '99').localeCompare(b.start_time || '99'));

  // Pagination — mirrors the home feed's "load more / see less" pills.
  // Show the first 7 events, then a +10 bump per click; "see less"
  // collapses back to 7. Switching tabs resets the limit so the new
  // range starts compact rather than inheriting a previous expansion.
  const EVENTS_INITIAL = 7;
  const EVENTS_STEP    = 10;
  const [eventsLimit, setEventsLimit] = React.useState(EVENTS_INITIAL);
  React.useEffect(() => { setEventsLimit(EVENTS_INITIAL); }, [upcomingFilter]);
  const visibleUpcoming = upcoming.slice(0, eventsLimit);
  const hiddenEvents = Math.max(0, upcoming.length - visibleUpcoming.length);

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const goToday = () => { setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); };

  return (
    <section className={'fb-sec' + (collapsed ? ' collapsed' : '')} id="sec-calendar">
      <div className="fb-sec-hd">
        <div className="fb-sec-hd-left">
          <h2 className="fb-sec-title">Calendar</h2>
          <SectionToggle collapsed={collapsed} onClick={onToggleCollapse} />
        </div>
        <div className="fb-sec-hd-right">
          <button
            className="copy-btn"
            onClick={() => onShowMonth?.({ monthName: MONTH_NAMES[calMonth], year: calYear, events: monthEvents })}
            title="View all events this month"
          >
            {monthEvents.length} {monthEvents.length === 1 ? 'event' : 'events'}
          </button>
        </div>
      </div>

      {!collapsed && (<>
      {/* View toggle: shared group events vs the current user's
          private events. Counts shown so the inactive tab still
          surfaces what's queued. */}
      <div className="task-view-toggle">
        <button
          type="button"
          className={'task-view-tab' + (view === 'group' ? ' on' : '')}
          onClick={() => setView('group')}
        >
          Group
          <span className="task-view-count">{groupOpenCount}</span>
        </button>
        <button
          type="button"
          className={'task-view-tab' + (view === 'personal' ? ' on' : '')}
          onClick={() => setView('personal')}
        >
          🔒 Personal
          <span className="task-view-count">{personalOpenCount}</span>
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
          let cellYear = calYear, cellMonth = calMonth;
          if (c.m === 'prev') { cellMonth = calMonth - 1; if (cellMonth < 0) { cellMonth = 11; cellYear--; } }
          else if (c.m === 'next') { cellMonth = calMonth + 1; if (cellMonth > 11) { cellMonth = 0; cellYear++; } }
          const cellIso = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;
          const evs = eventsByDate[cellIso] || [];
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
                // Recurring instances share an event id across dates, so
                // include the occurrence date in the key to keep React's
                // reconciler from collapsing two chips on the same day.
                const key = `${e.id}::${e._occDate || e.date}`;
                return (
                  <div key={key} className="evt-chip" style={{ background: getColor(p?.color || e.color), fontSize: 11, lineHeight: 1.2, padding: '3px 5px', borderRadius: 4, color: '#fff', overflow: 'hidden', wordBreak: 'break-word', overflowWrap: 'anywhere', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, marginTop: 2, cursor: 'pointer' }} title={e.title}>
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
            <Dot profile={m} /> <MemberName profile={m} isMe={m.id === myId} />
          </span>
        ))}
      </div>

      {/* Two explicit Add buttons so the user doesn't have to flip
          the Group/Personal toggle just to drop something in the
          other bucket. The button label is always clear about
          which calendar the new event lands in. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          className="fb-btn"
          onClick={onAdd}
          style={{ flex: 1 }}
        >
          <span className="plus">+</span> Group event
        </button>
        <button
          className="fb-btn"
          onClick={onAddPersonal || onAdd}
          style={{ flex: 1 }}
        >
          <span aria-hidden style={{ marginRight: 4 }}>🔒</span> Personal event
        </button>
      </div>

      {/* Range tabs for the Upcoming list. "This week" = today through
          Saturday, "This month" = today through end of the current
          month. Same chip styling used by the Tasks filter for visual
          consistency. */}
      <div className="fb-chips" style={{ marginTop: 14 }}>
        {[['week', 'This week'], ['month', 'This month'], ['all', 'All']].map(([k, label]) => (
          <button
            key={k}
            className={'fb-chip' + (upcomingFilter === k ? ' on' : '')}
            onClick={() => setUpcomingFilter(k)}
          >{label}</button>
        ))}
      </div>

      <div className="upcoming-box">
        <div className="upcoming-legend">Upcoming</div>
        {upcoming.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 2px' }}>
            No events {upcomingFilter === 'week' ? 'this week' : upcomingFilter === 'month' ? 'this month' : 'scheduled'}.
          </div>
        ) : (
          <div className="upcoming">
            {visibleUpcoming.map(e => {
              const p = getProfile(e.created_by);
              const d = new Date(e.date + 'T00:00:00');
              const key = `${e.id}::${e._occDate || e.date}`;
              return (
                <SwipeToDelete key={key} onDelete={() => onDelete(e.id)} disabled={e.created_by !== myId}>
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
                    <div className="ti">
                      {renderWithMentions(e.title, false, members)}
                      {e._isRecurrence && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }} title="Recurring">↻</span>}
                    </div>
                    <div className="sub">
                      {e.start_time && <span>{fmtTime(e.start_time)}{e.end_time ? `–${fmtTime(e.end_time)}` : ''}</span>}
                      {e.start_time && <span>·</span>}
                      {p && <><Dot profile={p} /><MemberName profile={p} isMe={p.id === myId} /></>}
                    </div>
                  </div>
                </div>
                </SwipeToDelete>
              );
            })}
          </div>
        )}
        {/* Load-more / see-less pills — same pattern as the home feed.
            Shown only when there's something to reveal or to collapse. */}
        {(hiddenEvents > 0 || eventsLimit > EVENTS_INITIAL) && (
          <div className="feed-more-row">
            {hiddenEvents > 0 && (
              <button
                type="button"
                className="feed-more-pill"
                onClick={() => setEventsLimit(l => l + EVENTS_STEP)}
                aria-label={`Load ${Math.min(EVENTS_STEP, hiddenEvents)} more events`}
              >
                <span className="feed-more-arrow" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M7 3v8m0 0l-3.5-3.5M7 11l3.5-3.5"
                          stroke="currentColor" strokeWidth="1.8"
                          fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="feed-more-text">load more events</span>
              </button>
            )}
            {eventsLimit > EVENTS_INITIAL && (
              <button
                type="button"
                className="feed-more-pill feed-less-pill"
                onClick={() => setEventsLimit(EVENTS_INITIAL)}
                aria-label="Collapse the upcoming list back to the next few events"
              >
                <span className="feed-more-arrow" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path d="M7 11V3m0 0l-3.5 3.5M7 3l3.5 3.5"
                          stroke="currentColor" strokeWidth="1.8"
                          fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="feed-more-text">see less</span>
              </button>
            )}
          </div>
        )}
      </div>
      </>)}
    </section>
  );
});

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
function FeedPost({ n, author, isMe, prevNote, nextNote, myId, members, replyToNote, replyToAuthor, onOpenNote, onDelete, onTogglePin, onShowMember, onVote, onStartReply, actionBarOpen, onLongPress, onCloseActionBar, inPinned = false }) {
  const when = new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const type = n.type || 'message';
  const isDeleted = !!(n.payload && n.payload.deleted);
  const canDelete = n.created_by === myId && !isDeleted;
  const authorColor = getColor(author?.color);

  // ── Soft-deleted tombstone ──────────────────────────────────────────────
  // Replaces the entire bubble with a small italic "deleted" line in the
  // date-style font. The note row is kept (reply chains still resolve to
  // the deleted post — its quote pill just says "deleted"), but every
  // interaction (long-press, swipe-to-delete, modal open) is suppressed
  // so the tombstone behaves like a passive marker.
  if (isDeleted) {
    return (
      <div className={`chat-row ${isMe ? 'me' : 'them'}`}>
        <div className="feed-deleted" aria-label="Deleted post">deleted</div>
      </div>
    );
  }

  // ── Long-press detection ────────────────────────────────────────────────
  // Hold on a bubble for ~450ms → onLongPress(n) fires, which causes the
  // parent (NotesSection) to mount the floating Reply action bar above
  // this post. A normal short tap/click still falls through to onOpenNote
  // (the post detail modal). Any pointer movement beyond ~10px aborts
  // the press (so scrolling/swiping never trips it).
  const pressTimerRef = React.useRef(null);
  const pressStartRef = React.useRef({ x: 0, y: 0, fired: false });
  const LONG_PRESS_MS = 450;
  const PRESS_CANCEL_PX = 10;

  const cancelLongPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handlePressDown = (e) => {
    pressStartRef.current = {
      x: e.clientX ?? 0,
      y: e.clientY ?? 0,
      fired: false,
    };
    cancelLongPress();
    pressTimerRef.current = setTimeout(() => {
      pressStartRef.current.fired = true;
      pressTimerRef.current = null;
      try { navigator.vibrate?.(12); } catch {}
      onLongPress?.(n);
    }, LONG_PRESS_MS);
  };

  const handlePressMove = (e) => {
    if (!pressTimerRef.current) return;
    const dx = (e.clientX ?? 0) - pressStartRef.current.x;
    const dy = (e.clientY ?? 0) - pressStartRef.current.y;
    if (Math.abs(dx) > PRESS_CANCEL_PX || Math.abs(dy) > PRESS_CANCEL_PX) {
      cancelLongPress();
    }
  };

  const handlePressEnd = () => {
    cancelLongPress();
  };

  // Short-click handler used by every bubble:
  //   • If a long-press just fired → suppress (so the action-bar
  //     pop doesn't immediately race a modal open).
  //   • If this post is a plain Message → no-op. Messages are the
  //     only type with NO detail modal; the only way to interact
  //     with one is long-press → reply.
  //   • Everything else (Urgent / Reminder / Photos / Poll) → open
  //     the detail modal as before.
  const handleBubbleClick = (e) => {
    if (pressStartRef.current.fired) {
      e.preventDefault();
      e.stopPropagation();
      pressStartRef.current.fired = false;
      return;
    }
    if (type === 'message') return;
    onOpenNote?.(n);
  };

  // Props sprinkled onto every interactive bubble/card so long-press
  // (and the click-after-long-press suppression) work consistently.
  // NOTE: deliberately no `style` here — the bubble's own style sets
  // the `--bubble-c` color variable, and JSX `{...spread}` style would
  // *replace* it (React doesn't merge style props). The user-select /
  // touch-callout suppression lives in CSS instead — see
  // `.chat-bubble, .announcement-card` in styles.css.
  const pressHandlers = {
    onPointerDown: handlePressDown,
    onPointerMove: handlePressMove,
    onPointerUp: handlePressEnd,
    onPointerCancel: handlePressEnd,
    onPointerLeave: handlePressEnd,
    onContextMenu: (e) => e.preventDefault(), // block iOS callout / right-click menu
  };

  // Floating action bar — appears just above the bubble when this post
  // is the long-pressed one. Always shows "Reply"; shows "Delete" when
  // the viewer is the post's author (same gate as the swipe-to-delete
  // affordance). Tapping Delete soft-deletes the post — the row stays
  // in the feed as a "deleted" tombstone so reply chains still resolve.
  // NOTE: held as plain JSX (not an inner component) — defining a
  // component inside render gives React a new type every pass, which
  // unmounted and remounted this subtree on every feed re-render.
  const actionBar = !actionBarOpen ? null : (
      <div
        className="bubble-action-bar"
        role="menu"
        aria-label="Message actions"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="bubble-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onCloseActionBar?.();
            onStartReply?.(n);
          }}
        >
          <span className="bubble-action-icon" aria-hidden>↩</span>
          <span>Reply</span>
        </button>
        {canDelete && (
          <button
            type="button"
            className="bubble-action-btn bubble-action-delete"
            onClick={(e) => {
              e.stopPropagation();
              onCloseActionBar?.();
              onDelete?.(n.id);
            }}
          >
            <span className="bubble-action-icon" aria-hidden>🗑</span>
            <span>Delete</span>
          </button>
        )}
      </div>
    );

  // Shared bubble caption — sits BELOW every bubble, on the same side
  // as the bubble (right for "me", left for "them"). Avatar precedes
  // the name; name is colored to the author's profile color. Tapping
  // the caption opens the member detail sheet (same as tapping the
  // old side avatar did).
  //
  // Streaking: when the same author sends multiple posts in a row,
  // only the EARLIEST (oldest) of the streak shows the caption.
  // The feed is sorted newest-first, so the oldest of a streak is
  // the BOTTOM-most one visually. We check `nextNote` (the message
  // directly BELOW this one in display = older in time): if it's
  // by the same author, this bubble has a continuation below it
  // and the caption should appear there instead. Pinned posts pass
  // nextNote=null, so each pinned bubble keeps its own caption.
  const caption = (nextNote && nextNote.created_by === n.created_by) ? null : (
    <div
      className="chat-caption"
      onClick={(e) => { e.stopPropagation(); if (author) onShowMember?.(author); }}
    >
      <Dot profile={author} />
      {isMe ? (
        <span className="chat-caption-name" style={{ color: 'var(--me-color)' }}>you</span>
      ) : (
        <span className="chat-caption-name" style={{ color: authorColor }}>
          {author?.display_name}
        </span>
      )}
    </div>
  );

  // "↩ Replying to …" header — rendered above the bubble when this
  // post is a reply to another post. Clicking it opens the original
  // post's detail modal so the user can see the full context.
  // The reply bubble owns all reply UI. The inset renders as a
  // DOM child of the chat-bubble div (the responder's bubble) — a
  // white pill quoting the original post: row 1 is [emoji + name],
  // row 2 is a snippet of the original message. Clicking opens the
  // original's detail modal. Returns null for non-reply posts so
  // non-reply bubbles are untouched.
  let replyInset = null;
  if (replyToNote) {
    const refColor = getColor(replyToAuthor?.color);
    const refType = replyToNote.type || 'message';
    const refDeleted = !!(replyToNote.payload && replyToNote.payload.deleted);
    let snippet = '';
    if (refDeleted) {
      snippet = '(deleted)';
    } else if (refType === 'photos') {
      const count = Array.isArray(replyToNote.payload?.photos)
        ? replyToNote.payload.photos.length : 0;
      snippet = count > 1 ? `${count} photos` : 'photo';
    } else if (refType === 'poll') {
      snippet = replyToNote.payload?.question || 'poll';
    } else {
      snippet = (replyToNote.content || '').replace(/@\[([^\]]+)\]/g, '@$1').slice(0, 220);
    }
    replyInset = (
      <button
        type="button"
        className="chat-bubble-reply-inset"
        onClick={(e) => { e.stopPropagation(); onOpenNote?.(replyToNote); }}
        title="Show original post"
      >
        <span className="chat-bubble-reply-line">
          <Dot profile={replyToAuthor} />
          {replyToAuthor && replyToAuthor.id === myId ? (
            <span className="chat-bubble-reply-name" style={{ color: 'var(--me-color)' }}>you</span>
          ) : (
            <span className="chat-bubble-reply-name" style={{ color: refColor }}>
              {replyToAuthor?.display_name || 'Unknown'}
            </span>
          )}
        </span>
        {snippet && (
          <span className="chat-bubble-reply-snippet">{snippet}</span>
        )}
      </button>
    );
  }

  // ── Announcement: full-width red, bold/italic, no bubble ────────────────
  if (type === 'announcement') {
    return (
      <SwipeToDelete onDelete={() => onDelete(n.id)} disabled={!canDelete}>
        <div className="post-press-wrap">
          {actionBar}
          <div
            className={'announcement-card' + (actionBarOpen ? ' pressed' : '')}
            onClick={handleBubbleClick}
            {...pressHandlers}
          >
            <div className="announcement-head">
              <span className="announcement-siren" aria-hidden>🚨</span>
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
                {isMe ? (
                  <span className="announcement-author" style={{ color: 'var(--me-color)' }}>you</span>
                ) : (
                  <span className="announcement-author" style={{ color: authorColor }}>
                    {author?.display_name}
                  </span>
                )}
              </span>
              <span className="announcement-time">{when}</span>
            </div>
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
            {actionBar}
            <div
              className={'chat-bubble has-tail' + (actionBarOpen ? ' pressed' : '')}
              style={{ '--bubble-c': authorColor }}
              onClick={handleBubbleClick}
              {...pressHandlers}
            >
              {replyInset}
              <div className="quick-update-label">REMINDER</div>
              <div className="chat-text">{renderWithMentions(n.content, isMe, members)}</div>
              <div className="chat-time">{when}</div>
            </div>
            {caption}
          </div>
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
            {actionBar}
            <div
              className={'chat-bubble photo-bubble has-tail' + (actionBarOpen ? ' pressed' : '')}
              style={{ '--bubble-c': authorColor }}
              onClick={handleBubbleClick}
              {...pressHandlers}
            >
              {replyInset}
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
            {caption}
          </div>
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
            {actionBar}
            <div
              className={'chat-bubble poll-bubble has-tail' + (actionBarOpen ? ' pressed' : '')}
              style={{ '--bubble-c': authorColor }}
              onClick={(e) => {
                // Don't pop the modal when clicking an option (handled by option click)
                if (e.target.closest('.poll-option')) return;
                handleBubbleClick(e);
              }}
              {...pressHandlers}
            >
              {replyInset}
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
            {caption}
          </div>
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
          {actionBar}
          <div
            className={'chat-bubble has-tail' + (actionBarOpen ? ' pressed' : '')}
            style={{ '--bubble-c': authorColor }}
            onClick={handleBubbleClick}
            {...pressHandlers}
          >
            {replyInset}
            <div className="chat-text">{renderWithMentions(n.content, isMe, members)}</div>
            <div className="chat-time">{when}</div>
          </div>
          {n.space_id && (
            <div style={{ marginTop: 4, display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <SpaceTag spaceId={n.space_id} />
            </div>
          )}
          {caption}
        </div>
      </div>
    </SwipeToDelete>
  );
}

// ─── Inline Reply Composer ────────────────────────────────────────────────────
// Renders at the top of the home feed when the user clicks the ↩ button on
// any post. Mirrors iMessage's reply-context bar: shows who you're replying
// to + a snippet of their message, plus an input + send. Submitting calls
// onSubmit(content) which posts a regular note with payload.reply_to set —
// the new reply then appears at the top of the feed automatically.
function ReplyComposer({ target, targetAuthor, myId, onCancel, onSubmit }) {
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    // Autofocus the input the instant the composer mounts
    inputRef.current?.focus();
  }, []);

  const color = getColor(targetAuthor?.color);
  const refType = target.type || 'message';
  let snippet = '';
  if (refType === 'photos') {
    const count = Array.isArray(target.payload?.photos) ? target.payload.photos.length : 0;
    snippet = count > 1 ? `${count} photos` : 'photo';
  } else if (refType === 'poll') {
    snippet = target.payload?.question || 'poll';
  } else {
    snippet = (target.content || '').slice(0, 80);
  }

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try { await onSubmit(t); }
    finally { setSending(false); }
  };

  return (
    <div className="reply-composer">
      <div className="reply-composer-ref">
        <span className="reply-composer-arrow" aria-hidden>↩</span>
        <Dot profile={targetAuthor} />
        {targetAuthor && targetAuthor.id === myId ? (
          <span className="reply-composer-name" style={{ color: 'var(--me-color)' }}>you</span>
        ) : (
          <span className="reply-composer-name" style={{ color }}>
            {targetAuthor?.display_name || 'Unknown'}
          </span>
        )}
        {snippet && <span className="reply-composer-snippet">{snippet}</span>}
        <button
          type="button"
          className="reply-composer-cancel"
          onClick={onCancel}
          aria-label="Cancel reply"
          title="Cancel reply"
        >✕</button>
      </div>
      <div className="reply-composer-row">
        <input
          ref={inputRef}
          className="reply-composer-input"
          type="text"
          placeholder={`Reply to ${targetAuthor?.display_name || 'message'}…`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === 'Escape') onCancel();
          }}
          disabled={sending}
        />
        <button
          type="button"
          className="reply-composer-send"
          onClick={submit}
          disabled={!text.trim() || sending}
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ─── Quick Composer ───────────────────────────────────────────────────────────
// One-line message input at the top of the Home Feed so firing off a
// plain message is tap + type + send. The full "+ Post" modal stays
// for Urgent / Photos / Polls / posts that create tasks or events.
// No autoFocus — the keyboard waits for an intentional tap (iOS).
function QuickComposer({ onPost }) {
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await onPost(t);
      setText('');
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="quick-composer">
      <input
        className="quick-composer-input"
        type="text"
        value={text}
        placeholder="Send a quick message…"
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        disabled={sending}
      />
      <button
        type="button"
        className="quick-composer-send"
        onClick={submit}
        disabled={!text.trim() || sending}
        aria-label="Send message"
      >
        {sending ? '…' : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}

const NotesSection = React.memo(function NotesSection({ notes, members, getProfile, myId, onAdd, onDelete, onTogglePin, onOpenNote, onShowMember, onVote, onReply, onQuickPost, collapsed, onToggleCollapse }) {
  // Inline reply state — long-pressing a post and then tapping the
  // floating "Reply" pill stashes the target here, which makes the
  // ReplyComposer slide in at the top of the feed (no modal). The
  // composer submits a regular note with payload.reply_to = target.id,
  // so the reply lands at the top of the feed with the "↩ Replying
  // to …" pill above it.
  const [replyingTo, setReplyingTo] = React.useState(null);

  // Long-press action-bar state — the note currently showing its
  // floating "Reply" pill. Only one post can have the bar open at a
  // time. Tap-outside or Escape dismisses it.
  const [actionBarFor, setActionBarFor] = React.useState(null);

  // Pagination — both lists use the same "load more / see less"
  // pattern: render the first N items, then a pill at the bottom
  // grows or resets the cap. Keeping the pinned section compact by
  // default (only 2 items) so urgent/reminder posts don't dominate
  // the feed before the user opts in.
  const FEED_INITIAL   = 7;
  const FEED_STEP      = 10;
  const PINNED_INITIAL = 2;
  const PINNED_STEP    = 5;
  const [feedLimit,   setFeedLimit]   = React.useState(FEED_INITIAL);
  const [pinnedLimit, setPinnedLimit] = React.useState(PINNED_INITIAL);

  React.useEffect(() => {
    if (!actionBarFor) return;
    const onDocDown = (e) => {
      // Clicks inside the bar (or on the bubble currently long-pressed)
      // are handled by their own onClick handlers, so any click that
      // doesn't hit something we care about should close the bar.
      if (e.target.closest && e.target.closest('.bubble-action-bar')) return;
      setActionBarFor(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setActionBarFor(null);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [actionBarFor]);

  // Pinned section — shows:
  //   • every Urgent (announcement) — auto-pinned, lives only here
  //   • every Reminder (quick_update) — auto-pinned, lives only here
  //   • any other non-message post that the user pinned manually
  // Sorts use plain string compare — created_at is ISO-8601, which is
  // already lexicographically ordered, so there's no need to allocate
  // two Date objects per comparison on every render.
  const pinned = notes
    .filter(n => {
      const type = n.type || 'message';
      if (type === 'announcement' || type === 'quick_update') return true;
      return n.pinned && type !== 'message';
    })
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  // Main feed: NEWEST first (top). Anything in the Pinned section is
  // explicitly excluded — pinned items live ONLY in pinned so they
  // never appear in two places. (Urgent/Reminder are always pinned,
  // and manually-pinned posts also drop out of the main feed.)
  const sorted = notes
    .filter(n => {
      const type = n.type || 'message';
      if (type === 'announcement' || type === 'quick_update') return false;
      if (n.pinned && type !== 'message') return false; // manually-pinned non-messages
      return true;
    })
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  // O(1) reply-target lookups — the feed loop used notes.find() per
  // post, which was quadratic in feed length.
  const noteById = React.useMemo(() => new Map(notes.map(n => [n.id, n])), [notes]);

  // Slice both lists to their current limits — the "load more" pill
  // bumps the limit by *_STEP each click; the "see less" pill resets
  // it back to *_INITIAL.
  const visiblePinned = pinned.slice(0, pinnedLimit);
  const pinnedHidden  = Math.max(0, pinned.length - visiblePinned.length);
  const visibleSorted = sorted.slice(0, feedLimit);
  const hiddenCount   = Math.max(0, sorted.length - visibleSorted.length);

  return (
    <section className={'fb-sec' + (collapsed ? ' collapsed' : '')} id="sec-notes">
      <div className="fb-sec-hd">
        <div className="fb-sec-hd-left">
          <h2 className="fb-sec-title">Home Feed</h2>
          <SectionToggle collapsed={collapsed} onClick={onToggleCollapse} />
        </div>
        <div className="fb-sec-hd-right">
          <div className="fb-sec-meta">{notes.length} {notes.length === 1 ? 'post' : 'posts'}</div>
        </div>
      </div>

      {!collapsed && (<>

      {/* Quick composer — plain messages without opening the modal. */}
      {onQuickPost && <QuickComposer onPost={onQuickPost} />}

      {/* Whole feed lives in one shaded glass box — same family as the
          Tasks "To-do" container — so the section reads as a single
          unified surface. Pinned is its own (slightly more saturated)
          sub-box nested inside, so the two regions visually separate. */}
      {(pinned.length > 0 || sorted.length > 0 || replyingTo) ? (
        <div className="feed-box">
          {/* Inline reply composer — slides in at the top of the feed
              when the user clicks ↩ on any post. Submits a normal note
              with payload.reply_to so the reply appears in the main
              feed (newest-first → top) with the threading reference. */}
          {replyingTo && (
            <ReplyComposer
              target={replyingTo}
              targetAuthor={getProfile(replyingTo.created_by)}
              myId={myId}
              onCancel={() => setReplyingTo(null)}
              onSubmit={async (content) => {
                await onReply?.(replyingTo.id, content);
                setReplyingTo(null);
              }}
            />
          )}

          {/* Pinned sub-section — only shown when something is pinned.
              Renders the first PINNED_INITIAL items; the pills below
              expand / reset the count. */}
          {pinned.length > 0 && (
            <div className="pinned-section">
              <div className="pinned-header">
                <span className="pinned-icon">📌</span>
                <span className="pinned-label">PINNED</span>
                <span className="pinned-count">{pinned.length}</span>
              </div>
              <div className="pinned-list">
                {visiblePinned.map(n => {
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
                      onStartReply={setReplyingTo}
                      actionBarOpen={actionBarFor?.id === n.id}
                      onLongPress={(note) => setActionBarFor(note)}
                      onCloseActionBar={() => setActionBarFor(null)}
                      inPinned={true}
                    />
                  );
                })}
              </div>
              {(pinnedHidden > 0 || pinnedLimit > PINNED_INITIAL) && (
                <div className="feed-more-row">
                  {pinnedHidden > 0 && (
                    <button
                      type="button"
                      className="feed-more-pill"
                      onClick={() => setPinnedLimit(l => l + PINNED_STEP)}
                      aria-label={`Load ${Math.min(PINNED_STEP, pinnedHidden)} more pinned posts`}
                    >
                      <span className="feed-more-arrow" aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                          <path d="M7 3v8m0 0l-3.5-3.5M7 11l3.5-3.5"
                                stroke="currentColor" strokeWidth="1.8"
                                fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="feed-more-text">load more pinned</span>
                    </button>
                  )}
                  {pinnedLimit > PINNED_INITIAL && (
                    <button
                      type="button"
                      className="feed-more-pill feed-less-pill"
                      onClick={() => setPinnedLimit(PINNED_INITIAL)}
                      aria-label="Collapse pinned list"
                    >
                      <span className="feed-more-arrow" aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                          <path d="M7 11V3m0 0l-3.5 3.5M7 3l3.5 3.5"
                                stroke="currentColor" strokeWidth="1.8"
                                fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="feed-more-text">see less</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {visibleSorted.length > 0 && (
            <div className="chat-feed">
              {visibleSorted.map((n, i) => {
                const author = getProfile(n.created_by);
                const isMe = n.created_by === myId;
                const prevNote = i > 0 ? visibleSorted[i - 1] : null;
                const nextNote = i < visibleSorted.length - 1 ? visibleSorted[i + 1] : null;
                // Resolve the post being replied-to (if this post is
                // itself a reply) so FeedPost can render a small
                // "↩ Replying to …" link above the bubble.
                const replyToId = n.payload && n.payload.reply_to;
                const replyToNote = replyToId
                  ? noteById.get(replyToId) || null
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
                    onStartReply={setReplyingTo}
                    actionBarOpen={actionBarFor?.id === n.id}
                    onLongPress={(note) => setActionBarFor(note)}
                    onCloseActionBar={() => setActionBarFor(null)}
                  />
                );
              })}
            </div>
          )}

          {/* "↓ load more messages" / "↑ see less" pills — load-more
              shown when older posts are hidden; see-less shown once
              the user has clicked load-more at least once. */}
          {(hiddenCount > 0 || feedLimit > FEED_INITIAL) && (
            <div className="feed-more-row">
              {hiddenCount > 0 && (
                <button
                  type="button"
                  className="feed-more-pill"
                  onClick={() => setFeedLimit(l => l + FEED_STEP)}
                  aria-label={`Load ${Math.min(FEED_STEP, hiddenCount)} more messages`}
                >
                  <span className="feed-more-arrow" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M7 3v8m0 0l-3.5-3.5M7 11l3.5-3.5"
                            stroke="currentColor" strokeWidth="1.8"
                            fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="feed-more-text">load more messages</span>
                </button>
              )}
              {feedLimit > FEED_INITIAL && (
                <button
                  type="button"
                  className="feed-more-pill feed-less-pill"
                  onClick={() => setFeedLimit(FEED_INITIAL)}
                  aria-label="Collapse the feed back to the most recent messages"
                >
                  <span className="feed-more-arrow" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                      <path d="M7 11V3m0 0l-3.5 3.5M7 3l3.5 3.5"
                            stroke="currentColor" strokeWidth="1.8"
                            fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="feed-more-text">see less</span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="kbd-hint" style={{ padding: '24px 0' }}>NO POSTS YET — TAP "POST" BELOW</div>
      )}

      <button className="fb-btn" onClick={onAdd} style={{ marginTop: 14 }}>
        <span className="plus">+</span> Post
      </button>
      </>)}
    </section>
  );
});

// ─── Date Picker Modal ────────────────────────────────────────────────────────
// Full-size calendar grid date picker, sized like the rest of the
// app's modals so the day cells are large thumb targets — replaces
// the cramped native browser <input type="date"> popup that triggers
// when you tap a date field on mobile.
function DatePickerModal({ open, value, title, onClose, onPick, minDate }) {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const todayObj  = React.useMemo(() => new Date(), []);
  const todayIso  = toLocalISO(todayObj);
  const initial   = value ? new Date(value + 'T00:00:00') : todayObj;
  const [viewMonth, setViewMonth] = React.useState(initial.getMonth());
  const [viewYear,  setViewYear]  = React.useState(initial.getFullYear());

  // Re-anchor to the current value each time the picker opens
  React.useEffect(() => {
    if (!open) return;
    const d = value ? new Date(value + 'T00:00:00') : todayObj;
    setViewMonth(d.getMonth());
    setViewYear(d.getFullYear());
  }, [open, value, todayObj]);

  if (!open) return null;

  const firstDow      = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth   = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const next = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const pad = n => String(n).padStart(2, '0');
  const isoFor = (d) => `${viewYear}-${pad(viewMonth + 1)}-${pad(d)}`;
  const pick = (iso) => { onPick(iso); onClose(); };

  // 6 × 7 grid (always 42 cells so the modal height doesn't jump)
  const cells = [];
  for (let i = 0; i < firstDow;    i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length < 42) cells.push(null);

  return (
    <Modal open={open} onClose={onClose} title={title || 'Pick a date'} compact>
      <div className="dp-month-nav">
        <button type="button" className="dp-nav-btn" onClick={prev} aria-label="Previous month">‹</button>
        <div className="dp-month-label">{MONTHS[viewMonth]} {viewYear}</div>
        <button type="button" className="dp-nav-btn" onClick={next} aria-label="Next month">›</button>
      </div>
      <div className="dp-week-labels" aria-hidden>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="dp-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="dp-cell empty" aria-hidden />;
          const iso        = isoFor(d);
          const isToday    = iso === todayIso;
          const isSelected = iso === value;
          const disabled   = !!minDate && iso < minDate;
          return (
            <button
              key={i}
              type="button"
              className={
                'dp-cell' +
                (isToday    ? ' today'    : '') +
                (isSelected ? ' selected' : '') +
                (disabled   ? ' disabled' : '')
              }
              disabled={disabled}
              onClick={() => pick(iso)}
              aria-label={iso}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="dp-actions">
        <button type="button" className="dp-shortcut" onClick={() => pick(todayIso)}>Today</button>
      </div>
    </Modal>
  );
}

// ─── Time Picker Modal ────────────────────────────────────────────────────────
// iOS-style three-wheel time picker (hour | minute | AM/PM) that
// replaces the native <input type="time"> popups. Each wheel is a
// vertical scroll-snap column with momentum scrolling, a highlighted
// band marks the centred (= selected) row, and the edges fade out.
// Time is stored as "HH:MM" in 24-hour format so it round-trips
// cleanly with the rest of the app, but the picker UI is 12-hour.
function TimePickerModal({ open, value, title, onClose, onPick }) {
  const HOURS    = React.useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);          // 1..12
  const MINUTES  = React.useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []);          // 0,5,…,55
  const PERIODS  = React.useMemo(() => ['AM', 'PM'], []);
  const ITEM_H   = 48;  // px per row — generous tap target
  const SPACER_H = ITEM_H * 2;  // 2 rows above / below the selected band

  // Parse "HH:MM" 24h → 12h parts (snaps minutes to nearest 5)
  const parse = React.useCallback((v) => {
    if (!v || !/^\d{1,2}:\d{2}$/.test(v)) {
      return { hour12: 9, minute: 0, period: 'AM' };
    }
    const [h, m] = v.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    let hour12 = h % 12;
    if (hour12 === 0) hour12 = 12;
    const minute = (Math.round(m / 5) * 5) % 60;
    return { hour12, minute, period };
  }, []);

  const [hour,   setHour]   = React.useState(9);
  const [minute, setMinute] = React.useState(0);
  const [period, setPeriod] = React.useState('AM');

  const hourRef   = React.useRef(null);
  const minuteRef = React.useRef(null);
  const periodRef = React.useRef(null);

  // Re-seed + scroll-position-restore each time the picker opens
  React.useEffect(() => {
    if (!open) return;
    const init = parse(value);
    setHour(init.hour12);
    setMinute(init.minute);
    setPeriod(init.period);
    // Wait one paint so refs + scroll-snap are mounted, then jump
    // each column to its current value (no animation on initial set).
    requestAnimationFrame(() => {
      const hi = HOURS.indexOf(init.hour12);
      const mi = MINUTES.indexOf(init.minute);
      const pi = PERIODS.indexOf(init.period);
      if (hourRef.current   && hi >= 0) hourRef.current.scrollTop   = hi * ITEM_H;
      if (minuteRef.current && mi >= 0) minuteRef.current.scrollTop = mi * ITEM_H;
      if (periodRef.current && pi >= 0) periodRef.current.scrollTop = pi * ITEM_H;
    });
  }, [open, value, HOURS, MINUTES, PERIODS, parse]);

  if (!open) return null;

  const onWheelScroll = (ref, items, setter) => () => {
    if (!ref.current) return;
    const idx = Math.round(ref.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    setter(items[clamped]);
  };

  const confirm = () => {
    let h = hour;
    if (period === 'AM') { if (h === 12) h = 0; }
    else                 { if (h !== 12) h += 12; }
    const iso = `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    onPick(iso);
    onClose();
  };

  const renderColumn = (ref, items, current, setter, formatter) => (
    <div
      className="tp-column"
      ref={ref}
      onScroll={onWheelScroll(ref, items, setter)}
      role="listbox"
    >
      <div className="tp-spacer" style={{ height: SPACER_H }} aria-hidden />
      {items.map(item => (
        <div
          key={item}
          className={'tp-item' + (item === current ? ' on' : '')}
          role="option"
          aria-selected={item === current}
          onClick={() => {
            const idx = items.indexOf(item);
            if (ref.current) ref.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
          }}
        >
          {formatter(item)}
        </div>
      ))}
      <div className="tp-spacer" style={{ height: SPACER_H }} aria-hidden />
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || 'Pick a time'}
      footer={<button className="fb-btn solid" onClick={confirm}>Done</button>}
      compact
    >
      <div className="tp-wheels" aria-label="Time">
        <div className="tp-band" aria-hidden />
        {renderColumn(hourRef,   HOURS,   hour,   setHour,   v => String(v))}
        <div className="tp-sep">:</div>
        {renderColumn(minuteRef, MINUTES, minute, setMinute, v => String(v).padStart(2, '0'))}
        {renderColumn(periodRef, PERIODS, period, setPeriod, v => v)}
      </div>
    </Modal>
  );
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────
function AddTaskModal({ open, onClose, members, myId, spaces, initialSpaceId, initial, initialPrivate, onSave, onUpdate, events }) {
  const editing = !!initial?.id;
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [assignee, setAssignee] = React.useState(myId || null);
  const [dueOpt, setDueOpt] = React.useState('today');
  const [dueDate, setDueDate] = React.useState('');
  const [dueTime, setDueTime] = React.useState(''); // HH:MM, optional time-of-day
  const [repeatFreq, setRepeatFreq] = React.useState('none'); // none | daily | weekly | monthly | custom
  const [repeatDays, setRepeatDays] = React.useState([]);     // 0-6 (Sun-Sat) for weekly + custom
  const [spaceId, setSpaceId] = React.useState(initialSpaceId || null);
  // Link to an existing calendar event. Only offered when `events` is
  // passed (the top-level task form); the nested "linked task" forms
  // inside the event modals stamp event_id themselves, so they omit it.
  const [eventId, setEventId] = React.useState(null);
  // Personal toggle. When on, the task is only visible to the creator
  // (enforced by RLS) and the assignee/space pickers are hidden — a
  // personal todo doesn't need either since it's just for you.
  const [isPrivate, setIsPrivate] = React.useState(!!initialPrivate);
  const [saving, setSaving] = React.useState(false);
  // Custom date / time picker open state (replaces native popups).
  const [dueDateOpen,    setDueDateOpen]    = React.useState(false);
  const [dueTimeOpen,    setDueTimeOpen]    = React.useState(false);
  const [eventPickerOpen, setEventPickerOpen] = React.useState(false);
  const linkedEvent = Array.isArray(events) ? events.find(e => e.id === eventId) : null;

  // When opened in edit mode, hydrate every field from the existing
  // task. When opened fresh, fall back to defaults + initialSpaceId.
  React.useEffect(() => {
    if (!open) return;
    if (initial && initial.id) {
      setTitle(initial.title || '');
      setDescription(initial.description || '');
      setAssignee(initial.assigned_to ?? null);
      if (initial.due_date) { setDueOpt('pick'); setDueDate(initial.due_date); }
      else                  { setDueOpt('today'); setDueDate(''); }
      // Fall back to a legacy recurrence.time so existing repeating tasks
      // keep their time in the (now unified) due-time field.
      setDueTime(initial.due_time || initial.recurrence?.time || '');
      const r = initial.recurrence;
      if (r && r.freq) {
        setRepeatFreq(r.freq);
        setRepeatDays(Array.isArray(r.days) ? r.days : []);
      } else {
        setRepeatFreq('none'); setRepeatDays([]);
      }
      setSpaceId(initial.space_id || null);
      setEventId(initial.event_id || null);
      setIsPrivate(!!initial.is_private);
    } else {
      // Fresh open — clear EVERY field, not just space/private. Without
      // this, opening Edit task, cancelling, then tapping "+ Add task"
      // reopened the form pre-filled with the old task's values.
      setTitle(''); setDescription('');
      setAssignee(myId || null);
      setDueOpt('today'); setDueDate(''); setDueTime('');
      setRepeatFreq('none'); setRepeatDays([]);
      setSpaceId(initialSpaceId || null);
      setEventId(null);
      setIsPrivate(!!initialPrivate);
    }
  }, [open, initial, initialSpaceId, initialPrivate, myId]);

  const getDueDate = () => {
    const d = new Date();
    if (dueOpt === 'today') return toLocalISO(d);
    if (dueOpt === 'tomorrow') { d.setDate(d.getDate() + 1); return toLocalISO(d); }
    if (dueOpt === 'week') { d.setDate(d.getDate() + 7); return toLocalISO(d); }
    if (dueOpt === 'month') { d.setMonth(d.getMonth() + 1); return toLocalISO(d); }
    if (dueOpt === 'pick') return dueDate || null;
    return null;
  };

  const getRecurrence = () => {
    if (repeatFreq === 'none') return null;
    const r = { freq: repeatFreq };
    // The recurrence time IS the task's due time — no separate field.
    if (dueTime) r.time = dueTime;
    if (repeatFreq === 'weekly' || repeatFreq === 'custom') r.days = repeatDays.slice().sort();
    return r;
  };

  const toggleDay = (d) => {
    setRepeatDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const reset = () => {
    setTitle(''); setDescription(''); setAssignee(myId || null);
    setDueOpt('today'); setDueDate(''); setDueTime('');
    setRepeatFreq('none'); setRepeatDays([]);
    setSpaceId(initialSpaceId || null);
    setEventId(null);
    setIsPrivate(!!initialPrivate);
  };

  const buildPayload = () => ({
    title: title.trim(),
    description: description.trim() || null,
    // Personal todos force assignee = creator and ignore space tagging
    // — they're scoped to the current user only.
    assigned_to: isPrivate ? myId : assignee,
    due_date: getDueDate(),
    due_time: dueTime || null,
    recurrence: getRecurrence(),
    space_id: isPrivate ? null : (spaceId || null),
    // Link to an existing event. Only meaningful for shared tasks; the
    // nested linked-task forms (no `events` prop) leave this null and the
    // parent stamps the real event_id afterward.
    event_id: (isPrivate || !events) ? null : (eventId || null),
    is_private: isPrivate,
  });

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    if (editing) {
      await onUpdate(initial.id, buildPayload());
    } else {
      await onSave(buildPayload());
    }
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
    <>
    <Modal open={open} onClose={onClose} title={editing ? <>Edit <em>task</em></> : <>Add <em>task</em></>}
      footer={
        <>
          <button className="fb-btn solid" onClick={save} disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save changes' : 'Save task')}</button>
          {!editing && <button className="fb-link" onClick={saveAndAnother} style={{ alignSelf: 'center' }}>or save &amp; add another</button>}
        </>
      }>
      <div className="field">
        <label>Title</label>
        <div style={{ position: 'relative' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing?  Type # to tag a Space" onKeyDown={e => e.key === 'Enter' && save()} />
          <SpaceHashtagDropdown
            value={title}
            spaces={spaces}
            onChange={setTitle}
            onPickSpace={setSpaceId}
          />
        </div>
      </div>
      <div className="field">
        <label>Visibility</label>
        <div className="date-row">
          <button type="button" className={'pick' + (!isPrivate ? ' on' : '')} onClick={() => setIsPrivate(false)}>Shared with group</button>
          <button type="button" className={'pick' + (isPrivate ? ' on' : '')} onClick={() => setIsPrivate(true)}>🔒 Personal · only you</button>
        </div>
      </div>
      <div className="field">
        <label>Details <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value.slice(0, 500))}
          placeholder="Add details here"
          rows={3}
          maxLength={500}
          style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 14, padding: '8px 10px', border: '1.5px solid var(--rule, #141414)', borderRadius: 8, background: 'var(--cream, #FFFEF7)', color: 'var(--ink, #141414)', outline: 'none', boxSizing: 'border-box' }}
        />
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', textAlign: 'right', marginTop: 4 }}>
          {description.length} / 500
        </div>
      </div>
      {!isPrivate && (
      <div className="field">
        <label>Assign to</label>
        <div className="assignee-picker">
          {members.map(m => (
            <button key={m.id} className={'pick' + (assignee === m.id ? ' on' : '')} onClick={() => setAssignee(m.id)} style={assignee === m.id ? { '--pick-c': getColor(m.color) } : {}}>
              <Dot profile={m} />
              <MemberName profile={m} isMe={m.id === myId} />
            </button>
          ))}
          <button className={'pick unassign' + (assignee === null ? ' on' : '')} onClick={() => setAssignee(null)}>Unassigned</button>
        </div>
      </div>
      )}
      <div className="field">
        <label>Due</label>
        <div className="date-row">
          {[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['month', 'This month'], ['pick', 'Custom']].map(([k, lbl]) => (
            <button key={k} className={'pick' + (dueOpt === k ? ' on' : '')} onClick={() => setDueOpt(k)}>{lbl}</button>
          ))}
        </div>
        {dueOpt === 'pick' && (
          <button
            type="button"
            onClick={() => setDueDateOpen(true)}
            className="dp-trigger"
            style={{ marginTop: 8 }}
          >
            <span aria-hidden style={{ fontSize: 15 }}>📅</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {dueDate
                ? new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
                : 'Pick a date'}
            </span>
            <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
          </button>
        )}
        {/* Optional time-of-day. Tap to set; tap the × to clear back to
            an all-day (date-only) task. */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setDueTimeOpen(true)}
            className="dp-trigger"
            style={{ flex: 1 }}
          >
            <span aria-hidden style={{ fontSize: 15 }}>🕒</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {formatTime12(dueTime) || 'Add a time · optional'}
            </span>
            <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
          </button>
          {dueTime && (
            <button
              type="button"
              onClick={() => setDueTime('')}
              className="dp-trigger"
              style={{ flex: '0 0 auto', width: 44, justifyContent: 'center' }}
              aria-label="Clear time"
              title="Clear time"
            >×</button>
          )}
        </div>
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

      </div>

      {!isPrivate && (
      <div className="field">
        <label>Space <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <SpacePicker value={spaceId} spaces={spaces} onChange={setSpaceId} />
      </div>
      )}

      {!isPrivate && Array.isArray(events) && events.length > 0 && (
      <div className="field">
        <label>Link to event <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <button type="button" onClick={() => setEventPickerOpen(true)} className="dp-trigger">
          <span aria-hidden style={{ fontSize: 15 }}>📅</span>
          <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {linkedEvent
              ? <>{renderWithMentions(linkedEvent.title, false, members)}{linkedEvent.date ? ` · ${eventPickerDate(linkedEvent.date)}` : ''}</>
              : 'None'}
          </span>
          <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
        </button>
      </div>
      )}

    </Modal>
    {/* Nested pickers are rendered as SIBLINGS to the parent Modal, not
        as children of its sheet body. As a child the picker overlay's
        `position: absolute; inset:0` was scoped to the parent sheet's
        padding box — combined with .sheet's translucent backdrop and
        min-height: 75%, the picker visually drifted to the upper part
        of the screen. Hoisting it here lets its overlay use the screen-
        level positioning context so the picker sheet slides up from
        the bottom of the visible viewport, right under the trigger. */}
    <DatePickerModal
      open={dueDateOpen}
      value={dueDate}
      title="Due date"
      onClose={() => setDueDateOpen(false)}
      onPick={(iso) => setDueDate(iso)}
    />
    <TimePickerModal
      open={dueTimeOpen}
      value={dueTime}
      title="Due time"
      onClose={() => setDueTimeOpen(false)}
      onPick={(t) => setDueTime(t)}
    />
    <EventPickerModal
      open={eventPickerOpen}
      value={eventId}
      events={events}
      members={members}
      onClose={() => setEventPickerOpen(false)}
      onPick={(id) => { setEventId(id); setEventPickerOpen(false); }}
    />
    </>
  );
}

// ─── Add Event Modal ──────────────────────────────────────────────────────────
function AddEventModal({ open, onClose, members, myId, onSave, onUpdate, initial, initialDate, initialPrivate, spaces, initialSpaceId }) {
  const today = localTodayISO();
  // Edit mode when an existing event is passed in. Hydrates the form
  // from it and routes save through onUpdate instead of onSave. The
  // RSVP-invite and linked-task staging blocks are creation-only, so
  // they're hidden while editing.
  const editing = !!initial?.id;
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [date, setDate] = React.useState(initialDate || today);
  const [endDate, setEndDate] = React.useState(initialDate || today);
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [attendees, setAttendees] = React.useState([]);
  // Personal toggle. When on, the event is only visible to the creator
  // (enforced by RLS) and the attendees/RSVP/space pickers are hidden.
  const [isPrivate, setIsPrivate] = React.useState(!!initialPrivate);
  // RSVP recipients — the group members you want to request an RSVP
  // from. They get the `event_invited` notification on save (which is
  // the RSVP request) and are merged into the attendee list so their
  // responses show up. Empty = no RSVP requested.
  const [rsvpRecipients, setRsvpRecipients] = React.useState([]);
  // Linked tasks staged for this event. Each entry is a full task
  // payload (title, description, assigned_to, due_date, recurrence) —
  // the same shape AddTaskModal produces. On Event save, each one is
  // created via addTask({...task, event_id: newEvent.id}) so it lands
  // in the assignee's regular task list AND links back to the event.
  const [linkedTasks, setLinkedTasks] = React.useState([]);
  const [addLinkedTaskOpen, setAddLinkedTaskOpen] = React.useState(false);
  // Recurrence — same shape used by tasks. `repeatFreq` defaults to
  // 'none' (one-off event). For 'weekly' and 'custom', `repeatDays`
  // is the set of weekdays the event repeats on (0=Sun..6=Sat). For
  // 'daily' and 'monthly' the days list is unused.
  const [repeatFreq, setRepeatFreq] = React.useState('none');
  const [repeatDays, setRepeatDays] = React.useState([]);
  const [spaceId, setSpaceId] = React.useState(initialSpaceId || null);
  const [saving, setSaving] = React.useState(false);
  // Custom date / time picker open state (replaces native popups).
  const [dateOpen,    setDateOpen]    = React.useState(false);
  const [endDateOpen, setEndDateOpen] = React.useState(false);
  const [startOpen,   setStartOpen]   = React.useState(false);
  const [endOpen,     setEndOpen]     = React.useState(false);

  // Each time the modal opens, reset state — including the text fields
  // and times. Those used to survive a cancel, so an abandoned draft
  // reappeared the next time the sheet opened.
  React.useEffect(() => {
    if (!open) return;
    if (initial && initial.id) {
      // Edit: hydrate from the existing event.
      setTitle(initial.title || '');
      setDescription(initial.description || '');
      setLocation(initial.location || '');
      setStartTime(initial.start_time || '');
      setEndTime(initial.end_time || '');
      setDate(initial.date || today);
      setEndDate(initial.end_date || initial.date || today);
      setAttendees(Array.isArray(initial.attendees) ? initial.attendees : []);
      setRsvpRecipients([]);
      setLinkedTasks([]);
      setAddLinkedTaskOpen(false);
      const r = initial.recurrence;
      if (r && r.freq && r.freq !== 'none') {
        setRepeatFreq(r.freq);
        setRepeatDays(Array.isArray(r.days) ? r.days : []);
      } else {
        setRepeatFreq('none');
        setRepeatDays([]);
      }
      setSpaceId(initial.space_id || null);
      setIsPrivate(!!initial.is_private);
    } else {
      // Create: blank slate (stale drafts must not survive a cancel).
      setTitle('');
      setDescription('');
      setLocation('');
      setStartTime('');
      setEndTime('');
      setDate(initialDate || today);
      setEndDate(initialDate || today);
      setAttendees([]);
      setRsvpRecipients([]);
      setLinkedTasks([]);
      setAddLinkedTaskOpen(false);
      setRepeatFreq('none');
      setRepeatDays([]);
      setSpaceId(initialSpaceId || null);
      setIsPrivate(!!initialPrivate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, initialDate, initialSpaceId, initialPrivate]);

  const toggleAttendee = (id) => {
    setAttendees(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // RSVP recipient selection
  const toggleRsvpRecipient = (id) => {
    setRsvpRecipients(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const allMemberIds = (members || []).map(m => m.id);
  const allRsvpSelected = allMemberIds.length > 0 && allMemberIds.every(id => rsvpRecipients.includes(id));
  const toggleAllRsvp = () => setRsvpRecipients(allRsvpSelected ? [] : allMemberIds);

  // Linked-task staging — AddTaskModal hands us the full payload.
  const stageLinkedTask = (taskPayload) => {
    if (!taskPayload || !taskPayload.title) return;
    setLinkedTasks(prev => [...prev, taskPayload]);
  };
  const removeLinkedTask = (idx) => setLinkedTasks(prev => prev.filter((_, i) => i !== idx));

  const toggleRepeatDay = (d) => {
    setRepeatDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const getRecurrence = () => {
    if (repeatFreq === 'none') return null;
    const r = { freq: repeatFreq };
    if (repeatFreq === 'weekly' || repeatFreq === 'custom') r.days = repeatDays.slice().sort();
    return r;
  };

  const save = async () => {
    if (!title.trim() || !date) return;
    setSaving(true);
    // RSVP recipients are merged into the attendee list so addEvent's
    // notify() loop reaches them with `event_invited` (the RSVP
    // request) and their responses surface in the attendee list.
    const finalAttendees = isPrivate ? [] : Array.from(new Set([...attendees, ...rsvpRecipients]));
    if (editing) {
      // Update core fields only. Linked-task creation and RSVP invites
      // are creation-time actions, so they're not re-run on edit.
      await onUpdate(initial.id, {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        date,
        end_date: endDate > date ? endDate : null,
        start_time: startTime || null,
        end_time: endTime || null,
        attendees: isPrivate ? [] : attendees,
        recurrence: getRecurrence(),
        space_id: isPrivate ? null : (spaceId || null),
        is_private: isPrivate,
      });
    } else {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        date,
        end_date: endDate > date ? endDate : null,
        start_time: startTime || null,
        end_time: endTime || null,
        attendees: finalAttendees,
        recurrence: getRecurrence(),
        linkedTasks: isPrivate ? [] : linkedTasks,
        space_id: isPrivate ? null : (spaceId || null),
        is_private: isPrivate,
      });
    }
    setTitle(''); setDescription(''); setLocation(''); setDate(today); setEndDate(today); setStartTime(''); setEndTime(''); setAttendees([]);
    setRsvpRecipients([]);
    setLinkedTasks([]); setAddLinkedTaskOpen(false);
    setRepeatFreq('none'); setRepeatDays([]);
    setSpaceId(initialSpaceId || null);
    setSaving(false);
    onClose();
  };

  return (
    <>
    <Modal open={open} onClose={onClose} title={editing ? <>Edit <em>event</em></> : <>Add <em>event</em></>}
      footer={<button className="fb-btn solid" onClick={save} disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save changes' : 'Save event')}</button>}>
      <div className="field">
        <label>Title</label>
        <div style={{ position: 'relative' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Soccer practice  ·  Type # to tag a Space" />
          <SpaceHashtagDropdown
            value={title}
            spaces={spaces}
            onChange={setTitle}
            onPickSpace={setSpaceId}
          />
        </div>
      </div>
      <div className="field">
        <label>Visibility</label>
        <div className="date-row">
          <button type="button" className={'pick' + (!isPrivate ? ' on' : '')} onClick={() => setIsPrivate(false)}>Shared with group</button>
          <button type="button" className={'pick' + (isPrivate ? ' on' : '')} onClick={() => setIsPrivate(true)}>🔒 Personal · only you</button>
        </div>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Start date</label>
          <button
            type="button"
            onClick={() => setDateOpen(true)}
            className="dp-trigger"
          >
            <span aria-hidden style={{ fontSize: 15 }}>📅</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {date
                ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Pick'}
            </span>
            <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
          </button>
        </div>
        <div className="field">
          <label>End date</label>
          <button
            type="button"
            onClick={() => setEndDateOpen(true)}
            className="dp-trigger"
          >
            <span aria-hidden style={{ fontSize: 15 }}>📅</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {endDate
                ? new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Pick'}
            </span>
            <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Start time <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
          <button
            type="button"
            onClick={() => setStartOpen(true)}
            className="dp-trigger"
          >
            <span aria-hidden style={{ fontSize: 15 }}>🕒</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {formatTime12(startTime) || 'None'}
            </span>
            <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
          </button>
        </div>
        <div className="field">
          <label>End time <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
          <button
            type="button"
            onClick={() => setEndOpen(true)}
            className="dp-trigger"
          >
            <span aria-hidden style={{ fontSize: 15 }}>🕒</span>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {formatTime12(endTime) || 'None'}
            </span>
            <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
          </button>
        </div>
      </div>
      {!isPrivate && (<>
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
              <MemberName profile={m} isMe={m.id === myId} />
            </button>
          ))}
        </div>
      </div>

      {/* Send RSVP + Linked tasks are creation-only actions (they fire
          notifications / create new task rows), so they're hidden when
          editing an existing event. */}
      {!editing && (<>
      {/* Send RSVP — pick exactly who should respond. Selected members
          get an `event_invited` notification (the RSVP request) on save
          and are merged into the attendee list so their responses show
          up. "Everyone" is a one-tap convenience, not the default. */}
      <div className="field">
        <label>Send RSVP <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <div className="assignee-picker">
          {/* Filled gradient + 📨 only when every member is currently
              picked; otherwise outlined off-state. Same look as the
              AddSpaceModal "Everyone" chip. */}
          <button
            type="button"
            className={'pick' + (allRsvpSelected ? ' on' : '')}
            onClick={toggleAllRsvp}
          >
            <span aria-hidden>📨</span>
            <span>Everyone</span>
          </button>
          {members.map(m => (
            <button
              key={m.id}
              type="button"
              className={'pick' + (rsvpRecipients.includes(m.id) ? ' on' : '')}
              onClick={() => toggleRsvpRecipient(m.id)}
              style={rsvpRecipients.includes(m.id) ? { '--pick-c': getColor(m.color) } : {}}
            >
              <Dot profile={m} />
              <MemberName profile={m} isMe={m.id === myId} />
            </button>
          ))}
        </div>
        {rsvpRecipients.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            {rsvpRecipients.length} {rsvpRecipients.length === 1 ? 'person' : 'people'} will get a notification asking them to RSVP.
          </div>
        )}
      </div>

      {/* Linked tasks — full task payloads (title/details/assignee/due/
          repeat) staged here, then created on Event save with event_id
          pointing at the new event. Each row shows a summary; tap "+
          Add task" to open the full AddTaskModal. */}
      <div className="field">
        <label>Linked tasks <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        {linkedTasks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {linkedTasks.map((t, i) => {
              const assn = t.assigned_to ? (members || []).find(m => m.id === t.assigned_to) : null;
              const dueLbl = t.due_date
                ? new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : null;
              return (
                <div key={i} className="linked-task-row" style={{ cursor: 'default' }}>
                  <button type="button" className="linked-task-check" disabled aria-hidden style={{ pointerEvents: 'none' }} />
                  <span className="linked-task-title" style={{ flex: 1 }}>{t.title}</span>
                  {dueLbl && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dueLbl}</span>
                  )}
                  {assn && (
                    <span className="linked-task-assn">
                      <Dot profile={assn} />
                      <MemberName profile={assn} isMe={assn.id === myId} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeLinkedTask(i)}
                    aria-label="Remove task"
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
                  >×</button>
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          className="fb-btn"
          onClick={() => setAddLinkedTaskOpen(true)}
        >
          <span className="plus">+</span> Add task
        </button>
      </div>
      </>)}
      </>)}

      {/* Repeat — same recurrence model used by tasks. When set, the
          calendar grid + upcoming list will expand this event into
          multiple instances per the rule (every day / every chosen
          weekday / once per month / custom day-of-week list). */}
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
                  onClick={() => toggleRepeatDay(i)}
                  style={{ minWidth: 0, padding: '8px 10px' }}
                >{day}</button>
              ))}
            </div>
          </div>
        )}

      </div>

      {!isPrivate && (
      <div className="field">
        <label>Space <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <SpacePicker value={spaceId} spaces={spaces} onChange={setSpaceId} />
      </div>
      )}

    </Modal>
    {/* Sibling pickers — see AddTaskModal for the explanation. Mounting
        outside the parent sheet keeps the picker's `inset:0` overlay
        scoped to the screen, not the AddEvent sheet's translucent box. */}
    <DatePickerModal
      open={dateOpen}
      value={date}
      title="Start date"
      onClose={() => setDateOpen(false)}
      onPick={(iso) => { setDate(iso); if (iso > endDate) setEndDate(iso); }}
    />
    <DatePickerModal
      open={endDateOpen}
      value={endDate}
      title="End date"
      onClose={() => setEndDateOpen(false)}
      onPick={(iso) => { setEndDate(iso); if (iso < date) setDate(iso); }}
    />
    <TimePickerModal
      open={startOpen}
      value={startTime}
      title="Start time"
      onClose={() => setStartOpen(false)}
      onPick={(t) => setStartTime(t)}
    />
    <TimePickerModal
      open={endOpen}
      value={endTime}
      title="End time"
      onClose={() => setEndOpen(false)}
      onPick={(t) => setEndTime(t)}
    />
    {/* Nested AddTaskModal — full task form (title, details, assignee,
        due, repeat). On save we stage the payload; the event-save flow
        then creates it via addTask with event_id set so it lands in
        the assignee's task list AND links back to this event. */}
    <AddTaskModal
      open={addLinkedTaskOpen}
      onClose={() => setAddLinkedTaskOpen(false)}
      members={members}
      myId={myId}
      onSave={stageLinkedTask}
    />
    </>
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

function fmtDateShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function EventCard({ event, members, getProfile, myId, onDelete, onClick }) {
  const p = getProfile(event.created_by);
  const color = getColor(p?.color || event.color);
  const isMultiDay = event.end_date && event.end_date > event.date;
  const timeStr = isMultiDay
    ? `${fmtDateShort(event.date)} – ${fmtDateShort(event.end_date)}`
    : event.start_time
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
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
          {renderWithMentions(event.title, false, members)}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mute)', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>{timeStr}</span>
          {p && (
            <>
              <span>·</span>
              <Dot profile={p} />
              <MemberName profile={p} isMe={p.id === myId} />
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
        {event.space_id && (
          <div style={{ marginTop: 6 }}><SpaceTag spaceId={event.space_id} /></div>
        )}
      </div>
    </div>
    </SwipeToDelete>
  );
}

// Format a recurrence rule (same shape used by tasks + events) into a
// short human label like "Repeats every week on Mon, Wed". Returns
// null when there's no recurrence so callers can skip the row.
function formatEventRecurrence(r) {
  if (!r || !r.freq || r.freq === 'none') return null;
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  if (r.freq === 'daily')   return 'Repeats every day';
  if (r.freq === 'monthly') return 'Repeats every month';
  if (r.freq === 'weekly' || r.freq === 'custom') {
    const days = Array.isArray(r.days) ? r.days.slice().sort() : [];
    if (days.length === 0) return r.freq === 'weekly' ? 'Repeats weekly' : 'Repeats on custom days';
    return `Repeats every week on ${days.map(i => DAY_NAMES[i]).join(', ')}`;
  }
  return 'Repeats';
}

// ─── Event Details Modal (single event) ───────────────────────────────────────
function EventDetailsModal({
  open, event, members, getProfile, myId, onClose, onDelete, onEdit, onShowMember,
  // New for RSVP + linked tasks. Backwards-compatible — older callers
  // that don't pass these just won't see those features. The MainApp
  // wires them up; standalone places like screens-tests can omit.
  tasks = [], onSetRsvp, onAddLinkedTask, onToggleTask, onOpenTask,
}) {
  // ── Hooks first (Rules of Hooks) ────────────────────────────────────
  // These used to live below an `if (!open) return null` early return,
  // which made the hook count differ between renders — it only worked
  // by a React implementation quirk. `event` can be null here, so all
  // derived values are null-guarded.
  const rsvps = (event?.rsvps && typeof event.rsvps === 'object') ? event.rsvps : {};
  const myRsvp = (myId && rsvps[myId]) || null;
  // Local draft so tapping a chip stages the choice instead of
  // committing it. The committed value still comes from `myRsvp`; a Save
  // button appears whenever the draft diverges.
  const [draftRsvp, setDraftRsvp] = React.useState(myRsvp);
  const [savingRsvp, setSavingRsvp] = React.useState(false);
  const [savedRsvpPulse, setSavedRsvpPulse] = React.useState(false);
  // Full AddTaskModal opens on "+ Add task".
  const [addLinkedTaskOpen, setAddLinkedTaskOpen] = React.useState(false);
  // Re-sync the draft any time the event being viewed changes, or the
  // server-side value updates (realtime delivers a new payload, etc.).
  React.useEffect(() => {
    setDraftRsvp(myRsvp);
    setSavedRsvpPulse(false);
  }, [event?.id, myRsvp]);

  if (!open || !event) return null;
  const p = getProfile(event.created_by);
  const color = getColor(p?.color || event.color);
  const [y, m, d] = event.date.split('-').map(Number);
  const jsDate = new Date(y, m - 1, d);
  const isMultiDay = event.end_date && event.end_date > event.date;
  const longDate = isMultiDay
    ? `${jsDate.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })} – ${new Date(...event.end_date.split('-').map((n,i) => i===1?Number(n)-1:Number(n))).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}`
    : jsDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = isMultiDay
    ? (event.start_time ? `${fmtTime(event.start_time)}${event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}` : null)
    : (event.start_time ? `${fmtTime(event.start_time)}${event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}` : 'All day');
  const mapsUrl = event.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}` : null;

  // RSVP display helpers
  const rsvpLabel = (v) => ({ yes: 'Going', maybe: 'Maybe', no: "Can't go" })[v] || null;
  const rsvpEmoji = (v) => ({ yes: '✅', maybe: '🤔', no: '❌' })[v] || null;
  const rsvpColor = (v) => ({ yes: '#2DC653', maybe: '#FFB100', no: '#E63946' })[v] || 'var(--text-muted)';
  // The RSVP block is visible to anyone in the group — even non-
  // attendees might want to opt in / decline a wider family event.
  const canRsvp = !!onSetRsvp && !!myId;
  const rsvpDirty = draftRsvp !== myRsvp;
  const handleSaveRsvp = async () => {
    if (!onSetRsvp || savingRsvp) return;
    setSavingRsvp(true);
    try {
      await onSetRsvp(event.id, draftRsvp);
      setSavedRsvpPulse(true);
      window.setTimeout(() => setSavedRsvpPulse(false), 1800);
    } finally {
      setSavingRsvp(false);
    }
  };

  // Recurrence label
  const recLabel = formatEventRecurrence(event.recurrence);

  // Linked tasks — tasks whose `event_id` points at this master event.
  // Sorted: incomplete first, then by due date.
  const linkedTasks = Array.isArray(tasks)
    ? tasks.filter(t => t.event_id === event.id && !t.cancelled_at)
    : [];
  linkedTasks.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (a.due_date || '').localeCompare(b.due_date || '');
  });

  // onSave hands us the same payload shape AddTaskModal builds for
  // top-level tasks — we just route it through onAddLinkedTask so
  // event_id gets stamped on.
  const handleAddLinkedTask = async (taskPayload) => {
    if (!taskPayload || !taskPayload.title || !onAddLinkedTask) return;
    await onAddLinkedTask(event.id, taskPayload);
  };

  return (
    <>
    <Modal open={open} onClose={onClose} title="Event">
      <div style={{
        borderLeft: `6px solid ${color}`,
        padding: '4px 0 4px 14px',
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>{renderWithMentions(event.title, false, members)}</span>
          {recLabel && (
            <span title={recLabel} style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>↻</span>
          )}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--mute)', letterSpacing: '0.04em' }}>
          {longDate}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--mute)', letterSpacing: '0.04em', marginTop: 2 }}>
          {timeStr}
        </div>
        {recLabel && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden>↻</span>
            <span>{recLabel}</span>
          </div>
        )}
      </div>

      {/* RSVP block — three buttons stage a local draft, then a Save
          button commits it. The previously-saved choice is shown via
          the filled "on" chip styling. Tapping the same chip you
          already saved clears the draft back to "no response"; Save
          then writes that clear to the server. */}
      {canRsvp && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Your RSVP</label>
          <div className="rsvp-row">
            {[
              ['yes',   'Going',     '✅'],
              ['maybe', 'Maybe',     '🤔'],
              ['no',    "Can't go",  '❌'],
            ].map(([val, lbl, emoji]) => {
              const on = draftRsvp === val;
              return (
                <button
                  key={val}
                  type="button"
                  className={'rsvp-btn rsvp-' + val + (on ? ' on' : '')}
                  onClick={() => setDraftRsvp(on ? null : val)}
                  aria-pressed={on}
                >
                  <span aria-hidden>{emoji}</span>
                  <span>{lbl}</span>
                </button>
              );
            })}
          </div>
          <div style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            minHeight: 32,
          }}>
            <span style={{
              fontSize: 12,
              color: savedRsvpPulse ? '#2DC653' : 'var(--text-muted)',
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              transition: 'color 0.25s var(--ease)',
            }}>
              {savedRsvpPulse
                ? '✓ Saved'
                : rsvpDirty
                  ? 'Unsaved change'
                  : (myRsvp ? `Saved: ${rsvpLabel(myRsvp)}` : 'No response yet')}
            </span>
            <button
              type="button"
              className="fb-btn solid"
              onClick={handleSaveRsvp}
              disabled={!rsvpDirty || savingRsvp}
              style={{
                width: 'auto',
                padding: '8px 18px',
                fontSize: 13,
                opacity: (!rsvpDirty || savingRsvp) ? 0.5 : 1,
                cursor: (!rsvpDirty || savingRsvp) ? 'default' : 'pointer',
              }}
            >
              {savingRsvp ? 'Saving…' : 'Save RSVP'}
            </button>
          </div>
        </div>
      )}

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
          <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {renderWithMentions(event.description, false, members)}
          </div>
        </div>
      )}

      {/* Linked tasks — to-dos tied to this event (e.g. "bring napkins"
          for a dinner). Tapping the row opens the task detail; tapping
          the checkbox toggles completion. The inline composer at the
          bottom creates a new task with `event_id = event.id`. */}
      {onAddLinkedTask && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Linked tasks</label>
          {linkedTasks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {linkedTasks.map(t => {
                const assn = getProfile(t.assigned_to);
                const canToggle = !t.cancelled_at && (!t.assigned_to || t.assigned_to === myId);
                return (
                  <div
                    key={t.id}
                    className="linked-task-row"
                    onClick={() => onOpenTask?.(t)}
                  >
                    <button
                      type="button"
                      className={'linked-task-check' + (t.completed ? ' on' : '')}
                      onClick={(e) => { e.stopPropagation(); if (canToggle && onToggleTask) onToggleTask(t.id); }}
                      disabled={!canToggle}
                      aria-label={t.completed ? 'Mark incomplete' : 'Mark complete'}
                    >{t.completed ? '✓' : ''}</button>
                    <span
                      className="linked-task-title"
                      style={{ textDecoration: t.completed ? 'line-through' : 'none', opacity: t.completed ? 0.55 : 1 }}
                    >{t.title}</span>
                    {assn && (
                      <span className="linked-task-assn">
                        <Dot profile={assn} />
                        <MemberName profile={assn} isMe={assn.id === myId} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--mute)', fontStyle: 'italic', marginBottom: 8 }}>
              No tasks linked yet.
            </div>
          )}
          <button
            type="button"
            className="fb-btn"
            onClick={() => setAddLinkedTaskOpen(true)}
          >
            <span className="plus">+</span> Add task
          </button>
        </div>
      )}

      <div className="field" style={{ marginBottom: 14 }}>
        <label>Attendees</label>
        {Array.isArray(event.attendees) && event.attendees.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {event.attendees.map(uid => {
              const ap = getProfile(uid);
              const r = rsvps[uid];
              return (
                <span
                  key={uid}
                  className="member-chip"
                  onClick={() => ap && onShowMember && onShowMember(ap)}
                  style={ap ? undefined : { cursor: 'default' }}
                  title={r ? rsvpLabel(r) : 'No response yet'}
                >
                  <Dot profile={ap} />
                  {ap ? <MemberName profile={ap} isMe={uid === myId} /> : <span>Unknown</span>}
                  {r && (
                    <span
                      className="rsvp-pip"
                      aria-label={rsvpLabel(r)}
                      style={{ color: rsvpColor(r) }}
                    >{rsvpEmoji(r)}</span>
                  )}
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
              className="member-chip"
              onClick={() => onShowMember && onShowMember(p)}
            >
              <Dot profile={p} />
              <MemberName profile={p} isMe={p.id === myId} />
            </span>
          ) : (
            <span>Unknown</span>
          )}
        </div>
      </div>

      {event.created_by === myId && (
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          {onEdit ? (
            <button
              type="button"
              className="fb-btn"
              onClick={() => onEdit(event)}
            >Edit event</button>
          ) : <span />}
          <button
            onClick={() => { onDelete(event.id); onClose(); }}
            className="danger-btn"
          >Delete event{event.recurrence && event.recurrence.freq !== 'none' ? ' series' : ''}</button>
        </div>
      )}
    </Modal>
    {/* Sibling AddTaskModal — full task form. onSave returns a payload
        we pass back to MainApp via onAddLinkedTask, which stamps
        event_id and creates the task through addTask (so it shows up
        in the assignee's task list + lists under this event). */}
    {onAddLinkedTask && (
      <AddTaskModal
        open={addLinkedTaskOpen}
        onClose={() => setAddLinkedTaskOpen(false)}
        members={members}
        myId={myId}
        onSave={handleAddLinkedTask}
      />
    )}
    </>
  );
}

function DayDetailsModal({ open, date, events, members, getProfile, myId, onClose, onAddEvent, onDelete, onShowEvent }) {
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
              members={members}
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
function MonthEventsModal({ open, onClose, monthName, year, events, members, getProfile, myId, onDelete, onShowEvent }) {
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
                {/* Date group header — bumped from 10px monospace muted-gray
                    up to 16px Inter w/ stronger weight + higher-contrast
                    color so it's comfortably legible. Older readers were
                    finding the old "FRI, MAY 15" label unreadable; this
                    keeps the brand date-strip vibe (uppercase, letter-
                    spaced) but at a size that doesn't squint. */}
                <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: 16, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-primary)', marginBottom: 10 }}>
                  {label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dayEvents.map(e => (
                    <EventCard
                      key={e.id}
                      event={e}
                      members={members}
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
function AddNoteModal({ open, onClose, profile, members, onSave, spaces, initialSpaceId }) {
  const [postType, setPostType] = React.useState('message');
  const [body, setBody] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [makeTask, setMakeTask] = React.useState(false);
  const [taskTitle, setTaskTitle] = React.useState('');
  const [taskAssignee, setTaskAssignee] = React.useState(profile?.id || null);
  // Flag tracks whether the user has manually picked an assignee.
  // Once true, the auto-suggest-from-@mention effect stops touching it.
  const [assigneeEdited, setAssigneeEdited] = React.useState(false);
  const [taskDueOpt, setTaskDueOpt] = React.useState('today');
  const [taskDueDate, setTaskDueDate] = React.useState('');

  // ── Calendar-event creation (Urgent + Reminder posts) ─────────────
  // Same pattern as task creation — opt-in checkbox, inline editor.
  // On save, the new event is inserted into the events table with a
  // note_id reference to this post (with a graceful fallback if the
  // events table doesn't have that column yet).
  const todayIso = localTodayISO();
  const [makeEvent,      setMakeEvent]      = React.useState(false);
  const [eventTitle,     setEventTitle]     = React.useState('');
  const [eventDate,      setEventDate]      = React.useState(todayIso);
  const [eventStartTime, setEventStartTime] = React.useState('');
  const [eventEndTime,   setEventEndTime]   = React.useState('');
  const [eventLocation,  setEventLocation]  = React.useState('');
  // Event attendee picker — defaults to "everyone in the group".
  // The user can deselect anyone they don't want included.
  const [eventAttendees, setEventAttendees] = React.useState([]);
  // Open/close state for the large custom date / time pickers that
  // replace the cramped native <input type="date|time"> popups.
  const [datePickerOpen,         setDatePickerOpen]         = React.useState(false);
  const [taskDatePickerOpen,     setTaskDatePickerOpen]     = React.useState(false);
  const [startTimePickerOpen,    setStartTimePickerOpen]    = React.useState(false);
  const [endTimePickerOpen,      setEndTimePickerOpen]      = React.useState(false);

  // Photo upload state
  const [photos, setPhotos] = React.useState([]); // array of dataURLs
  const photoInputRef = React.useRef(null);

  // Poll state
  const [pollQuestion, setPollQuestion] = React.useState('');
  const [pollOptions, setPollOptions] = React.useState(['', '']);

  // Optional Space tag — propagates to all generated rows (note + task + event).
  const [spaceId, setSpaceId] = React.useState(initialSpaceId || null);

  // @mention state
  const editorRef = React.useRef(null);
  const [mentionAnchor, setMentionAnchor] = React.useState(null); // { query } | null
  // #space hashtag state — same shape, different trigger character
  const [spaceHashAnchor, setSpaceHashAnchor] = React.useState(null);

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
      setAssigneeEdited(false);
      setTaskDueOpt('today');
      setTaskDueDate('');
      setMakeEvent(false);
      setEventTitle('');
      setEventTitleEdited(false);
      setEventDate(todayIso);
      setEventStartTime('');
      setEventEndTime('');
      setEventLocation('');
      setEventAttendees((members || []).map(m => m.id));
      setTitleEdited(false);
      setMentionAnchor(null);
      setPhotos([]);
      setPollQuestion('');
      setPollOptions(['', '']);
      setSpaceId(initialSpaceId || null);
      setTimeout(() => editorRef.current?.focus(), 50);
    }
  }, [open, profile?.id, initialSpaceId]);

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

  // Keep task title + event title auto-suggesting from the post's
  // first line until the user types their own. Each has its own
  // "edited" flag so editing the event title doesn't pin the task
  // title (and vice versa).
  const [titleEdited,      setTitleEdited]      = React.useState(false);
  const [eventTitleEdited, setEventTitleEdited] = React.useState(false);
  React.useEffect(() => {
    const firstLine = body.split('\n')[0].trim().slice(0, 100);
    if (!titleEdited)      setTaskTitle(firstLine);
    if (!eventTitleEdited) setEventTitle(firstLine);
  }, [body, titleEdited, eventTitleEdited]);

  // Auto-assign the linked task to the FIRST @mentioned person in
  // the post body (unless the user has manually picked someone). So
  // posting "@[Kyle] please buy milk" with "Create task from post?"
  // ticked → the task is assigned to Kyle, not the poster.
  React.useEffect(() => {
    if (assigneeEdited) return;
    const match = body.match(/@\[([^\]]+)\]/);
    if (!match) {
      // No @mention → fall back to the poster as the default
      if (taskAssignee !== (profile?.id || null)) {
        setTaskAssignee(profile?.id || null);
      }
      return;
    }
    const tagged = (members || []).find(m => m.display_name === match[1]);
    if (tagged && tagged.id !== taskAssignee) {
      setTaskAssignee(tagged.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, assigneeEdited, members, profile?.id]);

  // @mention + #space detection on every input in the contentEditable editor.
  // Only one picker is open at a time — whichever trigger is closest to the
  // cursor wins. Other gets cleared.
  const handleInput = () => {
    const text = getEditorText();
    setBody(text);
    const before = getTextBeforeCursor();
    const at = before.match(/@([^@\[\]\n#]*)$/);
    const hash = before.match(/(?:^|\s)#([a-zA-Z0-9_-]*)$/);
    if (at) {
      setMentionAnchor({ query: at[1].toLowerCase().trim() });
      setSpaceHashAnchor(null);
    } else if (hash) {
      setSpaceHashAnchor({ query: hash[1].toLowerCase().trim() });
      setMentionAnchor(null);
    } else {
      setMentionAnchor(null);
      setSpaceHashAnchor(null);
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

  // Strip the trailing `#word` from the editor (at the caret) and set
  // spaceId so the bottom Space picker reflects the choice. Unlike
  // insertMention we don't insert a visible chip — the SpacePicker chip
  // at the bottom of the modal is the visible confirmation.
  const pickSpaceHash = (space) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) { setSpaceHashAnchor(null); return; }

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const offset = range.startOffset;
      const textBefore = node.textContent.slice(0, offset);
      const hashMatch = textBefore.match(/(?:^|\s)#[a-zA-Z0-9_-]*$/);
      if (hashMatch) {
        const replaceWith = hashMatch[0].startsWith(' ') ? ' ' : '';
        const hashStart = offset - hashMatch[0].length;
        node.textContent =
          node.textContent.slice(0, hashStart) +
          replaceWith +
          node.textContent.slice(offset);
        // Put caret right after the replacement
        const newOffset = hashStart + replaceWith.length;
        const newRange = document.createRange();
        newRange.setStart(node, Math.min(newOffset, node.textContent.length));
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    }

    setSpaceId(space.id);
    setSpaceHashAnchor(null);
    setBody(getEditorText());
  };

  const otherMembers = (members || []).filter(m => m.id !== profile?.id);
  const mentionMatches = mentionAnchor !== null
    ? otherMembers.filter(m =>
        !mentionAnchor.query || m.display_name?.toLowerCase().startsWith(mentionAnchor.query)
      )
    : [];
  const spaceHashMatches = spaceHashAnchor !== null
    ? (spaces || [])
        .filter(s => !s.archived_at)
        .filter(s => !spaceHashAnchor.query || s.title.toLowerCase().includes(spaceHashAnchor.query))
        .slice(0, 6)
    : [];

  const getDueDate = () => {
    const d = new Date();
    if (taskDueOpt === 'today') return toLocalISO(d);
    if (taskDueOpt === 'tomorrow') { d.setDate(d.getDate() + 1); return toLocalISO(d); }
    if (taskDueOpt === 'week') { d.setDate(d.getDate() + 7); return toLocalISO(d); }
    if (taskDueOpt === 'month') { d.setMonth(d.getMonth() + 1); return toLocalISO(d); }
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

    // Tasks can be created from any text post (Message / Urgent / Reminder)
    if (makeTask && !taskTitle.trim()) {
      alert('Task title is empty. Either uncheck "Create task from post?" or enter a title.'); return;
    }
    // Calendar events from Urgent / Reminder posts — both title and
    // date are required when the checkbox is on.
    if (makeEvent && (!eventTitle.trim() || !eventDate)) {
      alert('Event needs a title and a date. Either uncheck "Create event from post?" or fill those in.'); return;
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
    // Attendees come from the picker (default = everyone in the
    // group, but the user can deselect anyone they want excluded).
    const eventPayload = makeEvent
      ? {
          title:       eventTitle.trim(),
          date:        eventDate,
          start_time:  eventStartTime || null,
          end_time:    eventEndTime   || null,
          location:    eventLocation.trim() || null,
          description: null,
          attendees:   eventAttendees,
        }
      : null;
    try {
      await onSave({
        content: content || (postType === 'poll' ? pollQuestion.trim() : ''),
        type: postType,
        payload,
        pinned: finalPinned,
        space_id: spaceId || null,
      }, taskPayload ? { ...taskPayload, space_id: spaceId || null } : null,
         eventPayload ? { ...eventPayload, space_id: spaceId || null } : null);
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
    { id: 'announcement', label: 'Urgent',   icon: '🚨' },
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
        {(otherMembers.length > 0 || (spaces || []).length > 0) && (
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>
            — type @ to tag someone, # for a Space
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
          onKeyDown={(e) => { if (e.key === 'Escape') { setMentionAnchor(null); setSpaceHashAnchor(null); } }}
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
        {spaceHashAnchor !== null && (
          <div className="space-hash-picker">
            {spaceHashMatches.length === 0 ? (
              <div className="space-hash-empty">No matching spaces.</div>
            ) : (
              spaceHashMatches.map(s => {
                const creator = (members || []).find(m => m.id === s.created_by);
                const c = getColor(creator?.color || 'coral');
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="space-hash-pick-item"
                    onMouseDown={(e) => { e.preventDefault(); pickSpaceHash(s); }}
                    style={{ '--c': c }}
                  >
                    <span className="space-hash-emoji" aria-hidden>{s.emoji || '✨'}</span>
                    <span className="space-hash-title">{s.title}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
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
            <MemberName profile={profile} isMe={true} />
          </button>
        </div>
      </div>

      {/* ── Type-specific content ───────────────────────────────────── */}
      {postType === 'message' && renderMessageEditor('Message', "What's on your mind?")}

      {postType === 'announcement' && (
        <>
          <div className="announcement-notice">
            <span aria-hidden style={{ fontSize: 14 }}>🚨</span>
            <span>Everyone in the group will get a notification.</span>
          </div>
          <div className="quick-update-notice">
            <span>Auto-pinned to the top of the Home Feed.</span>
          </div>
          {renderMessageEditor('Urgent', 'Important news for the whole group…', 'announcement-editor')}
        </>
      )}

      {postType === 'quick_update' && (
        <>
          <div className="quick-update-notice">
            <span>Auto-pinned to the top of the Home Feed.</span>
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

      {/* ── Create-task option (Message + Urgent + Reminder) ─────── */}
      {(postType === 'message' || postType === 'quick_update' || postType === 'announcement') && (
        <div className="field" style={{ marginTop: 4 }}>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', width: '100%',
              background: makeTask ? 'var(--hover-tint)' : 'transparent',
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
            <span className="cfp-text">Create task from post?</span>
          </label>
        </div>
      )}

      {makeTask && (postType === 'message' || postType === 'quick_update' || postType === 'announcement') && (
        <div style={{ background: 'var(--surface-glass)', borderRadius: 8, padding: '12px', marginTop: 4 }}>
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
                <button key={m.id} className={'pick' + (taskAssignee === m.id ? ' on' : '')} onClick={() => { setTaskAssignee(m.id); setAssigneeEdited(true); }} style={taskAssignee === m.id ? { '--pick-c': getColor(m.color) } : {}}>
                  <Dot profile={m} />
                  <MemberName profile={m} isMe={m.id === profile?.id} />
                </button>
              ))}
              <button className={'pick unassign' + (taskAssignee === null ? ' on' : '')} onClick={() => { setTaskAssignee(null); setAssigneeEdited(true); }}>Unassigned</button>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Due</label>
            <div className="date-row">
              {[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['month', 'This month'], ['pick', 'Custom']].map(([k, lbl]) => (
                <button key={k} className={'pick' + (taskDueOpt === k ? ' on' : '')} onClick={() => setTaskDueOpt(k)}>{lbl}</button>
              ))}
            </div>
            {taskDueOpt === 'pick' && (
              <button
                type="button"
                onClick={() => setTaskDatePickerOpen(true)}
                className="dp-trigger"
                style={{ marginTop: 8 }}
              >
                <span aria-hidden style={{ fontSize: 15 }}>📅</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {taskDueDate
                    ? new Date(taskDueDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
                    : 'Pick a date'}
                </span>
                <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Create-event option (Urgent + Reminder only) ─────────── */}
      {(postType === 'announcement' || postType === 'quick_update') && (
        <div className="field" style={{ marginTop: 4 }}>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', width: '100%',
              background: makeEvent ? 'var(--hover-tint)' : 'transparent',
              border: '1.5px solid var(--ink)', borderRadius: 8,
              cursor: 'pointer', font: 'inherit', fontSize: 14, fontWeight: 600,
              color: 'var(--ink)', textAlign: 'left',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={makeEvent}
              onChange={e => setMakeEvent(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#141414', margin: 0, cursor: 'pointer' }}
            />
            <span className="cfp-text">Create event from post?</span>
          </label>
        </div>
      )}

      {makeEvent && (postType === 'announcement' || postType === 'quick_update') && (
        <div style={{ background: 'var(--surface-glass)', borderRadius: 8, padding: '12px', marginTop: 4 }}>
          <div className="field">
            <label>Event title</label>
            <input
              value={eventTitle}
              onChange={e => { setEventTitle(e.target.value); setEventTitleEdited(true); }}
              placeholder="e.g. Soccer practice"
            />
          </div>
          <div className="field">
            <label>Date</label>
            <button
              type="button"
              onClick={() => setDatePickerOpen(true)}
              className="dp-trigger"
            >
              <span aria-hidden style={{ fontSize: 15 }}>📅</span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                {eventDate
                  ? new Date(eventDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
                  : 'Pick a date'}
              </span>
              <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
            </button>
          </div>
          <div className="field">
            <label>Time <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setStartTimePickerOpen(true)}
                className="dp-trigger"
                style={{ flex: 1, minWidth: 0 }}
              >
                <span aria-hidden style={{ fontSize: 15 }}>🕒</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {formatTime12(eventStartTime) || 'Start'}
                </span>
                <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
              </button>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
              <button
                type="button"
                onClick={() => setEndTimePickerOpen(true)}
                className="dp-trigger"
                style={{ flex: 1, minWidth: 0 }}
              >
                <span aria-hidden style={{ fontSize: 15 }}>🕒</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {formatTime12(eventEndTime) || 'End'}
                </span>
                <span aria-hidden style={{ opacity: 0.5, fontSize: 12 }}>▾</span>
              </button>
            </div>
          </div>
          <div className="field">
            <label>Location <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
            <input
              value={eventLocation}
              onChange={e => setEventLocation(e.target.value)}
              placeholder="Where?"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Attendees <span style={{ fontWeight: 400, opacity: 0.5 }}>· defaults to everyone</span></label>
            <div className="assignee-picker">
              {(members || []).map(m => {
                const on = eventAttendees.includes(m.id);
                return (
                  <button
                    key={m.id}
                    className={'pick' + (on ? ' on' : '')}
                    onClick={() => setEventAttendees(prev =>
                      prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id]
                    )}
                    style={on ? { '--pick-c': getColor(m.color) } : {}}
                  >
                    <Dot profile={m} />
                    <MemberName profile={m} isMe={m.id === profile?.id} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="field">
        <label>Space <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <SpacePicker value={spaceId} spaces={spaces} onChange={setSpaceId} />
      </div>

    </Modal>
    {/* Pickers hoisted to siblings of the composer modal — see AddTask
        for the explanation. The previous nesting caused the picker to
        render in the top half of the screen because its overlay's
        `inset:0` was scoped to the composer sheet's box. */}
    <DatePickerModal
      open={datePickerOpen}
      value={eventDate}
      title="Event date"
      onClose={() => setDatePickerOpen(false)}
      onPick={(iso) => setEventDate(iso)}
    />
    <DatePickerModal
      open={taskDatePickerOpen}
      value={taskDueDate}
      title="Task due date"
      onClose={() => setTaskDatePickerOpen(false)}
      onPick={(iso) => setTaskDueDate(iso)}
    />
    <TimePickerModal
      open={startTimePickerOpen}
      value={eventStartTime}
      title="Start time"
      onClose={() => setStartTimePickerOpen(false)}
      onPick={(t) => setEventStartTime(t)}
    />
    <TimePickerModal
      open={endTimePickerOpen}
      value={eventEndTime}
      title="End time"
      onClose={() => setEndTimePickerOpen(false)}
      onPick={(t) => setEventEndTime(t)}
    />
    </>
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
        <Dot
          profile={member}
          size="xl"
          style={{ width: 44, height: 44, fontSize: 28 }}
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
function TaskDetailsModal({ open, task, notes, myId, getProfile, onClose, onToggle, onDelete, onOpenNote, onShowMember, onCancelTask, onEdit }) {
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
  const dueTimeLabel = task.due_time ? formatTime12(task.due_time) : '';
  const dueLabel = task.due_date ? (formatDue(task.due_date) + (dueTimeLabel ? ` · ${dueTimeLabel}` : '')) : null;
  const dueLongLabel = task.due_date
    ? (new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) + (dueTimeLabel ? ` at ${dueTimeLabel}` : ''))
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
    if (r.freq === 'custom') {
      const days = Array.isArray(r.days) && r.days.length > 0
        ? r.days.map(i => dayNames[i]).join(', ')
        : 'no day selected';
      return `Custom · ${days}${t}`;
    }
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
                className="member-chip"
                onClick={() => onShowMember && onShowMember(assignee)}
                style={{ fontSize: 14 }}
              >
                <Dot profile={assignee} />
                <MemberName profile={assignee} isMe={assignee.id === myId} style={{ fontWeight: 600 }} />
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
                className="member-chip"
                onClick={() => onShowMember && onShowMember(creator)}
                style={{ fontSize: 14 }}
              >
                <Dot profile={creator} />
                <MemberName profile={creator} isMe={creator.id === myId} style={{ fontWeight: 600 }} />
              </span>
            ) : (
              <span style={{ fontSize: 14 }}>Unknown</span>
            )}
            {createdAt && <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4 }}>{createdAt}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {onEdit && task.created_by === myId && !task.cancelled_at && !cancelMode && (
            <button
              onClick={() => onEdit(task)}
              className="copy-btn"
              style={{ marginLeft: 0 }}
            >Edit</button>
          )}
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
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', border: '1px solid rgba(122,24,24,0.30)', borderRadius: 8, background: 'var(--surface-glass-strong)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }}
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

function NoteDetailsModal({ open, note, tasks, events, myId, myGroupId, members, getProfile, onClose, onDelete, onToggleTask, onShowMember, onNoteUpdated, onTogglePin, onVote, onShowEvent, notify, me }) {
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
  const linkedEvents = (events || []).filter(e => e.note_id === note.id);
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

    // Notify the original post's author so the reply lands in their
    // bell. Skip if the post is mine (no point self-notifying).
    const ownerId = note.created_by;
    if (notify && me && ownerId && ownerId !== myId) {
      notify([ownerId], 'note_replied', {
        note_id: note.id,
        by_name: me.display_name,
        by_color: me.color,
        preview: text.replace(/@\[([^\]]+)\]/g, '@$1').slice(0, 80),
      });
    }
  };

  // Comments are stored as `notes` rows (replies — `payload.reply_to`
  // points back at the parent post), which means the same comment is
  // *also* visible in the main Home Feed. To keep behavior consistent
  // across both surfaces, the × button performs the same soft-delete
  // the feed uses: clear content, set `payload.deleted = true`, and
  // unpin. The row stays so reply chains still resolve; the feed
  // renders it as a "deleted" tombstone.
  const deleteComment = async (id) => {
    const current = comments.find(c => c.id === id);
    if (!current) return;
    const newPayload = {
      ...(current.payload || {}),
      deleted: true,
      deleted_at: new Date().toISOString(),
    };
    setComments(prev => prev.map(c => c.id === id
      ? { ...c, content: '', pinned: false, payload: newPayload }
      : c
    ));
    const { error } = await supabase
      .from('notes')
      .update({ content: '', pinned: false, payload: newPayload })
      .eq('id', id);
    if (error) {
      setComments(prev => prev.map(c => c.id === id ? current : c));
      alert('Could not delete reply: ' + error.message);
      return;
    }
    // Propagate the soft-delete to the parent feed's notes list so the
    // home feed shows the tombstone immediately (otherwise the feed
    // would still hold the original content until next fetch).
    onNoteUpdated?.({ ...current, content: '', pinned: false, payload: newPayload });
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
            <span className="announcement-siren" aria-hidden>🚨</span>
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
              const cDeleted = !!(c.payload && c.payload.deleted);
              // Once deleted, even the post owner can't "re-delete" — the
              // tombstone is the terminal state.
              const canDeleteComment = !cDeleted && (c.created_by === myId || isCreator);
              if (cDeleted) {
                return (
                  <div
                    key={c.id}
                    className="feed-deleted"
                    aria-label="Deleted reply"
                  >deleted</div>
                );
              }
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
                      className="member-chip"
                      onClick={() => cAuthor && onShowMember && onShowMember(cAuthor)}
                      style={{ fontSize: 12, padding: '4px 10px', ...(cAuthor ? null : { cursor: 'default' }) }}
                    >
                      <Dot profile={cAuthor} />
                      {cAuthor ? (
                        <MemberName profile={cAuthor} isMe={c.created_by === myId} style={{ fontWeight: 600 }} />
                      ) : (
                        <span style={{ fontWeight: 600 }}>Unknown</span>
                      )}
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
                        <><Dot profile={assn} /><MemberName profile={assn} isMe={assn.id === myId} /></>
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

      {/* Linked calendar event(s) — populated when an Urgent or
          Reminder post had "Create event from post?" ticked. The
          card mirrors the linked-task card's visual treatment, but
          uses event-shaped fields (date, time, attendees). */}
      <div style={{ borderTop: '1px dashed rgba(20, 20, 20, 0.2)', paddingTop: 14, marginTop: 14 }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--mute)', marginBottom: 8 }}>
          Linked event{linkedEvents.length === 1 ? '' : 's'}
        </div>
        {linkedEvents.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--mute)', fontStyle: 'italic' }}>
            No event linked to this post.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {linkedEvents.map(ev => {
              const evAuthor = getProfile(ev.created_by);
              const evColor = getColor(evAuthor?.color);
              const dateStr = ev.date
                ? new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : '';
              const timeStr =
                ev.start_time && ev.end_time
                  ? `${ev.start_time}–${ev.end_time}`
                  : ev.start_time || '';
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onShowEvent?.(ev)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 12px',
                    background: 'var(--paper)',
                    border: '1.5px solid var(--ink)', borderRadius: 10,
                    borderLeft: `6px solid ${evColor}`,
                    cursor: 'pointer', textAlign: 'left',
                    font: 'inherit',
                    width: '100%',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: evColor, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, flexShrink: 0, marginTop: 1,
                    }}
                  >📅</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, wordBreak: 'break-word' }}>
                      {renderWithMentions(ev.title, false, members)}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em', color: 'var(--mute)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      {dateStr && <span>{dateStr}</span>}
                      {timeStr && (<><span>·</span><span>{timeStr}</span></>)}
                      {ev.location && (<><span>·</span><span>{ev.location}</span></>)}
                    </div>
                  </div>
                </button>
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
            className="member-chip"
            onClick={() => author && onShowMember && onShowMember(author)}
            style={{ fontSize: 14, ...(author ? null : { cursor: 'default' }) }}
          >
            <Dot profile={author} />
            {author ? (
              <MemberName profile={author} isMe={author.id === myId} style={{ fontWeight: 600 }} />
            ) : (
              <span style={{ fontWeight: 600 }}>Unknown</span>
            )}
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
    if (n.type === 'event_rsvp') {
      const d = p.event_date ? new Date(p.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      const verb = ({ yes: 'is going to', maybe: 'might go to', no: "can't make" })[p.status] || 'replied about';
      const emoji = ({ yes: '✅', maybe: '🤔', no: '❌' })[p.status] || '📅';
      return (
        <>
          <span className="fb-bell-icon-circle" style={{ background: getColor(p.by_color), fontSize: 14 }}>{emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fb-bell-text">
              <strong>{p.by_name || 'Someone'}</strong> {verb} your event
            </div>
            <div className="fb-bell-sub">{p.event_title}{d ? ` · ${d}` : ''}</div>
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
    if (n.type === 'note_replied') {
      return (
        <>
          <span className="fb-bell-icon-circle" style={{ background: getColor(p.by_color), fontWeight: 800, fontSize: 14 }}>↰</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fb-bell-text">
              <strong>{p.by_name || 'Someone'}</strong> replied to your post
            </div>
            {p.preview && <div className="fb-bell-sub">{p.preview}</div>}
          </div>
        </>
      );
    }
    if (n.type === 'announcement') {
      return (
        <>
          <span className="fb-bell-icon-circle" style={{ background: '#E63946', fontSize: 14 }}>🚨</span>
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
              else if ((n.type === 'event_invited' || n.type === 'event_rsvp') && onOpenEvent) onOpenEvent(id);
              else if ((n.type === 'note_tagged' || n.type === 'note_replied' || n.type === 'announcement') && onOpenNote) onOpenNote(id);
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

// ─── Shared Lists ─────────────────────────────────────────────────────────────
// Lightweight collaborative lists (groceries, packing, hardware store, etc.).
// Slash syntax for fast entry: "milk x2 #dairy @maya" → title="milk",
// quantity="2", category="dairy", assigned_to=<maya's id>. Members are
// matched by display_name prefix (case-insensitive). If a token fails to
// match a member, it stays in the title so the user knows.
function parseListItemInput(raw, members) {
  let text = String(raw || '').trim();
  let quantity = null, category = null, assigned_to = null;
  const qm = text.match(/(?:^|\s)x(\d+(?:\.\d+)?[a-z%]*)\b/i);
  if (qm) {
    quantity = qm[1];
    text = (text.slice(0, qm.index) + text.slice(qm.index + qm[0].length)).trim();
  }
  const cm = text.match(/(?:^|\s)#([\w-]+)/);
  if (cm) {
    category = cm[1];
    text = (text.slice(0, cm.index) + text.slice(cm.index + cm[0].length)).trim();
  }
  const am = text.match(/(?:^|\s)@([\w-]+)/);
  if (am) {
    const needle = am[1].toLowerCase();
    const match = (members || []).find(m => (m.display_name || '').toLowerCase().startsWith(needle));
    if (match) {
      assigned_to = match.id;
      text = (text.slice(0, am.index) + text.slice(am.index + am[0].length)).trim();
    }
  }
  return { title: text.replace(/\s+/g, ' ').trim(), quantity, category, assigned_to };
}

// Tiny relative-time helper for the activity feed ("2m ago", "yesterday").
function relTime(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)    return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)    return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)    return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1)   return 'yesterday';
  if (d < 7)     return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Human label for an activity row.
function activityLabel(row, getProfile) {
  const who = (getProfile(row.actor_id)?.display_name) || 'Someone';
  const t = row.payload?.title || row.payload?.item_title || '';
  switch (row.action) {
    case 'list_created':    return `${who} created the list`;
    case 'list_renamed':    return `${who} renamed the list`;
    case 'list_deleted':    return `${who} deleted the list`;
    case 'item_added':      return `${who} added ${t || 'an item'}`;
    case 'item_completed':  return `${who} checked off ${t || 'an item'}`;
    case 'item_uncompleted':return `${who} unchecked ${t || 'an item'}`;
    case 'item_removed':    return `${who} removed ${t || 'an item'}`;
    case 'item_assigned':   return `${who} assigned ${t || 'an item'}`;
    default:                return `${who} ${row.action}`;
  }
}

// One row inside a list. Tap the checkbox to toggle completion. Swipe-left
// to delete (mirrors the task swipe pattern). Tap the assignee chip to
// cycle through members (fast, no modal).
function ListItemRow({ item, members, getProfile, myId, onToggle, onDelete, onCycleAssignee }) {
  const assignee = item.assigned_to ? getProfile(item.assigned_to) : null;
  const itemColor = assignee ? getColor(assignee.color) : 'var(--text-muted)';
  return (
    <SwipeToDelete onDelete={() => onDelete(item.id)}>
      <div className={'list-item-row' + (item.completed ? ' done' : '')} style={{ '--c': itemColor }}>
        <button
          type="button"
          className={'list-item-check' + (item.completed ? ' on' : '')}
          onClick={() => onToggle(item.id, !item.completed)}
          aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
        >{item.completed ? '✓' : ''}</button>
        <div className="list-item-body">
          <div className="list-item-title">{item.title}</div>
          {(item.quantity || item.category) && (
            <div className="list-item-meta">
              {item.quantity && <span className="list-item-qty">×{item.quantity}</span>}
              {item.category && <span className="list-item-cat">#{item.category}</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          className="list-item-assn"
          onClick={() => onCycleAssignee(item)}
          title={assignee ? `Assigned to ${assignee.display_name}` : 'Tap to assign'}
        >
          {assignee
            ? <><Dot profile={assignee} /><span className="list-item-assn-name">{assignee.display_name}</span></>
            : <span className="list-item-assn-empty">+</span>}
        </button>
      </div>
    </SwipeToDelete>
  );
}

// Single list "card" — collapsed shows title + counts; expanded shows
// items, the inline add composer, and an optional activity feed.
// ─── List Detail Modal ────────────────────────────────────────────────────────
// Full-screen bottom sheet for one list: items, add-item composer, activity.
function ListDetailModal({ open, list, items, members, getProfile, myId, onClose, onAddItem, onToggleItem, onDeleteItem, onCycleAssignee, activity, onLoadActivity }) {
  const [draft, setDraft] = React.useState('');
  const [showActivity, setShowActivity] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setDraft('');
      setShowActivity(false);
      // Focus add-input so user can start typing immediately
      setTimeout(() => inputRef.current?.focus(), 320);
    }
  }, [open]);

  React.useEffect(() => {
    if (showActivity && onLoadActivity && list?.id) onLoadActivity(list.id);
  }, [showActivity, list?.id, onLoadActivity]);

  if (!open || !list) return null;

  const openItems = (items || []).filter(i => !i.completed).sort((a, b) => a.position - b.position);
  const doneItems = (items || []).filter(i =>  i.completed).sort((a, b) => a.position - b.position);
  const ordered   = [...openItems, ...doneItems];
  const color     = getColor(list.color || 'coral');

  const submitDraft = () => {
    const t = draft.trim();
    if (!t) return;
    const parsed = parseListItemInput(t, members);
    if (!parsed.title) return;
    onAddItem(list.id, parsed);
    setDraft('');
    inputRef.current?.focus();
  };

  return (
    <Modal open={open} onClose={onClose} title={list.title}>
      <div style={{ borderLeft: `4px solid ${color}`, paddingLeft: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em' }}>
          {openItems.length} {openItems.length === 1 ? 'item' : 'items'} open
          {doneItems.length > 0 && ` · ${doneItems.length} done`}
        </div>
      </div>

      {ordered.length > 0 ? (
        <div className="list-items" style={{ marginBottom: 14 }}>
          {ordered.map(it => (
            <ListItemRow
              key={it.id}
              item={it}
              members={members}
              getProfile={getProfile}
              myId={myId}
              onToggle={onToggleItem}
              onDelete={onDeleteItem}
              onCycleAssignee={onCycleAssignee}
            />
          ))}
        </div>
      ) : (
        <div className="list-empty" style={{ marginBottom: 14 }}>Nothing yet — add the first item below.</div>
      )}

      <div className="list-add-row">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitDraft(); } }}
          placeholder="Add item — try 'milk x2 #dairy @mom'"
          className="list-add-input"
          maxLength={200}
        />
        <button type="button" className="list-add-btn" onClick={submitDraft} disabled={!draft.trim()} aria-label="Add item" style={{ '--c': color }}>+</button>
      </div>

      <button type="button" className="list-activity-toggle" onClick={() => setShowActivity(s => !s)} style={{ marginTop: 10 }}>
        {showActivity ? 'Hide activity' : 'Show activity'}
      </button>
      {showActivity && (
        <div className="list-activity">
          {(activity && activity.length > 0)
            ? activity.slice(0, 15).map(a => (
                <div key={a.id} className="list-activity-row">
                  <span className="list-activity-text">{activityLabel(a, getProfile)}</span>
                  <span className="list-activity-when">{relTime(a.created_at)}</span>
                </div>
              ))
            : <div className="list-activity-empty">No activity yet.</div>}
        </div>
      )}
    </Modal>
  );
}

// ─── Add List Modal ───────────────────────────────────────────────────────────
// Name input + member picker. Opens when user clicks Create with empty input,
// or directly via a create button press.
function AddListModal({ open, onClose, members, myId, initialTitle = '', spaces, initialSpaceId, onSave }) {
  const [title, setTitle]       = React.useState('');
  const [memberIds, setMemberIds] = React.useState([]);
  const [spaceId, setSpaceId]   = React.useState(initialSpaceId || null);
  const [saving, setSaving]     = React.useState(false);

  // Reset every time the modal opens; pre-fill title if caller passed one.
  React.useEffect(() => {
    if (open) {
      setTitle(initialTitle || '');
      // Start empty so the "Everyone" chip isn't pre-highlighted — the
      // user actively picks members (or taps Everyone). The list-helper
      // text below the picker handles the "no one selected" state.
      setMemberIds([]);
      setSpaceId(initialSpaceId || null);
      setSaving(false);
    }
  }, [open, initialTitle, members, initialSpaceId]);

  const toggleMember = (id) => {
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const allSelected = (members || []).length > 0 && (members || []).every(m => memberIds.includes(m.id));

  const save = async () => {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    const result = await onSave({ title: t, memberIds, spaceId });
    setSaving(false);
    if (!result?.error) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<>New <em>list</em></>}
      footer={
        <button className="fb-btn solid" onClick={save} disabled={!title.trim() || saving}>
          {saving ? 'Creating…' : 'Create list'}
        </button>
      }
    >
      <div className="field">
        <label>List name</label>
        <div style={{ position: 'relative' }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
            placeholder="e.g. Groceries, School supplies"
            maxLength={120}
          />
          <SpaceHashtagDropdown
            value={title}
            spaces={spaces}
            onChange={setTitle}
            onPickSpace={setSpaceId}
          />
        </div>
      </div>
      <div className="field">
        <label>
          Shared with
          <span style={{ fontWeight: 400, opacity: 0.5 }}> · tap to change</span>
        </label>
        <div className="assignee-picker">
          {/* Everyone shortcut — gradient + envelope only when actually
              all-selected. Same visual treatment as the other Add* modals. */}
          <button
            type="button"
            className={'pick' + (allSelected ? ' on' : '')}
            onClick={() => setMemberIds(allSelected ? [] : (members || []).map(m => m.id))}
          >
            <span aria-hidden>📨</span>
            <span>Everyone</span>
          </button>
          {(members || []).map(m => (
            <button
              key={m.id}
              type="button"
              className={'pick' + (memberIds.includes(m.id) ? ' on' : '')}
              onClick={() => toggleMember(m.id)}
              style={memberIds.includes(m.id) ? { '--pick-c': getColor(m.color) } : {}}
            >
              <Dot profile={m} />
              <MemberName profile={m} isMe={m.id === myId} />
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {memberIds.length === 0
            ? 'No one selected — only you will see this list.'
            : memberIds.length === (members || []).length
            ? 'Everyone in the group can see this list.'
            : `${memberIds.length} ${memberIds.length === 1 ? 'person' : 'people'} will see this list.`}
        </div>
      </div>
      <div className="field">
        <label>Space <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <SpacePicker value={spaceId} spaces={spaces} onChange={setSpaceId} />
      </div>
    </Modal>
  );
}

// ─── List Card (section row) ──────────────────────────────────────────────────
// Tap to open ListDetailModal. Shows title, counts, member avatars, delete.
function ListCard({ list, items, members, getProfile, myId, onOpen, onDeleteList }) {
  const openCount = (items || []).filter(i => !i.completed).length;
  const doneCount = (items || []).filter(i =>  i.completed).length;
  const color     = getColor(list.color || 'coral');

  // Member avatars for who the list is shared with
  const sharedWith = Array.isArray(list.member_ids) && list.member_ids.length > 0
    ? list.member_ids.map(id => getProfile(id)).filter(Boolean)
    : members || [];

  return (
    <div className="list-card" style={{ '--c': color }}>
      <button type="button" className="list-card-hd" onClick={() => onOpen(list)}>
        <span className="list-card-caret" aria-hidden>▸</span>
        <span className="list-card-title">{list.title}</span>
        <div className="list-card-right">
          {/* Member dot cluster */}
          <span className="list-card-members">
            {sharedWith.slice(0, 4).map(m => (
              <span key={m.id} title={m.display_name || m.name} style={{ '--c': getColor(m.color) }} className="list-member-dot" />
            ))}
            {sharedWith.length > 4 && <span className="list-card-count" style={{ fontSize: 10 }}>+{sharedWith.length - 4}</span>}
          </span>
          <span className="list-card-count">
            {openCount} {openCount === 1 ? 'item' : 'items'}
            {doneCount > 0 && <> · {doneCount} done</>}
          </span>
        </div>
        {list.created_by === myId && (
          <span
            role="button"
            tabIndex={0}
            className="list-card-del"
            aria-label="Delete list"
            onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${list.title}"?`)) onDeleteList(list.id); }}
          >×</span>
        )}
      </button>
      {list.space_id && (
        <div style={{ padding: '0 12px 10px' }}>
          <SpaceTag spaceId={list.space_id} />
        </div>
      )}
    </div>
  );
}

function ListsSection({
  lists, listItems, members, getProfile, myId,
  collapsed, onToggleCollapse,
  onAddList, onDeleteList,
  onAddItem, onToggleItem, onDeleteItem, onCycleAssignee,
  activityByList, onLoadActivity,
  // Modal callbacks — state lives in MainApp so modals render at screen
  // level (same as AddTaskModal/AddEventModal) and scroll stays isolated.
  onOpenAddModal, onOpenDetail,
}) {
  // Only show lists the current user is a member of (or created).
  // Lists without member_ids (legacy / no column yet) are visible to all.
  const visibleLists = (lists || [])
    .filter(l => {
      if (l.archived_at) return false;
      if (l.created_by === myId) return true;
      if (!Array.isArray(l.member_ids) || l.member_ids.length === 0) return true;
      return l.member_ids.includes(myId);
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const totalOpenItems = (listItems || []).filter(i => {
    const list = visibleLists.find(l => l.id === i.list_id);
    return list && !i.completed;
  }).length;

  return (
    <section className={'fb-sec' + (collapsed ? ' collapsed' : '')} id="sec-lists">
      <div className="fb-sec-hd">
        <div className="fb-sec-hd-left">
          <h2 className="fb-sec-title">Shared <em>lists</em></h2>
          <SectionToggle collapsed={collapsed} onClick={onToggleCollapse} />
        </div>
        <div className="fb-sec-hd-right">
          <div className="fb-sec-meta">{totalOpenItems} open</div>
        </div>
      </div>

      {!collapsed && (<>
      {/* Same primary section-action button as "+ Add task" / "+ Post". */}
      <button className="fb-btn" onClick={() => onOpenAddModal?.()}>
        <span className="plus">+</span> Create list
      </button>

      {visibleLists.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', padding: '16px 2px', marginTop: 32 }}>
          No lists yet — tap <strong>+ Create list</strong> to get started.
        </div>
      ) : (
        <div className="lists-stack">
          {visibleLists.map(list => (
            <ListCard
              key={list.id}
              list={list}
              items={(listItems || []).filter(i => i.list_id === list.id)}
              members={members}
              getProfile={getProfile}
              myId={myId}
              onOpen={onOpenDetail}
              onDeleteList={onDeleteList}
            />
          ))}
        </div>
      )}
      </>)}
    </section>
  );
}

// ─── Spaces ───────────────────────────────────────────────────────────────────
// A Space is a lightweight tag that groups related tasks/lists/notes/events
// into one view ("Italy Trip", "Garden", "Christmas"). Items keep living in
// their normal sections; the Space view is a filter across all four types.
const SPACE_EMOJI_OPTIONS = [
  '✨', '🏕️', '🇮🇹', '🎄', '🌱', '⚽',
  '🎒', '🏠', '🎂', '📚', '🏖️', '🍳',
  '🚗', '🐾', '🎁', '🎨', '🛠️', '🧺',
];

const SPACE_COLOR_OPTIONS = [
  'coral', 'amber', 'green', 'teal', 'blue',
  'periwinkle', 'plum', 'rose', 'red',
];

// Small inline pill that shows a Space's emoji + title. Used on TaskRows,
// EventCards, ListCards, FeedPosts so a tagged item visually carries its
// Space membership. Tapping (when onClick is provided) opens the Space.
// `color` overrides the space's stored color — callers pass the Space
// creator's profile color so the chip stays consistent with the rest
// of that user's items, app-wide.
function SpaceChip({ space, onClick, compact = false, color }) {
  if (!space) return null;
  const c = color || getColor('coral');
  return (
    <button
      type="button"
      className={'space-chip' + (compact ? ' compact' : '')}
      style={{ '--c': c }}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(space); } : undefined}
      title={space.title}
    >
      <span className="space-chip-emoji" aria-hidden>{space.emoji || '✨'}</span>
      <span className="space-chip-title">{space.title}</span>
    </button>
  );
}

// Context-aware chip rendered on TaskRow / EventCard / ListCard / FeedPost
// whenever the item has a space_id. Resolves the Space from context and
// opens its detail modal on tap. Color is derived from the Space
// creator's profile color so it stays in sync app-wide.
function SpaceTag({ spaceId, compact = true }) {
  const { spaces, showSpace, getProfile } = React.useContext(SpacesContext);
  if (!spaceId) return null;
  const space = (spaces || []).find(s => s.id === spaceId);
  if (!space) return null;
  const creator = getProfile?.(space.created_by);
  const color = getColor(creator?.color || 'coral');
  return <SpaceChip space={space} compact={compact} onClick={showSpace || undefined} color={color} />;
}

// Local wrapper around the shared EmojiInput so callers in this file
// still write <EmojiPicker value=… onChange=… />. Uses the Space-topic
// presets as quick picks; the underlying input accepts any iOS emoji.
function EmojiPicker({ value, onChange }) {
  return (
    <EmojiInput
      value={value}
      onChange={onChange}
      presets={SPACE_EMOJI_OPTIONS}
    />
  );
}

// Color swatch row matching the existing color palette.
function SpaceColorPicker({ value, onChange }) {
  return (
    <div className="space-color-picker" role="radiogroup" aria-label="Color">
      {SPACE_COLOR_OPTIONS.map(c => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          className={'space-color-swatch' + (value === c ? ' on' : '')}
          style={{ '--c': getColor(c) }}
          onClick={() => onChange(c)}
          aria-label={c}
        />
      ))}
    </div>
  );
}

// Picker row used inside AddTask/AddEvent/AddNote/AddList modals so each
// item can optionally be tagged into a Space at creation time. Horizontal
// chip strip — "None" + each available Space — single-select. Chip color
// pulls from the Space creator's profile so the visual matches them
// everywhere else.
function SpacePicker({ value, spaces, onChange }) {
  const { getProfile } = React.useContext(SpacesContext);
  const visible = (spaces || []).filter(s => !s.archived_at);
  return (
    <div className="assignee-picker">
      <button
        type="button"
        className={'pick' + (!value ? ' on' : '')}
        onClick={() => onChange(null)}
        style={!value ? { '--pick-c': 'var(--text-muted)' } : {}}
      >
        None
      </button>
      {visible.map(s => {
        const on = value === s.id;
        const creator = getProfile?.(s.created_by);
        const c = getColor(creator?.color || 'coral');
        return (
          <button
            key={s.id}
            type="button"
            className={'pick' + (on ? ' on' : '')}
            onClick={() => onChange(s.id)}
            style={on ? { '--pick-c': c } : {}}
            title={s.title}
          >
            <span style={{ fontSize: 14 }} aria-hidden>{s.emoji || '✨'}</span>
            <span>{s.title}</span>
          </button>
        );
      })}
    </div>
  );
}

// Compact "Mon Jun 14" / "Mon Jun 14, 2026" label for an event date.
function eventPickerDate(iso, withYear) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US',
    withYear ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
             : { month: 'short', day: 'numeric' });
}

// De-dupe an events list (expansion instances share a master id) and sort
// nearest-first (upcoming ascending, then past descending).
function dedupeSortEvents(events) {
  const seen = new Set();
  const unique = (events || []).filter(e => {
    if (!e || seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  const todayIso = localTodayISO();
  return unique.slice().sort((a, b) => {
    const aUp = (a.date || '') >= todayIso;
    const bUp = (b.date || '') >= todayIso;
    if (aUp !== bUp) return aUp ? -1 : 1;
    return aUp ? (a.date || '').localeCompare(b.date || '') : (b.date || '').localeCompare(a.date || '');
  });
}

// Bottom-sheet picker to link a task to an existing calendar event.
// Opened from a trigger in AddTaskModal (same pattern as the date/time
// pickers) so the form stays uncluttered instead of listing every event.
function EventPickerModal({ open, value, events, members, onClose, onPick }) {
  if (!open) return null;
  const sorted = dedupeSortEvents(events);
  const rowStyle = (on) => ({
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
    border: '1.5px solid ' + (on ? 'var(--kinnekt-purple, #6A4DFF)' : 'var(--rule)'),
    background: on ? 'var(--hover-tint)' : 'var(--surface-glass-strong)',
    color: 'var(--ink)', font: 'inherit', textAlign: 'left',
  });
  return (
    <Modal open={open} onClose={onClose} title={<>Link to <em>event</em></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" style={rowStyle(!value)} onClick={() => onPick(null)}>
          <span style={{ flex: 1, color: 'var(--text-muted)' }}>None — not linked</span>
          {!value && <span aria-hidden>✓</span>}
        </button>
        {sorted.map(e => {
          const on = value === e.id;
          return (
            <button key={e.id} type="button" style={rowStyle(on)} onClick={() => onPick(e.id)} title={plainMentions(e.title)}>
              <span aria-hidden style={{ fontSize: 16 }}>📅</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {renderWithMentions(e.title, false, members)}
                </span>
                {e.date && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                    {eventPickerDate(e.date, true)}
                  </span>
                )}
              </span>
              {on && <span aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// Inline `#space` autocomplete dropdown for plain <input> fields.
// Detects a trailing `#word` token and shows matching Spaces. On pick,
// strips the `#word` from the input value and sets the Space tag via
// onPickSpace — the modal's existing SpacePicker chip lights up too,
// so the user gets visual confirmation in two places.
function SpaceHashtagDropdown({ value, spaces, onChange, onPickSpace }) {
  const { getProfile } = React.useContext(SpacesContext);
  const match = /(?:^|\s)#([a-zA-Z0-9_-]*)$/.exec(value || '');
  if (!match) return null;
  const query = match[1].toLowerCase();
  const filtered = (spaces || [])
    .filter(s => !s.archived_at)
    .filter(s => !query || s.title.toLowerCase().includes(query))
    .slice(0, 6);

  const pick = (space) => {
    const stripped = (value || '')
      .replace(/(?:^|\s)#[a-zA-Z0-9_-]*$/, (m) => m.startsWith(' ') ? ' ' : '')
      .trimEnd();
    onChange(stripped);
    onPickSpace(space.id);
  };

  return (
    <div className="space-hash-picker">
      {filtered.length === 0 ? (
        <div className="space-hash-empty">No matching spaces.</div>
      ) : (
        filtered.map(s => {
          const creator = getProfile?.(s.created_by);
          const c = getColor(creator?.color || 'coral');
          return (
            <button
              key={s.id}
              type="button"
              className="space-hash-pick-item"
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              style={{ '--c': c }}
            >
              <span className="space-hash-emoji" aria-hidden>{s.emoji || '✨'}</span>
              <span className="space-hash-title">{s.title}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

// Full-width Space card shown inside SpacesSection. Counts are an
// at-a-glance summary of how many items across all four content types
// currently belong to this Space.
function SpaceCard({ space, counts, members, getProfile, myId, onOpen, onDeleteSpace }) {
  // Color derives from the Space creator's profile color so the visual
  // identity follows them app-wide. If they change their profile color,
  // every space they made re-tints to match.
  const creator = getProfile?.(space.created_by);
  const color = getColor(creator?.color || 'coral');
  const sharedWith = Array.isArray(space.member_ids) && space.member_ids.length > 0
    ? space.member_ids.map(id => getProfile(id)).filter(Boolean)
    : members || [];
  const totalOpen = (counts?.openTasks || 0)
    + (counts?.upcomingEvents || 0)
    + (counts?.openListItems || 0)
    + (counts?.notes || 0);

  return (
    <div className="space-card" style={{ '--c': color }}>
      <button type="button" className="space-card-hd" onClick={() => onOpen(space)}>
        <span className="space-card-emoji" aria-hidden>{space.emoji || '✨'}</span>
        <div className="space-card-body">
          <div className="space-card-title">{space.title}</div>
          <div className="space-card-meta">
            {totalOpen === 0
              ? 'Empty'
              : [
                  counts?.openTasks ? `${counts.openTasks} task${counts.openTasks === 1 ? '' : 's'}` : null,
                  counts?.upcomingEvents ? `${counts.upcomingEvents} event${counts.upcomingEvents === 1 ? '' : 's'}` : null,
                  counts?.openListItems ? `${counts.openListItems} item${counts.openListItems === 1 ? '' : 's'}` : null,
                  counts?.notes ? `${counts.notes} note${counts.notes === 1 ? '' : 's'}` : null,
                ].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="space-card-right">
          <span className="space-card-members">
            {sharedWith.slice(0, 4).map(m => (
              <span key={m.id} title={m.display_name || m.name}
                    style={{ '--c': getColor(m.color) }} className="space-member-dot" />
            ))}
            {sharedWith.length > 4 && (
              <span className="space-card-extra">+{sharedWith.length - 4}</span>
            )}
          </span>
        </div>
        {space.created_by === myId && (
          <span
            role="button"
            tabIndex={0}
            className="space-card-del"
            aria-label="Delete space"
            onClick={e => {
              e.stopPropagation();
              if (window.confirm(`Delete "${space.title}"? Items tagged with this space will be unassigned but not deleted.`)) {
                onDeleteSpace(space.id);
              }
            }}
          >×</span>
        )}
      </button>
    </div>
  );
}

function AddSpaceModal({ open, onClose, members, myId, initial, onSave }) {
  const [title, setTitle] = React.useState('');
  const [emoji, setEmoji] = React.useState('✨');
  const [color, setColor] = React.useState('coral');
  const [description, setDescription] = React.useState('');
  const [memberIds, setMemberIds] = React.useState([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(initial?.title || '');
    setEmoji(initial?.emoji || '✨');
    setColor(initial?.color || 'coral');
    setDescription(initial?.description || '');
    // When editing, preserve the saved member list. When creating fresh,
    // start empty so the "Everyone" chip isn't pre-highlighted — the
    // user actively picks (or taps Everyone).
    setMemberIds(
      Array.isArray(initial?.member_ids) && initial.member_ids.length > 0
        ? initial.member_ids
        : []
    );
    setSaving(false);
  }, [open, initial, members]);

  const isEdit = !!initial?.id;
  const toggleMember = (id) => {
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const allSelected = (members || []).length > 0 && (members || []).every(m => memberIds.includes(m.id));

  const save = async () => {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    const result = await onSave({
      id: initial?.id,
      title: t, emoji, color,
      description: description.trim(),
      memberIds,
    });
    setSaving(false);
    if (!result?.error) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? <>Edit <em>space</em></> : <>New <em>space</em></>}
      footer={
        <button className="fb-btn solid" onClick={save} disabled={!title.trim() || saving}>
          {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save changes' : 'Create space')}
        </button>
      }
    >
      {!isEdit && (
        <div style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--text-muted)',
          padding: '2px 0 14px',
          marginBottom: 14,
          borderBottom: '1px solid var(--border-soft)',
        }}>
          A Space is a hub for one project, trip, or family event — like a vacation,
          a renovation, or a wedding. Tag any task, event, list, or post with this
          Space and it'll show up here too, gathered with everything else for the
          same topic.
        </div>
      )}
      <div className="field">
        <label>Name</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
          placeholder="e.g. Italy Trip, Christmas, Garden"
          maxLength={120}
        />
      </div>
      <div className="field">
        <label>Icon</label>
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </div>
      {/* No color picker — every Space wears its creator's profile color,
          so the visual identity stays consistent app-wide and updates
          automatically when the creator changes their profile color. */}
      <div className="field">
        <label>Description <span style={{ fontWeight: 400, opacity: 0.5 }}>· optional</span></label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What's this space for?"
          rows={2}
          maxLength={400}
          style={{
            width: '100%', resize: 'vertical',
            padding: '10px 12px',
            border: '1px solid var(--border-soft)',
            background: 'var(--surface-glass-strong)',
            borderRadius: 10, fontFamily: 'inherit', fontSize: 14, color: 'var(--text-primary)',
          }}
        />
      </div>
      <div className="field">
        <label>
          Shared with
          <span style={{ fontWeight: 400, opacity: 0.5 }}> · tap to change</span>
        </label>
        <div className="assignee-picker">
          {/* "Everyone" — gradient-filled with 📨 envelope ONLY when all
              members are actually selected. Otherwise outlined off-state.
              Matches the Send RSVP chip in AddEventModal exactly. */}
          <button
            type="button"
            className={'pick' + (allSelected ? ' on' : '')}
            onClick={() => setMemberIds(allSelected ? [] : (members || []).map(m => m.id))}
          >
            <span aria-hidden>📨</span>
            <span>Everyone</span>
          </button>
          {(members || []).map(m => (
            <button
              key={m.id}
              type="button"
              className={'pick' + (memberIds.includes(m.id) ? ' on' : '')}
              onClick={() => toggleMember(m.id)}
              style={memberIds.includes(m.id) ? { '--pick-c': getColor(m.color) } : {}}
            >
              <Dot profile={m} />
              <MemberName profile={m} isMe={m.id === myId} />
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {memberIds.length === 0
            ? 'No one selected — only you will see this space.'
            : memberIds.length === (members || []).length
            ? 'Everyone in the group can see this space.'
            : `${memberIds.length} ${memberIds.length === 1 ? 'person' : 'people'} will see this space.`}
        </div>
      </div>
    </Modal>
  );
}

// The big "click into a Space" popup. Mirrors MemberDetailsModal — header,
// then sections of items grouped by type. Each section has a quick "+ Add"
// that opens the corresponding Add* modal with space_id pre-set.
function SpaceDetailModal({
  open, space, onClose,
  tasks, events, notes, lists, listItems,
  spaceItems, onAddSpaceItem, onToggleSpaceItem, onDeleteSpaceItem, onCycleSpaceItemAssignee,
  members, getProfile, myId,
  onEdit, onArchive, onAddTask, onAddEvent, onAddNote, onAddList,
  onShowTask, onShowEvent, onShowNote, onOpenList,
}) {
  const [checklistDraft, setChecklistDraft] = React.useState('');
  const checklistInputRef = React.useRef(null);

  // Reset checklist draft when modal opens/switches spaces.
  React.useEffect(() => {
    if (open) setChecklistDraft('');
  }, [open, space?.id]);

  if (!open || !space) return null;

  // Color derives from the Space creator's profile — same rule used
  // throughout: items always wear the color of the person who made them.
  const creator = getProfile?.(space.created_by);
  const color = getColor(creator?.color || 'coral');
  const sharedWith = Array.isArray(space.member_ids) && space.member_ids.length > 0
    ? space.member_ids.map(id => getProfile(id)).filter(Boolean)
    : members || [];

  const spaceTasks  = (tasks  || []).filter(t => t.space_id === space.id);
  const spaceEvents = (events || []).filter(e => e.space_id === space.id);
  const spaceNotes  = (notes  || []).filter(n => n.space_id === space.id);
  const spaceLists  = (lists  || []).filter(l => l.space_id === space.id);
  // Built-in checklist items (the absorbed "Lists" feature). Sorted with
  // open items first, then completed, both by position to preserve order.
  const myItems = (spaceItems || []).filter(i => i.space_id === space.id);
  const openItems = myItems.filter(i => !i.completed).sort((a, b) => a.position - b.position);
  const doneItems = myItems.filter(i =>  i.completed).sort((a, b) => a.position - b.position);
  const orderedItems = [...openItems, ...doneItems];

  const submitChecklistDraft = () => {
    const t = (checklistDraft || '').trim();
    if (!t || !onAddSpaceItem) return;
    const parsed = parseListItemInput(t, members);
    if (!parsed.title) return;
    onAddSpaceItem(space.id, parsed);
    setChecklistDraft('');
    checklistInputRef.current?.focus();
  };

  const openTasks = spaceTasks.filter(t => !t.completed && !t.cancelled_at);
  const doneTasks = spaceTasks.filter(t => t.completed);
  const today = localTodayISO();
  const upcoming = spaceEvents
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = spaceEvents
    .filter(e => e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  const itemStyle = {
    padding: '10px 12px',
    background: 'var(--surface-glass-strong)',
    border: '1px solid var(--border-glass)',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: 1.4,
  };
  const sectionLabelStyle = {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 10, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.14em',
    color: 'var(--text-muted)',
    marginBottom: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  const emptyStyle = { fontSize: 13, fontStyle: 'italic', color: 'var(--text-muted)' };
  const addBtnStyle = {
    fontSize: 11, fontWeight: 600, padding: '4px 10px',
    borderRadius: 999, border: '1px solid var(--border-soft)',
    background: 'transparent', cursor: 'pointer',
    color: 'var(--text-primary)', letterSpacing: '0.04em',
    textTransform: 'none',
  };

  return (
    <Modal open={open} onClose={onClose} title="Space">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '4px 0 18px', marginBottom: 18,
        borderBottom: '1px solid var(--border-soft)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: `${color}1a`, border: `1px solid ${color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30, flexShrink: 0,
        }} aria-hidden>{space.emoji || '✨'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Satoshi, Inter, system-ui, sans-serif',
            fontSize: 22, fontWeight: 700, lineHeight: 1.15,
            letterSpacing: '-0.02em', color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{space.title}</div>
          {space.description && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
              {space.description}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            {sharedWith.slice(0, 6).map(m => (
              <span key={m.id} title={m.display_name}
                    style={{ '--c': getColor(m.color) }} className="space-member-dot" />
            ))}
            {sharedWith.length > 6 && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                +{sharedWith.length - 6}
              </span>
            )}
            <span style={{
              marginLeft: 'auto', display: 'flex', gap: 6,
            }}>
              {space.created_by === myId && (
                <button type="button" onClick={() => onEdit && onEdit(space)} style={addBtnStyle}>Edit</button>
              )}
              {space.created_by === myId && (
                <button type="button" onClick={() => onArchive && onArchive(space)} style={addBtnStyle}>
                  {space.archived_at ? 'Unarchive' : 'Archive'}
                </button>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Checklist — the absorbed "Lists" feature. Always rendered so an
          empty Space can be used as a simple to-buy list with zero setup.
          Uses the same ListItemRow primitive as the old ListDetailModal,
          plus the same parseListItemInput so "milk x2 #dairy @mom" works
          identically here. */}
      <div style={{ marginBottom: 22 }}>
        <div style={sectionLabelStyle}>
          <span>Checklist {openItems.length > 0 && <span style={{ color }}>· {openItems.length} open</span>}
            {doneItems.length > 0 && <span style={{ color: 'var(--text-muted)' }}> · {doneItems.length} done</span>}
          </span>
        </div>
        {orderedItems.length > 0 && (
          <div className="list-items" style={{ marginBottom: 10 }}>
            {orderedItems.map(it => (
              <ListItemRow
                key={it.id}
                item={it}
                members={members}
                getProfile={getProfile}
                myId={myId}
                onToggle={onToggleSpaceItem}
                onDelete={onDeleteSpaceItem}
                onCycleAssignee={onCycleSpaceItemAssignee}
              />
            ))}
          </div>
        )}
        <div className="list-add-row">
          <input
            ref={checklistInputRef}
            value={checklistDraft}
            onChange={e => setChecklistDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitChecklistDraft(); } }}
            placeholder="Add item — try 'milk x2 @mom'"
            className="list-add-input"
            maxLength={200}
          />
          <button
            type="button"
            className="list-add-btn"
            onClick={submitChecklistDraft}
            disabled={!checklistDraft.trim()}
            aria-label="Add item"
            style={{ '--c': color }}
          >+</button>
        </div>
      </div>

      {/* Upcoming events */}
      <div style={{ marginBottom: 22 }}>
        <div style={sectionLabelStyle}>
          <span>Upcoming events {upcoming.length > 0 && <span style={{ color }}>· {upcoming.length}</span>}</span>
          <button type="button" style={addBtnStyle} onClick={() => onAddEvent && onAddEvent(space)}>+ Add</button>
        </div>
        {upcoming.length === 0 ? (
          <div style={emptyStyle}>No upcoming events.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map(e => {
              const evColor = getColor(e.color || 'coral');
              const [y, mo, da] = e.date.split('-').map(Number);
              const dateLabel = new Date(y, mo - 1, da).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <div key={e.id} style={{ ...itemStyle, borderLeft: `4px solid ${evColor}` }} onClick={() => onShowEvent && onShowEvent(e)}>
                  <div style={{ fontWeight: 600 }}>{e.title}</div>
                  <div style={{ fontSize: 10, marginTop: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {dateLabel}{e.start_time ? ` · ${fmtTime(e.start_time)}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tasks */}
      <div style={{ marginBottom: 22 }}>
        <div style={sectionLabelStyle}>
          <span>To do {openTasks.length > 0 && <span style={{ color }}>· {openTasks.length} open</span>}</span>
          <button type="button" style={addBtnStyle} onClick={() => onAddTask && onAddTask(space)}>+ Add</button>
        </div>
        {openTasks.length === 0 && doneTasks.length === 0 ? (
          <div style={emptyStyle}>No tasks yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {openTasks.map(t => {
              const assn = getProfile(t.assigned_to);
              const aColor = getColor(assn?.color);
              const overdue = dueDateOverdue(t.due_date);
              return (
                <div key={t.id} style={{ ...itemStyle, borderLeft: `4px solid ${aColor || color}` }} onClick={() => onShowTask && onShowTask(t)}>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: 10, marginTop: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em', textTransform: 'uppercase', color: overdue ? '#E27457' : 'var(--text-muted)' }}>
                    {t.due_date ? formatDue(t.due_date) : 'No due'}{assn ? ` · ${assn.display_name}` : ''}
                  </div>
                </div>
              );
            })}
            {doneTasks.length > 0 && (
              <>
                <div style={{ ...sectionLabelStyle, fontSize: 9, marginTop: 8, marginBottom: 6, opacity: 0.7 }}>
                  Completed · {doneTasks.length}
                </div>
                {doneTasks.slice(0, 5).map(t => (
                  <div key={t.id} style={{ ...itemStyle, opacity: 0.55 }} onClick={() => onShowTask && onShowTask(t)}>
                    <div style={{ fontWeight: 500, textDecoration: 'line-through' }}>{t.title}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Tagged Lists — hidden while the Lists feature is dormant. The
          checklist section above now covers this need natively. Restore
          the block (and the Lists tab) together if you re-enable Lists. */}
      {false && (
      <div style={{ marginBottom: 22 }}>
        <div style={sectionLabelStyle}>
          <span>Lists {spaceLists.length > 0 && <span style={{ color }}>· {spaceLists.length}</span>}</span>
          <button type="button" style={addBtnStyle} onClick={() => onAddList && onAddList(space)}>+ Add</button>
        </div>
        {spaceLists.length === 0 ? (
          <div style={emptyStyle}>No lists yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {spaceLists.map(l => {
              const items = (listItems || []).filter(i => i.list_id === l.id);
              const openCount = items.filter(i => !i.completed).length;
              const lc = getColor(l.color || 'coral');
              return (
                <div key={l.id} style={{ ...itemStyle, borderLeft: `4px solid ${lc}` }} onClick={() => onOpenList && onOpenList(l)}>
                  <div style={{ fontWeight: 600 }}>{l.title}</div>
                  <div style={{ fontSize: 10, marginTop: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {openCount} {openCount === 1 ? 'item' : 'items'}{items.length - openCount > 0 ? ` · ${items.length - openCount} done` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom: past.length > 0 ? 22 : 0 }}>
        <div style={sectionLabelStyle}>
          <span>Notes {spaceNotes.length > 0 && <span style={{ color }}>· {spaceNotes.length}</span>}</span>
          <button type="button" style={addBtnStyle} onClick={() => onAddNote && onAddNote(space)}>+ Add</button>
        </div>
        {spaceNotes.length === 0 ? (
          <div style={emptyStyle}>No notes yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {spaceNotes.slice(0, 8).map(n => {
              const author = getProfile(n.created_by);
              const aColor = getColor(author?.color);
              return (
                <div key={n.id} style={{ ...itemStyle, borderLeft: `4px solid ${aColor || color}` }} onClick={() => onShowNote && onShowNote(n)}>
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap', textOverflow: 'ellipsis' }}>
                    {n.content || (n.type === 'photo' ? '📷 Photo' : n.type === 'poll' ? '📊 Poll' : '')}
                  </div>
                  <div style={{ fontSize: 10, marginTop: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {author?.display_name || 'Someone'} · {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past events (collapsed below the fold) */}
      {past.length > 0 && (
        <div>
          <div style={{ ...sectionLabelStyle, opacity: 0.7 }}>Past · {past.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {past.slice(0, 5).map(e => {
              const evColor = getColor(e.color || 'coral');
              const [y, mo, da] = e.date.split('-').map(Number);
              const dateLabel = new Date(y, mo - 1, da).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <div key={e.id} style={{ ...itemStyle, borderLeft: `4px solid ${evColor}`, opacity: 0.6 }} onClick={() => onShowEvent && onShowEvent(e)}>
                  <div style={{ fontWeight: 500 }}>{e.title}</div>
                  <div style={{ fontSize: 10, marginTop: 4, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {dateLabel}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Modal>
  );
}

const SpacesSection = React.memo(function SpacesSection({
  spaces, tasks, events, notes, lists, listItems, spaceItems,
  members, getProfile, myId,
  collapsed, onToggleCollapse,
  onDeleteSpace, onOpenAddModal, onOpenDetail,
}) {
  const visible = (spaces || [])
    .filter(s => {
      if (s.archived_at) return false;
      if (s.created_by === myId) return true;
      if (!Array.isArray(s.member_ids) || s.member_ids.length === 0) return true;
      return s.member_ids.includes(myId);
    })
    .sort((a, b) => {
      const ap = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
      const bp = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
      if (ap !== bp) return bp - ap;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  const today = localTodayISO();
  const countsFor = (spaceId) => ({
    openTasks: (tasks || []).filter(t => t.space_id === spaceId && !t.completed && !t.cancelled_at).length,
    upcomingEvents: (events || []).filter(e => e.space_id === spaceId && e.date >= today).length,
    // openListItems now counts the built-in space_items checklist (the
    // absorbed Lists feature). Tagged shared_lists are no longer counted
    // here since the Lists feature is dormant — re-add a second source if
    // it ever gets re-enabled.
    openListItems: (spaceItems || []).filter(i => i.space_id === spaceId && !i.completed).length,
    notes: (notes || []).filter(n => n.space_id === spaceId).length,
  });

  return (
    <section className={'fb-sec' + (collapsed ? ' collapsed' : '')} id="sec-spaces">
      <div className="fb-sec-hd">
        <div className="fb-sec-hd-left">
          <h2 className="fb-sec-title"><em>Spaces</em></h2>
          <SectionToggle collapsed={collapsed} onClick={onToggleCollapse} />
        </div>
        <div className="fb-sec-hd-right">
          <div className="fb-sec-meta">{visible.length} {visible.length === 1 ? 'space' : 'spaces'}</div>
        </div>
      </div>

      {!collapsed && (<>
      {/* Same primary section-action button pattern as "+ Add task" and
          "+ Post" — single tap opens the full create-space modal. */}
      <button className="fb-btn" onClick={() => onOpenAddModal?.()}>
        <span className="plus">+</span> Create space
      </button>

      {visible.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', padding: '16px 2px', lineHeight: 1.5, marginTop: 32 }}>
          No spaces yet — try <strong>Italy Trip</strong>, <strong>Christmas</strong>, or <strong>Garden</strong>.<br />
          A space groups your tasks, events, lists, and notes around one topic.
        </div>
      ) : (
        <div className="spaces-stack">
          {visible.map(s => (
            <SpaceCard
              key={s.id}
              space={s}
              counts={countsFor(s.id)}
              members={members}
              getProfile={getProfile}
              myId={myId}
              onOpen={onOpenDetail}
              onDeleteSpace={onDeleteSpace}
            />
          ))}
        </div>
      )}
      </>)}
    </section>
  );
});

// ─── Main App ─────────────────────────────────────────────────────────────────
// 'lists' is temporarily hidden — Spaces covers the same use case better.
// Restore by adding it back here AND in the scroll-sync ids array AND in
// the JSX render below (search for "ListsSection is hidden").
const SECTION_ORDER = ['notes', 'tasks', 'spaces', 'calendar'];

export function MainApp({ profile, onSettings }) {
  const [tab, setTab] = React.useState('notes');
  const [modal, setModal] = React.useState(null);
  const [eventInitDate, setEventInitDate] = React.useState(null);
  const [dayDetailsDate, setDayDetailsDate] = React.useState(null);
  const [monthModalData, setMonthModalData] = React.useState(null);
  const [detailEventId, setDetailEventId] = React.useState(null);
  const [detailNoteId, setDetailNoteId] = React.useState(null);
  const [detailTaskId, setDetailTaskId] = React.useState(null);
  const [taskEditTarget, setTaskEditTarget] = React.useState(null);
  // Existing event being edited — opens the Add Event modal in edit mode.
  const [eventEditTarget, setEventEditTarget] = React.useState(null);
  // True when the Add Task modal should open with the Personal toggle
  // pre-checked (e.g. the user clicked "+ Add personal task").
  const [taskAddPrivate, setTaskAddPrivate] = React.useState(false);
  // Same flag for the Add Event modal.
  const [eventAddPrivate, setEventAddPrivate] = React.useState(false);
  // Calendar Group/Personal toggle — lifted from CalendarSection so the
  // DayDetailsModal can filter to the same scope (the grid chips were
  // scoped but the day popup showed personal events even in Group view).
  const [calView, setCalView] = React.useState('group');
  const [detailMemberId, setDetailMemberId] = React.useState(null);
  const [members, setMembers] = React.useState([]);
  const [tasks, setTasks] = React.useState([]);
  // Lifted from TasksSection so addNote can auto-switch the filter
  // when a created-from-post task lands outside the current view
  // (e.g. user picks a far-future due date while the filter is
  // "This week"). Default = 'week'; the only other option is 'all'.
  const [tasksFilter, setTasksFilter] = React.useState('week');
  const [events, setEvents] = React.useState([]);
  // Recurring events get expanded into their visible instances so the
  // calendar grid + day modal + month modal all render one entry per
  // occurrence. Detail-modal lookups still use the raw `events` list
  // (so `events.find(e => e.id === detailEventId)` returns the single
  // master row — the instance's date is shown by the day modal that
  // launched it). A 1-year window keeps the expansion bounded.
  const expandedEvents = React.useMemo(() => {
    const start = new Date(); start.setHours(0,0,0,0); start.setMonth(start.getMonth() - 6);
    const end   = new Date(); end.setHours(0,0,0,0);   end.setMonth(end.getMonth() + 12);
    return expandRecurringEvents(events, start, end);
  }, [events]);
  const [notes, setNotes] = React.useState([]);
  // Shared Lists state — three parallel arrays keyed by group_id. The
  // realtime channel mirrors INSERT/UPDATE/DELETE for all three tables.
  const [lists, setLists] = React.useState([]);
  const [listItems, setListItems] = React.useState([]);
  const [activityByList, setActivityByList] = React.useState({});
  const [listAddOpen, setListAddOpen] = React.useState(false);
  const [listDetailItem, setListDetailItem] = React.useState(null);
  // Spaces state — top-level containers that group items across tasks /
  // events / notes / lists by space_id. Same modal-lifting pattern as Lists.
  const [spaces, setSpaces] = React.useState([]);
  const [spaceAddOpen, setSpaceAddOpen] = React.useState(false);
  const [spaceEditTarget, setSpaceEditTarget] = React.useState(null);
  const [spaceDetailItem, setSpaceDetailItem] = React.useState(null);
  // Space items — flat checklist items per space (the old "Lists" feature
  // folded inside Spaces so one concept covers both checklist + hub).
  const [spaceItems, setSpaceItems] = React.useState([]);
  // When the user taps "+ Add task" (or list/event/note) from inside a
  // Space's detail modal, we open the corresponding Add* modal with the
  // current space pre-selected. This holds that pre-selection.
  const [pendingSpaceId, setPendingSpaceId] = React.useState(null);
  const [notifications, setNotifications] = React.useState([]);
  const [bellOpen, setBellOpen] = React.useState(false);
  const bellMenuRef = React.useRef(null);
  const [loading, setLoading] = React.useState(true);
  const scrollRef = React.useRef(null);

  // Manual refresh — button in the sticky header. Re-runs the same
  // queries the initial load uses (fetchAll below) instead of reloading
  // the page: no white flash, no bundle re-download, scroll position
  // kept. The icon spins until the data lands (min ~500ms so the tap
  // visibly did something even on a fast network).
  const [refreshing, setRefreshing] = React.useState(false);
  const refreshNow = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const started = Date.now();
    try {
      await fetchAll();
    } finally {
      const wait = Math.max(0, 500 - (Date.now() - started));
      window.setTimeout(() => setRefreshing(false), wait);
    }
  };

  // Publish the logged-in user's profile color as a global CSS
  // variable (`--me-color`) on the document root, so any element can
  // reference it without prop-drilling. Used by the small "you" badge
  // — the gradient text was unreadable on colored chip backgrounds
  // (e.g. the "Posting as" pill), so the badge now renders the word
  // "you" in the current user's profile color instead.
  React.useEffect(() => {
    const c = getColor(profile?.color);
    if (c) document.documentElement.style.setProperty('--me-color', c);
  }, [profile?.color]);

  // Scroll-to-section. Stable (useCallback) so the per-section
  // callbacks below — and through them the React.memo'd sections —
  // keep the same identity across unrelated re-renders.
  const suppressScrollSync = React.useRef(0);
  const scrollToSec = React.useCallback((id, smooth = true) => {
    const wrap = scrollRef.current;
    if (!wrap) return;
    const el = wrap.querySelector('#sec-' + id);
    if (!el) return;
    const headH = wrap.querySelector('.fb-stickyhead')?.getBoundingClientRect().height || 0;
    const top = wrap.scrollTop + (el.getBoundingClientRect().top - wrap.getBoundingClientRect().top) - headH + 1;
    // Suppress scroll-driven setTab while the smooth scroll is animating
    suppressScrollSync.current = Date.now() + 700;
    wrap.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Per-section collapse state. Clicking the chevron in a section header
  // collapses that section's body and (if there's a next section) smooth-
  // scrolls to it — a quick way to walk Home Feed → Tasks → Calendar.
  const [collapsed, setCollapsed] = React.useState({
    notes: false, tasks: false, calendar: false, lists: false, spaces: false,
  });
  const toggleCollapse = React.useCallback((id) => {
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
  }, [collapsed, scrollToSec]);
  const toggleCollapseNotes    = React.useCallback(() => toggleCollapse('notes'),    [toggleCollapse]);
  const toggleCollapseTasks    = React.useCallback(() => toggleCollapse('tasks'),    [toggleCollapse]);
  const toggleCollapseSpaces   = React.useCallback(() => toggleCollapse('spaces'),   [toggleCollapse]);
  const toggleCollapseCalendar = React.useCallback(() => toggleCollapse('calendar'), [toggleCollapse]);

  // Stable modal-opener / detail-opener callbacks — same reasoning:
  // inline lambdas in the section JSX defeated React.memo.
  const openAddNote          = React.useCallback(() => setModal('note'), []);
  const openAddTask          = React.useCallback(() => { setTaskAddPrivate(false); setModal('task'); }, []);
  const openAddPersonalTask  = React.useCallback(() => { setTaskAddPrivate(true); setModal('task'); }, []);
  const openAddEvent         = React.useCallback(() => { setEventEditTarget(null); setEventInitDate(null); setEventAddPrivate(false); setModal('event'); }, []);
  const openAddPersonalEvent = React.useCallback(() => { setEventEditTarget(null); setEventInitDate(null); setEventAddPrivate(true); setModal('event'); }, []);
  const openAddSpaceModal    = React.useCallback(() => { setSpaceEditTarget(null); setSpaceAddOpen(true); }, []);
  const showTaskDetail       = React.useCallback((t) => setDetailTaskId(t.id), []);
  const showEventDetail      = React.useCallback((ev) => setDetailEventId(ev.id), []);
  const showNoteDetail       = React.useCallback((n) => setDetailNoteId(n.id), []);
  const showMemberDetail     = React.useCallback((p) => setDetailMemberId(p.id), []);

  // One data-load pass, shared by the initial mount and the header
  // refresh button. Resolves when the core tables (members / tasks /
  // events / notes) have landed; the secondary tables ride along as
  // fire-and-forget so a missing migration never blocks the app.
  const fetchAll = React.useCallback(async () => {
    if (!profile?.group_id) return;

    // Shared Lists — silently fall back to [] if the tables don't exist.
    Promise.all([
      supabase.from('shared_lists').select('*').eq('group_id', profile.group_id).order('created_at', { ascending: false }),
      supabase.from('shared_list_items').select('*').eq('group_id', profile.group_id).order('position', { ascending: true }),
    ]).then(([l, i]) => {
      if (!l.error) setLists(l.data || []);
      if (!i.error) setListItems(i.data || []);
    });

    // Spaces + space items — same defensive pattern.
    supabase.from('spaces').select('*').eq('group_id', profile.group_id).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (!error) setSpaces(data || []); });
    supabase.from('space_items').select('*').eq('group_id', profile.group_id).order('position', { ascending: true })
      .then(({ data, error }) => { if (!error) setSpaceItems(data || []); });

    // Notifications (silently no-op if table missing)
    supabase.from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { if (data) setNotifications(data); });

    const [m, t, e, n] = await Promise.all([
      supabase.from('profiles').select('*').eq('group_id', profile.group_id),
      supabase.from('tasks').select('*').eq('group_id', profile.group_id).order('created_at', { ascending: false }),
      supabase.from('events').select('*').eq('group_id', profile.group_id).order('date', { ascending: true }),
      // Notes carry base64 photos in their payloads, so an unbounded
      // select was the slowest query in the app by far. 100 newest is
      // far more than the feed's load-more pills ever reveal.
      supabase.from('notes').select('*').eq('group_id', profile.group_id).order('created_at', { ascending: false }).limit(100),
    ]);
    const allTasks = t.data || [];
    // Auto-delete completed tasks older than 72 hours. With the
    // tightened tasks_delete RLS policy (creator / assignee /
    // unassigned), the server quietly skips rows this user can't
    // delete; those vanish when their owner's cleanup pass runs.
    const cutoff = Date.now() - COMPLETED_TTL_MS;
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
      supabase.from('tasks').delete().in('id', stale.map(s => s.id));
    }
  }, [profile?.group_id, profile?.id]);

  React.useEffect(() => {
    if (!profile?.group_id) return;
    fetchAll();

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

    // Realtime for Shared Lists — group-scoped, covers lists, items,
    // and activity in a single channel. Each event merges into local
    // state so multiple family members see edits live.
    const listsChannel = supabase
      .channel('kinnekt-lists-' + profile.group_id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_lists', filter: `group_id=eq.${profile.group_id}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'DELETE') {
            setLists(prev => prev.filter(l => l.id !== old.id));
            setListItems(prev => prev.filter(i => i.list_id !== old.id));
          } else if (eventType === 'INSERT') {
            setLists(prev => prev.some(l => l.id === row.id) ? prev : [row, ...prev]);
          } else {
            setLists(prev => prev.map(l => l.id === row.id ? row : l));
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_list_items', filter: `group_id=eq.${profile.group_id}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'DELETE') {
            setListItems(prev => prev.filter(i => i.id !== old.id));
          } else if (eventType === 'INSERT') {
            setListItems(prev => prev.some(i => i.id === row.id) ? prev : [...prev, row]);
          } else {
            setListItems(prev => prev.map(i => i.id === row.id ? row : i));
          }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shared_list_activity', filter: `group_id=eq.${profile.group_id}` },
        ({ new: row }) => {
          setActivityByList(prev => {
            const existing = prev[row.list_id] || [];
            if (existing.some(a => a.id === row.id)) return prev;
            return { ...prev, [row.list_id]: [row, ...existing].slice(0, 30) };
          });
        })
      .subscribe();

    // Realtime for Spaces — group-scoped. Items in other tables that
    // gain/lose a space_id come through their own table channels.
    // space_items rides on this same channel so checklist edits from
    // other family members stream in live.
    const spacesChannel = supabase
      .channel('kinnekt-spaces-' + profile.group_id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spaces', filter: `group_id=eq.${profile.group_id}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'DELETE') {
            setSpaces(prev => prev.filter(s => s.id !== old.id));
            // Cascade-delete on the FK handles space_items in the DB;
            // mirror locally so the UI doesn't show orphaned items.
            setSpaceItems(prev => prev.filter(i => i.space_id !== old.id));
          } else if (eventType === 'INSERT') {
            setSpaces(prev => prev.some(s => s.id === row.id) ? prev : [row, ...prev]);
          } else {
            setSpaces(prev => prev.map(s => s.id === row.id ? row : s));
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'space_items', filter: `group_id=eq.${profile.group_id}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'DELETE') {
            setSpaceItems(prev => prev.filter(i => i.id !== old.id));
          } else if (eventType === 'INSERT') {
            setSpaceItems(prev => prev.some(i => i.id === row.id) ? prev : [...prev, row]);
          } else {
            setSpaceItems(prev => prev.map(i => i.id === row.id ? row : i));
          }
        })
      .subscribe();

    // Realtime for the core data tables — tasks, events, notes. Without
    // this, a family member's add/update/delete wouldn't surface until
    // the current user reloaded the app.
    const coreChannel = supabase
      .channel('kinnekt-core-' + profile.group_id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `group_id=eq.${profile.group_id}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'DELETE') {
            setTasks(prev => prev.filter(t => t.id !== old.id));
          } else if (eventType === 'INSERT') {
            setTasks(prev => prev.some(t => t.id === row.id) ? prev : [row, ...prev]);
          } else {
            setTasks(prev => prev.map(t => t.id === row.id ? row : t));
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `group_id=eq.${profile.group_id}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'DELETE') {
            setEvents(prev => prev.filter(e => e.id !== old.id));
          } else if (eventType === 'INSERT') {
            setEvents(prev => prev.some(e => e.id === row.id) ? prev : [...prev, row]);
          } else {
            setEvents(prev => prev.map(e => e.id === row.id ? row : e));
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `group_id=eq.${profile.group_id}` },
        ({ eventType, new: row, old }) => {
          if (eventType === 'DELETE') {
            setNotes(prev => prev.filter(n => n.id !== old.id));
          } else if (eventType === 'INSERT') {
            setNotes(prev => prev.some(n => n.id === row.id) ? prev : [row, ...prev]);
          } else {
            setNotes(prev => prev.map(n => n.id === row.id ? row : n));
          }
        })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(listsChannel);
      supabase.removeChannel(spacesChannel);
      supabase.removeChannel(coreChannel);
    };
  }, [profile?.group_id, profile?.id, fetchAll]);

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

  // Handlers passed into the React.memo'd sections are wrapped in
  // useCallback so an unrelated MainApp state change (bell open, tab
  // sync, a modal toggling) doesn't re-render every section.
  const getProfile = React.useCallback((id) => members.find(m => m.id === id), [members]);

  // Task CRUD
  const toggleTask = React.useCallback(async (id, completed) => {
    if (!completed) playPop(); // play only when checking ON
    const next = !completed;
    const completedAt = next ? new Date().toISOString() : null;
    // Capture the pre-toggle row (for recurrence) while applying the
    // optimistic update. The updater stays pure — it only reads.
    let snapshot = null;
    setTasks(prev => {
      snapshot = prev.find(t => t.id === id) || null;
      return prev.map(t => t.id === id ? { ...t, completed: next, completed_at: completedAt } : t);
    });
    let { error } = await supabase.from('tasks').update({ completed: next, completed_at: completedAt }).eq('id', id);
    // Fall back without completed_at if the column hasn't been migrated yet
    if (error && /completed_at/i.test(error.message || '')) {
      await supabase.from('tasks').update({ completed: next }).eq('id', id);
    }

    // Roll a recurring task forward to its next scheduled day on
    // completion. Prefer the security-definer RPC so the ASSIGNEE can
    // roll a task that someone ELSE created forward — a plain client
    // insert would set created_by to the original creator and the
    // tasks_insert RLS policy (created_by = auth.uid()) would silently
    // reject it. That's why recurring chores never came back.
    if (next && snapshot) {
      const nextDue = computeNextDue(snapshot);
      if (nextDue) {
        const addRow = (row) => {
          const r = Array.isArray(row) ? row[0] : row;
          if (r && r.id) setTasks(p => p.some(t => t.id === r.id) ? p : [r, ...p]);
        };
        const { data: rpcRow, error: rpcErr } =
          await supabase.rpc('respawn_recurring_task', { p_task_id: id, p_next_due: nextDue });

        if (!rpcErr) {
          // null row = nothing to spawn (dedup hit / not permitted) — fine.
          addRow(rpcRow);
        } else {
          // RPC not installed yet → direct insert. Works when you finish
          // your OWN task; cross-assigned ones still need the RPC, so we
          // warn loudly the first time rather than failing silently.
          const s = snapshot;
          let payload = {
            title: s.title, description: s.description, assigned_to: s.assigned_to,
            recurrence: s.recurrence, group_id: s.group_id, created_by: s.created_by,
            space_id: s.space_id, is_private: s.is_private, due_time: s.due_time,
            due_date: nextDue, completed: false,
          };
          if (s.event_id) payload.event_id = s.event_id;
          const optional = ['description', 'recurrence', 'event_id', 'space_id', 'is_private', 'due_time'];
          let row = null, insErr = null;
          for (let i = 0; i < 7; i++) {
            ({ data: row, error: insErr } = await supabase.from('tasks').insert(payload).select().single());
            if (!insErr) break;
            const msg = (insErr.message || '').toLowerCase();
            let stripped = false;
            for (const col of optional) {
              if (payload[col] !== undefined && msg.includes(col)) {
                const { [col]: _, ...rest } = payload; payload = rest; stripped = true; break;
              }
            }
            if (!stripped) break;
          }
          if (row) {
            addRow(row);
          } else if (!window.__kinnektRespawnWarned) {
            window.__kinnektRespawnWarned = true;
            alert(
              'This recurring task could not roll forward to its next day.\n\n' +
              'Your database is missing the respawn function. Run schema.sql\n' +
              '(or just the respawn_recurring_task function) in the Supabase\n' +
              'SQL Editor, then try again.'
            );
          }
        }
      }
    }
  }, []);
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
    // `event_id` is the link to an event (event detail modal -> "Linked
    // tasks" -> create new task). Null when the task isn't tied to an
    // event, present otherwise. Strip-on-error mirrors recurrence.
    const optional = ['description', 'recurrence', 'event_id', 'space_id', 'is_private', 'due_time'];
    const droppedCols = [];
    let row = null;
    let error = null;
    for (let i = 0; i < 7; i++) {
      ({ data: row, error } = await supabase.from('tasks').insert(payload).select().single());
      if (!error) break;
      let stripped = null;
      const msg = (error.message || '').toLowerCase();
      for (const col of optional) {
        if (payload[col] !== undefined && msg.includes(col)) {
          const { [col]: _, ...rest } = payload;
          payload = rest;
          stripped = col;
          droppedCols.push(col);
          break;
        }
      }
      if (!stripped) break;
    }
    if (error || !row) {
      if (error) alert('Could not save task: ' + error.message);
      return;
    }
    // Warn if the new event_id column was stripped — the task saved but
    // won't appear linked under the event. One-time gate so we don't
    // nag repeatedly.
    if (droppedCols.includes('event_id') && data.event_id) {
      if (!window.__kinnektEventIdWarned) {
        window.__kinnektEventIdWarned = true;
        alert(
          'Task saved, but it could NOT be linked to the event.\n\n' +
          'The "event_id" column is missing from your tasks table.\n' +
          'Run this in your Supabase SQL Editor:\n\n' +
          'alter table public.tasks add column if not exists event_id uuid references public.events(id) on delete cascade;'
        );
      }
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
  const updateTask = async (id, patch) => {
    const existing = tasks.find(t => t.id === id);
    if (!existing) return { error: { message: 'Task not found' } };
    const next = { ...existing, ...patch };
    setTasks(prev => prev.map(t => t.id === id ? next : t));
    // Optional columns: strip on error so the update still goes
    // through on older schemas (same pattern as addTask).
    let payload = { ...patch };
    const optional = ['description', 'recurrence', 'event_id', 'space_id', 'is_private', 'due_time'];
    for (let i = 0; i < 7; i++) {
      const { error } = await supabase.from('tasks').update(payload).eq('id', id);
      if (!error) return { error: null };
      const msg = (error.message || '').toLowerCase();
      let stripped = null;
      for (const col of optional) {
        if (payload[col] !== undefined && msg.includes(col)) {
          const { [col]: _, ...rest } = payload;
          payload = rest;
          stripped = col;
          break;
        }
      }
      if (!stripped) {
        setTasks(prev => prev.map(t => t.id === id ? existing : t));
        return { error };
      }
    }
    return { error: null };
  };
  const deleteTask = React.useCallback(async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  }, []);

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
    const { attendees = [], recurrence = null, linkedTasks = [], ...rest } = data;
    // The creator is auto-RSVP'd as Going so the modal shows a sensible
    // default state right after save (and so the upcoming list / event
    // chip can reflect "1 going" instead of blank).
    const initialRsvps = { [profile.id]: 'yes' };
    let payload = {
      group_id: profile.group_id,
      created_by: profile.id,
      color: profile.color || 'coral',
      ...rest,
      attendees,
      recurrence,
      rsvps: initialRsvps,
    };

    // Optional columns that may not exist in older schemas — strip them on error.
    const optionalCols = ['description', 'location', 'attendees', 'recurrence', 'rsvps', 'space_id', 'is_private', 'end_date'];
    const droppedCols = [];

    let row = null;
    let error = null;
    for (let attempt = 0; attempt < 8; attempt++) {
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
    // Same warning for the new recurrence / rsvps columns. Only flag
    // when the user *actually* tried to use the feature — a one-off
    // event with no RSVPs shouldn't nag about a missing rsvps column.
    if (droppedCols.includes('recurrence') && recurrence) {
      alert(
        'Event saved, but the repeat rule could NOT be stored.\n\n' +
        'The "recurrence" column is missing from your events table.\n' +
        'Run this in your Supabase SQL Editor:\n\n' +
        'alter table public.events add column if not exists recurrence jsonb;'
      );
    }
    if (droppedCols.includes('rsvps')) {
      // Always show this one — the modal will render RSVP buttons
      // and the user will hit a wall the first time they try to RSVP.
      // Showing it at save-time gives them the fix up front.
      if (!window.__kinnektRsvpWarned) {
        window.__kinnektRsvpWarned = true;
        alert(
          'RSVP feature needs a database update.\n\n' +
          'Run this in your Supabase SQL Editor:\n\n' +
          'alter table public.events add column if not exists rsvps jsonb default \'{}\';'
        );
      }
    }
    // Multi-day events: if the end_date column is missing, the event
    // collapses to a single day. Only nag when the user actually set a
    // range, so plain single-day events stay silent.
    if (droppedCols.includes('end_date') && rest.end_date) {
      alert(
        'Event saved, but the date range could NOT be stored — it will\n' +
        'show as a single day only.\n\n' +
        'The "end_date" column is missing from your events table.\n' +
        'Run this in your Supabase SQL Editor:\n\n' +
        'alter table public.events add column if not exists end_date date;'
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
    // Create any tasks staged in the Add Event modal, linked to the new
    // event (event_id = row.id). Each staged entry is a full task
    // payload from AddTaskModal — we just stamp event_id on it and
    // route through addLinkedTask → addTask so notifications +
    // column-strip retries apply.
    if (Array.isArray(linkedTasks) && linkedTasks.length > 0) {
      for (const t of linkedTasks) {
        if (!t || !t.title) continue;
        // eslint-disable-next-line no-await-in-loop
        await addLinkedTask(row.id, t);
      }
    }
  };
  // Edit an existing event. Optimistic, with the same strip-on-error
  // retry addEvent uses so an older schema (missing a column) still
  // saves the columns it does have. Rolls back local state on hard fail.
  const updateEvent = async (id, patch) => {
    const existing = events.find(e => e.id === id);
    if (!existing) return { error: { message: 'Event not found' } };
    const sortByDate = (list) => list.sort((a, b) => a.date.localeCompare(b.date));
    const rollback = () => setEvents(prev => sortByDate(prev.map(e => e.id === id ? existing : e)));
    setEvents(prev => sortByDate(prev.map(e => e.id === id ? { ...e, ...patch } : e)));
    let payload = { ...patch };
    const optional = ['description', 'location', 'attendees', 'recurrence', 'space_id', 'is_private', 'end_date'];
    for (let i = 0; i < 8; i++) {
      // .select() so a real save (returns the row) is distinguishable
      // from an RLS no-op (0 rows, NO error) — the latter looked like
      // success but silently reverted on the next refresh.
      const { data, error } = await supabase.from('events').update(payload).eq('id', id).select();
      if (!error) {
        if (!data || data.length === 0) {
          rollback();
          alert(
            'Could not save the changes — the database blocked the update\n' +
            '(0 rows changed). Your events table is missing its UPDATE\n' +
            'policy. Run this once in the Supabase SQL Editor:\n\n' +
            'drop policy if exists "events_update" on public.events;\n' +
            'create policy "events_update" on public.events\n' +
            '  for update using (group_id = public.my_group_id());'
          );
          return { error: { message: 'no rows updated (RLS)' } };
        }
        // Reconcile local state with the row the DB actually saved.
        setEvents(prev => sortByDate(prev.map(e => e.id === id ? data[0] : e)));
        return { error: null };
      }
      const msg = (error.message || '').toLowerCase();
      let stripped = null;
      for (const col of optional) {
        if (payload[col] !== undefined && msg.includes(col)) {
          const { [col]: _, ...rest } = payload;
          payload = rest;
          stripped = col;
          break;
        }
      }
      if (!stripped) {
        rollback();
        alert('Could not save changes: ' + error.message);
        return { error };
      }
    }
    return { error: null };
  };
  const deleteEvent = React.useCallback(async (id) => {
    // A recurring event shares one row across every occurrence, so any
    // delete removes the whole series. The swipe gesture made that a
    // single accidental flick — confirm before nuking a series.
    const ev = events.find(e => e.id === id);
    if (ev?.recurrence?.freq && ev.recurrence.freq !== 'none') {
      const ok = window.confirm(`"${ev.title}" repeats. Deleting it removes every occurrence — delete the whole series?`);
      if (!ok) return;
    }
    setEvents(prev => prev.filter(e => e.id !== id));
    await supabase.from('events').delete().eq('id', id);
  }, [events]);

  // ─── Shared Lists CRUD ───────────────────────────────────────────────────
  // Activity logging — best-effort fire-and-forget. Failures are silent
  // so a missing table never breaks the user-facing action.
  const logListActivity = async (listId, action, payload) => {
    if (!listId || !profile?.group_id) return;
    try {
      await supabase.from('shared_list_activity').insert({
        list_id: listId,
        group_id: profile.group_id,
        actor_id: profile.id,
        action,
        payload: payload || null,
      });
    } catch { /* ignore */ }
  };
  // Load the most recent 30 activity rows for one list on demand. Cached
  // in activityByList so re-opening doesn't re-fetch unnecessarily.
  const loadListActivity = React.useCallback(async (listId) => {
    if (!listId) return;
    const { data, error } = await supabase
      .from('shared_list_activity')
      .select('*')
      .eq('list_id', listId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (!error) setActivityByList(prev => ({ ...prev, [listId]: data || [] }));
  }, []);

  // Accepts { title, memberIds } or a plain string for backwards compat.
  // member_ids is stored on the row so each list can be scoped to a subset
  // of the group. Uses the column-strip retry pattern — if member_ids column
  // doesn't exist yet, the insert retries without it (visible to all).
  const addList = async (arg) => {
    const { title: rawTitle, memberIds, spaceId } =
      typeof arg === 'string' ? { title: arg, memberIds: null, spaceId: null } : (arg || {});
    const t = (rawTitle || '').trim();
    if (!t) return { data: null, error: { message: 'Title is empty' } };
    if (!profile?.group_id) {
      return { data: null, error: { message: 'No group_id — try refreshing.' } };
    }
    const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const row = {
      id: tempId,
      group_id: profile.group_id,
      created_by: profile.id,
      title: t,
      color: profile.color || 'coral',
      list_type: 'general',
      member_ids: memberIds || (members || []).map(m => m.id),
      space_id: spaceId || null,
      archived_at: null,
      created_at: new Date().toISOString(),
    };
    setLists(prev => prev.some(l => l.id === tempId) ? prev : [row, ...prev]);
    let error = null;
    // Strip member_ids / space_id on error (columns may not exist yet) — retry up to twice.
    let payload = { ...row };
    try {
      let result = await supabase.from('shared_lists').insert(payload);
      if (result.error && /space_id/i.test(result.error.message || '')) {
        const { space_id: _s, ...stripped } = payload;
        payload = stripped;
        result = await supabase.from('shared_lists').insert(payload);
      }
      if (result.error && /member_ids/i.test(result.error.message || '')) {
        const { member_ids: _m, ...stripped } = payload;
        result = await supabase.from('shared_lists').insert(stripped);
      }
      error = result.error;
    } catch (thrown) {
      console.error('[shared_lists] insert threw:', thrown);
      error = { message: String(thrown?.message || thrown) };
    }
    if (error) {
      console.error('[shared_lists] insert error:', error);
      setLists(prev => prev.filter(l => l.id !== tempId));
      return { data: null, error };
    }
    logListActivity(tempId, 'list_created', { title: t });
    return { data: row, error: null };
  };
  const deleteList = async (id) => {
    const existing = lists.find(l => l.id === id);
    setLists(prev => prev.filter(l => l.id !== id));
    setListItems(prev => prev.filter(i => i.list_id !== id));
    const { error } = await supabase.from('shared_lists').delete().eq('id', id);
    if (error) {
      // Revert + surface
      if (existing) setLists(prev => prev.some(l => l.id === id) ? prev : [existing, ...prev]);
      alert('Could not delete list: ' + error.message);
      return;
    }
    logListActivity(id, 'list_deleted', { title: existing?.title });
  };

  // ─── Spaces CRUD ─────────────────────────────────────────────────────────
  // Optimistic insert with crypto.randomUUID — same pattern as addList. Items
  // tagged with this space (via tasks.space_id, events.space_id, etc.) are
  // linked by id only; the FK uses ON DELETE SET NULL so deleting a Space
  // never destroys its content.
  const addSpace = async (arg) => {
    const { id: editId, title: rawTitle, emoji, color, description, memberIds } = arg || {};
    if (editId) return updateSpace(editId, { title: rawTitle, emoji, color, description, memberIds });
    const t = (rawTitle || '').trim();
    if (!t) return { data: null, error: { message: 'Title is empty' } };
    if (!profile?.group_id) {
      return { data: null, error: { message: 'No group_id — try refreshing.' } };
    }
    const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const row = {
      id: tempId,
      group_id: profile.group_id,
      created_by: profile.id,
      title: t,
      emoji: emoji || '✨',
      color: color || 'coral',
      description: (description || '').trim() || null,
      member_ids: memberIds || (members || []).map(m => m.id),
      pinned_at: null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setSpaces(prev => prev.some(s => s.id === tempId) ? prev : [row, ...prev]);
    let payload = { ...row };
    let error = null;
    try {
      let result = await supabase.from('spaces').insert(payload);
      // Column-strip retry (optional fields may not exist yet)
      const optional = ['member_ids', 'description', 'emoji', 'pinned_at'];
      for (let i = 0; i < 4 && result.error; i++) {
        const msg = (result.error.message || '').toLowerCase();
        const hit = optional.find(c => payload[c] !== undefined && msg.includes(c));
        if (!hit) break;
        const { [hit]: _, ...stripped } = payload;
        payload = stripped;
        result = await supabase.from('spaces').insert(payload);
      }
      error = result.error;
    } catch (thrown) {
      console.error('[spaces] insert threw:', thrown);
      error = { message: String(thrown?.message || thrown) };
    }
    if (error) {
      console.error('[spaces] insert error:', error);
      setSpaces(prev => prev.filter(s => s.id !== tempId));
      return { data: null, error };
    }
    return { data: row, error: null };
  };

  const updateSpace = async (id, patch) => {
    const existing = spaces.find(s => s.id === id);
    if (!existing) return { data: null, error: { message: 'Space not found' } };
    const next = {
      ...existing,
      ...(patch.title !== undefined ? { title: (patch.title || '').trim() } : {}),
      ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.description !== undefined ? { description: (patch.description || '').trim() || null } : {}),
      ...(patch.memberIds !== undefined ? { member_ids: patch.memberIds } : {}),
      updated_at: new Date().toISOString(),
    };
    setSpaces(prev => prev.map(s => s.id === id ? next : s));
    const dbPatch = {};
    if (patch.title !== undefined)       dbPatch.title       = next.title;
    if (patch.emoji !== undefined)       dbPatch.emoji       = next.emoji;
    if (patch.color !== undefined)       dbPatch.color       = next.color;
    if (patch.description !== undefined) dbPatch.description = next.description;
    if (patch.memberIds !== undefined)   dbPatch.member_ids  = next.member_ids;
    dbPatch.updated_at = next.updated_at;
    const { error } = await supabase.from('spaces').update(dbPatch).eq('id', id);
    if (error) {
      setSpaces(prev => prev.map(s => s.id === id ? existing : s));
      return { data: null, error };
    }
    return { data: next, error: null };
  };

  const archiveSpace = async (space) => {
    if (!space) return;
    const isArchived = !!space.archived_at;
    const nextArchive = isArchived ? null : new Date().toISOString();
    setSpaces(prev => prev.map(s => s.id === space.id ? { ...s, archived_at: nextArchive } : s));
    const { error } = await supabase.from('spaces').update({ archived_at: nextArchive }).eq('id', space.id);
    if (error) {
      setSpaces(prev => prev.map(s => s.id === space.id ? space : s));
      alert('Could not ' + (isArchived ? 'unarchive' : 'archive') + ' space: ' + error.message);
    }
  };

  const deleteSpace = React.useCallback(async (id) => {
    const existing = spaces.find(s => s.id === id);
    setSpaces(prev => prev.filter(s => s.id !== id));
    // Locally null space_id on tagged items so the UI updates instantly.
    // The DB has ON DELETE SET NULL and realtime UPDATE events will reconcile.
    setTasks(prev => prev.map(t => t.space_id === id ? { ...t, space_id: null } : t));
    setEvents(prev => prev.map(e => e.space_id === id ? { ...e, space_id: null } : e));
    setNotes(prev => prev.map(n => n.space_id === id ? { ...n, space_id: null } : n));
    setLists(prev => prev.map(l => l.space_id === id ? { ...l, space_id: null } : l));
    const { error } = await supabase.from('spaces').delete().eq('id', id);
    if (error) {
      if (existing) setSpaces(prev => prev.some(s => s.id === id) ? prev : [existing, ...prev]);
      alert('Could not delete space: ' + error.message);
    }
  }, [spaces]);

  const addListItem = async (listId, parsed) => {
    if (!listId || !parsed?.title || !profile?.group_id) return;
    const sibling = listItems.filter(i => i.list_id === listId);
    const nextPos = sibling.length === 0 ? 0 : Math.max(...sibling.map(i => i.position || 0)) + 1;
    const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const row = {
      id: tempId,
      list_id: listId,
      group_id: profile.group_id,
      created_by: profile.id,
      title: parsed.title,
      quantity: parsed.quantity || null,
      category: parsed.category || null,
      assigned_to: parsed.assigned_to || null,
      position: nextPos,
      completed: false,
      completed_at: null,
      completed_by: null,
      created_at: new Date().toISOString(),
    };
    setListItems(prev => prev.some(i => i.id === tempId) ? prev : [...prev, row]);
    let error = null;
    try {
      const result = await supabase.from('shared_list_items').insert(row);
      error = result.error;
    } catch (thrown) {
      console.error('[shared_list_items] insert threw:', thrown);
      error = { message: String(thrown?.message || thrown) };
    }
    if (error) {
      console.error('[shared_list_items] insert error:', error);
      setListItems(prev => prev.filter(i => i.id !== tempId));
      alert('Could not add item: ' + (error.message || 'unknown'));
      return;
    }
    logListActivity(listId, 'item_added', { title: row.title, quantity: row.quantity });
  };
  const toggleListItem = async (id, next) => {
    const it = listItems.find(i => i.id === id);
    if (!it) return;
    const optimistic = {
      ...it,
      completed: !!next,
      completed_at: next ? new Date().toISOString() : null,
      completed_by: next ? profile.id : null,
    };
    setListItems(prev => prev.map(i => i.id === id ? optimistic : i));
    const { error } = await supabase.from('shared_list_items')
      .update({
        completed: optimistic.completed,
        completed_at: optimistic.completed_at,
        completed_by: optimistic.completed_by,
      }).eq('id', id);
    if (error) {
      setListItems(prev => prev.map(i => i.id === id ? it : i));
      alert('Could not update item: ' + error.message);
      return;
    }
    logListActivity(it.list_id, next ? 'item_completed' : 'item_uncompleted', { title: it.title });
  };
  const deleteListItem = async (id) => {
    const it = listItems.find(i => i.id === id);
    if (!it) return;
    setListItems(prev => prev.filter(i => i.id !== id));
    const { error } = await supabase.from('shared_list_items').delete().eq('id', id);
    if (error) {
      setListItems(prev => prev.some(i => i.id === id) ? prev : [...prev, it]);
      alert('Could not delete item: ' + error.message);
      return;
    }
    logListActivity(it.list_id, 'item_removed', { title: it.title });
  };
  // Cycle through [unassigned, member1, member2, ...] each tap. Fast,
  // no modal — exactly what the spec asks for.
  const cycleListItemAssignee = async (item) => {
    const ids = [null, ...(members || []).map(m => m.id)];
    const idx = ids.indexOf(item.assigned_to ?? null);
    const next = ids[(idx + 1) % ids.length];
    setListItems(prev => prev.map(i => i.id === item.id ? { ...i, assigned_to: next } : i));
    const { error } = await supabase.from('shared_list_items')
      .update({ assigned_to: next }).eq('id', item.id);
    if (error) {
      setListItems(prev => prev.map(i => i.id === item.id ? item : i));
      alert('Could not reassign: ' + error.message);
      return;
    }
    logListActivity(item.list_id, 'item_assigned', { title: item.title, to: next });
  };

  // ─── Space items (built-in Space checklist) ─────────────────────────────
  // Same optimistic-then-revert pattern as shared_list_items, scoped to a
  // space_id instead of list_id. parsed = { title, quantity, category,
  // assigned_to } — built by parseListItemInput so "milk x2 #dairy @mom"
  // still works inside Spaces.
  const addSpaceItem = async (spaceId, parsed) => {
    if (!spaceId || !parsed?.title || !profile?.group_id) return;
    const sibling = spaceItems.filter(i => i.space_id === spaceId);
    const nextPos = sibling.length === 0 ? 0 : Math.max(...sibling.map(i => i.position || 0)) + 1;
    const tempId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const row = {
      id: tempId,
      space_id: spaceId,
      group_id: profile.group_id,
      created_by: profile.id,
      title: parsed.title,
      quantity: parsed.quantity || null,
      category: parsed.category || null,
      assigned_to: parsed.assigned_to || null,
      position: nextPos,
      completed: false,
      completed_at: null,
      completed_by: null,
      created_at: new Date().toISOString(),
    };
    setSpaceItems(prev => prev.some(i => i.id === tempId) ? prev : [...prev, row]);
    let error = null;
    try {
      const result = await supabase.from('space_items').insert(row);
      error = result.error;
    } catch (thrown) {
      console.error('[space_items] insert threw:', thrown);
      error = { message: String(thrown?.message || thrown) };
    }
    if (error) {
      console.error('[space_items] insert error:', error);
      setSpaceItems(prev => prev.filter(i => i.id !== tempId));
      alert('Could not add item: ' + (error.message || 'unknown'));
    }
  };
  const toggleSpaceItem = async (id, next) => {
    const it = spaceItems.find(i => i.id === id);
    if (!it) return;
    const optimistic = {
      ...it,
      completed: !!next,
      completed_at: next ? new Date().toISOString() : null,
      completed_by: next ? profile.id : null,
    };
    setSpaceItems(prev => prev.map(i => i.id === id ? optimistic : i));
    const { error } = await supabase.from('space_items')
      .update({
        completed: optimistic.completed,
        completed_at: optimistic.completed_at,
        completed_by: optimistic.completed_by,
      }).eq('id', id);
    if (error) {
      setSpaceItems(prev => prev.map(i => i.id === id ? it : i));
      alert('Could not update item: ' + error.message);
    }
  };
  const deleteSpaceItem = async (id) => {
    const it = spaceItems.find(i => i.id === id);
    if (!it) return;
    setSpaceItems(prev => prev.filter(i => i.id !== id));
    const { error } = await supabase.from('space_items').delete().eq('id', id);
    if (error) {
      setSpaceItems(prev => prev.some(i => i.id === id) ? prev : [...prev, it]);
      alert('Could not delete item: ' + error.message);
    }
  };
  const cycleSpaceItemAssignee = async (item) => {
    const ids = [null, ...(members || []).map(m => m.id)];
    const idx = ids.indexOf(item.assigned_to ?? null);
    const next = ids[(idx + 1) % ids.length];
    setSpaceItems(prev => prev.map(i => i.id === item.id ? { ...i, assigned_to: next } : i));
    const { error } = await supabase.from('space_items')
      .update({ assigned_to: next }).eq('id', item.id);
    if (error) {
      setSpaceItems(prev => prev.map(i => i.id === item.id ? item : i));
      alert('Could not reassign: ' + error.message);
    }
  };

  // Set my RSVP status on an event (or clear it by passing null).
  // Updates the `rsvps` JSONB column ({ [userId]: 'yes'|'maybe'|'no' }).
  // Notifies the event creator so they see who's coming. Optimistic
  // UI + revert-on-error to keep the modal responsive.
  const setRsvp = async (eventId, status) => {
    const me = profile?.id;
    if (!me || !eventId) return;
    const original = events.find(e => e.id === eventId);
    if (!original) return;
    const prevRsvps = (original.rsvps && typeof original.rsvps === 'object') ? original.rsvps : {};
    const nextRsvps = { ...prevRsvps };
    if (status === null || status === undefined) {
      delete nextRsvps[me];
    } else {
      nextRsvps[me] = status;
    }
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, rsvps: nextRsvps } : e));
    // Atomic path — set_event_rsvp (schema.sql) merges just my key
    // server-side under a row lock, so two members RSVPing in the same
    // moment can't clobber each other. Falls back to the legacy
    // whole-blob update if the function hasn't been created yet.
    const { data: serverRsvps, error: rpcErr } = await supabase
      .rpc('set_event_rsvp', { p_event_id: eventId, p_status: status ?? null });
    let error = rpcErr;
    if (!rpcErr) {
      error = null;
      if (serverRsvps && typeof serverRsvps === 'object') {
        // Reconcile with the authoritative merge result (it may include
        // another member's concurrent RSVP that we don't have locally).
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, rsvps: serverRsvps } : e));
      }
    } else {
      ({ error } = await supabase
        .from('events')
        .update({ rsvps: nextRsvps })
        .eq('id', eventId));
    }
    if (error) {
      // Revert on failure (most likely cause: rsvps column not added yet)
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, rsvps: prevRsvps } : e));
      if (/rsvps/i.test(error.message || '')) {
        alert('RSVPs need a database update.\n\nRun:\nalter table public.events add column if not exists rsvps jsonb default \'{}\';');
      } else {
        alert('Could not save RSVP: ' + error.message);
      }
      return;
    }
    // Notify the event creator (skip if I am the creator).
    if (status && original.created_by && original.created_by !== me) {
      notify([original.created_by], 'event_rsvp', {
        event_id: eventId,
        event_title: original.title,
        event_date: original.date,
        status,
        by_name: profile.display_name,
        by_color: profile.color,
      });
    }
  };

  // Create a new task linked to an event. Accepts either:
  //   addLinkedTask(eventId, "Title string")               — quick legacy form
  //   addLinkedTask(eventId, { title, description, assigned_to, due_date, recurrence })
  // Routes through addTask so notifications + the column-strip retry
  // behavior apply. `event_id` is stamped on the payload (the strip-
  // on-error loop drops it gracefully if the column hasn't been
  // migrated). The task lands in the assignee's regular task list AND
  // surfaces under the event's "Linked tasks" section.
  const addLinkedTask = async (eventId, arg) => {
    if (!eventId) return;
    const payload = (typeof arg === 'string')
      ? { title: arg.trim(), assigned_to: profile?.id || null, due_date: null }
      : { ...(arg || {}) };
    if (!payload.title || !payload.title.trim()) return;
    payload.title = payload.title.trim();
    payload.event_id = eventId;
    await addTask(payload);
  };

  // Note CRUD
  // Accepts either: addNote(content, taskPayload)                            — legacy signature
  //           or: addNote({content, type, payload, pinned}, taskPayload)     — multi-output
  //           or: addNote({content, type, payload, pinned}, taskPayload, eventPayload)
  // `eventPayload`, when provided, also inserts a row into events with a
  // note_id reference (with a graceful fallback if that column is missing).
  const addNote = React.useCallback(async (arg, taskPayload, eventPayload) => {
    const isObj = arg && typeof arg === 'object' && !Array.isArray(arg);
    const content = isObj ? (arg.content || '') : (arg || '');
    const type    = isObj ? (arg.type || 'message') : 'message';
    const payload = isObj ? (arg.payload || null) : null;
    const pinned  = isObj ? !!arg.pinned : false;
    const space_id = isObj ? (arg.space_id || null) : null;

    // Build the insert payload — strip optional columns on schema errors
    let insertRow = {
      group_id: profile.group_id,
      created_by: profile.id,
      content,
      type,
      payload,
      pinned,
      space_id,
    };
    const optionalCols = ['type', 'payload', 'pinned', 'space_id'];
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

    // Replies → notify the original note's author so they see "X
    // replied to your post" in the bell. Clicking opens the original
    // (which shows the full comment thread including this reply).
    const replyToId = payload?.reply_to;
    if (replyToId) {
      const original = notes.find(n => n.id === replyToId);
      const ownerId = original?.created_by;
      if (ownerId && ownerId !== profile.id) {
        notify([ownerId], 'note_replied', {
          note_id: replyToId,
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

    // ── Linked task creation (Message + Urgent + Reminder posts) ───
    // Only runs when the composer ticked "Create task from post?".
    // Note: this used to be an early-return guard, but we now have a
    // second output (event creation) below, so we need to fall
    // through when there's no task payload.
    if (taskPayload && taskPayload.title) {
      const basePayload = {
        group_id: profile.group_id,
        created_by: profile.id,
        assigned_to: taskPayload.assigned_to,
        due_date: taskPayload.due_date,
        title: taskPayload.title,
        // Carry the post's Space tag onto the linked task — previously
        // this was dropped, so "Create task from post" lost the Space.
        space_id: taskPayload.space_id || null,
      };
      // Try with note_id first; fall back to a plain insert if the
      // note_id column doesn't exist or any other note_id issue.
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
        alert('Post saved but task could not be created: ' + (tErr?.message || 'no row returned'));
      } else {
        setTasks(prev => [taskRow, ...prev]);
        // Make sure the new task is actually visible — "This week"
        // hides anything due more than 7 days out. If the new task
        // is further than that, bump the filter to "All".
        if (taskRow.due_date) {
          const todayMs = new Date().setHours(0, 0, 0, 0);
          const dueMs   = new Date(taskRow.due_date + 'T00:00:00').getTime();
          const diff    = Math.round((dueMs - todayMs) / 86400000);
          if (diff > 7 && tasksFilter !== 'all') {
            setTasksFilter('all');
          }
        }
        // Notify the assignee (if it's someone other than the poster)
        // so the task shows up in their bell — mirrors what the
        // standalone Add Task modal already does.
        if (taskRow.assigned_to && taskRow.assigned_to !== profile.id) {
          notify([taskRow.assigned_to], 'task_assigned', {
            task_id:    taskRow.id,
            task_title: taskRow.title,
            due_date:   taskRow.due_date,
            by_name:    profile.display_name,
            by_color:   profile.color,
          });
        }
      }
    }

    // ── Linked event creation (Urgent + Reminder posts) ────────────
    // Same pattern as the linked-task branch above: build a base
    // events row, try with note_id first, fall back to a plain insert
    // if the events table doesn't have that column. Then notify
    // attendees (everyone but the creator) so they see the new event.
    if (eventPayload && eventPayload.title) {
      const baseEvent = {
        group_id:    profile.group_id,
        created_by:  profile.id,
        color:       profile.color || 'coral',
        title:       eventPayload.title,
        date:        eventPayload.date,
        start_time:  eventPayload.start_time,
        end_time:    eventPayload.end_time,
        location:    eventPayload.location,
        description: eventPayload.description ?? null,
        attendees:   eventPayload.attendees   || [],
        // Same Space-tag carry as the linked task above.
        space_id:    eventPayload.space_id    || null,
      };
      let { data: evRow, error: evErr } = await supabase
        .from('events')
        .insert({ ...baseEvent, note_id: noteRow.id })
        .select()
        .single();
      if (evErr) {
        // Likely cause: events table lacks a note_id column. Retry without it.
        ({ data: evRow, error: evErr } = await supabase
          .from('events')
          .insert(baseEvent)
          .select()
          .single());
      }
      if (evErr || !evRow) {
        alert('Post saved but event could not be created: ' + (evErr?.message || 'no row returned'));
        return;
      }
      setEvents(prev => [...prev, evRow].sort((a, b) => a.date.localeCompare(b.date)));
      const attendeeIds = (evRow.attendees || []).filter(id => id !== profile.id);
      if (attendeeIds.length > 0) {
        notify(attendeeIds, 'event_invited', {
          event_id:    evRow.id,
          event_title: evRow.title,
          event_date:  evRow.date,
          start_time:  evRow.start_time,
          by_name:     profile.display_name,
          by_color:    profile.color,
        });
      }
    }
  // notify is intentionally not a dep — it only reads `profile`, which
  // is, so the captured copy is never meaningfully stale.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, members, notes, tasksFilter]);

  // Stable wrapper for the feed's inline reply composer.
  const postReply = React.useCallback(async (replyToId, content) => {
    await addNote({
      content,
      type: 'message',
      payload: { reply_to: replyToId },
      pinned: false,
    });
  }, [addNote]);

  // Stable wrapper for the feed's quick composer (plain messages).
  const postQuickMessage = React.useCallback(async (content) => {
    await addNote({ content, type: 'message', payload: null, pinned: false });
  }, [addNote]);

  // Vote on a poll — updates the note's payload.votes
  const voteOnPoll = React.useCallback(async (noteId, optionId) => {
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
    // Atomic path — vote_on_poll (schema.sql) re-reads the votes under
    // a row lock and merges server-side, so concurrent votes from two
    // family members serialize instead of overwriting each other.
    const { data: serverPayload, error: rpcErr } = await supabase
      .rpc('vote_on_poll', { p_note_id: noteId, p_option_id: optionId });
    if (!rpcErr) {
      if (serverPayload && typeof serverPayload === 'object') {
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, payload: serverPayload } : n));
      }
      return;
    }
    // Fallback for databases where the function hasn't been created yet.
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
  }, [notes, profile]);

  // Soft-delete a note in the home feed. The note row stays in the
  // table so reply chains still resolve (otherwise a "replying to …"
  // pill would dangle pointing at nothing), but its content is wiped
  // and a `payload.deleted` flag is set. FeedPost renders the note
  // as a small italic "deleted" tombstone in place of the original
  // bubble. Only the author can delete — the call sites already
  // guard this via `canDelete = n.created_by === myId`, but we
  // re-check here as a backstop.
  const deleteNote = React.useCallback(async (id) => {
    const current = notes.find(n => n.id === id);
    if (!current) return;
    if (current.created_by !== profile?.id) return;
    if (current.payload?.deleted) return; // already gone
    const newPayload = {
      ...(current.payload || {}),
      deleted: true,
      deleted_at: new Date().toISOString(),
    };
    // Optimistic UI: clear content + unpin so the tombstone renders
    // immediately and a pinned deleted post doesn't keep its slot.
    setNotes(prev => prev.map(n => n.id === id
      ? { ...n, content: '', pinned: false, payload: newPayload }
      : n
    ));
    const { error } = await supabase
      .from('notes')
      .update({ content: '', pinned: false, payload: newPayload })
      .eq('id', id);
    if (error) {
      // Revert on failure
      setNotes(prev => prev.map(n => n.id === id ? current : n));
      alert('Could not delete post: ' + error.message);
    }
  }, [notes, profile?.id]);
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
  const togglePin = React.useCallback(async (id, pinned) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !pinned } : n));
    await supabase.from('notes').update({ pinned: !pinned }).eq('id', id);
  }, []);

  // Scroll sync (scrollToSec + suppressScrollSync are defined up with
  // the collapse handlers).
  React.useEffect(() => {
    if (loading) return;
    const wrap = scrollRef.current;
    if (!wrap) return;
    let raf;
    const compute = () => {
      if (Date.now() < suppressScrollSync.current) return;
      const ids = ['notes', 'tasks', 'spaces', 'calendar']; // 'lists' hidden
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

  // Exposed via SpacesContext so any item chip can open the Space detail
  // modal without prop drilling. Declared before the loading early-return
  // so hook order stays stable across renders.
  const showSpace = React.useCallback((space) => {
    if (!space) return;
    setSpaceDetailItem(space);
  }, []);

  if (loading) {
    // Shimmering skeleton in the rough shape of the real layout —
    // reads as "almost there" instead of a blank wait.
    return (
      <div className="fb-screen">
        <div className="skel-wrap" role="status" aria-label="Loading">
          <div className="skel skel-header" />
          <div className="skel skel-tabs" />
          <div className="skel skel-card lg" />
          <div className="skel skel-card" />
          <div className="skel skel-card sm" />
          <div className="skel skel-card lg" />
        </div>
      </div>
    );
  }

  return (
    <MyIdContext.Provider value={profile?.id || null}>
    <SpacesContext.Provider value={{ spaces, showSpace, getProfile }}>
    <div className="fb-screen">
      <div
        className="fb-scroll"
        ref={scrollRef}
      >
        <div className="fb-stickyhead">
          <div className="fb-stickyhead-head">
            <div className="fb-stickyhead-right">
              <div className="fb-head-top">
                <div className="fb-bell-wrap" ref={bellMenuRef}>
                  <button
                    className={'fb-bell' + (unreadCount > 0 ? ' has-unread' : '')}
                    onClick={() => setBellOpen(o => !o)}
                    title="Notifications"
                    aria-label="Notifications"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            {/* Refresh button — sits in the top-right corner of the
                sticky header, vertically aligned with the bell +
                profile. Clicking starts a spin animation and reloads
                the page after 700ms so the loading beat is visible. */}
            <button
              type="button"
              className={'fb-refresh' + (refreshing ? ' spinning' : '')}
              onClick={refreshNow}
              aria-label="Refresh"
              title="Refresh"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-3.5-7.1" />
                <polyline points="21 4 21 10 15 10" />
              </svg>
            </button>
          </div>
          <AnchorTabs active={tab} onChange={id => { setTab(id); scrollToSec(id); }} />
        </div>

        <div className="fb-sec-wrap">
          <LiveClock />
          <NotesSection
            notes={notes}
            members={members}
            getProfile={getProfile}
            myId={profile?.id}
            onAdd={openAddNote}
            onDelete={deleteNote}
            onTogglePin={togglePin}
            onOpenNote={showNoteDetail}
            onShowMember={showMemberDetail}
            onVote={voteOnPoll}
            onReply={postReply}
            onQuickPost={postQuickMessage}
            collapsed={collapsed.notes}
            onToggleCollapse={toggleCollapseNotes}
          />
          <TasksSection tasks={tasks} members={members} myId={profile?.id} getProfile={getProfile} onToggle={toggleTask} onAdd={openAddTask} onAddPersonal={openAddPersonalTask} onDelete={deleteTask} onShowTask={showTaskDetail} collapsed={collapsed.tasks} onToggleCollapse={toggleCollapseTasks} filter={tasksFilter} setFilter={setTasksFilter} />
          {/* ListsSection is hidden — Spaces handles the same use case
              with more flexibility. The component, state, modals, and
              CRUD wiring all stay in place; just uncomment to bring it
              back (and re-add 'lists' to AnchorTabs, SECTION_ORDER, and
              the scroll-sync ids array). */}
          {false && (
          <ListsSection
            lists={lists}
            listItems={listItems}
            members={members}
            getProfile={getProfile}
            myId={profile?.id}
            collapsed={collapsed.lists}
            onToggleCollapse={() => toggleCollapse('lists')}
            onAddList={addList}
            onDeleteList={deleteList}
            onAddItem={addListItem}
            onToggleItem={toggleListItem}
            onDeleteItem={deleteListItem}
            onCycleAssignee={cycleListItemAssignee}
            activityByList={activityByList}
            onLoadActivity={loadListActivity}
            onOpenAddModal={() => setListAddOpen(true)}
            onOpenDetail={setListDetailItem}
          />
          )}
          <SpacesSection
            spaces={spaces}
            tasks={tasks}
            events={events}
            notes={notes}
            lists={lists}
            listItems={listItems}
            spaceItems={spaceItems}
            members={members}
            getProfile={getProfile}
            myId={profile?.id}
            collapsed={collapsed.spaces}
            onToggleCollapse={toggleCollapseSpaces}
            onDeleteSpace={deleteSpace}
            onOpenAddModal={openAddSpaceModal}
            onOpenDetail={setSpaceDetailItem}
          />
          <CalendarSection
            events={events}
            expandedEvents={expandedEvents}
            members={members}
            getProfile={getProfile}
            myId={profile?.id}
            onAdd={openAddEvent}
            onAddPersonal={openAddPersonalEvent}
            onDayClick={setDayDetailsDate}
            onDelete={deleteEvent}
            onShowMonth={setMonthModalData}
            onShowEvent={showEventDetail}
            collapsed={collapsed.calendar}
            onToggleCollapse={toggleCollapseCalendar}
            view={calView}
            setView={setCalView}
          />
        </div>
      </div>

      <AddTaskModal
        open={modal === 'task'}
        onClose={() => { setModal(null); setPendingSpaceId(null); setTaskEditTarget(null); setTaskAddPrivate(false); }}
        members={members}
        myId={profile?.id}
        spaces={spaces}
        events={events}
        initialSpaceId={pendingSpaceId}
        initial={taskEditTarget}
        initialPrivate={taskAddPrivate}
        onSave={addTask}
        onUpdate={updateTask}
      />
      <AddEventModal
        open={modal === 'event'}
        onClose={() => { setModal(null); setPendingSpaceId(null); setEventAddPrivate(false); setEventEditTarget(null); }}
        members={members}
        myId={profile?.id}
        spaces={spaces}
        initialSpaceId={pendingSpaceId}
        initialPrivate={eventAddPrivate}
        initial={eventEditTarget}
        onSave={addEvent}
        onUpdate={updateEvent}
        initialDate={eventInitDate}
      />
      <AddNoteModal open={modal === 'note'} onClose={() => { setModal(null); setPendingSpaceId(null); }} profile={profile} members={members} spaces={spaces} initialSpaceId={pendingSpaceId} onSave={addNote} />
      <AddListModal
        open={listAddOpen}
        onClose={() => { setListAddOpen(false); setPendingSpaceId(null); }}
        members={members}
        myId={profile?.id}
        spaces={spaces}
        initialSpaceId={pendingSpaceId}
        onSave={async ({ title, memberIds, spaceId }) => {
          const result = await addList({ title, memberIds, spaceId });
          if (!result?.error) { setListAddOpen(false); setPendingSpaceId(null); }
          return result;
        }}
      />
      <AddSpaceModal
        open={spaceAddOpen}
        onClose={() => { setSpaceAddOpen(false); setSpaceEditTarget(null); }}
        members={members}
        myId={profile?.id}
        initial={spaceEditTarget}
        onSave={async ({ id, title, emoji, color, description, memberIds }) => {
          const result = id
            ? await updateSpace(id, { title, emoji, color, description, memberIds })
            : await addSpace({ title, emoji, color, description, memberIds });
          if (!result?.error) {
            setSpaceAddOpen(false);
            setSpaceEditTarget(null);
          }
          return result;
        }}
      />
      <SpaceDetailModal
        open={!!spaceDetailItem}
        space={spaceDetailItem ? (spaces.find(s => s.id === spaceDetailItem.id) || spaceDetailItem) : null}
        onClose={() => setSpaceDetailItem(null)}
        tasks={tasks}
        events={events}
        notes={notes}
        lists={lists}
        listItems={listItems}
        spaceItems={spaceItems}
        onAddSpaceItem={addSpaceItem}
        onToggleSpaceItem={toggleSpaceItem}
        onDeleteSpaceItem={deleteSpaceItem}
        onCycleSpaceItemAssignee={cycleSpaceItemAssignee}
        members={members}
        getProfile={getProfile}
        myId={profile?.id}
        onEdit={(s) => { setSpaceDetailItem(null); setSpaceEditTarget(s); setSpaceAddOpen(true); }}
        onArchive={(s) => { archiveSpace(s); setSpaceDetailItem(null); }}
        onAddTask={(s)  => { setPendingSpaceId(s.id); setSpaceDetailItem(null); setModal('task');  }}
        onAddEvent={(s) => { setEventEditTarget(null); setPendingSpaceId(s.id); setSpaceDetailItem(null); setModal('event'); }}
        onAddNote={(s)  => { setPendingSpaceId(s.id); setSpaceDetailItem(null); setModal('note');  }}
        onAddList={(s)  => { setPendingSpaceId(s.id); setSpaceDetailItem(null); setListAddOpen(true); }}
        onShowTask={(t)  => { setSpaceDetailItem(null); setDetailTaskId(t.id);  }}
        onShowEvent={(e) => { setSpaceDetailItem(null); setDetailEventId(e.id); }}
        onShowNote={(n)  => { setSpaceDetailItem(null); setDetailNoteId(n.id);  }}
        onOpenList={(l)  => { setSpaceDetailItem(null); setListDetailItem(l);   }}
      />
      <ListDetailModal
        open={!!listDetailItem}
        list={listDetailItem}
        items={listDetailItem ? listItems.filter(i => i.list_id === listDetailItem.id) : []}
        members={members}
        getProfile={getProfile}
        myId={profile?.id}
        onClose={() => setListDetailItem(null)}
        onAddItem={addListItem}
        onToggleItem={toggleListItem}
        onDeleteItem={deleteListItem}
        onCycleAssignee={cycleListItemAssignee}
        activity={listDetailItem ? activityByList?.[listDetailItem.id] : null}
        onLoadActivity={loadListActivity}
      />
      <DayDetailsModal
        open={!!dayDetailsDate}
        date={dayDetailsDate}
        events={expandedEvents.filter(e => calView === 'personal'
          ? (e.is_private && e.created_by === profile?.id)
          : !e.is_private)}
        members={members}
        getProfile={getProfile}
        myId={profile?.id}
        onClose={() => setDayDetailsDate(null)}
        onAddEvent={() => { setEventEditTarget(null); setEventInitDate(dayDetailsDate); setDayDetailsDate(null); setModal('event'); }}
        onDelete={(id) => deleteEvent(id)}
        onShowEvent={(e) => setDetailEventId(e.id)}
      />
      <MonthEventsModal
        open={!!monthModalData}
        onClose={() => setMonthModalData(null)}
        monthName={monthModalData?.monthName}
        year={monthModalData?.year}
        events={monthModalData?.events || []}
        members={members}
        getProfile={getProfile}
        myId={profile?.id}
        onDelete={(id) => { deleteEvent(id); setMonthModalData(d => d ? { ...d, events: d.events.filter(e => e.id !== id) } : d); }}
        onShowEvent={(e) => setDetailEventId(e.id)}
      />
      <EventDetailsModal
        open={!!detailEventId}
        event={events.find(e => e.id === detailEventId) || null}
        members={members}
        getProfile={getProfile}
        myId={profile?.id}
        onClose={() => setDetailEventId(null)}
        onDelete={(id) => deleteEvent(id)}
        onEdit={(ev) => { setDetailEventId(null); setDayDetailsDate(null); setMonthModalData(null); setEventEditTarget(ev); setModal('event'); }}
        onShowMember={(p) => { setDetailEventId(null); setDetailMemberId(p.id); }}
        tasks={tasks}
        onSetRsvp={setRsvp}
        onAddLinkedTask={addLinkedTask}
        onToggleTask={toggleTask}
        onOpenTask={(t) => { setDetailEventId(null); setDetailTaskId(t.id); }}
      />
      <NoteDetailsModal
        open={!!detailNoteId}
        note={notes.find(n => n.id === detailNoteId) || null}
        tasks={tasks}
        events={events}
        myId={profile?.id}
        myGroupId={profile?.group_id}
        members={members}
        getProfile={getProfile}
        onClose={() => setDetailNoteId(null)}
        onDelete={(id) => deleteNote(id)}
        onToggleTask={toggleTask}
        onShowMember={(p) => { setDetailNoteId(null); setDetailMemberId(p.id); }}
        onShowEvent={(e) => { setDetailNoteId(null); setDetailEventId(e.id); }}
        onNoteUpdated={(updated) => setNotes(prev => prev.map(n => n.id === updated.id ? updated : n))}
        onTogglePin={togglePin}
        onVote={voteOnPoll}
        notify={notify}
        me={profile}
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
        onEdit={(t) => { setDetailTaskId(null); setTaskEditTarget(t); setModal('task'); }}
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
    </SpacesContext.Provider>
    </MyIdContext.Provider>
  );
}
