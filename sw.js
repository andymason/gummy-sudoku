// Offline cache for Gummy Sudoku. Bump VERSION when files change.
const VERSION = 'gummy-sudoku-v9';
const FILES = [
  './',
  'index.html',
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
    caches
      .open(VERSION)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first for our files; fonts are cached as they are fetched.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok && /fonts\.(googleapis|gstatic)\.com/.test(e.request.url)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});
