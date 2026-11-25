// 2 Life : écran du personnage. Parle au serveur (Cloudflare Worker) ou, sans serveur configuré,
// simule la même vie dans le navigateur (mode démo).
import {
  ageYears, stageOf, STAGES, realMsUntil, TALENTS, ACTIVITIES, rng, drawTalents, doActivity, needsAt, newIdentity, BIRTH_GIFT,
  SHOP, cannotBuy, OFFERS, USD_TO_MAKUTA, USD_UNITS, fmtMakuta, WITHDRAW_FEE, walletInfo, birthShiftMs, shopView, familyOf, JOBS, payFor, cannotWork, workView, SHIFT_ENERGY, cannotApply, FORMATIONS, cannotEnroll, attendCourse, schoolView, STUDY_ENERGY, SUPPORT_PER_DAY, HOST_MIN_AGE, canSignupBeforeLaunch, COMPANY_TYPES, cannotOpenCompany, companyName, companyView, companyAccrue, companyJob, EMPLOYEE_YIELD, RESELL_RATE, TAXI_FARE, TAXI_ENERGY, KINSHASA_QUARTIERS, OTHER_CITIES, TAX, POSTS, PUBLIC_JOBS, BANKS, bankAccrue, INSURERS, CARE, careCost, ACCIDENT, injuredBlocks, accidentText, OPERATORS, RECHARGES, CALL, stateView, supportDue, unpaidEffect, familyShare, FIRST_NAMES,
  describeAction, ORDER_DONE, ORDERS, ORDERS_PER_DAY, ORDERS_CHECK_MS, dayKey, ordersToRun, cannotGiveOrder,
  VOTER_MIN_AGE, NEGLECT_DANGER_DAYS, NEGLECT_DANGER_HEALTH, splitEstate, deathCause, familyShareRate, REP, REP_BAD, REP_GOOD, repLabel, repDiscount, DOT_MAKUTA, MARRY_MIN_AGE, STREET_JOBS, cannotStreetJob, RENT, rentOf, houseOf, rentDue, HOUSING_MIN_AGE, SALE_TAX, LIFE_EVENTS, EVENT_EVERY_H, drawEvent, eventMoney, lifeAlbum, CRIMES, catchChance, sentence, inPrison, PRISON_BLOCKED, BAIL, PRISON_HOURS, RECIDIVE, policeView, applySettings, food, drawEntry, classOfWealth, classLabel, MATURITY_GAIN, BIG_DECISIONS, cannotDecide, dashboard,
  PAY_METHODS, cannotDeposit, cannotWithdraw, maskPhone, withdrawUsd, COMMUNES, communeView, ROLES, drawRole, roleOf,
  streakStep, streakView, nightSummary, prevDayKey,
  newspaper, cannotSendWord, neighborView, GREETINGS, WORD_MAX,
  PUBLIC_COMPANIES, STATE_SEED, soeView, promoPrice, cannotPromote, PROMO_PRICE, PROMO_MAX_DAYS, goalsView, newlyReached, cannotChooseGoal, GOAL_REP, pickStars, vatOf, AD_COLORS,
  LIFESTYLES, LIFESTYLE_MIN_AGE, lifestyleCost, lifestyleFor, lifestyleStep, lifeExpectancy, OLD_AGE_HEALTH, tenueBlocks, livingView, BILLS,
  CAMPAIGN_MAX_DAYS, ambassadorFee, cannotHireAmbassador, LEAGUE_NAME, NPC_CLUBS, CLUB_MIN_AGE, CLUB_MAX_AGE, MATCH_GATE, clubStrength, playMatch, pairClubs, standings, scorersText, cannotRecruit, CLUB_CONTRACT_DAYS,
} from "../server/src/life.js";
import { launchDemo } from "./lancement-demo.js";

const API = (window.TWO_LIFE_API || "").replace(/\/$/, "");
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS_TOKEN = "twolife_token", LS_DEMO = "twolife_demo";
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } },
};

