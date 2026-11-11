// Voix (texte -> MP3) avec Google Cloud Text-to-Speech.
// Reçoit : { lang: "fr-FR", items: [{ text, rate }] }
// Renvoie : { audio: ["<MP3 base64>" | null, ...], errors: [null | "message", ...] }
//
// Option : variable GOOGLE_TTS_VOICES = {"fr-FR":"fr-FR-Neural2-A","en-US":"en-US-Neural2-D"}
// pour choisir des voix précises. Sans elle, Google prend sa voix par défaut pour la langue.
const { json, guard } = require('../lib/common');

let VOICES = {};
try { VOICES = JSON.parse(process.env.GOOGLE_TTS_VOICES || '{}'); } catch (e) { VOICES = {}; }

// Google limite chaque demande à 5000 octets (pas caractères : l'arabe ou le chinois comptent double ou triple).
function clip(text, maxBytes) {
  let out = '';
  for (const ch of text) {
    if (Buffer.byteLength(out + ch) > maxBytes) break;
    out += ch;
  }
  return out;
}

async function synth(key, lang, text, rate) {
  const voice = { languageCode: lang };
  if (VOICES[lang]) voice.name = VOICES[lang];
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify({
      input: { text },
      voice,
      audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, speakingRate: Math.min(2, Math.max(0.5, Number(rate) || 1)) }
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((d.error && d.error.message) || ('Erreur Google ' + r.status));
    err.status = r.status;
    throw err;
  }
  return d.audioContent;
}

exports.handler = async (event) => {
  const g = guard(event, 'GOOGLE_TTS_API_KEY');
  if (g.res) return g.res;
  const { key, body } = g;

  const lang = String(body.lang || '');
  const items = Array.isArray(body.items) ? body.items.slice(0, 8) : [];
  if (!/^[a-z]{2,3}-[A-Z]{2}$/.test(lang) || !items.length) return json(400, { error: 'Langue ou textes manquants.' });

  const results = await Promise.all(items.map(async (it) => {
    const text = clip(String((it && it.text) || '').trim(), 4800);
    if (!text) return { audio: null, error: null };
    try { return { audio: await synth(key, lang, text, it.rate), error: null }; }
    catch (e) { return { audio: null, error: e.message, status: e.status }; }
  }));

  const ok = results.some((r) => r.audio);
  const first = results.find((r) => r.error);
  if (!ok && first) {
    // Quota dépassé : le studio réessaiera plus tard.
    if (first.status === 429) return json(429, { error: first.error, retryAfter: 20 });
    // Clé refusée ou API non activée : inutile de réessayer.
    if (first.status === 401 || first.status === 403) return json(403, { error: 'Google refuse la clé : ' + first.error });
    // Sinon, la langue n'est sans doute pas disponible : on le signale clairement.
    return json(502, { error: first.error, voiceUnavailable: first.status === 400 || first.status === 404 });
  }

  return json(200, { audio: results.map((r) => r.audio), errors: results.map((r) => r.error) });
};
