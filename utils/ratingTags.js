/**
 * 🏷️ وسوم التقييم — المصدر الوحيد للحقيقة.
 *
 * لماذا وسومٌ لا نصٌّ حر: التعليق المكتوب يُقرأ مرّة ثم يموت في قاعدة البيانات.
 * السؤال الذي تحتاج الإدارة إجابته ("ما أكثر شكوى تتكرّر على الكباتن؟"،
 * "أيّ كابتنٍ يُشاد بتعامله؟") تجميعيٌّ بطبعه، ولا يُجاب من نصٍّ حر إلا بقراءة
 * يدوية لكل تقييم. الوسم رمزٌ ثابت يُعدّ ويُرتَّب ويُقارَن عبر الزمن.
 *
 * الرمز إنجليزي والنص عربي: الرمز يُخزَّن ويُجمَّع، والنص يُعرَض وحده. تغيير
 * صياغة النص لاحقاً لا يكسر أي إحصاء سابق — وهذا بالضبط ما يفشل فيه تخزين
 * النص العربي مباشرةً كمفتاح.
 *
 * الوسوم مقسومة بالنجوم: عند 4-5 تُعرض وسوم الثناء، وعند 1-3 تُعرض وسوم
 * الشكوى. عرض الاثنين معاً يُنتج تقييماتٍ متناقضة ("سريع" + "تأخّر").
 */

// ⭐ 4-5 نجوم
const POSITIVE_TAGS = [
    { code: 'fast',        label: 'سريع' },
    { code: 'polite',      label: 'مهذّب' },
    { code: 'careful',     label: 'حافظ على الطلب' },
    { code: 'clean',       label: 'مظهر مرتّب' },
    { code: 'good_comms',  label: 'تواصل ممتاز' },
    { code: 'found_place', label: 'وصل بلا عناء' }
];

// ⚠️ 1-3 نجوم
const NEGATIVE_TAGS = [
    { code: 'late',          label: 'تأخّر كثيراً' },
    { code: 'rude',          label: 'تعامل غير لائق' },
    { code: 'damaged',       label: 'الطلب وصل متضرّراً' },
    { code: 'wrong_items',   label: 'الطلب ناقص أو خاطئ' },
    { code: 'no_answer',     label: 'لم يردّ على الاتصال' },
    { code: 'asked_extra',   label: 'طلب مبلغاً إضافياً' }
];

const ALL_TAGS = [...POSITIVE_TAGS, ...NEGATIVE_TAGS];
const TAG_CODES = ALL_TAGS.map(t => t.code);
const TAG_LABELS = Object.fromEntries(ALL_TAGS.map(t => [t.code, t.label]));

// 🔒 أقصى عدد وسوم في تقييمٍ واحد. بلا سقف يرسل عميلٌ (أو نصٌّ آلي) مئة وسم
// فيتضخّم المستند ويصير الإحصاء بلا معنى — ستّة تكفي لتقييمِ رحلةٍ واحدة.
const MAX_TAGS_PER_RATING = 4;

/**
 * يُنقّي وسوماً واردة من العميل: يقبل الرموز المعروفة وحدها، يحذف التكرار،
 * ويقصّ عند السقف. يُرجع مصفوفة دائماً — لا null ولا undefined — فمن يستدعيه
 * لا يحتاج فحصاً إضافياً.
 *
 * ملاحظة: لا نرفض الطلب كلّه عند وسمٍ مجهول. التقييم نفسه (النجوم) هو القيمة،
 * ووسمٌ من نسخةِ تطبيقٍ أحدث لا يصحّ أن يُسقط تقييماً صحيحاً.
 */
function sanitizeTags(input) {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of input) {
        if (typeof raw !== 'string') continue;
        const code = raw.trim();
        if (!TAG_CODES.includes(code) || seen.has(code)) continue;
        seen.add(code);
        out.push(code);
        if (out.length >= MAX_TAGS_PER_RATING) break;
    }
    return out;
}

module.exports = {
    POSITIVE_TAGS,
    NEGATIVE_TAGS,
    ALL_TAGS,
    TAG_CODES,
    TAG_LABELS,
    MAX_TAGS_PER_RATING,
    sanitizeTags
};