// ---------------------------------------------------------------- mode démo (même règles, dans le navigateur)
// réglages de l'admin (en démo : gardés dans ce navigateur par la page admin)
try { applySettings(JSON.parse(localStorage.getItem("twolife_reglages") || "{}")); } catch (e) { }
const FOOD = { get prix() { return food().prix; }, get faim() { return food().faim; } };
// démo : les entreprises des autres joueurs viennent de la liste de lancement (ou d'exemples)
function demoOthers() {
  const L = launchDemo.get().entreprises.filter(e => !e.moi);
  const base = L.length ? L : [["maquis", "Maquis Ya Mado", "Kalamu", "Mado Kabeya"], ["taxi", "Taxi Express", "Limete", "Patrick Ilunga"], ["boutique", "Boutique Mama Nzazi", "Matonge", "Nzazi Mbuyi"], ["salon", "Salon Élégance", "Gombe", "Grâce Tshibola"], ["pharmacie", "Pharmacie du Rond-Point", "Lemba", "Jean Mukendi"]]
    .map(([type, nom, quartier, proprietaire]) => ({ type, nom, quartier, proprietaire }));
  return base.map((e, i) => ({ ...e, id: "autre-" + i, en_vente: i % 3 === 0 ? Math.round((COMPANY_TYPES.find(t => t.id === e.type) || { prix: 20000 }).prix * 1.2) : null }));
}
const DEMO_ORDERS_MS = 2 * 60e3;
// démo : des joueurs simulés vivent dans la ville (en ligne, ce seront les vrais inscrits)
function demoNeighbors(c) {
  const r = rng((c.look || 7) ^ 0x5eed), out = [];
  for (let i = 0; i < 9; i++) {
    const id = newIdentity(r), same = i < 4;
    out.push({ id: "voisin-" + i, prenom: id.firstName, nom: id.lastName, sexe: id.sex, quartier: same ? c.quartier : id.quartier, pseudo: (id.firstName.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")) + (10 + i * 7),
      ne_le: Date.now() - (200 + Math.floor(r() * 700)) * 864e5, metier: JOBS[Math.floor(r() * JOBS.length)].id, reputation: Math.floor(r() * 60) - 10, memeCommune: same || id.quartier === c.quartier });
  }
  return out;
}
const DEMO_REPLIES = ["Mbote ! Content de te connaître 😄", "Avec plaisir, on se voit au maquis ce soir.", "Merci ! Passe me voir à ma boutique.", "Ha ha, d'accord. Bonne journée à toi !", "Je suis au travail, je te réponds plus tard 🙏"];
const demo = {
  seed() { return crypto.getRandomValues(new Uint32Array(1))[0]; },
  goalFacts(d, v) {
    return { entreprises: v.entreprises.miennes.length, proprio: !!(v.logement.actuel && v.logement.actuel.statut === "proprio"), marie: !!(v.couple && v.couple.conjoint), enfants: (v.enfants || []).length,
      fortune: v.perso.makuta + (d.comptes || []).reduce((t, x) => t + (x.solde || 0), 0), diplomes: (d.dip || []).length, talents: v.perso.talents.length,
      public: !!d.job && PUBLIC_JOBS.some(j => j.id === d.job), elu: String(d.job || "").startsWith("elu-"), rep: v.reputation.points };
  },
  view(d) {
    const v = this.viewBase(d);
    const rows = d.objectifs || [], won = newlyReached(rows, this.goalFacts(d, v));
    if (won.length) { won.forEach(g => { const r = rows.find(x => x.objectif_id === g); r.atteint_le = Date.now(); this.addRep(d, GOAL_REP); this.move(d, "🏆", `Objectif de vie atteint : ${goalsView([r]).mes[0].nom} (+${GOAL_REP} de réputation).`); }); store.set(LS_DEMO, d); return this.view(d); }
    v.objectifs = goalsView(rows, this.goalFacts(d, v));
    const tresor = STATE_SEED + (d.tresor || 0) + (d.tva || 0), soldes = { "sp-regie": d.regie || 0, "sp-voirie": 60000, "sp-mwinda": 82000, "sp-mai": 41000 };
    v.etat.tresor = tresor;
    v.etat.finances = { tresor, impotsJour: (d.tva || 0) + Math.max(0, d.tresor || 0), salairesJour: 0, arrieres: 0, societes: soeView(soldes, { "sp-mwinda": 3, "sp-mai": 2, "sp-regie": 1, "sp-voirie": 6 }), tva: 16, demo: true };
    v.salaireDu = 0; v.promo = { prix: PROMO_PRICE, maxJours: PROMO_MAX_DAYS };
    v.train = livingView(d.train || {}, d.perso.makuta, ageYears(d.perso.neLe));
    v.blessure = d.blessure || null;
    v.campagnes = { maxJours: CAMPAIGN_MAX_DAYS, liste: (d.campagnes || []).filter(x => x.fin > Date.now()) };
    return v;
  },
  viewBase(d) {
    const now = Date.now(), c = d.perso, age = ageYears(c.neLe, now), st = stageOf(age), next = STAGES[STAGES.indexOf(st) + 1];
    const n = needsAt(c, now);
    return {
      compte: { pseudo: d.pseudo, reputation: 0, accesPaye: false },
      perso: {
        prenom: c.firstName, nom: c.lastName, sexe: c.sex, quartier: c.quartier, ville: "Kinshasa", apparence: c.look, neLe: c.neLe,
        age, etape: st.id, etapeLabel: st.label, prochaineEtape: next ? { label: next.label, dansMs: realMsUntil(c.neLe, next.from, now) } : null,
        besoins: Object.fromEntries(Object.entries(n).map(([k, v]) => [k, Math.round(v)])), makuta: c.makuta, pere: c.father, mere: c.mother, vivant: true, famille: familyOf(c, age), accueil: !!d.accueil,
        talents: c.talents.filter(t => t.discovered).map(t => ({ id: t.talent, label: TALENTS.find(x => x.id === t.talent).label, niveau: t.level })),
        talentsCaches: c.talents.filter(t => !t.discovered).length,
        indices: c.talents.filter(t => !t.discovered && t.hints > 0).map(t => TALENTS.find(x => x.id === t.talent).hint),
      },
      activites: ACTIVITIES.map(a => ({ id: a.id, label: a.label, minAge: a.minAge, energie: a.energy })),
      repas: { ...FOOD, prix: Math.round(FOOD.prix * repDiscount(d.rep || 0)) },
      reputation: { points: d.rep || 0, label: repLabel(d.rep || 0), mauvaise: (d.rep || 0) <= REP_BAD, bonne: (d.rep || 0) >= REP_GOOD },
      tableau: dashboard({ makuta: c.makuta, banque: (d.comptes || []).reduce((a, x) => a + bankAccrue(x, now), 0), biens: (d.inv || []).reduce((a, o) => a + ((SHOP.find(x => x.id === (o.objet || o.objet_id || o.id)) || {}).prix || 0), 0),
        entreprises: (d.ent || []).reduce((a, e) => a + (e.capital || 0), 0), maison: d.logement && d.logement.statut === "proprio" ? houseOf(d.logement.quartier) : 0, flux: d.flux || {}, depots: d.dep || [], origine: d.origine || null, diplomas: d.dip || [], now, quartier: c.quartier, seed: c.look }),
      couple: { conjoint: d.conjoint || null, recues: [], envoyees: [], dot: DOT_MAKUTA },
      petitsBoulots: { liste: STREET_JOBS, dernier: d.lastStreet || null },
      logement: { actuel: d.logement || null, quartiers: Object.keys(RENT).map(q => ({ ...communeView(q), quartier: q, loyer: rentOf(q), prix: houseOf(q) })), minAge: HOUSING_MIN_AGE },
      annonces: this.market(d).map(a => ({ id: a.id, prix: a.prix, le: a.le, vendeur: a.vendeur, moi: !!a.moi, objet: SHOP.find(x => x.id === a.objet) })),
      ...shopView(d.inv || [], d.dep || [], d.ret || [], c.makuta, now, (d.gui || []).slice().reverse().slice(0, 30)),
      travail: { ...workView(d.job, d.lastShift, now), emploiEntreprise: d.boss ? companyJob(d.boss) : null },
      ecole: schoolView(d.enr || null, d.dip || [], now),
      enfants: (d.enfants || []).map(k => { const a = ageYears(k.neLe, now), kn = needsAt(k, now);
        return { id: k.id, prenom: k.prenom, nom: k.nom, sexe: k.sex, age: Math.round(a * 100) / 100, etapeLabel: stageOf(a).label, joueur: true, simule: true,
          besoins: Object.fromEntries(Object.entries(kn).map(([x, y]) => [x, Math.round(y)])), makuta: k.makuta, prochainEntretien: a < 18 ? supportDue(k.entretienLe, k.neLe, now).next : null }; }),
      entretienParJour: SUPPORT_PER_DAY, demo: true,
      entreprises: companyView((d.ent || []).map(e => ({ ...e, employes: ((d.club || {})[e.id] || []).length })), { aVendre: demoOthers().filter(e => e.en_vente && !(d.achetees || []).includes(e.id)), offres: demoOthers().filter(e => !(d.achetees || []).includes(e.id)).slice(0, 6) }, now),
      voyage: { quartiers: KINSHASA_QUARTIERS, communes: COMMUNES.map(c => communeView(c.nom)), prix: TAXI_FARE, fatigue: TAXI_ENERGY, villes: OTHER_CITIES },
      elections: launchDemo.elections(this.me(d)),
      mouvements: d.mouvements || [],
      notifications: { actives: !!d.notif },
      fidelite: streakView(d.fid, now),
      mots: { recus: (d.mots || {}).recus || [], nonLus: ((d.mots || {}).recus || []).filter(m => !m.lu).length, envoyes: (d.mots || {}).envoyes || [], modeles: GREETINGS, max: WORD_MAX },
      resume: nightSummary({ prenom: c.firstName, fem: c.sex === "F", mouvements: d.mouvements || [], vuLe: d.fid && d.fid.resume_vu_le, makutaVu: d.fid && d.fid.makuta_vu, makuta: c.makuta, besoins: n, now }),
      consignes: { ...this.orders(d), max: ORDERS_PER_DAY, catalogue: ORDERS, verifieToutesLesMinutes: DEMO_ORDERS_MS / 60e3 },
      police: policeView({ policiers: 0, prisonJusqu: d.prison, casier: d.casier || [] }, now),
      etat: stateView({ comptes: d.comptes || [], assureur: d.assureur, assureJusqu: d.assureJusqu, operateur: d.operateur, credit: d.credit || 0, candidature: d.candidature },
        { tresor: d.tresor || 0, masse: c.makuta + (d.comptes || []).reduce((a, x) => a + bankAccrue(x, now), 0), candidats: d.candidature ? { [d.candidature]: 1 } : {} }, now),
    };
  },
  orders(d) { const jour = dayKey(); if (!d.consignes || d.consignes.jour !== jour) d.consignes = { jour, liste: [], journal: [] }; return d.consignes; },
  // le personnage suit les consignes (en démo : vérifié à chaque visite, toutes les 2 minutes au plus)
  async applyOrders(d, force) {
    const C = this.orders(d), now = Date.now();
    if (this.busy || !C.liste.length || (!force && d.consignesLe && now - d.consignesLe < DEMO_ORDERS_MS)) return;
    d.consignesLe = now; store.set(LS_DEMO, d);
    const runs = ordersToRun(C.liste, this.view(d), now, C.journal.filter(j => j.ok).map(j => j.ordre));
    this.busy = true; const faits = [];
    try {
      for (const [ordre, path, body] of runs) {
        let ok = true, msg;
        try { const j = await this.call(path, body, true); msg = ORDER_DONE[ordre] + (j.paie ? ` +${fmtMakuta(j.paie.montant - (j.paie.famille || 0) - (j.paie.impot || 0))}` : j.encaisse ? ` +${fmtMakuta(j.encaisse)}` : ""); }
        catch (e) { ok = false; msg = e.message; }
        if (ok) faits.push(msg);
        const dd = store.get(LS_DEMO), CC = this.orders(dd), last = CC.journal.find(x => x.ordre === ordre);
        if (ok || !last || last.message !== msg) { CC.journal.unshift({ ordre, ok: ok ? 1 : 0, message: msg, le: now }); CC.journal = CC.journal.slice(0, 30); }
        store.set(LS_DEMO, dd);
      }
    } finally { this.busy = false; }
    if (faits.length && store.get(LS_DEMO).notif) demoNotify(`2 Life · ${d.perso.firstName}`, faits.join(" · "));
  },
  me(d) { return { candidature: d.candidature, nom: `${d.perso.firstName} ${d.perso.lastName}`, quartier: d.perso.quartier }; },
  settle(c) { const n = needsAt(c); Object.assign(c, n, { updatedAt: Date.now() }); },
  // entretien quotidien des enfants simulés (même règle que le serveur)
  support(d) {
    const c = d.perso, now = Date.now();
    for (const k of d.enfants || []) {
      if (ageYears(k.neLe, now) >= 18) continue;
      const { days, due } = supportDue(k.entretienLe, k.neLe, now);
      if (days < 1) continue;
      const pay = Math.min(due, c.makuta), unpaid = Math.floor((due - pay) / SUPPORT_PER_DAY), fx = unpaidEffect(unpaid);
      c.makuta -= pay; k.makuta += pay; k.entretienLe = (k.entretienLe || k.neLe) + days * 864e5;
      if (unpaid > 0) k.neglige = (k.neglige || 0) + unpaid;
      const danger = (k.neglige || 0) >= NEGLECT_DANGER_DAYS;
      Object.assign(k, needsAt(k, now), { updatedAt: now }); k.happiness = Math.max(0, k.happiness - fx.bonheur); k.health = Math.max(0, k.health - fx.sante - (danger ? NEGLECT_DANGER_HEALTH * unpaid : 0));
      if (unpaid > 0) this.move(d, danger ? "🆘" : "😢", danger ? `${k.prenom} est négligé${k.sex === "F" ? "e" : ""} depuis ${k.neglige} jours : en danger de mort, et ${k.sex === "F" ? "elle" : "il"} s'en souviendra.` : `Entretien de ${k.prenom} impayé (${k.neglige} jour${k.neglige > 1 ? "s" : ""} de négligence au total).`);
    }
    // un enfant dont la santé tombe à 0 meurt : héritage partagé (ici, son seul héritier est toi, son parent)
    for (const k of (d.enfants || []).slice()) {
      const cause = deathCause(needsAt(k, now), k.neglige || 0); if (!cause) continue;
      const sp = splitEstate(k.makuta, 1);
      c.makuta += sp.each; d.tresor = (d.tresor || 0) + sp.ville;
      d.enfants = d.enfants.filter(x => x !== k); (d.deuils = d.deuils || []).push({ prenom: k.prenom, cause, le: now });
      this.move(d, "✝️", `${k.prenom} est ${k.sex === "F" ? "morte" : "mort"} (${cause}). Tu hérites de ${fmtMakuta(sp.each)}.`);
    }
  },
  // démo : quelques annonces d'autres joueurs (simulés), et tes propres annonces
  market(d) {
    if (!d.market) {
      const items = SHOP.filter(x => x.type !== "nourriture"), sellers = ["Glody M.", "Ornella K.", "Fiston B.", "Gloria T."];
      d.market = sellers.map((v, i) => { const it = items[(i * 3 + 1) % items.length]; return { id: "ann" + i, objet: it.id, prix: Math.round(it.prix * (.6 + i * .1)), vendeur: v, le: Date.now() - i * 36e5 }; });
    }
    return d.market;
  },
  // train de vie (démo : même règle que le serveur, une fois par jour de Kinshasa)
  living(d) {
    const c = d.perso, now = Date.now(), jour = dayKey(now);
    if (ageYears(c.neLe, now) < LIFESTYLE_MIN_AGE) return;
    const t = d.train = d.train || { niveau: "auto", tenue: 40, vitalite: 50 };
    if (t.dernier_jour === jour) return;
    t.dernier_jour = jour; this.settle(c);
    const l = lifestyleFor(t.niveau, c.makuta), nx = lifestyleStep(t, l), cost = l ? lifestyleCost(l.id) : 0, e = l ? l.effet : { faim: 0, sante: -3, bonheur: -6 };
    const esp = lifeExpectancy(nx.vitalite), vieux = ageYears(c.neLe, now) > esp, cl = x => Math.max(0, Math.min(100, x));
    c.makuta -= cost; c.hunger = cl(c.hunger + e.faim); c.health = cl(c.health + e.sante - (vieux ? OLD_AGE_HEALTH : 0)); c.happiness = cl(c.happiness + e.bonheur);
    Object.assign(t, nx, { dernier_niveau: l ? l.id : null, depense_jour: cost });
    if (l) { d.tva = (d.tva || 0) + Object.values(l.postes).reduce((a, n) => a + vatOf(n), 0); this.flow(d, "depense", cost);
      this.move(d, l.icone, `Dépenses du jour, train de vie ${l.nom.toLowerCase()}${t.niveau === "auto" ? " (choisi selon ses moyens)" : t.niveau !== l.id ? " (l'argent manque pour mieux)" : ""} : ${fmtMakuta(cost)}.`); }
    else this.move(d, "😣", `${c.firstName} n'a pas de quoi acheter à manger aujourd'hui : la santé et le moral baissent.`);
    if (vieux) this.move(d, "👴", `${c.firstName} a dépassé son espérance de vie (${esp} ans) : la vieillesse fait baisser sa santé chaque jour.`);
  },
  // championnat (démo) : une journée de matchs par jour, ou à la demande avec le bouton « journée suivante »
  footDay(d, force) {
    const jour = dayKey();
    if (!force && d.footJour === jour) return;
    d.footJour = jour; d.footRound = (d.footRound || 0) + 1;
    const mine = (d.ent || []).filter(e => e.type === "club" && ((d.club || {})[e.id] || []).length).map(e => ({ id: e.id, nom: e.nom, force: clubStrength(d.club[e.id]), joueurs: d.club[e.id] }));
    const out = [];
    for (const [a, b] of pairClubs(mine.concat(NPC_CLUBS), jour + d.footRound)) {
      const [ga, gb] = playMatch(a.force, b.force), but = [];
      for (const [t, g] of [[a, ga], [b, gb]]) if (t.joueurs) for (let i = 0; i < g; i++) but.push(t.joueurs[Math.floor(Math.random() * t.joueurs.length)]);
      out.push({ jour: d.footRound, dom_id: a.id, dom_nom: a.nom, ext_id: b.id, ext_nom: b.nom, buts_dom: ga, buts_ext: gb, buteurs: scorersText(but.map(j => j.nom)) });
      for (const [t, me, them] of [[a, ga, gb], [b, gb, ga]]) {
        const e = (d.ent || []).find(x => x.id === t.id); if (!e) continue;
        const gate = me > them ? MATCH_GATE.victoire : me === them ? MATCH_GATE.nul : MATCH_GATE.defaite;
        e.caisse = (e.caisse || 0) + gate;
        this.move(d, "⚽", `Match de ${e.nom} : ${a.nom} ${ga}-${gb} ${b.nom}. Billetterie : +${fmtMakuta(gate)} dans la caisse du club.`);
      }
    }
    d.foot = out.concat(d.foot || []).slice(0, 300);
  },
  footView(d) {
    const m = d.foot || [], last = m.length ? m.filter(x => x.jour === m[0].jour) : [];
    return { ligue: LEAGUE_NAME, saison: dayKey().slice(0, 7), classement: standings(m), derniers: last.map(x => ({ dom: x.dom_nom, ext: x.ext_nom, bd: x.buts_dom, be: x.buts_ext, buteurs: x.buteurs })),
      mesClubs: (d.ent || []).filter(e => e.type === "club").map(e => ({ id: e.id, nom: e.nom, force: clubStrength((d.club || {})[e.id] || []), joueurs: ((d.club || {})[e.id] || []).map(j => ({ id: j.id, nom: j.nom })) })), gains: MATCH_GATE, demo: true };
  },
  rent(d) {
    const L = d.logement; if (!L || L.statut !== "loue") return;
    const weeks = rentDue(L.paye_jusqu); if (!weeks) return;
    const due = weeks * L.loyer, c = d.perso;
    if (c.makuta >= due) { c.makuta -= due; L.paye_jusqu += weeks * 7 * 864e5; this.move(d, "🏠", `Loyer payé : ${fmtMakuta(due)} (${L.quartier}).`); }
    else { d.logement = null; c.happiness = Math.max(0, c.happiness - 20); this.addRep(d, -5); this.move(d, "🚪", `Loyer impayé : expulsé du logement à ${L.quartier}. Retour chez les parents.`); }
  },
  flow(d, k, n) { d.flux = d.flux || {}; d.flux[k] = (d.flux[k] || 0) + Math.max(0, Math.round(n)); },
  mature(d, n) { if (d.origine && d.origine.adulte) d.origine.maturite = Math.min(100, (d.origine.maturite || 0) + n); },
  // le jeu décide : bébé ou jeune adulte, avec une classe sociale et des études de départ
  arrive(r, who, now, extra = 0) {
    const e = drawEntry(r), gift = BIRTH_GIFT + extra + (e.adulte ? e.epargne : 0);
    return { e, perso: { ...who, neLe: e.adulte ? now - birthShiftMs(e.age + .01) : now, updatedAt: now, hunger: 100, energy: 100, happiness: 80, health: 100, makuta: gift,
      talents: drawTalents(r).map(t => ({ ...t, discovered: false, hints: 0 })) },
      origine: { classe: e.classe, adulte: e.adulte ? 1 : 0, maturite: e.adulte ? 0 : 100, arrive_le: now, ...drawRole(r) }, dip: e.diplomes.slice(), flux: { recu: gift } };
  },
  addRep(d, n) { d.rep = Math.max(-100, Math.min(100, (d.rep || 0) + n)); },
  move(d, icone, texte) { d.mouvements = [{ icone, texte, par_consigne: 0, le: Date.now() }, ...(d.mouvements || [])].slice(0, 100); },
  // ton personnage meurt : 20 % gardés pour ta prochaine vie, 10 % à la ville, 70 % aux héritiers (ici la famille du jeu)
  die(d, cause) {
    const c = d.perso, now = Date.now(), total = c.makuta + (d.comptes || []).reduce((a, x) => a + bankAccrue(x, now), 0);
    const heirs = (d.enfants || []).length, sp = splitEstate(total, heirs);
    for (const k of d.enfants || []) k.makuta += sp.each;
    const job = d.boss ? companyJob(d.boss) : JOBS.find(j => j.id === d.job);
    const album = lifeAlbum({ prenom: c.firstName, nom: c.lastName, sexe: c.sex, quartier: c.quartier, age: Math.floor(ageYears(c.neLe, now)), cause, metier: job && job.nom,
      diplomes: (d.dip || []).length, talents: c.talents.filter(t => t.discovered).map(t => TALENTS.find(x => x.id === t.talent).label), conjoint: d.conjoint && d.conjoint.prenom,
      enfants: (d.enfants || []).length + (d.deuils || []).length, entreprises: (d.ent || []).length, crimes: (d.casier || []).length, reputation: d.rep || 0, fortune: total });
    d.mort = { prenom: c.firstName, nom: c.lastName, sexe: c.sex, neLe: c.neLe, mortLe: now, cause, age: Math.floor(ageYears(c.neLe, now)), album,
      partage: { report: sp.report, ville: sp.ville, heritiers: heirs ? sp.heritiers : 0, famille: heirs ? 0 : sp.heritiers } };
    d.report = (d.report || 0) + sp.report; c.makuta = 0; d.comptes = [];
    this.move(d, "✝️", `${c.firstName} ${c.lastName} est ${c.sex === "F" ? "morte" : "mort"} (${cause}).`);
  },
  deadView(d) { return { compte: { pseudo: d.pseudo, reputation: 0 }, mort: d.mort, report: d.report || 0, renaissance: OFFERS.find(o => o.id === "bebe"), demo: true }; },
  // chaque action réussie est inscrite dans les mouvements (même règle que le serveur)
  async call(path, body, parConsigne) {
    const r = await this.run(path, body);
    if (body && !["/api/inscription", "/api/connexion"].includes(path) && !path.startsWith("/api/admin/")) {
      const m = describeAction(path, body, r), d = store.get(LS_DEMO);
      if (m && d) { d.mouvements = [{ ...m, par_consigne: parConsigne ? 1 : 0, le: Date.now() }, ...(d.mouvements || [])].slice(0, 100); store.set(LS_DEMO, d); return { ...r, mouvements: d.mouvements }; }
    }
    return r;
  },
  async run(path, body) {
    let d = store.get(LS_DEMO);
    if (d && d.perso && !d.mort) {
      this.support(d);
      this.living(d); this.footDay(d);
      const cause = deathCause(needsAt(d.perso), 0, !!d.train && ageYears(d.perso.neLe) > lifeExpectancy(d.train.vitalite)); if (cause) this.die(d, cause);
      this.rent(d);
      if (!d.lastEvent || Date.now() - d.lastEvent >= EVENT_EVERY_H * 36e5) {   // le destin (démo : même règle)
        d.lastEvent = Date.now(); this.settle(d.perso); const c0 = d.perso, e = drawEvent(Math.random, { quartier: c0.quartier, camp: roleOf(d.origine, c0.look).camp });
        if (e) { let m = eventMoney(e); if (m < 0) m = -Math.min(-m, c0.makuta);
          c0.health = Math.max(1, Math.min(100, c0.health + (e.sante || 0))); c0.energy = Math.max(0, Math.min(100, c0.energy + (e.energie || 0))); c0.happiness = Math.max(0, Math.min(100, c0.happiness + (e.bonheur || 0))); c0.makuta += m;
          if (e.rep) this.addRep(d, e.rep);
          this.move(d, e.icone, `${c0.firstName} ${e.texte}${m ? ` (${m > 0 ? "+" : "−"}${fmtMakuta(Math.abs(m))})` : ""}.`); }
      }
      // démo : un joueur simulé achète parfois tes annonces à un prix raisonnable
      for (const a of (d.market || []).filter(x => x.moi)) {
        const it = SHOP.find(x => x.id === a.objet);
        if (Date.now() - a.le > 60e3 && a.prix <= it.prix * 1.2 && Math.random() < .5) {
          const net = a.prix - Math.round(a.prix * SALE_TAX); d.perso.makuta += net; d.market = d.market.filter(x => x !== a);
          this.move(d, "🤝", `Un joueur a acheté ton annonce : ${it.nom} (${fmtMakuta(net)} après taxe).`);
        }
      }
      const el = launchDemo.elections(this.me(d));   // dépouillement : un joueur élu prend son poste
      if (el.depouille) { d.candidature = null; if (el.gagne) { d.job = "elu-" + el.gagne; d.boss = null; } }
      store.set(LS_DEMO, d);
    }
    if (path === "/api/lancement") return launchDemo.status();
    if (path.startsWith("/api/admin/")) return launchDemo.admin(path, body || {});
    if (path === "/api/inscription") {
      const no = launchDemo.refusal(body.formule); if (no) throw new Error(no);
      const r = rng(this.seed()), who = newIdentity(r), now = Date.now();
      const offer = OFFERS.find(o => o.id === body.formule) || OFFERS[0], adult = !!offer.age, inv = offer.type === "investissement";
      const gift = inv ? offer.usd * USD_UNITS : adult ? offer.epargne : BIRTH_GIFT;
      if (offer.id === "bebe") {
        const A = this.arrive(r, who, now);
        d = { pseudo: body.pseudo, email: String(body.email || "").trim().toLowerCase(), inv: [], ret: [], accueil: false, enfants: [],
          dep: [{ offre: offer.id, usd: offer.usd, makuta: 0, le: now }], perso: A.perso, origine: A.origine, dip: A.dip, flux: A.flux, rep: (ROLES.find(x => x.id === A.origine.role) || {}).rep || 0 };
        this.move(d, A.e.adulte ? "🧑🏾" : "👶", A.e.adulte ? `Le jeu a décidé : ${who.firstName} arrive à ${who.quartier} à ${A.e.age} ans (${classLabel(A.e.classe).toLowerCase()}). Il faut d'abord grandir avant les grandes décisions.` : `Le jeu a décidé : ${who.firstName} naît bébé à ${who.quartier}, dans une famille ${classLabel(A.e.classe).toLowerCase()}.`);
        store.set(LS_DEMO, d); store.set(LS_TOKEN, "demo");
        return { token: "demo", ...this.view(d), naissance: true };
      }
      d = {
        pseudo: body.pseudo, email: String(body.email || "").trim().toLowerCase(), inv: [], ret: [], accueil: adult, enfants: [],
        dep: [{ offre: offer.id, usd: offer.usd, makuta: inv ? gift : 0, le: now }],
        perso: { ...who, neLe: adult ? now - birthShiftMs(offer.age + .01) : now, updatedAt: now, hunger: 100, energy: 100, happiness: 80, health: 100,
          makuta: gift, talents: drawTalents(r).map(t => ({ ...t, discovered: adult, hints: 0 })) },
        origine: { classe: classOfWealth(gift), adulte: 0, maturite: 100, arrive_le: now }, flux: { recu: gift },
      };
      if (inv) launchDemo.addInvestor(d.pseudo, d.email, offer.id);
      store.set(LS_DEMO, d); store.set(LS_TOKEN, "demo");
      return { token: "demo", ...this.view(d), naissance: true };
    }
    if (path === "/api/connexion") {
      if (!d || d.email !== String(body.email || "").trim().toLowerCase()) throw new Error("Aucun personnage de démo pour cette adresse sur cet appareil.");
      store.set(LS_TOKEN, "demo"); return { token: "demo", ...(d.mort ? this.deadView(d) : this.view(d)) };
    }
    if (!d) throw new Error("Connecte-toi pour continuer.");
    const c = d.perso;
    if (path === "/api/demo/mourir") { this.die(d, "maladie non soignée"); store.set(LS_DEMO, d); return this.deadView(d); }
    if (d.mort) {
      if (path === "/api/renaitre") {
        // renaissance payante (15 $ simulés) : nouvelle vie, avec les 20 % gardés de la précédente
        const r = rng(this.seed()), who = newIdentity(r), now = Date.now(), o = OFFERS.find(x => x.id === "bebe");
        const vies = [...(d.vies || []), d.mort];
        const A = this.arrive(r, who, now, d.report || 0);
        d = { pseudo: d.pseudo, email: d.email, inv: [], ret: d.ret || [], accueil: false, enfants: [], notif: d.notif, vies, deuils: d.deuils || [],
          dep: [...(d.dep || []), { offre: o.id, usd: o.usd, makuta: 0, le: now }], perso: A.perso, origine: A.origine, dip: A.dip, flux: A.flux, rep: (ROLES.find(x => x.id === A.origine.role) || {}).rep || 0 };
        this.move(d, A.e.adulte ? "🧑🏾" : "👶", A.e.adulte ? `Nouvelle vie : ${who.firstName} ${who.lastName} arrive à ${who.quartier} à ${A.e.age} ans.` : `Nouvelle vie : ${who.firstName} ${who.lastName} est né${who.sex === "F" ? "e" : ""} à ${who.quartier}.`);
        store.set(LS_DEMO, d); return { ...this.view(d), renaissance: true };
      }
      if (path === "/api/moi") return this.deadView(d);
      throw new Error("Ton personnage est mort. Tu peux renaître.");
    }
    if (path === "/api/moi") { await this.applyOrders(d); return this.view(store.get(LS_DEMO)); }
    if (path === "/api/consigne") {
      const C = this.orders(d), no = cannotGiveOrder(body.ordre, C.liste); if (no) throw new Error(no);
      C.liste.push(body.ordre);
      const sk = streakStep(d.fid, C.jour); let serieBonus = null;
      if (sk.nouveau) { d.fid = { ...(d.fid || {}), serie: sk.serie, meilleure: sk.meilleure, dernier_jour: sk.dernier_jour }; if (sk.bonus) { c.makuta += sk.bonus; serieBonus = { jours: sk.serie, makuta: sk.bonus }; } }
      store.set(LS_DEMO, d);
      await this.applyOrders(d, true); return { ...this.view(store.get(LS_DEMO)), serieBonus };
    }
    if (path === "/api/journal") {
      const V = demoNeighbors(c), day = dayKey(), rr = rng(Number(day.replace(/-/g, "")) ^ (c.look || 1)), t0 = Date.now() - 20 * 36e5, at = k => t0 + k * 2.5 * 36e5;
      const facts = {
        naissances: [{ prenom: c.firstName, nom: c.lastName, sexe: c.sex, quartier: c.quartier, le: (d.origine && d.origine.arrive_le) || c.neLe }, ...V.slice(0, 2).map((v, k) => ({ ...v, le: at(k) }))].filter(x => x.le > Date.now() - 864e5),
        entreprises: [...(d.ent || []).filter(e => e.cree_le > Date.now() - 864e5).map(e => ({ ...e, le: e.cree_le, proprio: c.firstName + " " + c.lastName })),
          ...(rr() < .8 ? [{ nom: "Chez " + V[2].prenom, type: ["maquis", "boutique", "salon"][Math.floor(rr() * 3)], quartier: V[2].quartier, proprio: V[2].prenom + " " + V[2].nom, le: at(3) }] : [])],
        mariages: [...(d.conjoint ? [{ a: c.firstName + " " + c.lastName, b: d.conjoint.prenom, quartier: c.quartier, le: Date.now() - 36e5 }] : []), ...(rr() < .6 ? [{ a: V[3].prenom + " " + V[3].nom, b: V[5].prenom + " " + V[5].nom, quartier: V[3].quartier, le: at(4) }] : [])],
        deces: rr() < .35 ? [{ prenom: V[8].prenom, nom: V[8].nom, quartier: V[8].quartier, age: 71, cause: "vieillesse", le: at(5) }] : [],
        arrestations: [{ quartier: V[6].quartier, n: 1 + Math.floor(rr() * 3) }],
        chiffres: { joueurs: V.length },
        pubs: (() => { try { const n = Date.now(); return JSON.parse(localStorage.getItem("twolife_demo_pubs") || "[]").filter(a => a.actif && a.debut <= n && a.fin > n && ["journal", "tous"].includes(a.emplacement)); } catch (e) { return []; } })(),
      };
      return newspaper(facts, Date.now(), c.quartier);
    }
    if (path === "/api/voisins") { const V = demoNeighbors(c).slice(0, 8); return { quartier: c.quartier, joueurs: V.length + 1, demo: true, voisins: V.map(v => neighborView(v)).sort((a, b) => b.memeCommune - a.memeCommune) }; }
    if (path === "/api/mot") {
      const v = demoNeighbors(c).find(x => x.id === body.vers); if (!v) throw new Error("Ce joueur n'est plus dans la ville.");
      const M = d.mots = d.mots || { recus: [], envoyes: [] }, texte = String(body.texte || "").trim();
      const no = cannotSendWord(texte, M.envoyes.filter(m => m.le > Date.now() - 864e5).length, false); if (no) throw new Error(no);
      M.envoyes.unshift({ vers: v.id, nom: v.prenom + " " + v.nom, texte, le: Date.now() });
      M.recus.unshift({ id: "m" + Date.now(), de: v.id, nom: v.prenom + " " + v.nom, pseudo: v.pseudo, texte: DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)], le: Date.now() + 1000, lu: false });
      M.envoyes = M.envoyes.slice(0, 15); M.recus = M.recus.slice(0, 30); store.set(LS_DEMO, d); return { ...this.view(d), envoyeA: v.prenom };
    }
    if (path === "/api/mots/lus") { ((d.mots || {}).recus || []).forEach(m => m.lu = true); store.set(LS_DEMO, d); return this.view(d); }
    if (path === "/api/mot/signaler") { const m = ((d.mots || {}).recus || []).find(x => x.id === body.mot); if (m) { m.lu = true; m.signale = true; d.mots.recus = d.mots.recus.filter(x => x !== m); } store.set(LS_DEMO, d); return this.view(d); }
    if (path === "/api/resume/vu") { d.fid = { ...(d.fid || {}), resume_vu_le: Date.now(), makuta_vu: c.makuta }; store.set(LS_DEMO, d); return this.view(d); }
    if (path === "/api/demo/lendemain") {   // démo seulement : on fait comme si la journée était passée
      const C = this.orders(d), y = prevDayKey(C.jour);
      if (d.fid && d.fid.dernier_jour === C.jour) d.fid.dernier_jour = y;
      d.consignes = { jour: C.jour, liste: [], journal: [] };
      if (d.train) d.train.dernier_jour = null; d.footJour = null;   // nouvelle journée de dépenses et de matchs
      this.living(d); this.footDay(d); store.set(LS_DEMO, d); return this.view(d);
    }
    if (BIG_DECISIONS.includes(path) || (path === "/api/mariage/repondre" && body.accepte)) { const no = cannotDecide(d.origine, c.firstName); if (no) throw new Error(no); }
    if (inPrison(d.prison) && PRISON_BLOCKED.includes(path)) throw new Error(`Tu es en prison jusqu'au ${new Date(d.prison).toLocaleString("fr-FR")}. Paie la caution pour sortir plus tôt.`);
    if (path === "/api/voter") {
      const E = launchDemo.elections(this.me(d));
      if (!E.voteOuvert) throw new Error(E.prochaine ? `Le vote ouvre le ${new Date(E.ouvertureVote).toLocaleDateString("fr-FR")}.` : "Les élections commencent après le démarrage du jeu.");
      if (ageYears(c.neLe) < VOTER_MIN_AGE) throw new Error(`Il faut avoir ${VOTER_MIN_AGE} ans pour voter.`);
      if (!E.candidats.some(x => x.id === body.candidat && x.poste === body.poste)) throw new Error("Candidat introuvable.");
      if (E.mesVotes[body.poste]) throw new Error("Tu as déjà voté pour ce poste.");
      launchDemo.vote(body.poste, body.candidat); return this.view(d);
    }
    if (path === "/api/crime") {
      const cr = CRIMES.find(x => x.id === body.crime); if (!cr) throw new Error("Action inconnue.");
      if (ageYears(c.neLe) < 12) throw new Error("Trop jeune.");
      this.settle(c); const now = Date.now(); d.casier = d.casier || [];
      if (Math.random() >= catchChance(cr, 0)) {
        const gain = cr.gain[0] + Math.floor(Math.random() * (cr.gain[1] - cr.gain[0] + 1));
        c.makuta += gain; if (Math.random() < .25) this.addRep(d, REP.crimeRumeur); store.set(LS_DEMO, d); return { crime: { attrape: false, gain }, ...this.view(d) };
      }
      const sn = sentence(cr, c.makuta, d.casier.filter(x => x.le > now - RECIDIVE.jours * 864e5).length);
      c.makuta -= sn.amende; c.happiness = Math.max(0, c.happiness - 10); d.tresor = (d.tresor || 0) + sn.amende;
      if (sn.prison) d.prison = now + PRISON_HOURS * 36e5;
      this.addRep(d, REP.crimeAttrape + (sn.prison ? REP.prison : 0));
      d.casier.unshift({ type: cr.id, nom: cr.nom, amende: sn.amende, prison_heures: sn.heures, le: now }); d.casier = d.casier.slice(0, 20);
      store.set(LS_DEMO, d); return { crime: { attrape: true, ...sn }, ...this.view(d) };
    }
    if (path === "/api/caution") {
      if (!inPrison(d.prison)) throw new Error("Tu n'es pas en prison.");
      if (c.makuta < BAIL) throw new Error(`La caution coûte ${fmtMakuta(BAIL)}.`);
      c.makuta -= BAIL; d.tresor = (d.tresor || 0) + BAIL; d.prison = Date.now();
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/activite") {
      const act = ACTIVITIES.find(a => a.id === body.activite);
      this.settle(c);
      if (c.energy < act.energy) throw new Error("Trop fatigué : il faut d'abord se reposer.");
      const res = doActivity(act, c.talents, ageYears(c.neLe), rng(this.seed()));
      if (!res.ok) throw new Error(res.message);
      c.energy -= act.energy; c.happiness = Math.min(100, c.happiness + 6);
      const t = c.talents.find(x => x.talent === (res.discovered || res.hint));
      if (res.discovered) t.discovered = true; else if (res.hint) t.hints++;
      store.set(LS_DEMO, d);
      return { resultat: { score: res.score, message: res.message, talent: res.discovered ? TALENTS.find(x => x.id === res.discovered).label : null }, ...this.view(d) };
    }
    if (path === "/api/manger") {
      d.tva = (d.tva || 0) + vatOf(Math.round(FOOD.prix * repDiscount(d.rep || 0)));
      this.settle(c);
      const prix = Math.round(FOOD.prix * repDiscount(d.rep || 0));
      if (c.makuta < prix) throw new Error("Pas assez d'e-makuta pour un repas.");
      c.makuta -= prix; this.flow(d, "depense", prix); c.hunger = Math.min(100, c.hunger + FOOD.faim); store.set(LS_DEMO, d);
      return this.view(d);
    }
    if (path === "/api/acheter") {
      const item = SHOP.find(x => x.id === body.objet);
      this.settle(c);
      const no = cannotBuy(item, c.makuta, ageYears(c.neLe));
      if (no) throw new Error(no);
      const e = item.effet || {};
      c.makuta -= item.prix; if (item.type === "telephone") d.tresor = (d.tresor || 0) + Math.round(item.prix * TAX.douane);
      c.hunger = Math.min(100, c.hunger + (e.faim || 0)); c.happiness = Math.min(100, c.happiness + (e.bonheur || 0)); c.energy = Math.min(100, c.energy + (e.energie || 0));
      d.inv = d.inv || [];
      if (item.type !== "nourriture") {
        if (item.slot) d.inv.forEach(x => { if (SHOP.find(y => y.id === x.objet_id).slot === item.slot) x.porte = 0; });
        d.inv.push({ id: "p" + this.seed(), objet_id: item.id, porte: item.slot ? 1 : 0, acquis_le: Date.now() });
      }
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/porter") {
      const own = (d.inv || []).find(x => x.id === body.possession), item = own && SHOP.find(x => x.id === own.objet_id);
      if (!item || !item.slot) throw new Error("Vêtement introuvable.");
      const was = own.porte;
      d.inv.forEach(x => { if (SHOP.find(y => y.id === x.objet_id).slot === item.slot) x.porte = 0; });
      own.porte = was ? 0 : 1;
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/postuler" && (d.rep || 0) <= REP_BAD) throw new Error("L'employeur refuse : ta réputation dans le quartier est trop mauvaise (vols, prison…). Travaille ta réputation d'abord.");
    if (path === "/api/petitboulot") {
      this.settle(c);
      const j = STREET_JOBS.find(x => x.id === body.boulot), no = injuredBlocks(d.blessure) || cannotStreetJob(j, ageYears(c.neLe), c.energy, d.lastStreet);
      if (no) throw new Error(no);
      const gain = j.gain[0] + Math.floor(Math.random() * (j.gain[1] - j.gain[0] + 1));
      c.makuta += gain; c.energy = Math.max(0, c.energy - j.energie); d.lastStreet = Date.now(); this.mature(d, MATURITY_GAIN.petitboulot); this.flow(d, "recu", gain);
      store.set(LS_DEMO, d); return { boulot: { nom: j.nom, gain }, ...this.view(d) };
    }
    if (path === "/api/logement/louer" || path === "/api/logement/acheter") {
      const q = String(body.quartier || ""), buy = path.endsWith("acheter");
      if (!RENT[q]) throw new Error("Quartier inconnu.");
      if (ageYears(c.neLe) < HOUSING_MIN_AGE) throw new Error(`Possible à partir de ${HOUSING_MIN_AGE} ans.`);
      if (d.logement && d.logement.statut === "proprio" && !buy) throw new Error("Tu as déjà ta propre parcelle.");
      const cost = buy ? houseOf(q) : rentOf(q); if (c.makuta < cost) throw new Error(`Il faut ${fmtMakuta(cost)}.`);
      c.makuta -= cost; c.happiness = Math.min(100, c.happiness + 10); c.quartier = q;
      d.logement = { statut: buy ? "proprio" : "loue", quartier: q, loyer: buy ? 0 : cost, paye_jusqu: buy ? null : Date.now() + 7 * 864e5, depuis: Date.now() };
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/logement/quitter") { if (d.logement && d.logement.statut === "loue") d.logement = null; store.set(LS_DEMO, d); return this.view(d); }
    if (path === "/api/annonce/publier") {
      const own = (d.inv || []).find(x => x.id === body.possession), prix = Math.round(Number(body.prix));
      if (!own) throw new Error("Objet introuvable."); if (!(prix >= 1)) throw new Error("Prix invalide.");
      if (this.market(d).some(a => a.poss === own.id)) throw new Error("Cet objet est déjà en vente.");
      own.porte = 0; d.market.unshift({ id: "moi" + Date.now(), objet: own.objet_id, poss: own.id, prix, vendeur: c.firstName + " " + c.lastName, moi: true, le: Date.now() });
      d.inv = d.inv.filter(x => x !== own);   // l'objet part au marché
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/annonce/retirer") {
      const a = this.market(d).find(x => x.id === body.id && x.moi); if (a) { d.market = d.market.filter(x => x !== a); (d.inv = d.inv || []).push({ id: a.poss, objet_id: a.objet, porte: 0, acquis_le: Date.now() }); }
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/annonce/acheter") {
      const a = this.market(d).find(x => x.id === body.id); if (!a) throw new Error("Annonce introuvable ou déjà vendue.");
      if (a.moi) throw new Error("C'est ton annonce."); if (c.makuta < a.prix) throw new Error("Pas assez d'e-makuta.");
      c.makuta -= a.prix; d.tresor = (d.tresor || 0) + Math.round(a.prix * SALE_TAX); d.market = d.market.filter(x => x !== a);
      (d.inv = d.inv || []).push({ id: "p" + this.seed(), objet_id: a.objet, porte: 0, acquis_le: Date.now() });
      store.set(LS_DEMO, d); return { achete: SHOP.find(x => x.id === a.objet).nom, ...this.view(d) };
    }
    // démo : pas d'autre joueur sur cet appareil, la personne demandée répond tout de suite (elle accepte 2 fois sur 3)
    if (path === "/api/mariage/demander") {
      const nm = String(body.pseudo || "").trim(); if (!nm) throw new Error("Écris le pseudo de la personne.");
      if (ageYears(c.neLe) < MARRY_MIN_AGE) throw new Error(`Le mariage est possible à partir de ${MARRY_MIN_AGE} ans.`);
      if (d.conjoint) throw new Error("Tu es déjà marié.");
      if (Math.random() < 1 / 3) { this.move(d, "🙅", `${nm} a refusé ta demande en mariage.`); store.set(LS_DEMO, d); return { refus: nm, ...this.view(d) }; }
      const groom = c.sex === "M";
      if (groom && c.makuta < DOT_MAKUTA) throw new Error(`Ta famille doit réunir la dot : ${fmtMakuta(DOT_MAKUTA)}.`);
      c.makuta += groom ? -DOT_MAKUTA : DOT_MAKUTA;
      d.conjoint = { prenom: nm, nom: "", pseudo: nm, sexe: groom ? "F" : "M" }; this.addRep(d, REP.mariage);
      this.move(d, "💒", groom ? `Mariage avec ${nm}. Dot versée : ${fmtMakuta(DOT_MAKUTA)}.` : `Mariage avec ${nm}. La famille du marié a versé la dot (${fmtMakuta(DOT_MAKUTA)}).`);
      store.set(LS_DEMO, d); return { marie: true, ...this.view(d) };
    }
    if (path === "/api/divorce") { if (!d.conjoint) throw new Error("Tu n'es pas marié."); d.conjoint = null; this.addRep(d, REP.divorce); store.set(LS_DEMO, d); return this.view(d); }
    if (path === "/api/postuler" && body.entreprise) {
      const e = demoOthers().find(x => x.id === body.entreprise);
      if (!e) throw new Error("Entreprise introuvable.");
      if (ageYears(c.neLe) < 18) throw new Error("Il faut avoir 18 ans pour travailler dans une entreprise.");
      const look = tenueBlocks(companyJob(e), d.train ? d.train.tenue : null); if (look) throw new Error(look);
      d.boss = { id: e.id, nom: e.nom, type: e.type }; d.job = companyJob(d.boss).id;
      store.set(LS_DEMO, d); return { embauche: e.nom, ...this.view(d) };
    }
    if (path === "/api/banque/deposer" || path === "/api/banque/retirer") {
      const b = BANKS.find(x => x.id === body.banque), m = Math.floor(Number(body.montant));
      if (!b) throw new Error("Banque inconnue."); if (!(m >= 20)) throw new Error("Montant invalide (1 e-makuta minimum).");
      if (ageYears(c.neLe) < 16) throw new Error("Il faut 16 ans pour ouvrir un compte en banque.");
      d.comptes = d.comptes || []; let acc = d.comptes.find(x => x.banque === b.id); if (!acc) d.comptes.push(acc = { banque: b.id, solde: 0, maj_le: Date.now() });
      const solde = bankAccrue(acc), dep = path.endsWith("deposer");
      if (dep && c.makuta < m) throw new Error("Tu n'as pas autant d'e-makuta sur toi.");
      if (dep && b.plafond && solde + m > b.plafond) throw new Error(`Cette coopérative accepte au plus ${fmtMakuta(b.plafond)}.`);
      if (!dep && solde < m) throw new Error("Solde insuffisant.");
      acc.solde = dep ? solde + m : solde - m; acc.maj_le = Date.now(); c.makuta += dep ? -m : m;
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/assurance") {
      const a = INSURERS.find(x => x.id === body.assureur); if (!a) throw new Error("Assureur inconnu.");
      if (c.makuta < a.prime) throw new Error(`La prime coûte ${fmtMakuta(a.prime)}.`);
      const from = d.assureJusqu > Date.now() && d.assureur === a.id ? d.assureJusqu : Date.now();
      c.makuta -= a.prime; d.assureur = a.id; d.assureJusqu = from + a.jours * 864e5;
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/accident") {   // choc fort dans la ville 3D : blessure à soigner (au plus une fois par 10 min)
      const kmh = Math.round(Number(body.kmh)); if (!(kmh >= ACCIDENT.minKmh && kmh <= ACCIDENT.maxKmh)) throw new Error("Vitesse du choc invalide.");
      if (!(d.blessure && d.blessure.le > Date.now() - ACCIDENT.attenteMin * 6e4)) {
        this.settle(c); c.health = Math.max(ACCIDENT.santeMin, c.health - ACCIDENT.sante); c.happiness = Math.max(0, c.happiness - ACCIDENT.bonheur);
        d.blessure = { le: Date.now(), vitesse: kmh }; this.move(d, "🚑", accidentText(c.firstName, kmh, c.sex === "F"));
      }
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/soigner") {
      this.settle(c); if (c.health >= 95 && !d.blessure) throw new Error("Tu es en bonne santé, pas besoin de soins.");
      const k = careCost(d.assureJusqu, d.assureur); if (c.makuta < k.prix) throw new Error(`Les soins coûtent ${fmtMakuta(k.prix)}.`);
      c.makuta -= k.prix; c.health = Math.min(100, c.health + CARE.sante); d.blessure = null;
      store.set(LS_DEMO, d); return { soins: k, ...this.view(d) };
    }
    if (path === "/api/telephone/recharger") {
      const o = OPERATORS.find(x => x.id === body.operateur), m = Math.floor(Number(body.montant));
      if (!o || !RECHARGES.includes(m)) throw new Error("Recharge invalide."); if (c.makuta < m) throw new Error("Pas assez d'e-makuta.");
      c.makuta -= m; d.credit = (d.credit || 0) + m; d.operateur = o.id;
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/telephone/appeler") {
      if (!(d.inv || []).some(x => (SHOP.find(y => y.id === x.objet_id) || {}).type === "telephone")) throw new Error("Il te faut d'abord un téléphone (au magasin).");
      if ((d.credit || 0) < CALL.prix) throw new Error("Plus de crédit : recharge ton téléphone.");
      this.settle(c); d.credit -= CALL.prix; c.happiness = Math.min(100, c.happiness + CALL.bonheur);
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/candidature") {
      if (body.poste == null) { d.candidature = null; store.set(LS_DEMO, d); return this.view(d); }
      const po = POSTS.find(x => x.id === body.poste); if (!po) throw new Error("Poste inconnu.");
      if (ageYears(c.neLe) < po.minAge) throw new Error(`Il faut avoir ${po.minAge} ans pour être candidat au poste de ${po.nom.toLowerCase()}.`);
      d.candidature = po.id; store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/entreprise/encaisser") {
      const e = (d.ent || []).find(x => x.id === body.entreprise); if (!e) throw new Error("Entreprise introuvable.");
      const a = companyAccrue(e); if (a.caisse < 1) throw new Error("La caisse est vide pour l'instant. Reviens plus tard.");
      const impot = Math.round(a.caisse * TAX.recettes); d.tresor = (d.tresor || 0) + impot;
      c.makuta += a.caisse - impot; e.caisse = 0; e.maj_le = a.maj_le;
      store.set(LS_DEMO, d); return { encaisse: a.caisse - impot, impot, ...this.view(d) };
    }
    if (path === "/api/entreprise/vendre") {
      const e = (d.ent || []).find(x => x.id === body.entreprise); if (!e) throw new Error("Entreprise introuvable.");
      e.en_vente = body.prix == null ? null : Math.floor(Number(body.prix));
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/entreprise/acheter") {
      const e = demoOthers().find(x => x.id === body.entreprise && x.en_vente);
      if (!e || (d.achetees || []).includes(e.id)) throw new Error("Cette entreprise n'est plus en vente.");
      if (ageYears(c.neLe) < 18) throw new Error("Il faut avoir 18 ans pour acheter une entreprise.");
      if (c.makuta < e.en_vente) throw new Error(`Il te faut ${fmtMakuta(e.en_vente)}.`);
      c.makuta -= e.en_vente; (d.achetees = d.achetees || []).push(e.id);
      (d.ent = d.ent || []).push({ id: "e" + Date.now(), nom: e.nom, type: e.type, quartier: e.quartier, capital: e.en_vente, cree_le: Date.now(), caisse: 0, maj_le: Date.now() });
      store.set(LS_DEMO, d); return { achetee: e.nom, ...this.view(d) };
    }
    if (path === "/api/revendre") {
      const own = (d.inv || []).find(x => x.id === body.possession), item = own && SHOP.find(x => x.id === own.objet_id);
      if (!item) throw new Error("Objet introuvable.");
      const gain = Math.floor(item.prix * RESELL_RATE);
      d.inv = d.inv.filter(x => x !== own); c.makuta += gain;
      store.set(LS_DEMO, d); return { vendu: item.nom, gain, ...this.view(d) };
    }
    if (path === "/api/voyager") {
      const q = KINSHASA_QUARTIERS.find(x => x === body.quartier);
      if (!q) throw new Error(OTHER_CITIES.includes(body.quartier) ? `${body.quartier} n'est pas encore ouverte.` : "Destination inconnue.");
      if (q === c.quartier) throw new Error(`Tu es déjà à ${q}.`);
      this.settle(c);
      if (ageYears(c.neLe) < 12) throw new Error("Trop jeune pour prendre le taxi seul.");
      if (c.makuta < TAXI_FARE) throw new Error(`La course coûte ${fmtMakuta(TAXI_FARE)}.`);
      if (c.energy < TAXI_ENERGY) throw new Error("Trop fatigué pour sortir : repose-toi ou mange.");
      c.makuta -= TAXI_FARE; c.energy -= TAXI_ENERGY; c.quartier = q;
      store.set(LS_DEMO, d); return { arrive: q, ...this.view(d) };
    }
    if (path === "/api/objectif") {
      d.objectifs = d.objectifs || [];
      if (body.action === "abandonner") d.objectifs = d.objectifs.filter(r => !(r.objectif_id === body.id && !r.atteint_le));
      else { const no = cannotChooseGoal(body.id, d.objectifs); if (no) throw new Error(no); d.objectifs.push({ objectif_id: body.id, choisi_le: Date.now(), atteint_le: null }); }
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/promouvoir") {
      this.settle(c);
      const e = (d.ent || []).find(x => x.id === body.entreprise), pubs = store.get("twolife_demo_pubs") || [], n = Date.now();
      const active = e && pubs.some(a => a.annonceur === e.nom && a.actif && a.fin > n);
      const no = cannotPromote(body, c.makuta, !!e, active); if (no) throw new Error(no);
      const prix = promoPrice(body.emplacement, Number(body.jours)); c.makuta -= prix; d.regie = (d.regie || 0) + prix; this.flow(d, "depense", prix);
      pubs.unshift({ id: n.toString(36), annonceur: e.nom, titre: String(body.titre).trim(), texte: String(body.texte || "").trim(), commune: COMMUNES.some(x => x.nom === c.quartier) ? c.quartier : "", emplacement: body.emplacement,
        couleur: AD_COLORS[e.nom.length % AD_COLORS.length], debut: n, fin: n + Number(body.jours) * 864e5, prix_usd: 0, paye: true, accord: true, actif: true, cree_le: n, jeu: true });
      store.set("twolife_demo_pubs", pubs.slice(0, 100)); store.set(LS_DEMO, d); return { promo: true, ...this.view(d) };
    }
    if (path === "/api/train") {
      if (body.niveau !== "auto" && !LIFESTYLES.some(l => l.id === body.niveau)) throw new Error("Train de vie inconnu.");
      if (ageYears(c.neLe) < LIFESTYLE_MIN_AGE) throw new Error(`Avant ${LIFESTYLE_MIN_AGE} ans, ce sont les parents qui paient la vie de tous les jours.`);
      d.train = { ...(d.train || { tenue: 40, vitalite: 50 }), niveau: body.niveau }; store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/ambassadeurs") {
      const L = demoNeighbors(c).filter(x => ageYears(x.ne_le) >= 18).map((x, i) => { const star = i < 2, tenue = 30 + (i * 17) % 65;
        return { id: x.id, nom: `${x.prenom} ${x.nom}`, sexe: x.sexe, quartier: x.quartier, joueur: true, rep: x.reputation, tenue, star, prix: ambassadorFee(x.reputation, star) }; });
      return { ambassadeurs: L, maxJours: CAMPAIGN_MAX_DAYS, demo: true };
    }
    if (path === "/api/campagne") {
      this.settle(c);
      const e = (d.ent || []).find(x => x.id === body.entreprise), a = (await this.run("/api/ambassadeurs", {})).ambassadeurs.find(x => x.id === body.ambassadeur);
      if (!a) throw new Error("Ambassadeur introuvable.");
      d = store.get(LS_DEMO);
      const active = e && (d.campagnes || []).some(x => x.entrepriseId === e.id && x.fin > Date.now()), prix = Number(body.prix), jours = Number(body.jours), slogan = String(body.slogan || "").trim().slice(0, 60);
      const no = cannotHireAmbassador({ owns: !!e, active, self: false, age: 25, rep: a.rep, tenue: a.tenue, star: a.star, prix, jours, makuta: d.perso.makuta, slogan }); if (no) throw new Error(no);
      const total = prix * jours; d.perso.makuta -= total; d.tresor = (d.tresor || 0) + Math.round(total * TAX.salaire); this.flow(d, "depense", total);
      d.campagnes = [{ entreprise: e.nom, entrepriseId: e.id, ambassadeur: a.nom, fem: a.sexe === "F", moi: false, prixJour: prix, fin: Date.now() + jours * 864e5, slogan }, ...(d.campagnes || [])].slice(0, 20);
      store.set(LS_DEMO, d); return { ambassadeur: a.nom, cout: total, ...this.view(d) };
    }
    if (path === "/api/foot") return this.footView(d);
    if (path === "/api/demo/foot") { this.footDay(d, true); store.set(LS_DEMO, d); return this.footView(d); }
    if (path === "/api/club/marche") {
      const r = rng((c.look || 3) ^ 0xf007), taken = new Set(Object.values(d.club || {}).flat().map(j => j.id));
      const L = demoNeighbors(c).map(x => ({ x, a: ageYears(x.ne_le) })).filter(o => o.a >= CLUB_MIN_AGE && o.a <= CLUB_MAX_AGE && !taken.has(o.x.id)).map(({ x, a }) => {
        const sport = r() < .5 ? 40 + Math.floor(r() * 55) : null, job = JOBS.find(j => j.id === x.metier), sal = job ? job.salaire : 0;
        return { id: x.id, nom: `${x.prenom} ${x.nom}`, sexe: x.sexe, age: Math.floor(a), quartier: x.quartier, joueur: true, sport, niveau: sport || 25 + Math.floor(r() * 30), poste: job ? job.nom : null, salaire: sal, demande: Math.max(150, Math.round(sal * 1.1)) };
      }).sort((p, q) => (q.sport || 0) - (p.sport || 0));
      return { joueurs: L, contratJours: CLUB_CONTRACT_DAYS, demo: true };
    }
    if (path === "/api/club/recruter") {
      const e = (d.ent || []).find(x => x.id === body.entreprise), j = (await this.run("/api/club/marche", {})).joueurs.find(x => x.id === body.joueur);
      if (!j) throw new Error("Joueur introuvable.");
      d = store.get(LS_DEMO); d.club = d.club || {};
      const t = COMPANY_TYPES.find(x => x.id === "club"), used = e ? (d.club[e.id] || []).length : 0;
      const no = cannotRecruit({ owns: !!e, isClub: !!e && e.type === "club", self: false, age: j.age, prix: Number(body.salaire), current: j.salaire, places: t.places, used, prison: false }); if (no) throw new Error(no);
      (d.club[e.id] = d.club[e.id] || []).push({ id: j.id, nom: j.nom, niveau: j.niveau, salaire: Number(body.salaire) });
      store.set(LS_DEMO, d); return { recrue: j.nom, ...this.view(d) };
    }
    if (path === "/api/stars") {
      const V = demoNeighbors(c), cands = { sport: [], musique: [], affaires: [], politique: [], cuisine: [] };
      // démo : quelques voisins simulés deviennent les stars du jour
      V.forEach((x, i) => { const k = ["sport", "musique", "affaires", "politique", "cuisine"][i % 5]; cands[k].push({ id: x.id, prenom: x.prenom, nom: x.nom, sexe: x.sexe, quartier: x.quartier, age: Math.floor(ageYears(x.ne_le)), joueur: true }); });
      return { stars: pickStars(cands, Date.now()), demo: true };
    }
    if (path === "/api/postuler") {
      const job = JOBS.find(j => j.id === body.metier), no = cannotApply(job, ageYears(c.neLe), d.dip || [], c.talents.filter(t => t.discovered).map(t => t.talent)) || tenueBlocks(job, d.train ? d.train.tenue : null);
      if (no) throw new Error(no);
      d.job = job.id; d.boss = null; store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/travailler") {
      this.settle(c);
      const job = d.boss ? companyJob(d.boss) : JOBS.find(j => j.id === d.job), no = injuredBlocks(d.blessure) || cannotWork(job, ageYears(c.neLe), c.energy, d.lastShift);
      if (no) throw new Error(no);
      const pay = payFor(job, c.talents, d.dip || []);
      pay.famille = familyShare(pay.montant, d.rancune || 0);   // 10 % pour les parents (moins s'il a été négligé enfant)
      pay.impot = Math.round(pay.montant * TAX.salaire); d.tresor = (d.tresor || 0) + pay.impot - (PUBLIC_JOBS.some(j => j.id === job.id) || job.elu ? pay.montant : 0);
      this.addRep(d, REP.travail); this.mature(d, MATURITY_GAIN.travail); this.flow(d, "recu", pay.montant); this.flow(d, "famille", pay.famille); this.flow(d, "impots", pay.impot); this.flow(d, "depense", pay.famille + pay.impot);
      c.makuta += pay.montant - pay.famille - pay.impot; c.energy = Math.max(0, c.energy - SHIFT_ENERGY); c.hunger = Math.max(0, c.hunger - 10); d.lastShift = Date.now();
      store.set(LS_DEMO, d); return { paie: pay, ...this.view(d) };
    }
    if (path === "/api/ecole/inscription") {
      const f = FORMATIONS.find(x => x.id === body.formation), no = cannotEnroll(f, ageYears(c.neLe), d.dip || [], d.enr);
      if (no) throw new Error(no);
      d.enr = { formation: f.id, annee: 1, cours: 0, points: 0, dernier: null };
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/ecole/cours") {
      if (!d.enr) throw new Error("Inscris-toi d'abord dans une école.");
      this.settle(c);
      const f = FORMATIONS.find(x => x.id === d.enr.formation);
      const res = attendCourse(f, d.enr, c.talents, c.makuta, c.energy, Date.now(), rng(this.seed()));
      if (res.error) throw new Error(res.error);
      c.energy = Math.max(0, c.energy - STUDY_ENERGY); c.makuta -= res.fee; this.mature(d, MATURITY_GAIN.cours); this.flow(d, "depense", res.fee);
      if (res.fin) { (d.dip = d.dip || []).push(f.id); d.enr = null; } else d.enr = res.enr;
      store.set(LS_DEMO, d); return { cours: { note: res.note, message: res.message, diplome: !!res.fin }, ...this.view(d) };
    }
    if (path === "/api/accueil") {
      if (ageYears(c.neLe) < HOST_MIN_AGE) throw new Error(`Il faut avoir ${HOST_MIN_AGE} ans pour accueillir un enfant.`);
      d.accueil = !!body.actif; store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/demo/bebe") {
      // démo seulement : simule l'inscription d'un nouveau joueur qui naît chez toi
      if (!d.accueil) throw new Error("Active d'abord l'accueil des enfants.");
      const r = rng(this.seed()), sex = r() < .5 ? "F" : "M", now = Date.now();
      (d.enfants = d.enfants || []).push({ id: "k" + this.seed(), prenom: FIRST_NAMES[sex][Math.floor(r() * FIRST_NAMES[sex].length)], nom: c.lastName, sex, neLe: now, entretienLe: now,
        updatedAt: now, hunger: 100, energy: 100, happiness: 80, health: 100, makuta: 0 });
      c.makuta += BIRTH_GIFT;   // les 10 $ de la naissance sont confiés au parent, qui gère l'argent de l'enfant
      this.move(d, "👶", `Naissance de ${d.enfants.at(-1).prenom} : ${fmtMakuta(BIRTH_GIFT)} confiés à toi, son parent.`);
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/enfant/nourrir") {
      const k = (d.enfants || []).find(x => x.id === body.enfant), item = SHOP.find(x => x.id === body.objet && x.type === "nourriture");
      if (!k || !item) throw new Error("Enfant ou repas introuvable.");
      if (c.makuta < item.prix) throw new Error("Pas assez d'e-makuta.");
      Object.assign(k, needsAt(k), { updatedAt: Date.now() });
      c.makuta -= item.prix; k.hunger = Math.min(100, k.hunger + (item.effet.faim || 0)); k.happiness = Math.min(100, k.happiness + (item.effet.bonheur || 0) + 3);
      store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/entreprise/ouvrir") {
      const t = COMPANY_TYPES.find(x => x.id === body.type), no = cannotOpenCompany(t, ageYears(c.neLe), c.makuta);
      if (no) throw new Error(no);
      const e = { id: "e" + Date.now(), nom: companyName(t, c.lastName, body.nom), type: t.id, quartier: c.quartier, capital: t.prix, cree_le: Date.now(), caisse: 0, maj_le: Date.now() };
      c.makuta -= t.prix; (d.ent = d.ent || []).push(e);
      launchDemo.addCompany({ nom: e.nom, type: e.type, quartier: e.quartier, proprietaire: `${c.firstName} ${c.lastName}`, cree_le: e.cree_le, moi: true });
      store.set(LS_DEMO, d); return { ouverte: e.nom, ...this.view(d) };
    }
    if (path === "/api/investir") {
      const o = OFFERS.find(x => x.id === body.offre && x.type === "investissement");
      if (!o) throw new Error("Offre inconnue.");
      const mk = o.usd * USD_UNITS;
      (d.dep = d.dep || []).push({ offre: o.id, usd: o.usd, makuta: mk, le: Date.now() });
      c.makuta += mk; store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/guichet/deposer") {
      const usdIn = Math.round(Number(body.usd) * 100) / 100, no = cannotDeposit(body.moyen, usdIn, body.telephone);
      if (no) throw new Error(no);
      const mk = Math.round(usdIn * USD_UNITS), now = Date.now();
      (d.dep = d.dep || []).push({ offre: "recharge", usd: usdIn, makuta: mk, le: now });
      (d.gui = d.gui || []).push({ sens: "depot", moyen: body.moyen, numero: maskPhone(body.telephone), usd: usdIn, makuta: mk, statut: "simule", le: now });
      c.makuta += mk; this.flow(d, "recu", mk); store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/retirer") {
      const mk = Math.floor(Number(body.makuta) || 0), w = walletInfo(d.dep || [], c.makuta, Date.now(), d.ret || []);
      const no = cannotWithdraw(w, c.makuta, mk, body.moyen, body.telephone);
      if (no) throw new Error(no);
      c.makuta -= mk; this.flow(d, "depense", mk);
      (d.ret = d.ret || []).push({ makuta: mk, usd: withdrawUsd(mk), statut: "demande", le: Date.now() });
      (d.gui = d.gui || []).push({ sens: "retrait", moyen: body.moyen, numero: maskPhone(body.telephone), usd: withdrawUsd(mk), makuta: mk, statut: "simule", le: Date.now() });
      store.set(LS_DEMO, d); return this.view(d);
    }
    throw new Error("Action inconnue.");
  },
};

async function call(path, body) {
  if (!API) return demo.call(path, body);
  const tok = store.get(LS_TOKEN);
  const r = await fetch(API + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 && path === "/api/moi") store.del(LS_TOKEN); throw new Error(j.erreur || "Le serveur ne répond pas."); }
  return j;
}

