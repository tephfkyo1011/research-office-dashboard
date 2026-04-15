const CACHE_NAME = 'kyogi-portal-v8';
const MAX_ITEMS = 50;
const OFFLINE_URL = './offline.html'; // 🟢 7. เพิ่มหน้า Offline

const urlsToCache = [
  './',
  './index.html',
  OFFLINE_URL
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', e => {
  const whitelist = [CACHE_NAME];
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (!whitelist.includes(key)) return caches.delete(key);
      }))
    ).then(() => self.clients.claim())
  );
});

// 🟢 2. แก้ Recursion Loop ป้องกัน Stack Overflow
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  let keys = await cache.keys();
  while (keys.length > maxItems) {
    await cache.delete(keys.shift());
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cacheRes => {
      const fetchPromise = fetch(e.request).then(networkRes => {
        const url = e.request.url;
        
        // 🟢 3. Cache CDN ด้วย ป้องกัน Layout พังตอนออฟไลน์
        if (
          url.startsWith(self.location.origin) ||
          url.includes('fonts.googleapis.com') ||
          url.includes('fonts.gstatic.com') ||
          url.includes('cdnjs.cloudflare.com') ||
          url.includes('tephfkyo1011.github.io') ||
          url.includes('ui-avatars.com')
        ) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, networkRes.clone());
            trimCache(CACHE_NAME, MAX_ITEMS);
          });
        }
        return networkRes;
      }).catch(() => {
        // 🟢 1 & 7. แก้ Bug! ส่ง Cache หรือหน้า Offline กลับไปแทนการปล่อย undefined
        return cacheRes || caches.match(OFFLINE_URL);
      });

      return cacheRes || fetchPromise;
    })
  );
});
