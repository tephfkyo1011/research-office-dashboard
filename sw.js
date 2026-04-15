const CACHE_NAME = 'kyogi-portal-v9'; // 🟢 เปลี่ยนเวอร์ชัน
const MAX_ITEMS = 50;
const OFFLINE_URL = './offline.html';

const urlsToCache = [
  './',
  './index.html',
  OFFLINE_URL
];

self.addEventListener('install', e => {
  // 🟢 เอา self.skipWaiting() ออก เพื่อให้รอ User กดปุ่มอัปเดตก่อน
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// 🟢 รับคำสั่งข้ามการรอ (Skip Waiting) จากปุ่มอัปเดตใน UI
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

// 🟢 1. แก้ไข trimCache แบบโคตรเป๊ะ (อัปเดต keys ทุกรอบ)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  let keys = await cache.keys();
  while (keys.length > maxItems) {
    await cache.delete(keys[0]);
    keys = await cache.keys(); // refresh
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cacheRes => {
      const fetchPromise = fetch(e.request).then(networkRes => {
        const url = e.request.url;
        
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
        // 🟢 2. Fallback หน้า Offline เฉพาะตอนขอไฟล์ HTML เท่านั้น
        const acceptHeader = e.request.headers.get('accept');
        if (acceptHeader && acceptHeader.includes('text/html')) {
          return cacheRes || caches.match(OFFLINE_URL);
        }
        return cacheRes; // ถ้าไม่ใช่ HTML (เช่น รูป/CSS) ก็ส่ง cache หรือปล่อย fail ไป
      });

      return cacheRes || fetchPromise;
    })
  );
});
