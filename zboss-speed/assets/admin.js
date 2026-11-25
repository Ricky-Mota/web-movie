// 2 Life : espace administrateur (conditions de démarrage, parents fondateurs, investisseurs).
import { launchDemo } from "./lancement-demo.js";
import { OFFERS, COMPANY_TYPES, SETTINGS, AD_SPOTS, adPrice, cannotCreateAd, COMMUNES, AD_COLORS, cannotCreateCommunique, INSTITUTIONS, PUBLIC_COMPANIES, cannotAddLogo, logoPrice } from "../server/src/life.js";

const API = (window.TWO_LIFE_API || "").replace(/\/$/, "");
const $ = id => document.getElementById(id);
const KEY = "twolife_admin_token";
const tok = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) { } } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = t => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const when = t => new Date(t).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
const local = t => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const wait = ms => { const m = Math.max(1, Math.round(ms / 60e3)); return m < 60 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} jours`; };
let tt; const toast = m => { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 4200); };

async function call(path, body) {
  if (!API) return launchDemo.admin(path, body || {});
  const t = tok.get();
  const r = await fetch(API + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401 || r.status === 403) { tok.set(null); show(false); } throw new Error(j.erreur || "Le serveur ne répond pas."); }
  return j;
}

function show(admin) { $("v-login").hidden = admin; $("v-admin").hidden = !admin; }

function render(e) {
  const L = e.lancement;
  $("state").innerHTML = (L.demarre ? `<p class="started">Le jeu a démarré le ${day(L.demarreLe)}.</p><p>Les naissances sont ouvertes : chaque nouveau bébé arrive dans la famille d'un parent joueur.</p>` : "") +
    L.conditions.map(c => c.id === "date" ? `<div class="cond"><div class="need">${esc(c.label)} <b>${L.dateOuverture ? when(L.dateOuverture) : "à fixer"}</b></div>
      <small class="${c.ok ? "ok-badge" : "wait-badge"}">${c.ok ? "Date atteinte" : L.dateOuverture ? `Dans ${wait(L.dateOuverture - Date.now())}` : "Choisis la date ci-dessous"}</small></div>` : `<div class="cond"><div class="need">${esc(c.label)} <b>${c.actuel} / ${c.min}</b><div class="bar"><i class="${c.ok ? "" : "mid"}" style="width:${Math.min(100, c.actuel / c.min * 100)}%"></i></div></div>
      <small class="${c.ok ? "ok-badge" : "wait-badge"}">${c.ok ? "Condition remplie" : `Encore ${c.min - c.actuel}`}</small></div>`).join("") +
    `<p style="font-size:13px;margin-top:12px">Le jeu démarre tout seul à la date d'ouverture si toutes les conditions sont réunies. Sinon il démarre dès que la dernière condition est remplie.</p>`;
  $("f-date").hidden = L.demarre;
  if (L.dateOuverture && !$("d-date").value) $("d-date").value = local(L.dateOuverture);
  const ent = e.entreprises || [];
  $("n-ent").textContent = ent.length;
  $("companies").innerHTML = ent.length ? ent.map(c => `<div class="item"><span class="sw">${(COMPANY_TYPES.find(t => t.id === c.type) || {}).icone || "🏢"}</span><div class="t">${esc(c.nom)}<small>${esc(c.proprietaire)} · ${esc(c.quartier || "")} · ${day(c.cree_le)}</small></div></div>`).join("") : `<p>Aucune entreprise pour l'instant. Les investisseurs les ouvrent depuis la page Ma vie.</p>`;
  const E = e.elections || {};
  $("elec").innerHTML = !L.demarre ? `<p>Les élections commencent après le démarrage du jeu : la première a lieu 6 mois plus tard, puis tous les 6 mois.</p>`
    : `<div class="cond"><div class="need">Élection n° ${E.cycle} <b>${when(E.prochaine)}</b></div><small class="${E.voteOuvert ? "ok-badge" : "wait-badge"}">${E.voteOuvert ? "Vote ouvert" : `Vote dans ${wait(E.ouvertureVote - Date.now())}`}</small></div>
      <p style="font-size:13px">Les joueurs de 18 ans et plus votent pendant 7 jours. À la date de l'élection, les voix sont comptées et les élus prennent leur poste (payés par le Trésor).</p>`;
  $("f-elec").hidden = $("b-vote-now").hidden = !L.demarre;
  $("demo-tools").hidden = !e.demo;
  renderSettings(e.reglages || demoSettings());
  renderObserve(e.observer || demoObserve());
  const B = e.naissances || { n: 0, usd: 0, fraisAdmin: 0, parents: 0 };
  $("n-births").textContent = B.n;
  $("births").innerHTML = `<p style="font-size:14px">Chaque naissance coûte 15 $ : <b>5 $ pour l'administrateur</b> (faire vivre le jeu) et 10 $ (50 e-makuta) confiés aux parents de l'enfant.</p>
    <div class="cond"><div class="need">Part administrateur <b>${B.fraisAdmin.toLocaleString("fr-FR")} $</b></div><small class="wait-badge">simulé</small></div>
    <div class="cond"><div class="need">Confié aux parents <b>${B.parents.toLocaleString("fr-FR")} $</b></div><small class="wait-badge">simulé</small></div>`;
  $("n-parents").textContent = e.parents.length; $("n-inv").textContent = e.investisseurs.length;
  $("parents").innerHTML = e.parents.length ? e.parents.map(p => `<div class="item"><span class="sw">${p.sexe === "F" ? "👩🏾" : "👨🏾"}</span><div class="t">${esc(p.prenom)} ${esc(p.nom)} · ${esc(p.quartier)}<small>${esc(p.pseudo)} · ${esc(p.email)} · ajouté le ${day(p.cree_le)}</small></div></div>`).join("") : `<p>Aucun parent fondateur pour l'instant.</p>`;
  $("investors").innerHTML = e.investisseurs.length ? e.investisseurs.map(i => `<div class="item"><span class="sw">💼</span><div class="t">${esc(i.pseudo)} · ${(OFFERS.find(o => o.id === i.offre) || {}).nom || esc(i.offre)}<small>${Number(i.usd).toLocaleString("fr-FR")} $ (simulé) · ${esc(i.email)} · ${day(i.le)}</small></div></div>`).join("") : `<p>Aucun investisseur pour l'instant. Ils s'inscrivent eux-mêmes depuis la page Ma vie.</p>`;
}
// réglages en direct (en démo : gardés dans ce navigateur, lus par la page Ma vie et la ville)
const LS_SET = "twolife_reglages";
function demoSettings() { let v = {}; try { v = JSON.parse(localStorage.getItem(LS_SET) || "{}"); } catch (e) { } return { defs: SETTINGS, valeurs: Object.fromEntries(SETTINGS.map(s => [s.id, v[s.id] ?? 1])), demo: true }; }
const fx = n => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
function renderSettings(R) {
  $("settings").innerHTML = R.defs.map(s => `<div class="cond" style="display:block"><label for="set-${s.id}" class="need" style="display:flex;justify-content:space-between"><span>${esc(s.label)}</span><b id="setv-${s.id}">× ${fx(R.valeurs[s.id])}</b></label>
    <input type="range" id="set-${s.id}" data-set="${s.id}" min="${s.min}" max="${s.max}" step="0.05" value="${R.valeurs[s.id]}" style="width:100%;accent-color:var(--accent)">
    <small style="opacity:.75">${esc(s.aide)} De ${fx(s.min)} à ${fx(s.max)}.</small></div>`).join("") + (R.demo ? `<p class="sim">Démo : les réglages sont gardés dans ce navigateur et s'appliquent à la page Ma vie et à la ville.</p>` : "");
}
$("settings").addEventListener("input", e => { const i = e.target.closest("[data-set]"); if (i) $("setv-" + i.dataset.set).textContent = "× " + fx(i.value); });
const readSettings = () => Object.fromEntries([...document.querySelectorAll("[data-set]")].map(i => [i.dataset.set, Number(i.value)]));
async function saveSettings(v) {
  if (API) { try { const r = await call("/api/admin/reglages", { valeurs: v }); renderSettings(r.reglages); toast("Réglages enregistrés : les joueurs les voient en moins d'une minute."); } catch (err) { toast(err.message); } }
  else { try { localStorage.setItem(LS_SET, JSON.stringify(v)); } catch (e) { } renderSettings(demoSettings()); toast("Réglages enregistrés (démo, dans ce navigateur)."); }
}
$("b-set").onclick = () => saveSettings(readSettings());
$("b-set-reset").onclick = () => saveSettings(Object.fromEntries(SETTINGS.map(s => [s.id, 1])));
// observer le jeu (en démo : la vie gardée dans ce navigateur)
function demoObserve() {
  let d = null; try { d = JSON.parse(localStorage.getItem("twolife_demo") || "null"); } catch (e) { }
  if (!d || !d.perso) return { vivants: 0, morts: 0, enfants: 0, negliges: 0, enDanger: 0, deces: [], evenements: [], demo: true };
  const kids = d.enfants || [], morts = [...(d.vies || []), ...(d.mort ? [d.mort] : [])];
  return { vivants: (d.mort ? 0 : 1) + kids.length, morts: morts.length + (d.deuils || []).length, enfants: kids.length, negliges: kids.filter(k => k.neglige > 0).length, enDanger: kids.filter(k => k.neglige >= 7).length,
    deces: [...morts.map(m => ({ prenom: m.prenom, nom: m.nom, cause: m.cause, age: m.age, mort_le: m.mortLe, pseudo: d.pseudo })), ...(d.deuils || []).map(k => ({ prenom: k.prenom, nom: "", cause: k.cause, age: 0, mort_le: k.le, pseudo: "enfant" }))].sort((a, b) => b.mort_le - a.mort_le),
    evenements: (d.mouvements || []).slice(0, 40).map(m => ({ ...m, qui: d.mort ? d.mort.prenom : d.perso.firstName })), demo: true };
}
function renderObserve(o) {
  const tile = (n, l, warn) => `<div class="cond"><div class="need">${l} <b${warn && n ? ' style="color:var(--warn)"' : ""}>${n}</b></div></div>`;
  const when = t => new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  $("observe").innerHTML = tile(o.vivants, "Personnages vivants") + tile(o.enfants, "Enfants (moins de 18 ans)") + tile(o.negliges, "Enfants négligés", true) + tile(o.enDanger, "En danger de mort (7 jours de négligence)", true) + tile(o.morts, "Morts", true)
    + (o.tresor != null ? tile(Math.round(o.tresor / 20).toLocaleString("fr-FR") + " e-makuta", "Trésor de la ville") : "")
    + `<h3 style="font-size:15px;margin:16px 0 4px">Derniers décès</h3>` + (o.deces.length ? `<div class="list">${o.deces.map(x => `<div class="item"><span class="sw">✝️</span><div class="t">${esc(x.prenom)} ${esc(x.nom)} · ${x.age} ans<small>${esc(x.cause || "")} · ${esc(x.pseudo || "")} · ${when(x.mort_le)}${x.fortune ? " · fortune partagée : " + Math.round(x.fortune / 20).toLocaleString("fr-FR") + " e-makuta" : ""}</small></div></div>`).join("")}</div>` : `<p>Aucun décès pour l'instant.</p>`)
    + `<h3 style="font-size:15px;margin:16px 0 4px">Derniers événements</h3>` + (o.evenements.length ? `<div class="list">${o.evenements.map(x => `<div class="item"><span class="sw">${x.icone}</span><div class="t">${esc(x.qui)}<small>${esc(x.texte)} · ${when(x.le)}</small></div></div>`).join("")}</div>` : `<p>Rien pour l'instant.</p>`)
    + (o.demo ? `<p class="sim">Démo : seule la vie jouée dans ce navigateur est visible. En ligne, tu vois tous les joueurs.</p>` : "");
}
// liste d'attente bêta (en mode démo : celle gardée dans ce navigateur par l'accueil)
let betaRows = [];
function renderBeta(rows) {
  betaRows = rows || [];
  $("n-beta").textContent = betaRows.length;
  $("b-beta-csv").hidden = !betaRows.length;
  const shown = betaRows.slice(0, 200);
  $("beta").innerHTML = shown.length ? shown.map(b => `<div class="item"><span class="sw">📝</span><div class="t">${esc(b.pseudo)} · ${esc(b.email)}<small>${[b.pays, b.plateforme, b.source, b.newsletter ? "nouvelles : oui" : "", day(b.cree_le)].filter(Boolean).map(esc).join(" · ")}</small></div></div>`).join("")
    + (betaRows.length > shown.length ? `<p style="font-size:13px">… et ${betaRows.length - shown.length} autres dans le fichier CSV.</p>` : "")
    : `<p>Personne pour l'instant. Partage l'adresse du site pour remplir la liste.</p>`;
}
$("b-beta-csv").onclick = () => {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["pseudo", "email", "pays", "plateforme", "nouvelles", "source", "inscrit le"].join(";"),
    ...betaRows.map(b => [b.pseudo, b.email, b.pays, b.plateforme, b.newsletter ? "oui" : "non", b.source, new Date(b.cree_le).toLocaleString("fr-FR")].map(q).join(";"))];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = "2life-liste-beta.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
