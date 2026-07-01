// Vercel serverless function — turns a spoken sentence into structured items
// using Claude (tool use). Holds ANTHROPIC_API_KEY (a private Vercel env var)
// so the key never reaches the browser.
//
// The client sends { text, context }. We give Claude one tool, force it to call
// that tool once, and return the structured arguments. The client resolves
// names -> ids, shows a confirm screen, and applies via the normal add handlers.
//
// Zero dependencies — uses the runtime's built-in fetch.

const { readJson, getUser } = require('./_shared');

// The client-supplied context is interpolated straight into the system prompt.
// Bound it so a caller can't inflate the prompt (token-cost amplification, all
// billed to the app owner) or push unbounded data at the model.
function clampContext(ctx) {
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return {};
  const capArr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : v);
  return {
    weekday: s(ctx.weekday, 20), today: s(ctx.today, 40), time: s(ctx.time, 20),
    timezone: s(ctx.timezone, 60), me: s(ctx.me, 80),
    members: capArr(ctx.members, 100).map((m) => s(m, 80)),
    spaces: capArr(ctx.spaces, 100).map((m) => s(m, 80)),
    // Clamp the FIELDS inside these arrays too (not just array length) — else a
    // single giant title bypasses the token bound — and drop non-object elements
    // so buildSystem can't throw on a null (which sanitizeStaged already guards).
    open_tasks: capArr(ctx.open_tasks, 250).map((t) => (t && typeof t === 'object') ? {
      id: s(t.id, 64), title: s(t.title, 200), assignee: s(t.assignee, 80),
      due_date: s(t.due_date, 20), due_time: s(t.due_time, 20),
    } : null).filter(Boolean),
    list_items: capArr(ctx.list_items, 250).map((i) => (i && typeof i === 'object') ? {
      id: s(i.id, 64), title: s(i.title, 200), space: s(i.space, 120),
    } : null).filter(Boolean),
    events: capArr(ctx.events, 250).map((e) => (e && typeof e === 'object') ? {
      title: s(e.title, 200), date: s(e.date, 20),
    } : null).filter(Boolean),
  };
}

