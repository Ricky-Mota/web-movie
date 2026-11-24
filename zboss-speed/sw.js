// 2 Life : service worker. L'application s'ouvre même avec un réseau faible ;
// les appels au serveur du jeu ne sont jamais mis en cache.
const CACHE = "twolife-v14";
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
// notifications : une consigne a été faite (envoyée par le serveur du jeu)
self.addEventListener("push", e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch (x) { m = { texte: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.titre || "2 Life", { body: m.texte || "", icon: "assets/icons/2life-192.png", badge: "assets/icons/2life-192.png", data: { url: m.url || "vie.html" } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "vie.html", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => { const w = ws.find(x => x.url.startsWith(self.registration.scope)); return w ? w.focus().then(c => c.navigate ? c.navigate(url) : c) : clients.openWindow(url); }));
});
