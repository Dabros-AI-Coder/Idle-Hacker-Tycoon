/**
 * Service Worker — Network-First mit Offline-Fallback.
 * Sorgt dafür, dass Updates sofort ankommen (kein 10-min HTTP-Cache-Problem),
 * während offline weiterhin die zuletzt geladenen Ressourcen dienen.
 */
const CACHE = 'idle-hacker-runtime-v1';
const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/main.js',
    './version.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((c) => c.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch { return; }
    if (url.origin !== location.origin) return;

    // Network-First: frisch vom Server, bei Fehlern aus dem Cache
    event.respondWith(
        fetch(req)
            .then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
                return res;
            })
            .catch(() =>
                caches.match(req, { ignoreSearch: true })
                    .then((hit) => hit || caches.match('./index.html'))
            )
    );
});
