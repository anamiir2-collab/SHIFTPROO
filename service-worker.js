/* ShiftPro Service Worker - v2.5.0
   Strategy:
   - precache: app shell (HTML, CSS, JS, locales, icons, manifest)
   - runtime: network-first for navigations, cache-first for static assets
   - cleanup: drop old caches on activate
*/
const SW_VERSION = 'shifpro-v2.5.4-law';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/animations.css',
  './css/ios-style.css',
  './css/law-reader.css',
  // ملفات i18n (مهمة للتشغيل الأول)
  './locales/ar.js',
  './locales/en.js',
  './locales/index.js',
  // موديولات التطبيق
  './js/utils.js',
  './js/storage.js',
  './js/clock.js',
  './js/official-holidays.js',
  './js/leaves.js',
  './js/shift-templates.js',
  './js/undo-redo.js',
  './js/smart-notifications.js',
  './js/pdf-export.js',
  './js/charts.js',
  './js/backup.js',
  './js/app-lock.js',
  './js/storage-hybrid.js',
  './js/ux-enhancements.js',
  './js/ical-export.js',
  './js/calendar.js',
  './js/attendance.js',
  './js/salary.js',
  './js/reports.js',
  './js/settings.js',
  './js/welcome-messages.js',
  './js/app.js',
  // ====== Egyptian Labor Law dataset + reader ======
  // Dataset: order matters only at runtime (script tags in index.html);
  // for caching the order is irrelevant.
  './js/law-reader.js',
  './js/data/law-data.js',
  './js/data/book-1-chapter-1.js',
  './js/data/book-1-chapter-2.js',
  './js/data/book-2-chapter-1.js',
  './js/data/book-2-chapter-2.js',
  './js/data/book-2-chapter-3.js',
  './js/data/book-3-chapter-1.js',
  './js/data/book-3-chapter-2.js',
  './js/data/book-3-chapter-3.js',
  './js/data/book-4-articles.js',
  './js/data/book-4-chapter-1.js',
  './js/data/book-4-chapter-2.js',
  './js/data/book-4-chapter-3.js',
  './js/data/book-4-chapter-4.js',
  './js/data/book-4-chapter-5.js',
  './js/data/book-5-chapter-1.js',
  './js/data/book-5-chapter-2.js',
  // أيقونات PWA
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SW_VERSION).then((cache) => {
      // Cache individually so one missing file doesn't break the whole install
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Skip caching', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Message: skip waiting on demand (used for "apply update" button)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Ignore cross-origin requests (e.g., dicebear avatar)
  if (url.origin !== self.location.origin) return;

  // Navigations -> network first, fall back to cached index.html (offline)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SW_VERSION).then((c) => c.put('./index.html', copy)).catch(()=>{});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Static assets -> cache first, then network
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Only cache same-origin successful responses
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const copy = res.clone();
          caches.open(SW_VERSION).then((c) => c.put(req, copy)).catch(()=>{});
          return res;
        })
        .catch(() => cached);
    })
  );
});
