/**
 * Unit tests — عدّادات بحث "اشترِ لي".
 *
 * لماذا تستحق التغطية: نسبة التوفير في لوحة الأدمن تُحسب من هذه العدّادات، وهي
 * المؤشّر الوحيد الذي يقول إن كانت طبقات خفض التكلفة تعمل. تصنيف بحثٍ مدفوع على
 * أنه "من الكاش" يجعل النسبة كذبةً مطمئنة — والخلل يُكتشف من فاتورة جوجل لا منها.
 */
const { buildIncrement } = require('../utils/searchStats');

describe('buildIncrement — كل بحث في خانة واحدة', () => {
    it('بحث كلّف نداءً لجوجل يُحسب مدفوعاً وحده', () => {
        const inc = buildIncrement({ resultCount: 8, googleCalled: true });
        expect(inc).toEqual({ searches: 1, googleCalls: 1 });
    });

    it('بحث خُدم من الكاش يُحسب كاشاً وحده', () => {
        const inc = buildIncrement({ resultCount: 8, googleCalled: false });
        expect(inc).toEqual({ searches: 1, cacheHits: 1 });
    });

    it('بحث كفته قاعدتنا يُحسب محلياً وحده — لا كاشاً ولا مدفوعاً', () => {
        const inc = buildIncrement({ resultCount: 6, googleCalled: false, localOnly: true });
        expect(inc).toEqual({ searches: 1, localOnly: 1 });
        expect(inc.cacheHits).toBeUndefined();
        expect(inc.googleCalls).toBeUndefined();
    });

    it('🔒 الخانات الثلاث يتبادلن الحصر دائماً', () => {
        const cases = [
            { googleCalled: true,  localOnly: false },
            { googleCalled: false, localOnly: false },
            { googleCalled: false, localOnly: true },
            { googleCalled: true,  localOnly: true }   // تناقض ظاهري: المحلي يفوز
        ];
        for (const c of cases) {
            const inc = buildIncrement({ resultCount: 1, ...c });
            const buckets = ['googleCalls', 'cacheHits', 'localOnly'].filter(k => inc[k]);
            expect(buckets).toHaveLength(1);
            expect(inc.searches).toBe(1);
        }
    });
});

describe('buildIncrement — البحث الفاشل', () => {
    it('نتيجة صفر تُعدّ بحثاً بلا نتائج', () => {
        expect(buildIncrement({ resultCount: 0, googleCalled: true }).emptyResults).toBe(1);
    });

    it('وجود نتائج لا يُعدّ فارغاً', () => {
        expect(buildIncrement({ resultCount: 1, googleCalled: true }).emptyResults).toBeUndefined();
    });

    it('فشل البحث الخارجي يُعدّ خطأً، ويبقى محسوباً ضمن عمليات البحث', () => {
        const inc = buildIncrement({ resultCount: 0, googleCalled: false, failed: true });
        expect(inc.errorCount).toBe(1);
        expect(inc.searches).toBe(1);
        expect(inc.emptyResults).toBe(1);
    });

    it('البحث الناجح لا يُسجَّل خطأً', () => {
        expect(buildIncrement({ resultCount: 3, googleCalled: true }).errorCount).toBeUndefined();
    });
});
