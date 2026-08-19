const APP_VERSION = 'v38-TitanMode';
console.log(`🚀 App Version: ${APP_VERSION} (Secure CSP)`);

// 🟢 DOM Elements
const offlineBadge = document.getElementById('offlineBadge');
const systemToast = document.getElementById('systemToast');
const toastMsg = document.getElementById('toastMsg');
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearSearch');
const darkModeBtn = document.getElementById('darkModeBtn');
const voiceBtn = document.getElementById('voiceSearch');

// 🟢 State
let usage = {};
let pinnedCards = [];
let cardsData = []; 
let fuse = null;
const searchCache = new Map();

/* =========================
   UI & Toast Notification
========================= */
function showToast(message, duration = 3000) {
    toastMsg.innerText = message;
    systemToast.classList.add('show');
    setTimeout(() => systemToast.classList.remove('show'), duration);
}

/* =========================
   🔋 Battery & Offline Check
========================= */
let checkInterval = 15000; 
let wasOffline = false;

async function checkRealOnline() {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`./ping.txt?_cb=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
        clearTimeout(id);
        return res.ok; // 🟢 เพิ่มตรงนี้: คืนค่า true เฉพาะตอนที่เจอไฟล์ ping.txt จริงๆ (Status 200-299)
    } catch { return false; }
}

async function smartCheck() {
    if (document.hidden) return; 

    const isActuallyOnline = navigator.onLine ? await checkRealOnline() : false;
    
    if (!isActuallyOnline) {
        offlineBadge.style.display = 'flex';
        document.querySelectorAll('.online-only').forEach(el => el.classList.add('disabled'));
        if (!wasOffline) { showToast('คุณกำลังใช้งานโหมดออฟไลน์', 4000); wasOffline = true; }
        checkInterval = 5000; 
    } else {
        offlineBadge.style.display = 'none';
        document.querySelectorAll('.online-only').forEach(el => el.classList.remove('disabled'));
        if (wasOffline) { showToast('กลับสู่โหมดออนไลน์แล้ว'); wasOffline = false; }
        checkInterval = 30000; 
    }
    setTimeout(smartCheck, checkInterval);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) smartCheck(); });
window.addEventListener('online', () => { checkInterval = 5000; smartCheck(); });
window.addEventListener('offline', () => { offlineBadge.style.display = 'flex'; });

/* =========================
   🚀 Initialization & Prefetch
========================= */
async function initApp() {
    try {
        localforage.config({ name: 'KyogiPortal', storeName: 'portal_data' });
        
        const storedUsage = await localforage.getItem('usageV2');
        if (storedUsage && storedUsage.data && (Date.now() - storedUsage.ts < 2592000000)) { // 30 วัน
            usage = storedUsage.data;
        } else { usage = {}; }

        pinnedCards = (await localforage.getItem('pinnedCards')) || [];
        const lastUsed = await localforage.getItem('lastUsed');
        
        if (await localforage.getItem('darkMode')) {
            document.body.classList.add('dark');
            darkModeBtn.innerText = '☀️';
        }

        document.querySelectorAll('.card').forEach(card => {
            const name = card.dataset.name || '';
            const title = card.querySelector('.card-title')?.innerText || '';
            const useCount = usage[name] || 0;
            
            // 🔥 Smart Prefetch: ถ้าระบบนี้ถูกใช้บ่อย (> 5 ครั้ง) ให้ Preload ลิงก์รอเลย
            const cardUrl = card.dataset.href;
            if (useCount >= 5 && cardUrl && !cardUrl.endsWith('#')) {
                const link = document.createElement('link');
                link.rel = 'prefetch';
                link.href = cardUrl;
                document.head.appendChild(link);
            }

            const userBoost = (Math.log(useCount + 1) * 10) + (name === lastUsed ? 15 : 0);
            card.dataset.defaultOrder = 1000 - Math.round(userBoost);
            if(card.parentElement) card.dataset.parent = card.parentElement.id;

            cardsData.push({ id: name, title: title, keywords: card.dataset.keywords || '', element: card });

            // Event Listeners สำหรับการกดการ์ด (เพราะ <div> เปลี่ยนหน้าเองไม่ได้ ต้องใช้ JS สั่ง)
            card.addEventListener('click', async (e) => {
                // ถ้าเผลอกดโดนปุ่ม Pin หรือไอคอนดาว ให้ข้ามไป ไม่ต้องเปิดลิงก์
                if (e.target.closest('.pin')) return; 

                usage[name] = (usage[name] || 0) + 1;
                try {
                    await localforage.setItem('usageV2', { data: usage, ts: Date.now() });
                    await localforage.setItem('lastUsed', name);
                } catch(err) {}

                // 🟢 สั่งให้เปลี่ยนหน้าไปยังลิงก์ที่เก็บไว้ใน data-href
                const targetUrl = card.dataset.href;
                if (targetUrl) {
                    window.location.href = targetUrl;
                }
            });
        }); // 🟢 เติมบรรทัดนี้ลงไปเพื่อปิด forEach ครับ!

        sortCards();
        smartCheck(); // เริ่มระบบ Check
    } catch(e) { console.warn('Init App Storage Error:', e); sortCards(); }
}

/* =========================
   🧠 Advanced Search (Typo Support)
========================= */
function ensureFuse() {
    if (!fuse && cardsData.length > 0) {
        fuse = new Fuse(cardsData, {
            keys: [ { name: 'title', weight: 0.6 }, { name: 'keywords', weight: 0.4 } ],
            threshold: 0.4, // 🟢 อนุญาตให้พิมพ์ผิดได้ (Typo Support)
            minMatchCharLength: 2, // 🟢 เริ่มจับคู่ตั้งแต่ 2 ตัวอักษร
            ignoreLocation: true, useExtendedSearch: true
        });
    }
}

function escapeRegex(text) { return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'); }
function highlightText(text, term) {
    if (!term) return text;
    return text.replace(new RegExp(`(${escapeRegex(term)})`, 'gi'), '<mark>$1</mark>');
}

let debounceTimer;
searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(e.target.value.toLowerCase().trim()), 250);
});

function performSearch(term) {
    clearBtn.style.display = term.length > 0 ? 'block' : 'none';
    
    cardsData.forEach(item => {
        item.element.style.display = 'none';
        item.element.querySelector('.card-title').innerHTML = item.title;
    });
    
    if (term === '') {
        cardsData.forEach(item => {
            item.element.style.display = 'flex';
            item.element.style.order = item.element.dataset.defaultOrder;
        });
    } else {
        ensureFuse();
        let results = searchCache.has(term) ? searchCache.get(term) : fuse.search(term, { limit: 20 });
        if (!searchCache.has(term)) {
            searchCache.set(term, results);
            if (searchCache.size > 50) searchCache.delete(searchCache.keys().next().value);
        }

        results.forEach((result, index) => {
            result.item.element.style.display = 'flex';
            result.item.element.style.order = index;
            result.item.element.querySelector('.card-title').innerHTML = highlightText(result.item.title, term);
        });
    }

    document.querySelectorAll('.grid').forEach(grid => {
        let hasVisible = Array.from(grid.children).some(c => c.style.display !== 'none');
        if (grid.id === 'grid-pinned') document.getElementById('pinned-section').style.display = hasVisible ? 'block' : 'none';
        else {
            const sectionTitle = grid.previousElementSibling;
            if (sectionTitle?.classList.contains('section-title')) sectionTitle.style.display = hasVisible ? 'flex' : 'none';
        }
    });
}

clearBtn.addEventListener('click', () => { searchInput.value = ''; performSearch(''); searchInput.focus(); });
document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement !== searchInput) { e.preventDefault(); searchInput.focus(); }});

/* =========================
   🎤 Voice Search
========================= */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    voiceBtn.style.display = 'block';
    const recognition = new SpeechRecognition();
    recognition.lang = 'th-TH';
    recognition.interimResults = false;

    recognition.onstart = () => { voiceBtn.classList.add('listening'); searchInput.placeholder = 'กำลังฟัง...'; };
    
    // 🟢 อัปเกรด: รับเสียงปุ๊บ ค้นหาปั๊บ พร้อมซ่อน Keyboard (blur) ทันที UX ดีเยี่ยม
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        searchInput.value = transcript;
        performSearch(transcript.toLowerCase().trim());
        searchInput.blur(); 
    };
    
    recognition.onend = () => { voiceBtn.classList.remove('listening'); searchInput.placeholder = "🔍 ค้นหา... (กด '/' เพื่อค้นหาด่วน)"; };
    voiceBtn.addEventListener('click', () => { voiceBtn.classList.contains('listening') ? recognition.stop() : recognition.start(); });
}

/* =========================
   UI Interactivity
========================= */
darkModeBtn.addEventListener('click', async () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    try { await localforage.setItem('darkMode', isDark); } catch(e){}
    darkModeBtn.innerText = isDark ? '☀️' : '🌙';
});

async function togglePin(event, card) {
    event.preventDefault(); event.stopPropagation();
    if (navigator.vibrate) navigator.vibrate(30);
    const cardName = card.dataset.name;
    card.style.transform = 'scale(0.9)';
    
    setTimeout(async () => {
        card.style.transform = '';
        if (!pinnedCards.includes(cardName)) pinnedCards.push(cardName);
        else { pinnedCards = pinnedCards.filter(i => i !== cardName); card.classList.remove('pinned'); }
        try { await localforage.setItem('pinnedCards', pinnedCards); } catch(e){}
        sortCards();
    }, 150);
}

function sortCards() {
    const pinnedGrid = document.getElementById('grid-pinned');
    const pinnedSection = document.getElementById('pinned-section');
    if (!pinnedGrid || !pinnedSection) return; // ป้องกัน Error ถ้าหา element ไม่เจอ

    pinnedGrid.innerHTML = '';
    let hasPinned = false;
    
    cardsData.forEach(item => {
        const c = item.element;
        // ถ้ายกเลิกปักหมุด ให้เอากลับไปหมวดเดิม
        if(!pinnedCards.includes(c.dataset.name) && c.dataset.parent) {
            c.classList.remove('pinned');
            const parentEl = document.getElementById(c.dataset.parent);
            if (parentEl) parentEl.appendChild(c);
        }
    });

    pinnedCards.forEach(name => {
        const item = cardsData.find(c => c.id === name);
        if (item) {
            item.element.classList.add('pinned');
            pinnedGrid.appendChild(item.element); // ย้ายการ์ดมาที่โปรแกรมที่ชอบ
            hasPinned = true;
        }
    });
    
    pinnedSection.style.display = hasPinned ? 'block' : 'none';
    performSearch(searchInput.value.toLowerCase().trim());
}

window.addEventListener('DOMContentLoaded', initApp);

// 🟢 Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showToast('มีอัปเดตใหม่! กำลังติดตั้ง...', 5000);
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
            });
        });
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) { window.location.reload(); refreshing = true; }
    });
}

/* =========================
   📱 PWA Install Promotion
========================= */
let deferredPrompt;
const installBtn = document.getElementById('installPwaBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    // ป้องกันไม่ให้เบราว์เซอร์โชว์ Prompt ขึ้นมาเอง (เราจะคุมเอง)
    e.preventDefault();
    deferredPrompt = e;
    
    // แสดงปุ่ม Install ขึ้นมาเมื่อระบบพร้อมให้ติดตั้ง
    if(installBtn) installBtn.style.display = 'block';
});

if(installBtn) {
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            // โชว์หน้าต่างยืนยันการติดตั้ง
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                console.log('ติดตั้ง PWA สำเร็จ');
            }
            
            // รีเซ็ตค่าและซ่อนปุ่ม
            deferredPrompt = null;
            installBtn.style.display = 'none';
        }
    });
}

window.addEventListener('appinstalled', () => {
    // ซ่อนปุ่มทันทีที่ติดตั้งเสร็จ
    if(installBtn) installBtn.style.display = 'none';
    showToast('ติดตั้งแอปพลิเคชันลงเครื่องเรียบร้อย! 🎉');
});

/* =========================
   📌 ระบบกด Fav (★) ขั้นเด็ดขาด (ป้องกันการเปิดลิงก์ 100%)
========================= */
window.addEventListener('click', function(e) {
    const pinBtn = e.target.closest('.pin');
    
    if (pinBtn) {
        // คาถาหยุดเวลา 3 ชั้น! ห้ามเปิดลิงก์ ห้ามกระเพื่อม ห้ามทำอะไรทั้งนั้น
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const card = pinBtn.closest('.card');
        
        if (card && typeof togglePin === 'function') {
            togglePin(e, card); // เรียกฟังก์ชันย้ายขึ้นข้างบนของพี่
        } else {
            console.error("หาฟังก์ชัน togglePin ไม่เจอครับ!");
        }
    }
}, true); // สำคัญมาก! ใส่ true เพื่อดักตบ Event ตั้งแต่ขาลง ก่อนที่แท็ก <a> หรือ <div> จะรู้ตัว
