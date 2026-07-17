/**
 * Unit tests — utils/querySanitizer
 *
 * يغطّي إصلاح تعقيم NoSQL على الاستعلام: كان المُعقِّم القديم يحذف من نسخة
 * مؤقتة من req.query (getter في Express 5) فلا أثر له. الآن التعقيم عند التحليل.
 */
const { parseSafeQuery } = require('../utils/querySanitizer');

describe('parseSafeQuery', () => {
    it('يبقي الحقول العادية كما هي', () => {
        expect(parseSafeQuery('name=ahmed&status=active')).toEqual({ name: 'ahmed', status: 'active' });
    });

    it('🔒 يجرّد مفاتيح عوامل Mongo العلوية', () => {
        expect(parseSafeQuery('$ne=1')).toEqual({});
        expect(parseSafeQuery('$where=badcode')).toEqual({});
        expect(parseSafeQuery('$gt=5')).toEqual({});
    });

    it('🔒 يجرّد العامل ويبقي الحقول الصالحة معاً', () => {
        expect(parseSafeQuery('name=ahmed&$ne=1&city=Khartoum'))
            .toEqual({ name: 'ahmed', city: 'Khartoum' });
    });

    it('المفاتيح المتداخلة تبقى نصية مسطّحة (لا كائنات عوامل)', () => {
        // ?filter[$ne]=1 يصبح مفتاحاً نصياً لا يبدأ بـ $ ⇒ قيمة نصية غير خطرة
        const out = parseSafeQuery('filter[$ne]=1');
        expect(typeof out['filter[$ne]']).toBe('string');
        expect(out['filter[$ne]']).toBe('1');
    });

    it('يتعامل مع استعلام فارغ', () => {
        expect(parseSafeQuery('')).toEqual({});
    });

    it('🔒 لا يُنتج أي مفتاح يبدأ بـ $ مهما كان المدخل', () => {
        const out = parseSafeQuery('$a=1&$b=2&normal=3&$c[x]=4');
        for (const k of Object.keys(out)) {
            expect(k.startsWith('$')).toBe(false);
        }
        expect(out.normal).toBe('3');
    });
});
