/**
 * 🛍️ منتقي محل خدمة "اشترِ لي".
 *
 * كان داخل <script> في client-order.html — ٣١٦ سطراً وسط صفحة بها خمس كتل سكربت
 * أخرى، لا يصلها فاحص ولا اختبار ولا حتى بحث نصّي مريح. أُخرج كما هو بلا تغيير سلوك.
 *
 * يعتمد على: API_URL، CityService، Auth (رمز الدخول)، getUserLocation/userLocation،
 * getFullImageUrl — كلها معرَّفة قبله في الصفحة.
 */
// ══ 🛍️ خدمة "اشترِ لي" — منتقي المحل ثم الانتقال لنموذج الطلب في وضع errand ══
const esc_ = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ⚠️ كان المنتقي يعرض فقط المحلات التي أضافها الأدمن يدوياً (errandEnabled)،
// وهي صفر عملياً ⇒ شاشة فارغة والخدمة معطّلة. الآن البحث مفتوح على كل الأماكن
// عبر /api/places/errand-search (بروكسي Google Places على السيرفر) مع تصنيفات
// جاهزة لمن لا يعرف اسم المحل، ومتاجرنا المسجّلة تتصدّر النتائج دائماً.
let _errandSeq = 0;         // يحمي من وصول نتيجة بحث قديمة بعد الأحدث
let _errandDebounce = null;
let _errandActiveCat = '';
let _errandCustomCard = '';

const errandListEl = () => document.getElementById('errandPlacesList');

// موقع العميل يوجّه البحث نحو ما حوله فعلاً — بلا انتظار: إن لم يكن جاهزاً نبحث بمركز المدينة
function errandBiasCoords() {
    const loc = window.userLocation;
    return (loc && Number.isFinite(loc.lat)) ? `&lat=${loc.lat}&lng=${loc.lng}` : '';
}

function errandSkeleton(text) {
    errandListEl().innerHTML = `<div class="text-center py-5">
        <div class="spinner-border text-primary" style="width:2rem;height:2rem;"></div>
        <div class="text-muted mt-2" style="font-size:13px;">${esc_(text)}</div>
    </div>`;
}

// أيقونة ولون لكل تصنيف — تُملأ من /errand-categories فتبقى مطابقة للسيرفر
let _errandCatMeta = {};

