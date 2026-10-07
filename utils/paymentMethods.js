/**
 * 💳 طرق الدفع التي يستلم بها التاجر ثمن الطلب — مصدرٌ واحد للخادم.
 *
 * كان للتاجر حسابٌ بنكيٌّ واحد نصّيّ (اسم البنك + رقم + اسم صاحبه). الآن
 * يختار طريقةً أو أكثر من تطبيقات الدفع المعروفة في السودان، ولكلٍّ رقمه
 * واسمه، والعميل يختار منها عند الدفع. مرآتها في الواجهة:
 * public_html/js/payment-methods.js — القائمة نفسها بالترتيب نفسه.
 *
 * الحقول القديمة (bankName / bankAccountNumber / bankAccountName) تبقى
 * مرآةً لأوّل طريقة: شاشاتٌ ونسخُ تطبيقٍ قديمة تقرؤها، ولا تنكسر.
 */
const { foldDigits } = require('./phoneNormalizer');

const METHODS = {
    bankak:  { label: 'بنكك',     numberLabel: 'رقم الحساب' },
    mycashi: { label: 'ماي كاشي', numberLabel: 'رقم المحفظة' },
    fawry:   { label: 'فوري',     numberLabel: 'رقم الحساب' },
    ocash:   { label: 'أوكاش',    numberLabel: 'رقم الحساب' },
    bravo:   { label: 'برافو',    numberLabel: 'رقم المحفظة' }
};
const METHOD_IDS = Object.keys(METHODS);

const NUMBER_MIN = 4;
const NUMBER_MAX = 30;
const NAME_MIN = 3;
const NAME_MAX = 80;

/** الأرقام العربية ← لاتينية، وحذف المسافات والشرطات التي يُنسخ بها الرقم */
function cleanNumber(v) {
    return foldDigits(v).replace(/[\s\-_.]/g, '').trim();
}

