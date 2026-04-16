const CACHE_VERSION = 'v33'; // 🟢 อัปเดตเป็น v33 เพื่อบังคับเคลียร์แคชเก่า ดึง app.js ตัวใหม่ แก้โค้ดต้องอัปเลขทุกครั้ง
const STATIC_CACHE = `kyogi-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `kyogi-dynamic-${CACHE_VERSION}`;
const OFFLINE_URL = './offline.html';
const MAX_DYNAMIC_ITEMS = 100;

// 🟢 โหลดทุกอย่างจาก Local
const STATIC_ASSETS = [
  // --- ⚙️ โซนที่ 1: ไฟล์ระบบหลัก (Core Files) ---
  './',
  './index.html',
  './app.js?v=33', // 🟢 อัปเดตเป็น v33 เพื่อบังคับเคลียร์แคชเก่า ดึง app.js ตัวใหม่ แก้โค้ดต้องอัปเลขทุกครั้ง
  './offline.html',
  './ping.txt',

  // --- 📚 โซนที่ 2: ไลบรารี (Libraries) ---
  './libs/fuse.min.js',
  './libs/localforage.min.js',

  // --- ❄️ โซนที่ 3: โปรแกรมที่ 1 - ตู้แช่ & LN2 ---
  './logo-freezer-check.html',
  './logo-freezer-check.png',

  // --- ⛽ โซนที่ 4: โปรแกรมที่ 2 - ระบบจัดการแก๊ส ---
  './logo-gas-stock.html',
  './logo-gas-stock.png',

  // --- 🏥 โซนที่ 5: โปรแกรมที่ 3 - Health Family ---
  './logo-health-family.html',
  './logo-health-family.png',

  // --- 📊 โซนที่ 6: โปรแกรมที่ 4 - Dashboard ครุภัณฑ์ HSR ---
  './logo-hsr-dashboard.html',
  './logo-hsr-dashboard.png',

  // --- 🔬 โซนที่ 7: โปรแกรมที่ 5 - Dashboard จองเครื่องมือ Lab ---
  './logo-lms-dashboard.html',
  './logo-lms-dashboard.png',

  // --- 🧪 โซนที่ 8: โปรแกรมที่ 6 - Lab Instrument Management System (LMS) ---
  './logo-lms-lab.html',
  './logo-lms-lab.png',

  // --- 🧊 โซนที่ 9: โปรแกรมที่ 7 - ระบบบันทึก Liquid Nitrogen ---
  './logo-ln2-log.html',
  './logo-ln2-log.png',

  // --- ⏰ โซนที่ 10: โปรแกรมที่ 8 - ระบบลงเวลาปฏิบัติงานนอกเวลา ---
  './logo-ot-time.html',
  './logo-ot-time.png',

  // --- 🧬 โซนที่ 11: โปรแกรมที่ 9 - HSR Specimen Banking Dashboard ---
  './logo-specimen-dashboard.html',
  './logo-specimen-dashboard.png',

  // --- 🧫 โซนที่ 12: โปรแกรมที่ 10 - Dashboard ระบบทดสอบคุณภาพ Spore Test ---
  './logo-spore-dashboard.html',
  './logo-spore-dashboard.png',

  // --- 🧪 โซนที่ 13: โปรแกรมที่ 11 - RC Autoclave Spore Test ---
  './logo-spore-test.html',
  './logo-spore-test.png',

  // --- 🎗️ โซนที่ 14: โปรแกรมที่ 12 - Tumor Bank Transport ---
  './logo-tumor-bank.html',
  './logo-tumor-bank.png',

  // --- 📦 โซนที่ 15: โปรแกรมที่ 13 - ระบบเบิก-จ่ายตัวอย่าง ---
  './logo-withdraw-specimen.html',
  './logo-withdraw-specimen.png',
  
  // (สามารถเติมโปรแกรมต่อไปเรื่อยๆ ด้านล่างนี้ได้เลยครับ)
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

// 🟢 แก้ไข: ใช้ while loop แทน Recursion ป้องกัน Stack Overflow
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
  // 🟢 1. เพิ่มตรงนี้! ดักจับและข้ามพวก Chrome Extension หรือ URL ที่ไม่ใช่ http/https ทันที
  if (!e.request.url.startsWith('http')) {
    return;
  }

  // 🟢 2. โค้ดเดิมของพี่: ถ้าไม่ใช่ GET ให้ข้ามไป
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
            // 🟢 Fallback เฉพาะ HTML เท่านั้น
            return cacheRes || caches.match(OFFLINE_URL);
          }
        })()
      );
      return;
    }

    // 🔥 2. Assets (CSS, JS, API) -> Stale-While-Revalidate ของแท้
    e.respondWith(
      (async () => {
        const cacheRes = await caches.match(e.request);
        
        const fetchPromise = fetch(e.request).then(async networkRes => {
          if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
            const staticPaths = STATIC_ASSETS.map(asset => new URL(asset, self.location.origin).pathname);
            const targetCache = staticPaths.includes(url.pathname) ? STATIC_CACHE : DYNAMIC_CACHE;
            const cache = await caches.open(targetCache);
            cache.put(e.request, networkRes.clone());
            if (targetCache === DYNAMIC_CACHE) await trimCache(DYNAMIC_CACHE, MAX_DYNAMIC_ITEMS);
          }
          return networkRes;
        }).catch(err => console.warn('Background sync failed:', err));

        // 🟢 ถ้ามี Cache โยนกลับไปเลยทันที (เร็วสุดๆ) แล้วปล่อย fetch ทำงานเบื้องหลัง
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
