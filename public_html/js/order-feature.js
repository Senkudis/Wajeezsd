// public_html/js/order-feature.js
// Note: window.userLocation is initialized by home.js on page load

// ==========================================
// 🛡️ XSS Prevention Helper
// ==========================================
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// دالة تحويل مسار الصورة إلى رابط كامل (مشتركة في كل الملف)
function getFullImageUrl(url) {
    if (!url) return '';
    if (url.startsWith('data:image')) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base = (window.API_URL && window.API_URL !== '') ? window.API_URL : 'https://wajeezsd.com';
    const clean = url.replace(/\\/g, '/');
    const withSlash = clean.startsWith('/') ? clean : '/' + clean;
    // على السيرفر الحي، الصور موجودة تحت /api/uploads
    // على المحلي (localhost:5000)، الصور مباشرة تحت /uploads
    const isLocal = base.includes('localhost') || base.includes('127.0.0.1');
    if (!isLocal && withSlash.startsWith('/uploads')) {
        return base + '/api' + withSlash;
    }
    return base + withSlash;
}

// ==========================================
// 📱 Sudan Phone Number Formatter (for WhatsApp)
// ==========================================
function formatSudanPhone(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/[^\d]/g, '');
    if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
    if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
    if (cleaned.startsWith('249')) return '+' + cleaned;
    return '+249' + cleaned;
}

// ==========================================
// ⏱️ Debounce Helper
// ==========================================
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

let placesData = [];
let currentCategoryName = '';

// ==========================================
// 🧭 Navigation and View Toggling
// ==========================================
window.showHomeSection = function() {
    // Only relevant when running inside index.html (both sections exist)
    const homeSection = document.getElementById('home-section');
    const orderSection = document.getElementById('order-section');
    if (homeSection) homeSection.classList.remove('d-none');
    if (orderSection) orderSection.classList.add('d-none');

    // Update URL cleanly (removes ?tab=order) and update nav active state
    history.replaceState(null, '', window.location.pathname.replace('index.html', '') || '/');
    document.querySelectorAll('.nav-item-link').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (href.includes('client-order')) a.classList.remove('active');
        else if (href.endsWith('index.html') || href === './' || href === '/') a.classList.add('active');
        else a.classList.remove('active');
    });
}

window.showOrderSection = function() {
    // If running on client-order.html, sections don't exist — just load categories
    const homeSection = document.getElementById('home-section');
    const orderSection = document.getElementById('order-section');
    if (homeSection) homeSection.classList.add('d-none');
    if (orderSection) orderSection.classList.remove('d-none');

    // Update URL and nav active state
    history.replaceState(null, '', '?tab=order');
    document.querySelectorAll('.nav-item-link').forEach(a => {
        const href = a.getAttribute('href') || '';
        if (href.includes('client-order')) a.classList.add('active');
        else if (href.endsWith('index.html') || href === './' || href === '/') a.classList.remove('active');
        else a.classList.remove('active');
    });

    // Check Authentication — same pattern as notifications.html and client-my-orders.html
    const token = localStorage.getItem('token');
    const grid = document.getElementById('categories-grid');
    if (!grid) return; // Not on a page with categories

    if (!token) {
        // Guest — show login prompt injected into the grid container
        grid.innerHTML = `
            <div class="text-center py-5 col-12" id="guest-view">
                <div class="mb-4">
                    <i class="bi bi-shop" style="font-size: 4rem; color: #dee2e6;"></i>
                </div>
                <h5 class="fw-bold text-dark mb-2">تصفح المحلات</h5>
                <p class="text-muted mb-4">يجب عليك تسجيل الدخول أو إنشاء حساب لعرض المحلات وتقديم الطلبات</p>
                <div class="d-flex gap-2 justify-content-center">
                    <a href="client-login.html" class="btn btn-success rounded-pill px-4">
                        <i class="bi bi-box-arrow-in-right me-2"></i>تسجيل الدخول
                    </a>
                    <a href="client-register.html" class="btn btn-outline-success rounded-pill px-4">
                        <i class="bi bi-person-plus me-2"></i>إنشاء حساب
                    </a>
                </div>
            </div>`;
        return;
    }

    // Authenticated — fetch categories if not already loaded
    if (grid.innerHTML.includes('spinner-border') || document.getElementById('guest-view')) {
        // skeleton chips متناسقة مع شبكة التصنيفات بدل السبينر العائم
        grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton skeleton-chip"></div>').join('');
        fetchCategories();
    }
}

window.showCategories = function() {
    document.getElementById('categories-view').classList.remove('d-none');
    document.getElementById('places-view').classList.add('d-none');
}

// ==========================================
// 🏬 Fetch Categories
// ==========================================
// Category gradient colors pool
const CAT_COLORS = [
    { bg: 'linear-gradient(135deg,#ff6b6b,#ee5a24)', light: '#fff1f1' },
    { bg: 'linear-gradient(135deg,#f9ca24,#f0932b)', light: '#fffbeb' },
    { bg: 'linear-gradient(135deg,#6ab04c,#badc58)', light: '#f0fdf4' },
    { bg: 'linear-gradient(135deg,#30336b,#6c5ce7)', light: '#ede9fe' },
    { bg: 'linear-gradient(135deg,#0652DD,#1289A7)', light: '#eff6ff' },
    { bg: 'linear-gradient(135deg,#e84393,#f368e0)', light: '#fdf2f8' },
    { bg: 'linear-gradient(135deg,#ff7675,#fd79a8)', light: '#fff0f5' },
    { bg: 'linear-gradient(135deg,#00b894,#00cec9)', light: '#f0fdfa' },
];

// Expose for global search
window._allCatsCache = [];

const CATS_CACHE_KEY = 'wajeez_categories_cache';

// 🔗 فتح قسم محدّد قادم من بنر إعلاني (client-order.html?cat=<id>) — مرة واحدة فقط
let _catDeepLinkHandled = false;
function _openDeepLinkedCategory(categories) {
    if (_catDeepLinkHandled) return;
    try {
        const catParam = new URLSearchParams(location.search).get('cat');
        if (!catParam) { _catDeepLinkHandled = true; return; }
        const c = categories.find(x => String(x._id) === String(catParam));
        if (c && typeof loadPlaces === 'function') {
            _catDeepLinkHandled = true;
            loadPlaces(c._id, c.name, c.notes || '');
        }
    } catch (_) {}
}

