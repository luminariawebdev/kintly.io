import React from 'react';
import {
  USERS, USERLIST, ME,
  ColorDot, AnchorTabs, TaskRow, EventChip, NoteCard, Modal, buildMay2026
} from '../Components';
import { ShaderButton } from '../ShaderButton';

export const INITIAL_TASKS = [
  { id: 't1', title: 'Pack camping gear', assignee: 'maya', createdBy: 'theo', due: 'Sat · May 9', dueOrder: 1, tag: 'Trip', done: false, priority: 'high' },
  { id: 't2', title: 'Sign permission slip for Iris', assignee: 'maya', createdBy: 'iris', due: 'Yesterday', dueOrder: -1, done: false },
  { id: 't3', title: 'Call vet about flea meds', assignee: 'maya', createdBy: 'maya', due: 'Mon · May 11', dueOrder: 3, done: false },
  { id: 't4', title: 'Pick up groceries (list in Notes)', assignee: 'theo', createdBy: 'maya', due: 'Today', dueOrder: 0, done: false, priority: 'high' },
  { id: 't5', title: "Fix Leo's bike chain", assignee: 'theo', createdBy: 'leo', due: 'This week', dueOrder: 2, done: false },
  { id: 't6', title: 'Math homework — Ch. 8', assignee: 'iris', createdBy: 'maya', due: 'Tomorrow', dueOrder: 1, done: false },
  { id: 't7', title: 'Practice piano (20 min)', assignee: 'leo', createdBy: 'theo', due: 'Today', dueOrder: 0, done: true },
];

export const EVENTS = [
  { id: 'e1',  day: 8,  title: 'Soccer practice',      assignee: 'iris', start: '16:30', end: '17:30' },
  { id: 'e2',  day: 8,  title: 'Dentist · Leo',        assignee: 'leo',  start: '10:00', end: '10:45' },
  { id: 'e3',  day: 9,  title: 'Camping → Pinecrest',  assignee: 'theo', start: '08:00', end: '18:00', span: 2 },
  { id: 'e4',  day: 10, title: "Mother's Day brunch",   assignee: 'maya', start: '11:00', end: '13:00' },
  { id: 'e5',  day: 13, title: 'Iris recital',          assignee: 'iris', start: '18:30', end: '20:00' },
  { id: 'e6',  day: 14, title: 'Book club @ Theo',      assignee: 'theo', start: '19:30', end: '21:00' },
  { id: 'e7',  day: 16, title: 'Grandparents visit',    assignee: 'theo', start: '14:00', end: '20:00' },
  { id: 'e8',  day: 20, title: 'Vet appt',              assignee: 'maya', start: '15:30', end: '16:00' },
  { id: 'e9',  day: 22, title: 'Movie night',           assignee: 'leo',  start: '19:00', end: '21:00' },
  { id: 'e10', day: 23, title: "Iris @ Sam's",          assignee: 'iris', start: '14:00', end: '17:00' },
];

export const NOTES = [
  { id: 'n1', author: 'maya', when: 'TODAY · 8:14', body: 'Grocery list for Theo: oat milk, sourdough, peaches, pasta (NOT the long one), bug spray for camping.', tag: 'grocery', pinned: true, tall: true },
  { id: 'n2', author: 'iris', when: 'TODAY · 7:02', body: 'Permission slip needs a parent signature by Monday — left it on the counter.', tag: 'school' },
  { id: 'n3', author: 'theo', when: 'YDAY · 21:48', body: 'Pinecrest cabin #4 — code 7421. Quiet hours start at 10pm.', tag: 'trip' },
  { id: 'n4', author: 'leo',  when: 'YDAY · 17:30', body: 'Can we get a new soccer ball before Saturday? Mine deflated.', tag: 'wishlist' },
  { id: 'n5', author: 'maya', when: 'WED · 9:11',   body: "Plumber is booked for Thurs May 21st, 2pm. They'll text 30 min before.", tag: 'house', tall: true },
  { id: 'n6', author: 'theo', when: 'TUE · 19:02',  body: "Mom's Day reservation @ Fern Café, 11am, party of 5.", tag: 'family' },
];

