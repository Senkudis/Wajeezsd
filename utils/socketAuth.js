/**
 * مصادقة Socket.io — اشتقاق الهوية من JWT.
 *
 * وُضع في وحدة مستقلة لأن index.js يتصل بقاعدة البيانات عند الاستيراد،
 * فلا يمكن اختبار المنطق الأمني داخله. هنا المنطق نقي وقابل للاختبار بالكامل.
 *
 * القاعدة: لا تُشتق الهوية أبداً من أي قيمة يرسلها العميل (userId في user_join)،
 * بل من التوكن الموقّع حصراً.
 */
const jwt = require('jsonwebtoken');

/**
 * يتحقق من التوكن مقابل السر الحالي، ثم السر القديم إن كان مضبوطاً.
 * نفس منطق middleware/authMiddleware للتوافق مع نسخ التطبيق القديمة.
 * @returns {object|null} الحمولة المفكوكة أو null
 */
function verifySocketToken(token, opts = {}) {
    const secret = opts.secret || process.env.JWT_SECRET;
    const legacySecret = 'legacySecret' in opts ? opts.legacySecret : process.env.JWT_SECRET_LEGACY;

    if (!token || typeof token !== 'string') return null;
    if (!secret) return null;

    try {
        return jwt.verify(token, secret);
    } catch (primaryErr) {
        if (legacySecret && legacySecret.length > 0) {
            try { return jwt.verify(token, legacySecret); } catch (_) { return null; }
        }
        return null;
    }
}

/**
 * يحوّل توكن المصافحة إلى هوية موثوقة.
 *
 * @param {string} token          التوكن من socket.handshake
 * @param {function} findUserById دالة async تُرجع {_id, role, city, isActive} أو null
 * @returns {Promise<{userId, role, city}|null>} null تعني: لا تُمنح أي صلاحية
 */
async function resolveSocketIdentity(token, findUserById, opts = {}) {
    const decoded = verifySocketToken(token, opts);
    if (!decoded || !decoded.userId) return null;

    // التوكنات المقيّدة (مثل upload_only للكابتن قبل الموافقة) لا تُمنح وصول سوكت
    if (decoded.scope && decoded.scope !== 'full') return null;

    const user = await findUserById(decoded.userId);
    if (!user) return null;
    if (!user.isActive) return null; // حساب أوقفته الإدارة

    return {
        userId: String(user._id),
        role: user.role || null,
        city: user.city || null
    };
}

module.exports = { verifySocketToken, resolveSocketIdentity };
