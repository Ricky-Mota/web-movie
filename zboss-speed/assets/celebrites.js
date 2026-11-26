// 2 Life : les célébrités de la ville. Le serveur choisit chaque jour les personnalités et raconte leur parcours ;
// sans serveur (mode démo), le navigateur applique les mêmes règles (server/src/life.js).
import { pickCelebrities, celebStory, celebFromMoves, celebClean, celebLive, ageYears, JOBS, celebEvent, cannotGiveOffering, offeringReceipt, titheOf, fmtMakuta, CELEB_VISITS_PER_DAY } from "../server/src/life.js";

const API = (window.TWO_LIFE_API || "").replace(/\/$/, "");
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS_FOLLOW = "twolife_celebs_suivies";
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };

let data = null, domain = "tous", openId = null, tab = "parcours", liveTimer = null, actMsg = null, offAmt = 2;
// lieu de la ville 3D où l'on peut aller la voir
const LIEU_3D = { eglise: "eglise", stade: "foot", scene: "club1", parlement: "assemblee", marche: "marche", boutique: "alim2", maquis: "maquis", salle: "basket" };

// ---- actions : aller la voir sur place, dîme et offrandes (serveur, ou démo dans le navigateur)
async function act(path, body) {
  if (!API || data.demo) return demoAct(path, body);
  const tok = store.get("twolife_token", null);
  if (!tok) throw new Error("Connecte-toi d'abord à ton personnage (page « Ma vie »).");
  const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erreur || "Le serveur ne répond pas.");
  return j;
}
function demoAct(path, body) {
  const d = store.get("twolife_demo", null), now = Date.now();
  if (!d || !d.perso || d.mort) throw new Error("Crée d'abord ton personnage dans « Ma vie » (mode démo).");
  const c = data.celebrites.find(x => x.id === body.celeb), p = d.perso, F = p.sex === "F";
  const move = (icone, texte) => { d.mouvements = [{ icone, texte, par_consigne: 0, le: now }, ...(d.mouvements || [])].slice(0, 100); };
  if (path === "/api/offrande") {
    const job = JOBS.find(j => j.id === d.job), rev = job ? job.salaire * 30 : 0, type = body.type;
    const montant = type === "dime" ? titheOf(rev) : Math.round(Number(body.montant) * 20);
    const no = cannotGiveOffering({ type, montant, solde: p.makuta, toSelf: c.id === "moi", dimeDuMois: !!(d.dimeLe && now - d.dimeLe < 30 * 864e5), religieux: c.domaine === "religion" });
    if (no) throw new Error(no);
    d.recus = d.recus || []; const recu = offeringReceipt({ de: `${p.firstName} ${(p.lastName || "").charAt(0)}.`, vers: `${c.prenom} ${c.nom}`, titre: c.titre, type, montant, numero: d.recus.length + 1 });
    p.makuta -= montant; if (type === "dime") d.dimeLe = now; d.recus.unshift({ texte: recu, quartier: c.quartier, le: now });
    move("🙏", `Tu as ${type === "dime" ? "versé ta dîme" : "donné une offrande"} : ${fmtMakuta(montant)} à l'église de ${c.prenom} ${c.nom}. Le reçu est publié dans le journal.`);
    store.set("twolife_demo", d); return { ok: true, recu, montant };
  }
  const ev = celebEvent(celebLive(c, now));
  if (c.id === "moi") throw new Error("C'est toi ! Tu ne peux pas venir te voir toi-même.");
  if (!ev) throw new Error("Rien à voir en public en ce moment. Reviens plus tard.");
  d.assist = (d.assist || []).filter(x => now - x.le < 864e5);
  if (d.assist.length >= CELEB_VISITS_PER_DAY) throw new Error(`Tu es déjà sorti${F ? "e" : ""} ${CELEB_VISITS_PER_DAY} fois aujourd'hui. Ton personnage doit aussi travailler et se reposer.`);
  if (p.makuta < ev.prix) throw new Error("Pas assez d'argent pour le billet.");
  p.makuta -= ev.prix; d.assist.push({ celeb: c.id, le: now });
  move("🎟️", `${ev.titre} : tu es allé${F ? "e" : ""} voir ${c.prenom} ${c.nom} sur place${ev.prix ? ` (billet ${fmtMakuta(ev.prix)})` : " (entrée libre)"}. Bonne humeur +${ev.bonheur}.`);
  store.set("twolife_demo", d); return { ok: true, evenement: ev };
}
async function doAct(path, body, ok) {
  try { const j = await act(path, body); actMsg = { ok: true, t: ok(j) }; } catch (e) { actMsg = { ok: false, t: e.message }; }
  renderLive();
}