function demoBeta() {
  try { return (JSON.parse(localStorage.getItem("zboss_demo_signups") || "[]")).map(r => ({ pseudo: r.pseudo, email: r.email, pays: r.country, plateforme: r.platform, newsletter: r.newsletter, source: r.source, cree_le: Date.parse(r.created_at) || Date.now() })); } catch (e) { return []; }
}
// bureau Zboss Sarlu : demandes d'aide des joueurs
const demoSup = { get() { try { return JSON.parse(localStorage.getItem("twolife_demo_support") || "[]"); } catch (e) { return []; } }, set(v) { try { localStorage.setItem("twolife_demo_support", JSON.stringify(v)); } catch (e) { } } };
function renderSupport(rows) {
  rows = rows || [];
  const open = rows.filter(r => r.statut !== "resolu").length;
  $("n-sup").textContent = open;
  $("support").innerHTML = rows.length ? rows.map(r => `<div class="item"><span class="sw">${r.statut === "resolu" ? "✅" : "🆘"}</span><div class="t">${esc(r.categorie)} · ${esc(r.pseudo || "anonyme")}${r.email ? " · " + esc(r.email) : ""}<small>${esc(r.message)}</small><small>${day(r.cree_le)}${r.statut === "resolu" ? " · résolu" : ""}</small></div>
    <button class="btn ghost" style="flex:none;width:auto;padding:6px 12px;font-size:13px;margin-left:auto" type="button" data-sup="${esc(r.id)}" data-st="${r.statut === "resolu" ? "ouvert" : "resolu"}">${r.statut === "resolu" ? "Rouvrir" : "Marquer résolu"}</button></div>`).join("")
    : `<p>Aucun problème signalé pour l'instant.</p>`;
}
$("support").addEventListener("click", async e => {
  const b = e.target.closest("[data-sup]"); if (!b) return;
  if (API) { try { await call("/api/admin/support", { id: b.dataset.sup, statut: b.dataset.st }); load(); } catch (err) { toast(err.message); } }
  else { const L = demoSup.get(); const r = L.find(x => x.id === b.dataset.sup); if (r) { r.statut = b.dataset.st; demoSup.set(L); } renderSupport(L); }
});
// annonces des commerçants partenaires (en démo : gardées dans ce navigateur, visibles dans la démo du jeu)
const demoPubs = { get() { try { return JSON.parse(localStorage.getItem("twolife_demo_pubs") || "[]"); } catch (e) { return []; } }, set(v) { try { localStorage.setItem("twolife_demo_pubs", JSON.stringify(v)); } catch (e) { } } };
$("a-place").innerHTML = AD_SPOTS.map(s => `<option value="${s.id}">${esc(s.nom)} · ${s.prixJourUsd} $/jour, ${s.prixMoisUsd} $/mois</option>`).join("");
$("a-commune").innerHTML += COMMUNES.map(c => `<option>${esc(c.nom)}</option>`).join("");
const adPriceShow = () => { $("a-prix").textContent = adPrice($("a-place").value, Number($("a-jours").value) || 1) + " $"; };
$("a-place").onchange = adPriceShow; $("a-jours").oninput = adPriceShow; adPriceShow();
const logoPriceShow = () => { $("l-prix").textContent = logoPrice(Number($("l-jours").value) || 1) + " $"; };
$("l-jours").oninput = logoPriceShow; logoPriceShow();
// ---- communiqués du bandeau défilant
const demoComs = { get() { try { return JSON.parse(localStorage.getItem("twolife_demo_communiques") || "[]"); } catch (e) { return []; } }, set(v) { try { localStorage.setItem("twolife_demo_communiques", JSON.stringify(v)); } catch (e) { } } };
$("c-auteurs").innerHTML = ["Mairie de Kinshasa", ...INSTITUTIONS.map(i => i.nom), ...PUBLIC_COMPANIES.map(c => c.nom)].map(n => `<option value="${esc(n)}">`).join("");
async function loadComs() {
  const now = Date.now(), rows = API ? (await call("/api/admin/communiques")).communiques : demoComs.get().map(c => ({ ...c, enCours: !!c.actif && c.debut <= now && c.fin > now }));
  $("n-com").textContent = rows.filter(c => c.enCours).length;
  $("coms").innerHTML = rows.length ? rows.map(c => `<div class="item"><span class="sw">📢</span><div class="t">${esc(c.auteur)}<small>${esc(c.texte)}</small><small>jusqu'au ${day(c.fin)} · ${c.enCours ? "en ligne" : "arrêté"}${c.accord ? " · accord signé" : ""}</small></div>
    <button class="btn ghost" style="width:auto;padding:6px 12px;font-size:13px;margin:0 0 0 auto" type="button" data-com="${esc(c.id)}" data-on="${c.actif ? 0 : 1}">${c.actif ? "Arrêter" : "Relancer"}</button></div>`).join("") : `<p>Aucun communiqué pour l'instant.</p>`;
}
$("f-com").onsubmit = async ev => {
  ev.preventDefault(); $("com-err").textContent = "";
  const c = { auteur: $("c-auteur").value.trim(), texte: $("c-texte").value.trim(), jours: Number($("c-jours").value), accord: $("c-accord").checked };
  const no = cannotCreateCommunique(c); if (no) { $("com-err").textContent = no; return; }
  try {
    if (API) await call("/api/admin/communique", c);
    else { const L = demoComs.get(), now = Date.now(); L.unshift({ ...c, id: "com" + now, debut: now, fin: now + c.jours * 864e5, actif: 1, cree_le: now }); demoComs.set(L); }
    $("f-com").reset(); toast("Communiqué publié dans le bandeau."); loadComs();
  } catch (err) { $("com-err").textContent = err.message; }
};
$("coms").addEventListener("click", async e => {
  const b = e.target.closest("[data-com]"); if (!b) return;
  try {
    if (API) await call("/api/admin/communique/statut", { id: b.dataset.com, actif: b.dataset.on === "1" });
    else { const L = demoComs.get(), r = L.find(x => x.id === b.dataset.com); if (r) r.actif = b.dataset.on === "1" ? 1 : 0; demoComs.set(L); }
    loadComs();
  } catch (err) { toast(err.message); }
});
// ---- logos des partenaires (onglet défilant du bandeau)
const demoLogos = { get() { try { return JSON.parse(localStorage.getItem("twolife_demo_logos") || "[]"); } catch (e) { return []; } }, set(v) { try { localStorage.setItem("twolife_demo_logos", JSON.stringify(v)); } catch (e) { toast("Mémoire du navigateur pleine."); } } };
let logoData = "";
// réduit l'image à 160 × 80 au plus (WebP, sinon PNG) pour qu'elle reste légère
$("l-file").onchange = () => {
  const f = $("l-file").files[0]; logoData = ""; $("l-preview").innerHTML = ""; if (!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const k = Math.min(1, 160 / img.width, 80 / img.height), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    logoData = c.toDataURL("image/webp", .85); if (!logoData.startsWith("data:image/webp")) logoData = c.toDataURL("image/png");
    $("l-preview").innerHTML = `<span style="display:inline-flex;align-items:center;justify-content:center;width:150px;height:48px;background:#fff;border-radius:8px;padding:4px"><img src="${logoData}" alt="aperçu" style="max-width:100%;max-height:100%"></span> <small>Aperçu dans le bandeau</small>`;
  };
  img.onerror = () => { $("logo-err").textContent = "Image illisible."; };
  img.src = url;
};
async function loadLogos() {
  const now = Date.now(), rows = API ? (await call("/api/admin/logos")).logos : demoLogos.get().map(l => ({ ...l, enCours: !!l.actif && l.debut <= now && l.fin > now }));
  $("n-logo").textContent = rows.filter(l => l.enCours).length;
  $("logos").innerHTML = rows.length ? rows.map(l => `<div class="item"><span class="sw" style="width:64px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center"><img src="${esc(l.logo)}" alt="" style="max-width:60px;max-height:28px"></span><div class="t">${esc(l.nom)}<small>jusqu'au ${day(l.fin)} · ${l.enCours ? "en ligne" : "arrêté"} · accord signé</small></div>
    <button class="btn ghost" style="width:auto;padding:6px 12px;font-size:13px;margin:0 0 0 auto" type="button" data-logo="${esc(l.id)}" data-on="${l.actif ? 0 : 1}">${l.actif ? "Arrêter" : "Relancer"}</button></div>`).join("") : `<p>Aucun logo pour l'instant : le bandeau affiche « Votre logo ici ».</p>`;
}
$("f-logo").onsubmit = async ev => {
  ev.preventDefault(); $("logo-err").textContent = "";
  const l = { nom: $("l-nom").value.trim(), logo: logoData, jours: Number($("l-jours").value), accord: $("l-accord").checked };
  const no = cannotAddLogo(l); if (no) { $("logo-err").textContent = no; return; }
  try {
    if (API) await call("/api/admin/logo", l);
    else { const L = demoLogos.get(), now = Date.now(); L.unshift({ id: "logo" + now, nom: l.nom, logo: l.logo, debut: now, fin: now + l.jours * 864e5, accord: 1, actif: 1, cree_le: now }); demoLogos.set(L.slice(0, 20)); }
    $("f-logo").reset(); logoPriceShow(); logoData = ""; $("l-preview").innerHTML = ""; toast("Logo ajouté : il défile maintenant dans le bandeau."); loadLogos();
    if (window.TWO_LIFE_BANDEAU) window.TWO_LIFE_BANDEAU.reload();
  } catch (err) { $("logo-err").textContent = err.message; }
};
$("logos").addEventListener("click", async e => {
  const b = e.target.closest("[data-logo]"); if (!b) return;
  try {
    if (API) await call("/api/admin/logo/statut", { id: b.dataset.logo, actif: b.dataset.on === "1" });
    else { const L = demoLogos.get(), r = L.find(x => x.id === b.dataset.logo); if (r) r.actif = b.dataset.on === "1" ? 1 : 0; demoLogos.set(L); }
    loadLogos();
  } catch (err) { toast(err.message); }
});
async function loadPubs() {
  const rows = API ? (await call("/api/admin/pubs")).pubs : demoPubs.get().map(a => ({ ...a, enCours: !!a.actif && a.debut <= Date.now() && a.fin > Date.now() }));
  $("n-pubs").textContent = rows.filter(a => a.enCours).length;
  $("pubs").innerHTML = rows.length ? rows.map(a => `<div class="item"><span class="sw" style="color:${esc(a.couleur || "#ffd23f")}">📣</span><div class="t">${esc(a.titre)} · ${esc(a.annonceur)}<small>${esc(a.texte || "")}${a.commune ? " · " + esc(a.commune) : ""}</small><small>${esc((AD_SPOTS.find(s => s.id === a.emplacement) || {}).nom || a.emplacement)} · ${day(a.debut)} → ${day(a.fin)} · ${a.prix_usd} $ ${a.paye ? "payé" : "à encaisser"} · ${a.enCours ? "en ligne" : a.actif ? "programmée ou terminée" : "arrêtée"}</small></div>
    <div style="display:flex;flex-direction:column;gap:4px;margin-left:auto">${a.paye ? "" : `<button class="btn ghost" style="width:auto;padding:6px 12px;font-size:13px;margin:0" type="button" data-pay="${esc(a.id)}">Marquer payé</button>`}<button class="btn ghost" style="width:auto;padding:6px 12px;font-size:13px;margin:0" type="button" data-toggle="${esc(a.id)}" data-on="${a.actif ? 0 : 1}">${a.actif ? "Arrêter" : "Relancer"}</button></div></div>`).join("")
    : `<p>Aucune annonce pour l'instant.</p>`;
}
$("f-pub").onsubmit = async ev => {
  ev.preventDefault(); $("pub-err").textContent = "";
  const a = { annonceur: $("a-annonceur").value.trim(), titre: $("a-titre").value.trim(), texte: $("a-texte").value.trim(), emplacement: $("a-place").value, jours: Number($("a-jours").value), commune: $("a-commune").value, paye: $("a-paye").checked, accord: $("a-accord").checked };
  const no = cannotCreateAd(a); if (no) { $("pub-err").textContent = no; return; }
  try {
    if (API) await call("/api/admin/pub", a);
    else { const L = demoPubs.get(), now = Date.now(); L.unshift({ ...a, id: "pub" + now, couleur: AD_COLORS[L.length % AD_COLORS.length], debut: now, fin: now + a.jours * 864e5, prix_usd: adPrice(a.emplacement, a.jours), paye: a.paye ? 1 : 0, actif: 1, cree_le: now }); demoPubs.set(L); }
    $("f-pub").reset(); adPriceShow(); toast("Annonce publiée."); loadPubs();
  } catch (err) { $("pub-err").textContent = err.message; }
};
$("pubs").addEventListener("click", async e => {
  const t = e.target.closest("[data-toggle],[data-pay]"); if (!t) return;
  const id = t.dataset.toggle || t.dataset.pay, body = t.dataset.pay ? { id, actif: 1, paye: true } : { id, actif: t.dataset.on === "1" };
  if (t.dataset.pay) { const r = (API ? null : demoPubs.get().find(x => x.id === id)); if (r) body.actif = r.actif; }
  try {
    if (API) { if (t.dataset.pay) { const cur = (await call("/api/admin/pubs")).pubs.find(x => x.id === id); body.actif = cur ? !!cur.actif : true; } await call("/api/admin/pub/statut", body); }
    else { const L = demoPubs.get(), r = L.find(x => x.id === id); if (r) { r.actif = body.actif ? 1 : 0; if (body.paye) r.paye = 1; } demoPubs.set(L); }
    loadPubs();
  } catch (err) { toast(err.message); }
});
const load = async () => { try { const e = await call("/api/admin/etat"); render(e); renderBeta(API ? e.beta : demoBeta()); renderSupport(API ? e.support : demoSup.get()); show(true); loadPubs().catch(() => {}); loadComs().catch(() => {}); loadLogos().catch(() => {}); } catch (err) { show(false); } };

