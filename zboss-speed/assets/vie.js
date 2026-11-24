// 2 Life : écran du personnage. Parle au serveur (Cloudflare Worker) ou, sans serveur configuré,
// simule la même vie dans le navigateur (mode démo).
import {
  ageYears, stageOf, STAGES, realMsUntil, TALENTS, ACTIVITIES, rng, drawTalents, doActivity, needsAt, newIdentity, BIRTH_GIFT,
  SHOP, cannotBuy, OFFERS, USD_TO_MAKUTA, USD_UNITS, fmtMakuta, WITHDRAW_FEE, walletInfo, birthShiftMs, shopView, familyOf, JOBS, payFor, cannotWork, workView, SHIFT_ENERGY, cannotApply, FORMATIONS, cannotEnroll, attendCourse, schoolView, STUDY_ENERGY, SUPPORT_PER_DAY, HOST_MIN_AGE, canSignupBeforeLaunch, COMPANY_TYPES, cannotOpenCompany, companyName, companyView, companyAccrue, companyJob, EMPLOYEE_YIELD, RESELL_RATE, TAXI_FARE, TAXI_ENERGY, KINSHASA_QUARTIERS, OTHER_CITIES, TAX, POSTS, PUBLIC_JOBS, BANKS, bankAccrue, INSURERS, CARE, careCost, OPERATORS, RECHARGES, CALL, stateView, supportDue, unpaidEffect, familyShare, FIRST_NAMES,
  describeAction, ORDER_DONE, ORDERS, ORDERS_PER_DAY, ORDERS_CHECK_MS, dayKey, ordersToRun, cannotGiveOrder,
  VOTER_MIN_AGE, NEGLECT_DANGER_DAYS, NEGLECT_DANGER_HEALTH, splitEstate, deathCause, familyShareRate, CRIMES, catchChance, sentence, inPrison, PRISON_BLOCKED, BAIL, PRISON_HOURS, RECIDIVE, policeView,
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
const FOOD = { prix: 25, faim: 45 };
// démo : les entreprises des autres joueurs viennent de la liste de lancement (ou d'exemples)
function demoOthers() {
  const L = launchDemo.get().entreprises.filter(e => !e.moi);
  const base = L.length ? L : [["maquis", "Maquis Ya Mado", "Kalamu", "Mado Kabeya"], ["taxi", "Taxi Express", "Limete", "Patrick Ilunga"], ["boutique", "Boutique Mama Nzazi", "Matonge", "Nzazi Mbuyi"], ["salon", "Salon Élégance", "Gombe", "Grâce Tshibola"], ["pharmacie", "Pharmacie du Rond-Point", "Lemba", "Jean Mukendi"]]
    .map(([type, nom, quartier, proprietaire]) => ({ type, nom, quartier, proprietaire }));
  return base.map((e, i) => ({ ...e, id: "autre-" + i, en_vente: i % 3 === 0 ? Math.round((COMPANY_TYPES.find(t => t.id === e.type) || { prix: 20000 }).prix * 1.2) : null }));
}
const DEMO_ORDERS_MS = 2 * 60e3;
const demo = {
  seed() { return crypto.getRandomValues(new Uint32Array(1))[0]; },
  view(d) {
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
      repas: FOOD,
      ...shopView(d.inv || [], d.dep || [], d.ret || [], c.makuta, now),
      travail: { ...workView(d.job, d.lastShift, now), emploiEntreprise: d.boss ? companyJob(d.boss) : null },
      ecole: schoolView(d.enr || null, d.dip || [], now),
      enfants: (d.enfants || []).map(k => { const a = ageYears(k.neLe, now), kn = needsAt(k, now);
        return { id: k.id, prenom: k.prenom, nom: k.nom, sexe: k.sex, age: Math.round(a * 100) / 100, etapeLabel: stageOf(a).label, joueur: true, simule: true,
          besoins: Object.fromEntries(Object.entries(kn).map(([x, y]) => [x, Math.round(y)])), makuta: k.makuta, prochainEntretien: a < 18 ? supportDue(k.entretienLe, k.neLe, now).next : null }; }),
      entretienParJour: SUPPORT_PER_DAY, demo: true,
      entreprises: companyView((d.ent || []).map(e => ({ ...e, employes: 0 })), { aVendre: demoOthers().filter(e => e.en_vente && !(d.achetees || []).includes(e.id)), offres: demoOthers().filter(e => !(d.achetees || []).includes(e.id)).slice(0, 6) }, now),
      voyage: { quartiers: KINSHASA_QUARTIERS, prix: TAXI_FARE, fatigue: TAXI_ENERGY, villes: OTHER_CITIES },
      elections: launchDemo.elections(this.me(d)),
      mouvements: d.mouvements || [],
      notifications: { actives: !!d.notif },
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
  move(d, icone, texte) { d.mouvements = [{ icone, texte, par_consigne: 0, le: Date.now() }, ...(d.mouvements || [])].slice(0, 100); },
  // ton personnage meurt : 20 % gardés pour ta prochaine vie, 10 % à la ville, 70 % aux héritiers (ici la famille du jeu)
  die(d, cause) {
    const c = d.perso, now = Date.now(), total = c.makuta + (d.comptes || []).reduce((a, x) => a + bankAccrue(x, now), 0);
    const heirs = (d.enfants || []).length, sp = splitEstate(total, heirs);
    for (const k of d.enfants || []) k.makuta += sp.each;
    d.mort = { prenom: c.firstName, nom: c.lastName, sexe: c.sex, neLe: c.neLe, mortLe: now, cause, age: Math.floor(ageYears(c.neLe, now)),
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
      const cause = deathCause(needsAt(d.perso), 0); if (cause) this.die(d, cause);
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
      d = {
        pseudo: body.pseudo, email: String(body.email || "").trim().toLowerCase(), inv: [], ret: [], accueil: adult, enfants: [],
        dep: [{ offre: offer.id, usd: offer.usd, makuta: inv ? gift : 0, le: now }],
        perso: { ...who, neLe: adult ? now - birthShiftMs(offer.age + .01) : now, updatedAt: now, hunger: 100, energy: 100, happiness: 80, health: 100,
          makuta: gift, talents: drawTalents(r).map(t => ({ ...t, discovered: adult, hints: 0 })) },
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
        d = { pseudo: d.pseudo, email: d.email, inv: [], ret: d.ret || [], accueil: false, enfants: [], notif: d.notif, vies, deuils: d.deuils || [],
          dep: [...(d.dep || []), { offre: o.id, usd: o.usd, makuta: 0, le: now }],
          perso: { ...who, neLe: now, updatedAt: now, hunger: 100, energy: 100, happiness: 80, health: 100, makuta: BIRTH_GIFT + (d.report || 0),
            talents: drawTalents(r).map(t => ({ ...t, discovered: false, hints: 0 })) } };
        this.move(d, "👶", `Nouvelle vie : ${who.firstName} ${who.lastName} est né${who.sex === "F" ? "e" : ""} à ${who.quartier}.`);
        store.set(LS_DEMO, d); return { ...this.view(d), renaissance: true };
      }
      if (path === "/api/moi") return this.deadView(d);
      throw new Error("Ton personnage est mort. Tu peux renaître.");
    }
    if (path === "/api/moi") { await this.applyOrders(d); return this.view(store.get(LS_DEMO)); }
    if (path === "/api/consigne") {
      const C = this.orders(d), no = cannotGiveOrder(body.ordre, C.liste); if (no) throw new Error(no);
      C.liste.push(body.ordre); store.set(LS_DEMO, d);
      await this.applyOrders(d, true); return this.view(store.get(LS_DEMO));
    }
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
        c.makuta += gain; store.set(LS_DEMO, d); return { crime: { attrape: false, gain }, ...this.view(d) };
      }
      const sn = sentence(cr, c.makuta, d.casier.filter(x => x.le > now - RECIDIVE.jours * 864e5).length);
      c.makuta -= sn.amende; c.happiness = Math.max(0, c.happiness - 10); d.tresor = (d.tresor || 0) + sn.amende;
      if (sn.prison) d.prison = now + PRISON_HOURS * 36e5;
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
      this.settle(c);
      if (c.makuta < FOOD.prix) throw new Error("Pas assez d'e-makuta pour un repas.");
      c.makuta -= FOOD.prix; c.hunger = Math.min(100, c.hunger + FOOD.faim); store.set(LS_DEMO, d);
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
    if (path === "/api/postuler" && body.entreprise) {
      const e = demoOthers().find(x => x.id === body.entreprise);
      if (!e) throw new Error("Entreprise introuvable.");
      if (ageYears(c.neLe) < 18) throw new Error("Il faut avoir 18 ans pour travailler dans une entreprise.");
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
    if (path === "/api/soigner") {
      this.settle(c); if (c.health >= 95) throw new Error("Tu es en bonne santé, pas besoin de soins.");
      const k = careCost(d.assureJusqu, d.assureur); if (c.makuta < k.prix) throw new Error(`Les soins coûtent ${fmtMakuta(k.prix)}.`);
      c.makuta -= k.prix; c.health = Math.min(100, c.health + CARE.sante);
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
    if (path === "/api/postuler") {
      const job = JOBS.find(j => j.id === body.metier), no = cannotApply(job, ageYears(c.neLe), d.dip || []);
      if (no) throw new Error(no);
      d.job = job.id; d.boss = null; store.set(LS_DEMO, d); return this.view(d);
    }
    if (path === "/api/travailler") {
      this.settle(c);
      const job = d.boss ? companyJob(d.boss) : JOBS.find(j => j.id === d.job), no = cannotWork(job, ageYears(c.neLe), c.energy, d.lastShift);
      if (no) throw new Error(no);
      const pay = payFor(job, c.talents);
      pay.famille = familyShare(pay.montant, d.rancune || 0);   // 10 % pour les parents (moins s'il a été négligé enfant)
      pay.impot = Math.round(pay.montant * TAX.salaire); d.tresor = (d.tresor || 0) + pay.impot - (PUBLIC_JOBS.some(j => j.id === job.id) || job.elu ? pay.montant : 0);
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
      c.energy = Math.max(0, c.energy - STUDY_ENERGY); c.makuta -= res.fee;
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
    if (path === "/api/retirer") {
      const mk = Math.floor(Number(body.makuta) || 0), w = walletInfo(d.dep || [], c.makuta);
      if (!w.retraitPossible) throw new Error(w.retraitPossibleLe ? `Retrait possible à partir du ${new Date(w.retraitPossibleLe).toLocaleDateString("fr-FR")}.` : "Aucun dépôt.");
      if (mk < USD_UNITS || mk > c.makuta) throw new Error("Montant invalide.");
      c.makuta -= mk;
      (d.ret = d.ret || []).push({ makuta: mk, usd: Math.floor(mk / USD_UNITS * (1 - WITHDRAW_FEE) * 100) / 100, statut: "demande", le: Date.now() });
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
    return `<button class="act" data-a="${a.id}" type="button" ${off ? "disabled" : ""}>${a.label}<small>${why}</small></button>`;
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
  renderShop(v); renderWallet(v); renderWork(v); renderSchool(v); renderKids(v); renderCompanies(v); renderTravel(v); renderState(v); renderTips(v); renderOrders(v); renderMoves(v);
  if (!render.hashDone && location.hash === "#moves") { render.hashDone = true; setTimeout(() => goTo("moves"), 300); }
  portrait(p);
  dress(v);
}

// ---------------------------------------------------------------- mort et renaissance
function renderDeath(v) {
  const m = v.mort, o = v.renaissance, P = m.partage;
  $("v-auth").hidden = true; $("v-life").hidden = true; $("v-dead").hidden = false;
  $("dead").innerHTML = `<p style="margin:0;font-size:13px">✝️ Fin de vie</p>
    <h1>${esc(m.prenom)} ${esc(m.nom)} est ${m.sexe === "F" ? "morte" : "mort"}</h1>
    <p>À ${m.age} an${m.age > 1 ? "s" : ""}, le ${new Date(m.mortLe).toLocaleDateString("fr-FR")} · cause : <b>${esc(m.cause || "inconnue")}</b>. La mort est définitive : ce personnage ne reviendra pas.</p>
    ${P ? `<div class="row"><span>Gardé pour ta prochaine vie (20 %)</span><span>${mk(P.report)}</span></div>
    <div class="row"><span>Frais de succession pour la ville (10 %)</span><span>${mk(P.ville)}</span></div>
    <div class="row"><span>Héritiers : enfants et parents (70 %)</span><span>${mk(P.heritiers + P.famille)}</span></div>` : ""}
    <div class="row"><span>Tu repars avec</span><span><b>${mk(v.report)}</b></span></div>
    <button class="btn" id="b-reborn" type="button">Renaître bébé · ${o.usd} $${v.demo ? " (simulé)" : ""}</button>
    <p style="font-size:13px;margin:10px 0 0">${esc(o.desc)} Les ${mk(v.report)} gardés de cette vie te sont rendus à la naissance.</p>`;
}
$("dead").onclick = e => { if (e.target.id === "b-reborn") act("/api/renaitre", {}, v => `Bienvenue dans ta nouvelle vie, ${v.perso.prenom} !`); };

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
      <button class="mini fill" data-buy="${it.id}" type="button" ${why ? "disabled" : ""}>${it.type === "nourriture" ? "Manger" : "Acheter"}</button></div>`;
  }).join("");
  const inv = v.inventaire.map(x => ({ ...x, it: v.boutique.find(b => b.id === x.objet) })).filter(x => x.it);
  $("inv").innerHTML = inv.length ? inv.map(x => `<div class="item">${swatch(x.it)}<div class="t">${x.it.nom}<small>${x.it.slot ? (x.porte ? "Porté · " : "") + SLOT[x.it.slot] : "Téléphone : tu peux appeler ta famille"}</small></div>
      ${x.it.slot ? `<button class="mini ${x.porte ? "" : "fill"}" data-wear="${x.id}" type="button">${x.porte ? "Retirer" : "Porter"}</button>` : ""}
      <button class="mini" data-sell="${x.id}" type="button">Vendre ${mk(x.it.prix * RESELL_RATE)}</button></div>`).join("")
    : `<p style="font-size:14px;margin:0">Rien pour l'instant. Les vêtements achetés apparaissent ici et sur ton personnage.</p>`;
}
function renderWallet(v) {
  const w = v.portefeuille, p = v.perso;
  const lock = w.retraitPossibleLe ? (w.retraitPossible ? "Retrait possible" : `Retrait possible à partir du ${new Date(w.retraitPossibleLe).toLocaleDateString("fr-FR")}`) : "Aucun dépôt";
  const rows = [["Solde", mk(p.makuta)], ["Valeur au retrait", `${usd(w.valeurUsd)} (après ${Math.round(w.frais * 100)} % de frais)`], ["Taux", `1 $ = ${w.taux} e-makuta`],
    ["Total déposé", usd(w.deposeUsd)], ["Blocage", `${w.blocageJours} jours après le premier dépôt · ${lock}`]];
  const inv = w.offres.filter(o => o.type === "investissement").map(o => `<div class="item"><span class="sw">💼</span><div class="t">${o.nom} · ${usd(o.usd)}<small>${o.desc} Tu reçois ${mk(o.usd * USD_UNITS)}.</small></div>
      <button class="mini fill" data-inv="${o.id}" type="button">Investir</button></div>`).join("");
  const hist = [...w.depots.map(d => [d.le, `${(w.offres.find(o => o.id === d.offre) || {}).nom || d.offre} : ${usd(d.usd)}`]),
    ...w.retraits.map(r => [r.le, `Retrait demandé : ${mk(r.makuta)} → ${usd(r.usd)}`])].sort((a, b) => b[0] - a[0])
    .map(([t, x]) => `<div class="row"><span>${new Date(t).toLocaleDateString("fr-FR")}</span><span>${x}</span></div>`).join("");
  $("wallet").innerHTML = rows.map(([a, b]) => `<div class="row"><span>${a}</span><span style="text-align:right">${b}</span></div>`).join("") +
    `<h2 style="font-size:16px;margin:16px 0 4px">Investir</h2>${inv}` +
    `<button class="btn" id="b-withdraw" type="button" ${w.retraitPossible && p.makuta >= USD_UNITS ? "" : "disabled"}>Retirer vers M-Pesa ou carte</button>` +
    (hist ? `<h2 style="font-size:16px;margin:16px 0 4px">Historique</h2>${hist}` : "");
}
function renderWork(v) {
  const p = v.perso, w = v.travail, cur = w.emploiEntreprise || w.metiers.find(j => j.id === w.metier);
  if (p.age < 16) { $("work").innerHTML = `<p style="font-size:14px;margin:0">${p.prenom} pourra travailler à partir de 16 ans. En attendant, ce sont ses parents qui paient la nourriture et les habits.</p>`; return; }
  const disc = new Set(p.talents.map(t => t.id)), wait = w.prochainTravail && w.prochainTravail > Date.now();
  const head = cur ? `<div class="row"><span>Métier</span><span style="text-align:right">${cur.nom}</span></div>
    <button class="btn" id="b-work" type="button" ${wait || p.besoins.energy < w.fatigueTravail ? "disabled" : ""}>Travailler une journée (+${mk(Math.round(cur.salaire * (disc.has(cur.talent) ? 1.3 : 1)))})</button>
    <p style="font-size:13px;margin:8px 0 0">${wait ? `Prochaine journée dans ${fmtWait(w.prochainTravail - Date.now())}.` : `Une journée fatigue (−${w.fatigueTravail} énergie).`}${disc.has(cur.talent) ? " Ton talent te donne +30 % de salaire." : ""}</p>`
    : `<p style="font-size:14px;margin:0 0 6px">Choisis un métier. Un métier lié à un talent découvert paie 30 % de plus.</p>`;
  const list = w.metiers.map(j => {
    const lock = j.formation && !v.ecole.diplomes.includes(j.formation) ? `diplôme : ${j.diplome}` : p.age < j.minAge ? `dès ${j.minAge} ans` : "";
    return `<div class="item"><span class="sw">${j.formation ? "🎓" : "🧰"}</span><div class="t">${j.nom}<small>${mk(j.salaire)} par journée${disc.has(j.talent) ? " · +30 % (ton talent)" : ""}${lock ? " · " + lock : ""}</small></div>
      ${j.id === w.metier && !w.emploiEntreprise ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Ton métier</span>` : `<button class="mini fill" data-job="${j.id}" type="button" ${lock ? "disabled" : ""}>Postuler</button>`}</div>`;
  }).join("");
  const co = p.age >= 18 && v.entreprises.offres.length ? `<h2 style="font-size:16px;margin:16px 0 4px">Les entreprises des joueurs embauchent</h2>` + v.entreprises.offres.map(e => `<div class="item"><span class="sw">${e.icone || "🏢"}</span><div class="t">${esc(e.emploi.nom)}<small>${mk(e.emploi.salaire)} par journée · ${esc(e.quartier || "")}${disc.has(e.emploi.talent) ? " · +30 % (ton talent)" : ""}</small></div>
    ${w.emploiEntreprise && w.emploiEntreprise.entreprise === e.id ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Ton emploi</span>` : `<button class="mini fill" data-cjob="${e.id}" type="button">Postuler</button>`}</div>`).join("") : "";
  $("work").innerHTML = head + co + `<h2 style="font-size:16px;margin:16px 0 4px">Offres d'emploi en ville</h2>` + list;
}
function renderCompanies(v) {
  const p = v.perso, E = v.entreprises;
  if (p.age < 18) { $("companies").innerHTML = `<p style="font-size:14px;margin:0">${p.prenom} pourra ouvrir ou racheter une entreprise à 18 ans.</p>`; return; }
  const mine = E.miennes.length ? E.miennes.map(e => {
    const t = E.types.find(x => x.id === e.type) || {};
    return `<div class="co">
      <div class="item" style="border:0"><span class="sw">${e.icone || "🏢"}</span><div class="t">${esc(e.nom)}<small>${e.typeNom} · ${esc(e.quartier || "")} · ${e.employes || 0}/${t.places} employé(s) · gagne ${mk(t.recette)} par jour</small></div></div>
      <div class="row"><span>Caisse</span><span style="text-align:right"><b>${mk(e.caisse)}</b>${e.plein ? ` <small style="color:var(--warn)">pleine : encaisse vite</small>` : ""}</span></div>
      <div class="two-btn"><button class="mini fill" data-cash="${e.id}" type="button" ${e.caisse < 1 ? "disabled" : ""}>Encaisser</button>
      ${e.en_vente ? `<button class="mini" data-unsell="${e.id}" type="button">Retirer de la vente (${mk(e.en_vente)})</button>` : `<button class="mini" data-sellco="${e.id}" data-price="${Math.round(t.prix * 1.2)}" type="button">Mettre en vente (${mk(Math.round(t.prix * 1.2))})</button>`}</div>
    </div>`; }).join("") + `<p style="font-size:13px;margin:8px 0 0">La caisse se remplit seule pendant ${E.plafondJours} jours, puis elle s'arrête : passe encaisser régulièrement. Chaque journée d'un employé rapporte son salaire plus 60 %.</p>`
    : `<p style="font-size:14px;margin:0 0 6px">Tu n'as pas encore d'entreprise. Ouvre un commerce ou rachète celui d'un autre joueur.</p>`;
  const market = E.aVendre.length ? E.aVendre.map(e => `<div class="item"><span class="sw">${e.icone || "🏢"}</span><div class="t">${esc(e.nom)} · ${mk(e.en_vente)}<small>${e.typeNom} · ${esc(e.quartier || "")} · vendu par ${esc(e.proprietaire || "un joueur")}</small></div>
    <button class="mini fill" data-buyco="${e.id}" type="button" ${p.makuta < e.en_vente ? "disabled" : ""}>Acheter</button></div>`).join("") : `<p style="font-size:14px;margin:0">Aucune entreprise à vendre pour l'instant.</p>`;
  const list = E.types.map(t => `<div class="item"><span class="sw">${t.icone}</span><div class="t">${t.nom} · ${mk(t.prix)}<small>${t.desc} Gagne ${mk(t.recette)} par jour.</small></div>
    <button class="mini fill" data-open="${t.id}" type="button" ${p.makuta < t.prix ? "disabled" : ""}>Ouvrir</button></div>`).join("");
  $("companies").innerHTML = mine +
    `<h2 style="font-size:16px;margin:16px 0 4px">À vendre par d'autres joueurs</h2>${market}` +
    `<h2 style="font-size:16px;margin:16px 0 4px">Ouvrir un commerce</h2><label for="co-name" style="margin-top:4px">Nom (facultatif)</label><input id="co-name" maxlength="40" placeholder="ex. Chez ${esc(p.prenom)}">${list}`;
}
$("companies").onclick = e => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  if (b.dataset.open) { b.disabled = true; return act("/api/entreprise/ouvrir", { type: b.dataset.open, nom: ($("co-name") || {}).value }, v => `Ton entreprise « ${v.ouverte} » est ouverte !`); }
  if (b.dataset.cash) return act("/api/entreprise/encaisser", { entreprise: b.dataset.cash }, v => `Tu as encaissé ${mk(v.encaisse)}.`);
  if (b.dataset.sellco) return act("/api/entreprise/vendre", { entreprise: b.dataset.sellco, prix: Number(b.dataset.price) }, () => "Ton entreprise est en vente. Les autres joueurs la voient au marché.");
  if (b.dataset.unsell) return act("/api/entreprise/vendre", { entreprise: b.dataset.unsell, prix: null }, () => "Ton entreprise n'est plus en vente.");
  if (b.dataset.buyco) { b.disabled = true; return act("/api/entreprise/acheter", { entreprise: b.dataset.buyco }, v => `Bravo, « ${v.achetee} » est à toi !`); }
};
let stateTab = "institutions";
const STATE_TABS = [["institutions", "🏛️ Institutions"], ["banque", "🏦 Banques"], ["assurance", "🩺 Santé"], ["telephone", "📱 Téléphone"], ["elections", "🗳️ Élections"], ["police", "🚓 Police"], ["impots", "🧾 Impôts"]];
const dt = t => new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
function renderState(v) {
  const p = v.perso, S = v.etat;
  $("state-tabs").innerHTML = STATE_TABS.map(([id, l]) => `<button class="tab ${id === stateTab ? "on" : ""}" data-st="${id}" type="button">${l}</button>`).join("");
  let h = "";
  if (stateTab === "institutions") {
    h = S.institutions.map(i => `<div class="item"><span class="sw">${i.icone}</span><div class="t">${i.nom}<small>${i.role}</small></div></div>`).join("") +
`<h2 style="font-size:16px;margin:16px 0 4px">L'État recrute</h2>` + S.metiersPublics.map(j => `<div class="item"><span class="sw">🎖️</span><div class="t">${j.nom}<small>${mk(j.salaire)} par journée, payé par le Trésor${j.diplome ? " · diplôme : " + j.diplome : ""} · dès ${j.minAge} ans</small></div>
        ${v.travail.metier === j.id ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Ton métier</span>` : `<button class="mini fill" data-job="${j.id}" type="button" ${p.age < j.minAge || (j.formation && !v.ecole.diplomes.includes(j.formation)) ? "disabled" : ""}>Postuler</button>`}</div>`).join("");
  } else if (stateTab === "elections") {
    const E = v.elections || {}, nomPoste = id => (S.postes.find(x => x.id === id) || {}).nom || id;
    h = (E.prochaine ? `<div class="row"><span>Élection n° ${E.cycle}</span><span>${dt(E.prochaine)}</span></div>
        <p style="font-size:13px;margin:6px 0">${E.voteOuvert ? "<b>Le vote est ouvert.</b> Choisis un candidat pour chaque poste. Les voix seront comptées à la date de l'élection." : `Le vote ouvrira le ${dt(E.ouvertureVote)} et durera 7 jours. Ensuite, une élection tous les 6 mois.`}${p.age < 18 ? " Il faut avoir 18 ans pour voter." : ""}</p>`
      : `<p style="font-size:13px;margin:0 0 6px">La première élection aura lieu 6 mois après le démarrage du jeu, puis tous les 6 mois. Tu peux déjà te porter candidat.</p>`) +
      `<h2 style="font-size:16px;margin:12px 0 4px">Se présenter</h2>` + S.postes.map(x => `<div class="item"><span class="sw">🗳️</span><div class="t">${x.nom}<small>${x.places} ${x.places > 1 ? "sièges" : "siège"} · dès ${x.minAge} ans · ${x.candidats} candidat(s)</small></div>
        ${S.candidature === x.id ? `<button class="mini" data-cand="" type="button">Retirer</button>` : `<button class="mini fill" data-cand="${x.id}" type="button" ${p.age < x.minAge ? "disabled" : ""}>Candidater</button>`}</div>`).join("") +
      `<h2 style="font-size:16px;margin:16px 0 4px">Candidats</h2>` +
      ((E.candidats || []).length ? E.candidats.map(c => { const mine = E.mesVotes && E.mesVotes[c.poste];
        return `<div class="item"><span class="sw">🗳️</span><div class="t">${esc(c.nom)}<small>${nomPoste(c.poste)} · ${esc(c.quartier || "")} · ${c.voix} voix</small></div>
        ${mine === c.id ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Ton vote</span>` : `<button class="mini fill" data-vote="${c.id}" data-poste="${c.poste}" type="button" ${!E.voteOuvert || mine || p.age < 18 ? "disabled" : ""}>Voter</button>`}</div>`; }).join("")
        : `<p style="font-size:13px;margin:0">Aucun candidat pour l'instant.</p>`) +
      ((E.elus || []).length ? `<h2 style="font-size:16px;margin:16px 0 4px">Élus en fonction</h2>` + E.elus.map(x => `<div class="item"><span class="sw">🎖️</span><div class="t">${esc(x.nom)}<small>${nomPoste(x.poste)} · élu avec ${x.voix} voix · payé par le Trésor</small></div></div>`).join("") : "");
  } else if (stateTab === "police") {
    const P = v.police;
    h = (P.prisonJusqu ? `<div class="co" style="border-color:var(--bad, #d64545)"><p style="margin:0 0 8px;font-size:14px">🔒 <b>Tu es en prison</b> jusqu'au ${dt(P.prisonJusqu)}. Pas de travail, d'école, de voyage ni d'affaires pendant ce temps.</p>
        <button class="btn" id="b-bail" type="button" ${p.makuta < P.caution ? "disabled" : ""}>Payer la caution (${mk(P.caution)})</button></div>` : "") +
      `<p style="font-size:13px;margin:0 0 6px">La police fait respecter la loi. Si elle t'attrape, tu paies une amende au Trésor. Si tu ne peux pas payer, ou après ${P.recidive.fois} infractions en ${P.recidive.jours} jours, c'est la prison pour ${P.prisonHeures} heures (sortie plus tôt avec une caution de ${mk(P.caution)}).${P.policiers ? ` ${P.policiers} joueur(s) policier(s) patrouillent : le risque augmente.` : ""}</p>
      <h2 style="font-size:16px;margin:12px 0 4px">Tentations</h2>` +
      P.crimes.map(c => `<div class="item"><span class="sw">⚠️</span><div class="t">${c.nom}<small>${c.desc} Risque actuel : ${Math.round(c.chance * 100)} %. Amende : ${mk(c.amende)}.</small></div><button class="mini" data-crime="${c.id}" type="button" ${P.prisonJusqu || p.age < 12 ? "disabled" : ""}>Tenter</button></div>`).join("") +
      `<h2 style="font-size:16px;margin:16px 0 4px">Mon casier judiciaire</h2>` +
      (P.casier.length ? P.casier.map(x => `<div class="row"><span>${new Date(x.le).toLocaleDateString("fr-FR")} · ${esc(x.nom)}</span><span>${mk(x.amende)}${x.prison_heures ? " + prison" : ""}</span></div>`).join("") : `<p style="font-size:13px;margin:0">Casier vierge. Continue comme ça !</p>`);
  } else if (stateTab === "banque") {
    h = `<div class="row"><span>Sur toi</span><span>${mk(p.makuta)}</span></div>` + S.banques.map(b => `<div class="co"><div class="item" style="border:0"><span class="sw">${b.icone}</span><div class="t">${b.nom} · <b>${mk(b.solde)}</b><small>${b.desc}</small></div></div>
      <div class="two-btn">${[[20000, `Déposer ${mk(20000)}`], [b.plafond ? Math.min(p.makuta, b.plafond - b.solde) : p.makuta, "Tout déposer"]].map(([m, l]) => `<button class="mini fill" data-dep="${b.id}" data-m="${m}" type="button" ${m < 20 || p.makuta < m || p.age < 16 ? "disabled" : ""}>${l}</button>`).join("")}
      <button class="mini" data-wd="${b.id}" data-m="${b.solde}" type="button" ${b.solde < 20 ? "disabled" : ""}>Tout retirer</button></div></div>`).join("") +
      `<p style="font-size:13px;margin:6px 0 0">La Banque centrale émet l'e-makuta (1 $ = ${S.tauxUsd} e-makuta). Masse monétaire en circulation : ${mk(S.masse)}.</p>`;
  } else if (stateTab === "assurance") {
    h = `<div class="row"><span>Santé</span><span>${p.besoins.health} / 100</span></div><div class="row"><span>Assurance</span><span>${S.assurance ? `${S.assureurs.find(a => a.id === S.assurance.id).nom} jusqu'au ${new Date(S.assurance.jusqua).toLocaleDateString("fr-FR")}` : "aucune"}</span></div>
      <button class="btn" id="b-care" type="button" ${p.besoins.health >= 95 ? "disabled" : ""}>Se soigner au centre de santé (${mk(S.soins.prix)}${S.soins.assure ? ", assuré" : ""})</button>
      <h2 style="font-size:16px;margin:16px 0 4px">Assurances santé</h2>` + S.assureurs.map(a => `<div class="item"><span class="sw">${a.icone}</span><div class="t">${a.nom} · ${mk(a.prime)} / semaine<small>${a.desc}</small></div><button class="mini fill" data-ins="${a.id}" type="button" ${p.makuta < a.prime ? "disabled" : ""}>${S.assurance && S.assurance.id === a.id ? "Prolonger" : "Souscrire"}</button></div>`).join("");
  } else if (stateTab === "telephone") {
    const hasPhone = (v.inventaire || []).some(x => (v.boutique.find(b => b.id === x.objet) || {}).type === "telephone");
    h = `<div class="row"><span>Crédit</span><span>${mk(S.credit)}${S.operateur ? " · " + S.operateurs.find(o => o.id === S.operateur).nom : ""}</span></div>
      <button class="btn" id="b-call" type="button" ${!hasPhone || S.credit < S.appel.prix ? "disabled" : ""}>Appeler ma famille (${mk(S.appel.prix)}, +${S.appel.bonheur} bonheur)</button>
      ${hasPhone ? "" : `<p style="font-size:13px;margin:8px 0 0">Achète d'abord un téléphone au magasin.</p>`}
      <h2 style="font-size:16px;margin:16px 0 4px">Recharger chez un opérateur</h2>` + S.operateurs.map(o => `<div class="item"><span class="sw" style="background:${o.couleur}">📶</span><div class="t">${o.nom}</div><div class="two-btn" style="margin:0">${S.recharges.map(m => `<button class="mini fill" data-rech="${o.id}" data-m="${m}" type="button" ${p.makuta < m ? "disabled" : ""}>${mk(m)}</button>`).join("")}</div></div>`).join("");
  } else {
    h = `<div class="row"><span>Trésor public</span><span>${mk(S.tresor)}</span></div>
      <div class="row"><span>Impôt sur le salaire (DGI)</span><span>${S.impots.salaire * 100} %</span></div>
      <div class="row"><span>Impôt sur les recettes des entreprises (DGI)</span><span>${S.impots.recettes * 100} %</span></div>
      <div class="row"><span>Droits de douane sur les téléphones (DGDA)</span><span>${S.impots.douane * 100} %</span></div>
      <p style="font-size:13px;margin:8px 0 0">Les impôts sont prélevés automatiquement. Ils paient les salaires publics (policiers, agents) et, plus tard, les écoles et les routes. Les députés pourront voter d'autres taux.</p>`;
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
    <h2 style="font-size:16px;margin:14px 0 6px">Autres villes</h2><div class="chips">${V.villes.map(c => `<button class="chip" type="button" disabled>${c} · bientôt</button>`).join("")}</div>`;
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
function renderOrders(v) {
  const C = v.consignes, left = C.max - C.liste.length, name = id => (C.catalogue.find(o => o.id === id) || {});
  const N = v.notifications || {};
  $("orders").innerHTML = `<button class="mini ${N.actives ? "" : "fill"}" id="b-notif" type="button" style="float:right;margin:0 0 6px 8px">${N.actives ? "🔕 Couper les notifications" : "🔔 Me prévenir"}</button><p style="font-size:14px;margin:0 0 8px">Dis à ${esc(v.perso.prenom)} quoi faire aujourd'hui. ${esc(v.perso.prenom)} suit tes consignes toute la journée, même quand tu n'es pas connecté (vérification toutes les ${C.verifieToutesLesMinutes} minutes). <b>${C.max} consignes par jour</b>, et une consigne donnée ne se retire pas avant demain.</p>` +
    (C.liste.length ? C.liste.map(id => `<div class="item"><span class="sw">${name(id).icone}</span><div class="t">${name(id).nom}<small>${name(id).desc}</small></div><span class="mini" style="border-color:var(--ok);color:var(--ok)">Active</span></div>`).join("") : "") +
    (left > 0 ? `<h2 style="font-size:16px;margin:12px 0 6px">Donner une consigne (encore ${left})</h2><div class="chips">${C.catalogue.filter(o => !C.liste.includes(o.id)).map(o => `<button class="chip" data-order="${o.id}" type="button">${o.icone} ${o.nom}</button>`).join("")}</div>`
      : `<p style="font-size:13px;margin:10px 0 0">Tu as donné tes ${C.max} consignes du jour. Nouvelles consignes demain à minuit (heure de Kinshasa).</p>`) +
    (C.journal.length ? `<h2 style="font-size:16px;margin:14px 0 4px">Fait aujourd'hui</h2>` + C.journal.slice(0, 8).map(j => `<div class="row"><span>${new Date(j.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · ${esc(j.message)}</span><span>${j.ok ? "✅" : "⏳"}</span></div>`).join("") : "");
}
$("orders").addEventListener("click", async e => {
  if (e.target.id !== "b-notif") return;
  const on = !(state.notifications || {}).actives;
  try { render(await (on ? notifOn() : notifOff())); toast(on ? "Tu recevras une notification sur ce téléphone à chaque consigne faite." : "Notifications coupées."); } catch (err) { toast(err.message); }
});
$("orders").onclick = e => { const b = e.target.closest("[data-order]"); if (b) { b.disabled = true; act("/api/consigne", { ordre: b.dataset.order }, v => { const j = v.consignes.journal[0]; return "Consigne donnée." + (j && j.ordre === b.dataset.order && Date.now() - j.le < 60e3 ? " " + j.message : ""); }); } };
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
      <button class="btn" id="b-study" type="button" ${wait || p.besoins.energy < sc.fatigueCours ? "disabled" : ""}>Aller en cours${f.fraisCours ? ` (${mk(f.fraisCours)})` : ""}</button>
      <p style="font-size:13px;margin:8px 0 0">${wait ? `Prochain cours dans ${fmtWait(enr.prochainCours - Date.now())}.` : `Un cours fatigue (−${sc.fatigueCours} énergie).`} Il faut ${sc.moyenneRequise}/100 de moyenne pour passer.${f.parents ? " Les frais sont payés par tes parents." : ""}</p>`;
  } else if (p.age < 6) head = `<p style="font-size:14px;margin:0">${p.prenom} entrera à l'école primaire à 6 ans.</p>`;
  else head = `<p style="font-size:14px;margin:0">Aucune formation en cours. Choisis une école ci-dessous.</p>`;
  const list = sc.formations.map(x => {
    const done = sc.diplomes.includes(x.id);
    const lock = done ? "" : enr ? "" : x.requis && !sc.diplomes.includes(x.requis) ? `après : ${sc.formations.find(y => y.id === x.requis).diplome}` : p.age < x.minAge ? `dès ${x.minAge} ans` : "";
    const fee = x.parents ? "payée par les parents" : `${mk(x.fraisAn)} par an`;
    const btn = done ? `<span class="mini" style="border-color:var(--ok);color:var(--ok)">Diplômé</span>` : enr && enr.formation === x.id ? `<span class="mini">En cours</span>` : `<button class="mini fill" data-enroll="${x.id}" type="button" ${lock || enr ? "disabled" : ""}>S'inscrire</button>`;
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
    <button class="btn" id="b-host" type="button" style="margin-top:0" ${p.age < 20 ? "disabled" : ""}>${p.accueil ? "Ne plus accueillir d'enfant" : "Accueillir un enfant"}</button>
    ${p.age < 20 ? `<p style="font-size:13px;margin:8px 0 0">Possible à partir de 20 ans.</p>` : ""}
    ${v.demo && p.accueil ? `<button class="mini" id="b-demo-baby" type="button" style="margin-top:10px">Simuler l'inscription d'un bébé (démo)</button>` : ""}`;
  const list = kids.map(k => {
    const food = k.age < 4 ? "lait" : "fufu", it = v.boutique.find(x => x.id === food);
    const low = k.besoins.hunger < 40 || k.besoins.health < 60;
    return `<div class="item"><span class="sw">${k.age < 3 ? "👶" : k.sexe === "F" ? "👧" : "👦"}</span><div class="t">${k.prenom} ${k.nom} · ${fmtAge(k.age)} (${k.etapeLabel})
      <small>Faim ${k.besoins.hunger} · Santé ${k.besoins.health} · Bonheur ${k.besoins.happiness} · ${mk(k.makuta)}${k.prochainEntretien ? ` · prochain entretien dans ${fmtWait(k.prochainEntretien - Date.now())}` : " · adulte"}${low ? " · <b style='color:var(--warn)'>a besoin de toi</b>" : ""}</small></div>
      <button class="mini fill" data-feed="${k.id}" data-food="${food}" type="button" ${p.makuta < it.prix ? "disabled" : ""}>Nourrir (${mk(it.prix)})</button></div>
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
  if (e.target.id === "b-work") act("/api/travailler", {}, v => `Journée terminée : +${mk(v.paie.montant - v.paie.famille)}${v.paie.bonus ? " (bonus talent)" : ""}, et ${mk(v.paie.famille)} pour tes parents.`);
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
$("wallet").onclick = e => {
  const b = e.target.closest("[data-inv]");
  if (b) { const o = state.portefeuille.offres.find(x => x.id === b.dataset.inv); return act("/api/investir", { offre: o.id }, v => `Investissement simulé : ${mk(o.usd * USD_UNITS)} ajoutés. Retrait possible après 3 mois.`); }
  if (e.target.id === "b-withdraw") act("/api/retirer", { makuta: state.perso.makuta }, v => `Demande de retrait simulée : ${usd(v.portefeuille.retraits.at(-1).usd)}.`);
};

let launch = null;
async function showLaunch() {
  try { launch = await call("/api/lancement"); } catch (e) { launch = null; }
  const box = $("launch"); box.hidden = !signup || !launch || launch.demarre;
  document.querySelectorAll("input[name=formule]").forEach(i => {
    const closed = launch && !launch.demarre && !canSignupBeforeLaunch(i.value);
    i.disabled = closed; i.closest(".offer").classList.toggle("closed", closed);
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
document.querySelectorAll("input[name=formule]").forEach(i => i.onchange = authLabel);
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
