// Indique au studio quelles clés sont configurées (sans jamais les révéler)
// et si le mot de passe envoyé est le bon.
const { json, passOk } = require('../lib/common');

exports.handler = async (event) => {
  const eleven = Boolean(process.env.ELEVENLABS_API_KEY);
  const google = Boolean(process.env.GOOGLE_TTS_API_KEY);
  return json(200, {
    groq: Boolean(process.env.GROQ_API_KEY),
    voice: eleven || google,
    voiceProvider: eleven ? 'elevenlabs' : google ? 'google' : null,
    google, // compatibilité
    locked: Boolean(process.env.STUDIO_PASSWORD),
    authed: passOk(event)
  });
};
