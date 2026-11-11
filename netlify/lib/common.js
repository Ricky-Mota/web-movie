// Outils partagés par toutes les fonctions Netlify du studio.
const crypto = require('crypto');

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

// Mot de passe facultatif (variable STUDIO_PASSWORD) : sans lui, n'importe qui
// connaissant l'adresse du site pourrait consommer tes quotas Groq et Google.
function passOk(event) {
  const pw = process.env.STUDIO_PASSWORD;
  if (!pw) return true;
  const got = String((event.headers || {})['x-studio-pass'] || '');
  const a = crypto.createHash('sha256').update(pw).digest();
  const b = crypto.createHash('sha256').update(got).digest();
  return crypto.timingSafeEqual(a, b);
}

// Vérifications communes : méthode, mot de passe, clé API, corps JSON.
// Renvoie { res } (réponse d'erreur à renvoyer) ou { key, body }.
function guard(event, envKey) {
  if (event.httpMethod !== 'POST') return { res: json(405, { error: 'Méthode POST attendue.' }) };
  if (!passOk(event)) return { res: json(401, { error: 'Mot de passe du studio incorrect.', auth: true }) };
  const key = process.env[envKey];
  if (!key) return { res: json(500, { error: envKey + ' manquante dans les variables Netlify.', missingKey: true }) };
  try {
    return { key, body: JSON.parse(event.body || '{}') };
  } catch (e) {
    return { res: json(400, { error: 'Corps JSON invalide.' }) };
  }
}

// Transmet une erreur d'un service externe en gardant le délai d'attente conseillé (quota dépassé).
function upstream(r, d, label) {
  const ra = parseFloat(r.headers.get('retry-after'));
  return json(r.status, {
    error: (d && d.error && d.error.message) || (label + ' : erreur ' + r.status),
    retryAfter: Number.isFinite(ra) ? Math.min(ra, 120) : undefined
  });
}

module.exports = { json, passOk, guard, upstream };
