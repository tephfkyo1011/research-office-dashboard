const CACHE_NAME = 'kyogi-portal-v6';
const urlsToCache = [
  './',
  './index.html'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW: Opened cache and caching basic resources');
      return cache.addAll(urlsToCache);
    })
  );
});

// 🟢 2. Auto Cleanup Cache เก่า
self.addEventListener('activate', e => {
  const whitelist = [CACHE_NAME];
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (!whitelist.includes(key)) {
            console.log('SW: Deleting old cache', key);
            return caches.delete(key);
          }
        })
      )
    )
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          // 🟢 1. Cache เฉพาะ Origin ของเราเท่านั้น ลด Memory บวม
          if (e.request.method === 'GET' && e.request.url.startsWith(self.location.origin)) {
            cache.put(e.request, fetchRes.clone());
          }
          return fetchRes;
        });
      });
    })
  );
});
