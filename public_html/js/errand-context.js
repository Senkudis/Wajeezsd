/**
 * 🛍️ عقد الانتقال إلى نموذج طلب "اشترِ لي".
 *
 * لماذا ملفّ مستقل: اختيار المحل صار يحدث من مكانين — منتقي التسوّق
 * (errand-picker.js) والبحث العام في الرئيسية (smart-search.js) — والانتقال
 * بينهما عقدٌ ضمني من ثلاث قطع: مفتاح sessionStorage، وشكل الكائن الذي يقرأه
 * initErrandMode في home.js، والرابط ?mode=errand. نسخُه في ملفّين يعني أن
 * يتغيّر حقلٌ في طرف فينكسر الطرف الآخر صامتاً: يفتح النموذج بلا اسم محل أو بلا
 * إحداثيات، والعميل يرسل طلباً لا يعرف الكابتن أين ينفّذه.
 */
(function () {
    'use strict';

    var KEY = 'errandContext';

    function num(v) { var n = parseFloat(v); return Number.isFinite(n) ? n : null; }

    window.ErrandContext = {
        KEY: KEY,

        /**
         * يحوّل مكاناً من أي مصدر بحث إلى سياق يفهمه نموذج الطلب.
         * @param {object} p مكان بشكل نتائج البحث (source: 'wajeez' | 'google')
         */
        fromPlace: function (p) {
            p = p || {};
            return {
                shopId: p.source === 'wajeez' ? (p.placeId || p._id || null) : null,
                shopName: p.name || '',
                lat: num(p.lat),
                lng: num(p.lng),
                address: p.address || '',
                externalId: p.externalId || '',
                category: p.category || '',
                categoryKey: p.categoryKey || ''
            };
        },

        /**
         * يحفظ السياق وينتقل للنموذج. يتطلّب تسجيل دخول: طلب الشراء يُنشَأ باسم
         * العميل ويُحاسَب عليه، فلا معنى لملء النموذج ثم صدّه عند الإرسال.
         * @returns {boolean} false إن حُوّل لتسجيل الدخول
         */
        start: function (ctx) {
            if (!localStorage.getItem('token')) {
                window.location.href = 'client-login.html';
                return false;
            }
            try { sessionStorage.setItem(KEY, JSON.stringify(ctx || {})); } catch (_) {}
            window.location.href = 'index.html?mode=errand';
            return true;
        },

        /** اختصار: من نتيجة بحث مباشرةً إلى النموذج */
        startFromPlace: function (p) {
            return this.start(this.fromPlace(p));
        }
    };
})();
