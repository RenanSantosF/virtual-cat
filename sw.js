// Cache simples: o app inteiro cabe offline, e o gato roda no relógio do
// aparelho, então ele continua vivendo mesmo sem rede.
const CACHE = 'virtual-cat-v1';
const ASSETS = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/main.js', './js/cat.js', './js/rig.js', './js/state.js',
  './js/behavior.js', './js/world.js', './js/ui.js', './js/audio.js', './js/util.js',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html')))
  );
});
