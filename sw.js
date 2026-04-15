const CACHE_VERSION = 'v11'; 
const CACHE_NAME = `kyogi-portal-${CACHE_VERSION}`;
const OFFLINE_URL = './offline.html';

// 🟢 4. Preload Fonts & CDNs ทั้งหมดตั้งแต่ติดตั้ง (Offline-Ready 100%)
const STATIC_ASSETS = [
  './',
  './index.html',
  OFFLINE_URL,
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600&family=Sarabun:wght@300;400&display=swap',
  'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js', // เพิ่ม Search Engine
  'https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js' // เพิ่ม IndexedDB Wrapper
];

self.addEventListener('install', e => {
  self.skipWaiting(); // ให้มันพยายาม Update เบื้องหลังไปเลย
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    ).then(() => self.clients.claim())
  );
});

// 🟢 1. AbortController (แก้ปัญหา Network Request ค้าง / Leak)
async function fetchWithTimeout(request, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(request, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // 🔥 HYBRID STRATEGY 1: HTML -> Network First (ให้ได้ข้อมูลล่าสุดเสมอ)
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetchWithTimeout(e.request, 4000)
        .then(networkRes => {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return networkRes;
        })
        .catch(async () => {
          // 🟢 3. Fallback Cache สุดท้าย ป้องกันจอขาว
          const cacheRes = await caches.match(e.request);
          return cacheRes || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // 🔥 HYBRID STRATEGY 2: Images -> Cache First (โหลดไว ไม่เปลืองแบนด์วิดท์)
  if (e.request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
    e.respondWith(
      caches.match(e.request).then(cacheRes => {
        if (cacheRes) return cacheRes; // มี Cache คืนเลย
        return fetchWithTimeout(e.request, 5000).then(networkRes => {
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, networkRes.clone()));
          return networkRes;
        }).catch(() => caches.match(e.request)); // Fallback Offline Image (ถ้ามี)
      })
    );
    return;
  }

  // 🔥 HYBRID STRATEGY 3: CSS/JS/Fonts -> Stale-While-Revalidate (SWR)
  e.respondWith(
    caches.match(e.request).then(cacheRes => {
      // Background Fetch เพื่ออัปเดต Cache (Revalidate)
      const fetchPromise = fetchWithTimeout(e.request, 5000).then(networkRes => {
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, networkRes.clone()));
        return networkRes;
      }).catch(() => caches.match(e.request)); // Fallback

      // ถ้ามี Cache ส่งให้ User ใช้ก่อนเลย ไม่ต้องรอโหลดเสร็จ (Stale)
      return cacheRes || fetchPromise;
    })
  );
});
