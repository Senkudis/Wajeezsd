/**
 * 💼 دفتر أستاذ المتجر — بقاعدة بيانات حقيقية.
 *
 * هذا أخطر كودٍ في المشروع: منه يخرج رصيد التاجر، ومنه تُحسم التسويات.
 * وكل ما يحميه سلوكٌ في MongoDB نفسها لا في جافاسكربت:
 *
 *   • الخصم يُبنى على `findOneAndUpdate` بشرط `$gte` — الشرط والتعديل في
 *     عمليةٍ واحدة. طلبا سحبٍ متزامنان على رصيدٍ يكفي أحدهما: يجب أن ينجح
 *     واحدٌ فقط. فحصٌ ثم تعديل (read-then-write) كان سينجّحهما معاً ويترك
 *     الرصيد سالباً.
 *   • القيد المزدوج يمنعه فهرسٌ فريدٌ **جزئي** على (refModel, refId, type).
 *     الجزئي لا الكامل: قيود التسوية لا refId لها، وفهرسٌ كامل كان سيمنع
 *     أكثر من تسويةٍ واحدة بلا مرجع.
 *   • وحين يرفض الفهرس القيد، **يجب أن يعود الرصيد** — وإلا زاد الرصيد
 *     بلا سطرٍ في الدفتر يفسّره، وهو أسوأ عطلٍ ممكن هنا: مالٌ بلا أثر.
 *
 * لا اختبار نصٍّ ولا محاكاة تمسك أياً من هذه. تحتاج mongod.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
const { startMongo, stopMongo, clearMongo, syncIndexes, assertRanInCI } = require('./helpers/mongo');

const Place = require('../models/Place');
const ShopLedger = require('../models/ShopLedger');
const StockMovement = require('../models/StockMovement');
const Product = require('../models/Product');
const { recordLedgerEntry, recordStockMovement } = require('../utils/erpHelpers');
const mongoose = require('mongoose');

let db;
beforeAll(async () => {
    db = await startMongo();
    if (db.ok) await syncIndexes(ShopLedger);
}, 120000);
afterAll(async () => { if (db && db.ok) await stopMongo(); });
beforeEach(async () => { if (db && db.ok) await clearMongo(); });

// بلا قاعدة: تُتخطّى بصوتٍ مسموع بدل أن تخضرّ كاذبة
const maybe = () => (db && db.ok ? describe : describe.skip);

// يسقط البناء في CI إن غابت القاعدة، بدل خضرةٍ كاذبة
describe('القاعدة حاضرة', () => {
    it('في CI لا تُخطّى هذه المجموعة', () => {
        assertRanInCI(db);
        expect(true).toBe(true);
    });
});

async function makePlace(balance = 0) {
    return Place.create({
        name: 'متجر الاختبار',
        shopWalletBalance: balance,
        location: { type: 'Point', coordinates: [32.5, 15.6] }
    });
}

maybe()('الدخل يزيد الرصيد ويترك أثراً', () => {
    it('قيدٌ واحد، ورصيدٌ يطابق آخر لقطة في الدفتر', async () => {
        const place = await makePlace(0);
        const refId = new mongoose.Types.ObjectId();

        const r = await recordLedgerEntry({
            placeId: place._id, type: 'sale_income', amount: 1500,
            refModel: 'ShopOrder', refId, note: 'طلب'
        });

        expect(r.ok).toBe(true);
        expect(r.balanceAfter).toBe(1500);

        const fresh = await Place.findById(place._id).select('shopWalletBalance');
        expect(fresh.shopWalletBalance).toBe(1500);

        const rows = await ShopLedger.find({ placeId: place._id });
        expect(rows).toHaveLength(1);
        // اللقطة في الدفتر يجب أن تطابق الرصيد الفعلي — وإلا فكشف الحساب يكذب
        expect(rows[0].balanceAfter).toBe(fresh.shopWalletBalance);
    });

    it('ومبلغ صفر أو غير رقم لا يُحرّك شيئاً', async () => {
        const place = await makePlace(100);
        for (const amount of [0, NaN, Infinity, undefined]) {
            const r = await recordLedgerEntry({ placeId: place._id, type: 'adjustment', amount });
            expect(r.ok).toBe(false);
            expect(r.reason).toBe('invalid_amount');
        }
        expect((await Place.findById(place._id)).shopWalletBalance).toBe(100);
        expect(await ShopLedger.countDocuments()).toBe(0);
    });

    it('ومتجرٌ غير موجود لا يُنشئ قيداً معلّقاً', async () => {
        const r = await recordLedgerEntry({
            placeId: new mongoose.Types.ObjectId(), type: 'sale_income', amount: 50
        });
        expect(r.ok).toBe(false);
        expect(await ShopLedger.countDocuments()).toBe(0);
    });
});

maybe()('الخصم لا ينزل بالرصيد تحت الصفر', () => {
    it('تسويةٌ أكبر من الرصيد تُرفض ولا تمسّ شيئاً', async () => {
        const place = await makePlace(500);
        const r = await recordLedgerEntry({ placeId: place._id, type: 'settlement', amount: -800 });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('insufficient_balance_or_missing_place');
        expect((await Place.findById(place._id)).shopWalletBalance).toBe(500);
        expect(await ShopLedger.countDocuments()).toBe(0);
    });

    it('وتسويةٌ بقدر الرصيد تماماً تمرّ وتتركه صفراً', async () => {
        const place = await makePlace(500);
        const r = await recordLedgerEntry({ placeId: place._id, type: 'settlement', amount: -500 });
        expect(r.ok).toBe(true);
        expect(r.balanceAfter).toBe(0);
    });

    it('⚡ سحبان متزامنان على رصيدٍ يكفي واحداً: ينجح واحدٌ فقط', async () => {
        const place = await makePlace(1000);

        // هذا هو الاختبار الذي لا يمكن كتابته بلا قاعدة: لو كان الفحص
        // منفصلاً عن التعديل لنجح الاثنان ولصار الرصيد -1000.
        const [a, b] = await Promise.all([
            recordLedgerEntry({ placeId: place._id, type: 'settlement', amount: -1000 }),
            recordLedgerEntry({ placeId: place._id, type: 'settlement', amount: -1000 })
        ]);

        const wins = [a, b].filter(r => r.ok).length;
        expect(wins).toBe(1);

        const fresh = await Place.findById(place._id).select('shopWalletBalance');
        expect(fresh.shopWalletBalance).toBe(0);
        expect(fresh.shopWalletBalance).toBeGreaterThanOrEqual(0);
        expect(await ShopLedger.countDocuments()).toBe(1);
    });

    it('⚡ وعشرة سحوبٍ متزامنة على رصيدٍ يكفي ثلاثة: ثلاثة فقط', async () => {
        const place = await makePlace(300);
        const runs = await Promise.all(
            Array.from({ length: 10 }, () =>
                recordLedgerEntry({ placeId: place._id, type: 'settlement', amount: -100 }))
        );
        expect(runs.filter(r => r.ok).length).toBe(3);
        expect((await Place.findById(place._id)).shopWalletBalance).toBe(0);
        expect(await ShopLedger.countDocuments()).toBe(3);
    });
});

maybe()('القيد المزدوج ممنوع — والرصيد يعود إن مُنع', () => {
    it('قيد دخلٍ ثانٍ لنفس الطلب يُرفض', async () => {
        const place = await makePlace(0);
        const refId = new mongoose.Types.ObjectId();
        const args = { placeId: place._id, type: 'sale_income', amount: 700, refModel: 'ShopOrder', refId };

        const first = await recordLedgerEntry(args);
        const second = await recordLedgerEntry(args);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(false);
        expect(second.reason).toBe('duplicate_entry');
    });

    it('🔴 والرصيد لا يزيد بالقيد المرفوض — مالٌ بلا سطرٍ يفسّره', async () => {
        const place = await makePlace(0);
        const refId = new mongoose.Types.ObjectId();
        const args = { placeId: place._id, type: 'sale_income', amount: 700, refModel: 'ShopOrder', refId };

        await recordLedgerEntry(args);
        await recordLedgerEntry(args);

        const fresh = await Place.findById(place._id).select('shopWalletBalance');
        expect(fresh.shopWalletBalance).toBe(700);   // لا 1400
        expect(await ShopLedger.countDocuments()).toBe(1);
    });

    it('⚡ ونداءان متزامنان لنفس الطلب: قيدٌ واحد ورصيدٌ واحد', async () => {
        const place = await makePlace(0);
        const refId = new mongoose.Types.ObjectId();
        const args = { placeId: place._id, type: 'sale_income', amount: 700, refModel: 'ShopOrder', refId };

        const runs = await Promise.all([recordLedgerEntry(args), recordLedgerEntry(args)]);

        expect(runs.filter(r => r.ok).length).toBe(1);
        expect((await Place.findById(place._id)).shopWalletBalance).toBe(700);
        expect(await ShopLedger.countDocuments()).toBe(1);
    });

    it('والمنع خاصٌّ بدخل الطلبات: تسويتان بلا مرجع تمرّان', async () => {
        // الفهرس جزئي عمداً. لو كان كاملاً لمنع التسوية الثانية — وهي مشروعة.
        const place = await makePlace(1000);
        const a = await recordLedgerEntry({ placeId: place._id, type: 'settlement', amount: -200 });
        const b = await recordLedgerEntry({ placeId: place._id, type: 'settlement', amount: -300 });
        expect(a.ok).toBe(true);
        expect(b.ok).toBe(true);
        expect((await Place.findById(place._id)).shopWalletBalance).toBe(500);
    });

    it('وطلبان مختلفان لنفس المتجر: قيدان', async () => {
        const place = await makePlace(0);
        for (let i = 0; i < 2; i++) {
            const r = await recordLedgerEntry({
                placeId: place._id, type: 'sale_income', amount: 100,
                refModel: 'ShopOrder', refId: new mongoose.Types.ObjectId()
            });
            expect(r.ok).toBe(true);
        }
        expect(await ShopLedger.countDocuments()).toBe(2);
        expect((await Place.findById(place._id)).shopWalletBalance).toBe(200);
    });
});

maybe()('الرصيد يساوي مجموع الدفتر — دائماً', () => {
    it('بعد خليطٍ من الدخل والتسوية والتعديل', async () => {
        const place = await makePlace(0);
        await recordLedgerEntry({ placeId: place._id, type: 'sale_income', amount: 1000, refModel: 'ShopOrder', refId: new mongoose.Types.ObjectId() });
        await recordLedgerEntry({ placeId: place._id, type: 'sale_income', amount: 250, refModel: 'ShopOrder', refId: new mongoose.Types.ObjectId() });
        await recordLedgerEntry({ placeId: place._id, type: 'settlement', amount: -400 });
        await recordLedgerEntry({ placeId: place._id, type: 'adjustment', amount: -50 });
        await recordLedgerEntry({ placeId: place._id, type: 'settlement', amount: -9999 }); // يُرفض

        const rows = await ShopLedger.find({ placeId: place._id });
        const sum = rows.reduce((s, r) => s + r.amount, 0);
        const fresh = await Place.findById(place._id).select('shopWalletBalance');

        expect(sum).toBe(800);
        expect(fresh.shopWalletBalance).toBe(sum);
        // وآخر لقطةٍ في الدفتر هي الرصيد نفسه
        const last = rows.sort((a, b) => a.createdAt - b.createdAt).at(-1);
        expect(last.balanceAfter).toBe(fresh.shopWalletBalance);
    });
});

maybe()('حركة المخزون سطر تدقيق لا يُفشل البيع', () => {
    it('تُسجَّل الحركة بحقولها', async () => {
        const place = await makePlace(0);
        const product = await Product.create({ name: 'وردة', price: 5000, placeId: place._id });

        await recordStockMovement({
            placeId: place._id, productId: product._id, productName: product.name,
            type: 'out', quantity: 3, balanceAfter: 7, reason: 'بيع'
        });

        const rows = await StockMovement.find({ placeId: place._id });
        expect(rows).toHaveLength(1);
        expect(rows[0].quantity).toBe(3);
        expect(rows[0].balanceAfter).toBe(7);
    });

    it('🔴 وفشل التسجيل لا يرمي — البيع تمّ، والتدقيق ثانوي', async () => {
        // نوعٌ خارج القائمة المسموحة: يفشل التحقّق في mongoose
        await expect(recordStockMovement({
            placeId: new mongoose.Types.ObjectId(),
            productId: new mongoose.Types.ObjectId(),
            type: 'نوع-غير-موجود', quantity: 1
        })).resolves.toBeUndefined();

        expect(await StockMovement.countDocuments()).toBe(0);
    });
});
