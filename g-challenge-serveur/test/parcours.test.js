// Test de bout en bout, contre une vraie base PostgreSQL (vidée à chaque lancement).
// Base utilisée : TEST_DATABASE_URL, ou postgresql://gc:gc@localhost:5432/gchallenge_test
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://gc:gc@localhost:5432/gchallenge_test';
process.env.JWT_SECRET = 'cle-de-test-cle-de-test-cle-de-test-0123456789';
process.env.FOURNISSEUR_FORCE = 'simulation';

const { test, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { createServer } = await import('node:http');
const { io: clientSocket } = await import('socket.io-client');
const { pool, requete } = await import('../src/db.js');
const { migrer } = await import('../src/migrations.js');
const { creerApp } = await import('../src/app.js');
const { demarrerTempsReel } = await import('../src/temps-reel.js');
const { attendreExecutions, traiterDelais } = await import('../src/domaine/duels.js');
const { CIRCUIT_TEST, trajetDroit } = await import('./trajets.js');

let serveur;
let base;
const sockets = [];

before(async () => {
  await requete('DROP SCHEMA IF EXISTS gchallenge CASCADE');
  await migrer();
  serveur = createServer(creerApp({ limiteConnexions: 1000 }));
  demarrerTempsReel(serveur);
  await new Promise((r) => serveur.listen(0, r));
  base = `http://localhost:${serveur.address().port}`;
});

after(async () => {
  sockets.forEach((s) => s.close());
  await attendreExecutions();
  await new Promise((r) => serveur.close(r));
  await pool.end();
});

async function api(methode, chemin, { jeton, corps } = {}) {
  const r = await fetch(base + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  return { statut: r.status, json: await r.json() };
}

async function inscrire(pseudo, telephone, pays = 'CD') {
  const r = await api('POST', '/joueurs/inscription', { corps: { pseudo, telephone, pays, mot_de_passe: 'motdepasse123' } });
  assert.equal(r.statut, 201, JSON.stringify(r.json));
  return { ...r.json.joueur, jeton: r.json.jeton };
}

/** Prend le départ d'un duel, fait comme si `tempsMs` s'étaient écoulés, puis envoie la course. */
async function courirDuel(joueur, duelId, tempsMs) {
  assert.equal((await api('POST', `/duels/${duelId}/depart`, { jeton: joueur.jeton })).statut, 200);
  await requete(
    `UPDATE gchallenge.duel_departs SET depart_le = now() - make_interval(secs => $3)
      WHERE duel_id = $1 AND joueur_id = $2`, [duelId, joueur.id, tempsMs / 1000 + 1]);
  return api('POST', '/courses', {
    jeton: joueur.jeton,
    corps: { circuit: CIRCUIT_TEST.code, duel_id: duelId, temps_ms: tempsMs, intervalle_ms: 50, trajet: trajetDroit({ tempsMs }) },
  });
}

const J = {};

test('inscription, connexion et règles par pays', async () => {
  J.ali = await inscrire('Ali', '243810000001');
  J.bea = await inscrire('Bea', '243810000002');
  J.chris = await inscrire('Chris', '243810000003');
  J.dido = await inscrire('Dido', '+243 81 000 0004');
  J.sami = await inscrire('Sami', '966500000001', 'SA');

  const mauvaisIndicatif = await api('POST', '/joueurs/inscription', {
    corps: { pseudo: 'Zed', telephone: '260970000001', pays: 'CD', mot_de_passe: 'motdepasse123' } });
  assert.equal(mauvaisIndicatif.json.erreur.code, 'telephone_pays');

  const doublon = await api('POST', '/joueurs/inscription', {
    corps: { pseudo: 'ali', telephone: '243810000099', pays: 'CD', mot_de_passe: 'motdepasse123' } });
  assert.equal(doublon.statut, 409);

  const connexion = await api('POST', '/joueurs/connexion', { corps: { identifiant: '243810000004', mot_de_passe: 'motdepasse123' } });
  assert.equal(connexion.json.joueur.pseudo, 'Dido');
  const moi = await api('GET', '/joueurs/moi', { jeton: J.sami.jeton });
  assert.deepEqual([moi.json.devise, moi.json.mises_autorisees, moi.json.langue], ['SAR', false, 'ar']);
});

test("l'administrateur crée le circuit", async () => {
  await requete(`UPDATE gchallenge.joueurs SET role = 'admin' WHERE id = $1`, [J.ali.id]);
  const jeton = (await api('POST', '/joueurs/connexion', { corps: { identifiant: 'Ali', mot_de_passe: 'motdepasse123' } })).json.jeton;
  J.ali.jeton = jeton;
  const { code, ...corps } = CIRCUIT_TEST;
  const r = await api('PUT', `/admin/circuits/${code}`, { jeton, corps });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
  assert.equal((await api('PUT', `/admin/circuits/${code}`, { jeton: J.bea.jeton, corps })).statut, 403);
});

test('équipes : code d\'invitation, ajout par pseudo, équipe pleine', async () => {
  const a = await api('POST', '/equipes', { jeton: J.ali.jeton, corps: { nom: 'Les Ketch de Gombe', taille_max: 2 } });
  assert.equal(a.statut, 201);
  J.equipeA = a.json;
  const rejoint = await api('POST', '/equipes/rejoindre', { jeton: J.bea.jeton, corps: { code: a.json.code_invitation.toLowerCase() } });
  assert.equal(rejoint.json.membres.length, 2);
  const pleine = await api('POST', '/equipes/rejoindre', { jeton: J.chris.jeton, corps: { code: a.json.code_invitation } });
  assert.equal(pleine.json.erreur.code, 'equipe_pleine');

  const b = await api('POST', '/equipes', { jeton: J.chris.jeton, corps: { nom: 'Bana Lemba', taille_max: 2 } });
  J.equipeB = b.json;
  const ajout = await api('POST', `/equipes/${b.json.id}/membres`, { jeton: J.chris.jeton, corps: { pseudo: 'dido' } });
  assert.equal(ajout.statut, 201);
  assert.deepEqual(ajout.json.membres.map((m) => m.pseudo), ['Chris', 'Dido']);
  const pasCapitaine = await api('POST', `/equipes/${b.json.id}/membres`, { jeton: J.dido.jeton, corps: { pseudo: 'Sami' } });
  assert.equal(pasCapitaine.statut, 403);
});

test("Arabie saoudite : duel avec mise refusé, duel gratuit accepté", async () => {
  const paye = await api('POST', '/duels', { jeton: J.sami.jeton, corps: { circuit: CIRCUIT_TEST.code, taille: 1, mise_centimes: 500 } });
  assert.equal(paye.json.erreur.code, 'mises_interdites_pays');
  const gratuit = await api('POST', '/duels', { jeton: J.sami.jeton, corps: { circuit: CIRCUIT_TEST.code, taille: 1, mise_centimes: 0 } });
  assert.equal(gratuit.statut, 201);
  assert.equal(gratuit.json.statut, 'ouvert');
});

test('duel 2v2 à 10 $ : paiements, Feu Vert, courses, gains de 7,50 $ par gagnant', async () => {
  const cree = await api('POST', '/duels', {
    jeton: J.ali.jeton, corps: { circuit: CIRCUIT_TEST.code, taille: 2, mise_centimes: 1000, equipe_id: J.equipeA.id } });
  assert.equal(cree.statut, 201, JSON.stringify(cree.json));
  const duelId = cree.json.id;

  // Bea écoute le Feu Vert en direct.
  const socket = clientSocket(base, { auth: { token: J.bea.jeton }, transports: ['websocket'] });
  sockets.push(socket);
  const feuVert = new Promise((r) => socket.on('duel:feu_vert', r));
  await new Promise((r) => socket.on('connect', r));
  // Chris se connecte comme le fait Unreal : jeton dans l'adresse.
  const socketChris = clientSocket(base, { query: { token: J.chris.jeton }, transports: ['websocket'] });
  sockets.push(socketChris);
  const feuVertChris = new Promise((r) => socketChris.on('duel:feu_vert', r));
  await new Promise((r) => socketChris.on('connect', r));

  const ouverts = await api('GET', '/duels/ouverts?taille=2', { jeton: J.chris.jeton });
  assert.ok(ouverts.json.some((d) => d.id === duelId));

  const rejoint = await api('POST', `/duels/${duelId}/rejoindre`, { jeton: J.chris.jeton, corps: { equipe_id: J.equipeB.id } });
  assert.equal(rejoint.json.statut, 'paiement');

  assert.equal((await api('POST', `/duels/${duelId}/payer`, { jeton: J.bea.jeton })).statut, 403); // pas capitaine
  assert.equal((await api('POST', `/duels/${duelId}/payer`, { jeton: J.ali.jeton })).statut, 202);
  await attendreExecutions();
  assert.equal((await api('POST', `/duels/${duelId}/payer`, { jeton: J.ali.jeton })).json.erreur.code, 'deja_payee');
  assert.equal((await api('POST', `/duels/${duelId}/payer`, { jeton: J.chris.jeton })).statut, 202);
  await attendreExecutions();

  const evenement = await feuVert;
  assert.equal(evenement.statut, 'en_cours');
  assert.equal((await feuVertChris).id, duelId);

  // Envoyer une course sans avoir pris le départ est refusé.
  const sansDepart = await api('POST', '/courses', { jeton: J.ali.jeton, corps: {
    circuit: CIRCUIT_TEST.code, duel_id: duelId, temps_ms: 40000, intervalle_ms: 50, trajet: trajetDroit({ tempsMs: 40000 }) } });
  assert.equal(sansDepart.json.erreur.code, 'pas_de_depart');

  // Équipe A : 40 s + 40 s = 80 s. Équipe B : 40 s + 41 s = 81 s.
  assert.equal((await courirDuel(J.ali, duelId, 40000)).json.valide, true);
  assert.equal((await courirDuel(J.chris, duelId, 40000)).json.valide, true);
  const fantome = await api('GET', `/duels/${duelId}/fantome-adverse`, { jeton: J.dido.jeton });
  assert.equal(fantome.json.pseudo, 'Ali');
  assert.equal((await courirDuel(J.bea, duelId, 40000)).json.valide, true);
  const deuxieme = await api('POST', `/duels/${duelId}/depart`, { jeton: J.bea.jeton });
  assert.equal(deuxieme.json.erreur.code, 'deja_parti');
  assert.equal((await courirDuel(J.dido, duelId, 41000)).json.valide, true);
  await attendreExecutions();

  const fin = await api('GET', `/duels/${duelId}`, { jeton: J.bea.jeton });
  assert.equal(fin.json.statut, 'termine');
  assert.equal(fin.json.resultat, 'victoire');
  assert.equal(fin.json.gagnant_id, J.equipeA.id);
  assert.equal(fin.json.commission_centimes, 500);
  const gainBea = fin.json.mes_paiements.find((p) => p.sens === 'versement');
  assert.deepEqual([gainBea.montant_centimes, gainBea.statut], [750, 'reussi']);
  const { rows } = await requete(
    `SELECT sum(montant_centimes)::int AS total FROM gchallenge.paiements WHERE duel_id = $1 AND sens = 'versement'`, [duelId]);
  assert.equal(rows[0].total, 1500);
});

test('classement et fantôme du record', async () => {
  const c = await api('GET', `/circuits/${CIRCUIT_TEST.code}/classement`);
  assert.deepEqual(c.json.map((l) => [l.rang, l.temps_ms]), [[1, 40000], [1, 40000], [1, 40000], [4, 41000]]);
  const national = await api('GET', `/circuits/${CIRCUIT_TEST.code}/classement?pays=sa`);
  assert.deepEqual(national.json, []);
  const f = await api('GET', `/circuits/${CIRCUIT_TEST.code}/fantome`);
  assert.equal(f.json.trajet.length, trajetDroit({ tempsMs: 40000 }).length);
});

test("course d'entraînement truquée : enregistrée mais rejetée", async () => {
  const r = await api('POST', '/courses', { jeton: J.sami.jeton, corps: {
    circuit: CIRCUIT_TEST.code, temps_ms: 25000, intervalle_ms: 50, trajet: trajetDroit({ tempsMs: 40000 }) } });
  assert.equal(r.statut, 201);
  assert.deepEqual([r.json.valide, r.json.motif_rejet, r.json.rang], [false, 'temps_incoherent_avec_trajet', null]);
});

test('duel sans adversaire : annulé et remboursé au délai', async () => {
  const cree = await api('POST', '/duels', { jeton: J.dido.jeton, corps: { circuit: CIRCUIT_TEST.code, taille: 1, mise_centimes: 500 } });
  const duelId = cree.json.id;
  await api('POST', `/duels/${duelId}/payer`, { jeton: J.dido.jeton });
  await attendreExecutions();
  await requete(`UPDATE gchallenge.duels SET rejoindre_avant = now() - interval '1 minute' WHERE id = $1`, [duelId]);
  await traiterDelais();
  await attendreExecutions();
  const d = await api('GET', `/duels/${duelId}`, { jeton: J.dido.jeton });
  assert.equal(d.json.statut, 'annule');
  const remb = d.json.mes_paiements.find((p) => p.sens === 'remboursement');
  assert.deepEqual([remb.montant_centimes, remb.statut], [500, 'reussi']);
});

test('paiement refusé par le joueur : le duel reste en attente de sa mise', async () => {
  const pauvre = await inscrire('Eli', '243810000000'); // le simulateur refuse les numéros en ...000
  const cree = await api('POST', '/duels', { jeton: pauvre.jeton, corps: { circuit: CIRCUIT_TEST.code, taille: 1, mise_centimes: 500 } });
  await api('POST', `/duels/${cree.json.id}/payer`, { jeton: pauvre.jeton });
  await attendreExecutions();
  const d = await api('GET', `/duels/${cree.json.id}`, { jeton: pauvre.jeton });
  assert.equal(d.json.equipe_a_payee, false);
  assert.equal(d.json.mes_paiements[0].statut, 'echoue');
});

test('commission modifiable à tout moment, sans toucher aux duels déjà créés', async () => {
  assert.deepEqual((await api('GET', '/parametres')).json.commission_pourcent, 25);
  const avant = await api('POST', '/duels', { jeton: J.bea.jeton, corps: { circuit: CIRCUIT_TEST.code, taille: 1, mise_centimes: 0 } });
  assert.equal((await api('PUT', '/admin/parametres', { jeton: J.bea.jeton, corps: { commission_pourcent: 10 } })).statut, 403);
  assert.equal((await api('PUT', '/admin/parametres', { jeton: J.ali.jeton, corps: { commission_pourcent: 80 } })).statut, 400);
  const maj = await api('PUT', '/admin/parametres', { jeton: J.ali.jeton, corps: { commission_pourcent: 12.5 } });
  assert.equal(maj.json.commission_pourcent, 12.5);
  const apres = await api('POST', '/duels', { jeton: J.chris.jeton, corps: { circuit: CIRCUIT_TEST.code, taille: 1, mise_centimes: 0 } });
  assert.equal(apres.json.commission_pourcent, 12.5);
  assert.equal((await api('GET', `/duels/${avant.json.id}`, { jeton: J.bea.jeton })).json.commission_pourcent, 25);
  await api('PUT', '/admin/parametres', { jeton: J.ali.jeton, corps: { commission_pourcent: 25 } });
});

test('bilan administrateur', async () => {
  const b = await api('GET', '/admin/bilan', { jeton: J.ali.jeton });
  assert.deepEqual(b.json.commissions, [{ devise: 'USD', duels_payants: 1, commission_centimes: 500 }]);
});
