const CACHE_NAME = 'zonnebloem-widget-v1';
const WIDGET_API_CACHE = 'zonnebloem-api-v1';

// Static assets to pre-cache
const PRECACHE_URLS = [
  '/defog/widget',
  '/favicon.png',
  '/logo.png',
  '/manifest.json',
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== WIDGET_API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Widget data API: network-first with cache fallback
  if (url.pathname.startsWith('/api/stocks/widget-data')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(WIDGET_API_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Widget page: network-first with cache fallback
  if (url.pathname === '/defog/widget') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Other static assets: cache-first
  if (PRECACHE_URLS.some((u) => url.pathname === u)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});

// Background sync: update widget data periodically
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'REFRESH_WIDGET') {
    fetch('/api/stocks/widget-data?limit=24')
      .then((r) => r.json())
      .then((data) => {
        // Notify all clients
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'WIDGET_DATA_UPDATED', data });
          });
        });
      })
      .catch(() => {});
  }
});