async function fetchCategories() {
    const grid = document.getElementById('categories-grid');

    // ⚡ stale-while-revalidate: اعرض الكاش فوراً ثم حدّث من الشبكة في الخلفية
    let hadCache = false;
    let cachedJson = '';
    try {
        const cached = JSON.parse(sessionStorage.getItem(CATS_CACHE_KEY) || 'null');
        if (cached && Array.isArray(cached.data) && cached.data.length) {
            hadCache = true;
            cachedJson = JSON.stringify(cached.data);
            window._allCatsCache = cached.data;
            if (window._allCats !== undefined) window._allCats = cached.data;
            renderCategoryChips(cached.data);
            _openDeepLinkedCategory(cached.data);
        }
    } catch (_) {}

    try {
        const res = await fetch(`${API_URL}/api/places/categories`);
        if (!res.ok) throw new Error('فشل تحميل التصنيفات');
        const categories = await res.json();
        const freshJson = JSON.stringify(categories);

        try { sessionStorage.setItem(CATS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: categories })); } catch (_) {}

        window._allCatsCache = categories;
        // Expose to page-level script
        if (window._allCats !== undefined) window._allCats = categories;

        // البيانات مطابقة للكاش المعروض؟ لا داعي لإعادة الرندر (تجنّب وميض)
        if (hadCache && freshJson === cachedJson) {
            _openDeepLinkedCategory(categories);
            return;
        }

        if (categories.length === 0) {
            if (grid) grid.innerHTML = '';
            const feat = document.getElementById('featured-section');
            if (feat) feat.innerHTML = `<div class="empty-state">
                <div class="empty-icon">🏪</div>
                <h6>لا توجد تصنيفات حالياً</h6>
                <p>سيتم إضافة المحلات قريباً</p>
            </div>`;
            return;
        }

        renderCategoryChips(categories);
        _openDeepLinkedCategory(categories);

    } catch (err) {
        // الكاش معروض بالفعل؟ لا تستبدله برسالة خطأ
        if (!hadCache && grid) grid.innerHTML = `<div style="padding:12px;color:#ef4444;font-size:13px;font-weight:700;"><i class="bi bi-exclamation-triangle me-1"></i>${err.message}</div>`;
    }
}

window.renderCategoryChips = function(categories, isSearchResult = false) {
    const grid = document.getElementById('categories-grid');
    if (!grid) return;

    // Switch container class: grid for normal, flex for search results (may be few items)
    if (isSearchResult && categories.length <= 3) {
        grid.className = 'cats-grid cats-grid--few';
    } else {
        grid.className = 'cats-grid';
    }

    grid.innerHTML = categories.map((cat, i) => {
        const color = CAT_COLORS[i % CAT_COLORS.length];

        return `
        <div class="cat-chip fade-in-up" data-cat-id="${escapeHtml(String(cat._id))}" data-cat-name="${(cat.name||'').replace(/"/g,'&quot;')}" data-cat-notes="${(cat.notes||'').replace(/"/g,'&quot;')}">
            <div class="chip-icon" style="background:${color.bg};">
                <i class="bi ${cat.icon}" style="color:white;font-size:22px;"></i>
            </div>
            <div class="chip-label">${escapeHtml(cat.name)}</div>
        </div>`;
    }).join('');

    document.querySelectorAll('.cat-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            selectCatChip(this, this.dataset.catId, this.dataset.catName, this.dataset.catNotes);
        });
    });
};

window.selectCatChip = function(el, catId, catName, catNotes) {
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    loadPlaces(catId, catName, catNotes);
};


// ==========================================
// 🗺️ Distance Calculation (Haversine)
// ==========================================
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1.15; // 1.15 — طريق أقصر من المتوسط الطولاني للمدينة
}

// ==========================================
// 📍 Get User Location (Promisified) — كاش 3 دقائق
// ==========================================
function getUserLocation() {
    // 📍 موقع تقريبي — لترتيب المتاجر بالمسافة فقط، لا يحتاج دقة أمتار.
    // ⚠️ يفوّض لـ WajeezGeo.getCoarse (js/geo.js): الكاش الخشن هناك منفصل عن الكاش الدقيق،
    // فلم يعد الموقعُ الخشنُ (±كيلومترات، عمره دقيقتان) يدهس الموقعَ الدقيق الذي يعتمد عليه
    // دبوسُ الطلب. كانت النسخة القديمة تكتب كليهما في window.userLocation نفسه.
    return window.WajeezGeo.getCoarse().then((loc) => {
        window.userLocation = loc;
        window.userLocationTs = Date.now();
        return loc;
    });
}

// ==========================================
// 🛍️ Fetch Places — GPS والشبكة بالتوازي + كاش فوري (SWR)
// كان: انتظار GPS عالي الدقة (حتى 10 ثوانٍ) قبل بدء طلب المتاجر أصلاً!
// ==========================================
let _placesViewSeq = 0; // يحمي من سباق العرض عند التنقل السريع بين الأقسام

