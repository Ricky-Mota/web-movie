// Traduction des phrases pour le doublage, avec un modèle de langue sur Groq.
// Reçoit : { target: "French", texts: ["...", "..."] }
// Renvoie : { t: ["...", "..."] }  (même nombre de phrases, même ordre)
const { json, guard, upstream } = require('../lib/common');

const MAX_ITEMS = 60;
const MAX_CHARS = 2000;

exports.handler = async (event) => {
  const g = guard(event, 'GROQ_API_KEY');
  if (g.res) return g.res;
  const { key, body } = g;

  const texts = Array.isArray(body.texts) ? body.texts.slice(0, MAX_ITEMS).map((x) => String(x).slice(0, MAX_CHARS)) : [];
  const target = String(body.target || '').replace(/[^\w ()\-]/g, '').slice(0, 60);
  if (!texts.length || !target) return json(400, { error: 'Textes ou langue cible manquants.' });

  const system =
    'You are a professional translator for video dubbing. Translate every item of the JSON array "items" into ' + target + '. ' +
    'Use natural spoken language that a voice actor can read aloud. Keep each translation close to the length of the original so it fits the same time slot. ' +
    'Keep names, numbers and technical terms accurate. Items are consecutive lines of the same video: keep the meaning consistent between them, but do not merge or split items. ' +
    'Answer ONLY with a JSON object of the form {"t": ["...", "..."]} containing exactly ' + texts.length + ' strings, in the same order.';

  const call = (model) => fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ items: texts }) }
      ]
    })
  });

  try {
    let model = process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile';
    let r = await call(model);
    let d = await r.json().catch(() => ({}));
    // Quota du JOUR épuisé sur le meilleur modèle : on bascule sur le modèle léger
    // (quota bien plus large) au lieu de bloquer jusqu'au lendemain.
    const fallback = process.env.GROQ_FALLBACK_MODEL || 'llama-3.1-8b-instant';
    if (r.status === 429 && fallback !== 'none' && fallback !== model) {
      const msg = String((d.error && d.error.message) || '');
      const wait = parseFloat(r.headers.get('retry-after'));
      if (/per day|\bTPD\b|\bRPD\b/i.test(msg) || wait > 60) {
        model = fallback;
        r = await call(model);
        d = await r.json().catch(() => ({}));
      }
    }
    if (!r.ok) return upstream(r, d, 'Groq');

    let out;
    try { out = JSON.parse(d.choices[0].message.content); } catch (e) { return json(502, { error: 'Réponse de traduction illisible.', retrySmaller: true }); }
    const t = Array.isArray(out.t) ? out.t.map((x) => String(x == null ? '' : x)) : null;
    if (!t || t.length !== texts.length) return json(502, { error: 'Nombre de phrases traduites incorrect.', retrySmaller: true });
    return json(200, { t, model });
  } catch (e) {
    return json(502, { error: 'Groq injoignable : ' + e.message });
  }
};