// ---------------------------------------------------------------- notifications sur le téléphone
const notifSupported = () => "Notification" in window;
async function notifOn() {
  if (!notifSupported()) throw new Error("Ce navigateur ne gère pas les notifications. Installe l'application (Ajouter à l'écran d'accueil).");
  if (await Notification.requestPermission() !== "granted") throw new Error("Notifications refusées. Tu peux les autoriser dans les réglages du navigateur.");
  if (!API) { const d = store.get(LS_DEMO); d.notif = true; store.set(LS_DEMO, d); return demo.view(d); }
  const { cle } = await call("/api/push/cle");
  if (!cle) throw new Error("Les notifications seront disponibles quand le serveur du jeu sera configuré.");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Ce navigateur ne gère pas les notifications. Installe l'application (Ajouter à l'écran d'accueil).");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(cle) });
  return call("/api/push/abonner", sub.toJSON());
}
async function notifOff() {
  if (!API) { const d = store.get(LS_DEMO); d.notif = false; store.set(LS_DEMO, d); return demo.view(d); }
  try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) { }
  return call("/api/push/desabonner", {});
}
const b64uBytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
// démo : notification locale quand une consigne est faite
async function demoNotify(titre, texte) {
  try {
    if (!notifSupported() || Notification.permission !== "granted") return;
    const reg = "serviceWorker" in navigator && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(titre, { body: texte, icon: "assets/icons/2life-192.png", data: { url: "vie.html#moves" } }); else new Notification(titre, { body: texte, icon: "assets/icons/2life-192.png" });
  } catch (e) { }
}

// ---------------------------------------------------------------- affichage
let state = null, signup = true;
const fmtAge = a => a < 1 ? `${Math.max(0, Math.floor(a * 12))} mois` : `${Math.floor(a)} an${Math.floor(a) > 1 ? "s" : ""}`;
const fmtWait = ms => { const d = ms / 864e5; return d >= 1 ? `${Math.round(d)} jour${Math.round(d) > 1 ? "s" : ""}` : `${Math.max(1, Math.round(ms / 36e5))} h`; };
const NEEDS = [["health", "Santé"], ["hunger", "Faim (satiété)"], ["energy", "Énergie"], ["happiness", "Bonheur"]];

