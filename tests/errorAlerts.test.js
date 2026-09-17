/**
 * 🔔 متى يوقظ الخطأُ أحداً.
 *
 * كان `ErrorLog` يخزّن وشاشة الإدارة تعرض، ولا شيء يُنبِّه — فالعطل
 * يُكتشف حين يشتكي مستخدم.
 *
 * وما تحرسه هذه الاختبارات ليس «هل يُرسَل تنبيه» بل **ألّا يُرسَل أكثر
 * ممّا يُحتمَل**: عشرة إشعارات في الدقيقة تجعل الإدارة تُطفئ الإشعارات
 * كلها، فيصير التنبيه أسوأ من غيابه. الخوانق هي الميزة، لا قيدٌ عليها.
 */
import { describe, it, expect, beforeEach } from 'vitest';
const alerts = require('../utils/errorAlerts');
const tracker = require('../utils/errorTracker');

const {
    decide, buildMessage,
    PER_FINGERPRINT_COOLDOWN_MS, GLOBAL_WINDOW_MS, GLOBAL_MAX_PER_WINDOW, SPIKE_THRESHOLDS
} = alerts;

let state;
beforeEach(() => { state = { lastByFp: new Map(), recent: [] }; });

const at = (t) => 1700000000000 + t;

describe('ما يستحقّ تنبيهاً', () => {
    it('بصمةٌ جديدة تُنبّه — شيءٌ كان يعمل توقّف الآن', () => {
        const v = decide({ fingerprint: 'A', count: 1, now: at(0), state });
        expect(v.alert).toBe(true);
        expect(v.reason).toBe('new_error');
    });

    it('والتكرار العادي لا يُنبّه — الخطأ معروفٌ وقيد المعالجة', () => {
        for (const count of [2, 3, 7, 9, 11, 49, 199]) {
            const v = decide({ fingerprint: 'B' + count, count, now: at(0), state });
            expect(v.alert, 'count=' + count).toBe(false);
            expect(v.reason).toBe('not_notable');
        }
    });

    it('والعتبات تُنبّه — الخطأ الذي وقع خمسين مرّة ليس الذي وقع مرّة', () => {
        for (const count of SPIKE_THRESHOLDS) {
            const v = decide({ fingerprint: 'C' + count, count, now: at(0), state });
            expect(v.alert, 'count=' + count).toBe(true);
            expect(v.reason).toBe('spike_' + count);
        }
    });
});

describe('خانق البصمة الواحدة', () => {
    it('بصمةٌ نبّهت لا تُنبّه ثانيةً قبل نصف ساعة', () => {
        expect(decide({ fingerprint: 'A', count: 1, now: at(0), state }).alert).toBe(true);
        const second = decide({ fingerprint: 'A', count: 10, now: at(60_000), state });
        expect(second.alert).toBe(false);
        expect(second.reason).toBe('fingerprint_cooldown');
    });

    it('وتعود بعد انقضائها', () => {
        decide({ fingerprint: 'A', count: 1, now: at(0), state });
        const later = decide({ fingerprint: 'A', count: 50, now: at(PER_FINGERPRINT_COOLDOWN_MS + 1), state });
        expect(later.alert).toBe(true);
    });

    it('والخانق للبصمة وحدها لا لغيرها', () => {
        decide({ fingerprint: 'A', count: 1, now: at(0), state });
        expect(decide({ fingerprint: 'B', count: 1, now: at(1000), state }).alert).toBe(true);
    });
});

describe('🔴 خانق العاصفة', () => {
    it('انقطاعُ القاعدة يولّد أخطاءً مختلفة كثيرة — لا تتجاوز عشرة في الساعة', () => {
        // هذا هو السيناريو الذي يجعل التنبيه ضارّاً: مئة بصمة مختلفة في
        // دقيقة واحدة، كلٌّ منها «جديدة» فتفلت من خانق البصمة.
        let sent = 0;
        for (let i = 0; i < 100; i++) {
            if (decide({ fingerprint: 'fp' + i, count: 1, now: at(i * 500), state }).alert) sent++;
        }
        expect(sent).toBe(GLOBAL_MAX_PER_WINDOW);
    });

    it('والسبب يُقال صراحة لا يُبتلع', () => {
        for (let i = 0; i < GLOBAL_MAX_PER_WINDOW; i++) {
            decide({ fingerprint: 'x' + i, count: 1, now: at(0), state });
        }
        expect(decide({ fingerprint: 'overflow', count: 1, now: at(0), state }).reason)
            .toBe('global_rate_limit');
    });

    it('والنافذة متحرّكة: تُفتح من جديد بعد ساعة', () => {
        for (let i = 0; i < GLOBAL_MAX_PER_WINDOW; i++) {
            decide({ fingerprint: 'y' + i, count: 1, now: at(0), state });
        }
        expect(decide({ fingerprint: 'z', count: 1, now: at(1000), state }).alert).toBe(false);
        expect(decide({ fingerprint: 'z', count: 1, now: at(GLOBAL_WINDOW_MS + 1), state }).alert).toBe(true);
    });

    it('ولا تُستهلك حصّة العاصفة على ما لا يستحقّ تنبيهاً أصلاً', () => {
        // الرفض لقلّة الأهمية يجب أن يقع **قبل** عدّ النافذة
        for (let i = 0; i < 500; i++) {
            decide({ fingerprint: 'noise', count: 5, now: at(i), state });
        }
        expect(state.recent).toHaveLength(0);
        expect(decide({ fingerprint: 'real', count: 1, now: at(600), state }).alert).toBe(true);
    });
});