// ---- décors de la vie en direct (dessins simples, jour ou nuit)
const SCENES = {
  maison: c => `<rect x="300" y="150" width="200" height="110" fill="#2a2433"/><polygon points="285,150 400,90 515,150" fill="#3a2d24"/><rect x="330" y="180" width="40" height="34" fill="${c.win}"/><rect x="430" y="180" width="40" height="34" fill="${c.win}"/><rect x="385" y="205" width="30" height="55" fill="#120d0a"/><circle cx="600" cy="200" r="40" fill="#1f3a22"/><rect x="595" y="200" width="10" height="60" fill="#3a2418"/>`,
  nuit: c => SCENES.maison({ ...c, win: "#ffcf7a" }) + `<circle cx="680" cy="60" r="22" fill="#f2efe0"/><text x="410" y="140" font-size="26" fill="#bfae9f" font-family="sans-serif">z z z</text>`,
  parlement: c => `<rect x="180" y="130" width="440" height="130" fill="#3a3f4f"/><polygon points="160,130 400,70 640,130" fill="#4a5063"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${205 + i * 60}" y="145" width="16" height="115" fill="#e8ecf5" opacity=".75"/>`).join("")}<line x1="400" y1="70" x2="400" y2="30" stroke="#ddd" stroke-width="3"/><rect x="400" y="30" width="36" height="22" fill="#2d7bff"/><polygon points="400,52 436,30 436,36 406,52" fill="#f2c94c"/><polygon points="400,46 430,30 436,30 400,52" fill="#e0603a"/>`,
  stade: c => `<ellipse cx="400" cy="230" rx="330" ry="60" fill="#2e7d4f"/><ellipse cx="400" cy="230" rx="300" ry="48" fill="none" stroke="#e8ecf5" stroke-width="2" opacity=".6"/><line x1="400" y1="182" x2="400" y2="278" stroke="#e8ecf5" opacity=".6"/><path d="M70 230 Q70 120 400 110 Q730 120 730 230" fill="none" stroke="#4a5063" stroke-width="26"/>${[120, 680].map(x => `<line x1="${x}" y1="150" x2="${x}" y2="40" stroke="#888" stroke-width="5"/><rect x="${x - 22}" y="30" width="44" height="16" fill="${c.nuit ? "#fffbe0" : "#cfd6e4"}"/>`).join("")}`,
  salle: c => SCENES.bureau(c), bureau: c => `<rect x="250" y="80" width="300" height="180" fill="#2f3446"/>${[0, 1, 2, 3].map(r => [0, 1, 2, 3, 4].map(k => `<rect x="${270 + k * 56}" y="${95 + r * 40}" width="36" height="24" fill="${c.win}"/>`).join("")).join("")}`,
  studio: c => SCENES.bureau(c) + `<line x1="400" y1="80" x2="400" y2="30" stroke="#aaa" stroke-width="4"/><circle cx="400" cy="28" r="6" fill="#e5484d"/><text x="300" y="72" font-size="18" fill="#f2a33a" font-family="sans-serif" font-weight="700">STUDIO</text>`,
  radio: c => SCENES.studio(c),
  scene: c => `<rect x="120" y="170" width="560" height="40" fill="#3a2433"/><polygon points="200,0 260,0 330,170 250,170" fill="#fff" opacity=".12"/><polygon points="540,0 600,0 550,170 470,170" fill="#fff" opacity=".12"/>${Array.from({ length: 16 }, (_, i) => `<circle cx="${130 + i * 36}" cy="${250 + (i % 2) * 8}" r="14" fill="#0b0a10"/>`).join("")}<rect x="0" y="0" width="800" height="300" fill="${c.color}" opacity=".08"/>`,
  eglise: c => `<rect x="300" y="130" width="200" height="130" fill="#e8e0d0" opacity=".9"/><polygon points="290,130 400,70 510,130" fill="#b45a3c"/><rect x="380" y="40" width="40" height="40" fill="#e8e0d0"/><line x1="400" y1="10" x2="400" y2="40" stroke="#f2c94c" stroke-width="4"/><line x1="388" y1="20" x2="412" y2="20" stroke="#f2c94c" stroke-width="4"/><rect x="380" y="200" width="40" height="60" fill="#5a3a26"/><rect x="330" y="160" width="26" height="34" fill="${c.win}"/><rect x="444" y="160" width="26" height="34" fill="${c.win}"/>`,
  universite: c => `<rect x="220" y="120" width="360" height="140" fill="#d9cdb8" opacity=".9"/><polygon points="200,120 400,70 600,120" fill="#8a6a4a"/>${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${240 + i * 60}" y="135" width="14" height="125" fill="#f2ead8"/>`).join("")}<text x="330" y="112" font-size="16" fill="#fff" font-family="sans-serif" font-weight="700">UNIVERSITÉ</text>`,
  bibliotheque: c => SCENES.universite(c),
  boutique: c => `<rect x="260" y="130" width="280" height="130" fill="#2a2433"/><rect x="250" y="110" width="300" height="26" fill="${c.color}"/><rect x="290" y="160" width="220" height="70" fill="${c.win}" opacity=".85"/>${[0, 1, 2, 3, 4].map(i => `<rect x="${305 + i * 42}" y="190" width="24" height="40" fill="#e0603a" opacity=".8"/>`).join("")}`,
  marche: c => [0, 1, 2].map(i => `<polygon points="${130 + i * 200},140 ${250 + i * 200},140 ${262 + i * 200},166 ${118 + i * 200},166" fill="${["#e0603a", "#4fc58a", "#f2c94c"][i]}"/><rect x="${126 + i * 200}" y="166" width="128" height="70" fill="#1d140d"/><circle cx="${160 + i * 200}" cy="200" r="10" fill="#f2a33a"/><circle cx="${190 + i * 200}" cy="200" r="10" fill="#4fc58a"/>`).join(""),
  maquis: c => `<path d="M100 90 Q400 140 700 90" stroke="#555" fill="none"/>${Array.from({ length: 12 }, (_, i) => `<circle cx="${130 + i * 50}" cy="${100 + Math.sin(i / 1.9) * 12 + 10}" r="5" fill="${["#ffcf7a", "#e0603a", "#4fc58a"][i % 3]}"/>`).join("")}${[0, 1, 2].map(i => `<rect x="${190 + i * 160}" y="200" width="90" height="10" fill="#8a5a3a"/><rect x="${230 + i * 160}" y="210" width="8" height="40" fill="#5a3a26"/>`).join("")}`,
  quartier: c => `<rect x="80" y="160" width="120" height="100" fill="#3a2d24"/><rect x="230" y="140" width="100" height="120" fill="#2a2433"/><rect x="480" y="150" width="130" height="110" fill="#3a2d24"/><rect x="640" y="170" width="90" height="90" fill="#2a2433"/>${[110, 260, 520, 670].map(x => `<rect x="${x}" y="185" width="26" height="22" fill="${c.win}"/>`).join("")}`,
  route: c => SCENES.quartier(c) + `<rect x="0" y="255" width="800" height="45" fill="#2b2b33"/><g transform="translate(330 222)"><rect width="120" height="34" rx="8" fill="#14161c"/><rect x="18" y="-18" width="70" height="22" rx="6" fill="#14161c"/><circle cx="26" cy="36" r="10" fill="#000"/><circle cx="94" cy="36" r="10" fill="#000"/><circle cx="118" cy="16" r="5" fill="#ffcf7a"/></g>`,
  prison: c => `<rect x="250" y="110" width="300" height="150" fill="#4a4f5c"/>${Array.from({ length: 9 }, (_, i) => `<rect x="${280 + i * 30}" y="140" width="6" height="90" fill="#22252d"/>`).join("")}<text x="315" y="100" font-size="18" fill="#e8ecf5" font-family="sans-serif" font-weight="700">COMMISSARIAT</text>`,
  hopital: c => `<rect x="260" y="110" width="280" height="150" fill="#e8ecf5" opacity=".9"/><rect x="385" y="125" width="30" height="80" fill="#e5484d"/><rect x="360" y="150" width="80" height="30" fill="#e5484d"/>`,
};
function sceneSvg(lieu, nuit, c) {
  const ctx = { nuit, win: nuit ? "#ffcf7a" : "#9fb4d8", color: c.couleur };
  const sky = nuit ? ["#060914", "#1a1530"] : ["#ffb36b", "#ffe2b8"], ground = nuit ? "#0c0a10" : "#5a4a3a";
  const stars = nuit ? Array.from({ length: 24 }, (_, i) => `<circle cx="${(i * 97) % 800}" cy="${(i * 53) % 120}" r="1.4" fill="#fff" opacity=".7"/>`).join("") : `<circle cx="120" cy="60" r="30" fill="#fff4d0" opacity=".9"/>`;
  return `<svg viewBox="0 0 800 300" role="img" aria-label="${esc(lieu)}"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
    <rect width="800" height="300" fill="url(#sky)"/>${stars}<rect y="255" width="800" height="45" fill="${ground}"/>${(SCENES[lieu] || SCENES.quartier)(ctx)}
    <g transform="translate(700 230)"><circle r="30" fill="${c.couleur}" stroke="#fff" stroke-width="3"/><text y="8" text-anchor="middle" font-size="22" font-weight="700" fill="#0b0c12" font-family="sans-serif">${esc(initials(c))}</text></g></svg>`;
}

