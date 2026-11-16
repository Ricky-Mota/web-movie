// Championnat national par équipes (Tournoi Sponsor) et Coupe d'Afrique, de bout en bout
// contre une vraie base PostgreSQL (vidée à chaque lancement).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://gc:gc@localhost:5432/gchallenge_test';
process.env.JWT_SECRET = 'cle-de-test-cle-de-test-cle-de-test-0123456789';
process.env.FOURNISSEUR_FORCE = 'simulation';

const { test, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { createServer } = await import('node:http');
const { pool, requete } = await import('../src/db.js');
const { migrer } = await import('../src/migrations.js');
const { creerApp } = await import('../src/app.js');
const { attendrePrimes, traiterTournois } = await import('../src/domaine/tournois.js');
const { CIRCUIT_TEST, trajetDroit } = await import('./trajets.js');

let serveur;
let base;

before(async () => {
  await requete('DROP SCHEMA IF EXISTS gchallenge CASCADE');
  await migrer();
  serveur = createServer(creerApp({ limiteConnexions: 1000 }));
  await new Promise((r) => serveur.listen(0, r));
  base = `http://localhost:${serveur.address().port}`;
});

after(async () => {
  await attendrePrimes();
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

let numeroTel = 0;
async function inscrire(pseudo, pays = 'CD') {
  numeroTel += 1;
  const indicatif = { CD: '24381', ZM: '26097', SA: '96650', GH: '23324' }[pays];
  const telephone = indicatif + String(numeroTel).padStart(7, '0');
  const r = await api('POST', '/joueurs/inscription', { corps: { pseudo, telephone, pays, mot_de_passe: 'motdepasse123' } });
  assert.equal(r.statut, 201, JSON.stringify(r.json));
  return { ...r.json.joueur, jeton: r.json.jeton };
}

/** Une équipe de 3 pilotes : le premier est le capitaine. */
async function equipe(nom, pays = 'CD') {
  const pilotes = [];
  for (let i = 1; i <= 3; i++) pilotes.push(await inscrire(`${nom}${i}`, pays));
  const e = await api('POST', '/equipes', { jeton: pilotes[0].jeton, corps: { nom, taille_max: 3 } });
  assert.equal(e.statut, 201);
  for (const p of pilotes.slice(1)) {
    assert.equal((await api('POST', `/equipes/${e.json.id}/membres`, { jeton: pilotes[0].jeton, corps: { pseudo: p.pseudo } })).statut, 201);
  }
  return { id: e.json.id, nom, pilotes };
}

async function courir(joueur, tempsMs) {
  const r = await api('POST', '/courses', {
    jeton: joueur.jeton, corps: { circuit: CIRCUIT_TEST.code, temps_ms: tempsMs, intervalle_ms: 50, trajet: trajetDroit({ tempsMs }) } });
  assert.equal(r.json.valide, true, JSON.stringify(r.json));
}

/** Toute l'équipe court (ou seulement les `n` premiers pilotes). */
async function courirEquipe(eq, tempsMs, n = 3) {
  for (const p of eq.pilotes.slice(0, n)) await courir(p, tempsMs);
}

function lundiCourant(decalageSemaines = 0) {
  const kin = new Date(Date.now() + 3600 * 1000);
  const jour = (kin.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(kin.getUTCFullYear(), kin.getUTCMonth(), kin.getUTCDate() - jour + 7 * decalageSemaines)).toISOString().slice(0, 10);
}

/** Ouvre une semaine (ou un tour) maintenant, pour le test, après les courses déjà envoyées. */
async function ouvrir(table, colonneId, id, colonneNumero, numero) {
  await requete(`UPDATE gchallenge.${table} SET debut = now(), fin = now() + interval '1 day' WHERE ${colonneId} = $1 AND ${colonneNumero} = $2`, [id, numero]);
  await new Promise((r) => setTimeout(r, 20));
}

const J = {};
const E = {};
let champCD, champZM, coupe;

test('préparation : administrateur, circuit, 5 équipes en RDC et 2 en Zambie', async () => {
  J.admin = await inscrire('Admin');
  await requete(`UPDATE gchallenge.joueurs SET role = 'admin' WHERE id = $1`, [J.admin.id]);
  J.admin.jeton = (await api('POST', '/joueurs/connexion', { corps: { identifiant: 'Admin', mot_de_passe: 'motdepasse123' } })).json.jeton;
  const { code, ...corps } = CIRCUIT_TEST;
  assert.equal((await api('PUT', `/admin/circuits/${code}`, { jeton: J.admin.jeton, corps })).statut, 200);
  for (const nom of ['Gombe', 'Lemba', 'Matete', 'Ngiri', 'Kasa']) E[nom] = await equipe(nom);
  for (const nom of ['Lusaka', 'Ndola']) E[nom] = await equipe(nom, 'ZM');
});

test('championnat national : contrôles à la création', async () => {
  const corps = { pays: 'cd', nom: 'Championnat RDC', sponsor: 'Vodacom', premier_lundi: lundiCourant(),
    nb_equipes: 4, nb_qualifies: 2, circuits: Array(3).fill(CIRCUIT_TEST.code), taille_equipe: 3 };
  assert.equal((await api('POST', '/admin/tournois/championnats', { jeton: E.Gombe.pilotes[0].jeton, corps })).statut, 403);
  const uneSemaine = await api('POST', '/admin/tournois/championnats', { jeton: J.admin.jeton, corps: { ...corps, circuits: [CIRCUIT_TEST.code] } });
  assert.equal(uneSemaine.statut, 400);
  const trop = await api('POST', '/admin/tournois/championnats', { jeton: J.admin.jeton, corps: { ...corps, nb_qualifies: 5 } });
  assert.equal(trop.json.erreur.code, 'qualifies');
  const r = await api('POST', '/admin/tournois/championnats', { jeton: J.admin.jeton, corps });
  assert.equal(r.statut, 201, JSON.stringify(r.json));
  champCD = r.json;
  const etat = (await api('GET', '/tournois/championnats/cd')).json;
  assert.deepEqual([etat.semaines.length, etat.semaine_courante, etat.taille_equipe, etat.primes_centimes], [3, 1, 3, [2000, 2000, 2000, 2000]]);
});

test('semaine 1 : qualifications, les 4 meilleures équipes complètes sont retenues, 20 $ chacune', async () => {
  await courirEquipe(E.Gombe, 30000);
  await courirEquipe(E.Lemba, 31000);
  await courirEquipe(E.Matete, 32000);
  await courirEquipe(E.Ngiri, 33000);
  await courirEquipe(E.Kasa, 29000, 2); // la plus rapide, mais incomplète (2 pilotes sur 3)
  const prov = (await api('GET', `/tournois/championnats/${champCD.id}/semaines/1`)).json;
  assert.deepEqual(prov.classement.map((l) => l.nom), ['Gombe', 'Lemba', 'Matete', 'Ngiri', 'Kasa']);
  assert.deepEqual([prov.classement[0].temps_ms, prov.classement[4].temps_ms, prov.classement[4].nb_pilotes], [90000, null, 2]);

  const r = await api('POST', `/admin/tournois/championnats/${champCD.id}/semaines/1/cloturer`, { jeton: J.admin.jeton });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
  assert.equal(r.json.primes, 12); // 4 équipes × 3 pilotes
  assert.equal((await api('POST', `/admin/tournois/championnats/${champCD.id}/semaines/1/cloturer`, { jeton: J.admin.jeton })).statut, 409);
  await attendrePrimes();

  const etat = (await api('GET', '/tournois/championnats/CD')).json;
  assert.deepEqual(etat.classement.map((e) => e.nom), ['Gombe', 'Lemba', 'Matete', 'Ngiri']);
  const primes = (await api('GET', '/admin/primes', { jeton: J.admin.jeton })).json.filter((p) => p.equipe === 'Gombe');
  assert.equal(primes.reduce((s, p) => s + p.montant_centimes, 0), 2000);
  // Le capitaine reçoit le reste de la division : 668 + 666 + 666.
  assert.equal(primes.find((p) => p.pseudo === 'Gombe1').montant_centimes, 668);
  assert.ok(primes.every((p) => p.statut === 'reussi'));
});

test('semaines 2 et 3 : points, départage au temps cumulé, 2 équipes qualifiées', async () => {
  await ouvrir('championnat_semaines', 'championnat_id', champCD.id, 'numero', 2);
  await courirEquipe(E.Lemba, 30000);   // 90 000 : 1re → 25 pts
  await courirEquipe(E.Gombe, 31000);   // 93 000 : 2e → 20 pts
  await courirEquipe(E.Matete, 32000);  // 3e → 16 pts
  await courirEquipe(E.Ngiri, 29500, 2); // incomplète : 0 pt
  await courirEquipe(E.Kasa, 29000);    // pas retenue : ne compte pas
  const s2 = (await api('GET', `/tournois/championnats/${champCD.id}/semaines/2`)).json;
  assert.deepEqual(s2.classement.map((l) => l.nom), ['Lemba', 'Gombe', 'Matete', 'Ngiri']);
  await api('POST', `/admin/tournois/championnats/${champCD.id}/semaines/2/cloturer`, { jeton: J.admin.jeton });

  await ouvrir('championnat_semaines', 'championnat_id', champCD.id, 'numero', 3);
  await courirEquipe(E.Gombe, 29500);   // 88 500 : 1re → 25 pts (total 45, temps cumulé 181 500)
  await courirEquipe(E.Lemba, 31000);   // 93 000 : 2e → 20 pts (total 45, temps cumulé 183 000)
  await courirEquipe(E.Matete, 32000);
  await courirEquipe(E.Ngiri, 33000);
  const r = await api('POST', `/admin/tournois/championnats/${champCD.id}/semaines/3/cloturer`, { jeton: J.admin.jeton });
  assert.equal(r.json.termine, true);
  const etat = (await api('GET', '/tournois/championnats/CD')).json;
  assert.equal(etat.statut, 'terminee');
  assert.deepEqual(etat.classement.map((e) => [e.nom, e.points, e.qualifiee]),
    [['Gombe', 45, true], ['Lemba', 45, true], ['Matete', 32, false], ['Ngiri', 13, false]]);
});

test('championnat de Zambie : primes à verser à la main (pas de versement automatique dans ce pays)', async () => {
  const r = await api('POST', '/admin/tournois/championnats', { jeton: J.admin.jeton, corps: {
    pays: 'ZM', nom: 'Championnat Zambie', sponsor: 'Sponsor ZM', premier_lundi: lundiCourant(), nb_equipes: 2, taille_equipe: 3,
    circuits: [CIRCUIT_TEST.code, CIRCUIT_TEST.code] } });
  champZM = r.json;
  await courirEquipe(E.Lusaka, 30000);
  await courirEquipe(E.Ndola, 31000);
  await api('POST', `/admin/tournois/championnats/${champZM.id}/semaines/1/cloturer`, { jeton: J.admin.jeton });
  await ouvrir('championnat_semaines', 'championnat_id', champZM.id, 'numero', 2);
  await courirEquipe(E.Ndola, 30000);
  await courirEquipe(E.Lusaka, 31000);
  await api('POST', `/admin/tournois/championnats/${champZM.id}/semaines/2/cloturer`, { jeton: J.admin.jeton });
  const etat = (await api('GET', '/tournois/championnats/ZM')).json;
  assert.deepEqual(etat.classement.map((e) => [e.nom, e.qualifiee]), [['Ndola', true], ['Lusaka', true]]);
  const primes = (await api('GET', '/admin/primes?statut=a_verser_manuellement', { jeton: J.admin.jeton })).json;
  assert.ok(primes.length >= 6 && primes.every((p) => ['Lusaka', 'Ndola'].includes(p.equipe)));
});

test("Coupe d'Afrique : tableau croisé, élimination directe, championne et primes", async () => {
  const mauvais = await api('POST', '/admin/tournois/coupes', { jeton: J.admin.jeton, corps: {
    nom: 'Coupe', sponsor: 'Rawbank', premier_lundi: lundiCourant(), championnats: [champCD.id, champZM.id], circuits: [CIRCUIT_TEST.code] } });
  assert.equal(mauvais.json.erreur.code, 'circuits_tours');
  const r = await api('POST', '/admin/tournois/coupes', { jeton: J.admin.jeton, corps: {
    nom: "Coupe d'Afrique test", sponsor: 'Rawbank', premier_lundi: lundiCourant(), championnats: [champCD.id, champZM.id],
    circuits: [CIRCUIT_TEST.code, CIRCUIT_TEST.code], primes_centimes: [5000, 2500], taille_equipe: 3 } });
  assert.equal(r.statut, 201, JSON.stringify(r.json));
  coupe = r.json;
  let etat = (await api('GET', '/tournois/coupe')).json;
  assert.deepEqual(etat.tours.map((t) => t.nom), ['Demi-finales', 'Finale']);
  // 1er de RDC contre 2e de Zambie, 1er de Zambie contre 2e de RDC.
  assert.deepEqual(etat.tours[0].matchs.map((m) => [m.equipe_a, m.equipe_b]), [['Gombe', 'Lusaka'], ['Ndola', 'Lemba']]);

  await ouvrir('coupe_tours', 'coupe_id', coupe.id, 'tour', 1);
  await courirEquipe(E.Gombe, 30000);
  await courirEquipe(E.Lusaka, 31000);
  await courirEquipe(E.Lemba, 32000); // Ndola ne court pas : Lemba passe
  await api('POST', `/admin/tournois/coupes/${coupe.id}/tours/1/cloturer`, { jeton: J.admin.jeton });
  etat = (await api('GET', '/tournois/coupe')).json;
  assert.deepEqual(etat.tours[1].matchs.map((m) => [m.equipe_a, m.equipe_b]), [['Gombe', 'Lemba']]);

  await ouvrir('coupe_tours', 'coupe_id', coupe.id, 'tour', 2);
  await courirEquipe(E.Gombe, 31000);
  await courirEquipe(E.Lemba, 30000);
  const fin = await api('POST', `/admin/tournois/coupes/${coupe.id}/tours/2/cloturer`, { jeton: J.admin.jeton });
  assert.equal(fin.json.termine, true);
  await attendrePrimes();
  etat = (await api('GET', '/tournois/coupe')).json;
  assert.deepEqual([etat.statut, etat.championne], ['terminee', 'Lemba']);
  const primes = (await api('GET', '/admin/primes', { jeton: J.admin.jeton })).json.filter((p) => p.origine === 'coupe');
  const total = (eq) => primes.filter((p) => p.equipe === eq).reduce((s, p) => s + p.montant_centimes, 0);
  assert.deepEqual([total('Lemba'), total('Gombe')], [5000, 2500]);
});

test('clôture automatique des semaines finies', async () => {
  const r = await api('POST', '/admin/tournois/championnats', { jeton: J.admin.jeton, corps: {
    pays: 'CD', nom: 'Championnat passé', sponsor: 'Bralima', premier_lundi: lundiCourant(-4), nb_equipes: 2, taille_equipe: 3,
    circuits: [CIRCUIT_TEST.code, CIRCUIT_TEST.code] } });
  assert.equal(r.statut, 201);
  await traiterTournois();
  const { rows } = await requete('SELECT statut FROM gchallenge.championnats WHERE id = $1', [r.json.id]);
  assert.equal(rows[0].statut, 'terminee');
});

test('classement continental des pilotes : Afrique seulement', async () => {
  const sami = await inscrire('Sami', 'SA');
  const kofi = await inscrire('Kofi', 'GH');
  await courir(sami, 29000);
  await courir(kofi, 29100);
  const r = (await api('GET', `/tournois/international/${CIRCUIT_TEST.code}`)).json;
  assert.ok(!r.continental.some((l) => l.pseudo === 'Sami'));
  assert.ok(r.meilleurs_par_pays.some((p) => p.code === 'GH'));
});

test("réglages des primes (espace administrateur) : valeurs par défaut des compétitions suivantes", async () => {
  const avant = (await api('GET', '/admin/tournois/reglages', { jeton: J.admin.jeton })).json;
  assert.deepEqual([avant.prime_semaine_centimes, avant.nb_equipes_primees, avant.coupe_prime_championne_centimes], [2000, 4, 0]);
  assert.equal((await api('PUT', '/admin/tournois/reglages', { jeton: E.Gombe.pilotes[0].jeton, corps: {} })).statut, 403);
  const r = await api('PUT', '/admin/tournois/reglages', { jeton: J.admin.jeton, corps: {
    prime_semaine_centimes: 2500, nb_equipes_primees: 3, coupe_prime_championne_centimes: 30000, coupe_prime_finaliste_centimes: 15000 } });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
  const c = await api('POST', '/admin/tournois/championnats', { jeton: J.admin.jeton, corps: {
    pays: 'CD', nom: 'Saison 2', sponsor: 'Canal+', premier_lundi: lundiCourant(1), circuits: [CIRCUIT_TEST.code, CIRCUIT_TEST.code] } });
  assert.deepEqual(c.json.primes_centimes.map(Number), [2500, 2500, 2500]);
  const vue = (await api('GET', '/admin/tournois', { jeton: J.admin.jeton })).json;
  assert.ok(vue.circuits.some((x) => x.code === CIRCUIT_TEST.code) && vue.championnats.length >= 3);
});

test('circuits : niveaux de difficulté, circuits de la démo web, CORS', async () => {
  const { declarerCircuitsDuFichier } = await import('../src/domaine/circuits.js');
  const r = await declarerCircuitsDuFichier();
  assert.equal(r.enregistres.length, 16);
  const liste = (await api('GET', '/circuits')).json;
  const niveaux = [...new Set(liste.map((c) => c.difficulte))];
  assert.deepEqual(niveaux, ['facile', 'moyen', 'difficile', 'tres_difficile']); // trié par difficulté
  assert.equal(liste.find((c) => c.code === 'L_Kinshasa_Gombe').longueur_m, 9000);

  // Course de la démo web : X = distance le long de la route (cm), Y = écart latéral, 20 points par seconde.
  const tempsMs = 75000, trajet = [];
  for (let t = 0; t <= tempsMs; t += 50) trajet.push([(240000 * t) / tempsMs, 150 * Math.sin(t / 3000), 0, 0, 0, 0]);
  trajet.push([240100, 120, 0, 0, 0, 0]);
  const course = await api('POST', '/courses', { jeton: E.Gombe.pilotes[1].jeton, corps: { circuit: 'W_rondpoint', temps_ms: tempsMs, intervalle_ms: 50, trajet } });
  assert.equal(course.json.valide, true, JSON.stringify(course.json));

  const pre = await fetch(base + '/courses', { method: 'OPTIONS', headers: { Origin: 'https://course-des-ketch.pages.dev', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');
});
