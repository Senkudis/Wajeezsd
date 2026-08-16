/**
 * 🪪 قواعد خدمة موقع الفريق على نطاقه الفرعي.
 *
 * على الاستضافة (CloudLinux Passenger) يشارك النطاق الفرعي جذر التطبيق نفسه،
 * فكل ما يخدمه السيرفر للنطاق الرئيسي متاح تقنياً على نطاق الفريق أيضاً.
 * هذه الوحدة هي الحدّ الذي يمنع ذلك: نطاق الفريق يخدم تطبيق الفريق وأصولاً
 * مشتركة معدودة فقط — لا لوحة أدمن ولا صفحات كباتن ولا شاشات عملاء.
 *
 * منفصلة عن index.js لتكون قابلة للاختبار: قاعدةٌ أمنية لا تُختبَر هي قاعدة
 * تُنقَض بأول تعديل.
 */

'use strict';

/** أصول مشتركة يحتاجها موقع الفريق فعلاً من public_html. */
const SHARED_PREFIXES = Object.freeze(['/vendor/', '/icons/', '/assets/']);

const SHARED_FILES = Object.freeze([
    '/favicon.ico',
    '/logo.png',
    '/logo-full.png',
    '/logo-white.png',
    '/logo-transparent.png'
]);

/** مسارات تُترك لبقية السلسلة على كل النطاقات: الـ API والصور المرفوعة. */
const PASSTHROUGH_PREFIXES = Object.freeze(['/api', '/uploads']);

/**
 * يقرأ قائمة نطاقات الفريق من البيئة.
 * @param {string} [raw] قيمة TEAM_HOSTS
 * @returns {string[]}
 */
function parseTeamHosts(raw) {
    return String(raw || 'team.wajeezsd.com')
        .split(',')
        .map(h => h.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * هل هذا الطلب موجّه إلى نطاق الفريق؟
 * المقارنة بعد التصغير لأن ترويسة Host تصل بأي حالة أحرف.
 */
function isTeamHost(hostname, teamHosts) {
    return teamHosts.includes(String(hostname || '').toLowerCase());
}

/** مسارات لا يعترضها منطق الفريق أصلاً (الـ API والرفوعات). */
function isPassthrough(reqPath) {
    return PASSTHROUGH_PREFIXES.some(p => reqPath.startsWith(p));
}

/**
 * هل يُسمح بخدمة هذا الملف من public_html على نطاق الفريق؟
 *
 * قائمة سماح لا منع: قائمة المنع تعني أن كل صفحة جديدة تُضاف للوحة تصير
 * مكشوفة على نطاق الفريق تلقائياً حتى يتذكّر أحدهم منعها.
 */
function isSharedAsset(reqPath) {
    if (SHARED_FILES.includes(reqPath)) return true;
    return SHARED_PREFIXES.some(p => reqPath.startsWith(p));
}

module.exports = {
    SHARED_PREFIXES,
    SHARED_FILES,
    parseTeamHosts,
    isTeamHost,
    isPassthrough,
    isSharedAsset
};
