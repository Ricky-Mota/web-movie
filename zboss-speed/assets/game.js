// Zboss-speed — démo jouable (Canvas 2D, vue de dessus).
// Conduite avec dérapage, ville en grille, police avec niveaux de recherche,
// barrages, hélicoptère, évasion, nitro, trafic, score et sons synthétisés.
(function () {
  "use strict";

  // ---------------------------------------------------------------- Monde
  const R = 150;              // largeur des routes
  const B = 330;              // taille d'un pâté de maisons
  const P = R + B;            // pas de la grille
  const N = 14;               // pâtés par côté
  const W = N * P + R;        // taille du monde
  const CAR_R = 15;

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rand = rng(20261122);
  const ROOFS = ["#1b2030", "#202638", "#1a1f2b", "#262b3a", "#1e2433", "#231f2e"];
  const blocks = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const park = rand() < 0.12 && !(i === 6 && j === 6);
    const x = i * P + R, y = j * P + R;
    const b = { i, j, x, y, w: B, h: B, park, h3: 0.6 + rand() * 1.4, roof: ROOFS[(rand() * ROOFS.length) | 0], details: [] };
    if (park) { for (let k = 0; k < 9; k++) b.details.push({ x: x + 30 + rand() * (B - 60), y: y + 30 + rand() * (B - 60), r: 12 + rand() * 14 }); }
    else { for (let k = 0; k < 3; k++) b.details.push({ x: x + 30 + rand() * (B - 90), y: y + 30 + rand() * (B - 90), w: 20 + rand() * 40, h: 14 + rand() * 30 }); b.neon = rand() < 0.35 ? (rand() < 0.5 ? "#ff5a1f" : "#3fd0ff") : null; }
    blocks.push(b);
  }
  const blockAt = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? null : blocks[j * N + i];
  function solidAt(x, y) {
    if (x < 0 || y < 0 || x > W || y > W) return true;
    const i = Math.floor((x - R) / P), j = Math.floor((y - R) / P);
    const b = blockAt(i, j);
    if (!b || b.park) return false;
    return x >= b.x && x <= b.x + B && y >= b.y && y <= b.y + B;
  }
  function inPark(x, y) {
    const b = blockAt(Math.floor((x - R) / P), Math.floor((y - R) / P));
    return !!(b && b.park && x >= b.x && x <= b.x + B && y >= b.y && y <= b.y + B);
  }
  function los(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), steps = Math.ceil(d / 40);
    for (let s = 1; s < steps; s++) { const t = s / steps; if (solidAt(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
    return true;
  }
  const inter = (i, j) => ({ x: i * P + R / 2, y: j * P + R / 2 });
  const nearestInter = (x, y) => ({ i: Math.max(0, Math.min(N, Math.round((x - R / 2) / P))), j: Math.max(0, Math.min(N, Math.round((y - R / 2) / P))) });

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
      crash(v) { noiseBurst(Math.min(.6, v / 900), .35, 700); },
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
    const start = inter(6, 7);
    const player = makeCar("player", start.x, start.y - 40, -Math.PI / 2, st);
    player.sprite = carSprite(car.color, car.dark, "player"); player.carDef = car;
    G = {
      t: 0, player, cops: [], traffic: [], blocks: [], skids: [], parts: [], heli: null, msgs: [],
      heatPts: 0, heat: 0, chase: false, seen: false, evade: 0, evadeNeed: 6, busted: 0,
      bounty: 0, banked: 0, dist: 0, nitro: 60, takedowns: 0, escapes: 0, nearCd: new Map(),
      cam: { x: player.x, y: player.y, z: 1, a: player.a }, over: false, paused: false, lastBlockT: 0, calmT: 0, shake: 0,
      best: +(lsGet("zboss_best") || 0),
    };
    for (let k = 0; k < 34; k++) spawnTraffic(true);
    for (let k = 0; k < 2; k++) spawnCop(false);
    msg("Roule. Les patrouilles te repèrent si tu dépasses 170 km/h devant elles.", 4.5);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function msg(text, dur, kind) { G.msgs.push({ text, t: dur || 2.5, kind: kind || "" }); if (G.msgs.length > 3) G.msgs.shift(); }

  function spawnTraffic(anywhere) {
    const p = G.player;
    for (let tries = 0; tries < 20; tries++) {
      const horiz = rand() < 0.5, line = (rand() * (N + 1)) | 0, dir = rand() < 0.5 ? 1 : -1;
      const pos = 50 + rand() * (W - 100);
      const lane = line * P + (dir > 0 ? R * 0.68 : R * 0.32);
      const x = horiz ? pos : lane, y = horiz ? lane : pos;
      if (!anywhere && Math.hypot(x - p.x, y - p.y) < 900) continue;
      if (anywhere && Math.hypot(x - p.x, y - p.y) < 250) continue;
      const a = horiz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const c = makeCar("traffic", x, y, a, { maxSpeed: 170 + rand() * 90, accel: 260, steerMax: 2, dmgMul: 1, mass: .8, grip: 9 });
      c.horiz = horiz; c.lane = lane; c.dir = dir; c.tIdx = (rand() * TRAFFIC_SPRITES.length) | 0; c.sprite = TRAFFIC_SPRITES[c.tIdx]; c.bus = rand() < .22; c.taxi = !c.bus && rand() < .35; if (c.bus) c.maxSpeed *= .8;
      const sp = c.maxSpeed; c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp;
      G.traffic.push(c); return;
    }
  }
  function spawnCop(chasing) {
    const p = G.player;
    let best = null;
    for (let tries = 0; tries < 30; tries++) {
      const i = (rand() * (N + 1)) | 0, j = (rand() * (N + 1)) | 0, q = inter(i, j);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 750 || d > 1500) continue;
      if (chasing && los(q.x, q.y, p.x, p.y)) continue;
      best = q; break;
    }
    if (!best) { const q = inter((rand() * (N + 1)) | 0, (rand() * (N + 1)) | 0); best = q; }
    const heatMul = [0.82, 0.86, 0.92, 0.97, 1.0, 1.05][G.heat];
    const c = makeCar("cop", best.x, best.y, rand() * Math.PI * 2,
      { maxSpeed: G.player.maxSpeed * heatMul, accel: 520 + G.heat * 40, steerMax: 2.9, dmgMul: .8, mass: 1.15, grip: 9 });
    c.sprite = POLICE_SPRITE; c.wp = null; c.lastSeen = null; c.mode = chasing ? "chase" : "patrol"; c.flash = rand();
    G.cops.push(c);
  }
  function spawnRoadblock() {
    const p = G.player, sp = Math.hypot(p.vx, p.vy); if (sp < 200) return;
    const dirx = p.vx / sp, diry = p.vy / sp;
    const tx = p.x + dirx * 1150, ty = p.y + diry * 1150, n = nearestInter(tx, ty), q = inter(n.i, n.j);
    if (Math.hypot(q.x - p.x, q.y - p.y) < 650 || solidAt(q.x, q.y)) return;
    const horiz = Math.abs(dirx) > Math.abs(diry);
    const blockCars = [];
    for (let k = -1; k <= 1; k += 2) {
      const off = k * 42, x = q.x + (horiz ? 0 : off), y = q.y + (horiz ? off : 0);
      const c = makeCar("block", x, y, horiz ? Math.PI / 2 : 0, { maxSpeed: 0, accel: 0, steerMax: 0, dmgMul: 0, mass: 50, grip: 30 });
      c.sprite = POLICE_SPRITE; c.flash = rand(); c.life = 22; blockCars.push(c); G.cops.push(c);
    }
    if (G.heat >= 4) G.blocks.push({ x: q.x + (horiz ? -90 * Math.sign(dirx) : 0), y: q.y + (horiz ? 0 : -90 * Math.sign(diry)), horiz, life: 22 });
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
    if (inPark(c.x, c.y)) vF *= Math.exp(-1.1 * dt);
    const spd = Math.abs(vF), steerF = Math.min(1, spd / 230) * (1 - Math.min(.38, spd / c.maxSpeed * .38));
    c.a += inp.steer * c.steerMax * steerF * Math.sign(vF || 1) * (inp.hand ? 1.4 : 1) * dt;
    const nfx = Math.cos(c.a), nfy = Math.sin(c.a);
    c.vx = nfx * vF + -nfy * vR; c.vy = nfy * vF + nfx * vR;
    c.slip = Math.abs(vR);
    c.x += c.vx * dt; c.y += c.vy * dt;
    collideWorld(c);
  }
  function collideWorld(c) {
    const i0 = Math.floor((c.x - R) / P), j0 = Math.floor((c.y - R) / P);
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
      const b = blockAt(i, j); if (!b || b.park) continue;
      const cx = Math.max(b.x, Math.min(c.x, b.x + B)), cy = Math.max(b.y, Math.min(c.y, b.y + B));
      let dx = c.x - cx, dy = c.y - cy, d = Math.hypot(dx, dy);
      if (d >= CAR_R) continue;
      if (d < 0.001) { dx = 0; dy = -1; d = 1; }
      const nx = dx / d, ny = dy / d; c.x = cx + nx * CAR_R; c.y = cy + ny * CAR_R;
      impact(c, nx, ny, 0.25, null);
    }
    if (c.x < CAR_R) { c.x = CAR_R; impact(c, 1, 0, .25); } if (c.x > W - CAR_R) { c.x = W - CAR_R; impact(c, -1, 0, .25); }
    if (c.y < CAR_R) { c.y = CAR_R; impact(c, 0, 1, .25); } if (c.y > W - CAR_R) { c.y = W - CAR_R; impact(c, 0, -1, .25); }
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
      if (sees && dist < 560 && Math.hypot(p.vx, p.vy) > 380 && !G.chase) startChase();
      if (sees && G.chase) c.mode = "chase";
    }
    if (c.mode === "leave") { c.inp.gas = 1; c.inp.brake = 0; steerTo(c, c.leaveX, c.leaveY); return; }
    let tx, ty;
    if (c.mode === "chase" && sees) {
      c.lastSeen = { x: p.x, y: p.y }; G.seen = true;
      const lead = Math.min(.6, dist / 900);
      tx = p.x + p.vx * lead; ty = p.y + p.vy * lead; c.wp = null;
    } else {
      const goal = c.mode === "chase" && c.lastSeen ? c.lastSeen : null;
      if (goal && Math.hypot(goal.x - c.x, goal.y - c.y) < 90) c.lastSeen = null;
      if (!c.wp || Math.hypot(c.wp.x - c.x, c.wp.y - c.y) < 70) {
        const n = nearestInter(c.x, c.y), opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([di, dj]) => ({ i: n.i + di, j: n.j + dj })).filter(o => o.i >= 0 && o.j >= 0 && o.i <= N && o.j <= N);
        let pick;
        if (goal) { pick = opts.reduce((a, o) => { const q = inter(o.i, o.j), d = Math.hypot(q.x - goal.x, q.y - goal.y); return d < a.d ? { o, d } : a; }, { d: 1e9 }).o; }
        else if (c.mode === "chase") { // recherche : s'approche vaguement du joueur
          pick = rand() < .55 ? opts.reduce((a, o) => { const q = inter(o.i, o.j), d = Math.hypot(q.x - p.x, q.y - p.y); return d < a.d ? { o, d } : a; }, { d: 1e9 }).o : opts[(rand() * opts.length) | 0];
        } else pick = opts[(rand() * opts.length) | 0];
        c.wp = inter(pick.i, pick.j);
      }
      tx = c.wp.x; ty = c.wp.y;
    }
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
    const tx = c.horiz ? c.x + c.dir * 200 : c.lane, ty = c.horiz ? c.lane : c.y + c.dir * 200;
    steerTo(c, tx, ty); c.inp.gas = Math.hypot(c.vx, c.vy) < c.maxSpeed ? 1 : 0; c.inp.brake = 0;
    if (c.x < 30 || c.x > W - 30 || c.y < 30 || c.y > W - 30) c.dead = true;
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
    G.cops.forEach(c => { if (c.kind === "cop") { c.mode = "leave"; const a = Math.atan2(c.y - p.y, c.x - p.x); c.leaveX = c.x + Math.cos(a) * 3000; c.leaveY = c.y + Math.sin(a) * 3000; } else c.life = 0; });
  }
  function endGame(reason) {
    if (G.over) return; G.over = true;
    const final = Math.round(G.banked + G.dist);
    const isBest = final > G.best; if (isBest) { G.best = final; lsSet("zboss_best", final); }
    UI.gameOver(reason, final, G.best, isBest);
  }

  function update(dt) {
    const p = G.player; G.t += dt;
    // entrées joueur
    p.inp.gas = keys.ArrowUp || keys.KeyW || touch.gas ? 1 : 0;
    p.inp.brake = keys.ArrowDown || keys.KeyS || touch.brake ? 1 : 0;
    p.inp.steer = ((keys.ArrowRight || keys.KeyD || touch.right) ? 1 : 0) - ((keys.ArrowLeft || keys.KeyA || touch.left) ? 1 : 0);
    p.inp.hand = keys.Space || touch.hand ? 1 : 0;
    const wantN = keys.ShiftLeft || keys.ShiftRight || keys.KeyN || touch.nitro;
    if (wantN && G.nitro > 0 && p.inp.gas) { if (!p.inp.nitro) Audio.boost(); p.inp.nitro = 1; G.nitro = Math.max(0, G.nitro - 28 * dt); } else p.inp.nitro = 0;

    G.seen = false;
    G.cops.forEach(c => copAI(c, dt));
    G.traffic.forEach(trafficAI);
    stepCar(p, dt); G.cops.forEach(c => stepCar(c, dt)); G.traffic.forEach(c => stepCar(c, dt));
    const near = [p, ...G.cops.filter(c => Math.abs(c.x - p.x) < 1400 && Math.abs(c.y - p.y) < 1400), ...G.traffic.filter(c => Math.abs(c.x - p.x) < 1400 && Math.abs(c.y - p.y) < 1400)];
    collideCars(near);

    // herses
    G.blocks.forEach(s => { s.life -= dt; if (Math.abs(p.x - s.x) < (s.horiz ? 14 : 75) && Math.abs(p.y - s.y) < (s.horiz ? 75 : 14) && !(p.flat > 0)) { p.flat = 4; p.health -= 8; msg("Herse ! Pneus crevés pendant 4 s", 2.5, "alert"); } });
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
    while (G.traffic.length < 34) spawnTraffic(false);

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
      if (patrols < 2 && G.calmT > 6 && rand() < dt * .5) spawnCop(false);
    }
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
    const i0 = Math.max(0, Math.floor((x0 - R) / P)), i1 = Math.min(N - 1, Math.floor((x1 - R) / P)), j0 = Math.max(0, Math.floor((y0 - R) / P)), j1 = Math.min(N - 1, Math.floor((y1 - R) / P));

    // routes
    ctx.fillStyle = "#14151d"; ctx.fillRect(Math.max(0, x0), Math.max(0, y0), Math.min(W, x1) - Math.max(0, x0), Math.min(W, y1) - Math.max(0, y0));
    ctx.strokeStyle = "rgba(255,190,60,.55)"; ctx.lineWidth = 4; ctx.setLineDash([34, 30]); ctx.beginPath();
    for (let k = Math.max(0, i0); k <= Math.min(N, i1 + 1); k++) { const x = k * P + R / 2; ctx.moveTo(x, Math.max(0, y0)); ctx.lineTo(x, Math.min(W, y1)); }
    for (let k = Math.max(0, j0); k <= Math.min(N, j1 + 1); k++) { const y = k * P + R / 2; ctx.moveTo(Math.max(0, x0), y); ctx.lineTo(Math.min(W, x1), y); }
    ctx.stroke(); ctx.setLineDash([]);
    // passages piétons
    ctx.fillStyle = "rgba(230,235,245,.13)";
    for (let j = j0; j <= j1 + 1; j++) for (let i = i0; i <= i1 + 1; i++) {
      const q = inter(i, j);
      for (let s = -60; s <= 60; s += 20) { ctx.fillRect(q.x + s - 5, q.y - R / 2 - 26, 10, 20); ctx.fillRect(q.x + s - 5, q.y + R / 2 + 6, 10, 20); ctx.fillRect(q.x - R / 2 - 26, q.y + s - 5, 20, 10); ctx.fillRect(q.x + R / 2 + 6, q.y + s - 5, 20, 10); }
    }
    // bord du monde
    ctx.strokeStyle = "#ff5a1f"; ctx.lineWidth = 6; ctx.strokeRect(0, 0, W, W);

    // traces
    ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 4; ctx.beginPath();
    for (const s of G.skids) { if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue; ctx.moveTo(s.px, s.py); ctx.lineTo(s.x, s.y); }
    ctx.stroke();

    // herses
    G.blocks.forEach(s => { ctx.fillStyle = "#c9ccd6"; if (s.horiz) { for (let k = -70; k < 70; k += 10) ctx.fillRect(s.x - 4, s.y + k, 8, 6); } else { for (let k = -70; k < 70; k += 10) ctx.fillRect(s.x + k, s.y - 4, 6, 8); } });

    // parcs (sol)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const b = blockAt(i, j); if (!b.park) continue;
      ctx.fillStyle = "#0f2418"; ctx.fillRect(b.x, b.y, B, B); ctx.strokeStyle = "#1d3a26"; ctx.lineWidth = 3; ctx.strokeRect(b.x + 4, b.y + 4, B - 8, B - 8);
    }

    // lumières (additif)
    ctx.globalCompositeOperation = "lighter";
    for (let j = j0; j <= j1 + 1; j++) for (let i = i0; i <= i1 + 1; i++) { const q = inter(i, j); ctx.drawImage(GLOW_L, q.x - R / 2 - 110, q.y - R / 2 - 110); }
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

    // bâtiments en relief (parallaxe)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const b = blockAt(i, j);
      if (b.park) { ctx.fillStyle = "#14361f"; b.details.forEach(t => { ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 6.283); ctx.fill(); }); continue; }
      const k = 0.05 * b.h3, cx = b.x + B / 2, cy = b.y + B / 2, dx = (cx - p.x) * k, dy = (cy - p.y) * k;
      const m = 14; // trottoir
      const bx = b.x + m, by = b.y + m, bw = B - m * 2, bh = B - m * 2;
      ctx.fillStyle = "#23252f"; ctx.fillRect(b.x, b.y, B, B);
      ctx.fillStyle = "#0d0f16";
      const quad = (ax, ay, bx2, by2) => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by2); ctx.lineTo(bx2 + dx, by2 + dy); ctx.lineTo(ax + dx, ay + dy); ctx.closePath(); ctx.fill(); };
      quad(bx, by, bx + bw, by); quad(bx + bw, by, bx + bw, by + bh); quad(bx + bw, by + bh, bx, by + bh); quad(bx, by + bh, bx, by);
      ctx.fillStyle = b.roof; ctx.fillRect(bx + dx, by + dy, bw, bh);
      ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 2; ctx.strokeRect(bx + dx + 6, by + dy + 6, bw - 12, bh - 12);
      ctx.fillStyle = "rgba(255,255,255,.05)"; b.details.forEach(d => ctx.fillRect(d.x + dx, d.y + dy, d.w, d.h));
      if (b.neon) { ctx.strokeStyle = b.neon; ctx.globalAlpha = .7; ctx.lineWidth = 3; ctx.strokeRect(bx + dx + 2, by + dy + 2, bw - 4, bh - 4); ctx.globalAlpha = 1; }
    }

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
  const mapBase = document.createElement("canvas"); mapBase.width = mapBase.height = MM;
  (function () {
    const c = mapBase.getContext("2d"), s = MM / W; c.fillStyle = "#1b1d27"; c.fillRect(0, 0, MM, MM);
    blocks.forEach(b => { c.fillStyle = b.park ? "#123020" : "#0a0b10"; c.fillRect(b.x * s, b.y * s, B * s, B * s); });
  })();
  function renderMinimap() {
    mm.width = MM; mm.height = MM; const s = MM / W, p = G.player;
    mctx.drawImage(mapBase, 0, 0);
    G.blocks.forEach(b => { mctx.fillStyle = "#c9ccd6"; mctx.fillRect(b.x * s - 2, b.y * s - 2, 4, 4); });
    G.cops.forEach(c => { if (!c.alive || c.mode === "leave") return; mctx.fillStyle = c.mode === "patrol" ? "#8a93a8" : (Math.floor(G.t * 4) % 2 ? "#ff2d4a" : "#2d7bff"); mctx.beginPath(); mctx.arc(c.x * s, c.y * s, 3, 0, 6.283); mctx.fill(); });
    if (G.heli) { mctx.strokeStyle = "rgba(220,235,255,.8)"; mctx.beginPath(); mctx.arc(G.heli.x * s, G.heli.y * s, 170 * s + 2, 0, 6.283); mctx.stroke(); }
    mctx.save(); mctx.translate(p.x * s, p.y * s); mctx.rotate(p.a); mctx.fillStyle = "#ffb21f"; mctx.beginPath(); mctx.moveTo(6, 0); mctx.lineTo(-4, -4); mctx.lineTo(-4, 4); mctx.closePath(); mctx.fill(); mctx.restore();
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
  try { const saved = lsGet("zboss_car"); if (saved) chosen = CARS.find(c => c.id === saved) || chosen; } catch (e) { }
  const pick = $("pick");
  pick.innerHTML = CARS.map(c => `<button type="button" class="pick-car" data-id="${c.id}" aria-pressed="${c === chosen}">
      ${window.ZBOSS_CARS.svg(c, { suffix: "-m" })}<b>${c.name}</b><small>${c.cls} · ${Math.round((560 + c.stats.vitesse * 2) * .45)} km/h</small></button>`).join("");
  pick.addEventListener("click", e => {
    const b = e.target.closest(".pick-car"); if (!b) return;
    chosen = CARS.find(c => c.id === b.dataset.id); lsSet("zboss_car", chosen.id);
    pick.querySelectorAll(".pick-car").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  });
  $("go").addEventListener("click", () => start(chosen));
  $("resume").addEventListener("click", () => setPause(false));
  $("quit").addEventListener("click", () => { G.over = true; show("menu"); Audio.suspend(); });
  $("again").addEventListener("click", () => start(chosen));
  $("garage").addEventListener("click", () => show("menu"));
  $("pausebtn").addEventListener("click", () => setPause(true));
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
  window.ZBOSS_WORLD = { R, B, P, N, W, blocks, inter, solidAt, angDiff, rand };
  window.__zboss = { get state() { return G; }, start: () => start(chosen), spawnCop, keys, touch };
})();
