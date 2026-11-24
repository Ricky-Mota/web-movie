// 2 Life : serveur du jeu (Cloudflare Worker + base D1).
// Le serveur est l'arbitre : il décide de l'âge, des talents et de l'argent ; le téléphone ne fait qu'afficher.
import {
  ageYears, stageOf, STAGES, realMsUntil, TALENTS, ACTIVITIES, rng, drawTalents, doActivity,
  needsAt, newIdentity, BIRTH_GIFT,
} from "./life.js";

const SESSION_DAYS = 30;
const FOOD = { prix: 25, faim: 45 }; // un repas au maquis

// ---------------------------------------------------------------- utilitaires
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const uid = () => crypto.randomUUID();
const seedOf = () => crypto.getRandomValues(new Uint32Array(1))[0];

async function hashPassword(pass, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return { hash: hex(bits), salt: hex(salt) };
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function cors(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (allowed.includes("*") ? "*" : origin) : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}
const json = (h, status, body) => new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json; charset=utf-8" } });
const fail = (h, status, message) => json(h, status, { erreur: message });

// ---------------------------------------------------------------- naissance
async function birth(db, compteId, now) {
  const r = rng(seedOf());
  const id = uid();
  const who = newIdentity(r);
  const talents = drawTalents(r);
  const stmts = [
    db.prepare(`INSERT INTO personnages (id, compte_id, ville_id, prenom, nom, sexe, quartier, apparence, ne_le, maj_le, makuta, pere_nom, mere_nom)
                VALUES (?, ?, 'kinshasa', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, compteId, who.firstName, who.lastName, who.sex, who.quartier, who.look, now, now, BIRTH_GIFT, who.father, who.mother),
    db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, 'naissance : épargne des parents', ?)`)
      .bind(uid(), id, BIRTH_GIFT, now),
    db.prepare(`UPDATE comptes SET vie_id = ? WHERE id = ?`).bind(id, compteId),
    ...talents.map(t => db.prepare(`INSERT INTO talents_personnage (personnage_id, talent_id, niveau) VALUES (?, ?, ?)`).bind(id, t.talent, t.level)),
  ];
  await db.batch(stmts);
  return id;
}

// ---------------------------------------------------------------- profil
async function loadCharacter(db, id) {
  const p = await db.prepare(`SELECT * FROM personnages WHERE id = ?`).bind(id).first();
  if (!p) return null;
  const { results: tal } = await db.prepare(`SELECT talent_id, niveau, decouvert, indices FROM talents_personnage WHERE personnage_id = ?`).bind(id).all();
  return { p, tal };
}

function view(compte, p, tal, now) {
  const age = ageYears(p.ne_le, now);
  const st = stageOf(age);
  const next = STAGES[STAGES.indexOf(st) + 1];
  const needs = needsAt({ hunger: p.faim, energy: p.energie, happiness: p.bonheur, health: p.sante, updatedAt: p.maj_le }, now);
  return {
    compte: { pseudo: compte.pseudo, reputation: compte.reputation, accesPaye: !!compte.acces_paye },
    perso: {
      id: p.id, prenom: p.prenom, nom: p.nom, sexe: p.sexe, quartier: p.quartier, ville: "Kinshasa", apparence: p.apparence,
      neLe: p.ne_le, age: Math.round(age * 100) / 100, etape: st.id, etapeLabel: st.label,
      prochaineEtape: next ? { label: next.label, dansMs: realMsUntil(p.ne_le, next.from, now) } : null,
      besoins: Object.fromEntries(Object.entries(needs).map(([k, v]) => [k, Math.round(v)])),
      makuta: p.makuta, pere: p.pere_nom, mere: p.mere_nom, vivant: !p.mort_le,
      // les talents non découverts restent secrets : seul leur nombre et les indices sont envoyés
      talents: tal.filter(t => t.decouvert).map(t => ({ id: t.talent_id, label: TALENTS.find(x => x.id === t.talent_id).label, niveau: t.niveau })),
      talentsCaches: tal.filter(t => !t.decouvert).length,
      indices: tal.filter(t => !t.decouvert && t.indices > 0).map(t => TALENTS.find(x => x.id === t.talent_id).hint),
    },
    activites: ACTIVITIES.map(a => ({ id: a.id, label: a.label, minAge: a.minAge, energie: a.energy })),
    repas: FOOD,
  };
}

async function auth(db, req, now) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer ([a-f0-9-]{36})$/);
  if (!m) return null;
  return db.prepare(`SELECT c.* FROM sessions s JOIN comptes c ON c.id = s.compte_id WHERE s.token = ? AND s.expire_le > ?`).bind(m[1], now).first();
}

async function newSession(db, compteId, now) {
  const token = uid();
  await db.prepare(`INSERT INTO sessions (token, compte_id, expire_le) VALUES (?, ?, ?)`).bind(token, compteId, now + SESSION_DAYS * 864e5).run();
  return token;
}

// enregistre les besoins recalculés avant toute action
async function settle(db, p, now) {
  const n = needsAt({ hunger: p.faim, energy: p.energie, happiness: p.bonheur, health: p.sante, updatedAt: p.maj_le }, now);
  Object.assign(p, { faim: n.hunger, energie: n.energy, bonheur: n.happiness, sante: n.health, maj_le: now });
  await db.prepare(`UPDATE personnages SET faim = ?, energie = ?, bonheur = ?, sante = ?, maj_le = ? WHERE id = ?`).bind(p.faim, p.energie, p.bonheur, p.sante, now, p.id).run();
}

