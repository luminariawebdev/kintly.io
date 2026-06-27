// Vercel serverless function — turns a spoken sentence into structured items
// using Claude (tool use). Holds ANTHROPIC_API_KEY (a private Vercel env var)
// so the key never reaches the browser.
//
// The client sends { text, context }. We give Claude one tool, force it to call
// that tool once, and return the structured arguments. The client resolves
// names -> ids, shows a confirm screen, and applies via the normal add handlers.
//
// Zero dependencies — uses the runtime's built-in fetch.

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return {}; }
}

function buildSystem(ctx) {
  const members = (ctx.members || []).join(', ') || '(none listed)';
  const spaces = (ctx.spaces || []).join(', ') || '(none listed)';
  return [
    'You are the voice assistant for Kinnekt, a shared family/group organizer.',
    "Convert the user's spoken request into structured items to add to the app, then call the stage_items tool exactly once with everything you extracted.",
    '',
    `Right now it is ${ctx.weekday || ''} ${ctx.today || ''} at ${ctx.time || ''} (${ctx.timezone || 'local time'}).`,
    'Resolve every relative date ("today", "tomorrow", "next Friday", "the 5th of next month") to an absolute calendar date in YYYY-MM-DD form. Use 24-hour HH:MM for all times.',
    '',
    `Family members: ${members}.`,
    `When the user assigns a task or invites someone, use that person's exact name as listed. If a task has no one named, use "unassigned". "me", "myself", or "I" refers to ${ctx.me || 'the speaker'}.`,
    '',
    `Lists / spaces that exist: ${spaces}.`,
    'For "add X to the Y list/space", set space to the closest matching name from that list.',
    '',
    'Rules:',
    '- A to-do / chore / reminder for a person is a task. Something happening at a date/time (appointment, party, meeting) is an event. Adding a thing to a named list (groceries, shopping, packing) is a space item.',
    '- A "post" / "message" / "announcement" / "poll" goes on the Home feed (a post item), NOT a task. Map it by kind: a normal heads-up is "message"; something the user calls urgent / an announcement / important is "urgent"; a quick reminder for the whole group is "reminder"; a question with choices to vote on is "poll" (fill poll_options with the choices). Put the spoken message in "text" (for a poll, "text" is the question).',
    '- You cannot create a photo post by voice; if the user asks to post a photo, leave it out and mention it in "note".',
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
      note: { type: 'string', description: 'Anything you could not interpret, else an empty string.' },
    },
  },
};

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

  try {
    const body = await readJson(req);
    const text = body && body.text;
    const ctx = (body && body.context) || {};
    if (!text || !String(text).trim()) {
      res.status(400).json({ error: 'No text to interpret.' });
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
        model: 'claude-haiku-4-5',
        max_tokens: 2048,
        system: buildSystem(ctx),
        tools: [stageTool],
        tool_choice: { type: 'tool', name: 'stage_items' },
        messages: [{ role: 'user', content: String(text) }],
      }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || `Assistant error (${r.status}).`;
      res.status(502).json({ error: msg });
      return;
    }
    const block = (data.content || []).find((b) => b.type === 'tool_use' && b.name === 'stage_items');
    const input = (block && block.input) || {};
    res.status(200).json({
      tasks: Array.isArray(input.tasks) ? input.tasks : [],
      events: Array.isArray(input.events) ? input.events : [],
      space_items: Array.isArray(input.space_items) ? input.space_items : [],
      posts: Array.isArray(input.posts) ? input.posts : [],
      note: typeof input.note === 'string' ? input.note : '',
    });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
