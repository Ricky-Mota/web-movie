// 2 Life : conditions de lancement en mode démo (sans serveur). Mêmes règles que le serveur (server/src/life.js).
import { launchStatus, canSignupBeforeLaunch, OFFERS, rng, newIdentity, COMPANY_TYPES, POSTS, ELECTION_EVERY, electionCalendar } from "../server/src/life.js";

const KEY = "twolife_launch";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
const write = L => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { } };
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export const launchDemo = {
  get() { return { parents: [], investisseurs: [], entreprises: [], demarreLe: null, dateOuverture: null, ...(read() || {}) }; },
  save: write,
  status(L = this.get()) {
    const now = Date.now();
    const S = launchStatus({ parents: L.parents.length, investisseurs: new Set(L.investisseurs.map(i => i.email)).size, entreprises: L.entreprises.length }, L.demarreLe, L.dateOuverture, now);
    if (!S.demarre && S.pret) { L.demarreLe = now; write(L); return { ...S, demarre: true, demarreLe: now }; } // démarrage automatique
    return S;
  },
  // message identique au serveur quand une inscription arrive trop tôt
  refusal(formule) {
    const S = this.status();
    if (S.demarre || canSignupBeforeLaunch(formule)) return null;
    const miss = S.conditions.filter(c => !c.ok).map(c => `${c.label.toLowerCase()} : ${c.actuel}/${c.min}`).join(", ");
    return `Le jeu n'a pas encore démarré (${miss || "en attente du lancement"}). Les investisseurs peuvent déjà s'inscrire.`;
  },
  addInvestor(pseudo, email, offre) {
    const L = this.get(), o = OFFERS.find(x => x.id === offre);
    L.investisseurs.push({ pseudo, email, offre, usd: o.usd, le: Date.now() }); write(L);
  },
  // élections en démo : candidats = parents fondateurs (+ le joueur), voix simulées, mêmes dates que le serveur
  elections(me) {
    const L = this.get(), now = Date.now(), S = this.status(L);
    if (!S.demarre) return { ...electionCalendar(null, 0, now), candidats: [], elus: [], mesVotes: {} };
    const E = L.elec || (L.elec = { date: S.demarreLe + ELECTION_EVERY, cycle: 1, votes: {}, elus: [] });
    const cands = () => {
      const list = L.parents.slice(0, 9).map((p, i) => ({ id: "fondateur-" + i, poste: POSTS[i % POSTS.length].id, nom: `${p.prenom} ${p.nom}`, quartier: p.quartier, voix: (i * 5 + E.cycle * 3) % 4 }));
      if (me && me.candidature) list.push({ id: "moi", poste: me.candidature, nom: me.nom, quartier: me.quartier, voix: 0, moi: true });
      return list.map(c => ({ ...c, voix: c.voix + (E.votes[c.poste] === c.id ? 1 : 0) })).sort((a, b) => b.voix - a.voix);
    };
    let depouille = false, gagne = null;
    while (now >= E.date) {   // dépouillement
      const list = cands();
      E.elus = POSTS.flatMap(po => list.filter(c => c.poste === po.id && c.voix > 0).slice(0, po.places).map(c => ({ poste: po.id, voix: c.voix, nom: c.nom, moi: !!c.moi })));
      gagne = (E.elus.find(x => x.moi) || {}).poste || null; depouille = true;
      E.votes = {}; E.date += ELECTION_EVERY; E.cycle += 1; if (me) me = { ...me, candidature: null };
    }
    write(L);
    return { ...electionCalendar(E.date, E.cycle, now), candidats: cands(), elus: E.elus, mesVotes: { ...E.votes }, depouille, gagne };
  },
  vote(poste, candidat) { const L = this.get(); if (L.elec) { L.elec.votes[poste] = candidat; write(L); } },
  addCompany(e) { const L = this.get(); L.entreprises.push(e); write(L); },
  // routes /api/admin/* simulées (en démo, l'espace administrateur est ouvert à tous)
  admin(path, body) {
    const L = this.get();
    const etat = () => ({ lancement: this.status(L), elections: this.elections(), parents: L.parents, investisseurs: L.investisseurs, entreprises: L.entreprises, demo: true });
    if (path === "/api/admin/etat") return { ...etat(), elections: this.elections() };
    if (path === "/api/admin/election") {
      const d = Number(body.date);
      if (!Number.isFinite(d) || d < Date.now()) throw new Error("Choisis une date à venir.");
      if (!this.status(L).demarre) throw new Error("Les élections commencent après le démarrage du jeu.");
      this.elections(); const M = this.get(); M.elec.date = Math.round(d); write(M);
      return { ok: true, elections: this.elections() };
    }
    if (path === "/api/admin/parent") {
      const email = String(body.email || "").trim().toLowerCase(), pseudo = String(body.pseudo || "").trim().slice(0, 40);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
      if (pseudo.length < 2) throw new Error("Choisis un pseudo d'au moins 2 caractères.");
      if (String(body.motdepasse || "").length < 8) throw new Error("Le mot de passe doit faire au moins 8 caractères.");
      if (L.parents.some(p => p.email === email)) throw new Error("Un compte existe déjà avec cette adresse.");
      const who = newIdentity(rng(seed()));
      L.parents.push({ pseudo, email, prenom: who.firstName, nom: who.lastName, sexe: who.sex, quartier: who.quartier, cree_le: Date.now() });
      write(L); return { ok: true, ...etat() };
    }
    if (path === "/api/admin/date") {
      const d = Number(body.date);
      if (!Number.isFinite(d) || d < Date.now() - 864e5) throw new Error("Choisis une date à venir.");
      if (this.status(L).demarre) throw new Error("Le jeu a déjà démarré.");
      L.dateOuverture = Math.round(d); write(L); return { ok: true, ...etat() };
    }
    if (path === "/api/admin/demarrer") {
      const S = this.status(L);
      if (S.demarre) throw new Error("Le jeu a déjà démarré.");
      if (!S.pret) throw new Error("Toutes les conditions ne sont pas encore réunies.");
      L.demarreLe = Date.now(); write(L); return { ok: true, ...etat() };
    }
    if (path === "/api/admin/remplir") { // démo uniquement : complète les listes pour montrer le démarrage
      const r = rng(seed());
      while (L.parents.length < 20) {
        const w = newIdentity(r), n = L.parents.length + 1;
        L.parents.push({ pseudo: `${w.firstName}${n}`, email: `parent${n}@demo.2life`, prenom: w.firstName, nom: w.lastName, sexe: w.sex, quartier: w.quartier, cree_le: Date.now() });
      }
      while (new Set(L.investisseurs.map(i => i.email)).size < 10) {
        const w = newIdentity(r), n = L.investisseurs.length + 1, o = OFFERS.find(x => x.id === (n % 4 ? "petit" : "grand"));
        L.investisseurs.push({ pseudo: `${w.lastName}${n}`, email: `investisseur${n}@demo.2life`, offre: o.id, usd: o.usd, le: Date.now() });
      }
      while (L.entreprises.length < 20) {
        const t = COMPANY_TYPES[L.entreprises.length % 5], w = newIdentity(r);
        L.entreprises.push({ nom: `${t.nom} ${w.lastName}`, type: t.id, quartier: w.quartier, proprietaire: `${w.firstName} ${w.lastName}`, cree_le: Date.now() });
      }
      if (!L.dateOuverture) L.dateOuverture = Date.now() + 2 * 60e3; // démo : ouverture dans 2 minutes
      write(L); return etat();
    }
    if (path === "/api/admin/reinitialiser") { write(null); localStorage.removeItem(KEY); return { ok: true, lancement: this.status(), parents: [], investisseurs: [], entreprises: [], demo: true }; }
    throw new Error("Route inconnue.");
  },
};
