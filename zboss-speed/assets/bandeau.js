// 2 Life : bandeau défilant en bas de l'écran. Annonces des partenaires (avec accord écrit), promotions et ambassadeurs des
// entreprises du jeu, résultats du championnat, communiqués et décisions publiques, Trésor, élections, une du journal.
// Mode réel : /api/bandeau (mis à jour chaque minute). Démo : mêmes règles, avec les données de ce navigateur.
import { tickerItems, adShownIn, STATE_SEED, newspaper } from "../server/src/life.js";

const API = (window.TWO_LIFE_API || "").replace(/\/$/, "");
const read = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

const css = document.createElement("style");
css.textContent = `
  .bandeau { position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; display: flex; align-items: center; gap: 10px; height: calc(34px + env(safe-area-inset-bottom)); padding: 0 0 env(safe-area-inset-bottom);
    background: #0b0806; border-top: 1px solid #f2a33a; color: #f7efe7; font: 500 13px/1 Inter, system-ui, sans-serif; }
  .bandeau .live { flex: none; margin-left: 10px; padding: 4px 8px; border-radius: 6px; background: #e0603a; color: #1b120b; font-weight: 700; font-size: 11px; letter-spacing: .4px; }
  .bandeau .track { flex: 1; min-width: 0; overflow: hidden; height: 34px; display: flex; align-items: center; }
  .bandeau .run { display: inline-flex; gap: 34px; white-space: nowrap; padding-left: 100%; animation: bandeau-run var(--d, 60s) linear infinite; }
  .bandeau:hover .run, .bandeau:focus-within .run { animation-play-state: paused; }
  .bandeau .it b { font-weight: 700; } .bandeau .it.pub b { color: var(--c, #ffd23f); } .bandeau .it .bd-tag { opacity: .6; font-size: 11px; margin-right: 4px; }
  .bandeau .one { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; }
  @keyframes bandeau-run { to { transform: translateX(-100%); } }
  body.has-bandeau:not(.walk) { padding-bottom: calc(34px + env(safe-area-inset-bottom)); }
  body.has-bandeau .p-car, body.has-bandeau .p-speed, body.has-bandeau .prompt, body.has-bandeau .touch, body.has-bandeau .toast { margin-bottom: 36px; }
`;
document.head.appendChild(css);

const bar = document.createElement("div");
bar.className = "bandeau"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Annonces et décisions publiques");
bar.innerHTML = `<span class="live">EN DIRECT</span><div class="track" tabindex="0"></div>`;
document.body.appendChild(bar); document.body.classList.add("has-bandeau");
const track = bar.querySelector(".track");

function demoItems() {
  const now = Date.now(), d = read("twolife_demo") || {};
  const pubs = (read("twolife_demo_pubs") || []).filter(a => a.actif && a.debut <= now && a.fin > now && adShownIn(a, "bandeau"));
  const communiques = (read("twolife_demo_communiques") || []).filter(c => c.actif && c.debut <= now && c.fin > now);
  const tresor = STATE_SEED + (d.tresor || 0) + (d.tva || 0);
  const campagnes = (d.campagnes || []).filter(c => c.fin > now);
  const foot = d.foot || [], matchs = foot.length ? foot.filter(m => m.jour === foot[0].jour) : [];
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
  track.innerHTML = `<div class="run" style="--d:${Math.max(30, Math.round(chars / 7))}s">${items.map(html).join("")}</div>`;
}
async function load() {
  try {
    if (API) { const r = await fetch(API + "/api/bandeau"); items = r.ok ? ((await r.json()).items || []) : items; }
    else items = demoItems();
  } catch (e) { }
  draw();
}
load(); setInterval(load, 5 * 60e3);
addEventListener("storage", e => { if (!API && e.key && e.key.startsWith("twolife_demo")) load(); });
window.TWO_LIFE_BANDEAU = { reload: load };
