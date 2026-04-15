const CACHE_VERSION = 'v13'; 
const CACHE_NAME = `kyogi-portal-${CACHE_VERSION}`;
const OFFLINE_URL = './offline.html';
const MAX_CACHE_ITEMS = 80;

const STATIC_ASSETS = [
  './',
  './index.html',
  OFFLINE_URL,
  './ping.txt', // 🟢 เพิ่ม ping.txt สำหรับ Health check แบบประหยัดพลังงาน Server
  './libs/fuse.min.js',
  './libs/localforage.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', e => {
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

async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      await cache.delete(keys[0]);
      trimCache(cacheName, maxItems); 
    }
  } catch (err) { console.error('Trim Cache Error:', err); }
}

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

const inFlight = new Map();
function dedupeFetch(request) {
  const key = request.url;
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = fetchWithTimeout(request).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  try {
    if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
      e.respondWith(
        dedupeFetch(e.request)
          .then(networkRes => {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(e.request, clone);
              trimCache(CACHE_NAME, MAX_CACHE_ITEMS);
            });
            return networkRes;
          })
          .catch(async () => {
            const cacheRes = await caches.match(e.request);
            return cacheRes || caches.match(OFFLINE_URL);
          })
      );
      return;
    }

    e.respondWith(
      caches.match(e.request).then(cacheRes => {
        const fetchPromise = dedupeFetch(e.request).then(networkRes => {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, networkRes.clone());
            trimCache(CACHE_NAME, MAX_CACHE_ITEMS);
          });
          return networkRes;
        }).catch(() => caches.match(e.request));

        return cacheRes || fetchPromise;
      })
    );
  } catch (err) {
    console.error('SW FETCH ERROR:', err);
  }
});