async function loadPlaces(categoryId, categoryName, categoryNotes = '') {
    const seq = ++_placesViewSeq;

    // Reset globals for this view
    placesData = [];
    currentCategoryName = categoryName;

    document.getElementById('categories-view').classList.add('d-none');
    document.getElementById('places-view').classList.remove('d-none');
    document.getElementById('places-category-title').innerText = categoryName;

    const listContainer = document.getElementById('places-list');
    const currentCity = typeof CityService !== 'undefined' ? CityService.getCity() : 'Khartoum';
    const cacheKey = `wajeez_places_${categoryId}_${currentCity}`;

    // Category Note Banner
    let notesHtml = '';
    if (categoryNotes && categoryNotes.trim() !== '') {
        notesHtml = `<div class="cat-note-banner fade-in-up">
            <i class="bi bi-info-circle-fill" style="font-size:18px;flex-shrink:0;"></i>
            <span style="font-size:13px;">${categoryNotes}</span>
        </div>`;
    }

    // فلترة + مسافات + رندر — تُستدعى من الكاش ومن الشبكة ومن وصول GPS المتأخر
    const finalize = (places, loc) => {
        // 🚫 إخفاء متجر التاجر الخاص (لا يمكن للتاجر أن يطلب من متجره)
        const currentUserId = localStorage.getItem('userId');
        if (currentUserId) {
            places = places.filter(p => {
                const ownerId = p.ownerId ? p.ownerId.toString() : null;
                return ownerId !== currentUserId;
            });
        }

        if (loc && loc.lat != null) {
            places = places.map(p => {
                const plat = p.location?.lat ?? 0;
                const plng = p.location?.lng ?? 0;
                p.distanceKm = calculateHaversineDistance(loc.lat, loc.lng, plat, plng);
                return p;
            }).sort((a, b) => a.distanceKm - b.distanceKm);
        }
        // بدون GPS تبقى distanceKm غير معرّفة — renderPlacesList يتعامل معها

        placesData = places; // cache for modal
        window._allPlacesCache = places; // for global search

        const countBadge = document.getElementById('places-count-badge');
        if (countBadge) {
            countBadge.style.display = '';
            countBadge.textContent = `${places.length} محل`;
        }

        if (places.length === 0) {
            listContainer.innerHTML = notesHtml + `<div class="empty-state">
                <div class="empty-icon">🏪</div>
                <h6>لا توجد محلات في هذا التصنيف</h6>
                <p>سيتم إضافة محلات قريباً</p>
            </div>`;
            return;
        }
        renderPlacesList(places, listContainer, notesHtml);
    };

    // ⚡ 1. عرض فوري من كاش الجلسة إن وُجد (ثم يُحدَّث من الشبكة بصمت)
    let hadCache = false;
    try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
        if (cached && Array.isArray(cached.places)) {
            hadCache = true;
            finalize(cached.places.slice(), window.userLocation || null);
        }
    } catch (_) {}

    if (!hadCache) {
        // Skeleton loading — 4 بطاقات تملأ صفّي الشبكة بالتساوي
        listContainer.innerHTML = [1, 2, 3, 4].map(() => `
            <div class="skeleton-card">
                <div class="skeleton skeleton-cover"></div>
                <div class="skeleton-body">
                    <div class="skeleton skeleton-line" style="width:60%;"></div>
                    <div class="skeleton skeleton-line" style="width:40%;"></div>
                </div>
            </div>`).join('');
    }

    // ⚡ 2. GPS والشبكة ينطلقان معاً — الشبكة لا تنتظر GPS إطلاقاً
    const locPromise = getUserLocation().catch((err) => {
        console.warn('[loadPlaces] GPS غير متاح، عرض المتاجر بدون ترتيب مسافة:', err.message);
        return null;
    });

    try {
        const res = await fetch(`${API_URL}/api/places?category_id=${categoryId}&city=${encodeURIComponent(currentCity)}`);
        if (!res.ok) throw new Error('خطأ في الاتصال بالخادم');
        const places = await res.json();

        try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), places })); } catch (_) {}
        if (seq !== _placesViewSeq) return; // المستخدم فتح قسماً آخر أثناء الجلب

        // امنح GPS مهلة قصيرة (1.2 ثانية) إن لم يكن جاهزاً — ثم اعرض فوراً بدونه
        const loc = await Promise.race([
            locPromise,
            new Promise(r => setTimeout(() => r(window.userLocation || null), 1200))
        ]);
        if (seq !== _placesViewSeq) return;
        finalize(places.slice(), loc);

        // وصل GPS متأخراً؟ أعد الترتيب بالأقرب بهدوء دون شاشة تحميل
        if (!loc) {
            locPromise.then(late => {
                if (late && seq === _placesViewSeq) finalize(places.slice(), late);
            });
        }
    } catch (err) {
        if (seq !== _placesViewSeq) return;
        if (hadCache) return; // المحتوى المعروض من الكاش أفضل من رسالة خطأ
        const safeName = (categoryName || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        listContainer.innerHTML = `<div class="empty-state">
            <div class="empty-icon" style="font-size:40px;">📍</div>
            <h6 class="text-danger">فشل تحميل المحلات</h6>
            <p>${err.message}</p>
            <button class="btn btn-success rounded-pill px-4 mt-2 fw-bold" onclick="loadPlaces('${categoryId}', '${safeName}')">
                <i class="bi bi-arrow-clockwise me-1"></i>إعادة المحاولة
            </button>
        </div>`;
    }
}

