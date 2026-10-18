// Офлайн-кэш. При обновлении сайта поднять версию в CACHE.
const CACHE = "monetki-v68";
const FILES = ["./", "index.html", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Шрифты Google: из кэша, если есть
  if (url.host.endsWith("fonts.googleapis.com") || url.host.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(r => { c.put(req, r.clone()); return r; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Свои файлы: пробуем сеть, но ждём не дольше 1,5 с — дальше открываем из кэша,
  // а свежая версия докачивается в фоне и будет при следующем запуске
  const net = fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  });
  e.waitUntil(net.catch(() => {}));
  e.respondWith(caches.match(req).then(hit => {
    if (!hit) return net.catch(() => caches.match("index.html"));
    const late = new Promise(res => setTimeout(() => res(hit), 1500));
    return Promise.race([net.catch(() => hit), late]);
  }));
});
