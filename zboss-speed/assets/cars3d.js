// Zboss-speed — modèles 3D des voitures (three.js).
// Carrosseries profilées (silhouette latérale extrudée puis galbée), habitacle vitré,
// passages de roue, jantes, signatures lumineuses LED, vernis carrosserie avec reflets.
// Modèles originaux : aucune forme, logo ou nom de constructeur réel.
(function () {
  "use strict";
  if (!window.THREE) return;
  const T = THREE;

  // ---------------------------------------------------------------- Profils
  // L longueur, Wd largeur, H hauteur de toit, belt ligne de caisse, nose/tail hauteurs,
  // ws base du pare-brise, rf/rr avant/arrière du toit, re fin de lunette, wb empattement, wr rayon de roue
  const PROFILES = {
    kasai:   { L: 4.6, Wd: 2.02, H: 1.14, belt: .86, nose: .42, tail: .9, ws: .75, rf: .02, rr: -.62, re: -1.45, wb: 2.7, wr: .37, wing: true, intake: true, rim: "#1a1c22", led: "blade" },
    lualaba: { L: 4.75, Wd: 2.04, H: 1.16, belt: .84, nose: .4, tail: .82, ws: .7, rf: -.05, rr: -.7, re: -1.7, wb: 2.75, wr: .38, lower: "#1a140e", rim: "#2a2116", led: "blade", longtail: true },
    gombe:   { L: 4.7, Wd: 2.06, H: 1.1, belt: .82, nose: .38, tail: .86, ws: .72, rf: 0, rr: -.68, re: -1.6, wb: 2.75, wr: .38, rim: "#0d0e12", led: "quad", diffuser: true, intake: true },
    kivu:    { L: 4.5, Wd: 2.0, H: 1.15, belt: .86, nose: .44, tail: .92, ws: .7, rf: .0, rr: -.6, re: -1.35, wb: 2.65, wr: .37, wing: true, scoop: true, rim: "#c9ced8", led: "blade" },
    ituri:   { L: 4.4, Wd: 1.98, H: 1.0, belt: .84, nose: .42, tail: .86, ws: .55, rf: .1, rr: -.2, re: -.5, wb: 2.6, wr: .36, roadster: true, rim: "#d9dde5", led: "round" },
    mayombe: { L: 4.55, Wd: 1.94, H: 1.22, belt: .9, nose: .6, tail: .82, ws: .3, rf: -.35, rr: -.95, re: -1.85, wb: 2.6, wr: .36, chrome: true, rim: "#d9dde5", led: "round", fastback: true },
    // trafic et police
    sedan:   { L: 4.7, Wd: 1.88, H: 1.45, belt: 1.0, nose: .72, tail: .98, ws: 1.05, rf: .35, rr: -.95, re: -1.65, wb: 2.8, wr: .34, rim: "#b9bec8", led: "blade" },
    suv:     { L: 4.75, Wd: 1.95, H: 1.72, belt: 1.12, nose: .9, tail: 1.1, ws: 1.2, rf: .55, rr: -1.95, re: -2.25, wb: 2.85, wr: .38, rim: "#9aa0ab", led: "blade", suv: true },
    hatch:   { L: 4.05, Wd: 1.8, H: 1.48, belt: 1.0, nose: .7, tail: 1.0, ws: .85, rf: .2, rr: -1.55, re: -1.92, wb: 2.55, wr: .32, rim: "#9aa0ab", led: "blade" },
  };
  const CAR_PROFILE = { player: null, police: "sedan", taxi: "sedan" };

  // ---------------------------------------------------------------- Outils géométrie
  function mergeGeos(list) {
    // list: [{ geo, matrix }] -> une seule BufferGeometry (positions + normales)
    let n = 0; const parts = [];
    list.forEach(({ geo, matrix }) => { const g = (geo.index ? geo.toNonIndexed() : geo.clone()); if (matrix) g.applyMatrix4(matrix); parts.push(g); n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    parts.forEach(g => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); });
    const out = new T.BufferGeometry(); out.setAttribute("position", new T.BufferAttribute(pos, 3)); out.setAttribute("normal", new T.BufferAttribute(nor, 3));
    out.computeBoundingSphere(); return out;
  }
  const M = () => new T.Matrix4();
  const at = (x, y, z, rx, ry, rz) => { const m = M(); m.compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)), new T.Vector3(1, 1, 1)); return m; };
  const boxG = (w, h, d) => new T.BoxGeometry(w, h, d);

  function extrude(shape, width, bevel, seg) {
    const g = new T.ExtrudeGeometry(shape, { depth: Math.max(.01, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * .9, bevelSegments: seg || 3, curveSegments: 14, steps: 1 });
    g.translate(0, 0, -(width - bevel * 2) / 2);
    return g;
  }
  function shapeZ(g, fn) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * fn(p.getX(i), p.getY(i)));
    p.needsUpdate = true; creased(g, 50);
  }
  // normales lissées sauf sur les arêtes vives (angle > seuil)
  function creased(g, deg) {
    if (g.index) { const n = g.toNonIndexed(); g.setAttribute("position", n.attributes.position); g.setIndex(null); }
    const p = g.attributes.position, cnt = p.count, fn = new Float32Array(cnt * 3), acc = new Map(), key = i => `${Math.round(p.getX(i) * 1e3)},${Math.round(p.getY(i) * 1e3)},${Math.round(p.getZ(i) * 1e3)}`;
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i < cnt; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      const n = c.sub(b).cross(a.sub(b)).normalize();
      for (let k = 0; k < 3; k++) { fn.set([n.x, n.y, n.z], (i + k) * 3); const kk = key(i + k); let L = acc.get(kk); if (!L) acc.set(kk, L = []); L.push(i + k); }
    }
    const out = new Float32Array(cnt * 3), cos = Math.cos(deg * Math.PI / 180);
    acc.forEach(L => L.forEach(i => {
      let x = 0, y = 0, z = 0; const nx = fn[i * 3], ny = fn[i * 3 + 1], nz = fn[i * 3 + 2];
      L.forEach(j => { const d = nx * fn[j * 3] + ny * fn[j * 3 + 1] + nz * fn[j * 3 + 2]; if (d > cos) { x += fn[j * 3]; y += fn[j * 3 + 1]; z += fn[j * 3 + 2]; } });
      const l = Math.hypot(x, y, z) || 1; out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
    }));
    g.setAttribute("normal", new T.BufferAttribute(out, 3));
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------------------- Carrosserie
  function bodyGeo(P) {
    const f = P.L / 2, r = -P.L / 2, y0 = .2, wf = P.wb / 2 + (P.longtail ? -.1 : 0), wrr = -P.wb / 2 - (P.longtail ? .1 : 0), ar = P.wr + .07, wy = P.wr;
    const s = new T.Shape();
    s.moveTo(r + .05, y0 + .1);
    s.lineTo(wrr - ar, y0); s.lineTo(wrr - ar, wy);
    s.absarc(wrr, wy, ar, Math.PI, 0, true);
    s.lineTo(wrr + ar, y0); s.lineTo(wf - ar, y0); s.lineTo(wf - ar, wy);
    s.absarc(wf, wy, ar, Math.PI, 0, true);
    s.lineTo(wf + ar, y0); s.lineTo(f - .12, y0 + .02);
    s.quadraticCurveTo(f, y0 + .04, f, P.nose);
    // capot -> base du pare-brise
    if (P.suv) s.splineThru([new T.Vector2(f - .35, P.nose + .1), new T.Vector2(P.ws, P.belt)]);
    else s.splineThru([new T.Vector2(f - .3, P.nose + .1), new T.Vector2((f + P.ws) / 2, (P.nose + P.belt) / 2 + .06), new T.Vector2(P.ws, P.belt)]);
    s.lineTo(P.re, P.belt);
    // pont arrière -> poupe
    if (P.longtail) s.splineThru([new T.Vector2((P.re + r) / 2, P.tail + .07), new T.Vector2(r + .12, P.tail + .02), new T.Vector2(r, P.tail - .08)]);
    else s.splineThru([new T.Vector2((P.re + r) / 2, (P.belt + P.tail) / 2 + .02), new T.Vector2(r + .08, P.tail), new T.Vector2(r, P.tail - .12)]);
    s.lineTo(r, y0 + .2);
    s.quadraticCurveTo(r, y0 + .1, r + .05, y0 + .1);
    const g = extrude(s, P.Wd, .09, 4);
    shapeZ(g, (x, y) => {
      const t = clamp((y - .5) / .5, 0, 1), fx = clamp((Math.abs(x) - (P.L / 2 - .75)) / .75, 0, 1);
      return (1 - .1 * t) * (1 - .16 * fx * fx) * (y < .32 ? .985 : 1);
    });
    return g;
  }
  function cabinGeo(P) {
    const s = new T.Shape(), b = P.belt - .03;
    s.moveTo(P.ws + .04, b);
    if (P.roadster) {
      // pare-brise seul
      s.quadraticCurveTo(P.ws - .1, b + .1, P.rf, P.H); s.lineTo(P.rf - .06, P.H); s.quadraticCurveTo(P.ws - .2, b + .1, P.ws - .1, b);
      const g = extrude(s, P.Wd * .84, .03, 2); shapeZ(g, (x, y) => 1 - .12 * clamp((y - b) / (P.H - b), 0, 1)); return g;
    }
    s.quadraticCurveTo((P.ws + P.rf) / 2 + .05, (b + P.H) / 2 + .1, P.rf, P.H);
    s.lineTo(P.rr, P.H);
    if (P.fastback || P.suv) s.quadraticCurveTo((P.rr + P.re) / 2, P.H - .02, P.re - .02, b);
    else s.quadraticCurveTo((P.rr + P.re) / 2 - .05, (b + P.H) / 2 + .1, P.re - .02, b);
    s.lineTo(P.ws + .04, b);
    const g = extrude(s, P.Wd * .9, .06, 3);
    shapeZ(g, (x, y) => 1 - (P.suv ? .1 : .3) * clamp((y - b) / (P.H - b), 0, 1));
    return g;
  }
  function roofGeo(P) {
    // panneau de toit couleur carrosserie, légèrement bombé
    const len = (P.rf - P.rr) - .12, w = P.Wd * .9 * (1 - (P.suv ? .1 : .3)) - .02;
    const g = new T.BoxGeometry(len, .035, w, 4, 1, 4); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i) / (w / 2), x = p.getX(i) / (len / 2); p.setY(i, p.getY(i) + .03 * (1 - z * z) * (1 - .4 * x * x)); }
    g.computeVertexNormals(); g.translate((P.rf + P.rr) / 2, P.H + .005, 0); return g;
  }

  // ---------------------------------------------------------------- Roues
  function wheelParts(P, list) {
    const tire = new T.CylinderGeometry(P.wr, P.wr, .3, 22, 1); tire.rotateX(Math.PI / 2);
    const rim = new T.CylinderGeometry(P.wr * .7, P.wr * .7, .31, 20, 1); rim.rotateX(Math.PI / 2);
    const spoke = boxG(.035, P.wr * 1.3, .035);
    const z = P.Wd / 2 - .2;
    [[P.wb / 2 + (P.longtail ? -.1 : 0), 1], [P.wb / 2 + (P.longtail ? -.1 : 0), -1], [-P.wb / 2 - (P.longtail ? .1 : 0), 1], [-P.wb / 2 - (P.longtail ? .1 : 0), -1]].forEach(([x, sd]) => {
      list.tire.push({ geo: tire, matrix: at(x, P.wr, z * sd) });
      list.rim.push({ geo: rim, matrix: at(x, P.wr, z * sd) });
      for (let k = 0; k < 5; k++) list.dark.push({ geo: spoke, matrix: at(x, P.wr, (z + .16) * sd, 0, 0, k / 5 * Math.PI) });
      list.accent.push({ geo: boxG(.16, .12, .06), matrix: at(x + .12, P.wr + .1, (z + .1) * sd, 0, 0, .5) }); // étrier
    });
  }

  // ---------------------------------------------------------------- Assemblage
  const cache = new Map();
  function buildParts(key, P, opts) {
    if (cache.has(key)) return cache.get(key);
    const L = { body: [], lower: [], glass: [], dark: [], rim: [], tire: [], head: [], tail: [], chrome: [], accent: [] };
    L.body.push({ geo: bodyGeo(P) });
    L.glass.push({ geo: cabinGeo(P) });
    if (!P.roadster) L.body.push({ geo: roofGeo(P) });
    const f = P.L / 2, r = -P.L / 2, zL = P.Wd / 2, r2 = r - .085, zF = zL * .84;
    // bas de caisse, diffuseur, lame avant
    L.dark.push({ geo: boxG(P.wb - 1.1, .06, P.Wd * .82), matrix: at(0, .15, 0) });
    L.dark.push({ geo: boxG(.3, .05, P.Wd * .6), matrix: at(f - .05, .14, 0) });
    L.dark.push({ geo: boxG(.3, P.diffuser ? .26 : .2, P.Wd * .78), matrix: at(r + .02, .27, 0) });
    if (!P.chrome) L.dark.push({ geo: boxG(.03, .12, P.Wd * .5), matrix: at(r2, P.tail - .36, 0) });
    if (P.diffuser) for (let k = -2; k <= 2; k++) L.dark.push({ geo: boxG(.34, .15, .02), matrix: at(r, .2, k * .25) });
    // calandre / entrée d'air avant
    L.dark.push({ geo: boxG(.06, P.suv ? .3 : .13, P.Wd * (P.suv ? .55 : .6)), matrix: at(f + .05, P.suv ? P.nose - .25 : .3, 0) });
    // rétroviseurs
    if (!P.roadster) [1, -1].forEach(sd => L.dark.push({ geo: boxG(.16, .08, .16), matrix: at(P.ws - .2, P.belt + .07, (zL * .93) * sd) }));
    // prises d'air latérales
    if (P.intake) [1, -1].forEach(sd => L.dark.push({ geo: boxG(.5, .2, .04), matrix: at(-P.wb / 2 + .7, .62, (zL - .06) * sd, 0, 0, -.12) }));
    if (P.scoop) L.dark.push({ geo: boxG(.6, .12, .35), matrix: at(P.rr - .25, P.H + .02, 0) });
    // aileron
    if (P.wing) {
      L.dark.push({ geo: boxG(.32, .04, P.Wd * .9), matrix: at(r + .15, P.tail + .33, 0, 0, 0, .08) });
      [1, -1].forEach(sd => L.dark.push({ geo: boxG(.08, .3, .04), matrix: at(r + .2, P.tail + .17, .55 * sd) }));
    }
    // roadster : arceaux et sièges
    if (P.roadster) [1, -1].forEach(sd => { L.dark.push({ geo: boxG(.4, .36, .42), matrix: at(-.4, P.belt, .42 * sd) }); L.dark.push({ geo: boxG(.12, .5, .34), matrix: at(-.62, P.belt + .12, .42 * sd, 0, 0, .15) }); });
    // pare-chocs chromés (rétro)
    if (P.chrome) { L.chrome.push({ geo: boxG(.08, .08, P.Wd * .92), matrix: at(f + .08, .32, 0) }); L.chrome.push({ geo: boxG(.08, .08, P.Wd * .92), matrix: at(r2, .36, 0) }); }
    // phares
    const hy = P.nose - (P.suv ? .12 : .06), f2 = f + .085;
    if (P.led === "quad") { for (let k = 0; k < 4; k++) [1, -1].forEach(sd => L.head.push({ geo: boxG(.03, .06, .07), matrix: at(f2, hy, (zF - .12 - k * .1) * sd) })); }
    else if (P.led === "round") [1, -1].forEach(sd => { const g = new T.CylinderGeometry(.09, .09, .06, 14); g.rotateZ(Math.PI / 2); L.head.push({ geo: g, matrix: at(f2, hy, (zF - .22) * sd) }); });
    else [1, -1].forEach(sd => L.head.push({ geo: boxG(.03, .06, .42), matrix: at(f2, hy, (zF - .3) * sd) }));
    // feux arrière : bandeau LED pleine largeur ou ronds
    if (P.led === "round") [1, -1].forEach(sd => [.3, .55].forEach(o => { const g = new T.CylinderGeometry(.07, .07, .05, 12); g.rotateZ(Math.PI / 2); L.tail.push({ geo: g, matrix: at(r2, P.tail - .2, (zF - o + .05) * sd) }); }));
    else { L.tail.push({ geo: boxG(.03, .05, P.Wd * .7), matrix: at(r2, P.tail - .2, 0) }); [1, -1].forEach(sd => L.tail.push({ geo: boxG(.03, .12, .24), matrix: at(r2, P.tail - .22, (zF - .2) * sd) })); }
    // échappements
    [1, -1].forEach(sd => { const g = new T.CylinderGeometry(.06, .06, .14, 10); g.rotateZ(Math.PI / 2); L.chrome.push({ geo: g, matrix: at(r2, .32, (P.diffuser ? .12 : .4) * sd) }); });
    // bande de bas de caisse bicolore
    if (P.lower) [1, -1].forEach(sd => L.lower.push({ geo: boxG(P.wb - .75, .16, .03), matrix: at(0, .38, (zL - .1) * sd) }));
    wheelParts(P, L);
    const merged = {};
    for (const k in L) if (L[k].length) merged[k] = mergeGeos(L[k]);
    cache.set(key, merged); return merged;
  }

  // ---------------------------------------------------------------- Matériaux
  let envMap = null;
  function makeEnv(renderer) {
    if (envMap) return envMap;
    const sc = new T.Scene();
    const g = new T.SphereGeometry(50, 32, 16), cols = [], p = g.attributes.position;
    const top = new T.Color("#7e8fbf"), hor = new T.Color("#ffc59a"), gnd = new T.Color("#2a2220");
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 50, c = new T.Color(); if (y > 0) c.copy(hor).lerp(top, Math.min(1, y * 1.6)); else c.copy(hor).lerp(gnd, Math.min(1, -y * 5)); cols.push(c.r, c.g, c.b); }
    g.setAttribute("color", new T.Float32BufferAttribute(cols, 3));
    sc.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    // panneaux lumineux (reflets nets de « studio »)
    const lm = new T.MeshBasicMaterial({ color: "#ffffff" });
    [[0, 30, 0, -Math.PI / 2, 40, 8], [30, 10, -20, 0, 18, 6], [-30, 8, 25, 0, 14, 5]].forEach(([x, y, z, rx, w, h]) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), lm); m.position.set(x, y, z); m.rotation.x = rx; m.lookAt(0, 0, 0); sc.add(m); });
    const pm = new T.PMREMGenerator(renderer);
    envMap = pm.fromScene(sc, .02).texture; pm.dispose();
    return envMap;
  }
  const matCache = {};
  function mats(color, P, police) {
    const k = color + (P.lower || "") + (P.rim || "") + (police ? "p" : "");
    if (matCache[k]) return matCache[k];
    const env = envMap, C = h => new T.Color(h).convertSRGBToLinear();
    const paint = new T.MeshPhysicalMaterial({ color: C(color), metalness: .25, roughness: .34, clearcoat: 1, clearcoatRoughness: .04, envMap: env, envMapIntensity: .9 });
    const m = {
      body: paint,
      lower: new T.MeshPhysicalMaterial({ color: C(P.lower || "#111"), metalness: .4, roughness: .4, clearcoat: .6, envMap: env }),
      glass: new T.MeshPhysicalMaterial({ color: "#0b1018", metalness: .9, roughness: .05, clearcoat: 1, envMap: env, envMapIntensity: 1.5 }),
      dark: new T.MeshStandardMaterial({ color: "#0c0d10", metalness: .3, roughness: .55, envMap: env, envMapIntensity: .5 }),
      rim: new T.MeshStandardMaterial({ color: C(P.rim || "#c0c5cf"), metalness: 1, roughness: .22, envMap: env }),
      tire: new T.MeshStandardMaterial({ color: "#101012", roughness: .92 }),
      head: new T.MeshBasicMaterial({ color: "#f4f8ff", toneMapped: false }),
      tail: new T.MeshBasicMaterial({ color: "#ff0a14", toneMapped: false }),
      chrome: new T.MeshStandardMaterial({ color: "#e8ecf2", metalness: 1, roughness: .12, envMap: env }),
      accent: new T.MeshStandardMaterial({ color: police ? "#1f3f8f" : "#ff5a1f", roughness: .4 }),
    };
    matCache[k] = m; return m;
  }

  // ---------------------------------------------------------------- API
  // build("kasai", { color }) | build("police") | build("taxi") | build("sedan"|"suv"|"hatch", { color })
  function build(type, opts) {
    opts = opts || {};
    const police = type === "police", taxi = type === "taxi";
    const pkey = PROFILES[type] ? type : (police || taxi ? "sedan" : "sedan");
    const P = PROFILES[pkey];
    const parts = buildParts(pkey, P);
    const color = opts.color || (police ? "#f4f6fa" : taxi ? "#f2c230" : "#888");
    const m = mats(color, P, police);
    const g = new T.Group();
    for (const k in parts) { const mesh = new T.Mesh(parts[k], m[k]); mesh.castShadow = opts.shadow !== false && (k === "body" || k === "glass" || k === "tire"); g.add(mesh); }
    if (police || taxi) {
      // livrée : bande latérale bleue
      const band = new T.Mesh(livery(P), m.accent.clone()); band.material.color.set("#1d4fa0"); g.add(band);
    }
    if (police) {
      const bar = new T.Group(); bar.position.set((P.rf + P.rr) / 2 + .1, P.H + .1, 0); g.add(bar);
      bar.add(new T.Mesh(boxG(.28, .06, 1.1), m.dark));
      const r = new T.Mesh(boxG(.26, .1, .46), new T.MeshBasicMaterial({ color: "#ff2d4a" })); r.position.set(0, .07, .27); bar.add(r);
      const b = new T.Mesh(boxG(.26, .1, .46), new T.MeshBasicMaterial({ color: "#2d7bff" })); b.position.set(0, .07, -.27); bar.add(b);
      g.userData.bar = { r, b };
    }
    if (taxi) { const sign = new T.Mesh(boxG(.3, .16, .5), new T.MeshBasicMaterial({ color: "#fff3c4" })); sign.position.set((P.rf + P.rr) / 2, P.H + .12, 0); g.add(sign); }
    return g;
  }
  const livCache = {};
  function livery(P) {
    const k = P.L + "_" + P.Wd; if (livCache[k]) return livCache[k];
    const geos = [1, -1].map(sd => ({ geo: boxG(P.L * .5, .14, .02), matrix: at(-.05, .62, (P.Wd / 2 * .976 + .012) * sd) }));
    return (livCache[k] = mergeGeos(geos));
  }
  function bus(env) {
    const g = new T.Group(), L = 7.2, Wd = 2.3, H = 2.8;
    const s = new T.Shape(); s.moveTo(-L / 2, .35); s.lineTo(L / 2, .35); s.lineTo(L / 2, H - .3); s.quadraticCurveTo(L / 2, H, L / 2 - .3, H); s.lineTo(-L / 2 + .2, H); s.quadraticCurveTo(-L / 2, H, -L / 2, H - .2); s.closePath();
    const body = extrude(s, Wd, .08, 2);
    g.add(new T.Mesh(body, new T.MeshPhysicalMaterial({ color: "#f2c230", roughness: .4, metalness: .2, clearcoat: .7, envMap: envMap })));
    const dark = new T.MeshPhysicalMaterial({ color: "#0b1018", metalness: .9, roughness: .06, envMap: envMap });
    const list = [{ geo: boxG(L * .82, .9, Wd + .02), matrix: at(-.35, 1.95, 0) }, { geo: boxG(.04, 1.3, Wd * .86), matrix: at(L / 2 + .06, 1.7, 0) }];
    g.add(new T.Mesh(mergeGeos(list), dark));
    g.add(new T.Mesh(mergeGeos([1, -1].map(sd => ({ geo: boxG(L - .2, .22, .02), matrix: at(0, 1.2, (Wd / 2 + .02) * sd) }))), new T.MeshStandardMaterial({ color: "#1d4fa0" })));
    const tire = new T.CylinderGeometry(.5, .5, .34, 18); tire.rotateX(Math.PI / 2);
    g.add(new T.Mesh(mergeGeos([[L * .32, 1], [L * .32, -1], [-L * .3, 1], [-L * .3, -1]].map(([x, sd]) => ({ geo: tire, matrix: at(x, .5, (Wd / 2 - .2) * sd) }))), new T.MeshStandardMaterial({ color: "#111", roughness: .9 })));
    g.add(new T.Mesh(mergeGeos([1, -1].map(sd => ({ geo: boxG(.06, .14, .3), matrix: at(L / 2 + .05, .7, .85 * sd) }))), new T.MeshBasicMaterial({ color: "#fff6dc" })));
    g.add(new T.Mesh(mergeGeos([1, -1].map(sd => ({ geo: boxG(.06, .3, .16), matrix: at(-L / 2 - .05, .9, .95 * sd) }))), new T.MeshBasicMaterial({ color: "#ff2a1a" })));
    g.children.forEach(c => c.castShadow = true);
    return g;
  }
  let busProto = null;
  window.ZBOSS_CARS3D = {
    PROFILES,
    init(renderer) { makeEnv(renderer); },
    build,
    bus() { if (!busProto) busProto = bus(); return busProto.clone(); },
    // dimension approximative pour les caméras (longueur)
    length: type => (PROFILES[type] || PROFILES.sedan).L,
  };
})();
