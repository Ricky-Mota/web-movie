// Transforme les modèles 3D des voitures (fichiers GLB, par exemple créés avec Hyper3D Rodin)
// en images vues de l'arrière, utilisées par la démo à la place des voitures dessinées.
//
//   cd g-challenge-landing/scripts/sprites && npm install && node sprites-voitures.cjs
//
// Entrée : g-challenge-landing/modeles/<id>.glb  (id : ketch, zigzag, mbote, blinde, kingt, fleuve, turbo, leopard,
//          trafic-voiture, trafic-bus, trafic-camion, trafic-fula, trafic-moto, trafic-police)
// Réglages facultatifs : g-challenge-landing/modeles/reglages.json, par exemple { "turbo": { "rotation": 180 } }
//   rotation : degrés autour de l'axe vertical pour que la voiture montre son arrière (0, 90, 180 ou 270 selon le modèle)
// Sortie : g-challenge-landing/public/voitures/<id>-0.png … <id>-4.png (de « tourne à gauche » à « tourne à droite »)
//          et public/voitures/liste.json, que la démo lit au démarrage.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..', '..');
const MODELES = path.join(RACINE, 'modeles');
const SORTIE = path.join(RACINE, 'public', 'voitures');
const THREE = path.join(__dirname, 'node_modules', 'three');
const IDS = ['ketch', 'zigzag', 'mbote', 'blinde', 'kingt', 'fleuve', 'turbo', 'leopard',
  // Trafic : les véhicules que l'on double sur la route.
  'trafic-voiture', 'trafic-bus', 'trafic-camion', 'trafic-fula', 'trafic-moto', 'trafic-police'];
const VUES = [-14, -7, 0, 7, 14]; // angle de la voiture vue de derrière, en degrés

const PAGE = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{ "imports": { "three": "/three/build/three.module.js", "three/addons/": "/three/examples/jsm/" } }</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const L = 1024, Hh = 640;
const rendu = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
rendu.setSize(L, Hh); rendu.setClearColor(0x000000, 0); rendu.outputColorSpace = THREE.SRGBColorSpace;
rendu.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(rendu.domElement);
window.photographier = async (url, rotation, vues, longueur) => {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6));
  const soleil = new THREE.DirectionalLight(0xfff1dd, 2.2); soleil.position.set(3, 6, -4); scene.add(soleil);
  const contre = new THREE.DirectionalLight(0xbfd4ff, 1.0); contre.position.set(-4, 3, 5); scene.add(contre);
  const gltf = await new GLTFLoader().loadAsync(url);
  const voiture = gltf.scene;
  // Centrer, poser au sol et ramener à 4 m de long.
  let boite = new THREE.Box3().setFromObject(voiture), taille = boite.getSize(new THREE.Vector3());
  voiture.scale.setScalar(longueur / Math.max(taille.x, taille.z));
  boite = new THREE.Box3().setFromObject(voiture); const centre = boite.getCenter(new THREE.Vector3());
  voiture.position.sub(new THREE.Vector3(centre.x, boite.min.y, centre.z));
  const pivot = new THREE.Group(); pivot.add(voiture); scene.add(pivot);
  const camera = new THREE.PerspectiveCamera(28, L / Hh, 0.1, 100);
  const toiles = [];
  for (const a of vues) {
    pivot.rotation.y = THREE.MathUtils.degToRad(rotation + a);
    camera.position.set(0, 2.1, -8.2); camera.lookAt(0, 0.75, 0);
    rendu.render(scene, camera);
    const t = document.createElement('canvas'); t.width = L; t.height = Hh;
    t.getContext('2d').drawImage(rendu.domElement, 0, 0); toiles.push(t);
  }
  // Recadrage commun à toutes les vues (la voiture remplit l'image, bas de l'image = sol).
  let x0 = L, y0 = Hh, x1 = 0, y1 = 0;
  toiles.forEach((t) => {
    const d = t.getContext('2d').getImageData(0, 0, L, Hh).data;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < L; x++) if (d[(y * L + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  });
  const lw = x1 - x0 + 1, lh = y1 - y0 + 1, ech = 400 / lw;
  return toiles.map((t) => {
    const c = document.createElement('canvas'); c.width = 400; c.height = Math.round(lh * ech);
    const cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high';
    cx.drawImage(t, x0, y0, lw, lh, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  });
};
window.pret = true;
</script></body></html>`;

function servir(req, res) {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let f = null;
  if (u === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(PAGE); }
  if (u.startsWith('/three/')) f = path.join(THREE, u.slice(7));
  if (u.startsWith('/modeles/')) f = path.join(MODELES, path.basename(u));
  if (!f || !f.startsWith(THREE) && !f.startsWith(MODELES) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}

(async () => {
  const presents = IDS.filter((id) => fs.existsSync(path.join(MODELES, id + '.glb')));
  if (!presents.length) { console.log('Aucun modèle trouvé dans ' + MODELES + ' (attendu : ' + IDS.join(', ') + ' en .glb).'); return; }
  let reglages = {};
  try { reglages = JSON.parse(fs.readFileSync(path.join(MODELES, 'reglages.json'), 'utf8')); } catch (e) {}
  fs.mkdirSync(SORTIE, { recursive: true });
  const srv = http.createServer(servir).listen(0);
  await new Promise((r) => srv.once('listening', r));
  const nav = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await nav.newPage();
  page.on('pageerror', (e) => console.error('Erreur page :', e.message));
  await page.goto('http://localhost:' + srv.address().port + '/');
  await page.waitForFunction(() => window.pret === true);
  const faits = [];
  for (const id of presents) {
    const rotation = (reglages[id] && reglages[id].rotation) || 0;
    try {
      const longueur = { 'trafic-bus': 10, 'trafic-camion': 9, 'trafic-fula': 9, 'trafic-moto': 2 }[id] || 4.3;
      const images = await page.evaluate(([u, r, v, l]) => window.photographier(u, r, v, l), ['/modeles/' + id + '.glb', rotation, VUES, longueur]);
      images.forEach((d, k) => fs.writeFileSync(path.join(SORTIE, id + '-' + k + '.png'), Buffer.from(d.split(',')[1], 'base64')));
      faits.push(id); console.log('OK ' + id + ' : ' + images.length + ' vues');
    } catch (e) { console.error('Échec ' + id + ' : ' + e.message); }
  }
  fs.writeFileSync(path.join(SORTIE, 'liste.json'), JSON.stringify({ voitures: faits, vues: VUES.length }, null, 2) + '\n');
  await nav.close(); srv.close();
  console.log('Images écrites dans ' + SORTIE + '. Relancez ensuite : python3 scripts/assembler.py');
})();
