// Salons en direct : 2 ou 3 amis courent EN MÊME TEMPS, chacun sur son téléphone.
// Gratuit (aucune mise). Tout se passe en mémoire, par Socket.IO :
//   salon:creer {etape}        -> réponse {code}         (le créateur devient l'hôte)
//   salon:rejoindre {code}     -> réponse {ok} ou {erreur}
//   salon:quitter
//   salon:lancer               (l'hôte, au moins 2 joueurs) -> tous reçoivent salon:depart {etape, dans}
//   salon:position {z, x, v}   (10 fois par seconde)        -> les autres reçoivent salon:pos {id, z, x, v}
//   salon:arrivee {temps_ms, score}                         -> salon:resultats quand tous sont arrivés (ou 3 min max)
// Chaque changement envoie salon:etat {code, etape, statut, hote, joueurs:[{id, pseudo, arrive, temps_ms}]}.
import { requete } from './db.js';

export const TAILLE_MAX = 3;
const DUREE_MAX_MS = 3 * 60 * 1000;
const ETAPE = /^[a-z0-9_-]{1,32}$/;
const LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const salons = new Map(); // code -> salon

function nouveauCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 5; i++) code += LETTRES[Math.floor(Math.random() * LETTRES.length)];
    if (!salons.has(code)) return code;
  }
}

function etat(s) {
  return {
    code: s.code, etape: s.etape, statut: s.statut, hote: s.hote,
    joueurs: [...s.joueurs.values()].map((j) => ({ id: j.id, pseudo: j.pseudo, arrive: j.temps_ms != null, temps_ms: j.temps_ms ?? null, score: j.score ?? null })),
  };
}

export function installerSalons(io, socket, lirePseudo = pseudoEnBase) {
  const moi = socket.data.joueur;
  let monSalon = null;

  const diffuser = (s) => io.to(`salon:${s.code}`).emit('salon:etat', etat(s));

  function quitter() {
    const s = monSalon && salons.get(monSalon);
    monSalon = null;
    if (!s) return;
    s.joueurs.delete(moi.id);
    socket.leave(`salon:${s.code}`);
    if (!s.joueurs.size) { clearTimeout(s.minuterie); salons.delete(s.code); return; }
    if (s.hote === moi.id) s.hote = s.joueurs.keys().next().value;
    if (s.statut === 'course') verifierFin(s);
    diffuser(s);
  }

  function verifierFin(s) {
    const tous = [...s.joueurs.values()];
    if (s.statut !== 'course' || !tous.every((j) => j.temps_ms != null)) return;
    terminer(s);
  }
  function terminer(s) {
    clearTimeout(s.minuterie);
    s.statut = 'termine';
    const classement = [...s.joueurs.values()]
      .sort((a, b) => (a.temps_ms ?? Infinity) - (b.temps_ms ?? Infinity) || (b.score ?? 0) - (a.score ?? 0))
      .map((j, i) => ({ rang: i + 1, id: j.id, pseudo: j.pseudo, temps_ms: j.temps_ms ?? null, score: j.score ?? null }));
    io.to(`salon:${s.code}`).emit('salon:resultats', { code: s.code, etape: s.etape, classement });
    s.statut = 'attente';
    for (const j of s.joueurs.values()) { j.temps_ms = null; j.score = null; }
    diffuser(s);
  }

  async function entrer(s, repondre) {
    if (s.joueurs.size >= TAILLE_MAX && !s.joueurs.has(moi.id)) return repondre({ erreur: 'Salon complet (3 joueurs au maximum).' });
    if (s.statut === 'course') return repondre({ erreur: 'La course a déjà commencé, attendez la fin.' });
    if (monSalon && monSalon !== s.code) quitter();
    const pseudo = await lirePseudo(moi.id);
    s.joueurs.set(moi.id, { id: moi.id, pseudo, temps_ms: null, score: null });
    monSalon = s.code;
    socket.join(`salon:${s.code}`);
    repondre({ ok: true, code: s.code });
    diffuser(s);
  }

  const sur = (evenement, fn) => socket.on(evenement, (donnees, repondre) => {
    const rep = typeof repondre === 'function' ? repondre : () => {};
    Promise.resolve(fn(donnees ?? {}, rep)).catch(() => rep({ erreur: 'Erreur du serveur, réessayez.' }));
  });

  sur('salon:creer', async (d, rep) => {
    if (typeof d.etape !== 'string' || !ETAPE.test(d.etape)) return rep({ erreur: 'Étape invalide.' });
    const s = { code: nouveauCode(), etape: d.etape, statut: 'attente', hote: moi.id, joueurs: new Map(), minuterie: null };
    salons.set(s.code, s);
    await entrer(s, rep);
  });
  sur('salon:rejoindre', async (d, rep) => {
    const s = salons.get(String(d.code || '').trim().toUpperCase());
    if (!s) return rep({ erreur: 'Code inconnu. Vérifiez les 5 caractères.' });
    await entrer(s, rep);
  });
  sur('salon:etape', (d, rep) => {
    const s = salons.get(monSalon);
    if (!s || s.hote !== moi.id || s.statut !== 'attente') return rep({ erreur: "Seul l'hôte peut changer d'étape." });
    if (typeof d.etape !== 'string' || !ETAPE.test(d.etape)) return rep({ erreur: 'Étape invalide.' });
    s.etape = d.etape; rep({ ok: true }); diffuser(s);
  });
  sur('salon:quitter', (_d, rep) => { quitter(); rep({ ok: true }); });
  sur('salon:lancer', (_d, rep) => {
    const s = salons.get(monSalon);
    if (!s || s.hote !== moi.id) return rep({ erreur: "Seul l'hôte peut lancer la course." });
    if (s.joueurs.size < 2) return rep({ erreur: 'Il faut au moins 2 joueurs.' });
    if (s.statut === 'course') return rep({ erreur: 'Course déjà lancée.' });
    s.statut = 'course';
    for (const j of s.joueurs.values()) { j.temps_ms = null; j.score = null; }
    s.minuterie = setTimeout(() => terminer(s), DUREE_MAX_MS);
    s.minuterie.unref?.();
    io.to(`salon:${s.code}`).emit('salon:depart', { etape: s.etape, dans: 1500 });
    rep({ ok: true }); diffuser(s);
  });
  socket.on('salon:position', (d) => {
    const s = salons.get(monSalon);
    if (!s || s.statut !== 'course' || !d) return;
    const n = (v, max) => (Number.isFinite(v) ? Math.max(-max, Math.min(max, v)) : 0);
    socket.to(`salon:${s.code}`).volatile.emit('salon:pos', { id: moi.id, z: n(d.z, 1e5), x: n(d.x, 3), v: n(d.v, 200) });
  });
  sur('salon:arrivee', (d, rep) => {
    const s = salons.get(monSalon);
    const j = s && s.joueurs.get(moi.id);
    if (!j || s.statut !== 'course') return rep({ erreur: 'Aucune course en cours.' });
    const t = Math.round(Number(d.temps_ms));
    if (!Number.isFinite(t) || t < 10_000 || t > DUREE_MAX_MS) return rep({ erreur: 'Temps invalide.' });
    j.temps_ms = t; j.score = Math.max(0, Math.round(Number(d.score) || 0));
    rep({ ok: true }); diffuser(s); verifierFin(s);
  });
  socket.on('disconnect', quitter);
}

async function pseudoEnBase(id) {
  const { rows } = await requete('SELECT pseudo FROM joueurs WHERE id = $1', [id]);
  return rows[0]?.pseudo ?? 'Pilote';
}

export function _viderSalons() { salons.clear(); }
