// REALMSHARD moved to https://realmshard.fr/jouer/: this worker removes the old installed web app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try { for (const k of await caches.keys()) if (k.startsWith('realmshard-')) await caches.delete(k); } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    try {
      for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
        try { await c.navigate(c.url); } catch (e) {}
      }
    } catch (e) {}
  })());
});
