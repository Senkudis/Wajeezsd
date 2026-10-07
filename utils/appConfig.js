/**
 * 📱 إعدادات التحديث لكل منصّة — GET /api/auth/app-config
 *
 * كان رقم «أحدث إصدار» واحداً للمنصّتين. والمتجران لا يسيران معاً: أندرويد
 * 1.6.2 والآيفون 1.6.1 (لكلٍّ مراجعته وأرقامه). فضبطه على 1.6.2 يجعل كل
 * مستخدمي الآيفون «قدامى» — وبالتحديث الإجباري يعلقون في حلقةٍ لا تنتهي:
 * يُرسَلون للمتجر فلا يجدون 1.6.2، فيعودون فيُرسَلون. وكان زرّ التحديث
 * يفتح جوجل بلاي حتى على الآيفون.
 *
 * المنصّة: ?platform= من التطبيق الجديد، وإلا من User-Agent — النسخ
 * المثبّتة فعلاً لا ترسل المنصّة، وهي التي تحتاج الإصلاح الآن.
 *
 * التوافق مع النسخ القديمة: هي تقرأ appVersion و minVersion و playStoreLink
 * فقط. فللآيفون تأتي هذه الحقول نفسها بقيم الآيفون، و playStoreLink برابط
 * App Store — فتذهب للمتجر الصحيح دون تعديلٍ فيها.
 */

const DEFAULT_PLAY = 'https://play.google.com/store/apps/details?id=com.wajeezsd.app';
const DEFAULT_APPSTORE = 'https://apps.apple.com/app/id6807840888';

/** ios | android — الصريح أولاً، ثم بصمة المتصفّح */
function detectPlatform(query, userAgent) {
    const q = String((query && query.platform) || '').toLowerCase();
    if (q === 'ios' || q === 'android') return q;
    return /iPhone|iPad|iPod/i.test(String(userAgent || '')) ? 'ios' : 'android';
}

/**
 * @param {object} settings وثيقة Settings
 * @param {'ios'|'android'} platform
 */
function buildAppConfig(settings, platform) {
    const s = settings || {};
    const playLink = s.playStoreLink || DEFAULT_PLAY;
    const iosLink = s.appStoreLink || DEFAULT_APPSTORE;

    if (platform === 'ios') {
        // إصدار الآيفون غير مضبوط ⇒ لا تنبيه إطلاقاً (appVersion فارغ يُسكت
        // الفحص في كل النسخ). الاحتياط برقم أندرويد هو العطل نفسه.
        const latest = s.iosAppVersion || null;
        return {
            platform: 'ios',
            appVersion: latest,
            minVersion: s.iosMinVersion || latest,
            storeLink: iosLink,
            playStoreLink: iosLink,     // النسخ القديمة تفتح هذا الحقل وحده
            appStoreLink: iosLink,
            forceUpdate: !!(latest && s.forceUpdate)
        };
    }

    return {
        platform: 'android',
        appVersion: s.appVersion,
        minVersion: s.minVersion || s.appVersion,
        storeLink: playLink,
        playStoreLink: playLink,
        appStoreLink: iosLink,
        forceUpdate: !!s.forceUpdate
    };
}

/** x.y.z — أو فارغ حين يُسمح بالفراغ */
function isValidVersion(v, { allowEmpty = false } = {}) {
    const t = String(v == null ? '' : v).trim();
    if (!t) return allowEmpty;
    return /^\d{1,3}(\.\d{1,3}){1,2}$/.test(t);
}

module.exports = { detectPlatform, buildAppConfig, isValidVersion, DEFAULT_PLAY, DEFAULT_APPSTORE };
