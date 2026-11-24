// 2 Life : écran du personnage. Parle au serveur (Cloudflare Worker) ou, sans serveur configuré,
// simule la même vie dans le navigateur (mode démo).
import {
  ageYears, stageOf, STAGES, realMsUntil, TALENTS, ACTIVITIES, rng, drawTalents, doActivity, needsAt, newIdentity, BIRTH_GIFT,
} from "../server/src/life.js";

const API = (window.TWO_LIFE_API || "").replace(/\/$/, "");
const $ = id => document.getElementById(id);
const LS_TOKEN = "twolife_token", LS_DEMO = "twolife_demo";
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } },
};

// ---------------------------------------------------------------- mode démo (même règles, dans le navigateur)
const FOOD = { prix: 25, faim: 45 };
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
        besoins: Object.fromEntries(Object.entries(n).map(([k, v]) => [k, Math.round(v)])), makuta: c.makuta, pere: c.father, mere: c.mother, vivant: true,
        talents: c.talents.filter(t => t.discovered).map(t => ({ id: t.talent, label: TALENTS.find(x => x.id === t.talent).label, niveau: t.level })),
        talentsCaches: c.talents.filter(t => !t.discovered).length,
        indices: c.talents.filter(t => !t.discovered && t.hints > 0).map(t => TALENTS.find(x => x.id === t.talent).hint),
      },
      activites: ACTIVITIES.map(a => ({ id: a.id, label: a.label, minAge: a.minAge, energie: a.energy })),
      repas: FOOD,
    };
  },
  settle(c) { const n = needsAt(c); Object.assign(c, n, { updatedAt: Date.now() }); },
  async call(path, body) {
    let d = store.get(LS_DEMO);
    if (path === "/api/inscription") {
      const r = rng(this.seed()), who = newIdentity(r);
      d = { pseudo: body.pseudo, email: body.email, perso: { ...who, neLe: Date.now(), updatedAt: Date.now(), hunger: 100, energy: 100, happiness: 80, health: 100, makuta: BIRTH_GIFT, talents: drawTalents(r).map(t => ({ ...t, discovered: false, hints: 0 })) } };
      store.set(LS_DEMO, d); store.set(LS_TOKEN, "demo");
      return { token: "demo", ...this.view(d), naissance: true };
    }
    if (path === "/api/connexion") {
      if (!d || d.email !== String(body.email || "").trim().toLowerCase()) throw new Error("Aucun personnage de démo pour cette adresse sur cet appareil.");
      store.set(LS_TOKEN, "demo"); return { token: "demo", ...this.view(d) };
    }
    if (!d) throw new Error("Connecte-toi pour continuer.");
    const c = d.perso;
    if (path === "/api/moi") return this.view(d);
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
  const p = v.perso;
  $("v-auth").hidden = true; $("v-life").hidden = false;
  $("h-name").textContent = `${p.prenom} ${p.nom}`;
  $("h-age").textContent = `${fmtAge(p.age)} · ${p.quartier}, ${p.ville}` + (p.prochaineEtape ? ` · ${p.prochaineEtape.label} dans ${fmtWait(p.prochaineEtape.dansMs)}` : "");
  $("h-stage").textContent = p.etapeLabel;
  $("h-money").textContent = `${p.makuta.toLocaleString("fr-FR")} e-makuta`;
  $("needs").innerHTML = NEEDS.map(([k, label]) => {
    const x = p.besoins[k], cls = x < 25 ? "low" : x < 55 ? "mid" : "";
    return `<div class="need">${label} · ${x}<div class="bar"><i class="${cls}" style="width:${x}%"></i></div></div>`;
  }).join("");
  $("b-eat").textContent = `Manger au maquis (${v.repas.prix} e-makuta)`;
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
  $("ident").innerHTML = [["Joueur", v.compte.pseudo], ["Mère", p.mere], ["Père", p.pere], ["Quartier", `${p.quartier}, ${p.ville}`],
    ["Né le", new Date(p.neLe).toLocaleDateString("fr-FR")]].map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join("");
  portrait(p);
}

function showAuth() {
  $("v-life").hidden = true; $("v-auth").hidden = false;
  $("f-pseudo").hidden = !signup;
  $("b-auth").textContent = signup ? "Naître à Kinshasa" : "Se connecter";
  $("sw-text").textContent = signup ? "Déjà un compte ?" : "Pas encore de vie ?";
  $("sw").textContent = signup ? "Se connecter" : "Créer un compte";
  $("pass").autocomplete = signup ? "new-password" : "current-password";
}