describe('نصّ التنبيه يقول أين ولماذا', () => {
    it('الجديد يُسمّى جديداً، والمتكرّر يحمل عدده', () => {
        const row = { method: 'PUT', path: '/api/orders/:id/accept', message: 'Cannot read x of undefined' };
        const a = buildMessage(row, 1, 'new_error');
        expect(a.title).toContain('جديد');
        expect(a.message).toContain('PUT /api/orders/:id/accept');
        expect(a.message).toContain('Cannot read x');

        const b = buildMessage(row, 50, 'spike_50');
        expect(b.title).toContain('50');
    });

    it('ورسالةٌ طويلة تُقصّ — الإشعار سطران لا صفحة', () => {
        const long = 'x'.repeat(5000);
        const m = buildMessage({ method: 'GET', path: '/a', message: long }, 1, 'new_error');
        expect(m.message.length).toBeLessThan(400);
    });

    it('وخطأٌ بلا مسار لا يُنتج نصّاً مبتوراً', () => {
        const m = buildMessage({ message: 'boom' }, 1, 'new_error');
        expect(m.message).toContain('غير معروف');
        expect(m.message).toContain('boom');
    });
});

describe('التنبيه لا يولّد خطأً يولّد تنبيهاً', () => {
    beforeEach(() => alerts._reset());

    it('بلا عدّاد صالح: لا تنبيه ولا رمي', async () => {
        await expect(alerts.consider({ message: 'x' }, {})).resolves.toMatchObject({ alert: false });
    });

    it('وفي بيئة الاختبار لا يُرسَل شيء أصلاً', async () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'test';
        const r = await alerts.consider({ message: 'x' }, { fingerprint: 'f', count: 1 });
        expect(r.reason).toBe('test_env');
        process.env.NODE_ENV = prev;
    });

    it('وبلا setApp يُسجَّل السبب بدل أن يصمت', async () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        const r = await alerts.consider({ message: 'x' }, { fingerprint: 'f2', count: 1 });
        expect(r.reason).toBe('no_app');
        process.env.NODE_ENV = prev;
    });
});

describe('البصمة تجمع المتشابه', () => {
    it('معرّفات مونجو والأرقام تُوحَّد — وإلا صار كل طلبٍ خطأً جديداً', () => {
        const a = tracker.fingerprintOf({ method: 'GET', path: '/api/orders/507f1f77bcf86cd799439011', message: 'not found 42' });
        const b = tracker.fingerprintOf({ method: 'GET', path: '/api/orders/507f1f77bcf86cd799439022', message: 'not found 77' });
        expect(a).toBe(b);
    });

    it('🔴 والمسار يُطبَّع كما تُطبَّع الرسالة', () => {
        // كان المسار يُؤخذ حرفياً، فـ /api/orders/<id>/accept يعطي بصمةً لكل
        // طلب: العطل الواحد يبدو آلاف أخطاءٍ «جديدة»، وكلٌّ منها يستحقّ
        // تنبيهاً — فتُغرق الإدارة ويغرق معها الخطأ الحقيقي.
        const a = tracker.fingerprintOf({ method: 'PUT', path: '/api/orders/507f1f77bcf86cd799439011/accept', message: 'boom' });
        const b = tracker.fingerprintOf({ method: 'PUT', path: '/api/orders/507f1f77bcf86cd799439022/accept', message: 'boom' });
        expect(a).toBe(b);
        expect(a).toContain(':id');
    });

    it('وسلسلة الاستعلام ليست هويّة', () => {
        const a = tracker.fingerprintOf({ method: 'GET', path: '/api/places?page=1&city=Khartoum', message: 'boom' });
        const b = tracker.fingerprintOf({ method: 'GET', path: '/api/places?page=9&city=PortSudan', message: 'boom' });
        expect(a).toBe(b);
    });

    it('والمقاطع الرقمية كذلك', () => {
        const a = tracker.fingerprintOf({ method: 'GET', path: '/api/reports/2026/09', message: 'boom' });
        const b = tracker.fingerprintOf({ method: 'GET', path: '/api/reports/2025/01', message: 'boom' });
        expect(a).toBe(b);
    });

    it('واختلاف المسار الحقيقي يعني خطأً آخر', () => {
        const a = tracker.fingerprintOf({ method: 'GET', path: '/api/a', message: 'boom' });
        const b = tracker.fingerprintOf({ method: 'GET', path: '/api/b', message: 'boom' });
        expect(a).not.toBe(b);
    });
});

describe('الوصل بالمسار الفعلي', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..');

    it('التسجيل يُمرّر العدّاد للتنبيه', () => {
        const s = fs.readFileSync(path.join(root, 'utils', 'errorTracker.js'), 'utf8');
        expect(s).toContain("require('./errorAlerts').consider(row, res)");
        // new: true وإلا عاد المستند قبل الزيادة فلا تُعرف الجِدّة
        expect(s).toContain('upsert: true, new: true');
    });

    it('وindex.js يربط app مرّة واحدة', () => {
        const s = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
        expect(s).toContain("require('./utils/errorAlerts').setApp(app)");
    });

    it('ونوع الإشعار موجودٌ في مخطّط الإشعارات', () => {
        const s = fs.readFileSync(path.join(root, 'models', 'Notification.js'), 'utf8');
        expect(s).toContain("'admin_alert'");
    });
});
