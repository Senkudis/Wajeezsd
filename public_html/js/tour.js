/*
 * ════════════════════════════════════════════════════════════════
 *  tour.js — محرّك الجولة الترحيبية (تاجر / كابتن / عميل)
 * ════════════════════════════════════════════════════════════════
 *  يسلّط الضوء على عنصر حقيقي في الشاشة ويشرحه بجانبه، بدل صندوق
 *  نصّ واحد يُقرأ مرّة ويُنسى: الخطوة المرتبطة بمكانها تُستَرجع لاحقاً.
 *
 *  الاستعمال:
 *      WajeezTour.start({ id: 'merchant', steps: [...] });
 *
 *  كل خطوة:
 *      { el: '#sel'|null, title, body, note?, placement?: 'auto'|'center' }
 *
 *  خطوة بلا `el` (أو عنصرها غائب) تُعرض في المنتصف. وخطوة عنصرها
 *  مخفيّ تُسقَط تماماً — لوحة التاجر تُخفي قسم ERP لغير الباقة
 *  الاحترافية، فشرح ميزة لا يراها التاجر إرباك لا تعليم.
 * ════════════════════════════════════════════════════════════════
 */
window.WajeezTour = (function () {
    'use strict';

    const KEY_PREFIX = 'wajeez_tour_done_';

    let steps = [];
    let rawSteps = [];
    let single = false;
    let idx = 0;
    let tourId = '';
    let nodes = null;
    let onDone = null;

    /** معرّف المستخدم — الإتمام يُسجَّل لكل حساب لا لكل جهاز */
    function userKey() {
        try {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            return u && u._id ? String(u._id) : 'anon';
        } catch (e) { return 'anon'; }
    }

    function storageKey(id) { return KEY_PREFIX + id + '_' + userKey(); }

    function isDone(id) {
        try { return localStorage.getItem(storageKey(id)) === '1'; } catch (e) { return false; }
    }

    function markDone(id) {
        try { localStorage.setItem(storageKey(id), '1'); } catch (e) { /* التخزين ممتلئ أو محجوب */ }
    }

    function reset(id) {
        try { localStorage.removeItem(storageKey(id)); } catch (e) { }
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /** العنصر موجود وله مساحة فعلية على الشاشة */
    function visible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    }

    function resolve(sel) {
        if (!sel) return null;
        try { return document.querySelector(sel); } catch (e) { return null; }
    }

    function build() {
        const wrap = document.createElement('div');
        wrap.className = 'wtour-root';
        wrap.innerHTML =
            '<div class="wtour-veil" hidden></div>' +
            '<div class="wtour-spot" hidden></div>' +
            '<button type="button" class="wtour-skip">تخطّي الجولة</button>' +
            '<div class="wtour-card">' +
              '<div class="wtour-arrow" hidden></div>' +
              '<div class="wtour-step-of"></div>' +
              '<h3 class="wtour-title"></h3>' +
              '<p class="wtour-body"></p>' +
              '<div class="wtour-note-slot"></div>' +
              '<div class="wtour-foot">' +
                '<div class="wtour-dots"></div>' +
                '<button type="button" class="wtour-btn ghost wtour-back">السابق</button>' +
                '<button type="button" class="wtour-btn primary wtour-next">التالي</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(wrap);

        return {
            wrap,
            veil: wrap.querySelector('.wtour-veil'),
            spot: wrap.querySelector('.wtour-spot'),
            skip: wrap.querySelector('.wtour-skip'),
            card: wrap.querySelector('.wtour-card'),
            arrow: wrap.querySelector('.wtour-arrow'),
            stepOf: wrap.querySelector('.wtour-step-of'),
            title: wrap.querySelector('.wtour-title'),
            body: wrap.querySelector('.wtour-body'),
            noteSlot: wrap.querySelector('.wtour-note-slot'),
            dots: wrap.querySelector('.wtour-dots'),
            back: wrap.querySelector('.wtour-back'),
            next: wrap.querySelector('.wtour-next')
        };
    }

    function renderDots() {
        nodes.dots.innerHTML = steps
            .map((_, i) => '<span class="wtour-dot' + (i === idx ? ' on' : '') + '"></span>')
            .join('');
    }

    /** يضع البطاقة فوق العنصر أو تحته حسب المساحة المتاحة */
    function placeCard(rect) {
        const card = nodes.card;
        card.classList.remove('is-center');
        card.style.transform = '';

        // القياس بعد ملء المحتوى — الارتفاع يتغيّر بطول النصّ
        const ch = card.offsetHeight;
        const cw = card.offsetWidth;
        const gap = 14;
        // شريط التنقّل السفلي مثبّت فوق كل شيء ويغطّي ~90px — الحساب على
        // ارتفاع النافذة كاملاً كان يضع صفّ الأزرار خلفه
        const NAV = 96;
        const vh = window.innerHeight - NAV;
        const spaceBelow = vh - rect.bottom;
        const below = spaceBelow > ch + gap + 16 || rect.top < ch + gap + 16;

        let top = below ? rect.bottom + gap : rect.top - ch - gap;

        // عنصر أطول من المساحة المتاحة فوقه وتحته معاً (بطاقة المحفظة مثلاً
        // بارتفاع 252px) يدفع البطاقة خارج الشاشة فلا يقرأ المستخدم شيئاً.
        // نحصرها داخل النافذة ولو غطّت جزءاً من العنصر — الحلقة المضيئة
        // تبقى دالّة على حدوده.
        const clamped = Math.max(10, Math.min(top, vh - ch - 10));
        const fits = Math.abs(clamped - top) < 1;
        top = clamped;

        nodes.arrow.hidden = !fits;   // سهم يشير لمكان خاطئ أسوأ من غيابه
        nodes.arrow.className = 'wtour-arrow ' + (below ? 'below' : 'above');

        // المحاذاة الأفقية: نتمركز على العنصر ثم نقصّ داخل حدود الشاشة
        let left = rect.left + rect.width / 2 - cw / 2;
        left = Math.max(10, Math.min(left, window.innerWidth - cw - 10));

        card.style.top = top + 'px';
        card.style.insetInlineStart = '';
        card.style.left = left + 'px';

        // السهم يتبع مركز العنصر لا مركز البطاقة
        const arrowX = Math.max(16, Math.min(rect.left + rect.width / 2 - left, cw - 30));
        nodes.arrow.style.left = arrowX + 'px';
        nodes.arrow.style.insetInlineStart = '';
    }

    /**
     * زر "تخطّي الجولة" مثبّت في زاوية علوية، وقد يقع فوق العنصر المضاء
     * نفسه — حدث فعلاً مع مفتاح فتح/إغلاق المتجر في لوحة التاجر: الضوء
     * مسلّط عليه والزر يغطّيه. نقلبه للزاوية المقابلة عند التقاطع.
     */
    function avoidSkipCollision(rect) {
        const sk = nodes.skip;
        sk.classList.remove('flip');
        const s = sk.getBoundingClientRect();
        const hit = !(s.right < rect.left - 6 || s.left > rect.right + 6 ||
                      s.bottom < rect.top - 6 || s.top > rect.bottom + 6);
        if (hit) sk.classList.add('flip');
    }

    /**
     * البؤرة أولاً: إن خرجت عن الشاشة نُمرّر النافذة إليها.
     *
     * ترتيب الأولوية مقصود — جُرّب العكس (إحضار البطاقة بالتمرير) فأخرج
     * البؤرة في ثلاث خطوات. المستخدم قد يقرأ بطاقةً حوافّها مقصوصة، أما
     * ألّا يرى العنصر المقصود فيُفرغ الجولة من معناها.
     */
    function ensureSpotVisible() {
        const spot = nodes.spot;
        if (spot.hidden) return;
        const r = spot.getBoundingClientRect();
        const top = 70;                            // تحت زرّ التخطّي
        const bottom = window.innerHeight - 96;    // فوق شريط التنقّل
        if (r.top >= top && r.bottom <= bottom) return;
        // scrollIntoView لا scrollBy: يعرف حاويته أياً كانت، بينما
        // scrollBy يخاطب النافذة فلا يفعل شيئاً في الشاشات ذات الحاوية
        const el = resolve(steps[idx] && steps[idx].el);
        if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' });
    }

    /**
     * ضمان أخير بعد استقرار التخطيط: تُحصر البطاقة داخل النافذة بتعديل
     * موضعها وحده، بلا تمرير.
     *
     * جُرّب التمرير أولاً فأخرج البؤرة المضيئة عن الشاشة في ثلاث خطوات —
     * مقايضة خاسرة: البطاقة تُقرأ لكن المستخدم لا يرى العنصر المقصود،
     * وهو جوهر الجولة. تغطية جزء من عنصر طويل أهون بكثير.
     */
    function ensureCardVisible() {
        const card = nodes.card;
        if (card.classList.contains('is-center')) return;
        const c = card.getBoundingClientRect();
        const margin = 8;
        let dy = 0;
        const usableBottom = window.innerHeight - 96 - margin;
        if (c.top < margin) dy = margin - c.top;
        else if (c.bottom > usableBottom) dy = usableBottom - c.bottom;
        if (!dy) return;
        const cur = parseFloat(card.style.top) || 0;
        card.style.top = (cur + dy) + 'px';
        // السهم يفقد معناه متى انفصلت البطاقة عن حافة العنصر
        nodes.arrow.hidden = true;
    }

    function centerCard() {
        nodes.card.classList.add('is-center');
        nodes.card.style.top = '';
        nodes.card.style.left = '';
        nodes.arrow.hidden = true;
    }

    function paint() {
        const step = steps[idx];
        const el = resolve(step.el);

        nodes.stepOf.textContent = 'الخطوة ' + (idx + 1) + ' من ' + steps.length;
        nodes.title.textContent = step.title || '';
        nodes.body.innerHTML = esc(step.body || '').replace(/\n/g, '<br>');
        nodes.noteSlot.innerHTML = step.note
            ? '<div class="wtour-note"><i class="bi bi-lightbulb-fill"></i><span>' + esc(step.note) + '</span></div>'
            : '';
        if (single) {
            // تلميح لحظي: لا تقدّم ولا رجوع — رسالة واحدة تُفهم وتُغلق
            nodes.stepOf.hidden = true;
            nodes.back.style.display = 'none';
            nodes.dots.style.display = 'none';
            nodes.skip.hidden = true;
            nodes.next.textContent = 'فهمت';
        } else {
            nodes.back.style.visibility = idx === 0 ? 'hidden' : 'visible';
            nodes.next.textContent = idx === steps.length - 1 ? 'ابدأ العمل' : 'التالي';
            renderDots();
        }

        const centered = !el || step.placement === 'center';
        if (centered) {
            nodes.veil.hidden = false;
            nodes.spot.hidden = true;
            centerCard();
            return;
        }

        nodes.veil.hidden = true;
        nodes.spot.hidden = false;

        // نُحضر العنصر إلى الشاشة أولاً ثم نقيس — القياس قبل التمرير
        // يعطي إحداثيات قديمة فتظهر الفتحة بعيدة عن العنصر
        const r0 = el.getBoundingClientRect();
        const needsScroll = r0.top < 80 || r0.bottom > window.innerHeight - 120;
        if (needsScroll) {
            // behavior:'auto' يُنهي التمرير فوراً فالقياس بعده صحيح مباشرةً
            el.scrollIntoView({ behavior: 'auto', block: 'center' });
        }

        const apply = () => {
            if (!nodes) return;
            const r = el.getBoundingClientRect();
            const pad = step.pad == null ? 6 : step.pad;
            nodes.spot.style.top = (r.top - pad) + 'px';
            nodes.spot.style.left = (r.left - pad) + 'px';
            nodes.spot.style.width = (r.width + pad * 2) + 'px';
            nodes.spot.style.height = (r.height + pad * 2) + 'px';
            nodes.spot.style.borderRadius = (step.radius || 14) + 'px';
            placeCard(r);
            avoidSkipCollision(r);
            ensureCardVisible();
        };

        // ⚠️ التموضع متزامن لا داخل requestAnimationFrame وحده: rAF لا يُنفَّذ
        // في تبويب خلفي أو حين يوقف النظام الرسوم، فتبقى الفتحة بلا أبعاد
        // (0×0 في زاوية الشاشة) والجولة تنكسر بصمت. نضبطها فوراً ثم نصقلها
        // في الإطار التالي إن أتيح — التمرير قد يغيّر الإحداثيات قليلاً.
        // ثلاث مرّات عمداً: فوراً كي لا تبقى الفتحة بلا أبعاد لو خُنق rAF
        // (تبويب خلفي)، ثم في الإطار التالي، ثم بعد 80ms — لأن التمرير
        // البرمجي قد لا تستقرّ إحداثياته في الإطار نفسه، فتُحسب البطاقة
        // بموضع قديم وتخرج عن الشاشة على العناصر الطويلة.
        apply();
        requestAnimationFrame(apply);
        setTimeout(apply, 80);
        // تمريرة حصر أخيرة بعد استقرار كل شيء: الحساب أعلاه قد يسبق
        // استقرار التمرير فيخرج صفّ الأزرار خلف شريط التنقّل
        setTimeout(() => { if (nodes) { ensureSpotVisible(); ensureCardVisible(); } }, 200);
    }

    function go(n) {
        idx = Math.max(0, Math.min(n, steps.length - 1));
        paint();
    }

    function finish(completed) {
        if (nodes) {
            nodes.wrap.remove();
            nodes = null;
        }
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onScroll, true);
        if (completed) markDone(tourId);
        if (typeof onDone === 'function') onDone(completed);
    }

    function onKey(e) {
        if (e.key === 'Escape') finish(false);
        else if (e.key === 'ArrowLeft') next();
        else if (e.key === 'ArrowRight') go(idx - 1);
    }

    /** يُعيد رسم موضع الفتحة والبطاقة أثناء التمرير — إحداثياتنا نافذية */
    let scrollRaf = 0;
    function onScroll() {
        if (!nodes || scrollRaf) return;
        scrollRaf = requestAnimationFrame(() => {
            scrollRaf = 0;
            if (!nodes) return;
            const step = steps[idx];
            const el = resolve(step && step.el);
            if (!el || nodes.spot.hidden) return;
            const r = el.getBoundingClientRect();
            const pad = step.pad == null ? 6 : step.pad;
            nodes.spot.style.top = (r.top - pad) + 'px';
            nodes.spot.style.left = (r.left - pad) + 'px';
            placeCard(r);
            avoidSkipCollision(r);
            ensureCardVisible();
        });
    }

    let resizeTimer = null;
    function onResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(paint, 120);
    }

    function next() {
        if (idx >= steps.length - 1) finish(true);
        else go(idx + 1);
    }

    /** هل توجد نافذة حوارية أخرى مفتوحة الآن؟ */
    function modalOpen() {
        return !!document.querySelector(
            '.swal2-container, .modal.show, .offcanvas.show, .wtour-root'
        );
    }

    /**
     * تؤجّل البدء حتى تُغلق النوافذ الحوارية الأخرى.
     *
     * التطبيق يعرض عند أول دخول حوارات خاصة به — سؤال الكابتن عن الاتصال،
     * واختيار المدينة، وطلب أذونات الموقع والإشعارات. تشغيل الجولة فوقها
     * يُنتج نافذتين متنافستين، ويفسد الجولة فعلياً: رُصدت تُعلَّم "مكتملة"
     * وحدها بعد ثوانٍ من فتحها تحت حوار SweetAlert.
     *
     * التعليق في js/onboarding.js يوثّق المشكلة نفسها: عُطّل الترحيب
     * القديم لأنه "كان يتداخل مع اختيار المدينة وطلب الأذونات".
     */
    function whenClear(fn, maxWaitMs) {
        const deadline = Date.now() + (maxWaitMs || 25000);
        (function poll() {
            if (!modalOpen()) return fn();
            if (Date.now() > deadline) return;   // حوار عالق ⇒ نتنازل بهدوء
            setTimeout(poll, 400);
        })();
    }

    /**
     * @param {object} cfg { id, steps, force?, onDone? }
     * @returns {boolean} هل بدأت الجولة فعلاً
     */
    function start(cfg) {
        if (!cfg || !Array.isArray(cfg.steps) || !cfg.steps.length) return false;
        tourId = cfg.id || 'default';
        if (!cfg.force && isDone(tourId)) return false;

        // مرجع معلّق: أُزيل عنصر الجولة من الصفحة (تنقّل داخلي، أو إعادة
        // رسم مسحت body) بينما بقي nodes مشيراً إليه، فيُرفض كل تشغيل لاحق
        // ويصمت زر "إعادة الجولة" بلا سبب ظاهر. ننظّف بدل أن نرفض.
        if (nodes && !document.body.contains(nodes.wrap)) {
            nodes = null;
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onResize);
        }
        if (nodes) {
            if (!cfg.force) return false;   // جولة تعمل بالفعل
            finish(false);                  // إعادة تشغيل صريحة
        }

        rawSteps = cfg.steps;
        single = !!cfg.single;
        onDone = cfg.onDone || null;
        idx = 0;

        // حوار آخر مفتوح ⇒ ننتظر إغلاقه بدل التكدّس فوقه
        if (modalOpen()) {
            whenClear(() => { if (!nodes) launch(); });
            return true;
        }
        return launch();
    }

    /** يبني الواجهة ويربط الأحداث — يُستدعى فوراً أو بعد انتظار الحوارات */
    function launch() {
        // ⏳ الترشيح هنا لا في start: قد ننتظر إغلاق حوار عدّة ثوانٍ تتغيّر
        // فيها الشاشة (يصل ردّ المحفظة فيظهر زر السداد مثلاً)، فترشيحٌ
        // بلقطة قديمة يُسقط خطوة صارت مرئية أو يُبقي أخرى اختفت.
        steps = rawSteps.filter(s => !s.el || visible(resolve(s.el)) || s.keepIfMissing);
        if (!steps.length) return false;

        nodes = build();

        nodes.next.addEventListener('click', next);
        nodes.back.addEventListener('click', () => go(idx - 1));
        nodes.skip.addEventListener('click', () => finish(true));
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onResize);
        // capture:true كي تصلنا أحداث تمرير الحاويات الداخلية لا النافذة فقط
        window.addEventListener('scroll', onScroll, true);

        paint();
        return true;
    }

    /** إنهاء الجولة الجارية بلا تسجيل إتمام */
    function stop() { if (nodes) finish(false); }

    /**
     * تلميح لحظي: خطوة واحدة تُعرض مرّة واحدة عند ظهور شيء جديد.
     *
     * الجولة الترحيبية تشرح ما هو موجود وقت الدخول، لكن أهمّ ما يحتاج
     * الشرح لا يكون موجوداً حينها: الكابتن يدخل أول مرّة بلا طلبات،
     * فشرح "كيف تقبل الطلب" على شاشة فارغة كلامٌ بلا مرجع. التلميح
     * ينتظر وصول أول طلب فعلي ثم يشرح عليه.
     *
     * @param {object} cfg { id, el?, title, body, note?, force? }
     */
    function hint(cfg) {
        if (!cfg || !cfg.id) return false;
        return start({
            id: 'hint_' + cfg.id,
            force: !!cfg.force,
            single: true,
            steps: [{
                el: cfg.el || null,
                title: cfg.title,
                body: cfg.body,
                note: cfg.note,
                pad: cfg.pad,
                radius: cfg.radius
            }]
        });
    }

    return { start, stop, hint, isDone, markDone, reset };
})();
