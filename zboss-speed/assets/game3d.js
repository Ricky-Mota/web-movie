// Zboss-speed — rendu 3D (three.js) : la Gombe (Kinshasa) d'après la carte OpenStreetMap, au coucher du soleil,
// branchée sur la simulation de game.js (conduite, police, trafic).
// Caméras : poursuite derrière la voiture, hélicoptère, caméra télé au bord de la route.
(function () {
  "use strict";
  const WORLD = window.ZBOSS_WORLD;
  if (!window.THREE || !WORLD) return;
  const THREE = window.THREE;

  // Test WebGL
  const canvas = document.createElement("canvas");
  canvas.id = "game3d";
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !matchMedia("(pointer: coarse)").matches, powerPreference: "high-performance" }); }
  catch (e) { return; }
  if (!renderer.getContext()) return;

  const { W, H, MAP, ROADS, nodes, nearestNode, solidAt, groundAt, angDiff } = WORLD;
  const S = 0.1;                      // 1 px de simulation = 0,1 m
  const MOBILE = matchMedia("(pointer: coarse)").matches;
  const old2d = document.getElementById("game");
  old2d.style.display = "none";
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;display:block;background:#1a1420";
  old2d.parentNode.insertBefore(canvas, old2d);

  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = a => a[(rnd() * a.length) | 0];

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.25 : 1.6));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !MOBILE;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  if (window.ZBOSS_CARS3D) window.ZBOSS_CARS3D.init(renderer);
  if (window.ZBOSS_CARS3D) window.ZBOSS_CARS3D.load(); // modèles Blender (.glb), remplacent les modèles procéduraux dès qu'ils sont chargés
  const scene = new THREE.Scene();
  const FOG = new THREE.Color("#c98a6e");
  scene.fog = new THREE.FogExp2(FOG, 0.0042);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2400);

  // ------------------------------------------------------------ Ciel et lumière (fin d'après-midi)
  const skyG = new THREE.Group(); scene.add(skyG);
  let skyMesh = null, sunDisc = null;
  {
    const g = new THREE.SphereGeometry(1500, 32, 16), cols = [], pos = g.attributes.position;
    const top = new THREE.Color("#22305e"), mid = new THREE.Color("#c86a5a"), hor = new THREE.Color("#ffb070");
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 1500; const c = new THREE.Color();
      if (y > .25) c.copy(mid).lerp(top, Math.min(1, (y - .25) / .6)); else c.copy(hor).lerp(mid, Math.max(0, (y + .05) / .3));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    skyG.add(skyMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    const sun = sunDisc = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: "#ffd9a0", fog: false }));
    sun.position.set(-1100, 120, -700); sun.lookAt(0, 0, 0); skyG.add(sun);
  }
  const hemi = new THREE.HemisphereLight("#ffd0b0", "#5a3a2a", 0.75); scene.add(hemi);
  const sunLight = new THREE.DirectionalLight("#ffbe8a", 1.35);
  sunLight.castShadow = !MOBILE;
  sunLight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunLight.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 500 });
  sunLight.shadow.bias = -0.0006;
  scene.add(sunLight, sunLight.target);

  // ------------------------------------------------------------ Textures dessinées
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }
  const noise = (c, w, h, base, amt, n) => { c.fillStyle = base; c.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${Math.random() < .5 ? "255,255,255" : "0,0,0"},${Math.random() * amt})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
  const roadTex = canvasTex(128, 256, (c, w, h) => {
    noise(c, w, h, "#2c2b30", .08, 3000);
    c.fillStyle = "#d9d5cc"; c.fillRect(6, 0, 3, h); c.fillRect(w - 9, 0, 3, h);
    c.fillStyle = "#e8b335"; c.fillRect(w / 2 - 3, 0, 6, h * .55);
    c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(20, 0, 14, h); c.fillRect(w - 34, 0, 14, h); // usure
  }, true);
  const crossTex = canvasTex(256, 256, (c, w, h) => {
    noise(c, w, h, "#2c2b30", .08, 5000);
    c.fillStyle = "rgba(230,226,218,.75)";
    for (let k = 30; k < 226; k += 22) { c.fillRect(k, 4, 12, 26); c.fillRect(k, h - 30, 12, 26); c.fillRect(4, k, 26, 12); c.fillRect(w - 30, k, 26, 12); }
  });
  const earthTex = canvasTex(256, 256, (c, w, h) => noise(c, w, h, "#9a4f2e", .12, 9000), true);
  earthTex.repeat.set(60, 60);
  const lotTex = canvasTex(256, 256, (c, w, h) => { noise(c, w, h, "#8e5236", .1, 7000); c.strokeStyle = "rgba(220,210,190,.6)"; c.lineWidth = 10; c.strokeRect(4, 4, w - 8, h - 8); }, false);
  const wallTex = (cols, rows) => canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(0,0,0,.06)"; for (let y = 0; y < h; y += 4) c.fillRect(0, y, w, 1);
    const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { c.fillStyle = "#3b4352"; c.fillRect(i * cw + cw * .25, j * rh + rh * .28, cw * .5, rh * .45); }
  });
  const wallEm = (cols, rows, p) => canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = "#000"; c.fillRect(0, 0, w, h); const cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (Math.random() < p) { c.fillStyle = Math.random() < .7 ? "#ffcf86" : "#bfe2ff"; c.fillRect(i * cw + cw * .25, j * rh + rh * .28, cw * .5, rh * .45); }
  });
  const towerTex = canvasTex(128, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "#9fb4c8"); g.addColorStop(1, "#c9d6e2"); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = "rgba(20,30,45,.55)"; for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 5);
    c.fillStyle = "rgba(255,255,255,.35)"; for (let x = 0; x < w; x += 16) c.fillRect(x, 0, 2, h);
  });
  const towerEm = canvasTex(128, 256, (c, w, h) => { c.fillStyle = "#000"; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 16) if (Math.random() < .3) { c.fillStyle = "#ffd7a0"; c.fillRect(x + 2, y, 13, 5); } });
  const lotTex2 = canvasTex(128, 128, (c, w, h) => { noise(c, w, h, "#b9a48e", .1, 2500); c.fillStyle = "rgba(0,0,0,.12)"; for (let y = 0; y < h; y += 32) c.fillRect(0, y, w, 2); }, true);
  const asphaltTex = canvasTex(128, 128, (c, w, h) => noise(c, w, h, "#2c2b30", .08, 2500), true);
  const wallTex2 = wallTex(2, 1); wallTex2.wrapS = wallTex2.wrapT = THREE.RepeatWrapping;
  const wallEm2 = wallEm(2, 1, .35); wallEm2.wrapS = wallEm2.wrapT = THREE.RepeatWrapping;
  towerTex.wrapS = towerTex.wrapT = THREE.RepeatWrapping; towerEm.wrapS = towerEm.wrapT = THREE.RepeatWrapping;
  const boardTex = text => canvasTex(512, 160, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#1a1020"); g.addColorStop(1, "#3a1410"); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = "#ff5a1f"; c.fillRect(0, h - 14, w, 14);
    c.font = "bold 58px 'Chakra Petch', Impact, sans-serif"; c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(text[0], w / 2, 78);
    c.font = "600 30px Inter, Arial, sans-serif"; c.fillStyle = "#ffb21f"; c.fillText(text[1], w / 2, 124);
  });

  const WS = W * S, HS = H * S; // taille du monde en mètres
  // ------------------------------------------------------------ Sol (latérite), au sud du fleuve
  earthTex.repeat.set(220, 220);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WS + 3000, HS + 1500), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(WS / 2, -0.05, (HS + 1500) / 2); ground.receiveShadow = true; scene.add(ground);

  // ------------------------------------------------------------ Routes réelles (rubans) et carrefours
  function ribbon(list, widen, y, vLen) {
    const pos = [], uv = [], idx = [];
    list.forEach(r => {
      const pts = []; for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i] * S, r.p[i + 1] * S]);
      const hw = (r.w * S + widen) / 2; let acc = 0, base = pos.length / 3;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], c = pts[i];
        let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        let m = 1;
        if (i > 0 && i < pts.length - 1) { const sx = c[0] - a[0], sz = c[1] - a[1], sl = Math.hypot(sx, sz) || 1; m = 1 / Math.max(.5, (-tz * -sz / sl) + (tx * sx / sl)); }
        if (i > 0) acc += Math.hypot(c[0] - pts[i - 1][0], c[1] - pts[i - 1][1]);
        const nx = -tz * hw * m, nz = tx * hw * m;
        pos.push(c[0] + nx, y, c[1] + nz, c[0] - nx, y, c[1] - nz); uv.push(0, acc / vLen, 1, acc / vLen);
        if (i > 0) { const k = base + (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals(); return g;
  }
  // ---- route moderne : asphalte fin, marquages blancs nets, trottoirs surélevés avec bordures, passages piétons
  const markTex = lanes => canvasTex(256, 512, (c, w, h) => {
    noise(c, w, h, "#232428", .07, 9000);
    c.fillStyle = "rgba(0,0,0,.18)"; [.22, .36, .64, .78].forEach(f => c.fillRect(w * f - 9, 0, 18, h)); // traces de roulement
    c.fillStyle = "rgba(255,255,255,.04)"; for (let k = 0; k < 400; k++) c.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    const W8 = "rgba(244,246,250,.92)";
    c.fillStyle = W8; c.fillRect(7, 0, 5, h); c.fillRect(w - 12, 0, 5, h);   // lignes de rive continues
    if (lanes >= 4) {
      c.fillRect(w / 2 - 7, 0, 4, h); c.fillRect(w / 2 + 3, 0, 4, h);          // double ligne centrale
      c.fillRect(w * .25 - 2, 0, 4, h * .3); c.fillRect(w * .75 - 2, 0, 4, h * .3); // pointillés de voies
    } else c.fillRect(w / 2 - 2, 0, 5, h * .3);                                 // ligne centrale pointillée
  }, true);
  const ROAD4 = markTex(4), ROAD2 = markTex(2);
  [ROAD4, ROAD2].forEach(t => { t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); });
  const nodeAt = new Map(); nodes.forEach(n => nodeAt.set(n.x + "," + n.y, n));
  function polyM(r) { const pts = []; for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i] * S, r.p[i + 1] * S]); return pts; }
  // raccourcit une polyligne aux carrefours (pour les trottoirs)
  function trim(pts, r) {
    const cut = (arr, n) => { if (!n || n.nb.length < 3) return arr; let left = n.w * S * .55 + 3.5; const out = arr.slice();
      while (out.length > 1 && left > 0) { const a = out[0], b = out[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L <= left) { out.shift(); left -= L; } else { out[0] = [a[0] + (b[0] - a[0]) * left / L, a[1] + (b[1] - a[1]) * left / L]; left = 0; } }
      return out.length > 1 ? out : []; };
    let o = cut(pts, nodeAt.get(r.p[0] + "," + r.p[1])); if (!o.length) return o;
    o = cut(o.reverse(), nodeAt.get(r.p[r.p.length - 2] + "," + r.p[r.p.length - 1])); return o.reverse();
  }
  // bande parallèle à la polyligne : décalages o0/o1 (m) et hauteurs y0/y1
  // pr : décalage (m) d'un point de contrôle ; si ce point tombe sur une autre chaussée
  // (voies parallèles, bretelles), le tronçon de trottoir n'est pas posé.
  function strip(pos, idx, pts, o0, o1, y0, y1, pr) {
    if (pts.length < 2) return; const base = pos.length / 3, ok = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], c = pts[i];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      pos.push(c[0] - tz * o0, y0, c[1] + tx * o0, c[0] - tz * o1, y1, c[1] + tx * o1);
      ok.push(groundAt((c[0] - tz * pr) / S, (c[1] + tx * pr) / S) !== 1);
      if (i > 0 && ok[i] && ok[i - 1]) { const k = base + (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
  }
  function geo(pos, idx) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
  {
    // chaussées
    [[ROADS.filter(r => r.w >= 150), ROAD4, 2], [ROADS.filter(r => r.w < 150), ROAD2, 1]].forEach(([list, tex, k]) => {
      const m = new THREE.Mesh(ribbon(list, 0, .04 + k * .006, 12), new THREE.MeshStandardMaterial({ map: tex, roughness: .6, metalness: .05, polygonOffset: true, polygonOffsetFactor: -1 - k, polygonOffsetUnits: -1 - k }));
      m.receiveShadow = true; scene.add(m);
    });
    // trottoirs (dessus en dalles) et bordures (faces verticales), coupés aux carrefours
    const tp = [], ti = [], cp = [], ci = [];
    ROADS.forEach(r => {
      const pts = trim(polyM(r), r), hw = r.w * S / 2, sw = r.w >= 150 ? 4 : 3;
      for (const sd of [1, -1]) { const pr = sd * (hw + sw * .8); strip(tp, ti, pts, sd * hw, sd * (hw + sw), .16, .16, pr); strip(cp, ci, pts, sd * hw, sd * hw, .02, .16, pr); }
    });
    const top = new THREE.Mesh(geo(tp, ti), new THREE.MeshStandardMaterial({ color: "#c9c3ba", roughness: .9, side: THREE.DoubleSide }));
    top.receiveShadow = true; scene.add(top);
    scene.add(new THREE.Mesh(geo(cp, ci), new THREE.MeshStandardMaterial({ color: "#e9e6e0", roughness: .7, side: THREE.DoubleSide })));
    // carrefours : asphalte propre + passages piétons sur chaque branche
    const xs = nodes.filter(n => n.nb.length >= 3);
    const disc = new THREE.CircleGeometry(1, 24); disc.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(disc, new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: .6, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 }), xs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    xs.forEach((n, i) => { const r = n.w * S * .55; m4.makeScale(r, 1, r).setPosition(n.x * S, .09, n.y * S); im.setMatrixAt(i, m4); });
    im.receiveShadow = true; scene.add(im);
    const zebraTex = canvasTex(64, 256, (c, w, h) => { c.fillStyle = "#26272b"; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(244,246,250,.95)"; for (let y = 0; y < h; y += 32) c.fillRect(0, y + 4, w, 16); }, true);
    const zg = new THREE.PlaneGeometry(3, 1); zg.rotateX(-Math.PI / 2);
    const zebras = []; xs.forEach(n => n.nb.forEach(id => { const o = nodes[id], L = Math.hypot(o.x - n.x, o.y - n.y); if (L > n.w * .7 + 60) zebras.push({ n, ux: (o.x - n.x) / L, uy: (o.y - n.y) / L }); }));
    const zm = new THREE.InstancedMesh(zg, new THREE.MeshStandardMaterial({ map: zebraTex, roughness: .6, polygonOffset: true, polygonOffsetFactor: -14, polygonOffsetUnits: -14 }), Math.max(1, zebras.length));
    zebraTex.repeat.set(1, 2);
    zebras.forEach((z, i) => { const d = z.n.w * S * .55 + 2; ps.set((z.n.x + z.ux * d / S) * S, .1, (z.n.y + z.uy * d / S) * S); q.setFromAxisAngle(Y, -Math.atan2(z.uy, z.ux)); sc.set(1, 1, z.n.w * S * .92); m4.compose(ps, q, sc); zm.setMatrixAt(i, m4); });
    zm.count = zebras.length; zm.receiveShadow = true; scene.add(zm);
  }

  // ------------------------------------------------------------ Bâtiments réels (empreintes extrudées), regroupés par tuiles
  const PAINT = ["#e9c46a", "#f4a261", "#e76f51", "#2a9d8f", "#8ab17d", "#e5989b", "#ffd166", "#06d6a0", "#73a5c6", "#f1faee", "#cdb4db", "#d4a373"];
  const ROOF = ["#7c4a32", "#8a8580", "#6b3e2a", "#9a6a4a", "#5d5a55"];
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const towers = [], boards = [], palms = [];
  {
    const TILE = 400, tiles = new Map(), col = new THREE.Color();
    const T = (tw, key) => { let t = tiles.get(key); if (!t) tiles.set(key, t = { tower: { p: [], n: [], u: [], c: [] }, house: { p: [], n: [], u: [], c: [] } }); return tw ? t.tower : t.house; };
    MAP.buildings.forEach(b => {
      if (b[0] < 0) return; // repère dessiné à part
      const h = b[0] / 10, tw = h > 20, pts = [];
      for (let i = 1; i < b.length; i += 2) pts.push([b[i] * S, b[i + 1] * S]);
      let area = 0, cx = 0, cz = 0, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      pts.forEach((q, i) => { const r = pts[(i + 1) % pts.length]; area += q[0] * r[1] - r[0] * q[1]; cx += q[0]; cz += q[1]; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); });
      cx /= pts.length; cz /= pts.length;
      const sgn = area > 0 ? 1 : -1, G = T(tw, ((cx / TILE) | 0) + "_" + ((cz / TILE) | 0));
      col.set(tw ? pick(["#c9d4de", "#b7c3cf", "#d8dee6", "#a9b8c6"]) : pick(PAINT));
      const uw = tw ? 24 : 6, vh = tw ? 112 : 3.2;
      let acc = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < .01) continue;
        const nx = (c[1] - a[1]) / L * sgn, nz = (a[0] - c[0]) / L * sgn; // normale extérieure
        const u0 = acc / uw, u1 = (acc + L) / uw; acc += L; const V = h / vh;
        if (sgn < 0) { G.p.push(a[0], 0, a[1], c[0], 0, c[1], c[0], h, c[1], a[0], 0, a[1], c[0], h, c[1], a[0], h, a[1]); G.u.push(u0, 0, u1, 0, u1, V, u0, 0, u1, V, u0, V); }
        else { G.p.push(c[0], 0, c[1], a[0], 0, a[1], a[0], h, a[1], c[0], 0, c[1], a[0], h, a[1], c[0], h, c[1]); G.u.push(u1, 0, u0, 0, u0, V, u1, 0, u0, V, u1, V); }
        for (let k = 0; k < 6; k++) { G.n.push(nx, 0, nz); G.c.push(col.r, col.g, col.b); }
      }
      // toit
      col.set(tw ? "#4a4f5a" : pick(ROOF));
      const tri = THREE.ShapeUtils.triangulateShape(pts.map(q => new THREE.Vector2(q[0], q[1])), []);
      tri.forEach(t => {
        const [i, j, k] = t, A = pts[i], Bq = pts[j], Cq = pts[k];
        const up = (Bq[1] - A[1]) * (Cq[0] - A[0]) - (Bq[0] - A[0]) * (Cq[1] - A[1]); // composante y du produit vectoriel
        (up > 0 ? [i, j, k] : [i, k, j]).forEach(q => { G.p.push(pts[q][0], h, pts[q][1]); G.n.push(0, 1, 0); G.u.push(.02, .02); G.c.push(col.r, col.g, col.b); });
      });
      if (tw) towers.push({ x: cx, z: cz, h, w: x1 - x0, d: z1 - z0 });
    });
    const hMat = new THREE.MeshStandardMaterial({ map: wallTex2, emissiveMap: wallEm2, emissive: new THREE.Color("#ffffff"), emissiveIntensity: .9, roughness: .9, vertexColors: true });
    const tMat = new THREE.MeshStandardMaterial({ map: towerTex, emissiveMap: towerEm, emissive: new THREE.Color("#ffffff"), emissiveIntensity: .8, roughness: .25, metalness: .55, vertexColors: true });
    tiles.forEach(t => [[t.house, hMat], [t.tower, tMat]].forEach(([d, mat]) => {
      if (!d.p.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(d.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(d.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(d.u, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(d.c, 3));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    }));
  }
  // antenne sur la plus haute tour + panneaux sur quelques tours proches du boulevard
  { const t = towers.reduce((a, b) => b.h > a.h ? b : a, towers[0]); if (t) { const m = new THREE.Mesh(new THREE.CylinderGeometry(.3, .5, 18, 6), new THREE.MeshStandardMaterial({ color: "#ddd" })); m.position.set(t.x, t.h + 9, t.z); scene.add(m); const l = new THREE.Mesh(new THREE.SphereGeometry(.8), new THREE.MeshBasicMaterial({ color: "#ff3030" })); l.position.set(t.x, t.h + 18.5, t.z); scene.add(l); } }
  {
    const st = MAP.start, near = towers.filter(t => t.h > 30).sort((a, b) => Math.hypot(a.x - st.x * S, a.z - st.y * S) - Math.hypot(b.x - st.x * S, b.z - st.y * S)).slice(0, 10);
    near.forEach(t => boards.push({ x: t.x, z: t.z, y: t.h + .2, w: Math.min(16, Math.max(t.w, t.d) * .8), ry: t.w > t.d ? 0 : Math.PI / 2, top: true, text: pick([["2 LIFE", "NAÎTRE À KINSHASA"], ["BÊTA OUVERTE", "Inscris-toi sur le site"], ["TA MARQUE ICI", "Espace partenaire"], ["KIN LA BELLE", "Roule prudemment"]]) }));
  }
  boards.forEach(b => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.w * .31), new THREE.MeshBasicMaterial({ map: boardTex(b.text), side: THREE.DoubleSide }));
    m.position.set(b.x, b.y + (b.top ? b.w * .2 + 1 : 0), b.z); m.rotation.y = b.ry; scene.add(m);
    if (b.top) { const pole = new THREE.Mesh(new THREE.BoxGeometry(.2, 1.2, .2), new THREE.MeshStandardMaterial({ color: "#333" })); pole.position.set(b.x, b.y + .6, b.z); scene.add(pole); }
  });
  function instanced(list, geo, mat, fn, shadow) {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    im.count = list.length;
    list.forEach((o, i) => { const r = fn(o, p, s, c); m.compose(p, r || q, s); im.setMatrixAt(i, m); if (o.c !== undefined) im.setColorAt(i, c); });
    im.castShadow = !!shadow; im.receiveShadow = true; scene.add(im); return im;
  }

  // ------------------------------------------------------------ Palmiers (boulevard du 30 Juin et bords de route) et lampadaires
  const lamps = [], lampHeadMat = new THREE.MeshBasicMaterial({ color: "#f2f6ff" });
  ROADS.forEach(r => {
    const blvd = r.name === "Boulevard du 30 Juin", big = r.cls === "primary" || r.cls === "secondary" || r.cls === "trunk";
    if (!blvd && !big && rnd() > .25) return;
    const step = blvd ? 14 : big ? 34 : 45;
    for (let i = 2; i < r.p.length; i += 2) {
      const ax = r.p[i - 2], ay = r.p[i - 1], bx = r.p[i], by = r.p[i + 1], L = Math.hypot(bx - ax, by - ay) * S, nx = -(by - ay) / (L / S), ny = (bx - ax) / (L / S);
      for (let d = step / 2; d < L; d += step) {
        const t = d / L, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        for (const sd of [1, -1]) {
          const ox = x + nx * (r.w / 2 + 22) * sd, oy = y + ny * (r.w / 2 + 22) * sd;
          if (groundAt(ox, oy) !== 0 || (WORLD.SHOPS || []).some(o => WORLD.SHOPS.inShop(o, ox, oy, 120))) continue;
          // chaque tronc et chaque mât est aussi un obstacle : on ne passe pas au travers
          if (blvd || (!big && rnd() < .5)) { palms.push({ x: ox * S, z: oy * S, h: 8 + rnd() * 4 }); if (WORLD.addObst) WORLD.addObst({ x: ox, y: oy, r: 3 }); }
          else if (sd === 1 || r.w >= 150) { lamps.push({ x: ox * S, z: oy * S, a: Math.atan2(-ny * sd, -nx * sd) }); if (WORLD.addObst) WORLD.addObst({ x: ox, y: oy, r: 2 }); }
        }
      }
    }
  });
  {
    const trunk = new THREE.CylinderGeometry(.16, .28, 1, 6); trunk.translate(0, .5, 0);
    instanced(palms, trunk, new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 1 }), (o, p, s) => { p.set(o.x, 0, o.z); s.set(1, o.h, 1); }, true);
    const pos = [];
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), L = 3.6;
      const pts = [[0, 0, 0], [ca * L * .55 - sa * .5, .5, sa * L * .55 + ca * .5], [ca * L, -1.2, sa * L], [ca * L * .55 + sa * .5, .5, sa * L * .55 - ca * .5]];
      pos.push(...pts[0], ...pts[1], ...pts[2], ...pts[0], ...pts[2], ...pts[3]);
    }
    const crown = new THREE.BufferGeometry(); crown.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); crown.computeVertexNormals();
    instanced(palms, crown, new THREE.MeshStandardMaterial({ color: "#2f6b33", side: THREE.DoubleSide, roughness: .9 }), (o, p, s) => { p.set(o.x, o.h, o.z); s.set(1, 1, 1); return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28); }, true);
    // lampadaires LED modernes : mât fin, crosse vers la chaussée, tête plate lumineuse
    const Yax = new THREE.Vector3(0, 1, 0), rot = o => new THREE.Quaternion().setFromAxisAngle(Yax, -o.a);
    const pole = new THREE.CylinderGeometry(.07, .11, 9, 8); pole.translate(0, 4.5, 0);
    instanced(lamps, pole, new THREE.MeshStandardMaterial({ color: "#4a4e57", metalness: .6, roughness: .4 }), (o, p, s) => { p.set(o.x, 0, o.z); s.set(1, 1, 1); });
    const arm = new THREE.BoxGeometry(2.2, .1, .1); arm.translate(1.1, 9, 0);
    instanced(lamps, arm, new THREE.MeshStandardMaterial({ color: "#4a4e57", metalness: .6, roughness: .4 }), (o, p, s) => { p.set(o.x, 0, o.z); s.set(1, 1, 1); return rot(o); });
    const head = new THREE.BoxGeometry(.9, .08, .32); head.translate(2.3, 8.96, 0);
    instanced(lamps, head, lampHeadMat, (o, p, s) => { p.set(o.x, 0, o.z); s.set(1, 1, 1); return rot(o); });
  }
  // éclairage de nuit : quelques vraies lumières sur les lampadaires les plus proches
  const lampLights = []; for (let i = 0; i < (MOBILE ? 3 : 6); i++) { const L = new THREE.PointLight("#ffd9a0", 0, 26, 1.6); scene.add(L); lampLights.push(L); }
  const lampByCell = new Map(); lamps.forEach(o => { const k = Math.floor(o.x / 40) + "," + Math.floor(o.z / 40); if (!lampByCell.has(k)) lampByCell.set(k, []); lampByCell.get(k).push(o); });
  // jour et nuit selon l'heure du jeu
  const C_DAY = { hemiS: new THREE.Color("#ffd0b0"), hemiG: new THREE.Color("#5a3a2a"), sun: new THREE.Color("#ffbe8a"), fog: FOG.clone() };
  const C_NIGHT = { hemiS: new THREE.Color("#5a6a9a"), hemiG: new THREE.Color("#141018"), fog: new THREE.Color("#121826") };
  const C_NOON = new THREE.Color("#fff1dc"), tmpC = new THREE.Color();
  let dayF = 1;
  function setDay(h, cx, cz) {
    if (h === undefined) return;
    const el = Math.sin((h - 6) / 12 * Math.PI);          // hauteur du soleil (-1 la nuit, 1 à midi)
    dayF = Math.max(0, Math.min(1, (el + .12) / .4));   // 0 la nuit, 1 le jour, crépuscule entre les deux
    const noon = Math.max(0, el);
    hemi.color.copy(C_NIGHT.hemiS).lerp(C_DAY.hemiS, dayF); hemi.groundColor.copy(C_NIGHT.hemiG).lerp(C_DAY.hemiG, dayF);
    hemi.intensity = .32 + .43 * dayF;
    sunLight.intensity = 1.45 * dayF; sunLight.color.copy(C_DAY.sun).lerp(C_NOON, noon * .7);
    const az = (h - 6) / 12 * Math.PI; sunLight.position.set(cx - Math.cos(az) * 150, 30 + 150 * Math.max(.15, noon), cz - 80); sunLight.target.position.set(cx, 0, cz);
    scene.fog.color.copy(C_NIGHT.fog).lerp(C_DAY.fog, dayF);
    if (skyMesh) skyMesh.material.color.setRGB(.1 + .9 * dayF, .12 + .88 * dayF, .22 + .78 * dayF);
    if (sunDisc) { sunDisc.visible = dayF > .05; sunDisc.position.set(-Math.cos(az) * 1100, 60 + 900 * noon, -700); sunDisc.lookAt(0, 0, 0); }
    renderer.toneMappingExposure = .95 + .1 * dayF;
    const night = 1 - dayF;
    lampHeadMat.color.copy(tmpC.set("#9aa0aa")).lerp(new THREE.Color("#fff2c8"), night);
    // allume les lampadaires proches de la caméra
    if (night > .2) {
      const near = []; const kx = Math.floor(cx / 40), kz = Math.floor(cz / 40);
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const L = lampByCell.get((kx + i) + "," + (kz + j)); if (L) near.push(...L); }
      near.sort((a, b) => (a.x - cx) ** 2 + (a.z - cz) ** 2 - ((b.x - cx) ** 2 + (b.z - cz) ** 2));
      lampLights.forEach((L, i) => { const o = near[i]; if (!o) { L.intensity = 0; return; } L.intensity = 1.6 * night; L.position.set(o.x + Math.cos(o.a) * 2.2, 8.4, o.z + Math.sin(o.a) * 2.2); });
    } else lampLights.forEach(L => { L.intensity = 0; });
  }

  // ------------------------------------------------------------ Quartiers de remplissage (maisons basses, hors carte détaillée)
  if (WORLD.FILL && WORLD.FILL.length) {
    const fm = new THREE.MeshStandardMaterial({ map: wallTex(3, 2), roughness: .9 });
    instanced(WORLD.FILL, box, fm, (o, p, s, c) => { p.set(o.x * S, 0, o.y * S); s.set(o.w * S, o.h * S, o.d * S); c.set(PAINT[o.c]); });
    instanced(WORLD.FILL, new THREE.BoxGeometry(1, .3, 1), new THREE.MeshStandardMaterial({ roughness: .6, metalness: .4 }), (o, p, s, c) => { p.set(o.x * S, o.h * S + .15, o.y * S); s.set(o.w * S + .5, 1, o.d * S + .5); c.set(ROOF[o.c % ROOF.length]); });
  }
  // ------------------------------------------------------------ Repère : la tour de l'Échangeur (Limete)
  (MAP.landmarks || []).forEach(L => {
    if (L.type !== "echangeur") return;
    const g = new THREE.Group(), H = L.h / 10, con = new THREE.MeshStandardMaterial({ color: "#ddd6cb", roughness: .8 });
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8, .4, 24), new THREE.MeshStandardMaterial({ color: "#bdb5a8", roughness: .9 })); plaza.position.y = .2; g.add(plaza);
    for (const [px, pz] of [[2.6, 2.6], [-2.6, 2.6], [2.6, -2.6], [-2.6, -2.6]]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(1.4, H, 1.4), con); pil.position.set(px, H / 2, pz); pil.castShadow = true; g.add(pil);
    }
    for (let y = 18; y < H - 10; y += 18) { const ring = new THREE.Mesh(new THREE.BoxGeometry(6.8, .8, 6.8), con); ring.position.y = y; g.add(ring); }
    const cab = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), con); cab.position.y = H + 1; cab.castShadow = true; g.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(8.1, 1.6, 8.1), new THREE.MeshStandardMaterial({ color: "#1a2a3a", metalness: .8, roughness: .15 })); win.position.y = H + 1.4; g.add(win);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(.15, .3, 14, 6), con); ant.position.y = H + 10.5; g.add(ant);
    const red = new THREE.Mesh(new THREE.SphereGeometry(.6, 8, 6), new THREE.MeshBasicMaterial({ color: "#ff2020" })); red.position.y = H + 17.8; g.add(red);
    g.position.set(L.x * S, 0, L.y * S); scene.add(g);
  });

  // ------------------------------------------------------------ Concessions « Zboss Motors » (showrooms où l'on entre à pied)
  const SHOPS = window.TWOLIFE_WALK ? [] : (WORLD.SHOPS || []), shopCars = [];   // visite de la ville : pas de concessions
  const shopLight = new THREE.PointLight("#fff4e6", 0, 46, 1.6); scene.add(shopLight);
  if (SHOPS.length) {
    const SW = WORLD.SHOP_W * S, SD = WORLD.SHOP_D * S, DOOR = WORLD.SHOP_DOOR * S, HT = 7;
    const tileTex = canvasTex(256, 256, (c, w, h) => { c.fillStyle = "#e9e7e3"; c.fillRect(0, 0, w, h); c.fillStyle = "#dcd9d3"; c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2); c.strokeStyle = "rgba(0,0,0,.12)"; c.lineWidth = 2; c.strokeRect(0, 0, w, h); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke(); }, true);
    tileTex.repeat.set(SW / 2.4, SD / 2.4);
    const floorM = new THREE.MeshStandardMaterial({ map: tileTex, roughness: .12, metalness: .05, envMapIntensity: 1 });
    const darkM = new THREE.MeshStandardMaterial({ color: "#16181e", roughness: .45, metalness: .5 });
    const wallM = new THREE.MeshStandardMaterial({ color: "#2a2d35", roughness: .7 });
    const whiteM = new THREE.MeshStandardMaterial({ color: "#f2f1ee", roughness: .6 });
    const glassM = new THREE.MeshStandardMaterial({ color: "#a9c7dc", roughness: .05, metalness: .6, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide });
    const ledM = new THREE.MeshBasicMaterial({ color: "#fff6e8" }), orangeM = new THREE.MeshBasicMaterial({ color: "#ff5a1f" });
    const signTex = (w, h, big) => canvasTex(w, h, (c, W_, H_) => { c.fillStyle = "#0d0f14"; c.fillRect(0, 0, W_, H_); c.fillStyle = "#ff5a1f"; c.font = `900 ${H_ * .5}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("2 LIFE", W_ / 2, H_ * (big ? .36 : .5)); if (big) { c.fillStyle = "#fff"; c.font = `700 ${H_ * .2}px sans-serif`; c.fillText("M O T O R S", W_ / 2, H_ * .76); } });
    const sign = new THREE.MeshBasicMaterial({ map: signTex(1024, 256, true) });
    const box = (g, w, h, d, x, y, z, m, sh) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); if (sh) o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    SHOPS.forEach(o => {
      const g = new THREE.Group(); g.position.set(o.x * S, 0, o.y * S); g.rotation.y = -o.a;
      // parvis et sol carrelé
      box(g, SW + 6, .12, SD + 8, 0, .06, -1, whiteM).receiveShadow = true;
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(SW, SD), floorM); fl.rotation.x = -Math.PI / 2; fl.position.y = .13; fl.receiveShadow = true; g.add(fl);
      // murs : fond plein, côtés vitrés, façade vitrée avec grande porte
      box(g, SW, HT, .4, 0, HT / 2, SD / 2, wallM, true);
      [-1, 1].forEach(k => { box(g, .3, HT, SD, k * SW / 2, HT / 2, 0, glassM); for (let z = -SD / 2; z <= SD / 2 + .01; z += SD / 4) box(g, .25, HT, .25, k * SW / 2, HT / 2, z, darkM); });
      const seg = (SW / 2 - DOOR);
      [-1, 1].forEach(k => { box(g, seg, HT, .2, k * (DOOR + seg / 2), HT / 2, -SD / 2, glassM); for (let x = DOOR; x <= SW / 2 + .01; x += seg / 3) box(g, .22, HT, .3, k * x, HT / 2, -SD / 2, darkM); });
      box(g, DOOR * 2, 1.4, .4, 0, HT - .7, -SD / 2, darkM);
      // toit, bandeau d'enseigne, éclairage LED au plafond
      box(g, SW + 1.2, .6, SD + 2, 0, HT + .3, -.5, darkM, true);
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.5), sign); sg.position.set(0, HT + .2, -SD / 2 - 1.55); sg.rotation.y = Math.PI; g.add(sg);
      const sgb = sg.clone(); sgb.position.set(0, HT - 2.2, SD / 2 - .25); sgb.rotation.y = Math.PI; sgb.scale.set(1.2, 1.2, 1); g.add(sgb);
      const sgf = sg.clone(); sgf.rotation.y = 0; sgf.position.set(0, HT + .2, -SD / 2 - 1.52); g.add(sgf);
      for (let x = -SW / 2 + 4; x < SW / 2 - 2; x += 6) box(g, 4, .06, .5, x + 1, HT - .05, 0, ledM), box(g, 4, .06, .5, x + 1, HT - .05, -SD / 3, ledM), box(g, 4, .06, .5, x + 1, HT - .05, SD / 3, ledM);
      // comptoir d'accueil
      box(g, 6, 1.1, 1.4, 0, .68, SD / 2 - 3.2, whiteM, true); box(g, 6.2, .08, 1.6, 0, 1.26, SD / 2 - 3.2, darkM);
      box(g, 6, .06, .06, 0, 1.1, SD / 2 - 3.95, orangeM);
      // podiums et voitures exposées
      (o.slots || []).forEach((sl, i) => {
        const pd = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.9, .22, 40), darkM); pd.position.set(sl.u * S, .24, sl.v * S); pd.receiveShadow = true; g.add(pd);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.85, .035, 6, 48), orangeM); ring.rotation.x = Math.PI / 2; ring.position.set(sl.u * S, .36, sl.v * S); g.add(ring);
        shopCars.push({ shop: o, sl, i, g, m: null, ver: -1 });
      });
      // totem extérieur
      const tot = new THREE.Group(); tot.position.set(SW / 2 + 2, 0, -SD / 2 - 4); g.add(tot);
      box(tot, 1.4, 10, .8, 0, 5, 0, darkM, true);
      const ts = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4.8), new THREE.MeshBasicMaterial({ map: canvasTex(128, 512, (c, W_, H_) => { c.fillStyle = "#0d0f14"; c.fillRect(0, 0, W_, H_); c.fillStyle = "#ff5a1f"; c.font = "900 86px sans-serif"; c.textAlign = "center"; "2LIFE".split("").forEach((ch, k) => c.fillText(ch, W_ / 2, 96 + k * 92)); }) }));
      ts.position.set(0, 6.6, -.41); ts.rotation.y = Math.PI; tot.add(ts); const ts2 = ts.clone(); ts2.position.z = .41; ts2.rotation.y = 0; tot.add(ts2);
      scene.add(g); o.g3 = g;
    });
  }
  function updateShops(G) {
    const C3 = window.ZBOSS_CARS3D; if (!C3) return;
    const CARS = window.ZBOSS_CARS.list, focus = G.foot || G.player;
    let near = null, nd = 1e9;
    SHOPS.forEach(o => { const d = Math.hypot(o.x - focus.x, o.y - focus.y); if (d < nd) { nd = d; near = o; } });
    shopCars.forEach(sc => {
      const show = Math.hypot(sc.shop.x - focus.x, sc.shop.y - focus.y) < 900;
      if (!show) { if (sc.m) { sc.g.remove(sc.m); sc.m = null; } return; }
      if (!sc.m || sc.ver !== C3.version) {
        if (sc.m) sc.g.remove(sc.m);
        const car = CARS[sc.i % CARS.length];
        sc.m = C3.build(car.id, { color: car.color }); sc.ver = C3.version;
        sc.m.position.set(sc.sl.u * S, .35, sc.sl.v * S); sc.m.rotation.y = -(sc.sl.a - sc.shop.a); sc.g.add(sc.m);
      }
    });
    if (near && nd < 700) { shopLight.position.set(near.x * S, 5.5, near.y * S); shopLight.intensity = 1.6; } else shopLight.intensity = 0;
  }

  // ------------------------------------------------------------ Lieux de la ville (sport, loisirs, commerces, partenaires, État) et panneaux LED
  const PLACES3 = WORLD.PLACES || [], BOARDS3 = WORLD.BILLBOARDS || [], placeGroups = [];
  const PL = (() => {
    const M = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .7 }, o || {}));
    const txt = (w, h, bg, lines) => canvasTex(w, h, (c, W_, H_) => {
      if (typeof bg === "function") bg(c, W_, H_); else { c.fillStyle = bg; c.fillRect(0, 0, W_, H_); }
      c.textAlign = "center"; c.textBaseline = "middle";
      lines.forEach(l => { c.font = l.f; c.fillStyle = l.c; if (l.glow) { c.shadowColor = l.c; c.shadowBlur = l.glow; } else c.shadowBlur = 0; c.fillText(l.t, W_ / 2, H_ * l.y, W_ * .94); });
    });
    return {
      txt, M, white: M("#f1eee8"), cream: M("#efe2c4"), dark: M("#1b1c21", { roughness: .45, metalness: .4 }), black: M("#0c0c10", { roughness: .5 }),
      metal: M("#9aa1aa", { roughness: .35, metalness: .7 }), wood: M("#8a5a35"), red: M("#c0392b"), yellow: M("#f2c230"), blue: M("#2b6cb0"), green: M("#2f8f46"),
      glass: new THREE.MeshStandardMaterial({ color: "#9fc3d8", roughness: .05, metalness: .6, transparent: true, opacity: .45 }),
      glow: c => new THREE.MeshBasicMaterial({ color: c }),
    };
  })();
  const pbox = (g, w, h, d, x, y, z, m, sh) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); if (sh && !MOBILE) o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const pplane = (g, w, h, mat, x, y, z, ry) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); o.position.set(x, y, z); o.rotation.y = ry || 0; g.add(o); return o; };
  const flagTex = canvasTex(192, 128, (c, w, h) => {   // drapeau de la RD Congo
    c.fillStyle = "#007fff"; c.fillRect(0, 0, w, h);
    c.save(); c.translate(0, h); c.rotate(-Math.atan2(h, w));
    const L = Math.hypot(w, h); c.fillStyle = "#f7d618"; c.fillRect(0, -h * .2, L, h * .4); c.fillStyle = "#ce1021"; c.fillRect(0, -h * .13, L, h * .26); c.restore();
    c.fillStyle = "#f7d618"; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 22, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(34 + Math.cos(a) * r, 30 + Math.sin(a) * r); } c.fill();
  });
  function fence(g, W2, D2, gap) {   // clôture basse sur 4 côtés, ouverture côté rue
    const m = P_FENCE;
    pbox(g, W2, .9, .12, 0, .45, D2 / 2, m); [-1, 1].forEach(k => pbox(g, .12, .9, D2, k * W2 / 2, .45, 0, m));
    const s = (W2 - gap) / 2; [-1, 1].forEach(k => pbox(g, s, .9, .12, k * (gap / 2 + s / 2), .45, -D2 / 2, m));
    for (let x = -W2 / 2; x <= W2 / 2 + .01; x += 4) pbox(g, .14, 1.3, .14, x, .65, D2 / 2, PL.metal);
  }
  const P_FENCE = new THREE.MeshStandardMaterial({ color: "#6b7a6f", roughness: .5, metalness: .5, transparent: true, opacity: .55 });
  function signBoard(g, text, sub, w, y, z, bg, fg) {
    const t = PL.txt(1024, 256, bg, [{ t: text, f: "900 96px 'Chakra Petch', Impact, sans-serif", c: fg, y: sub ? .38 : .5, glow: 18 }].concat(sub ? [{ t: sub, f: "700 46px Inter, Arial, sans-serif", c: bg === "#ffffff" ? "#2a2d35" : "#ffffff", y: .78 }] : []));
    pplane(g, w, w / 4, new THREE.MeshBasicMaterial({ map: t }), 0, y, z, Math.PI);
  }
  function buildPlace(o) {
    const g = new THREE.Group(); g.position.set(o.x * S, 0, o.y * S); g.rotation.y = -o.a;
    const W2 = o.w * S, D2 = o.d * S, H2 = (o.h || 60) * S, front = -D2 / 2;
    pbox(g, W2 + 1.2, .1, D2 + 1.2, 0, .05, 0, PL.M("#b9b2a6"));   // dalle
    if (o.type === "foot" || o.type === "basket") {
      const foot = o.type === "foot";
      const t = canvasTex(1024, 640, (c, w, h) => {
        if (foot) { for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? "#3f9a45" : "#46a64c"; c.fillRect(i * w / 12, 0, w / 12 + 1, h); } } else { c.fillStyle = "#1f5f99"; c.fillRect(0, 0, w, h); c.fillStyle = "#d9792b"; c.fillRect(40, 40, w - 80, h - 80); }
        c.strokeStyle = "#fff"; c.lineWidth = 8; c.strokeRect(40, 40, w - 80, h - 80); c.beginPath(); c.moveTo(w / 2, 40); c.lineTo(w / 2, h - 40); c.stroke();
        c.beginPath(); c.arc(w / 2, h / 2, h * .16, 0, 6.3); c.stroke();
        if (foot) { [40, w - 40].forEach((x, k) => { const s = k ? -1 : 1; c.strokeRect(Math.min(x, x + s * 150), h / 2 - 160, 150, 320); c.strokeRect(Math.min(x, x + s * 55), h / 2 - 80, 55, 160); }); }
        else { [40, w - 40].forEach((x, k) => { const s = k ? -1 : 1; c.fillStyle = "rgba(31,95,153,.85)"; c.fillRect(Math.min(x, x + s * 190), h / 2 - 70, 190, 140); c.beginPath(); c.arc(x, h / 2, 250, k ? Math.PI / 2 : -Math.PI / 2, k ? Math.PI * 1.5 : Math.PI / 2); c.stroke(); }); }
      });
      const f = pplane(g, W2 - 2, D2 - 2, new THREE.MeshStandardMaterial({ map: t, roughness: .9 }), 0, .12, 0); f.rotation.x = -Math.PI / 2; f.receiveShadow = true;
      const L = W2 - 2;
      [-1, 1].forEach(k => {
        if (foot) {   // buts
          const gz = 7.3;
          const x = k * (L / 2 - .4);
          [-1, 1].forEach(s => pbox(g, .12, 2.44, .12, x, 1.22, s * gz / 2, PL.white, true)); pbox(g, .12, .12, gz, x, 2.44, 0, PL.white, true);
          const net = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, gz), new THREE.MeshStandardMaterial({ color: "#fff", transparent: true, opacity: .25, wireframe: true })); net.position.set(x + k * .8, 1.2, 0); g.add(net);
        } else {   // paniers
          const x = k * (L / 2 + .2);
          pbox(g, .2, 3.4, .2, x, 1.7, 0, PL.dark, true); pbox(g, .1, 1.05, 1.8, x - k * .9, 3.4, 0, PL.white, true);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(.23, .025, 6, 20), PL.glow("#ff6a00")); ring.rotation.x = Math.PI / 2; ring.position.set(x - k * 1.25, 3.05, 0); g.add(ring);
        }
      });
      fence(g, W2, D2, 6);
      // gradins : tribune au fond (stade), petite tribune pour le basket ; projecteurs aux coins du stade
      const tiers = foot ? 6 : 3, tw = foot ? W2 * .8 : W2 * .5;
      for (let i = 0; i < tiers; i++) pbox(g, tw, .45, .9, 0, .22 + i * .45, D2 / 2 + .4 + i * .9, PL.M(["#c0392b", "#f2c230", "#2b6cb0"][i % 3]), true);
      if (foot) {
        pbox(g, tw, .2, tiers * .9 + .6, 0, tiers * .45 + 2.6, D2 / 2 + .2 + tiers * .45, PL.dark, true);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const x = a * (W2 / 2 + .8), z = b * (D2 / 2 + (b > 0 ? tiers * .9 + 1.2 : .8)); pbox(g, .35, 14, .35, x, 7, z, PL.metal, true); pbox(g, 2.4, 1.2, .3, x, 14, z, PL.glow("#fffbe8")); });
      }
      signBoard(g, foot ? "STADE DE QUARTIER" : "BASKET 2 LIFE", o.nom, 8, 3.4, front - .3, "#0d1a12", foot ? "#7dff8a" : "#ffb347");
      [-1, 1].forEach(k => pbox(g, .2, 3, .2, k * 3.6, 1.5, front - .3, PL.dark));
    } else if (o.type === "marche") {
      // marché : sol de terre battue, étals sous bâches colorées, marchandises
      const f = pplane(g, W2 - .6, D2 - .6, new THREE.MeshStandardMaterial({ roughness: 1, map: canvasTex(256, 256, (c, w, h) => noise(c, w, h, "#b48a5a", .2, 3000)) }), 0, .11, 0); f.rotation.x = -Math.PI / 2; f.receiveShadow = true;
      const TARP = ["#d63031", "#0984e3", "#fdcb6e", "#00b894", "#e17055", "#6c5ce7", "#e84393", "#2d3436"], GOODS = ["#27ae60", "#c0392b", "#f39c12", "#8e44ad", "#d35400", "#16a085", "#f1c40f", "#7f8c8d"];
      let k = 0;
      for (const v of [-50, 50]) for (const u of [-120, -40, 40, 120]) {
        const x = u * S, z = v * S;
        pbox(g, 5.4, .9, 2.2, x, .45, z, PL.wood, true);                                           // table
        for (let i = 0; i < 5; i++) { const gm = PL.M(GOODS[(k + i) % GOODS.length]); const b = new THREE.Mesh(new THREE.SphereGeometry(.32, 8, 6), gm); b.position.set(x - 2 + i, 1.05, z + (i % 2 ? .4 : -.4)); b.scale.y = .7; g.add(b); }
        [-1, 1].forEach(sx => [-1, 1].forEach(sz => pbox(g, .08, 2.6, .08, x + sx * 2.6, 1.3, z + sz * 1.3, PL.dark)));
        const t = pbox(g, 6, .06, 3.2, x, 2.65, z, PL.M(TARP[k % TARP.length], { roughness: .8 }), true); t.rotation.x = v < 0 ? .12 : -.12; k++;
      }
      signBoard(g, "MARCHÉ DE LA GOMBE", "Légumes · poisson · pagnes · téléphones", Math.min(W2 * .5, 10), 3.4, front - .2, "#7a2b12", "#ffd23f");
      [-1, 1].forEach(s2 => pbox(g, .2, 3.4, .2, s2 * Math.min(W2 * .5, 10) * .46, 1.7, front - .2, PL.dark));
      o.light = "#ffcf8a";
    } else if (o.type === "parking") {
      // parking : bitume, places tracées en épi sur deux rangées, borne et panneau P
      const f = pplane(g, W2 - .6, D2 - .6, new THREE.MeshStandardMaterial({ roughness: .95, map: canvasTex(512, 300, (c, w, h) => {
        noise(c, w, h, "#2b2d31", .12, 4000); c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 3;
        const sx = w / o.w, sy = h / o.d;
        for (const row of [-1, 1]) { const y0 = h / 2 + row * (o.d / 2 - 14) * sy, y1 = h / 2 + row * (o.d / 2 - 66) * sy; for (let u = -o.w / 2 + 7; u <= o.w / 2 - 7; u += 34) { const x = w / 2 + u * sx; c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); } }
        c.fillStyle = "rgba(255,255,255,.7)"; for (let x = 20; x < w; x += 60) c.fillRect(x, h / 2 - 2, 30, 4);
      }) }), 0, .11, 0); f.rotation.x = -Math.PI / 2; f.receiveShadow = true;
      [-1, 1].forEach(k => pbox(g, W2 - 1, .25, .3, 0, .12, k * (D2 / 2 - .2), PL.M("#c8c2b6")));
      pbox(g, .2, 4, .2, -W2 / 2 + 1, 2, front + .3, PL.metal, true);
      pplane(g, 1.6, 1.6, new THREE.MeshBasicMaterial({ map: PL.txt(256, 256, "#1d4fa0", [{ t: "P", f: "900 200px Inter, Arial, sans-serif", c: "#fff", y: .55 }]) }), -W2 / 2 + 1, 4.4, front + .18, Math.PI);
      pbox(g, .6, 1.3, .5, W2 / 2 - 1.5, .65, front + .6, PL.M("#e8e8e8"), true);
      signBoard(g, o.nom.toUpperCase(), "Parking public · 2 Life", 6, 3.6, front - .2, "#0d2a5c", "#ffffff");
      [-1, 1].forEach(k => pbox(g, .18, 3.6, .18, k * 2.7, 1.8, front - .2, PL.dark));
    } else if (o.type === "jeux") {
      const f = pplane(g, W2 - 1, D2 - 1, new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => { noise(c, w, h, "#d9b35c", .15, 3000); c.fillStyle = "rgba(220,60,60,.75)"; c.beginPath(); c.arc(w * .3, h * .55, 60, 0, 6.3); c.fill(); c.fillStyle = "rgba(60,140,220,.75)"; c.beginPath(); c.arc(w * .72, h * .4, 50, 0, 6.3); c.fill(); }), roughness: .95 }), 0, .12, 0); f.rotation.x = -Math.PI / 2;
      // balançoires
      const sx = -W2 * .25; [-1, 1].forEach(s => { const l = pbox(g, .12, 2.8, .12, sx + s * 2, 1.4, -1, PL.red, true); l.rotation.x = .25; const l2 = pbox(g, .12, 2.8, .12, sx + s * 2, 1.4, 1, PL.red, true); l2.rotation.x = -.25; });
      pbox(g, 4.2, .12, .12, sx, 2.7, 0, PL.red, true);
      [-1, 1].forEach(s => { [-.25, .25].forEach(dx => pbox(g, .03, 2, .03, sx + s * 1 + dx, 1.65, 0, PL.metal)); pbox(g, .6, .06, .3, sx + s, .65, 0, PL.yellow, true); });
      // toboggan
      const tx = W2 * .2; pbox(g, 1.4, 1.8, 1.4, tx, .9, 1.5, PL.blue, true); pbox(g, 1.5, .1, 1.5, tx, 1.85, 1.5, PL.yellow, true);
      const sl = pbox(g, .9, .1, 3.6, tx, .95, -.5, PL.M("#e74c3c", { roughness: .3 }), true); sl.rotation.x = -.5;
      for (let i = 0; i < 5; i++) pbox(g, 1, .06, .06, tx, .3 + i * .36, 2.3, PL.metal);
      // tape-cul (bascule) et tourniquet
      pbox(g, .3, .5, .3, 0, .25, D2 * .25, PL.dark); const sw = pbox(g, 3.4, .1, .3, 0, .55, D2 * .25, PL.green, true); sw.rotation.z = .12;
      const mg = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, .15, 20), PL.yellow); mg.position.set(-W2 * .25, .3, D2 * .25); g.add(mg);
      // bancs et arbres
      [-1, 1].forEach(k => pbox(g, 2, .45, .5, k * (W2 / 2 - 2), .25, 0, PL.wood, true));
      fence(g, W2, D2, 4);
      signBoard(g, "AIRE DE JEUX", "Pour les bébés et enfants de 2 Life", 7, 3.2, front - .3, "#2a1240", "#ffd23f");
      [-1, 1].forEach(k => pbox(g, .2, 2.8, .2, k * 3.2, 1.4, front - .3, PL.dark));
    } else {
      // bâtiments : corps, toit, façade côté rue (z = -D2/2)
      const T = o.type;
      const body = T === "maison" ? PL.M("#e8d8bd") : T === "bureau" ? PL.M("#1d2a3a", { roughness: .2, metalness: .6 }) : T === "club" ? PL.black : T === "alim" ? PL.M(o.id === "alim1" ? "#f4b63f" : "#3aa77a") : T === "etat" ? PL.cream : T === "partenaire" ? PL.white : PL.M("#e9e6e0");
      pbox(g, W2, H2, D2, 0, H2 / 2, 0, body, true);
      pbox(g, W2 + .6, .5, D2 + .6, 0, H2 + .25, 0, T === "etat" ? PL.M("#b5a37c") : PL.dark, true);
      const fz = front - .05;
      if (T === "maison") {
        // ta maison : toit en tôle rouge, porte, fenêtres, clôture et portail
        g.children[g.children.length - 1].visible = false;   // pas de toit plat
        const rr = (D2 + 1.2) / 1.732, roof = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, W2 + .8, 3, 1, false, Math.PI / 2), PL.M("#9b2d20", { roughness: .5, metalness: .3 }));
        roof.rotation.set(0, 0, Math.PI / 2); roof.scale.set(.45, 1, 1); roof.position.set(0, H2 + rr * .45 * .5, 0); if (!MOBILE) roof.castShadow = true; g.add(roof);
        pbox(g, 1.4, 2.4, .15, 0, 1.2, fz - .02, PL.wood);
        [-1, 1].forEach(k => { pbox(g, 1.6, 1.2, .12, k * W2 * .28, 2, fz - .02, PL.glass); pbox(g, 1.8, .12, .2, k * W2 * .28, 1.35, fz - .06, PL.white); });
        const fm = PL.M("#d9cbb0"); const yd = 3.2;
        pbox(g, W2 + 2, 1.4, .2, 0, .7, D2 / 2 + 1, fm); [-1, 1].forEach(k => pbox(g, .2, 1.4, D2 + yd + 1, k * (W2 / 2 + 1), .7, -yd / 2 + .5, fm));
        [-1, 1].forEach(k => pbox(g, W2 / 2 - 1.2, 1.4, .2, k * (W2 / 4 + .6), .7, fz - yd, fm)); pbox(g, 2.2, 1.6, .08, 0, .8, fz - yd, PL.M("#2f6b3a", { metalness: .5 }));
        pplane(g, 3.6, .9, new THREE.MeshBasicMaterial({ map: PL.txt(512, 128, "#2a1a10", [{ t: "🏠 TA MAISON", f: "800 60px Inter, Arial, sans-serif", c: "#ffe6b0", y: .52 }]) }), 0, 2.9, fz - .06, Math.PI);
        o.light = "#ffe2b0";
      } else if (T === "bureau") {
        // Zboss Sarlu : immeuble de bureaux vitré, enseigne lumineuse, auvent d'entrée
        const gl = new THREE.MeshStandardMaterial({ map: canvasTex(128, 256, (c, w, h) => { c.fillStyle = "#24435e"; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { c.fillStyle = "#0f1c29"; c.fillRect(0, y, w, 3); for (let x = 0; x < w; x += 32) { c.fillStyle = Math.random() < .35 ? "#ffe2a8" : "#3e6a8f"; c.fillRect(x + 3, y + 5, 26, 9); } } c.fillStyle = "#0f1c29"; for (let x = 0; x < w; x += 32) c.fillRect(x, 0, 3, h); }, true), roughness: .15, metalness: .5 });
        gl.map.repeat.set(W2 / 6, H2 / 4);
        [[W2, H2, fz + .02, 0], [W2, H2, D2 / 2 + .02, Math.PI]].forEach(([w, hh, z, ry]) => pplane(g, w - .2, hh - 4.4, gl, 0, 4.4 + (hh - 4.4) / 2, z, ry === 0 ? Math.PI : 0));
        [-1, 1].forEach(k => pplane(g, D2 - .2, H2 - 4.4, gl, k * (W2 / 2 + .02), 4.4 + (H2 - 4.4) / 2, 0, k * Math.PI / 2));
        pbox(g, W2 * .7, 3.6, .15, 0, 1.9, fz, PL.glass); pbox(g, 3, 3, .2, 0, 1.5, fz - .03, PL.glow("#fff4dc"));
        pbox(g, 8, .25, 3.2, 0, 4, fz - 1.6, PL.dark, true); [-1, 1].forEach(k => pbox(g, .18, 4, .18, k * 3.8, 2, fz - 3, PL.metal, true));
        pbox(g, W2 + .2, .3, D2 + .2, 0, 4.3, 0, PL.glow("#ff5a1f"));
        const sw = Math.min(W2 * .8, 16); signBoard(g, "ZBOSS SARLU", "Bureau d'aide aux joueurs · 2 Life", sw, H2 - sw / 8 - .6, fz - .1, "#0b0d12", "#ff5a1f");
        pplane(g, 4.8, 1.2, new THREE.MeshBasicMaterial({ map: PL.txt(640, 160, "#ff5a1f", [{ t: "GUICHET D'AIDE · E", f: "900 64px Inter, Arial, sans-serif", c: "#fff", y: .5 }]) }), 0, 4.6 + .6, fz - 1.6 - 1.62, Math.PI);
        const tot = pbox(g, 1.2, 7, .6, -W2 / 2 + 1.5, 3.5, fz - 4, PL.dark, true);
        pplane(g, 1, 5, new THREE.MeshBasicMaterial({ map: canvasTex(128, 640, (c, W_, H_) => { c.fillStyle = "#0b0d12"; c.fillRect(0, 0, W_, H_); c.fillStyle = "#ff5a1f"; c.font = "900 80px sans-serif"; c.textAlign = "center"; "ZBOSS".split("").forEach((ch, k) => c.fillText(ch, W_ / 2, 100 + k * 110)); }) }), -W2 / 2 + 1.5, 3.8, fz - 4.31, Math.PI);
        o.light = "#ffd9b0";
      } else if (T === "club") {
        const nc = o.id === "club1" ? "#ff2bd6" : "#18e0ff";
        [H2 * .35, H2 * .7].forEach(y => pbox(g, W2 + .1, .15, D2 + .1, 0, y, 0, PL.glow(nc)));
        pbox(g, 3, 3, .2, 0, 1.5, fz, PL.glow("#2a0830")); pbox(g, 3.6, .2, .4, 0, 3.1, fz - .1, PL.glow(nc));
        { const sw = Math.min(W2 * .85, 14); signBoard(g, o.nom.toUpperCase(), "Boîte de nuit · 18+", sw, Math.max(H2 - sw / 8 - .4, 3.4 + sw / 8), fz - .06, "#0a0010", nc); }
        // corde et poteaux de l'entrée VIP
        [-2.2, -1, 1, 2.2].forEach(x => pbox(g, .12, 1, .12, x, .5, fz - 1.6, PL.yellow));
        pbox(g, 4.4, .05, .05, 0, .9, fz - 1.6, PL.red);
        o.light = nc;
      } else if (T === "alim" || T === "magasin" || T === "partenaire") {
        const sh = T !== "alim";
        pbox(g, W2 * .8, Math.min(3.4, H2 * .55), .15, 0, Math.min(3.4, H2 * .55) / 2 + .1, fz, PL.glass);
        pbox(g, 2.2, 2.6, .2, 0, 1.3, fz - .02, PL.dark);
        if (T === "alim") {
          const aw = canvasTex(256, 64, (c, w, h) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? "#fff" : (o.id === "alim1" ? "#d63031" : "#0b7a4b"); c.fillRect(i * w / 16, 0, w / 16 + 1, h); } });
          const a = new THREE.Mesh(new THREE.BoxGeometry(W2 * .9, .1, 2.4), new THREE.MeshStandardMaterial({ map: aw })); a.position.set(0, 3.7, fz - 1.1); a.rotation.x = -.25; g.add(a);
          const CR = ["#e67e22", "#27ae60", "#f1c40f", "#c0392b"];
          for (let i = 0; i < 6; i++) { const x = -W2 * .38 + i * W2 * .15; if (Math.abs(x) < 1.6) continue; pbox(g, 1, .6, .7, x, .3, fz - 1, PL.wood, true); pbox(g, .9, .25, .6, x, .72, fz - 1, PL.M(CR[i % 4])); }
          signBoard(g, o.nom.replace("Alimentation", "ALIMENTATION").replace("Super", "SUPER"), "Nourriture · boissons · produits du quotidien", Math.min(W2 * .8, 12), H2 - Math.min(W2 * .8, 12) / 8 - .3, fz - .06, o.id === "alim1" ? "#7a1010" : "#063d26", "#fff3b0");
        } else if (T === "magasin") {
          const sc = o.id === "mode" ? "#ff4f9a" : "#3fa9ff";
          pbox(g, W2, .35, .3, 0, 3.7, fz - .1, PL.glow(sc));
          signBoard(g, o.nom.toUpperCase(), o.id === "mode" ? "Vêtements · chaussures · wax" : "Téléphones · accessoires · réparations", Math.min(W2 * .8, 12), H2 - Math.min(W2 * .8, 12) / 8 - .3, fz - .06, "#111318", sc);
          for (let i = 0; i < 4; i++) pbox(g, .5, 1.7, .5, -W2 * .3 + i * W2 * .2 + (i > 1 ? 1.6 : -1.6) * 0, .95, fz + 1.2, PL.M(["#ff4f9a", "#f2c230", "#3fa9ff", "#2ecc71"][i]));
        } else {
          // espace partenaire : panneau neutre, aucun logo ni nom tant qu'aucun accord n'est signé
          const cat = o.nom.split("·")[1].trim().toUpperCase();
          pbox(g, W2 + .2, .25, D2 + .2, 0, H2 * .5, 0, PL.glow("#ff5a1f"));
          signBoard(g, "ESPACE PARTENAIRE", cat + " · bientôt disponible", Math.min(W2 * .8, 12), H2 - Math.min(W2 * .8, 12) / 8 - .3, fz - .06, "#ffffff", "#ff5a1f");
          pplane(g, 3, 1.1, new THREE.MeshBasicMaterial({ map: PL.txt(512, 192, "#1b1c21", [{ t: "Bientôt ouvert", f: "800 64px Inter, Arial, sans-serif", c: "#ffffff", y: .5 }]) }), 0, 3, fz - .08, Math.PI);
        }
        if (sh) o.light = "#fff1dc";
      } else if (T === "etat") {
        // marches, colonnes, fronton, drapeau, bannière « ouvre après le lancement »
        for (let i = 0; i < 3; i++) pbox(g, W2 * .7 - i * .8, .3, 1.2, 0, .15 + i * .3, fz - 2.6 + i * .6, PL.M("#dcd3c0"), true);
        pbox(g, W2 * .75, .5, 3.6, 0, H2 * .82, fz - 1.8, PL.cream, true);
        const nC = Math.max(4, Math.round(W2 * .7 / 3));
        for (let i = 0; i < nC; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.42, .5, H2 * .82 - .9, 14), PL.white); c.position.set(-W2 * .35 + i * W2 * .7 / (nC - 1), .9 + (H2 * .82 - .9) / 2, fz - 3.1); if (!MOBILE) c.castShadow = true; g.add(c); }
        const pg = new THREE.Mesh(new THREE.BoxGeometry(W2 * .78, 1.4, 3.8), PL.M("#d8c9a6")); pg.position.set(0, H2 * .82 + .95, fz - 1.8); g.add(pg);
        const nt = PL.txt(1024, 160, "#d8c9a6", [{ t: o.nom.toUpperCase(), f: "800 70px Georgia, serif", c: "#3b2f1e", y: .52 }]);
        pplane(g, W2 * .76, W2 * .76 * 160 / 1024, new THREE.MeshBasicMaterial({ map: nt }), 0, H2 * .82 + .95, fz - 3.75, Math.PI);
        const bn = PL.txt(1024, 192, "#7a1515", [{ t: "OUVRE APRÈS LE LANCEMENT", f: "900 80px Inter, Arial, sans-serif", c: "#fff", y: .4 }, { t: "Institution de l'État · 2 Life", f: "600 44px Inter, Arial, sans-serif", c: "#ffd27a", y: .8 }]);
        pplane(g, 7, 1.3, new THREE.MeshBasicMaterial({ map: bn }), 0, 2.3, fz - 3.6, Math.PI);
        const px = W2 / 2 + 1.5; pbox(g, .15, 10, .15, px, 5, fz - 3, PL.metal, true);
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide })); fl.position.set(px - 1.25, 9.1, fz - 3); fl.rotation.y = Math.PI; g.add(fl); o.flag = fl;
        o.light = "#ffe2b0";
      }
    }
    scene.add(g); o.g3 = g; placeGroups.push(o);
  }
  PLACES3.forEach(buildPlace);
  // panneaux LED doubles faces (publicités inventées, aucune marque réelle)
  const ADS = [
    ["2 LIFE", "Naître avant tout le monde", "#ff5a1f", "#120806"],
    ["MOKILI CLUB", "Ce soir · 18+ · entrée libre", "#ff2bd6", "#0a0010"],
    ["MAMA KITOKO", "Alimentation · prix doux", "#ffd23f", "#4a0f0f"],
    ["VOTRE PUB ICI", "Espace partenaire · contactez 2 Life", "#18e0ff", "#04161c"],
    ["ÉLECTIONS 2 LIFE", "Vote tous les 6 mois · 18 ans et +", "#7dff8a", "#06210e"],
    ["KIN PHONES", "Téléphones et accessoires", "#3fa9ff", "#071426"],
  ].map(([a, b, c, bg]) => new THREE.MeshBasicMaterial({ map: canvasTex(768, 384, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, bg); gr.addColorStop(1, "#000"); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.strokeStyle = c; x.lineWidth = 10; x.strokeRect(14, 14, w - 28, h - 28);
    x.textAlign = "center"; x.textBaseline = "middle"; x.shadowColor = c; x.shadowBlur = 24; x.fillStyle = c; x.font = "900 104px 'Chakra Petch', Impact, sans-serif"; x.fillText(a, w / 2, h * .42, w * .9);
    x.shadowBlur = 0; x.fillStyle = "#fff"; x.font = "600 40px Inter, Arial, sans-serif"; x.fillText(b, w / 2, h * .74, w * .9);
    x.fillStyle = "rgba(255,255,255,.06)"; for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1);   // trame LED
  }) }));
  // annonces payantes des commerçants partenaires : elles s'ajoutent aux panneaux LED (serveur, ou espace admin de la démo)
  function adMaterial(a) {
    const c = a.couleur || "#ffd23f";
    return new THREE.MeshBasicMaterial({ map: canvasTex(768, 384, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#111"); gr.addColorStop(1, "#000"); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      x.strokeStyle = c; x.lineWidth = 10; x.strokeRect(14, 14, w - 28, h - 28);
      x.textAlign = "center"; x.textBaseline = "middle"; x.shadowColor = c; x.shadowBlur = 24; x.fillStyle = c; x.font = "900 92px 'Chakra Petch', Impact, sans-serif"; x.fillText(String(a.titre).toUpperCase(), w / 2, h * .38, w * .9);
      x.shadowBlur = 0; x.fillStyle = "#fff"; x.font = "600 34px Inter, Arial, sans-serif"; x.fillText(String(a.texte || a.annonceur).slice(0, 48), w / 2, h * .66, w * .9);
      x.fillStyle = "rgba(255,255,255,.55)"; x.font = "500 24px Inter, Arial, sans-serif"; x.fillText("Annonce · " + a.annonceur + (a.commune ? " · " + a.commune : ""), w / 2, h * .86, w * .9);
      x.fillStyle = "rgba(255,255,255,.06)"; for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1);
    }) });
  }
  (async () => {
    let pubs = [];
    try {
      const API = (window.TWO_LIFE_API || "").replace(/\/$/, "");
      if (API) pubs = (await (await fetch(API + "/api/pubs")).json()).pubs || [];
      else { const n = Date.now(); pubs = JSON.parse(localStorage.getItem("twolife_demo_pubs") || "[]").filter(a => a.actif && a.debut <= n && a.fin > n && a.emplacement !== "journal"); }
    } catch (e) { pubs = []; }
    // une annonce payée prend la place de « VOTRE PUB ICI », puis s'ajoute à la rotation
    pubs.slice(0, 12).forEach((a, i) => { const m = adMaterial(a); if (i === 0) ADS[3] = m; else ADS.push(m); });
  })();
  const ledBoards = BOARDS3.map(b => {
    const g = new THREE.Group(); g.position.set(b.x * S, 0, b.y * S); g.rotation.y = -b.a;
    pbox(g, .45, 6, .45, 0, 3, 0, PL.metal, true);
    pbox(g, 8.4, 4.4, .5, 0, 7.6, 0, PL.dark, true);
    const fA = pplane(g, 8, 4, ADS[b.i % ADS.length], 0, 7.6, -.26, Math.PI), fB = pplane(g, 8, 4, ADS[(b.i + 3) % ADS.length], 0, 7.6, .26, 0);
    scene.add(g); return { b, g, fA, fB };
  });
  // bancs publics (instanciés) : assise en bois, dossier, pieds en métal ; le dossier est derrière la personne assise
  const BENCH3 = WORLD.BENCHES || [];
  if (BENCH3.length) {
    const seat = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, .08, .46), PL.wood, BENCH3.length), back = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, .42, .06), PL.wood, BENCH3.length);
    const legL = new THREE.InstancedMesh(new THREE.BoxGeometry(.08, .44, .42), PL.M("#30343b", { metalness: .6, roughness: .4 }), BENCH3.length * 2);
    const m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4();
    BENCH3.forEach((b, i) => {
      // repère du banc : x = longueur, z = vers l'avant (là où regarde la personne assise)
      const base = new THREE.Matrix4().makeRotationY(Math.PI / 2 - b.a).setPosition(b.x * S, 0, b.y * S);
      seat.setMatrixAt(i, m4.copy(base).multiply(m5.makeTranslation(0, .44, -.05)));
      back.setMatrixAt(i, m4.copy(base).multiply(m5.makeTranslation(0, .72, -.27)).multiply(m5.makeRotationX(-.12)));
      [-1, 1].forEach((k, j) => legL.setMatrixAt(i * 2 + j, m4.copy(base).multiply(m5.makeTranslation(k * .8, .22, -.05))));
    });
    [seat, back, legL].forEach(im => { im.castShadow = !MOBILE; im.receiveShadow = true; scene.add(im); });
  }
  const balls = new Map();
  const placeLight = new THREE.PointLight("#fff1dc", 0, 60, 1.6); scene.add(placeLight);
  function updatePlaces(G) {
    const focus = G.foot || G.player, t = performance.now() / 1000;
    let near = null, nd = 1e9;
    placeGroups.forEach(o => { const d = Math.hypot(o.x - focus.x, o.y - focus.y); o.g3.visible = d < 4200; if (d < nd) { nd = d; near = o; } if (o.flag && o.g3.visible) o.flag.rotation.y = Math.PI + Math.sin(t * 2 + o.x) * .15; });
    const k = Math.floor(t / 7);
    ledBoards.forEach(q => { const d = Math.hypot(q.b.x - focus.x, q.b.y - focus.y); q.g.visible = d < 4200; if (!q.g.visible) return; q.fA.material = ADS[(q.b.i + k) % ADS.length]; q.fB.material = ADS[(q.b.i + k + 3) % ADS.length]; });
    (G.games || []).forEach(g => {
      let m = balls.get(g);
      if (!m) { m = new THREE.Mesh(new THREE.SphereGeometry(g.foot ? .11 : .12, 16, 12), new THREE.MeshStandardMaterial({ color: g.foot ? "#f4f4f2" : "#d9661f", roughness: .45 })); m.castShadow = !MOBILE; scene.add(m); balls.set(g, m); }
      const B = g.ball; m.visible = B.x !== undefined && Math.hypot(g.o.x - focus.x, g.o.y - focus.y) < 2500;
      if (m.visible) { m.position.set(B.x * S, B.z * S + (g.foot ? .11 : .12), B.y * S); m.rotation.x += (Math.abs(B.vu) + Math.abs(B.vv)) * S * .05; }
    });
    if (near && near.light && nd < 800) { placeLight.color.set(near.light); placeLight.position.set((near.x - near.nx * (near.d / 2 + 40)) * S, 5, (near.y - near.ny * (near.d / 2 + 40)) * S); placeLight.intensity = 1.4; } else placeLight.intensity = 0;
  }

  // ------------------------------------------------------------ Piétons (instanciés : 1 appel de dessin par partie du corps)
  const PEDMAX = 96;
  const SKIN = ["#3b2219", "#4a2c1f", "#5a3826", "#6b4430", "#2f1b14", "#7a4e36"];
  const WAX = ["#e8a317", "#1f7a8c", "#c0392b", "#8e44ad", "#16a085", "#d35400", "#2c3e50", "#f1c40f"];
  const SHIRT = ["#f4f4f2", "#1e3a8a", "#b91c1c", "#0f766e", "#f59e0b", "#374151", "#7c3aed", "#e11d48"];
  const PANTS = ["#1f2937", "#3f3f46", "#1e3a5f", "#4b3621", "#d6d3d1"];
  // tenue de ville (centre-ville) : costumes et tailleurs sombres, cravates
  const SUIT = ["#111a33", "#1b1d22", "#0d0e11", "#16264a", "#3b2a1e", "#262a31", "#b9a582"];
  const BAGC = new THREE.Color("#140d08").convertSRGBToLinear();
  const TIE = ["#8b1e2d", "#1e3a8a", "#b8860b", "#0f5132", "#5b2a86", "#c0392b"];
  const waxTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#fff"; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(0,0,0,.35)"; for (let y = 0; y < h; y += 16) for (let x = (y / 16 % 2) * 8; x < w; x += 16) { c.beginPath(); c.arc(x, y, 5, 0, 6.3); c.fill(); } c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 2; for (let y = 8; y < h; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } }, true);
  const pm = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: .8 }, o));
  const cyl = (r1, r2, h, n, sx, sz) => { const g = new THREE.CylinderGeometry(r1, r2, h, n || 10); if (sx || sz) g.scale(sx || 1, 1, sz || 1); return g; };
  // visage peint (sourcils, nez, bouche) multiplié par la couleur de peau ; le centre de la texture regarde vers l'avant (+x)
  const faceTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = "#fff"; c.fillRect(0, 0, w, h);
    const cx = w / 2;
    c.fillStyle = "rgba(20,10,6,.75)"; [-1, 1].forEach(k => { c.beginPath(); c.ellipse(cx + k * 6.5, 55, 4.6, 1.3, k * -.12, 0, 6.3); c.fill(); });
    c.fillStyle = "rgba(40,20,12,.35)"; c.beginPath(); c.ellipse(cx, 71, 3.2, 2, 0, 0, 6.3); c.fill();
    c.fillStyle = "rgba(70,28,26,.85)"; c.beginPath(); c.ellipse(cx, 81, 6.5, 1.9, 0, 0, 6.3); c.fill();
    c.fillStyle = "rgba(25,10,8,.8)"; c.fillRect(cx - 6, 80.6, 12, .9);
  });
  function headGeo() { const g = new THREE.SphereGeometry(.115, 18, 14); g.scale(.95, 1.12, .86); return g; }
  const PART = {
    torso: new THREE.InstancedMesh(cyl(.15, .12, .6, 12, 1, 1.45), pm({}), PEDMAX),
    skirt: new THREE.InstancedMesh(cyl(.16, .3, .66, 12), pm({ map: waxTex }), PEDMAX),
    head: new THREE.InstancedMesh(headGeo(), pm({ roughness: .55, map: faceTex }), PEDMAX),
    nose: new THREE.InstancedMesh(new THREE.SphereGeometry(.024, 8, 6), pm({ roughness: .55 }), PEDMAX),
    eye: new THREE.InstancedMesh(new THREE.SphereGeometry(.019, 8, 6), pm({ color: "#f2ede6", roughness: .2 }), PEDMAX * 2),
    pupil: new THREE.InstancedMesh(new THREE.SphereGeometry(.011, 8, 6), pm({ color: "#120a06", roughness: .15 }), PEDMAX * 2),
    hand: new THREE.InstancedMesh(new THREE.SphereGeometry(.045, 8, 6), pm({ roughness: .6 }), PEDMAX * 2),
    wrap: new THREE.InstancedMesh(new THREE.SphereGeometry(.14, 10, 8), pm({ map: waxTex }), PEDMAX),
    hair: new THREE.InstancedMesh(new THREE.SphereGeometry(.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), pm({ color: "#120c0a", roughness: .9 }), PEDMAX),
    thigh: new THREE.InstancedMesh(cyl(.085, .066, .46, 8), pm({}), PEDMAX * 2),
    calf: new THREE.InstancedMesh(cyl(.064, .045, .44, 8), pm({}), PEDMAX * 2),
    shoe: new THREE.InstancedMesh(new THREE.BoxGeometry(.26, .08, .11), pm({ roughness: .5 }), PEDMAX * 2),
    arm: new THREE.InstancedMesh(cyl(.052, .042, .6, 8), pm({}), PEDMAX * 2),
    collar: new THREE.InstancedMesh(new THREE.BoxGeometry(.03, .16, .11), pm({ color: "#f4f4f2" }), PEDMAX),
    tie: new THREE.InstancedMesh(new THREE.BoxGeometry(.02, .3, .05), pm({ roughness: .4 }), PEDMAX),
    bag: new THREE.InstancedMesh(new THREE.BoxGeometry(.36, .26, .08), pm({ color: "#2a1a10", roughness: .4 }), PEDMAX),
  };
  for (const k in PART) { const im = PART[k]; im.frustumCulled = false; im.castShadow = !MOBILE; im.setColorAt(0, new THREE.Color()); im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
  const pedLook = q => {
    if (q.lookC) return q.lookC;
    let h = (q.look * 2654435761 + (q.staff ? 99 : 0) + Math.floor((q.x0 || q.x) * 7)) >>> 0; const r = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
    if (q.kit) { // joueurs de foot / basket : maillot de l'équipe, short
      q.lookC = { woman: false, skin: new THREE.Color(SKIN[(r() * SKIN.length) | 0]), top: new THREE.Color(q.kit[0]), low: new THREE.Color(q.kit[1]), wrap: null, sleeve: false, h: .96 + r() * .1, shoe: new THREE.Color(["#111", "#f5f5f5", "#e11d48"][(r() * 3) | 0]) };
      const L = q.lookC, lin = c => c && c.clone().convertSRGBToLinear();
      L.fb = { skin: lin(L.skin), top: lin(L.top), low: lin(L.low), wrap: null, shoe: lin(L.shoe) };
      return L;
    }
    const woman = q.player ? false : r() < (q.cop ? .25 : q.vendor || q.market ? .75 : .48);
    if (q.cop) { // police nationale : uniforme bleu marine, béret
      q.lookC = { woman, cop: true, skin: new THREE.Color(SKIN[(r() * SKIN.length) | 0]), top: new THREE.Color("#22345c"), low: new THREE.Color("#1a2744"), wrap: null, sleeve: true, h: .98 + r() * .08, shoe: new THREE.Color("#0b0b0d"), biz: false };
      const L = q.lookC, lin = c => c && c.clone().convertSRGBToLinear();
      L.fb = { skin: lin(L.skin), top: lin(L.top), low: lin(L.low), wrap: null, shoe: lin(L.shoe) };
      return L;
    }
    const biz = !q.player && !q.staff && !q.vendor && ((((q.look || 0) * 7919 + Math.floor((q.x0 || q.x) * 3)) >>> 0) % 100) < (window.TWOLIFE_WALK ? 40 : 18);
    if (biz) {
      const suit = SUIT[(r() * SUIT.length) | 0];
      q.lookC = { woman, biz: true, skin: new THREE.Color(SKIN[(r() * SKIN.length) | 0]), top: new THREE.Color(suit), low: new THREE.Color(woman && r() < .5 ? SUIT[(r() * SUIT.length) | 0] : suit), wrap: null,
        sleeve: true, h: .94 + r() * .12, shoe: new THREE.Color(r() < .7 ? "#0e0e10" : "#3b2414"), tie: new THREE.Color(woman ? "#f4f4f2" : TIE[(r() * TIE.length) | 0]), bag: r() < .55 };
      const L = q.lookC, lin = c => c && c.clone().convertSRGBToLinear();
      L.fb = { skin: lin(L.skin), top: lin(L.top), low: lin(L.low), wrap: null, shoe: lin(L.shoe), tie: lin(L.tie) };
      return L;
    }
    q.lookC = {
      woman, skin: new THREE.Color(SKIN[(r() * SKIN.length) | 0]),
      top: new THREE.Color(q.player ? "#ff5a1f" : q.staff ? "#14161c" : woman && r() < .6 ? WAX[(r() * WAX.length) | 0] : SHIRT[(r() * SHIRT.length) | 0]),
      low: new THREE.Color(q.staff ? "#14161c" : woman ? WAX[(r() * WAX.length) | 0] : PANTS[(r() * PANTS.length) | 0]),
      wrap: woman && r() < .55 ? new THREE.Color(WAX[(r() * WAX.length) | 0]) : null,
      sleeve: r() < .5, h: .94 + r() * .12, shoe: new THREE.Color(["#111", "#f5f5f5", "#5b3a1e", "#1d4ed8"][(r() * 4) | 0]),
    };
    // mêmes couleurs en espace linéaire pour les silhouettes simplifiées (sinon la peau sort beige à l'écran)
    const L = q.lookC, lin = c => c && c.clone().convertSRGBToLinear();
    L.fb = { skin: lin(L.skin), top: lin(L.top), low: lin(L.low), wrap: lin(L.wrap), shoe: lin(L.shoe) };
    return q.lookC;
  };
  // ------------------------------------------------------------ Personnages réalistes (Blender + MakeHuman CC0, riggés et animés)
  // Les piétons les plus proches de la caméra (et le chauffeur à pied) utilisent des modèles humains
  // animés ; les plus lointains gardent la version instanciée, bien plus légère.
  const HUM = { ready: false, tpl: {}, clips: {}, pool: {}, byPed: new Map(), max: MOBILE ? 12 : 24, range: MOBILE ? 55 : 75 };
  const BONE_SET = new Set(["Root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "head", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r", "thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r", "ball_l", "ball_r"]);
  const realName = n => (BONE_SET.has(n) ? n : BONE_SET.has(n.replace(/_\d+$/, "")) ? n.replace(/_\d+$/, "") : n);
  if (THREE.GLTFLoader && THREE.SkeletonUtils) {
    const ld = new THREE.GLTFLoader();
    if (window.MeshoptDecoder) ld.setMeshoptDecoder(window.MeshoptDecoder);
    ld.load("assets/models/humans" + (window.ZBOSS_MODEL_EXT || ".glb"), gl => {
      const owner = {};
      gl.scene.traverse(o => { if (o.userData && o.userData.variant) o.traverse(b => { if (b.isBone) owner[b.name] = o; }); });
      gl.scene.children.slice().forEach(r => {
        if (!r.userData.variant) return;
        r.traverse(o => {
          if (o.isBone) o.name = realName(o.name);
          if (o.isMesh) { o.castShadow = !MOBILE; o.frustumCulled = false; const m = o.material; if (m) { m.envMapIntensity = .6; if (/^skin/.test(m.name)) m.roughness = .62; } }
        });
        HUM.tpl[r.userData.variant] = r; HUM.pool[r.userData.variant] = [];
      });
      gl.animations.forEach(c => {
        let own = null;
        c.tracks.forEach(t => { const i = t.name.indexOf("."), node = t.name.slice(0, i); if (!own && owner[node]) own = owner[node]; t.name = realName(node) + t.name.slice(i); });
        const base = own && own.getObjectByName("pelvis");
        // une copie par personnage : la translation du bassin est recalée sur sa propre taille
        for (const v in HUM.tpl) {
          const cc = c.clone(), pv = HUM.tpl[v].getObjectByName("pelvis");
          if (base && pv) cc.tracks.forEach(t => { if (t.name === "pelvis.position") for (let i = 0; i < t.values.length; i += 3) { t.values[i] += pv.position.x - base.position.x; t.values[i + 1] += pv.position.y - base.position.y; t.values[i + 2] += pv.position.z - base.position.z; } });
          (HUM.clips[v] = HUM.clips[v] || {})[c.name] = cc;
        }
      });
      HUM.ready = Object.keys(HUM.tpl).length > 0;
    }, undefined, () => { HUM.ready = false; });
  }
  const MEN = ["m1", "m2", "m3", "m4"], WOMEN = ["f1", "f2", "f3"];
  function humInstance(v) {
    const pool = HUM.pool[v];
    let h = pool.find(x => !x.ped);
    if (!h) {
      const obj = THREE.SkeletonUtils.clone(HUM.tpl[v]);
      obj.position.set(0, 0, 0);
      const mats = {};
      obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); mats[o.material.name.replace(/\..*$/, "")] = o.material; o.castShadow = !MOBILE; o.frustumCulled = false; } });
      const mixer = new THREE.AnimationMixer(obj), acts = {};
      for (const k in HUM.clips[v]) acts[k] = mixer.clipAction(HUM.clips[v][k]);
      h = { v, obj, mats, mixer, acts, cur: null, ped: null };
      pool.push(h);
    }
    return h;
  }
  function humPlay(h, name, ts) {
    const a = h.acts[name] || h.acts.idle;
    if (!a) return;
    a.timeScale = ts;
    if (h.cur === a) return;
    a.reset().play();
    if (h.cur) a.crossFadeFrom(h.cur, .25, false);
    h.cur = a;
  }
  // pose assise : on oriente les os (cuisses à l'horizontale, mollets vers le bas, mains sur les genoux)
  const sv1 = new THREE.Vector3(), sv2 = new THREE.Vector3(), sq1 = new THREE.Quaternion(), sq2 = new THREE.Quaternion(), sq3 = new THREE.Quaternion(), sDir = new THREE.Vector3();
  function boneMap(h) { if (!h.bones) { h.bones = {}; h.obj.traverse(b => { if (b.isBone) h.bones[realName(b.name)] = b; }); } return h.bones; }
  function aimBone(bone, child, dir) {
    if (!bone || !child || !bone.parent) return;
    bone.updateMatrixWorld(true);
    const a = bone.getWorldPosition(sv1), b = child.getWorldPosition(sv2).sub(a).normalize();
    sq1.setFromUnitVectors(b, dir);
    bone.getWorldQuaternion(sq2); bone.parent.getWorldQuaternion(sq3);
    bone.quaternion.copy(sq3.invert().multiply(sq1.multiply(sq2)));
    bone.updateMatrixWorld(true);
  }
  function sitPose(h) {
    const B = boneMap(h), ry = h.obj.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry);
    h.obj.position.y -= .44; h.obj.updateMatrixWorld(true);
    ["l", "r"].forEach(s => {
      aimBone(B["thigh_" + s], B["calf_" + s], sDir.set(fx, -.08, fz).normalize());
      aimBone(B["calf_" + s], B["foot_" + s], sDir.set(fx * .12, -1, fz * .12).normalize());
      aimBone(B["upperarm_" + s], B["lowerarm_" + s], sDir.set(fx * .35, -1, fz * .35).normalize());
      aimBone(B["lowerarm_" + s], B["hand_" + s], sDir.set(fx, -.35, fz).normalize());
    });
  }
  const humTmp = new THREE.Color(), WHITE = new THREE.Color("#ffffff"), humV1 = new THREE.Vector3(), humV2 = new THREE.Vector3();
  let TIE_Z = .1; window.__setTieZ = v => { TIE_Z = v; }; window.__pedLook = q => pedLook(q);   // avancée de la cravate devant la colonne (réglée sur le modèle)
  // place les personnages animés ; renvoie l'ensemble des piétons pris en charge
  function updateHumans(list, camX, camZ, dt) {
    const done = new Set();
    if (!HUM.ready) return done;
    const r2 = HUM.range * HUM.range;
    const cand = list.map(q => ({ q, d: (q.x * S - camX) ** 2 + (q.y * S - camZ) ** 2 })).filter(o => o.d < r2 || o.q.player).sort((a, b) => (b.q.player ? 1 : 0) - (a.q.player ? 1 : 0) || a.d - b.d).slice(0, HUM.max).map(o => o.q);
    const keep = new Set(cand);
    for (const [q, h] of HUM.byPed) if (!keep.has(q)) { h.ped = null; scene.remove(h.obj); HUM.byPed.delete(q); }
    cand.forEach(q => {
      let h = HUM.byPed.get(q);
      const L = pedLook(q);
      if (!h) {
        const hash = ((q.look || 0) * 2654435761 + Math.floor((q.x0 || q.x) * 7)) >>> 0;
        const v = q.player ? "m1" : q.kit ? (hash % 2 ? "m3" : "m1") : L.cop ? (L.woman ? "f2" : (hash % 2 ? "m2" : "m4")) : L.biz ? (L.woman ? "f2" : (hash % 3 ? "m4" : "m2")) : L.woman ? WOMEN[hash % WOMEN.length] : MEN[hash % MEN.length];
        if (!HUM.tpl[v]) return;
        h = humInstance(v); h.ped = q; h.cur = null; h.mixer.stopAllAction(); HUM.byPed.set(q, h); scene.add(h.obj);
        const m = h.mats;
        // couleurs du jeu (sRGB) -> espace linéaire des matériaux glTF
        if (m.shirt) m.shirt.color.copy(L.top).convertSRGBToLinear();
        if (m.pants) m.pants.color.copy(L.low).convertSRGBToLinear();
        if (m.wax) m.wax.color.copy(humTmp.copy(WHITE).lerp(L.wrap || L.low, .45));
        if (m.shoes) m.shoes.color.copy(L.shoe).convertSRGBToLinear();
        if (m.wax) { if (!m.wax.userData.map0) m.wax.userData.map0 = m.wax.map || "none"; const solid = L.biz || L.cop; m.wax.map = solid ? null : (m.wax.userData.map0 === "none" ? null : m.wax.userData.map0); if (solid) m.wax.color.copy(L.low).convertSRGBToLinear(); m.wax.needsUpdate = true; }
        h.mixer.update(Math.random() * 2);
        if (h.acc) h.acc.forEach(o => { if (o.parent) o.parent.remove(o); });
        h.acc = null;
        if (q.vendor) { // vendeuse ambulante : bassine de marchandises sur la tête
          if (!h.bones) { h.bones = {}; h.obj.traverse(b => { if (b.isBone) h.bones[realName(b.name)] = b; }); }
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(.3, .2, .12, 16), new THREE.MeshStandardMaterial({ color: ["#e74c3c", "#2980b9", "#27ae60", "#f39c12"][(q.id || 0) % 4], roughness: .4, metalness: .2 }));
          const badge = new THREE.Mesh(new THREE.SphereGeometry(.24, 10, 6), new THREE.MeshStandardMaterial({ color: ["#c8a165", "#f1c40f", "#d35400", "#ecf0f1"][(q.id || 0) % 4], roughness: .9 })); badge.scale.y = .45;
          h.acc = [cap, badge]; h.acc.forEach(o => { o.castShadow = !MOBILE; h.obj.add(o); }); h.cap = cap; h.badge = badge; h.basin = true;
        }
        if (L.cop) { // béret de police sur la tête
          if (!h.bones) { h.bones = {}; h.obj.traverse(b => { if (b.isBone) h.bones[realName(b.name)] = b; }); }
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(.11, .12, .07, 14), new THREE.MeshStandardMaterial({ color: new THREE.Color("#141c33").convertSRGBToLinear(), roughness: .7 }));
          const badge = new THREE.Mesh(new THREE.BoxGeometry(.04, .04, .01), new THREE.MeshStandardMaterial({ color: "#d4af37", metalness: .8, roughness: .3 }));
          h.acc = [cap, badge]; h.acc.forEach(o => { o.castShadow = !MOBILE; h.obj.add(o); }); h.cap = cap; h.badge = badge;
        }
        if (L.biz) {
          // cravate (ou col blanc) fixée sur la poitrine, mallette dans la main droite
          if (!h.bones) { h.bones = {}; h.obj.traverse(b => { if (b.isBone) h.bones[realName(b.name)] = b; }); }
          const tie = L.woman ? null : new THREE.Mesh(new THREE.BoxGeometry(.06, .36, .02), new THREE.MeshStandardMaterial({ color: L.tie.clone().convertSRGBToLinear(), roughness: .35 }));
          const knot = L.woman ? null : new THREE.Mesh(new THREE.BoxGeometry(.075, .06, .03), tie.material);
          const bag = L.bag ? new THREE.Mesh(new THREE.BoxGeometry(.08, .28, .38), new THREE.MeshStandardMaterial({ color: "#140d08", roughness: .3, metalness: .15 })) : null;
          h.acc = [tie, knot, bag].filter(Boolean); h.acc.forEach(o => { o.castShadow = !MOBILE; h.obj.add(o); });
          h.tie = tie; h.knot = knot; h.bag = bag;
        }
      }
      if (h.acc) {
        const sp3 = h.bones && (h.bones.spine_03 || h.bones.spine_02), nk = h.bones && h.bones.neck_01, hr = h.bones && h.bones.hand_r;
        h.obj.updateMatrixWorld(true);
        if (h.tie && sp3 && nk) {
          const a = sp3.getWorldPosition(humV1), b = nk.getWorldPosition(humV2); h.obj.worldToLocal(a); h.obj.worldToLocal(b);
          const sc = h.obj.scale.x || 1;
          h.knot.position.set(b.x, b.y - .09 / sc, b.z + TIE_Z / sc);
          h.tie.position.set((a.x + b.x) / 2, b.y - .3 / sc, Math.max(a.z, b.z) + (TIE_Z + .045) / sc); h.tie.rotation.x = -.18;
        }
        if (h.cap) { const hd = h.bones && h.bones.head; if (hd) { const c = hd.getWorldPosition(humV1); h.obj.worldToLocal(c); const sc = h.obj.scale.x || 1; if (h.basin) { h.cap.position.set(c.x, c.y + .2 / sc, c.z); h.badge.position.set(c.x, c.y + .27 / sc, c.z); } else { h.cap.position.set(c.x, c.y + .13 / sc, c.z); h.badge.position.set(c.x, c.y + .13 / sc, c.z + .11 / sc); } } }
        if (h.bag && hr) { const c = hr.getWorldPosition(humV1); h.obj.worldToLocal(c); h.bag.position.set(c.x, c.y - .17, c.z); }
      }
      const sp = Math.abs(q.v || 0) * S * (q.player ? 1 : 1);
      if (q.state === "cower") humPlay(h, "cower", 1);
      else if (q.state === "dodge" || sp > 2.4) humPlay(h, "run", Math.min(1.8, Math.max(.7, sp / 3.1)));
      else if (q.state === "walk" && sp > .2) humPlay(h, "walk", Math.min(2.2, Math.max(.5, sp / 1.05)));
      else humPlay(h, "idle", 1);
      h.mixer.update(dt);
      h.obj.position.set(q.x * S, .02 + (q.state === "dodge" ? Math.sin((.55 - (q.st || 0)) / .55 * Math.PI) * .25 : 0), q.y * S);
      h.obj.rotation.y = Math.PI / 2 - q.a;
      h.obj.scale.setScalar(q.player ? 1 : .96 + (L.h - .94) * .6);
      if (q.state === "sit") sitPose(h);
      done.add(q);
    });
    return done;
  }

  const mP = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  // bulles de conversation au-dessus des passants qui discutent
  const BUB = [], bubTex = canvasTex(128, 96, (c, w, h) => {
    c.fillStyle = "#ffffff"; c.strokeStyle = "#1b1e26"; c.lineWidth = 5;
    c.beginPath(); c.moveTo(24, 8); c.lineTo(104, 8); c.quadraticCurveTo(120, 8, 120, 24); c.lineTo(120, 52); c.quadraticCurveTo(120, 68, 104, 68); c.lineTo(52, 68); c.lineTo(34, 88); c.lineTo(38, 68); c.lineTo(24, 68); c.quadraticCurveTo(8, 68, 8, 52); c.lineTo(8, 24); c.quadraticCurveTo(8, 8, 24, 8); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#1b1e26"; [40, 64, 88].forEach(x => { c.beginPath(); c.arc(x, 38, 7, 0, 6.3); c.fill(); });
  });
  const bubMat = new THREE.SpriteMaterial({ map: bubTex, depthTest: true, transparent: true });
  // feux tricolores : mât au coin du carrefour, une tête par axe
  const TLP = [], tlOn = { r: new THREE.MeshBasicMaterial({ color: "#ff2a2a" }), y: new THREE.MeshBasicMaterial({ color: "#ffb300" }), g: new THREE.MeshBasicMaterial({ color: "#2bff6a" }) }, tlOff = new THREE.MeshStandardMaterial({ color: "#1a1c20", roughness: .5 });
  function makeTL() {
    const g = new THREE.Group(), dark = PL.dark || new THREE.MeshStandardMaterial({ color: "#22252b" });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.09, .11, 4.4, 8), dark); pole.position.y = 2.2; g.add(pole);
    g.userData.heads = [0, 1].map(k => {
      const hd = new THREE.Group(); hd.position.set(0, 3.6, 0); hd.rotation.y = k * Math.PI / 2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(.34, 1.05, .3), dark); box.position.z = .2; hd.add(box);
      const bulbs = ["r", "y", "g"].map((c, i) => { const b = new THREE.Mesh(new THREE.CircleGeometry(.11, 12), tlOff); b.position.set(0, .32 - i * .32, .36); hd.add(b); const b2 = b.clone(); b2.position.z = .04; b2.rotation.y = Math.PI; hd.add(b2); return [b, b2]; });
      g.add(hd); return bulbs;
    });
    g.scale.setScalar(1.5); scene.add(g); return g;
  }
  function updateLights(G) {
    const W = WORLD, L = W.LIGHTS; if (!L || !L.length) return;
    const f = G.foot || G.player; let n = 0;
    for (const o of L) {
      if (n >= 14) break; if (Math.abs(o.x - f.x) > 1100 || Math.abs(o.y - f.y) > 1100) continue;
      const g = TLP[n] || (TLP[n] = makeTL()); n++;
      const ca = Math.cos(o.ax), sa = Math.sin(o.ax), off = o.w / 2 + 10;
      g.visible = true; g.position.set((o.x + (ca - sa) * off * .75) * S, 0, (o.y + (sa + ca) * off * .75) * S); g.rotation.y = -o.ax + Math.PI / 2;
      const st = W.lightState(o, G.t);
      [st.a, st.b].forEach((c, k) => g.userData.heads[k].forEach((pair, i) => { const m = ["r", "y", "g"][i] === c ? tlOn[c] : tlOff; pair[0].material = m; pair[1].material = m; }));
    }
    for (let k = n; k < TLP.length; k++) TLP[k].visible = false;
  }
  function updateBubbles(G) {
    const f = G.foot || G.player; let n = 0;
    for (const q of G.peds) {
      if (n >= 16) break;
      if (!((q.chat && q.speak) || q.talk) || Math.abs(q.x - f.x) > 700 || Math.abs(q.y - f.y) > 700) continue;
      let b = BUB[n]; if (!b) { b = new THREE.Sprite(bubMat); b.scale.set(.9, .68, 1); scene.add(b); BUB[n] = b; }
      b.visible = true; b.position.set(q.x * S, 2.25 + Math.sin(G.t * 3 + q.id) * .04, q.y * S); n++;
    }
    for (let k = n; k < BUB.length; k++) BUB[k].visible = false;
  }
  function updatePeds(G, camX, camZ, dt) {
    let list = G.peds.filter(q => Math.abs(q.x * S - camX) < 140 && Math.abs(q.y * S - camZ) < 140).slice(0, PEDMAX - 1);
    if (G.foot && G.foot.inBus) { for (const [q, h] of HUM.byPed) if (q.player) { h.ped = null; scene.remove(h.obj); HUM.byPed.delete(q); } }
    else if (G.foot) list.push(Object.assign(G.foot, { player: true, state: G.foot.sit ? "sit" : Math.abs(G.foot.v) > 4 ? "walk" : "idle", look: 0, v: G.foot.v }));
    else for (const [q, h] of HUM.byPed) if (q.player) { h.ped = null; scene.remove(h.obj); HUM.byPed.delete(q); }
    const real = updateHumans(list, camX, camZ, dt || 1 / 60);
    if (real.size) list = list.filter(q => !real.has(q));
    let n = 0;
    const put = (im, idx, local, color) => { mB.multiplyMatrices(mP, local); im.setMatrixAt(idx, mB); if (color) im.setColorAt(idx, color); };
    list.forEach(q => {
      const L = pedLook(q), sc = L.h;
      const walking = q.state === "walk" && Math.abs(q.v) > 2, ph = q.player ? q.t * 6.2 : q.t * (q.v / 6.5);
      let sw = walking ? Math.sin(ph) * (q.player && Math.abs(q.v) > 50 ? .85 : .5) : 0, crouch = 1, arms = 0, lean = 0;
      if (q.state === "dodge") { sw = .9; arms = 1.2; lean = .35; }
      if (q.state === "cower") { crouch = .78; arms = 2.4; }
      if (q.state === "idle" && q.staff) arms = Math.sin(q.t * .8) * .1;
      const sit = q.state === "sit"; if (sit) { sw = 0; arms = .55; }
      mP.makeRotationY(-q.a).setPosition(q.x * S, .02 - (sit ? .44 : 0) + (q.state === "dodge" ? Math.sin((.55 - q.st) / .55 * Math.PI) * .35 : 0), q.y * S);
      mA.makeScale(sc, sc * crouch, sc); mP.multiply(mA);
      if (lean) { mA.makeRotationZ(-lean); mP.multiply(mA); }
      // jambes : cuisse + mollet (genou qui plie à la marche) + chaussure qui reste à plat
      [-1, 1].forEach((k, j) => {
        const th = sit ? 1.5 : sw * k * .7, fw = Math.max(0, Math.cos(ph + (k > 0 ? 0 : Math.PI)));
        const knee = sit ? -1.45 : q.state === "cower" ? -1.1 : walking ? -(.12 + .75 * fw * Math.min(1, Math.abs(sw) * 2 + .3)) : q.state === "dodge" ? -.6 : -.04;
        const legC = L.woman && !q.player ? L.fb.skin : L.fb.low;
        mA.makeTranslation(0, .9, k * .1); mA.multiply(mB.makeRotationZ(th)); const hip = mA.clone();
        mA.multiply(mB.makeTranslation(0, -.23, 0)); put(PART.thigh, n * 2 + j, mA.clone(), legC);
        hip.multiply(mB.makeTranslation(0, -.45, 0)); hip.multiply(mB.makeRotationZ(knee)); const kn = hip.clone();
        hip.multiply(mB.makeTranslation(0, -.22, 0)); put(PART.calf, n * 2 + j, hip, L.woman && !q.player ? L.fb.skin : legC);
        kn.multiply(mB.makeTranslation(0, -.43, 0)); kn.multiply(mB.makeRotationZ(-th - knee)); kn.multiply(mB.makeTranslation(.05, 0, 0)); put(PART.shoe, n * 2 + j, kn, L.fb.shoe);
      });
      mA.makeTranslation(0, 1.22, 0); put(PART.torso, n, mA.clone(), L.fb.top);
      if (L.biz) { mA.makeTranslation(.128, 1.4, 0); put(PART.collar, n, mA.clone()); mA.makeTranslation(.142, 1.3, 0); mA.multiply(mB.makeRotationZ(-.08)); put(PART.tie, n, mA.clone(), L.woman ? null : L.fb.tie); if (L.woman) PART.tie.setMatrixAt(n, HIDE); }
      else { PART.collar.setMatrixAt(n, HIDE); PART.tie.setMatrixAt(n, HIDE); }
      PART.bag.setMatrixAt(n, HIDE);
      if (L.woman) { mA.makeTranslation(0, .78, 0); put(PART.skirt, n, mA.clone(), L.fb.low); } else PART.skirt.setMatrixAt(n, HIDE);
      mA.makeTranslation(.02, 1.66, 0); put(PART.head, n, mA.clone(), L.fb.skin);
      mA.makeTranslation(.128, 1.645, 0); mA.multiply(mB.makeScale(.9, 1.1, .85)); put(PART.nose, n, mA.clone(), L.fb.skin);
      [-1, 1].forEach((k, j) => { mA.makeTranslation(.103, 1.685, k * .038); put(PART.eye, n * 2 + j, mA.clone()); mA.makeTranslation(.117, 1.685, k * .038); put(PART.pupil, n * 2 + j, mA.clone()); });
      if (L.fb.wrap) { mA.makeTranslation(-.01, 1.76, 0); mA.multiply(mB.makeScale(1, .75, 1)); put(PART.wrap, n, mA.clone(), L.fb.wrap); PART.hair.setMatrixAt(n, HIDE); }
      else { PART.wrap.setMatrixAt(n, HIDE); mA.makeTranslation(.0, 1.69, 0); put(PART.hair, n, mA.clone()); }
      [-1, 1].forEach((k, j) => { mA.makeTranslation(0, 1.48, k * .27); mA.multiply(mB.makeRotationZ(-sw * k * .6 + (arms ? arms : 0))); if (arms) mA.multiply(mB.makeRotationX(k * .3)); mA.multiply(mB.makeTranslation(0, -.3, 0)); put(PART.arm, n * 2 + j, mA.clone(), L.sleeve ? L.fb.top : L.fb.skin); mA.multiply(mB.makeTranslation(0, -.34, 0)); put(PART.hand, n * 2 + j, mA.clone(), L.fb.skin); if (L.bag && k > 0) { mA.multiply(mB.makeTranslation(0, -.15, .03)); put(PART.bag, n, mA.clone(), BAGC); } });
      n++;
    });
    PART.torso.count = PART.head.count = PART.nose.count = PART.skirt.count = PART.wrap.count = PART.hair.count = PART.collar.count = PART.tie.count = PART.bag.count = n;
    PART.thigh.count = PART.calf.count = PART.arm.count = PART.hand.count = PART.shoe.count = PART.eye.count = PART.pupil.count = n * 2;
    for (const k in PART) { PART[k].instanceMatrix.needsUpdate = true; if (PART[k].instanceColor) PART[k].instanceColor.needsUpdate = true; }
  }

  // ------------------------------------------------------------ Le fleuve Congo : tracé réel + grand plan d'eau au nord
  const waterMat = new THREE.MeshStandardMaterial({ color: "#5d6f72", roughness: .18, metalness: .55, side: THREE.DoubleSide });
  MAP.water.forEach(rings => {
    const toV = r => r.map(([x, y]) => new THREE.Vector2(x * S, y * S));
    const sh = new THREE.Shape(toV(rings[0])); rings.slice(1).forEach(r => sh.holes.push(new THREE.Path(toV(r))));
    const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, waterMat); m.position.y = .01; scene.add(m);
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WS + 3000, 1500, 120, 30), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(WS / 2, -.1, -750); scene.add(water);
  const wpos = water.geometry.attributes.position, wbase = Float32Array.from(wpos.array);
  {
    // rive d'en face (Brazzaville, au loin) : collines et silhouette de ville
    for (let k = 0; k < 30; k++) { const h = new THREE.Mesh(new THREE.SphereGeometry(40 + rnd() * 50, 8, 6), new THREE.MeshStandardMaterial({ color: "#3d5a3a", roughness: 1 })); h.scale.y = .35; h.position.set(-500 + k * (WS + 1000) / 30 + rnd() * 30, -6, -1450 - rnd() * 60); scene.add(h); }
    for (let k = 0; k < 30; k++) { const t = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: "#6d6a78" })); const h = 15 + rnd() * 45; t.scale.set(10 + rnd() * 10, h, 10); t.position.set(WS * .25 + k * 40 + rnd() * 10, 0, -1400 - rnd() * 30); scene.add(t); }
    // collines au sud et sur les côtés
    for (let k = 0; k < 44; k++) { const h = new THREE.Mesh(new THREE.SphereGeometry(60 + rnd() * 60, 8, 6), new THREE.MeshStandardMaterial({ color: k % 3 ? "#4a5e36" : "#7a4a2e", roughness: 1 })); h.scale.y = .3; const a = rnd() * Math.PI + Math.PI * .05; h.position.set(WS / 2 + Math.cos(a) * (WS * .62 + 200 + rnd() * 160), -8, HS / 2 + Math.sin(a) * (HS * .62 + 200 + rnd() * 160)); scene.add(h); }
  }
  const pirogues = [];
  for (let k = 0; k < 22; k++) {
    let x = 0, y = 0; for (let t = 0; t < 40; t++) { x = rnd() * W; y = rnd() * H * .35; if (groundAt(x, y) === 3) break; x = rnd() * W; y = -300 - rnd() * 3000; break; }
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, .6, 1.2), new THREE.MeshStandardMaterial({ color: "#4a2e1c" })); g.add(hull);
    const man = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, 1.5, 6), new THREE.MeshStandardMaterial({ color: pick(["#d62828", "#2a9d8f", "#fcbf49"]) })); man.position.set(2, 1, 0); g.add(man);
    g.position.set(x * S, .1, y * S); g.userData.v = (rnd() < .5 ? -1 : 1) * (1 + rnd() * 2); g.rotation.y = g.userData.v > 0 ? 0 : Math.PI;
    scene.add(g); pirogues.push(g);
  }

  // ------------------------------------------------------------ Véhicules
  const mats = {};
  const mat = (c, o) => mats[c + JSON.stringify(o || {})] || (mats[c + JSON.stringify(o || {})] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .45, metalness: .35 }, o || {})));
  const glass = new THREE.MeshStandardMaterial({ color: "#0f1622", roughness: .1, metalness: .8 });
  const wheelGeo = new THREE.CylinderGeometry(.36, .36, .28, 12); wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: "#111", roughness: .9 });
  const headMat = new THREE.MeshBasicMaterial({ color: "#fff6dc" }), tailMat = new THREE.MeshBasicMaterial({ color: "#ff2a1a" });
  function addBox(g, w, h, d, x, y, z, m, shadow) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = !!shadow; g.add(o); return o; }
  function wheels(g, L, Wd) { [[L * .32, Wd / 2], [L * .32, -Wd / 2], [-L * .32, Wd / 2], [-L * .32, -Wd / 2]].forEach(([x, z]) => { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, .36, z); g.add(w); }); }
  function makeCarModel(kind, color, opts) {
    const g = new THREE.Group(); opts = opts || {};
    if (kind === "bus") {
      const L = 5.6, Wd = 2.1;
      addBox(g, L, 1.9, Wd, 0, 1.35, 0, mat("#f2c230"), true);
      addBox(g, L + .02, .55, Wd + .02, 0, 1.75, 0, glass);
      addBox(g, L + .03, .25, Wd + .03, 0, .75, 0, mat("#1d4fa0"));
      addBox(g, .1, .2, .5, L / 2, .7, .6, headMat); addBox(g, .1, .2, .5, L / 2, .7, -.6, headMat);
      addBox(g, .1, .2, .4, -L / 2, .7, .7, tailMat); addBox(g, .1, .2, .4, -L / 2, .7, -.7, tailMat);
      wheels(g, L, Wd); return g;
    }
    const L = 4.5, Wd = 1.95, low = opts.low ? .85 : 1;
    addBox(g, L, .62 * low, Wd, 0, .62, 0, mat(color), true);
    addBox(g, L * .5, .5 * low, Wd * .86, -.25, .62 + .55 * low, 0, glass, true);
    addBox(g, L * .5 + .02, .08, Wd * .86 + .02, -.25, .62 + .82 * low, 0, mat(color));
    addBox(g, .08, .14, .5, L / 2, .72, .62, headMat); addBox(g, .08, .14, .5, L / 2, .72, -.62, headMat);
    addBox(g, .08, .12, .6, -L / 2, .76, .6, tailMat); addBox(g, .08, .12, .6, -L / 2, .76, -.6, tailMat);
    if (opts.spoiler) { addBox(g, .3, .06, Wd, -L / 2 + .15, 1.25, 0, mat("#111")); addBox(g, .1, .3, .1, -L / 2 + .2, 1.05, .7, mat("#111")); addBox(g, .1, .3, .1, -L / 2 + .2, 1.05, -.7, mat("#111")); }
    if (opts.taxi) addBox(g, L + .02, .16, Wd + .02, 0, .55, 0, mat("#1d4fa0"));
    if (kind === "police") {
      addBox(g, L + .02, .2, Wd + .02, 0, .62, 0, mat("#1f3f8f"));
      const bar = new THREE.Group(); bar.position.set(-.2, .62 + 1.0 * low, 0); g.add(bar);
      const r = addBox(bar, .3, .14, .7, 0, 0, .38, new THREE.MeshBasicMaterial({ color: "#ff2d4a" }));
      const b = addBox(bar, .3, .14, .7, 0, 0, -.38, new THREE.MeshBasicMaterial({ color: "#2d7bff" }));
      g.userData.bar = { r, b };
    }
    wheels(g, L, Wd);
    return g;
  }
  const doorMat = new THREE.MeshPhysicalMaterial({ color: "#20303f", metalness: .6, roughness: .15, transparent: true, opacity: .85 });
  const doorFrameMat = new THREE.MeshStandardMaterial({ color: "#070a0e", roughness: .9 });
  function addBusDoor(m, c) { // porte double : deux battants qui coulissent quand le bus s'arrête
    const L = c.hl ? c.hl * 2 * S : 7.2, Wd = 2.3, dx = L / 2 * .55, z = Wd / 2 + .03;
    const hole = addBox(m, 1.2, 2.1, .02, dx, 1.4, z, doorFrameMat);
    const a = addBox(m, .58, 2.0, .04, dx - .3, 1.4, z + .02, doorMat), b = addBox(m, .58, 2.0, .04, dx + .3, 1.4, z + .02, doorMat);
    m.userData.door = { a, b, dx, z, hole };
  }
  function animDoor(c, m) {
    const D = m.userData.door; if (!D) return; const o = Math.max(0, Math.min(1, c.door || 0));
    D.a.position.set(D.dx - .3 - o * .55, 1.4, D.z + .02 + o * .12); D.b.position.set(D.dx + .3 + o * .55, 1.4, D.z + .02 + o * .12);
  }
  const TRAFFIC_COLS = ["#5b6476", "#9aa0ad", "#3f6e8c", "#8c6a3f", "#6b3f3f", "#4f7a59", "#d9d9d9"];
  const models = new Map();
  let playerModel = null, playerDef = null;
  // niveau de détail : modèles Blender détaillés près de la caméra, modèles légers au loin
  const LOD_NEAR = MOBILE ? 45 : 70;
  function modelFor(c) {
    let m = models.get(c);
    const C3 = window.ZBOSS_CARS3D;
    const d = Math.hypot(c.x * S - camPos.x, c.y * S - camPos.z), mine = c.kind === "player";
    if (m && C3) {
      const wantHi = mine || (m.userData.hi ? d < LOD_NEAR + 15 : d < LOD_NEAR);
      if ((m.userData.ver !== undefined && m.userData.hi && m.userData.ver !== C3.version) || (m.userData.hi !== undefined && m.userData.hi !== wantHi)) { scene.remove(m); models.delete(c); m = null; }
    }
    if (!m) {
      if (C3) {
        const hi = mine || d < LOD_NEAR, o = { lod: hi ? "high" : "low", shadow: hi && (mine || !MOBILE) };
        if (mine) m = C3.build(c.carDef.id, Object.assign(o, { color: c.carDef.color }));
        else if (c.kind === "cop" || c.kind === "block") m = C3.build("police", o);
        else if (c.bus) m = C3.bus();
        else if (c.taxi) m = C3.build("taxi", o);
        else m = C3.build(["sedan", "suv", "hatch"][c.tIdx % 3], Object.assign(o, { color: TRAFFIC_COLS[c.tIdx % TRAFFIC_COLS.length] }));
        if (!c.bus) m.userData.hi = hi;
      }
      else if (c.kind === "player") m = makeCarModel("car", c.carDef.color, { low: true, spoiler: ["kasai", "gombe", "kivu"].includes(c.carDef.id) });
      else if (c.kind === "cop" || c.kind === "block") m = makeCarModel("police", "#f2f4f8");
      else if (c.bus) m = makeCarModel("bus");
      else m = makeCarModel("car", c.taxi ? "#f2c230" : TRAFFIC_COLS[c.tIdx % TRAFFIC_COLS.length], { taxi: c.taxi });
      if (c.bus) addBusDoor(m, c);
      scene.add(m); models.set(c, m);
    }
    m.userData.seen = frame;
    return m;
  }
  // phares du joueur et gyrophare partagé
  const headLight = new THREE.SpotLight("#fff1d0", MOBILE ? 0 : 2.2, 70, .45, .5, 1.2); scene.add(headLight, headLight.target);
  const sirenLight = new THREE.PointLight("#ff2d4a", 0, 30, 2); scene.add(sirenLight);
  // herses
  const spikeMat = new THREE.MeshStandardMaterial({ color: "#c9ccd6", metalness: .8, roughness: .3 });
  const spikeModels = new Map();
  // hélicoptère
  const heli = new THREE.Group();
  { addBox(heli, 4, 1.6, 1.8, 0, 0, 0, mat("#1d2230"), true); addBox(heli, 4, .4, .4, -3.6, .3, 0, mat("#1d2230")); heli.userData.rotor = addBox(heli, 11, .05, .3, 0, 1.1, 0, mat("#888")); heli.userData.rotor2 = addBox(heli, .3, .05, 11, 0, 1.1, 0, mat("#888"));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 30, 24, 1, true), new THREE.MeshBasicMaterial({ color: "#dfeaff", transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = -15; heli.add(cone); heli.visible = false; scene.add(heli); }
  const heliSpot = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: "#eaf2ff", transparent: true, opacity: .28, depthWrite: false }));
  heliSpot.rotation.x = -Math.PI / 2; heliSpot.visible = false; scene.add(heliSpot);
  // particules (étincelles, fumée, nitro)
  const PMAX = 400, pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .5, vertexColors: true, transparent: true, opacity: .9, depthWrite: false })); points.frustumCulled = false; scene.add(points);

  // ------------------------------------------------------------ Caméras
  const CAMS = ["chase", "heli", "tv"], CAM_NAMES = { chase: "poursuite", heli: "hélico", tv: "télé" };
  let camMode = "chase"; try { const s = localStorage.getItem("zboss_cam3d"); if (CAMS.includes(s)) camMode = s; } catch (e) { }
  const camPos = new THREE.Vector3(MAP.start.x * S, 30, MAP.start.y * S), camLook = new THREE.Vector3(MAP.start.x * S, 0, MAP.start.y * S);
  let camYaw = 0, tvSpot = null, frame = 0, lastGame = 0, idleT = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function clearPath(x0, z0, x1, z1) { // la caméra ne traverse pas les immeubles (coordonnées en mètres)
    for (let t = .15; t <= 1.001; t += .15) if (solidAt((x0 + (x1 - x0) * t) / S, (z0 + (z1 - z0) * t) / S)) return t - .15;
    return 1;
  }
  function chooseTv(p) {
    const sp = Math.hypot(p.vx, p.vy) || 1, fx = p.vx / sp, fy = p.vy / sp;
    const ahead = { x: p.x + fx * 650, y: p.y + fy * 650 };
    const q = nodes[nearestNode(ahead.x, ahead.y)], o = nodes[q.nb[0]] || { x: q.x + 1, y: q.y };
    const ra = Math.atan2(o.y - q.y, o.x - q.x), side = Math.random() < .5 ? 1 : -1, off = q.w / 2 + 30;
    return new THREE.Vector3((q.x - Math.sin(ra) * off * side) * S, 2.2 + Math.random() * 3, (q.y + Math.cos(ra) * off * side) * S);
  }
  function footClear(x0, z0, x1, z1) { // caméra à pied : ne traverse ni les murs du showroom ni les immeubles
    const wb = WORLD.walkBlocked || solidAt;
    for (let t = .1; t <= 1.001; t += .1) if (wb((x0 + (x1 - x0) * t) / S, (z0 + (z1 - z0) * t) / S)) return Math.max(0, t - .1);
    return 1;
  }
  let sitOrbit = 0;
  function updateCamera(G, dt) {
    if (G.foot && G.foot.inBus) {
      const c = G.foot.inBus, bx = c.x * S, bz = c.y * S;
      camYaw += angDiff(camYaw, c.a) * Math.min(1, dt * 2.5);
      const cx = Math.cos(camYaw), cz = Math.sin(camYaw), t = clearPath(bx, bz, bx - cx * 13, bz - cz * 13), dd = Math.max(5, 13 * t);
      tmp.set(bx - cx * dd + -cz * 2.5, 6.5, bz - cz * dd + cx * 2.5); camPos.lerp(tmp, Math.min(1, dt * 3));
      tmp2.set(bx + cx * 10, 1.6, bz + cz * 10); camLook.lerp(tmp2, Math.min(1, dt * 4));
      camera.fov += (64 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
      camera.position.copy(camPos); camera.lookAt(camLook);
      return;
    }
    if (G.foot) {
      const f = G.foot, fx_ = f.x * S, fz_ = f.y * S;
      if (f.sit) { // assis : la caméra tourne lentement autour, comme un regard sur le quartier
        sitOrbit += dt * .12;
        const a = f.a + Math.PI * .8 + Math.sin(sitOrbit) * 1.1, dist = 4.6;
        const t = footClear(fx_, fz_, fx_ + Math.cos(a) * dist, fz_ + Math.sin(a) * dist), dd = Math.max(.8, dist * t);
        tmp.set(fx_ + Math.cos(a) * dd, 1.9, fz_ + Math.sin(a) * dd); camPos.lerp(tmp, Math.min(1, dt * 2));
        tmp2.set(fx_ + Math.cos(f.a) * 6, 1.1, fz_ + Math.sin(f.a) * 6); camLook.lerp(tmp2, Math.min(1, dt * 3));
        camera.fov += (62 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
        camera.position.copy(camPos); camera.lookAt(camLook); camYaw = f.a;
        return;
      }
      sitOrbit = 0;
      camYaw += angDiff(camYaw, f.a) * Math.min(1, dt * 4);
      const cx = Math.cos(camYaw), cz = Math.sin(camYaw), dist = 3.4;
      const t = footClear(fx_, fz_, fx_ - cx * dist, fz_ - cz * dist), dd = Math.max(.6, dist * t);
      tmp.set(fx_ - cx * dd, 2.05, fz_ - cz * dd); camPos.lerp(tmp, Math.min(1, dt * 8));
      tmp2.set(fx_ + cx * 3, 1.45, fz_ + cz * 3); camLook.lerp(tmp2, Math.min(1, dt * 10));
      camera.fov += (58 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
      camera.position.copy(camPos); camera.lookAt(camLook);
      return;
    }
    const p = G.player, px = p.x * S, pz = p.y * S, sp = Math.hypot(p.vx, p.vy), ratio = Math.min(1.2, sp / p.maxSpeed);
    camYaw += angDiff(camYaw, Math.atan2(p.vy, p.vx) * (sp > 60 ? 1 : 0) + (sp > 60 ? 0 : p.a)) * Math.min(1, dt * 3.2);
    const fx = Math.cos(camYaw), fz = Math.sin(camYaw);
    let fov = 62;
    if (camMode === "chase") {
      const dist = 4.7 + ratio * 1.5, h = 1.7 + ratio * .35; // caméra proche, derrière le pare-chocs
      let tx = px - fx * dist, tz = pz - fz * dist;
      const t = clearPath(px, pz, tx, tz); tx = px + (tx - px) * Math.max(.35, t); tz = pz + (tz - pz) * Math.max(.35, t);
      tmp.set(tx, h + (t < 1 ? 1.5 : 0), tz);
      camPos.lerp(tmp, Math.min(1, dt * 9));
      tmp2.set(px + fx * 5, .95, pz + fz * 5); camLook.lerp(tmp2, Math.min(1, dt * 12));
      fov = 60 + ratio * 16 + (p.inp.nitro ? 8 : 0);
    } else if (camMode === "heli") {
      tmp.set(px - fx * 20, 72, pz - fz * 20); camPos.lerp(tmp, Math.min(1, dt * 2.5));
      tmp2.set(px + fx * 12, 0, pz + fz * 12); camLook.lerp(tmp2, Math.min(1, dt * 5)); fov = 48;
    } else {
      if (!tvSpot || tvSpot.distanceTo(tmp.set(px, tvSpot.y, pz)) > 95 || clearPath(tvSpot.x, tvSpot.z, px, pz) < 1) tvSpot = chooseTv(p);
      camPos.copy(tvSpot); camLook.lerp(tmp2.set(px, .9, pz), Math.min(1, dt * 10));
      fov = Math.max(18, Math.min(60, 900 / Math.max(10, camPos.distanceTo(camLook))));
    }
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
    const shake = G.shake * .02; camera.position.set(camPos.x + (Math.random() - .5) * shake, camPos.y + (Math.random() - .5) * shake, camPos.z);
    camera.lookAt(camLook);
  }

  // ------------------------------------------------------------ Boucle de rendu
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize); resize();

  function placeCar(c, m, t) {
    m.position.set(c.x * S, 0, c.y * S);
    m.rotation.set(0, -c.a, 0);
    if (c.kind === "player") { m.rotation.x = -(c.inp.steer || 0) * Math.min(1, Math.hypot(c.vx, c.vy) / 500) * .05; }
    if (!c.alive) m.rotation.z = .25;
    const wl = m.userData.wheels;
    if (wl && wl.length) { // roues qui tournent, braquage des roues avant
      const v = (c.vx * Math.cos(c.a) + c.vy * Math.sin(c.a)) * S, st = (c.inp && c.inp.steer || 0) * .42;
      wl.forEach(w => { w.userData.spin = ((w.userData.spin || 0) - v * (t - (m.userData.lt || t)) / .37) % (Math.PI * 2); w.rotation.set(0, w.userData.front ? -st : 0, w.userData.spin); });
      m.userData.lt = t;
    }
    const bar = m.userData.bar;
    if (bar) { const on = (c.mode === "chase" || c.kind === "block") && c.alive, ph = Math.floor((t + (c.flash || 0)) * 6) % 2; bar.r.material.color.set(on && ph ? "#ff2d4a" : "#40141c"); bar.b.material.color.set(on && !ph ? "#2d7bff" : "#101c40"); bar.r.material = bar.r.material; }
  }
  let stopsBuilt = false;
  function buildStops() {
    if (stopsBuilt || !WORLD.busNet) return; stopsBuilt = true;
    let N; try { N = WORLD.busNet(); } catch (e) { return; }
    if (!N || !N.stops) return;
    const roofM = new THREE.MeshStandardMaterial({ color: "#1d4fa0", roughness: .6 }), postM = new THREE.MeshStandardMaterial({ color: "#c9ccd6", metalness: .6, roughness: .4 });
    const glassM = new THREE.MeshPhysicalMaterial({ color: "#a8c8e8", transparent: true, opacity: .35, roughness: .05 }), benchM = mat("#6b4a2b");
    N.stops.forEach(st => {
      const g = new THREE.Group(); let bx = st.sx - st.x, by = st.sy - st.y; const l = Math.hypot(bx, by) || 1; bx /= l; by /= l;
      g.position.set(st.sx * S, 0, st.sy * S); g.rotation.y = Math.atan2(bx, by);
      addBox(g, 3.2, .1, 1.5, 0, 2.45, .1, roofM, true);
      addBox(g, 3.1, 1.9, .04, 0, 1.35, .75, glassM);
      [-1.5, 1.5].forEach(x => addBox(g, .08, 2.4, .08, x, 1.2, .72, postM));
      addBox(g, 2.4, .08, .4, 0, .5, .45, benchM); addBox(g, 2.4, .5, .06, 0, .5, .65, benchM);
      const pole = addBox(g, .08, 2.6, .08, 2.1, 1.3, -.1, postM);
      const tex = canvasTex(256, 160, (x, w, h) => { x.fillStyle = "#1d4fa0"; x.fillRect(0, 0, w, h); x.fillStyle = "#f2c230"; x.fillRect(0, 0, w, 52);
        x.fillStyle = "#0b1018"; x.font = "bold 40px sans-serif"; x.textAlign = "center"; x.fillText("BUS · Ligne 1", w / 2, 40);
        x.fillStyle = "#fff"; x.font = "bold 22px sans-serif"; const nm = (st.place && st.place.nom || "").slice(0, 20); x.fillText("Arrêt", w / 2, 88); x.fillText(nm, w / 2, 120); });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(.9, .56), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      sign.position.set(2.1, 2.55, -.1); sign.rotation.y = Math.PI / 2; g.add(sign);
      scene.add(g);
    });
  }
  let animT = 0;
  function animateWorld(dt) {
    animT += dt;
    for (let i = 0; i < wpos.count; i++) { const x = wbase[i * 3], y = wbase[i * 3 + 1]; wpos.setZ(i, Math.sin(x * .05 + animT * 1.3) * .25 + Math.cos(y * .07 + animT) * .2); }
    wpos.needsUpdate = true;
    pirogues.forEach(g => { const nx = g.position.x + g.userData.v * dt, gz = g.position.z / S; if ((gz >= 0 && groundAt(nx / S, gz) !== 3) || nx < -50 || nx > WS + 50) { g.userData.v *= -1; g.rotation.y = g.userData.v > 0 ? 0 : Math.PI; } else g.position.x = nx; g.position.y = .1 + Math.sin(animT * 2 + g.position.x) * .1; });
  }

  function render(G, dt) {
    lastGame = performance.now(); frame++;
    animateWorld(dt);
    const p = G.player;
    const fc = G.foot || p;
    const all = [p, ...G.cops, ...G.traffic, ...(G.buses || [])];
    for (const c of all) { if (c !== p && (Math.abs(c.x - fc.x) > 2200 || Math.abs(c.y - fc.y) > 2200)) continue; const m = modelFor(c); placeCar(c, m, G.t); if (c.bus) animDoor(c, m); }
    buildStops();
    if (G.parked) for (const c of G.parked) { if (Math.abs(c.x - fc.x) > 1100 || Math.abs(c.y - fc.y) > 1100) continue; placeCar(c, modelFor(c), G.t); }
    for (const [c, m] of models) if (m.userData.seen !== frame) { scene.remove(m); models.delete(c); }
    // herses
    G.blocks.forEach(s => { let m = spikeModels.get(s); if (!m) { m = new THREE.Mesh(new THREE.BoxGeometry(.8, .15, 15), spikeMat); scene.add(m); spikeModels.set(s, m); } m.position.set(s.x * S, .12, s.y * S); m.rotation.y = -s.a; m.userData.seen = frame; });
    for (const [s, m] of spikeModels) if (m.userData.seen !== frame) { scene.remove(m); spikeModels.delete(s); }
    // hélicoptère
    heli.visible = heliSpot.visible = !!G.heli;
    if (G.heli) { heli.position.set(G.heli.x * S, 30, G.heli.y * S); heli.rotation.y = -Math.atan2(p.y - G.heli.y, p.x - G.heli.x); heli.userData.rotor.rotation.y += dt * 30; heli.userData.rotor2.rotation.y += dt * 30; heliSpot.position.set(G.heli.x * S, .05, G.heli.y * S); }
    // phares et gyrophare
    const fx = Math.cos(p.a), fz = Math.sin(p.a);
    headLight.position.set(p.x * S + fx * 2, 1, p.y * S + fz * 2); headLight.target.position.set(p.x * S + fx * 25, 0, p.y * S + fz * 25);
    let nearCop = null, nd = 1e9; G.cops.forEach(c => { if (c.alive && (c.mode === "chase" || c.kind === "block")) { const d = Math.hypot(c.x - p.x, c.y - p.y); if (d < nd) { nd = d; nearCop = c; } } });
    if (nearCop && nd < 900) { sirenLight.position.set(nearCop.x * S, 2.5, nearCop.y * S); const ph = Math.floor((G.t + nearCop.flash) * 6) % 2; sirenLight.color.set(ph ? "#ff2d4a" : "#2d7bff"); sirenLight.intensity = 3; } else sirenLight.intensity = 0;
    // soleil et ombres qui suivent le joueur
    sunLight.position.set(p.x * S - 120, 140, p.y * S - 80); sunLight.target.position.set(p.x * S, 0, p.y * S);
    if (G.hour !== undefined) setDay(G.hour, fc.x * S, fc.z !== undefined ? fc.z : fc.y * S);
    // particules
    let n = 0;
    for (const q of G.parts) { if (n >= PMAX) break; const a = q.life / q.max; pPos[n * 3] = q.x * S; pPos[n * 3 + 1] = q.kind === "smoke" ? .6 + (1 - a) * 2 : q.kind === "fire" ? 1 + (1 - a) * 2 : .5; pPos[n * 3 + 2] = q.y * S;
      const col = q.kind === "spark" ? [1, .75, .3] : q.kind === "flame" ? [.35, .8, 1] : q.kind === "fire" ? [1, .5, .15] : [.55 * a, .55 * a, .6 * a]; pCol.set(col, n * 3); n++; }
    pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    updateCamera(G, dt);
    updatePeds(G, camera.position.x, camera.position.z, dt);
    updateBubbles(G);
    updateLights(G);
    updateShops(G);
    updatePlaces(G);
    skyG.position.copy(camera.position); renderer.render(scene, camera);
  }

  // Vue d'attente derrière le menu : survol lent de la ville
  function idle(now) {
    requestAnimationFrame(idle);
    if (performance.now() - lastGame < 250) return;
    const dt = 1 / 60; idleT += dt; animateWorld(dt);
    const cx = MAP.start.x * S, cz = MAP.start.y * S, a = idleT * .05;
    camera.fov = 55; camera.updateProjectionMatrix();
    camera.position.set(cx + Math.cos(a) * 260, 80, cz + Math.sin(a) * 260); camera.lookAt(cx, 10, cz);
    sunLight.position.set(cx - 120, 140, cz - 80); sunLight.target.position.set(cx, 0, cz);
    skyG.position.copy(camera.position); renderer.render(scene, camera);
  }
  requestAnimationFrame(idle);

  window.ZBOSS_3D = {
    ok: true, render, hum: () => ({ ready: HUM.ready, n: HUM.byPed.size }),
    camLabel: () => CAM_NAMES[camMode],
    cycleCam() { camMode = CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]; tvSpot = null; try { localStorage.setItem("zboss_cam3d", camMode); } catch (e) { } },
  };
  if (window.ZBOSS_CAMLABEL) window.ZBOSS_CAMLABEL();
})();
