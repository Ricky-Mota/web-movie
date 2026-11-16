// Démo jouable de La Course des Ketch : les 8 étapes du parcours, au choix.
//   1 · Rond-point Victoire      : circulation dense, ronds-points, monument.
//   2 · Le Grand Marché          : rue sinueuse, étals, pousse-pousse, piétons.
//   3 · Route des Poids Lourds   : camions, nids-de-poule, bosses, entrepôts.
//   4 · Corniche du Fleuve       : virages glissants au bord du fleuve Congo.
//   5 · Boulevard du 30 Juin     : 4 voies, tours vitrées, montées et descentes.
// Points : on en gagne en roulant vite et en battant le fantôme ; chaque choc
// (piéton, véhicule, obstacle) en fait perdre. Bonus de conduite propre à l'arrivée.
// Tout est placé et réglé d'avance, identique pour chaque joueur (aucun tirage au sort).
// Son Web Audio : moteur (régime, rapports, turbo), crissements, klaxons, ambiance et
// une musique différente par étape. Clavier ou boutons tactiles.
// Ce fichier est inséré tel quel dans public/index.html par scripts/assembler.py.
(function () {
  var canvas = document.getElementById('ecranJeu');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var cadre = document.getElementById('jeu');
  var panneauDebut = document.getElementById('panneauDebut');
  var panneauFin = document.getElementById('panneauFin');
  var mouvementReduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Caméra et écran (repères de la maquette 844 × 390) ----------
  var W = 844, H = 390, HORIZON = 176, VX = 422;
  var F = 428, HAUTEUR_CAM = 2, SEG = 5, VISIBLES = 64, D_JOUEUR = 6, COURBE = 0.04;
  var DEMI_KETCH = 0.85;   // demi-largeur du ketch, en mètres

  // ---------- Les voitures ----------
  // Le ketch, et trois voitures de sport modernes (dessins originaux, aucune marque réelle).
  // vitesse/accel/direction : multiplicateurs ; robuste : part de vitesse gardée après un choc.
  var VOITURES = {
    ketch: { nom: 'Ketch', type: 'Taxi de Kinshasa', vitesse: 1, accel: 1, direction: 1, robuste: 0.35,
      fantome: 1, debloque: 0, couleurDefaut: 'jaune', son: { hauteur: 1, filtre: 0 } },
    turbo: { nom: 'Turbo GT', type: 'Supercar · vitesse', vitesse: 1.15, accel: 1.2, direction: 0.9, robuste: 0.3,
      fantome: 1.15, debloque: 16500, couleurDefaut: 'rouge',
      couleur: ['#FF4A3D', '#B3170E'], neon: '#00E5FF', son: { hauteur: 1.45, filtre: 900 } },
    zigzag: { nom: 'Zigzag R', type: 'Sportive · maniabilité', vitesse: 1.05, accel: 1.08, direction: 1.4, robuste: 0.35,
      fantome: 1.08, debloque: 6500, couleurDefaut: 'bleu',
      couleur: ['#4C8DFF', '#163E99'], neon: '#C04CFF', son: { hauteur: 1.25, filtre: 600 } },
    blinde: { nom: 'Blindé X', type: 'SUV sport · robustesse', vitesse: 0.97, accel: 0.95, direction: 0.95, robuste: 0.6,
      fantome: 1.02, debloque: 10500, couleurDefaut: 'noir',
      couleur: ['#56606F', '#232831'], neon: '#FF8A00', son: { hauteur: 0.8, filtre: -150 } },
    mbote: { nom: 'Mbote E', type: 'Berline électrique · accélération', vitesse: 1.05, accel: 1.35, direction: 1.05, robuste: 0.4,
      fantome: 1.1, debloque: 8500, couleurDefaut: 'blanc', neon: '#3DDC84', electrique: true, son: { hauteur: 1, filtre: 0 } },
    kingt: { nom: 'Kin GT', type: 'Grand tourisme · stabilité', vitesse: 1.12, accel: 1.05, direction: 1, robuste: 0.4,
      fantome: 1.1, debloque: 12500, couleurDefaut: 'vert', neon: '#FFD23F', son: { hauteur: 1.2, filtre: 400 } },
    fleuve: { nom: 'Fleuve V8', type: 'Muscle car · dérapages', vitesse: 1.1, accel: 1.15, direction: 0.85, robuste: 0.45,
      fantome: 1.08, debloque: 14500, couleurDefaut: 'orange', neon: '#FF3B30', son: { hauteur: 0.7, filtre: -100 }, v8: true },
    leopard: { nom: 'Léopard', type: 'Hypercar · la meilleure', vitesse: 1.22, accel: 1.3, direction: 1.2, robuste: 0.4,
      fantome: 1.22, debloque: 24000, couleurDefaut: 'jaune', neon: '#FFB000', son: { hauteur: 1.6, filtre: 1200 } }
  };
  var ORDRE_VOITURES = ['ketch', 'zigzag', 'mbote', 'blinde', 'kingt', 'fleuve', 'turbo', 'leopard'];
  // Peintures au choix : [teinte claire, teinte foncée].
  var COULEURS = {
    jaune: ['#FFD23F', '#D9A400'], noir: ['#4A505C', '#14171C'], blanc: ['#FFFFFF', '#B9BEC6'], vert: ['#3DDC84', '#127A45'],
    rouge: ['#FF4A3D', '#B3170E'], bleu: ['#4C8DFF', '#163E99'], orange: ['#FF9A3D', '#B85A0E'], violet: ['#B07CFF', '#5A23B0']
  };
  Object.keys(VOITURES).forEach(function (id) {
    var m = VOITURES[id]; m.id = id; m.teinte = m.couleurDefaut;
    try { var c = localStorage.getItem('ketch-couleur-' + id); if (COULEURS[c]) m.teinte = c; } catch (e) {}
    m.couleur = COULEURS[m.teinte];
  });
  // Meilleur score toutes étapes confondues : il débloque les voitures.
  function meilleurScore() {
    var max = 0;
    ['rondpoint', 'marche', 'poidslourds', 'corniche', 'boulevard', 'gombe', 'matonge', 'limete'].forEach(function (id) {
      try { var r = JSON.parse(localStorage.getItem('ketch-records-' + id) || 'null'); if (r && r.score > max) max = r.score; } catch (e) {}
    });
    return max;
  }
  function etapesGagnees() {
    var n = 0;
    ['rondpoint', 'marche', 'poidslourds', 'corniche', 'boulevard', 'gombe', 'matonge', 'limete'].forEach(function (id) {
      try { var r = JSON.parse(localStorage.getItem('ketch-records-' + id) || 'null'); if (r && r.gagne) n++; } catch (e) {}
    });
    return n;
  }
  // Lien propriétaire : …#garage-complet débloque toutes les voitures sur cet appareil.
  function garageComplet() { try { return localStorage.getItem('ketch-garage-complet') === 'oui'; } catch (e) { return false; } }
  function lireLienGarage() {
    if (location.hash === '#garage-complet') { try { localStorage.setItem('ketch-garage-complet', 'oui'); } catch (e) {} return true; }
    return false;
  }
  var lienGarage = lireLienGarage();
  // ---------- Porte-monnaie : les pièces G se gardent d'une course à l'autre ----------
  // Elles achètent des voitures (sans attendre le score) et des peintures.
  var PRIX_VOITURES = { zigzag: 60, mbote: 90, blinde: 120, kingt: 160, fleuve: 200, turbo: 260, leopard: 400 };
  var PRIX_COULEUR = 25, COULEURS_GRATUITES = ['jaune', 'noir', 'blanc'];
  function lirePorteMonnaie() { try { return Math.max(0, parseInt(localStorage.getItem('ketch-pieces') || '0', 10) || 0); } catch (e) { return 0; } }
  function ecrirePorteMonnaie(n) { try { localStorage.setItem('ketch-pieces', String(Math.max(0, Math.round(n)))); } catch (e) {} }
  function lireAchats() { try { var a = JSON.parse(localStorage.getItem('ketch-achats') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function achete(cle) { return lireAchats().indexOf(cle) >= 0; }
  function acheter(cle, prix) {
    var porte = lirePorteMonnaie();
    if (achete(cle) || porte < prix) return false;
    var a = lireAchats(); a.push(cle);
    try { localStorage.setItem('ketch-achats', JSON.stringify(a)); } catch (e) { return false; }
    ecrirePorteMonnaie(porte - prix);
    return true;
  }
  function couleurOuverte(c, m) { return COULEURS_GRATUITES.indexOf(c) >= 0 || c === m.couleurDefaut || achete('couleur:' + c) || garageComplet() || lienGarage; }
  function debloquee(m) { return achete('voiture:' + m.id) || garageComplet() || lienGarage || meilleurScore() >= m.debloque || (m.id === 'leopard' && etapesGagnees() >= 5); }
  function conditionDeblocage(m) {
    return m.debloque.toLocaleString('fr-FR') + ' pts' + (m.id === 'leopard' ? ' ou 5 étapes gagnées' : '') + (PRIX_VOITURES[m.id] ? ', ou ' + PRIX_VOITURES[m.id] + ' G' : '');
  }
  var voiture = VOITURES.ketch;
  try { var vSauve = localStorage.getItem('ketch-voiture'); if (VOITURES[vSauve] && debloquee(VOITURES[vSauve])) voiture = VOITURES[vSauve]; } catch (e) {}

  // ---------- Les rivaux : trois pilotes de l'ordinateur courent avec vous ----------
  var RIVAUX = [
    { nom: 'Kin Flash', modele: 'turbo', teinte: 'vert', habilete: 1.0 },
    { nom: 'Bana Mboka', modele: 'zigzag', teinte: 'orange', habilete: 0.965 },
    { nom: 'Lisanga', modele: 'fleuve', teinte: 'violet', habilete: 0.93 }
  ].map(function (rv) {
    var m = {}; Object.keys(VOITURES[rv.modele]).forEach(function (k) { m[k] = VOITURES[rv.modele][k]; });
    m.couleur = COULEURS[rv.teinte]; rv.m = m; return rv;
  });
  var PLACES = [800, 400, 150, 0];
  function rangTexte(n) { return n === 1 ? '1er' : n + 'e'; }

  // ---------- Sponsors (panneaux publicitaires) ----------
  // Maquettes texte, sans logo : à remplacer par les visuels officiels fournis par chaque marque
  // (fichiers public/pubs/<id>.png, format 2:1, listés dans public/pubs/liste.json).
  var PUBLICITES = [
    { id: 'vodacom', nom: 'VODACOM', ligne: 'Payez avec M-PESA', fond: ['#E60000', '#A80000'], texte: '#FFFFFF', accent: '#FFFFFF' },
    { id: 'bralima', nom: 'BRALIMA', ligne: 'Coca-Cola · bien fraîche', fond: ['#C8102E', '#7E0B1A'], texte: '#FFFFFF', accent: '#FFD23F' },
    { id: 'canal', nom: 'CANAL+', ligne: 'CANALBOX · internet fibre', fond: ['#1E1E1E', '#000000'], texte: '#FFFFFF', accent: '#FFFFFF' },
    { id: 'rawbank', nom: 'RAWBANK', ligne: 'Votre banque à Kinshasa', fond: ['#0A2A5E', '#06183A'], texte: '#FFFFFF', accent: '#E3B341' },
    { id: 'bracongo', nom: 'BRACONGO', ligne: 'Brasseries du Congo', fond: ['#0E6B3A', '#08462A'], texte: '#FFFFFF', accent: '#FFD23F' },
    { id: 'folucco', nom: 'FOLUCCO', ligne: '', fond: ['#F2A900', '#C98600'], texte: '#1A1A1A', accent: '#1A1A1A' },
    { id: 'gchallenge', nom: 'G-CHALLENGE', ligne: 'La Course des Ketch · bêta', fond: ['#0E1630', '#070B1E'], texte: '#FFFFFF', accent: '#FFC814' }
  ];
  var AFFICHES = {};
  (function chargerAffiches() {
    if (!window.fetch) return;
    fetch('pubs/liste.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (l) {
      (l && l.affiches || []).forEach(function (id) { var img = new Image(); img.onload = function () { AFFICHES[id] = img; }; img.src = 'pubs/' + id + '.png'; });
    }).catch(function () {});
  })();
  var ZONE_PANNEAU = [0.068, 0.083, 0.863, 0.536]; // position de la face blanche du panneau 3D (fractions de l'image)

  // ---------- Barème des points ----------
  var POINTS = {
    piéton: 400, véhicule: 200, obstacle: 100, trou: 50, police: 300, // retirés à chaque choc ou arrestation
    victoire: 1000, parSeconde: 100,                            // fantôme battu, + par seconde d'avance
    propre: [[0, 800], [2, 400], [5, 150]]                      // bonus selon le nombre de chocs
  };

  // ---------- Outils ----------
  function doux(a, b, p) { return a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5); }
  function entree(a, b, p) { return a + (b - a) * p * p; }
  function generateur(graine) {
    return function () { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  }
  function construire(plan) {
    var segs = [];
    function fin() { return segs.length ? segs[segs.length - 1].y : 0; }
    plan.forEach(function (t) {
      var entre = t[0], tient = t[1], sort = t[2], courbe = t[3], deniv = t[4], rep = t[5] || 1;
      for (var r = 0; r < rep; r++) {
        var y0 = fin(), y1 = y0 + (r % 2 && t[5] ? -deniv : deniv), total = entre + tient + sort, n;
        for (n = 0; n < entre; n++) segs.push({ courbe: entree(0, courbe, n / entre), y: doux(y0, y1, n / total) });
        for (n = 0; n < tient; n++) segs.push({ courbe: courbe, y: doux(y0, y1, (entre + n) / total) });
        for (n = 0; n < sort; n++) segs.push({ courbe: doux(courbe, 0, n / sort), y: doux(y0, y1, (entre + tient + n) / total) });
      }
    });
    return segs;
  }

  // ---------- Les 8 étapes (chacune apporte une nouveauté) ----------
  // plan : [entrée, tenue, sortie, courbe, dénivelé, répétitions] en segments de 5 m.
  var ETAPES = {
    rondpoint: {
      id: 'rondpoint', niveau: 'facile', numero: 1, nom: 'Rond-point Victoire', longueur: 1500, demi: 4.4,
      voies: [-0.75, -0.25, 0.25, 0.75], lignes: [{ x: -0.5, type: 'tirets' }, { x: 0, type: 'double' }, { x: 0.5, type: 'tirets' }],
      vMax: 34, vTurbo: 46, vFantome: 30, xFantome: 0.25, nbTrafic: 26, vitesseTrafic: 0.75,
      couleurs: { sol: ['#8E8A80', '#87837A'], trottoir: ['#C3BDB0', '#B8B2A5'], route: ['#3A3F4B', '#363A45'], bord: '#F5F3EA', ligne: '#F5F3EA' },
      ciel: ['#2B3F7A', '#C26A5A', '#F7B267'], ville: 'tours',
      plan: [[0, 16, 0, 0, 0], [6, 14, 6, 5, 0], [6, 14, 6, -5, 0], [0, 20, 0, 0, 3], [10, 16, 10, 2, -3], [0, 14, 0, 0, 0],
        [6, 14, 6, -5, 0], [6, 14, 6, 5, 0], [0, 16, 0, 0, 0], [8, 10, 8, -3, 2], [8, 10, 8, 3, -2], [0, 80, 0, 0, 0]],
      raccourcis: [{ cote: 1, debut: 620, fin: 760, nom: 'Contre-allée Victoire' }],
      passages: [250, 700, 1150], monuments: [{ z: 120, cote: 1 }, { z: 790, cote: -1 }],
      bati: { styles: ['verre', 'commerce', 'beton', 'verreVert', 'commerce'], recul: 3.2, hauteur: [12, 40] },
      typesFixes: ['cone', 'barriere', 'trou'], typesTrafic: ['voiture', 'ketch', 'ketch', 'bus', 'moto', 'voiture'],
      musique: { tempo: 124, tonique: 57, gamme: 'majeur' }
    },
    marche: {
      id: 'marche', niveau: 'moyen', numero: 2, nom: 'Le Grand Marché', longueur: 1600, demi: 3.2,
      voies: [-0.45, 0.45], lignes: [{ x: 0, type: 'tirets' }],
      vMax: 30, vTurbo: 40, vFantome: 26.5, xFantome: 0.45, nbTrafic: 12, vitesseTrafic: 1,
      couleurs: { sol: ['#8A6446', '#82603F'], trottoir: ['#A57C55', '#9C744E'], route: ['#5E5048', '#584B43'], bord: '#C9B79A', ligne: '#E8E0CF' },
      ciel: ['#3D7CC9', '#9CC8EE', '#F3D9A4'], ville: 'basse',
      plan: [[0, 16, 0, 0, 0], [8, 12, 8, -3, 2], [6, 10, 6, 4, 0], [0, 10, 0, 0, -2], [8, 12, 8, -3, 0],
        [8, 24, 8, 3.5, 0], [4, 0, 4, 0, 1.5], [4, 0, 4, 0, -1.5], [5, 6, 5, -4, 0], [5, 6, 5, 4, 0],
        [0, 16, 0, 0, 4], [8, 24, 8, -3, -4], [8, 16, 8, 2, 0], [0, 80, 0, 0, 0]],
      raccourcis: [{ cote: 1, debut: 540, fin: 700, nom: 'Allée des pagnes' }, { cote: -1, debut: 1060, fin: 1220, nom: 'Passage du dépôt' }],
      passages: [300, 900, 1350], marche: true,
      bati: { styles: ['ocre', 'bleu', 'rose', 'vert', 'creme'], recul: 4.6, hauteur: [6, 12], enseignes: true },
      typesFixes: ['etal', 'charrette', 'trou', 'bassines', 'etal', 'trou'], typesTrafic: ['pousse', 'moto', 'pousse', 'moto', 'ketch'],
      musique: { tempo: 132, tonique: 60, gamme: 'majeur' }
    },
    poidslourds: {
      id: 'poidslourds', niveau: 'moyen', numero: 3, nom: 'Route des Poids Lourds', longueur: 2000, demi: 3.6,
      voies: [-0.5, 0.5], lignes: [{ x: 0, type: 'tirets' }],
      vMax: 36, vTurbo: 48, vFantome: 32, xFantome: 0.5, nbTrafic: 14, vitesseTrafic: 0.85,
      couleurs: { sol: ['#9B7A52', '#93734C'], trottoir: ['#B49A74', '#AA906A'], route: ['#4A4A4E', '#454549'], bord: '#E8E0CF', ligne: '#F5F3EA' },
      ciel: ['#5B8BC4', '#C9D9E8', '#E8D2A8'], ville: 'industrie',
      plan: [[0, 16, 0, 0, 0], [4, 2, 4, 0, 2.5, 8], [10, 20, 10, 2, 0], [4, 2, 4, 0, 3, 6], [10, 20, 10, -2.5, 0],
        [0, 20, 0, 0, 6], [0, 20, 0, 0, -6], [4, 2, 4, 0, 2, 8], [8, 16, 8, 3, 0], [0, 80, 0, 0, 0]],
      raccourcis: [{ cote: -1, debut: 900, fin: 1080, nom: 'Piste de chantier' }],
      passages: [600, 1500], industrie: true,
      bati: { styles: ['entrepot', 'entrepot', 'tole', 'beton'], recul: 9, hauteur: [7, 14], clairseme: 0.55 },
      typesFixes: ['trou', 'trou', 'bosse', 'cone', 'trou', 'barriere'], typesTrafic: ['camion', 'camion', 'camion', 'moto', 'bus', 'voiture'],
      musique: { tempo: 112, tonique: 55, gamme: 'mineur' }
    },
    corniche: {
      id: 'corniche', niveau: 'difficile', numero: 4, nom: 'Corniche du Fleuve', longueur: 1800, demi: 3.6,
      voies: [-0.5, 0.5], lignes: [{ x: 0, type: 'tirets' }],
      vMax: 36, vTurbo: 48, vFantome: 33, xFantome: 0.5, nbTrafic: 10, vitesseTrafic: 1,
      couleurs: { sol: ['#7FA35B', '#78995A'], trottoir: ['#D8CDB8', '#CEC3AE'], route: ['#3E434F', '#3A3E4A'], bord: '#F5F3EA', ligne: '#F5F3EA' },
      ciel: ['#2E5FA8', '#E8936B', '#FFD08A'], ville: 'fleuve', eau: 1,
      plan: [[0, 14, 0, 0, 0], [8, 14, 8, -3, 0], [8, 14, 8, 4, 2], [6, 10, 6, -4, -2], [8, 12, 8, 3.5, 0],
        [8, 20, 8, -3, 0], [6, 10, 6, 4.5, 0], [6, 10, 6, -4.5, 0], [8, 14, 8, 3, 2], [8, 14, 8, -3, -2], [0, 80, 0, 0, 0]],
      raccourcis: [{ cote: -1, debut: 700, fin: 860, nom: 'Chemin des pêcheurs' }],
      passages: [450, 1250], glissant: [[260, 480], [920, 1120], [1380, 1580]],
      bati: { styles: ['creme', 'verre', 'creme', 'beton'], recul: 5, hauteur: [8, 20], cote: -1, clairseme: 0.7 },
      typesFixes: ['flaque', 'cone', 'flaque', 'charrette', 'trou'], typesTrafic: ['voiture', 'ketch', 'moto', 'voiture'],
      musique: { tempo: 104, tonique: 62, gamme: 'majeur' }
    },
    boulevard: {
      id: 'boulevard', niveau: 'facile', numero: 5, nom: 'Boulevard du 30 Juin', longueur: 2000, demi: 4.4,
      voies: [-0.75, -0.25, 0.25, 0.75], lignes: [{ x: -0.5, type: 'tirets' }, { x: 0, type: 'double' }, { x: 0.5, type: 'tirets' }],
      vMax: 38, vTurbo: 50, vFantome: 32.5, xFantome: 0.25, nbTrafic: 16, vitesseTrafic: 1,
      couleurs: { sol: ['#8E8A80', '#87837A'], trottoir: ['#C3BDB0', '#B8B2A5'], route: ['#3A3F4B', '#363A45'], bord: '#F5F3EA', ligne: '#F5F3EA' },
      ciel: ['#1B2A5C', '#7A3E6A', '#F08A3C'], ville: 'tours',
      plan: [[0, 20, 0, 0, 0], [10, 20, 10, 2, 6], [10, 10, 10, 0, -10], [10, 30, 10, -3, 0], [10, 10, 0, 0, 14],
        [0, 10, 10, 0, -16], [8, 8, 8, 3, 0], [8, 8, 8, -3, 0], [5, 0, 5, 0, 3, 4], [0, 12, 0, 0, 0],
        [10, 20, 10, 2.5, 0], [10, 20, 10, 0, -12], [0, 80, 0, 0, 0]],
      raccourcis: [{ cote: -1, debut: 480, fin: 660, nom: 'Contre-allée' }, { cote: 1, debut: 1420, fin: 1580, nom: 'Ruelle' }],
      passages: [380, 1100, 1700],
      bati: { styles: ['verre', 'verre', 'beton', 'commerce', 'verreVert', 'beton'], recul: 3.2, hauteur: [10, 64] },
      typesFixes: ['cone', 'trou', 'cone', 'charrette', 'barriere'], typesTrafic: ['voiture', 'ketch', 'bus', 'camion', 'moto', 'voiture', 'ketch'],
      musique: { tempo: 128, tonique: 57, gamme: 'mineur' }
    }
  };
  ETAPES.gombe = {
    id: 'gombe', niveau: 'tres_difficile', numero: 6, nom: 'Poursuite à la Gombe', longueur: 1800, demi: 4.4, nouveaute: 'Police aux trousses',
    voies: [-0.75, -0.25, 0.25, 0.75], lignes: [{ x: -0.5, type: 'tirets' }, { x: 0, type: 'double' }, { x: 0.5, type: 'tirets' }],
    vMax: 37, vTurbo: 49, vFantome: 31.5, xFantome: 0.25, nbTrafic: 18, vitesseTrafic: 0.9,
    couleurs: { sol: ['#8E8A80', '#87837A'], trottoir: ['#C9C3B6', '#BEB8AB'], route: ['#363B46', '#323641'], bord: '#F5F3EA', ligne: '#F5F3EA' },
    ciel: ['#24407E', '#6FA3D8', '#CFE3F2'], ville: 'tours',
    plan: [[0, 14, 0, 0, 0], [8, 12, 8, 4, 0], [0, 16, 0, 0, 4], [8, 10, 8, -5, -4], [6, 10, 6, 5, 0], [0, 20, 0, 0, 0],
      [8, 14, 8, -3, 3], [8, 14, 8, 3, -3], [6, 8, 6, -5, 0], [6, 8, 6, 5, 0], [0, 80, 0, 0, 0]],
    raccourcis: [{ cote: 1, debut: 820, fin: 980, nom: 'Ruelle de la Gombe' }],
    passages: [420, 1320], monuments: [{ z: 1000, cote: -1 }],
    bati: { styles: ['verre', 'verreVert', 'beton', 'verre', 'commerce'], recul: 3.2, hauteur: [16, 60] },
    typesFixes: [], typesTrafic: ['voiture', 'ketch', 'police', 'voiture', 'bus', 'ketch'],
    police: { nb: 2, retard: 55 },
    musique: { tempo: 142, tonique: 52, gamme: 'mineur' }
  };
  ETAPES.matonge = {
    id: 'matonge', niveau: 'difficile', numero: 7, nom: 'Matonge by night', longueur: 1700, demi: 3.6, nouveaute: 'De nuit, motos-taxis partout',
    voies: [-0.5, 0.5], lignes: [{ x: 0, type: 'tirets' }],
    vMax: 34, vTurbo: 46, vFantome: 29.5, xFantome: 0.5, nbTrafic: 24, vitesseTrafic: 1,
    couleurs: { sol: ['#6E665C', '#685F56'], trottoir: ['#9A8F80', '#918677'], route: ['#34363F', '#30323A'], bord: '#E8E0CF', ligne: '#F5F3EA' },
    ciel: ['#05081A', '#151A44', '#4A2A5E'], ville: 'tours', nuit: true,
    plan: [[0, 14, 0, 0, 0], [6, 10, 6, -4, 0], [6, 10, 6, 4, 2], [0, 14, 0, 0, -2], [8, 12, 8, 3, 0], [5, 6, 5, -4.5, 0],
      [5, 6, 5, 4.5, 0], [0, 16, 0, 0, 3], [8, 14, 8, -3, -3], [0, 80, 0, 0, 0]],
    raccourcis: [{ cote: -1, debut: 760, fin: 920, nom: 'Rue Kanda-Kanda' }],
    passages: [350, 900, 1400],
    bati: { styles: ['commerce', 'rose', 'bleu', 'ocre', 'creme'], recul: 3.6, hauteur: [8, 22], enseignes: true },
    typesFixes: [], typesTrafic: ['moto', 'moto', 'moto', 'ketch', 'moto', 'voiture'],
    musique: { tempo: 118, tonique: 58, gamme: 'mineur' }
  };
  ETAPES.limete = {
    id: 'limete', niveau: 'tres_difficile', numero: 8, nom: 'Orage sur Limete', longueur: 1900, demi: 3.8, nouveaute: 'Pluie, éclairs et bus fula-fula',
    voies: [-0.5, 0.5], lignes: [{ x: 0, type: 'tirets' }],
    vMax: 35, vTurbo: 46, vFantome: 30, xFantome: 0.5, nbTrafic: 16, vitesseTrafic: 0.9,
    couleurs: { sol: ['#5E6A55', '#58644F'], trottoir: ['#8C8C88', '#84847F'], route: ['#2B3038', '#282C34'], bord: '#C9CDD6', ligne: '#DADDE3' },
    ciel: ['#20252F', '#3C4350', '#5E6674'], ville: 'basse', pluie: true,
    plan: [[0, 16, 0, 0, 0], [8, 14, 8, 3, 0], [0, 12, 0, 0, 3], [8, 14, 8, -3.5, -3], [6, 10, 6, 4, 0], [0, 18, 0, 0, 0],
      [8, 12, 8, -3, 2], [8, 12, 8, 3, -2], [0, 14, 0, 0, 0], [6, 10, 6, -4, 0], [0, 80, 0, 0, 0]],
    raccourcis: [{ cote: 1, debut: 980, fin: 1140, nom: 'Chemin de la 12e rue' }],
    passages: [380, 1260], glissant: [[300, 520], [760, 940], [1380, 1560]],
    bati: { styles: ['beton', 'commerce', 'creme', 'tole', 'beton'], recul: 4.2, hauteur: [6, 18], clairseme: 0.85 },
    typesFixes: [], typesTrafic: ['fula', 'fula', 'ketch', 'fula', 'voiture', 'moto'],
    musique: { tempo: 100, tonique: 53, gamme: 'mineur' }
  };
  var ORDRE = ['rondpoint', 'marche', 'poidslourds', 'corniche', 'boulevard', 'gombe', 'matonge', 'limete'];
  var NOMS_NIVEAUX = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', tres_difficile: 'Très difficile' };
  // Niveau de l'entraînement : il règle la vitesse des rivaux, du fantôme et de la police.
  // En tournoi et au défi du jour, tout le monde court au niveau « Moyen » (équité).
  var REGLAGES_NIVEAU = {
    facile: { rivaux: 0.9, fantome: 0.94, police: 0.9 },
    moyen: { rivaux: 1, fantome: 1, police: 1 },
    difficile: { rivaux: 1.06, fantome: 1.04, police: 1.06 },
    tres_difficile: { rivaux: 1.12, fantome: 1.08, police: 1.12 }
  };
  var niveauChoisi = 'moyen';
  try { var nivSauve = localStorage.getItem('ketch-niveau'); if (REGLAGES_NIVEAU[nivSauve]) niveauChoisi = nivSauve; } catch (e) {}

  // Routes plus larges (+35 %), plus longues (+60 %), plus lisses et beaucoup plus sinueuses.
  var ELARGIT = 1.35, ALLONGE = 1.6;
  function longueurPlan(plan) { return plan.reduce(function (n, t) { return n + (t[0] + t[1] + t[2]) * (t[5] || 1); }, 0); }
  ORDRE.forEach(function (id) {
    var E = ETAPES[id], g = generateur(E.numero * 131 + 7);
    E.longueurBase = E.longueur;
    E.longueur = Math.round(E.longueur * ALLONGE / 100) * 100;
    E.demi = Math.round(E.demi * ELARGIT * 100) / 100;
    E.nbTrafic = Math.round(E.nbTrafic * ALLONGE);
    E.couleurs.route = [E.couleurs.route[0], E.couleurs.route[0]]; // chaussée unie : la route paraît lisse
    // Ondulations courtes et répétées remplacées par de longues vagues douces.
    var plan = E.plan.slice(0, -1).map(function (t) {
      if (t[4] && t[0] + t[1] + t[2] < 16) return [Math.max(10, t[0] * 2), Math.max(6, t[1] * 2), Math.max(10, t[2] * 2), t[3], t[4], t[5] ? Math.max(1, Math.round(t[5] / 3)) : 0];
      return t;
    });
    // Virages ajoutés jusqu'à la nouvelle longueur, toujours les mêmes pour une étape (équité).
    var signe = g() < 0.5 ? 1 : -1, relief = id !== 'marche' && id !== 'matonge';
    while (longueurPlan(plan) < E.longueur / SEG - 60) {
      if (g() < 0.7) signe = -signe;
      var force = (E.voies.length > 2 ? 2.2 : 2.6) + g() * 2.2;
      plan.push([6 + Math.floor(g() * 5), 8 + Math.floor(g() * 12), 6 + Math.floor(g() * 5), signe * force, relief && g() < 0.4 ? Math.round((g() * 8 - 4) * 10) / 10 : 0]);
      if (g() < 0.3) plan.push([0, 6 + Math.floor(g() * 8), 0, 0, 0]);
    }
    plan.push([0, 80, 0, 0, 0]);
    E.plan = plan;
    // De quoi animer la partie ajoutée : passages piétons, un raccourci, des zones glissantes.
    for (var zp = E.longueurBase + 300; zp < E.longueur - 250; zp += 650) E.passages.push(zp);
    var cr = E.raccourcis.length % 2 ? 1 : -1;
    if (E.eau !== cr) E.raccourcis.push({ cote: cr, debut: E.longueurBase + 480, fin: E.longueurBase + 640, nom: 'Ruelle des habitués' });
    if (E.glissant) E.glissant.push([E.longueurBase + 820, E.longueurBase + 1000]);
  });

  function zoneRaccourci(E, zz, cote) {
    for (var i = 0; i < E.raccourcis.length; i++) {
      var r = E.raccourcis[i];
      if (zz >= r.debut && zz <= r.fin && (cote === undefined || r.cote === cote)) return r;
    }
    return null;
  }
  function zoneGlissante(E, zz) {
    if (!E.glissant) return false;
    for (var i = 0; i < E.glissant.length; i++) if (zz >= E.glissant[i][0] && zz <= E.glissant[i][1]) return true;
    return false;
  }

  // Prépare une étape : parcours, obstacles, circulation, piétons, décor, immeubles (toujours identiques).
  function preparer(E) {
    if (E.segments) return E;
    E.segments = construire(E.plan);
    // La route continue tout droit après l'arrivée, assez loin pour que l'horizon reste dessiné.
    var yFin = E.segments[E.segments.length - 1].y;
    while (E.segments.length * SEG < E.longueur + VISIBLES * SEG + 60) E.segments.push({ courbe: 0, y: yFin });
    E.nb = E.segments.length;
    var h = generateur(E.numero * 7919 + 2026);
    var voies = E.voies;

    E.obstacles = [];
    for (var zz = 140; zz < E.longueur - 70; zz += (voies.length > 2 ? 70 : 55) + Math.floor(h() * 25)) {
      var nb = voies.length > 2 && h() < 0.4 ? 2 : 1, prises = {};
      for (var k = 0; k < nb; k++) {
        var v = Math.floor(h() * voies.length);
        var t = E.typesFixes[Math.floor(h() * E.typesFixes.length)];
        if (t === 'etal') v = h() < 0.5 ? 0 : voies.length - 1;
        if (t === 'bosse') { E.obstacles.push({ z: zz, x: 0, type: 'bosse' }); break; }
        if (prises[v]) continue; prises[v] = 1;
        E.obstacles.push({ z: zz + k * 6, x: voies[v], type: t });
      }
    }
    // Bonus à ramasser : traînées de 3 pièces, et bidons qui rechargent le turbo.
    E.bonus = [];
    for (var bz2 = 200, nb2 = 0; bz2 < E.longueur - 60; bz2 += 90 + Math.floor(h() * 40), nb2++) {
      var voieB = voies[Math.floor(h() * voies.length)];
      if (nb2 % 4 === 3) E.bonus.push({ z: bz2, x: voieB, type: 'bidon' });
      else for (var k2 = 0; k2 < 3; k2++) E.bonus.push({ z: bz2 + k2 * 7, x: voieB, type: 'piece' });
    }
    E.raccourcis.forEach(function (r) {
      var b = 1 + 2 / E.demi;
      E.obstacles.push({ z: r.debut + 55, x: r.cote * (b + 0.1), type: 'trou' }, { z: r.debut + 90, x: r.cote * (b + 0.45), type: 'trou' },
        { z: r.debut + 120, x: r.cote * (b + 0.15), type: 'charrette' }, { z: r.fin - 25, x: r.cote * (b + 0.5), type: 'trou' });
    });

    E.obstacles = []; // plus d'obstacles fixes sur la route : le danger vient du trafic, des piétons et de la police
    // Barrages de police (étape 6) : toutes les voies fermées sauf une, à trouver à temps.
    E.barrageZ = [];
    if (E.police) [650, 1450, 2250].forEach(function (zb, j) {
      if (zb > E.longueur - 200) return;
      var libre = (j * 3 + 1) % voies.length;
      voies.forEach(function (vx, k) { if (k !== libre) E.obstacles.push({ z: zb, x: vx, type: 'policeArret' }); });
      E.barrageZ.push(zb);
    });
    E.traficListe = [];
    var couleurs = ['#E8E6E1', '#1E5FD6', '#B42318', '#2F3542', '#1E7D45', '#C9CDD6'];
    for (var i = 0; i < E.nbTrafic; i++) {
      var type = E.typesTrafic[Math.floor(h() * E.typesTrafic.length)];
      var vit = ({ voiture: 15, ketch: 13, bus: 11, camion: 10, moto: 14, pousse: 2.5, police: 16, fula: 10 }[type] + h() * (type === 'pousse' ? 1.5 : 7)) * (type === 'pousse' ? 1 : E.vitesseTrafic);
      var a = Math.floor(h() * voies.length), b2 = a;
      if (h() < 0.5 && type !== 'pousse') b2 = Math.max(0, Math.min(voies.length - 1, a + (h() < 0.5 ? -1 : 1)));
      E.traficListe.push({ z0: 90 + i * (E.longueur - 200) / E.nbTrafic + h() * 40, vit: vit, a: voies[a], b: voies[b2],
        change: 4 + h() * 40, type: type, couleur: couleurs[Math.floor(h() * couleurs.length)], n: i });
    }

    E.pietons = [];
    E.passages.forEach(function (p, j) {
      E.pietons.push({ z: p + 2, cote: j % 2 ? 1 : -1, vit: 1.6, declenche: 75, habit: 0 });
      E.pietons.push({ z: p + 3, cote: j % 2 ? -1 : 1, vit: 1.3, declenche: 95, habit: 1 });
    });
    if (E.marche) [460, 780, 1150, 1480].forEach(function (p, j) { E.pietons.push({ z: p, cote: j % 2 ? 1 : -1, vit: 1.4, declenche: 70, habit: j + 2 }); });

    // Décor posé le long de la route.
    E.decor = [];
    var trottoir = 1 + 2.4 / E.demi;
    for (var d = 0; d < E.longueur + 300; d += E.marche ? 9 : 30) {
      [-1, 1].forEach(function (cote) {
        var surEau = E.eau === cote;
        if (E.marche) {
          if (!zoneRaccourci(E, d, cote) && !zoneRaccourci(E, d + 30, cote)) E.decor.push({ z: d + (cote > 0 ? 4 : 0), x: cote * (1 + 1.7 / E.demi), type: 'etalDecor', v: Math.floor(h() * 5) });
          if (h() < 0.35) E.decor.push({ z: d + 2, x: cote * (1 + 3.2 / E.demi), type: 'passant', v: Math.floor(h() * 6) });
        } else if (E.industrie) {
          if (h() < 0.4) E.decor.push({ z: d + 10, x: cote * (1 + 4 / E.demi), type: 'conteneur', v: Math.floor(h() * 4) });
          if (h() < 0.3) E.decor.push({ z: d + 5, x: cote * (1 + 2 / E.demi), type: 'palmier' });
        } else {
          E.decor.push({ z: d + (cote > 0 ? 15 : 0), x: cote * trottoir, type: 'lampadaire', cote: cote });
          if (h() < 0.5) E.decor.push({ z: d + 8, x: cote * (1 + 1.5 / E.demi), type: 'palmier' });
          if (!surEau && h() < 0.25) E.decor.push({ z: d + 20, x: cote * (1 + 1.9 / E.demi), type: 'passant', v: Math.floor(h() * 6) });
        }
        if (surEau && h() < 0.35) E.decor.push({ z: d + 12, x: cote * (2.6 + h() * 4), type: 'pirogue', v: Math.floor(h() * 3) });
      });
    }
    if (E.industrie) for (var pz0 = 60; pz0 < E.longueur + 300; pz0 += 140) E.decor.push({ z: pz0, x: (pz0 % 280 ? 1 : -1) * (1 + 7 / E.demi), type: 'pylone' });
    // Panneaux publicitaires : les sponsors défilent le long de la route, des deux côtés.
    for (var pz = 180, n2 = 0; pz < E.longueur; pz += 200, n2++) {
      var cotePub = E.eau === 1 ? -1 : (n2 % 2 ? 1 : -1);
      if (!zoneRaccourci(E, pz, cotePub)) E.decor.push({ z: pz, x: cotePub * (1 + 1.4 / E.demi), type: 'pub', sponsor: PUBLICITES[(n2 + E.numero) % PUBLICITES.length] });
    }
    // Arches publicitaires au-dessus de la route : les sponsors bien en face du joueur.
    E.arches = [];
    for (var az2 = 120, na = 0; az2 < E.longueur - 150; az2 += 300, na++) E.arches.push({ z: az2, sponsor: PUBLICITES[(na * 3 + E.numero) % PUBLICITES.length] });
    if (E.id === 'boulevard' || E.id === 'rondpoint') [200, 900, 1300].forEach(function (az, j) { E.decor.push({ z: az, x: (j % 2 ? -1 : 1) * (1 + 1.3 / E.demi), type: 'abribus' }); });
    if (E.marche) for (var fz = 120; fz < E.longueur; fz += 160) E.decor.push({ z: fz, x: 0, type: 'fanions' });
    (E.monuments || []).forEach(function (m) { E.decor.push({ z: m.z, x: m.cote * (1 + 3.5 / E.demi), type: 'monument' }); });
    if (E.glissant) E.glissant.forEach(function (g) { E.decor.push({ z: g[0] - 30, x: -1.25, type: 'panneauGlissant' }); });
    E.barrageZ.forEach(function (zb) { E.decor.push({ z: zb - 90, x: 1.25, type: 'panneauBarrage' }); E.decor.push({ z: zb - 90, x: -1.25, type: 'panneauBarrage' }); });

    // Immeubles : blocs de 20 m séparés par une ruelle de 5 m.
    var I = E.bati;
    E.blocs = [];
    for (var bz = 0; bz < E.longueur + 300; bz += 25) {
      [-1, 1].forEach(function (cote) {
        if (E.eau === cote) return;
        if (I.cote && I.cote !== cote) return;
        if (I.clairseme && h() > I.clairseme) return;
        var loin = zoneRaccourci(E, bz, cote) || zoneRaccourci(E, bz + 20, cote);
        var recul = I.recul + (loin ? 6 : 0);
        var style = I.styles[Math.floor(h() * I.styles.length)];
        var haut = I.hauteur[0] + h() * (I.hauteur[1] - I.hauteur[0]);
        if (E.marche) haut = 6 + Math.floor(h() * 3) * 3.2;
        E.blocs.push({ z: bz, cote: cote, x: 1 + recul / E.demi, prof: 14 / E.demi, haut: haut, style: style,
          enseigne: I.enseignes ? ['ALIMENTATION', 'PHARMACIE', 'COIFFURE', 'BOUTIQUE', 'PAGNES', 'QUINCAILLERIE'][Math.floor(h() * 6)] : null });
      });
    }
    return E;
  }

  // ---------- Son ----------
  var son = { actif: true, musique: true };
  try { son.actif = localStorage.getItem('ketch-son') !== 'non'; son.musique = localStorage.getItem('ketch-musique') !== 'non'; } catch (e) {}
  function sonDemarrer() {
    if (son.ctx) { if (son.ctx.state === 'suspended') son.ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      var c = new AC();
      son.ctx = c;
      son.general = c.createGain(); son.general.gain.value = son.actif ? 0.34 : 0; son.general.connect(c.destination);
      son.busMusique = c.createGain(); son.busMusique.gain.value = son.musique ? 0.55 : 0; son.busMusique.connect(son.general);

      // Moteur : deux dents de scie légèrement désaccordées + sous-grave, saturées puis filtrées,
      // avec une modulation au rythme des explosions des cylindres (le « grondement »).
      son.oscA = c.createOscillator(); son.oscA.type = 'sawtooth';
      son.oscB = c.createOscillator(); son.oscB.type = 'sawtooth';
      son.oscC = c.createOscillator(); son.oscC.type = 'sine';
      var mix = c.createGain(); mix.gain.value = 0.5;
      var gC = c.createGain(); gC.gain.value = 0.9;
      son.oscA.connect(mix); son.oscB.connect(mix); son.oscC.connect(gC); gC.connect(mix);
      var sat = c.createWaveShaper(), courbe = new Float32Array(1024);
      for (var i = 0; i < 1024; i++) { var xx = i / 512 - 1; courbe[i] = Math.tanh(1.7 * xx); }
      sat.curve = courbe;
      son.filtre = c.createBiquadFilter(); son.filtre.type = 'lowpass'; son.filtre.Q.value = 0.7;
      son.pulsation = c.createGain(); son.pulsation.gain.value = 0.75;
      son.lfo = c.createOscillator(); son.lfo.type = 'triangle';
      var lfoProf = c.createGain(); lfoProf.gain.value = 0.25; son.lfo.connect(lfoProf); lfoProf.connect(son.pulsation.gain);
      son.moteur = c.createGain(); son.moteur.gain.value = 0;
      mix.connect(sat); sat.connect(son.filtre); son.filtre.connect(son.pulsation); son.pulsation.connect(son.moteur); son.moteur.connect(son.general);
      // Sifflement du turbo.
      son.sifflet = c.createOscillator(); son.sifflet.type = 'sine'; son.sifflet.frequency.value = 2400;
      son.gSifflet = c.createGain(); son.gSifflet.gain.value = 0; son.sifflet.connect(son.gSifflet); son.gSifflet.connect(son.general);
      [son.oscA, son.oscB, son.oscC, son.lfo, son.sifflet].forEach(function (o) { o.start(); });

      var n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (var j = 0; j < n; j++) d[j] = Math.random() * 2 - 1;
      son.bruit = buf;
      // Crissement des pneus (bruit filtré, joué en continu, volume piloté).
      son.crissSrc = c.createBufferSource(); son.crissSrc.buffer = buf; son.crissSrc.loop = true;
      var fC = c.createBiquadFilter(); fC.type = 'bandpass'; fC.frequency.value = 1300; fC.Q.value = 1.6;
      son.gCriss = c.createGain(); son.gCriss.gain.value = 0;
      son.crissSrc.connect(fC); fC.connect(son.gCriss); son.gCriss.connect(son.general); son.crissSrc.start();
      // Ambiance (foule, ville, vent du fleuve) : bruit filtré en boucle.
      son.ambSrc = c.createBufferSource(); son.ambSrc.buffer = buf; son.ambSrc.loop = true;
      son.fAmb = c.createBiquadFilter(); son.fAmb.type = 'bandpass'; son.fAmb.Q.value = 0.8;
      son.gAmb = c.createGain(); son.gAmb.gain.value = 0;
      son.ambSrc.connect(son.fAmb); son.fAmb.connect(son.gAmb); son.gAmb.connect(son.general); son.ambSrc.start();
    } catch (e) { son.ctx = null; }
  }
  function sonBruit(frequence, type, duree, volume, versFrequence, sortie) {
    if (!son.ctx) return;
    var c = son.ctx, t = c.currentTime;
    var src = c.createBufferSource(); src.buffer = son.bruit;
    var f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(frequence, t);
    if (versFrequence) f.frequency.exponentialRampToValueAtTime(versFrequence, t + duree);
    var g = c.createGain(); g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + duree);
    src.connect(f); f.connect(g); g.connect(sortie || son.general); src.start(t); src.stop(t + duree + 0.05);
  }
  function sonNote(frequence, debut, duree, volume, forme, sortie, quand) {
    if (!son.ctx) return;
    var c = son.ctx, t = (quand || c.currentTime) + debut;
    var o = c.createOscillator(); o.type = forme || 'square'; o.frequency.value = frequence;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    o.connect(g); g.connect(sortie || son.general); o.start(t); o.stop(t + duree + 0.05);
  }
  function klaxon(grave) { var b = grave ? 0.7 : 1; sonNote(392 * b, 0, 0.32, 0.12); sonNote(494 * b, 0, 0.32, 0.1); }
  var RAPPORTS = [0, 9, 17, 25, 33, 42, 54], rapportAvant = 1, coupure = 0;
  function sonMoteur(dt) {
    if (!son.ctx) return;
    var t = son.ctx.currentTime, enCourse = etat === 'course' || etat === 'compte';
    var rapport = 1, r = 0;
    var va = Math.abs(v);
    for (var i = 1; i < RAPPORTS.length; i++) {
      rapport = i;
      if (va <= RAPPORTS[i] || i === RAPPORTS.length - 1) { r = (va - RAPPORTS[i - 1]) / (RAPPORTS[i] - RAPPORTS[i - 1]); break; }
    }
    if (rapport > rapportAvant && etat === 'course' && !voiture.electrique) { coupure = 0.12; sonBruit(450, 'lowpass', 0.1, 0.12); }
    rapportAvant = rapport;
    if (coupure > 0) coupure -= dt;
    var regime = va < 0.5 ? 0.12 : 0.28 + 0.72 * Math.max(0, Math.min(1, r));
    if (etat === 'compte') regime = 0.15 + (appuye('turbo') ? 0.55 : 0);
    if (voiture.electrique) {
      // Moteur électrique : pas de rapports, un sifflement qui monte avec la vitesse.
      var fe = 180 + Math.min(1.3, va / 40) * 900;
      son.oscA.frequency.setTargetAtTime(fe, t, 0.05); son.oscB.frequency.setTargetAtTime(fe * 1.5, t, 0.05);
      son.oscC.frequency.setTargetAtTime(fe / 2, t, 0.05); son.lfo.frequency.setTargetAtTime(30, t, 0.1);
      son.filtre.frequency.setTargetAtTime(1200 + fe, t, 0.05);
      son.moteur.gain.setTargetAtTime(enCourse ? 0.035 + 0.04 * Math.min(1, va / 40) : 0, t, 0.05);
      son.gSifflet.gain.setTargetAtTime(0, t, 0.1);
    } else {
    var tours = 900 + regime * 5600;                    // tours/minute
    var freq = tours / 60 * 2 * voiture.son.hauteur;    // 4 cylindres : 2 explosions par tour (plus aigu pour les sportives)
    son.oscA.frequency.setTargetAtTime(freq, t, 0.03);
    son.oscB.frequency.setTargetAtTime(freq * 1.006, t, 0.03);
    son.oscC.frequency.setTargetAtTime(freq / 2, t, 0.03);
    son.lfo.frequency.setTargetAtTime(freq / 2, t, 0.03);
    son.filtre.frequency.setTargetAtTime(Math.max(180, 320 + regime * 1500 + (turboActif ? 350 : 0) + voiture.son.filtre * 0.7), t, 0.05);
    var vol = enCourse ? (0.13 + 0.12 * regime) * (coupure > 0 ? 0.35 : 1) * (appuye('frein') ? 0.7 : 1) * (voiture.v8 ? 1.35 : 1) : 0;
    son.moteur.gain.setTargetAtTime(vol, t, 0.04);
    son.sifflet.frequency.setTargetAtTime(1400 + regime * 1600, t, 0.1);
    son.gSifflet.gain.setTargetAtTime(turboActif && enCourse ? 0.01 : 0, t, 0.15);
    }
    var dir = (appuye('droite') ? 1 : 0) - (appuye('gauche') ? 1 : 0);
    var crisse = etat === 'course' && v > 22 && ((dir && Math.abs(segmentA(z).courbe) > 2) || (dir && zoneGlissante(E, z)) || (appuye('frein') && v > 25));
    son.gCriss.gain.setTargetAtTime(crisse ? 0.025 : 0, t, 0.08);
    var amb = enCourse || etat === 'fin' ? { marche: [700, 0.07], rondpoint: [500, 0.05], boulevard: [400, 0.04], poidslourds: [180, 0.05], corniche: [300, 0.05], gombe: [450, 0.05], matonge: [600, 0.06], limete: [2600, 0.11] }[E.id] || [400, 0.05] : [300, 0];
    son.fAmb.frequency.setTargetAtTime(amb[0], t, 0.3); son.gAmb.gain.setTargetAtTime(amb[1], t, 0.5);
  }

  // Musique : une boucle différente par étape (rythme, basse, guitare en arpèges), générée en direct.
  var GAMMES = { majeur: [0, 2, 4, 5, 7, 9, 11], mineur: [0, 2, 3, 5, 7, 8, 10] };
  var musique = { joue: false, prochaine: 0, pas: 0, minuterie: null };
  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function musiqueDemarrer() {
    if (!son.ctx || musique.joue) return;
    annoncerChanson();
    if (typeof direct === 'function') direct('Radio Kin', chansonCourante().titre + ' · ' + chansonCourante().style + ' · composition originale G-Challenge', 'commentateur');
    musique.joue = true; musique.pas = 0; musique.prochaine = son.ctx.currentTime + 0.1;
    musique.minuterie = setInterval(planifier, 25);
  }
  function musiqueArreter() { musique.joue = false; if (musique.minuterie) clearInterval(musique.minuterie); musique.minuterie = null; }
  // Radio Kin : 4 chansons originales composées pour le jeu (elles nous appartiennent : libres de droits).
  // Chaque chanson a une vraie structure : intro, couplet, refrain avec sa mélodie, puis sebene
  // (la partie dansée de la rumba congolaise, guitare rapide et cloche).
  // Motifs : 'x' = coup, '.' = silence, une case par double-croche, 16 cases par mesure.
  var CHANSONS = {
    rumba: { titre: 'Kin la Belle', style: 'Rumba congolaise', tempo: 116, tonique: 57, gamme: 'majeur', accords: [0, 3, 4, 3],
      grosse: 'x.......x.......', claire: '....x.......x...', charley: '..x...x...x...x.', clave: 'x..x..x...x.x...', basse: 'x..x..x...x.x...',
      melodie: [4, null, 4, 5, 4, null, 2, null, 0, null, 2, null, 4, null, null, null, 5, null, 5, 7, 5, null, 4, null, 2, null, 4, null, 2, null, 0, null] },
    ndombolo: { titre: 'Ndombolo Turbo', style: 'Ndombolo', tempo: 138, tonique: 60, gamme: 'majeur', accords: [0, 4, 5, 3],
      grosse: 'x...x...x...x...', claire: '....x.......x..x', charley: 'x.x.x.x.x.x.x.x.', clave: '..x...x...x...x.', basse: 'x.x...x.x.x...x.',
      melodie: [7, null, 7, null, 9, 7, 4, null, 7, null, 7, null, 9, 11, 9, null, 7, null, 4, null, 2, null, 4, null, 0, null, 2, 4, 2, null, null, null] },
    fleuve: { titre: 'Fleuve Congo', style: 'Soukous doux', tempo: 100, tonique: 62, gamme: 'majeur', accords: [0, 5, 3, 4],
      grosse: 'x.........x.....', claire: '........x.......', charley: '....x.......x...', clave: 'x.....x.....x...', basse: 'x.....x...x.....',
      melodie: [2, null, null, 4, null, null, 5, null, 4, null, 2, null, 0, null, null, null, 2, null, null, 4, null, 7, null, 5, 4, null, 2, null, 4, null, null, null] },
    nuit: { titre: 'Matonge by Night', style: 'Nuit à Matonge', tempo: 124, tonique: 57, gamme: 'mineur', accords: [0, 5, 3, 6],
      grosse: 'x.....x.x.......', claire: '....x.......x...', charley: '..x...x...x...x.', clave: 'x..x...x..x.....', basse: 'x..x..x.x..x..x.',
      melodie: [0, null, 2, 3, null, 2, 0, null, 3, null, 4, null, 3, 2, 0, null, 0, null, 2, 3, null, 4, 5, null, 4, null, 3, null, 2, null, null, null] }
  };
  var ORDRE_RADIO = ['auto', 'ndombolo', 'rumba', 'fleuve', 'nuit'];
  var CHANSON_ETAPE = { rondpoint: 'ndombolo', marche: 'rumba', poidslourds: 'ndombolo', corniche: 'fleuve', boulevard: 'rumba', gombe: 'ndombolo', matonge: 'nuit', limete: 'nuit' };
  var radio = 'auto';
  try { var radioSauvee = localStorage.getItem('ketch-radio'); if (ORDRE_RADIO.indexOf(radioSauvee) >= 0) radio = radioSauvee; } catch (e) {}
  function chansonCourante() { return CHANSONS[radio === 'auto' ? (CHANSON_ETAPE[E.id] || 'rumba') : radio]; }
  function planifier() {
    if (!son.ctx || !musique.joue) return;
    var C = chansonCourante(), double = 60 / C.tempo / 4, gamme = GAMMES[C.gamme], bus = son.busMusique;
    function note(deg) { var o = Math.floor(deg / 7); return gamme[((deg % 7) + 7) % 7] + 12 * o; }
    while (musique.prochaine < son.ctx.currentTime + 0.12) {
      var p = musique.pas, t = musique.prochaine, mesure = Math.floor(p / 16), dans = p % 16;
      var partie = mesure < 4 ? 'intro' : ((mesure - 4) % 24) < 8 ? 'couplet' : ((mesure - 4) % 24) < 16 ? 'refrain' : 'sebene';
      var degre = C.accords[mesure % C.accords.length], racine = C.tonique + note(degre);
      // Batterie
      if (C.grosse[dans] === 'x') { sonNote(110, 0, 0.12, 0.42, 'sine', bus, t); sonNote(52, 0, 0.2, 0.36, 'sine', bus, t); }
      if (partie !== 'intro' && C.claire[dans] === 'x') sonBruitA(t, 1700, 'highpass', 0.1, 0.22);
      if (C.charley[dans] === 'x') sonBruitA(t, 7500, 'highpass', 0.035, 0.07);
      if (C.clave[dans] === 'x') sonNote(2500, 0, 0.03, 0.05, 'square', bus, t);
      if (partie === 'sebene' && dans % 4 === 2) sonNote(820, 0, 0.06, 0.06, 'square', bus, t); // cloche du sebene
      // Basse
      if (C.basse[dans] === 'x') sonNote(hz(racine - 24 + (dans >= 8 && dans % 4 === 2 ? 7 : 0)), 0, double * 1.6, 0.17, 'triangle', bus, t);
      // Nappe d'accord en intro
      if (partie === 'intro' && dans === 0) [0, 2, 4].forEach(function (k) { sonNote(hz(C.tonique + note(degre + k)), 0, double * 15, 0.03, 'triangle', bus, t); });
      // Guitare : arpèges en couplet et refrain, guitare rapide et aiguë au sebene
      if (partie !== 'intro') {
        var arp = partie === 'sebene' ? [0, 2, 4, 7, 9, 7, 4, 2] : [0, 4, 2, 4, 7, 4, 2, 4];
        if (partie === 'sebene' || dans % 2 === 0) {
          var dg = degre + arp[(partie === 'sebene' ? dans : dans / 2) % 8];
          sonNote(hz(C.tonique + 12 + note(dg) + (partie === 'sebene' ? 12 : 0)), 0, double * (partie === 'sebene' ? 0.8 : 1.6), partie === 'sebene' ? 0.045 : 0.055, partie === 'sebene' ? 'square' : 'triangle', bus, t);
        }
      }
      // Mélodie du refrain (le « tube » de la chanson)
      if (partie === 'refrain') {
        var m = C.melodie[(mesure % 2) * 16 + dans];
        if (m !== null && m !== undefined) sonNote(hz(C.tonique + 12 + note(m)), 0, double * 1.9, 0.075, 'sawtooth', bus, t);
      }
      musique.pas++; musique.prochaine += double;
    }
  }
  function annoncerChanson() {
    var C = chansonCourante(), b = document.getElementById('boutonRadio');
    if (b) { b.textContent = '\u266A ' + C.titre; b.title = 'Radio Kin : ' + C.titre + ' (' + C.style + ')' + (radio === 'auto' ? ', choisie selon l\'étape' : '') + '. Cliquez pour changer.'; }
  }
  function sonBruitA(quand, frequence, type, duree, volume) {
    var c = son.ctx, src = c.createBufferSource(); src.buffer = son.bruit;
    var f = c.createBiquadFilter(); f.type = type; f.frequency.value = frequence;
    var g = c.createGain(); g.gain.setValueAtTime(volume, quand); g.gain.exponentialRampToValueAtTime(0.001, quand + duree);
    src.connect(f); f.connect(g); g.connect(son.busMusique); src.start(quand, Math.random()); src.stop(quand + duree + 0.02);
  }
  function majVolumes() {
    if (!son.ctx) return;
    son.general.gain.setTargetAtTime(son.actif ? 0.34 : 0, son.ctx.currentTime, 0.02);
    son.busMusique.gain.setTargetAtTime(son.musique ? 0.55 : 0, son.ctx.currentTime, 0.05);
  }

  // ---------- État de la partie ----------
  var E = preparer(ETAPES.boulevard);
  var etat = 'accueil', temps = 0, compte = 0, z = 0, v = 0, x = 0, energie = 1, turboActif = false, choc = 0;
  var touches = {}, obstacles = [], trafic = [], pietons = [], zFantome = 0, raccourci = null, decalDecor = 0;
  var message = '', messageTemps = 0, derniereSeconde = 4, glisse = false;
  var duel = null, trajet = [], prochainPoint = 0, rivaux = [], rivalDessin = null, prochainBarrage = 0, braquage = 0, defiEnCours = false, voitureAvantDefi = null, police = [], sirene = 0, eclair = 0, prochainEclair = 8, lumieres = [], bonus = [], particules = [], bonusPts = 0, frolés = 0, pieces = 0, arriere = false, tempsArret = 0, bipArriere = 0, grace = 0, points = 0, gagnes = 0, perdus = 0, chocs = { piéton: 0, véhicule: 0, obstacle: 0, trou: 0, police: 0 }, bulles = [], flashScore = 0;

  function lireRecord(id) {
    try { var r = JSON.parse(localStorage.getItem('ketch-records-' + id) || 'null'); return r && typeof r === 'object' ? r : null; } catch (e) { return null; }
  }
  function ecrireRecord(id, r) { try { localStorage.setItem('ketch-records-' + id, JSON.stringify(r)); } catch (e) {} }

  function reinitialiser(id) {
    E = preparer(ETAPES[id]);
    etat = 'accueil'; temps = 0; compte = 3.999; z = 0; v = 0; x = E.voies[E.voies.length - 1] * (E.voies.length > 2 ? 0.33 : 1);
    energie = 1; turboActif = false; choc = 0; zFantome = 0; touches = {}; raccourci = null; decalDecor = 0; glisse = false; braquage = 0;
    message = ''; messageTemps = 0; derniereSeconde = 4;
    bonus = E.bonus.map(function (b) { return { z: b.z, x: b.x, type: b.type, pris: false }; });
    particules = []; bonusPts = 0; frolés = 0; pieces = 0; sirene = 0; eclair = 0; prochainEclair = 6;
    prochainBarrage = 0; trajet = []; prochainPoint = 0;
    // Grille de départ : les rivaux partent dans les autres voies, jamais juste devant vous.
    var autres = E.voies.filter(function (vx) { return Math.abs(vx - x) * E.demi > 2.2; });
    if (!autres.length) autres = [E.voies[0]];
    var grille = [[10, autres[0]], [4, autres[1 % autres.length]], [-3, autres[2 % autres.length]]];
    rivaux = RIVAUX.map(function (d, i) {
      return { d: d, nom: d.nom, m: d.m, habilete: d.habilete, z: grille[i][0], x: grille[i][1], cibleX: grille[i][1], v: 0,
        turboT: 5 + i * 2.5, turboDuree: 0, contact: -9, arrive: false, tempsArrivee: 0 };
    });
    if (entreAmis()) rivaux = [];
    police = [];
    if (E.police) for (var ip = 0; ip < E.police.nb; ip++) police.push({ z: -E.police.retard - ip * 45, x: E.voies[ip % E.voies.length], v: 0, arrets: 0, mode: 'chasse', t: 0, blocages: 0, dernier: 0 });
    arriere = false; tempsArret = 0; bipArriere = 0; grace = 0; points = 0; gagnes = 0; perdus = 0; chocs = { piéton: 0, véhicule: 0, obstacle: 0, trou: 0, police: 0 }; bulles = []; flashScore = 0;
    obstacles = E.obstacles.map(function (o) { return { z: o.z, x: o.x, type: o.type, touche: false }; });
    trafic = E.traficListe.map(function (t) { return { def: t, z: t.z0, x: t.a, pousse: 0, klaxon: -9, devant: true }; });
    pietons = E.pietons.map(function (p) { return { def: p, z: p.z, x: p.cote * (1 + 1.2 / E.demi), parti: false, ecarte: false }; });
  }
  function annoncer(texte) { message = texte; messageTemps = 1.6; }
  function gagner(n, texte) {
    bonusPts += n; points = Math.max(0, gagnes + bonusPts - perdus);
    bulles.push({ texte: '+' + n + ' · ' + texte, t: 1.2, bon: true });
  }
  // Particules en coordonnées d'écran : étincelles, fumée, poussière, confettis.
  function emettre(nb, x0, y0, type) {
    var couleurs = { etincelle: ['#FFD23F', '#FF9A3D', '#FFFFFF'], fumee: ['rgba(220,220,220,.5)'], poussiere: ['rgba(176,122,74,.55)'],
      confetti: ['#FFC814', '#1E5FD6', '#D92D20', '#1E7D45', '#FFFFFF', '#B07CFF'], turbo: ['#7FD8FF', '#4C8DFF'] }[type];
    for (var i = 0; i < nb && particules.length < 400; i++) {
      var a = Math.random() * Math.PI * 2, vit = type === 'etincelle' ? 120 + Math.random() * 260 : type === 'confetti' ? 40 + Math.random() * 120 : 20 + Math.random() * 60;
      particules.push({ x: x0 + (Math.random() - 0.5) * (type === 'confetti' ? W : 30), y: y0, vx: Math.cos(a) * vit, vy: type === 'confetti' ? 60 + Math.random() * 120 : -Math.abs(Math.sin(a)) * vit,
        vie: type === 'confetti' ? 2.5 + Math.random() : type === 'etincelle' ? 0.5 : 0.8, age: 0, type: type, c: couleurs[i % couleurs.length], tourne: Math.random() * 6 });
    }
  }
  function particulesAvancer(dt) {
    particules.forEach(function (p) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'etincelle') p.vy += 500 * dt;
      if (p.type === 'fumee' || p.type === 'poussiere') { p.vy -= 10 * dt; p.vx *= 0.98; }
      if (p.type === 'confetti') { p.vx *= 0.99; p.tourne += dt * 8; }
    });
    particules = particules.filter(function (p) { return p.age < p.vie; });
  }
  function particulesDessiner() {
    particules.forEach(function (p) {
      var a = 1 - p.age / p.vie;
      ctx.globalAlpha = Math.max(0, a);
      if (p.type === 'etincelle' || p.type === 'turbo') { ctx.strokeStyle = p.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); }
      else if (p.type === 'confetti') { ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.tourne); ctx.fillRect(-4, -2, 8, 4); ctx.restore(); }
      else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 8 + p.age * 30, 0, 7); ctx.fill(); }
    });
    ctx.globalAlpha = 1;
  }
  function retirer(categorie, texte) {
    var n = POINTS[categorie];
    grace = 0.6;
    chocs[categorie]++; perdus += n; points = Math.max(0, gagnes + bonusPts - perdus); flashScore = 0.8;
    bulles.push({ texte: '−' + n + ' · ' + texte, t: 1.4 });
  }

  // ---------- Commandes ----------
  var CLAVIER = { ArrowLeft: 'gauche', KeyA: 'gauche', KeyQ: 'gauche', ArrowRight: 'droite', KeyD: 'droite',
    ArrowUp: 'turbo', Space: 'turbo', KeyW: 'turbo', KeyZ: 'turbo', ArrowDown: 'frein', KeyS: 'frein' };
  function enJeu() { return etat === 'course' || etat === 'compte'; }
  document.addEventListener('keydown', function (e) {
    var c = CLAVIER[e.code]; if (!c || !enJeu()) return;
    e.preventDefault(); touches[c] = true;
  });
  document.addEventListener('keyup', function (e) { var c = CLAVIER[e.code]; if (c) touches[c] = false; });
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

  // ---------- Parcours ----------
  function segmentA(zz) { return E.segments[Math.max(0, Math.min(E.nb - 2, Math.floor(zz / SEG)))]; }
  function hauteurA(zz) {
    var i = Math.max(0, Math.min(E.nb - 2, Math.floor(zz / SEG))), p = (zz - i * SEG) / SEG;
    return E.segments[i].y + (E.segments[i + 1].y - E.segments[i].y) * p;
  }

  // ---------- Simulation ----------
  var LARGEUR = { cone: 0.35, trou: 0.7, flaque: 0.9, bosse: 99, charrette: 0.85, barriere: 1.0, etal: 1.1, bassines: 0.7,
    voiture: 0.9, ketch: 0.9, bus: 1.25, camion: 1.25, moto: 0.45, pousse: 0.7, pieton: 0.35, police: 0.9, fula: 1.25, policeArret: 0.95 };
  var PROFONDEUR = { cone: 1.2, trou: 1.4, flaque: 2, bosse: 1, charrette: 2.2, barriere: 1.2, etal: 2.2, bassines: 1.4,
    voiture: 4, ketch: 3.8, bus: 6, camion: 6.5, moto: 2, pousse: 2.4, pieton: 1, police: 4, fula: 6.5, policeArret: 4 };
  function touche(oz, ox, type) {
    return Math.abs(oz - z) < PROFONDEUR[type] && Math.abs(ox - x) * E.demi < LARGEUR[type] + DEMI_KETCH;
  }
  function secousse(fort) {
    v *= fort ? perf().robuste : 0.75 + (perf().robuste - 0.35) * 0.5; choc = fort ? 0.45 : 0.25;
    if (fort) { sonBruit(260, 'lowpass', 0.3, 0.5); sonNote(70, 0, 0.25, 0.35, 'sine'); if (!mouvementReduit) emettre(22, VX, 300, 'etincelle'); }
    else sonBruit(150, 'lowpass', 0.2, 0.45);
    if (navigator.vibrate) { try { navigator.vibrate(fort ? 60 : 30); } catch (e) {} }
  }

  function avancer(dt) {
    if (messageTemps > 0) messageTemps -= dt;
    if (flashScore > 0) flashScore -= dt;
    particulesAvancer(dt);
    if (grace > 0) grace -= dt;
    bulles.forEach(function (b) { b.t -= dt; }); bulles = bulles.filter(function (b) { return b.t > 0; });
    if (etat === 'compte') {
      compte -= dt;
      var s = Math.ceil(compte - 1);
      if (s !== derniereSeconde) { derniereSeconde = s; sonNote(s > 0 ? 440 : 880, 0, s > 0 ? 0.18 : 0.4, 0.22, 'square'); }
      if (compte <= 0) etat = 'course';
      return;
    }
    if (etat !== 'course') return;
    temps += dt;
    // Trajet pour l'anti-triche du serveur : 20 positions par seconde, comme le jeu Unreal.
    if (modeJeu === 'direct') envoyerPosition();
    while (temps >= prochainPoint && trajet.length < 36000) {
      trajet.push([Math.round(z * 100), Math.round(x * E.demi * 100), 0, 0, 0, 0]);
      prochainPoint += 0.05;
    }

    zFantome = Math.min(E.longueur + 60, zFantome + Math.min(vFantome(), 9 * temps) * dt);

    var avantTurbo = turboActif;
    turboActif = appuye('turbo') && energie > 0.02 && !appuye('frein');
    if (turboActif && !avantTurbo) sonBruit(500, 'bandpass', 0.45, 0.25, 1400);
    energie = turboActif ? Math.max(0, energie - 0.38 * dt) : Math.min(1, energie + 0.11 * dt);

    var plafond = (turboActif ? E.vTurbo : E.vMax) * perf().vitesse * (raccourci ? 0.8 : 1);
    // Frein ; à l'arrêt, en restant appuyé sur le frein, on passe en marche arrière.
    if (appuye('frein') && v <= 0.5) tempsArret += dt; else if (!appuye('frein')) tempsArret = 0;
    var avantArriere = arriere;
    arriere = appuye('frein') && tempsArret > 0.35;
    if (arriere && !avantArriere) annoncer('Marche arrière');
    if (arriere) {
      turboActif = false;
      v = Math.max(-7, v - 5 * dt);
      bipArriere -= dt; if (bipArriere <= 0) { bipArriere = 0.5; sonNote(1050, 0, 0.12, 0.08, 'sine'); }
    } else if (v < 0) {
      v = Math.min(0, v + 10 * dt);
    } else {
      var cible = appuye('frein') ? 0 : plafond;
      if (v < cible) v = Math.min(cible, v + 9 * perf().accel * (turboActif ? 1.7 : 1) * dt);
      else v = Math.max(cible, v - (appuye('frein') ? 24 : 6) * dt);
    }
    var pente = (hauteurA(z + 2) - hauteurA(z - 2)) / 4;
    if (v >= 0 && !arriere) v = Math.max(0, Math.min(E.vTurbo * perf().vitesse * 1.08, v - 9.8 * pente * 0.55 * dt));

    // Chaussée glissante : on braque moins bien et les virages poussent plus fort vers l'extérieur.
    var surGlissant = !raccourci && zoneGlissante(E, z);
    if (surGlissant && !glisse) annoncer('Chaussée glissante !');
    glisse = surGlissant;
    var adherence = surGlissant ? 0.6 : E.pluie ? 0.82 : 1;
    var dir = (appuye('droite') ? 1 : 0) - (appuye('gauche') ? 1 : 0);
    // Direction : on tourne vite et franchement, même à basse vitesse ; le volant monte en douceur.
    braquage += (dir - braquage) * Math.min(1, dt * 12);
    x += braquage * (10.5 / E.demi) * dt * (0.75 + 0.25 * Math.min(1, Math.abs(v) / E.vMax)) * adherence * perf().direction;
    if (!raccourci) x -= segmentA(z).courbe * 0.055 * (v / E.vMax) * dt * (surGlissant ? 2 : 1);

    var zone = zoneRaccourci(E, z);
    if (!raccourci && zone && z < zone.debut + 45 && x * zone.cote >= 0.88 && (zone.cote > 0 ? appuye('droite') : appuye('gauche'))) {
      raccourci = zone; annoncer('Raccourci : ' + zone.nom + ' !');
    }
    if (raccourci && z > raccourci.fin) { x = raccourci.cote * 0.8; raccourci = null; annoncer('Retour sur la route'); }
    var bordRac = 1 + 1.2 / E.demi, finRac = 1 + 5 / E.demi;
    if (raccourci) x = raccourci.cote > 0 ? Math.max(bordRac, Math.min(finRac, x)) : Math.max(-finRac, Math.min(-bordRac, x));
    else x = Math.max(-0.9, Math.min(0.9, x));

    var dz = v * dt * (raccourci ? 1.4 : 1);
    if (z + dz < 0) dz = -z;
    z += dz;
    // Points de vitesse : chaque mètre rapporte plus quand on roule vite.
    if (dz > 0) gagnes += dz * (1 + 2 * Math.min(1.4, v / (E.vMax * perf().vitesse)));
    points = Math.max(0, gagnes + bonusPts - perdus);
    decalDecor += segmentA(z).courbe * v * dt * 0.6;

    obstacles.forEach(function (o) {
      if (o.touche || grace > 0 || !touche(o.z, o.x, o.type)) return;
      o.touche = true;
      if (o.type === 'trou') { secousse(false); retirer('trou', 'nid-de-poule'); }
      else if (o.type === 'bosse') { if (v >= 22) { secousse(false); retirer('trou', 'bosse prise trop vite'); } }
      else if (o.type === 'policeArret') { secousse(true); retirer('police', 'barrage de police'); }
      else if (o.type === 'flaque') { secousse(false); x += (segmentA(z).courbe >= 0 ? -1 : 1) * 0.3; retirer('trou', 'aquaplaning'); }
      else { secousse(true); retirer('obstacle', { cone: 'cône', barriere: 'barrière', charrette: 'charrette', etal: 'étal', bassines: 'bassines' }[o.type] || 'obstacle'); }
    });

    trafic.forEach(function (t) {
      var d = t.def;
      t.z = d.z0 + d.vit * temps + t.pousse;
      var p = Math.max(0, Math.min(1, (temps - d.change) / 1.6));
      t.x = d.a + (d.b - d.a) * doux(0, 1, p);
      if (raccourci) return;
      var etaitDevant = t.devant;
      t.devant = t.z > z;
      if (etaitDevant && !t.devant && temps - (t.dernierChoc || -9) > 2 && v > d.vit + 3) {
        var ecartLat = Math.abs(t.x - x) * E.demi - LARGEUR[d.type] - DEMI_KETCH;
        if (ecartLat >= 0 && ecartLat < 0.9) { frolés++; gagner(100, 'frôlé !'); if (frolés % 3 === 1) direct('Commentateur', 'Quel frôlé ! ' + voiture.nom + ' passe au ras de la carrosserie.'); sonNote(1180, 0, 0.12, 0.1, 'sine'); }
      }
      var devant = t.z - z;
      if (devant > 0 && devant < 16 && Math.abs(t.x - x) * E.demi < 1.6 && v > d.vit + 6 && temps - t.klaxon > 3) {
        t.klaxon = temps; klaxon(d.type === 'bus' || d.type === 'camion' || d.type === 'fula');
      }
      if (grace <= 0 && temps - (t.dernierChoc || -9) > 3 && touche(t.z, t.x, d.type)) {
        t.dernierChoc = temps; t.pousse += 12; var avantChoc = v;
        secousse(true); v = Math.max(Math.min(avantChoc * 0.5, d.vit), v);
        retirer('véhicule', { pousse: 'pousse-pousse', moto: 'moto', bus: 'bus', camion: 'camion', ketch: 'taxi', voiture: 'voiture', police: 'voiture de police', fula: 'fula-fula' }[d.type]);
      }
    });

    pietons.forEach(function (p) {
      var d = p.def;
      if (!p.parti && z > p.z - d.declenche) p.parti = true;
      if (p.parti && !p.ecarte) {
        var cible = -d.cote * (1 + 1.2 / E.demi);
        p.x += (-d.cote) * (d.vit / E.demi) * dt;
        if ((cible - p.x) * -d.cote <= 0) { p.x = cible; p.ecarte = true; }
      }
      if (!p.ecarte && !raccourci && grace <= 0 && Math.abs(p.x) < 1 && touche(p.z, p.x, 'pieton')) {
        p.ecarte = true; p.x = d.cote * (1 + 1.2 / E.demi);
        v *= 0.3; choc = 0.4; klaxon(false); annoncer('Attention aux piétons !');
        retirer('piéton', 'piéton');
      }
    });
    // Police (étape 6) : les voitures de police vous prennent en chasse. Si elles vous rattrapent, -300 et gros ralentissement.
    if (E.barrageZ && prochainBarrage < E.barrageZ.length && z > E.barrageZ[prochainBarrage] - 170) {
      annoncer('Barrage de police : trouvez la voie libre !'); prochainBarrage++; klaxon(true);
    }
    police.forEach(function (pc, ip) {
      var ecartP = z - pc.z, vRef = E.vMax * 0.96 * reglageNiveau().police;
      if (pc.mode === 'bloque') {
        // La police vous dépasse, se rabat devant vous et freine.
        pc.t -= dt;
        if (pc.z - z < 22 && pc.t > 3) pc.v = Math.max(pc.v, v + 8); else pc.v += (Math.max(8, v * 0.7) - pc.v) * Math.min(1, dt * 2);
        if (pc.z - z > 8) pc.x += (x - pc.x) * Math.min(1, dt * 1.6);
        pc.z += pc.v * dt;
        if (grace <= 0 && Math.abs(pc.z - z) < 4.2 && Math.abs(pc.x - x) * E.demi < 1.75) {
          secousse(true); retirer('police', 'percuté la police'); pc.mode = 'arret';
        }
        if (pc.t <= 0) pc.mode = 'arret';
        return;
      }
      if (pc.mode === 'arret') {
        // Elle se gare sur le bord, puis reprend la poursuite une fois loin derrière.
        pc.v = Math.max(0, pc.v - 14 * dt); pc.z += pc.v * dt;
        pc.x += ((pc.x >= 0 ? 0.88 : -0.88) - pc.x) * Math.min(1, dt * 2);
        if (z - pc.z > 45) { pc.mode = 'chasse'; pc.z = z - 110; pc.v = vRef * 0.8; }
        return;
      }
      if (ecartP > 0 && ecartP < 20 && pc.blocages < 2 && temps - pc.dernier > 8 && v > 12) {
        pc.mode = 'bloque'; pc.t = 7; pc.blocages++; pc.dernier = temps;
        pc.z = z - 2; pc.x = x > 0 ? x - 0.55 : x + 0.55; pc.v = v + 9;
        annoncer('La police vous dépasse !'); klaxon(true); return;
      }
      var cibleP = ecartP > 110 ? Math.max(v + 10, vRef) : ecartP > 40 ? vRef * 1.04 : vRef;
      if (temps < 1.5 + ip) cibleP = 0;
      pc.v += Math.max(-12 * dt, Math.min(9 * dt, cibleP - pc.v));
      pc.z += pc.v * dt;
      pc.x += ((x > 0 ? 0.25 : -0.25) - pc.x) * dt;
      if (ecartP < 3.5 && grace <= 0) {
        pc.arrets++; pc.z = z - 75; pc.v = vRef * 0.6;
        secousse(true); choc = 0.5; annoncer('Arrêté par la police !'); direct('Commentateur', 'La police arrête ' + voiture.nom + ' ! Gros temps perdu.');
        retirer('police', 'contrôle de police');
      }
    });
    if (police.length) {
      var plusPres = Math.min.apply(null, police.filter(function (pc) { return pc.mode === 'chasse'; }).map(function (pc) { return z - pc.z; }).concat([999]));
      sirene -= dt;
      if (plusPres < 140 && sirene <= 0) {
        sirene = 0.42; var vol = 0.03 + 0.11 * Math.max(0, 1 - plusPres / 140);
        sonNote(Math.floor(temps / 0.42) % 2 ? 960 : 720, 0, 0.4, vol, 'triangle');
      }
    }
    // Rivaux : ils accélèrent, prennent le turbo, changent de voie pour éviter le trafic et les barrages.
    var gene = trafic.map(function (t) { return { z: t.z, x: t.x, vit: t.def.vit }; })
      .concat(obstacles.filter(function (o) { return o.type === 'policeArret'; }).map(function (o) { return { z: o.z, x: o.x, vit: 0 }; }))
      .concat(police.filter(function (pc) { return pc.mode !== 'chasse'; }).map(function (pc) { return { z: pc.z, x: pc.x, vit: pc.v }; }));
    rivaux.forEach(function (rv, i) {
      var cible = E.vMax * perf().vitesse * rv.habilete * 1.02 * reglageNiveau().rivaux;
      var avance = rv.z - z;
      if (avance > 120) cible *= 0.86; else if (avance < -70) cible *= 1.16;
      rv.turboT -= dt;
      if (rv.turboT <= 0) { rv.turboT = 7 + ((i * 3.7 + temps) % 5); rv.turboDuree = 2; }
      if (rv.turboDuree > 0) { rv.turboDuree -= dt; cible = Math.max(cible, E.vTurbo * perf().vitesse * rv.habilete * 0.94); }
      var autour = gene.concat([{ z: z, x: x, vit: v }]).concat(rivaux.filter(function (o) { return o !== rv; }).map(function (o) { return { z: o.z, x: o.x, vit: o.v }; }));
      var devant = null;
      autour.forEach(function (g) {
        var dz = g.z - rv.z;
        if (dz > 0 && dz < 30 && Math.abs(g.x - rv.cibleX) * E.demi < 1.8 && g.vit < rv.v + 1 && (!devant || dz < devant.dz)) devant = { dz: dz, vit: g.vit };
      });
      if (devant) {
        var libres = E.voies.filter(function (vx) { return !autour.some(function (g) { var dz = g.z - rv.z; return dz > -7 && dz < 32 && Math.abs(g.x - vx) * E.demi < 1.8; }); });
        if (libres.length) rv.cibleX = libres.reduce(function (a, b) { return Math.abs(b - rv.x) < Math.abs(a - rv.x) ? b : a; });
        else cible = Math.min(cible, devant.vit + (devant.dz > 12 ? 4 : 0));
      }
      rv.v += Math.max(-16 * dt, Math.min(8.5 * dt, cible - rv.v));
      if (etat === 'course' && temps < 0.25 * i) rv.v = 0;
      rv.x += (rv.cibleX - rv.x) * Math.min(1, dt * 2.4);
      rv.x = Math.max(-0.9, Math.min(0.9, rv.x));
      rv.z += rv.v * dt;
      // Contact avec vous : on se frotte, chacun perd un peu de vitesse (pas de points perdus).
      if (!raccourci && Math.abs(rv.z - z) < 4.2 && Math.abs(rv.x - x) * E.demi < 1.75 && temps - rv.contact > 0.8) {
        rv.contact = temps;
        var sens = rv.x >= x ? 1 : -1;
        rv.x += sens * 0.5 / E.demi * 2; x -= sens * 0.35 / E.demi * 2; rv.cibleX = rv.x;
        v *= 0.9; rv.v *= 0.88; choc = 0.2; sonBruit(220, 'lowpass', 0.18, 0.3);
        annoncer('Contact avec ' + rv.nom + ' !');
      }
      if (!rv.arrive && rv.z >= E.longueur) { rv.arrive = true; rv.tempsArrivee = temps; }
    });
    // Orage (étape 8) : éclairs et tonnerre, gerbes d'eau derrière les roues.
    if (E.pluie) {
      prochainEclair -= dt; if (eclair > 0) eclair = Math.max(0, eclair - dt * 2.2);
      if (prochainEclair <= 0) { prochainEclair = 7 + Math.random() * 7; eclair = 1; sonBruit(90, 'lowpass', 1.6, 0.5, 40); }
      if (!mouvementReduit && v > 15 && Math.random() < 0.5) { emettre(1, VX - 80, 372, 'fumee'); emettre(1, VX + 80, 372, 'fumee'); }
    }
    // Bonus : pièces (+50) et bidons de turbo (+30, turbo rechargé de moitié).
    bonus.forEach(function (b) {
      if (b.pris || Math.abs(b.z - z) > 2 || Math.abs(b.x - x) * E.demi > 1.3) return;
      b.pris = true;
      if (b.type === 'piece') { pieces++; gagner(50, 'pièce'); sonNote(1320, 0, 0.08, 0.12, 'square'); sonNote(1760, 0.07, 0.15, 0.12, 'square'); }
      else { energie = Math.min(1, energie + 0.5); gagner(30, 'turbo rechargé'); sonNote(660, 0, 0.1, 0.12, 'triangle'); sonNote(990, 0.08, 0.2, 0.12, 'triangle'); }
    });
    // Effets : fumée des pneus, poussière sur la terre, petites flammes du turbo.
    if (!mouvementReduit && etat === 'course') {
      var dirFx = (appuye('droite') ? 1 : 0) - (appuye('gauche') ? 1 : 0);
      if (v > 22 && ((dirFx && Math.abs(segmentA(z).courbe) > 2) || glisse || (appuye('frein') && v > 25)) && Math.random() < 0.6) { emettre(1, VX - 85, 372, 'fumee'); emettre(1, VX + 85, 372, 'fumee'); }
      if (raccourci && v > 8 && Math.random() < 0.7) emettre(1, VX + (Math.random() - 0.5) * 160, 375, 'poussiere');
      if (turboActif && Math.random() < 0.8) emettre(1, VX + (Math.random() < 0.5 ? -44 : 44), 360, 'turbo');
    }
    if (choc > 0) choc = Math.max(0, choc - dt);
    if (z >= E.longueur) terminer();
  }

  // Le fantôme s'adapte à la voiture : avec une sportive, il roule plus vite.
  // Compétition équitable : en tournoi et en affrontement, toutes les voitures ont les performances
  // du Ketch (la voiture choisie ne change que l'apparence). Seul le pilotage fait la différence.
  function competitionEquitable() { return modeJeu === 'sponsor' || modeJeu === 'international' || entreAmis(); }
  function entreAmis() { return modeJeu === 'duel' || modeJeu === 'direct'; }
  // En compétition, une voiture garde au plus 2 % de sa différence avec le Ketch
  // (ex. Turbo GT : vitesse 1,15 en entraînement, 1,02 en tournoi). Le pilotage reste décisif.
  var AVANTAGE_MAX = 0.02, perfCache = {};
  function perf() {
    if (!competitionEquitable()) return voiture;
    var id = voiture.nom;
    if (!perfCache[id]) {
      var k = VOITURES.ketch, p = {};
      ['vitesse', 'accel', 'direction', 'fantome'].forEach(function (c) {
        p[c] = k[c] * (1 + Math.max(-AVANTAGE_MAX, Math.min(AVANTAGE_MAX, voiture[c] / k[c] - 1)));
      });
      p.robuste = k.robuste + Math.max(-0.02, Math.min(0.02, voiture.robuste - k.robuste));
      perfCache[id] = p;
    }
    return perfCache[id];
  }
  function vFantome() { return E.vFantome * perf().fantome * 1.13 * reglageNiveau().fantome; } // +13 % depuis le retrait des obstacles fixes
  function tempsFantome() {
    var vf = vFantome(), tA = vf / 9, dA = 0.5 * 9 * tA * tA;
    return tA + (E.longueur - dA) / vf;
  }

  function terminer() {
    etat = 'fin';
    trajet.push([Math.round(z * 100), Math.round(x * E.demi * 100), 0, 0, 0, 0]);
    envoyerCourse(E.id, temps, trajet);
    musiqueArreter();
    var ecart = tempsFantome() - temps;
    var nbChocs = chocs.piéton + chocs.véhicule + chocs.obstacle + chocs.trou + chocs.police;
    var route = Math.round(gagnes);
    var bonusFantome = ecart > 0 ? POINTS.victoire + Math.round(ecart * POINTS.parSeconde) : 0;
    var bonusPropre = 0;
    for (var i = 0; i < POINTS.propre.length; i++) if (nbChocs <= POINTS.propre[i][0]) { bonusPropre = POINTS.propre[i][1]; break; }
    var place = 1 + rivaux.filter(function (rv) { return rv.arrive; }).length;
    var bonusPlace = PLACES[place - 1] || 0;
    var total = Math.max(0, Math.round(points) + bonusFantome + bonusPropre + bonusPlace);
    var etoiles = 1 + (ecart > 0 ? 1 : 0) + (ecart > 0 && nbChocs <= 2 ? 1 : 0);
    if (ecart > 0 && !mouvementReduit) emettre(160, VX, -10, 'confetti');
    direct('Commentateur', voiture.nom + ' termine ' + E.nom + ' en ' + chrono(temps) + ' : ' + total.toLocaleString('fr-FR') + ' points' + (place === 1 ? ', victoire !' : ', ' + rangTexte(place) + ' place.'));

    var gainG = entreAmis() ? 0 : pieces + 5 * etoiles + (defiEnCours ? 15 : 0);
    var rangDefi = defiEnCours ? enregistrerEssaiDefi(total, temps) : 0;
    ecrirePorteMonnaie(lirePorteMonnaie() + gainG);
    var avantOuvertes = ORDRE_VOITURES.filter(function (id) { return debloquee(VOITURES[id]); });
    var rec = lireRecord(E.id) || {}, nouveau = !defiEnCours && !entreAmis() && (!rec.score || total > rec.score);
    var nouveauTemps = !defiEnCours && !entreAmis() && (!rec.temps || temps < rec.temps);
    if (!defiEnCours && !entreAmis()) ecrireRecord(E.id, { score: Math.max(total, rec.score || 0), temps: Math.min(temps, rec.temps || 1e9), gagne: !!rec.gagne || ecart > 0, etoiles: Math.max(etoiles, rec.etoiles || 0) });
    [523, 659, 784, 1047].forEach(function (f, j) { sonNote(f, j * 0.12, 0.3, 0.2); });

    document.getElementById('finEtape').textContent = 'Étape ' + E.numero + ' · ' + E.nom + ' · ' + voiture.nom + ' · niveau ' + NOMS_NIVEAUX[niveauActif()] + ' · ' + chrono(temps);
    document.getElementById('finTemps').textContent = total.toLocaleString('fr-FR') + ' points';
    var finEt = document.getElementById('finEtoiles');
    if (finEt) { finEt.textContent = '\u2605'.repeat(etoiles) + '\u2606'.repeat(3 - etoiles); finEt.setAttribute('aria-label', etoiles + ' étoile' + (etoiles > 1 ? 's' : '') + ' sur 3'); }
    document.getElementById('finVerdict').textContent = (place === 1 ? 'Victoire ! ' : rangTexte(place) + ' place. ') + (ecart > 0
      ? 'Vous battez le fantôme de ' + secondes(ecart) + '.'
      : 'Le fantôme gagne de ' + secondes(-ecart) + '.');
    var lignes = [
      ['Vitesse sur la route', '+' + route.toLocaleString('fr-FR')],
      ['Pièces, bidons et frôlés (' + pieces + ' pièces, ' + frolés + ' frôlés)', bonusPts ? '+' + bonusPts.toLocaleString('fr-FR') : '0'],
      ['Place contre les rivaux : ' + rangTexte(place) + ' sur ' + (rivaux.length + 1), bonusPlace ? '+' + bonusPlace : '0'],
      ['Course contre le fantôme', bonusFantome ? '+' + bonusFantome.toLocaleString('fr-FR') : '0'],
      ['Conduite propre (' + nbChocs + (nbChocs > 1 ? ' chocs' : ' choc') + ')', bonusPropre ? '+' + bonusPropre : '0'],
      ['Chocs', perdus ? '−' + perdus.toLocaleString('fr-FR') : '0']
    ];
    var ul = document.getElementById('finPoints');
    ul.textContent = '';
    lignes.forEach(function (l) {
      var li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('b');
      a.textContent = l[0]; b.textContent = l[1]; li.appendChild(a); li.appendChild(b); ul.appendChild(li);
    });
    var debloquees = ORDRE_VOITURES.filter(function (id) { return avantOuvertes.indexOf(id) < 0 && debloquee(VOITURES[id]); })
      .map(function (id) { return VOITURES[id]; });
    document.getElementById('finDetail').textContent = '+' + gainG + ' G (porte-monnaie : ' + lirePorteMonnaie() + ' G) · ' + (defiEnCours ? 'Score du défi (hors records d\'étape)' : nouveau ? 'Nouveau meilleur score !' : 'Meilleur score : ' + (rec.score || 0).toLocaleString('fr-FR')) +
      (nouveauTemps ? ' · Nouveau meilleur temps' : '') +
      (debloquees.length ? ' · Voiture débloquée : ' + debloquees.map(function (m) { return m.nom; }).join(', ') + ' !' : '') +
      (defiEnCours ? ' · Défi du jour : ' + (rangDefi === 1 ? '1re place !' : rangDefi + 'e place') + ' · série ' + lireSerie().serie + ' j' : '');
    var bfc = document.getElementById('boutonFinClassement'); if (bfc) bfc.hidden = !defiEnCours;
    if (modeJeu !== 'entrainement') {
      var cle = cleTournoi(modeJeu), meilleur = lireTournoi(cle);
      var mieux = !meilleur || temps < meilleur.temps;
      if (mieux) { try { localStorage.setItem(cle, JSON.stringify({ temps: temps, score: total, voiture: voiture.nom })); } catch (e) {} }
      document.getElementById('finDetail').textContent += ' · ' + (modeJeu === 'sponsor' ? 'Tournoi Sponsor' : 'Tournoi international') + ' : ' +
        (mieux ? 'nouveau meilleur temps de la semaine, ' + chrono(temps) : 'meilleur temps de la semaine ' + chrono(meilleur.temps)) + (SERVEUR && session ? '' : ' (enregistré sur cet appareil dans la démo)');
    }
    majVoitures();
    if (modeJeu === 'duel' && duel) { finTourDuel(total); return; }
    if (modeJeu === 'direct' && salon) { finDirect(total); return; }
    panneauFin.hidden = false;
    majRecords();
    var bt = document.getElementById('boutonRejouer'); if (bt) bt.focus({ preventScroll: true });
  }

  // ---------- Dessin : outils ----------
  function chrono(t) {
    var m = Math.floor(t / 60), s = t - m * 60;
    return String(m).padStart(2, '0') + ':' + (s < 10 ? '0' : '') + s.toFixed(1).replace('.', ',');
  }
  function secondes(t) { return t.toFixed(1).replace('.', ',') + ' s'; }
  function rect(x0, y0, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, r || 0); else ctx.rect(x0, y0, w, h);
  }
  function bande(p1, p2, de, a, couleur) {
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.moveTo(p1.c + de * p1.w, p1.y); ctx.lineTo(p1.c + a * p1.w, p1.y);
    ctx.lineTo(p2.c + a * p2.w, p2.y); ctx.lineTo(p2.c + de * p2.w, p2.y);
    ctx.fill();
  }

  // ---------- Ciel et lointain ----------
  var TOURS_LOIN = [[10, 70, 34], [52, 40, 26], [84, 96, 40], [132, 60, 22], [160, 30, 30], [204, 84, 36], [250, 54, 24], [282, 108, 30], [322, 70, 44],
    [376, 44, 28], [410, 92, 34], [452, 62, 24], [486, 120, 32], [526, 74, 40], [574, 50, 26], [606, 98, 36], [650, 64, 30], [690, 84, 26], [724, 44, 40], [772, 112, 34], [812, 58, 30]];
  var BAS_LOIN = [[0, 30, 60], [64, 22, 70], [140, 34, 50], [196, 18, 80], [282, 28, 64], [352, 20, 74], [432, 32, 58], [496, 24, 70], [572, 30, 62], [640, 18, 80], [726, 26, 66], [798, 30, 46]];
  var NUAGES = [[90, 46, 70], [330, 30, 90], [560, 58, 60], [760, 36, 80]];
  var cielGrad = null, cielEtape = null;
  function ciel() {
    if (!cielGrad || cielEtape !== E.id) {
      cielEtape = E.id;
      cielGrad = ctx.createLinearGradient(0, 0, 0, HORIZON + 2);
      cielGrad.addColorStop(0, E.ciel[0]); cielGrad.addColorStop(0.6, E.ciel[1]); cielGrad.addColorStop(1, E.ciel[2]);
    }
    ctx.fillStyle = cielGrad; ctx.fillRect(0, 0, W, HORIZON + 2);
    var dec = decalDecor;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    NUAGES.forEach(function (n) {
      var nx = (((n[0] - dec * 0.1 + temps * 4) % (W + 200)) + W + 200) % (W + 200) - 100;
      ctx.beginPath(); ctx.ellipse(nx, n[1], n[2], n[2] * 0.22, 0, 0, 7); ctx.ellipse(nx + n[2] * 0.4, n[1] - 8, n[2] * 0.5, n[2] * 0.2, 0, 0, 7); ctx.fill();
    });
    if (E.nuit) {
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      for (var et = 0; et < 40; et++) ctx.fillRect((et * 97 + 13) % W, (et * 53) % (HORIZON - 70), 2, 2);
      ctx.fillStyle = '#F4F1DE'; ctx.beginPath(); ctx.arc(((640 - dec * 0.15) % W + W) % W, 50, 20, 0, 7); ctx.fill();
    } else if (E.ville !== 'basse') { ctx.globalAlpha = 0.85; ctx.fillStyle = '#FFB347'; ctx.beginPath(); ctx.arc(((610 - dec * 0.15) % W + W) % W, 150, 30, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    var d1 = ((dec * 0.25) % W + W) % W, d2 = ((dec * 0.5) % W + W) % W;
    for (var k = -1; k <= 1; k++) {
      var o1 = k * W - d1, o2 = k * W - d2;
      if (E.ville === 'tours') {
        TOURS_LOIN.forEach(function (t, i) {
          ctx.fillStyle = i % 3 ? '#3B4C7E' : '#465A92';
          ctx.fillRect(t[0] + o1, HORIZON - t[1], t[2], t[1] + 2);
          if (i % 4 === 0) ctx.fillRect(t[0] + o1 + t[2] / 2 - 1, HORIZON - t[1] - 14, 2, 14);
          ctx.fillStyle = 'rgba(255,214,140,.55)';
          for (var f = 8; f < t[1] - 4; f += 9) ctx.fillRect(t[0] + o1 + 4 + (f * 7) % (t[2] - 8), HORIZON - t[1] + f, 3, 3);
        });
      }
      if (E.ville === 'industrie') {
        ctx.fillStyle = '#7C8696';
        [[60, 40], [250, 55], [520, 35], [700, 48]].forEach(function (c) { ctx.fillRect(c[0] + o1, HORIZON - c[1], 10, c[1]); ctx.fillStyle = 'rgba(220,220,220,.5)'; ctx.beginPath(); ctx.arc(c[0] + o1 + 5, HORIZON - c[1] - 10, 12, 0, 7); ctx.fill(); ctx.fillStyle = '#7C8696'; });
      }
      if (E.ville === 'fleuve') {
        ctx.fillStyle = '#3D6A4A';
        [[0, 14, 200], [220, 8, 160], [420, 18, 240], [700, 10, 200]].forEach(function (c) { ctx.beginPath(); ctx.ellipse(c[0] + c[2] / 2 + o1, HORIZON, c[2] / 2, c[1], 0, Math.PI, 0); ctx.fill(); });
      }
      BAS_LOIN.forEach(function (b, i) {
        ctx.fillStyle = E.ville === 'basse' ? (i % 2 ? '#B9A58A' : '#C9B79C') : E.ville === 'industrie' ? (i % 2 ? '#8A8F99' : '#9AA0A9') : E.ville === 'fleuve' ? (i % 2 ? '#4E6E8E' : '#5A7A9A') : (i % 2 ? '#22305E' : '#28376A');
        if (E.ville === 'fleuve' && b[0] > 420) return;
        ctx.fillRect(b[0] + o2, HORIZON - b[1] * (E.ville === 'fleuve' ? 0.6 : 1), b[2], b[1] + 2);
      });
    }
    ctx.fillStyle = E.couleurs.sol[0]; ctx.fillRect(0, HORIZON, W, H - HORIZON);
    if (E.eau) { ctx.fillStyle = '#3E7FB0'; ctx.fillRect(E.eau > 0 ? VX : 0, HORIZON, W / 2, 6); }
  }

  // ---------- Route ----------
  function route() {
    var camZ = z - D_JOUEUR;
    var base = Math.max(0, Math.floor(camZ / SEG));
    var pct = (camZ - base * SEG) / SEG;
    var camY = hauteurA(z) + HAUTEUR_CAM;
    var camX = x * E.demi;
    var cx = 0, dx = -(E.segments[base].courbe * COURBE * pct);
    var basY = H, ecrans = {};
    var C = E.couleurs, bordRac = 1 + 1.2 / E.demi, finRac = 1 + 5 / E.demi, trottoir = 1 + 2.6 / E.demi;

    for (var n = 0; n < VISIBLES; n++) {
      var i = base + n;
      if (i >= E.nb - 1) break;
      var s = E.segments[i];
      var z1 = i * SEG - camZ, z2 = z1 + SEG;
      var c1x = cx, c2x = cx + dx;
      cx += dx; dx += s.courbe * COURBE;
      if (z2 < 1) continue;
      var zz1 = Math.max(1, z1);
      var k1 = F / zz1, k2 = F / z2;
      var p1 = { c: VX + (c1x - camX) * k1, y: HORIZON + (camY - s.y) * k1, w: E.demi * k1, k: k1, s: 4 / zz1 };
      var p2 = { c: VX + (c2x - camX) * k2, y: HORIZON + (camY - E.segments[i + 1].y) * k2, w: E.demi * k2, k: k2, s: 4 / z2 };
      ecrans[i] = { i: i, p: p1, clip: basY };
      if (p2.y >= basY || p2.y >= p1.y) continue;

      var pair = Math.floor(i / 2) % 2 === 0, zSeg = i * SEG;
      ctx.fillStyle = C.sol[pair ? 0 : 1]; ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);

      for (var cote = -1; cote <= 1; cote += 2) {
        if (E.eau === cote) {
          bande(p1, p2, cote * trottoir, cote * 60, pair ? '#3E7FB0' : '#3A79A8');
          if (i % 7 === 0) bande(p1, p2, cote * (trottoir + 1.5), cote * (trottoir + 2.5), 'rgba(255,255,255,.25)');
          bande(p1, p2, cote * 1.0, cote * trottoir, C.trottoir[pair ? 0 : 1]);
          bande(p1, p2, cote * (trottoir - 0.06), cote * trottoir, pair ? '#D9DDE3' : '#9AA0A9');
          continue;
        }
        var rac = zoneRaccourci(E, zSeg, cote);
        if (rac) {
          var ouvert = zSeg < rac.debut + 45;
          bande(p1, p2, cote * bordRac, cote * finRac, pair ? '#6E4529' : '#5E3B23');
          bande(p1, p2, cote * (bordRac + 0.12), cote * (bordRac + 0.16), '#4A2E1A');
          bande(p1, p2, cote * (finRac - 0.16), cote * (finRac - 0.12), '#4A2E1A');
          bande(p1, p2, cote * 1.0, cote * bordRac, ouvert ? (pair ? '#FFC814' : '#2E323C') : '#8E8A80');
          bande(p1, p2, cote * finRac, cote * (finRac + 0.35), C.trottoir[pair ? 0 : 1]);
        } else {
          bande(p1, p2, cote * 1.0, cote * trottoir, C.trottoir[pair ? 0 : 1]);
          bande(p1, p2, cote * 1.0, cote * (1 + 0.25 / E.demi), '#9A958A');
        }
      }
      var mouille = zoneGlissante(E, zSeg);
      bande(p1, p2, -1.0, 1.0, mouille ? (pair ? '#2E3A4C' : '#2A3546') : C.route[pair ? 0 : 1]);
      if (mouille && i % 3 === 0) bande(p1, p2, -0.6, 0.4, 'rgba(160,200,255,.12)');
      bande(p1, p2, -0.985, -0.96, C.bord); bande(p1, p2, 0.96, 0.985, C.bord);
      for (var l = 0; l < E.lignes.length; l++) {
        var li = E.lignes[l];
        if (li.type === 'double') { bande(p1, p2, li.x - 0.03, li.x - 0.012, '#FFC814'); bande(p1, p2, li.x + 0.012, li.x + 0.03, '#FFC814'); }
        else if (pair) bande(p1, p2, li.x - 0.012, li.x + 0.012, C.ligne);
      }
      for (var pp = 0; pp < E.passages.length; pp++) {
        var pz = E.passages[pp];
        if (zSeg >= pz - SEG && zSeg < pz) for (var q = 0; q < 10; q++) bande(p1, p2, -0.92 + q * 0.19, -0.92 + q * 0.19 + 0.1, '#F5F3EA');
      }
      if (zSeg >= E.longueur && zSeg < E.longueur + SEG) {
        for (var q2 = 0; q2 < 14; q2++) bande(p1, p2, -0.97 + q2 * 1.94 / 14, -0.97 + (q2 + 1) * 1.94 / 14, q2 % 2 ? '#111111' : '#FFFFFF');
      }
      basY = p2.y;
    }
    return { ecrans: ecrans, camZ: camZ };
  }

  // ---------- Immeubles : façades en perspective ----------
  var PALETTE = {
    verre: { mur: '#2C4E7A', face: '#3C679C', vitre: '#7FB2E5', cadre: '#1B3150' },
    verreVert: { mur: '#2B5E5A', face: '#3A7A74', vitre: '#86D0C4', cadre: '#1A3A37' },
    beton: { mur: '#B8AE9C', face: '#CFC6B4', vitre: '#2E3A4E', cadre: '#9A907E' },
    commerce: { mur: '#C9B79A', face: '#DCCDB2', vitre: '#2E3A4E', cadre: '#A8946F' },
    ocre: { mur: '#C98A4B', face: '#DDA062', vitre: '#3A2A1E', cadre: '#A56C35' },
    bleu: { mur: '#4F8FC0', face: '#6AA7D5', vitre: '#22303F', cadre: '#3A6F98' },
    rose: { mur: '#C9757E', face: '#DC8E96', vitre: '#2E2230', cadre: '#A55A62' },
    vert: { mur: '#5F9A5A', face: '#77B171', vitre: '#22301F', cadre: '#477843' },
    creme: { mur: '#D8C9A6', face: '#E8DCBE', vitre: '#2E3A4E', cadre: '#B5A47F' },
    entrepot: { mur: '#8E949E', face: '#A3A9B3', vitre: '#5A616C', cadre: '#6E747E' },
    tole: { mur: '#9A6A4A', face: '#B07E5C', vitre: '#4A3A30', cadre: '#7A5038' }
  };
  function morceauMur(b, eA, eB) {
    var pa = eA.p, pb = eB.p, pal = PALETTE[b.style];
    var xa = pa.c + b.cote * b.x * pa.w, xb = pb.c + b.cote * b.x * pb.w;
    var ha = b.haut * pa.k, hb = b.haut * pb.k;
    ctx.fillStyle = pal.mur;
    ctx.beginPath(); ctx.moveTo(xa, pa.y); ctx.lineTo(xb, pb.y); ctx.lineTo(xb, pb.y - hb); ctx.lineTo(xa, pa.y - ha); ctx.fill();
    if (Math.abs(xa - xb) < 4) return;
    var industriel = b.style === 'entrepot' || b.style === 'tole';
    if (industriel) {
      ctx.fillStyle = pal.cadre;
      for (var r = 1; r < 4; r++) { var tt = r / 4; ctx.fillRect(xa + (xb - xa) * tt, pa.y + (pb.y - pa.y) * tt - b.haut * (pa.k + (pb.k - pa.k) * tt), Math.max(1, 0.08 * pa.k), b.haut * (pa.k + (pb.k - pa.k) * tt)); }
      return;
    }
    var etages = Math.floor(b.haut / 3.2), verre = b.style.indexOf('verre') === 0;
    ctx.fillStyle = pal.vitre;
    var t1 = 0.15, t2 = 0.85;
    var ax = xa + (xb - xa) * t1, ay = pa.y + (pb.y - pa.y) * t1, ak = pa.k + (pb.k - pa.k) * t1;
    var bx = xa + (xb - xa) * t2, by = pa.y + (pb.y - pa.y) * t2, bk = pa.k + (pb.k - pa.k) * t2;
    for (var f = 0; f < etages; f++) {
      if ((b.style === 'commerce' || b.enseigne) && f === 0) continue;
      var h1 = f * 3.2 + (verre ? 0.3 : 1.0), h2 = h1 + (verre ? 2.7 : 1.5);
      ctx.beginPath(); ctx.moveTo(ax, ay - h1 * ak); ctx.lineTo(bx, by - h1 * bk); ctx.lineTo(bx, by - h2 * bk); ctx.lineTo(ax, ay - h2 * ak); ctx.fill();
    }
    if (b.style === 'commerce') {
      ctx.fillStyle = '#B42318';
      ctx.beginPath(); ctx.moveTo(xa, pa.y - 3.2 * pa.k); ctx.lineTo(xb, pb.y - 3.2 * pb.k); ctx.lineTo(xb, pb.y - 2.4 * pb.k); ctx.lineTo(xa, pa.y - 2.4 * pa.k); ctx.fill();
    }
  }
  function faceImmeuble(b, e) {
    var p = e.p, pal = PALETTE[b.style];
    var x1 = p.c + b.cote * b.x * p.w, x2 = p.c + b.cote * (b.x + b.prof) * p.w;
    var gauche = Math.min(x1, x2), larg = Math.abs(x2 - x1), haut = b.haut * p.k;
    if (larg < 1) return;
    ctx.fillStyle = pal.face; ctx.fillRect(gauche, p.y - haut, larg, haut);
    if (b.style === 'entrepot' || b.style === 'tole') {
      ctx.fillStyle = pal.vitre; ctx.fillRect(gauche + larg * 0.25, p.y - haut * 0.6, larg * 0.5, haut * 0.6);
      ctx.fillStyle = pal.cadre; for (var r = 0; r < 6; r++) ctx.fillRect(gauche + larg * 0.25, p.y - haut * 0.6 + r * haut * 0.1, larg * 0.5, Math.max(1, haut * 0.015));
      ctx.fillRect(gauche, p.y - haut, larg, Math.max(1, 0.4 * p.k));
      return;
    }
    var etages = Math.floor(b.haut / 3.2), colonnes = Math.max(2, Math.round(b.prof * E.demi / 3));
    if (larg > 10) {
      var verre = b.style.indexOf('verre') === 0, cw = larg / colonnes;
      ctx.fillStyle = pal.vitre;
      for (var f = 0; f < etages; f++) {
        if ((b.style === 'commerce' || b.enseigne) && f === 0) continue;
        var h1 = (f * 3.2 + (verre ? 0.3 : 1.0)) * p.k, h2 = (verre ? 2.7 : 1.5) * p.k;
        for (var c = 0; c < colonnes; c++) ctx.fillRect(gauche + c * cw + cw * (verre ? 0.06 : 0.2), p.y - h1 - h2, cw * (verre ? 0.88 : 0.6), h2);
      }
      if (verre && larg > 20) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(gauche + larg * 0.1, p.y - haut, larg * 0.18, haut); }
    }
    ctx.fillStyle = pal.cadre; ctx.fillRect(gauche, p.y - haut, larg, Math.max(1, 0.5 * p.k));
    if (b.style === 'commerce' || b.enseigne) {
      var hy = p.y - 3.2 * p.k;
      ctx.fillStyle = b.enseigne ? '#FFC814' : '#B42318'; ctx.fillRect(gauche + larg * 0.05, hy, larg * 0.9, 0.8 * p.k);
      if (b.enseigne && larg > 50) {
        ctx.fillStyle = '#0E1630'; ctx.font = '800 ' + Math.max(7, Math.min(22, 0.55 * p.k)) + 'px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(b.enseigne, gauche + larg / 2, hy + 0.62 * p.k);
      }
      ctx.fillStyle = '#2E3A4E'; ctx.fillRect(gauche + larg * 0.15, p.y - 2.2 * p.k, larg * 0.7, 2.2 * p.k);
    }
  }

  // ---------- Sprites (tournés vers la caméra, échelle s = 1 à 4 m) ----------
  var HABITS = ['#D92D20', '#1E5FD6', '#7A3E6A', '#1E7D45', '#B54708', '#2A6B9B'];
  // Décor modélisé en 3D (Hyper3D) : dessiné à la place du dessin d'origine quand l'image existe.
  function spriteDecor(id, sx, sy, s, taille, parLargeur, retourne) {
    var vues = SPRITES['decor-' + id];
    if (!vues) return false;
    var img = vues[0], w, h;
    if (parLargeur) { w = taille * s; h = w * img.height / img.width; } else { h = taille * s; w = h * img.width / img.height; }
    if (retourne) { ctx.save(); ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.drawImage(img, -w / 2, sy - h, w, h); ctx.restore(); }
    else ctx.drawImage(img, sx - w / 2, sy - h, w, h);
    return true;
  }
  function palmier(sx, sy, s) {
    if (spriteDecor('palmier', sx, sy, s, 440)) return;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.fillStyle = '#5A3B22'; ctx.fillRect(-6, -330, 12, 330);
    ctx.strokeStyle = '#2F7D4A'; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -326); ctx.quadraticCurveTo(-50, -362, -90, -336);
    ctx.moveTo(0, -326); ctx.quadraticCurveTo(-30, -390, -70, -400);
    ctx.moveTo(0, -326); ctx.quadraticCurveTo(40, -390, 84, -390);
    ctx.moveTo(0, -326); ctx.quadraticCurveTo(56, -344, 96, -306);
    ctx.stroke(); ctx.restore();
  }
  function lampadaire(sx, sy, s, cote) {
    lumiere(sx - cote * 110 * s, sy - 600 * s, 260 * s, '255,214,140');
    if (spriteDecor('lampadaire', sx + (cote > 0 ? -1 : 1) * 70 * s, sy, s, 640, false, cote > 0)) return;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.fillStyle = '#4A505C'; ctx.fillRect(-4, -620, 8, 620);
    ctx.fillRect(Math.min(0, -cote * 90), -620, 90, 7);
    ctx.fillStyle = '#E8EDF5'; rect(-cote * 110 - 20, -622, 40, 12, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,.5)'; ctx.beginPath(); ctx.ellipse(-cote * 110, -606, 26, 8, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  function passant(sx, sy, s, variante, enMouvement) {
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    var pas = enMouvement ? Math.sin(temps * 10) * 10 : 0;
    ctx.strokeStyle = '#2B2B33'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, -80); ctx.lineTo(-8 - pas, -4); ctx.moveTo(6, -80); ctx.lineTo(8 + pas, -4); ctx.stroke();
    ctx.fillStyle = HABITS[variante % HABITS.length]; rect(-22, -160, 44, 86, 14); ctx.fill();
    ctx.fillStyle = '#4A2E1F'; ctx.beginPath(); ctx.arc(0, -180, 17, 0, 7); ctx.fill();
    if (variante % 2 === 0) { ctx.fillStyle = HABITS[(variante + 2) % HABITS.length]; rect(-20, -204, 40, 14, 7); ctx.fill(); }
    ctx.restore();
  }
  // Affiche d'un sponsor dans la zone (x, y, l, h) en unités du panneau.
  // Écran LED numérique : le sponsor change toutes les 6 s (glissement), reflet lumineux qui balaie l'écran.
  var horlogePub = 0;
  function sponsorAffiche(sp) {
    var i = PUBLICITES.indexOf(sp), t = horlogePub / 6;
    return { sp: PUBLICITES[(i + Math.floor(t)) % PUBLICITES.length], suivant: PUBLICITES[(i + Math.floor(t) + 1) % PUBLICITES.length], f: t % 1 };
  }
  function contenuAffiche(sp, x0, y0, l, h) {
    var img = AFFICHES[sp.id];
    if (img) { ctx.drawImage(img, x0, y0, l, h); return; }
    var g = ctx.createLinearGradient(x0, y0, x0 + l, y0 + h); g.addColorStop(0, sp.fond[0]); g.addColorStop(1, sp.fond[1]);
    ctx.fillStyle = g; ctx.fillRect(x0, y0, l, h);
    ctx.fillStyle = sp.accent; ctx.globalAlpha = 0.9; ctx.fillRect(x0, y0, l * 0.035, h); ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.fillStyle = sp.texte;
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = h * 0.04;
    ctx.font = '900 ' + Math.round(h * (sp.ligne ? 0.36 : 0.44)) + 'px "Bricolage Grotesque", Inter, sans-serif';
    ctx.fillText(sp.nom, x0 + l / 2, y0 + h * (sp.ligne ? 0.52 : 0.64), l * 0.88);
    ctx.shadowBlur = 0;
    if (sp.ligne) {
      ctx.fillStyle = sp.accent; ctx.font = '800 ' + Math.round(h * 0.15) + 'px Inter, sans-serif';
      ctx.fillText(sp.ligne, x0 + l / 2, y0 + h * 0.8, l * 0.86);
    }
  }
  function affiche(sp0, x0, y0, l, h) {
    var a = sponsorAffiche(sp0);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, l, h); ctx.clip();
    // Les 0,5 dernières secondes : l'affiche suivante arrive par la droite.
    var glisse = mouvementReduit ? 0 : Math.max(0, (a.f - 0.92) / 0.08);
    contenuAffiche(a.sp, x0 - glisse * l, y0, l, h);
    if (glisse > 0) contenuAffiche(a.suivant, x0 + l - glisse * l, y0, l, h);
    if (!mouvementReduit) {
      var bx = x0 - l * 0.4 + ((horlogePub * 0.35) % 1.8) * l;
      var reflet = ctx.createLinearGradient(bx, y0, bx + l * 0.3, y0 + h);
      reflet.addColorStop(0, 'rgba(255,255,255,0)'); reflet.addColorStop(0.5, 'rgba(255,255,255,.22)'); reflet.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = reflet; ctx.fillRect(x0, y0, l, h);
    }
    // Trame de pixels LED, très légère.
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    var pas = Math.max(3, h / 40);
    for (var ly = y0; ly < y0 + h; ly += pas) ctx.fillRect(x0, ly, l, pas * 0.25);
    ctx.restore();
  }
  function pub(sx, sy, s, sp) {
    lumiere(sx, sy - 470 * s, 260 * s, '255,236,190');
    var modele = SPRITES['decor-panneau'];
    if (modele) {
      // Panneau 3D (Hyper3D) avec l'affiche posée sur sa face blanche.
      var img = modele[0], h = 500 * s, w = h * img.width / img.height, z = ZONE_PANNEAU;
      ctx.drawImage(img, sx - w / 2, sy - h, w, h);
      ctx.save(); ctx.translate(sx - w / 2 + z[0] * w, sy - h + z[1] * h); ctx.scale(z[2] * w / 400, z[3] * h / 200);
      affiche(sp, 0, 0, 400, 200); ctx.restore();
      return;
    }
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.fillStyle = '#3A3F4A'; ctx.fillRect(-20, -350, 40, 350);
    ctx.fillStyle = '#11141B'; rect(-256, -606, 512, 272, 14); ctx.fill();
    affiche(sp, -244, -594, 488, 248);
    ctx.fillStyle = 'rgba(127,216,255,.55)'; ctx.fillRect(-244, -340, 488, 3);
    ctx.restore();
  }
  function abribus(sx, sy, s) {
    if (spriteDecor('abribus', sx, sy, s, 360)) return;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(160,210,240,.45)'; ctx.fillRect(-160, -250, 320, 230);
    ctx.fillStyle = '#4A505C'; ctx.fillRect(-170, -270, 340, 20); ctx.fillRect(-170, -250, 10, 250); ctx.fillRect(160, -250, 10, 250);
    ctx.fillStyle = '#1E7D45'; rect(-60, -330, 120, 50, 8); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 26px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BUS', 0, -296);
    ctx.restore();
    passant(sx - 60 * s, sy, s, 3, false); passant(sx + 50 * s, sy, s, 0, false);
  }
  function monument(sx, sy, s) {
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.fillStyle = '#4F8F4A'; ctx.beginPath(); ctx.ellipse(0, -10, 520, 60, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#D8D2C4'; ctx.fillRect(-160, -90, 320, 80);
    ctx.fillStyle = '#ECE7DB'; ctx.beginPath(); ctx.moveTo(-60, -90); ctx.lineTo(60, -90); ctx.lineTo(24, -1000); ctx.lineTo(0, -1060); ctx.lineTo(-24, -1000); ctx.fill();
    ctx.fillStyle = '#D9A441'; ctx.beginPath(); ctx.arc(0, -1100, 40, 0, 7); ctx.fill();
    [-1, 1].forEach(function (c) {
      ctx.fillStyle = '#6E7480'; ctx.fillRect(c * 260 - 4, -520, 8, 460);
      ctx.fillStyle = '#1E5FD6'; ctx.fillRect(c * 260 + 4, -520, 120, 80);
      ctx.fillStyle = '#FFC814'; ctx.beginPath(); ctx.moveTo(c * 260 + 4, -440); ctx.lineTo(c * 260 + 124, -520); ctx.lineTo(c * 260 + 124, -500); ctx.lineTo(c * 260 + 24, -440); ctx.fill();
      ctx.fillStyle = '#D92D20'; ctx.beginPath(); ctx.moveTo(c * 260 + 14, -440); ctx.lineTo(c * 260 + 124, -512); ctx.lineTo(c * 260 + 124, -506); ctx.lineTo(c * 260 + 20, -440); ctx.fill();
    });
    ctx.restore();
  }
  function conteneur(sx, sy, s, v2) {
    var cols = ['#B42318', '#1E5FD6', '#1E7D45', '#B54708'];
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.fillStyle = cols[v2 % 4]; ctx.fillRect(-300, -260, 600, 260);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; for (var i = -280; i < 300; i += 40) ctx.fillRect(i, -250, 10, 240);
    if (v2 % 2) { ctx.fillStyle = cols[(v2 + 1) % 4]; ctx.fillRect(-260, -520, 600, 260); ctx.fillStyle = 'rgba(0,0,0,.18)'; for (var j = -240; j < 340; j += 40) ctx.fillRect(j, -510, 10, 240); }
    ctx.restore();
  }
  function pylone(sx, sy, s) {
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.strokeStyle = '#6E7480'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-90, 0); ctx.lineTo(-20, -1100); ctx.lineTo(20, -1100); ctx.lineTo(90, 0);
    for (var y = -100; y > -1100; y -= 140) { var w = 90 - (-y) * 70 / 1100; ctx.moveTo(-w, y); ctx.lineTo(w, y - 140); ctx.moveTo(w, y); ctx.lineTo(-w, y - 140); }
    ctx.moveTo(-220, -950); ctx.lineTo(220, -950); ctx.moveTo(-160, -800); ctx.lineTo(160, -800);
    ctx.stroke(); ctx.restore();
  }
  function pirogue(sx, sy, s, v2) {
    if (spriteDecor('pirogue', sx, sy + 10 * s, s, 560, true, v2 % 2 === 1)) return;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.fillStyle = ['#7A4A2A', '#5A3B22', '#8A5A2B'][v2 % 3];
    ctx.beginPath(); ctx.moveTo(-260, -40); ctx.quadraticCurveTo(0, 30, 260, -40); ctx.lineTo(220, -10); ctx.quadraticCurveTo(0, 40, -220, -10); ctx.fill();
    passant(-40, -20, 1, v2 + 1, false);
    ctx.strokeStyle = '#3A2A1E'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-10, -120); ctx.lineTo(80, 20); ctx.stroke();
    ctx.restore();
  }
  function etalDecor(sx, sy, s, variante) {
    if (spriteDecor('etal', sx, sy, s, 320, false, variante % 2 === 1)) return;
    var toiles = ['#D92D20', '#FFC814', '#1E5FD6', '#1E7D45', '#F08A3C'];
    var biens = [['#D92D20', '#E5322D'], ['#FFC814', '#E8B100'], ['#7A3E6A', '#1E5FD6'], ['#1E7D45', '#5F9A5A'], ['#F08A3C', '#C2410C']];
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.fillStyle = '#5A3B22'; ctx.fillRect(-120, -100, 10, 100); ctx.fillRect(110, -100, 10, 100); ctx.fillRect(-4, -260, 8, 160);
    ctx.fillStyle = '#8A5A2B'; ctx.fillRect(-130, -110, 260, 22);
    var bi = biens[variante % biens.length];
    for (var i = 0; i < 6; i++) { ctx.fillStyle = bi[i % 2]; ctx.beginPath(); ctx.arc(-100 + i * 40, -110, 20, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = toiles[variante % toiles.length];
    ctx.beginPath(); ctx.moveTo(-170, -230); ctx.lineTo(0, -290); ctx.lineTo(170, -230); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(-60, -251); ctx.lineTo(0, -290); ctx.lineTo(60, -251); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function fanions(e) {
    var p = e.p, gx = p.c - 1.25 * p.w, dx2 = p.c + 1.25 * p.w, hy = p.y - 7 * p.k, creux = 0.8 * p.k;
    if (dx2 - gx < 20) return;
    ctx.strokeStyle = '#3A2A1E'; ctx.lineWidth = Math.max(1, 0.05 * p.k);
    ctx.beginPath(); ctx.moveTo(gx, hy); ctx.quadraticCurveTo(p.c, hy + 2 * creux, dx2, hy); ctx.stroke();
    var couleurs = ['#D92D20', '#FFC814', '#1E5FD6', '#1E7D45'];
    for (var i = 1; i < 14; i++) {
      var t = i / 14, fx = gx + (dx2 - gx) * t, fy = hy + 4 * creux * t * (1 - t);
      ctx.fillStyle = couleurs[i % 4];
      ctx.beginPath(); ctx.moveTo(fx - 0.25 * p.k, fy); ctx.lineTo(fx + 0.25 * p.k, fy); ctx.lineTo(fx, fy + 0.5 * p.k); ctx.fill();
    }
  }
  function panneau(sx, sy, s, texte, couleur, fleche) {
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.fillStyle = '#6E7480'; ctx.fillRect(-5, -150, 10, 150);
    ctx.fillStyle = couleur; rect(-110, -200, 220, 58, 10); ctx.fill();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4; rect(-110, -200, 220, 58, 10); ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 22px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(texte, fleche ? -12 : 0, -163);
    if (fleche) { ctx.beginPath(); ctx.moveTo(70 * fleche, -184); ctx.lineTo(92 * fleche, -171); ctx.lineTo(70 * fleche, -158); ctx.fill(); }
    ctx.restore();
  }
  function obstacle(o, sx, sy, s) {
    if (o.type === 'policeArret') { vehicule({ def: { type: 'police', n: 1, couleur: '#FFFFFF' } }, sx, sy, s); return; }
    if (o.type === 'etal') { ctx.save(); if (o.touche) ctx.globalAlpha = 0.35; etalDecor(sx, sy, s, 1); ctx.restore(); return; }
    if (o.type === 'bosse') return;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    if (o.touche) ctx.globalAlpha = 0.35;
    if (o.type === 'cone') {
      ctx.fillStyle = '#C2410C'; ctx.fillRect(-30, -6, 60, 6);
      ctx.fillStyle = '#FF7A1A'; ctx.beginPath(); ctx.moveTo(-24, -6); ctx.lineTo(24, -6); ctx.lineTo(7, -74); ctx.lineTo(-7, -74); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-15, -42, 30, 9);
    } else if (o.type === 'barriere') {
      for (var b = -1; b <= 1; b += 2) { ctx.fillStyle = '#4A505C'; ctx.fillRect(b * 90 - 4, -90, 8, 90); }
      for (var i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#FFFFFF' : '#D92D20'; ctx.fillRect(-110 + i * 37, -96, 37, 26); }
      ctx.fillStyle = '#FFC814'; ctx.beginPath(); ctx.arc(-100, -106, 8, 0, 7); ctx.arc(100, -106, 8, 0, 7); ctx.fill();
    } else if (o.type === 'trou') {
      ctx.fillStyle = '#3A2A1E'; ctx.beginPath(); ctx.ellipse(0, -6, 70, 16, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(127,200,255,.55)'; ctx.beginPath(); ctx.ellipse(-6, -7, 46, 9, 0, 0, 7); ctx.fill();
    } else if (o.type === 'flaque') {
      ctx.fillStyle = 'rgba(150,200,255,.55)'; ctx.beginPath(); ctx.ellipse(0, -4, 110, 18, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(-30, -6, 40, 4, 0, 0, 7); ctx.fill();
    } else if (o.type === 'bassines') {
      [-50, 10, 60].forEach(function (bx, j) {
        ctx.fillStyle = ['#1E5FD6', '#D92D20', '#1E7D45'][j]; ctx.beginPath(); ctx.ellipse(bx, -24, 34, 24, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = ['#FFC814', '#F08A3C', '#E5322D'][j]; ctx.beginPath(); ctx.arc(bx, -46, 20, Math.PI, 0); ctx.fill();
      });
    } else if (o.type === 'charrette') {
      ctx.strokeStyle = '#5A3B22'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(60, -50); ctx.lineTo(110, -30); ctx.stroke();
      ctx.fillStyle = '#8A5A2B'; rect(-64, -76, 128, 50, 4); ctx.fill();
      ctx.fillStyle = '#B07A44'; rect(-72, -86, 144, 14, 4); ctx.fill();
      ctx.fillStyle = '#2A6B9B'; rect(-50, -110, 40, 26, 3); ctx.fill();
      ctx.fillStyle = '#D9A441'; rect(0, -104, 46, 20, 3); ctx.fill();
      ctx.fillStyle = '#2A2A2A'; ctx.beginPath(); ctx.arc(-38, -18, 18, 0, 7); ctx.arc(38, -18, 18, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  function bosse(e) {
    var p = e.p;
    for (var i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#FFC814' : '#111111';
      ctx.fillRect(p.c - p.w * 0.97 + i * p.w * 1.94 / 8, p.y - Math.max(1.5, 0.12 * p.k), p.w * 1.94 / 8 + 0.5, Math.max(1.5, 0.12 * p.k));
    }
  }
  // De nuit, chaque source de lumière est notée ici puis redessinée par-dessus l'obscurité.
  function lumiere(lx, ly, rayon, couleur) { if (E.nuit) lumieres.push({ x: lx, y: ly, r: rayon, c: couleur }); }
  function vehicule(t, sx, sy, s) {
    var d = t.def, type = d.type;
    var demiL = type === 'moto' ? 0 : (type === 'bus' || type === 'camion' || type === 'fula') ? 100 : 80;
    if (type === 'moto') lumiere(sx, sy - 68 * s, 60 * s, '255,60,48');
    else if (type !== 'pousse') { lumiere(sx - demiL * s, sy - 61 * s, 70 * s, '255,60,48'); lumiere(sx + demiL * s, sy - 61 * s, 70 * s, '255,60,48'); }
    if (type === 'police') lumiere(sx, sy - 215 * s, 140 * s, Math.floor(temps * 6) % 2 ? '60,120,255' : '255,50,50');
    if (type === 'ketch') { if (!spriteVoiture('ketch', sx, sy, s * 0.92, 0, false)) ketch(sx, sy, s * 0.92, false, 0, true); return; }
    var largeurs = { voiture: 210, bus: 260, camion: 260, fula: 260, moto: 70, police: 210 };
    if (largeurs[type] && spriteVoiture('trafic-' + type, sx, sy, s, 0, false, largeurs[type])) {
      if (type === 'police') { // gyrophares qui clignotent par-dessus le modèle 3D
        var bl = Math.floor(temps * 6) % 2;
        ctx.save(); ctx.globalAlpha = 0.85;
        ctx.fillStyle = bl ? '#3B82F6' : '#EF4444'; ctx.beginPath(); ctx.arc(sx - 30 * s, sy - 205 * s, 16 * s, 0, 7); ctx.fill();
        ctx.fillStyle = bl ? '#EF4444' : '#3B82F6'; ctx.beginPath(); ctx.arc(sx + 30 * s, sy - 205 * s, 16 * s, 0, 7); ctx.fill();
        ctx.restore();
      }
      return;
    }
    if (type === 'pousse') {
      ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
      ctx.fillStyle = '#8A5A2B'; rect(-80, -80, 160, 50, 4); ctx.fill();
      ctx.fillStyle = HABITS[d.n % HABITS.length]; rect(-70, -130, 140, 52, 10); ctx.fill();
      ctx.fillStyle = '#2A2A2A'; ctx.beginPath(); ctx.arc(-56, -22, 22, 0, 7); ctx.arc(56, -22, 22, 0, 7); ctx.fill();
      ctx.restore(); passant(sx, sy - 10 * s, s, d.n, true); return;
    }
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s);
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 2, type === 'moto' ? 50 : 125, 12, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    if (type === 'fula') {
      // Fula-fula : vieux camion transformé en bus, chargé jusqu'au toit.
      ctx.fillStyle = '#151515'; rect(-115, -40, 44, 40, 6); ctx.fill(); rect(71, -40, 44, 40, 6); ctx.fill();
      ctx.fillStyle = '#1E5FD6'; rect(-125, -170, 250, 146, 10); ctx.fill();
      ctx.fillStyle = '#FFC814'; rect(-125, -300, 250, 136, 10); ctx.fill();
      ctx.fillStyle = '#1C2433'; rect(-105, -280, 210, 92, 6); ctx.fill();
      ctx.fillStyle = HABITS[d.n % HABITS.length]; for (var tp = 0; tp < 5; tp++) { ctx.beginPath(); ctx.arc(-80 + tp * 40, -214, 15, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#4A2E1F'; for (tp = 0; tp < 5; tp++) { ctx.beginPath(); ctx.arc(-80 + tp * 40, -240, 12, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#8A5A2B'; rect(-100, -340, 80, 42, 6); ctx.fill(); ctx.fillStyle = '#B42318'; rect(-10, -334, 60, 36, 6); ctx.fill(); ctx.fillStyle = '#1E7D45'; rect(56, -330, 44, 32, 6); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = '800 22px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('KIN EXPRESS', 0, -128);
      ctx.fillStyle = '#FF3B30'; rect(-117, -70, 34, 18, 5); ctx.fill(); rect(83, -70, 34, 18, 5); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; rect(-30, -62, 60, 20, 3); ctx.fill();
      ctx.fillStyle = '#2A2A2A'; rect(-121, -36, 242, 12, 6); ctx.fill();
      ctx.restore(); return;
    }
    if (type === 'police') {
      ctx.fillStyle = '#151515'; rect(-90, -40, 40, 40, 6); ctx.fill(); rect(50, -40, 40, 40, 6); ctx.fill();
      ctx.fillStyle = '#F2F4F7'; rect(-100, -150, 200, 126, 26); ctx.fill();
      ctx.fillStyle = '#F2F4F7'; ctx.beginPath(); ctx.moveTo(-70, -146); ctx.lineTo(-52, -200); ctx.lineTo(52, -200); ctx.lineTo(70, -146); ctx.fill();
      ctx.fillStyle = '#1C2433'; ctx.beginPath(); ctx.moveTo(-58, -150); ctx.lineTo(-44, -190); ctx.lineTo(44, -190); ctx.lineTo(58, -150); ctx.fill();
      ctx.fillStyle = '#1E3A8A'; ctx.fillRect(-100, -112, 200, 18);
      ctx.fillStyle = '#FFFFFF'; ctx.font = '800 15px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('POLICE', 0, -98);
      var bleu = Math.floor(temps * 6) % 2;
      ctx.fillStyle = bleu ? '#3B82F6' : '#1E3A8A'; rect(-44, -214, 42, 14, 4); ctx.fill();
      ctx.fillStyle = bleu ? '#7F1D1D' : '#EF4444'; rect(2, -214, 42, 14, 4); ctx.fill();
      ctx.fillStyle = '#FF3B30'; rect(-92, -70, 34, 18, 5); ctx.fill(); rect(58, -70, 34, 18, 5); ctx.fill();
      ctx.fillStyle = '#2A2A2A'; rect(-96, -36, 192, 12, 6); ctx.fill();
      ctx.restore(); return;
    }
    if (type === 'moto') {
      ctx.fillStyle = '#1A1A1A'; rect(-12, -60, 24, 60, 8); ctx.fill();
      ctx.fillStyle = '#B42318'; rect(-30, -96, 60, 40, 10); ctx.fill();
      ctx.fillStyle = d.couleur; rect(-24, -160, 48, 66, 14); ctx.fill();
      ctx.fillStyle = '#FFC814'; ctx.beginPath(); ctx.arc(0, -178, 20, 0, 7); ctx.fill();
      ctx.fillStyle = '#FF3B30'; ctx.fillRect(-8, -72, 16, 8);
    } else {
      var larg = type === 'bus' || type === 'camion' ? 250 : 200, haut = type === 'bus' ? 290 : type === 'camion' ? 320 : 150;
      ctx.fillStyle = '#151515'; rect(-larg / 2 + 10, -40, 40, 40, 6); ctx.fill(); rect(larg / 2 - 50, -40, 40, 40, 6); ctx.fill();
      ctx.fillStyle = type === 'camion' ? '#E8E2D0' : d.couleur; rect(-larg / 2, -haut, larg, haut - 24, type === 'voiture' ? 26 : 12); ctx.fill();
      if (type === 'voiture') {
        ctx.fillStyle = d.couleur; ctx.beginPath(); ctx.moveTo(-70, -146); ctx.lineTo(-52, -200); ctx.lineTo(52, -200); ctx.lineTo(70, -146); ctx.fill();
        ctx.fillStyle = '#1C2433'; ctx.beginPath(); ctx.moveTo(-58, -150); ctx.lineTo(-44, -190); ctx.lineTo(44, -190); ctx.lineTo(58, -150); ctx.fill();
      } else if (type === 'bus') {
        ctx.fillStyle = '#1C2433'; rect(-larg / 2 + 16, -haut + 20, larg - 32, 90, 8); ctx.fill();
        ctx.fillStyle = '#FFC814'; ctx.fillRect(-larg / 2, -120, larg, 14);
        ctx.fillStyle = '#FFFFFF'; ctx.font = '800 22px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BUS URBAIN', 0, -140);
      } else {
        ctx.fillStyle = '#B9B2A6'; for (var r = 1; r < 6; r++) ctx.fillRect(-larg / 2 + r * larg / 6, -haut + 10, 3, haut - 50);
        ctx.fillStyle = ['#1E5FD6', '#B42318', '#1E7D45'][d.n % 3]; ctx.fillRect(-larg / 2, -haut + 20, larg, 26);
      }
      ctx.fillStyle = '#FF3B30'; rect(-larg / 2 + 8, -70, 34, 18, 5); ctx.fill(); rect(larg / 2 - 42, -70, 34, 18, 5); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; rect(-30, -62, 60, 20, 3); ctx.fill();
      ctx.fillStyle = '#2A2A2A'; rect(-larg / 2 + 4, -36, larg - 8, 12, 6); ctx.fill();
    }
    ctx.restore();
  }
  function archePub(e, sy, s, sp) {
    var p = e.p, c = p.c, w = p.w, haut = 380 * s, bh = Math.max(4, 95 * s);
    lumiere(c, sy - haut + bh / 2, w * 0.9, '255,236,190');
    ctx.save();
    ctx.fillStyle = '#5A606C';
    ctx.fillRect(c - w * 1.04 - 7 * s, sy - haut, 14 * s, haut); ctx.fillRect(c + w * 1.04 - 7 * s, sy - haut, 14 * s, haut);
    ctx.fillStyle = '#11141B'; ctx.fillRect(c - w * 1.06, sy - haut - 8 * s, w * 2.12, bh + 16 * s);
    ctx.translate(c - w * 0.99, sy - haut); ctx.scale(w * 1.98 / 800, bh / 100);
    affiche(sp, 0, 0, 800, 100);
    ctx.restore();
  }
  function arche(e, sy, s) {
    var p = e.p, c = p.c, w = p.w;
    ctx.save();
    ctx.fillStyle = '#6E7480';
    ctx.fillRect(c - w * 1.05 - 6 * s, sy - 330 * s, 12 * s, 330 * s);
    ctx.fillRect(c + w * 1.05 - 6 * s, sy - 330 * s, 12 * s, 330 * s);
    var h = 50 * s, top = sy - 330 * s, n = 18, pas = (w * 2.1) / n;
    for (var i = 0; i < n; i++) for (var j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111111' : '#FFFFFF';
      ctx.fillRect(c - w * 1.05 + i * pas, top + j * h / 2, pas + 0.5, h / 2 + 0.5);
    }
    ctx.fillStyle = '#FFC814'; rect(c - 130 * s, top + h, 260 * s, 44 * s, 8 * s); ctx.fill();
    ctx.fillStyle = '#0E1630'; ctx.font = '800 ' + Math.max(6, 28 * s) + 'px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('ARRIVÉE', c, top + h + 32 * s);
    ctx.restore();
  }
  // Voitures modélisées en 3D (par exemple avec Hyper3D) : si des images existent dans public/voitures,
  // elles remplacent le dessin. Sinon, la voiture dessinée reste affichée.
  var SPRITES = {};
  (function chargerSprites() {
    if (!window.fetch) return;
    fetch('voitures/liste.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (l) {
      if (!l || !Array.isArray(l.voitures)) return;
      l.voitures.forEach(function (id) {
        if (!VOITURES[id] && id.indexOf('trafic-') !== 0) return;
        chargerVues(id, l.vues || 5);
      });
      (l.decor || []).forEach(function (id) { if (id !== 'decor-conteneur') chargerVues(id, 1); });
    }).catch(function () {});
    function chargerVues(id, n) {
      var vues = [], prets = 0;
      for (var k = 0; k < n; k++) {
        var img = new Image();
        img.onload = function () { if (++prets === n) SPRITES[id] = vues; };
        img.src = 'voitures/' + id + '-' + k + '.png';
        vues.push(img);
      }
    }
  })();
  function spriteVoiture(id, cx, by, s, penche, turbo, largeur) {
    var vues = SPRITES[id];
    if (!vues) return false;
    var k = Math.max(0, Math.min(vues.length - 1, Math.round((vues.length - 1) / 2 + (penche || 0) / 0.03)));
    var img = vues[k], w = (largeur || 290) * s, h = w * img.height / img.width;
    ctx.save();
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(cx, by, w * 0.52, 14 * s, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.drawImage(img, cx - w / 2, by - h + 4 * s, w, h);
    if (turbo) {
      ctx.fillStyle = 'rgba(127,216,255,.85)';
      [-0.18, 0.18].forEach(function (f) { ctx.beginPath(); ctx.moveTo(cx + f * w - 8 * s, by - 34 * s); ctx.lineTo(cx + f * w, by + (10 + Math.random() * 18) * s); ctx.lineTo(cx + f * w + 8 * s, by - 34 * s); ctx.fill(); });
    }
    ctx.restore();
    return true;
  }
  function ketch(cx, by, s, fantome, penche, autre) {
    if (!fantome && !autre && spriteVoiture('ketch', cx, by, s, penche, turboActif)) return;
    ctx.save(); ctx.translate(cx, by); ctx.scale(s, s); if (penche) ctx.rotate(penche);
    var jaune = fantome ? 'rgba(127,216,255,.35)' : (autre ? '#F2B705' : (VOITURES.ketch.teinte === 'jaune' ? '#FFC814' : VOITURES.ketch.couleur[0]));
    if (!fantome) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 2, 122, 12, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = fantome ? 'rgba(127,216,255,.6)' : '#151515';
    rect(-106, -42, 36, 42, 7); ctx.fill(); rect(70, -42, 36, 42, 7); ctx.fill();
    ctx.fillStyle = jaune; rect(-114, -104, 228, 82, 22); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-84, -100); ctx.lineTo(-62, -160); ctx.quadraticCurveTo(-58, -169, -47, -169);
    ctx.lineTo(47, -169); ctx.quadraticCurveTo(58, -169, 62, -160); ctx.lineTo(84, -100); ctx.closePath(); ctx.fill();
    if (fantome) { ctx.strokeStyle = '#7FD8FF'; ctx.lineWidth = 3; rect(-114, -104, 228, 82, 22); ctx.stroke(); ctx.restore(); return; }
    ctx.fillStyle = '#1C2433';
    ctx.beginPath(); ctx.moveTo(-69, -106); ctx.lineTo(-51, -152); ctx.quadraticCurveTo(-49, -158, -42, -158);
    ctx.lineTo(42, -158); ctx.quadraticCurveTo(49, -158, 51, -152); ctx.lineTo(69, -106); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; rect(-26, -185, 52, 17, 4); ctx.fill();
    ctx.fillStyle = '#0E1630'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TAXI', 0, -172);
    ctx.fillStyle = !autre && (turboActif || appuye('frein')) ? '#FF3B30' : '#B42318'; rect(-106, -90, 38, 20, 6); ctx.fill(); rect(68, -90, 38, 20, 6); ctx.fill();
    ctx.fillStyle = autre ? '#1E7D45' : '#1E5FD6'; ctx.fillRect(-68, -84, 136, 5);
    ctx.fillStyle = '#FFFFFF'; rect(-32, -72, 64, 22, 3); ctx.fill();
    ctx.fillStyle = '#111111'; ctx.font = '700 12px Inter, sans-serif'; ctx.fillText(autre ? 'KIN 108' : 'KIN 243', 0, -56);
    ctx.fillStyle = '#2A2A2A'; rect(-110, -44, 220, 14, 7); ctx.fill();
    if (!autre && v < -0.2) { ctx.fillStyle = '#FFFFFF'; rect(-100, -64, 18, 10, 3); ctx.fill(); rect(82, -64, 18, 10, 3); ctx.fill(); }
    if (!autre && turboActif) {
      ctx.fillStyle = 'rgba(255,176,32,.85)';
      ctx.beginPath(); ctx.moveTo(-104, -30); ctx.lineTo(-96, 6 + Math.random() * 14); ctx.lineTo(-88, -30); ctx.fill();
      ctx.beginPath(); ctx.moveTo(88, -30); ctx.lineTo(96, 6 + Math.random() * 14); ctx.lineTo(104, -30); ctx.fill();
    }
    ctx.restore();
  }

  // Voitures de sport vues de l'arrière : peinture brillante, feux LED, diffuseur, néons sous la caisse.
  function peinture(c, haut, bas) {
    var g = ctx.createLinearGradient(0, haut, 0, bas);
    g.addColorStop(0, c[0]); g.addColorStop(0.55, c[1]); g.addColorStop(1, c[1]);
    return g;
  }
  function sportive(m, cx, by, s, penche) {
    if (spriteVoiture(m.id, cx, by, s, penche, rivalDessin ? rivalDessin.turboDuree > 0 : turboActif)) return;
    ctx.save(); ctx.translate(cx, by); ctx.scale(s, s); if (penche) ctx.rotate(penche);
    // Néon sous la caisse.
    var neon = ctx.createRadialGradient(0, -4, 10, 0, -4, 170);
    neon.addColorStop(0, m.neon); neon.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55; ctx.fillStyle = neon; ctx.beginPath(); ctx.ellipse(0, -4, 170, 26, 0, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 2, 128, 10, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    var id = m.id;
    var feux = (rivalDessin ? rivalDessin.turboDuree > 0 : turboActif || appuye('frein')) ? '#FF4D5A' : '#E0182A';
    if (id === 'turbo') {
      ctx.fillStyle = '#121212'; rect(-124, -44, 48, 44, 8); ctx.fill(); rect(76, -44, 48, 44, 8); ctx.fill();
      ctx.fillStyle = peinture(m.couleur, -100, -28);
      ctx.beginPath(); ctx.moveTo(-130, -30); ctx.lineTo(-130, -70); ctx.quadraticCurveTo(-128, -96, -102, -100); ctx.lineTo(102, -100);
      ctx.quadraticCurveTo(128, -96, 130, -70); ctx.lineTo(130, -30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = m.couleur[1];
      ctx.beginPath(); ctx.moveTo(-72, -100); ctx.lineTo(-50, -136); ctx.quadraticCurveTo(-45, -142, -36, -142); ctx.lineTo(36, -142);
      ctx.quadraticCurveTo(45, -142, 50, -136); ctx.lineTo(72, -100); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0D1118'; ctx.beginPath(); ctx.moveTo(-58, -102); ctx.lineTo(-42, -130); ctx.lineTo(42, -130); ctx.lineTo(58, -102); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(-62, -128, 7, 26); ctx.fillRect(55, -128, 7, 26);
      rect(-118, -140, 236, 12, 4); ctx.fill(); ctx.fillRect(-120, -146, 8, 22); ctx.fillRect(112, -146, 8, 22);
      ctx.shadowColor = feux; ctx.shadowBlur = 14; ctx.fillStyle = feux; rect(-122, -82, 244, 7, 3); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#0B0B0B'; rect(-104, -44, 208, 16, 4); ctx.fill();
      ctx.fillStyle = '#2A2A2A'; for (var f = -80; f <= 80; f += 32) ctx.fillRect(f, -44, 4, 16);
      ctx.fillStyle = '#9AA0A9'; [-54, -34, 34, 54].forEach(function (ex) { ctx.beginPath(); ctx.arc(ex, -34, 7, 0, 7); ctx.fill(); });
      ctx.fillStyle = '#1A1A1A'; [-54, -34, 34, 54].forEach(function (ex) { ctx.beginPath(); ctx.arc(ex, -34, 4, 0, 7); ctx.fill(); });
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(-100, -96, 200, 4);
      ctx.fillStyle = '#FFFFFF'; rect(-28, -70, 56, 16, 3); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('KIN GT', 0, -58);
    } else if (id === 'zigzag') {
      ctx.fillStyle = '#121212'; rect(-114, -42, 42, 42, 8); ctx.fill(); rect(72, -42, 42, 42, 8); ctx.fill();
      ctx.fillStyle = peinture(m.couleur, -104, -28); rect(-120, -104, 240, 76, 20); ctx.fill();
      ctx.fillStyle = m.couleur[1];
      ctx.beginPath(); ctx.moveTo(-86, -102); ctx.lineTo(-66, -158); ctx.quadraticCurveTo(-62, -166, -52, -166); ctx.lineTo(52, -166);
      ctx.quadraticCurveTo(62, -166, 66, -158); ctx.lineTo(86, -102); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0D1118'; ctx.beginPath(); ctx.moveTo(-72, -106); ctx.lineTo(-56, -152); ctx.lineTo(56, -152); ctx.lineTo(72, -106); ctx.fill();
      ctx.fillStyle = '#111'; rect(-78, -172, 156, 9, 4); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-18, -168, 36, 3);
      ctx.shadowColor = feux; ctx.shadowBlur = 12; ctx.fillStyle = feux;
      ctx.beginPath(); ctx.moveTo(-116, -90); ctx.lineTo(-62, -90); ctx.lineTo(-70, -78); ctx.lineTo(-116, -78); ctx.fill();
      ctx.beginPath(); ctx.moveTo(116, -90); ctx.lineTo(62, -90); ctx.lineTo(70, -78); ctx.lineTo(116, -78); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-64, -60, 128, 3);
      ctx.fillStyle = '#0B0B0B'; rect(-96, -42, 192, 14, 4); ctx.fill();
      ctx.fillStyle = '#9AA0A9'; [-12, 12].forEach(function (ex) { ctx.beginPath(); ctx.arc(ex, -34, 8, 0, 7); ctx.fill(); });
      ctx.fillStyle = '#FFFFFF'; rect(-28, -76, 56, 15, 3); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('KIN R', 0, -64);
    } else if (id === 'mbote') {
      ctx.fillStyle = '#121212'; rect(-116, -40, 42, 40, 8); ctx.fill(); rect(74, -40, 42, 40, 8); ctx.fill();
      ctx.fillStyle = peinture(m.couleur, -110, -28); rect(-124, -108, 248, 80, 28); ctx.fill();
      ctx.fillStyle = m.couleur[1];
      ctx.beginPath(); ctx.moveTo(-90, -106); ctx.quadraticCurveTo(-72, -160, -40, -162); ctx.lineTo(40, -162); ctx.quadraticCurveTo(72, -160, 90, -106); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0D1118'; ctx.beginPath(); ctx.moveTo(-76, -108); ctx.quadraticCurveTo(-62, -150, -36, -152); ctx.lineTo(36, -152); ctx.quadraticCurveTo(62, -150, 76, -108); ctx.fill();
      ctx.shadowColor = feux; ctx.shadowBlur = 14; ctx.fillStyle = feux; rect(-120, -90, 240, 5, 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#0B0B0B'; rect(-100, -40, 200, 12, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(-110, -104, 220, 3);
      ctx.fillStyle = '#FFFFFF'; rect(-28, -72, 56, 16, 3); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('KIN E', 0, -60);
      ctx.fillStyle = '#3DDC84'; ctx.font = '800 9px Inter, sans-serif'; ctx.fillText('ÉLECTRIQUE', 0, -46);
    } else if (id === 'kingt') {
      ctx.fillStyle = '#121212'; rect(-124, -44, 46, 44, 8); ctx.fill(); rect(78, -44, 46, 44, 8); ctx.fill();
      ctx.fillStyle = peinture(m.couleur, -104, -28);
      ctx.beginPath(); ctx.moveTo(-128, -30); ctx.lineTo(-128, -78); ctx.quadraticCurveTo(-120, -104, -90, -104); ctx.lineTo(90, -104);
      ctx.quadraticCurveTo(120, -104, 128, -78); ctx.lineTo(128, -30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = m.couleur[1];
      ctx.beginPath(); ctx.moveTo(-64, -104); ctx.lineTo(-44, -140); ctx.lineTo(44, -140); ctx.lineTo(64, -104); ctx.fill();
      ctx.fillStyle = '#0D1118'; ctx.beginPath(); ctx.moveTo(-52, -106); ctx.lineTo(-38, -132); ctx.lineTo(38, -132); ctx.lineTo(52, -106); ctx.fill();
      ctx.fillStyle = '#111'; rect(-60, -108, 120, 6, 3); ctx.fill();
      ctx.shadowColor = feux; ctx.shadowBlur = 12; ctx.fillStyle = feux;
      [-100, -76, 76, 100].forEach(function (lx) { ctx.beginPath(); ctx.arc(lx, -78, 9, 0, 7); ctx.fill(); }); ctx.shadowBlur = 0;
      ctx.fillStyle = '#0B0B0B'; rect(-104, -42, 208, 14, 4); ctx.fill();
      ctx.fillStyle = '#9AA0A9'; [-92, -72, 72, 92].forEach(function (ex) { ctx.beginPath(); ctx.arc(ex, -34, 6, 0, 7); ctx.fill(); });
      ctx.fillStyle = '#FFFFFF'; rect(-28, -70, 56, 16, 3); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('KIN GT', 0, -58);
    } else if (id === 'fleuve') {
      ctx.fillStyle = '#121212'; rect(-130, -48, 56, 48, 8); ctx.fill(); rect(74, -48, 56, 48, 8); ctx.fill();
      ctx.fillStyle = peinture(m.couleur, -116, -30); rect(-132, -116, 264, 86, 10); ctx.fill();
      ctx.fillStyle = m.couleur[1];
      ctx.beginPath(); ctx.moveTo(-80, -114); ctx.lineTo(-62, -156); ctx.lineTo(62, -156); ctx.lineTo(80, -114); ctx.fill();
      ctx.fillStyle = '#0D1118'; ctx.beginPath(); ctx.moveTo(-68, -116); ctx.lineTo(-54, -148); ctx.lineTo(54, -148); ctx.lineTo(68, -116); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(-22, -158, 14, 128); ctx.fillRect(8, -158, 14, 128);
      ctx.fillStyle = '#111'; rect(-90, -120, 180, 7, 3); ctx.fill();
      ctx.shadowColor = feux; ctx.shadowBlur = 10; ctx.fillStyle = feux;
      [-124, -82, 46].forEach(function (lx) { rect(lx, -98, 36, 14, 3); ctx.fill(); }); rect(88, -98, 36, 14, 3); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#111'; rect(-132, -48, 264, 18, 4); ctx.fill();
      ctx.fillStyle = '#B9BEC6'; [-110, -88, 88, 110].forEach(function (ex) { ctx.beginPath(); ctx.arc(ex, -38, 8, 0, 7); ctx.fill(); });
      ctx.fillStyle = '#FFFFFF'; rect(-28, -76, 56, 16, 3); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('KIN V8', 0, -64);
    } else if (id === 'leopard') {
      ctx.fillStyle = '#121212'; rect(-126, -40, 50, 40, 8); ctx.fill(); rect(76, -40, 50, 40, 8); ctx.fill();
      ctx.fillStyle = peinture(m.couleur, -92, -26);
      ctx.beginPath(); ctx.moveTo(-134, -28); ctx.lineTo(-134, -60); ctx.quadraticCurveTo(-130, -88, -96, -92); ctx.lineTo(96, -92);
      ctx.quadraticCurveTo(130, -88, 134, -60); ctx.lineTo(134, -28); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(40,24,8,.35)';
      [[-96, -70], [-70, -56], [-40, -74], [44, -72], [72, -58], [98, -70], [-110, -48], [110, -48]].forEach(function (t) { ctx.beginPath(); ctx.ellipse(t[0], t[1], 7, 5, 0, 0, 7); ctx.fill(); });
      ctx.fillStyle = m.couleur[1];
      ctx.beginPath(); ctx.moveTo(-46, -92); ctx.quadraticCurveTo(-34, -136, 0, -138); ctx.quadraticCurveTo(34, -136, 46, -92); ctx.fill();
      ctx.fillStyle = '#0D1118'; ctx.beginPath(); ctx.moveTo(-34, -94); ctx.quadraticCurveTo(-26, -126, 0, -128); ctx.quadraticCurveTo(26, -126, 34, -94); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(-70, -128, 6, 34); ctx.fillRect(64, -128, 6, 34); rect(-128, -138, 256, 10, 4); ctx.fill();
      ctx.shadowColor = feux; ctx.shadowBlur = 16; ctx.strokeStyle = feux; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-128, -84); ctx.lineTo(-84, -64); ctx.moveTo(-128, -64); ctx.lineTo(-84, -84);
      ctx.moveTo(128, -84); ctx.lineTo(84, -64); ctx.moveTo(128, -64); ctx.lineTo(84, -84); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#0B0B0B'; rect(-110, -40, 220, 18, 4); ctx.fill();
      ctx.fillStyle = '#2A2A2A'; for (var f2 = -96; f2 <= 96; f2 += 24) ctx.fillRect(f2, -40, 4, 18);
      ctx.fillStyle = '#9AA0A9'; ctx.beginPath(); ctx.arc(0, -46, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#1A1A1A'; ctx.beginPath(); ctx.arc(0, -46, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; rect(-28, -76, 56, 14, 3); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '800 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('LÉOPARD', 0, -65);
    } else {
      ctx.fillStyle = '#121212'; rect(-126, -52, 52, 52, 10); ctx.fill(); rect(74, -52, 52, 52, 10); ctx.fill();
      ctx.fillStyle = peinture(m.couleur, -176, -36); rect(-130, -168, 260, 132, 18); ctx.fill();
      ctx.fillStyle = '#0D1118'; rect(-96, -158, 192, 54, 10); ctx.fill();
      ctx.fillStyle = '#9AA0A9'; ctx.fillRect(-104, -176, 6, 10); ctx.fillRect(98, -176, 6, 10); ctx.fillRect(-104, -178, 208, 4);
      ctx.shadowColor = feux; ctx.shadowBlur = 12; ctx.fillStyle = feux;
      rect(-126, -136, 14, 52, 4); ctx.fill(); rect(112, -136, 14, 52, 4); ctx.fill(); ctx.fillRect(-100, -96, 200, 4); ctx.shadowBlur = 0;
      ctx.fillStyle = m.neon; ctx.fillRect(-130, -110, 260, 5);
      ctx.fillStyle = '#151515'; rect(-130, -58, 260, 22, 6); ctx.fill();
      ctx.fillStyle = '#B9BEC6'; rect(-60, -40, 120, 10, 4); ctx.fill();
      ctx.fillStyle = '#9AA0A9'; [-100, 100].forEach(function (ex) { ctx.beginPath(); ctx.arc(ex, -46, 8, 0, 7); ctx.fill(); });
      ctx.fillStyle = '#FFFFFF'; rect(-30, -88, 60, 17, 3); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = '800 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('KIN 4X4', 0, -75);
    }
    if (v < -0.2) {
      ctx.shadowColor = '#FFFFFF'; ctx.shadowBlur = 10; ctx.fillStyle = '#FFFFFF';
      rect(-96, id === 'blinde' ? -126 : -96, 16, 10, 3); ctx.fill(); rect(80, id === 'blinde' ? -126 : -96, 16, 10, 3); ctx.fill(); ctx.shadowBlur = 0;
    }
    if ((rivalDessin ? rivalDessin.turboDuree > 0 : turboActif) && !m.electrique) {
      ctx.fillStyle = 'rgba(80,170,255,.9)';
      [-44, 44].forEach(function (ex) { ctx.beginPath(); ctx.moveTo(ex - 8, -30); ctx.lineTo(ex, 10 + Math.random() * 18); ctx.lineTo(ex + 8, -30); ctx.fill(); });
    }
    ctx.restore();
  }

  function dessinBonus(b, sx, sy, s) {
    ctx.save(); ctx.translate(sx, sy - 90 * s - Math.sin(temps * 4 + b.z) * 8 * s); ctx.scale(s * 1.6, s * 1.6);
    if (b.type === 'piece') {
      var l = Math.abs(Math.cos(temps * 3 + b.z));
      ctx.shadowColor = '#FFD23F'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#E8A800'; ctx.beginPath(); ctx.ellipse(0, 0, 34 * l + 4, 34, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#FFD23F'; ctx.beginPath(); ctx.ellipse(0, 0, 28 * l + 3, 28, 0, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      if (l > 0.4) { ctx.fillStyle = '#8A5A00'; ctx.font = '900 30px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.save(); ctx.scale(l, 1); ctx.fillText('G', 0, 11); ctx.restore(); }
    } else {
      ctx.shadowColor = '#7FD8FF'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#1E5FD6'; rect(-30, -40, 60, 80, 10); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#163E99'; rect(-12, -52, 24, 14, 4); ctx.fill();
      ctx.fillStyle = '#FFD23F'; ctx.beginPath(); ctx.moveTo(6, -26); ctx.lineTo(-12, 4); ctx.lineTo(0, 4); ctx.lineTo(-6, 28); ctx.lineTo(14, -6); ctx.lineTo(2, -6); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // Nuit : on assombrit toute la scène, puis on rallume phares, feux, lampadaires et enseignes.
  function ambianceNuit() {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#2E3766'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(VX, 330, 20, VX, 250, 300);
    g.addColorStop(0, 'rgba(255,236,190,.28)'); g.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(VX - 110, 360); ctx.lineTo(VX - 330, HORIZON + 30); ctx.lineTo(VX + 330, HORIZON + 30); ctx.lineTo(VX + 110, 360); ctx.fill();
    lumieres.concat([{ x: VX - 95, y: 330, r: 60, c: '255,60,48' }, { x: VX + 95, y: 330, r: 60, c: '255,60,48' }]).forEach(function (l) {
      if (l.r < 2) return;
      var gl = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      gl.addColorStop(0, 'rgba(' + l.c + ',.55)'); gl.addColorStop(1, 'rgba(' + l.c + ',0)');
      ctx.fillStyle = gl; ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    });
    ctx.restore();
  }
  var GOUTTES = [];
  for (var ig = 0; ig < 110; ig++) GOUTTES.push([Math.random() * 900, Math.random() * 420, 0.6 + Math.random() * 0.8]);
  function ambiancePluie() {
    ctx.fillStyle = 'rgba(70,80,100,.18)'; ctx.fillRect(0, 0, W, H);
    if (!mouvementReduit) {
      ctx.strokeStyle = 'rgba(210,225,245,.45)'; ctx.lineWidth = 1.4; ctx.beginPath();
      GOUTTES.forEach(function (g) {
        var gy = (g[1] + temps * 700 * g[2]) % 420 - 20, gx = (g[0] - temps * 90 * g[2] + decalDecor * 0.3) % 900;
        if (gx < 0) gx += 900;
        ctx.moveTo(gx, gy); ctx.lineTo(gx - 5, gy + 18 * g[2]);
      });
      ctx.stroke();
    }
    if (eclair > 0) { ctx.fillStyle = 'rgba(235,240,255,' + (eclair * (mouvementReduit ? 0.25 : 0.6)) + ')'; ctx.fillRect(0, 0, W, H); }
  }
  // Police : radar en bas de l'écran et gyrophares sur les bords quand elle se rapproche.
  function badgePosition() {
    var amis = fantomesAmis();
    if ((!rivaux.length && !amis.length) || (etat !== 'course' && etat !== 'compte')) return;
    var rang = 1 + rivaux.filter(function (rv) { return rv.z > z; }).length + amis.filter(function (f) { return f.z > z; }).length;
    ctx.fillStyle = rang === 1 ? 'rgba(255,200,20,.95)' : 'rgba(14,22,48,.85)'; rect(16, 84, 104, 28, 14); ctx.fill();
    ctx.fillStyle = rang === 1 ? '#0E1630' : '#FFFFFF'; ctx.textAlign = 'center'; ctx.font = '800 15px Inter, sans-serif';
    ctx.fillText('POS ' + rangTexte(rang) + ' / ' + (rivaux.length + amis.length + 1), 68, 103);
  }
  function radarPolice() {
    if (!police.length || etat !== 'course') return;
    var pres = Math.min.apply(null, police.filter(function (pc) { return pc.mode === 'chasse'; }).map(function (pc) { return z - pc.z; }).concat([999]));
    if (pres < 60 && !mouvementReduit) {
      var a = 0.35 * (1 - pres / 60), bleu = Math.floor(temps * 6) % 2;
      var g = ctx.createLinearGradient(0, 0, 90, 0);
      g.addColorStop(0, bleu ? 'rgba(60,120,255,' + a + ')' : 'rgba(255,50,50,' + a + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 90, H);
      var g2 = ctx.createLinearGradient(W, 0, W - 90, 0);
      g2.addColorStop(0, bleu ? 'rgba(255,50,50,' + a + ')' : 'rgba(60,120,255,' + a + ')'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2; ctx.fillRect(W - 90, 0, 90, H);
    }
    var texte = pres > 200 ? 'Police semée !' : 'Police à ' + Math.max(0, Math.round(pres)) + ' m';
    ctx.font = '800 14px Inter, sans-serif'; ctx.textAlign = 'center';
    var lw = ctx.measureText(texte).width + 44;
    ctx.fillStyle = pres < 40 ? 'rgba(180,35,24,.92)' : 'rgba(14,22,48,.85)'; rect(128, 84, lw, 28, 14); ctx.fill();
    ctx.fillStyle = Math.floor(temps * 6) % 2 ? '#3B82F6' : '#EF4444'; ctx.beginPath(); ctx.arc(144, 98, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(texte, 128 + lw / 2 + 8, 103);
  }
  function dessinRival(rv, sx, sy, s) {
    lumiere(sx - 90 * s, sy - 80 * s, 70 * s, '255,60,48'); lumiere(sx + 90 * s, sy - 80 * s, 70 * s, '255,60,48');
    rivalDessin = rv;
    try { sportive(rv.m, sx, sy, s * 0.92, 0); } finally { rivalDessin = null; }
    if (s > 0.06) {
      ctx.font = '800 ' + Math.max(10, Math.min(15, s * 40)) + 'px Inter, sans-serif'; ctx.textAlign = 'center';
      var lw = ctx.measureText(rv.nom).width + 14, ty = sy - 250 * s - 8;
      ctx.fillStyle = 'rgba(14,22,48,.8)'; rect(sx - lw / 2, ty - 14, lw, 19, 9); ctx.fill();
      ctx.fillStyle = rv.m.couleur[0]; ctx.fillText(rv.nom, sx, ty);
    }
  }
  function lignesVitesse() {
    var seuil = E.vMax * perf().vitesse * 0.8;
    if (mouvementReduit || etat !== 'course' || (v < seuil && !turboActif)) return;
    var force = Math.min(1, (v - seuil * 0.9) / (seuil * 0.4)) * (turboActif ? 1 : 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 * force) + ')'; ctx.lineWidth = 2;
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * Math.PI * 2, r0 = 160 + Math.random() * 120, r1 = r0 + 60 + Math.random() * 120;
      ctx.beginPath(); ctx.moveTo(VX + Math.cos(a) * r0, 200 + Math.sin(a) * r0 * 0.6); ctx.lineTo(VX + Math.cos(a) * r1, 200 + Math.sin(a) * r1 * 0.6); ctx.stroke();
    }
  }
  function feuDepart() {
    var n = Math.ceil(compte - 1), x0 = VX - 90, y0 = 150;
    ctx.fillStyle = 'rgba(14,22,48,.92)'; rect(x0, y0, 180, 64, 14); ctx.fill();
    for (var i = 0; i < 3; i++) {
      var allume = n <= 0 ? '#3DDC84' : i < 4 - n ? '#FF3B30' : '#3A2226';
      ctx.shadowColor = allume; ctx.shadowBlur = allume === '#3A2226' ? 0 : 18;
      ctx.fillStyle = allume; ctx.beginPath(); ctx.arc(x0 + 40 + i * 50, y0 + 32, 18, 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
  function scene(vue) {
    var objets = [];
    lumieres = [];
    function poser(zz, xx, dessin) {
      var e = vue.ecrans[Math.floor(zz / SEG)];
      if (!e) return;
      objets.push({ zz: zz, e: e, xx: xx, f: dessin });
    }
    var fin = vue.camZ + VISIBLES * SEG;
    E.blocs.forEach(function (b) {
      if (b.z > fin || b.z + 20 < vue.camZ) return;
      var i0 = Math.floor(b.z / SEG);
      for (var j = 0; j < 4; j++) {
        var eA = vue.ecrans[i0 + j], eB = vue.ecrans[i0 + j + 1];
        if (!eA || !eB) continue;
        (function (eA, eB) { objets.push({ zz: (i0 + j + 1) * SEG - 0.01, e: eA, f: function () { morceauMur(b, eA, eB); } }); })(eA, eB);
      }
      var eF = vue.ecrans[i0];
      if (eF) objets.push({ zz: b.z + 0.01, e: eF, f: function () { faceImmeuble(b, eF); } });
    });
    E.decor.forEach(function (d) {
      if (d.z > fin || d.z < vue.camZ) return;
      var f = { palmier: function (sx, sy, s) { palmier(sx, sy, s); },
        lampadaire: function (sx, sy, s) { lampadaire(sx, sy, s, d.cote); },
        passant: function (sx, sy, s) { passant(sx, sy, s, d.v, false); },
        pub: function (sx, sy, s) { pub(sx, sy, s, d.sponsor); },
        abribus: function (sx, sy, s) { abribus(sx, sy, s); },
        monument: function (sx, sy, s) { monument(sx, sy, s); },
        conteneur: function (sx, sy, s) { conteneur(sx, sy, s, d.v); },
        pylone: function (sx, sy, s) { pylone(sx, sy, s); },
        pirogue: function (sx, sy, s) { pirogue(sx, sy, s, d.v); },
        panneauGlissant: function (sx, sy, s) { panneau(sx, sy, s, 'GLISSANT', '#B54708', 0); },
        panneauBarrage: function (sx, sy, s) { panneau(sx, sy, s, 'BARRAGE', '#B42318', 0); },
        etalDecor: function (sx, sy, s) { etalDecor(sx, sy, s, d.v); },
        fanions: function (sx, sy, s, e) { fanions(e); } }[d.type];
      if (d.type === 'etalDecor' && d.z > vue.camZ + 200) return;
      if (f) poser(d.z, d.x, f);
    });
    E.raccourcis.forEach(function (r) {
      poser(r.debut - 40, r.cote * 1.05, function (sx, sy, s) { panneau(sx, sy, s, 'RACCOURCI', '#1E7D45', r.cote); });
    });
    bonus.forEach(function (b) {
      if (!b.pris) poser(b.z, b.x, function (sx, sy, s) { dessinBonus(b, sx, sy, s); });
    });
    obstacles.forEach(function (o) {
      if (o.type === 'bosse') poser(o.z, 0, function (sx, sy, s, e) { bosse(e); });
      else poser(o.z, o.x, function (sx, sy, s) { obstacle(o, sx, sy, s); });
    });
    rivaux.forEach(function (rv) { if (rv.z > vue.camZ + 1) poser(rv.z, rv.x, function (sx, sy, s) { dessinRival(rv, sx, sy, s); }); });
    police.forEach(function (pc, ip) {
      if (pc.z > vue.camZ + 1) poser(pc.z, pc.x, function (sx, sy, s) { vehicule({ def: { type: 'police', n: ip, couleur: '#FFFFFF' } }, sx, sy, s); });
    });
    trafic.forEach(function (t) { if (t.z > vue.camZ + 1) poser(t.z, t.x, function (sx, sy, s) { vehicule(t, sx, sy, s); }); });
    pietons.forEach(function (p) { poser(p.z, p.x, function (sx, sy, s) { passant(sx, sy, s, p.def.habit, p.parti && !p.ecarte); }); });
    if (!entreAmis() && zFantome > vue.camZ + 1) poser(zFantome, E.xFantome, function (sx, sy, s) { ketch(sx, sy, s * 0.95, true); });
    fantomesAmis().forEach(function (f) {
      if (f.z > vue.camZ + 1) poser(f.z, f.x, function (sx, sy, s) {
        ketch(sx, sy, s * 0.95, true);
        if (s > 0.05) {
          ctx.font = '800 ' + Math.max(10, Math.min(15, s * 40)) + 'px Inter, sans-serif'; ctx.textAlign = 'center';
          var lw = ctx.measureText(f.nom).width + 14, ty = sy - 250 * s - 8;
          ctx.fillStyle = 'rgba(14,22,48,.8)'; rect(sx - lw / 2, ty - 14, lw, 19, 9); ctx.fill();
          ctx.fillStyle = f.couleur; ctx.fillText(f.nom, sx, ty);
        }
      });
    });
    poser(E.longueur, 0, function (sx, sy, s, e) { arche(e, sy, s); });
    E.arches.forEach(function (a) { if (a.z > vue.camZ + 3 && a.z < fin) poser(a.z, 0, function (sx, sy, s, e) { archePub(e, sy, s, a.sponsor); }); });

    objets.sort(function (a, b) { return b.zz - a.zz; });
    objets.forEach(function (o) {
      var p = o.e.p;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, o.e.clip); ctx.clip();
      o.f(p.c + (o.xx || 0) * p.w, p.y, p.s, o.e);
      ctx.restore();
    });
  }

  function hud() {
    function boite(x0, y0, w, h, r, a) { ctx.fillStyle = 'rgba(14,22,48,' + (a || 0.85) + ')'; rect(x0, y0, w, h, r); ctx.fill(); }
    ctx.textAlign = 'left';
    boite(16, 14, 282, 62, 14);
    ctx.fillStyle = '#FFC814'; ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText('ÉTAPE ' + E.numero + ' / ' + ORDRE.length + ' · ' + String(E.longueur / 1000).replace('.', ',') + ' KM · ' + (v < -0.2 ? 'R · ' : '') + Math.round(Math.abs(v) * 3.6) + ' KM/H', 32, 38);
    ctx.fillStyle = '#FFFFFF'; ctx.font = '700 16px Inter, sans-serif'; ctx.fillText((defiEnCours ? 'Défi · ' : modeJeu === 'duel' && duel && duel.joueurs[duel.resultats.length] ? duel.joueurs[duel.resultats.length].nom + ' · ' : modeJeu === 'direct' ? 'En direct · ' : modeJeu === 'sponsor' ? 'Tournoi · ' : modeJeu === 'international' ? 'International · ' : '') + E.nom, 32, 60);

    boite(356, 14, 132, 44, 12);
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.font = '800 24px "Bricolage Grotesque", Inter, sans-serif';
    ctx.fillText(chrono(temps), 422, 44);
    ctx.fillStyle = flashScore > 0 ? 'rgba(180,35,24,.92)' : 'rgba(14,22,48,.8)'; rect(346, 64, 152, 26, 13); ctx.fill();
    ctx.fillStyle = flashScore > 0 ? '#FFFFFF' : '#FFC814'; ctx.font = '800 14px Inter, sans-serif';
    ctx.fillText('Score ' + Math.round(points).toLocaleString('fr-FR'), 422, 82);

    boite(546, 14, 282, 72, 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFC814'; ctx.font = '700 11px Inter, sans-serif'; ctx.fillText('VOUS', 562, 36);
    ctx.fillStyle = '#2A3566'; rect(640, 28, 140, 8, 4); ctx.fill();
    ctx.fillStyle = '#FFC814'; rect(640, 28, 140 * Math.min(1, z / E.longueur), 8, 4); ctx.fill();
    // En affrontement, la barre suit le fantôme de l'ami en tête (rien pour le premier joueur).
    var amisHud = fantomesAmis().sort(function (a2, b2) { return b2.z - a2.z; });
    var repere = entreAmis() ? amisHud[0] : { nom: 'FANTÔME', z: zFantome, couleur: '#7FD8FF' };
    if (repere) {
      ctx.fillStyle = repere.couleur; ctx.fillText(repere.nom.toUpperCase().slice(0, 10), 562, 58);
      ctx.fillStyle = '#2A3566'; rect(640, 50, 140, 8, 4); ctx.fill();
      ctx.fillStyle = repere.couleur; rect(640, 50, 140 * Math.min(1, repere.z / E.longueur), 8, 4); ctx.fill();
    }
    var ecart = repere && etat === 'course' && v > 1 ? (repere.z - z) / Math.max(v, 10) : 0;
    ctx.fillStyle = '#C9CFE3'; ctx.font = '600 11px Inter, sans-serif';
    ctx.fillText(!repere ? 'Vous ouvrez : fixez le temps à battre !' : etat !== 'course' ? 'Vite et sans choc = plus de points'
      : ecart > 0.05 ? 'Écart : −' + secondes(ecart) + ' · rattrapez-le !'
      : ecart < -0.05 ? 'Écart : +' + secondes(-ecart) + ' · tenez bon !' : 'Au coude à coude !', 562, 78);

    if (messageTemps > 0 && message) {
      ctx.globalAlpha = Math.min(1, messageTemps * 2);
      ctx.font = '800 20px "Bricolage Grotesque", Inter, sans-serif'; ctx.textAlign = 'center';
      var lw = ctx.measureText(message).width + 36;
      ctx.fillStyle = 'rgba(255,200,20,.95)'; rect(VX - lw / 2, 100, lw, 36, 18); ctx.fill();
      ctx.fillStyle = '#0E1630'; ctx.fillText(message, VX, 125);
      ctx.globalAlpha = 1;
    }
    bulles.forEach(function (b, i) {
      ctx.globalAlpha = Math.min(1, b.t * 2);
      ctx.font = '800 17px Inter, sans-serif'; ctx.textAlign = 'center';
      var lw = ctx.measureText(b.texte).width + 26, y = 150 + i * 34 - (1.4 - b.t) * 18;
      ctx.fillStyle = b.bon ? 'rgba(30,125,69,.95)' : 'rgba(180,35,24,.95)'; rect(VX - lw / 2, y, lw, 30, 15); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.fillText(b.texte, VX, y + 21);
      ctx.globalAlpha = 1;
    });
    BOUTONS.forEach(function (b) {
      var actif = appuye(b.nom);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7);
      if (b.nom === 'turbo') {
        ctx.fillStyle = energie > 0.02 ? (actif ? '#FFE07A' : '#FFC814') : '#7A6A2A'; ctx.fill();
        ctx.fillStyle = '#0E1630'; ctx.font = '800 14px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TURBO', b.x, b.y + 5);
      } else {
        ctx.fillStyle = actif ? 'rgba(255,255,255,.4)' : 'rgba(14,22,48,.35)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (b.nom === 'frein') {
          ctx.textAlign = 'center';
          if (arriere) { ctx.font = '800 11px Inter, sans-serif'; ctx.fillText('ARRIÈRE', b.x, b.y + 4); }
          else { ctx.font = '700 12px Inter, sans-serif'; ctx.fillText('FREIN', b.x, b.y + 1); ctx.font = '600 8px Inter, sans-serif'; ctx.fillText('maintenir : R', b.x, b.y + 14); }
        }
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
    ciel();
    var vue = route();
    scene(vue);
    var dir = (appuye('droite') ? 1 : 0) - (appuye('gauche') ? 1 : 0);
    var cahot = raccourci && v > 5 && !mouvementReduit ? Math.sin(temps * 30) * 1 : 0; // route lisse : plus de tremblement
    var penche = etat === 'course' ? dir * (glisse ? 0.06 : 0.03) : 0;
    lignesVitesse();
    if (voiture === VOITURES.ketch) ketch(VX, 384 + cahot, 0.78, false, penche);
    else sportive(voiture, VX, 384 + cahot, 0.78, penche);
    particulesDessiner();
    if (E.nuit) ambianceNuit();
    if (E.pluie) ambiancePluie();
    ctx.restore();
    hud();
    badgePosition();
    radarPolice();
    if (etat === 'compte') {
      var n = Math.ceil(compte - 1);
      ctx.fillStyle = 'rgba(14,22,48,.3)'; ctx.fillRect(0, 0, W, H);
      feuDepart();
      ctx.fillStyle = n > 0 ? '#FFFFFF' : '#3DDC84'; ctx.textAlign = 'center';
      ctx.font = '800 72px "Bricolage Grotesque", Inter, sans-serif';
      ctx.fillText(n > 0 ? String(n) : 'Partez !', VX, 290);
    }
  }

  // ---------- Boucle ----------
  var avant = 0, dpr = 0;
  // L'image est calculée à la taille réelle de l'écran de jeu : nette même en grand ou en plein écran.
  function taille() {
    var largeur = canvas.clientWidth || W;
    var d = Math.max(1, Math.min(3, (largeur / W) * (window.devicePixelRatio || 1)));
    d = Math.round(d * 4) / 4;
    if (d !== dpr) { dpr = d; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); cielGrad = null; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function boucle(t) {
    var dt = avant ? Math.min(0.05, (t - avant) / 1000) : 0;
    horlogePub += dt;
    majBande(dt);
    avant = t;
    taille();
    avancer(dt);
    sonMoteur(dt);
    dessiner();
    dessinerApercu();
    requestAnimationFrame(boucle);
  }
  document.addEventListener('visibilitychange', function () {
    avant = 0; touches = {}; doigts = {};
    if (son.ctx) { if (document.hidden) son.ctx.suspend(); else if (enJeu()) son.ctx.resume(); }
  });
  window.addEventListener('blur', function () { touches = {}; doigts = {}; });

  // ---------- Écrans de début et de fin ----------
  var etapeChoisie = 'rondpoint';
  function lancer(id) {
    etapeChoisie = id || etapeChoisie;
    reinitialiser(etapeChoisie);
    etat = 'compte';
    dernierRang = 0; dernierCommentaire = -9;
    direct('Commentateur', 'Départ imminent : ' + voiture.nom + ' sur ' + ETAPES[etapeChoisie].nom + ', face à Kin Flash, Bana Mboka et Lisanga.');
    sonDemarrer();
    if (son.ctx) {
      son.oscA.type = voiture.electrique ? 'sine' : 'sawtooth';
      son.oscB.type = voiture.electrique ? 'sine' : 'sawtooth';
      son.lfo.type = voiture.electrique ? 'sine' : 'triangle';
    }
    musiqueArreter(); musiqueDemarrer();
    panneauDebut.hidden = true; panneauFin.hidden = true; panneauModes.hidden = true; panneauTournoi.hidden = true; panneauCompte.hidden = true; panneauDuel.hidden = true;
    var envoi = document.getElementById('finEnvoi'); if (envoi) envoi.hidden = true;
    canvas.focus({ preventScroll: true });
  }
  function majRecords() {
    var total = 0;
    ORDRE.forEach(function (id) {
      var el = document.getElementById('record-' + id), r = lireRecord(id);
      if (el) el.textContent = r && r.score ? r.score.toLocaleString('fr-FR') + ' pts' : 'Nouveau';
      var et = document.getElementById('etoiles-' + id), n = r ? (r.etoiles || (r.gagne ? 2 : r.score ? 1 : 0)) : 0;
      if (et) et.textContent = '\u2605'.repeat(n) + '\u2606'.repeat(3 - n);
      var carte = document.querySelector('[data-etape="' + id + '"]');
      if (carte) carte.setAttribute('aria-label', carte.querySelector('.jeu-nom').textContent + ', ' + n + ' étoile' + (n > 1 ? 's' : '') + ' sur 3' + (r && r.score ? ', record ' + r.score + ' points' : ''));
      total += n;
    });
    var ce = document.getElementById('compteurEtoiles'); if (ce) ce.textContent = '\u2605 ' + total + ' / ' + ORDRE.length * 3;
  }
  var infoVoiture = document.getElementById('infoVoiture');
  var vueGarage = voiture; // voiture affichée dans la vitrine (peut être verrouillée)
  var couleurVisee = null; // peinture verrouillée que le joueur regarde
  var NOMS_COULEURS = { jaune: 'Jaune', noir: 'Noir', blanc: 'Blanc', vert: 'Vert', rouge: 'Rouge', bleu: 'Bleu', orange: 'Orange', violet: 'Violet' };
  var STATS = [['Vitesse', 'vitesse'], ['Accélération', 'accel'], ['Maniabilité', 'direction'], ['Robustesse', 'robuste']];
  function barreStat(cle, val) {
    var vals = ORDRE_VOITURES.map(function (k) { return VOITURES[k][cle]; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    return Math.round(30 + 70 * (val - mn) / Math.max(1e-6, mx - mn));
  }
  function majVitrine() {
    var m = vueGarage, ouverte = debloquee(m);
    var nom = document.getElementById('nomVoiture'), type = document.getElementById('typeVoiture');
    if (nom) nom.textContent = m.nom;
    if (type) type.textContent = m.type;
    if (infoVoiture) infoVoiture.textContent = ouverte ? (couleurVisee && !couleurOuverte(couleurVisee, voiture) ? 'Peinture ' + NOMS_COULEURS[couleurVisee] + ' : ' + PRIX_COULEUR + ' G, valable pour toutes vos voitures.' : '')
      : '\uD83D\uDD12 ' + m.debloque.toLocaleString('fr-FR') + ' pts sur une étape' + (m.id === 'leopard' ? ' ou 5 étapes gagnées' : '') + ' (votre record : ' + meilleurScore().toLocaleString('fr-FR') + '), ou achetez-la avec vos pièces G.';
    var porte = lirePorteMonnaie(), pm = document.getElementById('porteMonnaie');
    if (pm) pm.textContent = porte.toLocaleString('fr-FR') + ' G';
    var ba = document.getElementById('boutonAcheter');
    if (ba) {
      var prix = !ouverte ? PRIX_VOITURES[m.id] : couleurVisee && !couleurOuverte(couleurVisee, voiture) ? PRIX_COULEUR : 0;
      ba.hidden = !prix;
      if (prix) {
        var quoi = !ouverte ? m.nom : 'la peinture ' + NOMS_COULEURS[couleurVisee];
        ba.setAttribute('aria-disabled', porte >= prix ? 'false' : 'true');
        ba.textContent = porte >= prix ? 'Acheter ' + quoi + ' · ' + prix + ' G' : quoi.charAt(0).toUpperCase() + quoi.slice(1) + ' : ' + prix + ' G · il vous manque ' + (prix - porte) + ' G';
      }
    }
    var st = document.getElementById('statsVoiture');
    if (st) st.innerHTML = STATS.map(function (k) {
      var pc = barreStat(k[1], m[k[1]]);
      return '<span>' + k[0] + '</span><span class="jeu-barre" role="meter" aria-label="' + k[0] + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pc + '"><i style="width:' + pc + '%"></i></span>';
    }).join('');
    var nb = ORDRE_VOITURES.filter(function (k) { return debloquee(VOITURES[k]); }).length;
    var cg = document.getElementById('compteurGarage'); if (cg) cg.textContent = nb + ' / ' + ORDRE_VOITURES.length + ' débloquées';
    var lancerBtn = document.getElementById('boutonLancer');
    if (lancerBtn) lancerBtn.querySelector('span').textContent = ouverte ? 'Lancer la course' : 'Lancer avec ' + voiture.nom;
  }
  // Aperçu animé de la voiture dans la vitrine : on redessine avec les mêmes fonctions que le jeu.
  var apercu = document.getElementById('apercuVoiture'), apCtx = apercu && apercu.getContext('2d');
  function dessinerApercu() {
    if (!apCtx || panneauDebut.hidden) return;
    var principal = ctx, m = vueGarage, ouverte = debloquee(m);
    apCtx.clearRect(0, 0, apercu.width, apercu.height);
    apCtx.fillStyle = 'rgba(0,0,0,.45)'; apCtx.beginPath(); apCtx.ellipse(180, 152, 120, 12, 0, 0, 7); apCtx.fill();
    ctx = apCtx;
    try {
      ctx.save();
      if (!ouverte) ctx.filter = 'grayscale(1) brightness(.45)';
      var bob = mouvementReduit ? 0 : Math.sin(performance.now() / 500) * 1.5;
      if (m === VOITURES.ketch) ketch(180, 150 + bob, 0.62, false, 0); else sportive(m, 180, 150 + bob, 0.62, 0);
      ctx.restore();
    } finally { ctx = principal; }
    if (!ouverte) {
      apCtx.fillStyle = 'rgba(10,16,38,.8)'; apCtx.beginPath(); apCtx.arc(180, 78, 26, 0, 7); apCtx.fill();
      apCtx.fillStyle = '#FFC814'; apCtx.fillRect(169, 76, 22, 16); apCtx.strokeStyle = '#FFC814'; apCtx.lineWidth = 3.5;
      apCtx.beginPath(); apCtx.arc(180, 75, 7, Math.PI, 0); apCtx.stroke();
    }
  }
  function montrer(m) {
    vueGarage = m; couleurVisee = null;
    if (debloquee(m)) { voiture = m; try { localStorage.setItem('ketch-voiture', m.id); } catch (e) {} }
    majVoitures();
  }
  function decaler(pas) {
    var i = ORDRE_VOITURES.indexOf(vueGarage.id);
    montrer(VOITURES[ORDRE_VOITURES[(i + pas + ORDRE_VOITURES.length) % ORDRE_VOITURES.length]]);
  }
  var precedente = document.getElementById('voiturePrecedente'), suivanteV = document.getElementById('voitureSuivante');
  if (precedente) precedente.addEventListener('click', function () { decaler(-1); });
  if (suivanteV) suivanteV.addEventListener('click', function () { decaler(1); });
  function majVoitures() {
    majVitrine();
    Array.prototype.forEach.call(document.querySelectorAll('[data-voiture]'), function (b) {
      var m = VOITURES[b.getAttribute('data-voiture')], ouverte = debloquee(m);
      b.setAttribute('aria-pressed', m === vueGarage ? 'true' : 'false');
      b.setAttribute('aria-disabled', ouverte ? 'false' : 'true');
      b.title = ouverte ? m.nom + ' · ' + m.type : m.nom + ' · verrouillée : ' + conditionDeblocage(m);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-couleur]'), function (b) {
      var c = b.getAttribute('data-couleur');
      b.setAttribute('aria-pressed', c === voiture.teinte ? 'true' : 'false');
      b.setAttribute('aria-disabled', couleurOuverte(c, voiture) ? 'false' : 'true');
      b.title = NOMS_COULEURS[c] + (couleurOuverte(c, voiture) ? '' : ' · ' + PRIX_COULEUR + ' G');
    });
  }
  var boutonAcheter = document.getElementById('boutonAcheter');
  if (boutonAcheter) boutonAcheter.addEventListener('click', function () {
    var m = vueGarage;
    if (!debloquee(m)) {
      if (!acheter('voiture:' + m.id, PRIX_VOITURES[m.id] || 1e9)) return;
      sonNote(880, 0, 0.12, 0.15, 'square'); sonNote(1320, 0.1, 0.25, 0.15, 'square');
      if (infoVoiture) infoVoiture.textContent = m.nom + ' est à vous !';
      montrer(m); return;
    }
    if (couleurVisee && acheter('couleur:' + couleurVisee, PRIX_COULEUR)) {
      sonNote(880, 0, 0.12, 0.15, 'square');
      voiture.teinte = couleurVisee; voiture.couleur = COULEURS[couleurVisee];
      try { localStorage.setItem('ketch-couleur-' + voiture.id, couleurVisee); } catch (e) {}
      couleurVisee = null; majVoitures();
    }
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-voiture]'), function (b) {
    b.addEventListener('click', function () {
      montrer(VOITURES[b.getAttribute('data-voiture')]);
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-couleur]'), function (b) {
    b.addEventListener('click', function () {
      var c = b.getAttribute('data-couleur');
      if (!debloquee(vueGarage)) return;
      if (!couleurOuverte(c, voiture)) { couleurVisee = c; majVoitures(); return; }
      couleurVisee = null;
      voiture.teinte = c; voiture.couleur = COULEURS[c];
      try { localStorage.setItem('ketch-couleur-' + voiture.id, c); } catch (e) {}
      majVoitures();
    });
  });
  majVoitures();
  Array.prototype.forEach.call(document.querySelectorAll('[data-etape]'), function (b) {
    b.addEventListener('click', function () { choisirEtape(b.getAttribute('data-etape')); });
    b.addEventListener('dblclick', function () { lancer(b.getAttribute('data-etape')); });
  });
  function choisirEtape(id) {
    etapeChoisie = id;
    Array.prototype.forEach.call(document.querySelectorAll('[data-etape]'), function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-etape') === id ? 'true' : 'false'); });
    var le = document.getElementById('lancerEtape'), carte = document.querySelector('[data-etape="' + id + '"]');
    if (le && carte) le.textContent = carte.querySelector('.jeu-num').textContent + ' · ' + carte.querySelector('.jeu-nom').textContent;
  }
  var boutonLancer = document.getElementById('boutonLancer');
  if (boutonLancer) boutonLancer.addEventListener('click', function () { quitterDefi(); modeJeu = 'entrainement'; vueGarage = voiture; lancer(etapeChoisie); });
  document.getElementById('boutonRejouer').addEventListener('click', function () { lancer(); });
  var suivante = document.getElementById('boutonSuivante');
  if (suivante) suivante.addEventListener('click', function () { quitterDefi(); lancer(ORDRE[(ORDRE.indexOf(etapeChoisie) + 1) % ORDRE.length]); });
  var autre = document.getElementById('boutonAutreEtape');
  if (autre) autre.addEventListener('click', function () {
    quitterDefi();
    panneauFin.hidden = true; etat = 'accueil'; musiqueArreter();
    if (modeJeu !== 'entrainement') { ouvrirTournoi(modeJeu); return; }
    panneauDebut.hidden = false;
    vueGarage = voiture; majVoitures(); majRecords(); majDefi(); choisirEtape(etapeChoisie);
    if (boutonLancer) boutonLancer.focus({ preventScroll: true });
  });

  // ---------- Bande « EN DIRECT » : sponsor du moment + fil des commentaires ----------
  // Fil : annonces du commentateur (événements réels de votre course) et commentaires des fans.
  // Dans la démo, les commentaires restent sur l'appareil. Pour un tournoi en direct, brancher
  // window.GChallengeDirect.ajouter({ auteur, texte, type: 'fan' }) sur le serveur (WebSocket),
  // avec modération côté serveur avant diffusion.
  var bandeSponsor = document.getElementById('bandeSponsor'), bandeDefile = document.getElementById('bandeDefile');
  var fil = [], positionFil = 0, sponsorBande = -1, dernierRang = 0, dernierCommentaire = -9;
  function echapper(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function direct(auteur, texte, type) {
    fil.push({ auteur: auteur, texte: texte, type: type || 'commentateur' });
    if (fil.length > 14) fil.shift();
    if (bandeDefile) bandeDefile.innerHTML = fil.map(function (m) {
      return '<span class="' + m.type + '"><b>' + echapper(m.auteur) + '</b>' + echapper(m.texte) + '</span>';
    }).join('');
  }
  window.GChallengeDirect = { ajouter: function (m) { if (m && m.texte) direct(m.auteur || 'Fan', String(m.texte).slice(0, 120), m.type || 'fan'); } };
  direct('Direct', 'Bienvenue sur La Course des Ketch ! Choisissez votre voiture et lancez la course.', 'commentateur');
  direct('Direct', 'Écrivez votre commentaire avec le bouton « Commenter » à droite.', 'commentateur');
  function majBande(dt) {
    var i = Math.floor(horlogePub / 6) % PUBLICITES.length;
    if (bandeSponsor && i !== sponsorBande) {
      sponsorBande = i; var sp = PUBLICITES[i];
      bandeSponsor.style.background = 'linear-gradient(90deg,' + sp.fond[0] + ',' + sp.fond[1] + ')';
      bandeSponsor.style.color = sp.texte;
      bandeSponsor.innerHTML = echapper(sp.nom) + (sp.ligne ? ' <small>' + echapper(sp.ligne) + '</small>' : '');
    }
    if (bandeDefile && !mouvementReduit) {
      var largeur = bandeDefile.scrollWidth, zone = bandeDefile.parentNode.clientWidth;
      positionFil -= dt * 70;
      if (positionFil < -largeur) positionFil = zone;
      bandeDefile.style.transform = 'translateX(' + positionFil.toFixed(1) + 'px)';
    }
    // Commentateur : il annonce ce qui se passe vraiment dans votre course.
    if (etat === 'course' && rivaux.length) {
      var rang = 1 + rivaux.filter(function (rv) { return rv.z > z; }).length;
      if (dernierRang && rang !== dernierRang && temps - dernierCommentaire > 4) {
        dernierCommentaire = temps;
        direct('Commentateur', rang < dernierRang ? (rang === 1 ? voiture.nom + ' prend la tête de la course !' : 'Belle remontée : ' + rangTexte(rang) + ' place pour ' + voiture.nom + ' !') : 'Aïe, ' + voiture.nom + ' recule en ' + rangTexte(rang) + ' position.');
      }
      dernierRang = rang;
    }
  }
  var boutonCommenter = document.getElementById('boutonCommenter'), formCommentaire = document.getElementById('formCommentaire');
  var champPseudo = document.getElementById('champPseudo'), champCommentaire = document.getElementById('champCommentaire');
  try { if (champPseudo) champPseudo.value = localStorage.getItem('ketch-pseudo') || ''; } catch (e) {}
  if (boutonCommenter) boutonCommenter.addEventListener('click', function () {
    formCommentaire.hidden = false; boutonCommenter.setAttribute('aria-expanded', 'true');
    (champPseudo.value ? champCommentaire : champPseudo).focus();
  });
  if (formCommentaire) {
    formCommentaire.addEventListener('submit', function (e) {
      e.preventDefault();
      var texte = champCommentaire.value.trim().replace(/\s+/g, ' ').slice(0, 120), pseudo = champPseudo.value.trim().slice(0, 16) || 'Fan';
      if (!texte) return;
      try { localStorage.setItem('ketch-pseudo', pseudo); } catch (e2) {}
      direct(pseudo, texte, 'fan');
      positionFil = Math.min(positionFil, 0);
      champCommentaire.value = ''; formCommentaire.hidden = true; boutonCommenter.setAttribute('aria-expanded', 'false');
      canvas.focus({ preventScroll: true });
    });
    formCommentaire.addEventListener('keydown', function (e) {
      e.stopPropagation(); // les touches tapées ne pilotent pas la voiture
      if (e.key === 'Escape') { formCommentaire.hidden = true; boutonCommenter.setAttribute('aria-expanded', 'false'); }
    });
  }

  // ---------- Les 3 compétitions : entraînement, Tournoi Sponsor, Tournoi international ----------
  // Dans la démo, les temps de tournoi restent sur l'appareil. Dans le jeu en ligne, ils partent au serveur
  // (anti-triche), qui sélectionne les 18 meilleurs, élimine chaque dimanche et verse les primes par M-PESA.
  var modeJeu = 'entrainement';
  var panneauModes = document.getElementById('panneauModes'), panneauTournoi = document.getElementById('panneauTournoi');
  var EPOQUE_SAISONS = Date.UTC(2026, 10, 16); // lundi 16 novembre 2026 : début du premier cycle de 5 semaines
  var CALENDRIER = [
    ['Semaine 1', 'Qualifications : toutes les équipes du pays', '16 équipes retenues'],
    ['Semaine 2', 'Championnat : 1re journée', 'points 25, 20, 16…'],
    ['Semaine 3', 'Championnat : 2e journée', 'points'],
    ['Semaine 4', 'Championnat : 3e journée', 'points'],
    ['Semaine 5', 'Championnat : dernière journée', '2 qualifiées → Coupe d\'Afrique']
  ];
  var PAYS_AFRIQUE = [['CD', 'RDC', '\uD83C\uDDE8\uD83C\uDDE9'], ['CG', 'Congo-Brazzaville', '\uD83C\uDDE8\uD83C\uDDEC'], ['AO', 'Angola', '\uD83C\uDDE6\uD83C\uDDF4'],
    ['ZM', 'Zambie', '\uD83C\uDDFF\uD83C\uDDF2'], ['ZW', 'Zimbabwe', '\uD83C\uDDFF\uD83C\uDDFC'], ['ZA', 'Afrique du Sud', '\uD83C\uDDFF\uD83C\uDDE6'],
    ['CM', 'Cameroun', '\uD83C\uDDE8\uD83C\uDDF2'], ['CI', "Côte d'Ivoire", '\uD83C\uDDE8\uD83C\uDDEE'], ['SN', 'Sénégal', '\uD83C\uDDF8\uD83C\uDDF3'],
    ['NG', 'Nigeria', '\uD83C\uDDF3\uD83C\uDDEC'], ['GH', 'Ghana', '\uD83C\uDDEC\uD83C\uDDED'], ['KE', 'Kenya', '\uD83C\uDDF0\uD83C\uDDEA'],
    ['TZ', 'Tanzanie', '\uD83C\uDDF9\uD83C\uDDFF'], ['MZ', 'Mozambique', '\uD83C\uDDF2\uD83C\uDDFF'], ['RW', 'Rwanda', '\uD83C\uDDF7\uD83C\uDDFC']];
  function lundiKin() {
    var d = new Date(jourKin() + 'T00:00:00Z');
    return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000);
  }
  function semaineTournoi() {
    var lundi = lundiKin(), n = Math.floor((lundi.getTime() - EPOQUE_SAISONS) / (7 * 86400000));
    return { lundi: lundi, indice: n, numero: ((n % 5) + 5) % 5 + 1, fin: lundi.getTime() + 7 * 86400000 - 3600000 };
  }
  function cleTournoi(mode) { return 'ketch-tournoi-' + mode + '-' + lundiKin().toISOString().slice(0, 10); }
  function lireTournoi(cle) { try { var v = JSON.parse(localStorage.getItem(cle) || 'null'); return v && v.temps ? v : null; } catch (e) { return null; } }
  function etapeTournoi(mode) { var n = semaineTournoi().indice; return mode === 'sponsor' ? ORDRE[((n % ORDRE.length) + ORDRE.length) % ORDRE.length] : 'boulevard'; }
  function majChronoTournoi() {
    var el = document.getElementById('tournoiChrono'); if (!el || panneauTournoi.hidden) return;
    var reste = Math.max(0, semaineTournoi().fin - Date.now()), j = Math.floor(reste / 86400000), h = Math.floor(reste / 3600000) % 24, m = Math.floor(reste / 60000) % 60;
    el.textContent = 'Clôture dans ' + j + ' j ' + String(h).padStart(2, '0') + ' h ' + String(m).padStart(2, '0') + ' min';
  }
  function ligne(b, span, em, actuelle) {
    return '<div class="tournoi-ligne' + (actuelle ? ' actuelle' : '') + '"><b>' + echapper(b) + '</b><span>' + echapper(span) + '</span><em>' + echapper(em) + '</em></div>';
  }
  function ouvrirTournoi(mode) {
    modeJeu = mode; quitterDefi();
    var st = semaineTournoi(), E2 = ETAPES[etapeTournoi(mode)], rec = lireTournoi(cleTournoi(mode));
    var titre = document.getElementById('tournoiTitre'), sous = document.getElementById('tournoiSous'), etapes = document.getElementById('tournoiEtapes');
    var epreuve = document.getElementById('tournoiEpreuve'), record = document.getElementById('tournoiRecord'), note = document.getElementById('tournoiNote');
    var texte = document.getElementById('boutonTournoiTexte'), sousBouton = document.getElementById('boutonTournoiSous'), paysBloc = document.getElementById('tournoiPays');
    if (mode === 'sponsor') {
      titre.textContent = 'Tournoi Sponsor · semaine ' + st.numero + ' / 5';
      sous.textContent = 'Championnat national par équipes de 4 pilotes. Temps de l\'équipe : la somme des temps de ses 4 pilotes. Clôture chaque dimanche à minuit (heure de Kinshasa).';
      etapes.innerHTML = CALENDRIER.map(function (c, i) { return ligne(c[0], c[1], c[2], i + 1 === st.numero); }).join('') +
        ligne('Primes', 'Chaque semaine, les 4 meilleures équipes', '20 $ chacune · M-PESA', false);
      epreuve.textContent = "Épreuve de la semaine : Étape " + E2.numero + ' · ' + E2.nom;
      texte.textContent = st.numero === 1 ? 'Jouer ma qualification' : 'Courir pour mon équipe';
      sousBouton.textContent = st.numero === 1 ? 'Votre meilleur temps compte pour votre équipe' : 'Réservé aux 16 équipes retenues';
      note.textContent = 'Démo : vous courez seul et votre temps reste sur cet appareil. Dans le jeu en ligne, votre temps s\'ajoute à ceux de vos 3 coéquipiers, chaque course est vérifiée par le serveur (anti-triche) et les 20 $ sont partagés entre les pilotes de l\'équipe, versés automatiquement par M-PESA. Aucune mise : le sponsor paie.';
      paysBloc.hidden = true;
    } else {
      titre.textContent = 'Tournoi international · Champion d\'Afrique';
      sous.textContent = 'Coupe d\'Afrique : les 2 premières équipes des championnats de 8 pays, soit 16 équipes, à élimination directe. Un tour par semaine.';
      etapes.innerHTML = ligne('Avant', 'Championnats nationaux (Tournoi Sponsor)', '2 qualifiées par pays', true) +
        ligne('Tour 1', 'Huitièmes de finale : 1er d\'un pays contre 2e d\'un autre', '16 → 8', false) +
        ligne('Tour 2', 'Quarts de finale', '8 → 4', false) +
        ligne('Tour 3', 'Demi-finales', '4 → 2', false) +
        ligne('Tour 4', 'Finale', "Champion d'Afrique", false) +
        '<p class="tournoi-note">' + PAYS_AFRIQUE.map(function (p) { return p[2] + ' ' + echapper(p[1]); }).join(' · ') + '</p>';
      epreuve.textContent = 'Épreuve continentale : Étape ' + E2.numero + ' · ' + E2.nom;
      texte.textContent = "S'entraîner sur l'épreuve continentale"; sousBouton.textContent = 'Représentez votre pays';
      note.textContent = 'Démo : votre temps reste sur cet appareil. Dans le jeu en ligne, chaque match oppose deux équipes de 4 pilotes : le plus petit temps total passe au tour suivant.';
      paysBloc.hidden = false;
      var choix = document.getElementById('choixPays'), sauve = null;
      try { sauve = localStorage.getItem('ketch-pays'); } catch (e) {}
      if (!choix.options.length) choix.innerHTML = PAYS_AFRIQUE.map(function (p) { return '<option value="' + p[0] + '">' + p[2] + ' ' + echapper(p[1]) + '</option>'; }).join('');
      if (sauve) choix.value = sauve;
    }
    record.textContent = rec ? 'Votre meilleur temps cette semaine : ' + chrono(rec.temps) + ' (' + rec.voiture + ', ' + rec.score.toLocaleString('fr-FR') + ' pts)' : "Pas encore de temps cette semaine.";
    [panneauModes, panneauDebut, panneauFin, panneauClassement].forEach(function (p) { p.hidden = true; });
    panneauTournoi.hidden = false; etat = 'accueil';
    document.getElementById('boutonTournoi').disabled = false;
    majChronoTournoi();
    tournoiEnLigne(mode);
  }
  setInterval(majChronoTournoi, 20000);
  var choixPays = document.getElementById('choixPays');
  if (choixPays) choixPays.addEventListener('change', function () { try { localStorage.setItem('ketch-pays', choixPays.value); } catch (e) {} });
  Array.prototype.forEach.call(document.querySelectorAll('[data-mode]'), function (b) {
    b.addEventListener('click', function () {
      var mode = b.getAttribute('data-mode');
      if (mode === 'entrainement') { modeJeu = 'entrainement'; panneauModes.hidden = true; panneauDebut.hidden = false; vueGarage = voiture; majVoitures(); majRecords(); majDefi(); if (boutonLancer) boutonLancer.focus({ preventScroll: true }); }
      else ouvrirTournoi(mode);
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-retour-modes]'), function (b) {
    b.addEventListener('click', function () {
      modeJeu = 'entrainement'; quitterDefi();
      [panneauDebut, panneauTournoi, panneauFin, panneauClassement].forEach(function (p) { p.hidden = true; });
      panneauModes.hidden = false; etat = 'accueil'; musiqueArreter();
    });
  });
  var boutonTournoi = document.getElementById('boutonTournoi');
  if (boutonTournoi) boutonTournoi.addEventListener('click', function () { lancer(etapeTournoiServeur || etapeTournoi(modeJeu)); });

  // ---------- Affrontement entre amis : 2 ou 3 joueurs sur le même appareil, chacun son tour ----------
  // Même étape, mêmes performances (Ketch), même trafic : seul le pilotage compte.
  // Les joueurs suivants voient les fantômes de ceux qui ont déjà couru, avec leur nom.
  var COULEURS_AMIS = ['#7FD8FF', '#FF9A3D', '#B07CFF'];
  function fantomesAmis() {
    if (modeJeu === 'direct') return fantomesDirect();
    if (modeJeu !== 'duel' || !duel || etat === 'accueil') return [];
    return duel.resultats.map(function (r, k) {
      var pts = r.trajet, f = temps / 0.05, i = Math.min(pts.length - 2, Math.max(0, Math.floor(f))), a = pts[i], b = pts[i + 1] || a, u = Math.min(1, f - i);
      if (f >= pts.length - 1) { a = b = pts[pts.length - 1]; u = 0; }
      return { nom: r.nom, couleur: COULEURS_AMIS[k % 3], z: (a[0] + (b[0] - a[0]) * u) / 100, x: (a[1] + (b[1] - a[1]) * u) / 100 / E.demi };
    });
  }
  var panneauDuel = document.getElementById('panneauDuel'), corpsDuel = document.getElementById('corpsDuel');
  var nbJoueursDuel = 2;
  function montrerDuel(html) {
    [panneauModes, panneauDebut, panneauFin, panneauClassement, panneauTournoi, panneauCompte].forEach(function (p) { p.hidden = true; });
    corpsDuel.innerHTML = html; panneauDuel.hidden = false; etat = 'accueil';
  }
  function configDuel() {
    modeJeu = 'duel'; quitterDefi();
    var noms = (duel && duel.joueurs.map(function (j) { return j.nom; })) || [];
    var options = ORDRE.map(function (id) { var e = ETAPES[id]; return '<option value="' + id + '"' + (duel && duel.etape === id ? ' selected' : '') + '>' + e.numero + ' · ' + echapper(e.nom) + ' (' + NOMS_NIVEAUX[e.niveau] + ')</option>'; }).join('');
    montrerDuel('<div class="duel-config">' +
      '<div class="duel-nombre" role="group" aria-label="Nombre de joueurs"><button type="button" data-nb="2" aria-pressed="' + (nbJoueursDuel === 2) + '">2 joueurs</button><button type="button" data-nb="3" aria-pressed="' + (nbJoueursDuel === 3) + '">3 joueurs</button></div>' +
      [0, 1, 2].map(function (k) { return '<label' + (k >= nbJoueursDuel ? ' hidden' : '') + ' data-joueur="' + k + '"><span style="color:' + COULEURS_AMIS[k] + '">Joueur ' + (k + 1) + '</span><input id="nomDuel' + k + '" maxlength="14" value="' + echapper(noms[k] || '') + '" placeholder="Prénom"></label>'; }).join('') +
      '<label><span>Étape</span><select id="etapeDuel">' + options + '</select></label>' +
      '<button type="button" class="jeu-lancer" id="commencerDuel"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg><span>Commencer l\'affrontement</span><small>Chacun son tour, sur ce téléphone</small></button>' +
      '<button type="button" class="jeu-bouton duel-distance" id="boutonDistance">À distance : chacun sur son téléphone, en même temps</button></div>');
    document.getElementById('boutonDistance').addEventListener('click', configDirect);
    Array.prototype.forEach.call(corpsDuel.querySelectorAll('[data-nb]'), function (b) {
      b.addEventListener('click', function () { nbJoueursDuel = +b.getAttribute('data-nb'); var gardes = [0, 1, 2].map(function (k) { return document.getElementById('nomDuel' + k).value; }); configDuel(); gardes.forEach(function (v, k) { document.getElementById('nomDuel' + k).value = v; }); });
    });
    document.getElementById('commencerDuel').addEventListener('click', function () {
      var joueurs = [];
      for (var k = 0; k < nbJoueursDuel; k++) joueurs.push({ nom: (document.getElementById('nomDuel' + k).value.trim() || 'Joueur ' + (k + 1)).slice(0, 14) });
      duel = { joueurs: joueurs, etape: document.getElementById('etapeDuel').value, resultats: [] };
      tourDuel();
    });
    corpsDuel.addEventListener('keydown', function (e) { e.stopPropagation(); });
  }
  function listeResultats() {
    return duel.resultats.map(function (r, k) { return '<li><b style="color:' + COULEURS_AMIS[k] + '">' + echapper(r.nom) + '</b><span>' + chrono(r.temps) + ' · ' + r.score.toLocaleString('fr-FR') + ' pts</span></li>'; }).join('');
  }
  function tourDuel() {
    var k = duel.resultats.length, j = duel.joueurs[k], E2 = ETAPES[duel.etape];
    montrerDuel('<div class="duel-tour"><p class="duel-qui">Au tour de <b style="color:' + COULEURS_AMIS[k] + '">' + echapper(j.nom) + '</b></p>' +
      '<p class="tournoi-sous">Joueur ' + (k + 1) + ' sur ' + duel.joueurs.length + ' · ' + echapper(E2.nom) + ' · ' + (k ? 'les fantômes des joueurs précédents roulent avec vous' : 'les autres verront votre fantôme') + '. Passez-lui le téléphone !</p>' +
      (k ? '<ol class="duel-resultats">' + listeResultats() + '</ol>' : '') +
      '<button type="button" class="jeu-lancer" id="partirDuel"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg><span>C\'est parti, ' + echapper(j.nom) + ' !</span><small>Voitures équilibrées, même trafic</small></button></div>');
    document.getElementById('partirDuel').addEventListener('click', function () { lancer(duel.etape); });
  }
  function finTourDuel(score) {
    var j = duel.joueurs[duel.resultats.length];
    duel.resultats.push({ nom: j.nom, temps: temps, score: score, trajet: trajet.slice() });
    direct('Commentateur', j.nom + ' boucle ' + ETAPES[duel.etape].nom + ' en ' + chrono(temps) + ' !');
    if (duel.resultats.length < duel.joueurs.length) { tourDuel(); return; }
    var classes = duel.resultats.map(function (r, k) { return { r: r, k: k }; }).sort(function (a, b) { return a.r.temps - b.r.temps || b.r.score - a.r.score; });
    var gagnant = classes[0].r;
    direct('Commentateur', gagnant.nom + ' remporte l\'affrontement sur ' + ETAPES[duel.etape].nom + ' !');
    if (!mouvementReduit) emettre(160, VX, -10, 'confetti');
    montrerDuel('<div class="duel-tour"><p class="duel-qui">\uD83C\uDFC6 <b style="color:' + COULEURS_AMIS[classes[0].k] + '">' + echapper(gagnant.nom) + '</b> gagne !</p>' +
      '<ol class="duel-podium">' + classes.map(function (c, i) { return '<li class="place' + (i + 1) + '"><span class="rang">' + rangTexte(i + 1) + '</span><b style="color:' + COULEURS_AMIS[c.k] + '">' + echapper(c.r.nom) + '</b><span>' + chrono(c.r.temps) + (i ? ' (+' + secondes(c.r.temps - gagnant.temps) + ')' : '') + '</span></li>'; }).join('') + '</ol>' +
      '<div class="jeu-actions"><button type="button" class="jeu-bouton" id="revancheDuel">Revanche</button><button type="button" class="jeu-lien" id="changerDuel">Changer d\'étape ou de joueurs</button><button type="button" class="jeu-lien" data-retour-modes>Compétitions</button></div></div>');
    document.getElementById('revancheDuel').addEventListener('click', function () { duel.resultats = []; tourDuel(); });
    document.getElementById('changerDuel').addEventListener('click', configDuel);
    corpsDuel.querySelector('[data-retour-modes]').addEventListener('click', function () { modeJeu = 'entrainement'; duel = null; panneauDuel.hidden = true; panneauModes.hidden = false; musiqueArreter(); });
  }
  // ---------- Affrontement à distance : 2 ou 3 amis, chacun sur son téléphone, EN MÊME TEMPS ----------
  // Passe par le serveur (Socket.IO) : salon avec un code de 5 caractères, départ commun,
  // chacun voit les autres rouler en direct (fantômes avec leur pseudo).
  var salon = null, socketJeu = null, autresDirect = {}, prochainEnvoi = 0, attenteArrivee = false, surPodium = false;
  function chargerSocket() {
    if (window.io) return Promise.resolve();
    return new Promise(function (ok, ko) {
      var sc = document.createElement('script'); sc.src = SERVEUR + '/socket.io/socket.io.js';
      sc.onload = ok; sc.onerror = function () { ko(new Error('Serveur injoignable.')); }; document.head.appendChild(sc);
    });
  }
  function connecterDirect() {
    if (socketJeu && socketJeu.connected) return Promise.resolve(socketJeu);
    return chargerSocket().then(function () {
      return new Promise(function (ok, ko) {
        socketJeu = window.io(SERVEUR, { auth: { token: session.jeton }, transports: ['websocket', 'polling'] });
        socketJeu.once('connect', function () { ok(socketJeu); });
        socketJeu.once('connect_error', function () { ko(new Error('Connexion impossible : reconnectez-vous à votre compte.')); });
        socketJeu.on('salon:etat', function (e) { salon = e; if (etat === 'accueil' && !panneauDuel.hidden && !surPodium) ecranSalon(); });
        socketJeu.on('salon:pos', function (p) { autresDirect[p.id] = { z: p.z, x: p.x, v: p.v, recu: performance.now() }; });
        socketJeu.on('salon:depart', function (d) {
          modeJeu = 'direct'; autresDirect = {}; attenteArrivee = false; surPodium = false; prochainEnvoi = 0;
          direct('Commentateur', 'Départ en direct sur ' + (ETAPES[d.etape] || E).nom + ' : ' + salon.joueurs.map(function (j) { return j.pseudo; }).join(', ') + ' !');
          setTimeout(function () { lancer(ETAPES[d.etape] ? d.etape : ORDRE[0]); }, d.dans);
        });
        socketJeu.on('salon:resultats', resultatsDirect);
        socketJeu.on('disconnect', function () { if (salon && etat !== 'course') { salon = null; if (!panneauDuel.hidden) configDirect('Connexion perdue avec le serveur.'); } });
      });
    });
  }
  function demander(ev, d) { return new Promise(function (ok) { socketJeu.emit(ev, d || {}, ok); }); }
  function couleurDe(id) { var k = salon ? salon.joueurs.map(function (j) { return j.id; }).indexOf(id) : 0; return COULEURS_AMIS[Math.max(0, k) % 3]; }
  function fantomesDirect() {
    if (!salon || etat === 'accueil') return [];
    var maintenant = performance.now(), moi = session && session.joueur && session.joueur.id;
    return salon.joueurs.filter(function (j) { return j.id !== moi && autresDirect[j.id]; }).map(function (j) {
      var a = autresDirect[j.id], dt = Math.min(0.5, (maintenant - a.recu) / 1000);
      return { nom: j.pseudo, couleur: couleurDe(j.id), z: Math.min(E.longueur + 60, a.z + a.v * dt), x: a.x };
    });
  }
  function envoyerPosition() {
    if (!socketJeu || etat !== 'course' || temps < prochainEnvoi) return;
    prochainEnvoi = temps + 0.1;
    socketJeu.volatile.emit('salon:position', { z: Math.round(z * 10) / 10, x: Math.round(x * 1000) / 1000, v: Math.round(v * 10) / 10 });
  }
  function optionsEtapes(choisie) {
    return ORDRE.map(function (id) { var e = ETAPES[id]; return '<option value="' + id + '"' + (choisie === id ? ' selected' : '') + '>' + e.numero + ' · ' + echapper(e.nom) + ' (' + NOMS_NIVEAUX[e.niveau] + ')</option>'; }).join('');
  }
  function configDirect(erreur) {
    modeJeu = 'direct'; quitterDefi();
    if (!SERVEUR) {
      montrerDuel('<div class="duel-tour"><p class="duel-qui">À distance</p><p class="tournoi-sous">Chaque ami joue sur son propre téléphone, en même temps, et voit les autres rouler en direct. Ce mode s\'ouvrira dès la mise en ligne du serveur G-Challenge.</p><div class="jeu-actions"><button type="button" class="jeu-lien" id="retourLocal">Jouer sur ce téléphone</button></div></div>');
      document.getElementById('retourLocal').addEventListener('click', configDuel); return;
    }
    if (!session) {
      montrerDuel('<div class="duel-tour"><p class="duel-qui">À distance</p><p class="tournoi-sous">Chaque joueur doit avoir un compte G-Challenge (gratuit) pour rejoindre un salon.</p><div class="jeu-actions"><button type="button" class="jeu-bouton" id="allerCompte">Se connecter ou s\'inscrire</button><button type="button" class="jeu-lien" id="retourLocal">Jouer sur ce téléphone</button></div></div>');
      document.getElementById('allerCompte').addEventListener('click', function () { panneauDuel.hidden = true; ouvrirCompte(); });
      document.getElementById('retourLocal').addEventListener('click', configDuel); return;
    }
    montrerDuel('<div class="duel-config"><p class="tournoi-sous" style="margin:0">Créez un salon et envoyez le code à vos amis, ou entrez le code reçu. 2 ou 3 joueurs, gratuit.</p>' +
      (erreur ? '<p class="fin-envoi erreur" role="alert">' + echapper(erreur) + '</p>' : '') +
      '<label><span>Étape</span><select id="etapeDirect">' + optionsEtapes(etapeChoisie) + '</select></label>' +
      '<button type="button" class="jeu-lancer" id="creerSalon"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg><span>Créer un salon</span><small>Vous recevrez un code à partager</small></button>' +
      '<label><span>Code reçu</span><input id="codeSalon" maxlength="5" autocapitalize="characters" placeholder="ABCDE" style="text-transform:uppercase;letter-spacing:4px"></label>' +
      '<div class="jeu-actions"><button type="button" class="jeu-bouton" id="rejoindreSalon">Rejoindre</button><button type="button" class="jeu-lien" id="retourLocal">Jouer sur ce téléphone</button></div></div>');
    corpsDuel.addEventListener('keydown', function (e) { e.stopPropagation(); });
    function essayer(ev, donnees) {
      connecterDirect().then(function () { return demander(ev, donnees); })
        .then(function (rep) { if (rep && rep.erreur) configDirect(rep.erreur); })
        .catch(function (e) { configDirect(e.message); });
    }
    if (codeInvite) {
      document.getElementById('codeSalon').value = codeInvite;
      var c0 = codeInvite; codeInvite = '';
      essayer('salon:rejoindre', { code: c0 });
    }
    document.getElementById('creerSalon').addEventListener('click', function () { essayer('salon:creer', { etape: document.getElementById('etapeDirect').value }); });
    document.getElementById('rejoindreSalon').addEventListener('click', function () { essayer('salon:rejoindre', { code: document.getElementById('codeSalon').value }); });
    document.getElementById('retourLocal').addEventListener('click', function () { quitterSalon(); configDuel(); });
  }
  // Lien « Rejoindre ma course » : ouvre le jeu directement sur le salon (?salon=CODE).
  function lienSalon(code) { return location.origin + location.pathname + '?salon=' + code + '#jouer'; }
  function lienWhatsApp(code) {
    return 'https://wa.me/?text=' + encodeURIComponent('\uD83C\uDFC1 Viens courir contre moi sur La Course des Ketch ! Rejoins ma course : ' + lienSalon(code) + ' (code ' + code + ')');
  }
  var codeInvite = '';
  try { codeInvite = (new URLSearchParams(location.search).get('salon') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); } catch (e) {}
  function quitterSalon() { if (socketJeu && salon) socketJeu.emit('salon:quitter', {}, function () {}); salon = null; }
  function ecranSalon() {
    if (!salon) return configDirect();
    var moi = session.joueur.id, hote = salon.hote === moi, e2 = ETAPES[salon.etape] || ETAPES[ORDRE[0]];
    var joueurs = salon.joueurs.map(function (j) { return '<li><b style="color:' + couleurDe(j.id) + '">' + echapper(j.pseudo) + (j.id === moi ? ' (vous)' : '') + '</b><span>' + (j.id === salon.hote ? 'hôte' : 'prêt') + (attenteArrivee ? ' · ' + (j.arrive ? 'arrivé ' + chrono(j.temps_ms / 1000) : 'en course…') : '') + '</span></li>'; }).join('');
    if (attenteArrivee) {
      montrerDuel('<div class="duel-tour"><p class="duel-qui">Arrivé ! En attente des autres…</p><ol class="duel-resultats">' + joueurs + '</ol></div>'); return;
    }
    montrerDuel('<div class="duel-tour"><p class="tournoi-sous" style="margin:0">Code du salon, à envoyer à vos amis :</p><p class="duel-code">' + salon.code + '</p>' +
      '<ol class="duel-resultats">' + joueurs + '</ol>' +
      (hote ? '<label class="duel-ligne"><span>Étape</span><select id="etapeSalon">' + optionsEtapes(salon.etape) + '</select></label>' +
        '<button type="button" class="jeu-lancer" id="lancerSalon"' + (salon.joueurs.length < 2 ? ' disabled' : '') + '><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15l12-7.5z"/></svg><span>' + (salon.joueurs.length < 2 ? 'En attente d\'un ami…' : 'Lancer la course') + '</span><small>' + echapper(e2.nom) + ' · ' + salon.joueurs.length + ' / 3 joueurs</small></button>'
        : '<p class="tournoi-sous">Étape : <b>' + echapper(e2.nom) + '</b>. L\'hôte lance la course.</p>') +
      '<div class="jeu-actions"><a class="jeu-bouton duel-whatsapp" id="inviterSalon" target="_blank" rel="noopener" href="' + lienWhatsApp(salon.code) + '">Inviter sur WhatsApp</a><button type="button" class="jeu-lien" id="quitterSalon">Quitter le salon</button></div></div>');
    if (hote) {
      document.getElementById('etapeSalon').addEventListener('change', function (ev) { demander('salon:etape', { etape: ev.target.value }); });
      document.getElementById('lancerSalon').addEventListener('click', function () { demander('salon:lancer').then(function (rep) { if (rep && rep.erreur) direct('Salon', rep.erreur, 'commentateur'); }); });
    }
    document.getElementById('quitterSalon').addEventListener('click', function () { quitterSalon(); configDirect(); });
  }
  function finDirect(total) {
    attenteArrivee = true;
    demander('salon:arrivee', { temps_ms: Math.round(temps * 1000), score: total });
    direct('Commentateur', (session.joueur.pseudo || 'Vous') + ' franchit la ligne en ' + chrono(temps) + ' !');
    ecranSalon();
  }
  function resultatsDirect(r) {
    attenteArrivee = false;
    var moi = session.joueur.id, premier = r.classement[0];
    if (premier) direct('Commentateur', premier.pseudo + ' remporte la course en direct sur ' + ((ETAPES[r.etape] || E).nom) + ' !');
    if (premier && premier.id === moi && !mouvementReduit) emettre(160, VX, -10, 'confetti');
    if (etat === 'course') return; // encore en route (délai maximal dépassé) : on verra le salon à l'arrivée
    surPodium = true;
    montrerDuel('<div class="duel-tour"><p class="duel-qui">\uD83C\uDFC6 <b style="color:' + couleurDe(premier.id) + '">' + echapper(premier.pseudo) + '</b> gagne !</p>' +
      '<ol class="duel-podium">' + r.classement.map(function (j, i) { return '<li class="place' + (i + 1) + '"><span class="rang">' + rangTexte(i + 1) + '</span><b style="color:' + couleurDe(j.id) + '">' + echapper(j.pseudo) + (j.id === moi ? ' (vous)' : '') + '</b><span>' + (j.temps_ms ? chrono(j.temps_ms / 1000) + (i && premier.temps_ms ? ' (+' + secondes((j.temps_ms - premier.temps_ms) / 1000) + ')' : '') : 'abandon') + '</span></li>'; }).join('') + '</ol>' +
      '<div class="jeu-actions"><button type="button" class="jeu-bouton" id="revancheDirect">Revanche</button></div></div>');
    document.getElementById('revancheDirect').addEventListener('click', function () { surPodium = false; ecranSalon(); });
  }

  var boutonDuel = document.getElementById('boutonDuel');
  if (codeInvite) setTimeout(function () {
    var jeu = document.getElementById('ecranJeu');
    if (jeu) jeu.scrollIntoView({ block: 'center' });
    nbJoueursDuel = 2; configDirect();
  }, 300);
  if (boutonDuel) boutonDuel.addEventListener('click', function () { nbJoueursDuel = 2; configDuel(); });
  document.getElementById('retourDuel').addEventListener('click', function () { modeJeu = 'entrainement'; duel = null; panneauDuel.hidden = true; panneauModes.hidden = false; });
  // Radio : un clic sur le titre passe à la chanson suivante (automatique selon l'étape, puis les 4 chansons).
  var boutonRadio = document.getElementById('boutonRadio');
  if (boutonRadio) boutonRadio.addEventListener('click', function () {
    radio = ORDRE_RADIO[(ORDRE_RADIO.indexOf(radio) + 1) % ORDRE_RADIO.length];
    try { localStorage.setItem('ketch-radio', radio); } catch (e) {}
    annoncerChanson();
    if (musique.joue) { musique.pas = 0; direct('Radio Kin', chansonCourante().titre + ' · ' + chansonCourante().style, 'commentateur'); }
  });
  annoncerChanson();

  // ---------- En ligne : compte, équipe, envoi des courses, vrais tournois ----------
  // Adresse du serveur : balise <meta name="gchallenge-serveur" content="https://…onrender.com"> de la page
  // (vide tant que le serveur n'est pas en ligne : la démo reste alors 100 % locale).
  var SERVEUR = '';
  // L'adresse de la page fait foi. localStorage ne sert qu'aux essais, quand la page n'en déclare aucune :
  // personne ne peut ainsi détourner un joueur (et son jeton) vers un faux serveur.
  try {
    SERVEUR = ((document.querySelector('meta[name="gchallenge-serveur"]') || {}).content || '').trim();
    if (!SERVEUR) SERVEUR = (localStorage.getItem('ketch-serveur') || '').trim();
    SERVEUR = SERVEUR.replace(/\/+$/, '');
    if (SERVEUR && !/^https:\/\/|^http:\/\/localhost(:\d+)?$/.test(SERVEUR)) SERVEUR = '';
  } catch (e) { SERVEUR = ''; }
  var session = null; // { jeton, joueur }
  try { session = JSON.parse(localStorage.getItem('ketch-session') || 'null'); } catch (e) {}
  function apiJeu(methode, chemin, corps) {
    if (!SERVEUR) return Promise.reject(new Error('Serveur non configuré.'));
    return fetch(SERVEUR + chemin, {
      method: methode,
      headers: Object.assign({ 'Content-Type': 'application/json' }, session ? { Authorization: 'Bearer ' + session.jeton } : {}),
      body: corps ? JSON.stringify(corps) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && session) { session = null; try { localStorage.removeItem('ketch-session'); } catch (e) {} majCompte(); }
        if (!r.ok) throw new Error(j && j.erreur ? j.erreur.message : 'Erreur ' + r.status);
        return j;
      });
    });
  }
  var MOTIFS = { temps_impossible: 'temps impossible', temps_incoherent_avec_trajet: 'trajet incomplet', depart_hors_zone: 'départ hors zone',
    arrivee_hors_zone: 'arrivée hors zone', vitesse_impossible: 'vitesse impossible', trajet_trop_court: 'trajet trop court' };
  function envoyerCourse(etapeId, t, points) {
    var el = document.getElementById('finEnvoi');
    if (!el) return;
    if (!SERVEUR || !session) { el.hidden = true; return; }
    el.hidden = false; el.className = 'fin-envoi'; el.textContent = 'Envoi de votre course au serveur…';
    apiJeu('POST', '/courses', { circuit: 'W_' + etapeId, temps_ms: Math.round(t * 1000), intervalle_ms: 50, trajet: points })
      .then(function (r) {
        el.className = 'fin-envoi ' + (r.valide ? 'ok' : 'erreur');
        el.textContent = r.valide ? 'Course enregistrée sur le serveur' + (r.rang ? ' · ' + r.rang + 'e du classement de l\'étape' : '') + ' · elle compte pour votre équipe si c\'est l\'épreuve de la semaine.'
          : 'Course refusée par l\'anti-triche (' + (MOTIFS[r.motif_rejet] || r.motif_rejet) + ').';
      })
      .catch(function (e) { el.className = 'fin-envoi erreur'; el.textContent = 'Course non envoyée : ' + e.message; });
  }
  var panneauCompte = document.getElementById('panneauCompte'), boutonCompte = document.getElementById('boutonCompte');
  var ongletCompte = 'connexion';
  function msg(id, texte, ok) { var el = document.getElementById(id); if (el) { el.textContent = texte; el.className = 'compte-message' + (ok === undefined ? '' : ok ? ' ok' : ' erreur'); } }
  function majCompte() {
    if (boutonCompte) {
      boutonCompte.hidden = !SERVEUR;
      boutonCompte.textContent = session ? session.joueur.pseudo : 'Mon compte';
      boutonCompte.classList.toggle('connecte', !!session);
    }
    document.getElementById('blocAcces').hidden = !!session;
    document.getElementById('blocProfil').hidden = !session;
    if (session) {
      document.getElementById('profilNom').textContent = session.joueur.pseudo;
      document.getElementById('profilDetail').textContent = 'Pays : ' + session.joueur.pays + ' · vos courses de la démo sont envoyées au serveur et vérifiées par l\'anti-triche.';
      majVerif();
    }
  }
  // Vérification du numéro par SMS : obligatoire pour recevoir une prime M-PESA.
  function majVerif() {
    var bloc = document.getElementById('blocVerif');
    if (!bloc || !session) return;
    bloc.hidden = false;
    var ok = !!session.joueur.telephone_verifie;
    var etat = document.getElementById('verifEtat');
    etat.textContent = ok ? '\u2714 Numéro vérifié : vous pouvez recevoir les primes M-PESA.' : 'Numéro non vérifié : vérifiez-le pour recevoir les primes M-PESA.';
    etat.className = 'compte-titre' + (ok ? ' verif-ok' : '');
    document.getElementById('boutonCode').hidden = ok;
    if (ok) document.getElementById('formCode').hidden = true;
  }
  function rafraichirMoi() {
    if (!session) return;
    apiJeu('GET', '/joueurs/moi').then(function (moi) {
      session.joueur.telephone_verifie = moi.telephone_verifie;
      try { localStorage.setItem('ketch-session', JSON.stringify(session)); } catch (e) {}
      majVerif();
    }).catch(function () {});
  }
  document.getElementById('boutonCode').addEventListener('click', function () {
    var b = this; b.disabled = true;
    apiJeu('POST', '/joueurs/telephone/code').then(function (r) {
      msg('messageVerif', 'Code envoyé par SMS au ' + r.telephone_masque + '. Il est valable 10 minutes.', true);
      document.getElementById('formCode').hidden = false; document.getElementById('champCode').focus();
    }).catch(function (e) { msg('messageVerif', e.message, false); }).then(function () { setTimeout(function () { b.disabled = false; }, 60000); });
  });
  document.getElementById('formCode').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = document.getElementById('champCode').value.replace(/\D/g, '');
    apiJeu('POST', '/joueurs/telephone/verifier', { code: code }).then(function () {
      session.joueur.telephone_verifie = true;
      try { localStorage.setItem('ketch-session', JSON.stringify(session)); } catch (e2) {}
      msg('messageVerif', 'Merci ! Votre numéro est vérifié.', true); majVerif();
    }).catch(function (err) { msg('messageVerif', err.message, false); });
  });
  document.getElementById('formCode').addEventListener('keydown', function (e) { e.stopPropagation(); });
  function choisirOnglet(o) {
    ongletCompte = o;
    Array.prototype.forEach.call(document.querySelectorAll('[data-onglet]'), function (b) { b.setAttribute('aria-selected', b.getAttribute('data-onglet') === o ? 'true' : 'false'); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-champ="inscription"]'), function (l) { l.hidden = o !== 'inscription'; });
    document.getElementById('libelleIdentifiant').textContent = o === 'inscription' ? 'Téléphone (ex. 243812345678)' : 'Pseudo ou téléphone';
    document.getElementById('champMotDePasse').autocomplete = o === 'inscription' ? 'new-password' : 'current-password';
    document.getElementById('boutonAcces').textContent = o === 'inscription' ? "S'inscrire" : 'Se connecter';
    msg('messageAcces', '');
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-onglet]'), function (b) { b.addEventListener('click', function () { choisirOnglet(b.getAttribute('data-onglet')); }); });
  function chargerEquipes() {
    var liste = document.getElementById('listeEquipes');
    apiJeu('GET', '/equipes').then(function (equipes) {
      liste.textContent = '';
      if (!equipes.length) { liste.innerHTML = '<p class="tournoi-note">Aucune équipe : créez la vôtre, puis donnez le code à vos 3 coéquipiers.</p>'; return; }
      equipes.forEach(function (e) {
        var d = document.createElement('div'); d.className = 'equipe-ligne';
        d.innerHTML = '<span><b>' + echapper(e.nom) + '</b> · ' + e.membres.map(function (m) { return echapper(m.pseudo); }).join(', ') + ' (' + e.membres.length + '/' + e.taille_max + ')</span><span>code <code>' + echapper(e.code_invitation) + '</code></span>';
        liste.appendChild(d);
      });
    }).catch(function (e) { liste.textContent = e.message; });
  }
  function ouvrirCompte() {
    [panneauModes, panneauDebut, panneauFin, panneauClassement, panneauTournoi].forEach(function (p) { p.hidden = true; });
    panneauCompte.hidden = false; majCompte(); rafraichirMoi();
    var sel = document.getElementById('champPaysCompte');
    if (!sel.options.length) {
      apiJeu('GET', '/pays').then(function (pays) {
        pays.filter(function (p) { return p.continent === 'AF'; }).forEach(function (p) { var o = document.createElement('option'); o.value = p.code; o.textContent = p.nom; sel.appendChild(o); });
        sel.value = 'CD';
      }).catch(function () {});
    }
    if (session) chargerEquipes();
  }
  if (boutonCompte) boutonCompte.addEventListener('click', ouvrirCompte);
  document.getElementById('retourCompte').addEventListener('click', function () { panneauCompte.hidden = true; panneauModes.hidden = false; });
  document.getElementById('formAcces').addEventListener('submit', function (e) {
    e.preventDefault(); e.stopPropagation();
    var ident = document.getElementById('champIdentifiant').value.trim(), mdp = document.getElementById('champMotDePasse').value;
    var appel = ongletCompte === 'inscription'
      ? apiJeu('POST', '/joueurs/inscription', { pseudo: document.getElementById('champPseudoCompte').value.trim(), telephone: ident, pays: document.getElementById('champPaysCompte').value, mot_de_passe: mdp })
      : apiJeu('POST', '/joueurs/connexion', { identifiant: ident, mot_de_passe: mdp });
    msg('messageAcces', 'Un instant…');
    appel.then(function (r) {
      session = { jeton: r.jeton, joueur: r.joueur };
      try { localStorage.setItem('ketch-session', JSON.stringify(session)); localStorage.setItem('ketch-pays', r.joueur.pays); } catch (e2) {}
      document.getElementById('champMotDePasse').value = '';
      majCompte(); chargerEquipes();
      direct('Direct', session.joueur.pseudo + ' est connecté : ses courses comptent maintenant pour les tournois.', 'commentateur');
    }).catch(function (err) { msg('messageAcces', err.message, false); });
  });
  document.getElementById('formCreerEquipe').addEventListener('submit', function (e) {
    e.preventDefault();
    apiJeu('POST', '/equipes', { nom: document.getElementById('champNomEquipe').value.trim(), taille_max: 4 })
      .then(function (eq) { msg('messageEquipe', 'Équipe créée. Donnez le code ' + eq.code_invitation + ' à vos 3 coéquipiers.', true); document.getElementById('champNomEquipe').value = ''; chargerEquipes(); })
      .catch(function (err) { msg('messageEquipe', err.message, false); });
  });
  document.getElementById('formRejoindre').addEventListener('submit', function (e) {
    e.preventDefault();
    apiJeu('POST', '/equipes/rejoindre', { code: document.getElementById('champCodeEquipe').value.trim() })
      .then(function (eq) { msg('messageEquipe', 'Vous avez rejoint ' + eq.nom + '.', true); document.getElementById('champCodeEquipe').value = ''; chargerEquipes(); })
      .catch(function (err) { msg('messageEquipe', err.message, false); });
  });
  document.getElementById('boutonDeconnexionJeu').addEventListener('click', function () {
    session = null; try { localStorage.removeItem('ketch-session'); } catch (e) {}
    majCompte(); choisirOnglet('connexion');
  });
  ['formAcces', 'formCreerEquipe', 'formRejoindre'].forEach(function (id) {
    document.getElementById(id).addEventListener('keydown', function (e) { e.stopPropagation(); }); // les touches ne pilotent pas la voiture
  });
  majCompte();

  // Tournois réels (serveur en ligne) : remplace le calendrier de démonstration.
  var etapeTournoiServeur = null;
  function tournoiEnLigne(mode) {
    etapeTournoiServeur = null;
    if (!SERVEUR) return;
    var titre = document.getElementById('tournoiTitre'), sous = document.getElementById('tournoiSous'), etapes = document.getElementById('tournoiEtapes');
    var epreuve = document.getElementById('tournoiEpreuve'), note = document.getElementById('tournoiNote'), bouton = document.getElementById('boutonTournoi');
    var texte = document.getElementById('boutonTournoiTexte'), sousBouton = document.getElementById('boutonTournoiSous');
    var pays = (session && session.joueur.pays) || (function () { try { return localStorage.getItem('ketch-pays'); } catch (e) { return null; } })() || 'CD';
    if (mode === 'sponsor') {
      apiJeu('GET', '/tournois/championnats/' + pays).then(function (c) {
        var sem = c.semaines.find(function (x) { return x.numero === c.semaine_courante; });
        titre.textContent = c.nom + ' · semaine ' + (c.semaine_courante || c.semaines.length) + ' / ' + c.semaines.length;
        sous.textContent = 'Sponsor : ' + c.sponsor + ' · ' + c.nb_equipes + ' équipes de ' + c.taille_equipe + ' · chaque semaine ' + c.primes_centimes.length + ' × ' + (c.primes_centimes[0] / 100) + ' $ par M-PESA · ' + c.nb_qualifies + ' qualifiées pour la Coupe d\'Afrique.';
        etapes.innerHTML = c.classement.length
          ? c.classement.slice(0, 16).map(function (e, i) { return ligne((i + 1) + '.', e.nom, e.points + ' pts' + (e.qualifiee ? ' · qualifiée' : ''), i < c.nb_qualifies); }).join('')
          : ligne('Semaine 1', 'Qualifications en cours : les 16 meilleures équipes seront retenues', 'classement dimanche', true);
        var id = sem && sem.circuit.indexOf('W_') === 0 ? sem.circuit.slice(2) : null;
        etapeTournoiServeur = id && ETAPES[id] ? id : null;
        epreuve.textContent = sem ? 'Épreuve de la semaine : ' + sem.circuit_nom : 'Championnat terminé';
        bouton.disabled = !etapeTournoiServeur;
        texte.textContent = etapeTournoiServeur ? 'Courir pour mon équipe' : sem ? 'Épreuve à courir dans le jeu Unreal' : 'Championnat terminé';
        sousBouton.textContent = session ? 'Connecté : ' + session.joueur.pseudo : 'Connectez-vous (Mon compte) pour que la course compte';
        note.textContent = 'Classement réel du serveur. Le temps de l\'équipe est la somme de ses ' + c.taille_equipe + ' pilotes ; clôture le dimanche à minuit (heure de Kinshasa).';
      }).catch(function () { note.textContent = 'Aucun championnat en cours dans votre pays pour le moment : entraînez-vous sur l\'épreuve de démonstration.'; });
    } else {
      apiJeu('GET', '/tournois/coupe').then(function (c) {
        titre.textContent = c.nom + (c.championne ? ' · championne : ' + c.championne : '');
        sous.textContent = 'Sponsor : ' + c.sponsor + ' · élimination directe, un tour par semaine.';
        etapes.innerHTML = c.tours.map(function (t) {
          return t.matchs.map(function (m) { return ligne(t.nom, (m.equipe_a || '?') + ' (' + (m.pays_a || '') + ') contre ' + (m.equipe_b || '?') + ' (' + (m.pays_b || '') + ')', m.gagnante ? 'qualifiée : ' + m.gagnante : 'à jouer', !t.cloture && !!m.equipe_a); }).join('');
        }).join('');
      }).catch(function () {});
    }
  }

  // ---------- Niveau de difficulté ----------
  function niveauActif() { return modeJeu === 'entrainement' && !defiEnCours ? niveauChoisi : 'moyen'; }
  function reglageNiveau() { return REGLAGES_NIVEAU[niveauActif()]; }
  function majNiveaux() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-niveau]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-niveau') === niveauChoisi ? 'true' : 'false'); });
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-niveau]'), function (b) {
    b.addEventListener('click', function () {
      niveauChoisi = b.getAttribute('data-niveau');
      try { localStorage.setItem('ketch-niveau', niveauChoisi); } catch (e) {}
      majNiveaux();
    });
  });
  majNiveaux();
  // Badge de difficulté sur chaque carte d'étape.
  ORDRE.forEach(function (id) {
    var desc = document.querySelector('[data-etape="' + id + '"] .jeu-desc'), niv = ETAPES[id].niveau;
    if (desc && !desc.querySelector('.niv')) {
      var b = document.createElement('b'); b.className = 'niv niv-' + niv; b.textContent = NOMS_NIVEAUX[niv];
      desc.insertBefore(b, desc.firstChild);
    }
  });

  // ---------- Défi du jour ----------
  // Chaque jour (heure de Kinshasa), une étape et une voiture imposées, les mêmes pour tout le monde.
  // La voiture est prêtée pour le défi, même si elle n'est pas encore débloquée.
  function jourKin(decalage) {
    var d = new Date(Date.now() + (decalage || 0) * 86400000);
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kinshasa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
    catch (e) { return new Date(d.getTime() + 3600000).toISOString().slice(0, 10); }
  }
  function defiDuJour() {
    var jour = jourKin(), h = 2166136261;
    for (var i = 0; i < jour.length; i++) { h ^= jour.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return { jour: jour, etape: ORDRE[h % ORDRE.length], voiture: ORDRE_VOITURES[Math.floor(h / 13) % ORDRE_VOITURES.length], graine: h };
  }
  function lireEssais() {
    try { var d = JSON.parse(localStorage.getItem('ketch-defi') || 'null'); return d && d.jour === jourKin() && Array.isArray(d.essais) ? d.essais : []; } catch (e) { return []; }
  }
  function lireSerie() {
    try { var sr = JSON.parse(localStorage.getItem('ketch-defi-serie') || 'null'); if (sr && (sr.dernier === jourKin() || sr.dernier === jourKin(-1))) return sr; } catch (e) {}
    return { dernier: null, serie: 0 };
  }
  // Fantômes Bronze, Argent et Or : scores de référence calculés pour l'étape du jour (joués par l'ordinateur).
  function fantomesDuJour(d) {
    var L = ETAPES[d.etape].longueur * VOITURES[d.voiture].fantome, v = (d.graine % 400) - 200;
    return [{ nom: 'Fantôme Or', score: Math.round(L * 4.2 + v) }, { nom: 'Fantôme Argent', score: Math.round(L * 3.4 + v / 2) }, { nom: 'Fantôme Bronze', score: Math.round(L * 2.6) }];
  }
  function classementDuJour() {
    var d = defiDuJour();
    var lignes = fantomesDuJour(d).map(function (f) { return { nom: f.nom, score: f.score, bot: true }; });
    lireEssais().forEach(function (e, i) { lignes.push({ nom: 'Vous · essai ' + (i + 1) + ' · ' + chrono(e.temps), score: e.score, moi: true, id: i }); });
    return lignes.sort(function (a, b) { return b.score - a.score; });
  }
  function enregistrerEssaiDefi(score, t) {
    var essais = lireEssais();
    essais.push({ score: score, temps: t, heure: Date.now() });
    try { localStorage.setItem('ketch-defi', JSON.stringify({ jour: jourKin(), essais: essais })); } catch (e) {}
    var sr = lireSerie();
    if (sr.dernier !== jourKin()) { sr = { dernier: jourKin(), serie: sr.dernier === jourKin(-1) ? sr.serie + 1 : 1 }; try { localStorage.setItem('ketch-defi-serie', JSON.stringify(sr)); } catch (e) {} }
    var meilleur = Math.max.apply(null, essais.map(function (e) { return e.score; }));
    return 1 + fantomesDuJour(defiDuJour()).filter(function (f) { return f.score > meilleur; }).length;
  }
  function majDefi() {
    var d = defiDuJour(), E2 = ETAPES[d.etape], m = VOITURES[d.voiture], essais = lireEssais(), sr = lireSerie();
    var t = document.getElementById('defiTitre'), ds = document.getElementById('defiDesc'), se = document.getElementById('defiSerie');
    if (t) t.textContent = 'Étape ' + E2.numero + ' · ' + E2.nom + ' · avec la ' + m.nom;
    if (ds) ds.textContent = (debloquee(m) ? 'Voiture imposée' : 'Voiture prêtée pour le défi') + ' · +15 G · ' +
      (essais.length ? 'votre meilleur : ' + Math.max.apply(null, essais.map(function (e) { return e.score; })).toLocaleString('fr-FR') + ' pts' : 'pas encore tenté aujourd\'hui');
    if (se) se.textContent = sr.serie ? '\uD83D\uDD25 série de ' + sr.serie + ' jour' + (sr.serie > 1 ? 's' : '') : 'Nouveau défi chaque jour';
  }
  function lancerDefi() {
    var d = defiDuJour();
    modeJeu = 'entrainement';
    if (!defiEnCours) voitureAvantDefi = voiture;
    defiEnCours = true; voiture = VOITURES[d.voiture];
    panneauClassement.hidden = true;
    lancer(d.etape);
  }
  function quitterDefi() {
    if (!defiEnCours) return;
    defiEnCours = false; if (voitureAvantDefi) voiture = voitureAvantDefi; voitureAvantDefi = null;
    var bfc = document.getElementById('boutonFinClassement'); if (bfc) bfc.hidden = true;
  }
  var panneauClassement = document.getElementById('panneauClassement');
  function montrerClassement() {
    var d = defiDuJour(), liste = document.getElementById('listeClassement'), sous = document.getElementById('classementSous');
    if (sous) sous.textContent = new Date(d.jour + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + ETAPES[d.etape].nom + ' · ' + VOITURES[d.voiture].nom;
    if (liste) {
      liste.textContent = '';
      classementDuJour().slice(0, 8).forEach(function (l) {
        var li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('b');
        li.className = l.moi ? 'moi' : 'bot'; a.textContent = l.nom; b.textContent = l.score.toLocaleString('fr-FR') + ' pts';
        li.appendChild(a); li.appendChild(b); liste.appendChild(li);
      });
    }
    panneauDebut.hidden = true; panneauFin.hidden = true; panneauClassement.hidden = false;
  }
  [['boutonDefi', lancerDefi], ['boutonDefiClassement', lancerDefi], ['boutonClassement', montrerClassement], ['boutonFinClassement', montrerClassement]].forEach(function (c) {
    var b = document.getElementById(c[0]); if (b) b.addEventListener('click', c[1]);
  });
  var fermerCl = document.getElementById('boutonFermerClassement');
  if (fermerCl) fermerCl.addEventListener('click', function () {
    quitterDefi(); panneauClassement.hidden = true; panneauDebut.hidden = false; etat = 'accueil'; musiqueArreter();
    vueGarage = voiture; majVoitures(); majRecords(); majDefi(); choisirEtape(etapeChoisie);
  });
  majDefi();

  var boutonSon = document.getElementById('boutonSon'), boutonMusique = document.getElementById('boutonMusique');
  function majBoutons() {
    if (boutonSon) {
      boutonSon.setAttribute('aria-pressed', son.actif ? 'false' : 'true');
      boutonSon.setAttribute('aria-label', son.actif ? 'Couper le son' : 'Remettre le son');
      boutonSon.querySelector('.onde').style.display = son.actif ? '' : 'none';
      boutonSon.querySelector('.barre').style.display = son.actif ? 'none' : '';
    }
    if (boutonMusique) {
      boutonMusique.setAttribute('aria-pressed', son.musique ? 'false' : 'true');
      boutonMusique.setAttribute('aria-label', son.musique ? 'Couper la musique' : 'Remettre la musique');
      boutonMusique.style.opacity = son.musique ? '' : '0.45';
    }
  }
  if (boutonSon) boutonSon.addEventListener('click', function () {
    son.actif = !son.actif; try { localStorage.setItem('ketch-son', son.actif ? 'oui' : 'non'); } catch (e) {}
    majVolumes(); majBoutons();
  });
  if (boutonMusique) boutonMusique.addEventListener('click', function () {
    son.musique = !son.musique; try { localStorage.setItem('ketch-musique', son.musique ? 'oui' : 'non'); } catch (e) {}
    majVolumes(); majBoutons();
  });
  majBoutons();

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

  reinitialiser('rondpoint');
  majRecords();
  requestAnimationFrame(boucle);
})();
