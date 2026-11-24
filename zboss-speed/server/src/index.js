// 2 Life : serveur du jeu (Cloudflare Worker + base D1).
// Le serveur est l'arbitre : il décide de l'âge, des talents et de l'argent ; le téléphone ne fait qu'afficher.
import {
  ageYears, stageOf, STAGES, realMsUntil, TALENTS, ACTIVITIES, rng, drawTalents, doActivity,
  needsAt, newIdentity, BIRTH_GIFT, SHOP, cannotBuy, OFFERS, USD_TO_MAKUTA, USD_UNITS, fmtMakuta, WITHDRAW_FEE, walletInfo, birthShiftMs, REAL_MONEY, shopView, familyOf, JOBS, payFor, cannotWork, workView, cannotApply, FORMATIONS, cannotEnroll, attendCourse, schoolView, SUPPORT_PER_DAY, HOST_MIN_AGE, MAX_CHILDREN, supportDue, unpaidEffect, familyShare, DAY, LAUNCH_RULES, launchStatus, canSignupBeforeLaunch, COMPANY_TYPES, cannotOpenCompany, companyName, companyView, companyAccrue, companyJob, EMPLOYEE_YIELD, RESELL_RATE, TAXI_FARE, TAXI_ENERGY, KINSHASA_QUARTIERS, OTHER_CITIES, STATE_ID, TAX, POSTS, PUBLIC_JOBS, BANKS, bankAccrue, INSURERS, CARE, careCost, OPERATORS, RECHARGES, CALL, stateView, ELECTION_EVERY, VOTER_MIN_AGE, electionCalendar, tally, CRIMES, catchChance, sentence, inPrison, PRISON_BLOCKED, PRISON_HOURS, BAIL, RECIDIVE, policeView,
  describeAction, ORDER_DONE, ORDERS, ORDERS_PER_DAY, ORDERS_CHECK_MS, dayKey, ordersToRun, cannotGiveOrder,
} from "./life.js";
import { sendPush } from "./webpush.js";

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
async function birth(db, compteId, now, offer, fondateur = false) {
  const r = rng(seedOf());
  const id = uid();
  const who = newIdentity(r);
  const talents = drawTalents(r);
  const parent = offer && offer.id === "parent", invest = offer && offer.type === "investissement";
  const born = offer && offer.age ? now - birthShiftMs(offer.age + .01) : now;     // « naître parent » ou investisseur : on arrive adulte
  const gift = parent ? offer.epargne : invest ? offer.usd * USD_UNITS : BIRTH_GIFT;
  // le bébé naît chez un parent joueur qui accueille des enfants (sinon dans une famille gérée par le jeu)
  let host = null;
  if (!offer || !offer.age) host = await db.prepare(`SELECT p.id, p.sexe, p.prenom, p.nom, p.quartier FROM personnages p
      WHERE p.compte_id IS NOT NULL AND p.mort_le IS NULL AND p.accueille_enfants = 1 AND p.ne_le <= ?
        AND (SELECT COUNT(*) FROM personnages k WHERE (k.pere_id = p.id OR k.mere_id = p.id) AND k.mort_le IS NULL) < ?
      ORDER BY RANDOM() LIMIT 1`).bind(now - birthShiftMs(HOST_MIN_AGE), MAX_CHILDREN).first();
  if (host) {
    const other = host.sexe === "M" ? who.mother.split(" ")[0] : who.father.split(" ")[0];
    who.lastName = host.nom; who.quartier = host.quartier;
    who.father = host.sexe === "M" ? host.prenom + " " + host.nom : other + " " + host.nom;
    who.mother = host.sexe === "F" ? host.prenom + " " + host.nom : other + " " + host.nom;
  }
  const stmts = [
    db.prepare(`INSERT INTO personnages (id, compte_id, ville_id, prenom, nom, sexe, quartier, apparence, ne_le, maj_le, makuta, pere_nom, mere_nom, pere_id, mere_id, accueille_enfants, entretien_le, fondateur)
                VALUES (?, ?, 'kinshasa', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, compteId, who.firstName, who.lastName, who.sex, who.quartier, who.look, born, now, gift, who.father, who.mother,
        host && host.sexe === "M" ? host.id : null, host && host.sexe === "F" ? host.id : null, parent ? 1 : 0, now, fondateur ? 1 : 0),
    db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`)
      .bind(uid(), id, gift, parent ? "épargne de départ (naître parent)" : invest ? "investissement simulé : " + offer.nom : "naissance : épargne des parents", now),
    db.prepare(`INSERT INTO depots (id, compte_id, offre, usd, makuta, simule, le) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid(), compteId, fondateur ? "fondateur" : offer ? offer.id : "bebe", fondateur ? 0 : offer ? offer.usd : 0, invest ? gift : 0, REAL_MONEY ? 0 : 1, now),
    db.prepare(`UPDATE comptes SET vie_id = ? WHERE id = ?`).bind(id, compteId),
    // « naître parent » : talents déjà connus (apprentissage accéléré)
    ...talents.map(t => db.prepare(`INSERT INTO talents_personnage (personnage_id, talent_id, niveau, decouvert, decouvert_par, decouvert_le) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, t.talent, t.level, parent ? 1 : 0, parent ? "formule parent" : null, parent ? now : null)),
  ];
  await db.batch(stmts);
  return id;
}

// famille : les parents joueurs remplacent les parents du jeu ; la maison est celle du parent joueur
function playerFamily(f, par, sibs, now) {
  for (const x of par) {
    const who = { nom: `${x.prenom} ${x.nom}`, age: Math.floor(ageYears(x.ne_le, now)), metier: (JOBS.find(j => j.id === x.metier) || { nom: "Sans emploi" }).nom, joueur: x.pseudo };
    if (x.sexe === "M") f.pere = who; else f.mere = who;
    f.maison = { ...familyOf({ look: x.apparence }, 0).maison, quartier: f.maison.quartier };
  }
  if (par.length) f.fratrie = sibs.map(k => ({ prenom: k.prenom, sexe: k.sexe, age: Math.floor(ageYears(k.ne_le, now)), joueur: true }));
  f.parentJoueur = par.length > 0;
  return f;
}
function childView(k, now) {
  const age = ageYears(k.ne_le, now), n = needsAt({ hunger: k.faim, energy: k.energie, happiness: k.bonheur, health: k.sante, updatedAt: k.maj_le }, now);
  return { id: k.id, prenom: k.prenom, nom: k.nom, sexe: k.sexe, age: Math.round(age * 100) / 100, etapeLabel: stageOf(age).label, joueur: !!k.compte_id,
    besoins: Object.fromEntries(Object.entries(n).map(([a, b]) => [a, Math.round(b)])), makuta: k.makuta,
    prochainEntretien: age < 18 ? supportDue(k.entretien_le, k.ne_le, now).next : null, mouvements: k.mouvements || [] };
}

