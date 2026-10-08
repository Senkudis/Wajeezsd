/**
 * 🪪 تحديث وثائق الكابتن المعتمد بطلبٍ تراجعه الإدارة.
 *
 * كان الكابتن يستبدل هويته وسيلفيه ورخصته وصورة مركبته متى شاء من صفحة
 * حسابه — حتى بعد مشكلةٍ نحتاج فيها بياناته. الأرشيف (docHistory.js) يحفظ
 * ما استُبدل، وهذا يمنع الاستبدال نفسه بلا قرار:
 *
 *   • الكابتن المعتمد: رفعُ وثيقةٍ من الأربع = طلبٌ معلّق. الوثيقة المقبولة
 *     تبقى سارية حتى توافق الإدارة. رفعٌ جديد للوثيقة نفسها قبل القرار يحلّ
 *     محلّ الطلب المعلّق (يصحّح صورةً سيئة) ولا يتراكم.
 *   • صورة الملف الشخصي: تتغيّر مباشرة — ليست وثيقة إثبات.
 *   • من لم يُعتمد بعد: يرفع مباشرة — ملفّه كلّه قيد المراجعة أصلاً.
 */

const REVIEWED_FIELDS = ['idImage', 'selfieImage', 'driverLicense', 'vehiclePhoto'];

/** هل يمرّ تغيير هذا الحقل بالمراجعة لهذا المستخدم؟ */
function needsReview(user, field) {
    return !!user && user.role === 'captain' && user.approvalStatus === 'approved'
        && REVIEWED_FIELDS.includes(field);
}

/**
 * يقسم تحديثات الرفع: ما يُطبَّق الآن، وما يصير طلباً.
 * @param {object} user
 * @param {object} updates { 'documents.idImage': url, … }
 * @returns {{ direct: object, requests: Array<{field,value}> }}
 */
function splitUpdates(user, updates) {
    const direct = {};
    const requests = [];
    for (const [key, value] of Object.entries(updates || {})) {
        const field = key.replace(/^documents\./, '');
        if (needsReview(user, field)) requests.push({ field, value });
        else direct[key] = value;
    }
    return { direct, requests };
}

/**
 * يسجّل الطلبات: يُسقط المعلّق لنفس الحقل ثم يضيف الجديد — طلبٌ معلّقٌ واحد
 * لكل وثيقة. (عمليتان: MongoDB لا يقبل $pull و $push على المصفوفة نفسها معاً.)
 */
async function submitRequests(User, userId, requests, now = new Date()) {
    if (!requests.length) return;
    await User.updateOne(
        { _id: userId },
        { $pull: { docChangeRequests: { status: 'pending', field: { $in: requests.map(r => r.field) } } } }
    );
    await User.updateOne(
        { _id: userId },
        { $push: { docChangeRequests: { $each: requests.map(r => ({ ...r, status: 'pending', requestedAt: now })), $slice: -100 } } }
    );
}

/** حالة كل وثيقة للكابتن: المعلّق، وآخر رفضٍ بعد آخر قبول (بسببه) */
function requestStatusByField(list) {
    const out = {};
    for (const r of (list || []).slice().sort((a, b) => new Date(a.requestedAt) - new Date(b.requestedAt))) {
        if (!REVIEWED_FIELDS.includes(r.field)) continue;
        if (r.status === 'pending') out[r.field] = { status: 'pending', requestedAt: r.requestedAt };
        else if (r.status === 'rejected') out[r.field] = { status: 'rejected', reason: r.reason || '', reviewedAt: r.reviewedAt };
        else out[r.field] = { status: 'approved', reviewedAt: r.reviewedAt };
    }
    return out;
}

module.exports = { REVIEWED_FIELDS, needsReview, splitUpdates, submitRequests, requestStatusByField };
