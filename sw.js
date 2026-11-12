// Service worker: makes the Game Library website installable as an app (no .exe, so no browser
// or Windows warnings). Network first, so the game list is always fresh; the last copy of every
// file is kept so the library still opens offline. The games themselves have their own workers.
const CACHE = 'gamelib-v5';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html', 'games.json', 'app/style.css', 'app/web.js', 'app/app.js', 'app/profile.js', 'app/sync.js', 'app/account.js', 'app/staff.js', 'app/friends.js', 'shop/items.json', 'manifest.webmanifest'])).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  // only the library's own files (not the games under play/, which manage themselves)
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.location).pathname) || url.pathname.includes('/play/')) return;
  const key = req.url.split('?')[0];
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = await caches.match(key);
      if (hit) return hit;
      throw err;
    }
  })());
});
