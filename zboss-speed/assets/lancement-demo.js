// 2 Life : conditions de lancement en mode démo (sans serveur). Mêmes règles que le serveur (server/src/life.js).
import { launchStatus, canSignupBeforeLaunch, OFFERS, rng, newIdentity } from "../server/src/life.js";

const KEY = "twolife_launch";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
const write = L => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (e) { } };
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export const launchDemo = {
  get() { return read() || { parents: [], investisseurs: [], demarreLe: null }; },
  save: write,
  status(L = this.get()) {
    return launchStatus({ parents: L.parents.length, investisseurs: new Set(L.investisseurs.map(i => i.email)).size }, L.demarreLe);
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
  // routes /api/admin/* simulées (en démo, l'espace administrateur est ouvert à tous)
  admin(path, body) {
    const L = this.get();
    const etat = () => ({ lancement: this.status(L), parents: L.parents, investisseurs: L.investisseurs, demo: true });
    if (path === "/api/admin/etat") return etat();
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
      write(L); return etat();
    }
    if (path === "/api/admin/reinitialiser") { write(null); localStorage.removeItem(KEY); return { ok: true, lancement: this.status(), parents: [], investisseurs: [], demo: true }; }
    throw new Error("Route inconnue.");
  },
};
