// Zboss-speed — démo jouable (Canvas 2D, vue de dessus).
// Conduite avec dérapage, ville en grille, police avec niveaux de recherche,
// barrages, hélicoptère, évasion, nitro, trafic, score et sons synthétisés.
(function () {
  "use strict";
  // 2 Life : sur jouer.html, visite de la ville à pied (pas de course ni de police)
  const WALK = !!window.TWOLIFE_WALK;

  // ---------------------------------------------------------------- Monde : la vraie Gombe (Kinshasa)
  // Carte issue d'OpenStreetMap (ODbL) via Overture Maps, préparée par tools/prep_kinshasa.py.
  const MAP = window.ZBOSS_MAP;
  const W = MAP.w, H = MAP.h;   // taille du monde en px de simulation (1 px = 0,1 m)
  const CAR_R = 15;

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rand = rng(20261122);

  // routes (polylignes) et graphe routier
  const ROADS = MAP.roads.map(r => ({ cls: MAP.cls[r[0]], w: r[1], name: r[2] >= 0 ? MAP.names[r[2]] : null, p: r.slice(3) }));
  const nodes = [], nodeKey = new Map();
  function nodeId(x, y, w) {
    const k = x + "," + y; let i = nodeKey.get(k);
    if (i === undefined) { i = nodes.length; nodes.push({ x, y, nb: [], w }); nodeKey.set(k, i); }
    else nodes[i].w = Math.max(nodes[i].w, w);
    return i;
  }
  function link(a, b) { if (a === b) return; if (!nodes[a].nb.includes(b)) nodes[a].nb.push(b); if (!nodes[b].nb.includes(a)) nodes[b].nb.push(a); }
  ROADS.forEach(r => {
    let prev = nodeId(r.p[0], r.p[1], r.w);
    for (let k = 2; k < r.p.length; k += 2) {
      const ax = nodes[prev].x, ay = nodes[prev].y, bx = r.p[k], by = r.p[k + 1], L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L / 450);
      for (let s = 1; s <= n; s++) { const id = nodeId(Math.round(ax + (bx - ax) * s / n), Math.round(ay + (by - ay) * s / n), r.w); link(prev, id); prev = id; }
    }
  });
  // index spatial des nœuds
  const BK = 1000, BW = Math.ceil(W / BK), BH = Math.ceil(H / BK), buckets = Array.from({ length: BW * BH }, () => []);
  nodes.forEach((n, i) => buckets[Math.min(BH - 1, n.y / BK | 0) * BW + Math.min(BW - 1, n.x / BK | 0)].push(i));
  function nodesNear(x, y, r) {
    const out = [], i0 = Math.max(0, (x - r) / BK | 0), i1 = Math.min(BW - 1, (x + r) / BK | 0), j0 = Math.max(0, (y - r) / BK | 0), j1 = Math.min(BH - 1, (y + r) / BK | 0);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const id of buckets[j * BW + i]) { const n = nodes[id]; if (Math.abs(n.x - x) <= r && Math.abs(n.y - y) <= r) out.push(id); }
    return out;
  }
  function nearestNode(x, y) {
    for (let r = 600; r < 40000; r *= 2) {
      const c = nodesNear(x, y, r); if (!c.length) continue;
      let best = c[0], bd = 1e18; for (const id of c) { const d = (nodes[id].x - x) ** 2 + (nodes[id].y - y) ** 2; if (d < bd) { bd = d; best = id; } }
      return best;
    }
    return 0;
  }
  // A* sur le graphe (tas binaire)
  function findPath(s, t) {
    if (s === t) return [t];
    const g = new Map([[s, 0]]), from = new Map(), heap = [[0, s]], done = new Set(), T = nodes[t];
    const push = e => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    let it = 0;
    while (heap.length && it++ < 8000) {
      const [, u] = pop(); if (done.has(u)) continue; done.add(u);
      if (u === t) { const path = [t]; let k = t; while (from.has(k)) { k = from.get(k); path.push(k); } return path.reverse(); }
      const U = nodes[u], gu = g.get(u);
      for (const v of U.nb) {
        const V = nodes[v], nd = gu + Math.hypot(V.x - U.x, V.y - U.y);
        if (nd < (g.has(v) ? g.get(v) : 1e18)) { g.set(v, nd); from.set(v, u); push([nd + Math.hypot(T.x - V.x, T.y - V.y), v]); }
      }
    }
    return null;
  }

  // masque de collision (1 case = C px) : 0 sol nu, 1 route, 2 bâtiment, 3 eau
  // dessiné par tuiles (limite de taille des canvas sur mobile)
  const C = 12, MW = Math.ceil(W / C), MH = Math.ceil(H / C);
  const mask = new Uint8Array(MW * MH);
  (function () {
    const TS = 2048, cv = document.createElement("canvas"); cv.width = cv.height = TS;
    const c = cv.getContext("2d", { willReadFrequently: true });
    for (let ty = 0; ty < MH; ty += TS) for (let tx = 0; tx < MW; tx += TS) {
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = "#000"; c.fillRect(0, 0, TS, TS);
      c.setTransform(1 / C, 0, 0, 1 / C, -tx, -ty);
      c.fillStyle = "#0000ff"; MAP.water.forEach(rings => { c.beginPath(); rings.forEach(r => { r.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); }); c.fill("evenodd"); });
      c.fillStyle = "#ff0000"; MAP.buildings.forEach(b => { c.beginPath(); for (let i = 1; i < b.length; i += 2) i === 1 ? c.moveTo(b[i], b[i + 1]) : c.lineTo(b[i], b[i + 1]); c.closePath(); c.fill(); });
      c.strokeStyle = "#00ff00"; c.lineCap = c.lineJoin = "round";
      ROADS.forEach(r => { c.lineWidth = r.w; c.beginPath(); for (let i = 0; i < r.p.length; i += 2) i ? c.lineTo(r.p[i], r.p[i + 1]) : c.moveTo(r.p[i], r.p[i + 1]); c.stroke(); });
      const w = Math.min(TS, MW - tx), h = Math.min(TS, MH - ty), d = c.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y * w + x) * 4; mask[(ty + y) * MW + tx + x] = d[k + 1] > 110 ? 1 : d[k] > 127 ? 2 : d[k + 2] > 127 ? 3 : 0; }
    }
  })();
  // quartiers de remplissage : petites maisons sur les terrains nus loin des grands axes
  // (la carte ne garde que les bâtiments proches des rues hors de la Gombe)
  const FILL = [];
  (function () {
    const fr = rng(4243), M = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 1 : mask[(y / C | 0) * MW + (x / C | 0)];
    const STEP = 240, CLEAR = 420;
    for (let gy = STEP; gy < H - STEP; gy += STEP) for (let gx = STEP; gx < W - STEP; gx += STEP) {
      const x = gx + (fr() - .5) * 60, y = gy + (fr() - .5) * 60;
      let ok = true;
      for (let k = 0; k < 9 && ok; k++) { const dx = (k % 3 - 1) * CLEAR, dy = ((k / 3 | 0) - 1) * CLEAR; const v = M(x + dx, y + dy); if (v === 1 || v === 3) ok = false; }
      for (let k = 0; k < 5 && ok; k++) { const v = M(x + [0, -90, 90, 0, 0][k], y + [0, 0, 0, -90, 90][k]); if (v !== 0) ok = false; }
      if (!ok || fr() < .12) continue;
      const w = 110 + fr() * 70, d = 110 + fr() * 70, h = 35 + fr() * 55;
      FILL.push({ x, y, w, d, h, c: (fr() * 12) | 0 });
      for (let yy = y - d / 2; yy < y + d / 2; yy += C) for (let xx = x - w / 2; xx < x + w / 2; xx += C) mask[(yy / C | 0) * MW + (xx / C | 0)] = 2;
    }
  })();
  // concessions « Zboss Motors » : showrooms où l'on entre à pied pour choisir sa voiture.
  // Posées au bord d'un grand axe, sur un terrain dégagé (les bâtiments de la carte à cet endroit sont retirés).
  // Masque : 4 = sol intérieur (marchable, solide pour les voitures).
  const SHOPS = [];
  const SHOP_W = 360, SHOP_D = 240, SHOP_DOOR = 70;
  (function () {
    if (WALK) return;   // visite de la ville : pas de concessions automobiles
    const M = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 3 : mask[(y / C | 0) * MW + (x / C | 0)];
    const lm = (MAP.landmarks || [])[0];
    const targets = [{ x: MAP.start.x + Math.cos(MAP.start.a) * 1400, y: MAP.start.y + Math.sin(MAP.start.a) * 1400 }];
    if (lm) targets.push({ x: lm.x, y: lm.y - 900 }, { x: (MAP.start.x + lm.x) / 2, y: (MAP.start.y + lm.y) / 2 });
    const segs = [];
    ROADS.forEach(r => { if (r.w < 150) return; for (let i = 0; i + 3 < r.p.length; i += 2) segs.push({ r, ax: r.p[i], ay: r.p[i + 1], bx: r.p[i + 2], by: r.p[i + 3] }); });
    targets.forEach(T0 => {
      const cand = segs.map(g => ({ g, d: Math.hypot((g.ax + g.bx) / 2 - T0.x, (g.ay + g.by) / 2 - T0.y) })).filter(o => o.d < 5000).sort((a, b) => a.d - b.d);
      const before = SHOPS.length;
      for (const { g } of cand) {
        if (SHOPS.length > before) break;
        const L = Math.hypot(g.bx - g.ax, g.by - g.ay); if (L < SHOP_W + 60) continue;
        const ux = (g.bx - g.ax) / L, uy = (g.by - g.ay) / L, a = Math.atan2(uy, ux);
        for (const sd of [1, -1]) {
          const nx = -uy * sd, ny = ux * sd, off = g.r.w / 2 + 60 + SHOP_D / 2;
          const cx = (g.ax + g.bx) / 2 + nx * off, cy = (g.ay + g.by) / 2 + ny * off;
          if (SHOPS.some(o => Math.hypot(o.x - cx, o.y - cy) < 3000)) continue;
          let ok = true;
          for (let v = -SHOP_D / 2 - 20; v <= SHOP_D / 2 + 20 && ok; v += 12) for (let u = -SHOP_W / 2 - 20; u <= SHOP_W / 2 + 20 && ok; u += 12) {
            const m = M(cx + ux * u + nx * v, cy + uy * u + ny * v); if (m === 1 || m === 3) ok = false;
          }
          if (!ok) continue;
          SHOPS.push({ x: cx, y: cy, a: Math.atan2(uy * sd, ux * sd), ux: ux * sd, uy: uy * sd, nx, ny, road: g.r, exit: { x: (g.ax + g.bx) / 2 + nx * g.r.w * .22, y: (g.ay + g.by) / 2 + ny * g.r.w * .22, a: sd > 0 ? a + Math.PI : a } });
          break;
        }
      }
    });
    // le côté route du showroom est v < 0 (repère local u le long de la rue, v vers l'intérieur des terres)
    const inShop = (o, x, y, m) => { const dx = x - o.x, dy = y - o.y, u = dx * o.ux + dy * o.uy, v = dx * o.nx + dy * o.ny; return Math.abs(u) < SHOP_W / 2 + m && Math.abs(v) < SHOP_D / 2 + m; };
    const pip = (b, x, y) => { let c = false; for (let i = 1, j = b.length - 2; i < b.length; j = i, i += 2) { const xi = b[i], yi = b[i + 1], xj = b[j], yj = b[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    if (SHOPS.length) {
      MAP.buildings = MAP.buildings.filter(b => {
        let hit = false; for (let i = 1; i < b.length && !hit; i += 2) if (SHOPS.some(o => inShop(o, b[i], b[i + 1], 60))) hit = true;
        if (!hit) return true;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 1; i < b.length; i += 2) { x0 = Math.min(x0, b[i]); x1 = Math.max(x1, b[i]); y0 = Math.min(y0, b[i + 1]); y1 = Math.max(y1, b[i + 1]); }
        for (let y = y0; y <= y1 + C; y += C) for (let x = x0; x <= x1 + C; x += C) { const k = (y / C | 0) * MW + (x / C | 0); if (mask[k] === 2 && pip(b, x, y)) mask[k] = 0; }
        return false;
      });
      for (let i = FILL.length - 1; i >= 0; i--) { const f = FILL[i]; if (!SHOPS.some(o => inShop(o, f.x, f.y, 140))) continue; FILL.splice(i, 1); for (let yy = f.y - f.d / 2 - C; yy < f.y + f.d / 2 + C; yy += C) for (let xx = f.x - f.w / 2 - C; xx < f.x + f.w / 2 + C; xx += C) { const k = (yy / C | 0) * MW + (xx / C | 0); if (mask[k] === 2) mask[k] = 0; } }
      SHOPS.forEach(o => {
        for (let v = -SHOP_D / 2; v <= SHOP_D / 2; v += C / 2) for (let u = -SHOP_W / 2; u <= SHOP_W / 2; u += C / 2) { const k = ((o.y + o.uy * u + o.ny * v) / C | 0) * MW + ((o.x + o.ux * u + o.nx * v) / C | 0); mask[k] = 4; }
        // emplacements d'exposition : 2 rangées de 3 voitures
        o.slots = []; [-1, 0, 1].forEach(i => [-28, 62].forEach(v => o.slots.push({ u: i * 105, v, a: o.a + (v < 0 ? .55 : -.55) })));
        o.slots.forEach(sl => { sl.x = o.x + o.ux * sl.u + o.nx * sl.v; sl.y = o.y + o.uy * sl.u + o.ny * sl.v; });
      });
    }
    SHOPS.inShop = inShop;
  })();
  // lieux de la ville (2 Life) : sport, loisirs, commerces, espaces partenaires, institutions de l'État.
  // Chaque lieu occupe un terrain au bord d'une rue (les bâtiments de la carte y sont retirés).
  // Masque : 2 = bâtiment (plein), 4 = terrain ouvert (marchable, solide pour les voitures).
  // Noms inventés ; les espaces partenaires restent sans logo tant qu'aucun accord écrit n'est signé.
  const PLACE_SPECS = [
    { id: "foot", type: "foot", nom: "Terrain de football de la Gombe", icone: "⚽", w: 520, d: 340, open: true, statut: "Matchs entre joueurs après le lancement." },
    { id: "jeux", type: "jeux", nom: "Aire de jeux des enfants", icone: "🛝", w: 240, d: 200, open: true, statut: "Les bébés et enfants joueurs y gagneront de la joie." },
    { id: "basket", type: "basket", nom: "Terrain de basket", icone: "🏀", w: 300, d: 190, open: true, statut: "Ouvert à tous les joueurs." },
    { id: "club1", type: "club", nom: "Mokili Club", icone: "🪩", w: 240, d: 190, h: 70, statut: "Boîte de nuit : réservée aux joueurs de 18 ans et plus, ouvre après le lancement." },
    { id: "club2", type: "club", nom: "Kin Lumière Lounge", icone: "🪩", w: 220, d: 180, h: 60, statut: "Boîte de nuit : réservée aux joueurs de 18 ans et plus, ouvre après le lancement." },
    { id: "alim1", type: "alim", nom: "Alimentation Mama Kitoko", icone: "🛒", w: 220, d: 170, h: 80, statut: "Alimentation : nourriture et boissons pour ton personnage." },
    { id: "alim2", type: "alim", nom: "Super Alimentation du Boulevard", icone: "🛒", w: 260, d: 190, h: 85, statut: "Alimentation : nourriture et boissons pour ton personnage." },
    { id: "mode", type: "magasin", nom: "Galerie Mode Kin", icone: "👗", w: 260, d: 190, h: 75, statut: "Magasin de vêtements : habille ton personnage." },
    { id: "phones", type: "magasin", nom: "Kin Phones", icone: "📱", w: 200, d: 170, h: 75, statut: "Téléphones et accessoires." },
    { id: "p-telecom", type: "partenaire", nom: "Espace partenaire · Télécom", icone: "📶", w: 240, d: 180, h: 70, partenaire: "Vodacom", statut: "Réservé à Vodacom (partenaire pressenti). Logo et services après la signature d'un accord." },
    { id: "p-banque", type: "partenaire", nom: "Espace partenaire · Banque", icone: "🏦", w: 240, d: 180, h: 80, partenaire: "Equity BCDC", statut: "Réservé à Equity BCDC (partenaire pressenti). Logo et services après la signature d'un accord." },
    { id: "p-boisson1", type: "partenaire", nom: "Espace partenaire · Boissons", icone: "🥤", w: 240, d: 180, h: 75, partenaire: "Bralima", statut: "Réservé à Bralima (partenaire pressenti). Logo et services après la signature d'un accord." },
    { id: "p-boisson2", type: "partenaire", nom: "Espace partenaire · Boissons", icone: "🥤", w: 240, d: 180, h: 75, partenaire: "Bracongo", statut: "Réservé à Bracongo (partenaire pressenti). Logo et services après la signature d'un accord." },
    { id: "mairie", type: "etat", nom: "Hôtel de ville de Kinshasa", icone: "🏛️", w: 380, d: 260, h: 120, statut: "Institution de l'État : ouvrira après le lancement du jeu." },
    { id: "assemblee", type: "etat", nom: "Assemblée nationale", icone: "🗳️", w: 400, d: 270, h: 110, statut: "Les députés élus y voteront les lois du jeu, après la première élection." },
    { id: "police", type: "etat", nom: "Commissariat de la Police nationale", icone: "🚓", w: 300, d: 220, h: 90, statut: "Amendes, prison et recrutement de policiers : ouvre après le lancement." },
    { id: "justice", type: "etat", nom: "Palais de justice", icone: "⚖️", w: 320, d: 230, h: 100, statut: "Cours et tribunaux : ouvre après le lancement." },
    { id: "dgi", type: "etat", nom: "DGI · Direction générale des impôts", icone: "🧾", w: 300, d: 220, h: 100, statut: "Impôts sur les salaires et les entreprises : ouvre après le lancement." },
    { id: "bcc", type: "etat", nom: "Banque centrale", icone: "🏦", w: 320, d: 230, h: 110, statut: "Émet l'e-makuta et surveille les banques : ouvre après le lancement." },
    { id: "hopital", type: "etat", nom: "Hôpital général", icone: "🏥", w: 360, d: 250, h: 100, statut: "Soins des personnages malades : ouvre après le lancement." },
  ];
  const PLACES = [], BILLBOARDS = [];
  (function () {
    const M = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 3 : mask[(y / C | 0) * MW + (x / C | 0)];
    const segs = [];
    ROADS.forEach(r => { if (r.w < 90) return; for (let i = 0; i + 3 < r.p.length; i += 2) segs.push({ r, ax: r.p[i], ay: r.p[i + 1], bx: r.p[i + 2], by: r.p[i + 3] }); });
    const st = MAP.start, taken = SHOPS.map(o => ({ x: o.x, y: o.y, R: 420 }));
    PLACE_SPECS.forEach((P, k) => {
      // répartis en spirale autour du point de départ, à distance de marche
      const ang = st.a + k * 2.39996, dist = 700 + k * 190;
      const T0 = { x: st.x + Math.cos(ang) * dist, y: st.y + Math.sin(ang) * dist };
      const cand = segs.map(g => ({ g, d: Math.hypot((g.ax + g.bx) / 2 - T0.x, (g.ay + g.by) / 2 - T0.y) })).filter(o => o.d < 3500).sort((a, b) => a.d - b.d);
      for (const { g } of cand) {
        const L = Math.hypot(g.bx - g.ax, g.by - g.ay); if (L < P.w + 40) continue;
        const ux = (g.bx - g.ax) / L, uy = (g.by - g.ay) / L, a = Math.atan2(uy, ux);
        let done = false;
        for (const sd of [1, -1]) {
          const nx = -uy * sd, ny = ux * sd, off = g.r.w / 2 + 45 + P.d / 2;
          const cx = (g.ax + g.bx) / 2 + nx * off, cy = (g.ay + g.by) / 2 + ny * off, R = Math.hypot(P.w, P.d) / 2;
          if (taken.some(o => Math.hypot(o.x - cx, o.y - cy) < o.R + R + 60)) continue;
          if (Math.hypot(cx - st.x, cy - st.y) < 260) continue;
          let ok = true;
          for (let v = -P.d / 2 - 15; v <= P.d / 2 + 15 && ok; v += 12) for (let u = -P.w / 2 - 15; u <= P.w / 2 + 15 && ok; u += 12) {
            const m = M(cx + ux * sd * u + nx * v, cy + uy * sd * u + ny * v); if (m === 1 || m === 3 || m === 4) ok = false;
          }
          if (!ok) continue;
          PLACES.push({ ...P, x: cx, y: cy, a: Math.atan2(uy * sd, ux * sd), ux: ux * sd, uy: uy * sd, nx, ny, R });
          taken.push({ x: cx, y: cy, R }); done = true; break;
        }
        if (done) break;
      }
    });
    const inPlace = (o, x, y, m) => { const dx = x - o.x, dy = y - o.y, u = dx * o.ux + dy * o.uy, v = dx * o.nx + dy * o.ny; return Math.abs(u) < o.w / 2 + m && Math.abs(v) < o.d / 2 + m; };
    const pip = (b, x, y) => { let c = false; for (let i = 1, j = b.length - 2; i < b.length; j = i, i += 2) { const xi = b[i], yi = b[i + 1], xj = b[j], yj = b[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    if (PLACES.length) {
      MAP.buildings = MAP.buildings.filter(b => {
        let hit = false; for (let i = 1; i < b.length && !hit; i += 2) if (PLACES.some(o => inPlace(o, b[i], b[i + 1], 30))) hit = true;
        if (!hit) return true;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 1; i < b.length; i += 2) { x0 = Math.min(x0, b[i]); x1 = Math.max(x1, b[i]); y0 = Math.min(y0, b[i + 1]); y1 = Math.max(y1, b[i + 1]); }
        for (let y = y0; y <= y1 + C; y += C) for (let x = x0; x <= x1 + C; x += C) { const k = (y / C | 0) * MW + (x / C | 0); if (mask[k] === 2 && pip(b, x, y)) mask[k] = 0; }
        return false;
      });
      for (let i = FILL.length - 1; i >= 0; i--) { const f = FILL[i]; if (!PLACES.some(o => inPlace(o, f.x, f.y, Math.max(f.w, f.d) / 2 + 20))) continue; FILL.splice(i, 1); for (let yy = f.y - f.d / 2 - C; yy < f.y + f.d / 2 + C; yy += C) for (let xx = f.x - f.w / 2 - C; xx < f.x + f.w / 2 + C; xx += C) { const k = (yy / C | 0) * MW + (xx / C | 0); if (mask[k] === 2) mask[k] = 0; } }
      PLACES.forEach(o => {
        // terrain ouvert : marchable ; bâtiment : plein (on s'arrête devant la façade, côté rue)
        const m = o.open ? 4 : 2;
        for (let v = -o.d / 2; v <= o.d / 2; v += C / 2) for (let u = -o.w / 2; u <= o.w / 2; u += C / 2) { const k = ((o.y + o.uy * u + o.ny * v) / C | 0) * MW + ((o.x + o.ux * u + o.nx * v) / C | 0); mask[k] = m; }
        o.door = { x: o.x - o.nx * (o.d / 2 + 30), y: o.y - o.ny * (o.d / 2 + 30) };
      });
    }
    PLACES.inPlace = inPlace;
    // panneaux publicitaires LED au bord des grands axes, autour du départ
    const big = segs.filter(g => g.r.w >= 130).map(g => ({ g, d: Math.hypot((g.ax + g.bx) / 2 - st.x, (g.ay + g.by) / 2 - st.y) })).filter(o => o.d < 5200).sort((a, b) => a.d - b.d);
    for (const { g } of big) {
      if (BILLBOARDS.length >= 26) break;
      const L = Math.hypot(g.bx - g.ax, g.by - g.ay); if (L < 160) continue;
      const ux = (g.bx - g.ax) / L, uy = (g.by - g.ay) / L, sd = BILLBOARDS.length % 2 ? 1 : -1, nx = -uy * sd, ny = ux * sd;
      const x = (g.ax + g.bx) / 2 + nx * (g.r.w / 2 + 28), y = (g.ay + g.by) / 2 + ny * (g.r.w / 2 + 28);
      if (M(x, y) !== 0) continue;
      if (BILLBOARDS.some(b => Math.hypot(b.x - x, b.y - y) < 650) || PLACES.some(o => inPlace(o, x, y, 40)) || Math.hypot(x - st.x, y - st.y) < 200) continue;
      BILLBOARDS.push({ x, y, a: Math.atan2(uy, ux), i: BILLBOARDS.length });
    }
  })();
  // déplacement à pied : murs du showroom (porte côté rue), bâtiments et eau
  function walkBlocked(x, y) {
    const g = (x < 0 || y < 0 || x >= W || y >= H) ? 2 : mask[(y / C | 0) * MW + (x / C | 0)];
    if (g === 2 || g === 3) return true;
    for (const o of SHOPS) {
      const dx = x - o.x, dy = y - o.y, u = dx * o.ux + dy * o.uy, v = dx * o.nx + dy * o.ny;
      const outer = Math.abs(u) < SHOP_W / 2 + 4 && Math.abs(v) < SHOP_D / 2 + 4, inner = Math.abs(u) < SHOP_W / 2 - 4 && Math.abs(v) < SHOP_D / 2 - 4;
      if (outer && !inner && !(v < 0 && Math.abs(u) < SHOP_DOOR)) return true;
      // podiums
      if (inner && o.slots && o.slots.some(sl => Math.hypot(x - sl.x, y - sl.y) < 26)) return true;
    }
    return false;
  }
  // carte colorée basse résolution (mini-carte et rendu 2D de secours)
  const C2 = 40, M2W = Math.ceil(W / C2), M2H = Math.ceil(H / C2);
  const MAP2D = document.createElement("canvas"); MAP2D.width = M2W; MAP2D.height = M2H;
  (function () {
    const c = MAP2D.getContext("2d"), img = c.createImageData(M2W, M2H), d = img.data;
    const COL = [[58, 40, 30], [30, 31, 40], [70, 66, 72], [28, 64, 88], [255, 90, 31]];
    for (let y = 0; y < M2H; y++) for (let x = 0; x < M2W; x++) {
      let v = 0; // la route est prioritaire pour rester visible
      for (let k = 0; k < 4; k++) { const mx = Math.min(MW - 1, ((x * C2 + (k & 1) * C2 * .5 + C2 * .25) / C) | 0), my = Math.min(MH - 1, ((y * C2 + (k >> 1) * C2 * .5 + C2 * .25) / C) | 0), m = mask[my * MW + mx]; if (m === 1) { v = 1; break; } if (k === 0) v = m; }
      const col = COL[v], o = (y * M2W + x) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  })();
  const groundAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 2 : mask[(y / C | 0) * MW + (x / C | 0)];
  const solidAt = (x, y) => groundAt(x, y) >= 2;
  function los(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), steps = Math.ceil(d / 40);
    for (let s = 1; s < steps; s++) { const t = s / steps; if (solidAt(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
    return true;
  }
  // déplacement le long du graphe (trafic, patrouilles) : choisit la branche suivante au carrefour
  function nextNode(from, to) {
    const T = nodes[to], opts = T.nb.filter(n => n !== from);
    if (!opts.length) return from;
    if (opts.length === 1 || rand() > .6) return opts[(rand() * opts.length) | 0];
    const F = nodes[from], a0 = Math.atan2(T.y - F.y, T.x - F.x);
    return opts.reduce((b, n) => { const d = Math.abs(angDiff(a0, Math.atan2(nodes[n].y - T.y, nodes[n].x - T.x))); return d < b.d ? { n, d } : b; }, { d: 9 }).n;
  }
  function laneTarget(c) {
    const A = nodes[c.from], Bn = nodes[c.to], dx = Bn.x - A.x, dy = Bn.y - A.y, L = Math.hypot(dx, dy) || 1, off = Math.min(30, Bn.w * .22);
    return { x: Bn.x - dy / L * off, y: Bn.y + dx / L * off };
  }
  function wander(c) {
    let t = c.to === undefined ? null : laneTarget(c);
    if (!t || Math.hypot(t.x - c.x, t.y - c.y) > 900) {
      const n = nearestNode(c.x, c.y), N0 = nodes[n];
      // repart vers le nœud le plus proche, dans le sens de la marche
      c.from = N0.nb.reduce((b, m) => { const d = Math.abs(angDiff(c.a, Math.atan2(N0.y - nodes[m].y, N0.x - nodes[m].x))); return d < b.d ? { m, d } : b; }, { m: n, d: 9 }).m;
      c.to = n; t = laneTarget(c);
    }
    if (Math.hypot(t.x - c.x, t.y - c.y) < 70) { const nx = nextNode(c.from, c.to); c.from = c.to; c.to = nx; t = laneTarget(c); }
    return t;
  }

  // ---------------------------------------------------------------- Sprites
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function carSprite(color, dark, kind) {
    const cv = document.createElement("canvas"); cv.width = 96; cv.height = 52;
    const c = cv.getContext("2d"); c.translate(48, 26);
    c.fillStyle = "rgba(0,0,0,.45)"; roundRect(c, -24, -12, 50, 26, 8); c.fill();
    const body = kind === "police" ? "#eef1f6" : color;
    c.fillStyle = body; roundRect(c, -24, -12, 48, 24, 7); c.fill();
    if (kind === "police") { c.fillStyle = "#151821"; c.fillRect(-24, -12, 12, 24); c.fillRect(13, -12, 11, 24); }
    if (kind === "traffic") { c.fillStyle = "rgba(0,0,0,.18)"; roundRect(c, -24, -12, 48, 24, 7); c.fill(); }
    c.fillStyle = dark; c.globalAlpha = .55; c.fillRect(-24, 9, 48, 3); c.fillRect(-24, -12, 48, 3); c.globalAlpha = 1;
    c.fillStyle = "#0e1420"; roundRect(c, 2, -9, 10, 18, 3); c.fill();   // pare-brise
    c.fillStyle = "#0e1420"; roundRect(c, -15, -8, 7, 16, 2); c.fill();  // lunette
    c.fillStyle = kind === "police" ? "#dfe3ea" : shade(body, 18); roundRect(c, -8, -9, 10, 18, 2); c.fill(); // toit
    c.fillStyle = "#f4f8ff"; c.fillRect(21, -10, 3, 5); c.fillRect(21, 5, 3, 5);  // phares
    c.fillStyle = "#ff2d1f"; c.fillRect(-24, -10, 2, 5); c.fillRect(-24, 5, 2, 5); // feux
    return cv;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) + amt, g = (n >> 8 & 255) + amt, b = (n & 255) + amt;
    r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function glowSprite(color, size) {
    const cv = document.createElement("canvas"); cv.width = cv.height = size; const c = cv.getContext("2d");
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, size, size); return cv;
  }
  function coneSprite() {
    const cv = document.createElement("canvas"); cv.width = 260; cv.height = 160; const c = cv.getContext("2d");
    const g = c.createRadialGradient(0, 80, 10, 0, 80, 260); g.addColorStop(0, "rgba(255,240,200,.32)"); g.addColorStop(1, "rgba(255,240,200,0)");
    c.fillStyle = g; c.beginPath(); c.moveTo(0, 70); c.lineTo(260, 0); c.lineTo(260, 160); c.lineTo(0, 90); c.closePath(); c.fill(); return cv;
  }
  const GLOW_R = glowSprite("rgba(255,45,74,.75)", 160), GLOW_B = glowSprite("rgba(45,123,255,.75)", 160);
  const GLOW_L = glowSprite("rgba(255,200,120,.35)", 220), GLOW_T = glowSprite("rgba(255,40,20,.5)", 70);
  const GLOW_N = glowSprite("rgba(80,210,255,.8)", 90), CONE = coneSprite(), GLOW_P = glowSprite("rgba(255,130,40,.45)", 120);
  const POLICE_SPRITE = carSprite("#eef1f6", "#151821", "police");
  const TRAFFIC_COLORS = ["#5b6476", "#7a8194", "#3f6e8c", "#8c6a3f", "#6b3f3f", "#4f7a59", "#9aa0ad"];
  const TRAFFIC_SPRITES = TRAFFIC_COLORS.map(c => carSprite(c, "#000", "traffic"));

  // ---------------------------------------------------------------- Son
  const Audio = (() => {
    let ctx = null, master, eng, engG, engF, sir, sirG, sirL, muted = false;
    function init() {
      if (ctx) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
      engF = ctx.createBiquadFilter(); engF.type = "lowpass"; engF.frequency.value = 700; engG = ctx.createGain(); engG.gain.value = 0.0;
      eng = ctx.createOscillator(); eng.type = "sawtooth"; eng.frequency.value = 50; eng.connect(engF); engF.connect(engG); engG.connect(master); eng.start();
      const e2 = ctx.createOscillator(); e2.type = "square"; e2.frequency.value = 25; const e2g = ctx.createGain(); e2g.gain.value = .25; e2.connect(e2g); e2g.connect(engF); e2.start();
      eng._sub = e2;
      sirG = ctx.createGain(); sirG.gain.value = 0; sirG.connect(master);
      sir = ctx.createOscillator(); sir.type = "triangle"; sir.frequency.value = 720; sir.connect(sirG); sir.start();
      sirL = ctx.createOscillator(); sirL.frequency.value = 1.4; const sl = ctx.createGain(); sl.gain.value = 240; sirL.connect(sl); sl.connect(sir.frequency); sirL.start();
    }
    function noiseBurst(vol, dur, freq) {
      if (!ctx || muted) return; const len = ctx.sampleRate * dur, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ctx.createBufferSource(); s.buffer = buf; const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 900;
      const g = ctx.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(master); s.start();
    }
    return {
      init, get muted() { return muted; },
      toggle() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : .55, ctx.currentTime, .05); return muted; },
      update(speedRatio, throttle, sirenLevel, running) {
        if (!ctx) return; const t = ctx.currentTime;
        const target = running ? 0.07 + throttle * 0.06 : 0;
        engG.gain.setTargetAtTime(target, t, .08);
        eng.frequency.setTargetAtTime(45 + speedRatio * 140 + throttle * 15, t, .06); eng._sub.frequency.setTargetAtTime(22 + speedRatio * 70, t, .06);
        engF.frequency.setTargetAtTime(500 + speedRatio * 1500, t, .1);
        sirG.gain.setTargetAtTime(running ? sirenLevel * 0.05 : 0, t, .2);
      },
      crash(v) { if (v > 0 && v < 1e5) noiseBurst(Math.min(.6, v / 900), .35, 700); },
      boost() { noiseBurst(.12, .5, 2500); },
      suspend() { if (ctx) ctx.suspend(); }, resume() { if (ctx) ctx.resume(); },
    };
  })();

  // ---------------------------------------------------------------- Entités
  function makeCar(kind, x, y, angle, stats) {
    return { kind, x, y, a: angle, vx: 0, vy: 0, health: 100, alive: true, ...stats,
      inp: { gas: 0, brake: 0, steer: 0, hand: 0, nitro: 0 }, slip: 0, stun: 0, wreckT: 0, id: Math.random() };
  }
  function statsFor(car) {
    const s = car.stats;
    return { maxSpeed: 560 + s.vitesse * 2.0, accel: 330 + s.accel * 4.2, steerMax: 2.25 + s.maniab * 0.012,
      dmgMul: 1.45 - s.solide * 0.009, mass: 1, grip: 7.5 + s.maniab * 0.03 };
  }

  // ---------------------------------------------------------------- État du jeu
  let G = null;
  let camMode = "chase";
  try { camMode = localStorage.getItem("zboss_cam") || "chase"; } catch (e) { }
  const keys = {};
  const touch = { gas: 0, brake: 0, left: 0, right: 0, hand: 0, nitro: 0 };
  const HEAT_T = [0, 25, 60, 110, 180];
  const HEAT_NAMES = ["Calme", "Patrouille", "Renforts", "Barrages", "Hélicoptère", "Unité d'élite"];
  const COPS_BY_HEAT = [2, 2, 3, 4, 5, 7];

  function newGame(car) {
    const st = statsFor(car);
    const start = MAP.start;
    const player = makeCar("player", start.x, start.y, start.a, st);
    player.sprite = carSprite(car.color, car.dark, "player"); player.carDef = car;
    G = {
      t: 0, player, cops: [], traffic: [], blocks: [], skids: [], parts: [], heli: null, msgs: [],
      heatPts: 0, heat: 0, chase: false, seen: false, evade: 0, evadeNeed: 6, busted: 0,
      bounty: 0, banked: 0, dist: 0, nitro: 60, takedowns: 0, escapes: 0, nearCd: new Map(),
      cam: { x: player.x, y: player.y, z: 1, a: player.a }, over: false, paused: false, lastBlockT: 0, calmT: 0, shake: 0,
      best: +(lsGet("zboss_best") || 0),
      peds: [], foot: null, prompt: "", act: null,
    };
    for (let k = 0; k < 44; k++) spawnTraffic(true);
    if (!WALK) for (let k = 0; k < 2; k++) spawnCop(false);
    for (let k = 0; k < PED_N; k++) spawnPed(true);
    SHOPS.forEach(o => [-1, 1].forEach(k => G.peds.push({ x: o.x + o.ux * k * 150 + o.nx * 95, y: o.y + o.uy * k * 150 + o.ny * 95, a: o.a + Math.PI / 2, v: 0, t: rand() * 9, state: "idle", staff: true, look: 7 + k })));
    if (WALK) { // visite de la ville : on commence à pied, à côté d'un taxi jaune
      const rx = Math.sin(player.a), ry = -Math.cos(player.a);
      let x = player.x + rx * 30, y = player.y + ry * 30; if (walkBlocked(x, y)) { x = player.x - rx * 30; y = player.y - ry * 30; }
      G.foot = { x, y, a: player.a, v: 0, t: 0 };
      msg("Bienvenue à la Gombe, Kinshasa ! Marche avec les flèches, Maj pour courir. Le taxi jaune t'attend.", 5);
    } else msg("Roule. Les patrouilles te repèrent si tu dépasses 170 km/h devant elles.", 4.5);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function msg(text, dur, kind) { G.msgs.push({ text, t: dur || 2.5, kind: kind || "" }); if (G.msgs.length > 3) G.msgs.shift(); }

  function spawnTraffic(anywhere) {
    const p = G.player, cand = nodesNear(p.x, p.y, 2400);
    for (let tries = 0; tries < 20 && cand.length; tries++) {
      const from = cand[(rand() * cand.length) | 0], F = nodes[from]; if (!F.nb.length) continue;
      const d = Math.hypot(F.x - p.x, F.y - p.y);
      if (!anywhere && d < 900) continue;
      if (anywhere && d < 250) continue;
      const to = F.nb[(rand() * F.nb.length) | 0], T = nodes[to], a = Math.atan2(T.y - F.y, T.x - F.x);
      const off = Math.min(30, T.w * .22), x = F.x - Math.sin(a) * off, y = F.y + Math.cos(a) * off;
      if (solidAt(x, y)) continue;
      const c = makeCar("traffic", x, y, a, { maxSpeed: 150 + rand() * 90, accel: 260, steerMax: 2.2, dmgMul: 1, mass: .8, grip: 9 });
      c.from = from; c.to = to; c.tIdx = (rand() * TRAFFIC_SPRITES.length) | 0; c.sprite = TRAFFIC_SPRITES[c.tIdx]; c.bus = rand() < .18; c.taxi = !c.bus && rand() < .38; if (c.bus) c.maxSpeed *= .8;
      const sp = c.maxSpeed * .7; c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp;
      G.traffic.push(c); return;
    }
  }
  function spawnCop(chasing) {
    const p = G.player, cand = nodesNear(p.x, p.y, 1500);
    let best = null;
    for (let tries = 0; tries < 30 && cand.length; tries++) {
      const id = cand[(rand() * cand.length) | 0], q = nodes[id];
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 750) continue;
      if (chasing && los(q.x, q.y, p.x, p.y)) continue;
      best = id; break;
    }
    if (best === null) best = nearestNode(p.x + (rand() - .5) * 3000, p.y + (rand() - .5) * 3000);
    const q = nodes[best], to = q.nb[0] ?? best;
    const heatMul = [0.82, 0.86, 0.92, 0.97, 1.0, 1.05][G.heat];
    const c = makeCar("cop", q.x, q.y, Math.atan2(nodes[to].y - q.y, nodes[to].x - q.x),
      { maxSpeed: G.player.maxSpeed * heatMul, accel: 520 + G.heat * 40, steerMax: 2.9, dmgMul: .8, mass: 1.15, grip: 9 });
    c.sprite = POLICE_SPRITE; c.from = best; c.to = to; c.path = null; c.lastSeen = null; c.mode = chasing ? "chase" : "patrol"; c.flash = rand();
    G.cops.push(c);
  }
  function spawnRoadblock() {
    const p = G.player, sp = Math.hypot(p.vx, p.vy); if (sp < 200) return;
    const dirx = p.vx / sp, diry = p.vy / sp;
    const n = nearestNode(p.x + dirx * 1150, p.y + diry * 1150), q = nodes[n];
    if (Math.hypot(q.x - p.x, q.y - p.y) < 650 || !q.nb.length) return;
    const o = nodes[q.nb[0]], ra = Math.atan2(o.y - q.y, o.x - q.x), pa = ra + Math.PI / 2;
    for (let k = -1; k <= 1; k += 2) {
      const off = k * 42, x = q.x + Math.cos(pa) * off, y = q.y + Math.sin(pa) * off;
      const c = makeCar("block", x, y, pa, { maxSpeed: 0, accel: 0, steerMax: 0, dmgMul: 0, mass: 50, grip: 30 });
      c.sprite = POLICE_SPRITE; c.flash = rand(); c.life = 22; G.cops.push(c);
    }
    if (G.heat >= 4) { const ux = q.x - p.x, uy = q.y - p.y, ul = Math.hypot(ux, uy); G.blocks.push({ x: q.x - ux / ul * 90, y: q.y - uy / ul * 90, a: Math.atan2(uy, ux), life: 22 }); }
    msg("Barrage signalé devant toi !", 2.5, "alert");
  }

  // ---------------------------------------------------------------- Physique
  function stepCar(c, dt) {
    if (!c.alive) { c.vx *= Math.exp(-3 * dt); c.vy *= Math.exp(-3 * dt); c.x += c.vx * dt; c.y += c.vy * dt; return; }
    const fx = Math.cos(c.a), fy = Math.sin(c.a), rx = -fy, ry = fx;
    let vF = c.vx * fx + c.vy * fy, vR = c.vx * rx + c.vy * ry;
    const inp = c.inp, boost = inp.nitro ? 1.55 : 1, top = c.maxSpeed * (inp.nitro ? 1.28 : 1) * (c.flat > 0 ? .55 : 1);
    if (c.stun > 0) { c.stun -= dt; inp.gas = 0; }
    if (inp.gas) vF += c.accel * boost * dt * (1 - Math.max(0, vF) / (top * 1.08));
    if (inp.brake) { if (vF > 20) vF -= 900 * dt; else vF -= c.accel * .55 * dt; }
    if (!inp.gas && !inp.brake) vF *= Math.exp(-.55 * dt);
    vF = Math.max(-230, Math.min(top, vF));
    let grip = c.grip; if (inp.hand) { grip = 1.6; vF *= Math.exp(-.7 * dt); } if (c.flat > 0) { grip *= .45; c.flat -= dt; }
    vR *= Math.exp(-grip * dt);
    if (groundAt(c.x, c.y) === 0) { vF *= Math.exp(-1.3 * dt); vR *= Math.exp(-2 * dt); } // terre battue hors route
    const spd = Math.abs(vF), steerF = Math.min(1, spd / 230) * (1 - Math.min(.38, spd / c.maxSpeed * .38));
    c.a += inp.steer * c.steerMax * steerF * Math.sign(vF || 1) * (inp.hand ? 1.4 : 1) * dt;
    const nfx = Math.cos(c.a), nfy = Math.sin(c.a);
    c.vx = nfx * vF + -nfy * vR; c.vy = nfy * vF + nfx * vR;
    c.slip = Math.abs(vR);
    c.x += c.vx * dt; c.y += c.vy * dt;
    collideWorld(c);
  }
  const RING = Array.from({ length: 12 }, (_, k) => [Math.cos(k * Math.PI / 6), Math.sin(k * Math.PI / 6)]);
  function collideWorld(c) {
    let nx = 0, ny = 0, hit = 0;
    for (const [dx, dy] of RING) if (solidAt(c.x + dx * CAR_R, c.y + dy * CAR_R)) { nx -= dx; ny -= dy; hit++; }
    if (!hit) return;
    let l = Math.hypot(nx, ny);
    if (l < .01) { const v = Math.hypot(c.vx, c.vy) || 1; nx = -c.vx / v; ny = -c.vy / v; l = 1; }
    nx /= l; ny /= l;
    for (let k = 0; k < 10; k++) {
      c.x += nx * 3; c.y += ny * 3;
      let any = false; for (const [dx, dy] of RING) if (solidAt(c.x + dx * CAR_R * .92, c.y + dy * CAR_R * .92)) { any = true; break; }
      if (!any) break;
    }
    impact(c, nx, ny, 0.25);
  }
  function impact(c, nx, ny, e) {
    const vn = c.vx * nx + c.vy * ny; if (vn >= 0) return;
    c.vx -= (1 + e) * vn * nx; c.vy -= (1 + e) * vn * ny; c.vx *= .9; c.vy *= .9;
    hurt(c, -vn, c.x - nx * CAR_R, c.y - ny * CAR_R);
  }
  function hurt(c, v, x, y) {
    if (v < 120) return;
    const dmg = (v - 120) * 0.045 * (c.dmgMul || 1);
    if (c.kind === "player" || c.kind === "cop") c.health -= dmg;
    sparks(x, y, Math.min(18, v / 40));
    if (c.kind === "player") { Audio.crash(v); G.shake = Math.min(14, G.shake + v / 60); }
    if (c.kind === "traffic") c.stun = 2.5;
  }
  function collideCars(list) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const A = list[a], Bc = list[b];
      const dx = Bc.x - A.x, dy = Bc.y - A.y, d2 = dx * dx + dy * dy, min = CAR_R * 2;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = min - d;
      const ia = 1 / A.mass, ib = 1 / Bc.mass, s = ia + ib;
      A.x -= nx * ov * ia / s; A.y -= ny * ov * ia / s; Bc.x += nx * ov * ib / s; Bc.y += ny * ov * ib / s;
      const rv = (Bc.vx - A.vx) * nx + (Bc.vy - A.vy) * ny; if (rv > 0) continue;
      const j = -(1.35) * rv / s;
      A.vx -= j * ia * nx; A.vy -= j * ia * ny; Bc.vx += j * ib * nx; Bc.vy += j * ib * ny;
      const mx = (A.x + Bc.x) / 2, my = (A.y + Bc.y) / 2;
      hurt(A, -rv * .8, mx, my); hurt(Bc, -rv * .8, mx, my);
      if ((A.kind === "player" && Bc.kind === "cop") || (Bc.kind === "player" && A.kind === "cop")) { addHeat(Math.min(10, -rv / 60)); G.seen = true; }
    }
  }

  // ---------------------------------------------------------------- IA
  function copAI(c, dt) {
    const p = G.player;
    if (c.kind === "block") { c.inp.gas = 0; c.inp.brake = 1; c.vx *= .5; c.vy *= .5; c.life -= dt; return; }
    if (!c.alive) return;
    const dist = Math.hypot(p.x - c.x, p.y - c.y);
    const sees = dist < 950 && los(c.x, c.y, p.x, p.y);
    if (c.mode === "patrol") {
      if (!WALK && sees && dist < 560 && Math.hypot(p.vx, p.vy) > 380 && !G.chase) startChase();
      if (sees && G.chase) c.mode = "chase";
    }
    if (c.mode === "leave") { const t = wander(c); c.inp.gas = 1; c.inp.brake = 0; c.inp.nitro = 0; c.inp.hand = 0; steerTo(c, t.x, t.y); return; }
    let tx, ty;
    if (c.mode === "chase" && sees) {
      c.lastSeen = { x: p.x, y: p.y }; G.seen = true; c.path = null;
      const lead = Math.min(.6, dist / 900);
      tx = p.x + p.vx * lead; ty = p.y + p.vy * lead;
    } else if (c.mode === "chase") {
      // recherche : itinéraire par les rues vers la dernière position connue (ou la zone du joueur)
      if (c.lastSeen && Math.hypot(c.lastSeen.x - c.x, c.lastSeen.y - c.y) < 90) c.lastSeen = null;
      if (!c.path || G.t > c.pathT) {
        const goal = c.lastSeen || { x: p.x + (rand() - .5) * 1400, y: p.y + (rand() - .5) * 1400 };
        c.goal = goal; c.path = findPath(nearestNode(c.x, c.y), nearestNode(goal.x, goal.y)) || []; c.pi = 0; c.pathT = G.t + 1.6;
      }
      while (c.pi < c.path.length && Math.hypot(nodes[c.path[c.pi]].x - c.x, nodes[c.path[c.pi]].y - c.y) < 80) c.pi++;
      if (c.pi < c.path.length) { const n = nodes[c.path[c.pi]]; tx = n.x; ty = n.y; } else { tx = c.goal.x; ty = c.goal.y; c.pathT = Math.min(c.pathT, G.t + .5); }
    } else { const t = wander(c); tx = t.x; ty = t.y; }
    steerTo(c, tx, ty);
    const sp = Math.hypot(c.vx, c.vy);
    const ang = Math.abs(angDiff(c.a, Math.atan2(ty - c.y, tx - c.x)));
    c.inp.gas = c.mode === "patrol" ? (sp < 260 ? 1 : 0) : (ang < 1.1 || sp < 160 ? 1 : 0);
    c.inp.brake = ang > 1.4 && sp > 260 ? 1 : 0;
    c.inp.hand = ang > .9 && sp > 330 ? 1 : 0;
    c.inp.nitro = c.mode === "chase" && sees && dist > 380 && G.heat >= 4 ? 1 : 0;
    if (c.mode === "chase" && dist < 85 && Math.hypot(p.vx, p.vy) < 200) { c.inp.gas = 0; c.inp.brake = 1; c.inp.hand = 0; c.inp.nitro = 0; } // encercle au lieu de pousser
  }
  function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
  function steerTo(c, tx, ty) { const d = angDiff(c.a, Math.atan2(ty - c.y, tx - c.x)); c.inp.steer = Math.max(-1, Math.min(1, d * 2.4)); }
  function trafficAI(c) {
    if (c.stun > 0) { c.inp.gas = 0; c.inp.brake = 1; c.inp.steer = 0; return; }
    const t = wander(c); steerTo(c, t.x, t.y);
    const sp = Math.hypot(c.vx, c.vy), ang = Math.abs(angDiff(c.a, Math.atan2(t.y - c.y, t.x - c.x)));
    c.inp.gas = sp < c.maxSpeed * (ang > .5 ? .45 : 1) ? 1 : 0; c.inp.brake = ang > .8 && sp > 200 ? 1 : 0;
    if (c.x < 30 || c.x > W - 30 || c.y < 30 || c.y > H - 30) c.dead = true;
  }

  // ---------------------------------------------------------------- Chasse et score
  function addHeat(v) { G.heatPts += v; }
  function startChase() {
    G.chase = true; G.heatPts = Math.max(G.heatPts, 1); G.evade = 0;
    G.cops.forEach(c => { if (c.kind === "cop") c.mode = "chase"; });
    msg("Poursuite engagée !", 2.5, "alert");
  }
  function escape() {
    const p = G.player, mult = 1 + G.heat * .35, gain = Math.round(G.bounty * mult);
    G.banked += gain; G.escapes++;
    msg("Évasion réussie ! +" + gain.toLocaleString("fr-FR") + " points (x" + mult.toFixed(2).replace(".", ",") + ")", 4, "ok");
    G.chase = false; G.heatPts = 0; G.heat = 0; G.bounty = 0; G.evade = 0; G.heli = null; G.calmT = 0;
    G.cops.forEach(c => { if (c.kind === "cop") { c.mode = "leave"; c.path = null; } else c.life = 0; });
  }
  function endGame(reason) {
    if (G.over) return; G.over = true;
    const final = Math.round(G.banked + G.dist);
    const isBest = final > G.best; if (isBest) { G.best = final; lsSet("zboss_best", final); }
    UI.gameOver(reason, final, G.best, isBest);
  }

  // ---------------------------------------------------------------- Piétons et déplacement à pied
  const PED_N = 60;
  let actPressed = false;
  function spawnPed(anywhere) {
    const f = G.foot || G.player, ids = nodesNear(f.x, f.y, 1500).filter(i => nodes[i].nb.length);
    for (let tries = 0; tries < 8 && ids.length; tries++) {
      const n = ids[(rand() * ids.length) | 0], N = nodes[n], m = N.nb[(rand() * N.nb.length) | 0], M = nodes[m];
      const t = rand(), side = rand() < .5 ? 1 : -1, w = Math.max(N.w, M.w), off = w / 2 + 12 + rand() * 18;
      const dx = M.x - N.x, dy = M.y - N.y, L = Math.hypot(dx, dy) || 1;
      const x = N.x + dx * t - dy / L * off * side, y = N.y + dy * t + dx / L * off * side;
      const d = Math.hypot(x - f.x, y - f.y);
      if (!anywhere && d < 900) continue;
      if (walkBlocked(x, y) || groundAt(x, y) === 1) continue;
      G.peds.push({ x, y, a: Math.atan2(dy, dx), from: n, to: m, side, off, v: 11 + rand() * 7, t: rand() * 9, state: "walk", st: 0, look: (rand() * 7) | 0 });
      return;
    }
  }
  function pedTarget(q) {
    const A = nodes[q.from], B = nodes[q.to], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    return { x: B.x - dy / L * q.off * q.side, y: B.y + dx / L * q.off * q.side };
  }
  function pedStep(q, dt, cars) {
    q.t += dt;
    if (q.state === "idle") { q.st = 0; return; }
    // danger : une voiture fonce vers le piéton
    if (q.state === "walk" || q.state === "cower") {
      for (const c of cars) {
        const sp = Math.hypot(c.vx, c.vy); if (sp < 90) continue;
        const rx = q.x - c.x, ry = q.y - c.y, d = Math.hypot(rx, ry); if (d > 40 + sp * .55) continue;
        const ahead = (rx * c.vx + ry * c.vy) / sp, lat = (-rx * c.vy + ry * c.vx) / sp;
        if (ahead > -10 && Math.abs(lat) < 34) {
          const s = lat >= 0 ? 1 : -1; q.state = "dodge"; q.st = .55;
          q.dvx = -c.vy / sp * s * 85; q.dvy = c.vx / sp * s * 85; q.a = Math.atan2(q.dvy, q.dvx);
          if (c === G.player && !G.foot) { G.scare = (G.scare || 0) + 1; }
          break;
        }
      }
    }
    if (q.state === "dodge") {
      q.st -= dt; const nx = q.x + q.dvx * dt, ny = q.y + q.dvy * dt;
      if (!walkBlocked(nx, ny)) { q.x = nx; q.y = ny; }
      if (q.st <= 0) { q.state = "cower"; q.st = 1.2; }
      return;
    }
    if (q.state === "cower") { q.st -= dt; if (q.st <= 0) q.state = "walk"; return; }
    // marche sur le trottoir, de carrefour en carrefour
    let t = pedTarget(q);
    if (Math.hypot(t.x - q.x, t.y - q.y) < 14) { const nx = nodes[q.to].nb.filter(m => m !== q.from); const m = nx.length ? nx[(rand() * nx.length) | 0] : q.from; q.from = q.to; q.to = m; t = pedTarget(q); }
    const da = angDiff(q.a, Math.atan2(t.y - q.y, t.x - q.x)); q.a += Math.max(-4 * dt, Math.min(4 * dt, da));
    const nx = q.x + Math.cos(q.a) * q.v * dt, ny = q.y + Math.sin(q.a) * q.v * dt;
    if (!walkBlocked(nx, ny)) { q.x = nx; q.y = ny; } else { q.a += 1.2; }
  }
  function footStep(dt, up, down, steer, run) {
    const f = G.foot;
    f.a += steer * 2.8 * dt;
    const want = up ? (run ? 72 : 42) : down ? -18 : 0;
    f.v += (want - f.v) * Math.min(1, dt * 8);
    const nx = f.x + Math.cos(f.a) * f.v * dt, ny = f.y + Math.sin(f.a) * f.v * dt;
    if (!walkBlocked(nx, f.y)) f.x = nx;
    if (!walkBlocked(f.x, ny)) f.y = ny;
    f.t += dt * Math.abs(f.v) / 30;
    // les voitures poussent le piéton (pas de blessure)
    for (const c of [G.player, ...G.traffic, ...G.cops]) { const dx = f.x - c.x, dy = f.y - c.y, d = Math.hypot(dx, dy); if (d < 20 && d > .1) { f.x = c.x + dx / d * 20; f.y = c.y + dy / d * 20; } }
  }
  function nearSlot(x, y) {
    for (const o of SHOPS) for (const sl of o.slots || []) if (Math.hypot(x - sl.x, y - sl.y) < 48) return { o, sl, car: CARS[o.slots.indexOf(sl) % CARS.length] };
    return null;
  }
  function nearPlace(x, y) {
    let best = null, bd = 1e9;
    for (const o of PLACES) { if (!PLACES.inPlace(o, x, y, 70)) continue; const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  function updatePrompt() {
    const p = G.player, sp = Math.hypot(p.vx, p.vy);
    let txt = "", act = null, np = null;
    if (!G.foot) {
      const shop = SHOPS.find(o => Math.hypot(o.x - p.x, o.y - p.y) < 520);
      if (WALK) { if (sp < 60) { txt = "Descendre du taxi"; act = "exit"; } else if ((np = nearPlace(p.x, p.y))) txt = np.icone + " " + np.nom; }
      else if (sp < 60 && !G.chase) { txt = shop ? "Descendre et entrer dans la concession" : "Descendre de la voiture"; act = "exit"; }
      else if (shop && !G.chase) txt = "Concession 2 Life Motors : arrête-toi pour entrer";
    } else {
      const ns = WALK ? null : nearSlot(G.foot.x, G.foot.y);
      if (WALK && Math.hypot(G.foot.x - p.x, G.foot.y - p.y) < 50) { txt = "Prendre le taxi"; act = "enter"; }
      else if (WALK && (np = nearPlace(G.foot.x, G.foot.y))) txt = np.icone + " " + np.nom + " · " + np.statut;
      else if (WALK) txt = "Promenade à pied dans la Gombe. Le taxi jaune est sur la carte.";
      else if (ns) { txt = ns.car.id === p.carDef.id ? ns.car.name + " : c'est déjà ta voiture" : "Prendre la " + ns.car.name + " (" + ns.car.cls + ")"; act = ns.car.id === p.carDef.id ? null : "pick"; }
      else if (Math.hypot(G.foot.x - p.x, G.foot.y - p.y) < 50) { txt = "Monter dans la voiture"; act = "enter"; }
      else txt = "À pied. Reviens à ta voiture pour repartir.";
    }
    G.prompt = txt; G.act = act;
  }
  function doAction() {
    const p = G.player;
    if (G.act === "exit") {
      const rx = Math.sin(p.a), ry = -Math.cos(p.a);
      let x = p.x + rx * 26, y = p.y + ry * 26; if (walkBlocked(x, y)) { x = p.x - rx * 26; y = p.y - ry * 26; }
      G.foot = { x, y, a: p.a, v: 0, t: 0 }; p.vx = p.vy = 0;
      msg("À pied : flèches pour marcher, Maj pour courir, E pour monter", 3);
    } else if (G.act === "enter") {
      G.foot = null; msg("C'est reparti", 1.2, "ok");
    } else if (G.act === "pick") {
      const ns = nearSlot(G.foot.x, G.foot.y); if (!ns) return;
      const car = ns.car, st = statsFor(car);
      Object.assign(p, st); p.carDef = car; p.sprite = carSprite(car.color, car.dark, "player"); p.health = 100;
      p.x = ns.o.exit.x; p.y = ns.o.exit.y; p.a = ns.o.exit.a; p.vx = p.vy = 0;
      chosen = car; lsSet("zboss_car", car.id);
      G.foot = null; msg(car.name + " : elle est à toi. Bonne route !", 3, "ok");
    }
  }
  function update(dt) {
    const p = G.player; G.t += dt;
    // entrées joueur
    const kUp = keys.ArrowUp || keys.KeyW || touch.gas, kDown = keys.ArrowDown || keys.KeyS || touch.brake;
    const kSteer = ((keys.ArrowRight || keys.KeyD || touch.right) ? 1 : 0) - ((keys.ArrowLeft || keys.KeyA || touch.left) ? 1 : 0);
    if (G.foot) { p.inp.gas = 0; p.inp.brake = 1; p.inp.steer = 0; p.inp.hand = 1; p.inp.nitro = 0; footStep(dt, kUp, kDown, kSteer, keys.ShiftLeft || keys.ShiftRight || touch.nitro); }
    else {
      p.inp.gas = kUp ? 1 : 0;
      p.inp.brake = kDown ? 1 : 0;
      p.inp.steer = kSteer;
      p.inp.hand = keys.Space || touch.hand ? 1 : 0;
      const wantN = keys.ShiftLeft || keys.ShiftRight || keys.KeyN || touch.nitro;
      if (wantN && G.nitro > 0 && p.inp.gas) { if (!p.inp.nitro) Audio.boost(); p.inp.nitro = 1; G.nitro = Math.max(0, G.nitro - 28 * dt); } else p.inp.nitro = 0;
    }
    if (actPressed) { actPressed = false; doAction(); }

    G.seen = false;
    G.cops.forEach(c => copAI(c, dt));
    G.traffic.forEach(trafficAI);
    stepCar(p, dt); G.cops.forEach(c => stepCar(c, dt)); G.traffic.forEach(c => stepCar(c, dt));
    const near = [p, ...G.cops.filter(c => Math.abs(c.x - p.x) < 1400 && Math.abs(c.y - p.y) < 1400), ...G.traffic.filter(c => Math.abs(c.x - p.x) < 1400 && Math.abs(c.y - p.y) < 1400)];
    collideCars(near);

    // herses
    G.blocks.forEach(s => { s.life -= dt; const dx = p.x - s.x, dy = p.y - s.y, ca = Math.cos(s.a), sa = Math.sin(s.a); if (Math.abs(dx * ca + dy * sa) < 14 && Math.abs(-dx * sa + dy * ca) < 75 && !(p.flat > 0)) { p.flat = 4; p.health -= 8; msg("Herse ! Pneus crevés pendant 4 s", 2.5, "alert"); } });
    G.blocks = G.blocks.filter(s => s.life > 0);

    // hélicoptère
    if (G.heat >= 4) {
      if (!G.heli) { G.heli = { x: p.x - 900, y: p.y - 900 }; msg("Hélicoptère en approche", 2.5, "alert"); }
      const h = G.heli, dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy), v = Math.min(d, 560 * dt);
      if (d > 1) { h.x += dx / d * v; h.y += dy / d * v; }
      if (d < 170) G.seen = true;
    } else G.heli = null;

    // police détruite
    G.cops.forEach(c => {
      if (c.kind === "cop" && c.alive && c.health <= 0) {
        c.alive = false; c.wreckT = 5; G.takedowns++; const pts = 400 * Math.max(1, G.heat);
        G.bounty += pts; addHeat(15); msg("Police neutralisée +" + pts, 2, "ok"); sparks(c.x, c.y, 30);
      }
      if (!c.alive) c.wreckT -= dt;
    });
    G.cops = G.cops.filter(c => (c.kind !== "block" || c.life > 0) && (c.alive || c.wreckT > 0) &&
      !(c.mode === "leave" && Math.hypot(c.x - p.x, c.y - p.y) > 1500));

    // traffic renouvelé
    G.traffic = G.traffic.filter(c => !c.dead && Math.hypot(c.x - p.x, c.y - p.y) < 2600);
    while (G.traffic.length < 44) spawnTraffic(false);
    // piétons
    const fc = G.foot || p;
    G.peds = G.peds.filter(q => q.staff || Math.hypot(q.x - fc.x, q.y - fc.y) < 1900);
    for (let k = G.peds.filter(q => !q.staff).length; k < PED_N; k++) spawnPed(false);
    G.peds.forEach(q => pedStep(q, dt, near));
    updatePrompt();

    // frôlements
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 380) near.forEach(c => {
      if (c === p || c.kind === "block") return; const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < 52 && d > CAR_R * 2 + 1 && !(G.nearCd.get(c.id) > G.t)) {
        G.nearCd.set(c.id, G.t + 2); const pts = 50 * (1 + G.heat); G.nitro = Math.min(100, G.nitro + 8);
        if (G.chase) { G.bounty += pts; addHeat(2); } else G.dist += pts;
        msg("Frôlement +" + pts, 1.2, "ok");
      }
    });

    // nitro par dérapage
    if (p.slip > 150 && sp > 250) G.nitro = Math.min(100, G.nitro + p.slip * .02 * dt);
    G.nitro = Math.min(100, G.nitro + 1.2 * dt);
    G.dist += sp * dt * 0.02;

    // poursuite et niveaux
    if (G.chase) {
      if (G.seen) { addHeat(dt * 1.1); G.evade = 0; } else G.evade += dt;
      G.bounty += dt * 10 * (G.heat + 1);
      let h = 0; for (let k = 0; k < HEAT_T.length; k++) if (G.heatPts >= HEAT_T[k]) h = k + 1;
      if (h > G.heat) { G.heat = h; msg("Niveau de recherche " + h + " : " + HEAT_NAMES[h], 3, "alert"); }
      G.evadeNeed = 5 + G.heat * 1.2;
      const want = COPS_BY_HEAT[G.heat], have = G.cops.filter(c => c.kind === "cop" && c.alive && c.mode !== "leave").length;
      if (have < want && rand() < dt * 0.6) spawnCop(true);
      if (G.heat >= 3 && G.t - G.lastBlockT > 13) { G.lastBlockT = G.t; spawnRoadblock(); }
      if (G.evade >= G.evadeNeed) escape();
      // arrestation
      const close = G.cops.some(c => c.alive && c.kind !== "block" && Math.hypot(c.x - p.x, c.y - p.y) < 75);
      if (close && (sp < 110 || (!p.inp.gas && sp < 240))) G.busted += dt; else G.busted = Math.max(0, G.busted - dt * 0.8);
      if (G.busted > 2.4) endGame("busted");
    } else {
      G.calmT += dt;
      const patrols = G.cops.filter(c => c.kind === "cop" && c.mode === "patrol").length;
      if (!WALK && patrols < 2 && G.calmT > 6 && rand() < dt * .5) spawnCop(false);
    }
    if (WALK) p.health = 100;   // visite : pas d'accident fatal
    if (p.health <= 0) { p.health = 0; endGame("wrecked"); }

    // traces de pneus et fumée
    if (p.slip > 140 || (p.inp.brake && sp > 250)) {
      const fx = Math.cos(p.a), fy = Math.sin(p.a), rx = -fy, ry = fx;
      for (const s of [-1, 1]) { const x = p.x - fx * 14 + rx * 8 * s, y = p.y - fy * 14 + ry * 8 * s; G.skids.push({ x, y, px: x - p.vx * dt, py: y - p.vy * dt }); }
      if (G.skids.length > 900) G.skids.splice(0, G.skids.length - 900);
      if (rand() < .5) G.parts.push({ x: p.x - fx * 18, y: p.y - fy * 18, vx: -p.vx * .1, vy: -p.vy * .1, life: .9, max: .9, kind: "smoke", r: 8 });
    }
    if (p.inp.nitro) G.parts.push({ x: p.x - Math.cos(p.a) * 26, y: p.y - Math.sin(p.a) * 26, vx: -Math.cos(p.a) * 200, vy: -Math.sin(p.a) * 200, life: .25, max: .25, kind: "flame", r: 7 });
    if (p.health < 30 && rand() < .3) G.parts.push({ x: p.x + Math.cos(p.a) * 16, y: p.y + Math.sin(p.a) * 16, vx: 0, vy: 0, life: 1.2, max: 1.2, kind: "smoke", r: 10 });
    G.parts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; if (q.kind === "smoke") q.r += 14 * dt; });
    G.parts = G.parts.filter(q => q.life > 0); if (G.parts.length > 400) G.parts.splice(0, G.parts.length - 400);
    G.msgs.forEach(m => m.t -= dt); G.msgs = G.msgs.filter(m => m.t > 0);

    // caméra
    const z = 1.15 - Math.min(.22, sp / p.maxSpeed * .22);
    G.cam.z += (z - G.cam.z) * Math.min(1, dt * 2);
    const look = camMode === "chase" ? .08 : .18;
    G.cam.x += (p.x + p.vx * look - G.cam.x) * Math.min(1, dt * 6);
    G.cam.y += (p.y + p.vy * look - G.cam.y) * Math.min(1, dt * 6);
    G.cam.a += angDiff(G.cam.a, p.a) * Math.min(1, dt * 4.5);
    G.shake *= Math.exp(-6 * dt);

    const sirenNear = G.cops.reduce((m, c) => c.alive && c.mode === "chase" ? Math.max(m, 1 - Math.hypot(c.x - p.x, c.y - p.y) / 1400) : m, 0);
    Audio.update(Math.min(1.2, sp / p.maxSpeed), p.inp.gas, Math.max(0, sirenNear), !G.over && !G.paused);
  }
  function sparks(x, y, n) { for (let k = 0; k < n; k++) { const a = rand() * 6.28, v = 80 + rand() * 260; G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .35, max: .35, kind: "spark", r: 2 }); } }

  // ---------------------------------------------------------------- Rendu
  const cv = document.getElementById("game"), ctx = cv.getContext("2d");
  let VW = 0, VH = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1); VW = cv.clientWidth; VH = cv.clientHeight;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  }
  window.addEventListener("resize", resize);

  function render() {
    const p = G.player, cam = G.cam, scale = cam.z * Math.min(1.5, Math.max(1, Math.min(VW, VH) / 560));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#0b0c12"; ctx.fillRect(0, 0, VW, VH);
    const sx = (rand() - .5) * G.shake, sy = (rand() - .5) * G.shake;
    let x0, y0, x1, y1;
    if (camMode === "chase") {
      // caméra de poursuite : la voiture reste en bas de l'écran, la route défile devant elle
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.translate(VW / 2 + sx, VH * .68 + sy);
      ctx.rotate(-cam.a - Math.PI / 2); ctx.scale(scale, scale); ctx.translate(-cam.x, -cam.y);
      const r = Math.hypot(VW, VH) * .75 / scale + 60; x0 = cam.x - r; y0 = cam.y - r; x1 = cam.x + r; y1 = cam.y + r;
    } else {
      ctx.setTransform(DPR * scale, 0, 0, DPR * scale, DPR * (VW / 2 - cam.x * scale + sx), DPR * (VH / 2 - cam.y * scale + sy));
      const vw = VW / scale, vh = VH / scale; x0 = cam.x - vw / 2 - 60; y0 = cam.y - vh / 2 - 60; x1 = cam.x + vw / 2 + 60; y1 = cam.y + vh / 2 + 60;
    }
    // carte (sol, routes, bâtiments, fleuve) à partir du masque
    {
      const ax = Math.max(0, x0), ay = Math.max(0, y0), bx = Math.min(W, x1), by = Math.min(H, y1);
      if (bx > ax && by > ay) { ctx.imageSmoothingEnabled = false; ctx.drawImage(MAP2D, ax / C2, ay / C2, (bx - ax) / C2, (by - ay) / C2, ax, ay, bx - ax, by - ay); ctx.imageSmoothingEnabled = true; }
    }
    ctx.strokeStyle = "#ff5a1f"; ctx.lineWidth = 6; ctx.strokeRect(0, 0, W, H);

    // traces
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 4; ctx.beginPath();
    for (const s of G.skids) { if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue; ctx.moveTo(s.px, s.py); ctx.lineTo(s.x, s.y); }
    ctx.stroke();

    // herses
    G.blocks.forEach(s => { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a); ctx.fillStyle = "#c9ccd6"; for (let k = -70; k < 70; k += 10) ctx.fillRect(-4, k, 8, 6); ctx.restore(); });

    // lumières (additif)
    ctx.globalCompositeOperation = "lighter";
    const drawLights = c => {
      if (c.kind === "block" || !c.alive) return;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.drawImage(CONE, 20, -80); ctx.drawImage(GLOW_T, -60, -35); ctx.restore();
    };
    ctx.drawImage(GLOW_P, p.x - 60, p.y - 60); drawLights(p); G.cops.forEach(drawLights);
    if (p.inp.nitro) ctx.drawImage(GLOW_N, p.x - Math.cos(p.a) * 30 - 45, p.y - Math.sin(p.a) * 30 - 45);
    G.cops.forEach(c => {
      if (!c.alive || c.mode === "leave" || (c.mode === "patrol" && c.kind === "cop")) return;
      const ph = Math.floor((G.t + c.flash) * 6) % 2; ctx.drawImage(ph ? GLOW_R : GLOW_B, c.x - 80, c.y - 80);
    });
    ctx.globalCompositeOperation = "source-over";

    // voitures
    const drawCar = c => {
      if (c.x < x0 - 40 || c.x > x1 + 40 || c.y < y0 - 40 || c.y > y1 + 40) return;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
      if (!c.alive) ctx.filter = "brightness(.35)";
      ctx.drawImage(c.sprite, -48, -26); ctx.filter = "none";
      if ((c.kind === "cop" || c.kind === "block") && c.alive) {
        const on = c.mode !== "patrol" && c.mode !== "leave", ph = Math.floor((G.t + c.flash) * 6) % 2;
        ctx.fillStyle = on ? (ph ? "#ff2d4a" : "#5b1520") : "#3a1a22"; ctx.fillRect(-4, -9, 6, 8);
        ctx.fillStyle = on ? (ph ? "#1d3b80" : "#2d7bff") : "#1a2440"; ctx.fillRect(-4, 1, 6, 8);
      }
      ctx.restore();
      if (!c.alive && rand() < .4) G.parts.push({ x: c.x, y: c.y, vx: 0, vy: -20, life: 1, max: 1, kind: "fire", r: 6 });
    };
    G.traffic.forEach(drawCar); G.cops.forEach(drawCar); drawCar(p);

    // particules
    for (const q of G.parts) {
      const a = q.life / q.max;
      if (q.kind === "smoke") { ctx.fillStyle = `rgba(150,155,170,${a * .25})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.283); ctx.fill(); }
      else if (q.kind === "spark") { ctx.fillStyle = `rgba(255,200,90,${a})`; ctx.fillRect(q.x, q.y, 3, 3); }
      else if (q.kind === "flame") { ctx.fillStyle = `rgba(90,210,255,${a})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * a + 2, 0, 6.283); ctx.fill(); }
      else if (q.kind === "fire") { ctx.fillStyle = `rgba(255,${120 + 80 * a | 0},40,${a * .8})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1.5 - a), 0, 6.283); ctx.fill(); q.y -= .3; }
    }

    // hélicoptère
    if (G.heli) {
      const h = G.heli; ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(h.x, h.y, 10, h.x, h.y, 170); g.addColorStop(0, "rgba(220,235,255,.35)"); g.addColorStop(1, "rgba(220,235,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, 170, 0, 6.283); ctx.fill(); ctx.globalCompositeOperation = "source-over";
      ctx.save(); ctx.translate(h.x - 60, h.y - 90); ctx.fillStyle = "rgba(0,0,0,.4)"; ctx.beginPath(); ctx.ellipse(30, 40, 30, 12, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = "#1a1e2a"; ctx.beginPath(); ctx.ellipse(0, 0, 28, 13, 0, 0, 6.283); ctx.fill(); ctx.fillRect(-60, -3, 40, 6);
      ctx.strokeStyle = "rgba(200,210,230,.5)"; ctx.lineWidth = 3; const ra = G.t * 25; ctx.beginPath(); ctx.moveTo(Math.cos(ra) * 60, Math.sin(ra) * 60); ctx.lineTo(-Math.cos(ra) * 60, -Math.sin(ra) * 60); ctx.moveTo(Math.cos(ra + 1.57) * 60, Math.sin(ra + 1.57) * 60); ctx.lineTo(-Math.cos(ra + 1.57) * 60, -Math.sin(ra + 1.57) * 60); ctx.stroke();
      ctx.fillStyle = Math.floor(G.t * 4) % 2 ? "#ff2d4a" : "#2d7bff"; ctx.fillRect(-4, -4, 8, 8); ctx.restore();
    }

    // vignette
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * .35, VW / 2, VH / 2, Math.max(VW, VH) * .75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)"); ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    if (G.chase && G.seen) { const ph = Math.floor(G.t * 3) % 2; ctx.fillStyle = ph ? "rgba(255,45,74,.06)" : "rgba(45,123,255,.06)"; ctx.fillRect(0, 0, VW, VH); }
    if (G.player.inp.nitro) { ctx.fillStyle = "rgba(80,210,255,.05)"; ctx.fillRect(0, 0, VW, VH); }
  }

  // ---------------------------------------------------------------- Mini-carte
  const mm = document.getElementById("minimap"), mctx = mm.getContext("2d"), MM = 180;
  // carte de base en haute résolution, la mini-carte n'en montre qu'une zone autour du joueur
  const MB = 1200, MVIEW = 5200; // MVIEW : largeur de monde visible (px de simulation)
  const mapBase = document.createElement("canvas"); mapBase.width = mapBase.height = MB;
  (function () {
    const c = mapBase.getContext("2d"); c.imageSmoothingEnabled = true; c.drawImage(MAP2D, 0, 0, MB, MB * H / W);
  })();
  function renderMinimap() {
    mm.width = MM; mm.height = MM; const p = G.player, s = MM / MVIEW, ox = MM / 2 - p.x * s, oy = MM / 2 - p.y * s;
    mctx.fillStyle = "#06070b"; mctx.fillRect(0, 0, MM, MM);
    mctx.imageSmoothingEnabled = false; mctx.drawImage(MAP2D, ox, oy, W * s, H * s); mctx.imageSmoothingEnabled = true;
    const X = x => ox + x * s, Y = y => oy + y * s;
    G.blocks.forEach(b => { mctx.fillStyle = "#c9ccd6"; mctx.fillRect(X(b.x) - 2, Y(b.y) - 2, 4, 4); });
    SHOPS.forEach(o => { const x = Math.max(6, Math.min(MM - 6, X(o.x))), y = Math.max(6, Math.min(MM - 6, Y(o.y))); mctx.fillStyle = "#ff5a1f"; mctx.fillRect(x - 5, y - 5, 10, 10); mctx.fillStyle = "#fff"; mctx.font = "bold 8px sans-serif"; mctx.textAlign = "center"; mctx.fillText("Z", x, y + 3); });
    const PCOL = { foot: "#3fbf5a", jeux: "#3fbf5a", basket: "#3fbf5a", club: "#c04bff", alim: "#ffb21f", magasin: "#ffb21f", partenaire: "#2fa8ff", etat: "#f2f2f2" };
    PLACES.forEach(o => { const x = X(o.x), y = Y(o.y); if (x < -4 || y < -4 || x > MM + 4 || y > MM + 4) return; mctx.fillStyle = PCOL[o.type] || "#fff"; mctx.beginPath(); mctx.arc(x, y, 3.4, 0, 6.283); mctx.fill(); mctx.strokeStyle = "rgba(0,0,0,.6)"; mctx.lineWidth = 1; mctx.stroke(); });
    if (G.foot) { mctx.fillStyle = "#7ff0a8"; mctx.beginPath(); mctx.arc(X(G.foot.x), Y(G.foot.y), 3, 0, 6.283); mctx.fill(); }
    G.cops.forEach(c => { if (!c.alive || c.mode === "leave") return; mctx.fillStyle = c.mode === "patrol" ? "#8a93a8" : (Math.floor(G.t * 4) % 2 ? "#ff2d4a" : "#2d7bff"); const x = Math.max(4, Math.min(MM - 4, X(c.x))), y = Math.max(4, Math.min(MM - 4, Y(c.y))); mctx.beginPath(); mctx.arc(x, y, 3.2, 0, 6.283); mctx.fill(); });
    if (G.heli) { mctx.strokeStyle = "rgba(220,235,255,.8)"; mctx.beginPath(); mctx.arc(X(G.heli.x), Y(G.heli.y), 170 * s + 2, 0, 6.283); mctx.stroke(); }
    mctx.save(); mctx.translate(MM / 2, MM / 2); mctx.rotate(p.a); mctx.fillStyle = "#ffb21f"; mctx.beginPath(); mctx.moveTo(7, 0); mctx.lineTo(-5, -5); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.restore();
  }

  // ---------------------------------------------------------------- Interface
  const $ = id => document.getElementById(id);
  const UI = {
    hudT: 0,
    hud(dt) {
      this.hudT -= dt; if (this.hudT > 0) return; this.hudT = 1 / 15;
      const p = G.player, sp = Math.hypot(p.vx, p.vy);
      $("h-speed").textContent = Math.round(sp * 0.45);
      $("h-heat").innerHTML = [1, 2, 3, 4, 5].map(k => `<i class="${k <= G.heat ? "on" : ""}"></i>`).join("");
      $("h-status").textContent = G.chase ? HEAT_NAMES[G.heat] : "Calme";
      $("h-bounty").textContent = Math.round(G.bounty).toLocaleString("fr-FR");
      $("h-score").textContent = Math.round(G.banked + G.dist).toLocaleString("fr-FR");
      $("h-health").style.width = Math.max(0, p.health) + "%";
      $("h-health").style.background = p.health < 30 ? "#ff2d4a" : "";
      $("h-nitro").style.width = G.nitro + "%";
      const ev = $("h-evade");
      if (G.chase) {
        ev.hidden = false;
        if (G.busted > .3) { ev.className = "evade busted"; ev.querySelector("span").textContent = "Arrestation en cours… accélère !"; ev.querySelector("i").style.width = Math.min(100, G.busted / 2.4 * 100) + "%"; }
        else if (G.seen) { ev.className = "evade seen"; ev.querySelector("span").textContent = "Repéré : casse la ligne de vue"; ev.querySelector("i").style.width = "0%"; }
        else { ev.className = "evade hiding"; ev.querySelector("span").textContent = "Hors de vue : évasion en cours"; ev.querySelector("i").style.width = Math.min(100, G.evade / G.evadeNeed * 100) + "%"; }
      } else ev.hidden = true;
      $("h-msgs").innerHTML = G.msgs.map(m => `<div class="m ${m.kind}">${m.text}</div>`).join("");
      const pr = $("h-prompt"); pr.hidden = !G.prompt; if (G.prompt) { pr.querySelector("span").textContent = G.prompt; $("actbtn").hidden = !G.act; $("actbtn").innerHTML = "<kbd>E</kbd>" + ({ exit: "Descendre", enter: "Monter", pick: "Prendre" }[G.act] || "OK"); }
      if (G.foot) $("h-speed").textContent = Math.round(Math.abs(G.foot.v) * .36);
      renderMinimap();
    },
    gameOver(reason, final, best, isBest) {
      $("go-title").textContent = reason === "busted" ? "Arrêté !" : "Voiture détruite";
      $("go-reason").textContent = reason === "busted" ? "La police t'a immobilisé. La prime non encaissée est perdue." : "Ta voiture n'a pas tenu le choc.";
      $("go-score").textContent = final.toLocaleString("fr-FR");
      $("go-best").textContent = (isBest ? "Nouveau record ! " : "Record : ") + best.toLocaleString("fr-FR");
      $("go-stats").textContent = `${G.escapes} évasion(s) · ${G.takedowns} police(s) neutralisée(s) · ${Math.round(G.t)} s de jeu`;
      setTimeout(() => show("over"), 900);
    },
  };
  function show(id) { ["menu", "pause", "over"].forEach(k => $(k).hidden = k !== id); document.body.classList.toggle("playing", !id); }

  // ---------------------------------------------------------------- Boucle
  let last = 0, acc = 0, running = false;
  const STEP = 1 / 60;
  function loop(now) {
    if (!running) return;
    const dt = Math.min(.1, (now - last) / 1000 || 0); last = now;
    if (!G.paused) {
      acc += dt;
      while (acc >= STEP) { if (!G.over || G.t < 1e9) update(STEP); acc -= STEP; if (G.over) { acc = 0; break; } }
      UI.hud(dt);
    }
    if (window.ZBOSS_3D && window.ZBOSS_3D.ok) window.ZBOSS_3D.render(G, dt); else render();
    requestAnimationFrame(loop);
  }
  function start(car) {
    Audio.init(); Audio.resume(); resize(); newGame(car); show(null);
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
  }
  function setPause(v) { if (!G || G.over) return; G.paused = v; show(v ? "pause" : null); v ? Audio.suspend() : Audio.resume(); }

  // ---------------------------------------------------------------- Entrées
  const GAME_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyN"];
  window.addEventListener("keydown", e => {
    if (GAME_KEYS.includes(e.code) && document.body.classList.contains("playing")) e.preventDefault();
    keys[e.code] = true;
    if ((e.code === "KeyP" || e.code === "Escape") && G && !G.over) setPause(!G.paused);
    if (e.code === "KeyM") $("mute").click();
    if (e.code === "KeyC") $("cambtn").click();
    if ((e.code === "KeyE" || e.code === "KeyF") && G && !G.over && !G.paused) actPressed = true;
    if (e.code === "Enter" && !$("over").hidden) $("again").click();
  });
  window.addEventListener("keyup", e => { keys[e.code] = false; });
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; if (G && !G.over && !G.paused && running) setPause(true); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && G && !G.over && !G.paused) setPause(true); });
  document.querySelectorAll("[data-touch]").forEach(el => {
    const k = el.dataset.touch;
    const on = e => { e.preventDefault(); touch[k] = 1; el.classList.add("down"); try { el.setPointerCapture(e.pointerId); } catch (_) { } };
    const off = e => { e.preventDefault(); touch[k] = 0; el.classList.remove("down"); };
    el.addEventListener("pointerdown", on); el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("lostpointercapture", off);
  });

  // ---------------------------------------------------------------- Menu
  const CARS = window.ZBOSS_CARS.list;
  let chosen = CARS[0];
  if (WALK) chosen = CARS.find(c => c.id === "kivu") || CARS[0];   // le taxi jaune
  try { const saved = !WALK && lsGet("zboss_car"); if (saved) chosen = CARS.find(c => c.id === saved) || chosen; } catch (e) { }
  const pick = $("pick");
  if (WALK) { // choix de la ville au lieu des voitures
    const CITIES = [["Kinshasa", "La Gombe, le fleuve, les grands boulevards", true], ["Lubumbashi", "Bientôt", false], ["Goma", "Bientôt", false], ["Kisangani", "Bientôt", false], ["Matadi", "Bientôt", false], ["Le monde", "Bientôt", false]];
    pick.innerHTML = CITIES.map(([n, d, ok], i) => `<button type="button" class="pick-car pick-city" aria-pressed="${i === 0}" ${ok ? "" : "disabled"}><b>${ok ? "🏙️" : "🔒"} ${n}</b><small>${d}</small></button>`).join("");
  } else pick.innerHTML = CARS.map(c => `<button type="button" class="pick-car" data-id="${c.id}" aria-pressed="${c === chosen}">
      ${window.ZBOSS_CARS.svg(c, { view: "34" })}<b>${c.name}</b><small>${c.cls} · ${Math.round((560 + c.stats.vitesse * 2) * .45)} km/h</small></button>`).join("");
  pick.addEventListener("click", e => {
    const b = e.target.closest(".pick-car"); if (!b || WALK) return;
    chosen = CARS.find(c => c.id === b.dataset.id); lsSet("zboss_car", chosen.id);
    pick.querySelectorAll(".pick-car").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  });
  $("go").addEventListener("click", () => start(chosen));
  $("resume").addEventListener("click", () => setPause(false));
  $("quit").addEventListener("click", () => { G.over = true; show("menu"); Audio.suspend(); });
  $("again").addEventListener("click", () => start(chosen));
  $("garage").addEventListener("click", () => show("menu"));
  $("pausebtn").addEventListener("click", () => setPause(true));
  $("actbtn").addEventListener("click", () => { if (G && !G.over) actPressed = true; });
  const camLabel = () => { $("cambtn").textContent = "Caméra : " + (window.ZBOSS_3D && window.ZBOSS_3D.ok ? window.ZBOSS_3D.camLabel() : (camMode === "chase" ? "poursuite" : "dessus")); };
  $("cambtn").addEventListener("click", () => {
    if (window.ZBOSS_3D && window.ZBOSS_3D.ok) window.ZBOSS_3D.cycleCam();
    else { camMode = camMode === "chase" ? "top" : "chase"; lsSet("zboss_cam", camMode); }
    camLabel();
  });
  window.ZBOSS_CAMLABEL = camLabel;
  camLabel();
  $("mute").addEventListener("click", () => { Audio.init(); const m = Audio.toggle(); $("mute").textContent = m ? "Son coupé" : "Son"; $("mute").setAttribute("aria-pressed", String(m)); });
  $("best").textContent = (+(lsGet("zboss_best") || 0)).toLocaleString("fr-FR");
  resize(); show("menu");

  // Accès pour les tests automatisés
  window.ZBOSS_WORLD = { W, H, C, MW, MH, mask, MAP, ROADS, FILL, walkBlocked, SHOPS, PLACES, BILLBOARDS, SHOP_W, SHOP_D, SHOP_DOOR, nodes, nodesNear, nearestNode, solidAt, groundAt, angDiff, rand };
  window.__zboss = { get state() { return G; }, start: () => start(chosen), spawnCop, keys, touch, act: () => { actPressed = true; } };
})();
