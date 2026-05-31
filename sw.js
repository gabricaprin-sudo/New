// Service Worker - نظام متابعة المخدومات
const CACHE_NAME = 'makhdomatv1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network first for Firebase, cache first for assets
  if (e.request.url.includes('firebase') || e.request.url.includes('googleapis.com/identitytoolkit')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.method === 'GET') {
          const cloned = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, cloned));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