// bouton « verrouillé » : il reste cliquable et explique pourquoi l'action n'est pas encore possible
const dis = (c, why) => c ? `aria-disabled="true" data-why="${esc(why || "Pas disponible pour l'instant.")}"` : "";
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest('[aria-disabled="true"]'); if (!b) return;
  e.preventDefault(); e.stopImmediatePropagation(); toast(b.dataset.why || "Pas disponible pour l'instant.");
}, true);
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 4200);
}

function render(v) {
  state = v;
  if (v.mort) return renderDeath(v);
  $("v-dead").hidden = true;
  const p = v.perso;
  $("v-auth").hidden = true; $("v-life").hidden = false;
  $("h-name").textContent = `${p.prenom} ${p.nom}`;
  $("h-age").textContent = `${fmtAge(p.age)} · ${p.quartier}, ${p.ville}` + (p.prochaineEtape ? ` · ${p.prochaineEtape.label} dans ${fmtWait(p.prochaineEtape.dansMs)}` : "");
  $("h-stage").textContent = p.etapeLabel;
  $("h-money").textContent = fmtMakuta(p.makuta);
  $("needs").innerHTML = NEEDS.map(([k, label]) => {
    const x = p.besoins[k], cls = x < 25 ? "low" : x < 55 ? "mid" : "";
    return `<div class="need">${label} · ${x}<div class="bar"><i class="${cls}" style="width:${x}%"></i></div></div>`;
  }).join("");
  $("b-eat").textContent = `Manger au maquis (${fmtMakuta(v.repas.prix)})`;
  const tal = p.talents.map(t => `<span class="tal on">${t.label} · niveau ${t.niveau}</span>`);
  for (let i = 0; i < p.talentsCaches; i++) tal.push(`<span class="tal">Talent caché</span>`);
  $("talents").innerHTML = tal.join("");
  $("hints").innerHTML = p.indices.map(h => `<div class="hint">Indice : l'enfant ${h}.</div>`).join("") ||
    (p.talentsCaches ? `<p style="font-size:13px;margin:10px 0 0">Les activités en famille aident tes parents à découvrir tes talents.</p>` : "");
  $("acts").innerHTML = v.activites.map(a => {
    const off = p.age < a.minAge || p.besoins.energy < a.energie;
    const why = p.age < a.minAge ? `dès ${a.minAge} ans` : `−${a.energie} énergie`;
    return `<button class="act" data-a="${a.id}" type="button" ${dis(off, why)}>${a.label}<small>${why}</small></button>`;
  }).join("");
  const f = p.famille, ag = n => `${n} an${n > 1 ? "s" : ""}`;
  $("ident").innerHTML = (f ? [
    ["Père", `${f.pere.nom}, ${ag(f.pere.age)} · ${f.pere.metier}${f.pere.joueur ? ` · joueur (${f.pere.joueur})` : ""}`],
    ["Mère", `${f.mere.nom}, ${ag(f.mere.age)} · ${f.mere.metier}${f.mere.joueur ? ` · joueur (${f.mere.joueur})` : ""}`],
    ["Frères et sœurs", f.fratrie.length ? f.fratrie.map(x => `${x.prenom} (${x.age < 1 ? "bébé" : ag(x.age)})`).join(", ") : "Enfant unique"],
    ["Maison", `${f.maison.type}, ${f.maison.pieces} pièces à ${f.maison.quartier} : ${f.maison.desc}`],
  ] : []).concat([["Joueur", v.compte.pseudo], ["Né le", new Date(p.neLe).toLocaleDateString("fr-FR")]])
    .map(([a, b]) => `<div class="row"><span>${a}</span><span style="text-align:right">${b}</span></div>`).join("")
    + (v.demo ? `<button class="mini" id="b-demo-die" type="button" style="margin-top:12px">💀 Simuler la mort (démo)</button>` : "");
  renderNight(v); renderNeighbors(v); renderJournal(); renderGoals(v); renderStars(); renderTrain(v); renderFoot(); renderDash(v); renderCouple(v); renderCity(v);
  renderShop(v); renderWallet(v); renderWork(v); renderSchool(v); renderKids(v); renderCompanies(v); renderTravel(v); renderState(v); renderTips(v); renderOrders(v); renderMoves(v);
  if (!render.hashDone && ["#moves", "#nuit", "#orders", "#voisins", "#journal"].includes(location.hash)) { render.hashDone = true; setTimeout(() => goTo(location.hash.slice(1)), 300); }
  portrait(p);
  dress(v);
}

// ---------------------------------------------------------------- logement, petits boulots, annonces
function renderCity(v) {
  const p = v.perso, B = v.petitsBoulots, Lg = v.logement, A = v.annonces || [];
  if (!B || !Lg) return;
  const wait = B.dernier && Date.now() - B.dernier < 3 * 36e5 ? B.dernier + 3 * 36e5 - Date.now() : 0;
  $("street").innerHTML = `<p style="font-size:13px;margin:0 0 6px">Sans patron ni diplôme, payé tout de suite. Un petit boulot toutes les 3 heures.${wait ? ` Prochain dans ${fmtWait(wait)}.` : ""}</p>`
    + B.liste.map(j => { const why = p.age < j.minAge ? `dès ${j.minAge} ans` : p.besoins.energy < j.energie ? "trop fatigué" : wait ? "patiente" : "";
      return `<div class="item"><span class="sw">${j.icone}</span><div class="t">${j.nom}<small>${mk(j.gain[0])} à ${mk(j.gain[1])} · −${j.energie} énergie${why ? " · " + why : ""}</small></div><button class="mini fill" data-street="${j.id}" type="button" ${dis(why, `Pas maintenant : ${why}.`)}>Y aller</button></div>`; }).join("");
  const cur = Lg.actuel;
  $("home").innerHTML = (cur ? `<div class="item"><span class="sw">${cur.statut === "proprio" ? "🏡" : "🏠"}</span><div class="t">${cur.statut === "proprio" ? "Ta parcelle" : "Location"} à ${esc(cur.quartier)}<small>${cur.statut === "proprio" ? "Tu es chez toi : plus de loyer." : `Loyer ${mk(cur.loyer)} par semaine, payé jusqu'au ${new Date(cur.paye_jusqu).toLocaleDateString("fr-FR")}. Impayé = expulsion.`}</small></div>${cur.statut === "loue" ? `<button class="mini" id="b-leave" type="button">Quitter</button>` : ""}</div>`
      : `<p style="font-size:13px;margin:0 0 8px">${p.age < Lg.minAge ? `Tu vis chez tes parents. Possible de louer à partir de ${Lg.minAge} ans.` : "Tu vis encore chez tes parents. Loue un logement (loyer chaque semaine) ou achète ta parcelle."}</p>`)
    + (p.age >= Lg.minAge && (!cur || cur.statut !== "proprio") ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:14px">Voir les quartiers et les prix</summary>${Lg.quartiers.map(q => `<div class="item"><span class="sw">📍</span><div class="t">${esc(q.quartier)}<small>${q.zone ? esc(q.zone) + " · " : ""}Loyer ${mk(q.loyer)}/semaine · parcelle ${mk(q.prix)}${q.bon ? `<br><span style="color:var(--ok)">＋ ${esc(q.bon[0])}</span> · <span style="color:#f08a8d">− ${esc(q.mauvais[0])}</span>` : ""}</small></div>
        <button class="mini" data-rent="${esc(q.quartier)}" type="button" ${dis(p.makuta < q.loyer, `Il te manque ${mk(q.loyer - p.makuta)} pour louer ici.`)}>Louer</button><button class="mini fill" data-house="${esc(q.quartier)}" type="button" ${dis(p.makuta < q.prix, `Il te manque ${mk(q.prix - p.makuta)} pour acheter ici.`)}>Acheter</button></div>`).join("")}</details>` : "");
  const mine = A.filter(a => a.moi), others = A.filter(a => !a.moi);
  const inv = (v.inventaire || []).map(x => ({ ...x, it: v.boutique.find(b => b.id === x.objet) })).filter(x => x.it && x.it.type !== "nourriture");
  $("market").innerHTML = `<p style="font-size:13px;margin:0 0 6px">Achète et vends entre joueurs. La ville prend 5 % de taxe sur chaque vente.</p>`
    + (others.length ? others.map(a => `<div class="item">${swatch(a.objet)}<div class="t">${esc(a.objet.nom)}<small>${mk(a.prix)} · vendu par ${esc(a.vendeur)}${a.objet.prix ? ` · neuf ${mk(a.objet.prix)}` : ""}</small></div><button class="mini fill" data-annbuy="${esc(a.id)}" type="button" ${dis(p.makuta < a.prix, `Il te manque ${mk(a.prix - p.makuta)}.`)}>Acheter</button></div>`).join("") : `<p style="font-size:13px">Aucune annonce pour l'instant.</p>`)
    + (mine.length ? `<h2 style="font-size:16px;margin:14px 0 4px">Mes annonces</h2>` + mine.map(a => `<div class="item">${swatch(a.objet)}<div class="t">${esc(a.objet.nom)}<small>${mk(a.prix)} · en attente d'un acheteur</small></div><button class="mini" data-annoff="${esc(a.id)}" type="button">Retirer</button></div>`).join("") : "")
    + (inv.length ? `<h2 style="font-size:16px;margin:14px 0 4px">Mettre en vente</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><select id="ann-obj" style="flex:2;min-width:150px;padding:10px;border-radius:10px">${inv.map(x => `<option value="${esc(x.id)}">${esc(x.it.nom)}</option>`).join("")}</select>
        <input id="ann-prix" type="number" min="1" placeholder="prix (e-makuta)" style="flex:1;min-width:110px"><button class="mini fill" id="b-ann" type="button">Publier</button></div>` : "");
}
$("street").onclick = e => { const b = e.target.closest("[data-street]"); if (b) act("/api/petitboulot", { boulot: b.dataset.street }, v => `${v.boulot.nom} : +${mk(v.boulot.gain)}.`); };
$("home").onclick = e => {
  if (e.target.id === "b-leave") return act("/api/logement/quitter", {}, () => "Tu as rendu les clés.");
  const r = e.target.closest("[data-rent]"); if (r) return act("/api/logement/louer", { quartier: r.dataset.rent }, v => `Bienvenue chez toi à ${v.logement.actuel.quartier} !`);
  const h = e.target.closest("[data-house]"); if (h) return act("/api/logement/acheter", { quartier: h.dataset.house }, v => `Tu es propriétaire de ta parcelle à ${v.logement.actuel.quartier} !`);
};
$("market").onclick = e => {
  if (e.target.id === "b-ann") return act("/api/annonce/publier", { possession: $("ann-obj").value, prix: Math.round(Number($("ann-prix").value) * 20) }, () => "Annonce publiée.");
  const b = e.target.closest("[data-annbuy]"); if (b) return act("/api/annonce/acheter", { id: b.dataset.annbuy }, v => `Acheté : ${v.achete}.`);
  const o = e.target.closest("[data-annoff]"); if (o) return act("/api/annonce/retirer", { id: o.dataset.annoff }, () => "Annonce retirée.");
};

