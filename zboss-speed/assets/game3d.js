// Zboss-speed — rendu 3D (three.js) : une ville inspirée de Kinshasa au coucher du soleil,
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

  const { R, B, P, N, W, blocks, inter, solidAt, angDiff } = WORLD;
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

  const scene = new THREE.Scene();
  const FOG = new THREE.Color("#c98a6e");
  scene.fog = new THREE.FogExp2(FOG, 0.0042);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2400);

  // ------------------------------------------------------------ Ciel et lumière (fin d'après-midi)
  {
    const g = new THREE.SphereGeometry(1500, 32, 16), cols = [], pos = g.attributes.position;
    const top = new THREE.Color("#22305e"), mid = new THREE.Color("#c86a5a"), hor = new THREE.Color("#ffb070");
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 1500; const c = new THREE.Color();
      if (y > .25) c.copy(mid).lerp(top, Math.min(1, (y - .25) / .6)); else c.copy(hor).lerp(mid, Math.max(0, (y + .05) / .3));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    const sun = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: "#ffd9a0", fog: false }));
    sun.position.set(-1100, 120, -700); sun.lookAt(0, 0, 0); scene.add(sun);
  }
  scene.add(new THREE.HemisphereLight("#ffd0b0", "#5a3a2a", 0.75));
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
  const boardTex = text => canvasTex(512, 160, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#1a1020"); g.addColorStop(1, "#3a1410"); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = "#ff5a1f"; c.fillRect(0, h - 14, w, 14);
    c.font = "bold 58px 'Chakra Petch', Impact, sans-serif"; c.fillStyle = "#fff"; c.textAlign = "center"; c.fillText(text[0], w / 2, 78);
    c.font = "600 30px Inter, Arial, sans-serif"; c.fillStyle = "#ffb21f"; c.fillText(text[1], w / 2, 124);
  });

  // ------------------------------------------------------------ Sol, routes, carrefours
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: earthTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(W * S / 2, -0.05, W * S / 2 + 400); ground.receiveShadow = true; scene.add(ground);

  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: .85 });
  for (let k = 0; k <= N; k++) {
    const len = W * S, wid = R * S;
    for (const horiz of [false, true]) {
      const tex = roadTex.clone(); tex.needsUpdate = true; tex.repeat.set(1, len / 22);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wid, len), roadMat.clone()); m.material.map = tex;
      m.rotation.x = -Math.PI / 2; if (horiz) m.rotation.z = Math.PI / 2;
      const c = (k * P + R / 2) * S;
      if (horiz) m.position.set(len / 2, 0.01, c); else m.position.set(c, 0.012, len / 2);
      m.receiveShadow = true; scene.add(m);
    }
  }
  {
    const g = new THREE.PlaneGeometry(R * S, R * S); g.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ map: crossTex, roughness: .85 }), (N + 1) * (N + 1));
    const m4 = new THREE.Matrix4(); let n = 0;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const q = inter(i, j); m4.makeTranslation(q.x * S, 0.02, q.y * S); im.setMatrixAt(n++, m4); }
    im.receiveShadow = true; scene.add(im);
  }

  // ------------------------------------------------------------ Quartiers
  const PAINT = ["#e9c46a", "#f4a261", "#e76f51", "#2a9d8f", "#8ab17d", "#e5989b", "#ffd166", "#06d6a0", "#73a5c6", "#f1faee", "#cdb4db", "#d4a373"];
  const ROOF = ["#7c4a32", "#8a8580", "#6b3e2a", "#9a6a4a", "#5d5a55"];
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
  const houses = [], towers = [], roofs = [], lots = [], stalls = [], palms = [], boards = [];
  const center = N / 2 - .5;
  blocks.forEach(b => {
    const bx = b.x * S, bz = b.y * S, bs = B * S;
    lots.push({ x: bx + bs / 2, z: bz + bs / 2, s: bs });
    const dc = Math.hypot(b.i - center, b.j - center);
    if (b.park) {
      // place de marché sur terre rouge
      for (let k = 0; k < 14; k++) {
        const side = k % 4, t = 3 + rnd() * (bs - 6);
        const x = side === 0 ? bx + t : side === 1 ? bx + bs - 3 : side === 2 ? bx + t : bx + 3;
        const z = side === 0 ? bz + 3 : side === 1 ? bz + t : side === 2 ? bz + bs - 3 : bz + t;
        stalls.push({ x, z, c: pick(["#d62828", "#f77f00", "#fcbf49", "#2a9d8f", "#3a86ff", "#8338ec"]) });
      }
      for (let k = 0; k < 6; k++) palms.push({ x: bx + 6 + rnd() * (bs - 12), z: bz + 6 + rnd() * (bs - 12), h: 7 + rnd() * 5 });
      return;
    }
    if (dc < 2.6) {
      // centre des affaires : tours de bureaux
      const nT = dc < 1.2 ? 1 : 2;
      for (let k = 0; k < nT; k++) {
        const w = nT === 1 ? bs * .62 : bs * .42, d = nT === 1 ? bs * .62 : bs * .78;
        const x = nT === 1 ? bx + bs / 2 : bx + bs * (k ? .74 : .26), z = bz + bs / 2;
        const h = (dc < 1.2 ? 95 : 45) + rnd() * 45;
        towers.push({ x, z, w, d, h });
        if (rnd() < .5) boards.push({ x, z: z + d / 2 + .3, y: h * .35, w: w * .8, ry: 0, text: pick([["ZBOSS-SPEED", "Fonce. Sème-les."], ["BÊTA OUVERTE", "Inscris-toi sur le site"], ["TA MARQUE ICI", "Espace partenaire"]]) });
      }
      return;
    }
    // quartiers résidentiels colorés (maisons basses, toits de tôle)
    const grid = rnd() < .5 ? 3 : 2, cell = (bs - 4) / grid;
    for (let gi = 0; gi < grid; gi++) for (let gj = 0; gj < grid; gj++) {
      if (rnd() < .12) continue;
      const w = cell * (.7 + rnd() * .22), d = cell * (.7 + rnd() * .22);
      const x = bx + 2 + cell * (gi + .5), z = bz + 2 + cell * (gj + .5);
      const h = 3.5 + rnd() * (dc < 4 ? 14 : 7);
      houses.push({ x, z, w, d, h, c: pick(PAINT) });
      roofs.push({ x, z, w: w + .6, d: d + .6, y: h, c: pick(ROOF) });
    }
    if (rnd() < .25) { const t = houses[houses.length - 1]; if (t) boards.push({ x: t.x, z: t.z, y: t.h + .2, w: Math.min(9, t.w), ry: rnd() < .5 ? 0 : Math.PI / 2, text: pick([["ZBOSS-SPEED", "Démo jouable"], ["TA MARQUE ICI", "Espace partenaire"], ["KIN LA BELLE", "Roule prudemment"]]), top: true }); }
  });

  function instanced(list, geo, mat, fn, shadow) {
    const im = new THREE.InstancedMesh(geo, mat, list.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    list.forEach((o, i) => { const r = fn(o, p, s, c); m.compose(p, r || q, s); im.setMatrixAt(i, m); if (o.c || c.__set) im.setColorAt(i, c); });
    im.castShadow = !!shadow; im.receiveShadow = true; scene.add(im); return im;
  }
  // terrains des pâtés (trottoirs en latérite)
  instanced(lots, new THREE.BoxGeometry(1, .25, 1), new THREE.MeshStandardMaterial({ map: lotTex, roughness: 1 }), (o, p, s) => { p.set(o.x, 0, o.z); s.set(o.s, 1, o.s); });
  const hMat = new THREE.MeshStandardMaterial({ map: wallTex(3, 3), emissiveMap: wallEm(3, 3, .35), emissive: new THREE.Color("#ffffff"), emissiveIntensity: .9, roughness: .9 });
  instanced(houses, box, hMat, (o, p, s, c) => { p.set(o.x, .2, o.z); s.set(o.w, o.h, o.d); c.set(o.c); }, true);
  instanced(roofs, new THREE.BoxGeometry(1, .35, 1), new THREE.MeshStandardMaterial({ roughness: .6, metalness: .4 }), (o, p, s, c) => { p.set(o.x, o.y + .35, o.z); s.set(o.w, 1, o.d); c.set(o.c); }, true);
  const tMat = new THREE.MeshStandardMaterial({ map: towerTex, emissiveMap: towerEm, emissive: new THREE.Color("#ffffff"), emissiveIntensity: .8, roughness: .25, metalness: .55 });
  instanced(towers, box, tMat, (o, p, s) => { p.set(o.x, .2, o.z); s.set(o.w, o.h, o.d); }, true);
  // antenne de la plus haute tour
  { const t = towers.reduce((a, b) => b.h > a.h ? b : a, towers[0]); if (t) { const m = new THREE.Mesh(new THREE.CylinderGeometry(.3, .5, 18, 6), new THREE.MeshStandardMaterial({ color: "#ddd" })); m.position.set(t.x, t.h + 9, t.z); scene.add(m); const l = new THREE.Mesh(new THREE.SphereGeometry(.8), new THREE.MeshBasicMaterial({ color: "#ff3030" })); l.position.set(t.x, t.h + 18.5, t.z); scene.add(l); } }
  // étals du marché
  instanced(stalls, new THREE.ConeGeometry(1.6, 1.1, 4), new THREE.MeshStandardMaterial({ roughness: .8 }), (o, p, s, c) => { p.set(o.x, 2.4, o.z); s.set(1, 1, 1); c.set(o.c); });
  instanced(stalls, new THREE.BoxGeometry(2, 1, 1.4), new THREE.MeshStandardMaterial({ color: "#6b4a2a" }), (o, p, s) => { p.set(o.x, .5, o.z); s.set(1, 1, 1); });
  // panneaux publicitaires
  boards.forEach(b => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.w * .31), new THREE.MeshBasicMaterial({ map: boardTex(b.text), side: THREE.DoubleSide }));
    m.position.set(b.x, b.y + (b.top ? b.w * .2 + 1 : 0), b.z); m.rotation.y = b.ry; scene.add(m);
    if (b.top) { const pole = new THREE.Mesh(new THREE.BoxGeometry(.2, 1.2, .2), new THREE.MeshStandardMaterial({ color: "#333" })); pole.position.set(b.x, b.y + .6, b.z); scene.add(pole); }
  });

  // ------------------------------------------------------------ Palmiers (boulevard) et lampadaires
  const blvd = Math.round(N / 2); // le grand boulevard horizontal
  for (let x = 4; x < W * S; x += 14) {
    const z = (blvd * P) * S; palms.push({ x, z: z - 1.2, h: 9 + rnd() * 3 }); palms.push({ x: x + 7, z: z + R * S + 1.2, h: 9 + rnd() * 3 });
  }
  for (let k = 0; k < 160; k++) { const b = pick(blocks); if (!b.park) palms.push({ x: (b.x + (rnd() < .5 ? 6 : B - 6)) * S, z: (b.y + 6 + rnd() * (B - 12)) * S, h: 7 + rnd() * 4 }); }
  {
    const trunk = new THREE.CylinderGeometry(.16, .28, 1, 6); trunk.translate(0, .5, 0);
    instanced(palms, trunk, new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 1 }), (o, p, s) => { p.set(o.x, 0, o.z); s.set(1, o.h, 1); }, true);
    // couronne : 7 palmes retombantes
    const pos = [];
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), L = 3.6;
      const pts = [[0, 0, 0], [ca * L * .55 - sa * .5, .5, sa * L * .55 + ca * .5], [ca * L, -1.2, sa * L], [ca * L * .55 + sa * .5, .5, sa * L * .55 - ca * .5]];
      pos.push(...pts[0], ...pts[1], ...pts[2], ...pts[0], ...pts[2], ...pts[3]);
    }
    const crown = new THREE.BufferGeometry(); crown.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); crown.computeVertexNormals();
    instanced(palms, crown, new THREE.MeshStandardMaterial({ color: "#2f6b33", side: THREE.DoubleSide, roughness: .9 }), (o, p, s) => { p.set(o.x, o.h, o.z); s.set(1, 1, 1); return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28); }, true);
  }
  {
    const lamps = []; for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const q = inter(i, j); lamps.push({ x: (q.x - R / 2 - 4) * S, z: (q.y - R / 2 - 4) * S }); }
    const pole = new THREE.CylinderGeometry(.08, .12, 1, 5); pole.translate(0, .5, 0);
    instanced(lamps, pole, new THREE.MeshStandardMaterial({ color: "#3a3a40" }), (o, p, s) => { p.set(o.x, 0, o.z); s.set(1, 7, 1); });
    instanced(lamps, new THREE.SphereGeometry(.35, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffd9a0" }), (o, p, s) => { p.set(o.x, 7, o.z); s.set(1, 1, 1); });
  }

  // ------------------------------------------------------------ Le fleuve Congo (au nord)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 700, 80, 24), new THREE.MeshStandardMaterial({ color: "#5d6f72", roughness: .18, metalness: .55 }));
  water.rotation.x = -Math.PI / 2; water.position.set(W * S / 2, -.6, -360); scene.add(water);
  const wpos = water.geometry.attributes.position, wbase = Float32Array.from(wpos.array);
  { // quai
    const q = new THREE.Mesh(new THREE.BoxGeometry(W * S + 40, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: "#b8a99a" })); q.position.set(W * S / 2, .3, -.6); q.castShadow = true; scene.add(q);
    // rive d'en face : collines et silhouette de ville
    for (let k = 0; k < 26; k++) { const h = new THREE.Mesh(new THREE.SphereGeometry(40 + rnd() * 50, 8, 6), new THREE.MeshStandardMaterial({ color: "#3d5a3a", roughness: 1 })); h.scale.y = .35; h.position.set(-400 + k * 70 + rnd() * 30, -6, -700 - rnd() * 60); scene.add(h); }
    for (let k = 0; k < 18; k++) { const t = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: "#6d6a78" })); const h = 15 + rnd() * 45; t.scale.set(10 + rnd() * 10, h, 10); t.position.set(150 + k * 22 + rnd() * 10, 0, -650 - rnd() * 30); scene.add(t); }
    // collines au sud et sur les côtés
    for (let k = 0; k < 30; k++) { const h = new THREE.Mesh(new THREE.SphereGeometry(60 + rnd() * 60, 8, 6), new THREE.MeshStandardMaterial({ color: k % 3 ? "#4a5e36" : "#7a4a2e", roughness: 1 })); h.scale.y = .3; const a = rnd() * Math.PI + Math.PI * .05; h.position.set(W * S / 2 + Math.cos(a) * (560 + rnd() * 120), -8, W * S / 2 + Math.sin(a) * (560 + rnd() * 120)); scene.add(h); }
  }
  const pirogues = [];
  for (let k = 0; k < 9; k++) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, .6, 1.2), new THREE.MeshStandardMaterial({ color: "#4a2e1c" })); g.add(hull);
    const man = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, 1.5, 6), new THREE.MeshStandardMaterial({ color: pick(["#d62828", "#2a9d8f", "#fcbf49"]) })); man.position.set(2, 1, 0); g.add(man);
    g.position.set(rnd() * W * S, -.3, -30 - rnd() * 250); g.userData.v = (rnd() < .5 ? -1 : 1) * (1 + rnd() * 2); g.rotation.y = g.userData.v > 0 ? 0 : Math.PI;
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
  const TRAFFIC_COLS = ["#5b6476", "#9aa0ad", "#3f6e8c", "#8c6a3f", "#6b3f3f", "#4f7a59", "#d9d9d9"];
  const models = new Map();
  let playerModel = null, playerDef = null;
  function modelFor(c) {
    let m = models.get(c);
    if (!m) {
      if (c.kind === "player") m = makeCarModel("car", c.carDef.color, { low: true, spoiler: ["kasai", "gombe", "kivu"].includes(c.carDef.id) });
      else if (c.kind === "cop" || c.kind === "block") m = makeCarModel("police", "#f2f4f8");
      else if (c.bus) m = makeCarModel("bus");
      else m = makeCarModel("car", c.taxi ? "#f2c230" : TRAFFIC_COLS[c.tIdx % TRAFFIC_COLS.length], { taxi: c.taxi });
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
  const camPos = new THREE.Vector3(W * S / 2, 30, W * S / 2), camLook = new THREE.Vector3(W * S / 2, 0, W * S / 2);
  let camYaw = 0, tvSpot = null, frame = 0, lastGame = 0, idleT = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function clearPath(x0, z0, x1, z1) { // la caméra ne traverse pas les immeubles (coordonnées en mètres)
    for (let t = .15; t <= 1.001; t += .15) if (solidAt((x0 + (x1 - x0) * t) / S, (z0 + (z1 - z0) * t) / S)) return t - .15;
    return 1;
  }
  function chooseTv(p) {
    const sp = Math.hypot(p.vx, p.vy) || 1, fx = p.vx / sp, fy = p.vy / sp;
    const ahead = { x: p.x + fx * 650, y: p.y + fy * 650 };
    const i = Math.round((ahead.x - R / 2) / P), j = Math.round((ahead.y - R / 2) / P), q = inter(Math.max(0, Math.min(N, i)), Math.max(0, Math.min(N, j)));
    const side = Math.random() < .5 ? 1 : -1;
    return new THREE.Vector3((q.x + (R / 2 + 4) * side) * S, 2.2 + Math.random() * 3, (q.y + (R / 2 + 4) * (Math.random() < .5 ? 1 : -1)) * S);
  }
  function updateCamera(G, dt) {
    const p = G.player, px = p.x * S, pz = p.y * S, sp = Math.hypot(p.vx, p.vy), ratio = Math.min(1.2, sp / p.maxSpeed);
    camYaw += angDiff(camYaw, Math.atan2(p.vy, p.vx) * (sp > 60 ? 1 : 0) + (sp > 60 ? 0 : p.a)) * Math.min(1, dt * 3.2);
    const fx = Math.cos(camYaw), fz = Math.sin(camYaw);
    let fov = 62;
    if (camMode === "chase") {
      const dist = 6.2 + ratio * 2.6, h = 2.3 + ratio * .5;
      let tx = px - fx * dist, tz = pz - fz * dist;
      const t = clearPath(px, pz, tx, tz); tx = px + (tx - px) * Math.max(.35, t); tz = pz + (tz - pz) * Math.max(.35, t);
      tmp.set(tx, h + (t < 1 ? 1.5 : 0), tz);
      camPos.lerp(tmp, Math.min(1, dt * 9));
      tmp2.set(px + fx * 6, 1.1, pz + fz * 6); camLook.lerp(tmp2, Math.min(1, dt * 12));
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
    const bar = m.userData.bar;
    if (bar) { const on = (c.mode === "chase" || c.kind === "block") && c.alive, ph = Math.floor((t + (c.flash || 0)) * 6) % 2; bar.r.material.color.set(on && ph ? "#ff2d4a" : "#40141c"); bar.b.material.color.set(on && !ph ? "#2d7bff" : "#101c40"); bar.r.material = bar.r.material; }
  }
  let animT = 0;
  function animateWorld(dt) {
    animT += dt;
    for (let i = 0; i < wpos.count; i++) { const x = wbase[i * 3], y = wbase[i * 3 + 1]; wpos.setZ(i, Math.sin(x * .05 + animT * 1.3) * .25 + Math.cos(y * .07 + animT) * .2); }
    wpos.needsUpdate = true;
    pirogues.forEach(g => { g.position.x += g.userData.v * dt; if (g.position.x < -50) g.position.x = W * S + 50; if (g.position.x > W * S + 50) g.position.x = -50; g.position.y = -.3 + Math.sin(animT * 2 + g.position.x) * .1; });
  }

  function render(G, dt) {
    lastGame = performance.now(); frame++;
    animateWorld(dt);
    const p = G.player;
    const all = [p, ...G.cops, ...G.traffic];
    for (const c of all) { if (Math.abs(c.x - p.x) > 2200 || Math.abs(c.y - p.y) > 2200) continue; placeCar(c, modelFor(c), G.t); }
    for (const [c, m] of models) if (m.userData.seen !== frame) { scene.remove(m); models.delete(c); }
    // herses
    G.blocks.forEach(s => { let m = spikeModels.get(s); if (!m) { m = new THREE.Mesh(new THREE.BoxGeometry(s.horiz ? .8 : 15, .15, s.horiz ? 15 : .8), spikeMat); scene.add(m); spikeModels.set(s, m); } m.position.set(s.x * S, .1, s.y * S); m.userData.seen = frame; });
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
    // particules
    let n = 0;
    for (const q of G.parts) { if (n >= PMAX) break; const a = q.life / q.max; pPos[n * 3] = q.x * S; pPos[n * 3 + 1] = q.kind === "smoke" ? .6 + (1 - a) * 2 : q.kind === "fire" ? 1 + (1 - a) * 2 : .5; pPos[n * 3 + 2] = q.y * S;
      const col = q.kind === "spark" ? [1, .75, .3] : q.kind === "flame" ? [.35, .8, 1] : q.kind === "fire" ? [1, .5, .15] : [.55 * a, .55 * a, .6 * a]; pCol.set(col, n * 3); n++; }
    pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    updateCamera(G, dt);
    renderer.render(scene, camera);
  }

  // Vue d'attente derrière le menu : survol lent de la ville
  function idle(now) {
    requestAnimationFrame(idle);
    if (performance.now() - lastGame < 250) return;
    const dt = 1 / 60; idleT += dt; animateWorld(dt);
    const c = W * S / 2, a = idleT * .05;
    camera.fov = 55; camera.updateProjectionMatrix();
    camera.position.set(c + Math.cos(a) * 260, 70, c + Math.sin(a) * 260 - 120); camera.lookAt(c, 10, c - 60);
    sunLight.position.set(c - 120, 140, c - 80); sunLight.target.position.set(c, 0, c);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(idle);

  window.ZBOSS_3D = {
    ok: true, render,
    camLabel: () => CAM_NAMES[camMode],
    cycleCam() { camMode = CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]; tvSpot = null; try { localStorage.setItem("zboss_cam3d", camMode); } catch (e) { } },
  };
  if (window.ZBOSS_CAMLABEL) window.ZBOSS_CAMLABEL();
})();
