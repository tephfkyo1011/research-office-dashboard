const CACHE_NAME = 'ro-portal-v4';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          // เก็บ Cache เฉพาะ request ที่เป็น http/https
          if (e.request.url.startsWith('http')) {
            cache.put(e.request, fetchRes.clone());
          }
          return fetchRes;
        });
      });
    })
  );
});
