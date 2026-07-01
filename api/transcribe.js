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

const { readJson, getUser } = require('./_shared');

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

  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to use the voice assistant.' });
    return;
  }

  try {
    const body = await readJson(req, 9000000); // audio base64 can be several MB
    const b64 = body.audio;
    // Validate mime against an allowlist rather than forwarding an arbitrary
    // client string to Groq's multipart request.
    const rawMime = typeof body.mime === 'string' ? body.mime : '';
    const mime = /^audio\/(webm|mp4|mpeg|mp3|wav|ogg|m4a|x-m4a)$/.test(rawMime) ? rawMime : 'audio/webm';
    if (!b64) {
      res.status(400).json({ error: 'No audio received.' });
      return;
    }
    // ~8M base64 chars ≈ 6MB of audio — reject larger before decoding.
    if (b64.length > 8000000) {
      res.status(413).json({ error: 'That recording is too long. Try a shorter clip.' });
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
      signal: AbortSignal.timeout(30000),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      // Log upstream detail server-side; return a fixed message so Groq's error
      // strings (model/account/rate-limit state) don't reach the client.
      console.error('transcribe upstream error:', r.status, data && data.error && data.error.message);
      res.status(502).json({ error: 'Transcription failed — please try again.' });
      return;
    }
    res.status(200).json({ text: ((data && data.text) || '').trim() });
  } catch (e) {
    // Don't leak internal error strings to the client.
    if (e && e.statusCode === 413) {
      res.status(413).json({ error: 'That recording is too large.' });
      return;
    }
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      res.status(504).json({ error: 'Transcription took too long — please try a shorter clip.' });
      return;
    }
    console.error('transcribe error:', e);
    res.status(500).json({ error: 'Something went wrong transcribing that.' });
  }
};
