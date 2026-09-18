/**
 * 🔎 مطابقة البحث في لوحة الإدارة — مصدرٌ واحد للمتصفّح والخادم.
 *
 * ما كان يحدث: كل صفحةٍ تكتب فلترها بيدها، وكلّها تفعل الشيء نفسه:
 *     (u.phone || '').includes(q)
 *
 * وهذا معطوبٌ في ثلاثة مواضع دفعةً واحدة:
 *
 * ١) **الهاتف** يُخزَّن بصيغة 249XXXXXXXXX (utils/phoneNormalizer). فكتابة
 *    `0912345678` لا تطابق شيئاً أبداً، و`+249 91 234` كذلك. الصيغة الوحيدة
 *    التي تعمل مصادفةً هي إسقاط الصفر — ولهذا «مرّات إلّا أكتب 91234 بدون
 *    الصفر». الفلتر لم يكن يبحث عن رقم، بل عن نصٍّ داخل نصّ.
 *
 * ٢) **البريد** لم يكن يُبحَث فيه إطلاقاً — لا في الخادم ولا في أي صفحة.
 *
 * ٣) **الاسم العربي** يُطابَق حرفياً، فـ«احمد» لا تجد «أحمد»، و«فاطمه» لا
 *    تجد «فاطمة». وهذا في تطبيقٍ كل أسمائه عربية.
 *
 * الحلّ: تطبيعٌ واحد للطرفين. الملف صالحٌ للمتصفّح (window.AdminSearch)
 * وللخادم (require) معاً عن قصد — نسختان تفترقان يوماً تعني بحثاً يعطي
 * نتيجتين مختلفتين للسؤال نفسه.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AdminSearch = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // الأرقام العربية‑الهندية والفارسية → لاتينية
    const DIGIT_MAP = {
        '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
        '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'
    };

    function foldDigits(s) {
        return String(s == null ? '' : s).replace(/[٠-٩۰-۹]/g, d => DIGIT_MAP[d] || d);
    }

    /**
     * تطبيع نصّ للمطابقة: تشكيل، تطويل، صور الألف والياء والتاء المربوطة.
     * لا يُستعمل للعرض — للمقارنة وحدها.
     */
    function normalizeText(s) {
        return foldDigits(s)
            .toLowerCase()
            .replace(/[\u064B-\u0652\u0670]/g, '')   // التشكيل
            .replace(/\u0640/g, '')                  // التطويل ـــ
            .replace(/[أإآٱ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** أرقام الهاتف وحدها، بلا مسافات ولا + ولا شرطات */
    function digitsOnly(s) {
        return foldDigits(s).replace(/[^0-9]/g, '');
    }

    /**
     * 📞 الجزء الدالّ من الرقم: نُسقط بادئة الدولة والصفر المحلّي، فتصير كل
     *    الصيغ التي يكتبها الإنسان لرقمٍ واحد **نصّاً واحداً**:
     *      0912345678 · 912345678 · 249912345678 · +249 91 234 5678
     *    ⇒ 912345678
     */
    function phoneCore(s) {
        let d = digitsOnly(s);
        if (d.startsWith('00')) d = d.slice(2);
        if (d.startsWith('249')) d = d.slice(3);
        while (d.startsWith('0')) d = d.slice(1);
        return d;
    }

    /** هل يبدو المكتوب رقماً؟ (يُقارَن كهاتف لا كنصّ) */
    function looksNumeric(q) {
        const t = foldDigits(q).trim();
        return t.length > 0 && /^[0-9+\-\s()]+$/.test(t);
    }

    /**
     * المطابقة الأساسية.
     * @param {string} query ما كتبه الأدمن
     * @param {object} record {name, phone, email, ...}
     * @param {string[]} extraFields حقول نصّية إضافية تخصّ الصفحة
     */
    function matches(query, record, extraFields) {
        const q = String(query == null ? '' : query).trim();
        if (!q) return true;
        if (!record) return false;

        // 📞 استعلامٌ رقميّ: يُقارَن بجوهر الرقم لا بنصّه الخام.
        //    ونقبل التطابق الجزئي ليعمل البحث أثناء الكتابة.
        if (looksNumeric(q)) {
            const core = phoneCore(q);
            if (core) {
                const phones = [record.phone, record.whatsapp, record.emergencyPhone]
                    .filter(Boolean).map(phoneCore);
                if (phones.some(p => p.includes(core))) return true;
            }
            // رقمٌ قد يكون مبلغاً أو معرّفاً — نكمل إلى المطابقة النصّية
        }

        const nq = normalizeText(q);
        if (!nq) return false;

        const fields = [record.name, record.email, record.phone]
            .concat(Array.isArray(extraFields) ? extraFields : []);

        return fields.some(v => v && normalizeText(v).includes(nq));
    }

    /**
     * 🛡️ تهريب المحارف الخاصّة قبل بناء تعبير نمطي من مُدخَل المستخدم.
     *    بدونه تُفسَّر `.` و`+` و`(` كأنماط، فيعطي البحث نتائج عشوائية —
     *    أو يعلّق الخادم على نمطٍ كارثيّ.
     */
    function escapeRegex(s) {
        return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    return { normalizeText, digitsOnly, phoneCore, looksNumeric, matches, escapeRegex, foldDigits };
});
