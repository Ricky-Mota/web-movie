// Version Cloudflare Pages de la fonction d'inscription (même logique que la version Netlify).
// Cloudflare sert ce fichier à l'adresse /api/inscription-beta.
// Réglage à ajouter dans Cloudflare : APPS_SCRIPT_URL (Settings > Variables and Secrets).
import { traiter } from '../../netlify/functions/inscription-beta.mjs';

export async function onRequest({ request, env }) {
  const texte = request.method === 'POST' ? await request.text() : '';
  const r = await traiter(request.method, texte, env.APPS_SCRIPT_URL);
  return new Response(r.body, {
    status: r.statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
