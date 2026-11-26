// 2 Life : serveur du jeu (Cloudflare Worker + base D1).
// Le serveur est l'arbitre : il décide de l'âge, des talents et de l'argent ; le téléphone ne fait qu'afficher.
import {
  ageYears, stageOf, STAGES, realMsUntil, TALENTS, ACTIVITIES, rng, drawTalents, doActivity,
  needsAt, newIdentity, BIRTH_GIFT, BIRTH_USD, ADMIN_FEE_USD, NEGLECT_STEAL_AGE, neglectStealChance, NEGLECT_DANGER_DAYS, NEGLECT_DANGER_HEALTH, splitEstate, deathCause, familyShareRate, REP, REP_BAD, REP_GOOD, repLabel, repDiscount, DOT_MAKUTA, cannotMarry, STREET_JOBS, cannotStreetJob, RENT, rentOf, houseOf, rentDue, HOUSING_MIN_AGE, SALE_TAX, LIFE_EVENTS, EVENT_EVERY_H, drawEntry, classOfWealth, classLabel, eduLabel, MATURITY_GAIN, BIG_DECISIONS, cannotDecide, dashboard, SETTINGS, SET, applySettings, food, drawEvent, eventMoney, lifeAlbum, SHOP, cannotBuy, OFFERS, USD_TO_MAKUTA, USD_UNITS, fmtMakuta, WITHDRAW_FEE, walletInfo, birthShiftMs, REAL_MONEY, shopView, familyOf, JOBS, payFor, cannotWork, workView, cannotApply, FORMATIONS, cannotEnroll, attendCourse, schoolView, SUPPORT_PER_DAY, HOST_MIN_AGE, MAX_CHILDREN, supportDue, unpaidEffect, familyShare, DAY, LAUNCH_RULES, launchStatus, canSignupBeforeLaunch, COMPANY_TYPES, cannotOpenCompany, companyName, companyView, companyAccrue, companyJob, EMPLOYEE_YIELD, RESELL_RATE, TAXI_FARE, TAXI_ENERGY, KINSHASA_QUARTIERS, OTHER_CITIES, STATE_ID, TAX, POSTS, PUBLIC_JOBS, BANKS, bankAccrue, INSURERS, CARE, careCost, ACCIDENT, injuredBlocks, accidentText, ROAD_FAULTS, roadFaultText, ELECTION_FEE, cannotRun, ELECTION_CAMPAIGN, cannotCampaignElec, electionScores, resultLine, OPERATORS, RECHARGES, CALL, stateView, ELECTION_EVERY, VOTER_MIN_AGE, electionCalendar, tally, CRIMES, catchChance, sentence, inPrison, PRISON_BLOCKED, PRISON_HOURS, BAIL, RECIDIVE, policeView,
  describeAction, ORDER_DONE, ORDERS, ORDERS_PER_DAY, ORDERS_CHECK_MS, dayKey, ordersToRun, cannotGiveOrder,
  PAY_METHODS, cannotDeposit, cannotWithdraw, maskPhone, withdrawUsd, COMMUNES, communeView, ROLES, drawRole, roleOf,
  streakStep, streakView, nightSummary, morningText, reminderText, kinHour,
  newspaper, cannotSendWord, neighborView, GREETINGS, WORD_MAX,
  AD_SPOTS, AD_COLORS, adPrice, cannotCreateAd, adView, adShownIn, PUBLIC_COMPANIES, BILLS, SOE_RESERVE, STATE_SEED, vatOf, publicPayer, billsFor, homeConso, soeView, promoPrice, cannotPromote, PROMO_PRICE, PROMO_MAX_DAYS, tickerItems, cannotCreateCommunique, goalsView, newlyReached, cannotChooseGoal, GOAL_REP, pickStars, STAR_DOMAINS,
  BUDGET_POSTS, LIFESTYLES, LIFESTYLE_MIN_AGE, lifestyleCost, lifestyleFor, lifestyleStep, lifeExpectancy, OLD_AGE_HEALTH, tenueBlocks, livingView, CHILD_REAL_DAYS,
  LAWS, VAT_LIMITS, cannotSetVat, BUDGET_LINES, cleanBudget, budgetText, PARLIAMENT, PARLIAMENT_SEATS, cannotProposeLaw, LAW_TYPES, cleanLaw, lawText, lawTitle, cannotVoteBill, billOutcome, attendance, dechuText,
  CELEB_DOMAINS, celebStory, celebFromMoves, celebClean, pickCelebrities, protestChance, protestText, PROTEST_REP,
  OFFERING, offeringTax, pioneerView, titheOf, cannotGiveOffering, offeringReceipt, celebLive, celebEvent, CELEB_VISITS_PER_DAY,
  CAMPAIGN_MAX_DAYS, ambassadorFee, cannotHireAmbassador, LEAGUE_NAME, NPC_CLUBS, CLUB_MIN_AGE, CLUB_MAX_AGE, MATCH_GATE, clubStrength, playMatch, pairClubs, standings, seasonKey, scorersText, cannotRecruit, CLUB_CONTRACT_DAYS, cannotAddLogo, LOGOS_MAX_SHOWN,
  thoughtFacts, thoughtFallback, thoughtPrompt, cleanThought, THOUGHT_MODEL,
  TRAFFIC_TICKETS, trafficTicket, permitStatus, CLOCK, prelaunchBlocked, ownVehicle, opportunities, BIKE_ENERGY,
} from "./life.js";
import { sendPush, newVapidKeys } from "./webpush.js";
import { payConfigured, startDeposit, startPayout, readNotice } from "./paiement.js";

