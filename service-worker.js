// ============================================================
// Service Worker — متابعة المخدومات
// النسخة: 1.0.0
// ============================================================

const CACHE_NAME = 'girls-tracker-v1';
const STATIC_CACHE = 'girls-tracker-static-v1';
const DYNAMIC_CACHE = 'girls-tracker-dynamic-v1';

// الملفات اللي بتتحمل offline دايماً
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap'
];

// ============================================================
// INSTALL — تحميل الملفات الأساسية
// ============================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        // نحاول نحمل كل ملف لوحده عشان لو واحد فشل ما يوقفش الباقيين
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] Installed successfully');
        return self.skipWaiting(); // يبدأ فوراً من غير ما ينتظر
      })
  );
});

// ============================================================
// ACTIVATE — مسح الـ cache القديم
// ============================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activated');
        return self.clients.claim(); // يتحكم في كل الـ tabs مباشرة
      })
  );
});

// ============================================================
// FETCH — استراتيجية Cache First للـ static، Network First للـ dynamic
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل الـ Firebase requests (دي بتتعمل online دايماً)
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('ibb.co') ||
    url.hostname.includes('sheetjs.com')
  ) {
    return; // خلي الـ browser يتعامل معاها عادي
  }

  // للـ navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache First للـ static assets (CSS, JS, fonts)
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font' ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // رجّع من الـ cache وحدّث في الخلفية
            fetch(request)
              .then(networkResponse => {
                if (networkResponse && networkResponse.ok) {
                  caches.open(STATIC_CACHE)
                    .then(cache => cache.put(request, networkResponse.clone()));
                }
              })
              .catch(() => {}); // مش مهم لو فشل
            return cachedResponse;
          }
          // مش في الـ cache، نجيبه من النت ونحفظه
          return fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.ok) {
                const clone = networkResponse.clone();
                caches.open(STATIC_CACHE)
                  .then(cache => cache.put(request, clone));
              }
              return networkResponse;
            });
        })
    );
    return;
  }

  // Network First للباقي
  event.respondWith(
    fetch(request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE)
            .then(cache => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});

// ============================================================
// BACKGROUND SYNC — مزامنة البيانات لما النت يرجع
// ============================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    console.log('[SW] Background sync: attendance');
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // يبعت رسالة للـ app إنه يعمل sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_REQUIRED' });
  });
}

// ============================================================
// MESSAGES — تواصل مع الـ app
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
