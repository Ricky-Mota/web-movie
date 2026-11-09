/* ImagiKids : fonctionnement hors connexion.
   Pages : réseau d'abord, copie gardée en secours. Images et icônes : copie d'abord.
   Le CRM et les appels à la base de données ne sont jamais mis en cache. */
const VERSION = "ik-v1";
const SHELL = ["/", "/app/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  const same = u.origin === self.location.origin, fonts = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname), lib = u.hostname === "cdn.jsdelivr.net";
  if (same && u.pathname.startsWith("/crm")) return;
  if (!same && !fonts && !lib) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(r, cp)); return res; })
      .catch(() => caches.match(r).then(m => m || caches.match(u.pathname.startsWith("/app") ? "/app/" : "/"))));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(VERSION).then(c => c.put(r, cp)); } return res; })));
});
