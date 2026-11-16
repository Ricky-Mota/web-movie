// Tournoi Sponsor (qualifications, sélection, éliminations, primes M-Pesa) et Tournoi international,
// de bout en bout contre une vraie base PostgreSQL (vidée à chaque lancement).
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

async function inscrire(pseudo, telephone, pays = 'CD') {
  const r = await api('POST', '/joueurs/inscription', { corps: { pseudo, telephone, pays, mot_de_passe: 'motdepasse123' } });
  assert.equal(r.statut, 201, JSON.stringify(r.json));
  return { ...r.json.joueur, jeton: r.json.jeton };
}

async function courir(joueur, tempsMs) {
  const r = await api('POST', '/courses', {
    jeton: joueur.jeton, corps: { circuit: CIRCUIT_TEST.code, temps_ms: tempsMs, intervalle_ms: 50, trajet: trajetDroit({ tempsMs }) } });
  assert.equal(r.json.valide, true, JSON.stringify(r.json));
}

/** Lundi de la semaine en cours, à Kinshasa (UTC+1). */
function lundiCourant(decalageSemaines = 0) {
  const kin = new Date(Date.now() + 3600 * 1000);
  const jour = (kin.getUTCDay() + 6) % 7; // 0 = lundi
  const lundi = new Date(Date.UTC(kin.getUTCFullYear(), kin.getUTCMonth(), kin.getUTCDate() - jour + 7 * decalageSemaines));
  return lundi.toISOString().slice(0, 10);
}

/** Ouvre la semaine `numero` maintenant (pour le test), après les courses déjà envoyées. */
async function ouvrirSemaine(saisonId, numero) {
  await requete(
    `UPDATE gchallenge.semaines_sponsor SET debut = now(), fin = now() + interval '1 day' WHERE saison_id = $1 AND numero = $2`,
    [saisonId, numero]);
  await new Promise((r) => setTimeout(r, 20));
}

const J = {};
let saison;

test('préparation : administrateur, circuit et joueurs de plusieurs pays', async () => {
  J.admin = await inscrire('Admin', '243819999999');
  await requete(`UPDATE gchallenge.joueurs SET role = 'admin' WHERE id = $1`, [J.admin.id]);
  J.admin.jeton = (await api('POST', '/joueurs/connexion', { corps: { identifiant: 'Admin', mot_de_passe: 'motdepasse123' } })).json.jeton;
  const { code, ...corps } = CIRCUIT_TEST;
  assert.equal((await api('PUT', `/admin/circuits/${code}`, { jeton: J.admin.jeton, corps })).statut, 200);
  J.ali = await inscrire('Ali', '243810000001');
  J.bea = await inscrire('Bea', '243810000002');
  J.chris = await inscrire('Chris', '243810000003');
  J.dido = await inscrire('Dido', '243810000004');
  J.eli = await inscrire('Eli', '243810000005');
  J.zola = await inscrire('Zola', '260970000001', 'ZM');
  J.sami = await inscrire('Sami', '966500000001', 'SA');
  J.kofi = await inscrire('Kofi', '233240000001', 'GH'); // nouveau pays du Tournoi international
  const pays = (await api('GET', '/pays')).json;
  assert.equal(pays.find((p) => p.code === 'SA').continent, 'AS');
  assert.equal(pays.find((p) => p.code === 'CD').primes_autorisees, true);
});

test("création d'une saison : contrôles", async () => {
  const corps = { nom: 'Saison test', sponsor: 'Vodacom', premier_lundi: lundiCourant(), nb_qualifies: 4,
    eliminations: [2, 1], primes_centimes: [1000, 500], prime_champion_centimes: 2000, circuits: Array(3).fill(CIRCUIT_TEST.code) };
  const pasAdmin = await api('POST', '/admin/tournois/sponsor', { jeton: J.ali.jeton, corps });
  assert.equal(pasAdmin.statut, 403);
  const mauvaiseSomme = await api('POST', '/admin/tournois/sponsor', { jeton: J.admin.jeton, corps: { ...corps, eliminations: [2, 2] } });
  assert.equal(mauvaiseSomme.json.erreur.code, 'eliminations_incoherentes');
  const mardi = new Date(corps.premier_lundi + 'T12:00:00Z'); mardi.setUTCDate(mardi.getUTCDate() + 1);
  const pasLundi = await api('POST', '/admin/tournois/sponsor', { jeton: J.admin.jeton, corps: { ...corps, premier_lundi: mardi.toISOString().slice(0, 10) } });
  assert.equal(pasLundi.json.erreur.code, 'pas_un_lundi');
  const r = await api('POST', '/admin/tournois/sponsor', { jeton: J.admin.jeton, corps });
  assert.equal(r.statut, 201, JSON.stringify(r.json));
  saison = r.json;
  const etat = (await api('GET', '/tournois/sponsor')).json;
  assert.equal(etat.semaines.length, 3);
  assert.equal(etat.semaine_courante, 1);
});

