const jwt = require('jsonwebtoken');

/**
 * إصدار توكنات الجلسة في مكان واحد.
 *
 * الغرض الأساسي: ضمان أن كل توكن يحمل `tv` (نسخة الجلسة). كانت مواضع
 * jwt.sign متفرّقة في ثمانية أماكن، ونسيان الحقل في أحدها يترك ثغرة صامتة —
 * توكن لا يُبطله تغيير كلمة المرور.
 */

const SESSION_TTL = '7d';

/**
 * @param {object} user مستند المستخدم (يكفي _id و role و tokenVersion)
 * @param {object} [options]
 * @param {string} [options.role] لتجاوز الدور (مثل توكن رفع الوثائق للكابتن)
 * @param {string} [options.expiresIn] مدة الصلاحية، افتراضها سبعة أيام
 * @param {object} [options.claims] حقول إضافية (مثل adminRole أو scope)
 */
function signUserToken(user, { role, expiresIn = SESSION_TTL, claims = {} } = {}) {
    return jwt.sign(
        {
            userId: user._id,
            role: role || user.role,
            tv: user.tokenVersion || 0,
            ...claims
        },
        process.env.JWT_SECRET,
        { expiresIn }
    );
}

module.exports = { signUserToken, SESSION_TTL };