function cleanName(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * يفحص قائمة طرق الدفع كما تصل من النموذج.
 * @param {Array} raw  [{ method, accountNumber, accountName }]
 * @param {{ required?: boolean }} opts  required: طريقة واحدة على الأقل
 * @returns {{ ok: true, methods: Array } | { ok: false, message: string, field: string }}
 */
function cleanPaymentMethods(raw, opts = {}) {
    if (raw == null) raw = [];
    if (!Array.isArray(raw)) return { ok: false, message: 'طرق الدفع غير صالحة', field: 'paymentMethods' };
    if (raw.length > METHOD_IDS.length) return { ok: false, message: 'طرق الدفع أكثر من المتاح', field: 'paymentMethods' };

    const seen = new Set();
    const methods = [];
    for (const item of raw) {
        const method = item && typeof item.method === 'string' ? item.method : '';
        if (!METHODS[method]) return { ok: false, message: 'طريقة دفع غير معروفة', field: 'paymentMethods' };
        if (seen.has(method)) return { ok: false, message: `${METHODS[method].label} مكرّرة`, field: 'paymentMethods' };
        seen.add(method);

        const label = METHODS[method].label;
        const accountNumber = cleanNumber(item.accountNumber);
        if (!accountNumber) {
            return { ok: false, message: `اكتب ${METHODS[method].numberLabel} في ${label}`, field: `paymentMethods.${method}.accountNumber` };
        }
        if (!/^\d+$/.test(accountNumber) || accountNumber.length < NUMBER_MIN || accountNumber.length > NUMBER_MAX) {
            return { ok: false, message: `${METHODS[method].numberLabel} في ${label} أرقامٌ فقط (من ${NUMBER_MIN} إلى ${NUMBER_MAX} رقماً)`, field: `paymentMethods.${method}.accountNumber` };
        }
        const accountName = cleanName(item.accountName);
        if (accountName.length < NAME_MIN) {
            return { ok: false, message: `اكتب اسم صاحب الحساب في ${label} كما هو مسجّل`, field: `paymentMethods.${method}.accountName` };
        }
        if (accountName.length > NAME_MAX) {
            return { ok: false, message: `اسم صاحب الحساب في ${label} طويل جداً`, field: `paymentMethods.${method}.accountName` };
        }
        methods.push({ method, accountNumber, accountName });
    }

    if (opts.required && !methods.length) {
        return { ok: false, message: 'اختر طريقة دفعٍ واحدة على الأقل ليدفع لك العملاء', field: 'paymentMethods' };
    }
    // بترتيب القائمة الثابت — لا بترتيب النقر
    methods.sort((a, b) => METHOD_IDS.indexOf(a.method) - METHOD_IDS.indexOf(b.method));
    return { ok: true, methods };
}

/** الحقول القديمة من أوّل طريقة — لشاشاتٍ ونسخٍ لم تُحدَّث بعد */
function legacyMirror(methods) {
    const first = Array.isArray(methods) && methods[0];
    if (!first) return { bankName: '', bankAccountNumber: '', bankAccountName: '' };
    return {
        bankName: METHODS[first.method] ? METHODS[first.method].label : '',
        bankAccountNumber: first.accountNumber || '',
        bankAccountName: first.accountName || ''
    };
}

/** اسم بنكٍ نصّيّ قديم ← أقرب طريقة (أو null) */
function guessMethod(bankName) {
    const s = String(bankName || '').toLowerCase();
    if (!s) return null;
    if (/بنكك|الخرطوم|bankak/.test(s)) return 'bankak';
    if (/كاشي|cashi/.test(s)) return 'mycashi';
    if (/فوري|fawry|fawri/.test(s)) return 'fawry';
    if (/[اأ]وكاش|o-?cash|ocash|أمدرمان الوطني/.test(s)) return 'ocash';
    if (/برافو|bravo/.test(s)) return 'bravo';
    return null;
}

/**
 * طرق الدفع كما تُعرض للعميل. المتجر الذي سجّل بالطريقة القديمة (حسابٌ
 * واحدٌ نصّيّ) يظهر حسابه كما هو — بأقرب أيقونة إن عُرفت، وإلا «تحويل
 * بنكي» باسم بنكه — لا يختفي حتى يحدّث التاجر بياناته.
 */
function methodsForPlace(place) {
    if (!place) return [];
    const list = Array.isArray(place.paymentMethods) ? place.paymentMethods.filter(m => m && METHODS[m.method] && m.accountNumber) : [];
    if (list.length) {
        return list.map(m => ({ method: m.method, label: METHODS[m.method].label, accountNumber: m.accountNumber, accountName: m.accountName || '' }));
    }
    if (place.bankAccountNumber) {
        const guessed = guessMethod(place.bankName);
        return [{
            method: guessed || 'bank',
            label: guessed ? METHODS[guessed].label : (place.bankName || 'تحويل بنكي'),
            accountNumber: String(place.bankAccountNumber),
            accountName: place.bankAccountName || ''
        }];
    }
    return [];
}

/**
 * الطريقة التي أعلن العميل أنه دفع بها — مقبولةٌ فقط إن كانت من طرق المتجر
 * نفسه (لا يُسجَّل «فوري» لمتجرٍ لا يقبل فوري). وللمتجر ذي الطريقة الواحدة
 * تُفترض هي حين لا يُرسل العميل شيئاً (نسخ التطبيق القديمة).
 * @returns {{ method: string, label: string }}  method '' إن تعذّر الحكم
 */
function resolvePaidVia(place, raw) {
    const list = methodsForPlace(place);
    const hit = list.find(m => m.method === raw);
    const pick = hit || (list.length === 1 ? list[0] : null);
    return pick ? { method: pick.method, label: pick.label } : { method: '', label: '' };
}

/**
 * متى يُقبل إشعار دفع؟ ما دام الدفع لم يُؤكَّد والطلب لم ينتهِ. كان المساران
 * يقبلانه في أيّ حال: إعادة الرفع بعد تأكيد التاجر كانت تُرجع «مؤكَّد» إلى
 * «بانتظار المراجعة»، وكذلك طلبٌ ملغى أو مُسلَّم.
 * الشرط نفسه يُستعمل مرشّحاً ذرّياً في التحديث.
 */
const RECEIPT_OPEN_FILTER = {
    paymentStatus: { $in: ['pending', 'receipt_sent', 'failed'] },
    status: { $nin: ['cancelled', 'delivered'] }
};
function receiptBlockReason(order) {
    if (!order) return 'الطلب غير موجود';
    if (order.paymentStatus === 'confirmed') return 'أكّد المتجر استلام دفعك بالفعل — لا حاجة لإشعارٍ جديد';
    if (order.status === 'cancelled') return 'الطلب ملغى — لا يمكن إرفاق إشعار دفع';
    if (order.status === 'delivered') return 'الطلب مُسلَّم — لا يمكن إرفاق إشعار دفع';
    return null;
}

module.exports = {
    METHODS, METHOD_IDS, NUMBER_MIN, NUMBER_MAX, NAME_MIN, NAME_MAX,
    cleanPaymentMethods, legacyMirror, guessMethod, methodsForPlace,
    resolvePaidVia, RECEIPT_OPEN_FILTER, receiptBlockReason
};