const SESSION_DAYS = 30;
// un repas au maquis : prix recalculé avec les réglages de l'admin
const FOOD = { get prix() { return food().prix; }, get faim() { return food().faim; } };
// réglages en direct : relus dans D1 au plus toutes les 30 s
let setAt = 0;
async function loadSettings(db, now, force) {
  if (!force && now - setAt < 30e3) return;
  setAt = now;
  try { const { results } = await db.prepare(`SELECT cle, valeur FROM reglages`).all(); applySettings(Object.fromEntries(results.map(r => [r.cle, r.valeur]))); } catch (e) { console.error(e); }
  try { await loadLaws(db); } catch (e) { console.error(e); }
  try { const d = await db.prepare(`SELECT valeur FROM jeu WHERE cle = 'demarre_le'`).first(); CLOCK.pause = !d; } catch (e) { console.error(e); }
}
// avant le lancement, le temps ne passe pas : à chaque passage du Cron (et au lancement), toutes les dates de vie
// avancent du temps écoulé. Âge, faim, maturité, entretien et caisses des entreprises restent donc figés.
async function freezeTime(db, now) {
  const t = await db.prepare(`SELECT valeur FROM jeu WHERE cle = 'pause_tick'`).first();
  const d = t ? now - Number(t.valeur) : 0;
  const st = [db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('pause_tick', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(String(now))];
  if (d > 0) st.push(
    db.prepare(`UPDATE personnages SET ne_le = ne_le + ?, maj_le = maj_le + ?, entretien_le = CASE WHEN entretien_le IS NULL THEN NULL ELSE entretien_le + ? END WHERE mort_le IS NULL`).bind(d, d, d),
    db.prepare(`UPDATE origines SET arrive_le = arrive_le + ?`).bind(d),
    db.prepare(`UPDATE entreprises SET maj_le = maj_le + ? WHERE maj_le IS NOT NULL`).bind(d),
    db.prepare(`UPDATE logements SET depuis = depuis + ?, paye_jusqu = CASE WHEN paye_jusqu IS NULL THEN NULL ELSE paye_jusqu + ? END`).bind(d, d));
  await db.batch(st);
}
// lois en vigueur : TVA fixée par décret du Président, budget voté par le Parlement (table jeu)
async function loadLaws(db) {
  const { results } = await db.prepare(`SELECT cle, valeur FROM jeu WHERE cle IN ('tva', 'tva_le', 'budget', 'budget_le', 'loi_amendes', 'loi_salaires')`).all();
  const kv = Object.fromEntries(results.map(r => [r.cle, r.valeur]));
  let b = {}; try { b = kv.budget ? JSON.parse(kv.budget) : {}; } catch (e) { }
  LAWS.tva = Number(kv.tva) || 16; LAWS.tvaLe = Number(kv.tva_le) || null; LAWS.budgetLe = Number(kv.budget_le) || null;
  LAWS.budget = { ...Object.fromEntries(BUDGET_LINES.map(l => [l.id, 0])), ...b };
  LAWS.amendes = Number(kv.loi_amendes) || 100; LAWS.salaires = Number(kv.loi_salaires) || 100;
}

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
  // parcours normal : c'est le jeu qui décide, bébé ou jeune adulte (classe sociale et études tirées au sort)
  const entry = !offer || offer.id === "bebe" ? drawEntry(r) : null, adultEntry = !!(entry && entry.adulte);
  const born = offer && offer.age ? now - birthShiftMs(offer.age + .01) : adultEntry ? now - birthShiftMs(entry.age + .01) : now;
  const gift = parent ? offer.epargne : invest ? offer.usd * USD_UNITS : BIRTH_GIFT + (adultEntry ? entry.epargne : 0);
  // le bébé naît chez un parent joueur qui accueille des enfants (sinon dans une famille gérée par le jeu)
  let host = null;
  if ((!offer || !offer.age) && !adultEntry) host = await db.prepare(`SELECT p.id, p.sexe, p.prenom, p.nom, p.quartier, p.makuta FROM personnages p
      WHERE p.compte_id IS NOT NULL AND p.mort_le IS NULL AND p.accueille_enfants = 1 AND p.ne_le <= ?
        AND (SELECT COUNT(*) FROM personnages k WHERE (k.pere_id = p.id OR k.mere_id = p.id) AND k.mort_le IS NULL) < ?
      ORDER BY RANDOM() LIMIT 1`).bind(now - birthShiftMs(HOST_MIN_AGE), MAX_CHILDREN).first();
  if (host) {
    const other = host.sexe === "M" ? who.mother.split(" ")[0] : who.father.split(" ")[0];
    who.lastName = host.nom; who.quartier = host.quartier;
    who.father = host.sexe === "M" ? host.prenom + " " + host.nom : other + " " + host.nom;
    who.mother = host.sexe === "F" ? host.prenom + " " + host.nom : other + " " + host.nom;
  }
  // bébé chez un parent joueur : les 10 $ (après les 5 $ de l'administrateur) sont confiés au parent, qui gère l'argent de l'enfant
  const toParent = !!host && !parent && !invest;
  const destin = drawRole(r);   // caractère et rôle, bon ou mauvais : c'est le serveur qui décide
  const classe = entry ? (host ? classOfWealth(host.makuta) : entry.classe) : classOfWealth(gift);
  const stmts = [
    db.prepare(`INSERT INTO personnages (id, compte_id, ville_id, prenom, nom, sexe, quartier, apparence, ne_le, maj_le, makuta, pere_nom, mere_nom, pere_id, mere_id, accueille_enfants, entretien_le, fondateur)
                VALUES (?, ?, 'kinshasa', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, compteId, who.firstName, who.lastName, who.sex, who.quartier, who.look, born, now, toParent ? 0 : gift, who.father, who.mother,
        host && host.sexe === "M" ? host.id : null, host && host.sexe === "F" ? host.id : null, parent ? 1 : 0, now, fondateur ? 1 : 0),
    ...(toParent ? [db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(gift, host.id)] : []),
    db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`)
      .bind(uid(), toParent ? host.id : id, gift, parent ? "épargne de départ (naître parent)" : invest ? "investissement simulé : " + offer.nom
        : toParent ? `naissance de ${who.firstName} : argent de l'enfant confié aux parents` : adultEntry ? `arrivée adulte : 10 $ confiés + économies (${classLabel(classe).toLowerCase()})` : "naissance : argent de l'enfant (géré par la famille)", now),
    db.prepare(`INSERT INTO origines (personnage_id, classe, adulte, maturite, arrive_le, caractere, role, camp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, classe, adultEntry ? 1 : 0, adultEntry ? 0 : 100, now, destin.caractere, destin.role, destin.camp),
    repSt(db, id, (ROLES.find(x => x.id === destin.role) || {}).rep || 0, now),
    ...(adultEntry ? entry.diplomes.map(f => db.prepare(`INSERT OR IGNORE INTO diplomes_obtenus (personnage_id, formation_id, obtenu_le, note) VALUES (?, ?, ?, NULL)`).bind(id, f, now)) : []),
    db.prepare(`INSERT INTO depots (id, compte_id, offre, usd, makuta, simule, le) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid(), compteId, fondateur ? "fondateur" : offer ? offer.id : "bebe", fondateur ? 0 : offer ? offer.usd : BIRTH_USD, invest ? gift : 0, REAL_MONEY ? 0 : 1, now),
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
  const tva = vatOf(amount), net = amount - tva;   // la TVA (fixée par le Président, comprise dans le prix) va au Trésor
  return [
    ...(e ? [db.prepare(`UPDATE entreprises SET caisse = caisse + ? WHERE id = ?`).bind(net, e.id)] : []),
    db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), payerId, e ? e.id : null, net, motif, now),
    ...taxTo(db, payerId, tva, "TVA " + LAWS.tva + " % (DGI) : " + motif, now),
  ];
}
// dépenses du quotidien : le client choisit une entreprise de joueur parmi ces types. Celles qui ont une campagne ou une
// promotion en cours sont choisies deux fois sur trois (la publicité attire les clients). La TVA va au Trésor.
async function payToCompanies(db, types, payerId, amount, motif, now) {
  const e = types.length ? await db.prepare(`SELECT e.id FROM entreprises e WHERE e.type IN (${types.map(() => "?").join(",")}) AND e.proprietaire_id != ?
      ORDER BY CASE WHEN (EXISTS (SELECT 1 FROM campagnes c WHERE c.entreprise_id = e.id AND c.fin > ?) OR EXISTS (SELECT 1 FROM pubs u WHERE u.annonceur = e.nom AND u.actif = 1 AND u.fin > ?)) AND ABS(RANDOM()) % 3 > 0 THEN 0 ELSE 1 END, RANDOM() LIMIT 1`)
    .bind(...types, payerId, now, now).first() : null;
  const tva = vatOf(amount), net = amount - tva;
  return [
    ...(e ? [db.prepare(`UPDATE entreprises SET caisse = caisse + ? WHERE id = ?`).bind(net, e.id)] : []),
    ...(net > 0 ? [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), payerId, e ? e.id : null, net, motif, now)] : []),
    ...taxTo(db, payerId, tva, "TVA " + LAWS.tva + " % (DGI) : " + motif, now),
  ];
}
// ---- train de vie : une fois par jour (heure de Kinshasa), chaque adulte dépense pour vivre selon ses moyens
async function dailyLiving(db, pid, now) {
  const jour = dayKey(now);
  const p = await db.prepare(`SELECT * FROM personnages WHERE id = ? AND mort_le IS NULL`).bind(pid).first();
  if (!p || ageYears(p.ne_le, now) < LIFESTYLE_MIN_AGE) return false;
  await db.prepare(`INSERT OR IGNORE INTO train_de_vie (personnage_id, maj_le) VALUES (?, ?)`).bind(pid, now).run();
  const claim = await db.prepare(`UPDATE train_de_vie SET dernier_jour = ? WHERE personnage_id = ? AND (dernier_jour IS NULL OR dernier_jour != ?)`).bind(jour, pid, jour).run();
  if (!claim.meta || !claim.meta.changes) return false;
  const st = await db.prepare(`SELECT * FROM train_de_vie WHERE personnage_id = ?`).bind(pid).first();
  await settle(db, p, now);
  const l = lifestyleFor(st.niveau, p.makuta), nx = lifestyleStep(st, l), cost = l ? lifestyleCost(l.id) : 0;
  const age = ageYears(p.ne_le, now), esp = lifeExpectancy(nx.vitalite), vieux = age > esp;
  const e = l ? l.effet : { faim: 0, sante: -3, bonheur: -6 };
  const M = (ic, t) => db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), pid, ic, t, now);
  const stmts = [
    db.prepare(`UPDATE personnages SET makuta = makuta - ?, faim = MIN(100, faim + ?), sante = MAX(0, MIN(100, sante + ?)), bonheur = MAX(0, MIN(100, bonheur + ?)) WHERE id = ? AND makuta >= ?`)
      .bind(cost, e.faim, e.sante - (vieux ? OLD_AGE_HEALTH : 0), e.bonheur, pid, cost), GUARD(db),
    db.prepare(`UPDATE train_de_vie SET tenue = ?, vitalite = ?, dernier_niveau = ?, depense_jour = ?, maj_le = ? WHERE personnage_id = ?`).bind(nx.tenue, nx.vitalite, l ? l.id : null, cost, now, pid),
  ];
  if (l) for (const [post, amount] of Object.entries(l.postes)) {
    const b = BUDGET_POSTS.find(x => x.id === post);
    if (amount > 0) stmts.push(...await payToCompanies(db, b.vers, pid, amount, `${b.label.toLowerCase()} (train de vie ${l.nom.toLowerCase()})`, now));
  }
  stmts.push(l ? M(l.icone, `Dépenses du jour, train de vie ${l.nom.toLowerCase()}${st.niveau === "auto" ? " (choisi selon ses moyens)" : st.niveau !== l.id ? " (l'argent manque pour mieux)" : ""} : ${fmtMakuta(cost)}.`)
    : M("😣", `${p.prenom} n'a pas de quoi acheter à manger aujourd'hui : la santé et le moral baissent.`));
  if (vieux) stmts.push(M("👴", `${p.prenom} a dépassé son espérance de vie (${esp} ans) : la vieillesse fait baisser sa santé chaque jour.`));
  await db.batch(stmts);
  return true;
}
// ---- football : un match par jour pour chaque club (gardé par la clé « jour_foot »)
async function clubRoster(db, ids) {
  if (!ids.length) return {};
  const { results } = await db.prepare(`SELECT m.entreprise_id AS club, p.id, p.prenom, p.nom, t.niveau FROM emplois m JOIN personnages p ON p.id = m.personnage_id
      LEFT JOIN talents_personnage t ON t.personnage_id = p.id AND t.talent_id = 'sport' WHERE m.fin IS NULL AND p.mort_le IS NULL AND m.entreprise_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  const out = Object.fromEntries(ids.map(i => [i, []])); results.forEach(r => out[r.club].push(r)); return out;
}
async function dailyFootball(db, now) {
  const jour = dayKey(now), k = await db.prepare(`SELECT valeur FROM jeu WHERE cle = 'jour_foot'`).first();
  if (k && k.valeur === jour) return;
  await db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('jour_foot', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(jour).run();
  const { results: clubs } = await db.prepare(`SELECT id, nom FROM entreprises WHERE type = 'club' LIMIT 40`).all();
  const roster = await clubRoster(db, clubs.map(c => c.id));
  const teams = clubs.filter(c => roster[c.id].length).map(c => ({ ...c, force: clubStrength(roster[c.id]), joueurs: roster[c.id] })).concat(NPC_CLUBS);
  const saison = seasonKey(now), st = [];
  for (const [a, b] of pairClubs(teams, jour)) {
    const [ga, gb] = playMatch(a.force, b.force), buteurs = [];
    for (const [t, g] of [[a, ga], [b, gb]]) if (t.joueurs) for (let i = 0; i < g; i++) { const j = t.joueurs[Math.floor(Math.random() * t.joueurs.length)]; buteurs.push(j); }
    st.push(db.prepare(`INSERT INTO matchs (id, saison, jour, dom_id, dom_nom, ext_id, ext_nom, buts_dom, buts_ext, buteurs, le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(uid(), saison, jour, a.id, a.nom, b.id, b.nom, ga, gb, scorersText(buteurs.map(j => `${j.prenom} ${j.nom}`)), now));
    for (const [t, me, them] of [[a, ga, gb], [b, gb, ga]]) {
      if (!t.joueurs) continue;
      const gate = me > them ? MATCH_GATE.victoire : me === them ? MATCH_GATE.nul : MATCH_GATE.defaite, other = t === a ? b : a;
      st.push(db.prepare(`UPDATE entreprises SET caisse = caisse + ? WHERE id = ?`).bind(gate, t.id), tx(db, null, t.id, gate, `billetterie : ${a.nom} - ${b.nom}`, now));
      for (const j of t.joueurs) st.push(db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '⚽', ?, 0, ?)`)
        .bind(uid(), j.id, `Match ${t.nom} ${me}-${them} ${other.nom}${me > them ? " : victoire !" : me === them ? " : match nul." : " : défaite."}${buteurs.filter(x => x.id === j.id).length ? ` ${j.prenom} a marqué ${buteurs.filter(x => x.id === j.id).length} but${buteurs.filter(x => x.id === j.id).length > 1 ? "s" : ""} !` : ""}`, now));
      for (const j of new Set(buteurs.filter(x => t.joueurs.includes(x)))) st.push(repSt(db, j.id, 1, now), db.prepare(`UPDATE personnages SET bonheur = MIN(100, bonheur + 8) WHERE id = ?`).bind(j.id));
    }
  }
  if (st.length) await db.batch(st);
  TICKER.at = 0;
}
async function footView(db, now, mine = []) {
  const saison = seasonKey(now);
  const { results: m } = await db.prepare(`SELECT * FROM matchs WHERE saison = ? ORDER BY le DESC LIMIT 400`).bind(saison).all();
  const last = m.length ? m.filter(x => x.jour === m[0].jour) : [];
  const ids = mine.map(e => e.id), roster = await clubRoster(db, ids);
  return { ligue: LEAGUE_NAME, saison, classement: standings(m), derniers: last.map(x => ({ dom: x.dom_nom, ext: x.ext_nom, bd: x.buts_dom, be: x.buts_ext, buteurs: x.buteurs })),
    mesClubs: mine.map(e => ({ id: e.id, nom: e.nom, force: clubStrength(roster[e.id]), joueurs: roster[e.id].map(j => ({ id: j.id, nom: `${j.prenom} ${j.nom}` })) })), gains: MATCH_GATE };
}
// ---- stars de la ville : les meilleurs personnages de chaque domaine, choisis par le serveur chaque jour
const TICKER = { at: 0, data: null };
const hashCode = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
// ---- célébrités : vrais joueurs d'abord (nom de famille abrégé), complétés par des personnages du jeu ; cache 10 minutes
const CELEBS = { at: 0, data: null };
async function celebrities(db, now) {
  if (CELEBS.data && now - CELEBS.at < 10 * 60e3) return CELEBS.data;
  const q = async (sql, ...b) => (await db.prepare(sql).bind(...b).all()).results;
  const base = `p.id, p.prenom, p.nom, p.sexe, p.quartier, p.ne_le, p.prison_jusqu, COALESCE(r.points, 0) AS rep, (SELECT quartier || '|' || statut FROM logements WHERE personnage_id = p.id) AS loge,
      (SELECT niveau FROM train_de_vie WHERE personnage_id = p.id) AS train, EXISTS (SELECT 1 FROM blessures WHERE personnage_id = p.id) AS blesse`, rj = `LEFT JOIN reputations r ON r.personnage_id = p.id`, alive = `p.mort_le IS NULL AND p.compte_id IS NOT NULL`;
  const byTalent = t => q(`SELECT ${base} FROM talents_personnage t JOIN personnages p ON p.id = t.personnage_id ${rj} WHERE t.talent_id = ? AND t.decouvert = 1 AND ${alive} ORDER BY t.niveau DESC, rep DESC LIMIT 3`, t);
  const POSTE = { president: ["Président de la République", "Présidente de la République"], senateur: ["Sénateur", "Sénatrice"], depute: ["Député national", "Députée nationale"] };
  const cands = {
    politique: await q(`SELECT ${base}, m.poste FROM mandats m JOIN personnages p ON p.id = m.personnage_id ${rj} WHERE m.fin IS NULL AND ${alive} ORDER BY m.voix DESC LIMIT 3`),
    sport: await byTalent("sport"), musique: await byTalent("art"),
    religion: await q(`SELECT ${base}, e.metier_id AS metier FROM emplois e JOIN personnages p ON p.id = e.personnage_id ${rj} WHERE e.fin IS NULL AND e.metier_id IN ('grand-pasteur', 'pasteur', 'chef-chorale') AND ${alive}
      ORDER BY CASE e.metier_id WHEN 'grand-pasteur' THEN 0 WHEN 'pasteur' THEN 1 ELSE 2 END, rep DESC LIMIT 3`),
    academique: await q(`SELECT ${base} FROM diplomes_obtenus d JOIN personnages p ON p.id = d.personnage_id ${rj} WHERE ${alive} AND d.formation_id != 'permis' GROUP BY p.id HAVING COUNT(*) >= 2 ORDER BY COUNT(*) DESC, rep DESC LIMIT 3`),
    autres: await q(`SELECT ${base} FROM entreprises e JOIN personnages p ON p.id = e.proprietaire_id ${rj} WHERE ${alive} GROUP BY p.id ORDER BY SUM(e.capital) DESC LIMIT 3`),
  };
  const seen = new Set();
  for (const k in cands) cands[k] = cands[k].filter(x => !seen.has(x.id) && seen.add(x.id)).map(x => ({ id: x.id, prenom: x.prenom, nom: x.nom.charAt(0) + ".", sexe: x.sexe, quartier: x.quartier, rep: x.rep,
    age: Math.floor(ageYears(x.ne_le, now)), titre: x.poste ? POSTE[x.poste][x.sexe === "F" ? 1 : 0] : x.metier ? (JOBS.find(j => j.id === x.metier) || {}).nom : undefined,
    logement: x.loge ? { quartier: x.loge.split("|")[0], statut: x.loge.split("|")[1] } : null, train: x.train || null, blesse: !!x.blesse, prison: !!(x.prison_jusqu && x.prison_jusqu > now), metier: x.metier || null }));
  const L = pickCelebrities(cands, now), real = {};
  for (const c of L.celebrites) {
    if (c.pnj) { Object.assign(c, celebStory(c, hashCode(c.id + L.jour.slice(0, 7)))); continue; }
    const mv = await q(`SELECT icone, texte, le FROM mouvements WHERE personnage_id = ? AND texte NOT LIKE '%guichet%' AND texte NOT LIKE '%retrait%' AND texte NOT LIKE '%dépôt%' ORDER BY le DESC LIMIT 60`, c.id);
    Object.assign(c, celebFromMoves(c, mv, now), { actualites: mv.slice(0, 4).map(m => ({ icone: m.icone, texte: celebClean(m.texte, ["📜", "🏛️", "🎖️", "🗳️"].includes(m.icone)) })) });
    const pub = "j-" + hashCode(c.id); real[pub] = { id: c.id, metier: c.metier || null }; c.id = pub;   // l'identifiant interne du joueur n'est pas exposé
  }
  if (!L.celebrites.some(c => c.id === L.aLaUne)) L.aLaUne = L.celebrites[0].id;
  CELEBS.at = now; CELEBS.data = L; CELEBS.real = real;
  return L;
}
// réactions de la rue : le serveur décide s'il y a une manifestation contre une décision impopulaire
function protestSt(db, type, valeur, auteurId, now) {
  const ch = protestChance(type, valeur), roll = (hashCode(String(now) + type) % 1000) / 1000;
  if (roll >= ch) return [];
  const texte = protestText(type, typeof valeur === "object" ? 0 : valeur, hashCode(String(now)));
  return [communiqueSt(db, "Kinshasa", texte, now, 3), repSt(db, auteurId, -PROTEST_REP, now),
    db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '📢', ?, 0, ?)`).bind(uid(), auteurId, texte + ` Ta popularité baisse (réputation −${PROTEST_REP}).`, now)];
}
async function cityStars(db, now) {
  const q = async (sql, ...b) => (await db.prepare(sql).bind(...b).all()).results;
  const base = `p.id, p.prenom, p.nom, p.sexe, p.quartier, p.ne_le, p.compte_id`;
  const byTalent = t => q(`SELECT ${base} FROM talents_personnage t JOIN personnages p ON p.id = t.personnage_id LEFT JOIN reputations r ON r.personnage_id = p.id
      WHERE t.talent_id = ? AND t.decouvert = 1 AND p.mort_le IS NULL ORDER BY t.niveau DESC, COALESCE(r.points, 0) DESC LIMIT 3`, t);
  const cands = {};
  for (const d of STAR_DOMAINS) if (d.talent) cands[d.id] = await byTalent(d.talent);
  cands.affaires = await q(`SELECT ${base} FROM entreprises e JOIN personnages p ON p.id = e.proprietaire_id WHERE p.mort_le IS NULL GROUP BY p.id ORDER BY SUM(e.capital) DESC LIMIT 3`);
  cands.politique = await q(`SELECT ${base}, m.poste AS titre FROM mandats m JOIN personnages p ON p.id = m.personnage_id WHERE m.fin IS NULL AND p.mort_le IS NULL ORDER BY m.voix DESC LIMIT 3`);
  if (!cands.politique.length) cands.politique = await q(`SELECT ${base} FROM candidatures c JOIN personnages p ON p.id = c.personnage_id WHERE p.mort_le IS NULL LIMIT 3`);
  const POSTE = { president: "Président", senateur: "Sénateur", depute: "Député" };
  for (const k in cands) cands[k] = cands[k].map(x => ({ ...x, age: Math.floor(ageYears(x.ne_le, now)), titre: x.titre ? POSTE[x.titre] || x.titre : undefined, joueur: !!x.compte_id, compte_id: undefined, ne_le: undefined }));
  const stars = pickStars(cands, now, (h, dom) => { const sx = (h >>> 5) % 2 ? "F" : "M", n = newIdentity(() => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296), sx); return { prenom: n.firstName, nom: n.lastName, sexe: sx, quartier: n.quartier }; });
  // vraie actualité des stars joueurs : leurs derniers mouvements publics (sans argent du guichet)
  for (const s of stars) if (!s.pnj) {
    const mv = await q(`SELECT icone, texte FROM mouvements WHERE personnage_id = ? AND texte NOT LIKE '%guichet%' AND texte NOT LIKE '%retrait%' AND texte NOT LIKE '%dépôt%' ORDER BY le DESC LIMIT 4`, s.id);
    if (mv.length) s.actualites = mv.map(m => ({ icone: m.icone, texte: `${s.prenom} : ${m.texte.charAt(0).toLowerCase()}${m.texte.slice(1)}` }));
  }
  return stars;
}
// ---- soldes du grand livre (Trésor, sociétés publiques) : entrées moins sorties
async function ledger(db, ids) {
  const out = Object.fromEntries(ids.map(i => [i, 0]));
  const ph = ids.map(() => "?").join(",");
  const { results: a } = await db.prepare(`SELECT vers_id AS id, SUM(montant) AS n FROM transactions WHERE vers_id IN (${ph}) GROUP BY vers_id`).bind(...ids).all();
  const { results: b } = await db.prepare(`SELECT de_id AS id, SUM(montant) AS n FROM transactions WHERE de_id IN (${ph}) GROUP BY de_id`).bind(...ids).all();
  a.forEach(x => out[x.id] += x.n); b.forEach(x => out[x.id] -= x.n);
  return out;
}
const PUBLIC_IDS = [STATE_ID, ...PUBLIC_COMPANIES.map(c => c.id)];
// garde-fou : placé juste après un débit conditionnel dans un db.batch, il annule tout le lot si ce débit n'a rien changé
// (solde insuffisant, ou deux clics en même temps). Le lot étant une transaction, rien n'est payé ni livré à moitié.
const GUARD = db => db.prepare(`INSERT OR REPLACE INTO garde (id, ok) VALUES (1, changes())`);
const guardFailed = e => /CHECK constraint failed/i.test(String(e && e.message || e));
const tx = (db, de, vers, montant, motif, now) => db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), de, vers, montant, motif, now);
// salaires dus aux agents publics quand la caisse était vide : payés dès que l'argent rentre
async function payArrears(db, now, pid = null) {
  const { results } = await db.prepare(`SELECT * FROM arrieres WHERE paye_le IS NULL ${pid ? "AND personnage_id = ?" : ""} ORDER BY le LIMIT 200`).bind(...(pid ? [pid] : [])).all();
  if (!results.length) return 0;
  const sol = await ledger(db, PUBLIC_IDS); let n = 0;
  for (const a of results) {
    const from = (sol[a.payeur_id] || 0) >= a.montant ? a.payeur_id : (sol[STATE_ID] || 0) >= a.montant ? STATE_ID : null;
    if (!from) continue;
    sol[from] -= a.montant; const imp = Math.round(a.montant * TAX.salaire); sol[STATE_ID] += imp; n++;
    await db.batch([
      db.prepare(`UPDATE arrieres SET paye_le = ? WHERE id = ? AND paye_le IS NULL`).bind(now, a.id),
      db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(a.montant - imp, a.personnage_id),
      tx(db, from, a.personnage_id, a.montant, "arriéré de salaire payé : " + a.motif, now),
      tx(db, a.personnage_id, STATE_ID, imp, "IPR 5 % (DGI) : arriéré " + a.motif, now),
      db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '💵', ?, 0, ?)`).bind(uid(), a.personnage_id, `Arriéré de salaire enfin payé par l'État : ${fmtMakuta(a.montant - imp)} (${a.motif}).`, now),
    ]);
  }
  return n;
}
// une fois par jour (heure de Kinshasa) : budget de départ, factures d'eau et d'électricité, surplus des sociétés publiques, arriérés
async function dailyPublic(db, now) {
  const jour = dayKey(now), k = await db.prepare(`SELECT valeur FROM jeu WHERE cle = 'jour_public'`).first();
  if (k && k.valeur === jour) return;
  await db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('jour_public', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(jour).run();
  const seed = await db.prepare(`SELECT valeur FROM jeu WHERE cle = 'budget_initial'`).first();
  if (!seed) await db.batch([tx(db, "banque-centrale", STATE_ID, STATE_SEED, "budget de départ de l'État (Banque centrale)", now),
    db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('budget_initial', ?)`).bind(String(now))]);
  const { results: homes } = await db.prepare(`SELECT p.id, p.makuta, (SELECT GROUP_CONCAT(objet_id) FROM possessions WHERE proprietaire_id = p.id) AS objets FROM logements l JOIN personnages p ON p.id = l.personnage_id WHERE p.mort_le IS NULL AND p.compte_id IS NOT NULL LIMIT 500`).all();
  for (const hme of homes) {
    const bills = billsFor(hme.makuta, homeConso(String(hme.objets || "").split(","))), paid = bills.reduce((t, b) => t + b.paye, 0), unpaid = bills.filter(b => b.paye < b.du);
    const st = bills.filter(b => b.paye > 0).map(b => tx(db, hme.id, b.societe, b.paye, "facture du jour : " + PUBLIC_COMPANIES.find(c => c.id === b.societe).nom, now));
    if (paid) st.unshift(db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(paid, hme.id, paid), GUARD(db));
    if (unpaid.length) st.push(db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🕯️', ?, 0, ?)`).bind(uid(), hme.id, "Facture impayée : " + unpaid.map(b => PUBLIC_COMPANIES.find(c => c.id === b.societe).nom).join(", ") + ". La maison reste dans le noir ce soir.", now));
    if (st.length) try { await db.batch(st); } catch (e) { if (!guardFailed(e)) throw e; }   // solde changé entre-temps : facture reportée
  }
  const sol = await ledger(db, PUBLIC_IDS);
  const st = PUBLIC_COMPANIES.filter(c => sol[c.id] > SOE_RESERVE).map(c => tx(db, c.id, STATE_ID, sol[c.id] - SOE_RESERVE, "versement au Trésor : " + c.nom, now));
  if (st.length) await db.batch(st);
  // budget voté : versement du jour à l'Office de la voirie (si le Trésor peut payer)
  const voirie = LAWS.budget.voirie || 0;
  if (voirie > 0 && (sol[STATE_ID] || 0) >= voirie) await db.batch([tx(db, STATE_ID, "sp-voirie", voirie, "budget voté : routes et propreté", now)]);
  await payArrears(db, now);
  await parliamentAttendance(db, now);
}
// ---------------------------------------------------------------- Parlement (pouvoirs des élus, 25/11)
const communiqueSt = (db, auteur, texte, now, jours = 7) => db.prepare(`INSERT INTO communiques (id, auteur, texte, debut, fin, accord, actif, cree_le) VALUES (?, ?, ?, ?, ?, 0, 1, ?)`).bind(uid(), auteur, texte.slice(0, 280), now, now + jours * 864e5, now);
async function seats(db) {
  const { results } = await db.prepare(`SELECT poste, COUNT(*) AS n FROM mandats m JOIN personnages p ON p.id = m.personnage_id WHERE m.fin IS NULL AND p.mort_le IS NULL GROUP BY poste`).all();
  return Object.fromEntries(results.map(r => [r.poste, r.n]));
}
async function sittingDays(db, id, poste, now) {
  const { results } = await db.prepare(`SELECT le FROM activites WHERE personnage_id = ? AND activite = ? AND le > ?`).bind(id, "travail:elu-" + poste, now - (PARLIAMENT.fenetreJours + 1) * 864e5).all();
  return results.map(r => dayKey(r.le));
}
// une fois par jour : un député ou un sénateur absent à plus d'une séance sur quatre perd son mandat (après 7 jours de grâce)
async function parliamentAttendance(db, now) {
  const { results } = await db.prepare(`SELECT m.personnage_id AS id, m.poste, m.debut, p.prenom || ' ' || p.nom AS nom FROM mandats m JOIN personnages p ON p.id = m.personnage_id
      WHERE m.fin IS NULL AND m.poste IN ('depute', 'senateur') AND p.mort_le IS NULL LIMIT 700`).all();
  for (const x of results) {
    const a = attendance(x.debut, await sittingDays(db, x.id, x.poste, now), now), poste = (POSTS.find(y => y.id === x.poste) || {}).nom || x.poste;
    if (a.dechu) await db.batch([
      db.prepare(`UPDATE mandats SET fin = ? WHERE personnage_id = ? AND poste = ? AND fin IS NULL`).bind(now, x.id, x.poste),
      db.prepare(`UPDATE emplois SET fin = ? WHERE personnage_id = ? AND metier_id = ? AND fin IS NULL`).bind(now, x.id, "elu-" + x.poste),
      repSt(db, x.id, -PARLIAMENT.repDechu, now),
      db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '⚖️', ?, 0, ?)`).bind(uid(), x.id, dechuText(x.nom, poste, a) + ` Mandat perdu, réputation −${PARLIAMENT.repDechu}.`, now),
      communiqueSt(db, "Parlement", dechuText(x.nom, poste, a), now),
    ]).then(() => { TICKER.at = 0; });
    else if (a.alerte) await db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '⚠️', ?, 0, ?)`).bind(uid(), x.id,
      `Parlement : ${a.absences} absences sur ${a.seances} séances (${a.taux} %). Au-delà d'une sur quatre, tu perds ton mandat : va siéger (travailler) chaque jour.`, now).run();
  }
}
// clôture des votes arrivés à échéance : la loi adoptée entre en vigueur, sinon l'ancien budget reste
async function parlement(db, now) {
  const { results: due } = await db.prepare(`SELECT * FROM lois WHERE statut = 'vote' AND fin_vote <= ?`).bind(now).all();
  for (const l of due) {
    const { results: votes } = await db.prepare(`SELECT chambre, choix FROM votes_lois WHERE loi_id = ?`).bind(l.id).all();
    const r = billOutcome(votes, await seats(db)), contenu = JSON.parse(l.contenu), budget = l.type === "budget";
    const st = [db.prepare(`UPDATE lois SET statut = ?, resultat = ? WHERE id = ? AND statut = 'vote'`).bind(r.adoptee ? "adoptee" : "rejetee", JSON.stringify(r), l.id), GUARD(db)];
    const kv = (k, v) => db.prepare(`INSERT INTO jeu (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(k, String(v));
    if (r.adoptee) st.push(...(budget ? [kv("budget", l.contenu), kv("budget_le", now)] : [kv("loi_" + l.type, contenu.niveau)]));
    const texte = `${l.titre} : ${r.raison}. ` + (r.adoptee ? `En vigueur : ${budget ? budgetText(contenu) : lawText(l.type, contenu).replace(/ \(aujourd'hui.*\)/, "")}.` : "La loi actuelle reste en vigueur.");
    st.push(communiqueSt(db, "Parlement", texte, now),
      db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '📜', ?, 0, ?)`).bind(uid(), l.auteur_id, "Ton projet : " + texte, now));
    if (r.adoptee) st.push(...protestSt(db, l.type, budget ? contenu : contenu.niveau, l.auteur_id, now + 1));
    try { await db.batch(st); } catch (e) { if (!guardFailed(e)) throw e; continue; }   // déjà clôturée ailleurs
    if (r.adoptee && budget) { LAWS.budget = { ...LAWS.budget, ...contenu }; LAWS.budgetLe = now; }
    if (r.adoptee && !budget) LAWS[l.type] = contenu.niveau;
    TICKER.at = 0;
  }
}
async function parliamentView(db, me, poste, now) {
  const { results: lois } = await db.prepare(`SELECT id, type, titre, contenu, auteur_id, statut, depot, fin_vote, resultat, (SELECT prenom || ' ' || nom FROM personnages WHERE id = auteur_id) AS auteur FROM lois ORDER BY depot DESC LIMIT 6`).all();
  const cur = lois.find(l => l.statut === "vote");
  let loi = null;
  if (cur) {
    const { results: v } = await db.prepare(`SELECT chambre, choix, COUNT(*) AS n FROM votes_lois WHERE loi_id = ? GROUP BY chambre, choix`).bind(cur.id).all();
    const mine = await db.prepare(`SELECT choix FROM votes_lois WHERE loi_id = ? AND personnage_id = ?`).bind(cur.id, me).first();
    const n = (c, k) => (v.find(x => x.chambre === c && x.choix === k) || {}).n || 0;
    loi = { id: cur.id, type: cur.type, titre: cur.titre, auteur: cur.auteur, contenu: JSON.parse(cur.contenu), depot: cur.depot, finVote: cur.fin_vote, monVote: mine ? mine.choix : null,
      assemblee: { oui: n("depute", "oui"), non: n("depute", "non") }, senat: { oui: n("senateur", "oui"), non: n("senateur", "non") } };
  }
  const sieges = await seats(db);
  const mandat = poste ? await db.prepare(`SELECT debut FROM mandats WHERE personnage_id = ? AND poste = ? AND fin IS NULL`).bind(me, poste).first() : null;
  const siege = mandat && PARLIAMENT_SEATS.includes(poste) ? attendance(mandat.debut, await sittingDays(db, me, poste, now), now) : null;
  return { tva: LAWS.tva, tvaLe: LAWS.tvaLe, prochainTva: LAWS.tvaLe ? LAWS.tvaLe + VAT_LIMITS.delaiJours * 864e5 : null, limites: VAT_LIMITS, budget: LAWS.budget, budgetLe: LAWS.budgetLe, lignes: BUDGET_LINES, regles: PARLIAMENT,
    types: LAW_TYPES, amendes: LAWS.amendes, salaires: LAWS.salaires, sieges, quorum: Math.max(1, Math.ceil((sieges.depute || 0) * PARLIAMENT.quorum)), monPoste: poste || null, siege, loi,
    lois: lois.filter(l => l.statut !== "vote").map(l => ({ type: l.type, titre: l.titre, auteur: l.auteur, statut: l.statut, depot: l.depot, contenu: JSON.parse(l.contenu), raison: l.resultat ? JSON.parse(l.resultat).raison : "" })) };
}
async function publicFinance(db, now) {
  const since = now - 864e5, sol = await ledger(db, PUBLIC_IDS);
  const imp = await db.prepare(`SELECT COALESCE(SUM(montant), 0) AS n FROM transactions WHERE vers_id = ? AND le > ? AND de_id NOT IN ('banque-centrale', ${PUBLIC_COMPANIES.map(() => "?").join(",")})`).bind(STATE_ID, since, ...PUBLIC_COMPANIES.map(c => c.id)).first();
  const ph = PUBLIC_IDS.map(() => "?").join(",");
  const sal = await db.prepare(`SELECT COALESCE(SUM(montant), 0) AS n FROM transactions WHERE de_id IN (${ph}) AND le > ? AND motif LIKE '%salaire%'`).bind(...PUBLIC_IDS, since).first();
  const arr = await db.prepare(`SELECT COUNT(DISTINCT personnage_id) AS n, COALESCE(SUM(montant), 0) AS m FROM arrieres WHERE paye_le IS NULL`).first();
  const { results: ag } = await db.prepare(`SELECT metier_id, COUNT(*) AS n FROM emplois WHERE fin IS NULL GROUP BY metier_id`).all();
  const agents = {}; ag.forEach(a => { const j = PUBLIC_JOBS.find(x => x.id === a.metier_id); if (j && j.societe) agents[j.societe] = (agents[j.societe] || 0) + a.n; });
  return { soldes: sol, tresor: sol[STATE_ID], impotsJour: imp.n, salairesJour: sal.n, arrieres: arr.n, arrieresMontant: arr.m, societes: soeView(sol, agents) };
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
    const { results: cands } = await db.prepare(`SELECT c.personnage_id, c.poste, c.le, p.sexe, p.prenom || ' ' || p.nom AS nom, COALESCE(k.soutien, 0) AS soutien, COALESCE(r.points, 0) AS rep
        FROM candidatures c JOIN personnages p ON p.id = c.personnage_id LEFT JOIN campagnes_elec k ON k.personnage_id = c.personnage_id LEFT JOIN reputations r ON r.personnage_id = c.personnage_id
        WHERE p.mort_le IS NULL`).all();
    // voix des joueurs + voix des habitants du jeu (campagne, réputation) ; les résultats sont publiés
    const scores = electionScores(votes, cands), won = scores.filter(x => x.elu);
    const posteNom = id => (POSTS.find(x => x.id === id) || {}).nom || id;
    const top = POSTS.map(po => scores.find(x => x.poste === po.id && x.elu)).filter(Boolean);
    await db.batch([
      // seuls les postes qui ont de nouveaux élus changent de titulaire ; sans candidat, les sortants restent en fonction
      ...[...new Set(won.map(w => w.poste))].flatMap(po => [
        db.prepare(`UPDATE mandats SET fin = ? WHERE fin IS NULL AND poste = ?`).bind(date, po),
        db.prepare(`UPDATE emplois SET fin = ? WHERE fin IS NULL AND metier_id = ?`).bind(date, "elu-" + po)]),
      ...won.flatMap(w => [
        db.prepare(`INSERT INTO mandats (personnage_id, poste, cycle, voix, debut) VALUES (?, ?, ?, ?, ?)`).bind(w.personnage_id, w.poste, cycle, w.voix, date),
        db.prepare(`UPDATE emplois SET fin = ? WHERE personnage_id = ? AND fin IS NULL`).bind(date, w.personnage_id),
        db.prepare(`INSERT INTO emplois (id, personnage_id, metier_id, poste, salaire, depuis) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), w.personnage_id, "elu-" + w.poste, w.poste, 0, date),
      ]),
      ...scores.flatMap(r => [
        db.prepare(`INSERT OR REPLACE INTO resultats_elections (cycle, poste, personnage_id, nom, voix, voix_joueurs, pct, elu, le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(cycle, r.poste, r.personnage_id, r.nom, r.voix, r.voixJoueurs, r.pct, r.elu ? 1 : 0, date),
        db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), r.personnage_id, r.elu ? "🎖️" : "🗳️", "Résultats de l'élection n° " + cycle + " : " + resultLine(r, posteNom(r.poste)) + (r.elu ? ". Félicitations, ton mandat commence !" : "."), date),
      ]),
      ...(top.length ? [db.prepare(`INSERT INTO communiques (id, auteur, texte, debut, fin, accord, actif, cree_le) VALUES (?, 'CENI', ?, ?, ?, 0, 1, ?)`)
        .bind(uid(), `Résultats de l'élection n° ${cycle} : ` + top.map(r => `${r.nom}, ${posteNom(r.poste).toLowerCase()} (${String(r.pct).replace(".", ",")} %)`).join(" · "), date, date + 7 * 864e5, date)] : []),
      db.prepare(`DELETE FROM candidatures`),
      db.prepare(`DELETE FROM campagnes_elec`),
    ]);
    TICKER.at = 0;
    date += ELECTION_EVERY; cycle += 1; await save();
  }
  return electionCalendar(date, cycle, now);
}
async function electionView(db, cal, me) {
  const { results: raw } = await db.prepare(`SELECT c.personnage_id, c.poste, c.le, p.prenom || ' ' || p.nom AS nom, p.quartier, k.programme, COALESCE(k.soutien, 0) AS soutien, COALESCE(r.points, 0) AS rep, k.dernier_jour
      FROM candidatures c JOIN personnages p ON p.id = c.personnage_id LEFT JOIN campagnes_elec k ON k.personnage_id = c.personnage_id LEFT JOIN reputations r ON r.personnage_id = c.personnage_id
      WHERE p.mort_le IS NULL LIMIT 200`).all();
  const { results: allVotes } = await db.prepare(`SELECT poste, candidat_id FROM votes WHERE cycle = ?`).bind(cal.cycle).all();
  // sondage : mêmes calculs que le dépouillement, avec les voix déjà exprimées
  const cands = electionScores(allVotes, raw).slice(0, 60).map(c => ({ id: c.personnage_id, poste: c.poste, nom: c.nom, quartier: c.quartier, programme: c.programme, soutien: c.soutien, voix: c.voixJoueurs, sondage: c.pct }));
  const mc = raw.find(c => c.personnage_id === me);
  const maCampagne = mc ? { poste: mc.poste, programme: mc.programme, soutien: mc.soutien, faiteAujourdhui: mc.dernier_jour === dayKey(Date.now()), sondage: (cands.find(c => c.id === me) || {}).sondage } : null;
  const lc = await db.prepare(`SELECT MAX(cycle) AS c FROM resultats_elections`).first();
  const { results: historique } = lc && lc.c ? await db.prepare(`SELECT cycle, poste, nom, voix, voix_joueurs AS voixJoueurs, pct, elu FROM resultats_elections WHERE cycle = ? ORDER BY poste, voix DESC LIMIT 30`).bind(lc.c).all() : { results: [] };
  const { results: elus } = await db.prepare(`SELECT m.poste, m.voix, p.prenom || ' ' || p.nom AS nom FROM mandats m JOIN personnages p ON p.id = m.personnage_id WHERE m.fin IS NULL ORDER BY m.voix DESC LIMIT 60`).all();
  const { results: mine } = await db.prepare(`SELECT poste, candidat_id FROM votes WHERE electeur_id = ? AND cycle = ?`).bind(me, cal.cycle).all();
  return { ...cal, candidats: cands, maCampagne, historique, elus, mesVotes: Object.fromEntries(mine.map(v => [v.poste, v.candidat_id])) };
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
  const { results: gui } = await db.prepare(`SELECT sens, moyen, numero, usd, makuta, statut, le FROM guichet WHERE compte_id = ? ORDER BY le DESC LIMIT 30`).bind(p.compte_id).all();
  const job = await db.prepare(`SELECT id, metier_id, entreprise_id, salaire FROM emplois WHERE personnage_id = ? AND fin IS NULL ORDER BY depuis DESC LIMIT 1`).bind(id).first();
  const last = await db.prepare(`SELECT MAX(le) AS le FROM activites WHERE personnage_id = ? AND activite LIKE 'travail:%'`).bind(id).first();
  const enr = await db.prepare(`SELECT formation_id AS formation, annee, cours, points, dernier FROM inscriptions WHERE personnage_id = ?`).bind(id).first();
  const { results: dip } = await db.prepare(`SELECT formation_id FROM diplomes_obtenus WHERE personnage_id = ? ORDER BY obtenu_le`).bind(id).all();
  const ptsPermis = (await db.prepare(`SELECT type, points, amende, le FROM permis_points WHERE personnage_id = ? AND le > ? ORDER BY le DESC LIMIT 40`).bind(id, Date.now() - 400 * 864e5).all().catch(() => ({ results: [] }))).results || [];
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
  const { results: objectifs } = await db.prepare(`SELECT objectif_id, choisi_le, atteint_le FROM objectifs WHERE personnage_id = ? ORDER BY choisi_le`).bind(id).all();
  const mandat = await db.prepare(`SELECT poste FROM mandats WHERE personnage_id = ? AND fin IS NULL LIMIT 1`).bind(id).first();
  const dus = await db.prepare(`SELECT COALESCE(SUM(montant), 0) AS n FROM arrieres WHERE personnage_id = ? AND paye_le IS NULL`).bind(id).first();
  const fin = await publicFinance(db, Date.now());
  const train = await db.prepare(`SELECT * FROM train_de_vie WHERE personnage_id = ?`).bind(id).first();
  const blessure = await db.prepare(`SELECT le, vitesse FROM blessures WHERE personnage_id = ?`).bind(id).first();
  const { results: campagnes } = await db.prepare(`SELECT c.*, e.nom AS entreprise, e.proprietaire_id, a.prenom || ' ' || a.nom AS ambassadeur FROM campagnes c JOIN entreprises e ON e.id = c.entreprise_id JOIN personnages a ON a.id = c.ambassadeur_id
      WHERE c.fin > ? AND (e.proprietaire_id = ? OR c.ambassadeur_id = ?) ORDER BY c.debut DESC LIMIT 20`).bind(Date.now(), id, id).all();
  const pub = await publicState(db);
  const now = Date.now(), cal = await elections(db, now);
  const elec = await electionView(db, cal, id);
  await parlement(db, now);
  elec.parlement = await parliamentView(db, id, mandat && mandat.poste, now);
  const pol = await db.prepare(`SELECT COUNT(*) AS n FROM emplois WHERE metier_id = 'policier' AND fin IS NULL`).first();
  const { results: casier } = await db.prepare(`SELECT type, amende, prison_heures, le FROM infractions WHERE personnage_id = ? ORDER BY le DESC LIMIT 20`).bind(id).all();
  const notif = await db.prepare(`SELECT COUNT(*) AS n FROM abonnements_push WHERE compte_id = ?`).bind(p.compte_id).first();
  const jour = dayKey(now);
  const { results: mv } = await db.prepare(`SELECT icone, texte, par_consigne, le FROM mouvements WHERE personnage_id = ? ORDER BY le DESC LIMIT 100`).bind(id).all();
  const { results: ord } = await db.prepare(`SELECT ordre FROM consignes WHERE personnage_id = ? AND jour = ? ORDER BY donnee_le`).bind(id, jour).all();
  const { results: journal } = await db.prepare(`SELECT ordre, ok, message, le FROM consignes_journal WHERE personnage_id = ? AND jour = ? ORDER BY le DESC LIMIT 30`).bind(id, jour).all();
  const reputation = await repOf(db, id);
  const { results: motsRecus } = await db.prepare(`SELECT m.id, m.de_id, m.texte, m.le, m.lu, p.prenom, p.nom, c.pseudo FROM mots m JOIN personnages p ON p.id = m.de_id LEFT JOIN comptes c ON c.id = p.compte_id WHERE m.vers_id = ? ORDER BY m.le DESC LIMIT 30`).bind(id).all();
  const { results: motsEnvoyes } = await db.prepare(`SELECT m.vers_id, m.texte, m.le, p.prenom, p.nom FROM mots m JOIN personnages p ON p.id = m.vers_id WHERE m.de_id = ? ORDER BY m.le DESC LIMIT 15`).bind(id).all();
  const fid = p.compte_id ? await db.prepare(`SELECT serie, meilleure, dernier_jour, resume_vu_le, makuta_vu FROM fidelite WHERE compte_id = ?`).bind(p.compte_id).first() : null;
  const origine = await db.prepare(`SELECT classe, adulte, maturite, arrive_le, caractere, role, camp FROM origines WHERE personnage_id = ?`).bind(id).first();
  const flux = await db.prepare(`SELECT SUM(CASE WHEN vers_id = ?1 THEN montant ELSE 0 END) AS recu, SUM(CASE WHEN de_id = ?1 THEN montant ELSE 0 END) AS depense,
      SUM(CASE WHEN de_id = ?1 AND (motif LIKE 'aide %' OR motif LIKE 'entretien%') THEN montant ELSE 0 END) AS famille,
      SUM(CASE WHEN de_id = ?1 AND vers_id = ?2 THEN montant ELSE 0 END) AS impots,
      SUM(CASE WHEN vers_id = ?1 AND (motif LIKE 'aide %' OR motif LIKE 'entretien%' OR motif LIKE 'héritage%') THEN montant ELSE 0 END) AS recuFamille
      FROM transactions WHERE de_id = ?1 OR vers_id = ?1`).bind(id, STATE_ID).first();
  const logement = await db.prepare(`SELECT statut, quartier, loyer, paye_jusqu, depuis FROM logements WHERE personnage_id = ?`).bind(id).first();
  const lastStreet = await db.prepare(`SELECT MAX(le) AS le FROM activites WHERE personnage_id = ? AND activite LIKE 'boulot:%'`).bind(id).first();
  const { results: annonces } = await db.prepare(`SELECT a.id, a.prix, a.cree_le, a.vendeur_id, o.objet_id, p.prenom || ' ' || p.nom AS vendeur FROM annonces a JOIN possessions o ON o.id = a.possession_id
      JOIN personnages p ON p.id = a.vendeur_id WHERE a.statut = 'ouverte' ORDER BY a.cree_le DESC LIMIT 40`).all();
  const conjoint = p.conjoint_id ? await db.prepare(`SELECT p.prenom, p.nom, p.sexe, c.pseudo FROM personnages p LEFT JOIN comptes c ON c.id = p.compte_id WHERE p.id = ?`).bind(p.conjoint_id).first() : null;
  const { results: dmIn } = await db.prepare(`SELECT d.id, d.le, p.prenom, p.nom, p.sexe, c.pseudo FROM demandes_mariage d JOIN personnages p ON p.id = d.de_id LEFT JOIN comptes c ON c.id = p.compte_id WHERE d.vers_id = ? AND d.statut = 'attente' ORDER BY d.le DESC`).bind(id).all();
  const { results: dmOut } = await db.prepare(`SELECT d.id, d.le, p.prenom, p.nom, c.pseudo FROM demandes_mariage d JOIN personnages p ON p.id = d.vers_id LEFT JOIN comptes c ON c.id = p.compte_id WHERE d.de_id = ? AND d.statut = 'attente' ORDER BY d.le DESC`).bind(id).all();
  return { blessure, origine, flux, logement, lastStreet: lastStreet && lastStreet.le, annonces, reputation, couple: { conjoint, recues: dmIn, envoyees: dmOut }, p, tal, inv, dep, ret, gui, job, lastShift: last && last.le, enr, dip: dip.map(d => d.formation_id), ptsPermis, kids, par, sibs, ent, aVendre, offres, boss, comptes, cand, pub, elec, policiers: pol.n, casier,
    consignes: { jour, liste: ord.map(o => o.ordre), journal }, mouvements: mv, notifications: notif.n, fid, motsRecus, motsEnvoyes, objectifs, mandat, dus: dus.n, fin, train, campagnes };
}
// ce que mesurent les objectifs de vie
function goalFacts(ch) {
  const job = ch.job && ch.job.metier_id;
  return { entreprises: (ch.ent || []).length, proprio: !!(ch.logement && ch.logement.statut === "proprio"), marie: !!(ch.couple && ch.couple.conjoint), enfants: (ch.kids || []).length,
    fortune: (ch.p.makuta || 0) + (ch.comptes || []).reduce((t, c) => t + (c.solde || 0), 0), diplomes: (ch.dip || []).length, talents: (ch.tal || []).filter(t => t.decouvert).length,
    public: !!job && PUBLIC_JOBS.some(j => j.id === job), elu: !!ch.mandat, rep: ch.reputation || 0 };
}

// ---------------------------------------------------------------- notifications sur le téléphone
// clés VAPID : variables Cloudflare si présentes, sinon créées une fois et gardées dans la table jeu
async function vapidKeys(env, db) {
  if (env.VAPID_PUBLIC && env.VAPID_PRIVATE_JWK) return { publique: env.VAPID_PUBLIC, privee: env.VAPID_PRIVATE_JWK, sujet: env.VAPID_SUBJECT };
  const kv = Object.fromEntries((await db.prepare(`SELECT cle, valeur FROM jeu WHERE cle IN ('vapid', 'site')`).all()).results.map(r => [r.cle, r.valeur]));
  let k = kv.vapid && JSON.parse(kv.vapid);
  if (!k) {
    k = await newVapidKeys();
    await db.prepare(`INSERT OR IGNORE INTO jeu (cle, valeur) VALUES ('vapid', ?)`).bind(JSON.stringify(k)).run();
    k = JSON.parse((await db.prepare(`SELECT valeur FROM jeu WHERE cle = 'vapid'`).first()).valeur);   // si deux requêtes en même temps
  }
  return { ...k, sujet: env.VAPID_SUBJECT || kv.site || "https://2life.example" };
}
async function notify(env, db, compteId, message) {
  const keys = await vapidKeys(env, db);
  const { results } = await db.prepare(`SELECT endpoint, p256dh, auth FROM abonnements_push WHERE compte_id = ?`).bind(compteId).all();
  for (const sub of results) {
    try { if (await sendPush(keys, sub, message) === "expire") await db.prepare(`DELETE FROM abonnements_push WHERE endpoint = ?`).bind(sub.endpoint).run(); }
    catch (e) { console.error(e); }
  }
}

async function activeAds(db, now) {
  const { results } = await db.prepare(`SELECT * FROM pubs WHERE actif = 1 AND debut <= ? AND fin > ? ORDER BY cree_le DESC LIMIT 30`).bind(now, now).all();
  return results.map(adView);
}
// ---- journal : les vrais faits des dernières 24 heures
async function newsFacts(db, now) {
  const since = now - 864e5;
  const q = async (sql, ...b) => (await db.prepare(sql).bind(...b).all()).results;
  const [naissances, deces, mariages, entreprises, elus, arrestations, vivants] = await Promise.all([
    q(`SELECT p.prenom, p.nom, p.sexe, p.quartier, o.arrive_le AS le FROM origines o JOIN personnages p ON p.id = o.personnage_id WHERE o.arrive_le > ? AND p.compte_id IS NOT NULL ORDER BY o.arrive_le DESC LIMIT 15`, since),
    q(`SELECT prenom, nom, quartier, cause_mort AS cause, ne_le, mort_le AS le FROM personnages WHERE mort_le > ? AND compte_id IS NOT NULL ORDER BY mort_le DESC LIMIT 10`, since),
    q(`SELECT a.prenom || ' ' || a.nom AS a, b.prenom || ' ' || b.nom AS b, a.quartier, d.le FROM demandes_mariage d JOIN personnages a ON a.id = d.de_id JOIN personnages b ON b.id = d.vers_id WHERE d.statut = 'acceptee' AND d.le > ? LIMIT 10`, since),
    q(`SELECT e.nom, e.type, e.local AS quartier, e.cree_le AS le, p.prenom || ' ' || p.nom AS proprio FROM entreprises e JOIN personnages p ON p.id = e.proprietaire_id WHERE e.cree_le > ? ORDER BY e.cree_le DESC LIMIT 10`, since),
    q(`SELECT p.prenom || ' ' || p.nom AS nom, p.sexe, m.poste, m.voix, m.debut AS le FROM mandats m JOIN personnages p ON p.id = m.personnage_id WHERE m.debut > ? LIMIT 10`, since),
    q(`SELECT p.quartier, COUNT(*) AS n FROM infractions i JOIN personnages p ON p.id = i.personnage_id WHERE i.le > ? AND p.quartier IS NOT NULL GROUP BY p.quartier ORDER BY n DESC LIMIT 5`, since),
    q(`SELECT COUNT(*) AS n FROM personnages p JOIN comptes c ON c.vie_id = p.id WHERE p.mort_le IS NULL`),
  ]);
  const pubs = (await activeAds(db, now)).filter(a => adShownIn(a, "journal"));
  const offrandes = await q(`SELECT o.recu AS texte, p.quartier, o.le FROM offrandes o LEFT JOIN personnages p ON p.id = o.vers_id WHERE o.le > ? ORDER BY o.le DESC LIMIT 15`, since);
  return { pubs, offrandes, naissances, deces: deces.map(d => ({ ...d, age: Math.floor(ageYears(d.ne_le, d.le)) })), mariages, entreprises, elus, arrestations,
    chiffres: { joueurs: vivants[0].n, naissances: naissances.length, deces: deces.length, entreprises: entreprises.length } };
}

// ---- fidélité : la série avance d'un jour à la première consigne du jour ; bonus aux paliers
async function streakAdvance(db, compteId, pid, fid, jour, now) {
  const sk = streakStep(fid, jour);
  if (!sk.nouveau) return sk;
  const st = [db.prepare(`INSERT INTO fidelite (compte_id, serie, meilleure, dernier_jour) VALUES (?, ?, ?, ?) ON CONFLICT(compte_id) DO UPDATE SET serie = excluded.serie, meilleure = excluded.meilleure, dernier_jour = excluded.dernier_jour`).bind(compteId, sk.serie, sk.meilleure, jour)];
  if (sk.bonus) st.push(db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(sk.bonus, pid),
    db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), pid, sk.bonus, `bonus de série : ${sk.serie} jours`, now));
  await db.batch(st);
  return sk;
}
// 5 h à Kinshasa : « ton personnage s'est réveillé » ; 9 h : rappel si la série va se perdre (une fois par jour et par compte)
async function morningPush(env, now) {
  const h = kinHour(now); if (h !== 5 && h !== 9) return;
  const db = env.DB, jour = dayKey(now), type = h === 5 ? "matin" : "rappel_serie";
  const { results } = await db.prepare(`SELECT c.id AS compte_id, p.id AS pid, p.prenom, p.sexe, p.makuta, p.faim, p.energie, p.bonheur, p.sante, p.maj_le,
      f.serie, f.meilleure, f.dernier_jour, f.resume_vu_le, f.makuta_vu
      FROM comptes c JOIN personnages p ON p.id = c.vie_id LEFT JOIN fidelite f ON f.compte_id = c.id
      WHERE p.mort_le IS NULL AND EXISTS (SELECT 1 FROM abonnements_push a WHERE a.compte_id = c.id) LIMIT 1000`).all();
  for (const r of results) {
    try {
      const S = streakView(r, now);
      if (type === "rappel_serie" && !(S.enDanger && S.serie >= 2)) continue;
      const ins = await db.prepare(`INSERT OR IGNORE INTO alertes (personnage_id, compte_id, type, jour) VALUES (?, ?, ?, ?)`).bind(r.pid, r.compte_id, type, jour).run();
      if (!(ins.meta && ins.meta.changes)) continue;
      let texte;
      if (type === "matin") {
        const { results: mv } = await db.prepare(`SELECT icone, texte, le FROM mouvements WHERE personnage_id = ? AND le > ? ORDER BY le DESC LIMIT 100`).bind(r.pid, Math.max(r.resume_vu_le || 0, now - 36 * 36e5)).all();
        const n = needsAt({ hunger: r.faim, energy: r.energie, happiness: r.bonheur, health: r.sante, updatedAt: r.maj_le }, now);
        const R = nightSummary({ prenom: r.prenom, fem: r.sexe === "F", mouvements: mv, vuLe: r.resume_vu_le, makutaVu: r.makuta_vu, makuta: r.makuta, besoins: n, now });
        texte = morningText(r.prenom, R, S, r.sexe === "F") + (R.alertes.length ? " " + R.alertes[0] : "");
      } else texte = reminderText(r.prenom, S);
      await notify(env, db, r.compte_id, { titre: "2 Life", texte, url: type === "matin" ? "vie.html#nuit" : "vie.html#orders" });
    } catch (e) { console.error(e); }
  }
}

