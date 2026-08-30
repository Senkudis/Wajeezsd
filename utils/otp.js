const crypto = require('crypto');

/**
 * توليد الأكواد العشوائية الحسّاسة أمنياً (تفعيل الحساب، استعادة كلمة المرور،
 * أكواد الإحالة) من مصدر عشوائي مشفَّر.
 *
 * ⚠️ لا تُستعمل Math.random هنا إطلاقاً: مولّد V8 هو xorshift128+، وهو غير
 *    مشفَّر ويمكن استنتاج حالته الداخلية من عدد قليل من المخرجات المتتابعة.
 *    أكواد الاستعادة تُطلب علناً بلا حساب، فمن يجمع بضعة أكواد لنفسه يستطيع
 *    التنبّؤ بكود استعادة حساب غيره.
 *
 * crypto.randomInt يستعمل رفض العيّنات (rejection sampling) داخلياً، فالتوزيع
 * منتظم بلا انحياز — بخلاف `% chars.length` على بايت عشوائي.
 */

// الأبجدية تتجنّب عمداً المحارف المتشابهة بصرياً (I، O، 0، 1) لأن أكواد
// الإحالة تُملى صوتياً وتُكتب يدوياً.
const REFERRAL_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_PREFIX = 'WJZ-';
const REFERRAL_LENGTH = 4;

/**
 * كود تحقق من ست خانات، دائماً بطول 6 (لا يبدأ بصفر).
 * @returns {string} مثال: "482915"
 */
function generateOtpCode() {
    return String(crypto.randomInt(100000, 1000000));
}

/**
 * كود إحالة بصيغة WJZ-XXXX.
 * @param {number} [length=4] عدد المحارف بعد البادئة.
 * @returns {string} مثال: "WJZ-K7M2"
 */
function generateReferralCode(length = REFERRAL_LENGTH) {
    let code = REFERRAL_PREFIX;
    for (let i = 0; i < length; i++) {
        code += REFERRAL_CHARS[crypto.randomInt(0, REFERRAL_CHARS.length)];
    }
    return code;
}

module.exports = {
    generateOtpCode,
    generateReferralCode,
    REFERRAL_CHARS,
    REFERRAL_PREFIX,
    REFERRAL_LENGTH
};
