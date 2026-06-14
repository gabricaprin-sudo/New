// ============================================================
// Service Worker — Offline PWA Support
// Caches static assets so the app works without internet
// ============================================================

const CACHE_NAME = 'girls-tracker-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './group_photo.jpg',
  'https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;700&family=Noto+Naskh+Arabic:wght@400;600&family=Tajawal:wght@300;400;500;700;800;900&display=swap'
];

// Install: Cache all static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching assets...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((err) => {
        console.warn('[SW] Cache addAll failed:', err);
      })
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Firebase/Google API requests (let them fail naturally when offline)
  const url = new URL(request.url);
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    // Try network first for Firebase, fail silently if offline
    event.respondWith(
      fetch(request).catch(() => {
        // Return a minimal error response for Firebase scripts
        if (request.url.includes('.js')) {
          return new Response(
            'console.warn("[SW] Firebase script blocked — offline mode");',
            { headers: { 'Content-Type': 'application/javascript' } }
          );
        }
        return new Response('{}', { status: 503, statusText: 'Service Unavailable' });
      })
    );
    return;
  }

  // For all other requests: Cache-first strategy
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version and update in background
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // Not in cache: fetch from network
      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          // Cache the new resource
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, networkResponse.clone());
          });
          return networkResponse;
        })
        .catch(() => {
          // Network failed and not in cache
          console.warn('[SW] Network failed for:', request.url);
          // For navigation requests, return the cached index.html
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        });
    })
  );
});
