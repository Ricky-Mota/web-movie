// Application installable : garde la page et les images du jeu en mémoire sur le téléphone,
// pour qu'elle s'ouvre vite et que l'entraînement marche même sans réseau.
// Les appels au serveur de jeu (autre adresse) ne passent jamais par ici : toujours en direct.
const VERSION = 'ketch-v1';
const ESSENTIEL = ['/', '/index.html', '/manifest.webmanifest', '/icones/icone-192.png', '/icones/icone-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ESSENTIEL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    // La page : d'abord le réseau (dernière version), sinon la copie gardée.
    e.respondWith(fetch(req).then((r) => { const copie = r.clone(); caches.open(VERSION).then((c) => c.put('/index.html', copie)); return r; })
      .catch(() => caches.match('/index.html')));
    return;
  }
  // Images et fichiers du jeu : la copie gardée, mise à jour en arrière-plan.
  e.respondWith(caches.match(req).then((garde) => {
    const reseau = fetch(req).then((r) => { if (r.ok) { const copie = r.clone(); caches.open(VERSION).then((c) => c.put(req, copie)); } return r; });
    return garde || reseau;
  }));
});