// ---------------------------------------------------------------- routes
export default {
  async fetch(req, env) {
    const h = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    const db = env.DB;
    const now = Date.now();
    let body = {};
    if (req.method === "POST") { try { body = await req.json(); } catch (e) { return fail(h, 400, "Requête illisible."); } }

    try {
      if (url.pathname === "/api/sante") return json(h, 200, { ok: true, jeu: "2 Life" });

      if (url.pathname === "/api/inscription" && req.method === "POST") {
        const email = String(body.email || "").trim().toLowerCase();
        const pseudo = String(body.pseudo || "").trim().slice(0, 40);
        const pass = String(body.motdepasse || "");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(h, 400, "Adresse e-mail invalide.");
        if (pseudo.length < 2) return fail(h, 400, "Choisis un pseudo d'au moins 2 caractères.");
        if (pass.length < 8) return fail(h, 400, "Le mot de passe doit faire au moins 8 caractères.");
        const exists = await db.prepare(`SELECT 1 FROM comptes WHERE email = ?`).bind(email).first();
        if (exists) return fail(h, 409, "Un compte existe déjà avec cette adresse.");
        const { hash, salt } = await hashPassword(pass);
        const id = uid();
        await db.prepare(`INSERT INTO comptes (id, email, pseudo, pass_hash, pass_salt, cree_le) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, email, pseudo, hash, salt, now).run();
        const pid = await birth(db, id, now);
        const token = await newSession(db, id, now);
        const compte = await db.prepare(`SELECT * FROM comptes WHERE id = ?`).bind(id).first();
        const { p, tal } = await loadCharacter(db, pid);
        return json(h, 201, { token, ...view(compte, p, tal, now), naissance: true });
      }

      if (url.pathname === "/api/connexion" && req.method === "POST") {
        const email = String(body.email || "").trim().toLowerCase();
        const c = await db.prepare(`SELECT * FROM comptes WHERE email = ?`).bind(email).first();
        if (!c) return fail(h, 401, "E-mail ou mot de passe incorrect.");
        const { hash } = await hashPassword(String(body.motdepasse || ""), c.pass_salt);
        if (!sameText(hash, c.pass_hash)) return fail(h, 401, "E-mail ou mot de passe incorrect.");
        const token = await newSession(db, c.id, now);
        const { p, tal } = await loadCharacter(db, c.vie_id);
        return json(h, 200, { token, ...view(c, p, tal, now) });
      }

      // ---- routes réservées aux joueurs connectés
      const compte = await auth(db, req, now);
      if (!compte) return fail(h, 401, "Connecte-toi pour continuer.");
      const ch = await loadCharacter(db, compte.vie_id);
      if (!ch) return fail(h, 404, "Personnage introuvable.");
      const { p, tal } = ch;

      if (url.pathname === "/api/moi" && req.method === "GET") return json(h, 200, view(compte, p, tal, now));

      if (url.pathname === "/api/activite" && req.method === "POST") {
        const act = ACTIVITIES.find(a => a.id === body.activite);
        if (!act) return fail(h, 400, "Activité inconnue.");
        await settle(db, p, now);
        if (p.energie < act.energy) return fail(h, 409, "Trop fatigué : il faut d'abord se reposer.");
        const age = ageYears(p.ne_le, now);
        const res = doActivity(act, tal.map(t => ({ talent: t.talent_id, level: t.niveau, discovered: !!t.decouvert })), age, rng(seedOf()));
        if (!res.ok) return fail(h, 409, res.message);
        const st = [
          db.prepare(`UPDATE personnages SET energie = energie - ?, bonheur = MIN(100, bonheur + 6) WHERE id = ?`).bind(act.energy, p.id),
          db.prepare(`INSERT INTO activites (id, personnage_id, activite, score, resultat, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, act.id, res.score, res.message, now),
        ];
        if (res.discovered) st.push(db.prepare(`UPDATE talents_personnage SET decouvert = 1, decouvert_par = 'parents', decouvert_le = ? WHERE personnage_id = ? AND talent_id = ?`).bind(now, p.id, res.discovered));
        if (res.hint) st.push(db.prepare(`UPDATE talents_personnage SET indices = indices + 1 WHERE personnage_id = ? AND talent_id = ?`).bind(p.id, res.hint));
        await db.batch(st);
        const again = await loadCharacter(db, p.id);
        return json(h, 200, { resultat: { score: res.score, message: res.message, talent: res.discovered ? TALENTS.find(x => x.id === res.discovered).label : null }, ...view(compte, again.p, again.tal, now) });
      }

      if (url.pathname === "/api/manger" && req.method === "POST") {
        await settle(db, p, now);
        if (p.makuta < FOOD.prix) return fail(h, 409, "Pas assez d'e-makuta pour un repas.");
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, faim = MIN(100, faim + ?) WHERE id = ? AND makuta >= ?`).bind(FOOD.prix, FOOD.faim, p.id, FOOD.prix),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, 'repas au maquis', ?)`).bind(uid(), p.id, FOOD.prix, now),
        ]);
        const again = await loadCharacter(db, p.id);
        return json(h, 200, view(compte, again.p, again.tal, now));
      }

      return fail(h, 404, "Route inconnue.");
    } catch (e) {
      console.error(e);
      return fail(h, 500, "Erreur du serveur.");
    }
  },
};
