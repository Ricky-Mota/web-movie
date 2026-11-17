// Worker Cloudflare de G-Challenge : sert le site (dossier public/) et l'inscription à la bêta.
// La logique d'inscription est la même que pour Netlify et Cloudflare Pages.
import { traiter } from '../netlify/functions/inscription-beta.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/inscription-beta') {
      const texte = request.method === 'POST' ? await request.text() : '';
      const r = await traiter(request.method, texte, env.APPS_SCRIPT_URL);
      return new Response(r.body, {
        status: r.statusCode,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
      });
    }
    if (url.pathname.startsWith('/api/')) return new Response('{"message":"Adresse inconnue."}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    return env.ASSETS.fetch(request);
  },
};