// ---------------------------------------------------------------- tableau de bord du personnage
// les bons et les mauvais côtés d'un environnement de la ville
const quartierHtml = q => `<div class="qtr"><div>${q.bon.map(x => `<span class="good">＋ ${esc(x)}</span>`).join("")}</div><div>${q.mauvais.map(x => `<span class="bad">− ${esc(x)}</span>`).join("")}</div></div>`;
function renderDash(v) {
  const T = v.tableau; if (!T) { $("dash-card").hidden = true; return; } $("dash-card").hidden = false;
  const R = T.richesse, A = T.argent, P = T.proprietaire, N = v.perso.besoins, M = T.maturite;
  const row = (l, x, b) => `<div class="row"><span>${l}</span><span>${b ? "<b>" + x + "</b>" : x}</span></div>`;
  const bar = (l, n, inv) => { const g = inv ? 100 - n : n; return `<div class="need">${l} <b style="float:right">${n}</b><div class="bar"><i class="${g < 25 ? "low" : g < 50 ? "mid" : ""}" style="width:${n}%"></i></div></div>`; };
  $("dash").innerHTML = `<div class="grid2">
      <div><div class="need">Richesse accumulée</div><div style="font-family:var(--font-d);font-size:24px;color:var(--accent)">${mk(R.total)}</div></div>
      <div><div class="need">Classe sociale</div><div style="font-size:16px;font-weight:600">${esc(T.classe.actuelleLabel)}</div><small style="color:var(--muted)">${T.classe.naissanceLabel ? "Né" + (v.perso.sexe === "F" ? "e" : "") + " : " + esc(T.classe.naissanceLabel.toLowerCase()) : ""}</small></div>
    </div>
    ${T.role ? `<h3 style="font-size:15px;margin:14px 0 6px">Son caractère et son rôle</h3>
    <div class="role ${T.role.camp}"><b>${esc(T.role.roleNom)}</b> · ${esc(T.role.caractereNom)} <span class="camp">${T.role.camp === "bon" ? "👍 bon" : "👎 mauvais"}</span><small>${esc(T.role.roleDesc)} Donné par le jeu à l'arrivée.</small></div>` : ""}
    ${T.quartier ? `<h3 style="font-size:15px;margin:14px 0 6px">Son quartier : ${esc(T.quartier.nom)} <small style="color:var(--muted);font-weight:400">· ${esc(T.quartier.zone)}</small></h3>${quartierHtml(T.quartier)}` : ""}
    <h3 style="font-size:15px;margin:14px 0 2px">Ce qu'il possède</h3>
    ${row("En poche", mk(R.poche))}${R.banque ? row("À la banque", mk(R.banque)) : ""}${R.biens ? row("Objets", mk(R.biens)) : ""}${R.entreprises ? row("Entreprises", mk(R.entreprises)) : ""}${R.maison ? row("Maison", mk(R.maison)) : ""}
    <h3 style="font-size:15px;margin:14px 0 6px">Ses besoins</h3>
    <div class="grid2">${bar("Faim (rassasié)", N.hunger)}${bar("Énergie", N.energy)}${bar("Santé", N.health)}${bar("Moral", N.happiness)}</div>
    <h3 style="font-size:15px;margin:14px 0 2px">Où va son argent</h3>
    ${row("Gagné et reçu", mk(A.recu))}${row("Dépensé", mk(A.depense))}${row("Donné à sa famille", mk(A.famille))}${row("Impôts payés à l'État", mk(A.impots))}${A.recuFamille ? row("Reçu de sa famille", mk(A.recuFamille)) : ""}
    <h3 style="font-size:15px;margin:14px 0 2px">Côté propriétaire réel (toi)</h3>
    ${row("Tu as versé", P.deposeUsd.toLocaleString("fr-FR") + " $")}${P.fraisAdminUsd ? row("Pour faire vivre le jeu", P.fraisAdminUsd.toLocaleString("fr-FR") + " $") : ""}${row("Confié au personnage ou à ses parents", P.confieUsd.toLocaleString("fr-FR") + " $")}${row("Sa richesse vaudrait aujourd'hui", P.valeurUsd.toLocaleString("fr-FR") + " $", true)}
    ${P.simulation ? `<p class="sim">Simulation : l'argent réel n'est pas encore branché. Le retrait viendra plus tard, avec un partenaire de paiement agréé.</p>` : ""}
    <h3 style="font-size:15px;margin:14px 0 2px">Études et maturité</h3>
    ${row("Niveau d'études", esc(T.etudes.label) + (T.etudes.bonus ? ` (+${Math.round(T.etudes.bonus * 100)} % de paie)` : ""))}
    ${M.arriveAdulte ? `<div class="need" style="margin-top:8px">Maturité ${M.points >= M.max ? "atteinte" : ""} <b style="float:right">${M.points} / ${M.max}</b><div class="bar"><i class="${M.points >= M.max ? "" : "mid"}" style="width:${M.points}%"></i></div></div>
      <p style="font-size:13px;margin-top:8px">${M.points >= M.max ? "Il peut maintenant prendre les grandes décisions : mariage, maison, entreprise, élections." : "Arrivé adulte, il doit d'abord grandir : mariage, achat de maison, entreprise et élections sont bloqués. Le temps (+10 par jour), le travail (+8), les cours (+10) et les petits boulots (+4) le font mûrir."}</p>` : ""}`;
}

// ---------------------------------------------------------------- couple et réputation
function renderCouple(v) {
  const p = v.perso, C = v.couple || { recues: [], envoyees: [] }, R = v.reputation || { points: 0, label: "inconnu" };
  const pct = (R.points + 100) / 2, cls = R.mauvaise ? "low" : R.bonne ? "" : "mid";
  const who = x => `${esc(x.prenom)} ${esc(x.nom || "")}${x.pseudo && x.pseudo !== x.prenom ? ` (${esc(x.pseudo)})` : ""}`.replace(" (", " (").trim();
  $("couple").innerHTML = `<div class="need">Réputation dans le quartier : <b>${esc(R.label)}</b> (${R.points})<div class="bar"><i class="${cls}" style="width:${pct}%"></i></div></div>
    <p style="font-size:13px;margin:8px 0 12px">${R.mauvaise ? "Les employeurs refusent de t'embaucher. Travaille, marie-toi, aide les autres pour te racheter." : R.bonne ? "Tu es respecté : prix d'ami au maquis." : "Le travail et le mariage l'améliorent. Le vol, la prison et la négligence de tes enfants la font baisser."}</p>`
    + (C.conjoint ? `<div class="item"><span class="sw">💒</span><div class="t">Marié${p.sexe === "F" ? "e" : ""} à ${who(C.conjoint)}</div><button class="mini" id="b-divorce" type="button">Divorcer</button></div>`
      : p.age < 18 ? `<p style="font-size:13px">Le mariage est possible à partir de 18 ans.</p>`
      : `<label for="m-pseudo" style="font-size:13px">Demander un joueur en mariage (son pseudo)</label>
        <div style="display:flex;gap:8px;margin-top:6px"><input id="m-pseudo" maxlength="40" placeholder="pseudo" style="flex:1"><button class="mini fill" id="b-ask" type="button">💍 Demander</button></div>
        <p style="font-size:12px;margin:8px 0 0">Selon la tradition, la dot (${mk(C.dot)}) est payée par la famille du marié et versée à la famille de la mariée.${v.demo ? " Démo : la personne répond tout de suite." : ""}</p>`)
    + (C.recues.length ? `<h2 style="font-size:16px;margin:14px 0 4px">Demandes reçues</h2>` + C.recues.map(x => `<div class="item"><span class="sw">💍</span><div class="t">${who(x)}<small>${new Date(x.le).toLocaleDateString("fr-FR")}</small></div>
        <button class="mini fill" data-yes="${esc(x.id)}" type="button">Oui</button><button class="mini" data-no="${esc(x.id)}" type="button">Non</button></div>`).join("") : "")
    + (C.envoyees.length ? `<p style="font-size:13px;margin-top:10px">En attente de réponse : ${C.envoyees.map(who).join(", ")}.</p>` : "");
}
$("couple").onclick = e => {
  if (e.target.id === "b-ask") return act("/api/mariage/demander", { pseudo: $("m-pseudo").value }, v => v.marie ? `Félicitations, vous êtes mariés !` : v.refus ? `${v.refus} a refusé ta demande.` : "Demande envoyée. Attends sa réponse.");
  if (e.target.id === "b-divorce") return act("/api/divorce", {}, () => "Divorce prononcé.");
  const y = e.target.closest("[data-yes]"); if (y) return act("/api/mariage/repondre", { id: y.dataset.yes, accepte: true }, () => "Félicitations, vous êtes mariés !");
  const n = e.target.closest("[data-no]"); if (n) return act("/api/mariage/repondre", { id: n.dataset.no, accepte: false }, () => "Demande refusée.");
};

// ---------------------------------------------------------------- mort et renaissance
function renderDeath(v) {
  const m = v.mort, o = v.renaissance, P = m.partage;
  $("v-auth").hidden = true; $("v-life").hidden = true; $("v-dead").hidden = false;
  $("dead").innerHTML = `<p style="margin:0;font-size:13px">✝️ Fin de vie</p>
    <h1>${esc(m.prenom)} ${esc(m.nom)} est ${m.sexe === "F" ? "morte" : "mort"}</h1>
    <p>À ${m.age} an${m.age > 1 ? "s" : ""}, le ${new Date(m.mortLe).toLocaleDateString("fr-FR")} · cause : <b>${esc(m.cause || "inconnue")}</b>. La mort est définitive : ce personnage ne reviendra pas.</p>
    ${P ? `<div class="row"><span>Gardé pour ta prochaine vie (20 %)</span><span>${mk(P.report)}</span></div>
    ${P.heritiers + P.famille > 0 ? `<div class="row"><span>Frais de succession pour la ville (10 %)</span><span>${mk(P.ville)}</span></div>
    <div class="row"><span>Héritiers : enfants et parents (70 %)</span><span>${mk(P.heritiers + P.famille)}</span></div>`
    : `<div class="row"><span>Pour la ville (10 % + 70 %, aucun héritier vivant)</span><span>${mk(P.ville)}</span></div>`}` : ""}
    <div class="row"><span>Tu repars avec</span><span><b>${mk(v.report)}</b></span></div>
    ${m.album ? `<h2 style="font-size:17px;margin:16px 0 6px">📖 Album de vie</h2><div id="album" style="font-size:14px;line-height:1.6">${m.album.map(l => `<p style="margin:0 0 4px">${esc(l)}</p>`).join("")}</div>
      <button class="btn ghost" id="b-share" type="button" style="margin-top:10px;background:none;border:1px solid var(--line);color:var(--muted)">Partager l'album</button>` : ""}
    <button class="btn" id="b-reborn" type="button">Renaître bébé · ${o.usd} $${v.demo ? " (simulé)" : ""}</button>
    <p style="font-size:13px;margin:10px 0 0">${esc(o.desc)} Les ${mk(v.report)} gardés de cette vie te sont rendus à la naissance.</p>`;
}
$("dead").onclick = e => {
  if (e.target.id === "b-share") {
    const m = state.mort, txt = `2 Life · la vie de ${m.prenom} ${m.nom}\n` + (m.album || []).join("\n");
    if (navigator.share) navigator.share({ title: "Album de vie · 2 Life", text: txt }).catch(() => { });
    else navigator.clipboard.writeText(txt).then(() => toast("Album copié : colle-le où tu veux."), () => toast("Copie impossible."));
    return;
  }
  if (e.target.id === "b-reborn") act("/api/renaitre", {}, v => `Bienvenue dans ta nouvelle vie, ${v.perso.prenom} !`); };

// ---------------------------------------------------------------- magasin, affaires, portefeuille
const TYPES = [["nourriture", "Nourriture", "🍲"], ["vetement", "Vêtements", "👕"], ["telephone", "Téléphones", "📱"]];
let shopTab = "nourriture";
const mk = n => fmtMakuta(Math.round(n));
const usd = n => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} $`;
const SLOT = { haut: "Haut", bas: "Bas", pieds: "Chaussures" };
function swatch(it) {
  return it.couleur ? `<span class="sw" style="background:${it.couleur}"></span>` : `<span class="sw">${(TYPES.find(t => t[0] === it.type) || [, , "•"])[2]}</span>`;
}
function renderShop(v) {
  const p = v.perso;
  $("shop-tabs").innerHTML = TYPES.map(([id, label]) => `<button class="tab ${id === shopTab ? "on" : ""}" data-t="${id}" type="button">${label}</button>`).join("");
  $("shop").innerHTML = v.boutique.filter(it => it.type === shopTab).map(it => {
    const why = it.minAge && p.age < it.minAge ? `dès ${it.minAge} ans` : it.maxAge && p.age > it.maxAge ? "pour les tout-petits" : p.makuta < it.prix ? "trop cher" : "";
    const fx = it.effet ? Object.entries(it.effet).map(([k, x]) => `+${x} ${{ faim: "satiété", bonheur: "bonheur", energie: "énergie" }[k]}`).join(" · ") : SLOT[it.slot] || "";
    return `<div class="item">${swatch(it)}<div class="t">${it.nom}<small>${mk(it.prix)}${fx ? " · " + fx : ""}${why ? " · " + why : ""}</small></div>
      <button class="mini fill" data-buy="${it.id}" type="button" ${dis(why, why)}>${it.type === "nourriture" ? "Manger" : "Acheter"}</button></div>`;
  }).join("");
  const inv = v.inventaire.map(x => ({ ...x, it: v.boutique.find(b => b.id === x.objet) })).filter(x => x.it);
  $("inv").innerHTML = inv.length ? inv.map(x => `<div class="item">${swatch(x.it)}<div class="t">${x.it.nom}<small>${x.it.slot ? (x.porte ? "Porté · " : "") + SLOT[x.it.slot] : "Téléphone : tu peux appeler ta famille"}</small></div>
      ${x.it.slot ? `<button class="mini ${x.porte ? "" : "fill"}" data-wear="${x.id}" type="button">${x.porte ? "Retirer" : "Porter"}</button>` : ""}
      <button class="mini" data-sell="${x.id}" type="button">Vendre ${mk(x.it.prix * RESELL_RATE)}</button></div>`).join("")
    : `<p style="font-size:14px;margin:0">Rien pour l'instant. Les vêtements achetés apparaissent ici et sur ton personnage.</p>`;
}
function renderWallet(v) {
  const w = v.portefeuille, p = v.perso, M = w.moyens || [];
  const keep = {}; document.querySelectorAll("#wallet input").forEach(i => keep[i.id || i.name + i.value] = i.type === "radio" ? i.checked : i.value);
  const dLe = new Date(w.retraitPossibleLe).toLocaleDateString("fr-FR", { timeZone: "Africa/Kinshasa" });
  const lock = w.retraitPossible ? "ouvert maintenant" : w.dejaRetireCeMois ? `déjà retiré ce mois, prochain le ${dLe}` : `à partir du ${dLe}`;
  const rows = [["Solde", mk(p.makuta)], ["Valeur au retrait", `${usd(w.valeurUsd)} (après ${Math.round(w.frais * 100)} % de frais)`], ["Taux", `1 $ = ${w.taux} e-makuta`],
    ["Total déposé", usd(w.deposeUsd)], ["Retrait du mois", lock]];
  const inv = w.offres.filter(o => o.type === "investissement").map(o => `<div class="item"><span class="sw">💼</span><div class="t">${o.nom} · ${usd(o.usd)}<small>${o.desc} Tu reçois ${mk(o.usd * USD_UNITS)}.</small></div>
      <button class="mini fill" data-inv="${o.id}" type="button">Investir</button></div>`).join("");
  const nomMoyen = id => (M.find(m => m.id === id) || { nom: id }).nom;
  const gui = w.guichet || [], seen = new Set(gui.map(g => g.le));
  const hist = [...gui.map(g => [g.le, `${g.sens === "depot" ? "Dépôt" : "Retrait"} ${nomMoyen(g.moyen)}${g.numero ? " " + g.numero : ""} : ${g.sens === "depot" ? `${usd(g.usd)} → +${mk(g.makuta)}` : `−${mk(g.makuta)} → ${usd(g.usd)}`}${g.statut === "simule" ? " (simulé)" : ""}`]),
    ...w.depots.filter(d => d.offre !== "recharge").map(d => [d.le, `${(w.offres.find(o => o.id === d.offre) || {}).nom || d.offre} : ${usd(d.usd)}`]),
    ...w.retraits.filter(r => !seen.has(r.le)).map(r => [r.le, `Retrait demandé : ${mk(r.makuta)} → ${usd(r.usd)}`])].sort((a, b) => b[0] - a[0])
    .map(([t, x]) => `<div class="row"><span>${new Date(t).toLocaleDateString("fr-FR")}</span><span style="text-align:right">${x}</span></div>`).join("");
  const pick = sens => `<div class="paygrid">` + M.filter(m => sens === "dep" || !m.depotSeulement).map((m, i) =>
    `<label class="pay"><input type="radio" name="g-${sens}" value="${m.id}" ${i === 0 ? "checked" : ""}><span>${m.icone} ${m.nom}</span></label>`).join("") + `</div>`;
  const wdNo = !w.retraitPossible ? (w.dejaRetireCeMois ? `Tu as déjà retiré ton dû ce mois-ci. Prochain retrait à partir du ${dLe}.` : `Le retrait se fait en fin de mois : à partir du ${dLe}.`) : p.makuta < USD_UNITS ? `Il faut au moins ${mk(USD_UNITS)} (1 $) pour retirer.` : "";
  const D = w.depot || { min: 1 }, emk = Math.floor(p.makuta / (USD_UNITS / w.taux));
  $("wallet").innerHTML = rows.map(([a, b]) => `<div class="row"><span>${a}</span><span style="text-align:right">${b}</span></div>`).join("") +
    `<div class="guichet"><h2 style="font-size:16px;margin:0 0 4px">🏧 Guichet · déposer de l'argent</h2>
      <p style="font-size:13px;margin:0 0 8px">Mobile money, carte ou espèces chez un agent, converti en e-makuta (1 $ = ${w.taux} e-makuta, sans frais et sans plafond).</p>
      ${pick("dep")}
      <div class="g-row"><input id="g-dep-usd" type="number" min="${D.min}" step="1" value="5" inputmode="decimal" aria-label="Montant à déposer en dollars"><span>$ → <b id="g-dep-out"></b></span></div>
      <input id="g-dep-tel" class="g-tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="Numéro mobile money (ex. 081 234 5678)" aria-label="Numéro mobile money">
      <p class="g-note" id="g-dep-note"></p>
      <button class="btn" id="b-deposit" type="button">Déposer</button></div>` +
    `<div class="guichet"><h2 style="font-size:16px;margin:0 0 4px">💸 Guichet · retirer mes e-makuta</h2>
      <p style="font-size:13px;margin:0 0 8px">Tes e-makuta sont convertis en dollars et envoyés sur ton mobile money ou ta carte. Frais ${Math.round(w.frais * 100)} %. Chaque fin de mois (les ${w.fenetreJours || 3} derniers jours), tu peux retirer ton dû une fois, à tout âge.</p>
      ${pick("wd")}
      <div class="g-row"><input id="g-wd-mk" type="number" min="${w.taux}" max="${emk}" step="1" value="${emk}" inputmode="numeric" aria-label="Montant à retirer en e-makuta"><span>e-makuta → <b id="g-wd-out"></b></span></div>
      <input id="g-wd-tel" class="g-tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="Numéro qui reçoit l'argent" aria-label="Numéro qui reçoit l'argent">
      <p class="g-note" id="g-wd-note"></p>
      <button class="btn" id="b-withdraw" type="button" ${dis(wdNo, wdNo)}>Retirer</button></div>` +
    `<h2 style="font-size:16px;margin:16px 0 4px">Investir</h2>${inv}` +
    (hist ? `<h2 style="font-size:16px;margin:16px 0 4px">Historique</h2>${hist}` : "");
  document.querySelectorAll("#wallet input").forEach(i => { const k = i.id || i.name + i.value; if (k in keep) { if (i.type === "radio") i.checked = keep[k]; else i.value = keep[k]; } });
  walletLive();
}
// conversion en direct et champ numéro seulement pour le mobile money
function walletLive() {
  const w = state && state.portefeuille; if (!w || !$("g-dep-usd")) return;
  const M = w.moyens || [], m = sens => M.find(x => x.id === (document.querySelector(`input[name=g-${sens}]:checked`) || {}).value) || {};
  const du = Number($("g-dep-usd").value) || 0, wm = Number($("g-wd-mk").value) || 0;
  $("g-dep-out").textContent = `${Math.round(du * w.taux).toLocaleString("fr-FR")} e-makuta`;
  $("g-wd-out").textContent = usd(withdrawUsd(Math.floor(wm * USD_UNITS / w.taux)));
  const note = x => x.type === "carte" ? "Tu passeras par la page sécurisée du partenaire de paiement : aucun numéro de carte n'est demandé ici."
    : x.type === "especes" ? "Tu reçois un code à montrer à un agent agréé, qui encaisse les espèces." : "Seuls les 3 derniers chiffres du numéro sont gardés dans ton historique.";
  [["dep", "g-dep"], ["wd", "g-wd"]].forEach(([s, id]) => { const x = m(s); $(id + "-tel").hidden = x.type !== "mobile"; $(id + "-note").textContent = (w.simulation ? "Simulation : aucun argent réel ne bouge. " : "") + note(x); });
}
function renderWork(v) {
  const p = v.perso, w = v.travail, cur = w.emploiEntreprise || w.metiers.find(j => j.id === w.metier);
  if (p.age < 16) { $("work").innerHTML = `<p style="font-size:14px;margin:0">${p.prenom} pourra travailler à partir de 16 ans. En attendant, ce sont ses parents qui paient la nourriture et les habits.</p>`; return; }
  const disc = new Set(p.talents.map(t => t.id)), wait = w.prochainTravail && w.prochainTravail > Date.now();
  const head = cur ? `<div class="row"><span>Métier</span><span style="text-align:right">${cur.nom}</span></div>
    <button class="btn" id="b-work" type="button" ${dis(wait || p.besoins.energy < w.fatigueTravail, wait ? `Prochaine journée dans ${fmtWait(w.prochainTravail - Date.now())}.` : "Trop fatigué : mange ou repose-toi d'abord.")}>Travailler une journée (+${mk(Math.round(cur.salaire * (disc.has(cur.talent) ? 1.3 : 1)))})</button>
    <p style="font-size:13px;margin:8px 0 0">${wait ? `Prochaine journée dans ${fmtWait(w.prochainTravail - Date.now())}.` : `Une journée fatigue (−${w.fatigueTravail} énergie).`}${disc.has(cur.talent) ? " Ton talent te donne +30 % de salaire." : ""}</p>`
    : `<p style="font-size:14px;margin:0 0 6px">Choisis un métier. Un métier lié à un talent découvert paie 30 % de plus.</p>`;
  const list = w.metiers.map(j => {
    const lock = j.talentRequis && !disc.has(j.talent) ? "talent à découvrir" : j.formation && !v.ecole.diplomes.includes(j.formation) ? `diplôme : ${j.diplome}` : p.age < j.minAge ? `dès ${j.minAge} ans` : "";
    return `<div class="item"><span class="sw">${j.talentRequis ? "⭐" : j.formation ? "🎓" : "🧰"}</span><div class="t">${j.nom}<small>${mk(j.salaire)} par journée${disc.has(j.talent) ? " · +30 % (ton talent)" : ""}${lock ? " · " + lock : ""}</small></div>
      ${j.id === w.metier && !w.emploiEntreprise ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Ton métier</span>` : `<button class="mini fill" data-job="${j.id}" type="button" ${dis(lock, `Pas encore : ${lock}.`)}>Postuler</button>`}</div>`;
  }).join("");
  const co = p.age >= 18 && v.entreprises.offres.length ? `<h2 style="font-size:16px;margin:16px 0 4px">Les entreprises des joueurs embauchent</h2>` + v.entreprises.offres.map(e => `<div class="item"><span class="sw">${e.icone || "🏢"}</span><div class="t">${esc(e.emploi.nom)}<small>${mk(e.emploi.salaire)} par journée · ${esc(e.quartier || "")}${disc.has(e.emploi.talent) ? " · +30 % (ton talent)" : ""}</small></div>
    ${w.emploiEntreprise && w.emploiEntreprise.entreprise === e.id ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Ton emploi</span>` : `<button class="mini fill" data-cjob="${e.id}" type="button">Postuler</button>`}</div>`).join("") : "";
  const du = v.salaireDu > 0 ? `<p class="sim" style="margin:0 0 10px">⏳ L'État te doit ${mk(v.salaireDu)} de salaire : la caisse publique était vide. Tu seras payé dès que les impôts rentrent.</p>` : "";
  $("work").innerHTML = du + head + co + `<h2 style="font-size:16px;margin:16px 0 4px">Offres d'emploi en ville</h2>` + list;
}
let promoFor = null;
const PROMO_SPOTS = [["bandeau", "Bandeau en bas de l'écran"], ["journal", "Journal de Kinshasa"], ["panneau", "Panneaux LED de la ville"], ["tous", "Partout"]];
function promoForm(v, e) {
  const P = v.promo || { prix: {}, maxJours: 7 };
  return `<form class="promo" data-promo-form="${e.id}" novalidate style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">
    <p style="font-size:13px;margin:0 0 6px">Ta publicité est payée en e-makuta à la Régie publicitaire de Kinshasa (société publique). Pas de lien ni de numéro de téléphone.</p>
    <label for="pr-titre">Titre (24 caractères)</label><input id="pr-titre" maxlength="24" value="${esc(e.nom.slice(0, 24))}">
    <label for="pr-texte">Texte (90 caractères)</label><input id="pr-texte" maxlength="90" placeholder="ex. Ouvert tous les jours, prix doux">
    <label for="pr-place">Où ?</label><select id="pr-place">${PROMO_SPOTS.map(([id, l]) => `<option value="${id}">${l} · ${mk(P.prix[id])} / jour</option>`).join("")}</select>
    <label for="pr-jours">Combien de jours ? (1 à ${P.maxJours})</label><input id="pr-jours" type="number" min="1" max="${P.maxJours}" value="2">
    <button class="btn" type="submit">Payer et lancer la promotion</button></form>`;
}
let ambFor = null, ambList = null, recFor = null, recList = null;
function campaignLine(v, e) {
  const c = (v.campagnes ? v.campagnes.liste : []).find(x => x.entrepriseId === e.id && !x.moi);
  return c ? `<p style="font-size:13px;margin:6px 0 0">🌟 Campagne en cours avec <b>${esc(c.ambassadeur)}</b> jusqu'au ${new Date(c.fin).toLocaleDateString("fr-FR")} : les habitants choisissent plus souvent ton entreprise pour leurs dépenses.</p>` : "";
}
function ambForm(v, e) {
  const box = `<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">`;
  if (!ambList) return box + `<p style="font-size:13px;margin:0">Recherche des personnalités disponibles…</p></div>`;
  const max = (v.campagnes || {}).maxJours || 14;
  return box + `<p style="font-size:13px;margin:0 0 6px">Paie un habitant (une star coûte plus cher) pour faire connaître ${esc(e.nom)}. Pendant la campagne, les habitants choisissent ton entreprise deux fois sur trois pour leurs dépenses, et le bandeau l'annonce. 5 % d'impôt sur le cachet de l'ambassadeur.</p>
    <label for="amb-jours">Combien de jours ? (1 à ${max})</label><input id="amb-jours" type="number" min="1" max="${max}" value="3">
    <label for="amb-slogan">Slogan (60 caractères, facultatif)</label><input id="amb-slogan" maxlength="60" placeholder="ex. Le meilleur pondu de la ville">` +
    (ambList.length ? ambList.map(a => `<div class="item"><span class="sw">${a.star ? "⭐" : a.sexe === "F" ? "👩🏾" : "👨🏾"}</span><div class="t">${esc(a.nom)}<small>${a.star ? "Star du jour · " : ""}réputation ${a.rep} · tenue ${a.tenue} · ${mk(a.prix)} par jour</small></div>
      <button class="mini fill" data-hire="${esc(a.id)}" type="button" ${dis(a.tenue < 50, "Sa tenue est trop négligée : cette personne refuse de poser pour une publicité.")}>Engager</button></div>`).join("") : `<p style="font-size:13px">Personne de disponible pour l'instant.</p>`) + `</div>`;
}
function recruitForm(v, e) {
  const box = `<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">`;
  if (!recList) return box + `<p style="font-size:13px;margin:0">Le recruteur fait le tour des terrains…</p></div>`;
  return box + `<p style="font-size:13px;margin:0 0 6px">Chaque joueur décide seul : il signe si tu lui offres au moins 10 % de plus que son salaire actuel. Ses journées de travail (entraînements) sont payées par la caisse du club, et chaque match rapporte la billetterie.</p>` +
    (recList.length ? recList.map(a => `<div class="item"><span class="sw">⚽</span><div class="t">${esc(a.nom)}, ${a.age} ans<small>${a.sport ? `talent sport découvert · niveau ${a.sport}` : "talent sport inconnu"}${a.poste ? " · " + esc(a.poste) : " · sans emploi"}</small></div>
      <button class="mini fill" data-sign="${esc(a.id)}" type="button">Recruter · ${mk(a.demande)}/jour</button></div>`).join("") : `<p style="font-size:13px">Aucun joueur libre pour l'instant.</p>`) + `</div>`;
}
// ---- train de vie : dépenses du quotidien selon les moyens
function renderTrain(v) {
  const T = v.train, box = $("train"), p = v.perso; if (!T) { box.innerHTML = ""; return; }
  if (!T.adulte) { box.innerHTML = `<p style="font-size:14px;margin:0">Avant ${T.minAge} ans, la vie de tous les jours de ${esc(p.prenom)} (repas, habits, école) est payée par ses parents : ${mk(v.entretienParJour)} d'entretien par jour.</p>`; return; }
  const lv = T.niveaux, cur = lv.find(l => l.id === T.prevu), sign = n => (n > 0 ? "+" : "") + n;
  const chips = [{ id: "auto", nom: "Automatique", icone: "🤖", cout: 0 }, ...lv].map(l => `<button class="tal${T.choix === l.id ? " on" : ""}" data-train="${l.id}" type="button">${l.icone} ${l.nom}${l.cout ? " · " + mk(l.cout) + "/j" : ""}</button>`).join("");
  const L = v.logement && v.logement.actuel, bills = L ? Object.entries(BILLS).reduce((a, [, n]) => a + n, 0) : 0;
  const rows = cur ? T.postes.filter(x => cur.postes[x.id]).map(x => `<div class="row"><span>${x.icone} ${x.label}</span><span>${mk(cur.postes[x.id])}</span></div>`).join("") : "";
  const fixed = `<div class="row"><span>🏠 Loyer</span><span>${L ? (L.statut === "proprio" ? "propriétaire : rien à payer" : mk(L.loyer) + " par semaine") : "chez les parents"}</span></div>` +
    `<div class="row"><span>💡🚰 Électricité et eau (Mwinda, Mai ya Kin)</span><span>${L ? mk(bills) + " par jour" : "payées par les parents"}</span></div>`;
  const why = T.choix === "auto" ? `En automatique, ${esc(p.prenom)} choisit le meilleur niveau qu'il peut tenir ${T.reserveJours} jours avec son argent.` : T.prevu !== T.choix ? `⚠️ L'argent manque : ${esc(p.prenom)} vivra au niveau « ${cur ? cur.nom : "rien"} » tant que ça ne va pas mieux.` : "";
  const bar = (label, x, extra) => `<div class="need">${label} · ${x}${extra ? " · " + extra : ""}<div class="bar"><i class="${x < 25 ? "low" : x < 55 ? "mid" : ""}" style="width:${x}%"></i></div></div>`;
  box.innerHTML = `<p style="font-size:14px;margin:0 0 8px">Chaque jour, ${esc(p.prenom)} paie sa vie selon ses moyens. Mieux vivre rend plus beau et en meilleure santé : on vit plus longtemps et on est embauché plus facilement. L'argent dépensé fait vivre les commerces des joueurs (TVA de 16 % pour l'État).</p>
    <div class="talents">${chips}</div>
    ${why ? `<p style="font-size:13px;margin:8px 0 0">${why}</p>` : ""}
    ${cur ? `<h2 style="font-size:16px;margin:14px 0 4px">${cur.icone} Aujourd'hui : ${cur.nom} · ${mk(cur.cout)} par jour</h2><p style="font-size:13px;margin:0 0 6px">${esc(cur.desc)} Faim ${sign(cur.effet.faim)}, santé ${sign(cur.effet.sante)}, bonheur ${sign(cur.effet.bonheur)} chaque jour.</p>${rows}`
      : `<p class="sim" style="margin:12px 0 0">😣 Pas assez d'argent, même pour un repas : la santé et le moral baissent chaque jour. Un petit boulot peut aider.</p>`}
    <h2 style="font-size:16px;margin:14px 0 4px">Prélevé à part</h2>${fixed}
    <div class="grid2" style="margin-top:12px">${bar("Présentation", T.tenue, T.tenueLabel)}${bar("Vitalité", T.vitalite)}</div>
    <div class="row" style="margin-top:8px"><span>❤️ Espérance de vie</span><span><b>${T.esperance} ans</b> (âge actuel : ${Math.floor(p.age)} ans)</span></div>
    <p style="font-size:13px;margin:6px 0 0">Les métiers payés ${mk(250)} ou plus par journée, et ceux qui demandent un diplôme, exigent une présentation d'au moins 40. Après son espérance de vie, la santé baisse chaque jour.</p>
    ${T.dernier ? `<p style="font-size:13px;margin:6px 0 0">Dernière journée (${T.dernier.jour}) : ${mk(T.dernier.depense)} dépensés${T.dernier.niveau ? ", niveau " + (lv.find(l => l.id === T.dernier.niveau) || {}).nom : ""}.</p>` : ""}`;
}
$("train").onclick = e => {
  const b = e.target.closest("button"); if (!b || b.disabled || !b.dataset.train) return;
  act("/api/train", { niveau: b.dataset.train }, () => b.dataset.train === "auto" ? "Ton personnage choisira lui-même son train de vie selon ses moyens." : "Nouveau train de vie : il s'applique dès la prochaine journée de dépenses.");
};
// ---- football : championnat de Kinshasa
let footData = null;
function renderFoot() {
  const F = footData, box = $("foot");
  if (!F) { box.innerHTML = `<p style="font-size:14px;margin:0 0 10px">Chaque jour, les clubs de la ville jouent un match : les clubs des joueurs (achète un « Club de football » dans tes entreprises) contre les clubs du jeu. Les présidents recrutent des joueurs et touchent la billetterie.</p><button class="mini fill" id="b-foot" type="button">⚽ Voir le classement</button>`; return; }
  const tab = F.classement.length ? `<table style="width:100%;font-size:13px;border-collapse:collapse"><tr style="text-align:left"><th>#</th><th>Club</th><th>J</th><th>Diff.</th><th>Pts</th></tr>` +
    F.classement.map((c, i) => `<tr${F.mesClubs.some(m => m.id === c.id) ? ' style="font-weight:700"' : ""}><td>${i + 1}</td><td>${esc(c.nom)}</td><td>${c.j}</td><td>${c.bp - c.bc > 0 ? "+" : ""}${c.bp - c.bc}</td><td>${c.pts}</td></tr>`).join("") + `</table>` : `<p style="font-size:13px">Pas encore de match ce mois-ci : la première journée se joue aujourd'hui.</p>`;
  box.innerHTML = `<p style="font-size:13px;margin:0 0 6px">${esc(F.ligue)} · saison ${esc(F.saison)} (une saison = un mois). Billetterie : ${mk(F.gains.victoire)} la victoire, ${mk(F.gains.nul)} le nul, ${mk(F.gains.defaite)} la défaite.</p>` + tab +
    (F.derniers.length ? `<h2 style="font-size:16px;margin:14px 0 4px">Derniers résultats</h2>` + F.derniers.map(m => `<div class="row"><span>${esc(m.dom)} <b>${m.bd}-${m.be}</b> ${esc(m.ext)}</span><span style="font-size:12px">${m.buteurs ? "⚽ " + esc(m.buteurs) : ""}</span></div>`).join("") : "") +
    (F.mesClubs.length ? `<h2 style="font-size:16px;margin:14px 0 4px">Mes clubs</h2>` + F.mesClubs.map(c => `<div class="row"><span>${esc(c.nom)} · force ${c.force}</span><span>${c.joueurs.length ? c.joueurs.map(j => esc(j.nom)).join(", ") : "aucun joueur : recrute pour jouer"}</span></div>`).join("") : "") +
    `<div class="two-btn" style="margin-top:10px"><button class="mini" id="b-foot" type="button">↻ Actualiser</button>${F.demo ? `<button class="mini" id="b-foot-next" type="button">⏩ Journée suivante (démo)</button>` : ""}</div>`;
}
$("foot").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  try {
    if (b.id === "b-foot") { b.disabled = true; footData = await call("/api/foot", {}); renderFoot(); }
    if (b.id === "b-foot-next") { b.disabled = true; footData = await call("/api/demo/foot", {}); renderFoot(); if (window.TWO_LIFE_BANDEAU) window.TWO_LIFE_BANDEAU.reload(); }
  } catch (err) { toast(err.message); b.disabled = false; }
});
function renderCompanies(v) {
  const p = v.perso, E = v.entreprises;
  if (p.age < 18) { $("companies").innerHTML = `<p style="font-size:14px;margin:0">${p.prenom} pourra ouvrir ou racheter une entreprise à 18 ans.</p>`; return; }
  const mine = E.miennes.length ? E.miennes.map(e => {
    const t = E.types.find(x => x.id === e.type) || {};
    return `<div class="co">
      <div class="item" style="border:0"><span class="sw">${e.icone || "🏢"}</span><div class="t">${esc(e.nom)}<small>${e.typeNom} · ${esc(e.quartier || "")} · ${e.employes || 0}/${t.places} employé(s) · gagne ${mk(t.recette)} par jour</small></div></div>
      <div class="row"><span>Caisse</span><span style="text-align:right"><b>${mk(e.caisse)}</b>${e.plein ? ` <small style="color:var(--warn)">pleine : encaisse vite</small>` : ""}</span></div>
      <div class="two-btn"><button class="mini fill" data-cash="${e.id}" type="button" ${dis(e.caisse < 1, "La caisse est vide pour l'instant : reviens plus tard.")}>Encaisser</button>
      <button class="mini" data-promo="${e.id}" type="button">📣 Promouvoir</button>
      <button class="mini" data-amb="${e.id}" type="button">🌟 Ambassadeur</button>
      ${e.type === "club" ? `<button class="mini" data-recruit="${e.id}" type="button">⚽ Recruter</button>` : ""}
      ${e.en_vente ? `<button class="mini" data-unsell="${e.id}" type="button">Retirer de la vente (${mk(e.en_vente)})</button>` : `<button class="mini" data-sellco="${e.id}" data-price="${Math.round(t.prix * 1.2)}" type="button">Mettre en vente (${mk(Math.round(t.prix * 1.2))})</button>`}</div>
      ${campaignLine(v, e)}
      ${promoFor === e.id ? promoForm(v, e) : ""}
      ${ambFor === e.id ? ambForm(v, e) : ""}
      ${recFor === e.id ? recruitForm(v, e) : ""}
    </div>`; }).join("") + `<p style="font-size:13px;margin:8px 0 0">La caisse se remplit seule pendant ${E.plafondJours} jours, puis elle s'arrête : passe encaisser régulièrement. Chaque journée d'un employé rapporte son salaire plus 60 %.</p>`
    : `<p style="font-size:14px;margin:0 0 6px">Tu n'as pas encore d'entreprise. Ouvre un commerce ou rachète celui d'un autre joueur.</p>`;
  const market = E.aVendre.length ? E.aVendre.map(e => `<div class="item"><span class="sw">${e.icone || "🏢"}</span><div class="t">${esc(e.nom)} · ${mk(e.en_vente)}<small>${e.typeNom} · ${esc(e.quartier || "")} · vendu par ${esc(e.proprietaire || "un joueur")}</small></div>
    <button class="mini fill" data-buyco="${e.id}" type="button" ${dis(p.makuta < e.en_vente, `Il te manque ${mk(e.en_vente - p.makuta)}.`)}>Acheter</button></div>`).join("") : `<p style="font-size:14px;margin:0">Aucune entreprise à vendre pour l'instant.</p>`;
  const list = E.types.map(t => `<div class="item"><span class="sw">${t.icone}</span><div class="t">${t.nom} · ${mk(t.prix)}<small>${t.desc} Gagne ${mk(t.recette)} par jour.</small></div>
    <button class="mini fill" data-open="${t.id}" type="button" ${dis(p.makuta < t.prix, `Il te manque ${mk(t.prix - p.makuta)} pour ouvrir cette entreprise.`)}>Ouvrir</button></div>`).join("");
  const amb = (v.campagnes ? v.campagnes.liste : []).filter(x => x.moi).map(x => `<p class="sim" style="margin:0 0 10px">🌟 ${esc(p.prenom)} est ${p.sexe === "F" ? "l'ambassadrice" : "l'ambassadeur"} de ${esc(x.entreprise)} jusqu'au ${new Date(x.fin).toLocaleDateString("fr-FR")}${x.slogan ? ` · « ${esc(x.slogan)} »` : ""}.</p>`).join("");
  $("companies").innerHTML = amb + mine +
    `<h2 style="font-size:16px;margin:16px 0 4px">À vendre par d'autres joueurs</h2>${market}` +
    `<h2 style="font-size:16px;margin:16px 0 4px">Ouvrir un commerce</h2><label for="co-name" style="margin-top:4px">Nom (facultatif)</label><input id="co-name" maxlength="40" placeholder="ex. Chez ${esc(p.prenom)}">${list}`;
}
$("companies").addEventListener("submit", e => {
  const f = e.target.closest("[data-promo-form]"); if (!f) return; e.preventDefault();
  const body = { entreprise: f.dataset.promoForm, titre: $("pr-titre").value, texte: $("pr-texte").value, emplacement: $("pr-place").value, jours: Number($("pr-jours").value) };
  act("/api/promouvoir", body, () => { promoFor = null; if (window.TWO_LIFE_BANDEAU) window.TWO_LIFE_BANDEAU.reload(); return "Promotion lancée ! Elle passe dès maintenant pour tous les habitants."; });
});
$("companies").onclick = async e => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  if (b.dataset.amb) { ambFor = ambFor === b.dataset.amb ? null : b.dataset.amb; ambList = null; renderCompanies(state); if (ambFor) { try { ambList = (await call("/api/ambassadeurs", {})).ambassadeurs || []; } catch (err) { toast(err.message); ambList = []; } renderCompanies(state); } return; }
  if (b.dataset.recruit) { recFor = recFor === b.dataset.recruit ? null : b.dataset.recruit; recList = null; renderCompanies(state); if (recFor) { try { recList = (await call("/api/club/marche", {})).joueurs || []; } catch (err) { toast(err.message); recList = []; } renderCompanies(state); } return; }
  if (b.dataset.hire) { b.disabled = true; const x = (ambList || []).find(a => a.id === b.dataset.hire);
    return act("/api/campagne", { entreprise: ambFor, ambassadeur: x.id, prix: x.prix, jours: Number(($("amb-jours") || {}).value || 3), slogan: ($("amb-slogan") || {}).value || "" }, v2 => { ambFor = null; if (window.TWO_LIFE_BANDEAU) window.TWO_LIFE_BANDEAU.reload(); return `${v2.ambassadeur} fait maintenant la publicité de ton entreprise (${mk(v2.cout)}). Les clients vont venir plus souvent.`; }); }
  if (b.dataset.sign) { b.disabled = true; const x = (recList || []).find(a => a.id === b.dataset.sign);
    return act("/api/club/recruter", { entreprise: recFor, joueur: x.id, salaire: x.demande }, v2 => { recList = recList.filter(a => a.id !== x.id); footData = null; return `${v2.recrue} signe dans ton club !`; }); }
  if (b.dataset.promo) { promoFor = promoFor === b.dataset.promo ? null : b.dataset.promo; return renderCompanies(state); }
  if (b.dataset.open) { b.disabled = true; return act("/api/entreprise/ouvrir", { type: b.dataset.open, nom: ($("co-name") || {}).value }, v => `Ton entreprise « ${v.ouverte} » est ouverte !`); }
  if (b.dataset.cash) return act("/api/entreprise/encaisser", { entreprise: b.dataset.cash }, v => `Tu as encaissé ${mk(v.encaisse)}.`);
  if (b.dataset.sellco) return act("/api/entreprise/vendre", { entreprise: b.dataset.sellco, prix: Number(b.dataset.price) }, () => "Ton entreprise est en vente. Les autres joueurs la voient au marché.");
  if (b.dataset.unsell) return act("/api/entreprise/vendre", { entreprise: b.dataset.unsell, prix: null }, () => "Ton entreprise n'est plus en vente.");
  if (b.dataset.buyco) { b.disabled = true; return act("/api/entreprise/acheter", { entreprise: b.dataset.buyco }, v => `Bravo, « ${v.achetee} » est à toi !`); }
};
let stateTab = "institutions";
const STATE_TABS = [["institutions", "🏛️ Institutions"], ["banque", "🏦 Banques"], ["assurance", "🩺 Santé"], ["telephone", "📱 Téléphone"], ["elections", "🗳️ Élections"], ["police", "🚓 Police"], ["societes", "🏭 Sociétés publiques"], ["impots", "🧾 Budget et impôts"]];
const dt = t => new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
function renderState(v) {
  const p = v.perso, S = v.etat;
  $("state-tabs").innerHTML = STATE_TABS.map(([id, l]) => `<button class="tab ${id === stateTab ? "on" : ""}" data-st="${id}" type="button">${l}</button>`).join("");
  let h = "";
  if (stateTab === "institutions") {
    h = S.institutions.map(i => `<div class="item"><span class="sw">${i.icone}</span><div class="t">${i.nom}<small>${i.role}</small></div></div>`).join("") +
`<h2 style="font-size:16px;margin:16px 0 4px">L'État recrute</h2>` + S.metiersPublics.map(j => `<div class="item"><span class="sw">🎖️</span><div class="t">${j.nom}<small>${mk(j.salaire)} par journée, payé par ${j.societe ? "sa société publique (ou le Trésor)" : "le Trésor"}${j.diplome ? " · diplôme : " + j.diplome : ""} · dès ${j.minAge} ans</small></div>
        ${v.travail.metier === j.id ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Ton métier</span>` : `<button class="mini fill" data-job="${j.id}" type="button" ${dis(p.age < j.minAge || (j.formation && !v.ecole.diplomes.includes(j.formation)), p.age < j.minAge ? `Ce poste est ouvert dès ${j.minAge} ans.` : `Il faut d'abord le diplôme : ${j.diplome}.`)}>Postuler</button>`}</div>`).join("");
  } else if (stateTab === "elections") {
    const E = v.elections || {}, nomPoste = id => (S.postes.find(x => x.id === id) || {}).nom || id;
    h = (E.prochaine ? `<div class="row"><span>Élection n° ${E.cycle}</span><span>${dt(E.prochaine)}</span></div>
        <p style="font-size:13px;margin:6px 0">${E.voteOuvert ? "<b>Le vote est ouvert.</b> Choisis un candidat pour chaque poste. Les voix seront comptées à la date de l'élection." : `Le vote ouvrira le ${dt(E.ouvertureVote)} et durera 7 jours. Ensuite, une élection tous les 6 mois.`}${p.age < 18 ? " Il faut avoir 18 ans pour voter." : ""}</p>`
      : `<p style="font-size:13px;margin:0 0 6px">La première élection aura lieu 6 mois après le démarrage du jeu, puis tous les 6 mois. Tu peux déjà te porter candidat.</p>`) +
      `<h2 style="font-size:16px;margin:12px 0 4px">Se présenter</h2>` + S.postes.map(x => `<div class="item"><span class="sw">🗳️</span><div class="t">${x.nom}<small>${x.places} ${x.places > 1 ? "sièges" : "siège"} · dès ${x.minAge} ans · ${x.candidats} candidat(s)</small></div>
        ${S.candidature === x.id ? `<button class="mini" data-cand="" type="button">Retirer</button>` : `<button class="mini fill" data-cand="${x.id}" type="button" ${dis(p.age < x.minAge, `Candidature possible dès ${x.minAge} ans.`)}>Candidater</button>`}</div>`).join("") +
      `<h2 style="font-size:16px;margin:16px 0 4px">Candidats</h2>` +
      ((E.candidats || []).length ? E.candidats.map(c => { const mine = E.mesVotes && E.mesVotes[c.poste];
        return `<div class="item"><span class="sw">🗳️</span><div class="t">${esc(c.nom)}<small>${nomPoste(c.poste)} · ${esc(c.quartier || "")} · ${c.voix} voix</small></div>
        ${mine === c.id ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Ton vote</span>` : `<button class="mini fill" data-vote="${c.id}" data-poste="${c.poste}" type="button" ${dis(!E.voteOuvert || mine || p.age < 18, !E.voteOuvert ? "Le vote n'est pas encore ouvert." : mine ? "Tu as déjà voté pour ce poste." : "Il faut avoir 18 ans pour voter.")}>Voter</button>`}</div>`; }).join("")
        : `<p style="font-size:13px;margin:0">Aucun candidat pour l'instant.</p>`) +
      ((E.elus || []).length ? `<h2 style="font-size:16px;margin:16px 0 4px">Élus en fonction</h2>` + E.elus.map(x => `<div class="item"><span class="sw">🎖️</span><div class="t">${esc(x.nom)}<small>${nomPoste(x.poste)} · élu avec ${x.voix} voix · payé par le Trésor</small></div></div>`).join("") : "");
  } else if (stateTab === "police") {
    const P = v.police;
    h = (P.prisonJusqu ? `<div class="co" style="border-color:var(--bad, #d64545)"><p style="margin:0 0 8px;font-size:14px">🔒 <b>Tu es en prison</b> jusqu'au ${dt(P.prisonJusqu)}. Pas de travail, d'école, de voyage ni d'affaires pendant ce temps.</p>
        <button class="btn" id="b-bail" type="button" ${dis(p.makuta < P.caution, `Il te manque ${mk(P.caution - p.makuta)} pour la caution.`)}>Payer la caution (${mk(P.caution)})</button></div>` : "") +
      `<p style="font-size:13px;margin:0 0 6px">La police fait respecter la loi. Si elle t'attrape, tu paies une amende au Trésor. Si tu ne peux pas payer, ou après ${P.recidive.fois} infractions en ${P.recidive.jours} jours, c'est la prison pour ${P.prisonHeures} heures (sortie plus tôt avec une caution de ${mk(P.caution)}).${P.policiers ? ` ${P.policiers} joueur(s) policier(s) patrouillent : le risque augmente.` : ""}</p>
      <h2 style="font-size:16px;margin:12px 0 4px">Tentations</h2>` +
      P.crimes.map(c => `<div class="item"><span class="sw">⚠️</span><div class="t">${c.nom}<small>${c.desc} Risque actuel : ${Math.round(c.chance * 100)} %. Amende : ${mk(c.amende)}.</small></div><button class="mini" data-crime="${c.id}" type="button" ${dis(P.prisonJusqu || p.age < 12, P.prisonJusqu ? "Impossible depuis la cellule." : "Pas avant 12 ans.")}>Tenter</button></div>`).join("") +
      `<h2 style="font-size:16px;margin:16px 0 4px">Mon casier judiciaire</h2>` +
      (P.casier.length ? P.casier.map(x => `<div class="row"><span>${new Date(x.le).toLocaleDateString("fr-FR")} · ${esc(x.nom)}</span><span>${mk(x.amende)}${x.prison_heures ? " + prison" : ""}</span></div>`).join("") : `<p style="font-size:13px;margin:0">Casier vierge. Continue comme ça !</p>`);
  } else if (stateTab === "banque") {
    h = `<div class="row"><span>Sur toi</span><span>${mk(p.makuta)}</span></div>` + S.banques.map(b => `<div class="co"><div class="item" style="border:0"><span class="sw">${b.icone}</span><div class="t">${b.nom} · <b>${mk(b.solde)}</b><small>${b.desc}</small></div></div>
      <div class="two-btn">${[[20000, `Déposer ${mk(20000)}`], [b.plafond ? Math.min(p.makuta, b.plafond - b.solde) : p.makuta, "Tout déposer"]].map(([m, l]) => `<button class="mini fill" data-dep="${b.id}" data-m="${m}" type="button" ${dis(m < 20 || p.makuta < m || p.age < 16, p.age < 16 ? "Un compte en banque est possible dès 16 ans." : m < 20 ? "Rien à déposer pour l'instant." : "Pas assez d'argent en poche.")}>${l}</button>`).join("")}
      <button class="mini" data-wd="${b.id}" data-m="${b.solde}" type="button" ${dis(b.solde < 20, "Ce compte est vide.")}>Tout retirer</button></div></div>`).join("") +
      `<p style="font-size:13px;margin:6px 0 0">La Banque centrale émet l'e-makuta (1 $ = ${S.tauxUsd} e-makuta). Masse monétaire en circulation : ${mk(S.masse)}.</p>`;
  } else if (stateTab === "assurance") {
    h = `<div class="row"><span>Santé</span><span>${p.besoins.health} / 100</span></div><div class="row"><span>Assurance</span><span>${S.assurance ? `${S.assureurs.find(a => a.id === S.assurance.id).nom} jusqu'au ${new Date(S.assurance.jusqua).toLocaleDateString("fr-FR")}` : "aucune"}</span></div>
      ${v.blessure ? `<p class="err" style="margin:8px 0">🚑 Blessure d'un accident de la route (${v.blessure.vitesse} km/h) : pas de travail tant que tu n'es pas soigné·e.</p>` : ""}
      <button class="btn" id="b-care" type="button" ${dis(p.besoins.health >= 95 && !v.blessure, "Tu es déjà en bonne santé.")}>Se soigner au centre de santé (${mk(S.soins.prix)}${S.soins.assure ? ", assuré" : ""})</button>
      <h2 style="font-size:16px;margin:16px 0 4px">Assurances santé</h2>` + S.assureurs.map(a => `<div class="item"><span class="sw">${a.icone}</span><div class="t">${a.nom} · ${mk(a.prime)} / semaine<small>${a.desc}</small></div><button class="mini fill" data-ins="${a.id}" type="button" ${dis(p.makuta < a.prime, `Il te manque ${mk(a.prime - p.makuta)}.`)}>${S.assurance && S.assurance.id === a.id ? "Prolonger" : "Souscrire"}</button></div>`).join("");
  } else if (stateTab === "telephone") {
    const hasPhone = (v.inventaire || []).some(x => (v.boutique.find(b => b.id === x.objet) || {}).type === "telephone");
    h = `<div class="row"><span>Crédit</span><span>${mk(S.credit)}${S.operateur ? " · " + S.operateurs.find(o => o.id === S.operateur).nom : ""}</span></div>
      <button class="btn" id="b-call" type="button" ${dis(!hasPhone || S.credit < S.appel.prix, !hasPhone ? "Achète d'abord un téléphone au magasin." : "Crédit insuffisant : recharge chez un opérateur.")}>Appeler ma famille (${mk(S.appel.prix)}, +${S.appel.bonheur} bonheur)</button>
      ${hasPhone ? "" : `<p style="font-size:13px;margin:8px 0 0">Achète d'abord un téléphone au magasin.</p>`}
      <h2 style="font-size:16px;margin:16px 0 4px">Recharger chez un opérateur</h2>` + S.operateurs.map(o => `<div class="item"><span class="sw" style="background:${o.couleur}">📶</span><div class="t">${o.nom}</div><div class="two-btn" style="margin:0">${S.recharges.map(m => `<button class="mini fill" data-rech="${o.id}" data-m="${m}" type="button" ${dis(p.makuta < m, "Pas assez d'argent en poche.")}>${mk(m)}</button>`).join("")}</div></div>`).join("");
  } else if (stateTab === "societes") {
    const F = S.finances || { societes: [] };
    h = `<p style="font-size:13px;margin:0 0 8px">Les entreprises de l'État encaissent leurs recettes, paient leurs agents et versent le surplus au Trésor. Si leur caisse est vide, le Trésor paie ; s'il est vide aussi, le salaire est dû (arriéré).</p>` +
      F.societes.map(c => `<div class="co"><div class="item" style="border:0"><span class="sw">${c.icone}</span><div class="t">${esc(c.nom)}<small>${esc(c.tutelle)} · ${esc(c.recette)}</small><small>Caisse : <b>${mk(c.solde)}</b> · ${c.agents} agent(s)</small></div></div>` +
        c.metiers.map(j => `<div class="item"><span class="sw">🎖️</span><div class="t">${esc(j.nom)}<small>${mk(j.salaire)} par journée · dès ${j.minAge} ans</small></div>${v.travail.metier === j.id ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Ton métier</span>` : `<button class="mini fill" data-job="${j.id}" type="button" ${dis(p.age < j.minAge, `Ce poste est ouvert dès ${j.minAge} ans.`)}>Postuler</button>`}</div>`).join("") + `</div>`).join("");
  } else {
    const F = S.finances || {};
    h = `<div class="row"><span>Trésor public</span><span>${mk(F.tresor ?? S.tresor)}</span></div>
      ${F.tresor != null ? `<div class="row"><span>Impôts et taxes encaissés (24 h)</span><span>${mk(F.impotsJour)}</span></div><div class="row"><span>Salaires publics payés (24 h)</span><span>${mk(F.salairesJour)}</span></div><div class="row"><span>Agents qui attendent leur salaire</span><span>${F.arrieres}</span></div>` : ""}
      <div class="row"><span>TVA (DGI), comprise dans les prix</span><span>16 %</span></div>
      <div class="row"><span>Impôt sur le salaire (DGI)</span><span>${S.impots.salaire * 100} %</span></div>
      <div class="row"><span>Impôt sur les recettes des entreprises (DGI)</span><span>${S.impots.recettes * 100} %</span></div>
      <div class="row"><span>Droits de douane sur les téléphones (DGDA)</span><span>${S.impots.douane * 100} %</span></div>
      <p style="font-size:13px;margin:8px 0 0">Tous les impôts (TVA sur les achats, IPR sur les salaires, recettes des entreprises, douane, amendes, successions) vont au Trésor. Le Trésor paie les policiers, les agents de l'État et les élus. Les sociétés publiques vivent de leurs factures et versent leur surplus au Trésor.${F.demo ? " Démo : chiffres simulés." : ""}</p>`;
  }
  $("state").innerHTML = h;
}
$("state-tabs").onclick = e => { const b = e.target.closest("[data-st]"); if (!b) return; stateTab = b.dataset.st; renderState(state); };
$("state").onclick = e => {
  const b = e.target.closest("button"); if (!b || b.disabled) return; const d = b.dataset;
  if (d.cand !== undefined) return act("/api/candidature", { poste: d.cand || null }, () => d.cand ? "Candidature enregistrée. Bonne campagne !" : "Candidature retirée.");
  if (d.job) return act("/api/postuler", { metier: d.job }, v => `Embauché : ${v.travail.metiers.find(j => j.id === v.travail.metier).nom}.`);
  if (d.dep) return act("/api/banque/deposer", { banque: d.dep, montant: Number(d.m) }, () => `Dépôt de ${mk(Number(d.m))} effectué.`);
  if (d.wd) return act("/api/banque/retirer", { banque: d.wd, montant: Number(d.m) }, () => `Retrait de ${mk(Number(d.m))} effectué.`);
  if (d.ins) return act("/api/assurance", { assureur: d.ins }, v => `Assuré jusqu'au ${new Date(v.etat.assurance.jusqua).toLocaleDateString("fr-FR")}.`);
  if (d.rech) return act("/api/telephone/recharger", { operateur: d.rech, montant: Number(d.m) }, () => `Crédit rechargé : +${mk(Number(d.m))}.`);
  if (d.vote) return act("/api/voter", { poste: d.poste, candidat: d.vote }, () => "A voté ! Ton vote est enregistré.");
  if (d.crime) return act("/api/crime", { crime: d.crime }, v => v.crime.attrape ? `La police t'a attrapé : amende de ${mk(v.crime.amende)}${v.crime.prison ? `, et ${v.crime.heures} heures de prison` : ""}.` : `Personne n'a rien vu : +${mk(v.crime.gain)}. Attention, la prochaine fois...`);
  if (b.id === "b-bail") return act("/api/caution", {}, () => "Caution payée : tu es libre.");
  if (b.id === "b-care") return act("/api/soigner", {}, v => `Soigné pour ${mk(v.soins.prix)}${v.soins.assure ? " grâce à ton assurance" : ""}. Santé +${CARE.sante}.`);
  if (b.id === "b-call") return act("/api/telephone/appeler", {}, () => "Ta famille est contente de t'entendre !");
};
function renderTravel(v) {
  const p = v.perso, V = v.voyage;
  if (p.age < 12) { $("travel").innerHTML = `<p style="font-size:14px;margin:0">${p.prenom} se déplace avec ses parents. Il pourra prendre le taxi seul à 12 ans.</p>`; return; }
  $("travel").innerHTML = `<p style="font-size:14px;margin:0 0 8px">Tu es à <b>${esc(p.quartier)}</b>. Une course en taxi coûte ${mk(V.prix)} et un peu d'énergie. L'argent va au taxi d'un joueur.</p>
    <div class="chips">${V.quartiers.filter(q => q !== p.quartier).map(q => `<button class="chip" data-go="${q}" type="button">${q}</button>`).join("")}</div>
    ${V.communes ? `<details style="margin-top:10px"><summary style="cursor:pointer;font-size:14px">Les communes de Kinshasa : bons et mauvais côtés</summary>${V.communes.map(c => `<div class="item" style="display:block"><b style="font-size:14px">${esc(c.nom)}</b> <small style="color:var(--muted)">· ${esc(c.zone)}</small>${quartierHtml(c)}</div>`).join("")}</details>` : ""}
    <h2 style="font-size:16px;margin:14px 0 6px">Autres villes</h2><div class="chips">${V.villes.map(c => `<button class="chip" type="button" aria-disabled="true" data-why="${esc(c)} ouvrira plus tard, après Kinshasa.">${c} · bientôt</button>`).join("")}</div>`;
}
$("travel").onclick = e => { const b = e.target.closest("[data-go]"); if (b) act("/api/voyager", { quartier: b.dataset.go }, v => `Bienvenue à ${v.arrive} !`); };

// ---------------------------------------------------------------- que faire maintenant ?
function tips(v) {
  const p = v.perso, n = p.besoins, out = [], adult = p.age >= 18, w = v.travail, E = v.elections || {};
  if (v.consignes && !v.consignes.liste.length && p.age >= 6) out.push(["📋", `Donne tes consignes du jour : ${p.prenom} les suivra même quand tu n'es pas là.`, "Donner mes consignes", "orders"]);
  if (v.police && v.police.prisonJusqu) out.push(["🔒", `Tu es en prison jusqu'au ${dt(v.police.prisonJusqu)}. Paie la caution pour sortir plus tôt.`, "Voir", "state:police"]);
  if (E.voteOuvert && adult && (E.candidats || []).some(c => !(E.mesVotes || {})[c.poste])) out.push(["🗳️", "Le vote est ouvert : choisis tes élus avant la date de l'élection.", "Voter", "state:elections"]);
  const hasJob = !!(w.emploiEntreprise || w.metier), Ent = v.entreprises;
  if (n.hunger < 40) out.push(["🍲", "Tu as faim : va manger au maquis pour reprendre des forces.", "Manger au maquis", "eat"]);
  if (n.health < 50) out.push(["🩺", "Ta santé baisse : va te soigner au centre de santé. Une assurance réduit le prix.", "Se soigner", "state:assurance"]);
  if (n.energy < 30) out.push(["😴", "Tu es fatigué : mange ou repose-toi avant de travailler.", "Voir mes besoins", "needs"]);
  const full = (Ent.miennes || []).filter(e => e.caisse > 0).sort((a, b) => b.caisse - a.caisse)[0];
  if (full) out.push(["💰", `La caisse de ${full.nom} contient ${mk(full.caisse)}. Va encaisser tes recettes.`, "Encaisser", "cash:" + full.id]);
  if (p.age >= 16 && !hasJob) out.push(["💼", "Tu n'as pas de travail : postule à un métier ou dans l'entreprise d'un joueur.", "Chercher du travail", "work"]);
  const jail = !!(v.police && v.police.prisonJusqu);
  if (hasJob && !jail && (!w.prochainTravail || w.prochainTravail <= Date.now()) && n.energy >= w.fatigueTravail) out.push(["🛠️", "Ta journée de travail t'attend : va gagner ton salaire.", "Aller travailler", "dowork"]);
  if (p.age >= 6 && !v.ecole.enCours && p.age < 30) out.push(["🎓", "Étudie pour obtenir un diplôme et un meilleur métier.", "Aller à l'école", "school"]);
  if (adult && !(Ent.miennes || []).length && p.makuta >= 16000) out.push(["🏪", "Tu as de quoi ouvrir un commerce : il gagnera de l'argent chaque jour.", "Ouvrir une entreprise", "companies"]);
  if (adult && (Ent.aVendre || []).some(e => e.en_vente <= p.makuta)) out.push(["🤝", "Des joueurs vendent leur entreprise : tu peux en racheter une.", "Voir le marché", "companies"]);
  if (p.makuta > 20000 && p.age >= 16 && !v.etat.banques.some(b => b.solde > 0)) out.push(["🏦", "Tu as beaucoup d'argent sur toi : place-le en banque, il rapportera des intérêts.", "Aller à la banque", "state:banque"]);
  if (adult && p.age >= 25 && !v.etat.candidature) out.push(["🗳️", "Tu peux être candidat aux élections : député, sénateur ou Président.", "Se présenter", "state:elections"]);
  if ((v.inventaire || []).length > 3) out.push(["🏷️", "Tu as beaucoup d'affaires : revends ce qui ne te sert plus.", "Vendre mes affaires", "inv"]);
  if (p.age >= 12) out.push(["🚕", "Découvre un autre quartier de Kinshasa en taxi.", "Voyager", "travel"]);
  out.push(["🛍️", "Habille-toi et équipe-toi au magasin.", "Aller au magasin", "shop"]);
  return out.slice(0, 3);
}
const SECTIONS = { moves: "moves", orders: "orders", state: "state", needs: "needs", work: "work", school: "school", companies: "companies", inv: "inv", travel: "travel", shop: "shop-tabs", wallet: "wallet", kids: "kids-card" };
function goTo(id) { const el = $(id); if (el) (el.closest(".card") || el).scrollIntoView({ behavior: "smooth", block: "start" }); }
// ---- pendant ton absence : ce que le personnage a fait depuis la dernière visite
function renderNight(v) {
  const R = v.resume, box = $("nuit-card");
  if (!R || !R.nouveau) { box.hidden = true; return; }
  box.hidden = false;
  const p = v.perso, depuis = new Date(R.depuis).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" });
  $("nuit").innerHTML = `<p style="font-size:14px;margin:0 0 8px">${R.premiereVisite ? `Les dernières heures de ${esc(p.prenom)} :` : `Depuis ta dernière visite (${depuis}) :`}</p>` +
    (R.nb ? `<div class="row"><span>👣 Actions</span><b>${R.nb}</b></div>` : "") +
    (R.gain ? `<div class="row"><span>💰 Argent</span><b style="color:${R.gain > 0 ? "var(--ok)" : "var(--bad, #e2574c)"}">${R.gain > 0 ? "+" : "−"}${fmtMakuta(Math.abs(R.gain))}</b></div>` : "") +
    R.liste.map(m => `<div class="row"><span>${m.icone} ${esc(m.texte)}</span><span>${new Date(m.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span></div>`).join("") +
    (R.alertes.length ? `<div class="g-note" style="margin-top:8px">${R.alertes.map(esc).join("<br>")}</div>` : "") +
    `<div class="chips" style="margin-top:10px"><button class="mini fill" id="b-nuit-vu" type="button">✅ C'est noté</button><button class="mini" data-to="orders" type="button">📋 Donner ses consignes</button></div>`;
}
$("nuit-card").addEventListener("click", e => {
  if (e.target.id === "b-nuit-vu") { e.target.disabled = true; act("/api/resume/vu", {}, () => "À demain matin ☀️"); }
  const t = e.target.closest("[data-to]"); if (t) goTo(t.dataset.to);
});
// ---- vie sociale : le journal de Kinshasa
let journalTab = "commune", journalData = null;
// ---- objectifs de vie : 3 en cours au plus, récompense en réputation
function renderGoals(v) {
  const G = v.objectifs; if (!G) { $("goals").innerHTML = ""; return; }
  const enCours = G.mes.filter(m => !m.atteint), faits = G.mes.filter(m => m.atteint);
  $("goals").innerHTML = `<p style="font-size:14px;margin:0 0 8px">Donne un sens à la vie de ${esc(v.perso.prenom)} : choisis jusqu'à ${G.max} objectifs. Chaque objectif atteint rapporte +${G.recompense} de réputation et entre dans l'album de sa vie.</p>` +
    (enCours.length ? enCours.map(m => `<div class="item"><span class="sw">${m.icone}</span><div class="t">${esc(m.nom)}<div class="bar"><i class="${m.progres >= 60 ? "" : "mid"}" style="width:${m.progres}%"></i></div><small>${m.progres} %</small></div><button class="mini" data-goal-off="${m.id}" type="button">Abandonner</button></div>`).join("") : `<p style="font-size:13px;margin:0 0 6px">Aucun objectif en cours.</p>`) +
    (faits.length ? `<h2 style="font-size:16px;margin:14px 0 4px">Objectifs atteints 🏆</h2>` + faits.map(m => `<div class="row"><span>${m.icone} ${esc(m.nom)}</span><span>${new Date(m.atteint).toLocaleDateString("fr-FR")}</span></div>`).join("") : "") +
    `<h2 style="font-size:16px;margin:14px 0 4px">Choisir un objectif</h2><div class="talents">` +
    G.catalogue.filter(g => !g.choisi).map(g => `<button class="tal" data-goal="${g.id}" type="button" ${dis(enCours.length >= G.max, `${G.max} objectifs en cours au plus : abandonne-en un d'abord.`)}>${g.icone} ${esc(g.nom)}</button>`).join("") + `</div>`;
}
$("goals").onclick = e => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  if (b.dataset.goal) return act("/api/objectif", { id: b.dataset.goal }, () => "Objectif choisi. Ton personnage s'en souviendra chaque matin.");
  if (b.dataset.goalOff) return act("/api/objectif", { id: b.dataset.goalOff, action: "abandonner" }, () => "Objectif abandonné.");
};
// ---- regarder : mon personnage ou une star choisie par le serveur
let starsData = null, starOpen = null;
function renderStars() {
  const box = $("stars");
  if (!starsData) { box.innerHTML = `<p style="font-size:14px;margin:0 0 10px">Tu regardes ${state ? esc(state.perso.prenom) : "ton personnage"}. Chaque jour, le serveur choisit aussi des stars de la ville (sport, musique, affaires, politique, cuisine) : tu peux suivre leur vie.</p><button class="mini fill" id="b-stars" type="button">⭐ Voir les stars du jour</button>`; return; }
  const S = starsData.find(x => x.id === starOpen);
  if (S) {
    box.innerHTML = `<div class="paper-head"><b>${S.icone} ${esc(S.prenom)} ${esc(S.nom)}</b><span>${esc(S.titre)} · ${S.age ? S.age + " ans · " : ""}${esc(S.quartier || "Kinshasa")}${S.joueur ? " · joueur" : ""}</span></div>` +
      S.actualites.map(a => `<div class="news"><span class="ic">${a.icone}</span><div><p style="margin:0">${esc(a.texte)}</p></div></div>`).join("") +
      `<div class="two-btn" style="margin-top:10px"><button class="mini" id="b-star-back" type="button">← Toutes les stars</button><button class="mini fill" id="b-star-me" type="button">👤 Revenir à mon personnage</button></div>`;
    return;
  }
  box.innerHTML = `<p style="font-size:13px;margin:0 0 6px">Les stars du jour, choisies par le serveur. Touche « Regarder » pour suivre leur actualité.</p>` + starsData.map(x => `<div class="item"><span class="sw">${x.icone}</span><div class="t">${esc(x.prenom)} ${esc(x.nom)}<small>${esc(x.domaineNom)} · ${esc(x.titre)}${x.quartier ? " · " + esc(x.quartier) : ""}</small></div><button class="mini fill" data-star="${esc(x.id)}" type="button">Regarder</button></div>`).join("");
}
$("stars").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  if (b.id === "b-stars") { b.disabled = true; try { starsData = (await call("/api/stars", {})).stars || []; renderStars(); } catch (err) { toast(err.message); b.disabled = false; } }
  if (b.dataset.star) { starOpen = b.dataset.star; renderStars(); goTo("stars"); }
  if (b.id === "b-star-back") { starOpen = null; renderStars(); }
  if (b.id === "b-star-me") { starOpen = null; renderStars(); window.scrollTo({ top: 0, behavior: "smooth" }); }
});
function renderJournal() {
  const J = journalData, box = $("journal");
  if (!J) { box.innerHTML = `<p style="font-size:14px;margin:0 0 10px">Chaque matin, le journal raconte ce qui s'est passé dans la ville : naissances, mariages, nouvelles entreprises, décès, élections… et la vie de ta commune.</p><button class="mini fill" id="b-journal" type="button">📰 Lire le journal du jour</button>`; return; }
  const R = J.rubriques.find(x => x.id === journalTab) || J.rubriques[0];
  const it = x => `<div class="news"><span class="ic">${x.icone}</span><div>${x.annonce ? `<small style="opacity:.7;display:block">Annonce</small>` : ""}<b>${esc(x.titre)}</b><p>${esc(x.texte)}</p></div></div>`;
  box.innerHTML = `<div class="paper-head"><b>${esc(J.titre)}</b><span>N° ${J.numero} · ${new Date(J.date + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}${J.chiffres && J.chiffres.joueurs ? ` · ${J.chiffres.joueurs} habitants joueurs` : ""}</span></div>
    <div class="une"><span class="ic">${J.une.icone}</span><div><small>À la une</small><b>${esc(J.une.titre)}</b><p>${esc(J.une.texte)}</p></div></div>
    ${J.sponsor ? `<div class="news ad" style="border-left:3px solid ${esc(J.sponsor.couleur || "#ffd23f")};padding-left:8px"><span class="ic">📣</span><div><small style="opacity:.7;display:block">Annonce</small><b>${esc(J.sponsor.titre)}</b><p>${esc(J.sponsor.texte)}</p></div></div>` : ""}
    <div class="tabs" style="margin:10px 0 6px">${J.rubriques.map(x => `<button class="tab ${x.id === R.id ? "on" : ""}" data-jtab="${x.id}" type="button">${esc(x.titre)}</button>`).join("")}</div>
    ${R.items.length ? R.items.map(it).join("") : `<p style="font-size:13px">${esc(R.vide)}</p>`}`;
}
$("journal").addEventListener("click", async e => {
  if (e.target.id === "b-journal") { e.target.disabled = true; try { journalData = await call("/api/journal", {}); renderJournal(); } catch (err) { toast(err.message); e.target.disabled = false; } }
  const t = e.target.closest("[data-jtab]"); if (t) { journalTab = t.dataset.jtab; renderJournal(); }
});
// ---- vie sociale : les voisins (vrais joueurs) et les petits mots
let neighbors = null, wordTo = null;
function renderNeighbors(v) {
  const M = v.mots || { recus: [], envoyes: [], modeles: [], nonLus: 0, max: 200 }, box = $("voisins");
  const inbox = M.recus.length ? `<h2 style="font-size:16px;margin:4px 0 6px">✉️ Mots reçus${M.nonLus ? ` <span class="badge">${M.nonLus} nouveau${M.nonLus > 1 ? "x" : ""}</span>` : ""}</h2>` +
    M.recus.slice(0, 8).map(m => `<div class="word ${m.lu ? "" : "new"}"><div><b>${esc(m.nom)}</b>${m.pseudo ? ` <small>@${esc(m.pseudo)}</small>` : ""}<p>${esc(m.texte)}</p></div><div class="w-act"><button class="mini" data-reply="${m.de}" data-nom="${esc(m.nom)}" type="button">Répondre</button><button class="link" data-report="${m.id}" type="button" title="Signaler ce mot à l'administration">Signaler</button></div></div>`).join("") +
    (M.nonLus ? `<button class="mini" id="b-mots-lus" type="button" style="margin:6px 0 10px">Tout marquer comme lu</button>` : "") : "";
  const list = !neighbors ? `<button class="mini fill" id="b-voisins" type="button">🏘️ Voir les joueurs de ma commune</button>`
    : `<p style="font-size:13px;margin:6px 0">${neighbors.joueurs} joueur${neighbors.joueurs > 1 ? "s" : ""} dans la ville${neighbors.demo ? " (démo : joueurs simulés)" : ""}. En premier, ceux de ${esc(neighbors.quartier || "ta commune")}.</p>` +
      (neighbors.voisins.length ? neighbors.voisins.map(n => `<div class="item"><span class="sw">${n.sexe === "F" ? "👩🏾" : "👨🏾"}</span><div class="t">${esc(n.prenom)} ${esc(n.nom)}${n.memeCommune ? ` <span class="badge">voisin</span>` : ""}<small>${n.age} ans · ${esc(n.quartier || "")}${n.metier ? " · " + esc(n.metier) : ""} · ${esc(n.reputation)}${n.pseudo ? " · @" + esc(n.pseudo) : ""}</small></div><button class="mini" data-write="${n.id}" data-nom="${esc(n.prenom)} ${esc(n.nom)}" type="button">✉️ Écrire</button></div>`).join("")
        : `<p style="font-size:13px">Tu es le premier joueur de la ville. Invite tes amis à s'inscrire !</p>`);
  const form = wordTo ? `<div class="g-row" style="margin-top:10px;display:block"><b style="font-size:14px">Mot pour ${esc(wordTo.nom)}</b>
      <div class="chips" style="margin:6px 0">${M.modeles.map((t, i) => `<button class="chip" data-tpl="${i}" type="button">${esc(t)}</button>`).join("")}</div>
      <textarea id="w-text" maxlength="${M.max}" rows="2" style="width:100%;box-sizing:border-box" placeholder="Ton mot (${M.max} caractères, sans lien ni numéro)"></textarea>
      <div class="chips" style="margin-top:6px"><button class="mini fill" id="b-send-word" type="button">Envoyer</button><button class="mini" id="b-cancel-word" type="button">Annuler</button></div></div>` : "";
  box.innerHTML = inbox + form + list;
}
$("voisins").addEventListener("click", async e => {
  const el = e.target;
  if (el.id === "b-voisins") { el.disabled = true; try { neighbors = await call("/api/voisins", {}); renderNeighbors(state); } catch (err) { toast(err.message); el.disabled = false; } return; }
  const w = el.closest("[data-write],[data-reply]"); if (w) { wordTo = { id: w.dataset.write || w.dataset.reply, nom: w.dataset.nom }; renderNeighbors(state); setTimeout(() => $("w-text") && $("w-text").focus(), 50); return; }
  const tp = el.closest("[data-tpl]"); if (tp) { $("w-text").value = state.mots.modeles[+tp.dataset.tpl]; return; }
  if (el.id === "b-cancel-word") { wordTo = null; renderNeighbors(state); return; }
  if (el.id === "b-send-word") { const to = wordTo; el.disabled = true; try { const v = await call("/api/mot", { vers: to.id, texte: $("w-text").value }); wordTo = null; render(v); toast(`Mot envoyé à ${v.envoyeA || to.nom}.`); } catch (err) { toast(err.message); el.disabled = false; } return; }
  if (el.id === "b-mots-lus") return act("/api/mots/lus", {});
  const rp = el.closest("[data-report]"); if (rp) return act("/api/mot/signaler", { mot: rp.dataset.report }, () => "Merci. Le mot est signalé à l'équipe 2 Life.");
});
// ---- série de jours : une consigne par jour garde la flamme allumée
function streakHtml(v) {
  const S = v.fidelite; if (!S) return "";
  const p = v.perso, B = S.prochainBonus;
  const head = S.serie ? `🔥 Série : <b>${S.serie} jour${S.serie > 1 ? "s" : ""}</b>` : "🔥 Série : <b>0 jour</b>";
  const line = S.aujourdhui ? `Bravo, la journée compte. Reviens demain matin pour continuer.`
    : S.enDanger ? `Donne au moins une consigne à ${esc(p.prenom)} aujourd'hui pour garder ta série.`
    : S.perdue ? `Ta série de ${S.perdue} jours s'est arrêtée. Recommence aujourd'hui !` : `Donne une consigne chaque jour : ta série grandit et rapporte des bonus.`;
  const dots = S.paliers.map(x => `<span class="chip" style="cursor:default;${S.serie >= x.jours ? "border-color:var(--ok);color:var(--ok)" : ""}">${S.serie >= x.jours ? "✅" : "🎁"} ${x.jours} j · +${fmtMakuta(x.makuta)}</span>`).join("");
  return `<div class="streak${S.enDanger ? " danger" : ""}"><div class="row" style="border:0;padding:0 0 4px"><span>${head}</span><span>Record : ${Math.max(S.meilleure, S.serie)} j</span></div>
    <div style="font-size:13px">${line} Prochain bonus : <b>+${fmtMakuta(B.makuta)}</b> au jour ${B.jours} (dans ${B.dans} jour${B.dans > 1 ? "s" : ""}).</div>
    <div class="chips" style="margin-top:8px">${dots}</div>${v.demo ? `<button class="mini" id="b-demo-day" type="button" style="margin-top:8px">⏩ Démo : passer au lendemain</button>` : ""}</div>`;
}
function renderOrders(v) {
  const C = v.consignes, left = C.max - C.liste.length, name = id => (C.catalogue.find(o => o.id === id) || {});
  const N = v.notifications || {};
  $("orders").innerHTML = streakHtml(v) + `<button class="mini ${N.actives ? "" : "fill"}" id="b-notif" type="button" style="float:right;margin:0 0 6px 8px">${N.actives ? "🔕 Couper les notifications" : "🔔 Réveil du matin"}</button><p style="font-size:14px;margin:0 0 8px">Dis à ${esc(v.perso.prenom)} quoi faire aujourd'hui. ${esc(v.perso.prenom)} suit tes consignes toute la journée, même quand tu n'es pas connecté (vérification toutes les ${C.verifieToutesLesMinutes} minutes). <b>${C.max} consignes par jour</b>, et une consigne donnée ne se retire pas avant demain.</p>` +
    (C.liste.length ? C.liste.map(id => `<div class="item"><span class="sw">${name(id).icone}</span><div class="t">${name(id).nom}<small>${name(id).desc}</small></div><span class="mini" style="border-color:var(--ok);color:var(--ok)">Active</span></div>`).join("") : "") +
    (left > 0 ? `<h2 style="font-size:16px;margin:12px 0 6px">Donner une consigne (encore ${left})</h2><div class="chips">${C.catalogue.filter(o => !C.liste.includes(o.id)).map(o => `<button class="chip" data-order="${o.id}" type="button">${o.icone} ${o.nom}</button>`).join("")}</div>`
      : `<p style="font-size:13px;margin:10px 0 0">Tu as donné tes ${C.max} consignes du jour. Nouvelles consignes demain à minuit (heure de Kinshasa).</p>`) +
    (C.journal.length ? `<h2 style="font-size:16px;margin:14px 0 4px">Fait aujourd'hui</h2>` + C.journal.slice(0, 8).map(j => `<div class="row"><span>${new Date(j.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${esc(j.message)}</span><span>${j.ok ? "✅" : "⏳"}</span></div>`).join("") : "");
}
$("orders").addEventListener("click", async e => {
  if (e.target.id === "b-demo-day") return act("/api/demo/lendemain", {}, () => "Démo : une nouvelle journée commence. Donne une consigne pour continuer ta série.");
  if (e.target.id !== "b-notif") return;
  const on = !(state.notifications || {}).actives;
  try { render(await (on ? notifOn() : notifOff())); toast(on ? "Chaque matin à 5 h, tu recevras le réveil de ton personnage, et une notification à chaque consigne faite." : "Notifications coupées."); } catch (err) { toast(err.message); }
});
$("orders").onclick = e => { const b = e.target.closest("[data-order]"); if (b) { b.disabled = true; act("/api/consigne", { ordre: b.dataset.order }, v => { const j = v.consignes.journal[0]; return (v.serieBonus ? `🔥 Série de ${v.serieBonus.jours} jours : +${fmtMakuta(v.serieBonus.makuta)} ! ` : "") + "Consigne donnée." + (j && j.ordre === b.dataset.order && Date.now() - j.le < 60e3 ? " " + j.message : ""); }); } };
let movesTab = "tout", movesAll = false;
function renderMoves(v) {
  const M = (v.mouvements || []).filter(m => movesTab === "tout" || (movesTab === "consignes") === !!m.par_consigne);
  $("moves-tabs").innerHTML = [["tout", "Tout"], ["moi", "Mes actions"], ["consignes", "Par consigne"]].map(([id, l]) => `<button class="tab ${id === movesTab ? "on" : ""}" data-mv="${id}" type="button">${l}</button>`).join("");
  if (!M.length) { $("moves").innerHTML = `<p style="font-size:14px;margin:0">Aucun mouvement pour l'instant. Chaque action de ${esc(v.perso.prenom)} apparaîtra ici : travail, achats, trajets, banque, consignes…</p>`; return; }
  let day = "", h = "";
  for (const m of movesAll ? M : M.slice(0, 15)) {
    const d = new Date(m.le).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    if (d !== day) { day = d; h += `<h2 style="font-size:14px;margin:12px 0 4px;text-transform:capitalize">${d}</h2>`; }
    h += `<div class="item"><span class="sw">${m.icone}</span><div class="t" style="font-size:14px">${esc(m.texte)}<small>${new Date(m.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}${m.par_consigne ? " · 📋 par consigne" : " · par toi"}</small></div></div>`;
  }
  if (M.length > 15) h += `<button class="link" id="b-moves-all" type="button" style="display:block;margin:8px auto 0">${movesAll ? "Voir moins" : `Voir tout (${M.length})`}</button>`;
  $("moves").innerHTML = h;
}
$("moves-tabs").onclick = e => { const b = e.target.closest("[data-mv]"); if (b) { movesTab = b.dataset.mv; renderMoves(state); } };
$("moves").onclick = e => { if (e.target.id === "b-moves-all") { movesAll = !movesAll; renderMoves(state); } };
function renderTips(v) {
  $("tips").innerHTML = tips(v).map(([ic, txt, label, to]) => `<div class="item"><span class="sw">${ic}</span><div class="t" style="font-size:14px">${txt}</div><button class="mini fill" data-tip="${to}" type="button">${label}</button></div>`).join("");
}
$("tips").onclick = e => {
  const b = e.target.closest("[data-tip]"); if (!b) return; const to = b.dataset.tip;
  if (to === "eat") return $("b-eat").click();
  if (to === "dowork") return ($("b-work") || {}).click ? $("b-work").click() : goTo("work");
  if (to.startsWith("state:")) { stateTab = to.slice(6); renderState(state); return goTo("state"); }
  if (to.startsWith("cash:")) return act("/api/entreprise/encaisser", { entreprise: to.slice(5) }, v => `Tu as encaissé ${mk(v.encaisse)}.`);
  goTo(SECTIONS[to]);
};
document.querySelector(".quick").onclick = e => { const b = e.target.closest("[data-to]"); if (b) goTo(SECTIONS[b.dataset.to] || b.dataset.to); };
function renderSchool(v) {
  const p = v.perso, sc = v.ecole, enr = sc.enCours, f = enr && sc.formations.find(x => x.id === enr.formation);
  const dip = sc.diplomes.map(id => sc.formations.find(x => x.id === id)).filter(Boolean);
  let head = "";
  if (f) {
    const wait = enr.prochainCours && enr.prochainCours > Date.now(), moy = enr.cours ? Math.round(enr.points / enr.cours) : null;
    head = `<div class="row"><span>Formation</span><span style="text-align:right">${f.nom}</span></div>
      <div class="row"><span>Année</span><span>${enr.annee} sur ${f.annees} · cours ${enr.cours}/${f.coursParAn}${moy != null ? ` · moyenne ${moy}/100` : ""}</span></div>
      <div class="bar" style="margin:10px 0 0"><i style="width:${Math.round(((enr.annee - 1) * f.coursParAn + enr.cours) / (f.annees * f.coursParAn) * 100)}%"></i></div>
      <button class="btn" id="b-study" type="button" ${dis(wait || p.besoins.energy < sc.fatigueCours, wait ? `Prochain cours dans ${fmtWait(enr.prochainCours - Date.now())}.` : "Trop fatigué pour aller en cours.")}>Aller en cours${f.fraisCours ? ` (${mk(f.fraisCours)})` : ""}</button>
      <p style="font-size:13px;margin:8px 0 0">${wait ? `Prochain cours dans ${fmtWait(enr.prochainCours - Date.now())}.` : `Un cours fatigue (−${sc.fatigueCours} énergie).`} Il faut ${sc.moyenneRequise}/100 de moyenne pour passer.${f.parents ? " Les frais sont payés par tes parents." : ""}</p>`;
  } else if (p.age < 6) head = `<p style="font-size:14px;margin:0">${p.prenom} entrera à l'école primaire à 6 ans.</p>`;
  else head = `<p style="font-size:14px;margin:0">Aucune formation en cours. Choisis une école ci-dessous.</p>`;
  const list = sc.formations.map(x => {
    const done = sc.diplomes.includes(x.id);
    const lock = done ? "" : enr ? "" : x.requis && !sc.diplomes.includes(x.requis) ? `après : ${sc.formations.find(y => y.id === x.requis).diplome}` : p.age < x.minAge ? `dès ${x.minAge} ans` : "";
    const fee = x.parents ? "payée par les parents" : `${mk(x.fraisAn)} par an`;
    const btn = done ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Diplômé</span>` : enr && enr.formation === x.id ? `<span class="mini">En cours</span>` : `<button class="mini fill" data-enroll="${x.id}" type="button" ${dis(lock || enr, enr ? "Tu suis déjà une formation : termine-la d'abord." : `Pas encore : ${lock}.`)}>S'inscrire</button>`;
    return `<div class="item"><span class="sw">${x.parents ? "🏫" : "🎓"}</span><div class="t">${x.nom}<small>${x.annees} ans · ${x.diplome} · ${fee}${lock ? " · " + lock : ""}</small></div>${btn}</div>`;
  }).join("");
  $("school").innerHTML = head + (dip.length ? `<h2 style="font-size:16px;margin:16px 0 4px">Mes diplômes</h2>` + dip.map(x => `<div class="row"><span>🎓</span><span>${x.diplome}</span></div>`).join("") : "") +
    `<h2 style="font-size:16px;margin:16px 0 4px">Écoles et universités</h2>` + list;
}
function renderKids(v) {
  const p = v.perso, kids = v.enfants || [];
  const card = $("kids-card"); card.hidden = p.age < 18 && !kids.length;
  if (card.hidden) return;
  const head = `<p style="font-size:14px;margin:0 0 10px">Quand un nouveau joueur s'inscrit, il peut naître chez toi. Tu paies alors son entretien (${mk(v.entretienParJour)} par jour, prélevés automatiquement) jusqu'à ses 18 ans. Devenu adulte, il te reverse 10 % de son salaire.</p>
    <button class="btn" id="b-host" type="button" style="margin-top:0" ${dis(p.age < 20, "Accueillir un enfant est possible dès 20 ans.")}>${p.accueil ? "Ne plus accueillir d'enfant" : "Accueillir un enfant"}</button>
    ${p.age < 20 ? `<p style="font-size:13px;margin:8px 0 0">Possible à partir de 20 ans.</p>` : ""}
    ${v.demo && p.accueil ? `<button class="mini" id="b-demo-baby" type="button" style="margin-top:10px">Simuler l'inscription d'un bébé (démo)</button>` : ""}`;
  const list = kids.map(k => {
    const food = k.age < 4 ? "lait" : "fufu", it = v.boutique.find(x => x.id === food);
    const low = k.besoins.hunger < 40 || k.besoins.health < 60;
    return `<div class="item"><span class="sw">${k.age < 3 ? "👶" : k.sexe === "F" ? "👧" : "👦"}</span><div class="t">${k.prenom} ${k.nom} · ${fmtAge(k.age)} (${k.etapeLabel})
      <small>Faim ${k.besoins.hunger} · Santé ${k.besoins.health} · Bonheur ${k.besoins.happiness} · ${mk(k.makuta)}${k.prochainEntretien ? ` · prochain entretien dans ${fmtWait(k.prochainEntretien - Date.now())}` : " · adulte"}${low ? " · <b style='color:var(--warn)'>a besoin de toi</b>" : ""}</small></div>
      <button class="mini fill" data-feed="${k.id}" data-food="${food}" type="button" ${dis(p.makuta < it.prix, `Il te manque ${mk(it.prix - p.makuta)}.`)}>Nourrir (${mk(it.prix)})</button></div>
      <details class="kid-moves" style="margin:0 0 8px 48px;font-size:13px"><summary style="cursor:pointer;color:var(--muted, #b9a98f)">Voir les mouvements de ${esc(k.prenom)} (${(k.mouvements || []).length})</summary>
        ${(k.mouvements || []).length ? k.mouvements.map(m => `<div class="row"><span>${m.icone} ${esc(m.texte)}</span><span>${new Date(m.le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${m.par_consigne ? " · 📋" : ""}</span></div>`).join("") : `<p style="margin:6px 0">Aucun mouvement pour l'instant.</p>`}</details>`;
  }).join("");
  $("kids").innerHTML = head + (kids.length ? `<h2 style="font-size:16px;margin:16px 0 4px">Mes enfants</h2>${list}` : "");
}
$("ident").onclick = e => { if (e.target.id === "b-demo-die") act("/api/demo/mourir", {}, () => "Ton personnage est mort (simulation)."); };
$("kids").onclick = e => {
  if (e.target.id === "b-host") return act("/api/accueil", { actif: !state.perso.accueil }, v => v.perso.accueil ? "Ta famille est prête à accueillir un nouveau joueur." : "Tu n'accueilles plus de nouvel enfant.");
  if (e.target.id === "b-demo-baby") return act("/api/demo/bebe", {}, v => `${v.enfants.at(-1).prenom} vient de naître chez toi !`);
  const b = e.target.closest("[data-feed]");
  if (b) act("/api/enfant/nourrir", { enfant: b.dataset.feed, objet: b.dataset.food }, () => "Ton enfant a mangé.");
};
$("school").onclick = e => {
  const b = e.target.closest("[data-enroll]");
  if (b) return act("/api/ecole/inscription", { formation: b.dataset.enroll }, v => `Inscrit : ${v.ecole.formations.find(x => x.id === v.ecole.enCours.formation).nom}.`);
  if (e.target.id === "b-study") act("/api/ecole/cours", {}, v => v.cours.message);
};
$("work").onclick = e => {
  const b = e.target.closest("[data-job]");
  if (b) return act("/api/postuler", { metier: b.dataset.job }, v => `Embauché : ${v.travail.metiers.find(j => j.id === v.travail.metier).nom}.`);
  const c = e.target.closest("[data-cjob]");
  if (c) return act("/api/postuler", { entreprise: c.dataset.cjob }, v => `Embauché chez ${v.embauche} !`);
  if (e.target.id === "b-work") act("/api/travailler", {}, v => v.paie.arriere ? v.paie.message : `Journée terminée : +${mk(v.paie.montant - v.paie.famille)}${v.paie.bonus ? " (bonus talent)" : ""}, et ${mk(v.paie.famille)} pour tes parents.`);
};
$("shop-tabs").onclick = e => { const b = e.target.closest(".tab"); if (!b) return; shopTab = b.dataset.t; renderShop(state); };
async function act(path, body, ok) { try { const v = await call(path, body); render(v); if (ok) toast(ok(v)); } catch (err) { toast(err.message); } }
$("shop").onclick = e => {
  const b = e.target.closest("[data-buy]"); if (!b) return;
  const it = state.boutique.find(x => x.id === b.dataset.buy); b.disabled = true;
  act("/api/acheter", { objet: it.id }, () => it.type === "nourriture" ? `Bon appétit : ${it.nom}.` : it.slot ? `${it.nom} acheté et porté.` : `${it.nom} acheté. Il est dans tes affaires.`);
};
$("inv").onclick = e => {
  const b = e.target.closest("[data-wear]"); if (b) return act("/api/porter", { possession: b.dataset.wear });
  const s = e.target.closest("[data-sell]"); if (s) { s.disabled = true; act("/api/revendre", { possession: s.dataset.sell }, v => `${v.vendu} vendu : +${mk(v.gain)}.`); }
};
$("wallet").oninput = walletLive;
$("wallet").onchange = walletLive;
$("wallet").onclick = e => {
  const b = e.target.closest("[data-inv]");
  if (b) { const o = state.portefeuille.offres.find(x => x.id === b.dataset.inv); return act("/api/investir", { offre: o.id }, v => `Investissement simulé : ${mk(o.usd * USD_UNITS)} ajoutés. Retrait de ton dû chaque fin de mois.`); }
  const moyen = sens => (document.querySelector(`input[name=g-${sens}]:checked`) || {}).value, w = state.portefeuille;
  if (e.target.id === "b-deposit") act("/api/guichet/deposer", { moyen: moyen("dep"), usd: Number($("g-dep-usd").value), telephone: $("g-dep-tel").value },
    v => { if (v.paiement) { if (v.paiement.redirect) setTimeout(() => location.assign(v.paiement.redirect), 1200); return v.paiement.message; }
      return `Dépôt ${w.simulation ? "simulé " : ""}reçu : +${mk(Math.round(Number($("g-dep-usd").value) * USD_UNITS))} dans ta poche.`; });
  if (e.target.id === "b-withdraw") act("/api/retirer", { moyen: moyen("wd"), makuta: Math.floor(Number($("g-wd-mk").value) * USD_UNITS / w.taux), telephone: $("g-wd-tel").value },
    v => `Retrait ${w.simulation ? "simulé" : "demandé"} : ${usd(v.portefeuille.retraits.at(-1).usd)} vers ${(w.moyens.find(m => m.id === moyen("wd")) || {}).nom}.`);
};

let launch = null;
async function showLaunch() {
  try { launch = await call("/api/lancement"); } catch (e) { launch = null; }
  const box = $("launch"); box.hidden = !signup || !launch || launch.demarre;
  document.querySelectorAll("input[name=formule]").forEach(i => {
    const closed = launch && !launch.demarre && !canSignupBeforeLaunch(i.value);
    i.dataset.closed = closed ? "1" : ""; i.closest(".offer").classList.toggle("closed", closed);
    if (closed && i.checked) { i.checked = false; document.querySelector("input[name=formule][value=petit]").checked = true; }
  });
  if (!launch || launch.demarre) return;
  box.innerHTML = `<b>Le jeu n'a pas encore démarré</b><p>La ville ouvre quand toutes les conditions sont réunies. En attendant, seuls les investisseurs peuvent s'inscrire.</p>` +
    launch.conditions.map(c => c.id === "date" ? `<div class="need">${c.label} <b style="float:right">${launch.dateOuverture ? new Date(launch.dateOuverture).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "à fixer"}</b></div>`
      : `<div class="need">${c.label} <b style="float:right">${c.actuel} / ${c.min}</b><div class="bar"><i class="${c.ok ? "" : "mid"}" style="width:${Math.min(100, c.actuel / c.min * 100)}%"></i></div></div>`).join("") +
    (API ? "" : `<p class="sim" style="margin-top:12px">Démo : ouvre <a href="admin.html" style="color:inherit">l'espace administrateur</a> pour ajouter les parents fondateurs et démarrer le jeu.</p>`);
  authLabel();
}
function authLabel() {
  const f = (document.querySelector("input[name=formule]:checked") || {}).value;
  $("b-auth").textContent = !signup ? "Se connecter" : f === "petit" || f === "grand" ? "Entrer comme investisseur" : "Naître à Kinshasa";
}
document.querySelectorAll("input[name=formule]").forEach(i => i.onchange = () => {
  if (i.dataset.closed) { i.checked = false; document.querySelector("input[name=formule][value=petit]").checked = true; toast("La naissance ouvre le jour du lancement officiel. Avant, seuls les investisseurs peuvent entrer."); }
  authLabel();
});
function showAuth() {
  $("v-life").hidden = true; $("v-dead").hidden = true; $("v-auth").hidden = false;
  if (!launch) showLaunch();
  $("f-pseudo").hidden = !signup; $("f-formule").hidden = !signup;
  authLabel(); $("launch").hidden = !signup || !launch || launch.demarre;
  $("sw-text").textContent = signup ? "Déjà un compte ?" : "Pas encore de vie ?";
  $("sw").textContent = signup ? "Se connecter" : "Créer un compte";
  $("pass").autocomplete = signup ? "new-password" : "current-password";
}

$("sw").onclick = () => { signup = !signup; $("auth-err").textContent = ""; showAuth(); };
$("f-auth").onsubmit = async e => {
  e.preventDefault();
  const b = $("b-auth"); b.disabled = true; $("auth-err").textContent = "";
  try {
    const body = { email: $("email").value, motdepasse: $("pass").value, pseudo: $("pseudo").value, formule: (document.querySelector("input[name=formule]:checked") || {}).value };
    if (!API && signup && body.motdepasse.length < 8) throw new Error("Le mot de passe doit faire au moins 8 caractères.");
    if (!API && signup && body.pseudo.trim().length < 2) throw new Error("Choisis un pseudo d'au moins 2 caractères.");
    const v = await call(signup ? "/api/inscription" : "/api/connexion", body);
    store.set(LS_TOKEN, v.token);
    render(v);
    if (v.naissance) toast(v.perso.age >= 18 ? `Bienvenue ! ${v.perso.prenom} arrive à ${v.perso.quartier} à ${Math.floor(v.perso.age)} ans, avec ${mk(v.perso.makuta)} d'épargne.` : `Félicitations ! ${v.perso.prenom} vient de naître à ${v.perso.quartier}. Ses parents lui offrent ${mk(v.perso.makuta)}.`);
  } catch (err) { $("auth-err").textContent = err.message; }
  b.disabled = false;
};
$("acts").onclick = async e => {
  const b = e.target.closest(".act"); if (!b) return;
  b.disabled = true;
  try { const v = await call("/api/activite", { activite: b.dataset.a }); render(v); toast(v.resultat.talent ? `Talent découvert : ${v.resultat.talent} ! Tout ce que tu feras dans ce domaine sera plus efficace.` : v.resultat.message); }
  catch (err) { toast(err.message); b.disabled = false; }
};
$("b-eat").onclick = async () => { try { render(await call("/api/manger", {})); toast("Bon appétit ! La faim est calmée."); } catch (err) { toast(err.message); } };
$("b-out").onclick = () => { store.del(LS_TOKEN); state = null; signup = false; showAuth(); };
$("b-out2").onclick = () => $("b-out").click();

// ---------------------------------------------------------------- portrait 3D
const P3 = { ready: false };
function initPortrait() {
  const T = window.THREE; if (!T || !T.GLTFLoader) return;
  const cv = $("cv"), r = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, .05, 50);
  scene.add(new T.HemisphereLight(0xfff1e0, 0x3a2a20, .9));
  const key = new T.DirectionalLight(0xffe2c0, 1.6); key.position.set(1.5, 2.5, 2.5); scene.add(key);
  const rim = new T.DirectionalLight(0xffa860, .9); rim.position.set(-2, 2, -2); scene.add(rim);
  Object.assign(P3, { T, r, scene, cam, clock: new T.Clock(), tpl: {}, clips: {}, obj: null, mixer: null });
  const ld = new T.GLTFLoader(); if (window.MeshoptDecoder) ld.setMeshoptDecoder(window.MeshoptDecoder);
  ld.load("assets/models/humans" + (window.ZBOSS_MODEL_EXT || ".glb"), gl => {
    const BONES = new Set(["Root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r", "thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r", "ball_l", "ball_r"]);
    const real = n => BONES.has(n) ? n : BONES.has(n.replace(/_\d+$/, "")) ? n.replace(/_\d+$/, "") : n;
    const owner = {};
    gl.scene.traverse(o => { if (o.userData && o.userData.variant) o.traverse(b => { if (b.isBone) owner[b.name] = o; }); });
    gl.scene.children.slice().forEach(o => { if (!o.userData.variant) return; o.traverse(b => { if (b.isBone) b.name = real(b.name); }); P3.tpl[o.userData.variant] = o; });
    gl.animations.forEach(c => {
      let own = null;
      c.tracks.forEach(t => { const i = t.name.indexOf("."), n = t.name.slice(0, i); if (!own && owner[n]) own = owner[n]; t.name = real(n) + t.name.slice(i); });
      const base = own && own.getObjectByName("pelvis");
      for (const v in P3.tpl) {
        const cc = c.clone(), pv = P3.tpl[v].getObjectByName("pelvis"), k = pv && base ? pv.position.y / base.position.y : 1;
        // translation du bassin mise à l'échelle de la taille de chaque personnage (bébé, enfant, adulte)
        if (base && pv) cc.tracks.forEach(t => { if (t.name === "pelvis.position") for (let i = 0; i < t.values.length; i += 3) { t.values[i] = pv.position.x + (t.values[i] - base.position.x) * k; t.values[i + 1] = pv.position.y + (t.values[i + 1] - base.position.y) * k; t.values[i + 2] = pv.position.z + (t.values[i + 2] - base.position.z) * k; } });
        (P3.clips[v] = P3.clips[v] || {})[c.name] = cc;
      }
    });
    P3.ready = true;
    if (state) { portrait(state.perso); dress(state); }
  });
  const loop = () => {
    requestAnimationFrame(loop);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); frame(); }
    const dt = P3.clock.getDelta();
    (P3.mixers || []).forEach(m => m.update(dt));
    if (P3.obj) P3.obj.rotation.y = Math.sin(performance.now() / 4000) * .35;
    r.render(scene, cam);
  };
  loop();
}