// mode démo : personnages du jeu, plus ton personnage s'il est élu
function demoData() {
  const now = Date.now(), cands = {};
  const d = store.get("twolife_demo", null);
  if (d && d.perso && !d.mort && String(d.job || "").startsWith("elu-")) {
    const p = d.perso, poste = d.job.slice(4), T = { president: ["Président de la République", "Présidente de la République"], senateur: ["Sénateur", "Sénatrice"], depute: ["Député national", "Députée nationale"] }[poste];
    cands.politique = [{ id: "moi", prenom: p.firstName, nom: (p.lastName || "").charAt(0) + ".", sexe: p.sex, quartier: p.quartier, age: Math.floor(ageYears(p.neLe, now)), rep: d.rep || 0, titre: T ? T[p.sex === "F" ? 1 : 0] : undefined, moi: true }];
  }
  const R = d && d.perso && !d.mort && JOBS.find(j => j.id === d.job && j.religion);   // métier d'église joué en démo
  if (R) cands.religion = [{ id: "moi", prenom: d.perso.firstName, nom: (d.perso.lastName || "").charAt(0) + ".", sexe: d.perso.sex, quartier: d.perso.quartier, age: Math.floor(ageYears(d.perso.neLe, now)), rep: d.rep || 0, titre: R.nom, moi: true }];
  for (const k in cands) cands[k].forEach(x => Object.assign(x, { logement: d.logement ? { quartier: d.logement.quartier, statut: d.logement.statut } : null, blesse: !!d.blessure, prison: !!(d.prison && d.prison > now) }));
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
function renderLive() {
  const c = data.celebrites.find(x => x.id === openId); if (!c) return show("list");
  const L = celebLive(c, Date.now()), H = x => String(x).padStart(2, "0") + " h";
  $("d-body").innerHTML = `<div class="head" style="margin-bottom:14px">${avatar(c, true)}<div><h1 style="font-size:clamp(22px,4vw,32px)">La vie de ${esc(c.prenom)} ${esc(c.nom)}</h1><div class="sub">${c.icone} ${sub(c)}</div></div></div>
    <div class="scene">${sceneSvg(L.maintenant.lieu, L.nuit, c)}<div class="live"><span class="rec">● En direct</span><span class="clock">Kinshasa ${L.heure}</span></div></div>
    <div class="now"><small>En ce moment</small><b>${esc(L.maintenant.texte)}</b></div>
    ${actionsHtml(c, L)}
    <h2>Sa journée</h2><div class="agenda">${L.agenda.map((a, i) => `<div class="${i === L.indice ? "on" : i < L.indice ? "done" : ""}"><time>${H(a.de)} – ${H(a.a)}</time><span>${i === L.indice ? "▶ " : i < L.indice ? "✓ " : ""}${esc(a.texte)}</span></div>`).join("")}</div>
    <h2>Où ${c.sexe === "F" ? "elle" : "il"} habite</h2><div class="cols">
      <div class="box"><h3>🏠 Sa maison</h3><p>${esc(L.maison)}</p><p>${esc(L.transport)}.</p>${L.famille ? `<p>${esc(L.famille)}.</p>` : ""}</div>
      <div class="box"><h3>📍 ${esc(L.commune.nom)}${L.commune.zone ? " · " + esc(L.commune.zone) : ""}</h3>${L.commune.bon ? `<ul>${L.commune.bon.map(x => `<li>👍 ${esc(x)}</li>`).join("")}${(L.commune.mauvais || []).map(x => `<li>👎 ${esc(x)}</li>`).join("")}</ul>` : ""}</div>
      <div class="box"><h3>👥 Son entourage</h3><ul>${L.entourage.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </div>
    <p class="note">${c.joueur ? "Joueur réel : sa maison, ses soins et ses ennuis viennent du jeu ; son emploi du temps suit l'heure de Kinshasa." : "Personnage du jeu : sa journée suit l'heure réelle de Kinshasa. Revenez ce soir, il ne fera pas la même chose."}</p>`;
}
function actionsHtml(c, L) {
  const ev = celebEvent(L), lieu3d = ev && LIEU_3D[ev.lieu];
  const see = ev ? `<div class="box act"><h3>🎟️ Aller ${c.sexe === "F" ? "la" : "le"} voir sur place</h3><p>${esc(ev.titre)} · ${ev.prix ? "billet " + fmtMakuta(ev.prix) : "entrée libre"}. Ton personnage y va et gagne de la bonne humeur.</p>
      <div class="row"><button type="button" class="btn" id="go-see">J'y vais</button>${lieu3d ? `<a class="btn ghost" href="jouer.html?lieu=${lieu3d}">📍 Voir le lieu en 3D</a>` : ""}</div></div>`
    : `<div class="box act"><h3>🎟️ Sur place</h3><p>Pas d'événement public en ce moment. Revenez pendant un culte, un concert, un match ou une séance publique.</p></div>`;
  const give = c.domaine === "religion" && c.id !== "moi" ? `<div class="box act"><h3>🙏 Soutenir son église</h3><p>La dîme : 10 % de tes revenus du mois, une fois par mois. L'offrande est libre (1 à 1 000 e-makuta). Chaque don publie un reçu dans le journal.</p>
      <div class="row"><button type="button" class="btn" id="give-dime">Payer ma dîme</button><label class="amt"><input id="off-amt" type="number" min="1" max="1000" step="1" value="${offAmt}" aria-label="Montant de l'offrande en e-makuta"> e-makuta</label><button type="button" class="btn ghost" id="give-off">Donner l'offrande</button></div></div>` : "";
  const m = actMsg ? `<p class="act-msg ${actMsg.ok ? "ok" : "ko"}" role="status">${esc(actMsg.t)}</p>` : "";
  return `<div class="acts">${see}${give}</div>${m}`;
}
function show(id) {
  for (const s of ["menu", "list", "fiche", "direct"]) $(s).hidden = s !== id;
  clearInterval(liveTimer);
  if (id === "list") renderList(); if (id === "fiche") renderFiche(); if (id === "menu") renderMenu();
  if (id === "direct") { renderLive(); liveTimer = setInterval(renderLive, 30e3); }
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
  if (b.id === "go-see") return doAct("/api/celebrites/assister", { celeb: openId }, j => `✅ ${j.evenement.titre} : ton personnage est sur place${j.evenement.prix ? " (billet " + fmtMakuta(j.evenement.prix) + ")" : ""}. Bonne humeur +${j.evenement.bonheur}.`);
  if (b.id === "give-dime") return doAct("/api/offrande", { celeb: openId, type: "dime" }, j => "🙏 " + j.recu);
  if (b.id === "give-off") { offAmt = Math.max(1, Math.min(1000, Math.round(Number($("off-amt").value) || 1))); return doAct("/api/offrande", { celeb: openId, type: "offrande", montant: offAmt }, j => "🙏 " + j.recu); }
  if (b.id === "to-menu") { history.pushState({ v: "menu" }, "", "#"); show("menu"); return; }
  if (b.id === "to-list") { history.pushState({ v: "list" }, "", "#liste"); show("list"); return; }
  if (b.id === "f-prev" || b.id === "f-next") { const L = list().length ? list() : data.celebrites, i = L.findIndex(c => c.id === openId); return open(L[(i + (b.id === "f-next" ? 1 : -1) + L.length) % L.length].id); }
  if (b.id === "f-live") { history.pushState({ v: "direct", id: openId }, "", "#direct-" + openId); show("direct"); return; }
  if (b.id === "to-fiche") { history.pushState({ v: "fiche", id: openId }, "", "#" + openId); show("fiche"); return; }
  if (b.id === "f-follow") { const f = store.get(LS_FOLLOW, []), i = f.indexOf(openId); if (i >= 0) f.splice(i, 1); else f.push(openId); store.set(LS_FOLLOW, f); renderFiche(); }
});
window.addEventListener("popstate", e => { const s = e.state || {}; if (s.v === "fiche" || s.v === "direct") { openId = s.id; show(s.v); } else show(s.v || "menu"); });

data = await load();
const h0 = location.hash.slice(1);
if (h0 === "liste") show("list"); else if (h0.startsWith("direct-") && data.celebrites.some(c => c.id === h0.slice(7))) { openId = h0.slice(7); show("direct"); } else if (h0 && data.celebrites.some(c => c.id === h0)) { openId = h0; show("fiche"); } else show("menu");
