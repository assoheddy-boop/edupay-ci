const CACHE = 'edupay-v2';
const ASSETS = [
  '/',
  '/auth/login',
  '/css/main.css',
  '/js/app.js',
  '/manifest.json',
  '/parent/dashboard',
  '/parent/notifications',
  '/parent/timeline',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isAppPage = url.pathname.startsWith('/parent/') || url.pathname.startsWith('/auth/login') || url.pathname === '/';

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (isAppPage && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || caches.match('/'))),
  );
});