// les parents joueurs sont prévenus des moments importants de la vie de leurs enfants
const IMPORTANT_FOR_PARENTS = ["/api/postuler", "/api/crime", "/api/caution", "/api/entreprise/ouvrir", "/api/entreprise/acheter", "/api/ecole/inscription", "/api/candidature", "/api/soigner"];
async function notifyParents(env, kidId, d) {
  const db = env.DB;
  const k = await db.prepare(`SELECT prenom, pere_id, mere_id FROM personnages WHERE id = ?`).bind(kidId).first();
  if (!k) return;
  const { results } = await db.prepare(`SELECT c.id FROM comptes c WHERE c.vie_id IN (?, ?)`).bind(k.pere_id || "", k.mere_id || "").all();
  for (const c of results) await notify(env, db, c.id, { titre: `2 Life · ${k.prenom}`, texte: `${d.icone} ${d.texte}`, url: "vie.html#kids-card" });
}
// alertes de besoins (faim, santé, prison) : au plus une par enfant, par type et par jour
const KID_ALERTS = [
  { id: "faim", test: (n) => n.hunger < 30, texte: k => `${k.prenom} a très faim. Donne-lui à manger.` },
  { id: "sante", test: (n) => n.health < 40, texte: k => `${k.prenom} est malade : il faut l'emmener au centre de santé.` },
  { id: "prison", test: (n, k, now) => k.prison_jusqu && k.prison_jusqu > now, texte: k => `${k.prenom} est en prison. Tu peux payer sa caution.` },
];
async function kidAlerts(env, now) {
  const db = env.DB, jour = dayKey(now);
  const { results } = await db.prepare(`SELECT k.id, k.prenom, k.faim, k.energie, k.bonheur, k.sante, k.maj_le, k.prison_jusqu, c.id AS parent_compte
      FROM personnages k JOIN comptes c ON c.vie_id IN (k.pere_id, k.mere_id)
      WHERE k.mort_le IS NULL AND EXISTS (SELECT 1 FROM abonnements_push a WHERE a.compte_id = c.id) LIMIT 1000`).all();
  for (const k of results) {
    const n = needsAt({ hunger: k.faim, energy: k.energie, happiness: k.bonheur, health: k.sante, updatedAt: k.maj_le }, now);
    for (const a of KID_ALERTS) {
      if (!a.test(n, k, now)) continue;
      const r = await db.prepare(`INSERT OR IGNORE INTO alertes (personnage_id, compte_id, type, jour) VALUES (?, ?, ?, ?)`).bind(k.id, k.parent_compte, a.id, jour).run();
      if (r.meta && r.meta.changes) await notify(env, db, k.parent_compte, { titre: `2 Life · ${k.prenom}`, texte: a.texte(k), url: "vie.html#kids-card" });
    }
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

// pensée du jour : une par personnage et par jour (heure de Kinshasa), gardée dans la table pensees.
// L'IA (Cloudflare Workers AI, liaison « AI ») écrit seulement le texte ; elle ne change aucune règle.
async function thoughtOfDay(env, db, compte, ch, now) {
  const jour = dayKey(now), pid = ch.p.id;
  const got = await db.prepare(`SELECT texte, source FROM pensees WHERE personnage_id = ? AND jour = ?`).bind(pid, jour).first().catch(() => null);
  if (got) return { texte: got.texte, ia: got.source === "ia", jour };
  const F = thoughtFacts(view(compte, ch, now), ch.origine && ch.origine.caractere);
  let texte = null, source = "regles";
  if (env.AI && SET.ia >= 0.5 && !ch.p.mort_le) {
    try {
      const out = await Promise.race([env.AI.run(THOUGHT_MODEL, { messages: thoughtPrompt(F), max_tokens: 90, temperature: 0.8 }), new Promise((_, no) => setTimeout(() => no(new Error("délai")), 8000))]);
      texte = cleanThought(out && (out.response || out.result));
      if (texte) source = "ia";
    } catch (e) { console.error("pensee IA", e && e.message); }
  }
  if (!texte) texte = thoughtFallback(F, now);
  await db.prepare(`INSERT OR IGNORE INTO pensees (personnage_id, jour, texte, source, le) VALUES (?, ?, ?, ?, ?)`).bind(pid, jour, texte, source, now).run().catch(e => console.error(e));
  return { texte, ia: source === "ia", jour };
}
function view(compte, ch, now) { const v = viewBase(compte, ch, now); v.objectifs = goalsView(ch.objectifs || [], goalFacts(ch)); v.salaireDu = ch.dus || 0;
  if (ch.fin) v.etat.finances = { tresor: ch.fin.tresor, impotsJour: ch.fin.impotsJour, salairesJour: ch.fin.salairesJour, arrieres: ch.fin.arrieres, societes: ch.fin.societes, tva: LAWS.tva };
  v.promo = { prix: PROMO_PRICE, maxJours: PROMO_MAX_DAYS };
  v.train = livingView(ch.train || {}, ch.p.makuta, ageYears(ch.p.ne_le, now));
  v.pause = CLOCK.pause;
  v.atouts = opportunities({ ids: (ch.inv || []).map(x => x.objet_id), diplomas: ch.dip || [], tenue: ch.train ? ch.train.tenue : 40, vitalite: ch.train ? ch.train.vitalite : 50, reputation: ch.reputation || 0 });
  v.blessure = ch.blessure ? { le: ch.blessure.le, vitesse: ch.blessure.vitesse } : null;
  v.campagnes = { maxJours: CAMPAIGN_MAX_DAYS, liste: (ch.campagnes || []).map(c => ({ entreprise: c.entreprise, entrepriseId: c.entreprise_id, ambassadeur: c.ambassadeur, moi: c.ambassadeur_id === ch.p.id, prixJour: c.prix_jour, fin: c.fin, slogan: c.slogan })) };
  if (ch.boss && ch.job && ch.job.salaire && v.travail.emploiEntreprise) v.travail.emploiEntreprise.salaire = ch.job.salaire;
  return v; }
function viewBase(compte, { origine = null, flux = {}, logement = null, lastStreet = null, annonces = [], reputation = 0, couple = { conjoint: null, recues: [], envoyees: [] }, p, tal, inv = [], dep = [], ret = [], gui = [], job = null, lastShift = null, enr = null, dip = [], ptsPermis = [], kids = [], par = [], sibs = [], ent = [], aVendre = [], offres = [], boss = null, comptes = [], cand = null, pub = {}, elec = null, policiers = 0, casier = [], consignes = { jour: dayKey(now), liste: [], journal: [] }, mouvements = [], notifications = 0, fid = null, motsRecus = [], motsEnvoyes = [] }, now) {
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
    repas: { ...FOOD, prix: Math.round(FOOD.prix * repDiscount(reputation)) },
    tableau: dashboard({ makuta: p.makuta, banque: comptes.reduce((s, c) => s + c.solde, 0), biens: inv.reduce((s, o) => s + ((SHOP.find(x => x.id === o.objet_id) || {}).prix || 0), 0),
      entreprises: ent.reduce((s, e) => s + (e.capital || 0), 0), maison: logement && logement.statut === "proprio" ? houseOf(logement.quartier) : 0, flux: flux || {}, depots: dep, origine, diplomas: dip, now, quartier: p.quartier, seed: p.apparence }),
    reputation: { points: reputation, label: repLabel(reputation), mauvaise: reputation <= REP_BAD, bonne: reputation >= REP_GOOD },
    couple: { ...couple, dot: DOT_MAKUTA },
    petitsBoulots: { liste: STREET_JOBS, dernier: lastStreet },
    logement: { actuel: logement, quartiers: Object.keys(RENT).map(q => ({ ...communeView(q), quartier: q, loyer: rentOf(q), prix: houseOf(q) })), minAge: HOUSING_MIN_AGE },
    annonces: annonces.map(a => ({ id: a.id, prix: a.prix, le: a.cree_le, vendeur: a.vendeur, moi: a.vendeur_id === p.id, objet: SHOP.find(x => x.id === a.objet_id) || { nom: a.objet_id } })),
    ...shopView(inv, dep, ret, p.makuta, now, gui),
    travail: { ...workView(job && job.metier_id, lastShift, now), emploiEntreprise: boss ? companyJob(boss) : null },
    ecole: schoolView(enr, dip, now),
    enfants: kids.map(k => childView(k, now)),
    entretienParJour: SUPPORT_PER_DAY,
    entreprises: companyView(ent, { aVendre, offres }, now),
    etat: stateView({ comptes, assureur: p.assureur, assureJusqu: p.assure_jusqu, operateur: p.operateur, credit: p.credit, candidature: cand && cand.poste }, pub, now),
    elections: elec,
    permis: { ...permitStatus(dip, ptsPermis, now), contraventions: ptsPermis.slice(0, 8).map(x => ({ type: x.type, nom: (TRAFFIC_TICKETS.find(t => t.id === x.type) || { nom: x.type === "sans-permis" ? "Conduite sans permis" : x.type }).nom, points: x.points, amende: x.amende, le: x.le })) },
    police: policeView({ policiers, prisonJusqu: p.prison_jusqu, casier: casier.map(c => ({ ...c, nom: ([...CRIMES, ...ROAD_FAULTS].find(x => x.id === c.type) || {}).nom || c.type })) }, now),
    voyage: { quartiers: KINSHASA_QUARTIERS, communes: COMMUNES.map(c => communeView(c.nom)), prix: TAXI_FARE, fatigue: TAXI_ENERGY, villes: OTHER_CITIES },
    mouvements,
    notifications: { actives: notifications > 0 },
    fidelite: streakView(fid, now),
    mots: { recus: motsRecus.map(m => ({ id: m.id, de: m.de_id, nom: `${m.prenom} ${m.nom}`, pseudo: m.pseudo, texte: m.texte, le: m.le, lu: !!m.lu })), nonLus: motsRecus.filter(m => !m.lu).length,
      envoyes: motsEnvoyes.map(m => ({ vers: m.vers_id, nom: `${m.prenom} ${m.nom}`, texte: m.texte, le: m.le })), modeles: GREETINGS, max: WORD_MAX },
    resume: nightSummary({ prenom: p.prenom, fem: p.sexe === "F", mouvements, vuLe: fid && fid.resume_vu_le, makutaVu: fid && fid.makuta_vu, makuta: p.makuta, besoins: needs, now }),
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
async function supportFamily(db, pid, now, env = null) {
  const { results: kids } = await db.prepare(`SELECT id, prenom, sexe, ne_le, entretien_le, pere_id, mere_id, faim, energie, bonheur, sante, maj_le FROM personnages
      WHERE mort_le IS NULL AND (id = ? OR pere_id = ? OR mere_id = ?)`).bind(pid, pid, pid).all();
  for (const k of kids) {
    const par = k.pere_id || k.mere_id;
    if (!par || ageYears(k.ne_le, now) >= 18) continue;
    const { days, due } = supportDue(k.entretien_le, k.ne_le, now);
    if (days < 1) continue;
    const pr = await db.prepare(`SELECT makuta FROM personnages WHERE id = ? AND mort_le IS NULL`).bind(par).first();
    const pay = Math.min(due, pr ? pr.makuta : 0), unpaid = Math.floor((due - pay) / SUPPORT_PER_DAY), fx = unpaidEffect(unpaid);
    // négligence cumulée : au-delà de 7 jours, l'enfant est en danger de mort (et il s'en souviendra)
    const neg = unpaid > 0 ? (await neglectOf(db, k.id)) + unpaid : 0, danger = neg >= NEGLECT_DANGER_DAYS;
    const st = [db.prepare(`UPDATE personnages SET entretien_le = ?, bonheur = MAX(0, bonheur - ?), sante = MAX(0, sante - ?) WHERE id = ?`)
      .bind((k.entretien_le || k.ne_le) + days * DAY, fx.bonheur, fx.sante + (danger ? NEGLECT_DANGER_HEALTH * unpaid : 0), k.id)];
    if (unpaid > 0) st.push(repSt(db, par, REP.negligence * unpaid, now));
    if (unpaid > 0) st.push(db.prepare(`INSERT INTO negligences (personnage_id, jours, maj_le) VALUES (?, ?, ?) ON CONFLICT(personnage_id) DO UPDATE SET jours = jours + excluded.jours, maj_le = excluded.maj_le`).bind(k.id, unpaid, now),
      db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), k.id, danger ? "🆘" : "😢",
        danger ? `${k.prenom} est ${k.sexe === "F" ? "négligée" : "négligé"} depuis ${neg} jours : ${k.sexe === "F" ? "elle" : "il"} est en danger de mort, et s'en souviendra.` : `Entretien de ${k.prenom} impayé (${neg} jour${neg > 1 ? "s" : ""} de négligence au total).`, now));
    if (pay > 0) st.push(
      db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(pay, par, pay), GUARD(db),
      db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(pay, k.id),
      db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), par, k.id, pay, `entretien de l'enfant (${days} j)`, now));
    // enfant négligé : il peut voler pour survivre (le joueur responsable doit veiller à ce qu'il ne manque de rien)
    const hunger = needsAt({ hunger: k.faim, energy: k.energie, happiness: k.bonheur, health: k.sante, updatedAt: k.maj_le }, now).hunger;
    if (unpaid > 0 && ageYears(k.ne_le, now) >= NEGLECT_STEAL_AGE && Math.random() < neglectStealChance(unpaid, hunger)) {
      const cr = CRIMES.find(c => c.id === "vol-marche"), caught = Math.random() < catchChance(cr, 0);
      if (caught) {
        const fine = Math.min(cr.amende, Math.max(0, (pr ? pr.makuta : 0) - pay));
        st.push(db.prepare(`INSERT INTO infractions (id, personnage_id, type, amende, prison_heures, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), k.id, cr.id, fine, now),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), k.id, "🚓", `${k.prenom}, sans entretien et le ventre vide, a volé au marché et s'est fait attraper. Amende payée par les parents : ${fmtMakuta(fine)}.`, now));
        if (fine > 0) st.push(db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(fine, par, fine),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1`).bind(uid(), par, STATE_ID, fine, `amende : vol de l'enfant ${k.prenom}`, now));
      } else {
        const gain = cr.gain[0] + Math.floor(Math.random() * (cr.gain[1] - cr.gain[0]));
        st.push(db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(gain, k.id),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), k.id, gain, "vol au marché (enfant négligé)", now),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), k.id, "🫳", `${k.prenom}, sans personne pour s'occuper de ${k.sexe === "F" ? "elle" : "lui"}, a volé ${fmtMakuta(gain)} au marché pour manger.`, now));
      }
    }
    await db.batch(st);
    await checkDeath(env, db, k.id, now);
  }
}