// variante 3D selon l'étape de vie et le sexe ; repli sur un adulte si la variante manque
const BY_STAGE = {
  bebe: { F: ["bb"], M: ["bb"] }, enfant: { F: ["cf"], M: ["cm"] }, ado: { F: ["tf"], M: ["tm"] },
  adulte: { F: ["f1", "f3", "f2"], M: ["m1", "m4", "m2", "m3"] }, senior: { F: ["of", "f2"], M: ["om", "m2"] },
};
// un personnage 3D animé (idle), recentré sur son bassin ; renvoie l'objet et sa hauteur
function person(v) {
  const T = P3.T, obj = T.SkeletonUtils.clone(P3.tpl[v]), mats = {};
  obj.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); const n = o.material.name.replace(/\..*$/, ""); mats[n] = o.material; o.material.userData.base = o.material.color.clone(); } });
  const mixer = new T.AnimationMixer(obj), clip = P3.clips[v] && P3.clips[v].idle;
  if (clip) mixer.clipAction(clip).play();
  mixer.update(Math.random() * 2); obj.updateMatrixWorld(true);
  const wp = new T.Vector3(); let lo = 1e9, hi = -1e9, head = null, pel = null;
  obj.traverse(b => { if (!b.isBone) return; b.getWorldPosition(wp); lo = Math.min(lo, wp.y); hi = Math.max(hi, wp.y); if (b.name === "head") head = wp.clone(); if (b.name === "pelvis") pel = wp.clone(); });
  const inner = new T.Group(); inner.add(obj);
  if (pel) { obj.position.x -= pel.x; obj.position.z -= pel.z; }
  const top = head ? head.y + (head.y - lo) * .16 : hi;
  P3.mixers.push(mixer);
  return { obj: inner, mats, lo: Math.max(0, lo - (top - lo) * .03), top };
}

