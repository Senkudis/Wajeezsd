/**
 * 🛒 إلغاء طلب المتجر من لوحة الإدارة — بقاعدة بيانات حقيقية.
 *
 * العلّة: طلبات متاجر تعلق بلا نهاية. وُجد 28 طلباً في `chat_initiated`
 * وسيط أعمارها 58 يوماً وأقدمها 107 — لا تتقدّم ولا تُلغى ولا العميل يعرف.
 *
 * وحين حاولت الإدارة إغلاق ما خرج منها للتوصيل، ردّ عليها المسار:
 * «يرجى إلغاء طلب التوصيل من شاشة الطلبات الرئيسية» — أي أنها تُطرد إلى
 * شاشةٍ أخرى لتبحث يدوياً عن الطلب المقابل، والرابط بينهما أحاديّ الاتجاه
 * (Order.shopOrderId) فلا سبيل لقراءته من طلب المتجر أصلاً.
 *
 * ما يُفحص هنا هو **الآلية** التي يقوم عليها الحلّ: أن إلغاء طلب التوصيل
 * يُسقط طلب المتجر معه ويُرجع المخزون. لو انكسر هذا الخطّاف صار زرّ
 * «إلغاء الطلب والتوصيل» يُلغي نصف الطلب ويترك نصفه معلّقاً.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const { startMongo, stopMongo, clearMongo, assertRanInCI } = require('./helpers/mongo');
const mongoose = require('mongoose');

const Order = require('../models/Order');
const ShopOrder = require('../models/ShopOrder');
const Product = require('../models/Product');
const Place = require('../models/Place');
const PlaceCategory = require('../models/PlaceCategory');

const db = await startMongo();
assertRanInCI(db);

afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => { if (db.ok) await clearMongo(); });

const maybe = () => (db.ok ? describe : describe.skip);

async function makePlace() {
    const cat = await PlaceCategory.create({ name: 'تجربة' });
    return Place.create({
        name: 'متجر', category: cat._id, location: { lat: 15.6, lng: 32.5 }
    });
}

async function makePair({ stock = 10, qty = 3, shopStatus = 'captain_assigned' } = {}) {
    const place = await makePlace();
    const product = await Product.create({ name: 'صنف', price: 1000, placeId: place._id, stock });
    const client = new mongoose.Types.ObjectId();

    const shopOrder = await ShopOrder.create({
        client, place: place._id, status: shopStatus,
        items: [{ productId: product._id, name: 'صنف', quantity: qty, price: 1000 }],
        itemsTotal: qty * 1000, totalAmount: qty * 1000
    });
    const order = await Order.create({
        client, shopOrderId: shopOrder._id,
        pickup: { address: 'أ', contactName: 'أ', contactPhone: '0900000000' },
        dropoff: { address: 'ب', receiverName: 'ب', receiverPhone: '0900000001' },
        distanceType: 'short', price: 1500, status: 'accepted', city: 'Khartoum'
    });
    return { place, product, shopOrder, order, qty, stock };
}

maybe()('إلغاء التوصيل يُسقط طلب المتجر معه', () => {
    it('🔴 الحالة تصير ملغاة — لا يبقى نصف الطلب معلّقاً', async () => {
        const { shopOrder, order } = await makePair();

        order.status = 'cancelled';
        await order.save();

        const fresh = await ShopOrder.findById(shopOrder._id);
        expect(fresh.status).toBe('cancelled');
    });

    it('ويُسجَّل من ألغى وسببه — وإلا صار إلغاءً بلا تفسير', async () => {
        // 132 من 238 إلغاءٍ في الإنتاج بلا cancelledBy مسجَّل
        const { shopOrder, order } = await makePair();
        order.status = 'cancelled';
        await order.save();

        const fresh = await ShopOrder.findById(shopOrder._id);
        expect(fresh.cancelledBy).toBeTruthy();
        expect(fresh.cancelReason).toBeTruthy();
    });

    it('🔴 ويعود المخزون إلى المنتج', async () => {
        const { product, order, qty, stock } = await makePair({ stock: 10, qty: 3 });

        order.status = 'cancelled';
        await order.save();
        await new Promise(r => setTimeout(r, 150));   // الخطّاف يكتب بعد الحفظ

        const fresh = await Product.findById(product._id).select('stock');
        expect(fresh.stock).toBe(stock + qty);
    });

    it('ولا يُلغى طلبٌ سُلّم فعلاً', async () => {
        const { shopOrder, order } = await makePair({ shopStatus: 'delivered' });
        order.status = 'delivered';
        await order.save();

        const fresh = await ShopOrder.findById(shopOrder._id);
        expect(fresh.status).toBe('delivered');
    });
});

maybe()('الرابط بين الطلبين يُقرأ من جهة التوصيل', () => {
    it('طلب المتجر لا يحمل معرّف التوصيل — لذلك تُلحقه القائمة', async () => {
        // هذا سبب وجود الإلحاق في GET /api/admin/shop-orders: بدونه لا
        // تعرف الواجهة أي طلب توصيلٍ تُلغي.
        const { shopOrder, order } = await makePair();

        const raw = await ShopOrder.findById(shopOrder._id).lean();
        expect(raw.deliveryOrderId).toBeUndefined();

        const link = await Order.findOne({ shopOrderId: shopOrder._id }).select('_id status').lean();
        expect(String(link._id)).toBe(String(order._id));
        expect(link.status).toBe('accepted');
    });
});

describe('واجهة الإدارة تُلغي من مكانها', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

    it('المسار يُلحق طلب التوصيل بكل طلب متجر', () => {
        const src = read('routes', 'admin', 'orders.js');
        expect(src).toContain('shopOrderId: { $in: ids }');
        expect(src).toContain('o.deliveryOrderId = l._id');
        expect(src).toContain('o.deliveryStatus = l.status');
    });

    it('والصفحة تختار المسار الصحيح حسب وجود توصيلٍ حيّ', () => {
        const src = read('public_html', 'admin-shop-orders.html');
        expect(src).toContain("const path = isDelivery ? 'orders' : 'shop-orders';");
        expect(src).toContain("forceCancel('${o.deliveryOrderId}', true)");
        expect(src).toContain("forceCancel('${o._id}', false)");
    });

    it('ولا يظهر زرّ الإلغاء لطلبٍ ملغى أو مُسلَّم', () => {
        const src = read('public_html', 'admin-shop-orders.html');
        expect(src).toContain("o.status !== 'cancelled' && o.status !== 'delivered'");
    });
});
