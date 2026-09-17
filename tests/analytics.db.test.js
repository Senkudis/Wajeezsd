/**
 * 📈 عدّادات المسار — بقاعدة بيانات حقيقية.
 *
 * ما لا يُفحص إلا بـ mongod:
 *
 *   ١. أن `$inc` على upsert يُنشئ الوثيقة بالقيمة واحداً، فلا يضيع أول
 *      حدثٍ في اليوم.
 *   ٢. أن الفهرس الفريد على (day, city) يمنع وثيقتين لليوم نفسه حتى مع
 *      نداءاتٍ متزامنة — وهو ما يجعل الرقم رقماً واحداً لا رقمين.
 *   ٣. أن حدثاً باسمٍ خاطئ **لا يكتب شيئاً**: بلا حارس الأسماء كان `$inc`
 *      على حقلٍ غير موجود يُنشئه في الوثيقة صامتاً، فينتفخ المخطّط بحقولٍ
 *      لا يعرفها أحد وتبقى اللوحة تقول صفراً.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const { startMongo, stopMongo, clearMongo, syncIndexes, assertRanInCI } = require('./helpers/mongo');

const DailyStat = require('../models/DailyStat');
const analytics = require('../utils/analytics');

const db = await startMongo();
assertRanInCI(db);
if (db.ok) await syncIndexes(DailyStat);

afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => { if (db.ok) await clearMongo(); });

const maybe = () => (db.ok ? describe : describe.skip);

/** `track` يكتب في الخلفية؛ ننتظر استقرار الكتابة قبل الفحص. */
const settle = () => new Promise(r => setTimeout(r, 120));

maybe()('العدّ يبدأ من واحد ولا يضيع أوّل حدث', () => {
    it('أول حدثٍ في اليوم يُنشئ الوثيقة بواحد', async () => {
        analytics.track('orderCreated', { city: 'Khartoum' });
        await settle();

        const rows = await DailyStat.find({});
        expect(rows).toHaveLength(1);
        expect(rows[0].orderCreated).toBe(1);
        expect(rows[0].day).toBe(DailyStat.today());
        expect(rows[0].city).toBe('Khartoum');
    });

    it('والأحداث تتراكم في وثيقةٍ واحدة لا تنمو مع العدد', async () => {
        for (let i = 0; i < 6; i++) {
            analytics.track('storeOpened', { city: 'Khartoum' });
            await settle();
        }
        analytics.track('orderCreated', { city: 'Khartoum' });
        await settle();

        const rows = await DailyStat.find({});
        expect(rows).toHaveLength(1);
        expect(rows[0].storeOpened).toBe(6);
        expect(rows[0].orderCreated).toBe(1);
    });

    it('والمدن تُفصل، والمجهولة تُجمع', async () => {
        for (const city of ['Khartoum', 'PortSudan', 'Cairo', undefined, '<script>']) {
            analytics.track('orderCreated', { city });
            await settle();
        }
        const rows = await DailyStat.find({}).sort({ city: 1 }).lean();
        const byCity = Object.fromEntries(rows.map(r => [r.city, r.orderCreated]));
        expect(byCity).toEqual({ Khartoum: 1, PortSudan: 1, unknown: 3 });
    });
});

maybe()('🔴 حدثٌ مجهول لا يكتب شيئاً', () => {
    it('لا وثيقة ولا حقلٌ جديد', async () => {
        // بلا حارس الأسماء كان $inc يُنشئ الحقل في الوثيقة صامتاً
        analytics.track('orderCreatd', { city: 'Khartoum' });
        analytics.track('', { city: 'Khartoum' });
        analytics.track(undefined, { city: 'Khartoum' });
        await settle();

        expect(await DailyStat.countDocuments()).toBe(0);
    });

    it('ولا يمنع حدثاً صحيحاً بعده', async () => {
        analytics.track('nope', { city: 'Khartoum' });
        analytics.track('orderCreated', { city: 'Khartoum' });
        await settle();

        const rows = await DailyStat.find({}).lean();
        expect(rows).toHaveLength(1);
        expect(rows[0].orderCreated).toBe(1);
        expect(rows[0]).not.toHaveProperty('nope');
    });
});

maybe()('⚡ نداءات متزامنة: وثيقةٌ واحدة ورقمٌ واحد', () => {
    it('عشرون حدثاً معاً تعطي عشرين في وثيقةٍ واحدة', async () => {
        // الفهرس الفريد على (day, city) هو ما يمنع وثيقتين لليوم نفسه
        for (let i = 0; i < 20; i++) analytics.track('orderCreated', { city: 'Khartoum' });
        await new Promise(r => setTimeout(r, 600));

        const rows = await DailyStat.find({});
        expect(rows).toHaveLength(1);
        expect(rows[0].orderCreated).toBe(20);
    });
});

maybe()('التلخيص يقرأ ما كُتب', () => {
    it('المسار يُبنى من صفوف القاعدة نفسها', async () => {
        const day = DailyStat.today();
        await DailyStat.create({
            day, city: 'Khartoum',
            storeOpened: 100, orderCreated: 50, orderAccepted: 40, orderDelivered: 30, orderCancelled: 4
        });
        await DailyStat.create({
            day, city: 'PortSudan',
            storeOpened: 100, orderCreated: 50, orderAccepted: 40, orderDelivered: 30, orderCancelled: 4
        });

        const rows = await DailyStat.find({ day }).lean();
        const s = analytics.summarize(rows);
        expect(s.totals.storeOpened).toBe(200);
        expect(s.funnels.order.openToOrder).toBe(50);
        expect(s.funnels.order.acceptToDeliver).toBe(75);
    });
});
