const CACHE_VERSION = 'v46'; // 🟢 อัปเดตเป็น v45 เพื่อบังคับเคลียร์แคชเก่า
const STATIC_CACHE = `kyogi-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `kyogi-dynamic-${CACHE_VERSION}`;
const OFFLINE_URL = './offline.html';
const MAX_DYNAMIC_ITEMS = 100;

// 🟢 โหลดทุกอย่างจาก Local (เพิ่มไฟล์ที่เพิ่งสร้างใหม่)
const STATIC_ASSETS = [
  // --- ⚙️ โซนที่ 1: ไฟล์ระบบหลัก (Core Files) ---
  './',
  './index.html',
  './app.js?v=46', // 🟢 อัปเดตเวอร์ชันให้ตรงกับ CACHE_VERSION
  './offline.html',
  './ping.txt',
  './manifest.json', // 📌 เพิ่ม Manifest
  './Research_Office_KYOGI.png', // 📌 เพิ่มไอคอนหลัก

  // --- 📚 โซนที่ 2: ไลบรารี (Libraries) ---
  './libs/fuse.min.js',
  './libs/localforage.min.js',

  // --- 📝 โซนที่ 3: ระบบใหม่ ---
  './knowledge-wi.html',
  './Gas_System_API.html',
  './logo-gas-stock-new.png',

  // --- ❄️ โซนที่ 4: โปรแกรมเดิม ---
  './logo-freezer-check.html',
  './logo-freezer-check.png',
  './logo-gas-stock.html',
  './logo-gas-stock.png',
  './logo-health-family.html',
  './logo-health-family.png',
  './logo-hsr-dashboard.html',
  './logo-hsr-dashboard.png',
  './logo-lms-dashboard.html',
  './logo-lms-dashboard.png',
  './logo-lms-lab.html',
  './logo-lms-lab.png',
  './logo-ln2-log.html',
  './logo-ln2-log.png',
  './logo-ot-time.html',
  './logo-ot-time.png',
  './logo-specimen-dashboard.html',
  './logo-specimen-dashboard.png',
  './logo-spore-dashboard.html',
  './logo-spore-dashboard.png',
  './logo-spore-test.html',
  './logo-spore-test.png',
  './logo-tumor-bank.html',
  './logo-tumor-bank.png',
  './logo-withdraw-specimen.html',
  './logo-withdraw-specimen.png'
];

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', e => {
  self.skipWaiting(); // บังคับลงทันที
  e.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
          return caches.delete(key);
        }
      }))
    ).then(async () => {
      // 🟢 เปิดใช้งาน Navigation Preload ถ้ารองรับ (โหลดข้อมูลรอเลยขณะ SW กำลังบูท)
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      self.clients.claim();
    })
  );
});

// 🟢 ใช้ while loop แทน Recursion ป้องกัน Stack Overflow
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    while (keys.length > maxItems) {
      await cache.delete(keys.shift());
    }
  } catch (err) { console.error('Trim Cache Error:', err); }
}

self.addEventListener('fetch', e => {
  // 🟢 1. ดักจับและข้ามพวก Chrome Extension หรือ URL ที่ไม่ใช่ http/https ทันที
  if (!e.request.url.startsWith('http')) {
    return;
  }

  // 🟢 2. ถ้าไม่ใช่ GET ให้ข้ามไป
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);

  try {
    // 🔥 1. HTML / Navigation -> Network First + Navigation Preload
    if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
      e.respondWith(
        (async () => {
          try {
            // ดึง Preload ก่อน ถ้ามี
            const preloadRes = await e.preloadResponse;
            if (preloadRes && preloadRes.status === 200) {
              const cache = await caches.open(DYNAMIC_CACHE);
              cache.put(e.request, preloadRes.clone());
              return preloadRes;
            }

            const networkRes = await fetch(e.request);
            // 🟢 เช็ค Status 200 ก่อน Cache ป้องกันการจำหน้า 404
            if (networkRes && networkRes.status === 200) {
              const cache = await caches.open(DYNAMIC_CACHE);
              cache.put(e.request, networkRes.clone());
              await trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_ITEMS);
            }
            return networkRes;
          } catch (err) {
            const cacheRes = await caches.match(e.request);
            // 🟢 Fallback กลับไปหา Cache ถ้าเน็ตหลุด ถ้าไม่มีให้โยนหน้า offline.html
            return cacheRes || caches.match(OFFLINE_URL);
          }
        })()
      );
      return;
    }

    // 🔥 2. Assets (CSS, JS, API, Fonts, Icons) -> Stale-While-Revalidate
    e.respondWith(
      (async () => {
        const cacheRes = await caches.match(e.request);
        
        const fetchPromise = fetch(e.request).then(async networkRes => {
          // 📌 แก้ไข: เอา && networkRes.type === 'basic' ออก หรืออนุญาต status 0 
          // เพื่อให้สามารถ Cache ไฟล์จากภายนอกเช่น Google Fonts / FontAwesome ได้
          if (networkRes && (networkRes.status === 200 || networkRes.status === 0)) {
            const staticPaths = STATIC_ASSETS.map(asset => new URL(asset, self.location.origin).pathname);
            const targetCache = staticPaths.includes(url.pathname) ? STATIC_CACHE : DYNAMIC_CACHE;
            const cache = await caches.open(targetCache);
            cache.put(e.request, networkRes.clone());
            
            if (targetCache === DYNAMIC_CACHE) {
                await trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_ITEMS);
            }
          }
          return networkRes;
        }).catch(err => console.warn('Background sync failed:', err));

        // 🟢 ถ้ามี Cache โยนกลับไปเลยทันที แล้วปล่อย fetch ทำงานเบื้องหลัง
        if (cacheRes) {
          return cacheRes;
        }
        return fetchPromise;
      })()
    );
  } catch (err) {
    console.error('SW FETCH ERROR:', err);
  }
});
