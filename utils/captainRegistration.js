/**
 * 🔒 باب تسجيل الكباتن — مصدرٌ واحد لقرار «مفتوح أم مغلق».
 *
 * مدخلان يُنشئان كابتناً، وكلاهما يسأل هنا:
 *   • POST /api/auth/register-captain     حسابٌ جديد
 *   • POST /api/auth/captain-application  عميلٌ قائم يطلب الترقية
 * ولو فُحص أحدهما دون الآخر لصار المغلق مفتوحاً من الباب الثاني.
 *
 * والقفل على الخادم لا على الواجهة: صفحة التسجيل تُخفي النموذج حين يُغلق
 * الباب، لكن الطلب المباشر إلى الـ API لا يمرّ بالصفحة.
 */
const Settings = require('../models/Settings');

const { CITY_KEYS: VALID_CITIES, CITY_LABELS: CITY_LABEL } = require('../config/cities');   // 🌍 مصدرٌ واحد

const CLOSED_MESSAGE = 'التسجيل ككابتن مغلقٌ حالياً. تابعنا — سنعلن عند فتحه.';

function resolveCity(city) {
    return VALID_CITIES.includes(city) ? city : 'Khartoum';
}

/**
 * هل التسجيل مفتوح في هذه المدينة؟
 *
 * `=== true` حرفياً لا مجرّد قيمةٍ صادقة: getSettings تستعمل .lean()
 * فوثائق الإعدادات الموجودة قبل هذه الميزة لا تحمل الحقل أصلاً، ويُقرأ
 * undefined. فكل ما ليس true — غائباً أو null أو نصّاً — مغلق.
 * وهذا هو المطلوب: مغلقٌ ما لم تفتحه الإدارة صراحةً.
 */
async function isCaptainRegistrationOpen(city) {
    const settings = await Settings.getSettings(resolveCity(city));
    return !!settings && settings.captainRegistrationOpen === true;
}

/** حالة المدينتين معاً — تحتاجها صفحة التسجيل لتعرض ما هو مفتوح. */
async function captainRegistrationStatus() {
    const out = {};
    for (const city of VALID_CITIES) {
        out[city] = await isCaptainRegistrationOpen(city);
    }
    return out;
}

function closedMessage(city) {
    const label = CITY_LABEL[resolveCity(city)];
    return `التسجيل ككابتن في ${label} مغلقٌ حالياً. تابعنا — سنعلن عند فتحه.`;
}

module.exports = {
    VALID_CITIES,
    CITY_LABEL,
    CLOSED_MESSAGE,
    resolveCity,
    isCaptainRegistrationOpen,
    captainRegistrationStatus,
    closedMessage,
};
