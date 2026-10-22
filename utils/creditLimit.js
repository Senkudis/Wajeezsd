/**
 * 💳 الحد الائتماني الفعلي للكابتن — مصدرٌ واحد.
 *
 * كانت ثلاثة مسارات تحكم بثلاث قواعد: التسليم يحجب بحدّ المدينة متجاهلاً
 * حدّ الكابتن الخاص (وحدٌّ صفريّ للمدينة يسقط إلى ‎-5000 لأن 0 قيمة كاذبة)،
 * والسداد وتعديل الدين يفكّان الحجب بـ credit_limit الخاص، وشاشة المحفظة
 * تعرض قاعدةً ثالثة. فقد يُحجب الكابتن عند رقمٍ ويُفكّ عند غيره.
 *
 * القاعدة (هي نفسها التي كانت تعرضها شاشة المحفظة):
 *   1. credit_limit للكابتن إن خالف القيمة الافتراضية للمخطّط ⇒ حدٌّ خاص
 *   2. وإلا defaultCreditLimit لمدينته (0 قيمةٌ صالحة)
 *   3. وإلا ‎-5000
 */
const SCHEMA_DEFAULT = -5000;

function hasCustomLimit(captain) {
    const v = captain && captain.credit_limit;
    return typeof v === 'number' && Number.isFinite(v) && v !== SCHEMA_DEFAULT;
}

function resolveCreditLimit(captain, settings) {
    if (hasCustomLimit(captain)) return captain.credit_limit;
    const cityDefault = settings && settings.defaultCreditLimit;
    return (typeof cityDefault === 'number' && Number.isFinite(cityDefault)) ? cityDefault : SCHEMA_DEFAULT;
}

/** يجلب إعدادات مدينة الكابتن ويحسب حدّه. */
async function creditLimitFor(captain) {
    const Settings = require('../models/Settings');
    let settings = null;
    try { settings = await Settings.getSettings((captain && captain.city) || 'Khartoum'); } catch (_) {}
    return resolveCreditLimit(captain, settings);
}

module.exports = { SCHEMA_DEFAULT, hasCustomLimit, resolveCreditLimit, creditLimitFor };
