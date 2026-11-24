// 2 Life : service worker. L'application s'ouvre même avec un réseau faible ;
// les appels au serveur du jeu ne sont jamais mis en cache.
const CACHE = "twolife-v8";
const SHELL = ["vie.html", "config.js", "assets/vie.js", "assets/lancement-demo.js", "server/src/life.js", "manifest.webmanifest", "assets/icons/2life.svg", "assets/icons/2life-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.includes("/api/")) return;
  // réseau d'abord (mises à jour immédiates), cache en secours hors ligne
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (u.origin === location.origin || /cdnjs|jsdelivr|fonts\./.test(u.host))) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