// la maison familiale : murs crépis, toit en tôle, porte, fenêtres, cour en terre et manguier
function house(m) {
  const T = P3.T, g = new T.Group(), std = (c, r = .9) => new T.MeshStandardMaterial({ color: new T.Color(c).convertSRGBToLinear().multiplyScalar(.72), roughness: r });
  const box = (w, h, d, mat, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); g.add(o); return o; };
  const W = 7, H = m.etage ? 5 : 2.9, D = 4, z0 = -5.5;
  const ground = new T.Mesh(new T.CircleGeometry(16, 48), std("#8a5a3c", 1)); ground.rotation.x = -Math.PI / 2; g.add(ground);
  box(W, H, D, std(m.mur), 0, H / 2, z0 - D / 2);
  box(W + .2, .12, D + .2, std("#e9dccb"), 0, H, z0 - D / 2);                          // bandeau
  const roof = box(W + .8, .08, D * .62, std(m.toit, .5), 0, H + .55, z0 - D * .25); roof.rotation.x = -.42;
  const roof2 = box(W + .8, .08, D * .62, std(m.toit, .5), 0, H + .55, z0 - D * .75); roof2.rotation.x = .42;
  box(.9, 1.9, .06, std(m.porte, .6), 0, .95, z0 + .01);
  [-2.3, 2.3].forEach(x => { box(1.1, .9, .05, std("#2a3440", .3), x, 1.45, z0 + .01); box(1.24, .08, .08, std("#e9dccb"), x, .97, z0 + .03); });
  if (m.etage) [-2.3, 0, 2.3].forEach(x => box(1, .8, .05, std("#2a3440", .3), x, 3.7, z0 + .01));
  box(W + 1.2, .25, .5, std("#b9a48a"), 0, .12, z0 + .25);                              // perron
  // manguier
  const trunk = new T.Mesh(new T.CylinderGeometry(.12, .18, 2.2, 8), std("#5b3e2b")); trunk.position.set(4.6, 1.1, -3.2); g.add(trunk);
  [[4.6, 2.6, -3.2, 1.2], [4.1, 2.3, -2.9, .8], [5.1, 2.4, -3.5, .85]].forEach(([x, y, z, r]) => { const f = new T.Mesh(new T.SphereGeometry(r, 14, 10), std("#2f6b34", .8)); f.position.set(x, y, z); g.add(f); });
  return g;
}