// loyer : prélevé à chaque visite pour les semaines dues ; impayé = expulsion
async function collectRent(db, pid, now) {
  const L = await db.prepare(`SELECT * FROM logements WHERE personnage_id = ? AND statut = 'loue'`).bind(pid).first();
  if (!L) return;
  const weeks = rentDue(L.paye_jusqu, now); if (!weeks) return;
  const p = await db.prepare(`SELECT makuta, prenom FROM personnages WHERE id = ?`).bind(pid).first(), due = weeks * L.loyer;
  const M = (ic, t) => db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), pid, ic, t, now);
  if (p.makuta >= due) await db.batch([
    db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(due, pid, due), GUARD(db),
    db.prepare(`UPDATE logements SET paye_jusqu = ? WHERE personnage_id = ?`).bind(L.paye_jusqu + weeks * 7 * DAY, pid),
    db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), pid, due, `loyer (${weeks} semaine${weeks > 1 ? "s" : ""}) à ${L.quartier}`, now),
    M("🏠", `Loyer payé : ${fmtMakuta(due)} (${L.quartier}).`)]);
  else await db.batch([
    db.prepare(`DELETE FROM logements WHERE personnage_id = ?`).bind(pid),
    db.prepare(`UPDATE personnages SET bonheur = MAX(0, bonheur - 20) WHERE id = ?`).bind(pid),
    repSt(db, pid, -5, now), M("🚪", `Loyer impayé : expulsé du logement à ${L.quartier}. Retour chez les parents.`)]);
}
// le destin : au plus un événement toutes les 20 heures réelles par personnage
async function dailyEvent(db, pid, now) {
  const last = await db.prepare(`SELECT MAX(le) AS le FROM activites WHERE personnage_id = ? AND activite LIKE 'evenement:%'`).bind(pid).first();
  if (last && last.le && now - last.le < EVENT_EVERY_H * 36e5) return;
  const p = await db.prepare(`SELECT * FROM personnages WHERE id = ? AND mort_le IS NULL`).bind(pid).first(); if (!p) return;
  await settle(db, p, now);
  const o = await db.prepare(`SELECT caractere, role, camp FROM origines WHERE personnage_id = ?`).bind(pid).first();
  const mq = await db.prepare(`SELECT 1 AS x FROM possessions WHERE proprietaire_id = ? AND objet_id = 'moustiquaire' LIMIT 1`).bind(pid).first();
  const e = drawEvent(Math.random, { quartier: p.quartier, camp: roleOf(o, p.apparence).camp, moustiquaire: !!mq }), st = [db.prepare(`INSERT INTO activites (id, personnage_id, activite, score, resultat, le) VALUES (?, ?, ?, 0, '', ?)`).bind(uid(), pid, "evenement:" + (e ? e.id : "calme"), now)];
  if (e) {
    let m = eventMoney(e); if (m < 0) m = -Math.min(-m, p.makuta);
    st.push(db.prepare(`UPDATE personnages SET sante = MAX(1, MIN(100, sante + ?)), energie = MAX(0, MIN(100, energie + ?)), bonheur = MAX(0, MIN(100, bonheur + ?)), makuta = makuta + ? WHERE id = ?`)
      .bind(e.sante || 0, e.energie || 0, e.bonheur || 0, m, pid),
      db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), pid, e.icone, `${p.prenom} ${e.texte}${m ? ` (${m > 0 ? "+" : "−"}${fmtMakuta(Math.abs(m))})` : ""}.`, now));
    if (m) st.push(db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), m < 0 ? pid : null, m > 0 ? pid : null, Math.abs(m), "destin : " + e.id, now));
    if (e.rep) st.push(repSt(db, pid, e.rep, now));
  }
  await db.batch(st);
}
// maturité d'un adulte arrivé récemment : le travail et les études le font mûrir plus vite
const matSt = (db, id, n) => db.prepare(`UPDATE origines SET maturite = MIN(100, maturite + ?) WHERE personnage_id = ? AND adulte = 1`).bind(n, id);
// réputation : une ligne à ajouter au lot d'écritures
const repSt = (db, id, d, now) => db.prepare(`INSERT INTO reputations (personnage_id, points, maj_le) VALUES (?, ?, ?) ON CONFLICT(personnage_id) DO UPDATE SET points = MAX(-100, MIN(100, points + excluded.points)), maj_le = excluded.maj_le`).bind(id, d, now);
async function repOf(db, id) { const r = await db.prepare(`SELECT points FROM reputations WHERE personnage_id = ?`).bind(id).first(); return r ? r.points : 0; }

