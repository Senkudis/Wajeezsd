/**
 * 🗄️ أرشيف وثائق الكابتن وبياناته — لا يضيع ما استُبدل.
 *
 * الثغرة: الكابتن يفتعل مشكلة، فنحتاج صورة هويته أو مركبته كما كانت، فيكون
 * قد «حدّث» وثائقه من صفحة حسابه — والتحديث يكتب فوق الرابط القديم (وصورة
 * البروفايل كان ملفّها يُحذف من القرص). لا أثر لما كان.
 *
 * الحلّ ليس منع التحديث — الرخصة تتجدّد والمركبة تتغيّر — بل ألّا يُمحى
 * شيء: قبل كل استبدالٍ تُضاف القيمة السابقة إلى User.documentsHistory،
 * والملفّ نفسه يبقى على القرص.
 */

/** أقصى عددٍ يُحتفظ به — يكفي سنوات من التحديثات، ولا يتضخّم المستند */
const MAX_ENTRIES = 200;

/**
 * القيم التي ستُستبدل فعلاً.
 * @param {object} before   القيم الحالية: { idImage: '/api/files/…', name: '…' }
 * @param {object} after    القيم الجديدة بالمفاتيح نفسها
 * @param {string} source   captain_upload | profile_photo | reapply | admin
 * @param {Date}   [now]
 * @returns {Array<{field,value,replacedAt,source}>}
 */
function historyEntries(before, after, source, now = new Date()) {
    const b = before || {};
    const out = [];
    for (const [field, next] of Object.entries(after || {})) {
        const prev = b[field];
        if (prev == null || prev === '') continue;           // لا شيء يُفقد
        if (String(prev) === String(next == null ? '' : next)) continue;  // لم يتغيّر
        out.push({ field, value: String(prev), replacedAt: now, source });
    }
    return out;
}

/**
 * يضيف إلى تحديث mongoose دفعةَ الأرشيف — بحدٍّ أقصى للحجم.
 * @param {object} update  { $set: … } أو كائن حقولٍ مباشرة
 * @param {Array}  entries من historyEntries
 */
function withHistory(update, entries) {
    const u = (update && (update.$set || update.$push || update.$unset)) ? { ...update } : { $set: { ...(update || {}) } };
    if (entries && entries.length) {
        u.$push = { ...(u.$push || {}), documentsHistory: { $each: entries, $slice: -MAX_ENTRIES } };
    }
    // $set فارغ يرفضه MongoDB في بعض الإصدارات — لا نرسله
    if (u.$set && Object.keys(u.$set).length === 0) delete u.$set;
    return u;
}

/** وثائق المستخدم كائناً عادياً (مستند mongoose أو lean) */
function plainDocs(user) {
    const d = user && user.documents;
    if (!d) return {};
    return typeof d.toObject === 'function' ? d.toObject() : { ...d };
}

module.exports = { historyEntries, withHistory, plainDocs, MAX_ENTRIES };
