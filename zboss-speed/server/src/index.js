// 2 Life : serveur du jeu (Cloudflare Worker + base D1).
// Le serveur est l'arbitre : il décide de l'âge, des talents et de l'argent ; le téléphone ne fait qu'afficher.
import {
  ageYears, stageOf, STAGES, realMsUntil, TALENTS, ACTIVITIES, rng, drawTalents, doActivity,
  needsAt, newIdentity, BIRTH_GIFT, SHOP, cannotBuy, OFFERS, USD_TO_MAKUTA, USD_UNITS, fmtMakuta, WITHDRAW_FEE, walletInfo, birthShiftMs, REAL_MONEY, shopView, familyOf, JOBS, payFor, cannotWork, workView, cannotApply, FORMATIONS, cannotEnroll, attendCourse, schoolView,
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
async function birth(db, compteId, now, offer) {
  const r = rng(seedOf());
  const id = uid();
  const who = newIdentity(r);
  const talents = drawTalents(r);
  const parent = offer && offer.id === "parent";
  const born = parent ? now - birthShiftMs(offer.age + .01) : now;     // « naître parent » : on arrive adulte
  const gift = parent ? offer.epargne : BIRTH_GIFT;
  const stmts = [
    db.prepare(`INSERT INTO personnages (id, compte_id, ville_id, prenom, nom, sexe, quartier, apparence, ne_le, maj_le, makuta, pere_nom, mere_nom)
                VALUES (?, ?, 'kinshasa', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, compteId, who.firstName, who.lastName, who.sex, who.quartier, who.look, born, now, gift, who.father, who.mother),
    db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`)
      .bind(uid(), id, gift, parent ? "épargne de départ (naître parent)" : "naissance : épargne des parents", now),
    db.prepare(`INSERT INTO depots (id, compte_id, offre, usd, makuta, simule, le) VALUES (?, ?, ?, ?, 0, ?, ?)`)
      .bind(uid(), compteId, offer ? offer.id : "bebe", offer ? offer.usd : 0, REAL_MONEY ? 0 : 1, now),
    db.prepare(`UPDATE comptes SET vie_id = ? WHERE id = ?`).bind(id, compteId),
    // « naître parent » : talents déjà connus (apprentissage accéléré)
    ...talents.map(t => db.prepare(`INSERT INTO talents_personnage (personnage_id, talent_id, niveau, decouvert, decouvert_par, decouvert_le) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, t.talent, t.level, parent ? 1 : 0, parent ? "formule parent" : null, parent ? now : null)),
  ];
  await db.batch(stmts);
  return id;
}

// ---------------------------------------------------------------- profil
async function loadCharacter(db, id) {
  const p = await db.prepare(`SELECT * FROM personnages WHERE id = ?`).bind(id).first();
  if (!p) return null;
  const { results: tal } = await db.prepare(`SELECT talent_id, niveau, decouvert, indices FROM talents_personnage WHERE personnage_id = ?`).bind(id).all();
  const { results: inv } = await db.prepare(`SELECT id, objet_id, porte, acquis_le FROM possessions WHERE proprietaire_id = ? ORDER BY acquis_le`).bind(id).all();
  const { results: dep } = await db.prepare(`SELECT offre, usd, makuta, le FROM depots WHERE compte_id = ? ORDER BY le`).bind(p.compte_id).all();
  const { results: ret } = await db.prepare(`SELECT makuta, usd, statut, le FROM retraits WHERE compte_id = ? ORDER BY le`).bind(p.compte_id).all();
  const job = await db.prepare(`SELECT id, metier_id FROM emplois WHERE personnage_id = ? AND fin IS NULL ORDER BY depuis DESC LIMIT 1`).bind(id).first();
  const last = await db.prepare(`SELECT MAX(le) AS le FROM activites WHERE personnage_id = ? AND activite LIKE 'travail:%'`).bind(id).first();
  const enr = await db.prepare(`SELECT formation_id AS formation, annee, cours, points, dernier FROM inscriptions WHERE personnage_id = ?`).bind(id).first();
  const { results: dip } = await db.prepare(`SELECT formation_id FROM diplomes_obtenus WHERE personnage_id = ? ORDER BY obtenu_le`).bind(id).all();
  return { p, tal, inv, dep, ret, job, lastShift: last && last.le, enr, dip: dip.map(d => d.formation_id) };
}

function view(compte, { p, tal, inv = [], dep = [], ret = [], job = null, lastShift = null, enr = null, dip = [] }, now) {
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
      famille: familyOf({ look: p.apparence, father: p.pere_nom, mother: p.mere_nom, quartier: p.quartier }, age),
      // les talents non découverts restent secrets : seul leur nombre et les indices sont envoyés
      talents: tal.filter(t => t.decouvert).map(t => ({ id: t.talent_id, label: TALENTS.find(x => x.id === t.talent_id).label, niveau: t.niveau })),
      talentsCaches: tal.filter(t => !t.decouvert).length,
      indices: tal.filter(t => !t.decouvert && t.indices > 0).map(t => TALENTS.find(x => x.id === t.talent_id).hint),
    },
    activites: ACTIVITIES.map(a => ({ id: a.id, label: a.label, minAge: a.minAge, energie: a.energy })),
    repas: FOOD,
    ...shopView(inv, dep, ret, p.makuta, now),
    travail: workView(job && job.metier_id, lastShift, now),
    ecole: schoolView(enr, dip, now),
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
        const offer = OFFERS.find(o => o.id === body.formule && o.type === "entree") || OFFERS[0];
        const pid = await birth(db, id, now, offer);
        const token = await newSession(db, id, now);
        const compte = await db.prepare(`SELECT * FROM comptes WHERE id = ?`).bind(id).first();
        return json(h, 201, { token, ...view(compte, await loadCharacter(db, pid), now), naissance: true });
      }

      if (url.pathname === "/api/connexion" && req.method === "POST") {
        const email = String(body.email || "").trim().toLowerCase();
        const c = await db.prepare(`SELECT * FROM comptes WHERE email = ?`).bind(email).first();
        if (!c) return fail(h, 401, "E-mail ou mot de passe incorrect.");
        const { hash } = await hashPassword(String(body.motdepasse || ""), c.pass_salt);
        if (!sameText(hash, c.pass_hash)) return fail(h, 401, "E-mail ou mot de passe incorrect.");
        const token = await newSession(db, c.id, now);
        return json(h, 200, { token, ...view(c, await loadCharacter(db, c.vie_id), now) });
      }

      // ---- routes réservées aux joueurs connectés
      const compte = await auth(db, req, now);
      if (!compte) return fail(h, 401, "Connecte-toi pour continuer.");
      const ch = await loadCharacter(db, compte.vie_id);
      if (!ch) return fail(h, 404, "Personnage introuvable.");
      const { p, tal } = ch;

      if (url.pathname === "/api/moi" && req.method === "GET") return json(h, 200, view(compte, ch, now));

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
        return json(h, 200, { resultat: { score: res.score, message: res.message, talent: res.discovered ? TALENTS.find(x => x.id === res.discovered).label : null }, ...view(compte, again, now) });
      }

      if (url.pathname === "/api/manger" && req.method === "POST") {
        await settle(db, p, now);
        if (p.makuta < FOOD.prix) return fail(h, 409, "Pas assez d'e-makuta pour un repas.");
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, faim = MIN(100, faim + ?) WHERE id = ? AND makuta >= ?`).bind(FOOD.prix, FOOD.faim, p.id, FOOD.prix),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, 'repas au maquis', ?)`).bind(uid(), p.id, FOOD.prix, now),
        ]);
        const again = await loadCharacter(db, p.id);
        return json(h, 200, view(compte, again, now));
      }

      if (url.pathname === "/api/acheter" && req.method === "POST") {
        const item = SHOP.find(x => x.id === body.objet);
        await settle(db, p, now);
        const no = cannotBuy(item, p.makuta, ageYears(p.ne_le, now));
        if (no) return fail(h, 409, no);
        const e = item.effet || {};
        const st = [
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, faim = MIN(100, faim + ?), bonheur = MIN(100, bonheur + ?), energie = MIN(100, energie + ?) WHERE id = ? AND makuta >= ?`)
            .bind(item.prix, e.faim || 0, e.bonheur || 0, e.energie || 0, p.id, item.prix),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, item.prix, "achat : " + item.nom, now),
        ];
        if (item.type !== "nourriture") {
          // un vêtement acheté est porté tout de suite (il remplace celui du même emplacement)
          if (item.slot) st.push(db.prepare(`UPDATE possessions SET porte = 0 WHERE proprietaire_id = ? AND objet_id IN (${SHOP.filter(x => x.slot === item.slot).map(() => "?").join(",")})`).bind(p.id, ...SHOP.filter(x => x.slot === item.slot).map(x => x.id)));
          st.push(db.prepare(`INSERT INTO possessions (id, proprietaire_id, objet_id, acquis_le, porte) VALUES (?, ?, ?, ?, ?)`).bind(uid(), p.id, item.id, now, item.slot ? 1 : 0));
        }
        await db.batch(st);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      if (url.pathname === "/api/porter" && req.method === "POST") {
        const own = ch.inv.find(x => x.id === body.possession);
        const item = own && SHOP.find(x => x.id === own.objet_id);
        if (!item || !item.slot) return fail(h, 400, "Vêtement introuvable.");
        const same = SHOP.filter(x => x.slot === item.slot).map(x => x.id);
        await db.batch([
          db.prepare(`UPDATE possessions SET porte = 0 WHERE proprietaire_id = ? AND objet_id IN (${same.map(() => "?").join(",")})`).bind(p.id, ...same),
          db.prepare(`UPDATE possessions SET porte = ? WHERE id = ?`).bind(own.porte ? 0 : 1, own.id),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      if (url.pathname === "/api/postuler" && req.method === "POST") {
        const job = JOBS.find(j => j.id === body.metier);
        const no = cannotApply(job, ageYears(p.ne_le, now), ch.dip);
        if (no) return fail(h, 409, no);
        await db.batch([
          db.prepare(`UPDATE emplois SET fin = ? WHERE personnage_id = ? AND fin IS NULL`).bind(now, p.id),
          db.prepare(`INSERT INTO emplois (id, personnage_id, metier_id, poste, salaire, depuis) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, job.id, job.nom, job.salaire, now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      if (url.pathname === "/api/travailler" && req.method === "POST") {
        await settle(db, p, now);
        const job = ch.job && JOBS.find(j => j.id === ch.job.metier_id);
        const no = cannotWork(job, ageYears(p.ne_le, now), p.energie, ch.lastShift, now);
        if (no) return fail(h, 409, no);
        const pay = payFor(job, tal.map(t => ({ talent: t.talent_id, discovered: !!t.decouvert })));
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta + ?, energie = MAX(0, energie - ?), faim = MAX(0, faim - 10) WHERE id = ?`).bind(pay.montant, 35, p.id),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), p.id, pay.montant, "salaire : " + job.nom, now),
          db.prepare(`INSERT INTO activites (id, personnage_id, activite, score, resultat, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, "travail:" + job.id, pay.montant, pay.bonus ? "bonus talent" : "", now),
        ]);
        return json(h, 200, { paie: pay, ...view(compte, await loadCharacter(db, p.id), now) });
      }

      if (url.pathname === "/api/ecole/inscription" && req.method === "POST") {
        const f = FORMATIONS.find(x => x.id === body.formation);
        const no = cannotEnroll(f, ageYears(p.ne_le, now), ch.dip, ch.enr);
        if (no) return fail(h, 409, no);
        await db.prepare(`INSERT INTO inscriptions (personnage_id, formation_id, depuis) VALUES (?, ?, ?)`).bind(p.id, f.id, now).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      if (url.pathname === "/api/ecole/cours" && req.method === "POST") {
        if (!ch.enr) return fail(h, 409, "Inscris-toi d'abord dans une école.");
        await settle(db, p, now);
        const f = FORMATIONS.find(x => x.id === ch.enr.formation);
        const res = attendCourse(f, ch.enr, tal.map(t => ({ talent: t.talent_id, discovered: !!t.decouvert })), p.makuta, p.energie, now, rng(seedOf()));
        if (res.error) return fail(h, 409, res.error);
        const st = [db.prepare(`UPDATE personnages SET energie = MAX(0, energie - ?), makuta = makuta - ? WHERE id = ?`).bind(15, res.fee, p.id)];
        if (res.fee) st.push(db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, res.fee, "frais de cours : " + f.nom, now));
        if (res.fin) st.push(
          db.prepare(`INSERT OR IGNORE INTO diplomes_obtenus (personnage_id, formation_id, obtenu_le, note) VALUES (?, ?, ?, ?)`).bind(p.id, f.id, now, res.fin.note),
          db.prepare(`DELETE FROM inscriptions WHERE personnage_id = ?`).bind(p.id));
        else st.push(db.prepare(`UPDATE inscriptions SET annee = ?, cours = ?, points = ?, dernier = ? WHERE personnage_id = ?`).bind(res.enr.annee, res.enr.cours, res.enr.points, now, p.id));
        await db.batch(st);
        return json(h, 200, { cours: { note: res.note, message: res.message, diplome: !!res.fin }, ...view(compte, await loadCharacter(db, p.id), now) });
      }

      // investissement : SIMULATION tant que REAL_MONEY est faux (aucun paiement encaissé)
      if (url.pathname === "/api/investir" && req.method === "POST") {
        const o = OFFERS.find(x => x.id === body.offre && x.type === "investissement");
        if (!o) return fail(h, 400, "Offre inconnue.");
        if (REAL_MONEY) return fail(h, 501, "Le paiement réel passe par le partenaire agréé.");
        const mk = o.usd * USD_UNITS;
        await db.batch([
          db.prepare(`INSERT INTO depots (id, compte_id, offre, usd, makuta, simule, le) VALUES (?, ?, ?, ?, ?, 1, ?)`).bind(uid(), compte.id, o.id, o.usd, mk, now),
          db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(mk, p.id),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), p.id, mk, "investissement simulé : " + o.nom, now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      if (url.pathname === "/api/retirer" && req.method === "POST") {
        const mk = Math.floor(Number(body.makuta) || 0);
        const w = walletInfo(ch.dep, p.makuta, now);
        if (!w.retraitPossible) return fail(h, 409, w.retraitPossibleLe ? `Retrait possible à partir du ${new Date(w.retraitPossibleLe).toLocaleDateString("fr-FR")}.` : "Aucun dépôt.");
        if (mk < USD_UNITS || mk > p.makuta) return fail(h, 400, "Montant invalide.");
        const usd = Math.floor(mk / USD_UNITS * (1 - WITHDRAW_FEE) * 100) / 100;
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(mk, p.id, mk),
          db.prepare(`INSERT INTO retraits (id, compte_id, makuta, usd, simule, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), compte.id, mk, usd, REAL_MONEY ? 0 : 1, now),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, mk, "retrait vers l'argent réel" + (REAL_MONEY ? "" : " (simulé)"), now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      return fail(h, 404, "Route inconnue.");
    } catch (e) {
      console.error(e);
      return fail(h, 500, "Erreur du serveur.");
    }
  },
};
