/**
 * 💬 التحقق من صورة الدردشة وعمرها.
 *
 * لماذا التحقق أصلاً: العميل يرسل `imageUrl` نصاً في جسم الطلب بعد رفع الصورة.
 * قبولها كما هي يعني أن أي مستخدم يستطيع كتابة أي رابط — رابط خارجي يتجسّس على
 * من فتح الرسالة (tracking pixel)، أو `javascript:` في واجهة لا تنظّف المخرجات،
 * أو مسار يشير لصورة وثائق كابتن آخر تحت /uploads/documents. فلا نقبل إلا
 * مسارات مجلد الدردشة نفسه.
 */

// مسار صورة دردشة صالح: /uploads/chat/<اسم آمن>.<امتداد صورة>
// أسماء الملفات تُولَّد في utils/imageUpload.js (safeUploadName) فلا تحوي مسارات.
const CHAT_IMAGE_RE = /^\/uploads\/chat\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|gif)$/i;

const CHAT_IMAGE_TTL_HOURS = 48;
const CHAT_IMAGE_TTL_MS = CHAT_IMAGE_TTL_HOURS * 60 * 60 * 1000;

/**
 * ينظّف رابط صورة الدردشة ويُرجعه، أو null إن كان غير صالح.
 * @param {*} url
 * @returns {string|null}
 */
function sanitizeChatImageUrl(url) {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    // `..` مستحيلة مع النمط أعلاه، لكن الفحص الصريح يوثّق النية ويصمد لو رُخِّم النمط
    if (trimmed.includes('..')) return null;
    return CHAT_IMAGE_RE.test(trimmed) ? trimmed : null;
}

/** هل انتهت صلاحية صورة رسالة أُرسلت في هذا الوقت؟ */
function isChatImageExpired(createdAt, now = Date.now()) {
    if (!createdAt) return false;
    return now - new Date(createdAt).getTime() >= CHAT_IMAGE_TTL_MS;
}

module.exports = {
    CHAT_IMAGE_TTL_HOURS,
    CHAT_IMAGE_TTL_MS,
    sanitizeChatImageUrl,
    isChatImageExpired
};
