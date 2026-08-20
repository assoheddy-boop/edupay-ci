const CACHE = 'educonnect-offline-v5';
const SHELL = [
  '/offline',
  '/css/main.css',
  '/css/main.css?v=10',
  '/css/portal.css',
  '/css/portal.css?v=10',
  '/js/app.js',
  '/js/app.js?v=8',
  '/js/offline.js',
  '/js/offline.js?v=6',
  '/manifest.json',
  '/manifest-marketplace.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  if (path === '/offline' || path === '/manifest.json' || path === '/manifest-marketplace.json') return true;
  return /\.(css|js|png|jpg|jpeg|webp|svg|woff2?|ico)$/i.test(path);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
  }
  return response;
}

async function networkThenOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const fallback = await caches.match('/offline');
    return fallback || new Response('Hors ligne', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  const wantsHtml = event.request.mode === 'navigate'
    || (event.request.headers.get('accept') || '').includes('text/html');
  if (wantsHtml) {
    event.respondWith(networkThenOffline(event.request));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag !== 'educonnect-sync') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'educonnect-sync' }));
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'educonnect-sync') {
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'educonnect-sync' }));
    });
  }
});
