// 2 Life : espace administrateur (conditions de démarrage, parents fondateurs, investisseurs).
import { launchDemo } from "./lancement-demo.js";
import { OFFERS, COMPANY_TYPES } from "../server/src/life.js";

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
  $("n-parents").textContent = e.parents.length; $("n-inv").textContent = e.investisseurs.length;
  $("parents").innerHTML = e.parents.length ? e.parents.map(p => `<div class="item"><span class="sw">${p.sexe === "F" ? "👩🏾" : "👨🏾"}</span><div class="t">${esc(p.prenom)} ${esc(p.nom)} · ${esc(p.quartier)}<small>${esc(p.pseudo)} · ${esc(p.email)} · ajouté le ${day(p.cree_le)}</small></div></div>`).join("") : `<p>Aucun parent fondateur pour l'instant.</p>`;
  $("investors").innerHTML = e.investisseurs.length ? e.investisseurs.map(i => `<div class="item"><span class="sw">💼</span><div class="t">${esc(i.pseudo)} · ${(OFFERS.find(o => o.id === i.offre) || {}).nom || esc(i.offre)}<small>${Number(i.usd).toLocaleString("fr-FR")} $ (simulé) · ${esc(i.email)} · ${day(i.le)}</small></div></div>`).join("") : `<p>Aucun investisseur pour l'instant. Ils s'inscrivent eux-mêmes depuis la page Ma vie.</p>`;
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
const load = async () => { try { const e = await call("/api/admin/etat"); render(e); renderBeta(API ? e.beta : demoBeta()); show(true); } catch (err) { show(false); } };

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
