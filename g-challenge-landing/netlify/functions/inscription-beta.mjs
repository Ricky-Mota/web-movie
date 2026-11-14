// Reçoit une inscription à la bêta depuis la landing page, la vérifie,
// puis l'ajoute au Google Sheet « G-Challenge – Inscriptions bêta »
// via le petit script Apps Script du dossier apps-script/.
// Le CRM importe ensuite ces lignes avec son bouton « Importer les inscriptions bêta ».
//
// Variables d'environnement (Netlify > Site configuration > Environment variables) :
//   APPS_SCRIPT_URL    adresse de l'application Web Apps Script (se termine par /exec)
//   APPS_SCRIPT_JETON  le même mot secret que dans les propriétés du script

const PLATEFORMES = ['Android', 'iOS', 'PC'];

function reponse(statut, corps) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function verifier(d) {
  const telephone = String(d.telephone || '').replace(/[\s.\-()]/g, '');
  if (!/^\+\d{8,15}$/.test(telephone)) return { erreur: 'Numéro invalide. Exemple : +243 81 234 5678.' };
  const pseudo = String(d.pseudo || '').trim().slice(0, 20).replace(/[^\p{L}\p{N}_.\- ]/gu, '');
  const plateforme = PLATEFORMES.includes(d.plateforme) ? d.plateforme : 'Android';
  const source = String(d.source || 'landing').trim().slice(0, 40).replace(/[^\p{L}\p{N}_.\-]/gu, '') || 'landing';
  return { telephone, pseudo, plateforme, source };
}

export default async (req) => {
  if (req.method !== 'POST') return reponse(405, { message: 'Méthode non autorisée.' });

  let d;
  try { d = await req.json(); } catch { return reponse(400, { message: 'Demande illisible.' }); }

  // Robots : le champ caché est rempli, ou le formulaire est envoyé en moins de 2 secondes.
  // On répond « succès » sans rien enregistrer, pour ne pas les renseigner.
  if (d.site_web || Number(d.delai_ms) < 2000) return reponse(200, { statut: 'inscrit' });

  const v = verifier(d);
  if (v.erreur) return reponse(400, { message: v.erreur });

  const url = process.env.APPS_SCRIPT_URL;
  const jeton = process.env.APPS_SCRIPT_JETON;
  if (!url || !jeton) {
    console.error('APPS_SCRIPT_URL ou APPS_SCRIPT_JETON manquant');
    return reponse(503, { message: 'Inscriptions momentanément fermées. Réessayez plus tard.' });
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton, date: new Date().toISOString().slice(0, 10), ...v }),
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json().catch(() => ({}));
    if (j.statut === 'inscrit' || j.statut === 'deja_inscrit') return reponse(200, { statut: j.statut });
    console.error('Réponse Apps Script inattendue', r.status, j);
  } catch (e) {
    console.error('Apps Script injoignable', e);
  }
  return reponse(502, { message: 'L\'inscription a échoué. Réessayez dans un instant.' });
};

export const config = { path: '/api/inscription-beta' };
