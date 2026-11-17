// Invitations automatiques au Tournoi Sponsor : joueurs réguliers invités, acceptation,
// programme avec jours et heures, rappel la veille de chaque semaine (dans le jeu et par SMS).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://gc:gc@localhost:5432/gchallenge_test';
process.env.JWT_SECRET = 'cle-de-test-cle-de-test-cle-de-test-0123456789';
process.env.FOURNISSEUR_FORCE = 'simulation';

const { test, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { createServer } = await import('node:http');
const { pool, requete } = await import('../src/db.js');
const { migrer } = await import('../src/migrations.js');
const { creerApp } = await import('../src/app.js');
const { envoyerRappels, traiterInvitations, dateKin } = await import('../src/domaine/invitations.js');
const { _derniersCodes } = await import('../src/sms/index.js');
const { CIRCUIT_TEST } = await import('./trajets.js');

let serveur, base;
before(async () => {
  await requete('DROP SCHEMA IF EXISTS gchallenge CASCADE');
  await migrer();
  serveur = createServer(creerApp({ limiteConnexions: 1000, limiteGlobale: 100000, limiteCourses: 100000 }));
  await new Promise((r) => serveur.listen(0, r));
  base = `http://localhost:${serveur.address().port}`;
});
after(async () => { await new Promise((r) => serveur.close(r)); await pool.end(); });

async function api(methode, chemin, { jeton, corps } = {}) {
  const r = await fetch(base + chemin, { method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps ? JSON.stringify(corps) : undefined });
  return { statut: r.status, json: await r.json() };
}
let n = 0;
async function inscrire(pseudo, pays = 'CD') {
  n += 1;
  const indicatif = { CD: '24381', ZM: '26097' }[pays];
  const r = await api('POST', '/joueurs/inscription', { corps: { pseudo, telephone: indicatif + String(n).padStart(7, '0'), pays, mot_de_passe: 'motdepasse123' } });
  assert.equal(r.statut, 201, JSON.stringify(r.json));
  return { ...r.json.joueur, jeton: r.json.jeton };
}
let circuitId;
/** Une course valide il y a `joursAvant` jours. */
async function courseIlYA(joueur, joursAvant, valide = true) {
  await requete(
    `INSERT INTO gchallenge.courses (joueur_id, circuit_id, temps_ms, intervalle_ms, trajet, valide, cree_le)
     VALUES ($1, $2, 60000, 50, '[]', $3, now() - make_interval(days => $4))`, [joueur.id, circuitId, valide, joursAvant]);
}
function lundiProchain() {
  const kin = new Date(Date.now() + 3600 * 1000), jour = (kin.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(kin.getUTCFullYear(), kin.getUTCMonth(), kin.getUTCDate() - jour + 7)).toISOString().slice(0, 10);
}

const J = {};
let champ;

test('préparation : administrateur, circuit, joueurs plus ou moins réguliers', async () => {
  J.admin = await inscrire('Organisateur');
  await requete(`UPDATE gchallenge.joueurs SET role = 'admin' WHERE id = $1`, [J.admin.id]);
  const { code, ...corps } = CIRCUIT_TEST;
  assert.equal((await api('PUT', `/admin/circuits/${code}`, { jeton: J.admin.jeton, corps })).statut, 200);
  circuitId = (await requete('SELECT id FROM gchallenge.circuits WHERE code = $1', [code])).rows[0].id;

  J.fidele = await inscrire('Fidele');        // 3 jours différents : régulier
  for (const d of [1, 4, 9]) await courseIlYA(J.fidele, d);
  J.assidu = await inscrire('Assidu');        // 4 jours : régulier
  for (const d of [0, 2, 3, 5]) await courseIlYA(J.assidu, d);
  J.rare = await inscrire('Rare');            // 2 courses le même jour : pas régulier
  await courseIlYA(J.rare, 1); await courseIlYA(J.rare, 1);
  J.ancien = await inscrire('Ancien');        // actif il y a longtemps : pas régulier
  for (const d of [20, 25, 30]) await courseIlYA(J.ancien, d);
  J.triche = await inscrire('Triche');        // courses rejetées : pas régulier
  for (const d of [1, 2, 3]) await courseIlYA(J.triche, d, false);
  J.zambie = await inscrire('Lusaka', 'ZM');  // régulier, mais d'un autre pays
  for (const d of [1, 2, 3]) await courseIlYA(J.zambie, d);
  J.bloque = await inscrire('Bloque');        // régulier mais bloqué
  for (const d of [1, 2, 3]) await courseIlYA(J.bloque, d);
  await requete('UPDATE gchallenge.joueurs SET bloque = true WHERE id = $1', [J.bloque.id]);
});

test('création du championnat : seuls les réguliers du pays sont invités, dans le jeu et par SMS', async () => {
  const r = await api('POST', '/admin/tournois/championnats', { jeton: J.admin.jeton, corps: {
    pays: 'CD', nom: 'Championnat RDC test', sponsor: 'Vodacom', premier_lundi: lundiProchain(),
    circuits: [CIRCUIT_TEST.code, CIRCUIT_TEST.code, CIRCUIT_TEST.code], nb_equipes: 4, taille_equipe: 4, nb_qualifies: 2 } });
  assert.equal(r.statut, 201, JSON.stringify(r.json));
  champ = r.json;
  // L'invitation part en arrière-plan : on la rattrape au besoin avec le bouton « Inviter maintenant ».
  const inv = await api('POST', `/admin/tournois/championnats/${champ.id}/inviter`, { jeton: J.admin.jeton });
  assert.equal(inv.statut, 200);
  assert.equal(inv.json.envoyee, 2);
  const { rows } = await requete(
    `SELECT j.pseudo FROM gchallenge.invitations_tournoi i JOIN gchallenge.joueurs j ON j.id = i.joueur_id
      WHERE i.championnat_id = $1 ORDER BY j.pseudo`, [champ.id]);
  assert.deepEqual(rows.map((x) => x.pseudo), ['Assidu', 'Fidele']);

  const boite = (await api('GET', '/joueurs/notifications', { jeton: J.fidele.jeton })).json;
  assert.equal(boite.non_lues, 1);
  assert.match(boite.notifications[0].titre, /Invitation : Championnat RDC test/);
  assert.match(boite.notifications[0].texte, /lundi \d+ \w+ à 00h00/);
  assert.match(boite.notifications[0].texte, /heure de Kinshasa/);
  assert.match(_derniersCodes.get(J.fidele.telephone), /invite au Championnat RDC test/);
  assert.equal((await api('GET', '/joueurs/notifications', { jeton: J.rare.jeton })).json.notifications.length, 0);

  // Relancer l'invitation n'envoie rien en double.
  assert.equal((await api('POST', `/admin/tournois/championnats/${champ.id}/inviter`, { jeton: J.admin.jeton })).json.nouvelles, 0);
  await traiterInvitations({ forcer: true });
  assert.equal((await requete('SELECT count(*)::int AS n FROM gchallenge.invitations_tournoi')).rows[0].n, 2);
  const vue = (await api('GET', '/admin/tournois', { jeton: J.admin.jeton })).json;
  assert.deepEqual(vue.championnats[0].invitations, { envoyee: 2, acceptee: 0, refusee: 0 });
});

test('un joueur devenu régulier est invité au passage suivant', async () => {
  await courseIlYA(J.rare, 3); await courseIlYA(J.rare, 6);
  await traiterInvitations({ forcer: true });
  const inv = (await api('GET', '/tournois/invitations', { jeton: J.rare.jeton })).json;
  assert.equal(inv.length, 1);
  assert.equal(inv[0].statut, 'envoyee');
});

test('accepter : confirmation avec le programme (jour et heure), sans équipe : conseil d\'en rejoindre une', async () => {
  const inv = (await api('GET', '/tournois/invitations', { jeton: J.fidele.jeton })).json[0];
  assert.equal(inv.programme.length, 3);
  assert.deepEqual(inv.programme.map((s) => s.nom), ['Qualifications', 'Journée 1', 'Journée 2']);
  assert.match(inv.programme[0].debut_texte, /^lundi \d+ \w+ à 00h00$/);
  assert.match(inv.programme[0].fin_texte, /^dimanche \d+ \w+ à 23h59$/);

  // Un autre joueur ne peut pas répondre à sa place.
  assert.equal((await api('POST', `/tournois/invitations/${inv.id}/repondre`, { jeton: J.assidu.jeton, corps: { accepter: true } })).statut, 404);
  const r = await api('POST', `/tournois/invitations/${inv.id}/repondre`, { jeton: J.fidele.jeton, corps: { accepter: true } });
  assert.deepEqual(r.json, { statut: 'acceptee' });
  const boite = (await api('GET', '/joueurs/notifications', { jeton: J.fidele.jeton })).json;
  const conf = boite.notifications[0];
  assert.equal(conf.type, 'confirmation');
  assert.match(conf.texte, /Qualifications : du lundi \d+ \w+ à 00h00 au dimanche \d+ \w+ à 23h59/);
  assert.match(conf.texte, /créer ou rejoindre une équipe/);
  assert.match(_derniersCodes.get(J.fidele.telephone), /inscription confirmee/);

  // Lu : le compteur retombe à zéro.
  await api('POST', '/joueurs/notifications/lues', { jeton: J.fidele.jeton });
  assert.equal((await api('GET', '/joueurs/notifications', { jeton: J.fidele.jeton })).json.non_lues, 0);

  // Refuser.
  const invA = (await api('GET', '/tournois/invitations', { jeton: J.assidu.jeton })).json[0];
  assert.equal((await api('POST', `/tournois/invitations/${invA.id}/repondre`, { jeton: J.assidu.jeton, corps: { accepter: false } })).json.statut, 'refusee');
});

test('rappel la veille de chaque semaine, une seule fois, seulement aux inscrits', async () => {
  const { rows: [s1] } = await requete('SELECT debut FROM gchallenge.championnat_semaines WHERE championnat_id = $1 AND numero = 1', [champ.id]);
  const veille = new Date(new Date(s1.debut).getTime() - 3 * 3600 * 1000);
  assert.equal(await envoyerRappels({ maintenant: new Date(new Date(s1.debut).getTime() - 30 * 3600 * 1000) }), 0); // trop tôt
  assert.equal(await envoyerRappels({ maintenant: veille }), 1); // Fidele seulement (Assidu a refusé, Rare n'a pas répondu)
  assert.equal(await envoyerRappels({ maintenant: veille }), 0); // pas de doublon
  const rappel = (await api('GET', '/joueurs/notifications', { jeton: J.fidele.jeton })).json.notifications[0];
  assert.equal(rappel.type, 'rappel');
  assert.match(rappel.texte, new RegExp(`Qualifications commence le ${dateKin(s1.debut)}`));
  assert.match(_derniersCodes.get(J.fidele.telephone), /Qualifications du Championnat RDC test commence le/);
});

test('réglages : critère de régularité modifiable dans l\'espace administrateur', async () => {
  const r = await api('PUT', '/admin/tournois/reglages', { jeton: J.admin.jeton, corps: {
    prime_semaine_centimes: 2000, nb_equipes_primees: 4, coupe_prime_championne_centimes: 0, coupe_prime_finaliste_centimes: 0,
    invitation_jours_actifs: 5, invitation_periode_jours: 30, invitations_sms: false } });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
  assert.deepEqual([r.json.invitation_jours_actifs, r.json.invitation_periode_jours, r.json.invitations_sms], [5, 30, false]);
});
