// ==========================================
// 🎠 Home Banners
// ==========================================
async function loadHomeBanners() {
    try {
        const city = typeof CityService !== 'undefined' ? CityService.getCity() : 'all';
        const baseUrl = window.API_URL || '';
        // 🎯 مكان العرض حسب الصفحة: الرئيسية أو التسوق — كل صفحة تجلب إعلاناتها فقط
        const placement = document.getElementById('home-banners-section') ? 'home'
            : document.getElementById('banners-section') ? 'shop' : '';
        const res = await fetch(`${baseUrl}/api/banners?city=${city}${placement ? '&placement=' + placement : ''}`);
        const raw = await res.json();
        // ⚠️ ردود الخطأ (rate-limit / 5xx) تكون كائن { message } وليس مصفوفة → كانت تكسر forEach
        const data = Array.isArray(raw) ? raw : [];
        
        // يدعم صفحتي الرئيسية (home-banners-section) والتسوق (banners-section)
        const bannersSection = document.getElementById('home-banners-section') || document.getElementById('banners-section');
        const bannersInner = document.getElementById('homeBannersInner') || document.getElementById('bannersInner');
        // 🎯 مؤشرات الكاروسيل (موجودة في client-order فقط)
        const bannersIndicators = document.getElementById('bannersIndicators');

        if (!bannersSection || !bannersInner) return;
        
        if (!data || data.length === 0) {
            bannersSection.style.display = 'none';
            return;
        }
        
        bannersSection.style.display = 'block';
        
        let innerHtml = '';
        let indicatorsHtml = '';
        // 🔑 معرّف الكاروسيل الخاص بهذه الصفحة
        const carouselId = document.getElementById('bannersCarousel') ? 'bannersCarousel' : 'homeBannersCarousel';
        
        data.forEach((banner, idx) => {
            const active = idx === 0 ? 'active' : '';
            // ✅ الحقل الصحيح في النموذج هو image_url
            const imgUrl = banner.image_url || '';
            // 🔗 حلّ وجهة النقر من النوع/المعرّف (أو من link القديم)
            const dest = resolveBannerHref(banner);

            let bannerContent = `<img src="${imgUrl}" class="d-block w-100 home-banner-img" alt="${banner.title || 'Banner'}" onerror="this.parentElement.style.display='none'">`;

            if (dest) {
                // التنقّل الداخلي عبر onclick (لا target=_blank للروابط الداخلية في تطبيق Capacitor)
                bannerContent = `<a href="javascript:void(0)" onclick="openBanner('${banner._id}','${encodeURIComponent(dest)}')" style="display:block;cursor:pointer;">${bannerContent}</a>`;
            }

            innerHtml += `
                <div class="carousel-item ${active}">
                    ${bannerContent}
                </div>
            `;

            // ✅ إصلاح: بناء أزرار المؤشرات لتجنّب خطأ classList of null في Bootstrap
            if (bannersIndicators) {
                indicatorsHtml += `<button type="button" data-bs-target="#${carouselId}" data-bs-slide-to="${idx}" ${idx === 0 ? 'class="active" aria-current="true"' : ''} aria-label="Banner ${idx + 1}"></button>`;
            }
        });
        
        bannersInner.innerHTML = innerHtml;
        // ✅ ملء المؤشرات بعد البناء — يمنع Bootstrap من قراءة null.classList
        if (bannersIndicators) {
            bannersIndicators.innerHTML = indicatorsHtml;
        }
    } catch (err) {
        console.error('Error loading home banners:', err);
    }
}

// 🔗 يحوّل (النوع + المعرّف) إلى وجهة نقر فعلية. يدعم البنرات القديمة عبر banner.link.
function resolveBannerHref(banner) {
    const id = (banner.targetId || '').trim();
    const type = banner.targetType || 'none';
    if (type === 'url') return id;                                  // رابط خارجي
    if (type === 'place' && id) return `shop-detail.html?placeId=${encodeURIComponent(id)}`;
    if (type === 'product' && id) {
        const [placeId, productId] = id.split(':');                // "placeId:productId"
        if (placeId && productId) return `shop-detail.html?placeId=${encodeURIComponent(placeId)}&product=${encodeURIComponent(productId)}`;
        return '';
    }
    if (type === 'category' && id) return `client-order.html?cat=${encodeURIComponent(id)}`;
    // توافق مع البنرات القديمة التي خُزّن فيها رابط مباشر
    if (banner.link && banner.link.trim()) return banner.link.trim();
    return '';
}

// يفتح وجهة البنر: خارجي → متصفح، داخلي → تنقّل داخل التطبيق
window.openBanner = function (id, encDest) {
    trackHomeBannerClick(id);
    let dest = '';
    try { dest = decodeURIComponent(encDest); } catch (_) { dest = encDest; }
    if (!dest) return;
    if (/^https?:\/\//i.test(dest)) {
        window.open(dest, '_blank');   // رابط خارجي
    } else {
        window.location.href = dest;   // صفحة داخلية
    }
};

async function trackHomeBannerClick(id) {
    try {
        const baseUrl = window.API_URL || '';
        await fetch(`${baseUrl}/api/banners/${id}/click`, { method: 'POST' });
    } catch (e) {}
}

// Ensure it loads when DOM is ready or right now if it's already ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadHomeBanners);
} else {
    loadHomeBanners();
}
