/**
 * Unit tests — utils/errorTracker
 * مخزن دائري لأخطاء الإنتاج يعرضه المسؤول عبر /api/admin/errors.
 */
const tracker = require('../utils/errorTracker');

beforeEach(() => tracker.clear());

describe('errorTracker', () => {
    it('يسجّل خطأً ويُعيده في القائمة', () => {
        tracker.record({ message: 'boom', path: '/api/x', method: 'POST', statusCode: 500 });
        const list = tracker.list();
        expect(list).toHaveLength(1);
        expect(list[0].message).toBe('boom');
        expect(list[0].path).toBe('/api/x');
        expect(list[0].at).toBeTruthy();
    });

    it('يُعيد الأحدث أولاً', () => {
        tracker.record({ message: 'first' });
        tracker.record({ message: 'second' });
        expect(tracker.list()[0].message).toBe('second');
    });

    it('يحترم الحدّ الأقصى (لا يتضخّم بلا حدود)', () => {
        for (let i = 0; i < tracker.MAX_ERRORS + 50; i++) tracker.record({ message: 'e' + i });
        expect(tracker.count()).toBe(tracker.MAX_ERRORS);
        // الأقدم حُذف، الأحدث محفوظ
        expect(tracker.list()[0].message).toBe('e' + (tracker.MAX_ERRORS + 49));
    });

    it('limit يقصّ العدد المُعاد', () => {
        for (let i = 0; i < 10; i++) tracker.record({ message: 'e' + i });
        expect(tracker.list(3)).toHaveLength(3);
    });

    it('يقصّ الرسائل والآثار الطويلة (حماية الذاكرة)', () => {
        tracker.record({ message: 'x'.repeat(1000), stack: 'y'.repeat(5000) });
        const e = tracker.list()[0];
        expect(e.message.length).toBeLessThanOrEqual(500);
        expect(e.stack.length).toBeLessThanOrEqual(2000);
    });

    it('يتحمّل مدخلات ناقصة بقيم افتراضية', () => {
        tracker.record({});
        const e = tracker.list()[0];
        expect(e.statusCode).toBe(500);
        expect(e.message).toBe('Unknown error');
        expect(e.userId).toBeNull();
    });
});
