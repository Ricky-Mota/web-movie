// Voix (texte -> MP3).
// Fournisseur : ElevenLabs si ELEVENLABS_API_KEY est définie (sans carte bancaire), sinon Google Cloud Text-to-Speech.
// Reçoit : { lang: "fr-FR", items: [{ text, rate }] }
// Renvoie : { audio: ["<MP3 base64>" | null, ...], errors: [null | "message", ...] }
//
// Options :
//   ELEVENLABS_VOICE_ID = identifiant de la voix ElevenLabs (par défaut : une voix multilingue prédéfinie)
//   ELEVENLABS_VOICES   = {"fr":"<voice_id>","en":"<voice_id>"} pour choisir une voix par langue
//   ELEVENLABS_MODEL    = modèle ElevenLabs (par défaut eleven_flash_v2_5 : rapide et 2× moins de crédits)
//   GOOGLE_TTS_VOICES   = {"fr-FR":"fr-FR-Neural2-A"} pour choisir des voix Google précises
const { json, passOk } = require('../lib/common');

const parse = (s) => { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } };
const GOOGLE_VOICES = parse(process.env.GOOGLE_TTS_VOICES);
const ELEVEN_VOICES = parse(process.env.ELEVENLABS_VOICES);
const ELEVEN_DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';

// Code de langue court attendu par ElevenLabs (fr-FR -> fr, cmn-CN -> zh).
const shortLang = (lang) => (lang.startsWith('cmn') ? 'zh' : lang.split('-')[0]);

// Les deux services limitent la longueur d'une demande (en octets pour Google).
function clip(text, maxBytes) {
  let out = '';
  for (const ch of text) {
    if (Buffer.byteLength(out + ch) > maxBytes) break;
    out += ch;
  }
  return out;
}

function fail(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function synthGoogle(key, lang, text, rate) {
  const voice = { languageCode: lang };
  if (GOOGLE_VOICES[lang]) voice.name = GOOGLE_VOICES[lang];
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
  if (!r.ok) throw fail((d.error && d.error.message) || ('Erreur Google ' + r.status), r.status === 400 ? 'lang' : r.status);
  return d.audioContent;
}

async function synthEleven(key, lang, text, rate) {
  const code = shortLang(lang);
  const voiceId = ELEVEN_VOICES[code] || ELEVEN_VOICES[lang] || ELEVEN_DEFAULT_VOICE;
  const body = {
    text,
    model_id: ELEVEN_MODEL,
    // ElevenLabs accepte une vitesse de 0,7 à 1,2.
    voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: Math.min(1.2, Math.max(0.7, Number(rate) || 1)) }
  };
  if (/flash|turbo/.test(ELEVEN_MODEL)) body.language_code = code; // force la bonne langue (prononciation)
  const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=mp3_22050_32', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': key, Accept: 'audio/mpeg' },
    body: JSON.stringify(body)
  });
  if (r.ok) return Buffer.from(await r.arrayBuffer()).toString('base64');
  const d = await r.json().catch(() => ({}));
  const det = d.detail || {};
  const status = String(det.status || det.code || '');
  const msg = det.message || (typeof d.detail === 'string' ? d.detail : '') || ('Erreur ElevenLabs ' + r.status);
  if (status === 'quota_exceeded') throw fail('Crédits ElevenLabs épuisés pour ce mois-ci.', 'quota');
  if (r.status === 429) throw fail(msg, 429);
  if (r.status === 401 || r.status === 403) throw fail(msg, 401);
  if ((r.status === 400 || r.status === 422) && /language/i.test(msg + status)) throw fail(msg, 'lang');
  throw fail(msg, r.status);
}

// Exécute au plus n tâches en même temps (la formule gratuite d'ElevenLabs en accepte 2).
async function limit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Méthode POST attendue.' });
  if (!passOk(event)) return json(401, { error: 'Mot de passe du studio incorrect.', auth: true });

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const googleKey = process.env.GOOGLE_TTS_API_KEY;
  if (!elevenKey && !googleKey) return json(500, { error: 'Aucune clé de voix : ajoute ELEVENLABS_API_KEY dans les variables Netlify.', missingKey: true });
  const provider = elevenKey ? 'ElevenLabs' : 'Google';

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Corps JSON invalide.' }); }
  const lang = String(body.lang || '');
  const items = Array.isArray(body.items) ? body.items.slice(0, 8) : [];
  if (!/^[a-z]{2,3}-[A-Z]{2}$/.test(lang) || !items.length) return json(400, { error: 'Langue ou textes manquants.' });

  const results = await limit(items, elevenKey ? 2 : 6, async (it) => {
    const text = clip(String((it && it.text) || '').trim(), elevenKey ? 2500 : 4800);
    if (!text) return { audio: null, error: null };
    try {
      const audio = elevenKey ? await synthEleven(elevenKey, lang, text, it.rate) : await synthGoogle(googleKey, lang, text, it.rate);
      return { audio, error: null };
    } catch (e) { return { audio: null, error: e.message, status: e.status }; }
  });

  const ok = results.some((r) => r.audio);
  const first = results.find((r) => r.error);
  if (!ok && first) {
    // Trop de demandes en même temps : le studio réessaiera un peu plus tard.
    if (first.status === 429) return json(429, { error: first.error, retryAfter: 5 });
    // Crédits épuisés, clé refusée ou API non activée : inutile de réessayer.
    if (first.status === 'quota') return json(402, { error: first.error });
    if (first.status === 401 || first.status === 403) return json(403, { error: provider + ' refuse la clé : ' + first.error });
    // Langue non prise en charge : le studio passe en sous-titres.
    return json(502, { error: first.error, voiceUnavailable: first.status === 'lang' || first.status === 404 });
  }

  return json(200, { audio: results.map((r) => r.audio), errors: results.map((r) => r.error), provider });
};
