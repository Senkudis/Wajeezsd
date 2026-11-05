/**
 * ⬅️ مكدّس الرجوع — زرّ الرجوع في الهاتف (والمتصفّح) يغلق ما فُتح فوق
 * الصفحة طبقةً طبقة، قبل أن يغادر الصفحة نفسها.
 *
 * المشكلة: app-core.js كان يغلق نوافذ Bootstrap وحدها، ثم history.back().
 * فالقائمة الجانبية، والورقة السفلية، وشاشة الخريطة، ومنتقي «اشترِ لي»،
 * وعرض القسم داخل التسوّق — كلها يتخطّاها الرجوع ويخرج العميل من الصفحة
 * وهو يظنّ أنه يغلق ما أمامه.
 *
 * الحلّ: كل طبقة تُفتح تُضيف مدخلاً في السجلّ (pushState)، فيصير الرجوع
 * popstate نغلق عنده الطبقة العليا. وإن أُغلقت الطبقة بزرّها نستهلك مدخلها
 * بصمت حتى لا يحتاج العميل ضغطتين بعدها.
 *
 * لا يعدّل أيّ دالة فتحٍ أو إغلاق: يراقب حالة العناصر (MutationObserver)
 * وأحداث Bootstrap، فيعمل مع الكود كما هو.
 */
(function () {
    'use strict';
    if (window.BackStack) return;

    const stack = [];            // معرّفات الطبقات المفتوحة بترتيب فتحها
    const closingByBack = new Set();
    let swallowPops = 0;         // مدخلاتٌ نستهلكها نحن بـ history.back()

    function open(id) {
        if (stack.includes(id)) return;
        stack.push(id);
        try { history.pushState({ wjLayer: id }, ''); } catch (_) {}
    }

    function closedByUi(id) {
        const i = stack.lastIndexOf(id);
        if (i === -1) return;
        if (closingByBack.delete(id)) { stack.splice(i, 1); return; }
        stack.splice(i, 1);
        // مدخلها في السجلّ ما زال قائماً — نستهلكه وإلا احتاج الرجوع ضغطةً فارغة
        if (i === stack.length) { swallowPops++; history.back(); }
    }

    // ── الطبقات المعروفة: كيف نعرف أنها مفتوحة، وكيف نغلقها ─────────────
    const LAYERS = [
        {
            id: 'map', sel: '#static-map-container',
            // التسخين المسبق (map-experience.js) يبنيها مخفيّة — ليست مفتوحة
            isOpen: (el) => el.style.display && el.style.display !== 'none' && el.style.visibility !== 'hidden',
            close: () => window.closeMapUI && window.closeMapUI()
        },
        {
            id: 'shop-map', sel: '#shop-map-overlay',
            isOpen: (el) => !el.classList.contains('d-none'),
            close: () => window.closeShopMapUI && window.closeShopMapUI()
        },
        {
            id: 'errand', sel: '#errandSheet',
            isOpen: (el) => el.classList.contains('show'),
            close: () => window.closeErrandPicker && window.closeErrandPicker()
        },
        {
            id: 'smart-search', sel: '#ss-overlay',
            isOpen: (el) => el.classList.contains('ss-open'),
            close: (el) => {
                const b = el.querySelector('.ss-back');
                if (b) b.click();
                else { el.classList.remove('ss-open'); document.body.style.overflow = ''; }
            }
        },
        {
            // عرض قسمٍ أو نتائج بحث داخل التسوّق — «صفحة» داخلية يتوقّع العميل الرجوع منها
            id: 'places', sel: '#places-view',
            when: () => !!document.getElementById('globalSearchInput'),
            isOpen: (el) => !el.classList.contains('d-none'),
            close: () => {
                const s = document.getElementById('globalSearchInput');
                if (s && s.value) { s.value = ''; if (window.handleGlobalSearch) window.handleGlobalSearch(''); }
                if (window.showCategories) window.showCategories();
            }
        }
    ];

    function watch(layer, el) {
        if (el._wjWatched) return;
        el._wjWatched = true;
        let was = !!layer.isOpen(el);
        if (was) open(layer.id);
        new MutationObserver(() => {
            const now = !!layer.isOpen(el);
            if (now === was) return;
            was = now;
            if (now) open(layer.id); else closedByUi(layer.id);
        }).observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    function scan() {
        LAYERS.forEach(layer => {
            if (layer.when && !layer.when()) return;
            const el = document.querySelector(layer.sel);
            if (el) watch(layer, el);
        });
    }

    // بعض الطبقات تُبنى عند أوّل فتح (البحث الذكي) — نلتقطها حين تظهر
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });

    // ── نوافذ Bootstrap والقوائم الجانبية: أحداثها تغني عن المراقبة ──────
    ['modal', 'offcanvas'].forEach(kind => {
        document.addEventListener('shown.bs.' + kind, (e) => {
            if (!e.target.id) e.target.id = 'wj-' + kind + '-' + Math.random().toString(36).slice(2, 7);
            open(kind + ':' + e.target.id);
        });
        document.addEventListener('hidden.bs.' + kind, (e) => closedByUi(kind + ':' + e.target.id));
    });

    function closeLayer(id) {
        const [kind, elId] = id.split(':');
        if ((kind === 'modal' || kind === 'offcanvas') && elId && window.bootstrap) {
            const el = document.getElementById(elId);
            const Cls = kind === 'modal' ? bootstrap.Modal : bootstrap.Offcanvas;
            const inst = el && Cls.getInstance(el);
            if (inst) inst.hide();
            return;
        }
        const layer = LAYERS.find(l => l.id === id);
        const el = layer && document.querySelector(layer.sel);
        if (layer && el) layer.close(el);
    }

    window.addEventListener('popstate', () => {
        if (swallowPops > 0) { swallowPops--; return; }
        const id = stack[stack.length - 1];
        if (!id) return;
        closingByBack.add(id);
        closeLayer(id);
        // طبقةٌ لم تُغلق فعلاً (زرّها مفقود مثلاً) لا تبقى عالقة في المكدّس
        setTimeout(() => {
            if (closingByBack.delete(id)) {
                const i = stack.lastIndexOf(id);
                if (i !== -1) stack.splice(i, 1);
            }
        }, 600);
    });

    window.BackStack = {
        /** عدد الطبقات المفتوحة — app-core يرجع خطوةً واحدة حين > 0 */
        depth: () => stack.length
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
    else scan();
})();
