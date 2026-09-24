// Offline cache for Gummy Sudoku. Bump VERSION when files change.
const VERSION = 'gummy-sudoku-v11';
const FILES = [
  './',
  'src/app.js',
  'src/sudoku.js',
  'manifest.webmanifest',
  'icons/app-192.png',
  'icons/app-512.png',
  'icons/app.svg',
  ...['bear', 'fish', 'ring', 'star', 'worm', 'heart', 'cola', 'raspberry', 'egg'].map(
    (n) => `icons/gummies/${n}.svg`,
  ),
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await cache.addAll(FILES);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Cache first for our files; fonts are cached as they are fetched.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    (async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok && /fonts\.(googleapis|gstatic)\.com/.test(e.request.url)) {
        const cache = await caches.open(VERSION);
        e.waitUntil(cache.put(e.request, res.clone()));
      }
      return res;
    })(),
  );
});