function TasksSection({ onAdd }) {
  const [filter, setFilter] = React.useState('today');
  const [tasks, setTasks] = React.useState(INITIAL_TASKS);

  const matchFilter = (t) => {
    if (filter === 'all') return true;
    if (filter === 'today') return t.due === 'Today' || t.dueOrder <= 0;
    if (filter === 'week') return t.dueOrder <= 7;
    return true;
  };
  const filtered = tasks.filter(matchFilter);
  const toggleTask = (id) =>
    setTasks((xs) => xs.map((t) => t.id === id ? { ...t, done: !t.done } : t));

  const groups = USERLIST.map((u) => ({
    user: u,
    items: filtered.filter((t) => t.assignee === u.id)
  })).filter((g) => g.items.length > 0);

  return (
    <section className="fb-sec" id="sec-tasks">
      <div className="fb-sec-hd">
        <div>
          <div className="fb-sec-label">Section A</div>
          <h2 className="fb-sec-title"><em>Tasks</em></h2>
        </div>
        <div className="fb-sec-meta">{filtered.filter((t) => !t.done).length} open</div>
      </div>

      <div className="fb-chips">
        {[['today', 'Today'], ['week', 'This week'], ['all', 'All']].map(([k, label]) =>
          <button key={k} className={'fb-chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>
            {label}
          </button>
        )}
      </div>

      <ShaderButton onClick={onAdd} label="Add task" />

      <div style={{ marginTop: 10 }}>
        {groups.length === 0 &&
          <div className="kbd-hint" style={{ padding: '20px 0' }}>NO TASKS MATCH THIS FILTER</div>
        }
        {groups.map((g) =>
          <div key={g.user.id}>
            <div className="assignee-hd">
              <div className="left">
                <ColorDot user={g.user} size="lg" />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{g.user.name}</span>
                {g.user.id === ME && <span className="userbadge"><span className="you">you</span></span>}
              </div>
              <span className="count">{g.items.filter((t) => !t.done).length}/{g.items.length}</span>
            </div>
            <div className="tasklist">
              {g.items.map((t) => <TaskRow key={t.id} task={t} onToggle={() => toggleTask(t.id)} />)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CalendarSection({ onAdd }) {
  const cells = buildMay2026();
  const today = 8;
  const eventsByDay = {};
  EVENTS.forEach((e) => {
    eventsByDay[e.day] = eventsByDay[e.day] || [];
    eventsByDay[e.day].push(e);
  });
  const upcoming = EVENTS.filter((e) => e.day >= today).slice(0, 4);

  return (
    <section className="fb-sec" id="sec-calendar">
      <div className="fb-sec-hd">
        <div>
          <div className="fb-sec-label">Section B</div>
          <h2 className="fb-sec-title"><em>Calendar</em></h2>
        </div>
        <div className="fb-sec-meta">{EVENTS.length} events</div>
      </div>

      <div className="cal-bar">
        <div className="mo">May <em style={{ fontStyle: 'italic', opacity: .6 }}>2026</em></div>
        <div className="nav">
          <button aria-label="prev">‹</button>
          <button aria-label="today">●</button>
          <button aria-label="next">›</button>
        </div>
      </div>

      <div className="cal-dows">
        <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
      </div>

      <div className="cal-grid">
        {cells.map((c, i) => {
          const isToday = c.m === 'curr' && c.d === today;
          const evs = c.m === 'curr' ? eventsByDay[c.d] || [] : [];
          return (
            <div key={i} className={'cal-cell' + (c.dim ? ' dim' : '') + (isToday ? ' today' : '')}>
              <span className="num">{c.d}</span>
              {evs.slice(0, 2).map((e) => <EventChip key={e.id} event={e} />)}
              {evs.length > 2 && <span className="more">+{evs.length - 2}</span>}
            </div>
          );
        })}
      </div>

      <div className="evt-legend">
        {USERLIST.map((u) =>
          <span key={u.id} className="lg-item">
            <ColorDot user={u} /> {u.name}
          </span>
        )}
      </div>

      <button className="fb-btn" onClick={onAdd}>
        <span className="plus">+</span> Add event
      </button>

      <div className="divider-label">Upcoming</div>
      <div className="upcoming">
        {upcoming.map((e) => {
          const u = USERS[e.assignee];
          return (
            <div className="upcoming-row" key={e.id} style={{ borderLeft: `5px solid ${u.color}` }}>
              <div className="when">
                MAY
                <span className="d">{e.day}</span>
              </div>
              <div>
                <div className="ti">{e.title}</div>
                <div className="sub">
                  <span>{e.start}–{e.end}</span>
                  <span>·</span>
                  <ColorDot user={u} />
                  <span>{u.name}</span>
                </div>
              </div>
              <span className="fb-sec-meta">›</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NotesSection({ onAdd }) {
  return (
    <section className="fb-sec" id="sec-notes">
      <div className="fb-sec-hd">
        <div>
          <div className="fb-sec-label">Section C</div>
          <h2 className="fb-sec-title"><em>Notes</em></h2>
        </div>
        <div className="fb-sec-meta">{NOTES.length} notes</div>
      </div>

      <div className="note-quick" onClick={onAdd}>
        <span className="plus">+</span>
        <span>Add a note for the family…</span>
      </div>

      <div className="notes">
        {NOTES.map((n) => <NoteCard key={n.id} note={n} tall={n.tall} />)}
      </div>
    </section>
  );
}

function AddTaskModal({ open, onClose, defaultAssignee = 'maya' }) {
  const [title, setTitle] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [assignee, setAss] = React.useState(defaultAssignee);
  const [due, setDue] = React.useState('today');

  return (
    <Modal open={open} onClose={onClose} title={<>Add <em>task</em></>}
      footer={
        <>
          <button className="fb-btn solid" onClick={onClose}>Save task</button>
          <button className="fb-link" onClick={onClose} style={{ alignSelf: 'center' }}>or save &amp; add another</button>
        </>
      }>
      <div className="field">
        <label>Title</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
      </div>
      <div className="field">
        <label>Description (optional)</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Any context, links, etc." />
      </div>
      <div className="field">
        <label>Assign to</label>
        <div className="assignee-picker">
          {USERLIST.map((u) =>
            <button key={u.id} className={'pick' + (assignee === u.id ? ' on' : '')} onClick={() => setAss(u.id)}>
              <ColorDot user={u} />
              <span>{u.name}</span>
            </button>
          )}
          <button className={'pick unassign' + (assignee === null ? ' on' : '')} onClick={() => setAss(null)}>
            Unassigned
          </button>
        </div>
      </div>
      <div className="field">
        <label>Due</label>
        <div className="date-row">
          {[['today', 'Today'], ['tom', 'Tomorrow'], ['week', 'This week'], ['pick', 'Pick date…']].map(([k, label]) =>
            <button key={k} className={'pick' + (due === k ? ' on' : '')} onClick={() => setDue(k)}>{label}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AddEventModal({ open, onClose }) {
  const [title, setTitle] = React.useState('');
  const [assignee, setAss] = React.useState(null);

  return (
    <Modal open={open} onClose={onClose} title={<>Add <em>event</em></>}
      footer={<button className="fb-btn solid" onClick={onClose}>Save event</button>}>
      <div className="field">
        <label>Title</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Soccer practice" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Starts</label>
          <input defaultValue="Sat May 9 · 09:00" />
        </div>
        <div className="field">
          <label>Ends</label>
          <input defaultValue="Sat May 9 · 17:00" />
        </div>
      </div>
      <div className="field">
        <label>Color from (optional)</label>
        <div className="assignee-picker">
          {USERLIST.map((u) =>
            <button key={u.id} className={'pick' + (assignee === u.id ? ' on' : '')} onClick={() => setAss(u.id)}>
              <ColorDot user={u} />
              <span>{u.name}</span>
            </button>
          )}
          <button className={'pick unassign' + (assignee === null ? ' on' : '')} onClick={() => setAss(null)}>
            No one
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddNoteModal({ open, onClose }) {
  const [body, setBody] = React.useState('');
  return (
    <Modal open={open} onClose={onClose} title={<>Pin a <em>note</em></>}
      footer={<button className="fb-btn solid" onClick={onClose}>Post note</button>}>
      <div className="field">
        <label>Posting as</label>
        <div className="assignee-picker">
          <button className="pick on">
            <ColorDot user="maya" />
            <span>Maya</span>
            <span className="userbadge"><span className="you">you</span></span>
          </button>
        </div>
      </div>
      <div className="field">
        <label>Note</label>
        <input autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's on your mind?" />
      </div>
      <div className="field">
        <label>Tag (optional)</label>
        <div className="date-row">
          {['grocery', 'school', 'trip', 'house', 'family', 'wishlist'].map((t) =>
            <button key={t} className="pick">#{t}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function MainApp({ initialTab = 'tasks', initialModal = null, initialScroll = null }) {
  const [tab, setTab] = React.useState(initialTab);
  const [modal, setModal] = React.useState(initialModal);
  const scrollRef = React.useRef(null);

  const scrollToSec = (id, smooth = true) => {
    const wrap = scrollRef.current;
    if (!wrap) return;
    const el = wrap.querySelector('#sec-' + id);
    if (!el) return;
    const wrapRect = wrap.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const headH = wrap.querySelector('.fb-stickyhead')?.getBoundingClientRect().height || 0;
    const top = wrap.scrollTop + (elRect.top - wrapRect.top) - headH + 1;
    wrap.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  };

  const handleTab = (id) => {
    setTab(id);
    scrollToSec(id);
  };

  React.useEffect(() => {
    const wrap = scrollRef.current;
    if (!wrap) return;
    let raf;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const ids = ['tasks', 'calendar', 'notes'];
        const wrapRect = wrap.getBoundingClientRect();
        const headH = wrap.querySelector('.fb-stickyhead')?.getBoundingClientRect().height || 0;
        const probe = headH + 30;
        let cur = ids[0];
        for (const id of ids) {
          const el = wrap.querySelector('#sec-' + id);
          if (!el) continue;
          const top = el.getBoundingClientRect().top - wrapRect.top;
          if (top - probe <= 0) cur = id;
        }
        setTab(cur);
      });
    };
    wrap.addEventListener('scroll', onScroll);
    return () => wrap.removeEventListener('scroll', onScroll);
  }, []);

  React.useLayoutEffect(() => {
    if (initialScroll) {
      requestAnimationFrame(() => scrollToSec(initialScroll, false));
    }
  }, [initialScroll]);

  return (
    <div className="fb-screen">
      <div className="fb-scroll" ref={scrollRef}>
        <div className="fb-stickyhead">
          <div className="fb-stickyhead-row">
            <div className="fb-wordmark">Family<span>board</span></div>
            <button className="fb-grp-pill">
              <ColorDot user="maya" />
              <span className="nm">Park-Family</span>
              <span className="car">▾</span>
            </button>
            <button className="fb-prof" aria-label="Profile">M</button>
          </div>
          <AnchorTabs active={tab} onChange={handleTab} />
        </div>
        <div className="fb-sec-wrap">
          <TasksSection onAdd={() => setModal('task')} />
          <CalendarSection onAdd={() => setModal('event')} />
          <NotesSection onAdd={() => setModal('note')} />
        </div>
      </div>

      <AddTaskModal open={modal === 'task'} onClose={() => setModal(null)} />
      <AddEventModal open={modal === 'event'} onClose={() => setModal(null)} />
      <AddNoteModal open={modal === 'note'} onClose={() => setModal(null)} />
    </div>
  );
}
