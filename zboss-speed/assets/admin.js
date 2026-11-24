// 2 Life : espace administrateur (conditions de démarrage, parents fondateurs, investisseurs).
import { launchDemo } from "./lancement-demo.js";
import { OFFERS } from "../server/src/life.js";

const API = (window.TWO_LIFE_API || "").replace(/\/$/, "");
const $ = id => document.getElementById(id);
const KEY = "twolife_admin_token";
const tok = { get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) { } } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = t => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
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
    L.conditions.map(c => `<div class="cond"><div class="need">${esc(c.label)} <b>${c.actuel} / ${c.min}</b><div class="bar"><i class="${c.ok ? "" : "mid"}" style="width:${Math.min(100, c.actuel / c.min * 100)}%"></i></div></div>
      <small class="${c.ok ? "ok-badge" : "wait-badge"}">${c.ok ? "Condition remplie" : `Encore ${c.min - c.actuel}`}</small></div>`).join("") +
    `<p style="font-size:13px;margin-top:12px">D'autres conditions pourront s'ajouter ici (par exemple un nombre d'entreprises ouvertes).</p>`;
  $("b-start").disabled = L.demarre || !L.pret;
  $("b-start").textContent = L.demarre ? "Jeu démarré" : L.pret ? "Démarrer le jeu" : "Démarrer le jeu (conditions incomplètes)";
  $("demo-tools").hidden = !e.demo;
  $("n-parents").textContent = e.parents.length; $("n-inv").textContent = e.investisseurs.length;
  $("parents").innerHTML = e.parents.length ? e.parents.map(p => `<div class="item"><span class="sw">${p.sexe === "F" ? "👩🏾" : "👨🏾"}</span><div class="t">${esc(p.prenom)} ${esc(p.nom)} · ${esc(p.quartier)}<small>${esc(p.pseudo)} · ${esc(p.email)} · ajouté le ${day(p.cree_le)}</small></div></div>`).join("") : `<p>Aucun parent fondateur pour l'instant.</p>`;
  $("investors").innerHTML = e.investisseurs.length ? e.investisseurs.map(i => `<div class="item"><span class="sw">💼</span><div class="t">${esc(i.pseudo)} · ${(OFFERS.find(o => o.id === i.offre) || {}).nom || esc(i.offre)}<small>${Number(i.usd).toLocaleString("fr-FR")} $ (simulé) · ${esc(i.email)} · ${day(i.le)}</small></div></div>`).join("") : `<p>Aucun investisseur pour l'instant. Ils s'inscrivent eux-mêmes depuis la page Ma vie.</p>`;
}
const load = async () => { try { render(await call("/api/admin/etat")); show(true); } catch (err) { show(false); } };

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
$("b-start").onclick = async () => { try { await call("/api/admin/demarrer", {}); await load(); toast("Le jeu a démarré. Les naissances sont ouvertes."); } catch (err) { toast(err.message); } };
$("b-fill").onclick = async () => { render(await call("/api/admin/remplir", {})); toast("Listes remplies avec des joueurs de démonstration."); };
$("b-reset").onclick = async () => { render(await call("/api/admin/reinitialiser", {})); toast("Tout est remis à zéro."); };
$("b-out").onclick = () => { tok.set(null); show(false); };

$("mode").textContent = API ? "Administration" : "Administration · démo";
if (!API || tok.get()) load(); else show(false);