$("sw").onclick = () => { signup = !signup; $("auth-err").textContent = ""; showAuth(); };
$("f-auth").onsubmit = async e => {
  e.preventDefault();
  const b = $("b-auth"); b.disabled = true; $("auth-err").textContent = "";
  try {
    const body = { email: $("email").value, motdepasse: $("pass").value, pseudo: $("pseudo").value };
    if (!API && signup && body.motdepasse.length < 8) throw new Error("Le mot de passe doit faire au moins 8 caractères.");
    if (!API && signup && body.pseudo.trim().length < 2) throw new Error("Choisis un pseudo d'au moins 2 caractères.");
    const v = await call(signup ? "/api/inscription" : "/api/connexion", body);
    store.set(LS_TOKEN, v.token);
    render(v);
    if (v.naissance) toast(`Félicitations ! ${v.perso.prenom} vient de naître à ${v.perso.quartier}. Ses parents lui offrent ${v.perso.makuta} e-makuta.`);
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
    if (state) portrait(state.perso);
  });
  const loop = () => {
    requestAnimationFrame(loop);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); frame(); }
    const dt = P3.clock.getDelta();
    if (P3.mixer) P3.mixer.update(dt);
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
function portrait(p) {
  if (!P3.ready) return;
  const list = (BY_STAGE[p.etape] || BY_STAGE.adulte)[p.sexe].filter(v => P3.tpl[v]);
  const adults = BY_STAGE.adulte[p.sexe].filter(v => P3.tpl[v]);
  const v = (list.length ? list : adults)[p.apparence % (list.length || adults.length)];
  const key = v + ":" + p.etape;
  if (P3.key === key) return;
  P3.key = key;
  const T = P3.T;
  if (P3.obj) P3.scene.remove(P3.obj);
  const obj = T.SkeletonUtils.clone(P3.tpl[v]);
  obj.position.set(0, 0, 0);
  obj.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.material = o.material.clone(); } });
  // repli : un adulte réduit si le modèle d'enfant n'existe pas encore
  const fallback = !list.length, s = fallback ? { bebe: .42, enfant: .62, ado: .88 }[p.etape] || 1 : 1;
  obj.scale.setScalar(s);
  P3.scene.add(obj); P3.obj = obj;
  P3.mixer = new T.AnimationMixer(obj);
  const clip = P3.clips[v] && P3.clips[v].idle;
  if (clip) P3.mixer.clipAction(clip).play();
  // cadrage : on mesure le squelette animé (la géométrie au repos n'est pas à sa place réelle)
  P3.mixer.update(0); obj.updateMatrixWorld(true);
  const wp = new T.Vector3(); let lo = 1e9, hi = -1e9, head = null, pel = null;
  obj.traverse(b => { if (!b.isBone) return; b.getWorldPosition(wp); lo = Math.min(lo, wp.y); hi = Math.max(hi, wp.y); if (b.name === "head") head = wp.clone(); if (b.name === "pelvis") pel = wp.clone(); });
  if (pel) { obj.position.x -= pel.x; obj.position.z -= pel.z; }
  const top = head ? head.y + (head.y - lo) * .16 : hi, box = { min: { y: Math.max(0, lo - (top - lo) * .03) } }, h = Math.max(.3, top - box.min.y);
  P3.box = { min: box.min.y, h };
  frame();
}
function frame() {
  if (!P3.box) return;
  const { min, h } = P3.box, cam = P3.cam, half = Math.tan(cam.fov * Math.PI / 360);
  const need = h * 1.26 / 2, d = Math.max(need / half, need / (half * Math.min(1, cam.aspect)) * .6);
  const cy = min + h * .52;
  cam.position.set(0, cy + h * .04, d);
  cam.lookAt(0, cy, 0);
}

// ---------------------------------------------------------------- démarrage
$("mode").textContent = API ? "En ligne" : "Mode démo";
initPortrait();
(async () => {
  if (store.get(LS_TOKEN)) { try { render(await call("/api/moi")); } catch (e) { signup = false; showAuth(); } }
  else showAuth();
  setInterval(async () => { if (state) try { render(await call("/api/moi")); } catch (e) { } }, 60000);
})();
