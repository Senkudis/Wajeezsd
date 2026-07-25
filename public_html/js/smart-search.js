/**
 * Smart Search — بحث ذكّي عن المنتجات والمتاجر من الصفحة الرئيسية للعميل.
 *
 * يعتمد على الـ endpoint الموحّد /api/places/search (عربي-ذكي، مقيّد بالمدينة، مرتّب بالأقرب)
 * ويقدّم تجربة احترافية: زر بحث بحركة حصرية، طبقة بحث ملء الشاشة، نتائج متدرّجة الظهور،
 * ترشيح فوري (منتجات/متاجر/أقسام)، وعمليات بحث أخيرة.
 *
 * لا يعتمد على home.js — وحدة مستقلة تماماً لتفادي أي زعزعة للمنطق القائم.
 * التبعيات المتاحة عالمياً: API_URL, escapeHtml, getFullImageUrl (config.js), CityService (city-service.js).
 */
(function () {
    'use strict';

    var RECENT_KEY = 'wajeez_recent_searches';
    var DEFAULT_IMG = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80';
    // تلميحات دوّارة للـ placeholder (تأثير الكتابة)
    var HINTS = ['برجر لذيذ', 'صيدلية قريبة', 'مطعم مشويات', 'بقالة', 'كيك وحلويات', 'قهوة', 'خضار وفواكه'];

    var overlay = null;
    var inputEl = null;
    var resultsEl = null;
    var lastData = null;
    var lastQuery = '';
    var filter = 'all';
    var debounceTimer = null;

    // ── أدوات مساعدة آمنة ────────────────────────────────────────────────
    function esc(s) { return (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s)); }
    function imgUrl(u) { return (window.getFullImageUrl ? window.getFullImageUrl(u) : (u || '')); }
    function apiBase() { return (window.API_URL) || 'https://wajeezsd.com'; }
    function getCity() { return (typeof CityService !== 'undefined' && CityService.getCity) ? CityService.getCity() : 'Khartoum'; }
    function fmtPrice(n) { return Number(n || 0).toLocaleString('en-US'); }

    function getRecent() {
        try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; }
    }
    function saveRecent(q) {
        q = (q || '').trim();
        if (!q) return;
        var list = getRecent().filter(function (x) { return x !== q; });
        list.unshift(q);
        list = list.slice(0, 6);
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (_) {}
    }
    function clearRecent() {
        try { localStorage.removeItem(RECENT_KEY); } catch (_) {}
        renderIdle();
    }

    // ── بناء الطبقة مرة واحدة ─────────────────────────────────────────────
    function buildOverlay() {
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.id = 'ss-overlay';
        overlay.innerHTML =
            '<div class="ss-backdrop"></div>' +
            '<div class="ss-panel">' +
            '  <div class="ss-topbar">' +
            '    <button class="ss-back" type="button" aria-label="رجوع"><i class="bi bi-arrow-right"></i></button>' +
            '    <div class="ss-inputwrap">' +
            '      <i class="bi bi-search ss-inicon"></i>' +
            '      <input type="text" id="ss-input" autocomplete="off" placeholder="ابحث عن منتج أو متجر…" />' +
            '      <button class="ss-clear" type="button" aria-label="مسح" style="display:none;"><i class="bi bi-x-circle-fill"></i></button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="ss-results" id="ss-results"></div>' +
            '</div>';
        document.body.appendChild(overlay);

        inputEl = overlay.querySelector('#ss-input');
        resultsEl = overlay.querySelector('#ss-results');
        var clearBtn = overlay.querySelector('.ss-clear');

        overlay.querySelector('.ss-backdrop').addEventListener('click', close);
        overlay.querySelector('.ss-back').addEventListener('click', close);
        clearBtn.addEventListener('click', function () {
            inputEl.value = '';
            clearBtn.style.display = 'none';
            inputEl.focus();
            renderIdle();
        });
        inputEl.addEventListener('input', function () {
            clearBtn.style.display = inputEl.value.trim() ? 'flex' : 'none';
            onType(inputEl.value);
        });
        // Enter يخفي الكيبورد وينفّذ البحث فوراً
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); clearTimeout(debounceTimer); inputEl.blur(); doSearch(inputEl.value); }
            if (e.key === 'Escape') close();
        });
    }

    // ── فتح / إغلاق ───────────────────────────────────────────────────────
    function open(prefill) {
        buildOverlay();
        document.body.style.overflow = 'hidden';
        overlay.classList.add('ss-open');
        if (typeof prefill === 'string' && prefill) {
            inputEl.value = prefill;
            overlay.querySelector('.ss-clear').style.display = 'flex';
        }
        renderIdle();
        // طلب الموقع مسبقاً لترتيب النتائج بالأقرب (لا يحجب). الموقع يُطلب أصلاً عند تحميل الرئيسية.
        if (!window.userLocation && typeof window.requestUserLocationOnLoad === 'function') {
            try { window.requestUserLocationOnLoad(); } catch (_) {}
        }
        setTimeout(function () { inputEl.focus(); if (inputEl.value) doSearch(inputEl.value); }, 180);
    }

    function close() {
        if (!overlay) return;
        overlay.classList.remove('ss-open');
        document.body.style.overflow = '';
        if (inputEl) inputEl.blur();
    }

    // ── الحالة الخاملة: عمليات بحث أخيرة + اقتراحات سريعة ──────────────────
    function renderIdle() {
        if (!resultsEl) return;
        var recent = getRecent();
        var html = '';
        if (recent.length) {
            html += '<div class="ss-idle-head"><span><i class="bi bi-clock-history"></i> عمليات بحث أخيرة</span>' +
                    '<button class="ss-clearrecent" type="button">مسح</button></div>';
            html += '<div class="ss-recent">' + recent.map(function (r) {
                return '<button class="ss-recent-chip" data-q="' + esc(r) + '"><i class="bi bi-arrow-counterclockwise"></i> ' + esc(r) + '</button>';
            }).join('') + '</div>';
        }
        html += '<div class="ss-idle-head" style="margin-top:6px;"><span><i class="bi bi-stars"></i> اقتراحات</span></div>';
        html += '<div class="ss-recent">' + HINTS.map(function (h) {
            return '<button class="ss-recent-chip ss-suggest" data-q="' + esc(h) + '"><i class="bi bi-search"></i> ' + esc(h) + '</button>';
        }).join('') + '</div>';
        resultsEl.innerHTML = html;

        var clr = resultsEl.querySelector('.ss-clearrecent');
        if (clr) clr.addEventListener('click', clearRecent);
        resultsEl.querySelectorAll('.ss-recent-chip').forEach(function (b) {
            b.addEventListener('click', function () {
                var q = b.getAttribute('data-q');
                inputEl.value = q;
                overlay.querySelector('.ss-clear').style.display = 'flex';
                doSearch(q);
            });
        });
    }

    // ── الكتابة → بحث مؤجَّل ───────────────────────────────────────────────
    function onType(v) {
        clearTimeout(debounceTimer);
        var q = (v || '').trim();
        if (!q) { renderIdle(); return; }
        debounceTimer = setTimeout(function () { doSearch(q); }, 300);
    }

    // ── تنفيذ البحث ────────────────────────────────────────────────────────
    function doSearch(q) {
        q = (q || '').trim();
        if (!q) { renderIdle(); return; }
        renderLoading();

        var url = apiBase() + '/api/places/search?q=' + encodeURIComponent(q) + '&city=' + encodeURIComponent(getCity());
        var loc = window.userLocation;
        if (loc && loc.lat) url += '&lat=' + loc.lat + '&lng=' + loc.lng;

        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                // تجاهل الاستجابة إن تغيّر النص (سباق طلبات)
                if ((inputEl.value || '').trim() !== q) return;
                lastData = data; lastQuery = q; filter = 'all';
                var total = (data.products || []).length + (data.places || []).length + (data.categories || []).length;
                if (total > 0) saveRecent(q);
                render();
            })
            .catch(function () {
                if ((inputEl.value || '').trim() !== q) return;
                resultsEl.innerHTML = '<div class="ss-empty"><div class="ss-empty-ic">⚠️</div>' +
                    '<h6>تعذّر البحث</h6><p>تحقّق من اتصالك وحاول مجدداً</p></div>';
            });
    }

    function renderLoading() {
        var card = '<div class="ss-skel"><div class="ss-skel-img"></div>' +
                   '<div class="ss-skel-lines"><div class="ss-skel-l1"></div><div class="ss-skel-l2"></div></div></div>';
        resultsEl.innerHTML = '<div class="ss-list">' + card + card + card + card + '</div>';
    }

    window.setSmartFilter = function (f) { filter = f; render(); };

    // ── العرض ──────────────────────────────────────────────────────────────
    function render() {
        var data = lastData || {};
        var cats = data.categories || [];
        var places = data.places || [];
        var products = data.products || [];
        var total = cats.length + places.length + products.length;

        if (total === 0) {
            // 🛍️ مخرج بدل طريق مسدود: المحل غير مسجّل عندنا لا يعني أنه غير متاح.
            // ننقل نصّ البحث لمنتقي "اشترِ لي" فلا يُعيد العميل كتابته.
            resultsEl.innerHTML = '<div class="ss-empty"><div class="ss-empty-ic">🔍</div>' +
                '<h6>لا توجد نتائج لـ "' + esc(lastQuery) + '"</h6>' +
                '<p>المحل مش مسجّل عندنا؟ الكابتن يقدر يشتري ليك منه</p>' +
                '<button type="button" class="ss-errand-btn" onclick="goToErrandWith(\'' +
                    esc(lastQuery).replace(/'/g, '&#39;') + '\')">' +
                '<i class="bi bi-bag-heart-fill"></i> اطلبه من أي محل</button></div>';
            return;
        }

        var ratingHtml = function (avg) {
            return (avg > 0) ? '<span class="ss-rate"><i class="bi bi-star-fill"></i> ' + Number(avg).toFixed(1) + '</span>' : '';
        };
        var distHtml = function (d) {
            return (d != null) ? '<span class="ss-dist"><i class="bi bi-geo-alt-fill"></i> ' + d + ' كم</span>' : '';
        };

        // شريط الترشيح
        var chip = function (key, label, n) {
            return n > 0 ? '<button class="ss-chip ' + (filter === key ? 'active' : '') + '" onclick="setSmartFilter(\'' + key + '\')">' +
                label + ' <span>' + n + '</span></button>' : '';
        };
        var html = '<div class="ss-chips">' +
            chip('all', 'الكل', total) + chip('products', 'منتجات', products.length) +
            chip('places', 'متاجر', places.length) + chip('categories', 'أقسام', cats.length) + '</div>';

        var idx = 0; // لعدّاد التدرّج في الحركة
        var stagger = function () { return 'style="animation-delay:' + Math.min(idx++ * 0.035, 0.5) + 's"'; };

        html += '<div class="ss-list">';

        // أقسام
        if (cats.length && (filter === 'all' || filter === 'categories')) {
            html += '<div class="ss-sec"><i class="bi bi-grid-fill"></i> أقسام</div>';
            html += '<div class="ss-cats">' + cats.map(function (c) {
                return '<button class="ss-cat ss-in" ' + stagger() + ' onclick="location.href=\'client-order.html\'">' +
                    '<i class="bi ' + (c.icon || 'bi-shop') + '"></i> ' + esc(c.name) + '</button>';
            }).join('') + '</div>';
        }

        // منتجات (الأولوية للمطلوب: بحث المنتجات)
        if (products.length && (filter === 'all' || filter === 'products')) {
            html += '<div class="ss-sec"><i class="bi bi-bag-heart-fill"></i> منتجات</div>';
            html += products.map(function (pr) {
                var img = imgUrl(pr.image) || DEFAULT_IMG;
                var href = 'shop-detail.html?placeId=' + pr.place._id + '&product=' + pr._id;
                return '<div class="ss-card ss-in" ' + stagger() + ' onclick="location.href=\'' + href + '\'">' +
                    '<img src="' + img + '" onerror="this.src=\'' + DEFAULT_IMG + '\'" class="ss-img" loading="lazy">' +
                    '<div class="ss-body"><div class="ss-name">' + esc(pr.name) + '</div>' +
                    '<div class="ss-shop"><i class="bi bi-shop"></i> ' + esc(pr.place.name) + '</div>' +
                    '<div class="ss-subrow">' + ratingHtml(pr.ratingAvg) + ' ' + distHtml(pr.distanceKm) + '</div></div>' +
                    '<div class="ss-price">' + fmtPrice(pr.price) + '<small>ج.س</small></div></div>';
            }).join('');
        }

        // متاجر
        if (places.length && (filter === 'all' || filter === 'places')) {
            html += '<div class="ss-sec"><i class="bi bi-shop-window"></i> متاجر</div>';
            html += places.map(function (pl) {
                var img = imgUrl(pl.image_url) || DEFAULT_IMG;
                var status = pl.is_open
                    ? '<span class="ss-open"><span class="ss-statdot"></span> مفتوح</span>'
                    : '<span class="ss-closed"><span class="ss-statdot"></span> مغلق</span>';
                return '<div class="ss-card ss-in" ' + stagger() + ' onclick="location.href=\'shop-detail.html?placeId=' + pl._id + '\'">' +
                    '<img src="' + img + '" onerror="this.src=\'' + DEFAULT_IMG + '\'" class="ss-img" loading="lazy">' +
                    '<div class="ss-body"><div class="ss-name">' + esc(pl.name) + '</div>' +
                    '<div class="ss-subrow">' + status + ' ' + ratingHtml(pl.ratingAvg) + ' ' + distHtml(pl.distanceKm) + '</div></div>' +
                    '<i class="bi bi-chevron-left ss-arrow"></i></div>';
            }).join('');
        }

        html += '</div>';
        resultsEl.innerHTML = html;
    }

    // ── تأثير الكتابة الدوّار على زر البحث في الرئيسية ─────────────────────
    function startRotatingHint(el) {
        if (!el) return;
        var hi = 0, ci = 0, deleting = false;
        function tick() {
            var word = HINTS[hi];
            if (!deleting) {
                ci++;
                el.textContent = word.slice(0, ci);
                if (ci >= word.length) { deleting = true; return setTimeout(tick, 1400); }
            } else {
                ci--;
                el.textContent = word.slice(0, ci);
                if (ci <= 0) { deleting = false; hi = (hi + 1) % HINTS.length; }
            }
            setTimeout(tick, deleting ? 45 : 90);
        }
        tick();
    }

    // ── تفعيل زر البحث في الرئيسية ─────────────────────────────────────────
    function initTrigger() {
        var trigger = document.getElementById('ss-trigger');
        if (trigger) {
            trigger.addEventListener('click', function () { open(); });
            startRotatingHint(document.getElementById('ss-trigger-hint'));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTrigger);
    } else {
        initTrigger();
    }

    /**
     * ينتقل لمنتقي "اشترِ لي" حاملاً نصّ البحث.
     * المنتقي يعيش في صفحة التسوّق، فنمرّر النصّ عبر sessionStorage: العميل كتب
     * اسم المحل مرة، وإعادةُ كتابته احتكاكٌ يفقد العملاء عند طريق مسدود.
     */
    window.goToErrandWith = function (query) {
        try { sessionStorage.setItem('errandSeedQuery', String(query || '')); } catch (_) {}
        window.location.href = 'client-order.html?errand=1';
    };

    window.SmartSearch = { open: open, close: close };
})();
