/**
 * 🏷️ ملخّص وسوم التقييم للكابتن.
 *
 * الوسوم كانت تُخزَّن منذ البداية (models/Rating.tags) ولها فهرس مخصّص
 * للتجميع — ولم يقرأها أحد. النجوم وحدها تعطي الكابتن رقماً لا يعرف كيف
 * يحرّكه؛ الوسم يقول "لماذا".
 *
 * ما يُختبر هنا هو منطق العرض الخالص (summarizeTags) لا التجميع في القاعدة:
 * الترتيب بالتكرار، وحذف الأصفار، وثبات الترتيب عند التعادل.
 */
import { describe, it, expect } from 'vitest';

const {
    summarizeTags,
    POSITIVE_TAGS,
    NEGATIVE_TAGS,
    TAG_LABELS,
    TAG_CODES
} = require('../utils/ratingTags');

const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('summarizeTags — تحويل العدّادات إلى قائمة معروضة', () => {

    it('يرتّب بالتكرار تنازلياً — الأكثر تكراراً أوّلاً', () => {
        const out = summarizeTags(NEGATIVE_TAGS, { late: 2, rude: 7, no_answer: 5 });
        expect(out.map(t => t.code)).toEqual(['rude', 'no_answer', 'late']);
    });

    it('يحذف الوسوم بلا أي ذكر — الصفر ضجيج يُخفي ما يهمّ', () => {
        const out = summarizeTags(NEGATIVE_TAGS, { late: 3 });
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual({ code: 'late', label: 'تأخّر كثيراً', count: 3 });
    });

    it('يُرجع قائمة فارغة حين لا وسم مذكوراً', () => {
        expect(summarizeTags(POSITIVE_TAGS, {})).toEqual([]);
    });

    it('يحتمل counts غير معرّفة بلا رمي', () => {
        expect(summarizeTags(POSITIVE_TAGS, undefined)).toEqual([]);
        expect(summarizeTags(undefined, { fast: 1 })).toEqual([]);
    });

    it('يُرفق النص العربي المقابل لكل رمز', () => {
        const out = summarizeTags(POSITIVE_TAGS, { fast: 1, polite: 1 });
        for (const t of out) expect(t.label).toBe(TAG_LABELS[t.code]);
        expect(out.every(t => t.label !== t.code)).toBe(true);
    });

    it('ترتيب ثابت عند تعادل التكرار — لا يتبدّل بين طلبين', () => {
        const counts = { fast: 4, polite: 4, clean: 4 };
        const a = summarizeTags(POSITIVE_TAGS, counts).map(t => t.code);
        const b = summarizeTags(POSITIVE_TAGS, counts).map(t => t.code);
        expect(a).toEqual(b);
        expect(a).toEqual([...a].sort());
    });

    it('يتجاهل رموزاً لا تنتمي للمجموعة المطلوبة', () => {
        // عدّاد وسم شكوى مُمرَّر مع مجموعة الثناء لا يتسرّب إلى النتيجة
        const out = summarizeTags(POSITIVE_TAGS, { late: 9, fast: 1 });
        expect(out.map(t => t.code)).toEqual(['fast']);
    });

    it('كل رمز في المجموعتين له نص عربي — لا يظهر رمز خام للكابتن', () => {
        const counts = Object.fromEntries(TAG_CODES.map(c => [c, 1]));
        const out = [
            ...summarizeTags(POSITIVE_TAGS, counts),
            ...summarizeTags(NEGATIVE_TAGS, counts)
        ];
        expect(out).toHaveLength(TAG_CODES.length);
        expect(out.every(t => typeof t.label === 'string' && t.label.length > 0)).toBe(true);
    });
});

describe('مسار /api/captain/rating-summary', () => {
    const src = read('routes/captain.js');

    // جسم المعالِج وحده — القصّ حتى نهاية الملف يبتلع مسارات لاحقة
    // فتصير الفحوص السلبية بلا معنى.
    const start = src.indexOf("'/rating-summary'");
    const block = src.slice(start, src.indexOf('router.', start + 20));

    it('محمي بـ protect و captainOnly — الملخّص يخصّ صاحبه وحده', () => {
        expect(src).toMatch(/router\.get\(\s*'\/rating-summary',\s*protect,\s*captainOnly/);
    });

    it('يُجمّع على معرّف الطالب نفسه لا على معرّف من الطلب', () => {
        expect(block).toContain('targetId: req.user._id');
        expect(block).not.toContain('req.params');
        expect(block).not.toContain('req.query.captainId');
    });

    it('يستثني التقييمات المُخفاة — ما أخفته الإدارة لا يعود من باب آخر', () => {
        expect(block).toContain('isHidden: false');
    });

    it('يحدّ نافذة الأيام — لا مسح كامل للسجل من معامل عام', () => {
        expect(block).toMatch(/Math\.min\(Math\.max\(parseInt\(req\.query\.days/);
    });

    it('معرَّف قبل مسار /:id حتى لا يُلتقط كمعرّف', () => {
        expect(src.indexOf("'/rating-summary'")).toBeLessThan(src.indexOf("'/:id/location'"));
    });
});
