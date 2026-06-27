// Vercel serverless function — speech-to-text via Groq (Whisper).
//
// Why this exists: the Anthropic API can't transcribe audio, and a browser
// app can't hold an API key (anyone could read it). So the mic records audio,
// posts it here as base64 JSON, and this server-side function — which alone
// holds GROQ_API_KEY (a private Vercel env var) — forwards it to Groq's
// OpenAI-compatible Whisper endpoint and returns the text.
//
// Zero dependencies: uses the runtime's built-in fetch / FormData / Blob
// (Node 18+ on Vercel), so there's nothing to npm-install.

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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'Voice transcription is not configured yet (GROQ_API_KEY is missing in Vercel).' });
    return;
  }

  try {
    const body = await readJson(req);
    const b64 = body.audio;
    const mime = body.mime || 'audio/webm';
    if (!b64) {
      res.status(400).json({ error: 'No audio received.' });
      return;
    }
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) {
      res.status(400).json({ error: 'Empty audio.' });
      return;
    }

    const ext = mime.includes('mp4') || mime.includes('m4a') ? 'm4a'
      : mime.includes('mpeg') || mime.includes('mp3') ? 'mp3'
      : mime.includes('wav') ? 'wav'
      : mime.includes('ogg') ? 'ogg'
      : 'webm';

    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), `audio.${ext}`);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');

    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || `Transcription failed (${r.status}).`;
      res.status(502).json({ error: msg });
      return;
    }
    res.status(200).json({ text: ((data && data.text) || '').trim() });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