// 📏 المسافة أقوى ما يميّز محلاً عن آخر يحمل نفس الاسم — والأقرب هو المقصود غالباً
function haversineKm(a, b) {
    const R = 6371, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function withDistance(list) {
    const loc = window.userLocation;
    if (!loc || !Number.isFinite(loc.lat)) return list;
    return list.map(p => (Number.isFinite(p.lat) && Number.isFinite(p.lng))
        ? { ...p, distanceKm: haversineKm(loc, p) } : p);
}

const fmtKm = (km) => km == null ? '' : (km < 1 ? `${Math.round(km * 1000)} م` : `${km.toFixed(1)} كم`);

// بطاقة واحدة — المصدر يحدّد الأيقونة والشارة فقط، والنقر واحد في الحالتين
function errandCard(p) {
    const isOurs = p.source === 'wajeez';
    const cat = _errandCatMeta[p.categoryKey] || null;
    const imgSrc = p.image_url ? (typeof window.getFullImageUrl === 'function' ? window.getFullImageUrl(p.image_url) : p.image_url) : '';
    const fallbackIcon = isOurs ? 'bi-shop' : (cat ? cat.icon : 'bi-geo-alt-fill');
    const iconHtml = imgSrc
        ? `<img src="${imgSrc}" style="width:42px;height:42px;border-radius:11px;object-fit:cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" alt="">
           <div style="display:none;width:42px;height:42px;border-radius:11px;background:#f5f3ff;color:#7c3aed;align-items:center;justify-content:center;font-size:20px;"><i class="bi bi-shop"></i></div>`
        : `<i class="bi ${fallbackIcon}"></i>`;

    const badges = [];
    if (isOurs) badges.push(`<span class="errand-place-badge">متجر مسجّل</span>`);
    // شارة التصنيف: نصّ جوجل حين لا يقابل أحد تصنيفاتنا
    const catLabel = cat ? cat.label : (p.category || '');
    if (catLabel) badges.push(`<span class="errand-chip errand-chip-cat"><i class="bi ${cat ? cat.icon : 'bi-tag'}"></i>${esc_(catLabel)}</span>`);
    if (p.distanceKm != null) badges.push(`<span class="errand-chip errand-chip-dist"><i class="bi bi-signpost-2"></i>${esc_(fmtKm(p.distanceKm))}</span>`);

    const args = [
        isOurs ? (p.placeId || '') : '',
        p.name || '',
        p.lat == null ? '' : p.lat,
        p.lng == null ? '' : p.lng,
        p.address || '',
        p.externalId || '',   // معرّف جوجل — يمنع تكرار المكان عند التعلّم
        p.category || '',
        p.categoryKey || ''
    ].map(v => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(',');

    // 🗺️ معاينة على الخريطة قبل الاختيار — الحسم الأخير حين تتشابه الأسماء.
    // stopPropagation حتى لا تُحسب ضغطةً على البطاقة نفسها.
    const mapBtn = (Number.isFinite(p.lat) && Number.isFinite(p.lng))
        ? `<button type="button" class="errand-map-btn" title="عرض على الخريطة"
             onclick="event.stopPropagation();window.open('https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}','_blank')">
             <i class="bi bi-map"></i>
           </button>`
        : '';

    return `
    <div class="errand-place" onclick="startErrand(${args})">
        <div class="errand-place-ic" style="${imgSrc ? 'background:transparent;padding:0;overflow:hidden;' : ''}">${iconHtml}</div>
        <div style="flex:1;min-width:0;">
            <div class="errand-place-name">${esc_(p.name)}${isOurs ? badges[0] : ''}</div>
            ${p.address ? `<div class="errand-place-meta">${esc_(p.address)}</div>` : ''}
            <div class="errand-chips">${badges.slice(isOurs ? 1 : 0).join('')}</div>
        </div>
        ${mapBtn}
        <i class="bi bi-chevron-left text-muted"></i>
    </div>`;
}

// آخر نتائج معروضة — يُعاد ترشيحها محلياً بلا نداء جديد (كل نداء مدفوع)
let _errandLastResults = null;
let _errandResultFilter = '';

window.filterErrandResults = function (key) {
    _errandResultFilter = (_errandResultFilter === key) ? '' : key;
    if (_errandLastResults) renderErrandResults(_errandLastResults, true);
};

function renderErrandResults(data, isRefilter = false) {
    if (!isRefilter) { _errandLastResults = data; _errandResultFilter = ''; }

    // الأقرب أولاً: حين تتشابه الأسماء، المقصود هو الأقرب غالباً
    const byDistance = (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9);
    let ours = withDistance(data.ours || []).sort(byDistance);
    let external = withDistance(data.external || []).sort(byDistance);

    // 🏷️ مرشّحات مبنية من النتائج نفسها: بحثٌ حر يخلط مطاعم ببقالات بصيدليات،
    // وبلا فرز يقرأ العميل قائمةً واحدة طويلة لا يميّز فيها شيئاً.
    const counts = {};
    [...ours, ...external].forEach(p => { if (p.categoryKey) counts[p.categoryKey] = (counts[p.categoryKey] || 0) + 1; });
    const keys = Object.keys(counts);
    let filtersHtml = '';
    if (keys.length > 1) {
        filtersHtml = `<div class="errand-result-filters">
            <button type="button" class="errand-rf ${_errandResultFilter ? '' : 'active'}" onclick="filterErrandResults('')">
                الكل (${ours.length + external.length})
            </button>` +
            keys.map(k => {
                const m = _errandCatMeta[k];
                return `<button type="button" class="errand-rf ${_errandResultFilter === k ? 'active' : ''}" onclick="filterErrandResults('${esc_(k)}')">
                    <i class="bi ${m ? m.icon : 'bi-tag'}"></i>${esc_(m ? m.label : k)} (${counts[k]})
                </button>`;
            }).join('') + `</div>`;
    }

    if (_errandResultFilter) {
        ours = ours.filter(p => p.categoryKey === _errandResultFilter);
        external = external.filter(p => p.categoryKey === _errandResultFilter);
    }

    let html = '';
    if (ours.length) {
        html += `<div class="errand-group"><i class="bi bi-patch-check-fill" style="color:#22c55e;"></i> متاجر وجيز</div>`;
        html += ours.map(errandCard).join('');
    }
    if (external.length) {
        html += `<div class="errand-group"><i class="bi bi-geo-alt"></i> أماكن قريبة</div>`;
        html += external.map(errandCard).join('');
    }
    if (!html) {
        const why = data.externalError
            ? esc_(data.externalError)
            : (_errandResultFilter ? 'لا نتائج في هذا التصنيف' : 'ما لقينا المحل — اكتب اسمه وحدّد موقعه بنفسك');
        html = `<div class="errand-hint"><i class="bi bi-shop"></i><div>${why}</div></div>`;
    }
    errandListEl().innerHTML = filtersHtml + html + _errandCustomCard;
}

// الشاشة الأولى قبل الكتابة: كانت فارغة إلا من سطر إرشادي. الآن تعرض ترشيح
// الأدمن والأكثر طلباً — من قاعدتنا بلا أي نداء مدفوع.
let _errandFeatured = null;
function renderErrandIdle() {
    const hint = `<div class="errand-hint"><i class="bi bi-search"></i>
        <div>اكتب اسم المحل أو اختر تصنيفاً من فوق</div></div>`;
    const f = _errandFeatured;
    if (!f || (!f.curated.length && !f.popular.length)) {
        errandListEl().innerHTML = hint + _errandCustomCard;
        return;
    }
    let html = '';
    if (f.curated.length) {
        html += `<div class="errand-group"><i class="bi bi-star-fill" style="color:#f59e0b;"></i> محلات مميّزة</div>`;
        html += f.curated.map(errandCard).join('');
    }
    if (f.popular.length) {
        html += `<div class="errand-group"><i class="bi bi-fire" style="color:#ef4444;"></i> الأكثر طلباً</div>`;
        html += f.popular.map(errandCard).join('');
    }
    errandListEl().innerHTML = html + _errandCustomCard;
}

async function loadErrandFeatured() {
    if (_errandFeatured) { renderErrandIdle(); return; }
    try {
        const city = (typeof CityService !== 'undefined') ? CityService.getCity() : 'Khartoum';
        const res = await fetch(`${API_URL}/api/places/errand-featured?city=${encodeURIComponent(city)}`);
        _errandFeatured = res.ok ? await res.json() : null;
    } catch (_) { _errandFeatured = null; }
    // لا نرسم إن كان العميل قد بدأ بحثاً أثناء الجلب
    if (!_errandActiveCat && !(document.getElementById('errandSearch')?.value || '').trim()) renderErrandIdle();
}

async function runErrandSearch({ q = '', category = '' } = {}) {
    const seq = ++_errandSeq;
    errandSkeleton(category ? 'جاري البحث عن الأقرب…' : 'جاري البحث…');
    try {
        const city = (typeof CityService !== 'undefined') ? CityService.getCity() : 'Khartoum';
        const url = `${API_URL}/api/places/errand-search?city=${encodeURIComponent(city)}`
            + (q ? `&q=${encodeURIComponent(q)}` : '')
            + (category ? `&category=${encodeURIComponent(category)}` : '')
            + errandBiasCoords();
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        if (seq !== _errandSeq) return;   // وصلت نتيجة أقدم — تجاهلها
        if (!res.ok) throw new Error(res.status === 429 ? 'بحث كثير — انتظر لحظة' : 'تعذّر البحث');
        renderErrandResults(await res.json());
    } catch (e) {
        if (seq !== _errandSeq) return;
        errandListEl().innerHTML = `
            <div class="errand-hint"><i class="bi bi-wifi-off" style="color:#f87171;"></i>
                <div>${esc_(e.message || 'تعذّر البحث')}</div></div>
            ${_errandCustomCard}`;
    }
}

// البحث الخارجي مدفوع لكل نداء: نؤخّره حتى يتوقّف العميل عن الكتابة
window.onErrandSearchInput = function (value) {
    const q = (value || '').trim();
    clearTimeout(_errandDebounce);
    if (q.length < 2) {
        // العودة للحالة الأولى (أو نتائج التصنيف المختار إن وُجد)
        _errandSeq++;
        if (_errandActiveCat) { runErrandSearch({ category: _errandActiveCat }); }
        else renderErrandIdle();
        return;
    }
    // الكتابة بحث حر ⇒ لا تصنيف نشطاً
    _errandActiveCat = '';
    document.querySelectorAll('.errand-cat.active').forEach(el => el.classList.remove('active'));
    _errandDebounce = setTimeout(() => runErrandSearch({ q }), 450);
};

window.pickErrandCategory = function (key, btn) {
    const same = _errandActiveCat === key;
    _errandActiveCat = same ? '' : key;
    document.querySelectorAll('.errand-cat').forEach(el => el.classList.remove('active'));
    if (!same && btn) btn.classList.add('active');
    const searchInput = document.getElementById('errandSearch');
    if (searchInput) searchInput.value = '';
    clearTimeout(_errandDebounce);

    if (!_errandActiveCat) {
        _errandSeq++;
        renderErrandIdle();
        return;
    }
    runErrandSearch({ category: _errandActiveCat });
};

let _errandCatsLoaded = false;
async function loadErrandCategories() {
    if (_errandCatsLoaded) return;
    const wrap = document.getElementById('errandCats');
    if (!wrap) return;
    try {
        const res = await fetch(`${API_URL}/api/places/errand-categories`);
        const cats = res.ok ? await res.json() : [];
        // نفس الجدول يخدم شريط التصنيفات وشارات البطاقات ومرشّحات النتائج
        cats.forEach(c => { _errandCatMeta[c.key] = { label: c.label, icon: c.icon || 'bi-shop' }; });
        wrap.innerHTML = cats.map(c =>
            `<button type="button" class="errand-cat" onclick="pickErrandCategory('${esc_(c.key)}', this)">
                <i class="bi ${esc_(c.icon || 'bi-shop')}"></i>${esc_(c.label)}
            </button>`).join('');
        _errandCatsLoaded = cats.length > 0;
    } catch (_) { wrap.innerHTML = ''; }
}

window.openErrandPicker = async function () {
    if (!localStorage.getItem('token')) { window.location.href = 'client-login.html'; return; }
    const sheet = document.getElementById('errandSheet');
    const searchInput = document.getElementById('errandSearch');
    sheet.classList.add('show');
    if (searchInput) searchInput.value = '';
    _errandActiveCat = '';
    _errandSeq++;

    // خيار "مكان آخر" دائماً متاح — شبكة الأمان حين يفشل البحث أو لا يجد المحل
    _errandCustomCard = `
        <div class="errand-place custom" onclick="startErrand('', '', '', '', '', '', '', '')" style="border-color:#e0e7ff;background:linear-gradient(135deg,#f5f3ff,#ede9fe);">
            <div class="errand-place-ic" style="background:#e0e7ff;color:#4f46e5;"><i class="bi bi-geo-alt-fill"></i></div>
            <div style="flex:1;min-width:0;">
                <div class="errand-place-name" style="color:#4f46e5;">مكان آخر</div>
                <div class="errand-place-meta">حدّد الموقع على الخريطة بنفسك</div>
            </div>
            <i class="bi bi-chevron-left" style="color:#4f46e5;"></i>
        </div>`;

    renderErrandIdle();
    loadErrandFeatured();
    loadErrandCategories();
    // الموقع يُطلب بهدوء في الخلفية ليُحسّن ترتيب النتائج، ولا ننتظره
    if (!window.userLocation && typeof getUserLocation === 'function') getUserLocation().catch(() => {});
};

window.closeErrandPicker = function () {
    document.getElementById('errandSheet').classList.remove('show');
};

// يمرّر سياق المحل لنموذج الطلب (index.html) في وضع errand
// shopId يكون فارغاً للأماكن الخارجية — الباك-إند يقبلها بالاسم + الدبوس
window.startErrand = function (shopId, shopName, lat, lng, address, externalId, category, categoryKey) {
    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    const ctx = {
        shopId: shopId || null,
        shopName: shopName || '',
        lat: num(lat),
        lng: num(lng),
        address: address || '',
        externalId: externalId || '',
        category: category || '',
        categoryKey: categoryKey || ''
    };
    try { sessionStorage.setItem('errandContext', JSON.stringify(ctx)); } catch (_) {}
    window.location.href = 'index.html?mode=errand';
};
