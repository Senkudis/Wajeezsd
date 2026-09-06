/**
 * 🧾 «طلبتُ من متجر ولم يظهر الطلب في طلباتي».
 *
 * العطل: /api/orders/my-orders يبني الصفحة من مجموعتين (Order و ShopOrder)،
 * وكان الترقيم يُقسَّم حسب المصدر — يستنفد طلبات التوصيل أولاً ثم يبدأ طلبات
 * المتاجر. فصار ترتيب القائمة الفعلي «كل التوصيل، ثم كل المتاجر»، والفرز
 * الزمني يُطبَّق داخل الصفحة الواحدة فلا ينفع.
 *
 * الأثر: عميلٌ له عشر طلبات توصيل في آخر ستة أشهر لا يرى في صفحته الأولى ولا
 * طلب متجرٍ واحد، ولو أنشأه قبل ثانية.
 */
import { describe, it, expect } from 'vitest';
const { slicePageByDate } = require('../utils/mergeTimeline');

const at = (iso) => ({ createdAt: new Date(iso) });
const mk = (kind, iso, id) => ({ kind, id, doc: at(iso) });

describe('اقتطاع صفحة «طلباتي» من مصدرين', () => {

    it('🔑 طلب متجرٍ جديد يتصدّر الصفحة الأولى رغم كثرة طلبات التوصيل', () => {
        const deliveries = Array.from({ length: 12 }, (_, i) =>
            mk('delivery', `2026-08-${String(20 - i).padStart(2, '0')}T10:00:00Z`, `d${i}`));
        const fresh = mk('shop', '2026-09-06T15:00:00Z', 'shop-new');

        const page = slicePageByDate([...deliveries, fresh], 0, 10);

        // قبل الإصلاح كانت الصفحة الأولى 10 طلبات توصيل ولا شيء غيرها
        expect(page[0].id).toBe('shop-new');
        expect(page.some(x => x.kind === 'shop')).toBe(true);
    });

    it('الترتيب زمنيّ بحت — لا أفضلية لمصدرٍ على آخر', () => {
        const page = slicePageByDate([
            mk('delivery', '2026-09-01T00:00:00Z', 'd1'),
            mk('shop',     '2026-09-03T00:00:00Z', 's1'),
            mk('delivery', '2026-09-02T00:00:00Z', 'd2'),
            mk('shop',     '2026-09-04T00:00:00Z', 's2')
        ], 0, 10);

        expect(page.map(x => x.id)).toEqual(['s2', 's1', 'd2', 'd1']);
    });

    it('الصفحة الثانية تُكمل من حيث انتهت الأولى بلا تكرار ولا فجوة', () => {
        const all = Array.from({ length: 25 }, (_, i) =>
            mk(i % 2 ? 'shop' : 'delivery', new Date(Date.UTC(2026, 0, 1) + (25 - i) * 864e5).toISOString(), `x${i}`));

        const p1 = slicePageByDate(all, 0, 10).map(x => x.id);
        const p2 = slicePageByDate(all, 10, 10).map(x => x.id);
        const p3 = slicePageByDate(all, 20, 10).map(x => x.id);

        expect(p1).toHaveLength(10);
        expect(p2).toHaveLength(10);
        expect(p3).toHaveLength(5);
        expect(new Set([...p1, ...p2, ...p3]).size).toBe(25); // لا تكرار
    });

    it('لا يُعدّل المصفوفة الواردة — الفرز على نسخة', () => {
        const src = [mk('delivery', '2026-01-01T00:00:00Z', 'a'), mk('shop', '2026-02-01T00:00:00Z', 'b')];
        slicePageByDate(src, 0, 10);
        expect(src.map(x => x.id)).toEqual(['a', 'b']);
    });

    it('صفحة خارج المدى تُعيد فراغاً لا خطأ', () => {
        expect(slicePageByDate([mk('shop', '2026-01-01T00:00:00Z', 'a')], 50, 10)).toEqual([]);
        expect(slicePageByDate([], 0, 10)).toEqual([]);
    });
});

describe('🔗 المسار يقتطع بعد الدمج لا قبله', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'routes/orders.js'), 'utf8');
    const code = src.split('\n')
        .filter(l => { const t = l.trim(); return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*'); })
        .join('\n');

    it('يستعمل الدالة المشتركة', () => {
        expect(code).toContain('slicePageByDate(');
    });

    it('🔑 لا skip على استعلام أيٍّ من المجموعتين — التخطّي بالمصدر هو أصل العطل', () => {
        const handler = code.slice(code.indexOf("router.get('/my-orders'"));
        const body = handler.slice(0, handler.indexOf('my-missions'));
        expect(body).not.toMatch(/\.skip\(/);
    });

    it('يجلب skip + limit من كل مصدر — وإلا نقصت الصفحات العميقة', () => {
        expect(code).toMatch(/fetchCount\s*=\s*skip \+ limit/);
    });
});
