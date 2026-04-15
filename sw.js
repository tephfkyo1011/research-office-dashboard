const CACHE_NAME = 'kyogi-portal-v10'; // 🟢 อัปเดต Version
const MAX_ITEMS = 50;
const OFFLINE_URL = './offline.html';

// 🟢 3. Fix Version CDN ป้องกัน Layout พังตอน CDN อัปเดต
const STATIC_ASSETS = [
  './',
  './index.html',
  OFFLINE_URL,
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  let keys = await cache.keys();
  while (keys.length > maxItems) {
    await cache.delete(keys[0]);
    keys = await cache.keys();
  }
}

// 🟢 2. เพิ่ม Fetch Timeout ป้องกัน UI Freeze
function fetchWithTimeout(request, timeout = 4000) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeout)
    )
  ]);
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cacheRes => {
      // 🟢 6. Optimization: ถ้ามี Cache ให้ Return เลย ไม่ต้องลุ้น Fetch ซ้ำ (ลด Network Load)
      if (cacheRes) return cacheRes;

      const fetchPromise = fetchWithTimeout(e.request).then(networkRes => {
        const url = e.request.url;
        
        // กรองเฉพาะสิ่งที่เราอยาก Cache แบบ Dynamic
        if (
          url.startsWith(self.location.origin) ||
          url.includes('fonts.googleapis.com') ||
          url.includes('fonts.gstatic.com') ||
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
        // Fallback หน้า Offline
        const acceptHeader = e.request.headers.get('accept');
        if (acceptHeader && acceptHeader.includes('text/html')) {
          return caches.match(OFFLINE_URL);
        }
      });

      return fetchPromise;
    })
  );
});
