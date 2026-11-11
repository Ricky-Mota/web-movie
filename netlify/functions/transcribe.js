// Transcription (voix -> texte) avec Whisper sur Groq.
// Reçoit : { audio: "<WAV en base64>", language?: "fr" }
// Renvoie : { language, segments: [{ start, end, text }] }
const { json, guard, upstream } = require('../lib/common');

const MAX_B64 = 5.5 * 1024 * 1024; // Netlify refuse les requêtes de plus de 6 Mo

// Whisper « invente » parfois des phrases sur les silences ou la musique : on les écarte.
function looksLikeSilence(s) {
  const nsp = Number(s.no_speech_prob), lp = Number(s.avg_logprob);
  if (!Number.isFinite(nsp)) return false;
  return nsp > 0.8 || (nsp > 0.5 && Number.isFinite(lp) && lp < -1);
}

exports.handler = async (event) => {
  const g = guard(event, 'GROQ_API_KEY');
  if (g.res) return g.res;
  const { key, body } = g;
  if (!body.audio || typeof body.audio !== 'string') return json(400, { error: 'Aucun audio reçu.' });
  if (body.audio.length > MAX_B64) return json(413, { error: 'Extrait audio trop lourd.' });

  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from(body.audio, 'base64')], { type: 'audio/wav' }), 'extrait.wav');
  fd.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
  fd.append('response_format', 'verbose_json');
  fd.append('temperature', '0');
  if (body.language && /^[a-z]{2,3}$/.test(body.language)) fd.append('language', body.language);

  try {
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: fd
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return upstream(r, d, 'Groq');
    const segments = (d.segments || [])
      .filter((s) => !looksLikeSilence(s))
      .map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() }))
      .filter((s) => s.text);
    return json(200, { language: d.language || null, segments });
  } catch (e) {
    return json(502, { error: 'Groq injoignable : ' + e.message });
  }
};
