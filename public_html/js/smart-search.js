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

    // ── حالة اقتراحات "اشترِ لي" ────────────────────────────────────────────
    // العميل يبحث عن محلّه لا عن «متجر مسجّل في وجيز». حين لا نجده مسجّلاً كان
    // البحث ينتهي بطريق مسدود، بينما الخدمة التي تخدمه موجودة في قسمٍ آخر لا
    // يعرفه. الآن تُجلب نتائجها إلى نفس الشاشة.
    var errandList = [];        // أماكن غير مسجّلة معروضة الآن
    var errandLoading = false;  // الطبقة المجانية قيد الجلب
    var errandDeep = false;     // هل نُفّذ البحث الموسّع (المدفوع) لهذه الكلمة؟
    var errandDeepBusy = false;
    var errandNote = '';        // رسالة حالة (فشل/سقف معدّل)

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
    // بحثان متوازيان لا متسلسلان: بحث متاجرنا، واقتراحات "اشترِ لي" المجانية.
    // التسلسل كان سيضيف رحلة شبكة كاملة قبل ظهور المخرج للعميل الذي لم يجد محلّه —
    // وهو أكثر من يحتاج سرعة. الاقتراحات مجانية على السيرفر (قاعدتنا وحدها)، فلا
    // ضير من طلبها دائماً؛ والعرض وحده هو ما يُقرَّر لاحقاً حسب نتيجة البحث الأصلي.
    function doSearch(q) {
        q = (q || '').trim();
        if (!q) { renderIdle(); return; }
        renderLoading();

        lastQuery = q;
        errandList = []; errandDeep = false; errandDeepBusy = false; errandNote = '';
        errandLoading = q.length >= 2;

        var loc = window.userLocation;
        var geo = (loc && loc.lat) ? ('&lat=' + loc.lat + '&lng=' + loc.lng) : '';
        var fresh = function () { return (inputEl.value || '').trim() === q; };

        fetch(apiBase() + '/api/places/search?q=' + encodeURIComponent(q) +
              '&city=' + encodeURIComponent(getCity()) + geo)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                // تجاهل الاستجابة إن تغيّر النص (سباق طلبات)
                if (!fresh()) return;
                lastData = data; filter = 'all';
                // 🛍️ محلات "اشترِ لي" المسجّلة عندنا (أضافها الأدمن بلا تاجر) تتصدّر
                // القسم: بياناتها مؤكَّدة ومختارة يدوياً، أدقّ من أي نتيجة خارجية.
                mergeErrand(data.errandPlaces || [], true);
                var total = (data.products || []).length + (data.places || []).length + (data.categories || []).length;
                if (total > 0) saveRecent(q);
                render();
            })
            .catch(function () {
                if (!fresh()) return;
                lastData = null;
                resultsEl.innerHTML = '<div class="ss-empty"><div class="ss-empty-ic">⚠️</div>' +
                    '<h6>تعذّر البحث</h6><p>تحقّق من اتصالك وحاول مجدداً</p></div>';
            });

        if (!errandLoading) return;
        fetch(apiBase() + '/api/places/errand-suggest?q=' + encodeURIComponent(q) +
              '&city=' + encodeURIComponent(getCity()) + geo)
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (!fresh()) return;
                errandLoading = false;
                mergeErrand(d.external || []);
                // لا نرسم إن كان البحث الأصلي لم يصل بعد — رسمه ناقصاً ثم إكماله ارتجاف
                if (lastData) render();
            })
            .catch(function () {
                if (!fresh()) return;
                errandLoading = false;
                if (lastData) render();
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
            // شاشة "لا نتائج" صارت شاشة الخدمة البديلة نفسها، لا إعلاناً عنها:
            // النتائج حاضرة هنا، والعميل يختار محلّه بضغطة واحدة بلا انتقال ولا
            // إعادة كتابة — أكثر ما يُفقد العملاء هو خطوةٌ إضافية عند طريق مسدود.
            resultsEl.innerHTML =
                '<div class="ss-noresult">' +
                '  <div class="ss-noresult-ic"><i class="bi bi-shop"></i></div>' +
                '  <h6>ما لقينا "' + esc(lastQuery) + '" ضمن متاجرنا</h6>' +
                '  <p>لكن الكابتن يقدر يشتري ليك من أي محل</p>' +
                '</div>' + errandSection(true);
            bindErrandCards();
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

        // 🛍️ الملحق: وُجدت منتجات أو أقسام لكن لا متجرَ باسم المحل المطلوب ⇒
        // غالباً العميل يبحث عن محلٍّ لا عن صنف. نعرض بديل "اشترِ لي" أسفل النتائج
        // لا فوقها: النتائج المسجّلة تبقى الأولوية، والملحق مخرجٌ لمن لم يجد بغيته.
        // شرط places.length === 0 يمنع الضوضاء: من وجد متجره لا يحتاج بديلاً.
        if (places.length === 0 && (filter === 'all' || filter === 'places')) {
            html += errandSection(false);
        }

        resultsEl.innerHTML = html;
        bindErrandCards();
    }

    // ══ قسم "اشترِ لي" داخل نتائج البحث ═══════════════════════════════════
    // العرض بالفهرس لا بتضمين بيانات المكان في onclick: أسماء المحلات السودانية
    // تحمل علامات اقتباس وشرطات مائلة، وحقنها في سلسلة onclick كان سيكسر البطاقة
    // (أو يفتح ثغرة) عند أول محل اسمه «كافيه "الركن"».
    function fmtKm(km) {
        if (km == null) return '';
        return km < 1 ? (Math.round(km * 1000) + ' م') : (km.toFixed(1) + ' كم');
    }

    function withDistance(list) {
        var loc = window.userLocation;
        if (!loc || !isFinite(loc.lat)) return list;
        var R = 6371, rad = function (d) { return d * Math.PI / 180; };
        return list.map(function (p) {
            if (!isFinite(p.lat) || !isFinite(p.lng)) return p;
            var dLat = rad(p.lat - loc.lat), dLng = rad(p.lng - loc.lng);
            var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(rad(loc.lat)) * Math.cos(rad(p.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
            p.distanceKm = R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
            return p;
        }).sort(function (a, b) {
            return (a.distanceKm == null ? 1e9 : a.distanceKm) - (b.distanceKm == null ? 1e9 : b.distanceKm);
        });
    }

    /**
     * يضمّ نتائج جديدة للقسم بلا تكرار.
     * @param {boolean} [first] ضعها في المقدّمة (محلات منسّقة تسبق نتائج البحث)
     */
    function mergeErrand(list, first) {
        // ⚠️ المطابقة بالاسم أيضاً لا بالمعرّف وحده: نفس المحل يصل من ردّين
        // مختلفين بمعرّفين مختلفين (معرّفنا للمنسّق، ومعرّف جوجل للمتعلَّم)،
        // فيظهر مرّتين للعميل — والتكرار يجعله يشكّ أيّهما الصحيح.
        var keys = function (p) {
            return [p.placeId, p.externalId, String(p.name || '').trim().toLowerCase()].filter(Boolean);
        };
        var seen = {};
        var mark = function (p) { keys(p).forEach(function (k) { seen[k] = 1; }); };
        errandList.forEach(mark);
        var add = (list || []).filter(function (p) {
            if (!p || keys(p).some(function (k) { return seen[k]; })) return false;
            mark(p);
            return true;
        });
        if (!add.length) return;
        // withDistance يرتّب بالأقرب داخل كل مجموعة، والمنسّق يبقى فوق نتائج البحث
        errandList = first
            ? withDistance(add).concat(errandList)
            : errandList.concat(withDistance(add));
    }

    function errandCardHtml(p, i) {
        var isOurs = p.source === 'wajeez';
        var meta = [];
        // شارتان مختلفتان لحالتين مختلفتين: «متجر مسجّل» له صفحة ومنتجات، أما
        // «محل موثّق» فمكانٌ اختاره الأدمن بلا تاجر — الوعد بصفحة لا يجوز هنا.
        if (p.errandOnly) meta.push('<span class="ss-eb ss-eb-pick"><i class="bi bi-hand-thumbs-up-fill"></i> محل موثّق</span>');
        else if (isOurs) meta.push('<span class="ss-eb ss-eb-ours"><i class="bi bi-patch-check-fill"></i> متجر مسجّل</span>');
        if (p.category) meta.push('<span class="ss-eb"><i class="bi bi-tag"></i> ' + esc(p.category) + '</span>');
        if (p.distanceKm != null) meta.push('<span class="ss-eb"><i class="bi bi-signpost-2"></i> ' + esc(fmtKm(p.distanceKm)) + '</span>');

        return '<div class="ss-ecard" data-i="' + i + '">' +
            '<div class="ss-eic"><i class="bi ' + (isOurs ? 'bi-shop' : 'bi-geo-alt-fill') + '"></i></div>' +
            '<div class="ss-ebody">' +
            '  <div class="ss-ename">' + esc(p.name) + '</div>' +
            (p.address ? '  <div class="ss-eaddr">' + esc(p.address) + '</div>' : '') +
            (meta.length ? '  <div class="ss-emeta">' + meta.join('') + '</div>' : '') +
            '</div>' +
            '<i class="bi bi-chevron-left ss-arrow"></i></div>';
    }

    /**
     * @param {boolean} primary هل هذا هو محتوى الشاشة كله (لا نتائج أصلاً)؟
     *        يغيّر النبرة فقط: عنوانٌ شارح حين يكون البديل هو كل ما لدينا،
     *        وعنوانٌ خافت حين يكون ملحقاً أسفل نتائج موجودة.
     */
    function errandSection(primary) {
        var head = '<div class="ss-esec">' +
            '<span class="ss-esec-t"><i class="bi bi-bag-check-fill"></i> ' +
            (primary ? 'اطلبه من أي محل' : 'محلات تانية ممكن نجيب ليك منها') + '</span>' +
            '<span class="ss-esec-s">الكابتن يشتري ويوصّل</span></div>';

        var body = '';
        if (errandLoading || errandDeepBusy) {
            body += '<div class="ss-eload"><span class="ss-espin"></span> ' +
                (errandDeepBusy ? 'بندوّر في كل محلات المدينة…' : 'بندوّر ليك…') + '</div>';
        }
        body += errandList.map(errandCardHtml).join('');

        if (!errandLoading && !errandDeepBusy && !errandList.length && errandDeep) {
            body += '<div class="ss-ehint">ما لقينا محل بهذا الاسم — اكتب اسمه وحدّد موقعه بنفسك</div>';
        }
        if (errandNote) body += '<div class="ss-ehint ss-ehint-warn">' + esc(errandNote) + '</div>';

        var actions = '';
        // 🔎 البحث الموسّع مدفوع لكل نداء: لا يُشغَّل تلقائياً مع الكتابة، بل بضغطة
        // العميل. النيّة الصريحة هي ما يبرّر التكلفة — ومن ضغط هنا يريد المحل فعلاً.
        if (!errandDeep && !errandDeepBusy) {
            actions += '<button type="button" class="ss-errand-btn" id="ss-edeep">' +
                '<i class="bi bi-globe-americas"></i> ابحث في كل محلات المدينة</button>';
        }
        // شبكة الأمان: تعمل حتى لو فشل كل بحث خارجي — العميل يعرف محلّه ونحن لا
        actions += '<button type="button" class="ss-errand-alt" id="ss-ecustom">' +
            '<i class="bi bi-pin-map"></i> المحل مش ظاهر؟ حدّد موقعه على الخريطة</button>';

        return '<div class="ss-errand-wrap">' + head + body +
               '<div class="ss-eactions">' + actions + '</div></div>';
    }

    function bindErrandCards() {
        // 🎓 شرحٌ في لحظته: هذا القسم لا يظهر إلا حين لا يجد العميل محلّه،
        // فلا موضع له في الجولة الترحيبية. يُشرح مرّة واحدة عند أول ظهور،
        // وبعد أن تُرسم البطاقات فعلاً — لا على قسمٍ فارغ.
        if (errandList.length && window.coachFire) {
            try { window.coachFire('client_errand_results', '.ss-errand-wrap'); } catch (_) {}
        }

        resultsEl.querySelectorAll('.ss-ecard').forEach(function (el) {
            el.addEventListener('click', function () {
                var p = errandList[parseInt(el.getAttribute('data-i'), 10)];
                if (!p) return;
                // متجرٌ مسجّل بتاجر ظهر هنا (طابق العنوان لا الاسم): صفحته أغنى من
                // طلب شراء أعمى — فيها منتجاته وأسعاره. أما محل "اشترِ لي" فبلا
                // صفحة أصلاً، وفتحها له وعدٌ فارغ.
                if (p.source === 'wajeez' && p.placeId && !p.errandOnly) {
                    window.location.href = 'shop-detail.html?placeId=' + encodeURIComponent(p.placeId);
                    return;
                }
                window.ErrandContext.startFromPlace(p);
            });
        });

        var deep = resultsEl.querySelector('#ss-edeep');
        if (deep) deep.addEventListener('click', deepErrandSearch);

        var custom = resultsEl.querySelector('#ss-ecustom');
        // بلا إحداثيات ⇒ يفتح النموذج بحقل اسم المحل ومنتقي الخريطة (home.js)
        if (custom) custom.addEventListener('click', function () {
            window.ErrandContext.start(window.ErrandContext.fromPlace({ name: '' }));
        });
    }

    /** البحث الموسّع: نفس نقطة نهاية منتقي "اشترِ لي" — محمية ومسقوفة ومدفوعة */
    function deepErrandSearch() {
        if (!localStorage.getItem('token')) { window.location.href = 'client-login.html'; return; }
        var q = lastQuery;
        errandDeepBusy = true; errandNote = '';
        render();

        var loc = window.userLocation;
        var url = apiBase() + '/api/places/errand-search?q=' + encodeURIComponent(q) +
                  '&city=' + encodeURIComponent(getCity()) +
                  ((loc && loc.lat) ? ('&lat=' + loc.lat + '&lng=' + loc.lng) : '');

        fetch(url, { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } })
            .then(function (r) {
                if (r.status === 429) throw new Error('بحث كثير في وقت قصير — انتظر لحظة');
                if (!r.ok) throw new Error('تعذّر البحث الموسّع');
                return r.json();
            })
            .then(function (d) {
                if ((inputEl.value || '').trim() !== q) return;
                // المعروض يبقى في مكانه والجديد يُذيَّل — إعادة ترتيب القائمة تحت
                // إصبع العميل تجعله يضغط غير ما نظر إليه
                mergeErrand((d.ours || []).concat(d.external || []));
                errandNote = d.externalError || '';
                errandDeep = true; errandDeepBusy = false;
                render();
            })
            .catch(function (e) {
                if ((inputEl.value || '').trim() !== q) return;
                errandDeepBusy = false;
                errandNote = e.message || 'تعذّر البحث الموسّع';
                render();
            });
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

    // ⚠️ goToErrandWith حُذف: كان ينقل العميل لصفحة التسوّق ليعيد البحث هناك.
    // النتائج صارت تُعرض هنا مباشرةً، والقفزة بين صفحتين كانت هي الخطوة التي
    // يُفقد عندها العميل. (بذرة البحث في client-order.html?errand=1 تبقى صالحة
    // لأي رابط خارجي — انظر initErrandFromSearch في errand-picker.js)

    window.SmartSearch = { open: open, close: close };
})();
