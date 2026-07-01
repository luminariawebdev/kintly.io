// Shared helpers for the Vercel serverless functions (interpret.js / transcribe.js).
// A leading-underscore file is NOT routed as an endpoint, so this is import-only.
// SUPABASE_URL/ANON are public (the anon key already ships in the browser bundle);
// the private GROQ/ANTHROPIC keys live only in each function via process.env.
//
// Zero dependencies — uses the runtime's built-in fetch.

const SUPABASE_URL = 'https://bqdkizavhlpswjtgxdjw.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxZGtpemF2aGxwc3dqdGd4ZGp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3ODQzMDYsImV4cCI6MjA5NDM2MDMwNn0.Oedpsru9CCbKihZ-azAu4Uj2MNOF2HGNRFGFM2f86Fg';

// Read + parse the JSON body, capping the raw bytes BEFORE buffering / JSON.parse
// so a flood of huge posts can't exhaust memory even though auth gates the endpoint.
// Throws { statusCode: 413 } when the body exceeds maxBytes.
async function readJson(req, maxBytes = 1000000) {
  const tooLarge = () => { const e = new Error('payload too large'); e.statusCode = 413; return e; };
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > maxBytes) throw tooLarge();
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > maxBytes) throw tooLarge();
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return {}; }
}

// Verify the caller is a signed-in Supabase user before spending API budget.
// Without this, anyone who finds the URL could loop the endpoint and run up the
// owner's Groq/Anthropic bill.
async function getUser(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    return u && u.id ? u : null;
  } catch { return null; }
}

module.exports = { SUPABASE_URL, SUPABASE_ANON, readJson, getUser };
