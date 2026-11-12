// Old service worker location: hand over to the new app and remove old caches.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.map(x => caches.delete(x)))).then(() => self.registration.unregister())));