// يُنسّق الأعداد الكبيرة بشكل مختصر: 980 → "980"، 1200 → "1.2k"، 25000 → "25k"
function formatCompactCount(n) {
    n = Number(n) || 0;
    if (n < 1000) return String(n);
    const k = n / 1000;
    return (k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')) + 'k';
}

// ─── Shared place card renderer (used by loadPlaces + search) ───
window.renderPlacesList = function(places, container, prependHtml = '') {
    const defaultImage = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80';

    const html = places.map((p, idx) => {
        const isOpen = p.is_open;
        const imgSrc = getFullImageUrl(p.image_url) || defaultImage;
        const dist = p.distanceKm != null ? `${Number(p.distanceKm).toFixed(1)} كم` : '-- كم';
        const views = formatCompactCount(p.viewsCount || 0);

        // التقييم: يظهر النجمة والمعدّل وعدد المقيّمين، أو شارة "جديد" إن لم يُقيّم بعد
        const ratingHtml = p.ratingAvg > 0
            ? `<span class="meta-item rating"><i class="bi bi-star-fill"></i> ${Number(p.ratingAvg).toFixed(1)} <span style="color:#9ca3af;font-weight:600;">(${p.ratingCount || 0})</span></span>`
            : `<span class="meta-item is-new"><i class="bi bi-stars"></i> جديد</span>`;

        const menuBtn = p.menu
            ? `<button class="place-card-menu-btn" onclick="event.stopPropagation(); viewMenuInList('${getFullImageUrl(p.menu)}')">
                <i class="bi bi-card-image" style="color:#f59e0b;"></i> المنيو
               </button>`
            : '';

        return `
        <div class="place-card fade-in-up" onclick="openPlaceDetails('${p._id}')"
            style="animation-delay:${Math.min(idx * 0.07, 0.4)}s; opacity:0;">
            <div class="place-card-cover">
                <img src="${imgSrc}" alt="${escapeHtml(p.name)}"
                    onerror="this.src='${defaultImage}'">
                <div class="place-card-cover-overlay"></div>
                ${menuBtn}
                <div class="place-card-status ${isOpen ? 'open' : 'closed'}">
                    <span class="status-dot"></span>${isOpen ? 'مفتوح' : 'مغلق'}
                </div>
            </div>
            <div class="place-card-body">
                <div class="place-card-name">${escapeHtml(p.name)}</div>
                <div class="place-card-meta">
                    ${ratingHtml}
                    <span class="meta-dot">·</span>
                    <span class="meta-item views"><i class="bi bi-eye-fill"></i> ${views}</span>
                    <span class="meta-dot">·</span>
                    <span class="meta-item dist"><i class="bi bi-geo-alt-fill"></i> ${dist}</span>
                </div>
                <button class="place-card-cta">
                    <i class="bi bi-bag-plus-fill"></i>
                    تسوق
                </button>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = (prependHtml || '') + html;
};


// ==========================================
// 📷 Receipt Image Handlers
// ==========================================
window.viewMenuInList = function (url) {
    Swal.fire({
        imageUrl: url,
        imageAlt: 'قائمة الأسعار',
        confirmButtonText: 'إغلاق',
        confirmButtonColor: '#04553A',
        customClass: {
            image: 'rounded-4 object-fit-contain w-100'
        }
    });
};

window.previewReceiptImage = function(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('receiptPreview').src = e.target.result;
        document.getElementById('receiptPreviewContainer').classList.remove('d-none');
    };
    reader.readAsDataURL(file);
}

window.clearReceiptImage = function() {
    const inputEl = document.getElementById('receiptImageInput');
    const previewEl = document.getElementById('receiptPreview');
    const containerEl = document.getElementById('receiptPreviewContainer');
    if (inputEl) inputEl.value = '';
    if (previewEl) previewEl.src = '';
    if (containerEl) containerEl.classList.add('d-none');
}

// ==========================================
// 🔍 Place Details Modal
// ==========================================
window.openPlaceDetails = function(placeId) {
    const place = placesData.find(p => p._id === placeId);
    if (!place) return;

    document.getElementById('placeModalName').innerText = place.name;
    document.getElementById('placeModalDistance').innerHTML = `<i class="bi bi-geo-alt-fill text-success"></i> يبعد ${place.distanceKm != null ? Number(place.distanceKm).toFixed(1) : '--'} كم خريطة جوية`;

    // Handle Address
    const addressEl = document.getElementById('placeModalAddress');
    if (place.address) {
        addressEl.querySelector('.address-text').innerText = place.address;
        addressEl.classList.remove('d-none');
    } else {
        addressEl.classList.add('d-none');
    }

    // Handle Map Link — prefer the admin-supplied map_url, fallback to lat/lng
    const mapBtn = document.getElementById('placeModalMap');
    const mapUrl = place.map_url ||
        (place.location && place.location.lat ? `https://www.google.com/maps/search/?api=1&query=${place.location.lat},${place.location.lng}` : null);
    if (mapUrl) {
        mapBtn.href = mapUrl;
        mapBtn.parentElement.classList.remove('d-none');
    } else {
        mapBtn.parentElement.classList.add('d-none');
    }

    // Phone/WhatsApp removed from modal — no longer shown to users

    // Handle Menu
    const menuContainer = document.getElementById('placeModalMenuContainer');
    const menuBtn = document.getElementById('placeModalMenuBtn');
    if (place.menu) {
        menuContainer.classList.remove('d-none');
        menuBtn.onclick = () => {
            Swal.fire({
                imageUrl: getFullImageUrl(place.menu),
                imageAlt: 'قائمة الأسعار',
                confirmButtonText: 'إغلاق',
                confirmButtonColor: '#04553A',
                customClass: {
                    image: 'rounded-4 object-fit-contain w-100'
                }
            });
        };
    } else {
        menuContainer.classList.add('d-none');
        menuBtn.onclick = null;
    }

    document.getElementById('placeModalImage').src = getFullImageUrl(place.image_url) || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800';

    const statusEl = document.getElementById('placeModalStatus');
    if (place.is_open) {
        statusEl.className = 'badge bg-success shadow-sm fs-6 px-3 py-2 rounded-pill';
        statusEl.innerHTML = '<i class="bi bi-door-open-fill me-1"></i> مفتوح الآن';
    } else {
        statusEl.className = 'badge bg-danger shadow-sm fs-6 px-3 py-2 rounded-pill';
        statusEl.innerHTML = '<i class="bi bi-door-closed-fill me-1"></i> مغلق الآن';
    }

    // Show open/closed status only on the badge, no order button in this modal

    // Store placeId and ownerId on the chat button for use in openMerchantChat()
    const chatBtn = document.getElementById('placeModalChatBtn');
    if (chatBtn) {
        chatBtn.dataset.placeId = place._id;
        chatBtn.dataset.ownerId = place.ownerId || '';
    }

    // Show Browse Products button if the place has a merchant owner
    const browseBtn = document.getElementById('btnBrowseProducts');
    if (browseBtn) {
        if (place.ownerId) {
            browseBtn.style.display = 'block';
        } else {
            browseBtn.style.display = 'none';
        }
    }

    // Reset order inputs (safely — some elements may have been removed from UI)
    const detailsEl = document.getElementById('shopOrderDetails');
    if (detailsEl) detailsEl.value = '';
    clearReceiptImage();
    const placeIdEl = document.getElementById('shopOrderPlaceId');
    if (placeIdEl) placeIdEl.value = place._id;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('placeDetailsModal'));
    modal.show();
}

// ==========================================
// 💬 Open In-App Chat with Merchant
// ==========================================
window.openMerchantChat = async function() {
    const chatBtn = document.getElementById('placeModalChatBtn');
    const placeId = chatBtn && chatBtn.dataset.placeId;

    if (!localStorage.getItem('token')) {
        const res = await Swal.fire({
            title: 'تسجيل الدخول',
            text: 'يجب تسجيل الدخول أولاً للتواصل مع التاجر',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'تسجيل الدخول',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#04553A'
        });
        if (res.isConfirmed) window.location.href = 'client-login.html';
        return;
    }

    if (!placeId) return;

    // Show loading state
    if (chatBtn) { chatBtn.disabled = true; chatBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>جاري الفتح...'; }

    try {
        const serverUrl = (typeof API_URL !== 'undefined') ? API_URL : 'https://wajeezsd.com';
        const token = localStorage.getItem('token');

        // Always call start-chat — it finds existing or creates a new chat room
        const res = await fetch(`${serverUrl}/api/merchant/shop/${placeId}/start-chat`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            const data = await res.json();
            window.location.href = `chat.html?orderId=${data.orderId}&receiverId=${data.merchantId}`;
        } else {
            const err = await res.json().catch(() => ({}));
            if (chatBtn) { chatBtn.disabled = false; chatBtn.innerHTML = '<i class="bi bi-chat-dots-fill me-2"></i> محادثة التاجر'; }
            Swal.fire('خطأ', err.message || 'فشل فتح المحادثة', 'error');
        }
    } catch (err) {
        console.error('[Chat] Error opening merchant chat:', err);
        if (chatBtn) { chatBtn.disabled = false; chatBtn.innerHTML = '<i class="bi bi-chat-dots-fill me-2"></i> محادثة التاجر'; }
        Swal.fire('خطأ', 'فشل الاتصال بالسيرفر', 'error');
    }
};

window.goToShopDetail = function() {
    const placeId = document.getElementById('shopOrderPlaceId').value;
    if (placeId) {
        window.location.href = `shop-detail.html?placeId=${placeId}`;
    }
}

// ==========================================
// 🚀 Submit Shop Order
// ==========================================
window.openShopOrderConfirmModal = async function() {
    if (window._shopOrderSubmitting) return;
    window._shopOrderSubmitting = true;

    // 1. Guard Auth
    if (!localStorage.getItem('token')) {
        const res = await Swal.fire({
            title: 'تسجيل الدخول',
            text: 'يجب تسجيل الدخول أولاً لطلب المندوب!',
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'تسجيل الدخول',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#04553A'
        });
        if (res.isConfirmed) window.location.href = 'client-login.html';
        return;
    }

    const placeId = document.getElementById('shopOrderPlaceId')?.value ||
        window.pendingShopInlineData?.placeId || '';
    const orderDetails = window.pendingShopInlineData?.details ||
        (document.getElementById('shopOrderDetails')?.value?.trim() || '');
    const receiptFile = window.pendingShopInlineData?.receiptFile ||
        document.getElementById('receiptImageInput')?.files?.[0] || null;
    const place = placesData.find(p => p._id === placeId);

    // 2. Validate Details (must be more than 2 words)
    // Skip if called from shop-detail page with inline data already validated
    if (!window.pendingShopInlineData) {
        const wordCount = orderDetails.split(/\s+/).filter(w => w.length > 0).length;
        if (!orderDetails || wordCount < 3) {
            Swal.fire({ icon: 'warning', text: 'يرجى كتابة تفاصيل أكثر (3 كلمات على الأقل) لوصف الأغراض المطلوبة', confirmButtonColor: '#04553A' });
            window._shopOrderSubmitting = false;
            return;
        }

        // 3. Validate Receipt Image
        if (!receiptFile) {
            Swal.fire({ icon: 'warning', title: 'إشعار الدفع مطلوب', text: 'يرجى رفع صورة إشعار الدفع لتأكيد أن الأغراض مدفوعة مسبقاً.', confirmButtonColor: '#04553A' });
            window._shopOrderSubmitting = false;
            return;
        }
    }

    if (!window.userLocation) {
        Swal.fire({ icon: 'error', text: 'لم يتم تحديد موقعك. يرجى تفعيل الـ GPS', confirmButtonColor: '#04553A' });
        window._shopOrderSubmitting = false;
        return;
    }

    // Safely get the button that triggered this (may not exist if called from shop-detail)
    const btn = document.getElementById('btnSubmitShopOrder') ||
        document.getElementById('btnShopDetailOrder') ||
        document.activeElement;
    const ogHtml = btn?.innerHTML || '';
    if (btn && btn.tagName === 'BUTTON') {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> جاري الإرسال...';
    }

    try {
        // 4. Compress & Upload Receipt Image
        const compressionOptions = { maxSizeMB: 0.5, maxWidthOrHeight: 1024, useWebWorker: false };
        const compressedFile = await imageCompression(receiptFile, compressionOptions);
        
        let receiptUrl = '';
        const formData = new FormData();
        formData.append('parcelImage', compressedFile, 'receipt.jpg');
        
        const uploadRes = await fetch(`${API_URL}/api/upload/parcel-image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });
        
        if (!uploadRes.ok) throw new Error('فشل رفع صورة الإشعار للسيرفر');
        const uploadData = await uploadRes.json();
        receiptUrl = uploadData.url;

        // 5. Fetch Pricing (public endpoint)
        let baseFare = 1000;
        let perKm = 200;
        try {
            const settingsRes = await fetch(`${API_URL}/api/orders/price-config`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
            if (settingsRes.ok) {
                const s = await settingsRes.json();
                if (s.baseFare) baseFare = s.baseFare;
                if (s.costPerKm) perKm = s.costPerKm;
            }
        } catch (_) { /* use defaults */ }

        if (!place) {
            console.error('[ShopOrder] place غير موجود — لا يمكن حساب السعر');
            window._shopOrderSubmitting = false;
            return;
        }
        let calculatedPrice = baseFare + (place.distanceKm * perKm);
        calculatedPrice = Math.ceil(calculatedPrice / 100) * 100;

        // 6. Build Payload
        // 6. Build Interim Payload (saved globally)
        window.pendingShopOrder = {
            orderType: 'shop',
            shopId: place._id,
            shopName: place.name,
            shopPhone: place.phone,
            items: orderDetails.split('\n').filter(i => i.trim() !== ''),
            shopOrderDetails: orderDetails,     // تفاصيل الطلبية
            receiptImage: receiptUrl,        // صورة الإشعار (مرفوعة)

            pickup: {
                address: place.name + ' - ' + (place.category?.name || 'محل'),
                contactName: place.name,
                contactPhone: place.phone || '0000000000',
                lat: place.location.lat,
                lng: place.location.lng
            },
            dropoff: {
                address: 'موقعي الحالي 📍',
                receiverName: localStorage.getItem('userName') || 'العميل',
                receiverPhone: document.getElementById('shopReceiverPhone')?.value?.trim() || localStorage.getItem('userPhone') || '0000000000',
                lat: window.userLocation.lat,
                lng: window.userLocation.lng
            },
            details: `🏢 طلب من محل: ${place.name}\n🧢 الأغراض مدفوعة مسبقاً ✔️\n\n${orderDetails}`,
            distanceType: 'custom',
            price: calculatedPrice
        };

        // 7. Setup & Open Full Screen Overlay
        // يبدأ السعر بـ 0 — ثم تملؤه الخريطة بالمبلغ المقترح عند تحديد الموقع (updateLivePrice)
        document.getElementById('shopOverlayPrice').value = 0;

        // Hide the first modal safely
        const placeModalEl = document.getElementById('placeDetailsModal');
        const modalInstance = bootstrap.Modal.getInstance(placeModalEl);
        if (modalInstance) modalInstance.hide();
        
        // Hide main UI
        document.getElementById('categories-view').classList.add('d-none');
        document.getElementById('places-view').classList.add('d-none');
        document.getElementById('shop-map-overlay').classList.remove('d-none');

        // Pre-fill phone number from localStorage
        const phoneInput = document.getElementById('shopOverlayPhone');
        const savedPhone = localStorage.getItem('userPhone') || '';
        if (phoneInput && !phoneInput.value && savedPhone) {
            phoneInput.value = savedPhone;
        }

        // 8. Initialize Google Maps Web SDK
        // 📍 «حدّد موقعي» — الدبوس هو مركز الخريطة، فدقّة هذه القراءة = دقّة عنوان الطلب.
        // ⚠️ كانت getCurrentPosition لقطةً واحدة: أندرويد يعيد أول fix متاح (غالباً من الشبكة
        // بدقّة 500–2000م) حتى مع enableHighAccuracy، فيهبط الدبوس بعيداً عن المستخدم.
        // WajeezGeo.getPrecise يراقب القراءات ويأخذ أدقّها حتى تنزل تحت 30م أو تنتهي المهلة.
        window.shopMapLocateMe = async function () {
            const btn = document.getElementById('shopMapLocateBtn');
            const ogHtml = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-crosshair"></i> جاري الضبط…'; }

            try {
                const fix = await window.WajeezGeo.getPrecise({
                    onProgress: (f) => {
                        // حرّك الخريطة مع كل تحسّن — يرى المستخدم الدبوس يتقارب بدل شاشة جامدة
                        if (window.shopOrderMapInstance) {
                            try { window.shopOrderMapInstance.panTo({ lat: f.lat, lng: f.lng }); } catch (_) {}
                        }
                        if (btn) btn.innerHTML = `<i class="bi bi-crosshair"></i> ±${Math.round(f.accuracy)} م…`;
                    }
                });

                window.userLocation = { lat: fix.lat, lng: fix.lng };
                if (window.shopOrderMapInstance) {
                    window.shopOrderMapInstance.panTo({ lat: fix.lat, lng: fix.lng });
                    // كلما كانت القراءة أدق سمحنا بتقريب أكبر — التقريب على قراءة خشنة يضلّل
                    window.shopOrderMapInstance.setZoom(fix.accuracy <= 30 ? 18 : fix.accuracy <= 100 ? 16 : 15);
                }
                if (window.checkShopDeliveryZone) window.checkShopDeliveryZone();
                if (window._shopDrawRoute) window._shopDrawRoute();

                // اعرض جودة القراءة صراحةً: القراءة الضعيفة يجب أن تدفع المستخدم لتحريك الدبوس يدوياً
                if (fix.accuracy > window.WajeezGeo.ACCEPTABLE_M) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'الموقع تقريبي',
                        text: window.WajeezGeo.describeAccuracy(fix.accuracy),
                        confirmButtonColor: '#04553A'
                    });
                }
            } catch (e) {
                Swal.fire({ icon: 'warning', text: e.message || 'تعذّر تحديد موقعك، تأكد من تفعيل الـ GPS', confirmButtonColor: '#04553A' });
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = ogHtml; }
            }
        };

        if (window.shopOrderMapInstance) {
            try {
                if (window.userLocation) {
                    window.shopOrderMapInstance.panTo(window.userLocation);
                    window.shopOrderMapInstance.setZoom(16);
                }
            } catch (e) {
                console.warn('Failed to update map successfully:', e);
            }
            if(window.checkShopDeliveryZone) window.checkShopDeliveryZone();
            // Re-draw route immediately when map is reused
            if (window._shopDrawRoute) window._shopDrawRoute();
            if (btn && btn.tagName === 'BUTTON') { btn.disabled = false; btn.innerHTML = ogHtml; }
            return;
        }

        const mapElement = document.getElementById('shopOrderMapActual');
        if (!mapElement) {
            if (btn && btn.tagName === 'BUTTON') { btn.disabled = false; btn.innerHTML = ogHtml; }
            return;
        }

        const currentCity = typeof CityService !== 'undefined' ? CityService.getCity() : 'Khartoum';
        const defaultLat = currentCity === 'PortSudan' ? 19.6151 : 15.6067;
        const defaultLng = currentCity === 'PortSudan' ? 37.2164 : 32.5317;

        const lat = window.userLocation?.lat ?? defaultLat;
        const lng = window.userLocation?.lng ?? defaultLng;

        window.shopOrderMapInstance = new google.maps.Map(mapElement, {
            center: { lat, lng },
            zoom: 16,
            disableDefaultUI: true,
            zoomControl: false,
            gestureHandling: 'greedy',
            clickableIcons: false
        });

        // 🏪 Shop Marker — shows the shop location with name label
        const shopLoc = window.pendingShopOrder?.pickup;
        if (shopLoc && shopLoc.lat && shopLoc.lng) {
            const shopName = window.pendingShopOrder.shopName || 'المتجر';
            
            // Update the badge with shop name
            const badgeNameEl = document.getElementById('shopMapBadgeName');
            if (badgeNameEl) badgeNameEl.textContent = shopName;

            // Custom shop marker with label
            new google.maps.Marker({
                position: { lat: shopLoc.lat, lng: shopLoc.lng },
                map: window.shopOrderMapInstance,
                title: shopName,
                icon: (typeof WajeezMarkers !== 'undefined') ? WajeezMarkers.store() : {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52"><path d="M22 2C12 2 4 10 4 20C4 32 22 50 22 50C22 50 40 32 40 20C40 10 32 2 22 2Z" fill="#04553A" stroke="white" stroke-width="2.5"/><circle cx="22" cy="20" r="9" fill="white"/></svg>'),
                    scaledSize: new google.maps.Size(44, 52),
                    anchor: new google.maps.Point(22, 50)
                },
                zIndex: 10
            });

        }

        // ─────────────────────────────────────────────────────
        // 🚦 Directions API — real street route: Shop → User Location
        // ─────────────────────────────────────────────────────
        const shopDirectionsService = new google.maps.DirectionsService();
        const shopDirectionsRenderer = new google.maps.DirectionsRenderer({
            suppressMarkers: true,     // Keep our custom markers
            preserveViewport: true,    // FIX: Prevents map from bouncing back
            polylineOptions: {
                strokeColor: '#04553A',
                strokeWeight: 5,
                strokeOpacity: 0.85,
            }
        });
        shopDirectionsRenderer.setMap(window.shopOrderMapInstance);

        // Store renderer globally so closeShopMapUI can clear it
        window._shopDirectionsRenderer = shopDirectionsRenderer;

        // Function to draw street route from shop to the map center (user pin)
        function drawShopRoute() {
            const shopLoc = window.pendingShopOrder?.pickup;
            if (!shopLoc) return;
            const center = window.shopOrderMapInstance.getCenter();
            shopDirectionsService.route({
                origin: { lat: shopLoc.lat, lng: shopLoc.lng },
                destination: { lat: center.lat(), lng: center.lng() },
                travelMode: google.maps.TravelMode.DRIVING
            }, (result, status) => {
                if (status === google.maps.DirectionsStatus.OK) {
                    shopDirectionsRenderer.setDirections(result);
                } else {
                    console.warn('⚠️ Shop route failed:', status);
                    shopDirectionsRenderer.setDirections({ routes: [] });
                }
            });
        }

        // Expose draw function globally for reuse when map is singleton
        window._shopDrawRoute = drawShopRoute;

        // Draw route immediately on map open (no waiting for idle)
        google.maps.event.addListenerOnce(window.shopOrderMapInstance, 'idle', () => {
            drawShopRoute();
        });

        // Refresh route when user drags or zooms — debounced to save API quota
        const debouncedDrawShopRoute = debounce(drawShopRoute, 800);
        window.shopOrderMapInstance.addListener('dragend', debouncedDrawShopRoute);
        window.shopOrderMapInstance.addListener('zoom_changed', debouncedDrawShopRoute);

        // ─────────────────────────────────────────────────────
        // ❗ Feature: Delivery Zone Geofencing (Dynamic from API)
        // ─────────────────────────────────────────────────────
        const DEFAULT_SHOP_ZONE = [
            { lat: 15.750, lng: 32.400 },
            { lat: 15.750, lng: 32.650 },
            { lat: 15.450, lng: 32.650 },
            { lat: 15.450, lng: 32.400 },
        ];

        let shopZoneCoords = DEFAULT_SHOP_ZONE;
        try {
            const currentCity = typeof CityService !== 'undefined' ? CityService.getCity() : 'Khartoum';
            const zRes = await fetch(`${API_URL}/api/admin/delivery-zone?city=${currentCity}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (zRes.ok) {
                const zData = await zRes.json();
                if (zData.deliveryZone && zData.deliveryZone.length >= 3) {
                    shopZoneCoords = zData.deliveryZone;
                    console.log('✅ Shop map zone loaded from API:', shopZoneCoords.length, 'points');
                }
            }
        } catch (e) {
            console.warn('⚠️ Using default shop map zone:', e.message);
        }

        let shopDeliveryZonePolygon = new google.maps.Polygon({
            paths: shopZoneCoords,
            strokeColor: '#04553A',
            strokeOpacity: 0.15,
            strokeWeight: 2,
            fillColor: '#04553A',
            fillOpacity: 0.04,
            map: window.shopOrderMapInstance,
            clickable: false
        });

        const MIN_ZOOM_LEVEL = 16;
        
        window.checkShopDeliveryZone = function() {
            if (!google.maps.geometry || !google.maps.geometry.poly || !window.shopOrderMapInstance) return;
            const center = window.shopOrderMapInstance.getCenter();
            const currentZoom = window.shopOrderMapInstance.getZoom();
            const isInside = google.maps.geometry.poly.containsLocation(center, shopDeliveryZonePolygon);
            
            const banner = document.getElementById('shop-geofence-banner');
            const confirmBtn = document.getElementById('btnFinalizeShopOrder');
            
            let bannerText = "";
            let shouldBlock = false;

            if (!isInside) {
                shouldBlock = true;
                bannerText = "عفواً، الموقع خارج منطقة التوصيل حالياً.";
            } else if (currentZoom < MIN_ZOOM_LEVEL) {
                shouldBlock = true;
                bannerText = "الرجاء تقريب الخريطة أكثر (Zoom in) لتحديد موقعك بدقة.";
            }

            if (shouldBlock) {
                if (banner) {
                    banner.style.display = 'block';
                    const spanEl = banner.querySelector('span');
                    if(spanEl) spanEl.textContent = bannerText;
                }
                if (confirmBtn) {
                    confirmBtn.disabled = true;
                    // Visual state for disabled
                    confirmBtn.innerHTML = '<i class="bi bi-x-circle-fill me-1"></i> لا يمكن الطلب هنا';
                    confirmBtn.classList.remove('btn-success');
                    confirmBtn.classList.add('btn-secondary');
                }
            } else {
                if (banner) banner.style.display = 'none';
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> تأكيد الموقع وإرسال الطلب';
                    confirmBtn.classList.remove('btn-secondary');
                    confirmBtn.classList.add('btn-success');
                }
            }
        };

        window.shopOrderMapInstance.addListener('dragend', window.checkShopDeliveryZone);
        window.shopOrderMapInstance.addListener('zoom_changed', window.checkShopDeliveryZone);
        
        // Initial check on load
        setTimeout(window.checkShopDeliveryZone, 500);

        // Dynamic Pricing Logic
        let pricingSettings = { baseFare: 1000, costPerKm: 200 };
        
        // Fetch Pricing
        async function fetchPricing() {
            try {
                const res = await fetch(`${API_URL}/api/orders/price-config`, { 
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } 
                });
                if (res.ok) {
                    const s = await res.json();
                    pricingSettings.baseFare = s.baseFare || 1000;
                    pricingSettings.costPerKm = s.costPerKm || 200;
                }
            } catch (e) {
                console.warn('Using default pricing:', e);
            }
        }
        await fetchPricing();

        const updateLivePrice = () => {
            if (!window.shopOrderMapInstance || !window.pendingShopOrder) return;
            
            const center = window.shopOrderMapInstance.getCenter();
            const shopLoc = window.pendingShopOrder.pickup;
            
            if (center && shopLoc) {
                const distMeters = google.maps.geometry.spherical.computeDistanceBetween(
                    center,
                    new google.maps.LatLng(shopLoc.lat, shopLoc.lng)
                );
                
                const distKm = (distMeters / 1000) * 1.2; // 1.2 is a rough road distance multiplier
                let calculatedPrice = pricingSettings.baseFare + (distKm * pricingSettings.costPerKm);
                calculatedPrice = Math.round(calculatedPrice / 100) * 100; // Round to nearest 100
                
                const priceInput = document.getElementById('shopOverlayPrice');
                if (priceInput) {
                    priceInput.value = calculatedPrice;
                    // Add subtle visual feedback
                    priceInput.style.transition = 'background 0.3s';
                    priceInput.style.background = '#eefdf3';
                    setTimeout(() => priceInput.style.background = '#f8f9fa', 300);
                }
            }
        };

        // Update price when map stops moving (debounced to save API quota)
        const debouncedUpdateLivePrice = debounce(updateLivePrice, 600);
        window.shopOrderMapInstance.addListener('idle', debouncedUpdateLivePrice);
        
        // Initial calculation
        updateLivePrice();

        console.log('✅ Google Maps Web SDK created successfully for Shop Order (with dynamic pricing)');
        if (btn && btn.tagName === 'BUTTON') { btn.disabled = false; btn.innerHTML = ogHtml; }

    } catch (err) {
        Swal.fire({ icon: 'error', text: err.message || 'حدث خطأ في تجهيز الطلب' });
        if (btn && btn.tagName === 'BUTTON') { btn.disabled = false; btn.innerHTML = ogHtml; }
    } finally {
        window._shopOrderSubmitting = false;
    }
}

window.closeShopMapUI = async function() {
    // 1. Immediately hide the overlay
    document.getElementById('shop-map-overlay').classList.add('d-none');

    // 2. Restore main views immediately
    if (document.getElementById('places-category-title')?.innerText && typeof placesData !== 'undefined' && placesData.length > 0) {
        document.getElementById('places-view').classList.remove('d-none');
    } else {
        document.getElementById('categories-view').classList.remove('d-none');
    }

    // ══════════════════════════════════════════════════════════════════
    // FREEZE FIX: Do not destroy the map! Keep it alive as a singleton
    // to prevent memory deadlocks on the bridge. Native Android maps
    // are very expensive to recreate.
    // ══════════════════════════════════════════════════════════════════

    // Clear the directions route so next open starts fresh
    if (window._shopDirectionsRenderer) {
        window._shopDirectionsRenderer.setDirections({ routes: [] });
    }

    console.log('🗺️ Shop map hidden successfully — Keeping native instance alive');
};

// 🟢 Submit final order from Confirmation Overlay
window.submitFinalShopOrder = async function() {
    if (!window.pendingShopOrder) {
        Swal.fire('خطأ', 'بيانات الطلب مفقودة', 'error');
        return;
    }

    const btn = document.getElementById('btnFinalizeShopOrder');
    const ogHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> جاري إرسال الطلب...';

    // Validate phone number (must be digits, at least 9 chars)
    const phoneInput = document.getElementById('shopOverlayPhone').value.trim();
    if (!phoneInput || phoneInput.length < 9 || !/^\d+$/.test(phoneInput)) {
        Swal.fire('تنبيه', 'يرجى إدخال رقم هاتف صحيح (أرقام فقط، 9 أرقام على الأقل)', 'warning');
        btn.disabled = false;
        btn.innerHTML = ogHtml;
        return;
    }
    window.pendingShopOrder.dropoff.receiverPhone = phoneInput;

    // Get the negotiated price
    const newPrice = parseInt(document.getElementById('shopOverlayPrice').value, 10);
    if (isNaN(newPrice) || newPrice <= 0) {
        Swal.fire('تنبيه', 'يرجى إدخال سعر توصيل صحيح', 'warning');
        btn.disabled = false;
        btn.innerHTML = ogHtml;
        return;
    }

    // Call getCenter to capture the exact pan location
    if (window.shopOrderMapInstance) {
        try {
            const center = window.shopOrderMapInstance.getCenter();
            if (center) {
                window.pendingShopOrder.dropoff.lat = center.lat();
                window.pendingShopOrder.dropoff.lng = center.lng();
                window.pendingShopOrder.dropoff.address = `موقع محدد (${center.lat().toFixed(4)}, ${center.lng().toFixed(4)})`;
            }
        } catch (e) {
            console.error('Failed to get map center:', e);
        }
    }

    // Update payload with new price
    window.pendingShopOrder.price = newPrice;

    try {
        const res = await fetch(`${API_URL}/api/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(window.pendingShopOrder)
        });

        if (res.ok) {
            window.closeShopMapUI();
            Swal.fire({ icon: 'success', title: 'تم الطلب! 🎉', text: 'تم إرسال طلبك للكباتن!', timer: 3000, showConfirmButton: false });
            setTimeout(() => window.location.href = 'client-my-orders.html', 3000);
        } else {
            const err = await res.json();
            Swal.fire({ icon: 'error', text: err.message || 'فشل إرسال الطلب' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', text: 'حدث خطأ في الاتصال' });
    } finally {
        btn.disabled = false;
        btn.innerHTML = ogHtml;
    }
}



// ==========================================
// 🔍 Shop Map Location Search (Google Places Autocomplete)
// ==========================================
let shopSearchTimer = null;

window.searchShopMapLocation = function(query) {
    clearTimeout(shopSearchTimer);
    const resultsDiv = document.getElementById('shopMapSearchResults');

    if (!query || query.length < 3) {
        resultsDiv.style.display = 'none';
        return;
    }

    shopSearchTimer = setTimeout(() => {
        if (!window.shopOrderMapInstance || !google.maps.places) {
            resultsDiv.style.display = 'none';
            return;
        }

        const service = new google.maps.places.AutocompleteService();
        service.getPlacePredictions({
            input: query,
            componentRestrictions: { country: 'sd' },
            types: ['geocode', 'establishment']
        }, (predictions, status) => {
            if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
                resultsDiv.innerHTML = '<div style="padding:12px;text-align:center;color:#6b7280;font-size:13px;">لا توجد نتائج</div>';
                resultsDiv.style.display = 'block';
                return;
            }

            resultsDiv.innerHTML = '';
            predictions.slice(0, 5).forEach(p => {
                const div = document.createElement('div');
                div.className = 'place-result-item';
                div.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px;display:flex;align-items:center;gap:8px;';
                div.dataset.placeId = p.place_id;
                div.addEventListener('mouseover', function() { this.style.background = '#f0fdf4'; });
                div.addEventListener('mouseout', function() { this.style.background = 'white'; });
                const icon = document.createElement('i');
                icon.className = 'bi bi-geo-alt text-success';
                const span = document.createElement('span');
                span.textContent = p.description;
                div.appendChild(icon);
                div.appendChild(span);
                div.addEventListener('click', () => selectShopMapPlace(p.place_id));
                resultsDiv.appendChild(div);
            });
            resultsDiv.style.display = 'block';
        });
    }, 400);
};

window.selectShopMapPlace = function(placeId) {
    const resultsDiv = document.getElementById('shopMapSearchResults');
    resultsDiv.style.display = 'none';
    document.getElementById('shopMapSearchInput').value = '';

    if (!window.shopOrderMapInstance) return;

    const service = new google.maps.places.PlacesService(window.shopOrderMapInstance);
    service.getDetails({ placeId, fields: ['geometry'] }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place.geometry) {
            window.shopOrderMapInstance.panTo(place.geometry.location);
            window.shopOrderMapInstance.setZoom(17);
        }
    });
};

// 💰 أزرار رفع/تنزيل سعر طلب المتجر بمقدار 100 ج.س (نفس سلوك صفحة الطلب العادي)
(function setupShopPriceStepper() {
    const SHOP_PRICE_STEP = 100;
    function stepShopPrice(direction) {
        const input = document.getElementById('shopOverlayPrice');
        if (!input) return;
        const current = parseInt(input.value, 10) || 0;
        const snapped = Math.round(current / SHOP_PRICE_STEP) * SHOP_PRICE_STEP;
        let next = snapped + (direction * SHOP_PRICE_STEP);
        if (next < 0) next = 0;
        input.value = next;

        input.classList.remove('bumped');
        void input.offsetWidth; // إعادة تشغيل أنيميشن الوميض
        input.classList.add('bumped');
        const minusBtn = document.getElementById('shop-price-minus');
        if (minusBtn) minusBtn.disabled = (next <= 0);
    }

    function bind() {
        const minus = document.getElementById('shop-price-minus');
        const plus = document.getElementById('shop-price-plus');
        if (minus) minus.addEventListener('click', () => stepShopPrice(-1));
        if (plus) plus.addEventListener('click', () => stepShopPrice(1));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();