function buildSystem(ctx) {
  const members = (ctx.members || []).join(', ') || '(none listed)';
  const spaces = (ctx.spaces || []).join(', ') || '(none listed)';
  const openTasks = (ctx.open_tasks || []).map((t) =>
    `- [${t.id}] "${t.title}"${t.assignee ? ` — assigned to ${t.assignee}` : ' — unassigned'}${t.due_date ? ` — due ${t.due_date}${t.due_time ? ' ' + t.due_time : ''}` : ''}`
  ).join('\n') || '(none)';
  const listItems = (ctx.list_items || []).map((i) =>
    `- [${i.id}] "${i.title}"${i.space ? ` — in ${i.space}` : ''}`
  ).join('\n') || '(none)';
  const events = (ctx.events || []).map((e) =>
    `- "${e.title}"${e.date ? ` (${e.date})` : ''}`
  ).join('\n') || '(none)';
  return [
    'You are the voice assistant for Kinnekt, a shared family/group organizer.',
    "Convert the user's spoken request into structured items to add to the app, then call the stage_items tool exactly once with everything you extracted.",
    '',
    `Right now it is ${ctx.weekday || ''} ${ctx.today || ''} at ${ctx.time || ''} (${ctx.timezone || 'local time'}).`,
    'Resolve every relative date ("today", "tomorrow", "next Friday", "the 5th of next month") to an absolute calendar date in YYYY-MM-DD form. Use 24-hour HH:MM for all times.',
    '',
    `Family members: ${members}.`,
    `When the user names who a task is for, use that person's exact name. "me", "myself", or "I" refers to ${ctx.me || 'the speaker'}.`,
    `DEFAULT ASSIGNEE: if the user does NOT say who a task is for, assign it to the speaker — set assignee to "me". Do NOT default to "unassigned". Only use "unassigned" when the user explicitly says unassigned / for anyone / up for grabs / no one in particular. If they name a person, use that name.`,
    `GROUP vs PERSONAL: tasks go on the shared GROUP list by default (private=false). Only set private=true if the user says it's personal / private / "my own list" / "just for me" / "my personal to-dos".`,
    '',
    `Lists / spaces that exist: ${spaces}.`,
    'For "add X to the Y list/space", set space to the closest matching name from that list.',
    '',
    'Existing tasks the user can act on (id in brackets):',
    openTasks,
    '',
    'Existing list items the user can check off (id in brackets):',
    listItems,
    '',
    'Existing calendar events (for linking tasks to):',
    events,
    '',
    'Rules:',
    '- A to-do / chore / reminder for a person is a task. Something happening at a date/time (appointment, party, meeting) is an event. Adding a thing to a named list (groceries, shopping, packing) is a space item.',
    '- A single command can contain SEVERAL separate add requests, joined by "and", "and then", "also", or just a new sentence (e.g. "add an event to today, check the weather report, and then add a task, make sure the weather is correct"). Treat each as its OWN item — here: an event titled "Check the weather report" AND a task titled "Make sure the weather is correct". Never merge them, drop one, or read the second as commentary on the first.',
    '- A phrase that FOLLOWS an add request is the TITLE/subject of that item, not a command for you to perform — even across a sentence break. e.g. "add an event to today\'s calendar. check the weather report" → ONE event titled "Check the weather report". "remind me to call the dentist" → a task titled "Call the dentist". An event/task whose title is an action the user wants to remember (check the weather, call someone, water the plants, take out the trash) is exactly the point — title it and add it. NEVER refuse these as "outside my capabilities".',
    '- Only treat something as out of scope if the user is asking YOU to answer or perform it live right now (e.g. "what\'s the weather today?", "tell me a joke") rather than to schedule/record it. That is rare — default to creating the item.',
    '- A "post" / "message" / "announcement" / "poll" goes on the Home feed (a post item), NOT a task. Map it by kind: a normal heads-up is "message"; something the user calls urgent / an announcement / important is "urgent"; a quick reminder for the whole group is "reminder"; a question with choices to vote on is "poll" (fill poll_options with the choices). Put the spoken message in "text" (for a poll, "text" is the question).',
    '- LINKING TASKS TO AN EVENT: if the user says to attach/link a task to an event (e.g. "add an event \'Move day\' and a couple tasks, and link those tasks to that event"), set that task\'s link_to_event to the event\'s exact title. The event may be one you are creating in this same command, or one of the existing events listed above. Match by title.',
    '- You cannot create a photo post by voice; if the user asks to post a photo, leave it out and mention it in "note".',
    '- ACTING ON AN EXISTING TASK vs creating a new one: if the user refers to a task that already exists above ("the task called X", "my X task", "mark X done", "delete X", "reassign/assign X to …", "push/move X to …", "change X\'s …"), they want to act on THAT task — add an entry to "actions" with the matching task_id and the right op. Do NOT also create a new task in "tasks". Only use "tasks" for genuinely new to-dos.',
    '- Action ops: "complete" (mark it done); "delete" (remove it); "postpone" (move its due date — set new_date and optional new_time); "handoff" (give it to someone — set handoff_to to a member name, or "pool" for anyone); "edit" (change fields — set any of new_title, new_assignee [a member name, "me", or "unassigned"], new_due_date, new_due_time, new_repeats, new_details). For "check off bananas from groceries" use op "check_off_item" with the item_id from the list above.',
    '- Match the spoken description to the closest existing title. If you cannot confidently match an existing task/item, do NOT guess and do NOT create a new task — explain in "note".',
    '- NEVER invent a placeholder title. Every task and event must have a real title taken from what the user actually said. If the user asks to add a task or event but does not give a name (e.g. "add an event to today" with no event name), do NOT add a titleless/"unknown" item — leave that array empty and ask for the missing detail in "note".',
    '- Only include what the user actually asked for. Do not invent items.',
    '- If part of the request is unclear or could not be turned into an item, put a short plain explanation in "note".',
  ].join('\n');
}