test('semaine 1 : qualifications ouvertes, les 4 meilleurs temps sont sélectionnés', async () => {
  await courir(J.zola, 29000);
  await courir(J.ali, 30000);
  await courir(J.ali, 35000); // seul le meilleur temps compte
  await courir(J.bea, 31000);
  await courir(J.chris, 32000);
  await courir(J.dido, 33000);
  await courir(J.eli, 34000);
  const prov = (await api('GET', `/tournois/sponsor/${saison.id}/semaines/1`)).json;
  assert.equal(prov.definitif, false);
  assert.deepEqual(prov.classement.map((l) => l.pseudo), ['Zola', 'Ali', 'Bea', 'Chris', 'Dido', 'Eli']);

  const tot = await api('POST', `/admin/tournois/sponsor/${saison.id}/semaines/2/cloturer`, { jeton: J.admin.jeton });
  assert.equal(tot.json.erreur.code, 'semaine_precedente');
  const r = await api('POST', `/admin/tournois/sponsor/${saison.id}/semaines/1/cloturer`, { jeton: J.admin.jeton });
  assert.equal(r.statut, 200, JSON.stringify(r.json));
  assert.deepEqual([r.json.classes, r.json.elimines, r.json.primes], [6, 2, 2]);
  const encore = await api('POST', `/admin/tournois/sponsor/${saison.id}/semaines/1/cloturer`, { jeton: J.admin.jeton });
  assert.equal(encore.statut, 409);

  await attendrePrimes();
  const etat = (await api('GET', '/tournois/sponsor')).json;
  assert.deepEqual(etat.en_lice.map((j) => j.pseudo), ['Zola', 'Ali', 'Bea', 'Chris']);
  const primes = (await api('GET', '/admin/primes', { jeton: J.admin.jeton })).json;
  const prime = (pseudo) => primes.find((p) => p.pseudo === pseudo && p.numero === 1);
  // Zambie : pas de versement automatique → l'administrateur verse à la main.
  assert.equal(prime('Zola').statut, 'a_verser_manuellement');
  assert.equal(prime('Zola').montant_centimes, 1000);
  // RDC : versement M-Pesa automatique (ici, le fournisseur de simulation).
  assert.equal(prime('Ali').statut, 'reussi');
  assert.equal(prime('Ali').montant_centimes, 500);
});

test('semaine 2 : seuls les sélectionnés comptent, les 2 derniers sont éliminés', async () => {
  await ouvrirSemaine(saison.id, 2);
  await courir(J.bea, 30000);
  await courir(J.chris, 30500);
  await courir(J.ali, 31000);
  await courir(J.dido, 29800); // plus rapide que Bea, mais éliminé en qualifications : ne compte pas
  // Zola ne court pas : classé derrière ceux qui ont couru.
  const prov = (await api('GET', `/tournois/sponsor/${saison.id}/semaines/2`)).json;
  assert.deepEqual(prov.classement.map((l) => l.pseudo), ['Bea', 'Chris', 'Ali', 'Zola']);
  const r = await api('POST', `/admin/tournois/sponsor/${saison.id}/semaines/2/cloturer`, { jeton: J.admin.jeton });
  assert.deepEqual([r.json.elimines, r.json.saison_terminee], [2, false]);
  const etat = (await api('GET', '/tournois/sponsor')).json;
  assert.deepEqual(etat.en_lice.map((j) => j.pseudo), ['Bea', 'Chris']);
  assert.deepEqual(etat.elimines.filter((j) => j.elimine_semaine === 2).map((j) => j.pseudo).sort(), ['Ali', 'Zola']);
  const fige = (await api('GET', `/tournois/sponsor/${saison.id}/semaines/2`)).json;
  assert.equal(fige.definitif, true);
  assert.equal(fige.classement[3].temps_ms, null);
});

test('semaine 3 (finale) : un champion, sa prime et la saison terminée', async () => {
  await ouvrirSemaine(saison.id, 3);
  await courir(J.chris, 29000);
  await courir(J.bea, 29500);
  const r = await api('POST', `/admin/tournois/sponsor/${saison.id}/semaines/3/cloturer`, { jeton: J.admin.jeton });
  assert.equal(r.json.saison_terminee, true);
  await attendrePrimes();
  const etat = (await api('GET', '/tournois/sponsor')).json;
  assert.deepEqual([etat.statut, etat.champion], ['terminee', 'Chris']);
  const primes = (await api('GET', '/admin/primes', { jeton: J.admin.jeton })).json;
  const champion = primes.find((p) => p.numero === 0);
  assert.deepEqual([champion.pseudo, champion.montant_centimes, champion.statut], ['Chris', 2000, 'reussi']);
  // Versées automatiquement : Ali (S1), Bea et Chris (S2), Chris et Bea (finale), et le champion.
  assert.equal(primes.filter((p) => p.statut === 'reussi').length, 6);
});

test('clôture automatique des semaines finies', async () => {
  const r = await api('POST', '/admin/tournois/sponsor', { jeton: J.admin.jeton, corps: {
    nom: 'Saison passée', sponsor: 'Rawbank', premier_lundi: lundiCourant(-3), nb_qualifies: 2, eliminations: [1],
    primes_centimes: [100], circuits: [CIRCUIT_TEST.code, CIRCUIT_TEST.code] } });
  assert.equal(r.statut, 201);
  await traiterTournois();
  const { rows } = await requete('SELECT statut FROM gchallenge.saisons_sponsor WHERE id = $1', [r.json.id]);
  assert.equal(rows[0].statut, 'terminee');
});

test('Tournoi international : classement continental et meilleurs par pays (Afrique seulement)', async () => {
  await courir(J.sami, 25000); // Arabie saoudite : hors du continent
  await courir(J.kofi, 28000);
  const r = (await api('GET', `/tournois/international/${CIRCUIT_TEST.code}`)).json;
  assert.ok(!r.continental.some((l) => l.pseudo === 'Sami'));
  assert.equal(r.continental[0].pseudo, 'Kofi');
  assert.ok(r.continental.some((l) => l.pseudo === 'Kofi' && l.pays_code === 'GH'));
  const cd = r.qualifies_par_pays.find((p) => p.code === 'CD');
  assert.equal(cd.joueurs.length, 3);
  assert.ok(r.qualifies_par_pays.some((p) => p.code === 'GH') && r.qualifies_par_pays.some((p) => p.code === 'ZM'));
});
