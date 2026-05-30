import React from 'react';

export const USERS = {
  maya: { id: 'maya', name: 'Maya', color: 'var(--u-maya)', initial: 'M', role: 'Mom' },
  theo: { id: 'theo', name: 'Theo', color: 'var(--u-theo)', initial: 'T', role: 'Dad' },
  iris: { id: 'iris', name: 'Iris', color: 'var(--u-iris)', initial: 'I', role: 'Kid' },
  leo:  { id: 'leo',  name: 'Leo',  color: 'var(--u-leo)',  initial: 'L', role: 'Kid' },
};
export const USERLIST = ['maya', 'theo', 'iris', 'leo'].map(k => USERS[k]);
export const ME = 'maya';

export function ColorDot({ user, size = 'md', style }) {
  const u = typeof user === 'string' ? USERS[user] : user;
  const cls = 'dot' + (size === 'lg' ? ' lg' : size === 'xl' ? ' xl' : '');
  return <span className={cls} style={{ ...(u ? { '--c': u.color } : null), ...style }} />;
}

export function UserBadge({ user, you = false, size = 'md' }) {
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

export function StickyHeader({ group = 'Park-Family', onMenu, onProfile }) {
  return (
    <div className="fb-stickyhead">
      <div className="fb-stickyhead-row">
        <div className="fb-wordmark">kinnekt</div>
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

export function AnchorTabs({ active, onChange }) {
  const tabs = [
    { id: 'notes',    label: 'Home' },
    { id: 'tasks',    label: 'Tasks' },
    { id: 'calendar', label: 'Calendar' },
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

export function TaskRow({ task, onToggle }) {
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

export function EventChip({ event, style }) {
  const u = USERS[event.assignee];
  return (
    <div className="evt" style={{ '--c': u?.color, ...style }} title={event.title}>
      {event.title}
    </div>
  );
}

export function NoteCard({ note, tall = false }) {
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

// `compact` switches the sheet from the default 75%-min bottom drawer
// to a content-sized sheet that bottom-aligns. Used by date/time
// pickers so the wheels land near the trigger button instead of
// drifting toward the upper half of the screen.
export function Modal({ open, title, onClose, children, footer, compact }) {
  const sheetRef = React.useRef(null);
  const dragRef = React.useRef({ startY: 0, dragging: false, offset: 0 });

  if (!open) return null;

  const onPointerDown = (e) => {
    if (!sheetRef.current) return;
    dragRef.current.startY = e.clientY;
    dragRef.current.dragging = true;
    dragRef.current.offset = 0;
    sheetRef.current.style.transition = 'none';
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    if (delta <= 0) {
      dragRef.current.offset = 0;
      sheetRef.current.style.transform = 'translateY(0)';
      return;
    }
    dragRef.current.offset = delta;
    sheetRef.current.style.transform = `translateY(${delta}px)`;
  };

  const endDrag = (e) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    dragRef.current.dragging = false;
    const offset = dragRef.current.offset;
    const sheet = sheetRef.current;
    sheet.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
    if (offset > 110) {
      const rect = sheet.getBoundingClientRect();
      sheet.style.transform = `translateY(${rect.height}px)`;
      window.setTimeout(onClose, 250);
    } else {
      sheet.style.transform = 'translateY(0)';
    }
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className={'sheet' + (compact ? ' sheet-compact' : '')}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sheet-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="sheet-grab-bar" />
        </div>
        <div className="sheet-hd">
          <h3>{title}</h3>
          {/* Cancel button remains for accessibility / non-touch dismiss */}
          <button className="close" onClick={onClose}>Cancel</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function buildMay2026() {
  const FIRST_DOW = 5;
  const DAYS = 31;
  const cells = [];
  for (let i = 0; i < FIRST_DOW; i++) {
    cells.push({ d: 26 + i, m: 'prev', dim: true });
  }
  for (let i = 1; i <= DAYS; i++) cells.push({ d: i, m: 'curr' });
  let nx = 1;
  while (cells.length < 42) { cells.push({ d: nx++, m: 'next', dim: true }); }
  return cells;
}