// ---------------------------------------------------------------- entreprises des joueurs
// un client paie : l'argent va dans la caisse d'une entreprise de joueur de ce type (au hasard), sinon à la ville
async function payToCompany(db, type, payerId, amount, motif, now) {
  const e = await db.prepare(`SELECT id FROM entreprises WHERE type = ? AND proprietaire_id != ? ORDER BY RANDOM() LIMIT 1`).bind(type, payerId).first();
  return [
    ...(e ? [db.prepare(`UPDATE entreprises SET caisse = caisse + ? WHERE id = ?`).bind(amount, e.id)] : []),
    db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), payerId, e ? e.id : null, amount, motif, now),
  ];
}
// met à jour la caisse d'une entreprise (recette quotidienne, plafonnée)
async function accrue(db, e, now) {
  const a = companyAccrue(e, now);
  await db.prepare(`UPDATE entreprises SET caisse = ?, maj_le = ? WHERE id = ?`).bind(a.caisse, now, e.id).run();
  return a.caisse;
}

// ---------------------------------------------------------------- l'État : Trésor public, masse monétaire, candidatures
async function publicState(db) {
  const t = await db.prepare(`SELECT COALESCE((SELECT SUM(montant) FROM transactions WHERE vers_id = '${STATE_ID}'), 0) - COALESCE((SELECT SUM(montant) FROM transactions WHERE de_id = '${STATE_ID}'), 0) AS tresor,
      COALESCE((SELECT SUM(makuta) FROM personnages WHERE mort_le IS NULL), 0) + COALESCE((SELECT SUM(solde) FROM comptes_banque), 0) AS masse`).first();
  const { results } = await db.prepare(`SELECT poste, COUNT(*) AS n FROM candidatures GROUP BY poste`).all();
  return { tresor: t.tresor, masse: t.masse, candidats: Object.fromEntries(results.map(r => [r.poste, r.n])) };
}
// ---------------------------------------------------------------- élections (tous les 6 mois après le démarrage)
async function elections(db, now) {
  const { results } = await db.prepare(`SELECT cle, valeur FROM jeu WHERE cle IN ('demarre_le', 'election_date', 'election_cycle')`).all();
  const kv = Object.fromEntries(results.map(r => [r.cle, Number(r.valeur)]));
  if (!kv.demarre_le) return electionCalendar(null, 0, now);
  let date = kv.election_date, cycle = kv.election_cycle || 1;
  const save = () => db.batch([
    db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('election_date', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(String(date)),
    db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('election_cycle', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(String(cycle)),
  ]);
  if (!date) { date = kv.demarre_le + ELECTION_EVERY; await save(); }
  // dépouillement d'une élection passée : les élus prennent leur mandat et leur poste
  while (now >= date) {
    const { results: votes } = await db.prepare(`SELECT poste, candidat_id FROM votes WHERE cycle = ?`).bind(cycle).all();
    const { results: cands } = await db.prepare(`SELECT personnage_id, poste, le FROM candidatures`).all();
    const won = Object.entries(tally(votes, cands)).flatMap(([poste, list]) => list.map(w => ({ ...w, poste })));
    await db.batch([
      db.prepare(`UPDATE mandats SET fin = ? WHERE fin IS NULL`).bind(date),
      db.prepare(`UPDATE emplois SET fin = ? WHERE fin IS NULL AND metier_id LIKE 'elu-%'`).bind(date),
      ...won.flatMap(w => [
        db.prepare(`INSERT INTO mandats (personnage_id, poste, cycle, voix, debut) VALUES (?, ?, ?, ?, ?)`).bind(w.personnage_id, w.poste, cycle, w.voix, date),
        db.prepare(`UPDATE emplois SET fin = ? WHERE personnage_id = ? AND fin IS NULL`).bind(date, w.personnage_id),
        db.prepare(`INSERT INTO emplois (id, personnage_id, metier_id, poste, salaire, depuis) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), w.personnage_id, "elu-" + w.poste, w.poste, 0, date),
      ]),
      db.prepare(`DELETE FROM candidatures`),
    ]);
    date += ELECTION_EVERY; cycle += 1; await save();
  }
  return electionCalendar(date, cycle, now);
}
async function electionView(db, cal, me) {
  const { results: cands } = await db.prepare(`SELECT c.personnage_id AS id, c.poste, p.prenom || ' ' || p.nom AS nom, p.quartier,
      (SELECT COUNT(*) FROM votes v WHERE v.candidat_id = c.personnage_id AND v.poste = c.poste AND v.cycle = ?) AS voix
      FROM candidatures c JOIN personnages p ON p.id = c.personnage_id ORDER BY voix DESC, c.le LIMIT 60`).bind(cal.cycle).all();
  const { results: elus } = await db.prepare(`SELECT m.poste, m.voix, p.prenom || ' ' || p.nom AS nom FROM mandats m JOIN personnages p ON p.id = m.personnage_id WHERE m.fin IS NULL ORDER BY m.voix DESC LIMIT 60`).all();
  const { results: mine } = await db.prepare(`SELECT poste, candidat_id FROM votes WHERE electeur_id = ? AND cycle = ?`).bind(me, cal.cycle).all();
  return { ...cal, candidats: cands, elus, mesVotes: Object.fromEntries(mine.map(v => [v.poste, v.candidat_id])) };
}

const taxTo = (db, from, amount, motif, now) => amount > 0 ? [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, '${STATE_ID}', ?, ?, ?)`).bind(uid(), from, amount, motif, now)] : [];

// ---------------------------------------------------------------- profil
async function loadCharacter(db, id) {
  const p = await db.prepare(`SELECT * FROM personnages WHERE id = ?`).bind(id).first();
  if (!p) return null;
  const { results: tal } = await db.prepare(`SELECT talent_id, niveau, decouvert, indices FROM talents_personnage WHERE personnage_id = ?`).bind(id).all();
  const { results: inv } = await db.prepare(`SELECT id, objet_id, porte, acquis_le FROM possessions WHERE proprietaire_id = ? ORDER BY acquis_le`).bind(id).all();
  const { results: dep } = await db.prepare(`SELECT offre, usd, makuta, le FROM depots WHERE compte_id = ? ORDER BY le`).bind(p.compte_id).all();
  const { results: ret } = await db.prepare(`SELECT makuta, usd, statut, le FROM retraits WHERE compte_id = ? ORDER BY le`).bind(p.compte_id).all();
  const job = await db.prepare(`SELECT id, metier_id, entreprise_id FROM emplois WHERE personnage_id = ? AND fin IS NULL ORDER BY depuis DESC LIMIT 1`).bind(id).first();
  const last = await db.prepare(`SELECT MAX(le) AS le FROM activites WHERE personnage_id = ? AND activite LIKE 'travail:%'`).bind(id).first();
  const enr = await db.prepare(`SELECT formation_id AS formation, annee, cours, points, dernier FROM inscriptions WHERE personnage_id = ?`).bind(id).first();
  const { results: dip } = await db.prepare(`SELECT formation_id FROM diplomes_obtenus WHERE personnage_id = ? ORDER BY obtenu_le`).bind(id).all();
  const { results: kids } = await db.prepare(`SELECT id, prenom, nom, sexe, ne_le, faim, energie, bonheur, sante, maj_le, makuta, entretien_le, compte_id FROM personnages
      WHERE (pere_id = ? OR mere_id = ?) AND mort_le IS NULL ORDER BY ne_le`).bind(id, id).all();
  // les parents voient les mouvements de leurs enfants joueurs (20 derniers chacun)
  for (const k of kids) k.mouvements = (await db.prepare(`SELECT icone, texte, par_consigne, le FROM mouvements WHERE personnage_id = ? ORDER BY le DESC LIMIT 20`).bind(k.id).all()).results;
  const { results: par } = await db.prepare(`SELECT p.id, p.prenom, p.nom, p.sexe, p.ne_le, p.apparence, c.pseudo,
      (SELECT metier_id FROM emplois e WHERE e.personnage_id = p.id AND e.fin IS NULL LIMIT 1) AS metier
      FROM personnages p JOIN comptes c ON c.id = p.compte_id WHERE p.id IN (?, ?)`).bind(p.pere_id || "", p.mere_id || "").all();
  const { results: sibs } = par.length ? await db.prepare(`SELECT prenom, sexe, ne_le FROM personnages WHERE id != ? AND mort_le IS NULL AND (pere_id IN (?, ?) OR mere_id IN (?, ?))`)
    .bind(id, p.pere_id || "", p.mere_id || "", p.pere_id || "", p.mere_id || "").all() : { results: [] };
  const { results: ent } = await db.prepare(`SELECT e.id, e.nom, e.type, e.local AS quartier, e.capital, e.cree_le, e.caisse, e.maj_le, e.en_vente,
      (SELECT COUNT(*) FROM emplois m WHERE m.entreprise_id = e.id AND m.fin IS NULL) AS employes FROM entreprises e WHERE e.proprietaire_id = ? ORDER BY e.cree_le`).bind(id).all();
  const { results: aVendre } = await db.prepare(`SELECT e.id, e.nom, e.type, e.local AS quartier, e.en_vente, p.prenom || ' ' || p.nom AS proprietaire FROM entreprises e JOIN personnages p ON p.id = e.proprietaire_id
      WHERE e.en_vente IS NOT NULL AND e.proprietaire_id != ? ORDER BY e.en_vente LIMIT 30`).bind(id).all();
  const places = `CASE e.type ${COMPANY_TYPES.map(t => `WHEN '${t.id}' THEN ${t.places}`).join(" ")} ELSE 0 END`;
  const { results: offres } = await db.prepare(`SELECT e.id, e.nom, e.type, e.local AS quartier, p.prenom || ' ' || p.nom AS proprietaire FROM entreprises e JOIN personnages p ON p.id = e.proprietaire_id
      WHERE e.proprietaire_id != ? AND (SELECT COUNT(*) FROM emplois m WHERE m.entreprise_id = e.id AND m.fin IS NULL) < ${places} ORDER BY RANDOM() LIMIT 12`).bind(id).all();
  const boss = job && job.entreprise_id ? await db.prepare(`SELECT id, nom, type, caisse, maj_le, cree_le, proprietaire_id FROM entreprises WHERE id = ?`).bind(job.entreprise_id).first() : null;
  const { results: comptes } = await db.prepare(`SELECT banque_id AS banque, solde, maj_le FROM comptes_banque WHERE personnage_id = ?`).bind(id).all();
  const cand = await db.prepare(`SELECT poste FROM candidatures WHERE personnage_id = ?`).bind(id).first();
  const pub = await publicState(db);
  const now = Date.now(), cal = await elections(db, now);
  const elec = await electionView(db, cal, id);
  const pol = await db.prepare(`SELECT COUNT(*) AS n FROM emplois WHERE metier_id = 'policier' AND fin IS NULL`).first();
  const { results: casier } = await db.prepare(`SELECT type, amende, prison_heures, le FROM infractions WHERE personnage_id = ? ORDER BY le DESC LIMIT 20`).bind(id).all();
  const notif = await db.prepare(`SELECT COUNT(*) AS n FROM abonnements_push WHERE compte_id = ?`).bind(p.compte_id).first();
  const jour = dayKey(now);
  const { results: mv } = await db.prepare(`SELECT icone, texte, par_consigne, le FROM mouvements WHERE personnage_id = ? ORDER BY le DESC LIMIT 100`).bind(id).all();
  const { results: ord } = await db.prepare(`SELECT ordre FROM consignes WHERE personnage_id = ? AND jour = ? ORDER BY donnee_le`).bind(id, jour).all();
  const { results: journal } = await db.prepare(`SELECT ordre, ok, message, le FROM consignes_journal WHERE personnage_id = ? AND jour = ? ORDER BY le DESC LIMIT 30`).bind(id, jour).all();
  return { p, tal, inv, dep, ret, job, lastShift: last && last.le, enr, dip: dip.map(d => d.formation_id), kids, par, sibs, ent, aVendre, offres, boss, comptes, cand, pub, elec, policiers: pol.n, casier,
    consignes: { jour, liste: ord.map(o => o.ordre), journal }, mouvements: mv, notifications: notif.n };
}

// ---------------------------------------------------------------- notifications sur le téléphone
async function notify(env, db, compteId, message) {
  const { results } = await db.prepare(`SELECT endpoint, p256dh, auth FROM abonnements_push WHERE compte_id = ?`).bind(compteId).all();
  for (const sub of results) {
    try { if (await sendPush(env, sub, message) === "expire") await db.prepare(`DELETE FROM abonnements_push WHERE endpoint = ?`).bind(sub.endpoint).run(); }
    catch (e) { console.error(e); }
  }
}

// ---------------------------------------------------------------- consignes du jour
// Le personnage suit les consignes de son joueur : on rejoue les mêmes routes que l'application, en interne.
async function applyOrders(env, db, compte, ch, now, force) {
  const { p, consignes: C } = ch;
  if (!C.liste.length || (!force && p.consignes_le && now - p.consignes_le < ORDERS_CHECK_MS)) return false;
  await db.prepare(`UPDATE personnages SET consignes_le = ? WHERE id = ?`).bind(now, p.id).run();
  const done = C.journal.filter(j => j.ok).map(j => j.ordre);
  const runs = ordersToRun(C.liste, view(compte, ch, now), now, done);
  if (!runs.length) return false;
  const token = await newSession(db, compte.id, now), faits = [];
  try {
    for (const [ordre, path, body] of runs) {
      const r = await worker.fetch(new Request("https://interne" + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "X-Consigne": "1" }, body: JSON.stringify(body) }), env);
      const j = await r.json().catch(() => ({}));
      const msg = r.ok ? ORDER_DONE[ordre] + (j.paie ? ` +${fmtMakuta(j.paie.montant - (j.paie.famille || 0) - (j.paie.impot || 0))}` : j.encaisse ? ` +${fmtMakuta(j.encaisse)}` : "") : (j.erreur || "Impossible pour l'instant.");
      if (r.ok) faits.push(msg);
      const last = C.journal.find(x => x.ordre === ordre);
      if (r.ok || !last || last.message !== msg)
        await db.prepare(`INSERT INTO consignes_journal (id, personnage_id, jour, ordre, ok, message, le) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, C.jour, ordre, r.ok ? 1 : 0, msg, now).run();
    }
  } finally { await db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run(); }
  if (faits.length) await notify(env, db, compte.id, { titre: `2 Life · ${p.prenom}`, texte: faits.join(" · "), url: "vie.html#moves" });
  return true;
}

function view(compte, { p, tal, inv = [], dep = [], ret = [], job = null, lastShift = null, enr = null, dip = [], kids = [], par = [], sibs = [], ent = [], aVendre = [], offres = [], boss = null, comptes = [], cand = null, pub = {}, elec = null, policiers = 0, casier = [], consignes = { jour: dayKey(now), liste: [], journal: [] }, mouvements = [], notifications = 0 }, now) {
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
      famille: playerFamily(familyOf({ look: p.apparence, father: p.pere_nom, mother: p.mere_nom, quartier: p.quartier }, age), par, sibs, now),
      accueil: !!p.accueille_enfants,
      // les talents non découverts restent secrets : seul leur nombre et les indices sont envoyés
      talents: tal.filter(t => t.decouvert).map(t => ({ id: t.talent_id, label: TALENTS.find(x => x.id === t.talent_id).label, niveau: t.niveau })),
      talentsCaches: tal.filter(t => !t.decouvert).length,
      indices: tal.filter(t => !t.decouvert && t.indices > 0).map(t => TALENTS.find(x => x.id === t.talent_id).hint),
    },
    activites: ACTIVITIES.map(a => ({ id: a.id, label: a.label, minAge: a.minAge, energie: a.energy })),
    repas: FOOD,
    ...shopView(inv, dep, ret, p.makuta, now),
    travail: { ...workView(job && job.metier_id, lastShift, now), emploiEntreprise: boss ? companyJob(boss) : null },
    ecole: schoolView(enr, dip, now),
    enfants: kids.map(k => childView(k, now)),
    entretienParJour: SUPPORT_PER_DAY,
    entreprises: companyView(ent, { aVendre, offres }, now),
    etat: stateView({ comptes, assureur: p.assureur, assureJusqu: p.assure_jusqu, operateur: p.operateur, credit: p.credit, candidature: cand && cand.poste }, pub, now),
    elections: elec,
    police: policeView({ policiers, prisonJusqu: p.prison_jusqu, casier: casier.map(c => ({ ...c, nom: (CRIMES.find(x => x.id === c.type) || {}).nom || c.type })) }, now),
    voyage: { quartiers: KINSHASA_QUARTIERS, prix: TAXI_FARE, fatigue: TAXI_ENERGY, villes: OTHER_CITIES },
    mouvements,
    notifications: { actives: notifications > 0 },
    consignes: { ...consignes, max: ORDERS_PER_DAY, catalogue: ORDERS, verifieToutesLesMinutes: ORDERS_CHECK_MS / 60e3 },
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

// entretien des enfants : calculé à la demande, pour le personnage et ses enfants mineurs
async function supportFamily(db, pid, now) {
  const { results: kids } = await db.prepare(`SELECT id, ne_le, entretien_le, pere_id, mere_id FROM personnages
      WHERE mort_le IS NULL AND (id = ? OR pere_id = ? OR mere_id = ?)`).bind(pid, pid, pid).all();
  for (const k of kids) {
    const par = k.pere_id || k.mere_id;
    if (!par || ageYears(k.ne_le, now) >= 18) continue;
    const { days, due } = supportDue(k.entretien_le, k.ne_le, now);
    if (days < 1) continue;
    const pr = await db.prepare(`SELECT makuta FROM personnages WHERE id = ? AND mort_le IS NULL`).bind(par).first();
    const pay = Math.min(due, pr ? pr.makuta : 0), unpaid = Math.floor((due - pay) / SUPPORT_PER_DAY), fx = unpaidEffect(unpaid);
    const st = [db.prepare(`UPDATE personnages SET entretien_le = ?, bonheur = MAX(0, bonheur - ?), sante = MAX(0, sante - ?) WHERE id = ?`)
      .bind((k.entretien_le || k.ne_le) + days * DAY, fx.bonheur, fx.sante, k.id)];
    if (pay > 0) st.push(
      db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(pay, par, pay),
      db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(pay, k.id),
      db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), par, k.id, pay, `entretien de l'enfant (${days} j)`, now));
    await db.batch(st);
  }
}

// ---------------------------------------------------------------- lancement
async function launchCounts(db) {
  const a = await db.prepare(`SELECT COUNT(*) AS n FROM personnages WHERE fondateur = 1 AND mort_le IS NULL`).first();
  const b = await db.prepare(`SELECT COUNT(DISTINCT compte_id) AS n FROM depots WHERE offre IN (${OFFERS.filter(o => o.type === "investissement").map(o => `'${o.id}'`).join(",")})`).first();
  const e = await db.prepare(`SELECT COUNT(*) AS n FROM entreprises`).first();
  return { parents: a.n, investisseurs: b.n, entreprises: e.n };
}
async function launch(db, now = Date.now()) {
  const { results } = await db.prepare(`SELECT cle, valeur FROM jeu WHERE cle IN ('demarre_le', 'date_ouverture')`).all();
  const kv = Object.fromEntries(results.map(r => [r.cle, Number(r.valeur)]));
  let S = launchStatus(await launchCounts(db), kv.demarre_le || null, kv.date_ouverture || null, now);
  // démarrage automatique : la date officielle est passée et toutes les conditions sont réunies
  if (!S.demarre && S.pret) {
    await db.prepare(`INSERT OR IGNORE INTO jeu (cle, valeur) VALUES ('demarre_le', ?)`).bind(String(now)).run();
    S = { ...S, demarre: true, demarreLe: now };
  }
  return S;
}
const isAdmin = (env, compte) => !!compte && (env.ADMIN_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean).includes(compte.email);

// crée un compte joueur (inscription ou parent fondateur ajouté par l'administrateur)
async function createAccount(db, body, now, offer, fondateur) {
  const email = String(body.email || "").trim().toLowerCase();
  const pseudo = String(body.pseudo || "").trim().slice(0, 40);
  const pass = String(body.motdepasse || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: [400, "Adresse e-mail invalide."] };
  if (pseudo.length < 2) return { error: [400, "Choisis un pseudo d'au moins 2 caractères."] };
  if (pass.length < 8) return { error: [400, "Le mot de passe doit faire au moins 8 caractères."] };
  if (await db.prepare(`SELECT 1 FROM comptes WHERE email = ?`).bind(email).first()) return { error: [409, "Un compte existe déjà avec cette adresse."] };
  const { hash, salt } = await hashPassword(pass);
  const id = uid();
  await db.prepare(`INSERT INTO comptes (id, email, pseudo, pass_hash, pass_salt, cree_le) VALUES (?, ?, ?, ?, ?, ?)`).bind(id, email, pseudo, hash, salt, now).run();
  const pid = await birth(db, id, now, offer, fondateur);
  return { id, pid };
}

// ---------------------------------------------------------------- routes
const worker = {
  // toutes les 15 minutes (Cron Trigger gratuit) : les personnages suivent leurs consignes, même joueur déconnecté
  async scheduled(event, env, ctx) {
    const db = env.DB, now = Date.now();
    const { results } = await db.prepare(`SELECT DISTINCT c.personnage_id AS pid, p.compte_id FROM consignes c JOIN personnages p ON p.id = c.personnage_id WHERE c.jour = ? AND p.mort_le IS NULL LIMIT 500`).bind(dayKey(now)).all();
    for (const r of results) {
      try {
        const compte = await db.prepare(`SELECT * FROM comptes WHERE id = ? AND vie_id = ?`).bind(r.compte_id, r.pid).first();
        if (!compte) continue;
        await supportFamily(db, r.pid, now);
        const ch = await loadCharacter(db, r.pid);
        if (ch) await applyOrders(env, db, compte, ch, now);
      } catch (e) { console.error(e); }
    }
  },
  // chaque action réussie est inscrite dans les mouvements du personnage (le joueur réel voit tout)
  async fetch(req, env) {
    const post = req.method === "POST", copy = post ? req.clone() : null;
    const res = await worker.handle(req, env);
    if (post && res.ok) {
      try {
        const path = new URL(req.url).pathname;
        if (!["/api/inscription", "/api/connexion"].includes(path) && !path.startsWith("/api/admin/")) {
          const d = describeAction(path, await copy.json().catch(() => ({})), await res.clone().json().catch(() => ({})));
          const compte = d && await auth(env.DB, req, Date.now());
          if (compte) await env.DB.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(uid(), compte.vie_id, d.icone, d.texte, req.headers.get("X-Consigne") ? 1 : 0, Date.now()).run();
        }
      } catch (e) { console.error(e); }
    }
    return res;
  },
  async handle(req, env) {
    const h = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    const db = env.DB;
    const now = Date.now();
    let body = {};
    if (req.method === "POST") { try { body = await req.json(); } catch (e) { return fail(h, 400, "Requête illisible."); } }

    try {
      if (url.pathname === "/api/sante") return json(h, 200, { ok: true, jeu: "2 Life" });

      if (url.pathname === "/api/push/cle" && req.method === "GET") return json(h, 200, { cle: env.VAPID_PUBLIC || null });
      if (url.pathname === "/api/lancement" && req.method === "GET") return json(h, 200, await launch(db));

      if (url.pathname === "/api/inscription" && req.method === "POST") {
        const L = await launch(db);
        if (!L.demarre && !canSignupBeforeLaunch(body.formule) && !isAdmin(env, { email: String(body.email || "").trim().toLowerCase() })) {
          const miss = L.conditions.filter(c => !c.ok).map(c => `${c.label.toLowerCase()} : ${c.actuel}/${c.min}`).join(", ");
          return fail(h, 403, `Le jeu n'a pas encore démarré (${miss || "en attente du lancement"}). Les investisseurs peuvent déjà s'inscrire.`);
        }
        const offer = OFFERS.find(o => o.id === body.formule) || OFFERS[0];
        const r = await createAccount(db, body, now, offer, false);
        if (r.error) return fail(h, ...r.error);
        const token = await newSession(db, r.id, now);
        const compte = await db.prepare(`SELECT * FROM comptes WHERE id = ?`).bind(r.id).first();
        return json(h, 201, { token, ...view(compte, await loadCharacter(db, r.pid), now), naissance: true, admin: isAdmin(env, compte) });
      }

      if (url.pathname === "/api/connexion" && req.method === "POST") {
        const email = String(body.email || "").trim().toLowerCase();
        const c = await db.prepare(`SELECT * FROM comptes WHERE email = ?`).bind(email).first();
        if (!c) return fail(h, 401, "E-mail ou mot de passe incorrect.");
        const { hash } = await hashPassword(String(body.motdepasse || ""), c.pass_salt);
        if (!sameText(hash, c.pass_hash)) return fail(h, 401, "E-mail ou mot de passe incorrect.");
        const token = await newSession(db, c.id, now);
        return json(h, 200, { token, ...view(c, await loadCharacter(db, c.vie_id), now), admin: isAdmin(env, c) });
      }

      // ---- routes réservées aux joueurs connectés
      const compte = await auth(db, req, now);
      if (!compte) return fail(h, 401, "Connecte-toi pour continuer.");

      // ---- administration (e-mails listés dans ADMIN_EMAILS)
      if (url.pathname.startsWith("/api/admin/")) {
        if (!isAdmin(env, compte)) return fail(h, 403, "Réservé à l'administrateur.");
        if (url.pathname === "/api/admin/etat" && req.method === "GET") {
          const { results: parents } = await db.prepare(`SELECT p.prenom, p.nom, p.sexe, p.quartier, c.pseudo, c.email, c.cree_le FROM personnages p JOIN comptes c ON c.id = p.compte_id WHERE p.fondateur = 1 ORDER BY c.cree_le`).all();
          const { results: inv } = await db.prepare(`SELECT c.pseudo, c.email, d.offre, d.usd, d.le FROM depots d JOIN comptes c ON c.id = d.compte_id WHERE d.offre IN ('petit','grand') ORDER BY d.le`).all();
          const { results: ent } = await db.prepare(`SELECT e.nom, e.type, e.local AS quartier, e.cree_le, p.prenom || ' ' || p.nom AS proprietaire FROM entreprises e JOIN personnages p ON p.id = e.proprietaire_id ORDER BY e.cree_le`).all();
          return json(h, 200, { lancement: await launch(db), parents, investisseurs: inv, entreprises: ent, elections: await elections(db, now) });
        }
        if (url.pathname === "/api/admin/parent" && req.method === "POST") {
          const r = await createAccount(db, body, now, OFFERS.find(o => o.id === "parent"), true);
          if (r.error) return fail(h, ...r.error);
          return json(h, 201, { ok: true, lancement: await launch(db) });
        }
        if (url.pathname === "/api/admin/date" && req.method === "POST") {
          const d = Number(body.date);
          if (!Number.isFinite(d) || d < now - 864e5) return fail(h, 400, "Choisis une date à venir.");
          if ((await launch(db)).demarre) return fail(h, 409, "Le jeu a déjà démarré.");
          await db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('date_ouverture', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(String(Math.round(d))).run();
          return json(h, 200, { ok: true, lancement: await launch(db) });
        }
        if (url.pathname === "/api/admin/election" && req.method === "POST") {
          const d = Number(body.date);
          if (!Number.isFinite(d) || d < now) return fail(h, 400, "Choisis une date à venir.");
          if (!(await launch(db)).demarre) return fail(h, 409, "Les élections commencent après le démarrage du jeu.");
          await elections(db, now);
          await db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('election_date', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(String(Math.round(d))).run();
          return json(h, 200, { ok: true, elections: await elections(db, now) });
        }
        if (url.pathname === "/api/admin/demarrer" && req.method === "POST") {
          const L = await launch(db);
          if (L.demarre) return fail(h, 409, "Le jeu a déjà démarré.");
          if (!L.pret) return fail(h, 409, "Toutes les conditions ne sont pas encore réunies.");
          await db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('demarre_le', ?)`).bind(String(now)).run();
          return json(h, 200, { ok: true, lancement: await launch(db) });
        }
        return fail(h, 404, "Route inconnue.");
      }

      await supportFamily(db, compte.vie_id, now);
      const ch = await loadCharacter(db, compte.vie_id);
      if (!ch) return fail(h, 404, "Personnage introuvable.");
      const { p, tal } = ch;

      if (url.pathname === "/api/moi" && req.method === "GET") {
        if (await applyOrders(env, db, compte, ch, now)) return json(h, 200, view(compte, await loadCharacter(db, p.id), Date.now()));
        return json(h, 200, view(compte, ch, now));
      }
      if (url.pathname === "/api/push/abonner" && req.method === "POST") {
        const ep = String(body.endpoint || ""), k = body.keys || {};
        if (!/^https:\/\//.test(ep) || ep.length > 1000 || !k.p256dh || !k.auth) return fail(h, 400, "Abonnement invalide.");
        await db.prepare(`INSERT INTO abonnements_push (endpoint, compte_id, p256dh, auth, cree_le) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET compte_id = excluded.compte_id, p256dh = excluded.p256dh, auth = excluded.auth`)
          .bind(ep, compte.id, String(k.p256dh).slice(0, 200), String(k.auth).slice(0, 100), now).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/push/desabonner" && req.method === "POST") {
        await db.prepare(`DELETE FROM abonnements_push WHERE compte_id = ?`).bind(compte.id).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/consigne" && req.method === "POST") {
        const no = cannotGiveOrder(body.ordre, ch.consignes.liste);
        if (no) return fail(h, 409, no);
        await db.prepare(`INSERT INTO consignes (personnage_id, jour, ordre, donnee_le) VALUES (?, ?, ?, ?)`).bind(p.id, ch.consignes.jour, body.ordre, now).run();
        const c2 = await loadCharacter(db, p.id);
        await applyOrders(env, db, compte, c2, now, true);   // la consigne s'applique tout de suite si possible
        return json(h, 200, view(compte, await loadCharacter(db, p.id), Date.now()));
      }
      if (inPrison(p.prison_jusqu, now) && PRISON_BLOCKED.includes(url.pathname))
        return fail(h, 423, `Tu es en prison jusqu'au ${new Date(p.prison_jusqu).toLocaleString("fr-FR", { timeZone: "Africa/Kinshasa" })}. Paie la caution pour sortir plus tôt.`);

      // ---- élections
      if (url.pathname === "/api/voter" && req.method === "POST") {
        const E = ch.elec;
        if (!E.voteOuvert) return fail(h, 409, E.prochaine ? `Le vote ouvre le ${new Date(E.ouvertureVote).toLocaleDateString("fr-FR")}.` : "Les élections commencent après le démarrage du jeu.");
        if (ageYears(p.ne_le, now) < VOTER_MIN_AGE) return fail(h, 409, `Il faut avoir ${VOTER_MIN_AGE} ans pour voter.`);
        const c = await db.prepare(`SELECT 1 FROM candidatures WHERE personnage_id = ? AND poste = ?`).bind(body.candidat, body.poste).first();
        if (!c) return fail(h, 404, "Candidat introuvable.");
        if (E.mesVotes[body.poste]) return fail(h, 409, "Tu as déjà voté pour ce poste.");
        await db.prepare(`INSERT INTO votes (electeur_id, poste, cycle, candidat_id, le) VALUES (?, ?, ?, ?, ?)`).bind(p.id, body.poste, E.cycle, body.candidat, now).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      // ---- police : délits, amendes, prison
      if (url.pathname === "/api/crime" && req.method === "POST") {
        const cr = CRIMES.find(x => x.id === body.crime);
        if (!cr) return fail(h, 404, "Action inconnue.");
        if (ageYears(p.ne_le, now) < 12) return fail(h, 409, "Trop jeune.");
        await settle(db, p, now);
        if (Math.random() >= catchChance(cr, ch.policiers)) {
          const gain = cr.gain[0] + Math.floor(Math.random() * (cr.gain[1] - cr.gain[0] + 1));
          await db.batch([
            db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(gain, p.id),
            db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), p.id, gain, "gain illégal : " + cr.nom, now),
          ]);
          return json(h, 200, { crime: { attrape: false, gain }, ...view(compte, await loadCharacter(db, p.id), now) });
        }
        const recent = ch.casier.filter(x => x.le > now - RECIDIVE.jours * 864e5).length;
        const sn = sentence(cr, p.makuta, recent), until = sn.prison ? now + PRISON_HOURS * 36e5 : null;
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, bonheur = MAX(0, bonheur - 10), prison_jusqu = COALESCE(?, prison_jusqu) WHERE id = ?`).bind(sn.amende, until, p.id),
          db.prepare(`INSERT INTO infractions (id, personnage_id, type, amende, prison_heures, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, cr.id, sn.amende, sn.heures, now),
          ...taxTo(db, p.id, sn.amende, "amende (police) : " + cr.nom, now),
        ]);
        return json(h, 200, { crime: { attrape: true, ...sn }, ...view(compte, await loadCharacter(db, p.id), now) });
      }
      if (url.pathname === "/api/caution" && req.method === "POST") {
        if (!inPrison(p.prison_jusqu, now)) return fail(h, 409, "Tu n'es pas en prison.");
        if (p.makuta < BAIL) return fail(h, 409, `La caution coûte ${fmtMakuta(BAIL)}.`);
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, prison_jusqu = ? WHERE id = ? AND makuta >= ?`).bind(BAIL, now, p.id, BAIL),
          ...taxTo(db, p.id, BAIL, "caution", now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

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
          ...await payToCompany(db, "maquis", p.id, FOOD.prix, "repas au maquis", now),
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
          ...(item.type === "telephone"
            ? [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, item.prix - Math.round(item.prix * TAX.douane), "achat : " + item.nom, now),
               ...taxTo(db, p.id, Math.round(item.prix * TAX.douane), "droits de douane 10 % (DGDA) : " + item.nom, now)]
            : [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, item.prix, "achat : " + item.nom, now)]),
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

      if (url.pathname === "/api/postuler" && req.method === "POST" && body.entreprise) {
        const e = await db.prepare(`SELECT * FROM entreprises WHERE id = ?`).bind(body.entreprise).first();
        const t = e && COMPANY_TYPES.find(x => x.id === e.type);
        if (!t) return fail(h, 404, "Entreprise introuvable.");
        if (e.proprietaire_id === p.id) return fail(h, 409, "Tu es le patron de cette entreprise.");
        if (ageYears(p.ne_le, now) < 18) return fail(h, 409, "Il faut avoir 18 ans pour travailler dans une entreprise.");
        const n = await db.prepare(`SELECT COUNT(*) AS n FROM emplois WHERE entreprise_id = ? AND fin IS NULL`).bind(e.id).first();
        if (n.n >= t.places) return fail(h, 409, "Plus de place dans cette entreprise.");
        await db.batch([
          db.prepare(`UPDATE emplois SET fin = ? WHERE personnage_id = ? AND fin IS NULL`).bind(now, p.id),
          db.prepare(`INSERT INTO emplois (id, personnage_id, metier_id, entreprise_id, poste, salaire, depuis) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, t.job, e.id, t.poste, t.salaire, now),
        ]);
        return json(h, 200, { embauche: e.nom, ...view(compte, await loadCharacter(db, p.id), now) });
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
        const job = ch.boss ? companyJob(ch.boss) : ch.job && JOBS.find(j => j.id === ch.job.metier_id);
        const no = cannotWork(job, ageYears(p.ne_le, now), p.energie, ch.lastShift, now);
        if (no) return fail(h, 409, no);
        const pay = payFor(job, tal.map(t => ({ talent: t.talent_id, discovered: !!t.decouvert })));
        // 10 % du salaire pour les parents : aux parents joueurs s'il y en a, sinon à la famille du jeu
        pay.famille = familyShare(pay.montant);
        pay.impot = Math.round(pay.montant * TAX.salaire);   // IPR prélevé par la DGI
        const fromState = PUBLIC_JOBS.some(j => j.id === job.id) || !!job.elu;
        const parents = ch.par.map(x => x.id), each = parents.length ? Math.floor(pay.famille / parents.length) : 0;
        const st = [
          db.prepare(`UPDATE personnages SET makuta = makuta + ?, energie = MAX(0, energie - ?), faim = MAX(0, faim - 10) WHERE id = ?`).bind(pay.montant - pay.famille - pay.impot, 35, p.id),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), ch.boss ? ch.boss.id : fromState ? STATE_ID : null, p.id, pay.montant, "salaire : " + job.nom, now),
          ...taxTo(db, p.id, pay.impot, "IPR 5 % (DGI) : " + job.nom, now),
          // dans l'entreprise d'un joueur : la journée rapporte salaire + 60 % à la caisse, qui paie le salaire
          ...(ch.boss ? [db.prepare(`UPDATE entreprises SET caisse = caisse + ? WHERE id = ?`).bind(Math.round(pay.montant * EMPLOYEE_YIELD) - pay.montant, ch.boss.id)] : []),
          ...(pay.famille - each * parents.length > 0 ? [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, pay.famille - each * parents.length, "aide à la famille (10 %)", now)] : []),
          ...parents.flatMap(pid => each ? [
            db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(each, pid),
            db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, pid, each, "aide aux parents (10 % du salaire)", now)] : []),
          db.prepare(`INSERT INTO activites (id, personnage_id, activite, score, resultat, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, "travail:" + job.id, pay.montant, pay.bonus ? "bonus talent" : "", now),
        ];
        await db.batch(st.filter(x => x));
        return json(h, 200, { paie: pay, ...view(compte, await loadCharacter(db, p.id), now) });
      }

      if (url.pathname === "/api/entreprise/ouvrir" && req.method === "POST") {
        const t = COMPANY_TYPES.find(x => x.id === body.type);
        const no = cannotOpenCompany(t, ageYears(p.ne_le, now), p.makuta);
        if (no) return fail(h, 409, no);
        const nom = companyName(t, p.nom, body.nom), eid = uid();
        const [upd] = await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(t.prix, p.id, t.prix),
          db.prepare(`INSERT INTO entreprises (id, nom, type, proprietaire_id, ville_id, local, capital, cree_le) SELECT ?, ?, ?, ?, 'kinshasa', ?, ?, ? WHERE changes() = 1`).bind(eid, nom, t.id, p.id, p.quartier, t.prix, now),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) SELECT ?, ?, NULL, ?, ?, ? WHERE EXISTS (SELECT 1 FROM entreprises WHERE id = ?)`).bind(uid(), p.id, t.prix, "ouverture : " + nom, now, eid),
        ]);
        if (!upd.meta.changes) return fail(h, 409, "Pas assez d'e-makuta.");
        return json(h, 200, { ouverte: nom, ...view(compte, await loadCharacter(db, p.id), now) });
      }

      // ---- banques commerciales
      if ((url.pathname === "/api/banque/deposer" || url.pathname === "/api/banque/retirer") && req.method === "POST") {
        const b = BANKS.find(x => x.id === body.banque), m = Math.floor(Number(body.montant));
        if (!b) return fail(h, 404, "Banque inconnue.");
        if (!(m >= 20)) return fail(h, 400, "Montant invalide (1 e-makuta minimum).");
        if (ageYears(p.ne_le, now) < 16) return fail(h, 409, "Il faut 16 ans pour ouvrir un compte en banque.");
        const acc = ch.comptes.find(x => x.banque === b.id), solde = acc ? bankAccrue(acc, now) : 0, dep = url.pathname.endsWith("deposer");
        if (dep && p.makuta < m) return fail(h, 409, "Tu n'as pas autant d'e-makuta sur toi.");
        if (dep && b.plafond && solde + m > b.plafond) return fail(h, 409, `Cette coopérative accepte au plus ${fmtMakuta(b.plafond)}.`);
        if (!dep && solde < m) return fail(h, 409, "Solde insuffisant.");
        const nv = dep ? solde + m : solde - m;
        await db.batch([
          db.prepare(`INSERT INTO comptes_banque (personnage_id, banque_id, solde, maj_le) VALUES (?, ?, ?, ?) ON CONFLICT(personnage_id, banque_id) DO UPDATE SET solde = excluded.solde, maj_le = excluded.maj_le`).bind(p.id, b.id, nv, now),
          db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(dep ? -m : m, p.id),
          ...(solde - (acc ? acc.solde : 0) > 0 ? [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), "banque:" + b.id, p.id, solde - acc.solde, "intérêts : " + b.nom, now)] : []),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), dep ? p.id : "banque:" + b.id, dep ? "banque:" + b.id : p.id, m, (dep ? "dépôt : " : "retrait : ") + b.nom, now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      // ---- assurances et santé
      if (url.pathname === "/api/assurance" && req.method === "POST") {
        const a = INSURERS.find(x => x.id === body.assureur);
        if (!a) return fail(h, 404, "Assureur inconnu.");
        if (p.makuta < a.prime) return fail(h, 409, `La prime coûte ${fmtMakuta(a.prime)}.`);
        const from = p.assure_jusqu && p.assure_jusqu > now && p.assureur === a.id ? p.assure_jusqu : now;
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, assureur = ?, assure_jusqu = ? WHERE id = ? AND makuta >= ?`).bind(a.prime, a.id, from + a.jours * 864e5, p.id, a.prime),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, "assurance:" + a.id, a.prime, "prime d'assurance : " + a.nom, now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/soigner" && req.method === "POST") {
        await settle(db, p, now);
        if (p.sante >= 95) return fail(h, 409, "Tu es en bonne santé, pas besoin de soins.");
        const c = careCost(p.assure_jusqu, p.assureur, now);
        if (p.makuta < c.prix) return fail(h, 409, `Les soins coûtent ${fmtMakuta(c.prix)}.`);
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, sante = MIN(100, sante + ?) WHERE id = ? AND makuta >= ?`).bind(c.prix, CARE.sante, p.id, c.prix),
          ...(c.prix > 0 ? await payToCompany(db, "pharmacie", p.id, c.prix, "soins au centre de santé", now) : []),
        ]);
        return json(h, 200, { soins: c, ...view(compte, await loadCharacter(db, p.id), now) });
      }

      // ---- téléphone
      if (url.pathname === "/api/telephone/recharger" && req.method === "POST") {
        const o = OPERATORS.find(x => x.id === body.operateur), m = Math.floor(Number(body.montant));
        if (!o || !RECHARGES.includes(m)) return fail(h, 400, "Recharge invalide.");
        if (p.makuta < m) return fail(h, 409, "Pas assez d'e-makuta.");
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, credit = credit + ?, operateur = ? WHERE id = ? AND makuta >= ?`).bind(m, m, o.id, p.id, m),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, "operateur:" + o.id, m, "crédit téléphone : " + o.nom, now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/telephone/appeler" && req.method === "POST") {
        if (!ch.inv.some(x => (SHOP.find(y => y.id === x.objet_id) || {}).type === "telephone")) return fail(h, 409, "Il te faut d'abord un téléphone (au magasin).");
        if (p.credit < CALL.prix) return fail(h, 409, "Plus de crédit : recharge ton téléphone.");
        await settle(db, p, now);
        await db.prepare(`UPDATE personnages SET credit = credit - ?, bonheur = MIN(100, bonheur + ?) WHERE id = ? AND credit >= ?`).bind(CALL.prix, CALL.bonheur, p.id, CALL.prix).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      // ---- élections
      if (url.pathname === "/api/candidature" && req.method === "POST") {
        if (body.poste == null) { await db.prepare(`DELETE FROM candidatures WHERE personnage_id = ?`).bind(p.id).run(); return json(h, 200, view(compte, await loadCharacter(db, p.id), now)); }
        const po = POSTS.find(x => x.id === body.poste);
        if (!po) return fail(h, 404, "Poste inconnu.");
        if (ageYears(p.ne_le, now) < po.minAge) return fail(h, 409, `Il faut avoir ${po.minAge} ans pour être candidat au poste de ${po.nom.toLowerCase()}.`);
        await db.prepare(`INSERT INTO candidatures (personnage_id, poste, le) VALUES (?, ?, ?) ON CONFLICT(personnage_id) DO UPDATE SET poste = excluded.poste, le = excluded.le`).bind(p.id, po.id, now).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      if (url.pathname === "/api/entreprise/encaisser" && req.method === "POST") {
        const e = await db.prepare(`SELECT * FROM entreprises WHERE id = ? AND proprietaire_id = ?`).bind(body.entreprise, p.id).first();
        if (!e) return fail(h, 404, "Entreprise introuvable.");
        const c = await accrue(db, e, now);
        if (c < 1) return fail(h, 409, "La caisse est vide pour l'instant. Reviens plus tard.");
        const impot = Math.round(c * TAX.recettes);   // impôt sur les recettes (DGI)
        await db.batch([
          db.prepare(`UPDATE entreprises SET caisse = caisse - ? WHERE id = ?`).bind(c, e.id),
          db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(c - impot, p.id),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), e.id, p.id, c, "recettes : " + e.nom, now),
          ...taxTo(db, p.id, impot, "impôt 10 % sur les recettes (DGI) : " + e.nom, now),
        ]);
        return json(h, 200, { encaisse: c - impot, impot, ...view(compte, await loadCharacter(db, p.id), now) });
      }

      if (url.pathname === "/api/entreprise/vendre" && req.method === "POST") {
        const prix = body.prix == null ? null : Math.floor(Number(body.prix));
        if (prix != null && !(prix >= 20)) return fail(h, 400, "Prix invalide.");
        const r = await db.prepare(`UPDATE entreprises SET en_vente = ? WHERE id = ? AND proprietaire_id = ?`).bind(prix, body.entreprise, p.id).run();
        if (!r.meta.changes) return fail(h, 404, "Entreprise introuvable.");
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      if (url.pathname === "/api/entreprise/acheter" && req.method === "POST") {
        const e = await db.prepare(`SELECT * FROM entreprises WHERE id = ? AND en_vente IS NOT NULL`).bind(body.entreprise).first();
        if (!e) return fail(h, 404, "Cette entreprise n'est plus en vente.");
        if (e.proprietaire_id === p.id) return fail(h, 409, "C'est déjà ton entreprise.");
        if (ageYears(p.ne_le, now) < 18) return fail(h, 409, "Il faut avoir 18 ans pour acheter une entreprise.");
        if (p.makuta < e.en_vente) return fail(h, 409, `Il te faut ${fmtMakuta(e.en_vente)}.`);
        const c = companyAccrue(e, now).caisse; // l'ancien patron garde les recettes déjà gagnées
        const [pay] = await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(e.en_vente, p.id, e.en_vente),
          db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ? AND changes() = 1`).bind(e.en_vente + c, e.proprietaire_id),
          db.prepare(`UPDATE entreprises SET proprietaire_id = ?, en_vente = NULL, caisse = 0, maj_le = ?, capital = ? WHERE id = ? AND en_vente = ? AND changes() = 1`).bind(p.id, now, e.en_vente, e.id, e.en_vente),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1`).bind(uid(), p.id, e.proprietaire_id, e.en_vente, "rachat : " + e.nom, now),
          ...(c > 0 ? [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT proprietaire_id FROM entreprises WHERE id = ?) = ?`).bind(uid(), e.id, e.proprietaire_id, c, "recettes : " + e.nom, now, e.id, p.id)] : []),
        ]);
        if (!pay.meta.changes) return fail(h, 409, "Pas assez d'e-makuta.");
        return json(h, 200, { achetee: e.nom, ...view(compte, await loadCharacter(db, p.id), now) });
      }

      if (url.pathname === "/api/revendre" && req.method === "POST") {
        const own = ch.inv.find(x => x.id === body.possession), item = own && SHOP.find(x => x.id === own.objet_id);
        if (!item) return fail(h, 404, "Objet introuvable.");
        const gain = Math.floor(item.prix * RESELL_RATE);
        await db.batch([
          db.prepare(`DELETE FROM possessions WHERE id = ? AND proprietaire_id = ?`).bind(own.id, p.id),
          db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(gain, p.id),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), p.id, gain, "revente : " + item.nom, now),
        ]);
        return json(h, 200, { vendu: item.nom, gain, ...view(compte, await loadCharacter(db, p.id), now) });
      }

      if (url.pathname === "/api/voyager" && req.method === "POST") {
        const q = KINSHASA_QUARTIERS.find(x => x === body.quartier);
        if (!q) return fail(h, 400, OTHER_CITIES.includes(body.quartier) ? `${body.quartier} n'est pas encore ouverte.` : "Destination inconnue.");
        if (q === p.quartier) return fail(h, 409, `Tu es déjà à ${q}.`);
        await settle(db, p, now);
        if (ageYears(p.ne_le, now) < 12) return fail(h, 409, "Trop jeune pour prendre le taxi seul.");
        if (p.makuta < TAXI_FARE) return fail(h, 409, `La course coûte ${fmtMakuta(TAXI_FARE)}.`);
        if (p.energie < TAXI_ENERGY) return fail(h, 409, "Trop fatigué pour sortir : repose-toi ou mange.");
        const [r] = await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, energie = MAX(0, energie - ?), quartier = ? WHERE id = ? AND makuta >= ?`).bind(TAXI_FARE, TAXI_ENERGY, q, p.id, TAXI_FARE),
          ...await payToCompany(db, "taxi", p.id, TAXI_FARE, "course en taxi vers " + q, now),
        ]);
        return json(h, 200, { arrive: q, ...view(compte, await loadCharacter(db, p.id), now) });
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

      if (url.pathname === "/api/accueil" && req.method === "POST") {
        if (ageYears(p.ne_le, now) < HOST_MIN_AGE) return fail(h, 409, `Il faut avoir ${HOST_MIN_AGE} ans pour accueillir un enfant.`);
        await db.prepare(`UPDATE personnages SET accueille_enfants = ? WHERE id = ?`).bind(body.actif ? 1 : 0, p.id).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      if (url.pathname === "/api/enfant/nourrir" && req.method === "POST") {
        const k = ch.kids.find(x => x.id === body.enfant), item = SHOP.find(x => x.id === body.objet && x.type === "nourriture");
        if (!k || !item) return fail(h, 400, "Enfant ou repas introuvable.");
        if (p.makuta < item.prix) return fail(h, 409, "Pas assez d'e-makuta.");
        const n = needsAt({ hunger: k.faim, energy: k.energie, happiness: k.bonheur, health: k.sante, updatedAt: k.maj_le }, now), e = item.effet || {};
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(item.prix, p.id, item.prix),
          db.prepare(`UPDATE personnages SET faim = ?, energie = ?, bonheur = ?, sante = ?, maj_le = ? WHERE id = ?`)
            .bind(Math.min(100, n.hunger + (e.faim || 0)), n.energy, Math.min(100, n.happiness + (e.bonheur || 0) + 3), n.health, now, k.id),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, item.prix, `repas pour ${k.prenom} : ${item.nom}`, now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
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
export default worker;