const stageTool = {
  name: 'stage_items',
  description: 'Record everything the user asked to add to their organizer.',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            assignee: { type: 'string', description: 'A member name, "me", or "unassigned".' },
            due_date: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null.' },
            due_time: { type: ['string', 'null'], description: 'HH:MM 24-hour, or null.' },
            repeats: { type: ['string', 'null'], enum: ['none', 'daily', 'weekly', 'monthly', null] },
            details: { type: ['string', 'null'], description: 'Extra notes, or null.' },
            private: { type: 'boolean', description: 'True only if the user said it is private/personal.' },
            link_to_event: { type: ['string', 'null'], description: 'Title of an event (new or existing) to attach this task to, or null.' },
          },
          required: ['title'],
        },
      },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            date: { type: 'string', description: 'YYYY-MM-DD.' },
            start_time: { type: ['string', 'null'], description: 'HH:MM 24-hour, or null.' },
            attendees: { type: 'array', items: { type: 'string' }, description: 'Member names.' },
            location: { type: ['string', 'null'] },
          },
          required: ['title', 'date'],
        },
      },
      space_items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            space: { type: 'string', description: 'The list/space name to add to.' },
            item: { type: 'string', description: 'The thing to add.' },
          },
          required: ['space', 'item'],
        },
      },
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['message', 'urgent', 'reminder', 'poll'] },
            text: { type: ['string', 'null'], description: 'The post body; for a poll, the question.' },
            poll_options: { type: 'array', items: { type: 'string' }, description: 'Only for kind "poll": the answer choices (2 or more).' },
          },
          required: ['kind'],
        },
      },
      actions: {
        type: 'array',
        description: 'Operations on EXISTING tasks / list items (not new ones).',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['complete', 'delete', 'postpone', 'handoff', 'edit', 'check_off_item'] },
            task_id: { type: ['string', 'null'], description: 'The id of the existing task from the list above (for task ops).' },
            item_id: { type: ['string', 'null'], description: 'The id of the existing list item (only for check_off_item).' },
            target_label: { type: ['string', 'null'], description: 'The title you matched, for display.' },
            new_date: { type: ['string', 'null'], description: 'postpone: new due date YYYY-MM-DD.' },
            new_time: { type: ['string', 'null'], description: 'postpone: new due time HH:MM 24h.' },
            handoff_to: { type: ['string', 'null'], description: 'handoff: a member name, or "pool".' },
            new_title: { type: ['string', 'null'], description: 'edit: new title.' },
            new_assignee: { type: ['string', 'null'], description: 'edit: member name, "me", or "unassigned".' },
            new_due_date: { type: ['string', 'null'], description: 'edit: YYYY-MM-DD.' },
            new_due_time: { type: ['string', 'null'], description: 'edit: HH:MM 24h.' },
            new_repeats: { type: ['string', 'null'], enum: ['none', 'daily', 'weekly', 'monthly', null] },
            new_details: { type: ['string', 'null'], description: 'edit: notes/details.' },
          },
          required: ['op'],
        },
      },
      note: { type: 'string', description: 'Anything you could not interpret, else an empty string.' },
    },
  },
};

