// Alphabet Goals service worker: offline app shell + "your turn" notification taps.
const CACHE = "ag-v1.1.0";
const SHELL = [
  "./", "index.html", "css/app.css", "js/config.js", "js/data.js", "js/net.js", "js/app.js",
  "vendor/mqtt.min.js", "vendor/firebase-app-compat.js", "vendor/firebase-auth-compat.js", "vendor/firebase-database-compat.js",
  "fonts/big-shoulders-display-latin-700-normal.woff2", "fonts/big-shoulders-display-latin-900-normal.woff2",
  "fonts/barlow-semi-condensed-latin-400-normal.woff2", "fonts/barlow-semi-condensed-latin-500-normal.woff2",
  "fonts/barlow-semi-condensed-latin-600-normal.woff2", "fonts/barlow-semi-condensed-latin-700-normal.woff2",
  "icon-192.png", "icon-512.png", "manifest.json", "privacy.html", "support.html", "europe.txt", "intl.txt"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates show straight away), falling back to the cache when offline.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html"))));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ("focus" in w) return w.focus(); }
    return self.clients.openWindow(self.registration.scope);
  }));
});
