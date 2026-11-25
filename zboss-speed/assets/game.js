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
      c.fillStyle = c.strokeStyle = "#ff0000"; c.lineWidth = C * 1.2; c.lineJoin = "miter"; MAP.buildings.forEach(b => { c.beginPath(); for (let i = 1; i < b.length; i += 2) i === 1 ? c.moveTo(b[i], b[i + 1]) : c.lineTo(b[i], b[i + 1]); c.closePath(); c.fill(); c.stroke(); }); // contour épaissi : plus de murs « fantômes » traversables
      c.strokeStyle = "#00ff00"; c.lineCap = c.lineJoin = "round";
      ROADS.forEach(r => { c.lineWidth = r.w; c.beginPath(); for (let i = 0; i < r.p.length; i += 2) i ? c.lineTo(r.p[i], r.p[i + 1]) : c.moveTo(r.p[i], r.p[i + 1]); c.stroke(); });
      const w = Math.min(TS, MW - tx), h = Math.min(TS, MH - ty), d = c.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = (y * w + x) * 4; mask[(ty + y) * MW + tx + x] = d[k + 1] > 110 ? 1 : d[k] > 70 ? 2 : d[k + 2] > 127 ? 3 : 0; }
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
    const edgeD = (b, x, y) => { let m = 1e9; for (let i = 1, j = b.length - 2; i < b.length; j = i, i += 2) { const ax = b[j], ay = b[j + 1], ex = b[i] - ax, ey = b[i + 1] - ay, L2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2)); m = Math.min(m, Math.hypot(x - ax - ex * t, y - ay - ey * t)); } return m; };
    const pip = (b, x, y) => { let c = false; for (let i = 1, j = b.length - 2; i < b.length; j = i, i += 2) { const xi = b[i], yi = b[i + 1], xj = b[j], yj = b[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    if (SHOPS.length) {
      MAP.buildings = MAP.buildings.filter(b => {
        let hit = false; for (let i = 1; i < b.length && !hit; i += 2) if (SHOPS.some(o => inShop(o, b[i], b[i + 1], 60))) hit = true;
        if (!hit) return true;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 1; i < b.length; i += 2) { x0 = Math.min(x0, b[i]); x1 = Math.max(x1, b[i]); y0 = Math.min(y0, b[i + 1]); y1 = Math.max(y1, b[i + 1]); }
        for (let y = y0 - C * 2; y <= y1 + C * 2; y += C) for (let x = x0 - C * 2; x <= x1 + C * 2; x += C) { const k = (y / C | 0) * MW + (x / C | 0), cx = ((x / C | 0) + .5) * C, cy = ((y / C | 0) + .5) * C; if (mask[k] === 2 && (pip(b, cx, cy) || edgeD(b, cx, cy) < C * 1.3)) mask[k] = 0; }
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
    { id: "zboss", type: "bureau", nom: "Zboss Sarlu", icone: "🏢", w: 300, d: 220, h: 150, bureau: true, statut: "Bureau d'aide : entre pour régler un problème ou poser une question." },
    { id: "maison", type: "maison", nom: "Ta maison", icone: "🏠", w: 200, d: 170, h: 55, statut: "Ici ton personnage rentre se reposer quand il est fatigué." },
    { id: "foot", type: "foot", nom: "Stade de la Gombe", icone: "⚽", w: 620, d: 420, open: true, statut: "Un match est en cours : assieds-toi sur un banc pour le regarder." },
    { id: "jeux", type: "jeux", nom: "Aire de jeux des enfants", icone: "🛝", w: 240, d: 200, open: true, statut: "Les bébés et enfants joueurs y gagneront de la joie." },
    { id: "basket", type: "basket", nom: "Terrain de basket", icone: "🏀", w: 320, d: 210, open: true, statut: "Un match de basket est en cours." },
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
    { id: "maquis", type: "alim", resto: true, nom: "Maquis Mama Kapinga", icone: "🍲", w: 220, d: 170, h: 60, near: "marche", statut: "Maquis : poulet mayo, pondu, chikwangue et poisson braisé. Ouvert de 7 h à 21 h." },
    { id: "marche", type: "marche", nom: "Marché de la Gombe", icone: "🧺", w: 360, d: 240, open: true, near: "alim1", statut: "Marché : légumes, poisson, pagnes, téléphones. Ouvert de 6 h à 18 h." },
    { id: "park1", type: "parking", nom: "Parking du centre-ville", icone: "🅿️", w: 310, d: 180, open: true, near: "zboss", statut: "Parking public : les voitures des habitants y sont garées." },
    { id: "park2", type: "parking", nom: "Parking du stade", icone: "🅿️", w: 310, d: 180, open: true, near: "foot", statut: "Parking public : les supporters s'y garent les jours de match." },
    { id: "park3", type: "parking", nom: "Parking des institutions", icone: "🅿️", w: 310, d: 180, open: true, near: "mairie", statut: "Parking public réservé aux visiteurs des institutions." },
  ];
  // textes du guide (mode Tourisme)
  const GUIDE = {
    zboss: "Le bureau Zboss Sarlu, au centre-ville : on y règle les problèmes des joueurs.",
    foot: "Le stade de quartier de la Gombe : les équipes s'affrontent ici tous les jours.",
    basket: "Le terrain de basket : trois contre trois, ambiance garantie le soir.",
    mairie: "L'Hôtel de ville gère Kinshasa : état civil, permis de construire, marchés publics.",
    assemblee: "L'Assemblée nationale : les députés élus par les joueurs y voteront les lois du jeu.",
    justice: "Le Palais de justice : c'est ici que les litiges entre joueurs seront jugés.",
    bcc: "La Banque centrale émet l'e-makuta, la monnaie du jeu.",
    hopital: "L'Hôpital général soigne les personnages malades. Sans soins, on peut mourir.",
    police: "Le commissariat : la police veille sur la ville et recrute des agents.",
    dgi: "La DGI collecte les impôts qui financent la ville.",
    jeux: "L'aire de jeux, le lieu préféré des bébés et des enfants de 2 Life.",
    club1: "Le Mokili Club, une des boîtes de nuit les plus animées de Kin.",
  };
  const PLACES = [], BILLBOARDS = [], BENCHES = [], PARKED = [], LIGHTS = [], LIGHT_AT = new Map();
  (function () {
    const M = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 3 : mask[(y / C | 0) * MW + (x / C | 0)];
    const segs = [];
    ROADS.forEach(r => { if (r.w < 90) return; for (let i = 0; i + 3 < r.p.length; i += 2) segs.push({ r, ax: r.p[i], ay: r.p[i + 1], bx: r.p[i + 2], by: r.p[i + 3] }); });
    const st = MAP.start, taken = SHOPS.map(o => ({ x: o.x, y: o.y, R: 420 }));
    PLACE_SPECS.forEach((P, k) => {
      // répartis en spirale autour du point de départ, à distance de marche
      const ang = st.a + k * 2.39996, dist = 700 + k * 190, nr = P.near && PLACES.find(o => o.id === P.near);
      const T0 = nr ? { x: nr.x + Math.cos(ang) * 520, y: nr.y + Math.sin(ang) * 520 } : { x: st.x + Math.cos(ang) * dist, y: st.y + Math.sin(ang) * dist };
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
    const edgeD = (b, x, y) => { let m = 1e9; for (let i = 1, j = b.length - 2; i < b.length; j = i, i += 2) { const ax = b[j], ay = b[j + 1], ex = b[i] - ax, ey = b[i + 1] - ay, L2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / L2)); m = Math.min(m, Math.hypot(x - ax - ex * t, y - ay - ey * t)); } return m; };
    const pip = (b, x, y) => { let c = false; for (let i = 1, j = b.length - 2; i < b.length; j = i, i += 2) { const xi = b[i], yi = b[i + 1], xj = b[j], yj = b[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    if (PLACES.length) {
      MAP.buildings = MAP.buildings.filter(b => {
        let hit = false; for (let i = 1; i < b.length && !hit; i += 2) if (PLACES.some(o => inPlace(o, b[i], b[i + 1], 30))) hit = true;
        if (!hit) return true;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 1; i < b.length; i += 2) { x0 = Math.min(x0, b[i]); x1 = Math.max(x1, b[i]); y0 = Math.min(y0, b[i + 1]); y1 = Math.max(y1, b[i + 1]); }
        for (let y = y0 - C * 2; y <= y1 + C * 2; y += C) for (let x = x0 - C * 2; x <= x1 + C * 2; x += C) { const k = (y / C | 0) * MW + (x / C | 0), cx = ((x / C | 0) + .5) * C, cy = ((y / C | 0) + .5) * C; if (mask[k] === 2 && (pip(b, cx, cy) || edgeD(b, cx, cy) < C * 1.3)) mask[k] = 0; }
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
    // bancs publics : devant les lieux ouverts et le long des trottoirs autour du départ
    const okBench = (x, y) => M(x, y) === 0 && !BENCHES.some(b => Math.hypot(b.x - x, b.y - y) < 60) && !PLACES.some(o => inPlace(o, x, y, 4));
    PLACES.forEach(o => {
      const n = o.type === "foot" ? 4 : o.open ? 2 : o.type === "etat" || o.type === "bureau" ? 2 : 0;
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * Math.min(90, o.w / n), v = -o.d / 2 - 20;
        const x = o.x + o.ux * u + o.nx * v, y = o.y + o.uy * u + o.ny * v;
        // on s'assoit dos à la rue, face au lieu (le terrain, l'entrée)
        if (okBench(x, y)) BENCHES.push({ x, y, a: Math.atan2(o.ny, o.nx), place: o.id });
      }
    });
    for (const { g } of segs.map(g => ({ g, d: Math.hypot((g.ax + g.bx) / 2 - st.x, (g.ay + g.by) / 2 - st.y) })).filter(o => o.d < 3000).sort((a, b) => a.d - b.d)) {
      if (BENCHES.length >= 40) break;
      const L = Math.hypot(g.bx - g.ax, g.by - g.ay); if (L < 120) continue;
      const ux = (g.bx - g.ax) / L, uy = (g.by - g.ay) / L, sd = BENCHES.length % 2 ? 1 : -1, nx = -uy * sd, ny = ux * sd;
      const x = (g.ax + g.bx) / 2 + ux * 30 + nx * (g.r.w / 2 + 30), y = (g.ay + g.by) / 2 + uy * 30 + ny * (g.r.w / 2 + 30);
      if (!okBench(x, y) || BENCHES.some(b => Math.hypot(b.x - x, b.y - y) < 420)) continue;
      BENCHES.push({ x, y, a: Math.atan2(-ny, -nx) });   // face à la rue : on regarde passer les gens
    }
    // voitures garées : dans les parkings (en épi, deux rangées) et le long des trottoirs des grands boulevards
    const pr = rng(9091);
    PLACES.filter(o => o.type === "parking").forEach(o => {
      for (const row of [-1, 1]) for (let u = -o.w / 2 + 24; u <= o.w / 2 - 24; u += 34) {
        if (pr() > .72) continue;
        const v = row * (o.d / 2 - 38), x = o.x + o.ux * u + o.nx * v, y = o.y + o.uy * u + o.ny * v;
        PARKED.push({ x, y, a: Math.atan2(-o.ny * row, -o.nx * row) + (pr() - .5) * .06, t: (pr() * 99) | 0, taxi: pr() < .15, lot: o.id });
      }
    });
    const curb = segs.filter(g => g.r.w >= 136).map(g => ({ g, d: Math.hypot((g.ax + g.bx) / 2 - st.x, (g.ay + g.by) / 2 - st.y) })).filter(o => o.d < 3600).sort((a, b) => a.d - b.d);
    for (const { g } of curb) {
      if (PARKED.length >= 150) break;
      const L = Math.hypot(g.bx - g.ax, g.by - g.ay); if (L < 220) continue;
      const ux = (g.bx - g.ax) / L, uy = (g.by - g.ay) / L;
      for (const sd of [1, -1]) for (let t = 90; t < L - 90; t += 62) {
        if (pr() > .38) continue;
        const nx = -uy * sd, ny = ux * sd, off = g.r.w / 2 - 14, x = g.ax + ux * t + nx * off, y = g.ay + uy * t + ny * off;
        if (M(x, y) !== 1 || nodesNear(x, y, 110).some(i => nodes[i].nb.length > 2)) continue;
        if (PARKED.some(c => Math.hypot(c.x - x, c.y - y) < 55) || PLACES.some(o => Math.hypot(o.door.x - x, o.door.y - y) < 70)) continue;
        PARKED.push({ x, y, a: Math.atan2(uy * sd, ux * sd), t: (pr() * 99) | 0, taxi: pr() < .2 });
      }
    }
    // feux tricolores aux grands carrefours autour du départ
    nodes.map((N, i) => ({ N, i, d: Math.hypot(N.x - st.x, N.y - st.y) })).filter(o => o.N.nb.length >= 3 && o.N.w >= 110 && o.d < 3800).sort((a, b) => a.d - b.d).forEach(({ N, i }) => {
      if (LIGHTS.length >= 36 || LIGHTS.some(L => Math.hypot(L.x - N.x, L.y - N.y) < 300)) return;
      const B = nodes[N.nb[0]], L = { n: i, x: N.x, y: N.y, w: N.w, ax: Math.atan2(B.y - N.y, B.x - N.x), ph: pr() * 24 };
      LIGHT_AT.set(i, L); LIGHTS.push(L);
    });
  })();
  // cycle de 24 s : axe A vert 10 s, orange 2 s, puis axe B
  function lightState(L, t) { const k = ((t + L.ph) % 24 + 24) % 24; return { a: k < 10 ? "g" : k < 12 ? "y" : "r", b: k < 12 ? "r" : k < 22 ? "g" : "y" }; }
  function redFor(L, a, t) { const s = lightState(L, t); return Math.abs(Math.cos(a - L.ax)) > .7 ? s.a : s.b; }
  // heures d'ouverture des lieux
  const HOURS = { alim: [7, 21], magasin: [9, 19], partenaire: [8, 17], etat: [8, 16], bureau: [7, 18], club: [20, 4], marche: [6, 18] };
  function isOpen(o, h) { const H = HOURS[o.type]; if (!H || h === undefined) return true; return H[0] < H[1] ? h >= H[0] && h < H[1] : h >= H[0] || h < H[1]; }
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
      peds: [], foot: null, prompt: "", act: null, energy: 100, auto: null, games: [], parked: [], chatT: 2,
      hour: 6.25, day: 1, speed: 1, phase: null, plan: null, life: null, lifeMsg: "", me: WALK ? myself() : null,
    };
    if (WALK && LIVE_CLOCK) { const k = kinNow(); G.hour = k.h; G.day = k.day; }
    G.parked = PARKED.map(o => { const c = makeCar("parked", o.x, o.y, o.a, { maxSpeed: 0, accel: 0, steerMax: 0, dmgMul: 0, mass: 60, grip: 30 }); c.tIdx = o.t % TRAFFIC_SPRITES.length; c.sprite = TRAFFIC_SPRITES[c.tIdx]; c.taxi = o.taxi; c.x0 = o.x; c.y0 = o.y; c.a0 = o.a; c.parked = true; return c; });
    for (let k = 0; k < 44; k++) spawnTraffic(true);
    for (let k = 0; k < (WALK ? 3 : 2); k++) spawnCop(false);
    if (WALK) placeFootCops();
    for (let k = 0; k < PED_N; k++) spawnPed(true);
    SHOPS.forEach(o => [-1, 1].forEach(k => G.peds.push({ x: o.x + o.ux * k * 150 + o.nx * 95, y: o.y + o.uy * k * 150 + o.ny * 95, a: o.a + Math.PI / 2, v: 0, t: rand() * 9, state: "idle", staff: true, look: 7 + k })));
    if (WALK) setupGames();
    if (WALK) { // visite de la ville : on commence à pied, à côté d'un taxi jaune
      const rx = Math.sin(player.a), ry = -Math.cos(player.a);
      let x = player.x + rx * 30, y = player.y + ry * 30; if (walkBlocked(x, y)) { x = player.x - rx * 30; y = player.y - ry * 30; }
      G.foot = { x, y, a: player.a, v: 0, t: 0 };
      const hm = HOME(); if (hm) { const n = nearestNode(hm.door.x, hm.door.y), N = nodes[n], m = N.nb[0] ?? n, pt = edgePoint(m, n, Math.min(30, N.w * .22)); player.x = pt.x; player.y = pt.y; player.a = Math.atan2(N.y - nodes[m].y, N.x - nodes[m].x) || 0; }
    } else msg("Roule. Les patrouilles te repèrent si tu dépasses 170 km/h devant elles.", 4.5);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function msg(text, dur, kind) { G.msgs.push({ text, t: dur || 2.5, kind: kind || "" }); if (G.msgs.length > 3) G.msgs.shift(); }

  function spawnTraffic(anywhere) {
    const p = G.foot || G.player, cand = nodesNear(p.x, p.y, 2400);
    for (let tries = 0; tries < 20 && cand.length; tries++) {
      const from = cand[(rand() * cand.length) | 0], F = nodes[from]; if (!F.nb.length) continue;
      const d = Math.hypot(F.x - p.x, F.y - p.y);
      if (!anywhere && d < 900) continue;
      if (anywhere && d < 250) continue;
      const to = F.nb[(rand() * F.nb.length) | 0], T = nodes[to], a = Math.atan2(T.y - F.y, T.x - F.x);
      const off = Math.min(30, T.w * .22), x = F.x - Math.sin(a) * off, y = F.y + Math.cos(a) * off;
      if (solidAt(x, y)) continue;
      if ([...G.traffic, ...G.parked, ...G.cops].some(o => Math.abs(o.x - x) < 50 && Math.abs(o.y - y) < 50)) continue;   // jamais sur une autre voiture
      const c = makeCar("traffic", x, y, a, { maxSpeed: 150 + rand() * 90, accel: 260, steerMax: 2.2, dmgMul: 1, mass: .8, grip: 9 });
      c.from = from; c.to = to; c.tIdx = (rand() * TRAFFIC_SPRITES.length) | 0; c.sprite = TRAFFIC_SPRITES[c.tIdx]; c.bus = rand() < .12; c.taxi = !c.bus && rand() < .38; if (c.bus) { c.maxSpeed *= .8; Object.assign(c, { hl: BUS_HL, hw: BUS_HW, offs: BUS_OFF, mass: 3 }); }
      const sp = c.maxSpeed * .7; c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp;
      G.traffic.push(c); return;
    }
  }
  function spawnCop(chasing) {
    const p = WALK ? (G.foot || G.player) : G.player, cand = nodesNear(p.x, p.y, 1500);
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
  // forme d'une voiture : 3 cercles alignés (avant, milieu, arrière) ; elle fait ~4,2 m sur 1,8 m
  const CAR_HL = 21, CAR_HW = 9, CAR_OFF = [-12, 0, 12];
  function carDiscs(c) { const fx = Math.cos(c.a), fy = Math.sin(c.a); return (c.offs || CAR_OFF).map(o => [c.x + fx * o, c.y + fy * o]); }
  function carOverlap(A, Bc) {
    // plus forte pénétration entre les cercles des deux voitures
    let best = null; const da = carDiscs(A), db = carDiscs(Bc), min = (A.hw || CAR_HW) + (Bc.hw || CAR_HW);
    for (const [ax, ay] of da) for (const [bx, by] of db) {
      const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy; if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || .01, ov = min - d; if (!best || ov > best.ov) best = { ov, nx: d > .01 ? dx / d : 1, ny: d > .01 ? dy / d : 0 };
    }
    return best;
  }
  function collideCars(list) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const A = list[a], Bc = list[b];
      const dx = Bc.x - A.x, dy = Bc.y - A.y, d2 = dx * dx + dy * dy, lim = (A.hl || CAR_HL) + (Bc.hl || CAR_HL) + (A.hw || CAR_HW) + (Bc.hw || CAR_HW);
      if (d2 >= lim * lim) continue;
      const hit = carOverlap(A, Bc); if (!hit) continue;
      const nx = hit.nx, ny = hit.ny, ov = hit.ov;
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
  // feu rouge devant, ou voiture arrêtée juste devant : on freine
  function stopHere(c, to) {
    const L = LIGHT_AT.get(to);
    if (L) { const d = Math.hypot(L.x - c.x, L.y - c.y); if (d < L.w / 2 + 95 && d > L.w / 2 + 8) { const st = redFor(L, c.a, G.t); if (st === "r" || (st === "y" && d > L.w / 2 + 40)) return true; } }
    const fx = Math.cos(c.a), fy = Math.sin(c.a);
    for (const o of G.buses ? G.traffic.concat(G.buses) : G.traffic) { if (o === c) continue; const dx = o.x - c.x, dy = o.y - c.y, ah = dx * fx + dy * fy; if (ah > 0 && ah < (c.hl || CAR_HL) + (o.hl || CAR_HL) + 20 && Math.abs(-dx * fy + dy * fx) < (o.hw || CAR_HW) + 7 && Math.hypot(o.vx, o.vy) < Math.hypot(c.vx, c.vy) + 20) return true; }
    // un piéton (ou le personnage) sur la chaussée juste devant : on le laisse passer
    const walkersNear = G.foot ? [G.foot, ...G.peds] : G.peds;
    for (const q of walkersNear) { if (q.gone || q.sit) continue; const dx = q.x - c.x, dy = q.y - c.y; if (Math.abs(dx) > 70 || Math.abs(dy) > 70) continue; const ah = dx * fx + dy * fy; const hl = c.hl || CAR_HL; if (ah > hl - 4 && ah < hl + 34 && Math.abs(-dx * fy + dy * fx) < (c.hw || CAR_HW) + 8) return true; }
    return false;
  }
  function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
  function steerTo(c, tx, ty) { const d = angDiff(c.a, Math.atan2(ty - c.y, tx - c.x)); c.inp.steer = Math.max(-1, Math.min(1, d * 2.4)); }
  function trafficAI(c) {
    if (c.stun > 0) { c.inp.gas = 0; c.inp.brake = 1; c.inp.steer = 0; return; }
    const t = wander(c); steerTo(c, t.x, t.y);
    const sp = Math.hypot(c.vx, c.vy), ang = Math.abs(angDiff(c.a, Math.atan2(t.y - c.y, t.x - c.x)));
    c.inp.gas = sp < c.maxSpeed * (ang > .5 ? .45 : 1) ? 1 : 0; c.inp.brake = ang > .8 && sp > 200 ? 1 : 0;
    if (WALK && stopHere(c, c.to)) { c.inp.gas = 0; c.inp.brake = 1; }
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
  let actPressed = false, pedSeq = 0;
  // ---- identité des habitants : nom, âge, métier, chez soi, caractère, goûts, forces et faiblesses
  const COMMUNES = ["Gombe", "Lingwala", "Barumbu", "Kinshasa", "Kintambo", "Bandalungwa", "Kalamu", "Kasa-Vubu", "Limete", "Ngaliema", "Lemba", "Matete", "Masina", "Ngiri-Ngiri", "Selembao", "Kimbanseke"];
  const METIERS = ["vendeuse au marché", "chauffeur de taxi", "étudiant à l'UNIKIN", "enseignant", "infirmière", "mécanicien", "couturière", "électricien", "commerçant", "maçon", "coiffeuse", "musicien", "agent de change", "cuisinière", "développeur", "comptable"];
  const METIERS_BIZ = ["banquier", "avocate", "cadre dans une entreprise", "fonctionnaire", "directeur commercial", "notaire", "consultante"];
  const CARACTERES = [
    { t: "bavard", r: ["Ah mon ami, assieds-toi, je vais te raconter toute l'histoire du quartier !", "Tu as entendu la dernière nouvelle ? Tout le monde en parle à Matonge !"] },
    { t: "timide", r: ["Euh… bonjour. Excuse-moi, je suis un peu pressé.", "Mbote… (il baisse les yeux et sourit)"] },
    { t: "colérique", r: ["Quoi encore ? Ces embouteillages m'ont déjà énervé ce matin !", "Laisse-moi tranquille, je n'ai pas le temps."] },
    { t: "généreux", r: ["Tu as faim ? Viens, je t'offre une brochette au coin de la rue.", "Si tu as besoin d'aide dans le quartier, demande-moi."] },
    { t: "drôle", r: ["Tu sais pourquoi le taxi jaune klaxonne ? Parce qu'il ne sait pas chanter ! Ha ha !", "Mbote ! Toi aussi tu marches parce que le taxi est trop cher ? (il rit)"] },
    { t: "ambitieux", r: ["Un jour, j'aurai ma propre entreprise sur le boulevard du 30 Juin.", "Je travaille dur : dans cinq ans je serai député !"] },
    { t: "méfiant", r: ["On se connaît ? … Bon, bonjour quand même.", "Fais attention à ton téléphone par ici."] },
    { t: "calme", r: ["Bonjour. Belle journée pour marcher, n'est-ce pas ?", "Doucement, doucement, on a le temps."] },
    { t: "curieux", r: ["Tu viens d'où ? Tu es nouveau dans la Gombe ?", "Tu as déjà visité l'Assemblée nationale ? Moi j'aimerais bien."] },
    { t: "fier", r: ["Moi, je suis un vrai Kinois, né ici !", "Regarde ma tenue : c'est la classe, non ?"] },
  ];
  const GOUTS = ["le football", "la rumba", "la mode (la sape)", "la cuisine (pondu, fumbwa)", "le basket", "la politique", "la religion", "les affaires", "le cinéma", "la lecture", "la danse", "les voitures"];
  const FORCES = ["sait négocier", "très travailleur", "bon en calcul", "beau parleur", "très sportif", "bon cuisinier", "connaît tout le monde", "habile de ses mains", "patient", "bon conducteur"];
  const FAIBLESSES = ["dépense trop", "toujours en retard", "s'énerve vite", "trop timide", "un peu paresseux", "fait trop confiance", "parle trop", "têtu", "mauvais en calcul", "oublie tout"];
  const VENDS = ["arachides grillées", "pain et beignets", "eau fraîche", "bananes", "cartes de recharge", "mouchoirs et chewing-gums"];
  const SUJETS = ["du match d'hier", "des prix au marché", "de la dernière chanson de rumba", "des embouteillages sur le boulevard", "du travail", "des élections à venir", "d'un mariage ce week-end", "de la famille", "d'un nouveau restaurant à Kintambo", "de la pluie qui arrive"];
  function ident(q) {
    if (q.idn) return q.idn;
    if (!q.id) q.id = ++pedSeq;
    const r = rng((q.id || 1) * 7919 + 13), pick = L => L[(r() * L.length) | 0];
    const look = window.__pedLook ? window.__pedLook(q) : null, woman = look ? !!look.woman : r() < .48;
    const N = woman ? NOMS_F : NOMS_H, nom = pick(N) + " " + pick(["Mbuyi", "Kabila", "Tshibanda", "Lukusa", "Nsimba", "Mukendi", "Ilunga", "Kanku", "Makiese", "Bokele", "Matondo", "Ngalula", "Mpiana", "Lokwa"]);
    const age = q.kit ? 18 + ((r() * 14) | 0) : q.cop ? 24 + ((r() * 25) | 0) : 16 + ((r() * 56) | 0);
    let home = null;
    if (FILL.length) { for (let k = 0; k < 6 && !home; k++) { const f = FILL[(r() * FILL.length) | 0]; if (Math.hypot(f.x - q.x, f.y - q.y) < 4000) home = f; } if (!home) home = FILL[(r() * FILL.length) | 0]; }
    const g1 = pick(GOUTS); let g2 = pick(GOUTS); if (g2 === g1) g2 = GOUTS[(GOUTS.indexOf(g1) + 3) % GOUTS.length];
    const st = () => 2 + ((r() * 9) | 0);
    q.idn = {
      nom, woman, age, commune: pick(COMMUNES), home,
      metier: q.cop ? (woman ? "policière (PNC)" : "policier (PNC)") : q.vendor ? "vendeur ambulant de " + q.vendor : q.market ? "commerçant au marché (" + q.market + ")" : q.kit ? "joueur amateur du quartier" : q.staff ? "vendeur" : (look && look.biz) ? pick(METIERS_BIZ) : pick(METIERS),
      car: CARACTERES[(r() * CARACTERES.length) | 0], gouts: [g1, g2], intel: st(), force: st(), charisme: st(),
      forte: pick(FORCES), faible: pick(FAIBLESSES),
    };
    if (q.kit) q.idn.force = Math.max(q.idn.force, 7);
    if (q.tourist) { q.idn.metier = "touriste venu" + (woman ? "e" : "") + " de " + pick(PAYS_TOURISTES); q.idn.commune = "en visite à Kinshasa"; q.idn.car = "curieux"; }
    return q.idn;
  }
  // un habitant sur sept rentre chez lui : itinéraire par les rues jusqu'à sa maison
  function planHome(q) {
    const I = ident(q);
    if (!I.home || Math.hypot(I.home.x - q.x, I.home.y - q.y) > 2500) { const near = FILL.filter(f => Math.abs(f.x - q.x) < 1800 && Math.abs(f.y - q.y) < 1800); if (!near.length) return; I.home = near[(rand() * near.length) | 0]; }
    const h = I.home;
    const path = findPath(q.to, nearestNode(h.x, h.y)); if (!path || path.length < 2) return;
    q.route = path.slice(1); q.goHome = true;
  }
  // policiers à pied : devant le commissariat et les institutions
  function placeFootCops() {
    const spots = [];
    PLACES.forEach(o => { const n = o.id === "police" ? 2 : ["mairie", "assemblee", "bcc", "justice", "zboss"].includes(o.id) ? 1 : 0; for (let k = 0; k < n; k++) { const u = (k ? 1 : -1) * (n > 1 ? 60 : 50), v = -o.d / 2 - 14; spots.push({ x: o.x + o.ux * u + o.nx * v, y: o.y + o.uy * u + o.ny * v, a: Math.atan2(-o.ny, -o.nx) }); } });
    spots.forEach(sp => { if (!walkBlocked(sp.x, sp.y)) G.peds.push({ x: sp.x, y: sp.y, a: sp.a, v: 0, t: rand() * 9, state: "idle", staff: true, cop: true, look: 3, id: ++pedSeq }); });
    const mk = PLACES.find(o => o.id === "marche");
    if (mk) { const goods = ["légumes", "poisson salé", "pagnes wax", "fruits", "téléphones", "épices", "chikwangue", "chaussures"]; let k = 0;
      for (const v of [-50, 50]) for (const u of [-120, -40, 40, 120]) { const x = mk.x + mk.ux * u + mk.nx * (v + (v < 0 ? -22 : 22)), y = mk.y + mk.uy * u + mk.ny * (v + (v < 0 ? -22 : 22)); G.peds.push({ x, y, a: Math.atan2(-mk.ny * Math.sign(v), -mk.nx * Math.sign(v)), v: 0, t: rand() * 9, state: "idle", staff: true, market: goods[k++ % goods.length], look: (rand() * 7) | 0, id: ++pedSeq }); } }
  }
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
      const q = { x, y, a: Math.atan2(dy, dx), from: n, to: m, side, off, v: 11 + rand() * 7, t: rand() * 9, state: "walk", st: 0, look: (rand() * 7) | 0, id: ++pedSeq };
      if (WALK && rand() < .07) { q.cop = true; q.v = 10; }
      else if (WALK && rand() < .08) { q.vendor = VENDS[(rand() * VENDS.length) | 0]; q.v = 9; }
      else if (WALK && rand() < (G.hour >= 17 || G.hour < 5 ? .5 : .14)) planHome(q);
      G.peds.push(q);
      return;
    }
  }
  function pedTarget(q) {
    const A = nodes[q.from], B = nodes[q.to], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    return { x: B.x - dy / L * q.off * q.side, y: B.y + dx / L * q.off * q.side };
  }
  function pedStep(q, dt, cars) {
    if (q.play) return;
    if (q.bus) { busPed(q, dt); return; }
    q.t += dt;
    if (q.talk) { // le joueur lui parle : il s'arrête et le regarde
      q.talk -= dt; q.state = "idle"; const f = G.foot; if (f) { const da = angDiff(q.a, Math.atan2(f.y - q.y, f.x - q.x)); q.a += Math.max(-4 * dt, Math.min(4 * dt, da)); }
      if (q.talk <= 0) { q.talk = 0; q.state = q.staff ? "idle" : "walk"; } return;
    }
    if (q.chat) { // conversation entre passants
      const c = q.chat, o = c.with; c.t -= dt; q.state = "idle";
      const da = angDiff(q.a, Math.atan2(o.y - q.y, o.x - q.x)); q.a += Math.max(-4 * dt, Math.min(4 * dt, da));
      q.speak = Math.floor((G.t + c.ph) / 2.2) % 2 === 0;
      if (c.t <= 0 || !G.peds.includes(o)) { q.chat = null; q.speak = false; q.chatCd = G.t + 25 + rand() * 20; q.state = q.staff ? "idle" : "walk"; }
      return;
    }
    if (q.enter) { // arrivé devant chez lui : il entre et disparaît
      const h = q.enter; q.state = "walk"; const tx = h.x, ty = h.y;
      const da = angDiff(q.a, Math.atan2(ty - q.y, tx - q.x)); q.a += Math.max(-4 * dt, Math.min(4 * dt, da));
      const nx = q.x + Math.cos(q.a) * q.v * dt, ny = q.y + Math.sin(q.a) * q.v * dt; q.enterT = (q.enterT || 0) + dt;
      if (!walkBlocked(nx, ny)) { q.x = nx; q.y = ny; } else q.home = true;
      if (q.home || q.enterT > 14) { q.gone = true; const f = G.foot; if (f && Math.hypot(f.x - q.x, f.y - q.y) < 260) msg(q.tourist ? "📸 " + ident(q).nom + " (touriste) entre visiter " + (q.visit || "le lieu") + "." : "🏠 " + ident(q).nom + " rentre chez lui" + (ident(q).woman ? "… chez elle." : "."), 2.5); }
      return;
    }
    if (q.greet) { // un passant vient saluer le personnage assis
      const g = q.greet, f = G.foot;
      if (!f || !f.sit) { q.greet = null; q.state = "walk"; }
      else {
        const d = Math.hypot(g.x - q.x, g.y - q.y);
        if (d > 8 && !g.here) { q.state = "walk"; const da = angDiff(q.a, Math.atan2(g.y - q.y, g.x - q.x)); q.a += Math.max(-5 * dt, Math.min(5 * dt, da)); const nx = q.x + Math.cos(q.a) * 16 * dt, ny = q.y + Math.sin(q.a) * 16 * dt; if (!walkBlocked(nx, ny)) { q.x = nx; q.y = ny; } else q.a += 1; g.t += dt; if (g.t > 25) { q.greet = null; } }
        else { g.here = true; q.state = "idle"; q.a = Math.atan2(f.y - q.y, f.x - q.x); g.w = (g.w || 0) + dt; if (!g.met && g.w > .6) { g.met = true; meet(q); } if (g.w > 6) { q.greet = null; q.state = "walk"; } }
        return;
      }
    }
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
    if (Math.hypot(t.x - q.x, t.y - q.y) < 14) {
      if (q.route && !q.route.length) { q.route = null; q.enter = ident(q).home; return; }
      const nx = nodes[q.to].nb.filter(m => m !== q.from); const m = q.route ? q.route.shift() : nx.length ? nx[(rand() * nx.length) | 0] : q.from; q.from = q.to; q.to = m; t = pedTarget(q);
    }
    const da = angDiff(q.a, Math.atan2(t.y - q.y, t.x - q.x)); q.a += Math.max(-4 * dt, Math.min(4 * dt, da));
    const nx = q.x + Math.cos(q.a) * q.v * dt, ny = q.y + Math.sin(q.a) * q.v * dt;
    if (!walkBlocked(nx, ny)) { q.x = nx; q.y = ny; }
    else { // mur devant : glisser le long, puis se rapprocher de la chaussée
      if (!walkBlocked(nx, q.y)) q.x = nx; else if (!walkBlocked(q.x, ny)) q.y = ny; else q.a += 1.2;
      q.off = Math.max(4, q.off - 2);
    }
  }
  // ---------------------------------------------------------------- collisions : rien ne se traverse
  // obstacles fixes (bancs, panneaux, feux, étals, palmiers, lampadaires) rangés dans une grille
  const OBST = [], OG = new Map(), OGC = 128, ogKey = (i, j) => i * 100000 + j;
  function addObst(o) { // o : { x, y, r } (cercle) ou { x, y, ux, uy, hw, hh } (boîte orientée)
    const R = o.r || Math.hypot(o.hw, o.hh); OBST.push(o);
    for (let i = Math.floor((o.x - R) / OGC); i <= Math.floor((o.x + R) / OGC); i++) for (let j = Math.floor((o.y - R) / OGC); j <= Math.floor((o.y + R) / OGC); j++) { const k = ogKey(i, j); if (!OG.has(k)) OG.set(k, []); OG.get(k).push(o); }
  }
  function obstNear(x, y) { return OG.get(ogKey(Math.floor(x / OGC), Math.floor(y / OGC))) || []; }
  // repousse un cercle (x, y, r) hors d'un obstacle ; renvoie le décalage ou null
  function pushOut(o, x, y, r) {
    if (o.r) { const dx = x - o.x, dy = y - o.y, d = Math.hypot(dx, dy), m = o.r + r; if (d >= m) return null; const k = d > .01 ? (m - d) / d : 0; return d > .01 ? [dx * k, dy * k] : [m, 0]; }
    const dx = x - o.x, dy = y - o.y, u = dx * o.ux + dy * o.uy, v = -dx * o.uy + dy * o.ux;
    const cu = Math.max(-o.hw, Math.min(o.hw, u)), cv = Math.max(-o.hh, Math.min(o.hh, v)), eu = u - cu, ev = v - cv, d = Math.hypot(eu, ev);
    if (d >= r) return null;
    let pu, pv;
    if (d > .01) { pu = eu / d * (r - d); pv = ev / d * (r - d); }
    else { const ou = o.hw - Math.abs(u), ov = o.hh - Math.abs(v); if (ou < ov) { pu = Math.sign(u || 1) * (ou + r); pv = 0; } else { pu = 0; pv = Math.sign(v || 1) * (ov + r); } }
    return [pu * o.ux - pv * o.uy, pu * o.uy + pv * o.ux];
  }
  (function buildObstacles() {
    BENCHES.forEach(b => { const ux = Math.cos(b.a + Math.PI / 2), uy = Math.sin(b.a + Math.PI / 2); addObst({ x: b.x, y: b.y, ux, uy, hw: 9, hh: 2.6, bench: b }); });
    BILLBOARDS.forEach(b => addObst({ x: b.x, y: b.y, r: 3 }));   // un seul mât central
    LIGHTS.forEach(L => { const ca = Math.cos(L.ax), sa = Math.sin(L.ax), off = L.w / 2 + 10; addObst({ x: L.x + (ca - sa) * off * .75, y: L.y + (sa + ca) * off * .75, r: 2.5 }); });
    PLACES.filter(o => o.type === "marche").forEach(mk => { for (const v of [-50, 50]) for (const u of [-120, -40, 40, 120]) addObst({ x: mk.x + mk.ux * u + mk.nx * v, y: mk.y + mk.uy * u + mk.ny * v, ux: mk.ux, uy: mk.uy, hw: 27, hh: 11 }); });
  })();
  const PED_R = 4;
  // voiture (boîte orientée) contre piéton : le piéton est repoussé hors de la carrosserie
  function pushFromCar(c, x, y, r) { return pushOut({ x: c.x, y: c.y, ux: Math.cos(c.a), uy: Math.sin(c.a), hw: c.hl || CAR_HL, hh: c.hw || CAR_HW }, x, y, r); }
  function moveBody(q, d) { const nx = q.x + d[0], ny = q.y + d[1]; if (!walkBlocked(nx, ny)) { q.x = nx; q.y = ny; return true; } if (!walkBlocked(nx, q.y)) { q.x = nx; return true; } if (!walkBlocked(q.x, ny)) { q.y = ny; return true; } return false; }
  // piétons et personnage : contre les obstacles fixes, les voitures et entre eux
  function resolveBodies(cars) {
    const f = G.foot, bodies = G.peds.filter(q => !q.play && !q.gone && !q.enter && !(q.bus && q.bus.phase === "board"));
    if (f && !f.sit && !f.inBus) bodies.push(f);
    const grid = new Map(), gk = (x, y) => ogKey(Math.floor(x / 32), Math.floor(y / 32));
    for (const q of bodies) {
      for (const o of obstNear(q.x, q.y)) { const d = pushOut(o, q.x, q.y, PED_R); if (d) moveBody(q, d); }
      for (const c of cars) { if (Math.abs(c.x - q.x) > 60 || Math.abs(c.y - q.y) > 60) continue; const d = pushFromCar(c, q.x, q.y, PED_R); if (d) moveBody(q, d); }
      const k = gk(q.x, q.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(q);
    }
    const min = PED_R * 2;
    bodies.forEach((q, i) => { q._ci = i; });
    for (const q of bodies) {
      const i0 = Math.floor(q.x / 32), j0 = Math.floor(q.y / 32);
      for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const o of grid.get(ogKey(i, j)) || []) {
        if (o._ci <= q._ci) continue;   // chaque paire une seule fois
        if ((q.chat && q.chat.with === o) || (o.chat && o.chat.with === q)) continue;
        const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy); if (d >= min) continue;
        const n = d > .01 ? 1 / d : 0, push = (min - d) / 2, ux = n ? dx * n : 1, uy = n ? dy * n : 0;
        // les vendeurs et policiers postés ne bougent pas : c'est le passant qui s'écarte
        const qs = q.staff && q !== f, os = o.staff && o !== f;
        if (!qs) moveBody(q, [ux * (os ? push * 2 : push), uy * (os ? push * 2 : push)]);
        if (!os) moveBody(o, [-ux * (qs ? push * 2 : push), -uy * (qs ? push * 2 : push)]);
      }
    }
  }
  // voitures contre obstacles fixes
  function carVsStatic(c) {
    if (c.parked) return;
    for (const [x, y] of carDiscs(c)) for (const o of obstNear(x, y)) {
      const d = pushOut(o, x, y, c.hw || CAR_HW); if (!d) continue;
      c.x += d[0]; c.y += d[1]; const l = Math.hypot(d[0], d[1]) || 1; impact(c, d[0] / l, d[1] / l, .2);
    }
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
    for (const c of [G.player, ...G.traffic, ...G.cops, ...G.parked, ...(G.buses || [])]) { if (Math.abs(f.x - c.x) > 60 || Math.abs(f.y - c.y) > 60) continue; const d = pushFromCar(c, f.x, f.y, PED_R); if (d) moveBody(f, d); }
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
  // ---- les habitants se parlent : deux ou trois passants s'arrêtent pour discuter
  function chatUpdate(dt) {
    G.chatT -= dt; if (G.chatT > 0) return; G.chatT = 1.2 + rand();
    const f = G.foot || G.player, free = q => !q.play && !q.chat && !q.talk && !q.greet && !q.enter && !q.cop && q.state === "walk" && !(q.chatCd > G.t);
    const cand = G.peds.filter(q => free(q) && Math.abs(q.x - f.x) < 800 && Math.abs(q.y - f.y) < 800);
    if (G.peds.filter(q => q.chat).length >= 14) return;
    for (const a of cand) {
      const b = cand.find(o => o !== a && free(o) && Math.hypot(o.x - a.x, o.y - a.y) < 90);
      if (!b) continue;
      const t = 7 + rand() * 9, ph = rand() * 4;
      a.chat = { with: b, t, ph }; b.chat = { with: a, t, ph: ph + 2.2 };
      const c = cand.find(o => o !== a && o !== b && free(o) && Math.hypot(o.x - a.x, o.y - a.y) < 110 && rand() < .5);
      if (c) c.chat = { with: a, t: t - 1, ph: ph + 1.1 };
      if (Math.hypot(a.x - f.x, a.y - f.y) < 260 && G.foot && !(G.chatMsgT > G.t)) {
        G.chatMsgT = G.t + 14; const A = ident(a), B = ident(b), com = A.gouts.find(x => B.gouts.includes(x));
        msg("💬 " + A.nom.split(" ")[0] + " et " + B.nom.split(" ")[0] + (c ? " (avec " + ident(c).nom.split(" ")[0] + ")" : "") + " parlent " + (com ? "de " + com : SUJETS[(rand() * SUJETS.length) | 0]) + ".", 3.5);
      }
      return;
    }
  }
  function nearPed() {
    const f = G.foot; if (!f) return null;
    let best = null, bd = 42;
    for (const q of G.peds) { if (q.play || q.enter) continue; const d = Math.hypot(q.x - f.x, q.y - f.y); if (d < bd) { bd = d; best = q; } }
    return best;
  }
  function talkTo(q) {
    if (!q || $("pedpanel")) return;
    const I = ident(q), f = G.foot; q.talk = 9; if (q.chat) { const o = q.chat.with; if (o && o.chat) { o.chat = null; o.state = "walk"; } q.chat = null; }
    const R = relations.get(), known = R.find(r => r.pid === q.id);
    if (!q.cop) meet(q);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const bar = (n, lab) => `<div class="pp-bar"><span>${lab}</span><i><b style="width:${n * 10}%"></b></i><em>${n}/10</em></div>`;
    const dist = I.home ? Math.round(Math.hypot(I.home.x - q.x, I.home.y - q.y) / 10 / 100) / 10 : null;
    const reply = q.cop ? ["Bonjour citoyen. Tout est calme dans le secteur, circulez.", "Respectez le code de la route et tout ira bien.", "Si vous voyez quelque chose de suspect, venez au commissariat."][(rand() * 3) | 0] : I.car.r[(rand() * I.car.r.length) | 0];
    const wasPaused = G.paused; G.paused = true;
    const d = document.createElement("div"); d.id = "pedpanel"; d.className = "bureau";
    d.innerHTML = `<div class="bureau-box" role="dialog" aria-modal="true" aria-labelledby="pp-t"><button type="button" class="bureau-x" aria-label="Fermer">✕</button>
      <p class="bureau-k">${q.cop ? "🚓 Police nationale" : known ? "🤝 " + relLevel(known.fois + 1) : "👋 Nouvelle rencontre"}</p><h2 id="pp-t">${esc(I.nom)}, ${I.age} ans</h2>
      <p class="pp-say">« ${esc(reply)} »</p>
      <div class="pp-grid"><p><b>Métier</b><br>${esc(I.metier)}</p><p><b>Chez soi</b><br>${esc(I.commune)}${dist !== null ? ` · à ${dist.toString().replace(".", ",")} km d'ici` : ""}</p>
      <p><b>Caractère</b><br>${esc(I.car.t)}</p><p><b>Aime</b><br>${esc(I.gouts.join(" et "))}</p>
      <p><b>Point fort</b><br>${esc(I.forte)}</p><p><b>Point faible</b><br>${esc(I.faible)}</p></div>
      ${bar(I.intel, "Intelligence")}${bar(I.force, "Force")}${bar(I.charisme, "Charisme")}
      <p style="font-size:12px;opacity:.7;margin-top:12px">Habitant non joueur. Les personnages des vrais joueurs auront aussi leur fiche, avec leurs talents découverts.</p></div>`;
    document.body.appendChild(d);
    const close = () => { d.remove(); if (G) G.paused = wasPaused; };
    d.querySelector(".bureau-x").onclick = close; d.addEventListener("click", e => { if (e.target === d) close(); });
    d.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") close(); });
    d.querySelector(".bureau-x").focus();
  }
  function updatePrompt() {
    const p = G.player, sp = Math.hypot(p.vx, p.vy);
    let txt = "", act = null, np = null;
    if (!G.foot) {
      const shop = SHOPS.find(o => Math.hypot(o.x - p.x, o.y - p.y) < 520);
      if (WALK && G.auto) { txt = "🚕 " + (G.auto.doing || "En taxi"); act = "autostop"; }
      else if (WALK) { if (sp < 60) { txt = "Descendre du taxi"; act = "exit"; } else if ((np = nearPlace(p.x, p.y))) txt = np.icone + " " + np.nom; }
      else if (sp < 60 && !G.chase) { txt = shop ? "Descendre et entrer dans la concession" : "Descendre de la voiture"; act = "exit"; }
      else if (shop && !G.chase) txt = "Concession 2 Life Motors : arrête-toi pour entrer";
    } else {
      const ns = WALK ? null : nearSlot(G.foot.x, G.foot.y);
      const bench = WALK && !G.foot.sit && BENCHES.find(b => !b.taken && Math.hypot(b.x - G.foot.x, b.y - G.foot.y) < 30);
      if (WALK && G.auto) { txt = "🚶 " + (G.auto.doing || "Promenade automatique"); act = "autostop"; }
      else if (WALK && G.foot.sit) { txt = "🪑 Assis : il observe et rencontre des gens"; act = "stand"; }
      else if (WALK && Math.hypot(G.foot.x - p.x, G.foot.y - p.y) < 50) { txt = "Prendre le taxi"; act = "enter"; }
      else if (bench) { txt = "🪑 S'asseoir sur le banc"; act = "sit"; }
      else if (WALK && (G.talkQ = nearPed())) { const I = ident(G.talkQ); txt = (G.talkQ.cop ? "🚓 Parler à l'agent " : "💬 Parler à ") + I.nom.split(" ")[0] + " (" + I.car.t + ")"; act = "talk"; }
      else if (WALK && (np = nearPlace(G.foot.x, G.foot.y)) && np.bureau) { txt = np.icone + " " + np.nom + " · entrer au guichet d'aide"; act = "bureau"; }
      else if (WALK && np) txt = np.icone + " " + np.nom + " · " + (isOpen(np, G.hour) ? np.statut : "Fermé à cette heure (ouvre à " + HOURS[np.type][0] + " h)");
      else if (WALK) txt = "Promenade à pied dans la Gombe. Le taxi jaune est sur la carte.";
      else if (ns) { txt = ns.car.id === p.carDef.id ? ns.car.name + " : c'est déjà ta voiture" : "Prendre la " + ns.car.name + " (" + ns.car.cls + ")"; act = ns.car.id === p.carDef.id ? null : "pick"; }
      else if (Math.hypot(G.foot.x - p.x, G.foot.y - p.y) < 50) { txt = "Monter dans la voiture"; act = "enter"; }
      else txt = "À pied. Reviens à ta voiture pour repartir.";
    }
    if (WALK && G.phase) { txt = (G.phase === "nuit" ? (G.auto && G.auto.doing) || G.lifeMsg : G.lifeMsg || (G.auto && G.auto.doing) || txt) + (G.phase === "matin" ? " · 📋 consignes possibles" : " · 👀 tu observes"); act = null; }
    G.prompt = txt; G.act = act;
  }
  // ---- bureau Zboss Sarlu : guichet d'aide (questions fréquentes + signaler un problème)
  const BUREAU_FAQ = [
    ["Je n'arrive pas à me connecter", "Vérifie ton e-mail et ton mot de passe sur la page Ma vie. Si tu as oublié ton mot de passe, signale-le ici : l'équipe te répondra par e-mail."],
    ["Mon personnage est malade ou a faim", "Va à l'hôpital ou dans une alimentation, ou donne la consigne « Se soigner » ou « Manger » depuis Ma vie. Sans soins, la santé baisse chaque jour."],
    ["Mes consignes n'ont pas été faites", "Les consignes passent quand tu te connectes et toutes les 15 minutes. Si l'argent manque, la consigne échoue : regarde « Tous mes mouvements »."],
    ["Je suis en prison", "Tu peux payer la caution de 500 e-makuta depuis Ma vie, ou attendre 24 heures."],
    ["Je veux signaler un joueur ou un bug", "Utilise le formulaire ci-dessous. Décris ce qui s'est passé, où et quand."],
  ];
  const CATS = ["Compte et connexion", "Argent et e-makuta", "Personnage (santé, famille, prison)", "Entreprise et travail", "Bug du jeu", "Signaler un joueur", "Autre"];
  function openBureau() {
    if (!G || $("bureau")) return;
    G.paused = true; for (const k in keys) keys[k] = false;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const d = document.createElement("div"); d.id = "bureau"; d.className = "bureau";
    d.innerHTML = `<div class="bureau-box" role="dialog" aria-modal="true" aria-labelledby="bureau-t">
      <button type="button" class="bureau-x" aria-label="Fermer">✕</button>
      <p class="bureau-k">🏢 Centre-ville · Gombe</p><h2 id="bureau-t">Zboss Sarlu · guichet d'aide</h2>
      <p>Bienvenue ! Ici on règle les problèmes des joueurs. Regarde d'abord les réponses rapides, sinon laisse ta demande à l'agent.</p>
      <div class="bureau-faq">${BUREAU_FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>
      <form id="bureau-f"><h3>Signaler un problème</h3>
        <label>Sujet<select name="categorie">${CATS.map(c => `<option>${esc(c)}</option>`).join("")}</select></label>
        <label>Ton problème<textarea name="message" rows="4" maxlength="2000" required placeholder="Explique ce qui se passe…"></textarea></label>
        <div class="bureau-2"><label>Pseudo<input name="pseudo" maxlength="40" placeholder="Ton pseudo"></label><label>E-mail (pour la réponse)<input name="email" type="email" maxlength="254" placeholder="toi@exemple.com"></label></div>
        <button class="btn btn-primary" type="submit">Envoyer à Zboss Sarlu</button><p class="bureau-msg" id="bureau-msg" role="status"></p>
      </form></div>`;
    document.body.appendChild(d);
    const close = () => { d.remove(); if (G) G.paused = false; };
    d.querySelector(".bureau-x").onclick = close;
    d.addEventListener("click", e => { if (e.target === d) close(); });
    d.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") close(); });
    d.addEventListener("keyup", e => e.stopPropagation());
    const f = d.querySelector("#bureau-f"), out = d.querySelector("#bureau-msg");
    f.onsubmit = async e => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(f)); b.page = "jouer";
      if (String(b.message || "").trim().length < 5) { out.textContent = "Écris quelques mots sur ton problème."; return; }
      const API = (window.TWO_LIFE_API || "").replace(/\/$/, "");
      f.querySelector("button[type=submit]").disabled = true;
      try {
        if (API) {
          let t = null; try { t = JSON.parse(localStorage.getItem("twolife_token")); } catch (er) { }
          const r = await fetch(API + "/api/support", { method: "POST", headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: JSON.stringify(b) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.erreur || "Le bureau ne répond pas, réessaie plus tard.");
        } else {
          let L = []; try { L = JSON.parse(localStorage.getItem("twolife_demo_support") || "[]"); } catch (er) { }
          L.unshift({ ...b, id: Date.now().toString(36), statut: "ouvert", cree_le: Date.now() }); try { localStorage.setItem("twolife_demo_support", JSON.stringify(L.slice(0, 200))); } catch (er) { }
        }
        f.reset(); out.textContent = "Merci ! Ta demande est bien arrivée chez Zboss Sarlu. L'équipe te répond au plus vite.";
      } catch (er) { out.textContent = er.message; }
      f.querySelector("button[type=submit]").disabled = false;
    };
    setTimeout(() => d.querySelector("summary").focus(), 30);
  }
  function doAction() {
    const p = G.player;
    if (G.act === "exit") {
      const rx = Math.sin(p.a), ry = -Math.cos(p.a);
      let x = p.x + rx * 26, y = p.y + ry * 26; if (walkBlocked(x, y)) { x = p.x - rx * 26; y = p.y - ry * 26; }
      G.foot = { x, y, a: p.a, v: 0, t: 0 }; p.vx = p.vy = 0;
      msg("À pied : flèches pour marcher, Maj pour courir, E pour monter", 3);
    } else if (G.act === "sit") {
      const b = BENCHES.filter(b => !b.taken).sort((b1, b2) => Math.hypot(b1.x - G.foot.x, b1.y - G.foot.y) - Math.hypot(b2.x - G.foot.x, b2.y - G.foot.y))[0]; if (b) sitDown(b);
    } else if (G.act === "stand") {
      standUp();
    } else if (G.act === "autostop") {
      autoToggle(false);
    } else if (G.act === "bureau") {
      openBureau();
    } else if (G.act === "talk") {
      talkTo(G.talkQ);
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
  // ---------------------------------------------------------------- Vie autonome du personnage (visite à pied)
  // Le personnage peut se promener seul : il suit les trottoirs jusqu'à un lieu, s'assoit sur les bancs,
  // fait des rencontres, et quand il est fatigué il appelle un taxi pour aller ailleurs ou rentrer à la maison.
  function findPath(a, b) {
    if (a === b) return [a];
    const B = nodes[b], gS = new Map([[a, 0]]), came = new Map(), heap = [[0, a]], done = new Set();
    const push = (f, n) => { heap.push([f, n]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    let it = 0;
    while (heap.length && it++ < 40000) {
      const [, n] = pop(); if (done.has(n)) continue; done.add(n);
      if (n === b) { const out = [b]; let c = b; while (came.has(c)) { c = came.get(c); out.push(c); } return out.reverse(); }
      const N = nodes[n];
      for (const m of N.nb) {
        const M = nodes[m], g = gS.get(n) + Math.hypot(M.x - N.x, M.y - N.y);
        if (g < (gS.has(m) ? gS.get(m) : Infinity)) { gS.set(m, g); came.set(m, n); push(g + Math.hypot(B.x - M.x, B.y - M.y), m); }
      }
    }
    return null;
  }
  const edgePoint = (from, to, off) => { const A = nodes[from], Bn = nodes[to], dx = Bn.x - A.x, dy = Bn.y - A.y, L = Math.hypot(dx, dy) || 1; return { x: Bn.x - dy / L * off, y: Bn.y + dx / L * off }; };
  const HOME = () => PLACES.find(o => o.id === "maison");
  const NOMS_H = ["Patou", "Junior", "Fiston", "Héritier", "Christian", "Papy", "Glody", "Trésor", "Jonathan", "Dieumerci", "Cédric", "Blaise"];
  const NOMS_F = ["Mireille", "Dorcas", "Grâce", "Merveille", "Rachel", "Exaucée", "Nathalie", "Bijou", "Christelle", "Sarah", "Ornella", "Divine"];
  const REL_KEY = "twolife_relations";
  const relations = { get() { try { return JSON.parse(lsGet(REL_KEY) || "[]"); } catch (e) { return []; } }, set(v) { lsSet(REL_KEY, JSON.stringify(v.slice(0, 200))); } };
  const relLevel = n => n >= 4 ? "Ami proche" : n >= 2 ? "Ami" : "Connaissance";

  // ---- sorties : promenade, tourisme, footing, match, courses, soirée, maison
  const SORTIES = [
    { id: "promenade", ic: "🚶", nom: "Promenade", txt: "Il marche au hasard, visite des lieux et s'assoit sur les bancs." },
    { id: "tourisme", ic: "📸", nom: "Tourisme", txt: "Visite guidée des lieux à voir : institutions, stade, bureau Zboss Sarlu." },
    { id: "bus", ic: "🚌", nom: "Tour en bus", txt: "Il prend le bus de la ligne 1, regarde la ville défiler et descend visiter un lieu." },
    { id: "footing", ic: "🏃", nom: "Footing", txt: "Il court d'un banc à l'autre. Bon pour la santé, mais fatigant." },
    { id: "match", ic: "⚽", nom: "Voir un match", txt: "Il va au stade ou au terrain de basket et regarde le match depuis un banc." },
    { id: "courses", ic: "🛒", nom: "Courses", txt: "Alimentations et magasins : il fait le tour des boutiques." },
    { id: "soiree", ic: "🪩", nom: "Soirée", txt: "Il sort en boîte de nuit (réservé aux 18 ans et plus)." },
    { id: "maison", ic: "🏠", nom: "Rentrer à la maison", txt: "Il rentre chez lui et se repose." },
  ];
  const SORTIE = id => SORTIES.find(o => o.id === id) || { id, ic: id === "travail" ? "💼" : "🪑", nom: id === "travail" ? "Travail" : "Rencontres" };
  let lastSortie = "promenade";
  function openSorties() {
    if (!G || !WALK || $("sortpanel")) return;
    openPlan(); return;
    const wasPaused = G.paused; G.paused = true;
    const d = document.createElement("div"); d.id = "sortpanel"; d.className = "bureau";
    d.innerHTML = `<div class="bureau-box" role="dialog" aria-modal="true" aria-labelledby="sort-t"><button type="button" class="bureau-x" aria-label="Fermer">✕</button>
      <p class="bureau-k">🚶 Sortie automatique</p><h2 id="sort-t">Où va ton personnage ?</h2>
      <p>Il se déplace seul. S'il est fatigué, il prend un taxi. Touche une flèche pour reprendre la main.</p>
      <div class="sorties">${SORTIES.map(o => `<button type="button" data-s="${o.id}"><b>${o.ic} ${o.nom}</b><span>${o.txt}</span></button>`).join("")}</div></div>`;
    document.body.appendChild(d);
    const close = () => { d.remove(); if (G) G.paused = wasPaused; };
    d.querySelector(".bureau-x").onclick = close; d.addEventListener("click", e => { if (e.target === d) close(); });
    d.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") close(); });
    d.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { close(); autoToggle(true, b.dataset.s); });
    const f = d.querySelector("[data-s]"); if (f) f.focus();
  }
  function autoToggle(on, mode, silent) {
    if (!G || !WALK) return;
    if (!silent) { openPlan(); return; }
    if (on === undefined) on = !G.auto;
    if (on) {
      if (!G.foot) { msg("Descends d'abord du taxi pour te promener seul.", 2.5); return; }
      if (G.foot.sit) standUp(true);
      if (G.foot.inBus) { const d = busDoor(G.foot.inBus); G.foot.inBus = null; G.foot.x = d.x; G.foot.y = d.y; }
      mode = mode || lastSortie; lastSortie = mode;
      G.auto = { phase: "walk", path: null, mode, seen: [] };
      if (mode === "tourisme") G.auto.tour = tourPlan();
      const S = SORTIE(mode);
      if (!silent) msg(S.ic + " " + S.nom + " : ton personnage se débrouille seul. Touche une flèche pour reprendre la main.", 4, "ok");
    } else if (G.auto) {
      const ride = G.auto.phase === "ride";
      G.auto = null; if (ride) { G.player.inp.gas = 0; G.player.inp.brake = 1; }
      msg("Tu reprends la main.", 2);
    }
    const b = $("autobtn"); if (b) b.setAttribute("aria-pressed", G.auto ? "true" : "false");
  }
  // circuit touristique : les lieux à voir, dans l'ordre le plus court
  function tourPlan() {
    const f = G.foot; let left = PLACES.filter(o => GUIDE[o.id]), x = f.x, y = f.y; const out = [];
    while (left.length) { left.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)); const o = left.shift(); out.push(o); x = o.x; y = o.y; }
    return out;
  }
  const toPlace = o => ({ x: o.door.x, y: o.door.y, nom: o.nom, icone: o.icone, place: o });
  function pickDestination() {
    const A = G.auto, f = G.foot, mode = A.mode || "promenade";
    if (mode === "maison") { const h = HOME(); return h ? { x: h.door.x, y: h.door.y, nom: "la maison", icone: "🏠", home: true, place: h } : null; }
    if (mode === "travail") { const w = PLACES.find(o => o.id === (G.me && G.me.lieu) ) || PLACES.find(o => o.id === "zboss"); if (w) return Object.assign(toPlace(w), { work: true }); }
    const nearestOpen = types => PLACES.filter(o => types.includes(o.type) && isOpen(o, G.hour)).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
    if (mode === "manger") { const o = PLACES.find(o => o.id === "maquis" && isOpen(o, G.hour)) || nearestOpen(["alim", "marche"]); if (o) return Object.assign(toPlace(o), { eat: true }); const h = HOME(); return { x: h.door.x, y: h.door.y, nom: "la maison", icone: "🏠", home: true, eat: true, place: h }; }
    if (mode === "business") { const o = nearestOpen(["marche"]) || nearestOpen(["alim", "magasin"]); if (o) return Object.assign(toPlace(o), { biz: true }); }
    if (mode === "vol") { const o = nearestOpen(["marche", "alim", "magasin"]); if (o) return Object.assign(toPlace(o), { steal: true }); }
    if (mode === "rendezvous") {
      const o = PLACES.find(o => o.id === "maquis" && isOpen(o, G.hour)) || nearestOpen(["alim", "marche"]);
      if (o) return Object.assign(toPlace(o), { date: true });
      const bs = BENCHES.filter(b => !b.taken); const b = bs[(rand() * bs.length) | 0]; if (b) return { x: b.x, y: b.y, nom: "un banc en amoureux", icone: "🌹", bench: b, date: true };
    }
    if (mode === "petitboulot") { const o = nearestOpen(["marche", "alim", "magasin"]); if (o) return Object.assign(toPlace(o), { street: true }); }
    if (mode === "aider") { const o = nearestOpen(["marche", "alim"]); if (o) return Object.assign(toPlace(o), { help: true }); }
    if (mode === "draguer") {
      if (G.hour >= 20) { const o = nearestOpen(["club"]); if (o) return Object.assign(toPlace(o), { flirt: true }); }
      const bs = BENCHES.filter(b => !b.taken).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y)); const b = bs[(rand() * Math.min(4, bs.length)) | 0];
      if (b) return { x: b.x, y: b.y, nom: "un banc pour draguer", icone: "💘", bench: b, flirt: true };
    }
    if (mode === "rencontres") {
      const bs = BENCHES.filter(b => !b.taken).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y));
      const b = bs[(rand() * Math.min(4, bs.length)) | 0]; if (b) return { x: b.x, y: b.y, nom: "un banc pour rencontrer des gens", icone: "🪑", bench: b, meet: true };
    }
    if (mode === "bus") {   // il marche jusqu'à l'arrêt le plus proche
      const st = nearestStop(f.x, f.y); if (st) return { x: st.wx, y: st.wy, nom: st.nom, icone: "🚏", busStop: st };
      A.mode = "promenade";
    }
    if (mode === "tourisme") {
      const o = A.tour && A.tour.shift();
      if (!o) { msg("📸 Fin de la visite guidée ! Ton personnage continue en promenade.", 4, "ok"); A.mode = "promenade"; return pickDestination(); }
      return Object.assign(toPlace(o), { guide: GUIDE[o.id] });
    }
    if (mode === "match") {
      const games = PLACES.filter(o => o.type === "foot" || o.type === "basket");
      const g = games.sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[A.seen.length % Math.max(1, games.length)];
      const bs = g && BENCHES.filter(b => b.place === g.id && !b.taken);
      if (bs && bs.length) { const b = bs[(rand() * bs.length) | 0]; A.seen.push(g.id); return { x: b.x, y: b.y, nom: "un banc au " + g.nom, icone: g.icone, bench: b, match: true }; }
      if (g) { A.seen.push(g.id); return toPlace(g); }
    }
    if (mode === "courses" || mode === "soiree") {
      const types = mode === "courses" ? ["alim", "magasin", "marche"] : ["club"];
      let list = PLACES.filter(o => types.includes(o.type) && !A.seen.includes(o.id) && isOpen(o, G.hour));
      if (!list.length) { A.seen = []; list = PLACES.filter(o => types.includes(o.type) && isOpen(o, G.hour)); }
      const o = list.sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
      if (o) { A.seen.push(o.id); return toPlace(o); }
    }
    if (mode === "footing") {
      const bs = BENCHES.filter(b => !b.taken && Math.hypot(b.x - f.x, b.y - f.y) > 500 && Math.hypot(b.x - f.x, b.y - f.y) < 2200);
      if (bs.length) { const b = bs[(rand() * bs.length) | 0]; return { x: b.x, y: b.y, nom: "un banc (pause footing)", bench: b }; }
    }
    const here = nearPlace(f.x, f.y);
    const benches = BENCHES.filter(b => !b.taken && Math.hypot(b.x - f.x, b.y - f.y) > 200 && Math.hypot(b.x - f.x, b.y - f.y) < 2600);
    const places = PLACES.filter(o => o !== here && o.id !== "maison" && Math.hypot(o.x - f.x, o.y - f.y) < 3000);
    if (benches.length && (rand() < .5 || !places.length)) { const b = benches[(rand() * benches.length) | 0]; return { x: b.x, y: b.y, nom: "un banc", bench: b }; }
    if (places.length) { const o = places[(rand() * places.length) | 0]; return { x: o.door.x, y: o.door.y, nom: o.nom, icone: o.icone, place: o }; }
    return null;
  }
  function planWalk(dest) {
    const f = G.foot, a = nearestNode(f.x, f.y), b = nearestNode(dest.x, dest.y), path = findPath(a, b);
    G.auto.dest = dest; G.auto.path = path || [a]; G.auto.i = 0; G.auto.stuck = 0; G.auto.last = { x: f.x, y: f.y }; G.auto.walkH = G.hour;
    G.auto.doing = "Marche vers " + (dest.icone ? dest.icone + " " : "") + dest.nom;
  }
  // marche automatique : de nœud en nœud sur le trottoir, puis droit vers le lieu
  function autoWalk(dt) {
    const A = G.auto, f = G.foot, P = A.path;
    let t;
    // trajet trop long pour l'horloge du jeu : on passe la fin du trajet (« il arrive »)
    if (WALK && A.walkH !== undefined && ((G.hour - A.walkH + 24) % 24) > .5) { const d = A.dest; if (!walkBlocked(d.x, d.y)) { f.x = d.x; f.y = d.y; } A.walkH = undefined; arrive(); return; }
    if (A.i < P.length - 1) {
      const from = P[A.i], to = P[A.i + 1], off = Math.max(nodes[from].w, nodes[to].w) / 2 + 18;
      t = edgePoint(from, to, off);
      if (Math.hypot(t.x - f.x, t.y - f.y) < 16) { A.i++; return; }
    } else {
      t = A.dest;
      if (Math.hypot(t.x - f.x, t.y - f.y) < 14) { arrive(); return; }
    }
    const da = angDiff(f.a, Math.atan2(t.y - f.y, t.x - f.x)); f.a += Math.max(-3.5 * dt, Math.min(3.5 * dt, da));
    const want = Math.abs(da) > 1.2 ? 12 : A.mode === "footing" ? 70 : 36; f.v += (want - f.v) * Math.min(1, dt * 6);
    const nx = f.x + Math.cos(f.a) * f.v * dt, ny = f.y + Math.sin(f.a) * f.v * dt;
    if (!walkBlocked(nx, f.y)) f.x = nx; if (!walkBlocked(f.x, ny)) f.y = ny;
    f.t += dt * Math.abs(f.v) / 30;
    A.stuck += dt;
    if (A.stuck > 3) { // coincé contre un mur : on saute au point suivant s'il est libre
      if (Math.hypot(f.x - A.last.x, f.y - A.last.y) < 20 && !walkBlocked(t.x, t.y)) { f.x = t.x; f.y = t.y; }
      A.stuck = 0; A.last = { x: f.x, y: f.y };
    }
  }
  function arrive() {
    const A = G.auto, d = A.dest; G.foot.v = 0;
    if (d.busStop) { A.phase = "waitbus"; A.stop = d.busStop; A.waitT = 0; A.doing = "🚏 Il attend le bus à l'" + d.busStop.nom; msg("🚏 Ton personnage attend le bus de la ligne 1.", 3); return; }
    if (d.bench) {
      sitDown(d.bench, true); A.phase = "sit";
      if (d.match) { A.sitT = 40 + rand() * 25; A.doing = "Regarde le match " + d.icone; msg(d.icone + " Ton personnage s'installe pour regarder le match.", 3, "ok"); }
      else if (A.mode === "footing") { A.sitT = 6 + rand() * 5; A.doing = "Pause footing : il reprend son souffle"; }
      else if (d.meet) { A.sitT = 1e9; A.doing = "Assis sur un banc : il rencontre des gens"; }
      else if (d.flirt) { A.sitT = 1e9; A.doing = "💘 Il guette quelqu'un à séduire"; flirt(); }
      else if (d.date) { A.sitT = 30; date(); }
      else { A.sitT = 18 + rand() * 20; A.doing = "Assis sur un banc : il observe et fait des rencontres"; }
      return;
    }
    if (d.bench && d.flirt) { /* traité plus haut */ }
    if (d.home && d.eat) { G.me.faim = 15; note(G.me.conjoint ? "🍲 Il dîne à la maison avec sa femme, " + G.me.conjoint.split(" ")[0] + "." : "🍲 Il mange à la maison avec la famille (gratuit)."); }
    if (d.home) { A.phase = "home"; A.doing = "À la maison : il se repose"; msg("🏠 Ton personnage est rentré à la maison. Il se repose.", 3.5, "ok"); return; }
    const o = d.place, t = o && o.type;
    if (d.work) { note("💼 Il arrive au travail : " + d.nom + ".");
      if ((G.me.rep || 0) <= -30) earn(15, "salaire réduit : son patron se méfie de lui (mauvaise réputation)"); else earn(25, "salaire de la journée à " + d.nom);
      if (rand() < .5) repute(1, "un travailleur sérieux"); A.phase = "visit"; A.wait = 1e9; A.doing = "💼 Au travail à " + d.nom; return; }
    if (d.date) { date(); A.phase = "visit"; A.wait = 10; A.doing = "🌹 En rendez-vous à " + d.nom; return; }
    if (d.street) {
      const j = [["cireur de chaussures", 5, 9], ["porteur au marché", 7, 13], ["vendeur d'eau en sachet", 5, 10], ["laveur de voitures", 6, 11]][(rand() * 4) | 0];
      earn(j[1] + ((rand() * (j[2] - j[1])) | 0), "petit boulot : " + j[0] + " à " + d.nom); G.energy = Math.max(0, G.energy - 15);
      if (rand() < .3) repute(1, "un débrouillard courageux");
      A.phase = "visit"; A.wait = 1e9; A.doing = "🧹 Petit boulot : " + j[0]; return;
    }
    if (d.help) {
      const g = 3 + ((rand() * 4) | 0);
      if (pay(g, "il aide " + ["une maman du marché", "un enfant des rues", "un vieux du quartier", "un vendeur malchanceux"][(rand() * 4) | 0])) { repute(4, "sa générosité"); shiftMind(3, "aider fait du bien"); }
      A.phase = "visit"; A.wait = 4; A.doing = "🤲 Il aide quelqu'un au " + d.nom; return;
    }
    if (d.eat) {
      const cost = Math.max(2, (o && o.resto ? 6 + ((rand() * 5) | 0) : 4) - ((G.me.rep || 0) >= 40 ? 2 : 0));
      if ((G.me.rep || 0) >= 40 && rand() < .5) note("⭐ On lui fait un prix : il est respecté dans le quartier.");
      if (pay(cost, o && o.resto ? "repas au " + d.nom : "à manger à " + d.nom)) { G.me.faim = 5; G.energy = Math.min(100, G.energy + 12); note("🍲 Il mange " + ["du poulet mayo", "du pondu avec de la chikwangue", "du poisson braisé", "des beignets et du thé"][(rand() * 4) | 0] + " à " + d.nom + "."); }
      else note("😞 Il n'a pas assez d'argent pour manger à " + d.nom + ".", "alert");
      A.phase = "visit"; A.wait = 8; A.doing = "🍲 Il mange à " + d.nom; return;
    }
    if (d.biz) {
      const me = G.me, stake = Math.min(me.argent, 10 + ((rand() * 15) | 0)), luck = (me.intel / 10) * .5 + rand() * .7 + (me.car === "ambitieux" ? .1 : 0);
      if (stake < 5) { note("💹 Il voulait faire du business, mais il n'a pas de quoi acheter de la marchandise."); A.phase = "visit"; A.wait = 4; return; }
      me.argent -= stake; const back = Math.round(stake * (luck > .75 ? 1.8 : luck > .5 ? 1.3 : luck > .35 ? .9 : .4));
      me.argent += back; const gain = back - stake;
      note(gain >= 0 ? "💹 Business au " + d.nom + " : il achète et revend " + ["des téléphones d'occasion", "des pagnes wax", "des sacs de riz", "des cartes de recharge"][(rand() * 4) | 0] + ", +" + gain + " e-makuta de bénéfice." : "💹 Mauvaise affaire au " + d.nom + " : il perd " + (-gain) + " e-makuta.", gain >= 0 ? "ok" : "alert");
      me.bizWins = (me.bizWins || 0) + (gain > 5 ? 1 : 0); if (gain > 5 && rand() < .4) repute(1, "ses affaires marchent"); if (me.bizWins >= 3 && me.car !== "ambitieux") { changeChar("ambitieux", "ses affaires marchent bien"); me.bizWins = 0; }
      A.phase = "visit"; A.wait = 1e9; A.doing = "💹 Il fait du business au " + d.nom; return;
    }
    if (d.steal) {
      const me = G.me, cops = G.peds.filter(q => q.cop && Math.hypot(q.x - G.foot.x, q.y - G.foot.y) < 700).length + G.cops.filter(c => Math.hypot(c.x - G.foot.x, c.y - G.foot.y) < 900).length;
      const caught = rand() < .25 + cops * .15 + ((me.rep || 0) <= -30 ? .15 : 0);
      if (caught) {
        me.arrest++; const fine = Math.min(me.argent, 20); me.argent -= fine;
        note("🚓 Il essaie de voler à " + d.nom + "… et se fait attraper par la police ! Amende : " + fine + " e-makuta.", "alert");
        shiftMind(15, "après cette arrestation"); repute(-15, "arrêté pour vol, tout le quartier le sait");
        if (me.arrest >= 2 && me.car !== "méfiant") changeChar("méfiant", "il a été arrêté plusieurs fois");
        if (me.arrest % JAIL_AFTER === 0) { jail(); return; }
        A.phase = "visit"; A.wait = 10; A.doing = "🚓 Arrêté par la police"; return;
      }
      const gain = 8 + ((rand() * 20) | 0); me.argent += gain;
      note("🕵️ Il vole discrètement " + gain + " e-makuta à " + d.nom + ". Personne ne l'a vu… cette fois.", "alert");
      shiftMind(-6, "ce vol facile"); if (rand() < .25) repute(-5, "des rumeurs disent qu'il vole");
      A.phase = "visit"; A.wait = 4; A.doing = "🕵️ Il s'éloigne discrètement"; return;
    }
    if (t === "club" && isOpen(o, G.hour) && A.mode !== "vol") {
      const spend = 10 + ((rand() * 25) | 0);
      if (!pay(Math.min(spend, G.me.argent), "soirée au " + d.nom + " (entrée et boissons)") || G.me.argent < 0) { note("🪩 Refoulé à l'entrée du " + d.nom + " : pas assez d'argent.", "alert"); A.phase = "visit"; A.wait = 3; return; }
      if (d.flirt || rand() < .5) flirt();
      A.phase = "visit"; A.wait = 1e9; A.doing = "🪩 Il danse au " + d.nom; return;
    }
    if (t === "marche") { msg("🧺 Au marché : il compare les prix des légumes et du poisson, puis discute avec les commerçantes.", 4.5); A.phase = "visit"; A.wait = 10 + rand() * 6; A.doing = "Courses au marché"; return; }
    if (d.guide) { msg("📸 " + d.icone + " " + d.nom + " : " + d.guide, 6, "ok"); A.phase = "visit"; A.wait = 6 + rand() * 3; A.doing = "Tourisme : " + d.nom; return; }
    if (A.mode === "courses" && t) { const what = t === "alim" ? ["du pain et du lait", "du riz et du poisson salé", "des fruits et de l'eau"] : o.id === "phones" ? ["un nouvel étui de téléphone", "un chargeur"] : ["une chemise en wax", "une paire de baskets"]; msg(d.icone + " Courses à " + d.nom + " : il regarde " + what[(rand() * what.length) | 0] + ". (Achats réels dans la Boutique de Ma vie.)", 4.5); A.phase = "visit"; A.wait = 6 + rand() * 4; A.doing = "Courses : " + d.nom; return; }
    if (t === "club") { msg("🪩 " + d.nom + " : la musique est forte ! Entrée réservée aux 18 ans et plus, ouvre après le lancement.", 4.5); A.phase = "visit"; A.wait = 8 + rand() * 4; A.doing = "Soirée : " + d.nom; return; }
    msg((d.icone || "📍") + " Ton personnage visite : " + d.nom, 3);
    A.phase = "visit"; A.wait = 4 + rand() * 4; A.doing = "Visite " + d.nom;
  }
  function callTaxi(forceHome, bus) {
    const A = G.auto, f = G.foot, p = G.player;
    if (!forceHome && G.me && !pay(5, "taxi")) { A.phase = "walk"; A.path = null; A.tired = true; return; }
    const goHome = forceHome || A.mode === "maison" || A.mode === "footing" || rand() < .5 || !PLACES.length, far = PLACES.filter(o => o.id !== "maison" && Math.hypot(o.x - f.x, o.y - f.y) > 900);
    const next = A.mode === "tourisme" && A.tour && A.tour[0];
    const o = next || (goHome ? HOME() : far[(rand() * far.length) | 0] || HOME());
    if (next) A.tour.shift();
    if (!o) { A.phase = "walk"; A.path = null; return; }
    // le taxi jaune s'arrête au bord de la route la plus proche
    const n = nearestNode(f.x, f.y), N = nodes[n], m = N.nb.length ? N.nb[0] : n, pt = edgePoint(m, n, Math.min(30, N.w * .22));
    p.x = pt.x; p.y = pt.y; p.a = Math.atan2(N.y - nodes[m].y, N.x - nodes[m].x) || 0; p.vx = p.vy = 0;
    A.phase = "board"; A.wait = 1.6; A.taxiTo = o; A.home = o.id === "maison";
    A.doing = (forceHome ? (bus ? "🚌 En bus" : "🚕 En taxi") + " vers la maison" : "Fatigué : il prend un taxi vers " + (A.home ? "la maison" : o.nom));
    if (!forceHome) msg("😮‍💨 Ton personnage est fatigué : il appelle un taxi " + (A.home ? "pour rentrer à la maison." : "pour aller à " + o.nom + "."), 4);
  }
  function autoRide(dt) {
    const A = G.auto, p = G.player, P = A.path;
    let t;
    if (A.i < P.length - 1) { t = edgePoint(P[A.i], P[A.i + 1], Math.min(30, nodes[P[A.i + 1]].w * .22)); if (Math.hypot(t.x - p.x, t.y - p.y) < 70) { A.i++; return; } }
    else { t = A.dropAt; }
    const sp = Math.hypot(p.vx, p.vy), dist = Math.hypot(t.x - p.x, t.y - p.y), ang = Math.abs(angDiff(p.a, Math.atan2(t.y - p.y, t.x - p.x)));
    steerTo(p, t.x, t.y);
    const lastLeg = A.i >= P.length - 1;
    p.inp.gas = sp < (lastLeg ? Math.min(220, dist * 1.2) : 330) * (ang > .5 ? .5 : 1) ? 1 : 0;
    p.inp.brake = (ang > .8 && sp > 180) || (lastLeg && dist < 90 && sp > 60) ? 1 : 0; p.inp.hand = 0; p.inp.nitro = 0;
    if (!lastLeg && stopHere(p, P[A.i + 1])) { p.inp.gas = 0; p.inp.brake = 1; }
    if (lastLeg && dist < 70 && sp < 70) { // arrivée : on descend devant le lieu
      p.inp.gas = 0; p.inp.brake = 1; p.vx = p.vy = 0;
      const rx = Math.sin(p.a), ry = -Math.cos(p.a); let x = p.x + rx * 26, y = p.y + ry * 26; if (walkBlocked(x, y)) { x = p.x - rx * 26; y = p.y - ry * 26; }
      G.foot = { x, y, a: p.a, v: 0, t: 0 };
      const o = A.taxiTo; msg("🚕 Arrivé" + (A.home ? " à la maison." : " : " + o.nom + "."), 2.5, "ok");
      A.phase = "walk"; planWalk({ x: o.door.x, y: o.door.y, nom: A.home ? "la maison" : o.nom, icone: o.icone, home: A.home, place: o });
      return;
    }
    A.stuck = sp < 15 ? A.stuck + dt : 0;
    if (A.stuck > 3 && A.i < P.length - 1) { const nn = nodes[P[A.i + 1]]; p.x = nn.x; p.y = nn.y; p.vx = p.vy = 0; A.i++; A.stuck = 0; }
  }
  function autoUpdate(dt) {
    const A = G.auto;
    if (A.phase === "walk") {
      if (!G.foot) { G.auto = null; return; }
      if (G.energy < 22 && !A.tired && G.phase !== "nuit" && A.dest && Math.hypot(A.dest.x - G.foot.x, A.dest.y - G.foot.y) > 900) { callTaxi(); return; }
      if (!A.path) { const d = pickDestination(); if (!d) return; planWalk(d); }
      autoWalk(dt);
    } else if (A.phase === "visit") { A.wait -= dt; if (A.wait <= 0) { A.phase = "walk"; A.path = null; } }
    else if (A.phase === "sit") { A.sitT -= dt; if (A.sitT <= 0 || (G.energy > 98 && A.sitT < 8)) { standUp(true); A.phase = "walk"; A.path = null; } }
    else if (A.phase === "home") { if (A.mode === "prison") { A.doing = G.lifeMsg; } else if (G.phase === "nuit") { A.doing = "😴 Il dort à la maison"; } else if (G.energy >= 100 && A.mode !== "maison") { msg("Ton personnage est reposé et repart se promener.", 3, "ok"); A.phase = "walk"; A.path = null; } }
    else if (A.phase === "board") {
      A.wait -= dt;
      if (A.wait <= 0) {
        const p = G.player, o = A.taxiTo, a = nearestNode(p.x, p.y), b = nearestNode(o.door.x, o.door.y);
        const nb = nodes[b], drop = { x: nb.x + (o.door.x - nb.x) * .5, y: nb.y + (o.door.y - nb.y) * .5 };
        A.path = findPath(a, b) || [a, b]; A.i = 0; A.stuck = 0; A.dropAt = drop; G.foot = null; A.phase = "ride";
      }
    } else if (A.phase === "ride") autoRide(dt);
    else if (A.phase === "waitbus" || A.phase === "boardbus" || A.phase === "inbus") busRider(dt);
  }

  // ---- bancs publics : s'asseoir, observer, rencontrer des gens
  function sitDown(b, auto) {
    const f = G.foot; if (!f) return;
    f.x = b.x; f.y = b.y; f.a = b.a; f.v = 0; f.sit = b; b.taken = true; G.sitT = 0; G.meetT = 5 + rand() * 4; G.obsT = 3;
    if (!auto) msg("🪑 Tu t'assois. Observe la ville : des gens vont venir te parler.", 3.5, "ok");
  }
  function standUp(auto) {
    const f = G.foot; if (!f || !f.sit) return;
    const b = f.sit; b.taken = false; f.sit = null;
    f.x = b.x + Math.cos(b.a) * 14; f.y = b.y + Math.sin(b.a) * 14;
    G.peds.forEach(q => { if (q.greet) { q.greet = null; q.state = "walk"; } });
    if (!auto) msg("Tu te lèves.", 1.5);
  }
  function sitUpdate(dt) {
    const f = G.foot, b = f.sit;
    G.obsT -= dt;
    if (G.obsT <= 0) { // ce que le personnage observe autour de lui
      G.obsT = 9 + rand() * 6;
      const peds = G.peds.filter(q => !q.play && Math.hypot(q.x - f.x, q.y - f.y) < 400).length;
      const cars = G.traffic.filter(c => Math.hypot(c.x - f.x, c.y - f.y) < 500).length;
      const pl = PLACES.filter(o => Math.hypot(o.x - f.x, o.y - f.y) < 700).sort((p1, p2) => Math.hypot(p1.x - f.x, p1.y - f.y) - Math.hypot(p2.x - f.x, p2.y - f.y))[0];
      const lines = [`👀 Il observe : ${peds} passants et ${cars} voitures autour de lui.`, pl ? `👀 Juste à côté : ${pl.icone} ${pl.nom}.` : "👀 Le quartier est calme.", "👀 Un taxi jaune klaxonne au carrefour.", "👀 Des vendeurs passent avec leurs marchandises."];
      const g = G.games.find(g => Math.hypot(g.o.x - f.x, g.o.y - f.y) < 900);
      if (g) lines.push(`👀 Il regarde le match au ${g.o.nom} : ${g.score[0]} à ${g.score[1]}.`);
      msg(lines[(rand() * lines.length) | 0], 3.5);
    }
    G.meetT -= dt;
    if (G.meetT <= 0) { // un passant s'approche et se présente
      G.meetT = 10 + rand() * 8;
      const q = G.peds.filter(q => !q.play && !q.staff && !q.greet && q.state === "walk" && Math.hypot(q.x - f.x, q.y - f.y) < 900).sort((q1, q2) => Math.hypot(q1.x - f.x, q1.y - f.y) - Math.hypot(q2.x - f.x, q2.y - f.y))[0];
      if (q) {
        const gx = b.x + Math.cos(b.a) * 22, gy = b.y + Math.sin(b.a) * 22;
        // le passant arrive par le trottoir, sur le côté du banc (chemin dégagé)
        for (const da of [Math.PI / 2, -Math.PI / 2, Math.PI * .3, -Math.PI * .3]) {
          const sx = gx + Math.cos(b.a + da) * 150, sy = gy + Math.sin(b.a + da) * 150;
          let clear = true; for (let k = 0; k <= 15 && clear; k++) if (walkBlocked(sx + (gx - sx) * k / 15, sy + (gy - sy) * k / 15)) clear = false;
          if (clear) { if (Math.hypot(q.x - gx, q.y - gy) > 160) { q.x = sx; q.y = sy; } q.a = Math.atan2(gy - q.y, gx - q.x); q.greet = { x: gx, y: gy, t: 0 }; break; }
        }
      }
    }
  }
  // draguer : il tente sa chance avec une personne proche ; le résultat dépend de son charisme
  function flirt() {
    const me = G.me, f = G.foot;
    const cand = G.peds.filter(q => !q.play && !q.cop && !q.staff && Math.hypot(q.x - f.x, q.y - f.y) < 500 && ident(q).woman && ident(q).age >= 18 && ident(q).age < 50);
    const q = cand[(rand() * cand.length) | 0];
    const nom = q ? ident(q).nom : NOMS_F[(rand() * NOMS_F.length) | 0] + " " + ["M.", "K.", "B."][(rand() * 3) | 0];
    const ok = rand() < .15 + me.charisme * .06 + (me.car === "drôle" ? .1 : 0) + (me.rep || 0) * .002 - .2 * relations.get().filter(r => r.amour && !r.epouse).length - (me.conjoint ? .15 : 0);
    if (me.conjoint) cheatRisk(nom);
    if (ok) {
      const R = relations.get(); let r = q && R.find(x => x.pid === q.id);
      if (!r) { r = { id: Date.now().toString(36), pid: q ? q.id : 0, nom, f: true, fois: 1, lieu: "rencontre galante", le: Date.now() }; R.unshift(r); }
      r.amour = true; r.fois++; r.coeur = Math.min(100, (r.coeur || 0) + 25); relations.set(R);
      note("💘 Il drague " + nom.split(" ")[0] + "… elle sourit et accepte de le revoir ! (relation amoureuse)", "ok");
      if (me.car === "timide") changeChar("bavard", "ce succès lui donne confiance");
    } else note("💔 Il tente sa chance avec " + nom.split(" ")[0] + "… elle le repousse poliment.");
  }
  // rendez-vous amoureux : cadeau ou repas, l'amour grandit ; à 100, il demande la main (dot payée par sa famille)
  function date() {
    const me = G.me, R = relations.get(), r = R.find(x => x.epouse) || R.filter(x => x.amour).sort((a, b) => (b.coeur || 0) - (a.coeur || 0))[0];
    if (!r) { note("🌹 Il voulait voir quelqu'un, mais il n'a personne dans sa vie pour l'instant."); return; }
    const n = r.nom.split(" ")[0], gift = 4 + ((rand() * 6) | 0);
    if (!pay(gift, (r.epouse ? "sortie avec sa femme " : "cadeau pour ") + n)) { r.coeur = (r.coeur || 0) - 5; relations.set(R); note("🌹 Il voit " + n + " mais n'a rien pour l'inviter. Elle est un peu déçue."); return; }
    r.coeur = Math.min(100, (r.coeur || 0) + 15 + ((me.charisme * 1.5) | 0)); r.fois++; r.le = Date.now(); relations.set(R);
    note(r.epouse ? "💑 Moment en amoureux avec sa femme " + n + "." : "🌹 Rendez-vous avec " + n + " (amour " + r.coeur + "/100).", "ok");
    if (!r.epouse && !me.conjoint && (r.coeur >= 100 || r.fiance)) marry(r);
  }
  function meet(q) {
    const R = relations.get(), place = nearPlace(G.foot.x, G.foot.y), lieu = place ? place.nom : G.foot.sit ? "un banc de la Gombe" : "une rue de la Gombe";
    const wq = window.__pedLook ? !!window.__pedLook(q).woman : null;
    const same = R.filter(x => wq === null || x.f === undefined || x.f === wq);
    let r = q.id ? R.find(x => x.pid === q.id) : same.length && rand() < .3 ? same[(rand() * same.length) | 0] : null;
    if (r) { r.fois++; r.le = Date.now(); r.lieu = lieu; msg(`🤝 Tu revois ${r.nom}. Vous êtes maintenant : ${relLevel(r.fois)}.`, 4, "ok"); }
    else {
      const I = ident(q), woman = I.woman, nom = I.nom;
      r = { id: Date.now().toString(36) + ((rand() * 1e4) | 0), pid: q.id, nom, f: woman, fois: 1, lieu, le: Date.now(), car: I.car.t, metier: I.metier }; R.unshift(r);
      msg(`👋 « Mbote ! Je m'appelle ${nom.split(" ")[0]}. » Nouvelle relation : ${nom}.`, 4.5, "ok");
    }
    relations.set(R); q.relName = r.nom;
  }
  function showRelations() {
    if (!G || $("relpanel")) return;
    const wasPaused = G.paused; G.paused = true;
    const R = relations.get(), esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const d = document.createElement("div"); d.id = "relpanel"; d.className = "bureau";
    d.innerHTML = `<div class="bureau-box" role="dialog" aria-modal="true" aria-labelledby="rel-t"><button type="button" class="bureau-x" aria-label="Fermer">✕</button>
      <p class="bureau-k">👥 Mes relations</p><h2 id="rel-t">${R.length} personne${R.length > 1 ? "s" : ""} rencontrée${R.length > 1 ? "s" : ""}</h2>
      <p>Assieds-toi sur un banc public : les passants viennent se présenter. Plus tu revois quelqu'un, plus votre lien grandit.</p>
      ${R.length ? R.map(r => `<details><summary>${r.epouse ? "💒 " : r.fiance ? "💍 " : r.amour ? "💘 " : ""}${esc(r.nom)} · ${r.epouse ? "Épouse" : r.fiance ? "Fiancée (dot à réunir)" : r.amour ? "Relation amoureuse" + (r.coeur ? " · amour " + r.coeur + "/100" : "") : relLevel(r.fois)}</summary><p>${r.metier ? esc(r.metier) + ", " + esc(r.car || "") + ". " : ""}Rencontré${r.fois > 1 ? " " + r.fois + " fois" : ""}, dernière fois à ${esc(r.lieu)}, le ${new Date(r.le).toLocaleDateString("fr-FR")}.</p></details>`).join("") : "<p><b>Personne pour l'instant.</b></p>"}
      <p style="font-size:12px;opacity:.7">Aperçu : ces relations sont gardées dans ce navigateur. Elles seront liées à ton compte dans la version en ligne.</p></div>`;
    d.querySelector(".bureau-box").classList.add("bureau-faq");
    document.body.appendChild(d);
    const close = () => { d.remove(); if (G) G.paused = wasPaused; };
    d.querySelector(".bureau-x").onclick = close; d.addEventListener("click", e => { if (e.target === d) close(); });
    d.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") close(); });
  }

  // ---- matchs : des joueurs jouent au foot et au basket sur les terrains
  const TEAM = { foot: [["#d32f2f", "#f4f4f2"], ["#1565c0", "#111318"]], basket: [["#f9a825", "#111318"], ["#2e7d32", "#f4f4f2"]] };
  function setupGames() {
    G.games = [];
    PLACES.filter(o => o.type === "foot" || o.type === "basket").forEach(o => {
      const foot = o.type === "foot", g = { o, foot, ball: { u: 0, v: 0, z: 0, vu: 0, vv: 0, vz: 0 }, score: [0, 0], cool: 1, players: [], holder: null, shot: null };
      G.games.push(g); g.goalU = foot ? o.w / 2 - 14 : o.w / 2 - 21; g.lenU = o.w / 2 - 12; g.lenV = o.d / 2 - 14;
      const per = foot ? 5 : 3;
      for (let team = 0; team < 2; team++) for (let k = 0; k < per; k++) {
        const s = team ? 1 : -1, keeper = foot && k === 0;
        const hu = keeper ? s * (g.goalU - 18) : s * (g.goalU * (foot ? [0, .62, .62, .25, .25][k] : [.55, .3, .3][k])), hv = keeper ? 0 : (foot ? [0, -.45, .45, -.25, .25][k] : [0, -.4, .4][k]) * g.lenV * 2;
        const q = { pu: hu, pv: hv, hu, hv, team, keeper, play: g, x: 0, y: 0, a: 0, v0: 0, t: rand() * 9, state: "idle", staff: true, look: 20 + team * 7 + k, kit: TEAM[o.type][team], speed: 0 };
        placePlayer(q); g.players.push(q); G.peds.push(q);
      }
    });
  }
  function placePlayer(q) { const o = q.play.o; q.x = o.x + o.ux * q.pu + o.nx * q.pv; q.y = o.y + o.uy * q.pu + o.ny * q.pv; }
  function gameStep(g, dt) {
    const B = g.ball, o = g.o, near = G.foot ? Math.hypot(o.x - G.foot.x, o.y - G.foot.y) < 900 : false;
    g.cool -= dt;
    // ballon
    if (g.shot) {
      const s = g.shot; s.t += dt / s.dur; const k = Math.min(1, s.t);
      B.u = s.u0 + (s.u1 - s.u0) * k; B.v = s.v0 + (s.v1 - s.v0) * k; B.z = s.z0 + (s.z1 - s.z0) * k + Math.sin(k * Math.PI) * 26;
      if (k >= 1) { g.shot = null; const ok = rand() < .55; if (ok) { g.score[s.team]++; if (near) msg(`🏀 Panier ! ${o.nom} : ${g.score[0]} à ${g.score[1]}`, 2.5, "ok"); } B.u = s.u1 - Math.sign(s.u1) * 12; B.v = 0; B.vu = B.vv = B.vz = 0; B.z = 0; g.cool = .5;
        // remise en jeu : le ballon passe à l'autre équipe
        const other = g.players.filter(m => m.team !== s.team && !m.keeper).sort((m1, m2) => Math.hypot(m1.pu - B.u, m1.pv - B.v) - Math.hypot(m2.pu - B.u, m2.pv - B.v))[0];
        if (other) { other.pu = B.u - Math.sign(s.u1) * 6; other.pv = B.v; g.holder = other; } }
    } else if (g.holder) {
      const h = g.holder; B.u = h.pu + Math.cos(h.la) * 5; B.v = h.pv + Math.sin(h.la) * 5; B.z = Math.abs(Math.sin(g.t8 = (g.t8 || 0) + dt * 9)) * 9;
    } else {
      B.u += B.vu * dt; B.v += B.vv * dt; B.vz -= 320 * dt; B.z += B.vz * dt;
      if (B.z < 0) { B.z = 0; B.vz = Math.abs(B.vz) > 30 ? -B.vz * .45 : 0; }
      const fr = Math.exp(-(B.z > 0 ? .2 : 1.1) * dt); B.vu *= fr; B.vv *= fr;
      if (Math.abs(B.v) > g.lenV) { B.v = Math.sign(B.v) * g.lenV; B.vv = -B.vv * .6; }
      if (Math.abs(B.u) > g.lenU) {
        if (g.foot && Math.abs(B.v) < 34 && B.z < 24) { const t = B.u > 0 ? 0 : 1; g.score[t]++; if (near) msg(`⚽ But ! ${o.nom} : ${g.score[0]} à ${g.score[1]}`, 2.5, "ok"); B.u = B.v = B.vu = B.vv = B.z = B.vz = 0; g.cool = 1.5; }
        else { B.u = Math.sign(B.u) * g.lenU; B.vu = -B.vu * .6; }
      }
    }
    // joueurs : le plus proche de chaque équipe va au ballon, les autres tiennent leur poste
    const chaser = [0, 1].map(t => g.players.filter(q => q.team === t && !q.keeper).reduce((b, q) => { const d = Math.hypot(q.pu - B.u, q.pv - B.v); return d < b.d ? { q, d } : b; }, { d: 1e9 }).q);
    g.players.forEach(q => {
      const dir = q.team ? -1 : 1;
      let tu, tv, run;
      if (g.holder === q) { tu = dir * g.goalU; tv = q.pv * .6; run = 34; }
      else if (q === chaser[q.team]) { tu = B.u; tv = B.v; run = 46; }
      else if (q.keeper) { tu = q.hu; tv = Math.max(-30, Math.min(30, B.v * .5)); run = 30; }
      else { tu = q.hu + (B.u - q.hu) * .35; tv = q.hv + (B.v - q.hv) * .25; run = 26; }
      const du = tu - q.pu, dv = tv - q.pv, d = Math.hypot(du, dv);
      const sp = d > 6 ? run : 0; q.speed += (sp - q.speed) * Math.min(1, dt * 4);
      if (d > 1) q.la = Math.atan2(dv, du);
      else q.la = Math.atan2(B.v - q.pv, B.u - q.pu);
      if (d > .5) { q.pu += du / d * Math.min(d, q.speed * dt); q.pv += dv / d * Math.min(d, q.speed * dt); }
      q.pu = Math.max(-g.lenU - 6, Math.min(g.lenU + 6, q.pu)); q.pv = Math.max(-g.lenV - 6, Math.min(g.lenV + 6, q.pv));
      q.a = Math.atan2(o.uy * Math.cos(q.la) + o.ny * Math.sin(q.la), o.ux * Math.cos(q.la) + o.nx * Math.sin(q.la));
      q.state = q.speed > 3 ? "walk" : "idle"; q.v = q.speed; q.t += dt; placePlayer(q);
      // frappe, passe, tir
      const bd = Math.hypot(q.pu - B.u, q.pv - B.v);
      if (g.cool <= 0 && !g.shot && bd < 9 && B.z < 12) {
        if (g.foot) {
          const toGoal = Math.abs(dir * g.goalU - B.u);
          let tu2, tv2;
          if (toGoal < 220) { tu2 = dir * (g.lenU + 20); tv2 = (rand() - .5) * 60; }
          else { const mates = g.players.filter(m => m.team === q.team && m !== q && (m.pu - q.pu) * dir > -20); const m = mates[(rand() * mates.length) | 0]; tu2 = m ? m.pu + dir * 30 : q.pu + dir * 150; tv2 = m ? m.pv : (rand() - .5) * g.lenV; }
          const L = Math.hypot(tu2 - B.u, tv2 - B.v) || 1, spd = Math.max(110, Math.min(320, L * 1.5));
          B.vu = (tu2 - B.u) / L * spd; B.vv = (tv2 - B.v) / L * spd; B.vz = rand() < .2 ? 120 : 0; g.cool = .45;
        } else if (g.holder === q) {
          if (Math.abs(dir * g.goalU - q.pu) < 90) { g.holder = null; g.shot = { u0: B.u, v0: B.v, z0: 14, u1: dir * g.goalU, v1: 0, z1: 30, t: 0, dur: .9, team: q.team }; }
          else if (rand() < dt * .8) { const mates = g.players.filter(m => m.team === q.team && m !== q); const m = mates[(rand() * mates.length) | 0]; g.holder = null; const L = Math.hypot(m.pu - B.u, m.pv - B.v) || 1; B.vu = (m.pu - B.u) / L * 200; B.vv = (m.pv - B.v) / L * 200; B.vz = 60; B.z = 10; g.cool = .35; }
        } else if (!g.holder || g.holder.team === q.team || rand() < dt * 1.2) { g.holder = q; g.cool = .6; }
      }
    });
    // position du ballon dans le monde (pour l'affichage 3D)
    B.x = o.x + o.ux * B.u + o.nx * B.v; B.y = o.y + o.uy * B.u + o.ny * B.v;
  }

  // ================================================================ Vie autonome
  // Horloge de Kinshasa (UTC+1). Le matin (5 h - 10 h), le joueur dirige son personnage et prépare son
  // programme ; de 10 h à 22 h, le personnage agit seul (programme, puis ses propres choix) ; la nuit il dort.
  const LIVE_CLOCK = WALK && !!window.TWO_LIFE_API;
  // réglages de l'admin : en ligne lus sur le serveur, en démo gardés dans ce navigateur
  let RG = {}; try { RG = JSON.parse(localStorage.getItem("twolife_reglages") || "{}"); } catch (e) { }
  if (window.TWO_LIFE_API) fetch(window.TWO_LIFE_API.replace(/\/$/, "") + "/api/reglages").then(r => r.json()).then(j => { if (j && j.reglages) RG = j.reglages; }).catch(() => { });
  const kinNow = () => { const d = new Date(Date.now() + 3600e3); return { h: d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600, day: Math.floor((Date.now() + 3600e3) / 864e5) }; };
  const hh = h => String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.floor((h % 1) * 60)).padStart(2, "0");
  const ACTS = [
    { id: "travail", ic: "💼", nom: "Aller travailler", dur: 6, mode: "travail" },
    { id: "courses", ic: "🛒", nom: "Faire les courses", dur: 1.5, mode: "courses" },
    { id: "match", ic: "⚽", nom: "Voir un match", dur: 2, mode: "match" },
    { id: "tourisme", ic: "📸", nom: "Visiter la ville", dur: 2.5, mode: "tourisme" },
    { id: "bus", ic: "🚌", nom: "Tour de la ville en bus", dur: 2.5, mode: "bus" },
    { id: "rencontres", ic: "🪑", nom: "Rencontrer des gens", dur: 2, mode: "rencontres" },
    { id: "footing", ic: "🏃", nom: "Faire du sport", dur: 1, mode: "footing" },
    { id: "promenade", ic: "🚶", nom: "Se promener", dur: 1.5, mode: "promenade" },
    { id: "repos", ic: "🏠", nom: "Se reposer à la maison", dur: 2, mode: "maison" },
    { id: "soiree", ic: "🪩", nom: "Sortir le soir (après 20 h)", dur: 2, mode: "soiree", soir: true },
    { id: "manger", ic: "🍲", nom: "Aller manger", dur: .8, mode: "manger" },
    { id: "business", ic: "💹", nom: "Faire du business", dur: 2.5, mode: "business" },
    { id: "draguer", ic: "💘", nom: "Draguer", dur: 1.5, mode: "draguer", hidden: true },
    { id: "vol", ic: "🕵️", nom: "Voler", dur: .7, mode: "vol", hidden: true },
    { id: "rendezvous", ic: "🌹", nom: "Voir sa chérie", dur: 1.5, mode: "rendezvous", hidden: true },
    { id: "aider", ic: "🤲", nom: "Aider quelqu'un", dur: .8, mode: "aider", hidden: true },
    { id: "petitboulot", ic: "🧹", nom: "Petit boulot", dur: 2, mode: "petitboulot", hidden: true },
    { id: "rentrer", ic: "🏠", nom: "Rentrer chez lui", dur: 1, mode: "maison", hidden: true },
  ];
  // journal du jour : tout ce que fait le personnage, à relire
  function note(t, kind) { const me = G.me; me.journal.unshift({ h: hh(G.hour), d: G.day, t }); me.journal = me.journal.slice(0, 60); msg(t, 5, kind || ""); saveMe(); }
  function saveMe() { lsSet("twolife_moi_ville", JSON.stringify(G.me)); }
  function pay(n, what) { const me = G.me; n = Math.max(1, Math.round(n * (RG.prix || 1))); if (me.argent < n) return false; me.argent -= n; if (what) note("💸 −" + n + " e-makuta : " + what); return true; }
  function earn(n, what) { G.me.argent += n; note("💰 +" + n + " e-makuta : " + what, "ok"); }
  // réputation : le quartier se souvient de ce qu'il fait (−100 à +100)
  function repute(d, why) {
    const me = G.me, b = me.rep || 0; me.rep = Math.max(-100, Math.min(100, b + d));
    if (Math.abs(d) >= 5) note((d > 0 ? "⭐ Réputation +" : "🗣️ Réputation ") + d + " : " + why + ".", d > 0 ? "ok" : "alert");
    if (b > -30 && me.rep <= -30) note("🗣️ Dans le quartier, on le dit voleur. Les gens se méfient de lui.", "alert");
    if (b < 40 && me.rep >= 40) note("⭐ Il est respecté dans le quartier.", "ok");
  }
  const repLabel = r => r >= 40 ? "respecté" : r >= 10 ? "bien vu" : r > -30 ? "inconnu" : r > -60 ? "mal vu" : "réputé voleur";
  // amour, fiançailles et mariage : la dot est payée par la famille du marié
  const DOT = 60;
  const lover = () => { const R = relations.get(); return R.find(r => r.epouse) || R.filter(r => r.amour).sort((a, b) => (b.coeur || 0) - (a.coeur || 0))[0]; };
  function marry(r) {
    const me = G.me, R = relations.get(), x = R.find(y => y.id === r.id) || r;
    if (!pay(DOT, "dot versée à la famille de " + x.nom)) { x.fiance = true; relations.set(R); note("💍 Il demande " + x.nom.split(" ")[0] + " en mariage. Elle dit oui ! Mais il doit encore réunir la dot (" + DOT + " e-makuta).", "ok"); return; }
    x.epouse = true; x.fiance = false; me.conjoint = x.nom; relations.set(R);
    note("💒 Mariage ! Sa famille a versé la dot et il épouse " + x.nom + ". Elle vient vivre avec lui.", "ok");
    repute(10, "un mariage dans les règles");
    if (["colérique", "fier"].includes(me.car) && rand() < .4) changeChar("calme", "le mariage l'a apaisé");
  }
  function cheatRisk(nom) {
    const me = G.me; if (!me.conjoint) return;
    repute(-8, "il drague alors qu'il est marié");
    if (rand() < .35) {
      const R = relations.get(), w = R.find(r => r.epouse); if (!w) return;
      w.coeur = (w.coeur || 100) - 40;
      if (w.coeur <= 0) { w.epouse = false; w.amour = false; me.conjoint = null; relations.set(R); note("💔 " + w.nom.split(" ")[0] + " a appris pour " + nom.split(" ")[0] + ". Elle demande le divorce et retourne dans sa famille.", "alert"); repute(-5, "un divorce qui fait parler"); }
      else { relations.set(R); note("😠 " + w.nom.split(" ")[0] + " a appris qu'il draguait " + nom.split(" ")[0] + ". Grosse dispute à la maison.", "alert"); }
    }
  }
  // la mentalité bouge avec la vie : honnêteté, caractère
  function shiftMind(d, why) {
    const me = G.me, before = me.honnete; me.honnete = Math.max(0, Math.min(100, me.honnete + d));
    if (before < 50 && me.honnete >= 50) note("🧠 Sa mentalité change : " + why + ", il décide de devenir honnête.", "ok");
    else if (before >= 35 && me.honnete < 35) note("🧠 Sa mentalité change : " + why + ", il prend goût à l'argent facile.", "alert");
  }
  function changeChar(t, why) { const me = G.me; if (me.car === t) return; const old = me.car; me.car = t; note("🧠 Son caractère évolue : de " + old + ", il devient " + t + " (" + why + ").", "ok"); }
  const ACT = id => ACTS.find(a => a.id === id) || ACTS[6];
  // besoins : la faim monte avec les heures, la fatigue avec la marche
  function needsStep(dh) {
    const me = G.me; if (!me) return;
    me.faim = Math.min(100, me.faim + dh * (G.phase === "nuit" ? 1.5 : 5.5) * (RG.faim || 1));
    if (me.faim >= 100) G.energy = Math.max(0, G.energy - dh * 8);
    if (me.faim >= 70 && !(G.hungryMsgT > G.t)) { G.hungryMsgT = G.t + 40; msg("🍽️ Ton personnage a faim (" + Math.round(me.faim) + " %).", 3); }
    G.saveT = (G.saveT || 0) + dh; if (G.saveT > .5) { G.saveT = 0; saveMe(); }
  }
  // la personnalité du personnage du joueur (gardée dans le navigateur en démo)
  function myself() {
    let me = null; try { me = JSON.parse(lsGet("twolife_moi_ville") || "null"); } catch (e) { }
    if (!me || !me.car) {
      const r = rng((Date.now() & 0xffff) + 7), pick = L => L[(r() * L.length) | 0];
      const g1 = pick(GOUTS); let g2 = pick(GOUTS); if (g2 === g1) g2 = GOUTS[(GOUTS.indexOf(g1) + 4) % GOUTS.length];
      me = { car: pick(CARACTERES).t, gouts: [g1, g2], force: 3 + ((r() * 7) | 0), lieu: "zboss", metier: "employé au bureau Zboss Sarlu" };
    }
    // destin : tiré par le jeu à la naissance, puis il évolue selon ce qui lui arrive
    const r2 = rng((Date.now() & 0xfffff) + 99);
    if (me.argent === undefined) me.argent = 40 + ((r2() * 40) | 0);
    if (me.faim === undefined) me.faim = 20;
    if (me.honnete === undefined) me.honnete = 15 + ((r2() * 80) | 0);
    if (me.charisme === undefined) me.charisme = 2 + ((r2() * 9) | 0);
    if (me.intel === undefined) me.intel = 2 + ((r2() * 9) | 0);
    if (!me.journal) me.journal = [];
    if (!me.arrest) me.arrest = 0;
    lsSet("twolife_moi_ville", JSON.stringify(me));
    return me;
  }
  function loadPlan() { try { const P = JSON.parse(lsGet("twolife_plan_ville") || "null"); if (P && P.day === G.day) return P.items; } catch (e) { } return []; }
  function savePlan(items) { lsSet("twolife_plan_ville", JSON.stringify({ day: G.day, items })); G.plan = items; }
  // le personnage est chez lui : devant sa porte, en mode « maison »
  function atHome(doing) {
    const h = HOME(); if (!h) return;
    if (G.foot && G.foot.sit) standUp(true);
    const k = h.d / 2 + 14;   // dans la cour, entre la maison et le portail
    G.foot = { x: h.x - h.nx * k, y: h.y - h.ny * k, a: Math.atan2(h.ny, h.nx), v: 0, t: 0 };   // tourné vers sa maison
    G.auto = { phase: "home", path: null, mode: "maison", seen: [], doing, dest: { home: true } };
    const b = $("autobtn"); if (b) b.setAttribute("aria-pressed", "true");
  }
  function clockStep(dt) {
    const h0 = G.hour;
    if (LIVE_CLOCK) { const k = kinNow(); G.hour = k.h; G.day = k.day; }
    if (!LIVE_CLOCK) { G.hour += dt * G.speed / 60; if (G.hour >= 24) { G.hour -= 24; G.day++; } }
    needsStep(((G.hour - h0) + 24) % 24 > 12 ? 0 : ((G.hour - h0) + 24) % 24);
    const h = G.hour, ph = h >= 22 || h < 5 ? "nuit" : h < 10 ? "matin" : "jour";
    if (ph !== G.phase) { const old = G.phase; G.phase = ph; phaseChange(old, ph); }
  }
  // prison : comme sur le serveur, la 3e arrestation mène 24 h en cellule au commissariat (il ne peut rien faire)
  const JAIL_AFTER = 3, JAIL_HOURS = 24;
  const gameT = () => G.day * 24 + G.hour;
  const jailed = () => !!(G.me && G.me.prisonT && gameT() < G.me.prisonT);
  function jailSpot() {
    const o = PLACES.find(o => o.id === "police"); if (!o) return;
    if (G.foot && G.foot.sit) standUp(true);
    const d = o.door || { x: o.x, y: o.y };
    G.foot = { x: d.x, y: d.y, a: 0, v: 0, t: 0 };
    G.auto = { phase: "home", path: null, mode: "prison", seen: [], doing: "🔒 En cellule", dest: { home: true, place: o } };
    G.lifeMsg = "🔒 En cellule au commissariat jusqu'à " + hh(G.me.prisonT % 24);
  }
  function jail() {
    const me = G.me; me.prisonT = gameT() + JAIL_HOURS; me.prisons = (me.prisons || 0) + 1; repute(-20, "un séjour en prison");
    note("🔒 Troisième arrestation : il passe " + JAIL_HOURS + " h en cellule au commissariat. Il ne peut rien faire et tes consignes sont suspendues.", "alert");
    shiftMind(10, "la prison");
    if (G.life) G.life.cur = null;
    jailSpot(); saveMe();
  }
  function unjail() {
    const me = G.me; me.prisonT = 0; saveMe();
    note("🚪 Il sort du commissariat. " + (me.honnete >= 50 ? "Il jure qu'on ne l'y reprendra plus." : "Il en veut à la police…"), "ok");
    G.life = newLife(); G.life.wake = G.hour; atHome("🏠 De retour à la maison");
  }
  function newLife() { G.plan = loadPlan(); return { orders: [], refused: [], done: [], later: null, cur: null, until: 0, wake: 5 + 1 + rand() * 1.5, evt: rand() < .6 ? 9 + rand() * 9 : 99 }; }
  // événements de la vie à Kinshasa : un au plus par jour, à une heure au hasard
  const CITY_EVENTS = [
    { ic: "🦟", p: 3, t: "Il a de la fièvre : paludisme. Il achète des médicaments à la pharmacie.", m: -15, e: -30 },
    { ic: "🌧️", p: 2, t: "Grosse pluie : la route est inondée, il rentre trempé et épuisé.", e: -20 },
    { ic: "💡", p: 3, t: "Coupure de courant chez lui : la nourriture du frigo est perdue.", m: -5 },
    { ic: "🛺", p: 1, t: "Petit accident de taxi-moto. Il s'en sort avec des bleus.", m: -10, e: -25 },
    { ic: "🎁", p: 2, t: "Un oncle de passage lui donne un petit cadeau.", m: 20 },
    { ic: "🎉", p: 2, t: "Fête dans le quartier : il danse la rumba, le moral remonte.", e: 15, r: 2 },
    { ic: "🧾", p: 1, t: "Un voisin lui rappelle une vieille dette. Il rembourse.", m: -12 },
  ];
  function cityEvent() {
    const me = G.me, tot = CITY_EVENTS.reduce((n, x) => n + x.p, 0); let k = rand() * tot, ev = CITY_EVENTS[0];
    for (const x of CITY_EVENTS) { k -= x.p; if (k < 0) { ev = x; break; } }
    if (ev.m > 0) earn(ev.m, ev.ic + " " + ev.t); else { note(ev.ic + " " + ev.t, ev.m || ev.e < 0 ? "alert" : "ok"); if (ev.m) me.argent = Math.max(0, me.argent + ev.m); }
    if (ev.e) G.energy = Math.max(5, Math.min(100, G.energy + ev.e));
    if (ev.r) repute(ev.r, "fête du quartier");
    saveMe();
  }
  function phaseChange(old, ph) {
    if (jailed()) { jailSpot(); G.life = null; const b = $("planbtn"); if (b) b.disabled = true; if (!old) msg("🔒 Ton personnage est en cellule au commissariat jusqu'à " + hh(G.me.prisonT % 24) + ". Tu ne peux que l'observer.", 6, "alert"); return; }
    if (!old) { // ouverture du jeu : le personnage est chez lui
      if (ph === "nuit") { atHome("😴 Il dort à la maison"); G.lifeMsg = "😴 Il dort à la maison"; msg("🌙 " + hh(G.hour) + " : ton personnage dort chez lui. Il se réveillera vers 5 h.", 5); }
      else { atHome("🏠 À la maison"); G.life = newLife(); G.life.wake = Math.min(G.life.wake, G.hour + .3);
        msg("🏠 " + hh(G.hour) + " : ton personnage est chez lui. Il vit sa vie seul, selon son caractère" + (ph === "matin" ? ". Jusqu'à 10 h, tu peux lui donner des consignes (📋)." : ". Les consignes se donnent le matin, de 5 h à 10 h."), 6, "ok"); }
    } else if (ph === "matin") {
      atHome("☕ Il se réveille et se prépare"); G.life = newLife(); G.lifeMsg = "☕ Il se réveille et se prépare";
      { const me = G.me; me.faim = Math.min(me.faim, 25);
        const fi = relations.get().find(r => r.fiance); if (fi && !me.conjoint && me.argent >= DOT) marry(fi);
        if (G.day % 7 === 0 && me.loyerJour !== G.day) { me.loyerJour = G.day;   // loyer de la semaine
          if (!pay(15, "loyer de la semaine")) { repute(-3, "il ne paie pas son loyer"); note("🏠 Il n'a pas de quoi payer le loyer. Le propriétaire s'impatiente.", "alert"); } } me.journal = me.journal.filter(j => j.d >= G.day - 1); shiftMind(rand() * 6 - 3, "la nuit porte conseil");
        if (rand() < .06) { const t = CARACTERES[(rand() * CARACTERES.length) | 0].t; changeChar(t, "le destin en a décidé ainsi"); } }
      msg("☀️ " + hh(G.hour) + " : ton personnage se réveille. Jusqu'à 10 h, tu peux lui donner des consignes (📋). Il les suivra… ou pas.", 6, "ok");
    } else if (ph === "jour") {
      msg("🔒 10 h : fin des consignes pour aujourd'hui. Ton personnage continue sa journée seul.", 4.5);
    } else if (ph === "nuit") {
      G.life = null; if (G.foot && G.foot.sit) standUp(true);
      if (!G.foot) { const p = G.player; G.foot = { x: p.x + Math.sin(p.a) * 26, y: p.y - Math.cos(p.a) * 26, a: p.a, v: 0, t: 0 }; }
      G.auto = null; autoToggle(true, "maison", true);
      G.lifeMsg = "🌙 Il rentre dormir"; msg("🌙 " + hh(G.hour) + " : la nuit tombe, ton personnage rentre dormir.", 5);
    }
    const b = $("planbtn"); if (b) b.disabled = ph !== "matin";
  }
  // obéit-il à une consigne ? selon son caractère, ses goûts et sa fatigue
  const DOCILE = { calme: .7, "généreux": .75, timide: .8, curieux: .65, bavard: .6, "drôle": .6, ambitieux: .55, fier: .4, "méfiant": .45, "colérique": .35 };
  const LIKES = { match: ["football", "basket"], courses: ["mode", "cuisine"], soiree: ["rumba", "danse"], tourisme: ["politique", "lecture", "cinéma"], rencontres: [], footing: [], travail: ["affaires"] };
  function obey(id) {
    const me = G.me, likes = (LIKES[id] || []).find(g => me.gouts.some(x => x.includes(g)));
    let p = DOCILE[me.car] ?? .6, why;
    if (likes) p += .3;
    if (id === "rencontres" && ["bavard", "curieux", "généreux", "drôle"].includes(me.car)) p += .3;
    if (id === "travail" && me.car === "ambitieux") p += .35;
    if (id === "footing" && me.force >= 7) p += .25;
    if (["footing", "match", "tourisme"].includes(id) && G.energy < 35) p -= .4;
    if (id === "repos" && G.energy < 50) p += .4;
    const ok = rand() < Math.max(.08, Math.min(.95, p));
    if (ok) why = likes ? "il aime " + likes.replace("mode", "la mode").replace("cuisine", "cuisiner").replace("football", "le football").replace("basket", "le basket").replace("rumba", "la rumba").replace("danse", "danser").replace("politique", "la politique").replace("lecture", "apprendre").replace("cinéma", "les découvertes").replace("affaires", "les affaires") : ["calme", "généreux", "timide"].includes(me.car) ? "il est " + me.car + " et t'écoute" : "il veut bien, pour cette fois";
    else why = G.energy < 35 && ["footing", "match", "tourisme"].includes(id) ? "il est trop fatigué" : ["fier", "méfiant", "colérique"].includes(me.car) ? "il est " + me.car + " : il préfère décider seul" : "il n'en a pas envie aujourd'hui";
    return { ok, why };
  }
  // ce que le personnage décide tout seul, selon son caractère, ses goûts, son énergie et l'heure
  function conscience() {
    const me = G.me, h = G.hour, L = G.life, recent = L ? L.done.slice(-2) : [];
    const c = [];
    const add = (id, w, why) => { if (!recent.includes(id)) c.push({ a: ACT(id), w: w / (1 + (L ? L.done.filter(x => x === id).length : 0)), why }); };
    if (G.energy < 30) return { a: ACT("repos"), why: "il est fatigué" };
    const likes = g => me.gouts.some(x => x.includes(g));
    if (me.faim >= 60) {
      if (me.argent >= 4) return { a: ACT("manger"), why: "il a faim" };
      if (me.honnete < 35 && rand() < .6) return { a: ACT("vol"), why: "il a faim et plus un franc en poche" };
      if (h < 18 && rand() < .5) return { a: ACT("petitboulot"), why: "il a faim et plus d'argent : il cherche un petit boulot" };
      return { a: ACT("repos"), why: "il a faim mais pas d'argent : il rentre manger chez lui" };
    }
    if (me.argent < 12 && me.honnete < 30) add("vol", 3, "il manque d'argent et n'a pas beaucoup de scrupules");
    if (me.argent < 15 && me.honnete >= 30 && h < 18) add("petitboulot", 5, "il n'a presque plus d'argent : il cherche un petit boulot");
    if (me.argent < 25 && h < 17) add("business", 3, "il veut gagner un peu d'argent");
    if (me.car === "ambitieux" || likes("affaires")) add("business", 4, "il a le sens des affaires");
    if (h >= 11 && (me.charisme >= 6 || ["drôle", "fier", "bavard"].includes(me.car))) add("draguer", (me.conjoint ? (me.honnete < 40 ? .8 : .2) : 2.5) / (1 + 2 * relations.get().filter(r => r.amour && !r.epouse).length), relations.get().some(r => r.amour) ? "il a déjà quelqu'un, mais il aime plaire" : "il veut séduire quelqu'un");
    { const lv = lover(); if (lv && h >= 12) add("rendezvous", lv.epouse ? 2 : lv.fiance ? 6 : 4, lv.epouse ? "il veut passer du temps avec sa femme" : lv.fiance ? "il pense à son mariage avec " + lv.nom.split(" ")[0] : "il est amoureux de " + lv.nom.split(" ")[0]); }
    if ((me.honnete >= 60 || me.car === "généreux") && me.argent >= 30) add("aider", me.car === "généreux" ? 4 : 1.5, "il a bon cœur et un peu d'argent");
    if (h >= 20 && me.argent >= 10) { add("soiree", likes("rumba") || likes("danse") || ["drôle", "bavard", "fier"].includes(me.car) ? 6 : 1.5, likes("rumba") ? "il aime la rumba" : "c'est le soir, il a envie de sortir"); add("repos", 2, "la journée a été longue"); }
    if (h >= 7 && h < 12 && me.car === "ambitieux") add("travail", 5, "il est ambitieux : il va travailler");
    if (likes("football") || likes("basket")) add("match", 5, "il aime " + (likes("football") ? "le football" : "le basket"));
    if (["bavard", "curieux", "généreux", "drôle"].includes(me.car)) add("rencontres", 4, "il est " + me.car + " : il a envie de parler aux gens");
    if (me.car === "curieux" || likes("politique") || likes("lecture")) add("tourisme", 3, me.car === "curieux" ? "il est curieux de découvrir la ville" : "il aime " + (likes("politique") ? "la politique : il veut voir les institutions" : "apprendre des choses"));
    if (likes("mode") || likes("cuisine") || me.car === "fier") add("courses", 3, likes("cuisine") ? "il veut cuisiner ce soir" : "il veut soigner son style");
    if (me.force >= 7) add("footing", 3, "il est sportif");
    if (me.car === "curieux" || likes("voyage") || me.argent >= 10) add("bus", me.car === "curieux" ? 3 : 1.2, me.car === "curieux" ? "il est curieux : il veut voir la ville depuis le bus" : "il a envie de faire un tour en bus");
    if (["timide", "méfiant", "calme"].includes(me.car)) add("promenade", 4, "il est " + me.car + " : il préfère marcher tranquillement");
    add("promenade", 1.5, "il a envie de flâner"); add("courses", 1, "il manque quelque chose à la maison");
    let tot = c.reduce((s, o) => s + o.w, 0), r = rand() * tot;
    for (const o of c) { r -= o.w; if (r <= 0) return o; }
    return c[0] || { a: ACT("promenade"), why: "il flâne" };
  }
  function nextActivity() {
    const L = G.life, h = G.hour; if (!L) return;
    if (G.auto && (G.auto.phase === "inbus" || G.auto.phase === "boardbus" || G.auto.phase === "waitbus") && h < 20) return;   // on ne saute pas d'un bus en marche
    let a = null, why = "";
    while (!a && L.orders.length) {
      const A = ACT(L.orders.shift());
      if (A.soir && h < 20) { L.later = A.id; continue; }
      const r = obey(A.id);
      if (r.ok) { a = A; why = "ta consigne, il la suit : " + r.why; msg("✅ Consigne « " + A.nom.replace(" (après 20 h)", "") + " » : il accepte (" + r.why + ").", 5, "ok"); }
      else { L.refused.push(A.id); msg("❌ Consigne « " + A.nom.replace(" (après 20 h)", "") + " » : il refuse, " + r.why + ".", 5, "alert"); }
    }
    if (!a && L.later && h >= 20) { const A = ACT(L.later); L.later = null; const r = obey(A.id); if (r.ok) { a = A; why = "ta consigne du matin : " + r.why; } else msg("❌ Ta consigne « Sortir le soir » : il refuse, " + r.why + ".", 5, "alert"); }
    if (!a && L.refused.length && rand() < .3) { const A = ACT(L.refused.shift()); if (!A.soir || h >= 20) { a = A; why = "finalement, il repense à ta consigne et la suit"; } }
    if (!a) { const c = conscience(); a = c.a; why = "sa décision : " + c.why; }
    L.cur = a; L.until = Math.min(22, h + a.dur); L.done.push(a.id);
    if (G.foot && G.foot.sit) standUp(true);
    G.auto = null; autoToggle(true, a.mode, true);
    G.lifeMsg = a.ic + " " + a.nom.replace(" (après 20 h)", "") + " · " + why;
    msg("🧠 " + G.lifeMsg, 5, "ok");
  }
  // fin de journée : il rentre obligatoirement chez lui, en taxi ou en bus s'il est loin
  function goHomeTonight() {
    const L = G.life, h = HOME(); if (!L || !h) return;
    L.cur = ACT("rentrer"); L.until = 24;
    if (G.foot && G.foot.sit) standUp(true);
    if (!G.foot) { const p = G.player; G.foot = { x: p.x + Math.sin(p.a) * 26, y: p.y - Math.cos(p.a) * 26, a: p.a, v: 0, t: 0 }; }
    G.auto = null; autoToggle(true, "maison", true);
    const far = Math.hypot(h.x - G.foot.x, h.y - G.foot.y) > 1200;
    if (far && G.me.argent >= 3) { const bus = G.me.argent < 8 || rand() < .4; pay(bus ? 2 : 5, bus ? "bus pour rentrer" : "taxi pour rentrer"); callTaxi(true, bus); G.lifeMsg = (bus ? "🚌 Il prend le bus" : "🚕 Il prend un taxi") + " pour rentrer chez lui"; }
    else G.lifeMsg = "🏠 Fin de journée : il rentre chez lui à pied";
    note(G.lifeMsg + ".");
  }
  function lifeUpdate() {
    if (G.me && G.me.prisonT) { if (jailed()) { G.me.faim = Math.min(G.me.faim, 60); G.lifeMsg = "🔒 En cellule au commissariat jusqu'à " + hh(G.me.prisonT % 24); return; } unjail(); }
    if (G.phase === "nuit" || !G.life) return;
    const L = G.life;
    if (G.hour < L.wake && !L.orders.length) { // réveil : il prend son temps à la maison
      if (!G.auto || G.auto.mode !== "maison") atHome("☕ Il se prépare à la maison");
      G.lifeMsg = "☕ Il se réveille, se lave et prend son petit-déjeuner"; if (G.auto) G.auto.doing = G.lifeMsg; return;
    }
    if (L.evt && G.hour >= L.evt) { L.evt = 0; cityEvent(); }
    if (G.auto && G.auto.phase === "ride") return;
    if (G.hour >= 21.5 && (!L.cur || L.cur.id !== "rentrer")) { goHomeTonight(); return; }
    if (L.cur && L.cur.id === "rentrer") return;
    if (L.orders.length || !L.cur || G.hour >= L.until || !G.auto || (L.later && G.hour >= 20)) nextActivity();
  }
  // fiche du personnage : son destin, ses besoins, son journal
  function showMe() {
    if (!G || !G.me || $("mepanel")) return;
    const me = G.me, wasPaused = G.paused; G.paused = true;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const bar = (n, lab) => `<div class="pp-bar"><span>${lab}</span><i><b style="width:${n}%"></b></i><em>${Math.round(n)}</em></div>`;
    const R = relations.get(), love = R.filter(r => r.amour).length;
    const d = document.createElement("div"); d.id = "mepanel"; d.className = "bureau";
    d.innerHTML = `<div class="bureau-box bureau-faq" role="dialog" aria-modal="true" aria-labelledby="me-t"><button type="button" class="bureau-x" aria-label="Fermer">✕</button>
      <p class="bureau-k">🧍 Mon personnage · décidé par le jeu</p><h2 id="me-t">Il est ${esc(me.car)}</h2>
      <div class="pp-grid"><p><b>Aime</b><br>${esc(me.gouts.join(" et "))}</p><p><b>Travail</b><br>${esc(me.metier)}</p><p><b>Argent</b><br>${me.argent} e-makuta</p><p><b>Relations</b><br>${R.length} personne${R.length > 1 ? "s" : ""}${love ? ", dont " + love + " amoureuse" + (love > 1 ? "s" : "") : ""}</p><p><b>Couple</b><br>${me.conjoint ? "💒 marié à " + esc(me.conjoint) : R.some(r => r.fiance) ? "💍 fiancé à " + esc(R.find(r => r.fiance).nom) + " (dot : " + DOT + " e-makuta)" : love ? "💘 amoureux" : "célibataire"}</p><p><b>Réputation</b><br>${repLabel(me.rep || 0)} (${me.rep || 0})</p></div>
      ${bar(me.honnete, "Honnêteté")}${bar(me.charisme * 10, "Charisme")}${bar(me.intel * 10, "Intelligence")}${bar(me.force * 10, "Force")}${bar(G.energy, "Énergie")}${bar(100 - me.faim, "Rassasié")}
      <h3>Journal</h3>${me.journal.length ? me.journal.slice(0, 25).map(j => `<p><b>${j.h}</b> · ${esc(j.t)}</p>`).join("") : "<p>Rien encore aujourd'hui.</p>"}
      <p style="font-size:12px;opacity:.7;margin-top:12px">Son caractère et son honnêteté changent selon ce qu'il vit. Aperçu : ces données sont gardées dans ce navigateur, elles seront liées à ton compte et à ton porte-monnaie e-makuta dans la version en ligne.</p></div>`;
    document.body.appendChild(d);
    const close = () => { d.remove(); if (G) G.paused = wasPaused; };
    d.querySelector(".bureau-x").onclick = close; d.addEventListener("click", e => { if (e.target === d) close(); });
    d.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") close(); });
    d.querySelector(".bureau-x").focus();
  }
  // consignes : 3 par jour au plus, à donner le matin ; il les suit… ou pas
  function openPlan() {
    if (!G || !WALK || $("planpanel")) return;
    if (jailed()) { msg("🔒 Il est en cellule : pas de consignes avant sa sortie.", 3.5, "alert"); return; }
    if (G.phase !== "matin") { msg("📋 Les consignes se donnent le matin, entre 5 h et 10 h. Pour l'instant, tu observes.", 3.5); return; }
    const wasPaused = G.paused; G.paused = true;
    const given = (G.plan || []).slice(); let sel = [];
    const me = G.me, esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const left = () => 3 - given.length - sel.length;
    const d = document.createElement("div"); d.id = "planpanel"; d.className = "bureau";
    const draw = () => {
      d.innerHTML = `<div class="bureau-box" role="dialog" aria-modal="true" aria-labelledby="plan-t"><button type="button" class="bureau-x" aria-label="Fermer">✕</button>
        <p class="bureau-k">📋 Consignes du jour · il est ${hh(G.hour)}</p><h2 id="plan-t">Que lui demandes-tu aujourd'hui ?</h2>
        <p>Ton personnage est autonome : il suivra tes consignes… ou pas, selon ses convictions. Il est <b>${esc(me.car)}</b> et il aime <b>${esc(me.gouts.join(" et "))}</b>. Parfois, il change d'avis plus tard.</p>
        ${given.length ? `<p><b>Déjà demandé aujourd'hui :</b> ${given.map(id => ACT(id).ic + " " + esc(ACT(id).nom)).join(", ")}</p>` : ""}
        <div class="sorties">${ACTS.filter(a => !a.hidden).map(a => { const k = sel.indexOf(a.id); return `<button type="button" data-a="${a.id}" aria-pressed="${k >= 0}"><b>${k >= 0 ? (k + 1) + ". " : ""}${a.ic} ${a.nom}</b><span>Environ ${String(a.dur).replace(".", ",")} h</span></button>`; }).join("")}</div>
        <p class="bureau-msg">${left() > 0 ? `Encore ${left()} consigne${left() > 1 ? "s" : ""} possible${left() > 1 ? "s" : ""} aujourd'hui.` : "Tu as donné tes 3 consignes du jour."}</p>
        <button type="button" class="plan-ok" ${sel.length ? "" : "disabled"}>Donner ${sel.length > 1 ? "ces consignes" : "cette consigne"}</button></div>`;
      d.querySelector(".bureau-x").onclick = close;
      d.querySelectorAll("[data-a]").forEach(b => b.onclick = () => { const id = b.dataset.a, k = sel.indexOf(id); if (k >= 0) sel.splice(k, 1); else if (left() > 0) sel.push(id); draw(); const f = d.querySelector(`[data-a="${id}"]`); if (f) f.focus(); });
      d.querySelector(".plan-ok").onclick = () => {
        if (!sel.length) return;
        savePlan(given.concat(sel)); close();
        if (!G.life) G.life = newLife();
        G.life.orders.push(...sel); G.life.wake = Math.min(G.life.wake, G.hour);
        msg("📋 Consigne" + (sel.length > 1 ? "s données" : " donnée") + " : " + sel.map(id => ACT(id).ic + " " + ACT(id).nom.replace(" (après 20 h)", "")).join(", ") + ". Voyons s'il t'écoute…", 4, "ok");
        G.life.cur = null;
      };
    };
    const close = () => { d.remove(); if (G) G.paused = wasPaused; };
    d.addEventListener("click", e => { if (e.target === d) close(); });
    d.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") close(); });
    draw(); document.body.appendChild(d); const f = d.querySelector("[data-a]"); if (f) f.focus();
  }
  // densité de la ville selon l'heure (rues vides la nuit, heure de pointe le matin et le soir)
  const dens = h => h < 5 ? .2 : h < 6.5 ? .45 : h < 9 ? 1 : h < 17 ? .85 : h < 20 ? 1 : h < 22 ? .6 : .3;


  // ---------------------------------------------------------------- ligne de bus 1 : arrêts, portes, passagers, touristes
  // Les bus suivent une boucle qui passe devant les lieux de la ville. À chaque arrêt ils se rangent,
  // ouvrent la porte (côté trottoir), laissent descendre puis monter les gens, et repartent.
  const BUS_HL = 36, BUS_HW = 11, BUS_OFF = [-26, -13, 0, 13, 26], BUS_FARE = 2, BUS_CAP = 24;
  const PAYS_TOURISTES = ["Belgique", "France", "Sénégal", "Côte d'Ivoire", "Cameroun", "Angola", "Brésil", "Chine", "Canada", "Afrique du Sud", "Nigeria", "Japon"];
  let NET = null;
  function busNet() {
    if (NET) return NET;
    NET = { stops: [], route: [] };
    const pl = PLACES.filter(o => o.door && o.id !== "maison" && o.type !== "parking");
    if (pl.length < 3) return NET;
    const cx = pl.reduce((t, o) => t + o.x, 0) / pl.length, cy = pl.reduce((t, o) => t + o.y, 0) / pl.length;
    pl.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    const want = Math.min(8, pl.length), cand = [];
    for (let k = 0; k < want; k++) { const o = pl[Math.floor(k * pl.length / want)], n = nearestNode(o.door.x, o.door.y); if (nodes[n].nb.length >= 2 && !cand.some(c => c.n === n)) cand.push({ n, o }); }
    // relie les arrêts dans l'ordre ; un arrêt injoignable est sauté
    const seq = [], legs = [];
    for (const c of cand) {
      if (!seq.length) { seq.push(c); continue; }
      const P = findPath(seq[seq.length - 1].n, c.n); if (!P || P.length < 3) continue;
      seq.push(c); legs.push(P);
    }
    while (seq.length >= 3) { const P = findPath(seq[seq.length - 1].n, seq[0].n); if (P && P.length >= 3) { legs.push(P); break; } seq.pop(); legs.pop(); }
    if (seq.length < 3) return NET;
    const route = [];
    seq.forEach((c, k) => { c.ri = route.length; route.push(...legs[k].slice(0, -1)); });
    const L = route.length;
    seq.forEach((c, k) => {
      const n = c.n, prev = route[(c.ri - 1 + L) % L], N = nodes[n], Pn = nodes[prev];
      const dx = N.x - Pn.x, dy = N.y - Pn.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, rx = -uy, ry = ux;
      const back = Math.min(90, len * .45), lane = Math.min(30, N.w * .22), bx = N.x - ux * back, by = N.y - uy * back;
      let side = N.w / 2 + 16; while (side > 6 && walkBlocked(bx + rx * side, by + ry * side)) side -= 4;
      NET.stops.push({ k, n, ri: c.ri, place: c.o, nom: "arrêt " + c.o.nom, a: Math.atan2(uy, ux), ux, uy, rx, ry,
        x: bx + rx * lane, y: by + ry * lane, sx: bx + rx * side, sy: by + ry * side, wx: bx + rx * side - ux * 14, wy: by + ry * side - uy * 14 });
    });
    NET.route = route;
    return NET;
  }
  function nearestStop(x, y) { const N = busNet(); let best = null, bd = 1e18; for (const st of N.stops) { const d = Math.hypot(st.sx - x, st.sy - y); if (d < bd) { bd = d; best = st; } } return best; }
  // point de la porte (avant droit du bus, côté trottoir)
  function busDoor(c) { const fx = Math.cos(c.a), fy = Math.sin(c.a); return { x: c.x + fx * BUS_HL * .55 - fy * (BUS_HW + 7), y: c.y + fy * BUS_HL * .55 + fx * (BUS_HW + 7) }; }
  function initBuses() {
    const N = busNet(); G.buses = [];
    if (N.stops.length < 3) return;
    const n = N.stops.length, nb = Math.min(3, n);
    for (let j = 0; j < nb; j++) {
      const st = N.stops[Math.floor(j * n / nb)];
      const c = makeCar("traffic", st.x, st.y, st.a, { maxSpeed: 165, accel: 190, steerMax: 1.9, dmgMul: .4, mass: 3, grip: 10 });
      Object.assign(c, { bus: true, line: 1, num: j + 1, hl: BUS_HL, hw: BUS_HW, offs: BUS_OFF, tIdx: 0, sprite: TRAFFIC_SPRITES[0],
        ri: st.ri, at: st.k, next: (st.k + 1) % n, state: "stop", wait: 3 + j * 2, door: 0, closing: false, pax: [], stuck: 0 });
      // des passagers sont déjà à bord
      for (let k = 0; k < 4 + j * 2; k++) c.pax.push(newPax(st.k, rand() < .35));
      G.buses.push(c);
    }
  }
  function newPax(from, tourist) {
    const n = busNet().stops.length;
    return { id: ++pedSeq, look: (rand() * 7) | 0, tourist, dest: (from + 1 + ((rand() * (n - 1)) | 0)) % n };
  }
  function busAI(c, dt) {
    const N = NET, L = N.route.length, n = N.stops.length;
    if (c.state === "stop") {
      c.inp.gas = 0; c.inp.brake = 1; c.inp.steer = 0; c.inp.hand = 1;
      const st = N.stops[c.at];
      if (c.closing) { c.door = Math.max(0, c.door - dt * 1.4); if (c.door <= 0) { c.closing = false; c.state = "drive"; c.ri = st.ri; c.inp.hand = 0; } return; }
      c.door = Math.min(1, c.door + dt * 1.4); c.wait -= dt;
      if (c.door >= 1) busExchange(c, st, dt);
      const boarding = G.peds.some(q => q.bus && q.bus.car === c) || (G.auto && G.auto.phase === "boardbus" && G.auto.bus === c);
      if (c.wait <= 0 && (!boarding || c.wait < -10) && !(c.alight && c.alight.length)) c.closing = true;
      return;
    }
    // conduite « sur rails » le long de la ligne : le bus suit sa voie, ralentit aux virages et aux arrêts, attend les feux et les piétons
    const st = N.stops[c.next], i = c.ri, j = (i + 1) % L, b = N.route[j], toStop = j === st.ri;
    const t = toStop ? st : edgePoint(N.route[i], b, Math.min(30, nodes[b].w * .22));
    const dx = t.x - c.x, dy = t.y - c.y, d = Math.hypot(dx, dy);
    let want = 120;
    if (toStop) want = Math.min(want, 16 + d * .8);
    else { const nb = nodes[b], na = nodes[N.route[i]], nc = nodes[N.route[(j + 1) % L]], turn = Math.abs(angDiff(Math.atan2(nb.y - na.y, nb.x - na.x), Math.atan2(nc.y - nb.y, nc.x - nb.x))); if (turn > .5 && d < 170) want = 42; }
    c.blockT = c.blockT || 0;
    if (c.blockT < 4 && stopHere(c, b)) { want = 0; c.blockT += dt; }
    else if (c.blockT >= 4) { c.blockT += dt; if (c.blockT > 7) c.blockT = 0; }
    else c.blockT = 0;
    c.spd = c.spd || 0; c.spd += Math.max(-220 * dt, Math.min(80 * dt, want - c.spd));
    const mv = Math.min(d, c.spd * dt);
    if (d > .5) { c.x += dx / d * mv; c.y += dy / d * mv; c.a += angDiff(c.a, Math.atan2(dy, dx)) * Math.min(1, dt * 3.2); }
    c.vx = Math.cos(c.a) * c.spd; c.vy = Math.sin(c.a) * c.spd;
    c.inp.gas = c.spd < want ? 1 : 0; c.inp.brake = c.spd > want + 5 || c.spd < 1 ? 1 : 0; c.inp.steer = 0; c.inp.hand = 0;
    if (toStop && d < 3) { c.state = "stop"; c.at = st.k; c.next = (st.k + 1) % n; c.wait = 6 + rand() * 3; c.vx = c.vy = c.spd = 0; busArrive(c, st); return; }
    if (!toStop && d < 22) c.ri = j;
  }
  // arrivée à un arrêt : qui descend ?
  function busArrive(c, st) {
    c.alight = c.pax.filter(x => x.dest === st.k); c.pax = c.pax.filter(x => x.dest !== st.k); c.xT = .8;
    const f = G.foot, A = G.auto;
    if (f && f.inBus === c && A && A.phase === "inbus") {
      A.left--;
      const g = GUIDE[st.place.id];
      if (A.left > 0) { msg("🚌 Arrêt : " + st.place.nom + (g ? ". " + g : "."), 5, "ok"); note("🚌 Le bus passe par " + st.place.nom + "."); }
      else { A.getOff = st; msg("🚌 Ton personnage descend à l'" + st.nom + ".", 3.5, "ok"); }
    }
  }
  // portes ouvertes : on descend un par un, puis ceux qui attendent montent
  function busExchange(c, st, dt) {
    c.xT -= dt;
    const f = G.foot, A = G.auto;
    if (A && A.phase === "inbus" && f && f.inBus === c && A.getOff === st && c.xT <= 0) {   // le personnage descend
      const dpt = busDoor(c); f.inBus = null; f.x = dpt.x; f.y = dpt.y; f.a = st.a + Math.PI / 2; f.v = 0; A.getOff = null; c.xT = .7;
      A.phase = "walk"; A.path = null; A.mode = "tourisme"; A.tour = [st.place].concat((A.tour || []).filter(o => o !== st.place));
      note("🚌 Il descend du bus pour visiter " + st.place.nom + "."); if (G.life) G.life.until = Math.max(G.life.until || 0, Math.min(21, G.hour + 1.5)); return;
    }
    if (c.alight && c.alight.length) { if (c.xT <= 0) { spawnFromBus(c, st, c.alight.shift()); c.xT = .7; } return; }
    if (c.pax.length >= BUS_CAP) return;
    for (const q of G.peds) if (q.bus && q.bus.phase === "wait" && q.bus.stop === st.k) { q.bus.phase = "board"; q.bus.car = c; }
  }
  function spawnFromBus(c, st, x) {
    const dpt = busDoor(c), n = st.n, nb = nodes[n].nb, m = nb[(rand() * nb.length) | 0];
    const q = { x: dpt.x, y: dpt.y, a: st.a + Math.PI / 2, from: n, to: m, side: 1, off: nodes[n].w / 2 + 14, v: 11 + rand() * 5, t: rand() * 9, state: "walk", st: 0, look: x.look, id: x.id, tourist: x.tourist };
    if (x.tourist) { const o = st.place; q.visit = o.nom; ident(q).home = { x: o.door.x, y: o.door.y }; planHome(q); }
    G.peds.push(q);
  }
  // gens qui attendent aux arrêts proches (des habitants et des touristes)
  function busCrowd(dt) {
    const N = NET; if (!N || !N.stops.length) return;
    const f = G.foot || G.player, h = G.hour, busy = h >= 6 && h < 21 ? 1 : .15;
    for (const st of N.stops) {
      if (Math.abs(st.sx - f.x) > 1600 || Math.abs(st.sy - f.y) > 1600) continue;
      const waiting = G.peds.filter(q => q.bus && q.bus.stop === st.k).length;
      if (waiting < 4 && rand() < dt * .12 * busy) {
        const k = waiting, x = st.wx - st.ux * k * 9 + st.rx * (rand() * 6 - 3), y = st.wy - st.uy * k * 9 + st.ry * (rand() * 6 - 3);
        if (walkBlocked(x, y)) continue;
        const nb = nodes[st.n].nb, tourist = rand() < .35;
        G.peds.push({ x, y, a: st.a - Math.PI / 2, from: st.n, to: nb[0], side: 1, off: nodes[st.n].w / 2 + 14, v: 12, t: rand() * 9, state: "idle", st: 0, look: (rand() * 7) | 0, id: ++pedSeq, tourist,
          bus: { stop: st.k, phase: "wait", dest: newPax(st.k, tourist).dest, waitT: 0 } });
      }
    }
  }
  function busPed(q, dt) {
    const B = q.bus;
    if (B.phase === "wait") { q.state = "idle"; B.waitT += dt; if (B.waitT > 240) { q.bus = null; q.state = "walk"; } return; }
    const c = B.car;
    if (!c || c.state !== "stop" || c.closing) { B.phase = "wait"; B.car = null; return; }
    const d = busDoor(c), dx = d.x - q.x, dy = d.y - q.y, dist = Math.hypot(dx, dy);
    if (dist < 7) { q.gone = true; c.pax.push({ id: q.id, look: q.look, tourist: q.tourist, dest: B.dest, idn: q.idn }); return; }
    q.state = "walk"; q.a = Math.atan2(dy, dx); const v = Math.min(dist, 16 * dt); q.x += dx / dist * v; q.y += dy / dist * v; q.t += dt;
  }
  // le personnage du joueur : attendre, monter, regarder la ville, descendre
  function busRider(dt) {
    const A = G.auto, f = G.foot; if (!f) { G.auto = null; return; }
    const st = A.stop;
    if (A.phase === "waitbus") {
      A.waitT += dt; f.v = 0;
      const c = (G.buses || []).find(b => b.state === "stop" && b.at === st.k && !b.closing && b.door > .9);
      if (c) { A.phase = "boardbus"; A.bus = c; return; }
      if (A.waitT > 420) { msg("🚏 Le bus tarde : ton personnage repart à pied.", 3); A.phase = "walk"; A.path = null; A.mode = "promenade"; }
      return;
    }
    if (A.phase === "boardbus") {
      const c = A.bus; if (!c || c.state !== "stop" || c.closing) { A.phase = "waitbus"; A.bus = null; return; }
      const d = busDoor(c), dx = d.x - f.x, dy = d.y - f.y, dist = Math.hypot(dx, dy);
      if (dist < 8) {
        if (!pay(BUS_FARE, "ticket de bus, ligne 1")) { msg("🚏 Pas assez d'argent pour le bus.", 3, "alert"); A.phase = "walk"; A.path = null; A.mode = "promenade"; return; }
        f.inBus = c; A.phase = "inbus"; A.left = 3 + ((rand() * 3) | 0); A.doing = "🚌 Dans le bus de la ligne 1 : il regarde la ville";
        msg("🚌 Ton personnage monte dans le bus n° " + c.num + " de la ligne 1. Il descendra dans " + A.left + " arrêts.", 4, "ok"); return;
      }
      f.a = Math.atan2(dy, dx); f.v = 20; const v = Math.min(dist, 20 * dt); f.x += dx / dist * v; f.y += dy / dist * v; f.t += dt;
      return;
    }
    if (A.phase === "inbus") { const c = f.inBus; if (!c) { A.phase = "walk"; A.path = null; return; } f.x = c.x; f.y = c.y; f.a = c.a; f.v = 0; }
  }
  function update(dt) {
    const p = G.player; G.t += dt;
    if (WALK) clockStep(dt);
    const locked = WALK;   // 2 Life : le personnage est autonome, le joueur ne le pilote pas
    // entrées joueur
    let kUp = keys.ArrowUp || keys.KeyW || touch.gas, kDown = keys.ArrowDown || keys.KeyS || touch.brake;
    let kSteer = ((keys.ArrowRight || keys.KeyD || touch.right) ? 1 : 0) - ((keys.ArrowLeft || keys.KeyA || touch.left) ? 1 : 0);
    if (locked && (kUp || kDown || kSteer || actPressed)) {
      kUp = kDown = false; kSteer = 0; actPressed = false;
      if (!(G.lockMsgT > G.t)) { G.lockMsgT = G.t + 6; msg("👀 Ton personnage est autonome : il marche et décide seul. Le matin (5 h - 10 h), donne-lui des consignes avec 📋.", 4); }
    }
    if (G.auto && (kUp || kDown || kSteer)) autoToggle(false);
    if (G.foot && G.foot.sit && (kUp || kDown || kSteer) && !G.auto) standUp();
    if (G.auto) { autoUpdate(dt); if (!G.foot && G.auto && G.auto.phase === "ride") { /* le taxi roule tout seul */ } else if (G.foot) { p.inp.gas = 0; p.inp.brake = 1; p.inp.steer = 0; p.inp.hand = 1; p.inp.nitro = 0; } }
    else if (G.foot && G.foot.sit) { p.inp.gas = 0; p.inp.brake = 1; p.inp.steer = 0; p.inp.hand = 1; G.foot.v = 0; }
    else if (G.foot && G.foot.inBus) { p.inp.gas = 0; p.inp.brake = 1; }
    else if (G.foot) { p.inp.gas = 0; p.inp.brake = 1; p.inp.steer = 0; p.inp.hand = 1; p.inp.nitro = 0; footStep(dt, kUp, kDown, kSteer, (keys.ShiftLeft || keys.ShiftRight || touch.nitro) && G.energy > 8); }
    else {
      p.inp.gas = kUp ? 1 : 0;
      p.inp.brake = kDown ? 1 : 0;
      p.inp.steer = kSteer;
      p.inp.hand = keys.Space || touch.hand ? 1 : 0;
      const wantN = keys.ShiftLeft || keys.ShiftRight || keys.KeyN || touch.nitro;
      if (wantN && G.nitro > 0 && p.inp.gas) { if (!p.inp.nitro) Audio.boost(); p.inp.nitro = 1; G.nitro = Math.max(0, G.nitro - 28 * dt); } else p.inp.nitro = 0;
    }
    if (actPressed) { actPressed = false; doAction(); }
    if (WALK) {
      // énergie : la marche fatigue, s'asseoir, le taxi et la maison reposent
      const fv = G.foot ? Math.abs(G.foot.v) : 0, home = G.auto && G.auto.phase === "home";
      G.energy += (home ? 14 : G.foot && G.foot.sit ? 3.5 : !G.foot ? 1.2 : fv > 50 ? -1.4 : fv > 5 ? -.55 : .4) * dt;
      G.energy = Math.max(0, Math.min(100, G.energy));
      if (G.energy < 8 && !G.auto && G.foot && !G.foot.sit && !G.tiredMsg) { G.tiredMsg = true; msg("😮‍💨 Ton personnage est épuisé : assieds-toi sur un banc, prends le taxi ou lance la promenade auto.", 4.5, "alert"); }
      if (G.energy > 30) G.tiredMsg = false;
      if (G.foot && G.foot.sit) sitUpdate(dt);
      if (G.hour >= 7 && G.hour <= 21) G.games.forEach(g => gameStep(g, dt));
      chatUpdate(dt);
      lifeUpdate();
      // le soir, les habitants rentrent chez eux
      if (G.hour >= 17 && G.hour < 23) for (const q of G.peds) if (!q.staff && !q.route && !q.enter && !q.chat && !q.cop && q.state === "walk" && rand() < dt * .012) planHome(q);
    }

    G.seen = false;
    G.cops.forEach(c => copAI(c, dt));
    G.traffic.forEach(trafficAI);
    if (WALK) { if (!G.buses) initBuses(); G.buses.forEach(c => busAI(c, dt)); busCrowd(dt); }
    stepCar(p, dt); G.cops.forEach(c => stepCar(c, dt)); G.traffic.forEach(c => stepCar(c, dt));
    // à pied, les collisions se calculent autour du personnage (pas de la voiture laissée au parking)
    const cc = G.foot || p, nearC = c => Math.abs(c.x - cc.x) < 1400 && Math.abs(c.y - cc.y) < 1400 || Math.abs(c.x - p.x) < 1400 && Math.abs(c.y - p.y) < 1400;
    const near = [p, ...G.cops.filter(nearC), ...G.traffic.filter(nearC), ...(G.buses || []).filter(nearC)];
    const fcar = G.foot || p, pk = G.parked.filter(c => Math.abs(c.x - fcar.x) < 1400 && Math.abs(c.y - fcar.y) < 1400 || Math.abs(c.x - p.x) < 200 && Math.abs(c.y - p.y) < 200);
    collideCars(near.concat(pk));
    near.forEach(carVsStatic);
    pk.forEach(c => { c.x = c.x0; c.y = c.y0; c.a = c.a0; c.vx = c.vy = 0; c.stun = 0; c.health = 100; });

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
    const fcp = G.foot || p;
    G.cops = G.cops.filter(c => (c.kind !== "block" || c.life > 0) && (c.alive || c.wreckT > 0) &&
      !(c.mode === "leave" && Math.hypot(c.x - p.x, c.y - p.y) > 1500) && !(WALK && c.mode === "patrol" && Math.hypot(c.x - fcp.x, c.y - fcp.y) > 2800));

    // traffic renouvelé
    G.traffic = G.traffic.filter(c => !c.dead && Math.hypot(c.x - fcar.x, c.y - fcar.y) < 2600);
    const dn = WALK ? dens(G.hour) : 1, nTraf = Math.round(44 * (WALK ? Math.max(.3, dn) : 1));
    while (G.traffic.length < nTraf) spawnTraffic(false);
    if (G.traffic.length > nTraf + 3) { const c = G.traffic.find(c => Math.hypot(c.x - fcar.x, c.y - fcar.y) > 1500); if (c) c.dead = true; }
    // piétons
    const fc = G.foot || p;
    G.peds = G.peds.filter(q => !q.gone && (q.staff || Math.hypot(q.x - fc.x, q.y - fc.y) < 1900));
    const nPed = Math.round(PED_N * dn), walkers = G.peds.filter(q => !q.staff);
    for (let k = walkers.length; k < nPed; k++) spawnPed(false);
    if (walkers.length > nPed + 3) { const q = walkers.find(q => !q.route && !q.enter && !q.bus && Math.hypot(q.x - fc.x, q.y - fc.y) > 700); if (q) planHome(q); if (q && !q.route) q.gone = true; }
    G.peds.forEach(q => pedStep(q, dt, near));
    resolveBodies(near.concat(pk));
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
      if (WALK ? patrols < 3 && rand() < dt * .3 : patrols < 2 && G.calmT > 6 && rand() < dt * .5) spawnCop(false);
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
    G.parked.forEach(c => { if (Math.abs(c.x - G.cam.x) < 1400 && Math.abs(c.y - G.cam.y) < 1400) drawCar(c); }); G.traffic.forEach(drawCar); (G.buses || []).forEach(drawCar); G.cops.forEach(drawCar); drawCar(p);

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
    const PCOL = { foot: "#3fbf5a", jeux: "#3fbf5a", basket: "#3fbf5a", club: "#c04bff", alim: "#ffb21f", magasin: "#ffb21f", partenaire: "#2fa8ff", etat: "#f2f2f2", bureau: "#ff5a1f" };
    PLACES.forEach(o => { const x = X(o.x), y = Y(o.y); if (x < -4 || y < -4 || x > MM + 4 || y > MM + 4) return; mctx.fillStyle = PCOL[o.type] || "#fff"; mctx.beginPath(); mctx.arc(x, y, o.bureau ? 5.2 : 3.4, 0, 6.283); mctx.fill(); mctx.strokeStyle = "rgba(0,0,0,.6)"; mctx.lineWidth = 1; mctx.stroke(); });
    if (G.foot) { mctx.fillStyle = "#7ff0a8"; mctx.beginPath(); mctx.arc(X(G.foot.x), Y(G.foot.y), 3, 0, 6.283); mctx.fill(); }
    (G.others || []).forEach(o => { if (o.x === undefined) return; const x = X(o.x), y = Y(o.y); if (x < -4 || y < -4 || x > MM + 4 || y > MM + 4) return; mctx.fillStyle = "#18e0ff"; mctx.strokeStyle = "#04161c"; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(x, y, 3.6, 0, 6.283); mctx.fill(); mctx.stroke(); });
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
      const pr = $("h-prompt"); pr.hidden = !G.prompt; if (G.prompt) { pr.querySelector("span").textContent = G.prompt; $("actbtn").hidden = !G.act; $("actbtn").innerHTML = "<kbd>E</kbd>" + ({ exit: "Descendre", enter: "Monter", pick: "Prendre", sit: "S'asseoir", stand: "Se lever", autostop: "Reprendre la main", bureau: "Entrer" }[G.act] || "OK"); }
      if (WALK && $("h-clock")) { const ph = G.phase === "matin" ? "☀️ consignes possibles" : G.phase === "nuit" ? "🌙 il dort" : "🧠 il agit seul"; $("h-clock").textContent = hh(G.hour) + " · " + ph; }
      if (WALK && G.me && $("h-faim")) { const fa = Math.round(G.me.faim); $("h-faim").style.width = fa + "%"; $("h-faim").className = fa > 70 ? "low" : ""; $("h-faim-n").textContent = fa + " %"; $("h-money").textContent = "💰 " + G.me.argent + " e-makuta"; }
      if (WALK && $("h-energy")) { const e = Math.round(G.energy); $("h-energy").style.width = e + "%"; $("h-energy").className = e < 25 ? "low" : ""; $("h-energy-n").textContent = e + " %"; }
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
      liveStep(dt);
    }
    if (window.ZBOSS_3D && window.ZBOSS_3D.ok) window.ZBOSS_3D.render(G, dt); else render();
    requestAnimationFrame(loop);
  }
  // ---------------------------------------------------------------- Ville en direct
  // les vrais joueurs connectés apparaissent dans la ville 3D (prénom au-dessus de la tête).
  // Mode réel : WebSocket vers le serveur, position envoyée toutes les 2 s. Démo : quelques habitants simulés.
  const LIVE = { ws: null, sendAt: 0, retry: 0, retryAt: 0, map: new Map(), online: 0, told: false };
  const LIVE_DEMO = [["Grâce", true], ["Patrick", false], ["Bénédicte", true], ["Junior", false], ["Merveille", true]];
  function livePos() {
    const f = G.foot, b = f && f.inBus, o = b || f || G.player;
    return { x: o.x, y: o.y, a: o.a, m: b ? "bus" : f ? "pied" : "auto" };
  }
  function liveConnect(API) {
    let tok = null; try { tok = JSON.parse(localStorage.getItem("twolife_token")); } catch (e) { }
    if (!tok || typeof WebSocket === "undefined") { LIVE.retryAt = performance.now() + 30000; return; }
    let ws; try { ws = new WebSocket(API.replace(/^http/, "ws") + "/api/ville/direct", ["twolife", tok]); } catch (e) { LIVE.retryAt = performance.now() + 30000; return; }
    LIVE.ws = ws;
    ws.onopen = () => { LIVE.retry = 0; LIVE.sendAt = 0; };
    ws.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch (er) { return; } if (d && Array.isArray(d.joueurs)) liveSnapshot(d); };
    ws.onclose = e => { LIVE.ws = null; LIVE.retryAt = performance.now() + (e.code === 4000 ? 6e5 : Math.min(60000, 3000 * 2 ** LIVE.retry++)); LIVE.map.clear(); };
  }
  function liveSnapshot(d) {
    const now = performance.now(), seen = new Set();
    d.joueurs.forEach(j => {
      let o = LIVE.map.get(j.id);
      if (!o) { o = { id: j.id, nom: j.nom, fem: !!j.fem, x: j.x, y: j.y, a: j.a, v: 0, look: (parseInt(String(j.id).slice(0, 6), 16) || 7) % 997, other: true }; LIVE.map.set(j.id, o); }
      o.tx = j.x; o.ty = j.y; o.ta = j.a; o.m = j.m; o.seen = now; seen.add(j.id);
    });
    for (const id of [...LIVE.map.keys()]) if (!seen.has(id)) LIVE.map.delete(id);
    LIVE.online = d.en_ligne || seen.size + 1;
    if (!LIVE.told && seen.size) { LIVE.told = true; msg(`👥 Ville en direct : ${seen.size} autre${seen.size > 1 ? "s" : ""} joueur${seen.size > 1 ? "s" : ""} près de toi. Leur prénom flotte au-dessus d'eux.`, 5); }
  }
  function liveStep(dt) {
    if (!WALK || !G) return;
    const API = (window.TWO_LIFE_API || "").replace(/\/$/, ""), now = performance.now();
    if (!API) return liveDemo();
    if (!LIVE.ws) { if (now > LIVE.retryAt) liveConnect(API); }
    else if (LIVE.ws.readyState === 1 && now > LIVE.sendAt) { LIVE.sendAt = now + 2000; try { LIVE.ws.send(JSON.stringify(livePos())); } catch (e) { } }
    // glisse doucement vers la dernière position reçue
    const k = Math.min(1, dt * 1.6);
    for (const o of LIVE.map.values()) {
      if (Math.hypot(o.tx - o.x, o.ty - o.y) > 600) { o.x = o.tx; o.y = o.ty; }
      const nx = o.x + (o.tx - o.x) * k, ny = o.y + (o.ty - o.y) * k;
      o.v = dt > 0 ? Math.hypot(nx - o.x, ny - o.y) / dt : 0; o.x = nx; o.y = ny;
      let da = o.ta - o.a; da = Math.atan2(Math.sin(da), Math.cos(da)); o.a += da * k;
      o.state = o.v > 4 ? "walk" : "idle";
    }
    G.others = [...LIVE.map.values()];
  }
  // démo : quelques passants deviennent des « joueurs » simulés pour montrer à quoi ressemble la ville en direct
  function liveDemo() {
    const me = livePos(); G.others = G.others || [];
    LIVE_DEMO.forEach(([nom, fem], i) => {
      let o = G.others[i];
      if (!o) o = G.others[i] = { id: "demo" + i, nom, fem, demo: true, other: true };
      const q = o.ped;
      if (!q || !G.peds.includes(q) || Math.hypot(q.x - me.x, q.y - me.y) > 1800) {
        const free = G.peds.filter(p => !p.joueur && !p.kit && !p.cop && !p.vendor && !p.bus && Math.hypot(p.x - me.x, p.y - me.y) < 700);
        if (q) q.joueur = null;
        o.ped = free.length ? free[(Math.random() * free.length) | 0] : null; if (o.ped) o.ped.joueur = o;
      }
      if (o.ped) { o.x = o.ped.x; o.y = o.ped.y; o.a = o.ped.a; o.m = "pied"; }
    });
    if (!LIVE.told && G.others.some(o => o.ped)) { LIVE.told = true; msg("👥 Démo : les prénoms au-dessus de certains passants montrent les vrais joueurs. En ligne, ce seront les autres inscrits.", 5); }
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
    if (e.code === "KeyR" && G && WALK && !G.over && !G.paused) autoToggle();
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
  if ($("autobtn")) $("autobtn").addEventListener("click", () => openSorties());
  if ($("relbtn")) $("relbtn").addEventListener("click", () => showRelations());
  if ($("planbtn")) $("planbtn").addEventListener("click", () => openPlan());
  if ($("mebtn")) $("mebtn").addEventListener("click", () => showMe());
  if ($("speedbtn")) { if (WALK && window.TWO_LIFE_API) $("speedbtn").hidden = true; $("speedbtn").addEventListener("click", () => { if (!G) return; G.speed = G.speed === 1 ? 10 : G.speed === 10 ? 60 : 1; $("speedbtn").textContent = "⏩ ×" + G.speed; }); }
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
  window.ZBOSS_WORLD = { busNet, addObst, OBST, W, H, C, MW, MH, mask, MAP, ROADS, FILL, walkBlocked, SHOPS, PLACES, BILLBOARDS, BENCHES, LIGHTS, lightState, isOpen, SHOP_W, SHOP_D, SHOP_DOOR, nodes, nodesNear, nearestNode, solidAt, groundAt, angDiff, rand };
  window.__zboss = { get state() { return G; }, start: () => start(chosen), spawnCop, keys, touch, act: () => { actPressed = true; }, sortie: m => autoToggle(true, m), auto: m => autoToggle(true, m, true), sorties: openSorties, plan: openPlan, me: showMe, setHour: h => { G.hour = h; }, live: () => ({ others: (G && G.others || []).map(o => ({ nom: o.nom, x: Math.round(o.x), y: Math.round(o.y), m: o.m, ped: !!o.ped })), ws: LIVE.ws ? LIVE.ws.readyState : -1, online: LIVE.online }), liveStep: dt => liveStep(dt || 1 / 30), step: (n, dt) => { for (let i = 0; i < n && G && !G.paused; i++) update(dt || 1 / 30); } };
})();
