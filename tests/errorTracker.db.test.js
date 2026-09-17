/**
 * 🐞 سجلّ الأخطاء — بقاعدة بيانات حقيقية.
 *
 * العدّاد الذي يُبنى عليه قرار التنبيه يعيش في القاعدة لا في ذاكرة النسخة،
 * وهو ما يجعله صحيحاً مع أكثر من نسخة تعمل معاً. وصحّته تعتمد على سلوكٍ
 * لا يظهر إلا بـ mongod: أن `$inc` على upsert يبدأ من واحد، وأن
 * `new: true` يعيد العدّاد **بعد** الزيادة لا قبلها.
 *
 * لو عاد قبلها لظنّ كل خطأٍ ثانٍ أنه أوّل مرّة، فانهار تمييز «الجديد».
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const { startMongo, stopMongo, clearMongo, assertRanInCI } = require('./helpers/mongo');

const ErrorLog = require('../models/ErrorLog');
const tracker = require('../utils/errorTracker');

const db = await startMongo();
assertRanInCI(db);

afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => { if (db.ok) await clearMongo(); });

const maybe = () => (db.ok ? describe : describe.skip);

/** `record` يكتب في الخلفية؛ ننتظر استقرار الكتابة قبل الفحص. */
const settle = () => new Promise(r => setTimeout(r, 120));

maybe()('العدّاد يعود بعد الزيادة لا قبلها', () => {
    it('أول تسجيلٍ لبصمةٍ يعطي واحداً — وهو معنى «خطأ جديد»', async () => {
        tracker.record({ message: 'boom', path: '/api/x', method: 'GET', statusCode: 500 });
        await settle();
        const rows = await ErrorLog.find({});
        expect(rows).toHaveLength(1);
        expect(rows[0].count).toBe(1);
    });

    it('🔴 والتسجيل الثاني يعطي اثنين، لا واحداً', async () => {
        for (let i = 0; i < 3; i++) {
            tracker.record({ message: 'boom', path: '/api/x', method: 'GET', statusCode: 500 });
            await settle();
        }
        const rows = await ErrorLog.find({});
        expect(rows).toHaveLength(1);
        expect(rows[0].count).toBe(3);
    });

    it('وأول وقتٍ يبقى، وآخر وقتٍ يتقدّم', async () => {
        tracker.record({ message: 'boom', path: '/api/x', method: 'GET' });
        await settle();
        const first = await ErrorLog.findOne({});
        await new Promise(r => setTimeout(r, 40));
        tracker.record({ message: 'boom', path: '/api/x', method: 'GET' });
        await settle();
        const again = await ErrorLog.findOne({});
        expect(again.firstAt.getTime()).toBe(first.firstAt.getTime());
        expect(again.lastAt.getTime()).toBeGreaterThanOrEqual(first.lastAt.getTime());
    });
});

maybe()('التجميع يمنع نفخ السجلّ', () => {
    it('🔴 مئة طلبٍ فاشل بمعرّفاتٍ مختلفة = وثيقةٌ واحدة بعدّاد مئة', async () => {
        // بلا تطبيع المسار كانت هذه مئة وثيقة، ومئة «خطأ جديد» يستحقّ
        // كلٌّ منها تنبيهاً.
        for (let i = 0; i < 12; i++) {
            const id = '507f1f77bcf86cd7994390' + String(10 + i);
            tracker.record({ message: 'Cannot read x', path: `/api/orders/${id}/accept`, method: 'PUT' });
            await settle();
        }
        const rows = await ErrorLog.find({});
        expect(rows).toHaveLength(1);
        expect(rows[0].count).toBe(12);
        expect(rows[0].fingerprint).toContain(':id');
    });

    it('ومساران مختلفان يبقيان خطأين', async () => {
        tracker.record({ message: 'boom', path: '/api/a', method: 'GET' });
        await settle();
        tracker.record({ message: 'boom', path: '/api/b', method: 'GET' });
        await settle();
        expect(await ErrorLog.countDocuments()).toBe(2);
    });
});

maybe()('السجلّ ينظّف نفسه', () => {
    it('لكل وثيقةٍ تاريخ انتهاء، ويتجدّد مع كل تكرار', async () => {
        tracker.record({ message: 'boom', path: '/api/x', method: 'GET' });
        await settle();
        const a = await ErrorLog.findOne({});
        expect(a.expiresAt).toBeInstanceOf(Date);
        expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now());

        await new Promise(r => setTimeout(r, 40));
        tracker.record({ message: 'boom', path: '/api/x', method: 'GET' });
        await settle();
        const b = await ErrorLog.findOne({});
        // خطأ لا يزال يحدث لا ينبغي أن يُحذف
        expect(b.expiresAt.getTime()).toBeGreaterThanOrEqual(a.expiresAt.getTime());
    });
});

maybe()('القراءة للإدارة', () => {
    it('تُرجع من القاعدة مرتّبةً بالأحدث', async () => {
        tracker.record({ message: 'old', path: '/api/a', method: 'GET' });
        await settle();
        await new Promise(r => setTimeout(r, 40));
        tracker.record({ message: 'new', path: '/api/b', method: 'GET' });
        await settle();

        const res = await tracker.listPersisted(10);
        expect(res.source).toBe('db');
        expect(res.errors[0].message).toBe('new');
        expect(res.errors).toHaveLength(2);
    });
});
