/**
 * ⭐ إخفاء تقييم يجب أن يزيل أثره من نجوم المتجر.
 *
 * العطل: الإخفاء كان يضع isHidden: true ولا شيء غير ذلك، والمتوسط لا يُحسب
 * إلا داخل مسار **إضافة** تقييم جديد. فتقييمٌ مسيء يُبلَّغ عنه ويُخفيه الأدمن
 * يختفي من قائمة الآراء ويبقى أثره في المتوسط إلى الأبد — حتى يصادف أن
 * يُقيّم أحدهم المتجر من جديد فيُعاد الحساب عرضاً.
 *
 * ويمسّ هذا ما نَعِد به آبل في الإرشاد 1.2: أن المحتوى المُبلَّغ عنه يُزال.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const codeOnly = (src) => src.split('\n')
    .filter(l => { const t = l.trim(); return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*'); })
    .join('\n');

describe('دالة إعادة الحساب', () => {
    const src = read('utils/recalcPlaceRating.js');

    it('تحسب من الظاهر وحده', () => {
        expect(src).toContain("isHidden: false");
        expect(src).toContain("targetType: 'place'");
    });

    it('🔑 تُصفّر حين لا يبقى تقييمٌ ظاهر — لا تترك النجوم القديمة', () => {
        expect(src).toMatch(/stats\.length \? [\s\S]{0,60}: 0/);
        expect(src).toContain('ratingAvg: avg, ratingCount: count');
    });

    it('🔒 لا ترمي — فشل الحساب لا يُفشل الإخفاء نفسه', () => {
        expect(src).toMatch(/catch \(err\)[\s\S]{0,140}logger\.error/);
    });
});

describe('🔗 مسارا الإخفاء يستدعيانها', () => {

    it('🔑 مسار البلاغ (الإرشاد 1.2)', () => {
        const src = codeOnly(read('routes/admin/reports.js'));
        expect(src).toContain('recalcPlaceRating');
        // بعد الإخفاء لا قبله
        expect(src.indexOf('recalcPlaceRating(')).toBeGreaterThan(src.indexOf('isHidden: true'));
    });

    it('مسار الأدمن المباشر', () => {
        const src = codeOnly(read('routes/admin/ratings.js'));
        expect(src).toContain('recalcPlaceRating');
    });

    it('التقييمات غير المرتبطة بمتجر لا تُحرّك متوسط متجر', () => {
        for (const f of ['routes/admin/reports.js', 'routes/admin/ratings.js']) {
            expect(codeOnly(read(f))).toMatch(/targetType === 'place'/);
        }
    });
});
