/**
 * 🔔 متى يستحقّ الخطأ أن يوقظ أحداً.
 *
 * كان `ErrorLog` يخزّن وشاشةُ الإدارة تعرض — ولا شيء **يُنبِّه**. فالعطل
 * يُكتشف حين يشتكي مستخدم، وهو أبطأ طريقةٍ ممكنة وأغلاها.
 *
 * والحلّ ليس تنبيهاً عند كل خطأ: خطأٌ واحد يتكرّر ألف مرّة في الدقيقة
 * يُغرق الإدارة بألف إشعار، فتُطفَأ الإشعارات كلها — فيصير التنبيه أسوأ
 * من غيابه. فالقرار هنا مبنيّ على شيئين:
 *
 *   ١. **الجِدّة**: بصمةٌ لم تُرَ قبلاً (count === 1). هذه إشارة انحدار:
 *      شيءٌ كان يعمل توقّف الآن.
 *   ٢. **القفزة**: بصمةٌ معروفة تعبر عتبة (10، 50، 200، 1000). الخطأ
 *      الذي يتكرّر عشر مرّات ليس هو الذي وقع مرّة.
 *
 * وفوق الاثنين خانقان: بصمةٌ واحدة لا تُنبّه أكثر من مرّة كل نصف ساعة،
 * ومجموع التنبيهات لا يتجاوز عشرة في الساعة. الخانق الثاني هو ما يمنع
 * عاصفةً من أخطاءٍ مختلفة (انقطاع القاعدة مثلاً) من إغراق الإدارة.
 *
 * ⚠️ الحالة في ذاكرة العملية. بأكثر من نسخة تعمل معاً قد يتكرّر التنبيه
 *    بعدد النسخ — وهذا مقبول: تنبيهان أفضل من صمت. أما العدّاد الذي
 *    تُقاس عليه العتبات فهو في القاعدة، مشترَكٌ بينها كلها.
 */
'use strict';

const logger = require('./logger');

const PER_FINGERPRINT_COOLDOWN_MS = 30 * 60 * 1000;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_MAX_PER_WINDOW = 10;
const SPIKE_THRESHOLDS = [10, 50, 200, 1000];

/* ─── القرار (نقيّ — مفحوصٌ في tests/errorAlerts.test.js) ────────── */

/**
 * @param {object} p
 * @param {string} p.fingerprint بصمة التجميع
 * @param {number} p.count عدد مرّات هذه البصمة في القاعدة (مشترَك بين النسخ)
 * @param {number} p.now الآن بالملّي
 * @param {object} p.state حالة قابلة للتعديل: { lastByFp: Map, recent: number[] }
 * @returns {{alert: boolean, reason: string}}
 */
function decide({ fingerprint, count, now, state }) {
    const isNew = count === 1;
    const isSpike = SPIKE_THRESHOLDS.includes(count);
    if (!isNew && !isSpike) return { alert: false, reason: 'not_notable' };

    const last = state.lastByFp.get(fingerprint);
    if (last != null && now - last < PER_FINGERPRINT_COOLDOWN_MS) {
        return { alert: false, reason: 'fingerprint_cooldown' };
    }

    // النافذة المتحرّكة: نُسقط ما خرج منها قبل العدّ
    state.recent = state.recent.filter(t => now - t < GLOBAL_WINDOW_MS);
    if (state.recent.length >= GLOBAL_MAX_PER_WINDOW) {
        return { alert: false, reason: 'global_rate_limit' };
    }

    state.lastByFp.set(fingerprint, now);
    state.recent.push(now);
    return { alert: true, reason: isNew ? 'new_error' : 'spike_' + count };
}

/** نصٌّ يقول للأدمن ما وقع وأين، بلا أثر المكدّس — الشاشة تعرضه كاملاً. */
function buildMessage(row, count, reason) {
    const where = [row.method, row.path].filter(Boolean).join(' ') || '(غير معروف)';
    const what = String(row.message || 'خطأ غير معروف').slice(0, 140);
    const head = reason === 'new_error'
        ? 'خطأ جديد في الخادم'
        : `خطأ يتكرّر — ${count} مرّة`;
    return { title: head, message: `${where}\n${what}` };
}

/* ─── التنفيذ ───────────────────────────────────────────────────── */

const state = { lastByFp: new Map(), recent: [] };
let app = null;

/** يُستدعى مرّة في index.js — notifyAdmins يحتاج app للبثّ عبر socket. */
function setApp(expressApp) { app = expressApp; }

/**
 * يُنادى بعد كل تسجيلٍ ناجح في القاعدة. لا يرمي أبداً: تنبيهٌ فاشل لا
 * يجوز أن يصير خطأً يُسجَّل فيولّد تنبيهاً — حلقةٌ لا تنتهي.
 */
async function consider(row, { fingerprint, count } = {}) {
    try {
        if (process.env.NODE_ENV === 'test') return { alert: false, reason: 'test_env' };
        if (!fingerprint || !Number.isFinite(count)) return { alert: false, reason: 'no_count' };

        const verdict = decide({ fingerprint, count, now: Date.now(), state });
        if (!verdict.alert) return verdict;

        const { title, message } = buildMessage(row, count, verdict.reason);
        logger.warn({ fingerprint, count, reason: verdict.reason }, 'error alert → admins');

        if (!app) {
            // بلا app لا socket ولا push. نسجّل بدل أن نصمت: الصمت هنا
            // يبدو كأن التنبيه أُرسل.
            logger.error({ fingerprint }, 'errorAlerts: setApp لم يُستدعَ — لا تنبيه');
            return { alert: false, reason: 'no_app' };
        }

        const { notifyAdmins } = require('./notificationHelper');
        await notifyAdmins(app, { title, message, type: 'admin_alert' });
        return verdict;
    } catch (err) {
        logger.error({ err: err.message }, 'errorAlerts.consider failed');
        return { alert: false, reason: 'alert_failed' };
    }
}

/** للاختبارات: يُعيد الحالة إلى الصفر. */
function _reset() { state.lastByFp.clear(); state.recent.length = 0; app = null; }

module.exports = {
    decide, buildMessage, consider, setApp, _reset,
    PER_FINGERPRINT_COOLDOWN_MS, GLOBAL_WINDOW_MS, GLOBAL_MAX_PER_WINDOW, SPIKE_THRESHOLDS
};