// ── Validate the model's tool output before handing it to the client ─────────
// The model is forced to call stage_items, but its arguments are untrusted: a
// prompt-injected transcript could emit a destructive `action` against an
// arbitrary task_id, or malformed dates/enums. We coerce every field to a known
// shape, drop unknown keys, cap array sizes, and — critically — reject any
// action whose task_id/item_id isn't in the caller's own context.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_ITEMS = 25;
const normDate = (v) => {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Reject calendar rollover (e.g. Feb 30 → Mar 2) deterministically via a
  // UTC round-trip instead of relying on host Date.parse strictness.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const normTime = (v) => {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const s = `${m[1].padStart(2, '0')}:${m[2]}`;
  return TIME_RE.test(s) ? s : null;
};
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const optStr = (v, max) => (v == null ? null : str(v, max));
const oneOf = (v, allowed) => (allowed.includes(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);

function sanitizeStaged(input, ctx) {
  const obj = input && typeof input === 'object' ? input : {};
  const taskIds = new Set((ctx.open_tasks || []).map((t) => t && t.id != null ? String(t.id) : '').filter(Boolean));
  const itemIds = new Set((ctx.list_items || []).map((i) => i && i.id != null ? String(i.id) : '').filter(Boolean));

  const tasks = arr(obj.tasks).map((t) => (t && typeof t === 'object') ? {
    title: str(t.title, 200),
    assignee: typeof t.assignee === 'string' ? t.assignee.slice(0, 80) : 'me',
    due_date: normDate(t.due_date),
    due_time: normTime(t.due_time),
    repeats: oneOf(t.repeats, ['none', 'daily', 'weekly', 'monthly']),
    details: optStr(t.details, 1000),
    private: t.private === true,
    link_to_event: optStr(t.link_to_event, 200),
  } : null).filter((t) => t && t.title.trim());

  const rawEvents = arr(obj.events).map((e) => (e && typeof e === 'object') ? {
    title: str(e.title, 200),
    date: normDate(e.date),
    start_time: normTime(e.start_time),
    attendees: Array.isArray(e.attendees) ? e.attendees.filter((a) => typeof a === 'string').slice(0, 50).map((a) => a.slice(0, 80)) : [],
    location: optStr(e.location, 200),
  } : null).filter((e) => e && e.title.trim());
  const events = rawEvents.filter((e) => e.date);
  // Events with a real title but an unparseable date: don't silently drop them
  // — surface them in the note so the user knows to restate the date.
  const droppedEvents = rawEvents.filter((e) => !e.date);

  const space_items = arr(obj.space_items).map((s) => (s && typeof s === 'object') ? {
    space: str(s.space, 120),
    item: str(s.item, 200),
  } : null).filter((s) => s && s.space.trim() && s.item.trim());

  const posts = arr(obj.posts).map((p) => (p && typeof p === 'object') ? {
    kind: oneOf(p.kind, ['message', 'urgent', 'reminder', 'poll']) || 'message',
    text: optStr(p.text, 2000),
    poll_options: Array.isArray(p.poll_options) ? p.poll_options.filter((o) => typeof o === 'string' && o.trim()).slice(0, 12).map((o) => o.slice(0, 120)) : [],
  } : null).filter(Boolean);

  const actions = arr(obj.actions).map((a) => {
    if (!a || typeof a !== 'object') return null;
    const op = oneOf(a.op, ['complete', 'delete', 'postpone', 'handoff', 'edit', 'check_off_item']);
    if (!op) return null;
    if (op === 'check_off_item') {
      const item_id = a.item_id != null ? String(a.item_id) : '';
      if (!itemIds.has(item_id)) return null; // must reference a real list item the user can see
      return { op, item_id, target_label: str(a.target_label, 200) };
    }
    const task_id = a.task_id != null ? String(a.task_id) : '';
    if (!taskIds.has(task_id)) return null; // must reference a task in the caller's own open list
    return {
      op,
      task_id,
      target_label: str(a.target_label, 200),
      new_date: normDate(a.new_date),
      new_time: normTime(a.new_time),
      handoff_to: optStr(a.handoff_to, 80),
      new_title: optStr(a.new_title, 200),
      new_assignee: optStr(a.new_assignee, 80),
      new_due_date: normDate(a.new_due_date),
      new_due_time: normTime(a.new_due_time),
      new_repeats: oneOf(a.new_repeats, ['none', 'daily', 'weekly', 'monthly']),
      new_details: optStr(a.new_details, 1000),
    };
  }).filter(Boolean);

  let note = optStr(obj.note, 1000) || '';
  if (droppedEvents.length) {
    const names = droppedEvents.map((e) => `"${e.title.trim()}"`).join(', ');
    note = (note ? note + ' ' : '') + `I couldn't work out a date for ${names}, so ${droppedEvents.length > 1 ? 'they were' : 'it was'} left out — try again with the date.`;
  }
  return { tasks, events, space_items, posts, actions, note };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'The voice assistant is not configured yet (ANTHROPIC_API_KEY is missing in Vercel).' });
    return;
  }

  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to use the voice assistant.' });
    return;
  }

  try {
    const body = await readJson(req);
    const text = body && body.text;
    const ctx = clampContext(body && body.context);
    // Reject non-string text outright — String({}) => "[object Object]" would
    // otherwise sail under the length cap while a huge body was buffered.
    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'No text to interpret.' });
      return;
    }
    if (text.length > 4000) {
      res.status(413).json({ error: 'That request was too long — try saying a bit less at once.' });
      return;
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Swap this string to change the assistant's brain:
        //   claude-haiku-4-5  — cheapest + fastest ($1/$5 per 1M)
        //   claude-sonnet-4-6 — smarter on messy phrasing ($3/$15 per 1M)
        //   claude-opus-4-8   — best on tangled multi-part commands ($5/$25)
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: buildSystem(ctx),
        tools: [stageTool],
        tool_choice: { type: 'tool', name: 'stage_items' },
        messages: [{ role: 'user', content: text }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      // Log the upstream detail server-side; never relay it — Anthropic's error
      // strings can disclose billing/quota/account state to the caller.
      console.error('interpret upstream error:', r.status, data && data.error && data.error.message);
      res.status(502).json({ error: 'The assistant is unavailable right now — please try again.' });
      return;
    }
    const block = ((data && data.content) || []).find((b) => b.type === 'tool_use' && b.name === 'stage_items');
    const input = (block && block.input) || {};
    // Validate/clamp the model output against the caller's own context before
    // the client acts on it (drops actions that reference unknown ids, etc).
    res.status(200).json(sanitizeStaged(input, ctx));
  } catch (e) {
    // Don't leak internal error strings (hostnames, stack details) to the client.
    if (e && e.statusCode === 413) {
      res.status(413).json({ error: 'That request was too large.' });
      return;
    }
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      res.status(504).json({ error: 'The assistant took too long — please try again.' });
      return;
    }
    console.error('interpret error:', e);
    res.status(500).json({ error: 'Something went wrong interpreting that.' });
  }
};
