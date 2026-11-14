// Démo jouable de La Course des Ketch : étape 5, Sprint du Boulevard du 30 Juin.
// Route droite en fausse 3D, obstacles placés aux mêmes endroits pour tout le monde
// (aucun tirage au sort), fantôme à battre, turbo et frein. Clavier ou boutons tactiles.
// Ce fichier est inséré tel quel dans public/index.html par scripts/assembler.py.
(function () {
  var canvas = document.getElementById('ecranJeu');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var cadre = document.getElementById('jeu');
  var panneauDebut = document.getElementById('panneauDebut');
  var panneauFin = document.getElementById('panneauFin');
  var mouvementReduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Géométrie de l'écran (mêmes repères que la maquette 844 × 390) ----------
  var W = 844, H = 390, HORIZON = 176, VX = 422, K = 856, DMIN = 4, DEMI = 302, PORTEE = 260;
  var D_JOUEUR = 6;
  function proj(x, d) { return [VX + x * DEMI * DMIN / d, HORIZON + K / d]; }

  // ---------- Règles ----------
  var LONGUEUR = 1200;            // mètres jusqu'à l'arrivée
  var V_MAX = 36, V_TURBO = 48;   // m/s (130 et 173 km/h)
  var ACCEL = 9, FREIN = 24, ROULE = 6;
  var V_FANTOME = 31.5;           // le fantôme boucle l'étape en un peu moins de 40 s
  var OBSTACLES = [
    [120, 0, 'cone'], [170, -0.66, 'charrette'], [215, 0.66, 'moto'], [260, 0, 'minibus'],
    [300, -0.66, 'cone'], [300, 0.66, 'cone'], [350, 0, 'charrette'], [400, -0.66, 'minibus'],
    [440, 0.66, 'moto'], [480, 0, 'cone'], [520, -0.66, 'cone'], [520, 0, 'cone'],
    [570, 0.66, 'minibus'], [620, -0.66, 'charrette'], [660, 0, 'moto'], [700, 0.66, 'cone'],
    [740, -0.66, 'minibus'], [780, 0, 'charrette'], [830, 0.66, 'cone'], [830, 0, 'cone'],
    [880, -0.66, 'moto'], [930, 0, 'minibus'], [980, 0.66, 'charrette'], [1020, -0.66, 'cone'],
    [1060, 0, 'cone'], [1060, 0.66, 'cone'], [1110, -0.66, 'minibus'], [1150, 0.66, 'moto']
  ];
  var LARGEUR = { cone: 0.28, moto: 0.3, charrette: 0.38, minibus: 0.4 };
  var PROFONDEUR = { cone: 1.5, moto: 2, charrette: 2.5, minibus: 4 };

  // ---------- État ----------
  var etat, temps, compte, z, v, x, energie, turboActif, choc, touches, obstacles, zFantome, record;
  try { record = parseFloat(localStorage.getItem('ketch-record-demo')) || null; } catch (e) { record = null; }

  function reinitialiser() {
    etat = 'accueil'; temps = 0; compte = 3.999; z = 0; v = 0; x = 0; energie = 1; turboActif = false; choc = 0;
    zFantome = 0; touches = {};
    obstacles = OBSTACLES.map(function (o) { return { z: o[0], x: o[1], type: o[2], touche: false }; });
  }
  reinitialiser();

  // ---------- Commandes : clavier ----------
  var CLAVIER = { ArrowLeft: 'gauche', KeyA: 'gauche', KeyQ: 'gauche', ArrowRight: 'droite', KeyD: 'droite',
    ArrowUp: 'turbo', Space: 'turbo', KeyW: 'turbo', KeyZ: 'turbo', ArrowDown: 'frein', KeyS: 'frein' };
  function enJeu() { return etat === 'course' || etat === 'compte'; }
  document.addEventListener('keydown', function (e) {
    var c = CLAVIER[e.code]; if (!c || !enJeu()) return;
    e.preventDefault(); touches[c] = true;
  });
  document.addEventListener('keyup', function (e) { var c = CLAVIER[e.code]; if (c) touches[c] = false; });

  // ---------- Commandes : boutons tactiles dessinés sur l'écran ----------
  var BOUTONS = [
    { nom: 'gauche', x: 62, y: 332, r: 40 }, { nom: 'droite', x: 150, y: 332, r: 40 },
    { nom: 'frein', x: 700, y: 340, r: 34 }, { nom: 'turbo', x: 784, y: 318, r: 46 }
  ];
  var doigts = {};
  function bouton(e) {
    var r = canvas.getBoundingClientRect();
    var px = (e.clientX - r.left) * W / r.width, py = (e.clientY - r.top) * H / r.height;
    for (var i = 0; i < BOUTONS.length; i++) {
      var b = BOUTONS[i];
      if (Math.hypot(px - b.x, py - b.y) <= b.r + 10) return b.nom;
    }
    return null;
  }
  function majDoigts() {
    ['gauche', 'droite', 'frein', 'turbo'].forEach(function (n) { touches['tactile_' + n] = false; });
    Object.keys(doigts).forEach(function (id) { if (doigts[id]) touches['tactile_' + doigts[id]] = true; });
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (!enJeu()) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    doigts[e.pointerId] = bouton(e); majDoigts();
  });
  canvas.addEventListener('pointermove', function (e) { if (e.pointerId in doigts) { doigts[e.pointerId] = bouton(e); majDoigts(); } });
  function lacher(e) { delete doigts[e.pointerId]; majDoigts(); }
  canvas.addEventListener('pointerup', lacher);
  canvas.addEventListener('pointercancel', lacher);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  function appuye(n) { return touches[n] || touches['tactile_' + n]; }

  // ---------- Simulation ----------
  function avancer(dt) {
    if (etat === 'compte') {
      compte -= dt;
      if (compte <= 0) { etat = 'course'; }
      return;
    }
    if (etat !== 'course') return;
    temps += dt;

    // Fantôme : accélère puis roule à vitesse constante.
    var vf = Math.min(V_FANTOME, ACCEL * temps);
    zFantome = Math.min(LONGUEUR + 40, zFantome + vf * dt);

    // Turbo : se vide quand on l'utilise, se recharge sinon.
    turboActif = appuye('turbo') && energie > 0.02 && !appuye('frein');
    energie = turboActif ? Math.max(0, energie - 0.38 * dt) : Math.min(1, energie + 0.11 * dt);

    var cible = appuye('frein') ? 0 : (turboActif ? V_TURBO : V_MAX);
    if (v < cible) v = Math.min(cible, v + ACCEL * (turboActif ? 1.7 : 1) * dt);
    else v = Math.max(cible, v - (appuye('frein') ? FREIN : ROULE) * dt);

    var dir = (appuye('droite') ? 1 : 0) - (appuye('gauche') ? 1 : 0);
    x = Math.max(-0.9, Math.min(0.9, x + dir * 1.6 * dt * (0.45 + 0.55 * Math.min(1, v / V_MAX))));
    z += v * dt;

    // Chocs : le ketch perd l'essentiel de sa vitesse.
    obstacles.forEach(function (o) {
      if (o.touche) return;
      if (Math.abs(o.z - z) < PROFONDEUR[o.type] && Math.abs(o.x - x) < LARGEUR[o.type] + 0.2) {
        o.touche = true; v *= 0.35; choc = 0.45;
        if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) {} }
      }
    });
    if (choc > 0) choc = Math.max(0, choc - dt);

    if (z >= LONGUEUR) terminer();
  }

  function terminer() {
    etat = 'fin';
    // Le fantôme roule à vitesse connue : on calcule son temps exact sur l'étape.
    var tAccel = V_FANTOME / ACCEL, dAccel = 0.5 * ACCEL * tAccel * tAccel;
    var tFantome = tAccel + (LONGUEUR - dAccel) / V_FANTOME;
    var ecart = temps - tFantome;
    var nouveau = !record || temps < record;
    if (nouveau) { record = temps; try { localStorage.setItem('ketch-record-demo', String(temps)); } catch (e) {} }
    document.getElementById('finTemps').textContent = chrono(temps);
    document.getElementById('finVerdict').textContent = ecart < 0
      ? 'Vous battez le fantôme de ' + secondes(-ecart) + '.'
      : 'Le fantôme gagne de ' + secondes(ecart) + '. Moins de chocs, plus de turbo !';
    var chocs = obstacles.filter(function (o) { return o.touche; }).length;
    document.getElementById('finDetail').textContent =
      (chocs ? chocs + (chocs > 1 ? ' chocs' : ' choc') : 'Aucun choc') +
      (nouveau ? ' · nouveau record personnel' : ' · votre record : ' + chrono(record));
    panneauFin.hidden = false;
    var b = document.getElementById('boutonRejouer'); if (b) b.focus({ preventScroll: true });
  }

  // ---------- Dessin ----------
  function chrono(t) {
    var m = Math.floor(t / 60), s = t - m * 60;
    return String(m).padStart(2, '0') + ':' + (s < 10 ? '0' : '') + s.toFixed(1).replace('.', ',');
  }
  function secondes(t) { return t.toFixed(1).replace('.', ',') + ' s'; }

  function rect(x0, y0, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, r || 0); else ctx.rect(x0, y0, w, h);
  }

  var ciel = null;
  function decor() {
    if (!ciel) {
      ciel = ctx.createLinearGradient(0, 0, 0, 178);
      ciel.addColorStop(0, '#1B2A5C'); ciel.addColorStop(0.55, '#7A3E6A'); ciel.addColorStop(1, '#F08A3C');
    }
    ctx.fillStyle = ciel; ctx.fillRect(0, 0, W, 178);
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#FFB347';
    ctx.beginPath(); ctx.arc(610, 168, 34, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#22305E';
    [[0,118,70,60],[74,92,46,86],[124,128,80,50],[208,104,52,74],[264,140,70,38],[510,136,60,42],[574,100,44,78],[622,124,76,54],[702,86,56,92],[762,122,82,56]]
      .forEach(function (b) { ctx.fillRect(b[0], b[1], b[2], b[3]); });
    ctx.fillStyle = 'rgba(255,217,102,.8)';
    [[84,104],[100,120],[218,116],[236,134],[584,112],[600,132],[714,100],[732,122],[20,132],[780,136]]
      .forEach(function (f) { ctx.fillRect(f[0], f[1], 6, 6); });
    // Sol, trottoirs, route.
    ctx.fillStyle = '#9C6B45'; ctx.fillRect(0, 176, W, H - 176);
    var fond = proj(1.25, PORTEE), bas = proj(1.25, DMIN);
    ctx.fillStyle = '#B9B2A6';
    ctx.beginPath(); ctx.moveTo(VX - (fond[0] - VX), fond[1]); ctx.lineTo(fond[0], fond[1]);
    ctx.lineTo(bas[0], H); ctx.lineTo(VX - (bas[0] - VX), H); ctx.fill();
    var rf = proj(1, PORTEE), rb = proj(1, DMIN);
    var g = ctx.createLinearGradient(0, 176, 0, H); g.addColorStop(0, '#4A4F5C'); g.addColorStop(1, '#2E323C');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(VX - (rf[0] - VX), rf[1]); ctx.lineTo(rf[0], rf[1]);
    ctx.lineTo(rb[0], H); ctx.lineTo(VX - (rb[0] - VX), H); ctx.fill();
    // Bordures blanches.
    ctx.strokeStyle = '#F5F3EA'; ctx.lineWidth = 4;
    [-1, 1].forEach(function (c) {
      var a = proj(c * 0.97, PORTEE), b2 = proj(c * 0.97, DMIN);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], H); ctx.stroke();
    });
  }

  function marquages(camZ) {
    ctx.fillStyle = '#FFC814';
    var debut = Math.floor(camZ / 12) * 12;
    for (var zz = debut; zz < camZ + PORTEE; zz += 12) {
      var d1 = zz - camZ, d2 = d1 + 5;
      if (d1 < DMIN) { if (d2 <= DMIN) continue; d1 = DMIN; }
      [-0.333, 0.333].forEach(function (lx) {
        var a = proj(lx - 0.012, d1), b = proj(lx + 0.012, d1), c = proj(lx + 0.012, d2), e = proj(lx - 0.012, d2);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); ctx.fill();
      });
    }
  }

  // Sprites dessinés à l'échelle s (s = 1 quand l'objet est tout près, à 4 m).
  function palmier(sx, sy, s) {
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.fillStyle = '#5A3B22'; ctx.fillRect(-6, -230, 12, 230);
    ctx.strokeStyle = '#2F7D4A'; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -226); ctx.quadraticCurveTo(-50, -262, -90, -236);
    ctx.moveTo(0, -226); ctx.quadraticCurveTo(-30, -290, -70, -300);
    ctx.moveTo(0, -226); ctx.quadraticCurveTo(40, -290, 84, -290);
    ctx.moveTo(0, -226); ctx.quadraticCurveTo(56, -244, 96, -206);
    ctx.stroke(); ctx.restore();
  }
  function obstacle(o, sx, sy, s) {
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    if (o.touche) ctx.globalAlpha = 0.35;
    if (o.type === 'cone') {
      ctx.fillStyle = '#C2410C'; ctx.fillRect(-30, -6, 60, 6);
      ctx.fillStyle = '#FF7A1A'; ctx.beginPath(); ctx.moveTo(-24, -6); ctx.lineTo(24, -6); ctx.lineTo(7, -74); ctx.lineTo(-7, -74); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-15, -42, 30, 9);
    } else if (o.type === 'charrette') {
      ctx.strokeStyle = '#5A3B22'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(60, -50); ctx.lineTo(110, -30); ctx.stroke();
      ctx.fillStyle = '#8A5A2B'; rect(-64, -76, 128, 50, 4); ctx.fill();
      ctx.fillStyle = '#B07A44'; rect(-72, -86, 144, 14, 4); ctx.fill();
      ctx.fillStyle = '#2A6B9B'; rect(-50, -110, 40, 26, 3); ctx.fill();
      ctx.fillStyle = '#D9A441'; rect(0, -104, 46, 20, 3); ctx.fill();
      ctx.fillStyle = '#2A2A2A'; ctx.beginPath(); ctx.arc(-38, -18, 18, 0, 7); ctx.arc(38, -18, 18, 0, 7); ctx.fill();
    } else if (o.type === 'moto') {
      ctx.fillStyle = '#2A2A2A'; ctx.beginPath(); ctx.arc(-34, -18, 18, 0, 7); ctx.arc(34, -18, 18, 0, 7); ctx.fill();
      ctx.fillStyle = '#D92D20'; rect(-36, -54, 72, 22, 8); ctx.fill();
      ctx.fillStyle = '#1F5E3A'; rect(-16, -96, 32, 44, 8); ctx.fill();
      ctx.fillStyle = '#3B2A1E'; ctx.beginPath(); ctx.arc(0, -108, 15, 0, 7); ctx.fill();
      ctx.fillStyle = '#FFC814'; rect(-15, -124, 30, 12, 6); ctx.fill();
    } else {
      ctx.fillStyle = '#1F1F1F'; rect(-104, -18, 44, 18, 4); ctx.fill(); rect(60, -18, 44, 18, 4); ctx.fill();
      ctx.fillStyle = '#E8E2D0'; rect(-116, -180, 232, 166, 16); ctx.fill();
      ctx.fillStyle = '#1C2433'; rect(-100, -166, 200, 56, 8); ctx.fill();
      ctx.fillStyle = '#1E5FD6'; ctx.fillRect(-116, -92, 232, 16);
      ctx.fillStyle = '#FFC814'; ctx.fillRect(-116, -76, 232, 8);
      ctx.fillStyle = '#E5322D'; rect(-108, -60, 30, 16, 4); ctx.fill(); rect(78, -60, 30, 16, 4); ctx.fill();
    }
    ctx.restore();
  }
  function ligneArrivee(d) {
    if (d < DMIN || d > PORTEE) return;
    var n = 12;
    for (var i = 0; i < n; i++) for (var j = 0; j < 2; j++) {
      var x0 = -1 + 2 * i / n, x1 = -1 + 2 * (i + 1) / n, da = d + j * 1.5, db = da + 1.5;
      var a = proj(x0, da), b = proj(x1, da), c = proj(x1, db), e = proj(x0, db);
      ctx.fillStyle = (i + j) % 2 ? '#111111' : '#FFFFFF';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); ctx.fill();
    }
  }

  // Le ketch, d'après la maquette. fantome = silhouette bleue transparente.
  function ketch(cx, by, s, fantome) {
    ctx.save(); ctx.translate(cx, by); ctx.scale(s, s);
    var jaune = fantome ? 'rgba(127,216,255,.35)' : '#FFC814';
    if (!fantome) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 2, 122, 12, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = fantome ? 'rgba(127,216,255,.6)' : '#151515';
    rect(-106, -42, 36, 42, 7); ctx.fill(); rect(70, -42, 36, 42, 7); ctx.fill();
    ctx.fillStyle = jaune; rect(-114, -104, 228, 82, 22); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-84, -100); ctx.lineTo(-62, -160); ctx.quadraticCurveTo(-58, -169, -47, -169);
    ctx.lineTo(47, -169); ctx.quadraticCurveTo(58, -169, 62, -160); ctx.lineTo(84, -100); ctx.closePath(); ctx.fill();
    if (fantome) {
      ctx.strokeStyle = '#7FD8FF'; ctx.lineWidth = 3; rect(-114, -104, 228, 82, 22); ctx.stroke();
      ctx.restore(); return;
    }
    ctx.fillStyle = '#1C2433';
    ctx.beginPath(); ctx.moveTo(-69, -106); ctx.lineTo(-51, -152); ctx.quadraticCurveTo(-49, -158, -42, -158);
    ctx.lineTo(42, -158); ctx.quadraticCurveTo(49, -158, 51, -152); ctx.lineTo(69, -106); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; rect(-26, -185, 52, 17, 4); ctx.fill();
    ctx.fillStyle = '#0E1630'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TAXI', 0, -172);
    ctx.fillStyle = turboActif ? '#FFB020' : '#E5322D'; rect(-106, -90, 38, 20, 6); ctx.fill(); rect(68, -90, 38, 20, 6); ctx.fill();
    ctx.fillStyle = '#1E5FD6'; ctx.fillRect(-68, -84, 136, 5);
    ctx.fillStyle = '#FFFFFF'; rect(-32, -72, 64, 22, 3); ctx.fill();
    ctx.fillStyle = '#111111'; ctx.font = '700 12px Inter, sans-serif'; ctx.fillText('KIN 243', 0, -56);
    ctx.fillStyle = '#2A2A2A'; rect(-110, -44, 220, 14, 7); ctx.fill();
    if (turboActif) {
      ctx.fillStyle = 'rgba(255,176,32,.85)';
      ctx.beginPath(); ctx.moveTo(-104, -30); ctx.lineTo(-96, 6 + Math.random() * 14); ctx.lineTo(-88, -30); ctx.fill();
      ctx.beginPath(); ctx.moveTo(88, -30); ctx.lineTo(96, 6 + Math.random() * 14); ctx.lineTo(104, -30); ctx.fill();
    }
    ctx.restore();
  }

  function hud() {
    function boite(x0, y0, w, h, r, a) { ctx.fillStyle = 'rgba(14,22,48,' + (a || 0.85) + ')'; rect(x0, y0, w, h, r); ctx.fill(); }
    ctx.textAlign = 'left';
    boite(16, 14, 282, 62, 14);
    ctx.fillStyle = '#FFC814'; ctx.font = '700 11px Inter, sans-serif'; ctx.fillText('ÉTAPE 5 / 5 · DÉMO', 32, 38);
    ctx.fillStyle = '#FFFFFF'; ctx.font = '700 16px Inter, sans-serif'; ctx.fillText('Sprint du Boulevard du 30 Juin', 32, 60);

    boite(356, 14, 132, 44, 12);
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.font = '800 24px "Bricolage Grotesque", Inter, sans-serif';
    ctx.fillText(chrono(temps), 422, 44);
    boite(356, 64, 132, 24, 12, 0.7);
    ctx.fillStyle = '#FFFFFF'; ctx.font = '600 12px Inter, sans-serif'; ctx.fillText(Math.round(v * 3.6) + ' km/h', 422, 81);

    boite(546, 14, 282, 72, 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFC814'; ctx.font = '700 11px Inter, sans-serif'; ctx.fillText('VOUS', 562, 36);
    ctx.fillStyle = '#2A3566'; rect(640, 28, 140, 8, 4); ctx.fill();
    ctx.fillStyle = '#FFC814'; rect(640, 28, 140 * Math.min(1, z / LONGUEUR), 8, 4); ctx.fill();
    ctx.fillStyle = '#7FD8FF'; ctx.fillText('FANTÔME', 562, 58);
    ctx.fillStyle = '#2A3566'; rect(640, 50, 140, 8, 4); ctx.fill();
    ctx.fillStyle = '#7FD8FF'; rect(640, 50, 140 * Math.min(1, zFantome / LONGUEUR), 8, 4); ctx.fill();
    var ecart = etat === 'course' && v > 1 ? (zFantome - z) / Math.max(v, 12) : 0;
    ctx.fillStyle = '#C9CFE3'; ctx.font = '600 11px Inter, sans-serif';
    ctx.fillText(etat !== 'course' ? 'Battez le fantôme jusqu’à la ligne'
      : ecart > 0.05 ? 'Écart : −' + secondes(ecart) + ' · rattrapez-le !'
      : ecart < -0.05 ? 'Écart : +' + secondes(-ecart) + ' · tenez bon !' : 'Au coude à coude !', 562, 78);

    // Boutons tactiles.
    BOUTONS.forEach(function (b) {
      var actif = appuye(b.nom);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7);
      if (b.nom === 'turbo') {
        ctx.fillStyle = energie > 0.02 ? (actif ? '#FFE07A' : '#FFC814') : '#7A6A2A'; ctx.fill();
        ctx.fillStyle = '#0E1630'; ctx.font = '800 14px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TURBO', b.x, b.y + 5);
      } else {
        ctx.fillStyle = actif ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.15)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (b.nom === 'frein') { ctx.font = '700 12px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('FREIN', b.x, b.y + 5); }
        else {
          var sens = b.nom === 'gauche' ? -1 : 1;
          ctx.beginPath(); ctx.moveTo(b.x - 8 * sens, b.y - 14); ctx.lineTo(b.x + 8 * sens, b.y); ctx.lineTo(b.x - 8 * sens, b.y + 14); ctx.stroke();
        }
      }
    });
    ctx.fillStyle = 'rgba(14,22,48,.8)'; rect(752, 368, 64, 8, 4); ctx.fill();
    ctx.fillStyle = '#FFC814'; rect(752, 368, 64 * energie, 8, 4); ctx.fill();
  }

  function dessiner() {
    ctx.save();
    if (choc > 0 && !mouvementReduit) ctx.translate((Math.random() - 0.5) * 10 * choc, (Math.random() - 0.5) * 6 * choc);
    decor();
    var camZ = z - D_JOUEUR;
    marquages(camZ);

    var objets = [];
    obstacles.forEach(function (o) { objets.push({ d: o.z - camZ, f: function (p, s) { obstacle(o, p[0], p[1], s); }, x: o.x }); });
    var premier = Math.floor(camZ / 25) * 25;
    for (var pz = premier; pz < camZ + PORTEE; pz += 25) {
      objets.push({ d: pz - camZ, x: -1.4, f: function (p, s) { palmier(p[0], p[1], s); } });
      objets.push({ d: pz + 12 - camZ, x: 1.4, f: function (p, s) { palmier(p[0], p[1], s); } });
    }
    objets.push({ d: zFantome - camZ, x: 0.33, f: function (p, s) { ketch(p[0], p[1], s * 0.95, true); } });
    objets.sort(function (a, b) { return b.d - a.d; });

    var arriveeDessinee = false;
    objets.forEach(function (o) {
      if (!arriveeDessinee && o.d < LONGUEUR - camZ) { ligneArrivee(LONGUEUR - camZ); arriveeDessinee = true; }
      if (o.d < DMIN || o.d > PORTEE) return;
      o.f(proj(o.x, o.d), DMIN / o.d);
    });
    if (!arriveeDessinee) ligneArrivee(LONGUEUR - camZ);

    var pj = proj(x, D_JOUEUR);
    ketch(pj[0], pj[1] + 6, 0.82, false);
    ctx.restore();

    hud();

    if (etat === 'compte') {
      var n = Math.ceil(compte - 1);
      ctx.fillStyle = 'rgba(14,22,48,.35)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = n > 0 ? '#FFFFFF' : '#FFC814'; ctx.textAlign = 'center';
      ctx.font = '800 110px "Bricolage Grotesque", Inter, sans-serif';
      ctx.fillText(n > 0 ? String(n) : 'Partez !', VX, 236);
    }
  }

  // ---------- Boucle ----------
  var avant = 0, dpr = 0;
  function taille() {
    var d = Math.min(2, window.devicePixelRatio || 1);
    if (d !== dpr) { dpr = d; canvas.width = W * dpr; canvas.height = H * dpr; ciel = null; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function boucle(t) {
    var dt = avant ? Math.min(0.05, (t - avant) / 1000) : 0;
    avant = t;
    taille();
    avancer(dt);
    dessiner();
    requestAnimationFrame(boucle);
  }
  // Onglet caché : la boucle s'arrête d'elle-même ; au retour, pas de saut de temps.
  document.addEventListener('visibilitychange', function () { avant = 0; touches = {}; doigts = {}; });
  window.addEventListener('blur', function () { touches = {}; doigts = {}; });

  function lancer() {
    reinitialiser();
    etat = 'compte';
    panneauDebut.hidden = true; panneauFin.hidden = true;
    canvas.focus({ preventScroll: true });
  }
  document.getElementById('boutonJouer').addEventListener('click', lancer);
  document.getElementById('boutonRejouer').addEventListener('click', lancer);

  var pleinEcran = document.getElementById('boutonPleinEcran');
  if (pleinEcran) {
    if (!cadre.requestFullscreen) pleinEcran.hidden = true;
    pleinEcran.addEventListener('click', function () {
      var p = document.fullscreenElement ? document.exitFullscreen() : cadre.requestFullscreen();
      Promise.resolve(p).then(function () {
        if (document.fullscreenElement && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
      }).catch(function () { pleinEcran.hidden = true; });
    });
  }

  if (record) {
    var r = document.getElementById('debutRecord');
    if (r) r.textContent = 'Votre record : ' + chrono(record);
  }
  requestAnimationFrame(boucle);
})();
