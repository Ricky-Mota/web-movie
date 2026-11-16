// Salons en direct : 2 ou 3 amis courent en même temps (Socket.IO, sans base de données).
process.env.JWT_SECRET = 'cle-de-test-cle-de-test-cle-de-test-0123456789';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://gc:gc@localhost:5432/gchallenge_test';

const { test, before, after } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { createServer } = await import('node:http');
const { Server } = await import('socket.io');
const { io: clientSocket } = await import('socket.io-client');
const { lireJeton, creerJeton } = await import('../src/auth.js');
const { installerSalons } = await import('../src/salons.js');

let serveur, base;
const sockets = [];
before(async () => {
  serveur = createServer();
  const io = new Server(serveur);
  io.use((s, next) => { try { s.data.joueur = lireJeton(s.handshake.auth.token); next(); } catch { next(new Error('jeton_invalide')); } });
  io.on('connection', (s) => installerSalons(io, s, async (id) => 'Pilote-' + id.slice(0, 4)));
  await new Promise((r) => serveur.listen(0, r));
  base = `http://localhost:${serveur.address().port}`;
});
after(async () => { sockets.forEach((s) => s.close()); await new Promise((r) => serveur.close(r)); (await import('../src/db.js')).pool.end(); });

async function joueur(id) {
  const s = clientSocket(base, { auth: { token: creerJeton({ id, role: 'joueur' }) }, transports: ['websocket'] });
  sockets.push(s);
  await new Promise((r, e) => { s.on('connect', r); s.on('connect_error', e); });
  return s;
}
const demander = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
const attendre = (s, ev) => new Promise((r) => s.once(ev, r));

test('trois amis : salon, départ, positions, arrivées et classement', async () => {
  const a = await joueur('aaaa0001'), b = await joueur('bbbb0002'), c = await joueur('cccc0003');
  const cree = await demander(a, 'salon:creer', { etape: 'boulevard' });
  assert.match(cree.code, /^[A-Z2-9]{5}$/);
  assert.equal((await demander(a, 'salon:lancer')).erreur, 'Il faut au moins 2 joueurs.');
  assert.ok((await demander(b, 'salon:rejoindre', { code: cree.code.toLowerCase() })).ok);
  const etatC = attendre(c, 'salon:etat');
  assert.ok((await demander(c, 'salon:rejoindre', { code: cree.code })).ok);
  assert.equal((await etatC).joueurs.length, 3);
  const d4 = await joueur('dddd0004');
  assert.match((await demander(d4, 'salon:rejoindre', { code: cree.code })).erreur, /complet/);
  assert.match((await demander(b, 'salon:lancer')).erreur, /hôte/);

  const depart = attendre(c, 'salon:depart');
  assert.ok((await demander(a, 'salon:lancer')).ok);
  assert.deepEqual(await depart, { etape: 'boulevard', dans: 1500 });

  const pos = attendre(b, 'salon:pos');
  a.emit('salon:position', { z: 120.5, x: 0.4, v: 30 });
  assert.deepEqual(await pos, { id: 'aaaa0001', z: 120.5, x: 0.4, v: 30 });

  assert.match((await demander(a, 'salon:arrivee', { temps_ms: 500 })).erreur, /invalide/);
  const resultats = attendre(a, 'salon:resultats');
  await demander(b, 'salon:arrivee', { temps_ms: 61000, score: 9000 });
  await demander(a, 'salon:arrivee', { temps_ms: 63000, score: 9500 });
  await demander(c, 'salon:arrivee', { temps_ms: 60000, score: 8000 });
  const r = await resultats;
  assert.deepEqual(r.classement.map((j) => j.pseudo), ['Pilote-cccc', 'Pilote-bbbb', 'Pilote-aaaa']);

  // Le joueur qui part pendant la course ne bloque pas les autres ; l'hôte passe au suivant.
  const etatB = new Promise((r) => b.on('salon:etat', (e) => { if (e.joueurs.length === 2) r(e); }));
  a.close();
  assert.equal((await etatB).hote, 'bbbb0002');
});
