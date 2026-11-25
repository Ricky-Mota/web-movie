// 2 Life : les célébrités de la ville. Le serveur choisit chaque jour les personnalités et raconte leur parcours ;
// sans serveur (mode démo), le navigateur applique les mêmes règles (server/src/life.js).
import { pickCelebrities, celebStory, celebFromMoves, celebClean, ageYears } from "../server/src/life.js";

const API = (window.TWO_LIFE_API || "").replace(/\/$/, "");
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS_FOLLOW = "twolife_celebs_suivies";
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };

let data = null, domain = "tous", openId = null, tab = "parcours";

// mode démo : personnages du jeu, plus ton personnage s'il est élu
function demoData() {
  const now = Date.now(), cands = {};
  const d = store.get("twolife_demo", null);
  if (d && d.perso && !d.mort && String(d.job || "").startsWith("elu-")) {
    const p = d.perso, poste = d.job.slice(4), T = { president: ["Président de la République", "Présidente de la République"], senateur: ["Sénateur", "Sénatrice"], depute: ["Député national", "Députée nationale"] }[poste];
    cands.politique = [{ id: "moi", prenom: p.firstName, nom: (p.lastName || "").charAt(0) + ".", sexe: p.sex, quartier: p.quartier, age: Math.floor(ageYears(p.neLe, now)), rep: d.rep || 0, titre: T ? T[p.sex === "F" ? 1 : 0] : undefined, moi: true }];
  }
  const L = pickCelebrities(cands, now);
  for (const c of L.celebrites) {
    if (c.pnj) Object.assign(c, celebStory(c, hash(c.id + L.jour.slice(0, 7))));
    else { const mv = (d && d.mouvements) || []; Object.assign(c, celebFromMoves(c, mv, now), { actualites: mv.slice(0, 4).map(m => ({ icone: m.icone, texte: celebClean(m.texte) })) }); }
  }
  return { ...L, demo: true };
}
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

async function load() {
  if (API) try { const r = await fetch(API + "/api/celebrites"); if (r.ok) return await r.json(); } catch (e) { }
  return demoData();
}

const initials = c => (c.prenom || "?").charAt(0) + (c.nom || "").charAt(0);
const avatar = (c, sm) => `<div class="av${sm ? " sm" : ""}" style="background:${c.couleur}">${esc(initials(c))}<i>${c.icone}</i></div>`;
const list = () => data.celebrites.filter(c => domain === "tous" || c.domaine === domain);
const sub = c => `${esc(c.titre)}${c.age ? " · " + c.age + " ans" : ""}${c.quartier ? " · " + esc(c.quartier) : ""}`;
const badge = c => c.joueur ? `<span class="badge real">${c.moi ? "Ton personnage" : "Joueur réel"}</span>` : `<span class="badge">Personnage du jeu</span>`;

