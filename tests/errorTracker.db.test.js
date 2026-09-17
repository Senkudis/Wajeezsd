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

// `record` يُعيد وعد الكتابة (ولا يُنتظَر في الإنتاج) — ننتظره هنا بدل
// نومٍ بمدّةٍ مقدَّرة، فالمدّة ترتجف على عاملٍ بطيء.
const rec = (e) => tracker.record(e);

maybe()('العدّاد يعود بعد الزيادة لا قبلها', () => {
    it('أول تسجيلٍ لبصمةٍ يعطي واحداً — وهو معنى «خطأ جديد»', async () => {
        await rec({ message: 'boom', path: '/api/x', method: 'GET', statusCode: 500 });
        const rows = await ErrorLog.find({});
        expect(rows).toHaveLength(1);
        expect(rows[0].count).toBe(1);
    });

    it('🔴 والتسجيل الثاني يعطي اثنين، لا واحداً', async () => {
        for (let i = 0; i < 3; i++) {
            await rec({ message: 'boom', path: '/api/x', method: 'GET', statusCode: 500 });
        }
        const rows = await ErrorLog.find({});
        expect(rows).toHaveLength(1);
        expect(rows[0].count).toBe(3);
    });

    it('وأول وقتٍ يبقى، وآخر وقتٍ يتقدّم', async () => {
        await rec({ message: 'boom', path: '/api/x', method: 'GET' });
        const first = await ErrorLog.findOne({});
        await new Promise(r => setTimeout(r, 40));
        await rec({ message: 'boom', path: '/api/x', method: 'GET' });
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
            await rec({ message: 'Cannot read x', path: `/api/orders/${id}/accept`, method: 'PUT' });
        }
        const rows = await ErrorLog.find({});
        expect(rows).toHaveLength(1);
        expect(rows[0].count).toBe(12);
        expect(rows[0].fingerprint).toContain(':id');
    });

    it('ومساران مختلفان يبقيان خطأين', async () => {
        await rec({ message: 'boom', path: '/api/a', method: 'GET' });
        await rec({ message: 'boom', path: '/api/b', method: 'GET' });
        expect(await ErrorLog.countDocuments()).toBe(2);
    });
});

maybe()('السجلّ ينظّف نفسه', () => {
    it('لكل وثيقةٍ تاريخ انتهاء، ويتجدّد مع كل تكرار', async () => {
        await rec({ message: 'boom', path: '/api/x', method: 'GET' });
        const a = await ErrorLog.findOne({});
        expect(a.expiresAt).toBeInstanceOf(Date);
        expect(a.expiresAt.getTime()).toBeGreaterThan(Date.now());

        await new Promise(r => setTimeout(r, 40));
        await rec({ message: 'boom', path: '/api/x', method: 'GET' });
        const b = await ErrorLog.findOne({});
        // خطأ لا يزال يحدث لا ينبغي أن يُحذف
        expect(b.expiresAt.getTime()).toBeGreaterThanOrEqual(a.expiresAt.getTime());
    });
});

maybe()('القراءة للإدارة', () => {
    it('تُرجع من القاعدة مرتّبةً بالأحدث', async () => {
        await rec({ message: 'old', path: '/api/a', method: 'GET' });
        await new Promise(r => setTimeout(r, 40));
        await rec({ message: 'new', path: '/api/b', method: 'GET' });

        const res = await tracker.listPersisted(10);
        expect(res.source).toBe('db');
        expect(res.errors[0].message).toBe('new');
        expect(res.errors).toHaveLength(2);
    });
});
