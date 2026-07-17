/**
 * تتبّع أخطاء خفيف في الذاكرة (بلا خدمة خارجية).
 *
 * مخزن دائري يحتفظ بآخر N خطأ مع سياقها (المسار، الطريقة، المستخدم، الأثر).
 * يُغذّيه معالج الأخطاء المركزي والمعالجات العامة، ويُعرض للمسؤول الرئيسي عبر
 * GET /api/admin/errors — فتظهر أخطاء الإنتاج بدل أن تمرّ صامتة حتى يشتكي مستخدم.
 *
 * ملاحظة: في الذاكرة فقط — يُصفّر عند إعادة التشغيل. كافٍ للتشخيص السريع؛
 * لو أردتم تتبّعاً دائماً لاحقاً، هذه الواجهة نفسها تصلح جسراً لـ Sentry.
 */

const MAX_ERRORS = 100;
const buffer = [];

/**
 * يسجّل خطأً في المخزن الدائري.
 * @param {object} entry { message, stack, statusCode, path, method, userId }
 */
function record(entry = {}) {
    buffer.push({
        at: new Date().toISOString(),
        message: String(entry.message || 'Unknown error').slice(0, 500),
        stack: entry.stack ? String(entry.stack).slice(0, 2000) : null,
        statusCode: entry.statusCode || 500,
        path: entry.path || null,
        method: entry.method || null,
        userId: entry.userId ? String(entry.userId) : null
    });
    // حافظ على الحدّ الأقصى — احذف الأقدم
    if (buffer.length > MAX_ERRORS) buffer.splice(0, buffer.length - MAX_ERRORS);
}

/**
 * @param {number} limit عدد أحدث الأخطاء المطلوبة
 * @returns {Array} من الأحدث للأقدم
 */
function list(limit = MAX_ERRORS) {
    const n = Math.max(1, Math.min(MAX_ERRORS, Number(limit) || MAX_ERRORS));
    return buffer.slice(-n).reverse();
}

/** عدد الأخطاء المخزّنة حالياً */
function count() {
    return buffer.length;
}

/** تصفية المخزن (يُستخدم في الاختبارات وعند الحاجة) */
function clear() {
    buffer.length = 0;
}

module.exports = { record, list, count, clear, MAX_ERRORS };
