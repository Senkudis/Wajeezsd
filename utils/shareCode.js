/**
 * مولّد كود المشاركة القصير للمتاجر — wajeezsd.com/s/<code>
 * أبجدية base58 (بلا 0/O/I/l/1 الملتبسة بصرياً) لسهولة القراءة والكتابة اليدوية.
 */
const crypto = require('crypto');

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CODE_LENGTH = 6;

/** يولّد كوداً عشوائياً من 6 أحرف (58^6 ≈ 38 مليار احتمال — التصادم شبه مستحيل) */
function generateShareCode() {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return code;
}

/**
 * يضمن امتلاك المتجر كود مشاركة — يولّد ويحفظ إن كان فارغاً.
 * يتعامل مع تصادم unique النادر بإعادة المحاولة.
 * @param {import('mongoose').Document} place - وثيقة Place (ليست lean)
 * @returns {Promise<string>} الكود (القائم أو المولَّد)
 */
async function ensureShareCode(place) {
    if (!place) return null;
    if (place.shareCode) return place.shareCode;

    for (let attempt = 0; attempt < 5; attempt++) {
        place.shareCode = generateShareCode();
        try {
            await place.save();
            return place.shareCode;
        } catch (err) {
            // 11000 = duplicate key (تصادم كود) → جرّب كوداً آخر
            if (err && err.code === 11000) continue;
            throw err;
        }
    }
    throw new Error('Failed to generate a unique share code after 5 attempts');
}

module.exports = { generateShareCode, ensureShareCode, ALPHABET, CODE_LENGTH };