function renderMenu() {
  const n = id => data.celebrites.filter(c => c.domaine === id).length;
  $("pick").innerHTML = data.domaines.map(d => `<button class="dom" type="button" data-dom="${d.id}" aria-pressed="${domain === d.id}"><span class="ic">${d.icone}</span><b>${esc(d.nom)}</b><small>${n(d.id)} célébrités</small></button>`).join("");
  $("go").textContent = domain === "tous" ? "Découvrir leurs histoires" : `Voir : ${data.domaines.find(d => d.id === domain).nom}`;
  if (data.demo) $("menu-note").textContent = "Démo : personnages du jeu aux noms inventés. Avec le serveur, les vrais joueurs devenus célèbres passent en premier.";
}
function renderList() {
  const u = data.celebrites.find(c => c.id === data.aLaUne) || data.celebrites[0], h = (u.difficultes || [])[0];
  $("une").innerHTML = `<div class="une">${avatar(u)}<div><div class="kicker">${u.icone} ${esc(u.domaineNom)} · histoire du jour</div><h3>${esc(u.prenom)} ${esc(u.nom)}</h3><div style="color:var(--muted);font-size:14px">${sub(u)}</div>
    ${u.citation && !u.vraieVie ? `<q>${esc(u.citation.replace(/[«»]/g, "").trim())}</q>` : ""}${h ? `<p>${h.date ? `Dernière épreuve, le <b style="color:var(--text)">${esc(h.titre)}</b> : ` : `Sa plus grande épreuve : <b style="color:var(--text)">${esc(h.titre)}</b>. `}${esc(h.texte)}</p>` : ""}
    <button class="btn btn-primary" type="button" data-open="${esc(u.id)}">Lire son histoire</button></div></div>`;
  const follow = store.get(LS_FOLLOW, []);
  $("chips").innerHTML = [{ id: "tous", nom: "Toutes", icone: "⭐" }, ...data.domaines].map(d => `<button class="chip" type="button" data-chip="${d.id}" aria-pressed="${domain === d.id}">${d.icone} ${esc(d.nom)}</button>`).join("");
  $("grid").innerHTML = list().map(c => `<button class="celeb" type="button" data-open="${esc(c.id)}">${avatar(c, true)}<span><b>${esc(c.prenom)} ${esc(c.nom)}${follow.includes(c.id) ? " ★" : ""}</b><small>${sub(c)}</small>${badge(c)}</span></button>`).join("") || `<p class="empty">Personne dans cette catégorie aujourd'hui.</p>`;
}
const TABS = [["parcours", "Parcours"], ["difficultes", "Difficultés"], ["actualites", "Actualités"], ["chiffres", "En chiffres"]];
function renderFiche() {
  const c = data.celebrites.find(x => x.id === openId); if (!c) return show("list");
  $("f-head").innerHTML = `${avatar(c)}<div><h1>${esc(c.prenom)} ${esc(c.nom)}</h1><div class="sub">${c.icone} ${esc(c.domaineNom)} · ${sub(c)}${c.rep != null ? ` · réputation ${c.rep}` : ""}</div>${badge(c)}</div>`;
  const tabs = TABS.filter(([id]) => id !== "actualites" || (c.actualites || []).length);
  if (!tabs.some(t => t[0] === tab)) tab = "parcours";
  $("f-tabs").innerHTML = tabs.map(([id, l]) => `<button class="tab" role="tab" type="button" data-tab="${id}" aria-selected="${tab === id}">${l}</button>`).join("");
  let h = "";
  if (tab === "parcours") h = `<ol class="tl">${(c.parcours || []).map(e => `<li><div class="age">${e.age === 0 ? "Naissance" : e.le ? new Date(e.le).toLocaleDateString("fr-FR") : e.age != null ? e.age + " ans" : ""}</div><div>${e.icone} ${esc(e.texte)}</div></li>`).join("")}</ol>` +
    (c.vraieVie && (c.parcours || []).length < 2 ? `<p class="empty">Son histoire commence à peine : revenez dans quelques jours.</p>` : "") + (c.citation && !c.vraieVie ? `<p class="quote">${esc(c.citation)}</p>` : "");
  if (tab === "difficultes") h = (c.difficultes || []).length ? `<div class="hard">${c.difficultes.map(x => `<div><b>${x.icone} ${esc(x.titre)}</b><p>${esc(x.texte)}</p></div>`).join("")}</div>`
    : `<p class="empty">Aucune difficulté rendue publique pour l'instant.</p>`;
  if (tab === "actualites") h = (c.actualites || []).map(a => `<div class="news"><span>${a.icone}</span><p>${esc(a.texte)}</p></div>`).join("");
  if (tab === "chiffres") h = `<div class="stats">${(c.chiffres || []).map(s => `<div><b>${s.valeur.toLocaleString("fr-FR")}</b><span>${esc(s.label)}</span></div>`).join("")}</div>` +
    (c.vraieVie ? `<p class="note">Chiffres estimés par le jeu à partir de sa carrière.</p>` : "");
  $("f-body").innerHTML = h;
  const f = store.get(LS_FOLLOW, []).includes(c.id); $("f-follow").textContent = f ? "★ Suivie" : "☆ Suivre";
}
function show(id) {
  for (const s of ["menu", "list", "fiche"]) $(s).hidden = s !== id;
  if (id === "list") renderList(); if (id === "fiche") renderFiche(); if (id === "menu") renderMenu();
  if (id !== "menu") window.scrollTo(0, 0);
}
function open(id) { openId = id; tab = "parcours"; history.pushState({ v: "fiche", id }, "", "#" + id); show("fiche"); }

document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.dom) { domain = domain === b.dataset.dom ? "tous" : b.dataset.dom; renderMenu(); return; }
  if (b.id === "go") { history.pushState({ v: "list" }, "", "#liste"); show("list"); return; }
  if (b.dataset.chip) { domain = b.dataset.chip; renderList(); return; }
  if (b.dataset.open) return open(b.dataset.open);
  if (b.dataset.tab) { tab = b.dataset.tab; renderFiche(); return; }
  if (b.id === "to-menu") { history.pushState({ v: "menu" }, "", "#"); show("menu"); return; }
  if (b.id === "to-list") { history.pushState({ v: "list" }, "", "#liste"); show("list"); return; }
  if (b.id === "f-prev" || b.id === "f-next") { const L = list().length ? list() : data.celebrites, i = L.findIndex(c => c.id === openId); return open(L[(i + (b.id === "f-next" ? 1 : -1) + L.length) % L.length].id); }
  if (b.id === "f-follow") { const f = store.get(LS_FOLLOW, []), i = f.indexOf(openId); if (i >= 0) f.splice(i, 1); else f.push(openId); store.set(LS_FOLLOW, f); renderFiche(); }
});
window.addEventListener("popstate", e => { const s = e.state || {}; if (s.v === "fiche") { openId = s.id; show("fiche"); } else show(s.v || "menu"); });

data = await load();
const h0 = location.hash.slice(1);
if (h0 === "liste") show("list"); else if (h0 && data.celebrites.some(c => c.id === h0)) { openId = h0; show("fiche"); } else show("menu");
