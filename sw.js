const CACHE_NAME = 'kyogi-portal-v5';
const urlsToCache = [
  './',
  './index.html'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Opened cache and caching basic resources');
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          if (e.request.url.startsWith('http')) {
            cache.put(e.request, fetchRes.clone());
          }
          return fetchRes;
        });
      });
    })
  );
});