// variante 3D selon l'étape de vie et le sexe ; repli sur un adulte si la variante manque
function variantOf(stage, sex, seed) {
  const list = (BY_STAGE[stage] || BY_STAGE.adulte)[sex].filter(v => P3.tpl[v]);
  const adults = BY_STAGE.adulte[sex].filter(v => P3.tpl[v]);
  const l = list.length ? list : adults;
  return { v: l[seed % l.length], fallback: !list.length };
}

function portrait(p) {
  if (!P3.ready) return;
  const T = P3.T, fam = p.famille, child = ["bebe", "enfant", "ado"].includes(p.etape);
  const me = variantOf(p.etape, p.sexe, p.apparence);
  const key = [me.v, p.etape, fam && fam.maison.type].join(":");
  if (P3.key === key) return;
  P3.key = key;
  if (P3.root) P3.scene.remove(P3.root);
  P3.mixers = [];
  const root = new T.Group(); P3.root = root;
  if (fam) { const hs = house(fam.maison); hs.rotation.y = .5; hs.position.set(-1.2, 0, -1); root.add(hs); }
  const main = person(me.v);
  if (me.fallback) main.obj.scale.setScalar({ bebe: .42, enfant: .62, ado: .88 }[p.etape] || 1);
  root.add(main.obj); P3.obj = main.obj; P3.mats = main.mats;
  let lo = main.lo, top = main.top, w = .9;
  // l'enfant grandit entouré de ses parents (pris parmi les adultes, d'après la graine de la famille)
  if (child && fam) {
    const dad = person(variantOf("adulte", "M", p.apparence >> 3).v), mum = person(variantOf("adulte", "F", p.apparence >> 5).v);
    dad.obj.position.set(-.8, 0, -.35); dad.obj.rotation.y = .3;
    mum.obj.position.set(.8, 0, -.35); mum.obj.rotation.y = -.3;
    // tenues des parents : couleurs tirées de la famille
    const TOPS = ["#2f5d8a", "#8a2f3c", "#3c6e47", "#c58a2b", "#5b4a8a", "#e9e4da"], LOWS = ["#2b2f3a", "#5a4632", "#33476b", "#c9b28c"];
    if (dad.mats.shirt) dad.mats.shirt.color.set(TOPS[p.apparence % 6]).convertSRGBToLinear();
    if (dad.mats.pants) dad.mats.pants.color.set(LOWS[(p.apparence >> 2) % 4]).convertSRGBToLinear();
    if (mum.mats.shirt) mum.mats.shirt.color.set(TOPS[(p.apparence >> 4) % 6]).convertSRGBToLinear();
    root.add(dad.obj, mum.obj);
    top = Math.max(top, dad.top, mum.top); lo = Math.min(lo, dad.lo, mum.lo); w = 2.6;
  }
  P3.scene.add(root);
  P3.box = { min: lo, h: Math.max(.3, top - lo), w };
  frame();
}
function frame() {
  if (!P3.box) return;
  const { min, h, w } = P3.box, cam = P3.cam, half = Math.tan(cam.fov * Math.PI / 360);
  const need = h * 1.26 / 2, d = Math.max(need / half, (w * 1.15 / 2) / (half * cam.aspect));
  const cy = min + h * .52;
  cam.position.set(0, cy + h * .22, d);
  cam.lookAt(0, cy, 0);
}

// vêtements portés : teinte des matériaux « shirt », « pants » et « shoes » du modèle 3D
const SLOT_MAT = { haut: "shirt", bas: "pants", pieds: "shoes" };
function dress(v) {
  if (!P3.mats || !v) return;
  for (const slot in SLOT_MAT) {
    const m = P3.mats[SLOT_MAT[slot]]; if (!m) continue;
    const worn = v.inventaire.map(x => v.boutique.find(b => b.id === x.objet && x.porte)).find(it => it && it.slot === slot);
    if (worn) m.color.set(worn.couleur).convertSRGBToLinear(); else m.color.copy(m.userData.base);
  }
}

// ---------------------------------------------------------------- démarrage
$("mode").textContent = API ? "En ligne" : "Mode démo";
initPortrait();
(async () => {
  if (store.get(LS_TOKEN)) { try { render(await call("/api/moi")); } catch (e) { signup = false; showAuth(); } }
  else showAuth();
  setInterval(async () => { if (state) try { render(await call("/api/moi")); } catch (e) { } }, 60000);
})();
