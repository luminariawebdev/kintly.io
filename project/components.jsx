// components.jsx — FamilyBoard shared components
// ColorDot, UserBadge, TaskRow, EventChip, NoteCard, Modal, AnchorTabs, StickyHeader

const USERS = {
  maya: { id: 'maya', name: 'Maya',  color: 'var(--u-maya)', initial: 'M', role: 'Mom'  },
  theo: { id: 'theo', name: 'Theo',  color: 'var(--u-theo)', initial: 'T', role: 'Dad'  },
  iris: { id: 'iris', name: 'Iris',  color: 'var(--u-iris)', initial: 'I', role: 'Kid'  },
  leo:  { id: 'leo',  name: 'Leo',   color: 'var(--u-leo)',  initial: 'L', role: 'Kid'  },
};
const USERLIST = ['maya', 'theo', 'iris', 'leo'].map(k => USERS[k]);
const ME = 'maya';

// ─────────────────────────────────────────────────────────────
function ColorDot({ user, size = 'md', style }) {
  const u = typeof user === 'string' ? USERS[user] : user;
  const cls = 'dot' + (size === 'lg' ? ' lg' : size === 'xl' ? ' xl' : '');
  return <span className={cls} style={{ ...(u ? { '--c': u.color } : null), ...style }} />;
}

function UserBadge({ user, you = false, size = 'md' }) {
  const u = typeof user === 'string' ? USERS[user] : user;
  if (!u) return null;
  return (
    <span className="userbadge">
      <ColorDot user={u} size={size} />
      <span className="nm">{u.name}</span>
      {you && <span className="you">you</span>}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
function StickyHeader({ group = 'Park-Family', onMenu, onProfile }) {
  return (
    <div className="fb-stickyhead">
      <div className="fb-stickyhead-row">
        <div className="fb-wordmark">Family<span>board</span></div>
        <button className="fb-grp-pill" onClick={onMenu}>
          <ColorDot user="maya" />
          <span className="nm">{group}</span>
          <span className="car">▾</span>
        </button>
        <button className="fb-prof" onClick={onProfile} aria-label="Profile">M</button>
      </div>
    </div>
  );
}

function AnchorTabs({ active, onChange }) {
  const tabs = [
    { id: 'tasks',    label: 'Tasks' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'notes',    label: 'Notes' },
  ];
  return (
    <div className="fb-tabs" role="tablist">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={'fb-tab' + (active === t.id ? ' active' : '')}
          onClick={() => onChange(t.id)}
        >{t.label}</button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function TaskRow({ task, onToggle }) {
  const creator = USERS[task.createdBy];
  const assignee = USERS[task.assignee];
  const overdue = task.due && task.dueOrder < 0;
  return (
    <div
      className={'taskrow' + (task.done ? ' done' : '')}
      style={{ '--c': assignee?.color }}
    >
      <button
        type="button"
        className={'check' + (task.done ? ' on' : '')}
        onClick={onToggle}
        aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
      />
      <div className="body">
        <div className="title">{task.title}</div>
        <div className="meta">
          {task.due && (
            <span className={'due' + (overdue ? ' overdue' : '')}>{task.due}</span>
          )}
          {task.due && <span className="sep">·</span>}
          <span>by {creator?.name}</span>
          {task.tag && <><span className="sep">·</span><span>{task.tag}</span></>}
        </div>
      </div>
      {task.priority === 'high' && <span className="badge">!</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function EventChip({ event, style }) {
  const u = USERS[event.assignee];
  return (
    <div className="evt" style={{ '--c': u?.color, ...style }} title={event.title}>
      {event.title}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function NoteCard({ note, tall = false }) {
  const u = USERS[note.author];
  return (
    <div
      className={'note' + (tall ? ' tall' : '')}
      style={{ '--c': u?.color }}
    >
      {note.pinned && <span className="pin" />}
      <div className="note-hd">
        <ColorDot user={u} />
        <span className="nm">{u?.name}</span>
        <span className="when">{note.when}</span>
      </div>
      <div className="body">{note.body}</div>
      {note.tag && <span className="tag">#{note.tag}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal — bottom sheet inside the device frame
function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="sheet-hd">
          <h3>{title}</h3>
          <button className="close" onClick={onClose}>Cancel</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers to compute month grid (May 2026 hard-coded for the wireframe)
function buildMay2026() {
  // May 1 2026 = Friday. 0=Sun
  const FIRST_DOW = 5;
  const DAYS = 31;
  const cells = [];
  // April tail: 30 days in April. Apr 30 = Thu (DOW 4). We need 5 leading days.
  // Apr 26 Sun, 27 Mon, 28 Tue, 29 Wed, 30 Thu  (5 cells)
  for (let i = 0; i < FIRST_DOW; i++) {
    cells.push({ d: 26 + i, m: 'prev', dim: true });
  }
  for (let i = 1; i <= DAYS; i++) cells.push({ d: i, m: 'curr' });
  // pad to 42 (6 weeks)
  let nx = 1;
  while (cells.length < 42) { cells.push({ d: nx++, m: 'next', dim: true }); }
  return cells;
}

Object.assign(window, {
  USERS, USERLIST, ME,
  ColorDot, UserBadge, StickyHeader, AnchorTabs,
  TaskRow, EventChip, NoteCard, Modal,
  buildMay2026,
});
