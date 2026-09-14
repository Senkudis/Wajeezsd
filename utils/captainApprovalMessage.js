/**
 * 📩 رسالة قبول الكابتن — نصٌّ واحد يُرسَل واتساب ويُنسَخ من اللوحة.
 *
 * لماذا واتساب لا إشعار التطبيق وحده: الكابتن المقبول **لم يدخل التطبيق
 * بعد** — سجّل ثم انتظر. فإشعارٌ داخل التطبيق قد لا يراه أحد. ورقم واتسابه
 * مطلوبٌ في نموذج الانتساب أصلاً، فهو القناة التي تصله فعلاً.
 *
 * ⚠️ **لا كلمة مرور في الرسالة، ولا يمكن أن تكون.** كلمة المرور مخزَّنة
 *    مُعمّاة (bcrypt) ولا تُقرأ حتى من قاعدة البيانات — وهذا صحيحٌ أمنياً.
 *    والكابتن هو من اختارها عند التسجيل. فالرسالة تذكّره بمعرّف الدخول
 *    وتدلّه على «نسيت كلمة المرور» إن نسيها. أي رسالة تَعِد بإرسال كلمة
 *    المرور تَعِد بما لا يُنفَّذ.
 *
 * ولا رموز تعبيرية: التنسيق بنجمتَي واتساب للعريض وفواصل نصّية.
 */

/** يُظهر الرقم بصيغة محلية مقروءة (09xxxxxxxx) بدل 2499xxxxxxxx. */
function localPhone(phone) {
    const p = String(phone || '').replace(/\D/g, '');
    if (!p) return '';
    if (p.startsWith('249')) return '0' + p.slice(3);
    if (p.startsWith('0')) return p;
    return p;
}

/**
 * @param {object} o
 * @param {string} o.name          اسم الكابتن كما سجّله
 * @param {string} [o.phone]       هاتف الحساب — معرّف الدخول الأساسي
 * @param {string} [o.email]       بريد الحساب — معرّف بديل
 * @param {string} [o.appLink]     رابط تحميل التطبيق (أندرويد)
 * @param {string} [o.appLinkIos]  رابط App Store — الرسالة تصل واتساب ولا
 *                                 نعرف جهاز الكابتن، فنعطي الرابطين معاً
 * @param {string} [o.supportPhone] رقم الدعم
 * @returns {string} نصّ الرسالة جاهزاً للإرسال
 */
function buildCaptainApprovalMessage(o) {
    const opts = o || {};
    const name = String(opts.name || '').trim() || 'الكابتن';
    const phone = localPhone(opts.phone);
    const email = String(opts.email || '').trim();
    const appLink = String(opts.appLink || '').trim();
    const appLinkIos = String(opts.appLinkIos || '').trim();
    const support = localPhone(opts.supportPhone);

    // معرّف الدخول: الهاتف أولاً لأنه ما يحفظه الكابتن، والبريد بديلاً
    const loginLines = [];
    if (phone) loginLines.push(`• رقم الهاتف: ${phone}`);
    if (email) loginLines.push(`• أو البريد: ${email}`);
    if (!loginLines.length) loginLines.push('• استخدم رقم هاتفك الذي سجّلت به');

    const lines = [
        `*مبروك ${name} — تم قبولك ككابتن في وجيز*`,
        '',
        'راجعنا طلبك ووثائقك، وحسابك صار جاهزاً للعمل.',
        '',
        '*بيانات الدخول*',
        ...loginLines,
        '• كلمة المرور: هي التي اخترتها عند التسجيل',
        '',
        'نسيت كلمة المرور؟ اضغط "نسيت كلمة المرور" في شاشة الدخول ويصلك كود على هاتفك.',
        '',
        '*كيف تبدأ*',
        '1. افتح التطبيق وسجّل الدخول من "دخول الكابتن".',
        '2. فعّل زر "متصل" في الأعلى — لن تصلك طلبات وأنت غير متصل.',
        '3. اسمح للتطبيق بالموقع والإشعارات، وإلا لن تصلك الطلبات الجديدة.',
        '4. عند وصول طلب: اقبله، استلم من المتجر، ثم سلّم للعميل واضغط "تم التسليم".',
        '',
        '*تذكير سريع*',
        '• التوريد في نهاية كل يوم عمل حسب الاتفاق.',
        '• حافظ على بطارية هاتفك ورصيد الإنترنت — تأخّر الطلب يؤثر على تقييمك.',
        '• الإلغاء بعد القبول يعرّض الحساب للتجميد إلا لظرف طارئ وبعد الرجوع للإدارة.'
    ];

    // 📲 الرابطان معاً: الرسالة تصل واتساب ولا نعرف جهازه، ورابطٌ لمتجرٍ
    //    لا يملكه طريقٌ مسدود في أول خطوة يطلبها منه.
    if (appLink || appLinkIos) {
        lines.push('', '*تحميل التطبيق*');
        if (appLink) lines.push(`أندرويد: ${appLink}`);
        if (appLinkIos) lines.push(`آيفون: ${appLinkIos}`);
    }
    if (support) {
        lines.push('', `لأي استفسار: ${support}`);
    }

    lines.push('', 'أهلاً بك في الفريق.');

    return lines.join('\n');
}

/**
 * رسالة رفض الطلب.
 *
 * الرفض اليوم يُسجَّل في القاعدة ولا يبلَّغ به أحد — فينتظر المتقدّم أسابيع
 * ولا يعرف. والسبب مكتوبٌ أصلاً عند الرفض، فإخفاؤه عنه بلا فائدة.
 *
 * ونُبقي الباب مفتوحاً صراحةً: أغلب أسباب الرفض قابلة للإصلاح (صورة غير
 * واضحة، وثيقة ناقصة). «مرفوض» بلا طريقٍ للعودة تخسر كابتناً كان يصلح.
 *
 * @param {object} o {name, reason, supportPhone}
 */
function buildCaptainRejectionMessage(o) {
    const opts = o || {};
    const name = String(opts.name || '').trim() || 'الكابتن';
    const reason = String(opts.reason || '').trim();
    const support = localPhone(opts.supportPhone);

    const lines = [
        `*${name}، بخصوص طلب الانتساب لوجيز*`,
        '',
        'شكراً لوقتك. راجعنا طلبك، ولم نتمكّن من قبوله في الوقت الحالي.'
    ];

    if (reason) {
        lines.push('', '*السبب*', reason);
    }

    lines.push(
        '',
        '*يمكنك التقديم من جديد*',
        'إن كان السبب وثيقةً ناقصة أو صورة غير واضحة، صحّحها وقدّم مرة أخرى من التطبيق — طلبك سيُراجَع من جديد.'
    );

    if (support) {
        lines.push('', `للاستفسار أو الاعتراض: ${support}`);
    }

    lines.push('', 'نقدّر اهتمامك بالعمل معنا.');

    return lines.join('\n');
}

module.exports = { buildCaptainApprovalMessage, buildCaptainRejectionMessage, localPhone };
