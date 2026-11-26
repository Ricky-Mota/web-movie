// 2 Life : bandeau défilant en bas de l'écran. Annonces des partenaires (avec accord écrit), promotions et ambassadeurs des
// entreprises du jeu, résultats du championnat, communiqués et décisions publiques, Trésor, élections, une du journal.
// Mode réel : /api/bandeau (mis à jour chaque minute). Démo : mêmes règles, avec les données de ce navigateur.
import { tickerItems, adShownIn, STATE_SEED, newspaper } from "../server/src/life.js";

const API = (window.TWO_LIFE_API || "").replace(/\/$/, "");
const read = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

const H = 60;   // hauteur du bandeau (px), 52 sur petit écran
const css = document.createElement("style");
css.textContent = `
  .bandeau { --bh: ${H}px; position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; display: flex; align-items: center; gap: 10px; height: calc(var(--bh) + env(safe-area-inset-bottom)); padding: 0 0 env(safe-area-inset-bottom);
    background: #0b0806; border-top: 2px solid #f2a33a; color: #f7efe7; font: 500 17px/1.2 Inter, system-ui, sans-serif; box-shadow: 0 -6px 18px rgba(0,0,0,.35); }
  .bandeau .live { flex: none; margin-left: 10px; padding: 6px 10px; border-radius: 7px; background: #e0603a; color: #1b120b; font-weight: 800; font-size: 13px; letter-spacing: .5px; display: flex; align-items: center; gap: 6px; }
  .bandeau .live::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #1b120b; animation: bandeau-blink 1.2s ease-in-out infinite; }
  .bandeau .logos { flex: none; position: relative; width: 150px; height: calc(var(--bh) - 12px); border-radius: 8px; background: #fff; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(242,163,58,.6); }
  .bandeau .logos .lg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 4px 6px; transform: translateY(100%); opacity: 0; transition: transform .6s ease, opacity .6s ease; }
  .bandeau .logos .lg.on { transform: none; opacity: 1; } .bandeau .logos .lg.out { transform: translateY(-100%); opacity: 0; }
  .bandeau .logos img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  .bandeau .logos .txt { color: #1b120b; font: 800 12px/1.1 Inter, system-ui, sans-serif; text-align: center; }
  .bandeau .track { flex: 1; min-width: 0; overflow: hidden; height: var(--bh); display: flex; align-items: center; }
  .bandeau .run { display: inline-flex; gap: 48px; white-space: nowrap; padding-left: 100%; animation: bandeau-run var(--d, 60s) linear infinite; }
  .bandeau:hover .run, .bandeau:focus-within .run { animation-play-state: paused; }
  .bandeau .it b { font-weight: 800; } .bandeau .it.pub b { color: var(--c, #ffd23f); } .bandeau .it .bd-tag { opacity: .65; font-size: 12px; margin-right: 6px; text-transform: uppercase; letter-spacing: .4px; }
  .bandeau .one { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
  @keyframes bandeau-run { to { transform: translateX(-100%); } }
  @keyframes bandeau-blink { 50% { opacity: .25; } }
  @media (max-width: 520px) { .bandeau { --bh: 52px; font-size: 15px; gap: 8px; } .bandeau .live { margin-left: 6px; padding: 5px 7px; font-size: 11px; } .bandeau .logos { width: 92px; } }
  body.has-bandeau:not(.walk) { padding-bottom: calc(${H}px + env(safe-area-inset-bottom)); }
  body.has-bandeau .p-car, body.has-bandeau .p-speed, body.has-bandeau .prompt, body.has-bandeau .touch, body.has-bandeau .toast { margin-bottom: ${H + 4}px; }
`;
document.head.appendChild(css);

const bar = document.createElement("div");
bar.className = "bandeau"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Annonces, partenaires et décisions publiques");
bar.innerHTML = `<span class="live">EN DIRECT</span><div class="logos" aria-label="Logos des partenaires"></div><div class="track" tabindex="0"></div>`;
document.body.appendChild(bar); document.body.classList.add("has-bandeau");
const track = bar.querySelector(".track"), logoBox = bar.querySelector(".logos");

// logos d'exemple (noms inventés) pour l'aperçu sans partenaire signé
const badge = (t1, t2, bg, fg) => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80"><rect width="200" height="80" rx="10" fill="${bg}"/><text x="100" y="36" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="24" fill="${fg}" text-anchor="middle">${t1}</text><text x="100" y="62" font-family="Arial,Helvetica,sans-serif" font-weight="600" font-size="15" fill="${fg}" text-anchor="middle" opacity=".85">${t2}</text></svg>`);
const DEMO_LOGOS = [
  { nom: "Maquis Ya Mado (exemple)", logo: badge("YA MADO", "maquis · Kalamu", "#ffd23f", "#1b120b") },
  { nom: "Boutique Mama Nzazi (exemple)", logo: badge("NZAZI", "boutique · Matonge", "#1f8a4c", "#ffffff") },
  { nom: "Mwinda, électricité publique", logo: badge("MWINDA", "électricité publique", "#18324f", "#ffd23f") },
  { nom: "Votre logo ici", logo: badge("VOTRE LOGO", "partenaire 2 Life", "#e0603a", "#1b120b") },
];
let logos = [], lgTimer = null, lgAt = 0;
function drawLogos() {
  clearInterval(lgTimer);
  const L = logos.length ? logos : [{ nom: "Votre logo ici", txt: "VOTRE LOGO ICI" }];
  logoBox.innerHTML = L.map((l, i) => `<div class="lg${i === 0 ? " on" : ""}" title="${esc(l.nom)}">${l.logo ? `<img src="${esc(l.logo)}" alt="${esc(l.nom)}">` : `<span class="txt">${esc(l.txt || l.nom)}</span>`}</div>`).join("");
  lgAt = 0; if (L.length < 2) return;
  const els = [...logoBox.children];
  lgTimer = setInterval(() => {
    const cur = els[lgAt % els.length], nxt = els[(lgAt + 1) % els.length]; lgAt++;
    cur.classList.remove("on"); cur.classList.add("out");
    nxt.classList.remove("out"); nxt.style.transition = "none"; nxt.style.transform = "translateY(100%)"; void nxt.offsetWidth; nxt.style.transition = ""; nxt.style.transform = ""; nxt.classList.add("on");
    setTimeout(() => cur.classList.remove("out"), 700);
  }, still ? 6000 : 3000);
}

