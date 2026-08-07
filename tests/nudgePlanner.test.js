/**
 * قاعدة اختيار عتبة التنبيه.
 *
 * الخطأ الذي يحرسه هذا الملف كان حياً في الإنتاج: طلبٌ عمره ساعتان يُطلق
 * عتبة الـ١٢٠ ثم عتبة الـ٣٠ في الدورة نفسها، فتصل رسالتان متناقضتان.
 */
const { planNudge } = require('../utils/nudgePlanner');

// عتبات العميل: تطابق DELAY_NOTICES في scheduler.js
const CLIENT = [
    { key: 30, afterMin: 30 },
    { key: 120, afterMin: 120 }
];

// عتبات الكابتن لمرحلة التسليم: تطابق CAPTAIN_NUDGES
const CAPTAIN_DELIVER = [
    { key: 'deliver_30', afterMin: 30 },
    { key: 'deliver_75', afterMin: 75 }
];

describe('planNudge', () => {
    it('لا شيء قبل بلوغ أدنى عتبة', () => {
        expect(planNudge(CLIENT, 10)).toBeNull();
        expect(planNudge(CLIENT, 29)).toBeNull();
    });

    it('يُطلق العتبة الأدنى عند بلوغها بالضبط', () => {
        const p = planNudge(CLIENT, 30);
        expect(p.fire.key).toBe(30);
        expect(p.consume).toEqual([]);
    });

    it('🛡️ عمرٌ يتجاوز الأعلى يُطلق رسالة واحدة لا رسالتين', () => {
        const p = planNudge(CLIENT, 130);
        expect(p.fire.key).toBe(120);
        // العتبة الأدنى تُستهلك، فلا تنطلق بأثر رجعي
        expect(p.consume).toEqual([30]);
    });

    it('بعد استهلاك العتبتين لا ينطلق شيء', () => {
        expect(planNudge(CLIENT, 200, [30, 120])).toBeNull();
    });

    it('من أُرسلت له الأدنى يترقّى للأعلى لا يُعيدها', () => {
        const p = planNudge(CLIENT, 130, [30]);
        expect(p.fire.key).toBe(120);
    });

    it('الأدنى وحدها مُرسلة والعمر ما زال دونها الأعلى ⇒ لا تكرار', () => {
        expect(planNudge(CLIENT, 50, [30])).toBeNull();
    });

    it('يعمل مع مفاتيح نصّية (عتبات الكابتن)', () => {
        const p = planNudge(CAPTAIN_DELIVER, 80);
        expect(p.fire.key).toBe('deliver_75');
        expect(p.consume).toEqual(['deliver_30']);
    });

    it('مدخلات فارغة أو غير صالحة لا تُسقط المجدول', () => {
        expect(planNudge([], 100)).toBeNull();
        expect(planNudge(null, 100)).toBeNull();
        expect(planNudge(undefined, 100)).toBeNull();
    });

    it('ترتيب العتبات في المصفوفة لا يغيّر النتيجة', () => {
        const reversed = [...CLIENT].reverse();
        expect(planNudge(reversed, 130).fire.key).toBe(120);
    });
});
