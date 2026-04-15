const CACHE_NAME = 'kyogi-portal-v7';
const MAX_ITEMS = 50; // 🟢 8. จำกัดจำนวน Cache กันเมมบวม
const urlsToCache = [
  './',
  './index.html'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW: Pre-caching basic resources');
      return cache.addAll(urlsToCache);
    })
  );
});

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
    ).then(() => self.clients.claim()) // 🟢 2. ให้ SW ทำงานทันที
  );
});

// 🟢 8. ฟังก์ชันเคลียร์ Cache ที่เก่าเกินไป
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    trimCache(cacheName, maxItems); // ทำซ้ำจนกว่าจะไม่เกิน
  }
}

// 🟢 1. Stale-While-Revalidate (เร็วด้วย อัปเดตด้วย)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cacheRes => {
      const fetchPromise = fetch(e.request).then(networkRes => {
        // อัปเดต Cache เฉพาะ Request ใน Origin ของเรา
        if (e.request.url.startsWith(self.location.origin)) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, networkRes.clone());
            trimCache(CACHE_NAME, MAX_ITEMS);
          });
        }
        return networkRes;
      }).catch(() => {
        // Fallback กรณีออฟไลน์ (ถ้าจำเป็น)
      });

      return cacheRes || fetchPromise; // โชว์ Cache ก่อน ถ้าไม่มีค่อยรอ Network
    })
  );
});