function demoItems() {
  const now = Date.now(), d = read("twolife_demo") || {};
  const pubs = (read("twolife_demo_pubs") || []).filter(a => a.actif && a.debut <= now && a.fin > now && adShownIn(a, "bandeau"));
  const communiques = (read("twolife_demo_communiques") || []).filter(c => c.actif && c.debut <= now && c.fin > now);
  const tresor = STATE_SEED + (d.tresor || 0) + (d.tva || 0);
  const campagnes = (d.campagnes || []).filter(c => c.fin > now);
  const foot = d.foot || [], matchs = foot.length ? foot.filter(m => m.jour === foot[0].jour) : [];
  // aperçu sans données : quelques exemples (noms inventés) pour montrer à quoi ressemble le bandeau
  if (!pubs.length && !communiques.length && !campagnes.length) {
    pubs.push({ titre: "Poulet mayo à 2 pour 1", annonceur: "Maquis Ya Mado", texte: "ce vendredi soir à Kalamu (exemple)", couleur: "#ffd23f" },
      { titre: "Votre annonce ici", annonceur: "Partenaire (exemple)", texte: "banques, opérateurs, brasseries, assurances : avec accord écrit signé", couleur: "#18e0ff" });
    communiques.push({ auteur: "Mairie de Kinshasa", texte: "Salongo ce samedi de 7 h à 10 h : chaque commune nettoie ses rues (exemple)." },
      { auteur: "Mwinda, électricité publique", texte: "Coupure prévue à Limete demain de 9 h à 12 h pour travaux (exemple)." });
    campagnes.push({ entreprise: "Boutique Mama Nzazi", ambassadeur: "Gloria Tshibola", fem: true, slogan: "La qualité au prix du quartier (exemple)" });
  }
  if (!matchs.length) matchs.push({ dom_nom: "Simba ya Kin", buts_dom: 2, buts_ext: 1, ext_nom: "Étoile de Ndjili" }, { dom_nom: "Lemba Sporting", buts_dom: 0, buts_ext: 0, ext_nom: "Bandal Olympique" });
  return tickerItems({ pubs, communiques, tresor, impotsJour: (d.tva || 0) + Math.max(0, d.tresor || 0), salairesJour: 0, une: newspaper({}, now).une, campagnes, matchs }, now);
}
const label = { pub: "Annonce", communique: "Communiqué", etat: "État", journal: "Journal", sport: "Sport" };
let items = [], rot = 0, rotTimer = null;
function draw() {
  if (!items.length) { bar.hidden = true; document.body.classList.remove("has-bandeau"); return; }
  bar.hidden = false; document.body.classList.add("has-bandeau");
  const html = it => `<span class="it ${it.type}" style="--c:${esc(it.couleur || "#ffd23f")}"><span class="bd-tag">${label[it.type] || ""}</span>${esc(it.icone)} <b>${esc(it.texte.split(" : ")[0])}</b>${it.texte.includes(" : ") ? " : " + esc(it.texte.split(" : ").slice(1).join(" : ")) : ""}</span>`;
  clearInterval(rotTimer);
  if (still) {   // mouvement réduit : un message à la fois, qui change toutes les 7 secondes
    const show = () => { track.innerHTML = `<div class="one">${html(items[rot++ % items.length])}</div>`; };
    show(); rotTimer = setInterval(show, 7000); return;
  }
  const chars = items.reduce((t, it) => t + it.texte.length, 0);
  track.innerHTML = `<div class="run" style="--d:${Math.max(35, Math.round(chars / 5.5))}s">${items.map(html).join("")}</div>`;
}
async function load() {
  try {
    if (API) { const r = await fetch(API + "/api/bandeau"); if (r.ok) { const j = await r.json(); items = j.items || []; logos = j.logos || []; } }
    else { items = demoItems(); const L = (read("twolife_demo_logos") || []).filter(l => l.actif && l.fin > Date.now()); logos = L.length ? L : DEMO_LOGOS; }
  } catch (e) { }
  draw(); const sig = logos.map(l => l.nom + (l.logo || "").length).join("|"); if (sig !== drawLogos.sig) { drawLogos.sig = sig; drawLogos(); }
}
load(); setInterval(load, 5 * 60e3);
addEventListener("storage", e => { if (!API && e.key && e.key.startsWith("twolife_demo")) load(); });
window.TWO_LIFE_BANDEAU = { reload: load };