$("f-login").onsubmit = async ev => {
  ev.preventDefault(); $("login-err").textContent = "";
  try {
    const r = await fetch(API + "/api/connexion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("email").value, motdepasse: $("pass").value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erreur || "Le serveur ne répond pas.");
    if (!j.admin) throw new Error("Ce compte n'est pas administrateur. Ajoute son e-mail à ADMIN_EMAILS.");
    tok.set(j.token); await load();
  } catch (err) { $("login-err").textContent = err.message; }
};
$("f-parent").onsubmit = async ev => {
  ev.preventDefault(); $("parent-err").textContent = "";
  try {
    const e = await call("/api/admin/parent", { pseudo: $("p-pseudo").value, email: $("p-email").value, motdepasse: $("p-pass").value });
    if (!e.parents) return load().then(() => toast("Parent fondateur ajouté."));
    render(e); toast(`Parent fondateur ajouté : ${e.parents.at(-1).prenom} ${e.parents.at(-1).nom}.`);
    $("f-parent").reset();
  } catch (err) { $("parent-err").textContent = err.message; }
};
$("f-date").onsubmit = async ev => {
  ev.preventDefault();
  const t = new Date($("d-date").value).getTime();
  try { await call("/api/admin/date", { date: t }); await load(); toast(`Date d'ouverture fixée : ${when(t)}.`); } catch (err) { toast(err.message); }
};
const setElection = async (t, msg) => { try { const r = await call("/api/admin/election", { date: t }); await load(); toast(msg || `Prochaine élection : ${when(t)}.`); return r; } catch (err) { toast(err.message); } };
$("f-elec").onsubmit = ev => { ev.preventDefault(); setElection(new Date($("e-date").value).getTime()); };
$("b-vote-now").onclick = () => setElection(Date.now() + 3 * 60e3, "Le vote est ouvert. Les voix seront comptées dans 3 minutes.");
$("b-fill").onclick = async () => { render(await call("/api/admin/remplir", {})); toast("Listes remplies avec des joueurs de démonstration."); };
$("b-reset").onclick = async () => { render(await call("/api/admin/reinitialiser", {})); toast("Tout est remis à zéro."); };
$("b-out").onclick = () => { tok.set(null); show(false); };

$("mode").textContent = API ? "Administration" : "Administration · démo";
if (!API || tok.get()) load(); else show(false);
setInterval(() => { if (!$("v-admin").hidden) load(); }, 30e3); // suit le démarrage automatique
