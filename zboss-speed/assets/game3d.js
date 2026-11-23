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
  const scene = new THREE.Scene();
  const FOG = new THREE.Color("#c98a6e");
  scene.fog = new THREE.FogExp2(FOG, 0.0042);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2400);

  // ------------------------------------------------------------ Ciel et lumière (fin d'après-midi)
  const skyG = new THREE.Group(); scene.add(skyG);
  {
    const g = new THREE.SphereGeometry(1500, 32, 16), cols = [], pos = g.attributes.position;
    const top = new THREE.Color("#22305e"), mid = new THREE.Color("#c86a5a"), hor = new THREE.Color("#ffb070");
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 1500; const c = new THREE.Color();
      if (y > .25) c.copy(mid).lerp(top, Math.min(1, (y - .25) / .6)); else c.copy(hor).lerp(mid, Math.max(0, (y + .05) / .3));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    skyG.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    const sun = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: "#ffd9a0", fog: false }));
    sun.position.set(-1100, 120, -700); sun.lookAt(0, 0, 0); skyG.add(sun);
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
  {
    const side = new THREE.Mesh(ribbon(ROADS, 4.5, .02, 6), new THREE.MeshStandardMaterial({ map: lotTex2, roughness: .95 }));
    side.receiveShadow = true; scene.add(side);
    const byRank = ["residential", "unclassified", "living_street", "tertiary", "secondary", "primary", "trunk", "motorway"];
    byRank.forEach((cls, k) => {
      const list = ROADS.filter(r => r.cls === cls); if (!list.length) return;
      const m = new THREE.Mesh(ribbon(list, 0, .04 + k * .006, 14), new THREE.MeshStandardMaterial({ map: roadTex, roughness: .85, polygonOffset: true, polygonOffsetFactor: -1 - k, polygonOffsetUnits: -1 - k }));
      m.receiveShadow = true; scene.add(m);
    });
    // carrefours : disque d'asphalte propre par-dessus les rubans
    const xs = nodes.filter(n => n.nb.length >= 3);
    const disc = new THREE.CircleGeometry(1, 20); disc.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(disc, new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: .85, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 }), xs.length);
    const m4 = new THREE.Matrix4();
    xs.forEach((n, i) => { const r = n.w * S * .55; m4.makeScale(r, 1, r).setPosition(n.x * S, .09, n.y * S); im.setMatrixAt(i, m4); });
    im.receiveShadow = true; scene.add(im);
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
    near.forEach(t => boards.push({ x: t.x, z: t.z, y: t.h + .2, w: Math.min(16, Math.max(t.w, t.d) * .8), ry: t.w > t.d ? 0 : Math.PI / 2, top: true, text: pick([["ZBOSS-SPEED", "Fonce. Sème-les."], ["BÊTA OUVERTE", "Inscris-toi sur le site"], ["TA MARQUE ICI", "Espace partenaire"], ["KIN LA BELLE", "Roule prudemment"]]) }));
  }
  boards.forEach(b => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.w * .31), new THREE.MeshBasicMaterial({ map: boardTex(b.text), side: THREE.DoubleSide }));
    m.position.set(b.x, b.y + (b.top ? b.w * .2 + 1 : 0), b.z); m.rotation.y = b.ry; scene.add(m);
    if (b.top) { const pole = new THREE.Mesh(new THREE.BoxGeometry(.2, 1.2, .2), new THREE.MeshStandardMaterial({ color: "#333" })); pole.position.set(b.x, b.y + .6, b.z); scene.add(pole); }
  });
  function instanced(list, geo, mat, fn, shadow) {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    im.count = list.length;
    list.forEach((o, i) => { const r = fn(o, p, s, c); m.compose(p, r || q, s); im.setMatrixAt(i, m); if (o.c) im.setColorAt(i, c); });
    im.castShadow = !!shadow; im.receiveShadow = true; scene.add(im); return im;
  }

  // ------------------------------------------------------------ Palmiers (boulevard du 30 Juin et bords de route) et lampadaires
  const lamps = [];
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
          if (groundAt(ox, oy) !== 0) continue;
          if (blvd || (!big && rnd() < .5)) palms.push({ x: ox * S, z: oy * S, h: 8 + rnd() * 4 });
          else if (sd === 1) lamps.push({ x: ox * S, z: oy * S });
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
    const pole = new THREE.CylinderGeometry(.08, .12, 1, 5); pole.translate(0, .5, 0);
    instanced(lamps, pole, new THREE.MeshStandardMaterial({ color: "#3a3a40" }), (o, p, s) => { p.set(o.x, 0, o.z); s.set(1, 7, 1); });
    instanced(lamps, new THREE.SphereGeometry(.35, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffd9a0" }), (o, p, s) => { p.set(o.x, 7, o.z); s.set(1, 1, 1); });
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
  const TRAFFIC_COLS = ["#5b6476", "#9aa0ad", "#3f6e8c", "#8c6a3f", "#6b3f3f", "#4f7a59", "#d9d9d9"];
  const models = new Map();
  let playerModel = null, playerDef = null;
  function modelFor(c) {
    let m = models.get(c);
    if (!m) {
      const C3 = window.ZBOSS_CARS3D;
      if (C3) {
        if (c.kind === "player") m = C3.build(c.carDef.id, { color: c.carDef.color });
        else if (c.kind === "cop" || c.kind === "block") m = C3.build("police");
        else if (c.bus) m = C3.bus();
        else if (c.taxi) m = C3.build("taxi");
        else m = C3.build(["sedan", "suv", "hatch"][c.tIdx % 3], { color: TRAFFIC_COLS[c.tIdx % TRAFFIC_COLS.length], shadow: !MOBILE });
      }
      else if (c.kind === "player") m = makeCarModel("car", c.carDef.color, { low: true, spoiler: ["kasai", "gombe", "kivu"].includes(c.carDef.id) });
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
    pirogues.forEach(g => { const nx = g.position.x + g.userData.v * dt, gz = g.position.z / S; if ((gz >= 0 && groundAt(nx / S, gz) !== 3) || nx < -50 || nx > WS + 50) { g.userData.v *= -1; g.rotation.y = g.userData.v > 0 ? 0 : Math.PI; } else g.position.x = nx; g.position.y = .1 + Math.sin(animT * 2 + g.position.x) * .1; });
  }

  function render(G, dt) {
    lastGame = performance.now(); frame++;
    animateWorld(dt);
    const p = G.player;
    const all = [p, ...G.cops, ...G.traffic];
    for (const c of all) { if (Math.abs(c.x - p.x) > 2200 || Math.abs(c.y - p.y) > 2200) continue; placeCar(c, modelFor(c), G.t); }
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
    // particules
    let n = 0;
    for (const q of G.parts) { if (n >= PMAX) break; const a = q.life / q.max; pPos[n * 3] = q.x * S; pPos[n * 3 + 1] = q.kind === "smoke" ? .6 + (1 - a) * 2 : q.kind === "fire" ? 1 + (1 - a) * 2 : .5; pPos[n * 3 + 2] = q.y * S;
      const col = q.kind === "spark" ? [1, .75, .3] : q.kind === "flame" ? [.35, .8, 1] : q.kind === "fire" ? [1, .5, .15] : [.55 * a, .55 * a, .6 * a]; pCol.set(col, n * 3); n++; }
    pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
    updateCamera(G, dt);
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
    ok: true, render,
    camLabel: () => CAM_NAMES[camMode],
    cycleCam() { camMode = CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]; tvSpot = null; try { localStorage.setItem("zboss_cam3d", camMode); } catch (e) { } },
  };
  if (window.ZBOSS_CAMLABEL) window.ZBOSS_CAMLABEL();
})();