// ---------------------------------------------------------------- mort et héritage
async function neglectOf(db, id) { const r = await db.prepare(`SELECT jours FROM negligences WHERE personnage_id = ?`).bind(id).first(); return r ? r.jours : 0; }
// la santé est tombée à 0 ? le personnage meurt (définitif) et sa fortune est partagée
async function checkDeath(env, db, id, now) {
  const p = await db.prepare(`SELECT * FROM personnages WHERE id = ? AND mort_le IS NULL`).bind(id).first();
  if (!p) return false;
  const n = needsAt({ hunger: p.faim, energy: p.energie, happiness: p.bonheur, health: p.sante, updatedAt: p.maj_le }, now);
  const tv = await db.prepare(`SELECT vitalite FROM train_de_vie WHERE personnage_id = ?`).bind(id).first();
  const cause = deathCause(n, await neglectOf(db, id), !!tv && ageYears(p.ne_le, now) > lifeExpectancy(tv.vitalite));
  if (!cause) return false;
  await die(env, db, p, cause, now);
  return true;
}
async function die(env, db, p, cause, now) {
  const { results: banks } = await db.prepare(`SELECT banque_id, solde FROM comptes_banque WHERE personnage_id = ?`).bind(p.id).all();
  const total = p.makuta + banks.reduce((a, b) => a + b.solde, 0);
  // héritiers : enfants et parents vivants, sinon le conjoint, sinon personne (la ville prend tout)
  let { results: heirs } = await db.prepare(`SELECT id, compte_id FROM personnages WHERE mort_le IS NULL AND id != ? AND (pere_id = ? OR mere_id = ? OR id IN (?, ?))`)
    .bind(p.id, p.id, p.id, p.pere_id || "", p.mere_id || "").all();
  if (!heirs.length && p.conjoint_id) heirs = (await db.prepare(`SELECT id, compte_id FROM personnages WHERE id = ? AND mort_le IS NULL`).bind(p.conjoint_id).all()).results;
  const sp = splitEstate(total, heirs.length);
  const T = (de, vers, m, motif) => db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), de, vers, m, motif, now);
  const S = (h, part, m) => db.prepare(`INSERT INTO successions (id, defunt_id, heritier_id, part, montant, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, h, part, m, now);
  const st = [
    db.prepare(`UPDATE personnages SET mort_le = ?, cause_mort = ?, makuta = 0, sante = 0, accueille_enfants = 0 WHERE id = ?`).bind(now, cause, p.id),
    db.prepare(`DELETE FROM comptes_banque WHERE personnage_id = ?`).bind(p.id),
    db.prepare(`UPDATE personnages SET conjoint_id = NULL WHERE conjoint_id = ?`).bind(p.id),
    db.prepare(`UPDATE emplois SET fin = ? WHERE personnage_id = ? AND fin IS NULL`).bind(now, p.id),
    db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), p.id, "✝️", `${p.prenom} ${p.nom} est ${p.sexe === "F" ? "morte" : "mort"} (${cause}).`, now),
    S(STATE_ID, "ville", sp.ville), ...(sp.ville > 0 ? [T(p.id, STATE_ID, sp.ville, "frais de succession de " + p.prenom + " " + p.nom)] : []),
  ];
  if (p.compte_id) st.push(S(null, "report", sp.report),
    db.prepare(`INSERT INTO reports (compte_id, makuta, de_id, le) VALUES (?, ?, ?, ?) ON CONFLICT(compte_id) DO UPDATE SET makuta = makuta + excluded.makuta, de_id = excluded.de_id, le = excluded.le`).bind(p.compte_id, sp.report, p.id, now));
  for (const hr of heirs) if (sp.each > 0) st.push(S(hr.id, "heritier", sp.each),
    db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(sp.each, hr.id), T(p.id, hr.id, sp.each, "héritage de " + p.prenom + " " + p.nom),
    db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), hr.id, "🕊️", `Héritage de ${p.prenom} ${p.nom} : ${fmtMakuta(sp.each)}.`, now));
  await db.batch(st);
  if (env) for (const hr of heirs) if (hr.compte_id) try { await notify(env, db, hr.compte_id, { titre: "2 Life · décès", texte: `${p.prenom} ${p.nom} est ${p.sexe === "F" ? "morte" : "mort"} (${cause}). Tu hérites de ${fmtMakuta(sp.each)}.`, url: "vie.html#moves" }); } catch (e) { console.error(e); }
}
function deadView(compte, p, report, now, album = null) {
  return { compte: { pseudo: compte.pseudo, reputation: compte.reputation }, mort: { prenom: p.prenom, nom: p.nom, sexe: p.sexe, neLe: p.ne_le, mortLe: p.mort_le, cause: p.cause_mort,
    age: Math.floor(ageYears(p.ne_le, p.mort_le || now)), album }, report: report ? report.makuta : 0, renaissance: OFFERS.find(o => o.id === "bebe") };
}
// album de vie : résumé d'une vie terminée
async function albumOf(db, p) {
  const one = async (q, ...b) => (await db.prepare(q).bind(...b).first()) || {};
  const job = await one(`SELECT metier_id FROM emplois WHERE personnage_id = ? ORDER BY depuis DESC LIMIT 1`, p.id);
  const { results: tl } = await db.prepare(`SELECT talent_id FROM talents_personnage WHERE personnage_id = ? AND decouvert = 1`).bind(p.id).all();
  const sp = p.conjoint_id ? await one(`SELECT prenom || ' ' || nom AS n FROM personnages WHERE id = ?`, p.conjoint_id) : {};
  const lastSpouse = sp.n || (await one(`SELECT q.prenom || ' ' || q.nom AS n FROM demandes_mariage d JOIN personnages q ON q.id = CASE WHEN d.de_id = ? THEN d.vers_id ELSE d.de_id END WHERE (d.de_id = ? OR d.vers_id = ?) AND d.statut = 'acceptee' ORDER BY d.le DESC LIMIT 1`, p.id, p.id, p.id)).n;
  return lifeAlbum({ prenom: p.prenom, nom: p.nom, sexe: p.sexe, quartier: p.quartier, age: Math.floor(ageYears(p.ne_le, p.mort_le)), cause: p.cause_mort,
    metier: job.metier_id ? (JOBS.find(j => j.id === job.metier_id) || { nom: job.metier_id }).nom : null,
    diplomes: (await one(`SELECT COUNT(*) AS n FROM diplomes_obtenus WHERE personnage_id = ?`, p.id)).n,
    talents: tl.map(t => (TALENTS.find(x => x.id === t.talent_id) || {}).label).filter(Boolean), conjoint: lastSpouse,
    enfants: (await one(`SELECT COUNT(*) AS n FROM personnages WHERE pere_id = ? OR mere_id = ?`, p.id, p.id)).n,
    entreprises: (await one(`SELECT COUNT(*) AS n FROM entreprises WHERE proprietaire_id = ?`, p.id)).n,
    crimes: (await one(`SELECT COUNT(*) AS n FROM infractions WHERE personnage_id = ?`, p.id)).n,
    reputation: await repOf(db, p.id), fortune: (await one(`SELECT COALESCE(SUM(montant), 0) AS n FROM successions WHERE defunt_id = ?`, p.id)).n });
}

// ---------------------------------------------------------------- lancement
async function launchCounts(db) {
  // un compte = une vraie personne inscrite ; on compte les comptes qui ont un personnage vivant
  const a = await db.prepare(`SELECT COUNT(DISTINCT compte_id) AS n FROM personnages WHERE compte_id IS NOT NULL AND mort_le IS NULL`).first();
  const e = await db.prepare(`SELECT COUNT(*) AS n FROM entreprises`).first();
  return { joueurs: a.n, entreprises: e.n };
}
async function launch(db, now = Date.now()) {
  const { results } = await db.prepare(`SELECT cle, valeur FROM jeu WHERE cle IN ('demarre_le', 'date_ouverture')`).all();
  const kv = Object.fromEntries(results.map(r => [r.cle, Number(r.valeur)]));
  let S = launchStatus(await launchCounts(db), kv.demarre_le || null, kv.date_ouverture || null, now);
  return S;   // pas de démarrage automatique : l'administrateur appuie sur « Lancer le jeu » (règle du 26/11)
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
// ---------------------------------------------------------------- passerelle de paiement (argent réel)
// retrait refusé ou échoué : les e-makuta reviennent au joueur, une seule fois
async function refundPayout(db, ref, now) {
  const g = await db.prepare(`SELECT * FROM guichet WHERE id = ? AND sens = 'retrait'`).bind(ref).first();
  if (!g || !g.personnage_id) return;
  const u = await db.prepare(`UPDATE guichet SET statut = 'echoue' WHERE id = ? AND statut IN ('en_attente', 'traitement')`).bind(ref).run();
  if (!u.meta || u.meta.changes !== 1) return;
  await db.batch([
    db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(g.makuta, g.personnage_id),
    db.prepare(`DELETE FROM retraits WHERE compte_id = ? AND le = ?`).bind(g.compte_id, g.le),
    db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), g.personnage_id, g.makuta, "retrait échoué : e-makuta rendus", now),
  ]);
}
async function paymentNotice(env, req, h) {
  if (!REAL_MONEY || !payConfigured(env)) return fail(h, 404, "Route inconnue.");
  const n = await readNotice(env, req);
  if (!n || !n.ref) return fail(h, 401, "Signature invalide.");
  const db = env.DB, now = Date.now();
  const g = await db.prepare(`SELECT * FROM guichet WHERE id = ?`).bind(n.ref).first();
  if (!g) return fail(h, 404, "Référence inconnue.");
  if (n.status === "en_attente") return json(h, 200, { ok: true });
  if (g.sens === "retrait") {
    if (n.status === "paye") await db.prepare(`UPDATE guichet SET statut = 'paye' WHERE id = ? AND statut = 'en_attente'`).bind(g.id).run();
    else await refundPayout(db, g.id, now);
    return json(h, 200, { ok: true });
  }
  // dépôt : on crédite une seule fois, et seulement si le montant payé est le bon
  if (n.status !== "paye" || !(Math.abs(n.amount - g.usd) < .005)) {
    await db.prepare(`UPDATE guichet SET statut = 'echoue' WHERE id = ? AND statut = 'en_attente'`).bind(g.id).run();
    return json(h, 200, { ok: true });
  }
  const u = await db.prepare(`UPDATE guichet SET statut = 'traitement' WHERE id = ? AND statut = 'en_attente'`).bind(g.id).run();
  if (!u.meta || u.meta.changes !== 1) return json(h, 200, { ok: true, deja: true });
  await db.batch([
    db.prepare(`INSERT INTO depots (id, compte_id, offre, usd, makuta, simule, le) VALUES (?, ?, 'recharge', ?, ?, 0, ?)`).bind(uid(), g.compte_id, g.usd, g.makuta, now),
    db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(g.makuta, g.personnage_id),
    db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), g.personnage_id, g.makuta, "dépôt au guichet", now),
    db.prepare(`UPDATE guichet SET statut = 'paye' WHERE id = ?`).bind(g.id),
  ]);
  return json(h, 200, { ok: true });
}

const worker = {
  // toutes les 15 minutes (Cron Trigger gratuit) : les personnages suivent leurs consignes, même joueur déconnecté
  async scheduled(event, env, ctx) {
    const db = env.DB, now = Date.now();
    await loadSettings(db, now, true);
    // jeu pas encore lancé : le temps est arrêté, aucune règle ne s'applique encore
    if (CLOCK.pause) { try { await freezeTime(db, now); } catch (e) { console.error(e); } return; }
    try { await parlement(db, now); } catch (e) { console.error(e); }
    try { await kidAlerts(env, now); } catch (e) { console.error(e); }
    try { await morningPush(env, now); } catch (e) { console.error(e); }
    try { await dailyPublic(db, now); } catch (e) { console.error(e); }
    try { await dailyFootball(db, now); } catch (e) { console.error(e); }
    // train de vie : les adultes qui n'ont pas encore dépensé aujourd'hui (200 par passage, toutes les 15 minutes)
    try {
      const { results: adults } = await db.prepare(`SELECT p.id FROM personnages p LEFT JOIN train_de_vie t ON t.personnage_id = p.id WHERE p.mort_le IS NULL AND p.compte_id IS NOT NULL AND p.ne_le <= ? AND (t.dernier_jour IS NULL OR t.dernier_jour != ?) LIMIT 200`)
        .bind(now - CHILD_REAL_DAYS * DAY, dayKey(now)).all();
      for (const a of adults) { try { await dailyLiving(db, a.id, now); } catch (e) { console.error(e); } }
    } catch (e) { console.error(e); }
    // les joueurs absents peuvent aussi mourir (faim, maladie)
    try {
      const { results: alive } = await db.prepare(`SELECT id FROM personnages WHERE mort_le IS NULL AND compte_id IS NOT NULL ORDER BY maj_le LIMIT 300`).all();
      for (const a of alive) await checkDeath(env, db, a.id, now);
    } catch (e) { console.error(e); }
    const { results } = await db.prepare(`SELECT DISTINCT c.personnage_id AS pid, p.compte_id FROM consignes c JOIN personnages p ON p.id = c.personnage_id WHERE c.jour = ? AND p.mort_le IS NULL LIMIT 500`).bind(dayKey(now)).all();
    for (const r of results) {
      try {
        const compte = await db.prepare(`SELECT * FROM comptes WHERE id = ? AND vie_id = ?`).bind(r.compte_id, r.pid).first();
        if (!compte) continue;
        await supportFamily(db, r.pid, now, env);
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
        if (!["/api/inscription", "/api/connexion", "/api/beta", "/api/support"].includes(path) && !path.startsWith("/api/admin/")) {
          const out = await res.clone().json().catch(() => ({}));
          const d = describeAction(path, await copy.json().catch(() => ({})), out);
          const compte = d && await auth(env.DB, req, Date.now());
          if (compte) {
            const m = { icone: d.icone, texte: d.texte, par_consigne: req.headers.get("X-Consigne") ? 1 : 0, le: Date.now() };
            await env.DB.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, ?, ?)`)
              .bind(uid(), compte.vie_id, m.icone, m.texte, m.par_consigne, m.le).run();
            if (IMPORTANT_FOR_PARENTS.includes(path) && (path !== "/api/crime" || d.texte.startsWith("Attrapé"))) await notifyParents(env, compte.vie_id, d);
            // la réponse montre tout de suite ce nouveau mouvement
            if (Array.isArray(out.mouvements)) { out.mouvements = [m, ...out.mouvements].slice(0, 100); return new Response(JSON.stringify(out), { status: res.status, headers: res.headers }); }
          }
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
    // notification signée de la passerelle de paiement (corps brut, pas de session joueur)
    if (url.pathname === "/api/paiement/notification" && req.method === "POST") return paymentNotice(env, req, h);
    let body = {};
    if (req.method === "POST") { try { body = await req.json(); } catch (e) { return fail(h, 400, "Requête illisible."); } }

    try {
      if (url.pathname === "/api/sante") return json(h, 200, { ok: true, jeu: "2 Life" });
      await loadSettings(db, now);
      if (url.pathname === "/api/reglages" && req.method === "GET") return json(h, 200, { reglages: { ...SET } });

      if (url.pathname === "/api/push/cle" && req.method === "GET") return json(h, 200, { cle: (await vapidKeys(env, db)).publique });
      // site servi par ce Worker : config.js pointe vers l'API du même domaine (mode réel, pas démo)
      if (url.pathname === "/config.js") return new Response(`// 2 Life : configuration générée par le serveur\nwindow.ZBOSS_CONFIG = { SUPABASE_URL: "", SUPABASE_ANON_KEY: "" };\nwindow.TWO_LIFE_API = ${JSON.stringify(url.origin)};\n`,
        { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache" } });
      if (url.pathname === "/api/lancement" && req.method === "GET") return json(h, 200, await launch(db));
      // ville en direct : WebSocket vers l'objet de la ville (le jeton de session voyage dans le sous-protocole)
      if (url.pathname === "/api/ville/direct") {
        if (req.headers.get("Upgrade") !== "websocket") return fail(h, 426, "WebSocket attendu.");
        if (!env.CITY) return fail(h, 503, "La ville en direct n'est pas encore ouverte.");
        const tok = (req.headers.get("Sec-WebSocket-Protocol") || "").split(",").map(x => x.trim()).find(x => /^[a-f0-9-]{36}$/.test(x));
        const c = tok && await db.prepare(`SELECT c.id, c.vie_id, c.cree_le FROM sessions s JOIN comptes c ON c.id = s.compte_id WHERE s.token = ? AND s.expire_le > ?`).bind(tok, now).first();
        if (!c) return fail(h, 401, "Connecte-toi pour continuer.");
        const p = await db.prepare(`SELECT id, prenom, sexe, mort_le FROM personnages WHERE id = ?`).bind(c.vie_id).first();
        if (!p || p.mort_le) return fail(h, 403, "Ton personnage n'est plus dans la ville.");
        const rg = await db.prepare(`SELECT COUNT(*) AS n FROM comptes WHERE cree_le < ? OR (cree_le = ? AND id <= ?)`).bind(c.cree_le, c.cree_le, c.id).first();
        const room = env.CITY.get(env.CITY.idFromName("kinshasa"));
        return room.fetch("https://ville/direct", { headers: { Upgrade: "websocket", "X-Joueur": p.id, "X-Nom": encodeURIComponent(p.prenom), "X-Fem": p.sexe === "F" ? "1" : "0", "X-Pio": pioneerView(rg.n).pionnier ? "1" : "0" } });
      }
      if (url.pathname === "/api/celebrites" && req.method === "GET") return json(h, 200, await celebrities(db, now));
      if (url.pathname === "/api/bandeau" && req.method === "GET") {
        if (!TICKER.at || now - TICKER.at > 60e3) {
          const pubs = (await activeAds(db, now)).filter(a => adShownIn(a, "bandeau"));
          const { results: communiques } = await db.prepare(`SELECT auteur, texte FROM communiques WHERE actif = 1 AND debut <= ? AND fin > ? ORDER BY cree_le DESC LIMIT 10`).bind(now, now).all();
          const fin = await publicFinance(db, now), cal = await elections(db, now), une = newspaper(await newsFacts(db, now), now).une;
          const { results: campagnes } = await db.prepare(`SELECT e.nom AS entreprise, a.prenom || ' ' || a.nom AS ambassadeur, a.sexe, c.slogan FROM campagnes c JOIN entreprises e ON e.id = c.entreprise_id JOIN personnages a ON a.id = c.ambassadeur_id WHERE c.fin > ? ORDER BY c.debut DESC LIMIT 8`).bind(now).all();
          const lastDay = await db.prepare(`SELECT MAX(jour) AS j FROM matchs`).first();
          const { results: matchs } = lastDay && lastDay.j ? await db.prepare(`SELECT dom_nom, ext_nom, buts_dom, buts_ext FROM matchs WHERE jour = ? LIMIT 12`).bind(lastDay.j).all() : { results: [] };
          TICKER.data = { items: tickerItems({ pubs, communiques, tresor: fin.tresor, impotsJour: fin.impotsJour, salairesJour: fin.salairesJour, arrieres: fin.arrieres, elec: cal, une,
            campagnes: campagnes.map(c => ({ ...c, fem: c.sexe === "F" })), matchs }, now) }; TICKER.at = now;
          const { results: logos } = await db.prepare(`SELECT nom, logo FROM partenaires_logos WHERE actif = 1 AND accord = 1 AND debut <= ? AND fin > ? ORDER BY cree_le DESC LIMIT ?`).bind(now, now, LOGOS_MAX_SHOWN).all();
          TICKER.data.logos = logos;
        }
        return new Response(JSON.stringify(TICKER.data), { status: 200, headers: { ...h, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" } });
      }
      if (url.pathname === "/api/pubs" && req.method === "GET") return json(h, 200, { pubs: (await activeAds(db, now)).filter(a => adShownIn(a, "panneau")) });

      // liste d'attente bêta : formulaire public de l'accueil (pas de compte nécessaire)
      if (url.pathname === "/api/beta" && req.method === "POST") {
        const t = v => String(v ?? "").trim();
        const pseudo = t(body.pseudo).slice(0, 40), email = t(body.email).toLowerCase();
        if (pseudo.length < 2) return fail(h, 400, "Choisis un pseudo d'au moins 2 caractères.");
        if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(h, 400, "Cette adresse e-mail ne semble pas valide.");
        const r = await db.prepare(`INSERT OR IGNORE INTO beta_inscrits (id, pseudo, email, pays, plateforme, newsletter, source, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(uid(), pseudo, email, t(body.country).slice(0, 60) || null, t(body.platform).slice(0, 40) || null, body.newsletter ? 1 : 0, t(body.source).slice(0, 60) || "landing", now).run();
        if (!r.meta.changes) return fail(h, 409, "Cette adresse est déjà inscrite.");
        return json(h, 201, { ok: true });
      }

      // bureau Zboss Sarlu (guichet d'aide du jeu) : ouvert à tous, compte facultatif
      if (url.pathname === "/api/support" && req.method === "POST") {
        const t = v => String(v ?? "").trim();
        const message = t(body.message).slice(0, 2000), email = t(body.email).toLowerCase().slice(0, 254);
        if (message.length < 5) return fail(h, 400, "Écris quelques mots sur ton problème.");
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(h, 400, "Cette adresse e-mail ne semble pas valide.");
        const c = await auth(db, req, now);
        const recent = await db.prepare(`SELECT COUNT(*) AS n FROM support_demandes WHERE cree_le > ? AND (email = ? OR compte_id = ?)`).bind(now - 36e5, email || "-", c ? c.id : "-").first();
        if (recent && recent.n >= 10) return fail(h, 429, "Tu as déjà envoyé beaucoup de demandes. Réessaie dans une heure.");
        await db.prepare(`INSERT INTO support_demandes (id, compte_id, pseudo, email, categorie, message, page, statut, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, 'ouvert', ?)`)
          .bind(uid(), c ? c.id : null, t(body.pseudo).slice(0, 40) || (c ? c.pseudo : null), email || (c ? c.email : null), t(body.categorie).slice(0, 60) || "Autre", message, t(body.page).slice(0, 40) || null, now).run();
        return json(h, 201, { ok: true });
      }

      if (url.pathname === "/api/inscription" && req.method === "POST") {
        const L = await launch(db);
        if (!L.demarre && !canSignupBeforeLaunch(body.formule) && !isAdmin(env, { email: String(body.email || "").trim().toLowerCase() })) {
          const miss = L.conditions.filter(c => !c.ok).map(c => `${c.label.toLowerCase()} : ${c.actuel}/${c.min}`).join(", ");
          return fail(h, 403, `Le jeu n'a pas encore démarré (${miss || "en attente du lancement"}).`);
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
        await checkDeath(env, db, c.vie_id, now);
        const chc = await loadCharacter(db, c.vie_id);
        if (chc.p.mort_le) return json(h, 200, { token, ...deadView(c, chc.p, await db.prepare(`SELECT makuta FROM reports WHERE compte_id = ?`).bind(c.id).first(), now, await albumOf(db, chc.p)), admin: isAdmin(env, c) });
        return json(h, 200, { token, ...view(c, chc, now), admin: isAdmin(env, c) });
      }

      // ---- routes réservées aux joueurs connectés
      const compte = await auth(db, req, now);
      if (!compte) return fail(h, 401, "Connecte-toi pour continuer.");
      // ---- pionniers : les 100 premiers inscrits entrent vraiment dans les lieux en 3D (intérieurs meublés)
      if (url.pathname === "/api/pionnier" && req.method === "GET") {
        const r = await db.prepare(`SELECT COUNT(*) AS n FROM comptes WHERE cree_le < ? OR (cree_le = ? AND id <= ?)`).bind(compte.cree_le, compte.cree_le, compte.id).first();
        const t = await db.prepare(`SELECT COUNT(*) AS n FROM comptes`).first();
        return json(h, 200, pioneerView(r.n, t.n));
      }

      // ---- administration (e-mails listés dans ADMIN_EMAILS)
      if (url.pathname.startsWith("/api/admin/")) {
        if (!isAdmin(env, compte)) return fail(h, 403, "Réservé à l'administrateur.");
        if (url.pathname === "/api/admin/etat" && req.method === "GET") {
          const { results: parents } = await db.prepare(`SELECT p.prenom, p.nom, p.sexe, p.quartier, c.pseudo, c.email, c.cree_le FROM personnages p JOIN comptes c ON c.id = p.compte_id WHERE p.fondateur = 1 ORDER BY c.cree_le`).all();
          const { results: inv } = await db.prepare(`SELECT c.pseudo, c.email, d.offre, d.usd, d.le FROM depots d JOIN comptes c ON c.id = d.compte_id WHERE d.offre IN ('petit','grand') ORDER BY d.le`).all();
          const { results: ent } = await db.prepare(`SELECT e.nom, e.type, e.local AS quartier, e.cree_le, p.prenom || ' ' || p.nom AS proprietaire FROM entreprises e JOIN personnages p ON p.id = e.proprietaire_id ORDER BY e.cree_le`).all();
          const { results: beta } = await db.prepare(`SELECT pseudo, email, pays, plateforme, newsletter, source, cree_le FROM beta_inscrits ORDER BY cree_le DESC LIMIT 2000`).all();
          const { results: support } = await db.prepare(`SELECT id, pseudo, email, categorie, message, statut, cree_le, resolu_le FROM support_demandes ORDER BY statut = 'ouvert' DESC, cree_le DESC LIMIT 300`).all();
          const nb = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(usd), 0) AS usd FROM depots WHERE offre = 'bebe'`).first();
          // observer le jeu pour l'améliorer : population, enfants négligés, décès, derniers événements
          const pop = await db.prepare(`SELECT SUM(mort_le IS NULL) AS vivants, SUM(mort_le IS NOT NULL) AS morts, SUM(mort_le IS NULL AND ne_le > ?) AS enfants FROM personnages WHERE compte_id IS NOT NULL`).bind(now - birthShiftMs(18)).first();
          const ng = await db.prepare(`SELECT SUM(n.jours > 0) AS negliges, SUM(n.jours >= ?) AS danger FROM negligences n JOIN personnages p ON p.id = n.personnage_id WHERE p.mort_le IS NULL`).bind(NEGLECT_DANGER_DAYS).first();
          const { results: deces } = await db.prepare(`SELECT p.prenom, p.nom, p.cause_mort AS cause, p.ne_le, p.mort_le, c.pseudo,
              (SELECT COALESCE(SUM(montant), 0) FROM successions s WHERE s.defunt_id = p.id) AS fortune FROM personnages p LEFT JOIN comptes c ON c.id = p.compte_id
              WHERE p.mort_le IS NOT NULL ORDER BY p.mort_le DESC LIMIT 20`).all();
          const { results: evts } = await db.prepare(`SELECT m.icone, m.texte, m.le, p.prenom || ' ' || p.nom AS qui FROM mouvements m JOIN personnages p ON p.id = m.personnage_id ORDER BY m.le DESC LIMIT 40`).all();
          const pub = await publicState(db);
          const observer = { vivants: pop.vivants || 0, morts: pop.morts || 0, enfants: pop.enfants || 0, negliges: ng.negliges || 0, enDanger: ng.danger || 0,
            tresor: pub.tresor, masse: pub.masse, deces: deces.map(d => ({ ...d, age: Math.floor(ageYears(d.ne_le, d.mort_le)) })), evenements: evts };
          return json(h, 200, { reglages: { defs: SETTINGS, valeurs: { ...SET } }, lancement: await launch(db), observer, naissances: { n: nb.n, usd: nb.usd, fraisAdmin: nb.n * ADMIN_FEE_USD, parents: nb.usd - nb.n * ADMIN_FEE_USD }, parents, investisseurs: inv, entreprises: ent, elections: await elections(db, now), beta, support });
        }
        if (url.pathname === "/api/admin/reglages" && req.method === "POST") {
          const v = body.valeurs || {}, st = [];
          for (const s of SETTINGS) if (v[s.id] != null) {
            const n = Number(v[s.id]); if (!Number.isFinite(n) || n < s.min || n > s.max) return fail(h, 400, `${s.label} : entre ${s.min} et ${s.max}.`);
            st.push(db.prepare(`INSERT INTO reglages (cle, valeur, maj_le) VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur, maj_le = excluded.maj_le`).bind(s.id, n, now));
          }
          if (st.length) await db.batch(st);
          await loadSettings(db, now, true);
          return json(h, 200, { ok: true, reglages: { defs: SETTINGS, valeurs: { ...SET } } });
        }
        if (url.pathname === "/api/admin/pubs" && req.method === "GET") {
          const { results } = await db.prepare(`SELECT * FROM pubs ORDER BY cree_le DESC LIMIT 200`).all();
          return json(h, 200, { pubs: results.map(a => ({ ...a, enCours: !!a.actif && a.debut <= now && a.fin > now })), emplacements: AD_SPOTS });
        }
        if (url.pathname === "/api/admin/pub" && req.method === "POST") {
          const no = cannotCreateAd(body); if (no) return fail(h, 400, no);
          const t = k => String(body[k] ?? "").trim(), jours = Number(body.jours), debut = Number(body.debut) || now;
          const couleur = AD_COLORS.includes(body.couleur) ? body.couleur : AD_COLORS[Math.floor(Math.random() * AD_COLORS.length)];
          await db.prepare(`INSERT INTO pubs (id, annonceur, titre, texte, commune, emplacement, couleur, debut, fin, prix_usd, paye, accord, actif, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`)
            .bind(uid(), t("annonceur"), t("titre"), t("texte") || null, t("commune") || null, body.emplacement, couleur, debut, debut + jours * 864e5, adPrice(body.emplacement, jours), body.paye ? 1 : 0, now).run();
          TICKER.at = 0; return json(h, 201, { ok: true });
        }
        if (url.pathname === "/api/admin/communiques" && req.method === "GET") {
          const { results } = await db.prepare(`SELECT * FROM communiques ORDER BY cree_le DESC LIMIT 100`).all();
          return json(h, 200, { communiques: results.map(c => ({ ...c, enCours: !!c.actif && c.debut <= now && c.fin > now })) });
        }
        if (url.pathname === "/api/admin/communique" && req.method === "POST") {
          const no = cannotCreateCommunique(body); if (no) return fail(h, 400, no);
          await db.prepare(`INSERT INTO communiques (id, auteur, texte, debut, fin, accord, actif, cree_le) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
            .bind(uid(), String(body.auteur).trim(), String(body.texte).trim(), now, now + Number(body.jours) * 864e5, body.accord ? 1 : 0, now).run();
          TICKER.at = 0; return json(h, 201, { ok: true });
        }
        if (url.pathname === "/api/admin/logos" && req.method === "GET") {
          const { results } = await db.prepare(`SELECT id, nom, logo, debut, fin, accord, actif, cree_le FROM partenaires_logos ORDER BY cree_le DESC LIMIT 50`).all();
          return json(h, 200, { logos: results.map(l => ({ ...l, enCours: !!l.actif && l.debut <= now && l.fin > now })) });
        }
        if (url.pathname === "/api/admin/logo" && req.method === "POST") {
          const no = cannotAddLogo(body); if (no) return fail(h, 400, no);
          await db.prepare(`INSERT INTO partenaires_logos (id, nom, logo, debut, fin, accord, actif, cree_le) VALUES (?, ?, ?, ?, ?, 1, 1, ?)`)
            .bind(uid(), String(body.nom).trim(), body.logo, now, now + Number(body.jours) * 864e5, now).run();
          TICKER.at = 0; return json(h, 201, { ok: true });
        }
        if (url.pathname === "/api/admin/logo/statut" && req.method === "POST") {
          await db.prepare(`UPDATE partenaires_logos SET actif = ? WHERE id = ?`).bind(body.actif ? 1 : 0, String(body.id || "")).run();
          TICKER.at = 0; return json(h, 200, { ok: true });
        }
        if (url.pathname === "/api/admin/communique/statut" && req.method === "POST") {
          await db.prepare(`UPDATE communiques SET actif = ? WHERE id = ?`).bind(body.actif ? 1 : 0, String(body.id || "")).run();
          TICKER.at = 0; return json(h, 200, { ok: true });
        }
        if (url.pathname === "/api/admin/pub/statut" && req.method === "POST") {
          await db.prepare(`UPDATE pubs SET actif = ?, paye = COALESCE(?, paye) WHERE id = ?`).bind(body.actif ? 1 : 0, body.paye === undefined ? null : body.paye ? 1 : 0, String(body.id || "")).run();
          TICKER.at = 0; return json(h, 200, { ok: true });
        }
        if (url.pathname === "/api/admin/support" && req.method === "POST") {
          const st = body.statut === "resolu" ? "resolu" : "ouvert";
          await db.prepare(`UPDATE support_demandes SET statut = ?, resolu_le = ? WHERE id = ?`).bind(st, st === "resolu" ? now : null, String(body.id || "")).run();
          return json(h, 200, { ok: true });
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
          await freezeTime(db, now);   // dernier rattrapage : chacun commence sa vie à cette minute
          await db.batch([
            db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('demarre_le', ?)`).bind(String(now)),
            db.prepare(`DELETE FROM jeu WHERE cle = 'pause_tick'`),
            db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) SELECT lower(hex(randomblob(12))), id, '🚀', ?, 0, ? FROM personnages WHERE compte_id IS NOT NULL AND mort_le IS NULL`)
              .bind("Le jeu a commencé ! Désormais rien n'est gratuit : manger, se soigner, s'habiller, étudier, faire du sport et se déplacer, tout s'achète.", now),
          ]);
          CLOCK.pause = false;
          return json(h, 200, { ok: true, lancement: await launch(db) });
        }
        return fail(h, 404, "Route inconnue.");
      }

      // avant le lancement : seules la préparation (dépôt, investissement, entreprise) et la lecture sont permises
      const pre = prelaunchBlocked(url.pathname, req.method);
      if (pre && !isAdmin(env, compte)) return fail(h, 423, pre);
      if (!CLOCK.pause) {
        try { await supportFamily(db, compte.vie_id, now, env); } catch (e) { if (!guardFailed(e)) throw e; }
        await checkDeath(env, db, compte.vie_id, now);
        try { await collectRent(db, compte.vie_id, now); } catch (e) { console.error(e); }
        try { await dailyEvent(db, compte.vie_id, now); } catch (e) { console.error(e); }
        try { if (await dailyLiving(db, compte.vie_id, now)) await checkDeath(env, db, compte.vie_id, now); } catch (e) { console.error(e); }
      }
      const ch = await loadCharacter(db, compte.vie_id);
      if (!ch) return fail(h, 404, "Personnage introuvable.");
      // personnage mort : on ne peut que voir son décès et renaître (en payant une nouvelle naissance)
      if (ch.p.mort_le) {
        const rep = await db.prepare(`SELECT makuta FROM reports WHERE compte_id = ?`).bind(compte.id).first();
        if (url.pathname === "/api/renaitre" && req.method === "POST") {
          const pid = await birth(db, compte.id, now, OFFERS.find(o => o.id === "bebe"));
          if (rep && rep.makuta > 0) await db.batch([
            db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(rep.makuta, pid),
            db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), pid, rep.makuta, "20 % gardés de la vie précédente", now),
            db.prepare(`DELETE FROM reports WHERE compte_id = ?`).bind(compte.id)]);
          const c2 = await db.prepare(`SELECT * FROM comptes WHERE id = ?`).bind(compte.id).first();
          return json(h, 200, { ...view(c2, await loadCharacter(db, pid), now), renaissance: true });
        }
        if (url.pathname === "/api/moi") return json(h, 200, deadView(compte, ch.p, rep, now, await albumOf(db, ch.p)));
        return fail(h, 409, "Ton personnage est mort. Tu peux renaître depuis la page Ma vie.");
      }
      const { p, tal } = ch;
      if (BIG_DECISIONS.includes(url.pathname) && req.method === "POST") { const no = cannotDecide(ch.origine, p.prenom, now); if (no) return fail(h, 409, no); }
      if (url.pathname === "/api/mariage/repondre" && body.accepte) { const no = cannotDecide(ch.origine, p.prenom, now); if (no) return fail(h, 409, no); }

      if (url.pathname === "/api/moi" && req.method === "GET") {
        const won = newlyReached(ch.objectifs || [], goalFacts(ch));
        if (won.length) {
          await db.batch(won.flatMap(g => [
            db.prepare(`UPDATE objectifs SET atteint_le = ? WHERE personnage_id = ? AND objectif_id = ? AND atteint_le IS NULL`).bind(now, p.id, g),
            repSt(db, p.id, GOAL_REP, now),
            db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🏆', ?, 0, ?)`).bind(uid(), p.id, `Objectif de vie atteint : ${goalsView([{ objectif_id: g }]).mes[0].nom} (+${GOAL_REP} de réputation).`, now),
          ]));
          return json(h, 200, view(compte, await loadCharacter(db, p.id), Date.now()));
        }
        if (await applyOrders(env, db, compte, ch, now)) return json(h, 200, view(compte, await loadCharacter(db, p.id), Date.now()));
        return json(h, 200, view(compte, ch, now));
      }
      if (url.pathname === "/api/push/abonner" && req.method === "POST") {
        const ep = String(body.endpoint || ""), k = body.keys || {};
        if (!/^https:\/\//.test(ep) || ep.length > 1000 || !k.p256dh || !k.auth) return fail(h, 400, "Abonnement invalide.");
        await db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('site', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(url.origin).run();
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
        const sk = await streakAdvance(db, compte.id, p.id, ch.fid, ch.consignes.jour, now);
        const c2 = await loadCharacter(db, p.id);
        await applyOrders(env, db, compte, c2, now, true);   // la consigne s'applique tout de suite si possible
        return json(h, 200, { ...view(compte, await loadCharacter(db, p.id), Date.now()), serieBonus: sk.bonus ? { jours: sk.serie, makuta: sk.bonus } : null });
      }
      // ---- vie sociale : journal, voisins, petits mots
      if (url.pathname === "/api/objectif" && req.method === "POST") {
        const id = String(body.id || "");
        if (body.action === "abandonner") await db.prepare(`DELETE FROM objectifs WHERE personnage_id = ? AND objectif_id = ? AND atteint_le IS NULL`).bind(p.id, id).run();
        else {
          const no = cannotChooseGoal(id, ch.objectifs || []); if (no) return fail(h, 409, no);
          await db.prepare(`INSERT INTO objectifs (personnage_id, objectif_id, choisi_le) VALUES (?, ?, ?)`).bind(p.id, id, now).run();
        }
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/promouvoir" && req.method === "POST") {
        const e = (ch.ent || []).find(x => x.id === body.entreprise);
        const active = e && await db.prepare(`SELECT 1 FROM pubs WHERE annonceur = ? AND actif = 1 AND fin > ?`).bind(e.nom, now).first();
        await settle(db, p, now);
        const no = cannotPromote(body, p.makuta, !!e, !!active); if (no) return fail(h, 409, no);
        const t = k => String(body[k] ?? "").trim(), jours = Number(body.jours), prix = promoPrice(body.emplacement, jours);
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(prix, p.id, prix), GUARD(db),
          tx(db, p.id, "sp-regie", prix, `promotion de ${e.nom} (${jours} j)`, now),
          db.prepare(`INSERT INTO pubs (id, annonceur, titre, texte, commune, emplacement, couleur, debut, fin, prix_usd, paye, accord, actif, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, 1, ?)`)
            .bind(uid(), e.nom, t("titre"), t("texte") || null, COMMUNES.some(c => c.nom === p.quartier) ? p.quartier : null, body.emplacement, AD_COLORS[hashCode(e.id) % AD_COLORS.length], now, now + jours * 864e5, now),
        ]);
        TICKER.at = 0;
        return json(h, 200, { promo: true, ...view(compte, await loadCharacter(db, p.id), now) });
      }
      if (url.pathname === "/api/stars" && req.method === "POST") return json(h, 200, { stars: await cityStars(db, now) });
      // ---- train de vie choisi par le joueur (appliqué à la prochaine journée de dépenses)
      if (url.pathname === "/api/train" && req.method === "POST") {
        if (body.niveau !== "auto" && !LIFESTYLES.some(l => l.id === body.niveau)) return fail(h, 400, "Train de vie inconnu.");
        if (ageYears(p.ne_le, now) < LIFESTYLE_MIN_AGE) return fail(h, 409, `Avant ${LIFESTYLE_MIN_AGE} ans, ce sont les parents qui paient la vie de tous les jours.`);
        await db.prepare(`INSERT INTO train_de_vie (personnage_id, niveau, maj_le) VALUES (?, ?, ?) ON CONFLICT(personnage_id) DO UPDATE SET niveau = excluded.niveau, maj_le = excluded.maj_le`).bind(p.id, body.niveau, now).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      // ---- campagnes : la liste des ambassadeurs possibles (adultes, les stars d'abord)
      if (url.pathname === "/api/ambassadeurs" && req.method === "POST") {
        const stars = new Set((await cityStars(db, now)).filter(s => !s.pnj).map(s => s.id));
        const { results } = await db.prepare(`SELECT p.id, p.prenom, p.nom, p.sexe, p.quartier, p.compte_id, COALESCE(r.points, 0) AS rep, COALESCE(t.tenue, 40) AS tenue FROM personnages p
            LEFT JOIN reputations r ON r.personnage_id = p.id LEFT JOIN train_de_vie t ON t.personnage_id = p.id
            WHERE p.mort_le IS NULL AND p.id != ? AND p.ne_le <= ? ORDER BY COALESCE(r.points, 0) DESC LIMIT 40`).bind(p.id, now - CHILD_REAL_DAYS * DAY).all();
        const list = results.map(x => ({ id: x.id, nom: `${x.prenom} ${x.nom}`, sexe: x.sexe, quartier: x.quartier, joueur: !!x.compte_id, rep: x.rep, tenue: x.tenue, star: stars.has(x.id), prix: ambassadorFee(x.rep, stars.has(x.id)) }))
          .sort((a, b) => b.star - a.star || b.rep - a.rep).slice(0, 15);
        return json(h, 200, { ambassadeurs: list, maxJours: CAMPAIGN_MAX_DAYS });
      }
      if (url.pathname === "/api/campagne" && req.method === "POST") {
        const e = (ch.ent || []).find(x => x.id === body.entreprise);
        const a = await db.prepare(`SELECT p.*, COALESCE(r.points, 0) AS rep, t.tenue FROM personnages p LEFT JOIN reputations r ON r.personnage_id = p.id LEFT JOIN train_de_vie t ON t.personnage_id = p.id WHERE p.id = ? AND p.mort_le IS NULL`).bind(body.ambassadeur || "").first();
        if (!a) return fail(h, 404, "Ambassadeur introuvable.");
        const active = e && await db.prepare(`SELECT 1 FROM campagnes WHERE entreprise_id = ? AND fin > ?`).bind(e.id, now).first();
        const star = (await cityStars(db, now)).some(s => s.id === a.id);
        await settle(db, p, now);
        const prix = Number(body.prix), jours = Number(body.jours), slogan = String(body.slogan || "").trim().slice(0, 60);
        const no = cannotHireAmbassador({ owns: !!e, active: !!active, self: a.id === p.id, age: ageYears(a.ne_le, now), rep: a.rep, tenue: a.tenue, star, prix, jours, makuta: p.makuta, slogan });
        if (no) return fail(h, 409, no);
        const total = prix * jours, imp = Math.round(total * TAX.salaire);
        const [upd] = await db.batch([db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(total, p.id, total), GUARD(db)]);
        if (!upd.meta.changes) return fail(h, 409, "Pas assez d'e-makuta.");
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(total - imp, a.id),
          tx(db, p.id, a.id, total, `campagne publicitaire de ${e.nom} (${jours} j)`, now),
          tx(db, a.id, STATE_ID, imp, `IPR 5 % (DGI) : campagne de ${e.nom}`, now),
          db.prepare(`INSERT INTO campagnes (id, entreprise_id, ambassadeur_id, prix_jour, jours, slogan, debut, fin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(uid(), e.id, a.id, prix, jours, slogan || null, now, now + jours * DAY),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🌟', ?, 0, ?)`).bind(uid(), a.id, `${a.prenom} devient ${a.sexe === "F" ? "l'ambassadrice" : "l'ambassadeur"} de ${e.nom} pour ${jours} jour${jours > 1 ? "s" : ""} : +${fmtMakuta(total - imp)} (après impôt).`, now),
        ]);
        TICKER.at = 0;
        return json(h, 200, { ambassadeur: `${a.prenom} ${a.nom}`, cout: total, ...view(compte, await loadCharacter(db, p.id), now) });
      }
      // ---- football : marché des joueurs, recrutement, championnat
      if (url.pathname === "/api/foot" && req.method === "POST") return json(h, 200, await footView(db, now, (ch.ent || []).filter(e => e.type === "club")));
      if (url.pathname === "/api/club/marche" && req.method === "POST") {
        const { results } = await db.prepare(`SELECT p.id, p.prenom, p.nom, p.sexe, p.quartier, p.ne_le, p.compte_id, t.niveau, t.decouvert, m.salaire, m.poste, m.entreprise_id FROM personnages p
            LEFT JOIN talents_personnage t ON t.personnage_id = p.id AND t.talent_id = 'sport' LEFT JOIN emplois m ON m.personnage_id = p.id AND m.fin IS NULL
            WHERE p.mort_le IS NULL AND p.id != ? AND p.ne_le <= ? AND (p.prison_jusqu IS NULL OR p.prison_jusqu < ?) ORDER BY t.decouvert DESC, t.niveau DESC LIMIT 80`).bind(p.id, now - realMsUntil(now, CLUB_MIN_AGE, now), now).all();
        const mine = new Set((ch.ent || []).map(e => e.id));
        const list = results.filter(x => { const a = ageYears(x.ne_le, now); return a >= CLUB_MIN_AGE && a <= CLUB_MAX_AGE && !mine.has(x.entreprise_id); }).slice(0, 20)
          .map(x => ({ id: x.id, nom: `${x.prenom} ${x.nom}`, sexe: x.sexe, age: Math.floor(ageYears(x.ne_le, now)), quartier: x.quartier, joueur: !!x.compte_id, sport: x.decouvert ? x.niveau : null, poste: x.poste || null, salaire: x.salaire || 0, demande: Math.max(150, Math.round((x.salaire || 0) * 1.1)) }));
        return json(h, 200, { joueurs: list, contratJours: CLUB_CONTRACT_DAYS });
      }
      if (url.pathname === "/api/club/recruter" && req.method === "POST") {
        const e = (ch.ent || []).find(x => x.id === body.entreprise);
        const j = await db.prepare(`SELECT * FROM personnages WHERE id = ? AND mort_le IS NULL`).bind(body.joueur || "").first();
        if (!j) return fail(h, 404, "Joueur introuvable.");
        const cur = await db.prepare(`SELECT salaire, entreprise_id FROM emplois WHERE personnage_id = ? AND fin IS NULL LIMIT 1`).bind(j.id).first();
        const used = e ? (await db.prepare(`SELECT COUNT(*) AS n FROM emplois WHERE entreprise_id = ? AND fin IS NULL`).bind(e.id).first()).n : 0;
        const t = COMPANY_TYPES.find(x => x.id === "club");
        const no = cannotRecruit({ owns: !!e, isClub: !!e && e.type === "club", self: j.id === p.id, age: ageYears(j.ne_le, now), prix: Number(body.salaire), current: cur && cur.entreprise_id !== (e && e.id) ? cur.salaire : 0, places: t.places, used, prison: inPrison(j.prison_jusqu, now) });
        if (no) return fail(h, 409, no);
        if (cur && cur.entreprise_id === e.id) return fail(h, 409, "Ce joueur est déjà dans ton club.");
        await db.batch([
          db.prepare(`UPDATE emplois SET fin = ? WHERE personnage_id = ? AND fin IS NULL`).bind(now, j.id),
          db.prepare(`INSERT INTO emplois (id, personnage_id, metier_id, entreprise_id, poste, salaire, depuis) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(uid(), j.id, t.job, e.id, `${t.poste} · ${e.nom}`, Number(body.salaire), now),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '⚽', ?, 0, ?)`).bind(uid(), j.id, `${j.prenom} signe au club ${e.nom} : ${fmtMakuta(Number(body.salaire))} par journée de travail (entraînement et matchs).`, now),
        ]);
        return json(h, 200, { recrue: `${j.prenom} ${j.nom}`, ...view(compte, await loadCharacter(db, p.id), now) });
      }
      if (url.pathname === "/api/pensee" && req.method === "POST") return json(h, 200, await thoughtOfDay(env, db, compte, ch, now));
      if (url.pathname === "/api/journal" && req.method === "POST") return json(h, 200, newspaper(await newsFacts(db, now), now, p.quartier));
      if (url.pathname === "/api/voisins" && req.method === "POST") {
        const { results } = await db.prepare(`SELECT p.id, p.prenom, p.nom, p.sexe, p.quartier, p.ne_le, c.pseudo,
            (SELECT COUNT(*) FROM comptes c2 WHERE c2.cree_le < c.cree_le OR (c2.cree_le = c.cree_le AND c2.id <= c.id)) AS rang,
            (SELECT metier_id FROM emplois e WHERE e.personnage_id = p.id AND e.fin IS NULL LIMIT 1) AS metier,
            (SELECT points FROM reputations r WHERE r.personnage_id = p.id) AS reputation
          FROM personnages p JOIN comptes c ON c.vie_id = p.id WHERE p.mort_le IS NULL AND p.id != ?
          ORDER BY (p.quartier = ?) DESC, p.ne_le DESC LIMIT 40`).bind(p.id, p.quartier || "").all();
        const total = await db.prepare(`SELECT COUNT(*) AS n FROM personnages p JOIN comptes c ON c.vie_id = p.id WHERE p.mort_le IS NULL`).first();
        return json(h, 200, { quartier: p.quartier, joueurs: total.n, voisins: results.map(n => neighborView({ ...n, memeCommune: n.quartier === p.quartier }, now)) });
      }
      if (url.pathname === "/api/mot" && req.method === "POST") {
        const to = await db.prepare(`SELECT p.id, p.prenom, p.compte_id FROM personnages p JOIN comptes c ON c.vie_id = p.id WHERE p.id = ? AND p.mort_le IS NULL`).bind(String(body.vers || "")).first();
        if (!to) return fail(h, 404, "Ce joueur n'est plus dans la ville.");
        const sent = await db.prepare(`SELECT COUNT(*) AS n FROM mots WHERE de_id = ? AND le > ?`).bind(p.id, now - 864e5).first();
        const texte = String(body.texte || "").trim();
        const no = cannotSendWord(texte, sent.n, to.id === p.id); if (no) return fail(h, 409, no);
        await db.prepare(`INSERT INTO mots (id, de_id, vers_id, texte, le) VALUES (?, ?, ?, ?, ?)`).bind(uid(), p.id, to.id, texte, now).run();
        try { await notify(env, db, to.compte_id, { titre: `2 Life · mot de ${p.prenom}`, texte: texte.slice(0, 120), url: "vie.html#voisins" }); } catch (e) { console.error(e); }
        return json(h, 200, { ...view(compte, await loadCharacter(db, p.id), now), envoyeA: to.prenom });
      }
      // ---- dîme et offrandes aux pasteurs joueurs, avec reçu public dans le journal
      if (url.pathname === "/api/offrande" && req.method === "POST") {
        const L = await celebrities(db, now), c = L.celebrites.find(x => x.id === String(body.celeb || "")), r = c && CELEBS.real && CELEBS.real[c.id];
        const type = String(body.type || "");
        const job = r ? await db.prepare(`SELECT metier_id FROM emplois WHERE personnage_id = ? AND fin IS NULL AND metier_id IN ('pasteur', 'grand-pasteur', 'chef-chorale')`).bind(r.id).first() : null;
        const rev = await db.prepare(`SELECT COALESCE(SUM(montant), 0) AS n FROM transactions WHERE vers_id = ? AND le > ? AND motif NOT LIKE 'dîme%' AND motif NOT LIKE 'offrande%'`).bind(p.id, now - OFFERING.dimeJours * 864e5).first();
        const dejaDime = await db.prepare(`SELECT 1 AS x FROM offrandes WHERE de_id = ? AND type = 'dime' AND le > ?`).bind(p.id, now - OFFERING.dimeJours * 864e5).first();
        const montant = type === "dime" ? titheOf(rev.n) : Math.round(Number(body.montant) * 20);
        const no = cannotGiveOffering({ type, montant, solde: p.makuta, toSelf: r && r.id === p.id, dimeDuMois: !!dejaDime, religieux: !!(c && c.domaine === "religion" && (c.pnj || job)) });
        if (no) return fail(h, 409, no);
        const n = await db.prepare(`SELECT COUNT(*) AS n FROM offrandes`).first();
        // pasteur joueur : il reçoit le don ; personnage du jeu : le don va à la caisse de son église
        const vers = `${c.prenom} ${c.nom}`, titre = job ? (JOBS.find(j => j.id === job.metier_id) || {}).nom : c.titre, dest = job ? r.id : "eglise-" + c.id;
        const recu = offeringReceipt({ de: `${p.prenom} ${p.nom.charAt(0)}.`, vers, titre, type, montant, numero: n.n + 1 });
        const motif = type === "dime" ? "dîme à l'église de " + vers : "offrande à l'église de " + vers;
        const impot = offeringTax(montant), net = montant - impot;
        try {
          await db.batch([
            db.prepare(`UPDATE personnages SET makuta = makuta - ?, bonheur = MIN(100, bonheur + 3) WHERE id = ? AND makuta >= ?`).bind(montant, p.id, montant), GUARD(db),
            ...(job ? [db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(net, r.id)] : []),
            tx(db, p.id, dest, net, motif, now),
            ...(impot ? [tx(db, p.id, STATE_ID, impot, "impôt sur les dons : église de " + vers, now)] : []),
            db.prepare(`INSERT INTO offrandes (id, de_id, vers_id, type, montant, recu, le) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, dest, type, montant, recu, now),
            db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🙏', ?, 0, ?)`).bind(uid(), p.id, `Tu as ${type === "dime" ? "versé ta dîme" : "donné une offrande"} : ${fmtMakuta(montant)} à l'église de ${vers}. Le reçu est publié dans le journal.`, now),
            ...(job ? [db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🙏', ?, 0, ?)`).bind(uid(), r.id, `${p.prenom} ${p.nom.charAt(0)}. a ${type === "dime" ? "versé sa dîme" : "donné une offrande"} à ton église : +${fmtMakuta(net)} après ${fmtMakuta(impot)} d'impôt retenu pour le Trésor.`, now),
              repSt(db, r.id, 1, now)] : []),
          ]);
        } catch (e) { if (guardFailed(e)) return fail(h, 409, "Pas assez d'argent pour ce don."); throw e; }
        return json(h, 200, { ok: true, recu, montant, ...view(compte, await loadCharacter(db, p.id), now) });
      }
      // ---- aller voir une célébrité sur place (culte, concert, match…) selon ce qu'elle fait en ce moment
      if (url.pathname === "/api/celebrites/assister" && req.method === "POST") {
        const L = await celebrities(db, now), c = L.celebrites.find(x => x.id === String(body.celeb || ""));
        if (!c) return fail(h, 404, "Cette célébrité n'est plus à l'affiche aujourd'hui.");
        const r = !c.pnj && CELEBS.real && CELEBS.real[c.id];
        if (r && r.id === p.id) return fail(h, 409, "C'est toi ! Tu ne peux pas venir te voir toi-même.");
        const ev = celebEvent(celebLive(c, now));
        if (!ev) return fail(h, 409, `Rien à voir en public en ce moment : ${celebLive(c, now).maintenant.texte.toLowerCase()}. Reviens plus tard.`);
        const deja = await db.prepare(`SELECT COUNT(*) AS n FROM assistances WHERE personnage_id = ? AND le > ?`).bind(p.id, now - 864e5).first();
        if (deja.n >= CELEB_VISITS_PER_DAY) return fail(h, 409, `Tu es déjà sorti${p.sexe === "F" ? "e" : ""} ${CELEB_VISITS_PER_DAY} fois aujourd'hui. Ton personnage doit aussi travailler et se reposer.`);
        const vu = await db.prepare(`SELECT 1 AS x FROM assistances WHERE personnage_id = ? AND celeb_id = ? AND le > ?`).bind(p.id, c.id, now - 864e5).first();
        const tva = ev.prix ? vatOf(ev.prix) : 0, net = ev.prix - tva, nom = `${c.prenom} ${c.nom}`;
        const st = [db.prepare(`UPDATE personnages SET makuta = makuta - ?, bonheur = MIN(100, bonheur + ?) WHERE id = ? AND makuta >= ?`).bind(ev.prix, ev.bonheur, p.id, ev.prix), GUARD(db),
          db.prepare(`INSERT INTO assistances (id, personnage_id, celeb_id, lieu, prix, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, c.id, ev.lieu, ev.prix, now),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🎟️', ?, 0, ?)`).bind(uid(), p.id, `${ev.titre} : tu es allé${p.sexe === "F" ? "e" : ""} voir ${nom} sur place${ev.prix ? ` (billet ${fmtMakuta(ev.prix)})` : " (entrée libre)"}. Bonne humeur +${ev.bonheur}.`, now)];
        if (tva) st.push(tx(db, p.id, STATE_ID, tva, "TVA sur un billet : " + ev.titre.replace(/^\S+\s/, "") + " de " + nom, now));
        if (r) {
          if (net) st.push(db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(net, r.id), tx(db, p.id, r.id, net, "billet : " + ev.titre.replace(/^\S+\s/, "").toLowerCase(), now));
          st.push(db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '👥', ?, 0, ?)`).bind(uid(), r.id, `${p.prenom} ${p.nom.charAt(0)}. est venu${p.sexe === "F" ? "e" : ""} te voir sur place (${ev.titre.replace(/^\S+\s/, "").toLowerCase()})${net ? `, +${fmtMakuta(net)} de billet` : ""}.`, now));
          if (!vu) st.push(repSt(db, r.id, 1, now));
        } else if (net) st.push(tx(db, p.id, "organisateurs", net, "billet : " + ev.titre.replace(/^\S+\s/, "").toLowerCase() + " de " + nom, now));
        try { await db.batch(st); } catch (e) { if (guardFailed(e)) return fail(h, 409, "Pas assez d'argent pour le billet."); throw e; }
        return json(h, 200, { ok: true, evenement: ev, celeb: nom, ...view(compte, await loadCharacter(db, p.id), now) });
      }
      if (url.pathname === "/api/mots/lus" && req.method === "POST") {
        await db.prepare(`UPDATE mots SET lu = 1 WHERE vers_id = ? AND lu = 0`).bind(p.id).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/mot/signaler" && req.method === "POST") {
        const m = await db.prepare(`SELECT m.id, m.texte, m.de_id, p.prenom, p.nom FROM mots m JOIN personnages p ON p.id = m.de_id WHERE m.id = ? AND m.vers_id = ?`).bind(String(body.mot || ""), p.id).first();
        if (!m) return fail(h, 404, "Mot introuvable.");
        await db.batch([db.prepare(`UPDATE mots SET signale = 1, lu = 1 WHERE id = ?`).bind(m.id),
          db.prepare(`INSERT INTO support_demandes (id, compte_id, pseudo, email, categorie, message, page, statut, cree_le) VALUES (?, ?, ?, ?, 'Mot signalé', ?, 'voisins', 'ouvert', ?)`)
            .bind(uid(), compte.id, compte.pseudo, compte.email, `Mot de ${m.prenom} ${m.nom} (${m.de_id}) : « ${m.texte} »`, now)]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/resume/vu" && req.method === "POST") {
        await db.prepare(`INSERT INTO fidelite (compte_id, resume_vu_le, makuta_vu) VALUES (?, ?, ?) ON CONFLICT(compte_id) DO UPDATE SET resume_vu_le = excluded.resume_vu_le, makuta_vu = excluded.makuta_vu`).bind(compte.id, now, p.makuta).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
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
            ...(Math.random() < 0.25 ? [repSt(db, p.id, REP.crimeRumeur, now)] : []),   // des rumeurs circulent
          ]);
          return json(h, 200, { crime: { attrape: false, gain }, ...view(compte, await loadCharacter(db, p.id), now) });
        }
        const recent = ch.casier.filter(x => x.le > now - RECIDIVE.jours * 864e5).length;
        const sn = sentence(cr, p.makuta, recent), until = sn.prison ? now + PRISON_HOURS * 36e5 : null;
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, bonheur = MAX(0, bonheur - 10), prison_jusqu = COALESCE(?, prison_jusqu) WHERE id = ?`).bind(sn.amende, until, p.id),
          db.prepare(`INSERT INTO infractions (id, personnage_id, type, amende, prison_heures, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, cr.id, sn.amende, sn.heures, now),
          ...taxTo(db, p.id, sn.amende, "amende (police) : " + cr.nom, now),
          repSt(db, p.id, REP.crimeAttrape + (sn.prison ? REP.prison : 0), now),
        ]);
        return json(h, 200, { crime: { attrape: true, ...sn }, ...view(compte, await loadCharacter(db, p.id), now) });
      }
      if (url.pathname === "/api/caution" && req.method === "POST") {
        if (!inPrison(p.prison_jusqu, now)) return fail(h, 409, "Tu n'es pas en prison.");
        if (p.makuta < BAIL) return fail(h, 409, `La caution coûte ${fmtMakuta(BAIL)}.`);
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, prison_jusqu = ? WHERE id = ? AND makuta >= ?`).bind(BAIL, now, p.id, BAIL), GUARD(db),
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

      // ---- petits boulots de rue
      if (url.pathname === "/api/petitboulot" && req.method === "POST") {
        await settle(db, p, now);
        const j = STREET_JOBS.find(x => x.id === body.boulot), no = injuredBlocks(ch.blessure) || cannotStreetJob(j, ageYears(p.ne_le, now), p.energie, ch.lastStreet, now);
        if (no) return fail(h, 409, no);
        const gain = j.gain[0] + Math.floor(Math.random() * (j.gain[1] - j.gain[0] + 1));
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta + ?, energie = MAX(0, energie - ?) WHERE id = ?`).bind(gain, j.energie, p.id),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), p.id, gain, "petit boulot : " + j.nom, now),
          db.prepare(`INSERT INTO activites (id, personnage_id, activite, score, resultat, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, "boulot:" + j.id, gain, "", now),
          matSt(db, p.id, MATURITY_GAIN.petitboulot),
        ]);
        return json(h, 200, { boulot: { nom: j.nom, gain }, ...view(compte, await loadCharacter(db, p.id), now) });
      }
      // ---- logement : louer ou acheter sa parcelle
      if ((url.pathname === "/api/logement/louer" || url.pathname === "/api/logement/acheter") && req.method === "POST") {
        const q = String(body.quartier || ""), buy = url.pathname.endsWith("acheter");
        if (!RENT[q]) return fail(h, 404, "Quartier inconnu.");
        if (ageYears(p.ne_le, now) < HOUSING_MIN_AGE) return fail(h, 409, `Possible à partir de ${HOUSING_MIN_AGE} ans.`);
        if (ch.logement && ch.logement.statut === "proprio" && !buy) return fail(h, 409, "Tu as déjà ta propre parcelle.");
        const cost = buy ? houseOf(q) : rentOf(q);
        if (p.makuta < cost) return fail(h, 409, `Il faut ${fmtMakuta(cost)}.`);
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, bonheur = MIN(100, bonheur + 10), quartier = ? WHERE id = ? AND makuta >= ?`).bind(cost, q, p.id, cost), GUARD(db),
          db.prepare(`INSERT INTO logements (personnage_id, statut, quartier, loyer, paye_jusqu, depuis) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(personnage_id) DO UPDATE SET statut = excluded.statut, quartier = excluded.quartier, loyer = excluded.loyer, paye_jusqu = excluded.paye_jusqu, depuis = excluded.depuis`)
            .bind(p.id, buy ? "proprio" : "loue", q, buy ? 0 : cost, buy ? null : now + 7 * DAY, now),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, cost, buy ? "achat d'une parcelle à " + q : "premier loyer à " + q, now),
                  ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/logement/quitter" && req.method === "POST") {
        await db.prepare(`DELETE FROM logements WHERE personnage_id = ? AND statut = 'loue'`).bind(p.id).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      // ---- marché aux annonces entre joueurs
      if (url.pathname === "/api/annonce/publier" && req.method === "POST") {
        const own = ch.inv.find(x => x.id === body.possession), prix = Math.round(Number(body.prix));
        if (!own) return fail(h, 404, "Objet introuvable.");
        if (!(prix >= 1 && prix <= 1e7)) return fail(h, 400, "Prix invalide.");
        const dup = await db.prepare(`SELECT id FROM annonces WHERE possession_id = ? AND statut = 'ouverte'`).bind(own.id).first();
        if (dup) return fail(h, 409, "Cet objet est déjà en vente.");
        await db.batch([db.prepare(`INSERT INTO annonces (id, vendeur_id, possession_id, prix, cree_le) VALUES (?, ?, ?, ?, ?)`).bind(uid(), p.id, own.id, prix, now),
          db.prepare(`UPDATE possessions SET porte = 0 WHERE id = ?`).bind(own.id)]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/annonce/retirer" && req.method === "POST") {
        await db.prepare(`UPDATE annonces SET statut = 'retiree' WHERE id = ? AND vendeur_id = ? AND statut = 'ouverte'`).bind(String(body.id || ""), p.id).run();
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/annonce/acheter" && req.method === "POST") {
        const a = await db.prepare(`SELECT a.*, o.objet_id FROM annonces a JOIN possessions o ON o.id = a.possession_id WHERE a.id = ? AND a.statut = 'ouverte'`).bind(String(body.id || "")).first();
        if (!a) return fail(h, 404, "Annonce introuvable ou déjà vendue.");
        if (a.vendeur_id === p.id) return fail(h, 409, "C'est ton annonce.");
        if (p.makuta < a.prix) return fail(h, 409, "Pas assez d'e-makuta.");
        const tax = Math.round(a.prix * SALE_TAX), nom = (SHOP.find(x => x.id === a.objet_id) || { nom: a.objet_id }).nom;
        // tout se fait dans un seul lot : si l'annonce vient d'être vendue ou si le paiement échoue, rien ne change
        await db.batch([
          db.prepare(`UPDATE annonces SET statut = 'vendue' WHERE id = ? AND statut = 'ouverte'`).bind(a.id), GUARD(db),
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(a.prix, p.id, a.prix), GUARD(db),
          db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(a.prix - tax, a.vendeur_id),
          db.prepare(`UPDATE possessions SET proprietaire_id = ?, porte = 0, acquis_le = ? WHERE id = ?`).bind(p.id, now, a.possession_id),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, a.vendeur_id, a.prix - tax, "achat entre joueurs : " + nom, now),
          ...taxTo(db, p.id, tax, "taxe 5 % sur la vente : " + nom, now),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), a.vendeur_id, "🤝", `${p.prenom} ${p.nom} a acheté ton annonce : ${nom} (${fmtMakuta(a.prix - tax)} après taxe).`, now),
        ]);
        return json(h, 200, { achete: nom, ...view(compte, await loadCharacter(db, p.id), now) });
      }
      // ---- mariage entre joueurs
      if (url.pathname === "/api/mariage/demander" && req.method === "POST") {
        const t = await db.prepare(`SELECT p.* FROM comptes c JOIN personnages p ON p.id = c.vie_id WHERE LOWER(c.pseudo) = LOWER(?)`).bind(String(body.pseudo || "").trim()).first();
        const no = cannotMarry(p, t, ageYears(p.ne_le, now), t ? ageYears(t.ne_le, now) : 0); if (no) return fail(h, 409, no);
        const dup = await db.prepare(`SELECT id FROM demandes_mariage WHERE statut = 'attente' AND ((de_id = ? AND vers_id = ?) OR (de_id = ? AND vers_id = ?))`).bind(p.id, t.id, t.id, p.id).first();
        if (dup) return fail(h, 409, "Une demande est déjà en attente entre vous deux.");
        await db.batch([db.prepare(`INSERT INTO demandes_mariage (id, de_id, vers_id, le) VALUES (?, ?, ?, ?)`).bind(uid(), p.id, t.id, now),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), t.id, "💍", `${p.prenom} ${p.nom} te demande en mariage.`, now)]);
        if (t.compte_id) try { await notify(env, db, t.compte_id, { titre: "2 Life · demande en mariage", texte: `${p.prenom} ${p.nom} te demande en mariage.`, url: "vie.html#couple-card" }); } catch (e) { }
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/mariage/repondre" && req.method === "POST") {
        const dm = await db.prepare(`SELECT * FROM demandes_mariage WHERE id = ? AND vers_id = ? AND statut = 'attente'`).bind(String(body.id || ""), p.id).first();
        if (!dm) return fail(h, 404, "Demande introuvable.");
        if (!body.accepte) { await db.prepare(`UPDATE demandes_mariage SET statut = 'refusee' WHERE id = ?`).bind(dm.id).run(); return json(h, 200, view(compte, await loadCharacter(db, p.id), now)); }
        const o = await db.prepare(`SELECT * FROM personnages WHERE id = ?`).bind(dm.de_id).first();
        const no = cannotMarry(p, o, ageYears(p.ne_le, now), o ? ageYears(o.ne_le, now) : 0); if (no) return fail(h, 409, no);
        const groom = p.sexe === "M" ? p : o, bride = p.sexe === "M" ? o : p;
        // la famille du marié paie : un parent joueur qui en a les moyens, sinon le marié lui-même
        const gp = await db.prepare(`SELECT id, makuta FROM personnages WHERE id IN (?, ?) AND mort_le IS NULL AND makuta >= ? ORDER BY makuta DESC LIMIT 1`).bind(groom.pere_id || "", groom.mere_id || "", DOT_MAKUTA).first();
        const payer = gp || (groom.makuta >= DOT_MAKUTA ? groom : null);
        if (!payer) return fail(h, 409, `La famille du marié doit réunir la dot : ${fmtMakuta(DOT_MAKUTA)}.`);
        const { results: bp } = await db.prepare(`SELECT id FROM personnages WHERE id IN (?, ?) AND mort_le IS NULL AND compte_id IS NOT NULL`).bind(bride.pere_id || "", bride.mere_id || "").all();
        const takers = bp.length ? bp.map(x => x.id) : [bride.id], each = Math.floor(DOT_MAKUTA / takers.length);
        const M = (id, t) => db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), id, "💒", t, now);
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(each * takers.length, payer.id, each * takers.length), GUARD(db),
          ...takers.flatMap(id => [db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(each, id),
            db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), payer.id, id, each, `dot : mariage de ${groom.prenom} et ${bride.prenom}`, now)]),
          db.prepare(`UPDATE personnages SET conjoint_id = ? WHERE id = ?`).bind(bride.id, groom.id),
          db.prepare(`UPDATE personnages SET conjoint_id = ? WHERE id = ?`).bind(groom.id, bride.id),
          db.prepare(`UPDATE demandes_mariage SET statut = 'acceptee' WHERE id = ?`).bind(dm.id),
          db.prepare(`UPDATE demandes_mariage SET statut = 'annulee' WHERE statut = 'attente' AND (de_id IN (?, ?) OR vers_id IN (?, ?))`).bind(p.id, o.id, p.id, o.id),
          repSt(db, p.id, REP.mariage, now), repSt(db, o.id, REP.mariage, now),
          M(groom.id, `Mariage avec ${bride.prenom} ${bride.nom}. Dot versée : ${fmtMakuta(DOT_MAKUTA)}${gp ? " (payée par ta famille)" : ""}.`),
          M(bride.id, `Mariage avec ${groom.prenom} ${groom.nom}. La famille du marié a versé la dot.`),
        ]);
        if (o.compte_id) try { await notify(env, db, o.compte_id, { titre: "2 Life · mariage", texte: `${p.prenom} a dit oui ! Vous êtes mariés.`, url: "vie.html#couple-card" }); } catch (e) { }
        return json(h, 200, { marie: true, ...view(compte, await loadCharacter(db, p.id), now) });
      }
      if (url.pathname === "/api/divorce" && req.method === "POST") {
        if (!p.conjoint_id) return fail(h, 409, "Tu n'es pas marié.");
        await db.batch([db.prepare(`UPDATE personnages SET conjoint_id = NULL WHERE id IN (?, ?)`).bind(p.id, p.conjoint_id),
          repSt(db, p.id, REP.divorce, now), repSt(db, p.conjoint_id, REP.divorce, now),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, ?, ?, 0, ?)`).bind(uid(), p.conjoint_id, "💔", `${p.prenom} a demandé le divorce.`, now)]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/manger" && req.method === "POST") {
        await settle(db, p, now);
        const prix = Math.round(FOOD.prix * repDiscount(ch.reputation));   // prix d'ami pour les gens respectés
        if (p.makuta < prix) return fail(h, 409, "Pas assez d'e-makuta pour un repas.");
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, faim = MIN(100, faim + ?) WHERE id = ? AND makuta >= ?`).bind(prix, FOOD.faim, p.id, prix), GUARD(db),
          ...await payToCompany(db, "maquis", p.id, prix, "repas au maquis", now),
        ]);
        const again = await loadCharacter(db, p.id);
        return json(h, 200, view(compte, again, now));
      }

      if (url.pathname === "/api/acheter" && req.method === "POST") {
        const item = SHOP.find(x => x.id === body.objet);
        await settle(db, p, now);
        const no = cannotBuy(item, p.makuta, ageYears(p.ne_le, now), (ch.inv || []).map(x => x.objet_id));
        if (no) return fail(h, 409, no);
        const e = item.effet || {};
        if (e.energie < 0 && needsAt({ hunger: p.faim, energy: p.energie, happiness: p.bonheur, health: p.sante, updatedAt: p.maj_le }, now).energy < -e.energie) return fail(h, 409, "Trop fatigué pour faire du sport : repose-toi ou mange d'abord.");
        const st = [
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, faim = MIN(100, faim + ?), bonheur = MIN(100, bonheur + ?), energie = MAX(0, MIN(100, energie + ?)), sante = MIN(100, sante + ?) WHERE id = ? AND makuta >= ?`)
            .bind(item.prix, e.faim || 0, e.bonheur || 0, e.energie || 0, e.sante || 0, p.id, item.prix), GUARD(db),
          ...(item.vers ? await payToCompany(db, item.vers, p.id, item.prix, "achat : " + item.nom, now) : item.type === "telephone"
            ? [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, item.prix - Math.round(item.prix * TAX.douane), "achat : " + item.nom, now),
               ...taxTo(db, p.id, Math.round(item.prix * TAX.douane), "droits de douane 10 % (DGDA) : " + item.nom, now)]
            : [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, item.prix - vatOf(item.prix), "achat : " + item.nom, now),
               ...taxTo(db, p.id, vatOf(item.prix), "TVA " + LAWS.tva + " % (DGI) : " + item.nom, now)]),
        ];
        if (e.vitalite) st.push(db.prepare(`INSERT OR IGNORE INTO train_de_vie (personnage_id, maj_le) VALUES (?, ?)`).bind(p.id, now),
          db.prepare(`UPDATE train_de_vie SET vitalite = MIN(100, vitalite + ?) WHERE personnage_id = ?`).bind(e.vitalite, p.id));
        if (item.type !== "nourriture" && !item.jetable) {
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

      if (url.pathname === "/api/postuler" && req.method === "POST" && ch.reputation <= REP_BAD)
        return fail(h, 409, "L'employeur refuse : ta réputation dans le quartier est trop mauvaise (vols, prison…). Travaille ta réputation d'abord.");
      if (url.pathname === "/api/postuler" && req.method === "POST" && body.entreprise) {
        const e = await db.prepare(`SELECT * FROM entreprises WHERE id = ?`).bind(body.entreprise).first();
        const t = e && COMPANY_TYPES.find(x => x.id === e.type);
        if (!t) return fail(h, 404, "Entreprise introuvable.");
        if (e.proprietaire_id === p.id) return fail(h, 409, "Tu es le patron de cette entreprise.");
        if (ageYears(p.ne_le, now) < 18) return fail(h, 409, "Il faut avoir 18 ans pour travailler dans une entreprise.");
        const n = await db.prepare(`SELECT COUNT(*) AS n FROM emplois WHERE entreprise_id = ? AND fin IS NULL`).bind(e.id).first();
        if (n.n >= t.places) return fail(h, 409, "Plus de place dans cette entreprise.");
        const look = tenueBlocks(companyJob(e), ch.train ? ch.train.tenue : null); if (look) return fail(h, 409, look);
        await db.batch([
          db.prepare(`UPDATE emplois SET fin = ? WHERE personnage_id = ? AND fin IS NULL`).bind(now, p.id),
          db.prepare(`INSERT INTO emplois (id, personnage_id, metier_id, entreprise_id, poste, salaire, depuis) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, t.job, e.id, t.poste, t.salaire, now),
        ]);
        return json(h, 200, { embauche: e.nom, ...view(compte, await loadCharacter(db, p.id), now) });
      }

      if (url.pathname === "/api/postuler" && req.method === "POST") {
        const job = JOBS.find(j => j.id === body.metier);
        const no = cannotApply(job, ageYears(p.ne_le, now), ch.dip, tal.filter(t => t.decouvert).map(t => t.talent_id), (ch.inv || []).map(x => x.objet_id)) || tenueBlocks(job, ch.train ? ch.train.tenue : null);
        if (no) return fail(h, 409, no);
        await db.batch([
          db.prepare(`UPDATE emplois SET fin = ? WHERE personnage_id = ? AND fin IS NULL`).bind(now, p.id),
          db.prepare(`INSERT INTO emplois (id, personnage_id, metier_id, poste, salaire, depuis) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, job.id, job.nom, job.salaire, now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      if (url.pathname === "/api/travailler" && req.method === "POST") {
        await settle(db, p, now);
        const job = ch.boss ? { ...companyJob(ch.boss), salaire: ch.job.salaire || companyJob(ch.boss).salaire } : ch.job && JOBS.find(j => j.id === ch.job.metier_id);
        const no = injuredBlocks(ch.blessure) || cannotWork(job, ageYears(p.ne_le, now), p.energie, ch.lastShift, now);
        if (no) return fail(h, 409, no);
        const pay = payFor(job, tal.map(t => ({ talent: t.talent_id, discovered: !!t.decouvert })), ch.dip);
        // 10 % du salaire pour les parents : aux parents joueurs s'il y en a, sinon à la famille du jeu
        const grudge = await neglectOf(db, p.id);   // un enfant négligé se souvient : il reverse moins
        pay.famille = familyShare(pay.montant, grudge);
        if (grudge > 0) pay.rancune = Math.round(familyShareRate(grudge) * 100);
        pay.impot = Math.round(pay.montant * TAX.salaire);   // IPR prélevé par la DGI
        const fromState = PUBLIC_JOBS.some(j => j.id === job.id) || !!job.elu;
        if (fromState && !ch.boss && !job.elu && LAWS.salaires !== 100) {   // loi sur les salaires publics (les élus ne se l'appliquent pas)
          pay.prime = Math.round(pay.montant * (LAWS.salaires - 100) / 100); pay.montant += pay.prime;
          pay.famille = familyShare(pay.montant, grudge); pay.impot = Math.round(pay.montant * TAX.salaire);
        }
        if (fromState && !ch.boss) {
          await payArrears(db, now, p.id);   // d'abord les anciens salaires dus, si l'argent est rentré
          const pp = publicPayer({ ...job, salaire: pay.montant }, await ledger(db, PUBLIC_IDS));
          if (!pp.ok) {   // caisse vide : la journée est faite, le salaire est dû
            await db.batch([
              db.prepare(`UPDATE personnages SET energie = MAX(0, energie - ?), faim = MAX(0, faim - 10) WHERE id = ?`).bind(35, p.id),
              db.prepare(`INSERT INTO arrieres (id, personnage_id, payeur_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, pp.payeur, pay.montant, job.nom, now),
              db.prepare(`INSERT INTO activites (id, personnage_id, activite, score, resultat, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, "travail:" + job.id, 0, "arriéré", now),
            ]);
            const again = await loadCharacter(db, p.id);
            return json(h, 200, { ...view(compte, again, now), paie: { montant: 0, arriere: pay.montant, message: `Journée faite, mais la caisse publique est vide : ${fmtMakuta(pay.montant)} de salaire te sont dus. L'État paiera dès que les impôts rentrent.` } });
          }
          pay.payeur = pp.payeur;
        }
        const parents = ch.par.map(x => x.id), each = parents.length ? Math.floor(pay.famille / parents.length) : 0;
        const st = [
          db.prepare(`UPDATE personnages SET makuta = makuta + ?, energie = MAX(0, energie - ?), faim = MAX(0, faim - 10) WHERE id = ?`).bind(pay.montant - pay.famille - pay.impot, 35, p.id),
          repSt(db, p.id, REP.travail, now),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), ch.boss ? ch.boss.id : fromState ? (pay.payeur || STATE_ID) : null, p.id, pay.montant, "salaire : " + job.nom, now),
          ...taxTo(db, p.id, pay.impot, "IPR 5 % (DGI) : " + job.nom, now),
          // dans l'entreprise d'un joueur : la journée rapporte salaire + 60 % à la caisse, qui paie le salaire
          ...(ch.boss ? [db.prepare(`UPDATE entreprises SET caisse = caisse + ? WHERE id = ?`).bind(Math.round(pay.montant * EMPLOYEE_YIELD) - pay.montant, ch.boss.id)] : []),
          ...(pay.famille - each * parents.length > 0 ? [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, pay.famille - each * parents.length, "aide à la famille (10 %)", now)] : []),
          ...parents.flatMap(pid => each ? [
            db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(each, pid),
            db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, pid, each, "aide aux parents (10 % du salaire)", now)] : []),
          db.prepare(`INSERT INTO activites (id, personnage_id, activite, score, resultat, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, "travail:" + job.id, pay.montant, pay.bonus ? "bonus talent" : "", now),
          matSt(db, p.id, MATURITY_GAIN.travail),
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
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(t.prix, p.id, t.prix), GUARD(db),
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
          // le compte n'est modifié que s'il n'a pas bougé depuis la lecture (deux retraits en même temps ne paient qu'une fois)
          acc ? db.prepare(`UPDATE comptes_banque SET solde = ?, maj_le = ? WHERE personnage_id = ? AND banque_id = ? AND solde = ? AND maj_le = ?`).bind(nv, now, p.id, b.id, acc.solde, acc.maj_le)
            : db.prepare(`INSERT INTO comptes_banque (personnage_id, banque_id, solde, maj_le) VALUES (?, ?, ?, ?) ON CONFLICT(personnage_id, banque_id) DO NOTHING`).bind(p.id, b.id, nv, now),
          GUARD(db),
          db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ? AND makuta >= ?`).bind(dep ? -m : m, p.id, dep ? m : 0), GUARD(db),
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
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, assureur = ?, assure_jusqu = ? WHERE id = ? AND makuta >= ?`).bind(a.prime, a.id, from + a.jours * 864e5, p.id, a.prime), GUARD(db),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, "assurance:" + a.id, a.prime, "prime d'assurance : " + a.nom, now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      // ---- accident de la route dans la ville 3D : la blessure compte dans la santé (seulement contre soi-même, au plus une fois par 10 min)
      if (url.pathname === "/api/accident" && req.method === "POST") {
        const kmh = Math.round(Number(body.kmh));
        if (!(kmh >= ACCIDENT.minKmh && kmh <= ACCIDENT.maxKmh)) return fail(h, 400, "Vitesse du choc invalide.");
        if (ch.blessure && ch.blessure.le > now - ACCIDENT.attenteMin * 6e4) return json(h, 200, view(compte, ch, now));
        await db.batch([
          db.prepare(`UPDATE personnages SET sante = MAX(?, sante - ?), bonheur = MAX(0, bonheur - ?) WHERE id = ?`).bind(ACCIDENT.santeMin, ACCIDENT.sante, ACCIDENT.bonheur, p.id),
          db.prepare(`INSERT INTO blessures (personnage_id, le, vitesse) VALUES (?, ?, ?) ON CONFLICT(personnage_id) DO UPDATE SET le = excluded.le, vitesse = excluded.vitesse`).bind(p.id, now, kmh),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🚑', ?, 0, ?)`).bind(uid(), p.id, accidentText(p.prenom, kmh, p.sexe === "F"), now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      // ---- faute de conduite dans la ville 3D : le conducteur qui blesse ou bouscule un piéton est puni, comme dans la vraie vie
      if (url.pathname === "/api/conduite/faute" && req.method === "POST" && TRAFFIC_TICKETS.some(t => t.id === body.faute)) {
        // code de la route : feu rouge, excès de vitesse, contrôle du permis (contraventions, pas de casier)
        const st = permitStatus(ch.dip || [], ch.ptsPermis || [], now), T = trafficTicket(body.faute, Number(body.kmh) || 0, st);
        if (!T || !(Number(body.kmh) >= 0 && Number(body.kmh) <= ACCIDENT.maxKmh)) return fail(h, 400, "Contravention invalide.");
        const wait = body.faute === "controle" ? 10 * 6e4 : 6e4;   // une même faute comptée au plus une fois par minute (contrôle : 10 min)
        if ((ch.ptsPermis || []).some(x => (x.type === body.faute || (body.faute === "controle" && x.type === "sans-permis")) && x.le > now - wait)) return json(h, 200, view(compte, ch, now));
        const paye = Math.min(p.makuta, T.amende), impaye = T.amende - paye, type = body.faute === "controle" && T.amende ? "sans-permis" : body.faute;
        await db.batch([
          ...(paye > 0 ? [db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(paye, p.id, paye), GUARD(db), ...taxTo(db, p.id, paye, "contravention (police routière) : " + T.nom.toLowerCase(), now)] : []),
          db.prepare(`INSERT INTO permis_points (id, personnage_id, type, points, amende, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, type, T.points, paye, now),
          ...(T.rep || impaye ? [repSt(db, p.id, T.rep - (impaye ? 3 : 0), now)] : []),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🚔', ?, 0, ?)`).bind(uid(), p.id, T.texte + (impaye ? ` Il manquait ${fmtMakuta(impaye)} : amende impayée, la police le note.` : ""), now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/conduite/faute" && req.method === "POST") {
        const f = ROAD_FAULTS.find(x => x.id === body.faute), kmh = Math.round(Number(body.kmh));
        if (!f || !(kmh >= 3 && kmh <= ACCIDENT.maxKmh) || (f.casier ? kmh < ACCIDENT.minKmh : kmh >= ACCIDENT.minKmh)) return fail(h, 400, "Faute de conduite invalide.");
        const last = await db.prepare(`SELECT MAX(le) AS le FROM mouvements WHERE personnage_id = ? AND icone = '🚔'`).bind(p.id).first();
        if (last && last.le > now - 60e3) return json(h, 200, view(compte, ch, now));   // un seul choc compté par minute
        if (!f.casier) {
          await db.batch([repSt(db, p.id, f.rep, now), db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🚔', ?, 0, ?)`).bind(uid(), p.id, roadFaultText(f, kmh), now)]);
          return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
        }
        const recent = ch.casier.filter(x => x.le > now - RECIDIVE.jours * 864e5).length;
        const amende = Math.min(p.makuta, f.amende), soins = Math.min(p.makuta - amende, f.soins);
        const prison = recent + 1 >= RECIDIVE.fois || amende + soins < f.amende + f.soins, until = prison ? now + PRISON_HOURS * 36e5 : null;
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, bonheur = MAX(0, bonheur - 10), prison_jusqu = COALESCE(?, prison_jusqu) WHERE id = ? AND makuta >= ?`).bind(amende + soins, until, p.id, amende + soins), GUARD(db),
          ...taxTo(db, p.id, amende, "amende (police routière) : piéton blessé", now),
          ...(soins > 0 ? await payToCompany(db, "pharmacie", p.id, soins, "frais médicaux du piéton blessé", now) : []),
          db.prepare(`INSERT INTO infractions (id, personnage_id, type, amende, prison_heures, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), p.id, f.id, amende, prison ? PRISON_HOURS : 0, now),
          repSt(db, p.id, f.rep + (prison ? REP.prison : 0), now),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🚔', ?, 0, ?)`).bind(uid(), p.id, roadFaultText(f, kmh, { amende, soins, prison }), now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/soigner" && req.method === "POST") {
        await settle(db, p, now);
        if (p.sante >= 95 && !ch.blessure) return fail(h, 409, "Tu es en bonne santé, pas besoin de soins.");
        const c = careCost(p.assure_jusqu, p.assureur, now, (await ledger(db, [STATE_ID]))[STATE_ID] >= CARE.prix ? LAWS.budget.sante : 0);   // part de l'État si le Trésor peut payer
        if (p.makuta < c.prix) return fail(h, 409, `Les soins coûtent ${fmtMakuta(c.prix)}.`);
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, sante = MIN(100, sante + ?) WHERE id = ? AND makuta >= ?`).bind(c.prix, CARE.sante, p.id, c.prix), GUARD(db),
          ...(c.prix > 0 ? await payToCompany(db, "pharmacie", p.id, c.prix, "soins au centre de santé", now) : []),
          ...(c.etat > 0 ? await payToCompany(db, "pharmacie", STATE_ID, c.etat, "budget santé : soins de " + p.prenom, now) : []),
          db.prepare(`DELETE FROM blessures WHERE personnage_id = ?`).bind(p.id),   // soigné : la blessure de l'accident guérit
        ]);
        return json(h, 200, { soins: c, ...view(compte, await loadCharacter(db, p.id), now) });
      }

      // ---- téléphone
      if (url.pathname === "/api/telephone/recharger" && req.method === "POST") {
        const o = OPERATORS.find(x => x.id === body.operateur), m = Math.floor(Number(body.montant));
        if (!o || !RECHARGES.includes(m)) return fail(h, 400, "Recharge invalide.");
        if (p.makuta < m) return fail(h, 409, "Pas assez d'e-makuta.");
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, credit = credit + ?, operateur = ? WHERE id = ? AND makuta >= ?`).bind(m, m, o.id, p.id, m), GUARD(db),
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
        if (body.poste == null) {   // retrait : la caution n'est pas rendue
          await db.batch([db.prepare(`DELETE FROM candidatures WHERE personnage_id = ?`).bind(p.id), db.prepare(`DELETE FROM campagnes_elec WHERE personnage_id = ?`).bind(p.id)]);
          return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
        }
        const po = POSTS.find(x => x.id === body.poste), programme = String(body.programme || "").trim();
        const deja = await db.prepare(`SELECT 1 FROM candidatures WHERE personnage_id = ?`).bind(p.id).first();
        const no = cannotRun({ poste: body.poste, age: ageYears(p.ne_le, now), makuta: p.makuta, prison: inPrison(p.prison_jusqu, now), dejaCandidat: !!deja,
          infractionsRecentes: ch.casier.filter(x => x.le > now - RECIDIVE.jours * 864e5).length, reputation: ch.reputation, programme });
        if (no) return fail(h, 409, no);
        const fee = ELECTION_FEE[po.id];
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(fee, p.id, fee), GUARD(db),
          ...taxTo(db, p.id, fee, `caution électorale (CENI) : ${po.nom.toLowerCase()}`, now),
          db.prepare(`INSERT INTO candidatures (personnage_id, poste, le) VALUES (?, ?, ?)`).bind(p.id, po.id, now),
          db.prepare(`INSERT OR REPLACE INTO campagnes_elec (personnage_id, poste, programme, soutien, depense, caution, le) VALUES (?, ?, ?, 0, 0, ?, ?)`).bind(p.id, po.id, programme, fee, now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      // ---- campagne électorale : un meeting par jour, avec affiches payées à la Régie
      if (url.pathname === "/api/election/campagne" && req.method === "POST") {
        const k = await db.prepare(`SELECT * FROM campagnes_elec WHERE personnage_id = ?`).bind(p.id).first(), jour = dayKey(now);
        await settle(db, p, now);
        const no = cannotCampaignElec({ candidat: !!k, energie: p.energie, makuta: p.makuta, dejaAujourdhui: k && k.dernier_jour === jour, prison: inPrison(p.prison_jusqu, now) });
        if (no) return fail(h, 409, no);
        const parole = tal.some(t => t.talent_id === "parole" && t.decouvert), gain = ELECTION_CAMPAIGN.soutien + (parole ? ELECTION_CAMPAIGN.bonusParole : 0), C = ELECTION_CAMPAIGN;
        await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, energie = MAX(0, energie - ?) WHERE id = ? AND makuta >= ?`).bind(C.cout, C.energie, p.id, C.cout), GUARD(db),
          db.prepare(`UPDATE campagnes_elec SET soutien = MIN(?, soutien + ?), dernier_jour = ?, depense = depense + ? WHERE personnage_id = ? AND (dernier_jour IS NULL OR dernier_jour != ?)`).bind(C.maxSoutien, gain, jour, C.cout, p.id, jour), GUARD(db),
          tx(db, p.id, "sp-regie", C.cout, "campagne électorale : meeting et affiches", now),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '📣', ?, 0, ?)`).bind(uid(), p.id, `Meeting de campagne à ${p.quartier || "Kinshasa"} : +${gain} de soutien${parole ? " (talent de parole)" : ""}.`, now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      // ---- pouvoirs des élus : décret sur la TVA (Président), projet de budget (gouvernement), vote des lois (Parlement)
      if (url.pathname === "/api/presidence/tva" && req.method === "POST") {
        await loadLaws(db);
        const taux = Math.round(Number(body.taux)), avant = LAWS.tva;
        const no = cannotSetVat({ president: ch.mandat && ch.mandat.poste === "president", taux, actuel: avant, dernier: LAWS.tvaLe, now });
        if (no) return fail(h, 409, no);
        const texte = `Décret présidentiel : la TVA passe de ${avant} % à ${taux} % dès aujourd'hui, comprise dans tous les prix.`;
        await db.batch([
          db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('tva', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(String(taux)),
          db.prepare(`INSERT INTO jeu (cle, valeur) VALUES ('tva_le', ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur`).bind(String(now)),
          communiqueSt(db, "Présidence", texte, now),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🏛️', ?, 0, ?)`).bind(uid(), p.id, texte, now),
          ...protestSt(db, "tva", taux, p.id, now + 1),
        ]);
        LAWS.tva = taux; LAWS.tvaLe = now; TICKER.at = 0;
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/parlement/projet" && req.method === "POST") {
        await loadLaws(db);
        const type = body.type || "budget", c = cleanLaw(type, type === "budget" ? body.budget || {} : body);
        if (c.erreur) return fail(h, 400, c.erreur);
        const en = await db.prepare(`SELECT 1 FROM lois WHERE statut = 'vote'`).first();
        const no = cannotProposeLaw({ type, poste: ch.mandat && ch.mandat.poste, enCours: !!en });
        if (no) return fail(h, 409, no);
        const fin = now + PARLIAMENT.voteJours * 864e5, auteur = ch.mandat.poste === "president" ? "Gouvernement" : "Parlement", txt = lawText(type, c.contenu);
        try {
          await db.batch([
            db.prepare(`INSERT INTO lois (id, type, titre, contenu, auteur_id, statut, depot, fin_vote) VALUES (?, ?, ?, ?, ?, 'vote', ?, ?)`).bind(uid(), type, lawTitle(type), JSON.stringify(c.contenu), p.id, now, fin),
            communiqueSt(db, auteur, `${type === "budget" ? "Projet de loi déposé" : "Proposition de loi déposée"} au Parlement par ${p.prenom} ${p.nom} : ${txt}. Vote des députés et des sénateurs pendant ${PARLIAMENT.voteJours} jours.`, now, PARLIAMENT.voteJours),
            db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '📜', ?, 0, ?)`).bind(uid(), p.id, `Loi déposée au Parlement : ${txt}.`, now),
          ]);
        } catch (e) { if (/UNIQUE/i.test(String(e && e.message))) return fail(h, 409, "Un projet de loi est déjà en cours de vote au Parlement : attends la fin du vote."); throw e; }
        TICKER.at = 0;
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }
      if (url.pathname === "/api/parlement/vote" && req.method === "POST") {
        const choix = body.choix === "oui" ? "oui" : body.choix === "non" ? "non" : null;
        if (!choix) return fail(h, 400, "Vote invalide : pour ou contre.");
        const loi = await db.prepare(`SELECT * FROM lois WHERE id = ?`).bind(String(body.loi || "")).first();
        const deja = loi && await db.prepare(`SELECT 1 FROM votes_lois WHERE loi_id = ? AND personnage_id = ?`).bind(loi.id, p.id).first();
        const siege = ch.mandat && ch.mandat.poste;
        const no = cannotVoteBill({ siege, loi, deja: !!deja, now });
        if (no) return fail(h, 409, no);
        await db.batch([
          db.prepare(`INSERT OR IGNORE INTO votes_lois (loi_id, personnage_id, chambre, choix, le) VALUES (?, ?, ?, ?, ?)`).bind(loi.id, p.id, siege, choix, now), GUARD(db),
          db.prepare(`INSERT INTO mouvements (id, personnage_id, icone, texte, par_consigne, le) VALUES (?, ?, '🗳️', ?, 0, ?)`).bind(uid(), p.id, `Vote au Parlement : ${choix === "oui" ? "pour" : "contre"} ${loi.titre.toLowerCase()}.`, now),
        ]);
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
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(e.en_vente, p.id, e.en_vente), GUARD(db),
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
          db.prepare(`UPDATE annonces SET statut = 'retiree' WHERE possession_id = ? AND statut = 'ouverte'`).bind(own.id),
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
        // son propre véhicule (permis valide pour moto et voiture) : seulement le carburant, sinon le taxi
        const veh = ownVehicle((ch.inv || []).map(x => x.objet_id), permitStatus(ch.dip || [], ch.ptsPermis || [], now).valide);
        if (veh && ageYears(p.ne_le, now) >= (veh.minAge || 0)) {
          const fuel = veh.trajet || 0, tired = veh.id === "velo" ? BIKE_ENERGY : TAXI_ENERGY;
          if (p.makuta < fuel) return fail(h, 409, `Le carburant coûte ${fmtMakuta(fuel)} : pas assez d'e-makuta.`);
          if (p.energie < tired) return fail(h, 409, "Trop fatigué pour sortir : repose-toi ou mange.");
          await db.batch([
            db.prepare(`UPDATE personnages SET makuta = makuta - ?, energie = MAX(0, energie - ?), quartier = ? WHERE id = ? AND makuta >= ?`).bind(fuel, tired, q, p.id, fuel), GUARD(db),
            ...(fuel ? [db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, fuel - vatOf(fuel), "carburant vers " + q, now), ...taxTo(db, p.id, vatOf(fuel), "TVA " + LAWS.tva + " % (DGI) : carburant", now)] : []),
          ]);
          return json(h, 200, { arrive: q, vehicule: veh.nom, ...view(compte, await loadCharacter(db, p.id), now) });
        }
        if (ageYears(p.ne_le, now) < 12) return fail(h, 409, "Trop jeune pour prendre le taxi seul.");
        if (p.makuta < TAXI_FARE) return fail(h, 409, `La course coûte ${fmtMakuta(TAXI_FARE)}.`);
        if (p.energie < TAXI_ENERGY) return fail(h, 409, "Trop fatigué pour sortir : repose-toi ou mange.");
        const [r] = await db.batch([
          db.prepare(`UPDATE personnages SET makuta = makuta - ?, energie = MAX(0, energie - ?), quartier = ? WHERE id = ? AND makuta >= ?`).bind(TAXI_FARE, TAXI_ENERGY, q, p.id, TAXI_FARE), GUARD(db),
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
        const res = attendCourse(f, ch.enr, tal.map(t => ({ talent: t.talent_id, discovered: !!t.decouvert })), p.makuta, p.energie, now, rng(seedOf()),
          (await ledger(db, [STATE_ID]))[STATE_ID] >= 2000 ? LAWS.budget.ecole : 0);   // part des frais payée par l'État (budget éducation)
        if (res.error) return fail(h, 409, res.error);
        const st = [db.prepare(`UPDATE personnages SET energie = MAX(0, energie - ?), makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(15, res.fee, p.id, res.fee), GUARD(db), matSt(db, p.id, MATURITY_GAIN.cours)];
        if (res.fee) st.push(db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, res.fee, "frais de cours : " + f.nom, now));
        if (res.etat) st.push(db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) SELECT ?, ?, NULL, ?, ?, ? WHERE (SELECT ok FROM garde WHERE id = 1) = 1`).bind(uid(), STATE_ID, res.etat, "budget éducation : frais de cours de " + p.prenom, now));
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
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(item.prix, p.id, item.prix), GUARD(db),
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

      // guichet : dépôt d'argent (mobile money, carte, espèces chez un agent) converti en e-makuta
      if (url.pathname === "/api/guichet/deposer" && req.method === "POST") {
        const usdIn = Math.round(Number(body.usd) * 100) / 100, no = cannotDeposit(body.moyen, usdIn, body.telephone);
        if (no) return fail(h, 400, no);
        const mk = Math.round(usdIn * USD_UNITS), num = maskPhone(body.telephone);
        if (REAL_MONEY) {
          // argent réel : on enregistre une demande, la passerelle confirme plus tard par /api/paiement/notification
          if (!payConfigured(env)) return fail(h, 503, "Le paiement réel n'est pas encore branché.");
          const ref = uid();
          await db.prepare(`INSERT INTO guichet (id, compte_id, personnage_id, sens, moyen, numero, usd, makuta, statut, simule, le) VALUES (?, ?, ?, 'depot', ?, ?, ?, ?, 'en_attente', 0, ?)`).bind(ref, compte.id, p.id, body.moyen, num, usdIn, mk, now).run();
          try {
            const g = await startDeposit(env, { ref, usd: usdIn, moyen: body.moyen, telephone: String(body.telephone || "").replace(/\D/g, ""), notifyUrl: `${url.origin}/api/paiement/notification`, returnUrl: `${url.origin}/vie.html#wallet` });
            if (g.providerRef) await db.prepare(`UPDATE guichet SET ref_partenaire = ? WHERE id = ?`).bind(String(g.providerRef), ref).run();
            return json(h, 200, { ...view(compte, await loadCharacter(db, p.id), now), paiement: { ref, attente: true, redirect: g.redirect, message: g.message } });
          } catch (e) {
            await db.prepare(`UPDATE guichet SET statut = 'echoue' WHERE id = ?`).bind(ref).run();
            return fail(h, 502, e.message);
          }
        }
        await db.batch([
          db.prepare(`INSERT INTO depots (id, compte_id, offre, usd, makuta, simule, le) VALUES (?, ?, 'recharge', ?, ?, 1, ?)`).bind(uid(), compte.id, usdIn, mk, now),
          db.prepare(`INSERT INTO guichet (id, compte_id, sens, moyen, numero, usd, makuta, statut, simule, le) VALUES (?, ?, 'depot', ?, ?, ?, ?, 'simule', 1, ?)`).bind(uid(), compte.id, body.moyen, num, usdIn, mk, now),
          db.prepare(`UPDATE personnages SET makuta = makuta + ? WHERE id = ?`).bind(mk, p.id),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, NULL, ?, ?, ?, ?)`).bind(uid(), p.id, mk, "dépôt simulé au guichet", now),
        ]);
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      if (url.pathname === "/api/retirer" && req.method === "POST") {
        const mk = Math.floor(Number(body.makuta) || 0);
        const w = walletInfo(ch.dep, p.makuta, now, ch.ret);
        const no = cannotWithdraw(w, p.makuta, mk, body.moyen, body.telephone);
        if (no) return fail(h, 409, no);
        if (REAL_MONEY && !payConfigured(env)) return fail(h, 503, "Le paiement réel n'est pas encore branché.");
        const usd = withdrawUsd(mk), ref = uid();
        await db.batch([
          db.prepare(`INSERT INTO guichet (id, compte_id, personnage_id, sens, moyen, numero, usd, makuta, statut, simule, le) VALUES (?, ?, ?, 'retrait', ?, ?, ?, ?, ?, ?, ?)`).bind(ref, compte.id, p.id, body.moyen, maskPhone(body.telephone), usd, mk, REAL_MONEY ? "en_attente" : "simule", REAL_MONEY ? 0 : 1, now),
          db.prepare(`UPDATE personnages SET makuta = makuta - ? WHERE id = ? AND makuta >= ?`).bind(mk, p.id, mk), GUARD(db),
          db.prepare(`INSERT INTO retraits (id, compte_id, makuta, usd, simule, le) VALUES (?, ?, ?, ?, ?, ?)`).bind(uid(), compte.id, mk, usd, REAL_MONEY ? 0 : 1, now),
          db.prepare(`INSERT INTO transactions (id, de_id, vers_id, montant, motif, le) VALUES (?, ?, NULL, ?, ?, ?)`).bind(uid(), p.id, mk, "retrait vers l'argent réel" + (REAL_MONEY ? "" : " (simulé)"), now),
        ]);
        if (REAL_MONEY) {
          try {
            const g = await startPayout(env, { ref, usd, moyen: body.moyen, telephone: String(body.telephone || "").replace(/\D/g, ""), notifyUrl: `${url.origin}/api/paiement/notification` });
            if (g.providerRef) await db.prepare(`UPDATE guichet SET ref_partenaire = ? WHERE id = ?`).bind(String(g.providerRef), ref).run();
          } catch (e) { await refundPayout(db, ref, Date.now()); return fail(h, 502, e.message + " Tes e-makuta t'ont été rendus."); }
        }
        return json(h, 200, view(compte, await loadCharacter(db, p.id), now));
      }

      return fail(h, 404, "Route inconnue.");
    } catch (e) {
      if (guardFailed(e)) return fail(h, 409, "Opération annulée : pas assez d'e-makuta, ou elle vient déjà d'être faite. Rien n'a été payé.");
      console.error(e);
      return fail(h, 500, "Erreur du serveur.");
    }
  },
};
export default worker;
export { CityRoom } from "./city.js";
