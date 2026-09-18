/**
 * 📞 تطبيع أرقام الهواتف — الصيغة المعتمدة: 249XXXXXXXXX
 *
 * ⚠️ العطل الذي كان هنا: التنظيف `replace(/[^0-9]/g, '')` يُسقط **الأرقام
 *    العربية‑الهندية** إسقاطاً كاملاً، لأنها ليست [0-9]. فمن يكتب رقمه
 *    بلوحة مفاتيح عربية — وهي الحالة الغالبة عند مستخدمينا — يصير رقمه:
 *
 *        normalizePhone('٠٩١٢٣٤٥٦٧٨')  →  '249'
 *
 *    ويُسجَّل الحساب بالرقم '249'. فلا يصله رمز تحقّق، ولا يستطيع الدخول،
 *    ويصطدم بفهرس الهاتف الفريد مع كل من وقع في الفخ نفسه. عطلٌ صامت
 *    تماماً: لا خطأ يُرى، والحساب يُنشأ.
 */

// الأرقام العربية‑الهندية (٠-٩) والفارسية (۰-۹) → لاتينية
const DIGIT_MAP = {
    '\u0660':'0','\u0661':'1','\u0662':'2','\u0663':'3','\u0664':'4',
    '\u0665':'5','\u0666':'6','\u0667':'7','\u0668':'8','\u0669':'9',
    '\u06F0':'0','\u06F1':'1','\u06F2':'2','\u06F3':'3','\u06F4':'4',
    '\u06F5':'5','\u06F6':'6','\u06F7':'7','\u06F8':'8','\u06F9':'9'
};

/** يوحّد صور الأرقام قبل أي تنظيف — الخطوة التي كانت غائبة */
function foldDigits(s) {
    return String(s == null ? '' : s)
        .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, d => DIGIT_MAP[d] || d);
}

function normalizePhone(phone) {
    if (!phone) return null;
    let cleaned = foldDigits(phone).replace(/[^0-9]/g, '');

    // Handle 24909... case (Common user error)
    if (cleaned.startsWith('2490')) return '249' + cleaned.substring(4);

    // Handle 2499... case (Already correct)
    if (cleaned.startsWith('249') && cleaned.length === 12) return cleaned;

    // Handle 09... or 01... case (Local format)
    if (cleaned.startsWith('0')) return '249' + cleaned.substring(1);

    // Handle 9123... case (No prefix)
    if (cleaned.length === 9) return '249' + cleaned;

    // Fallback
    return '249' + cleaned;
}

/**
 * ✅ هل الناتج رقم سوداني صالح؟
 *
 * normalizePhone تُطبّع ولا تحكم: تُعيد '249' لمُدخَلٍ فارغ من الأرقام،
 * و'2499123456789' لرقمٍ زائد الطول — وكلاهما يُخزَّن بلا اعتراض. هذه
 * الدالة هي الحَكَم، تُستعمل عند بوابات الإدخال.
 *
 * الصيغة: 249 + تسعة أرقام تبدأ بـ 9 أو 1 (المحمول السوداني).
 */
function isValidSudanPhone(phone) {
    const n = normalizePhone(phone);
    return !!n && /^249[19]\d{8}$/.test(n);
}

module.exports = normalizePhone;
module.exports.normalizePhone = normalizePhone;
module.exports.isValidSudanPhone = isValidSudanPhone;
module.exports.foldDigits = foldDigits;
