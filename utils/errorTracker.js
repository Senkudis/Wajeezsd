/**
 * تتبّع أخطاء خفيف في الذاكرة (بلا خدمة خارجية).
 *
 * مخزن دائري يحتفظ بآخر N خطأ مع سياقها (المسار، الطريقة، المستخدم، الأثر).
 * يُغذّيه معالج الأخطاء المركزي والمعالجات العامة، ويُعرض للمسؤول الرئيسي عبر
 * GET /api/admin/errors — فتظهر أخطاء الإنتاج بدل أن تمرّ صامتة حتى يشتكي مستخدم.
 *
 * الذاكرة طبقة أولى سريعة، ومونجو طبقة دائمة: الذاكرة وحدها كانت تُصفَّر مع أول
 * restart — وهو غالباً أوّل ما يُفعل بحثاً عن حلّ، فيُمحى الدليل في اللحظة التي
 * يُحتاج فيها. الكتابة في القاعدة "أطلق وانسَ": تعطّلُها لا يُسقط طلباً.
 */

const MAX_ERRORS = 100;
const buffer = [];

const TTL_DAYS = 30;

/** بصمة تجميع: نفس الرسالة على نفس المسار خطأ واحد يتكرّر لا أخطاء كثيرة */
function fingerprintOf(entry) {
    const msg = String(entry.message || 'Unknown error')
        .replace(/[0-9a-f]{24}/gi, ':id')       // معرّفات مونجو
        .replace(/\d+/g, 'N')                    // أرقام متغيّرة
        .slice(0, 200);
    return `${entry.method || '-'} ${entry.path || '-'} ${msg}`;
}

/**
 * يسجّل خطأً في المخزن الدائري وفي القاعدة.
 * @param {object} entry { message, stack, statusCode, path, method, userId }
 */
function record(entry = {}) {
    const row = {
        at: new Date().toISOString(),
        message: String(entry.message || 'Unknown error').slice(0, 500),
        stack: entry.stack ? String(entry.stack).slice(0, 2000) : null,
        statusCode: entry.statusCode || 500,
        path: entry.path || null,
        method: entry.method || null,
        userId: entry.userId ? String(entry.userId) : null
    };
    buffer.push(row);
    // حافظ على الحدّ الأقصى — احذف الأقدم
    if (buffer.length > MAX_ERRORS) buffer.splice(0, buffer.length - MAX_ERRORS);

    persist(row).catch(() => { /* تسجيل الخطأ لا يجوز أن يصنع خطأً */ });
}

async function persist(row) {
    const ErrorLog = require('../models/ErrorLog');
    const now = new Date();
    await ErrorLog.updateOne(
        { fingerprint: fingerprintOf(row) },
        {
            $inc: { count: 1 },
            $set: {
                message: row.message, stack: row.stack, statusCode: row.statusCode,
                path: row.path, method: row.method, lastUserId: row.userId,
                lastAt: now,
                // يُجدَّد مع كل تكرار: خطأ لا يزال يحدث لا ينبغي أن يُحذف
                expiresAt: new Date(now.getTime() + TTL_DAYS * 86400000)
            },
            $setOnInsert: { firstAt: now }
        },
        { upsert: true }
    );
}

/**
 * أحدث الأخطاء من القاعدة — مجمَّعة بالبصمة ومرتّبة بالأحدث.
 * ترجع للذاكرة إن تعذّرت القاعدة، فالشاشة لا تفرغ عند عطلٍ في القاعدة نفسها.
 * @param {number} limit
 */
async function listPersisted(limit = 50) {
    const n = Math.max(1, Math.min(200, Number(limit) || 50));
    try {
        const ErrorLog = require('../models/ErrorLog');
        const rows = await ErrorLog.find({}).sort({ lastAt: -1 }).limit(n).lean();
        return {
            source: 'db',
            errors: rows.map(r => ({
                message: r.message, stack: r.stack, statusCode: r.statusCode,
                path: r.path, method: r.method, userId: r.lastUserId,
                count: r.count, firstAt: r.firstAt, at: r.lastAt
            }))
        };
    } catch (_) {
        return { source: 'memory', errors: list(n) };
    }
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

module.exports = { record, list, listPersisted, fingerprintOf, count, clear, MAX_ERRORS };
