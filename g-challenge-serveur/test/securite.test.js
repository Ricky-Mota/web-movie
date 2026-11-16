// Tests de sécurité : comptes bloqués, rôle admin vérifié en base, sessions coupées, limites anti-abus.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://gc:gc@localhost:5432/gchallenge_test';
process.env.JWT_SECRET = 'cle-de-test-cle-de-test-cle-de-test-0123456789';
process.env.FOURNISSEUR_FORCE = 'simulation';

const { test, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { createServer } = await import('node:http');
const jwt = (await import('jsonwebtoken')).default;
const { pool, requete } = await import('../src/db.js');
const { migrer } = await import('../src/migrations.js');
const { creerApp } = await import('../src/app.js');

let serveur, base;
before(async () => {
  await requete('DROP SCHEMA IF EXISTS gchallenge CASCADE');
  await migrer();
  serveur = createServer(creerApp({ limiteConnexions: 1000, limiteGlobale: 100000, limiteCourses: 100000 }));
  await new Promise((r) => serveur.listen(0, r));
  base = `http://localhost:${serveur.address().port}`;
});
after(async () => { await new Promise((r) => serveur.close(r)); await pool.end(); });

async function api(methode, chemin, { jeton, corps, brut } = {}, url = base) {
  const r = await fetch(url + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: brut ?? (corps ? JSON.stringify(corps) : undefined),
  });
  return { statut: r.status, json: await r.json().catch(() => null) };
}
let n = 0;
async function inscrire(pseudo) {
  n += 1;
  const r = await api('POST', '/joueurs/inscription', { corps: { pseudo, telephone: '24399' + String(n).padStart(7, '0'), pays: 'CD', mot_de_passe: 'motdepasse123' } });
  assert.equal(r.statut, 201, JSON.stringify(r.json));
  return { ...r.json.joueur, jeton: r.json.jeton };
}

test('un jeton fabriqué avec role=admin ne donne pas les droits administrateur', async () => {
  const j = await inscrire('Malin');
  const faux = jwt.sign({ sub: j.id, role: 'admin' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  assert.equal((await api('GET', '/admin/tournois', { jeton: faux })).statut, 403);
  const autreCle = jwt.sign({ sub: j.id, role: 'admin' }, 'une-autre-cle-une-autre-cle-une-autre-cle', { algorithm: 'HS256' });
  assert.equal((await api('GET', '/admin/tournois', { jeton: autreCle })).statut, 401);
  const sansSignature = jwt.sign({ sub: j.id, role: 'admin' }, null, { algorithm: 'none' });
  assert.equal((await api('GET', '/joueurs/moi', { jeton: sansSignature })).statut, 401);
});

test('un administrateur rétrogradé perd ses droits tout de suite', async () => {
  const a = await inscrire('Chef');
  await requete(`UPDATE gchallenge.joueurs SET role = 'admin' WHERE id = $1`, [a.id]);
  assert.equal((await api('GET', '/admin/tournois', { jeton: a.jeton })).statut, 200);
  await requete(`UPDATE gchallenge.joueurs SET role = 'joueur' WHERE id = $1`, [a.id]);
  assert.equal((await api('GET', '/admin/tournois', { jeton: a.jeton })).statut, 403);
});

test('bloquer un tricheur : session coupée, connexion refusée, journal admin', async () => {
  const admin = await inscrire('Arbitre');
  await requete(`UPDATE gchallenge.joueurs SET role = 'admin' WHERE id = $1`, [admin.id]);
  const t = await inscrire('Tricheur');
  assert.equal((await api('GET', '/joueurs/moi', { jeton: t.jeton })).statut, 200);
  const r = await api('POST', `/admin/joueurs/${t.id}/bloquer`, { jeton: admin.jeton, corps: { bloque: true, motif: 'trajet truqué' } });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
  assert.equal((await api('GET', '/joueurs/moi', { jeton: t.jeton })).statut, 403);
  const c = await api('POST', '/joueurs/connexion', { corps: { identifiant: 'Tricheur', mot_de_passe: 'motdepasse123' } });
  assert.equal(c.json.erreur.code, 'compte_bloque');
  assert.equal((await api('POST', `/admin/joueurs/${admin.id}/bloquer`, { jeton: admin.jeton, corps: { bloque: true } })).statut, 409);
  // Débloqué : il doit se reconnecter (l'ancienne session reste coupée).
  await api('POST', `/admin/joueurs/${t.id}/bloquer`, { jeton: admin.jeton, corps: { bloque: false } });
  assert.equal((await api('GET', '/joueurs/moi', { jeton: t.jeton })).statut, 401);
  const { rows } = await requete('SELECT action FROM gchallenge.journal_admin WHERE admin_id = $1', [admin.id]);
  assert.ok(rows.length >= 2 && rows.every((l) => l.action.includes('/bloquer')));
  const recherche = await api('GET', '/admin/joueurs?q=tric', { jeton: admin.jeton });
  assert.equal(recherche.json[0].pseudo, 'Tricheur');
});

test('mot de passe faux et pseudo inconnu : même réponse', async () => {
  await inscrire('Discret');
  const a = await api('POST', '/joueurs/connexion', { corps: { identifiant: 'Discret', mot_de_passe: 'mauvais-mdp' } });
  const b = await api('POST', '/joueurs/connexion', { corps: { identifiant: 'Inconnu404', mot_de_passe: 'mauvais-mdp' } });
  assert.deepEqual([a.statut, a.json], [b.statut, b.json]);
});

test('anti-abus : corps trop gros refusé, trop de requêtes freinées', async () => {
  const j = await inscrire('Gros');
  const gros = JSON.stringify({ nom: 'x'.repeat(200_000), taille_max: 3 });
  assert.equal((await api('POST', '/equipes', { jeton: j.jeton, brut: gros })).statut, 413);

  const petit = createServer(creerApp({ limiteGlobale: 5 }));
  await new Promise((r) => petit.listen(0, r));
  const url = `http://localhost:${petit.address().port}`;
  const statuts = [];
  for (let i = 0; i < 7; i++) statuts.push((await api('GET', '/pays', {}, url)).statut);
  await new Promise((r) => petit.close(r));
  assert.deepEqual(statuts.slice(0, 5), [200, 200, 200, 200, 200]);
  assert.equal(statuts[6], 429);
});
