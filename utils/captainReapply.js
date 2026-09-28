/**
 * 🔁 إعادة تقديم الكابتن المرفوض.
 *
 * كان الكابتن الذي سجّل ككابتنٍ ابتداءً ثم رُفض يُسدّ عليه كل طريق:
 *   • /register-captain بنفس الرقم ← «لديك حساب كابتن بالفعل — مرفوض».
 *   • برقمٍ جديد ← «الرقم الوطني مسجل مسبقاً».
 *   • /login ← «حسابك موقوف» (الرفض يضع isActive=false، وفحصه كان أولاً).
 *   • /captain-application (مسار العميل) ← «لديك طلب انتساب بالفعل».
 * بينما رسالة الرفض نفسها تقول له «يمكنك التقديم من جديد».
 *
 * الآن: المرفوض يعيد التقديم من صفحة التسجيل **بنفس رقمه وكلمة مروره** —
 * كلمة المرور هي ما يثبت أنه صاحب الحساب، فالمسار غير المُصادَق لا يصير
 * باباً لتحويل حساب غيره. إلا من رفضه الأدمن نهائياً.
 */

/** هل هذا حسابُ كابتنٍ مرفوضٍ يُعاد تقديمه؟ (لا يُغني عن فحص كلمة المرور) */
function canReapply(user) {
    if (!user || user.deletedAt) return false;
    const app = user.captainApplication || {};
    const rejected = user.approvalStatus === 'rejected' || app.status === 'rejected';
    return rejected && app.reapplyBlocked !== true;
}

function isFinallyRejected(user) {
    return !!(user && user.captainApplication && user.captainApplication.reapplyBlocked === true);
}

/** رسالة الدخول للكابتن المرفوض — تدلّه على الطريق بدل «تواصل مع الإدارة» وحدها */
function rejectedLoginMessage(user) {
    const reason = String((user && (user.rejectionReason ||
        (user.captainApplication && user.captainApplication.rejectionReason))) || '').trim();
    if (isFinallyRejected(user)) {
        return 'تم رفض طلبك نهائياً. للاستفسار تواصل مع الإدارة.';
    }
    return `تم رفض طلبك${reason ? ` — السبب: ${reason}` : ''}. `
        + 'يمكنك تصحيح ذلك وإعادة التقديم من صفحة تسجيل الكباتن بنفس رقمك وكلمة مرورك.';
}

/**
 * يُعيد الطلب إلى المراجعة. يحفظ سبب الرفض السابق وعدد المرّات ليرى المراجِع
 * أن هذه محاولةٌ ثانية، وماذا كان ينقصها.
 * @param {object} user  مستند Mongoose (يُعدَّل في مكانه، والحفظ على المستدعي)
 * @param {object} fields حقول ملفّ الانتساب الجديدة
 */
function reopenApplication(user, fields) {
    const prev = user.captainApplication || {};
    const previousReason = String(prev.rejectionReason || user.rejectionReason || '').trim();
    user.captainApplication = {
        ...fields,
        status: 'pending',
        rejectionReason: '',
        reapplyBlocked: false,
        reapplyCount: (Number(prev.reapplyCount) || 0) + 1,
        previousRejectionReason: previousReason,
        submittedAt: new Date()
    };
    user.rejectionReason = '';
    return user;
}

module.exports = { canReapply, isFinallyRejected, rejectedLoginMessage, reopenApplication };
