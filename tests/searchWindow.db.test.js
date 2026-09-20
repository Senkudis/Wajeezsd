/**
 * ⏳ نافذة البحث عن كابتن — نهايةٌ للصمت، لا نهايةٌ للطلب.
 *
 * العلّة المقيسة من الإنتاج: 216 طلباً ماتت انتظاراً، وسيط عمرها قبل
 * الإلغاء 111 دقيقة، و60 عميلاً منهم لم يصبروا عشر دقائق. واللوحة تقول
 * «جاري البحث» بلا زمنٍ ولا نهاية — صمتٌ مفتوح يُقرأ إهمالاً.
 *
 * ولماذا لا تُقتل الطلبات بمهلةٍ قصيرة: قياسُ الطلبات التي قُبلت فعلاً
 * يقول إن الوسيط 12.8 دقيقة، لكن **83٪ منها تُقبل خلال ساعة** و91٪ خلال
 * ساعتين. فإعدام الطلب عند العشرين دقيقة يُضيّع ثلث ما كان سينجح.
 *
 * فالتصميم: نافذةٌ قصيرة تنتهي بـ**سؤال** لا بإعدام — «أواصل أم ألغي؟» —
 * والإلغاء التلقائي يبقى عند ست ساعات كما كان.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
const { startMongo, stopMongo, clearMongo, assertRanInCI } = require('./helpers/mongo');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-anywhere-else';

const User = require('../models/User');
const Order = require('../models/Order');
const Settings = require('../models/Settings');
const { signUserToken } = require('../utils/authToken');

const db = await startMongo();
assertRanInCI(db);

let app = null;
if (db.ok) {
    app = express();
    app.use(express.json());
    app.set('io', { to: () => ({ emit: () => {} }) });
    app.use('/api/orders', require('../routes/orders'));
}

afterAll(async () => { if (db.ok) await stopMongo(); });
beforeEach(async () => { if (db.ok) await clearMongo(); });

const maybe = () => (db.ok ? describe : describe.skip);

let seq = 0;
async function makeClient() {
    const u = await User.create({
        name: 'عميل', phone: `09222222${String(++seq).padStart(3, '0')}`,
        password: 'x'.repeat(60), role: 'client', city: 'Khartoum', isActive: true
    });
    return { user: u, token: signUserToken(u) };
}

async function makeOrder(clientId, over = {}) {
    return Order.create({
        client: clientId,
        pickup: { address: 'أ', contactName: 'أ', contactPhone: '0900000000' },
        dropoff: { address: 'ب', receiverName: 'ب', receiverPhone: '0900000001' },
        distanceType: 'short', price: 2000, status: 'pending', city: 'Khartoum',
        searchDeadlineAt: new Date(Date.now() - 60000),   // انتهت نافذته
        ...over
    });
}

const extend = (token, id) =>
    request(app).put(`/api/orders/${id}/extend-search`).set('Authorization', `Bearer ${token}`);

maybe()('العميل يواصل البحث بدل أن يموت طلبه', () => {
    it('التمديد يدفع الموعد إلى الأمام ويعدّ المرّات', async () => {
        const { user, token } = await makeClient();
        const order = await makeOrder(user._id);

        const res = await extend(token, order._id);
        expect(res.status).toBe(200);

        const fresh = await Order.findById(order._id);
        expect(fresh.searchDeadlineAt.getTime()).toBeGreaterThan(Date.now());
        expect(fresh.searchExtendCount).toBe(1);
        expect(fresh.status).toBe('pending');   // لا يتغيّر شيءٌ آخر
    });

    it('والمدّة تُقرأ من إعدادات المدينة لا من رقمٍ مكتوب', async () => {
        await Settings.updateOne(
            { city: 'Khartoum' },
            { $set: { city: 'Khartoum', 'nudges.clientDecisionMin': 45 } },
            { upsert: true }
        );
        const { user, token } = await makeClient();
        const order = await makeOrder(user._id);

        await extend(token, order._id);
        const fresh = await Order.findById(order._id);
        const minutesAhead = (fresh.searchDeadlineAt.getTime() - Date.now()) / 60000;
        expect(minutesAhead).toBeGreaterThan(40);
        expect(minutesAhead).toBeLessThanOrEqual(46);
    });

    it('ويتراكم العدّاد مع كل تمديد', async () => {
        const { user, token } = await makeClient();
        const order = await makeOrder(user._id);
        await extend(token, order._id);
        await extend(token, order._id);
        expect((await Order.findById(order._id)).searchExtendCount).toBe(2);
    });
});

maybe()('من لا يملك الطلب لا يمدّده', () => {
    it('عميلٌ آخر يُرفض', async () => {
        const owner = await makeClient();
        const other = await makeClient();
        const order = await makeOrder(owner.user._id);

        expect((await extend(other.token, order._id)).status).toBe(403);
        expect((await Order.findById(order._id)).searchExtendCount).toBe(0);
    });

    it('وبلا توكن: 401', async () => {
        const { user } = await makeClient();
        const order = await makeOrder(user._id);
        const res = await request(app).put(`/api/orders/${order._id}/extend-search`);
        expect(res.status).toBe(401);
    });

    it('وطلبٌ غير موجود: 404', async () => {
        const { token } = await makeClient();
        expect((await extend(token, new mongoose.Types.ObjectId())).status).toBe(404);
    });

    it('ومعرّفٌ مشوّه لا يُسقط الخادم', async () => {
        const { token } = await makeClient();
        const res = await extend(token, 'ليس-معرّفاً');
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
    });
});

maybe()('🔴 التمديد لا يُطبَّق على طلبٍ خرج من البحث', () => {
    it('طلبٌ قبِله كابتن لا يُمدَّد', async () => {
        const { user, token } = await makeClient();
        const order = await makeOrder(user._id, { status: 'accepted' });

        const res = await extend(token, order._id);
        expect(res.status).toBe(400);
        expect((await Order.findById(order._id)).searchExtendCount).toBe(0);
    });

    it('وطلبٌ ملغى لا يُمدَّد', async () => {
        const { user, token } = await makeClient();
        const order = await makeOrder(user._id, { status: 'cancelled' });
        expect((await extend(token, order._id)).status).toBe(400);
    });

    it('⚡ ولو قُبل الطلب أثناء التمديد لم يُكتب شيء', async () => {
        // الشرط داخل التحديث لا قبله: بين القراءة والكتابة قد يقبله كابتن
        const { user, token } = await makeClient();
        const order = await makeOrder(user._id);

        const [r] = await Promise.all([
            extend(token, order._id),
            Order.updateOne({ _id: order._id }, { $set: { status: 'accepted' } })
        ]);

        const fresh = await Order.findById(order._id);
        if (r.status === 200) {
            // فاز التمديد: الطلب كان ما زال pending لحظتها
            expect(fresh.searchExtendCount).toBe(1);
        } else {
            expect(r.status).toBe(400);
            expect(fresh.searchExtendCount).toBe(0);
        }
        expect(fresh.status).toBe('accepted');
    });
});

describe('واجهة العميل: عدّاد ثم سؤال', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
    const page = read('public_html', 'client-my-orders.html');

    it('اللوحة تعرض عدّاداً حين تبقى مهلة', () => {
        expect(page).toContain('search-countdown');
        expect(page).toContain('data-deadline=');
        expect(page).toContain('startCountdowns()');
    });

    it('وتعرض سؤالاً بزرّين حين تنتهي — لا صمتاً ولا إعداماً', () => {
        expect(page).toContain('لم نجد كابتناً متاحاً بعد');
        expect(page).toContain('واصل البحث');
        expect(page).toContain("extendSearch('${order._id}'");
    });

    it('ولا يتكرّر زرّ الإلغاء تحت لوحة القرار', () => {
        expect(page).toContain('if (!_expired) {');
    });

    it('والعدّاد بأرقامٍ ثابتة العرض — لا يرقص وهو ينزل', () => {
        expect(page).toMatch(/\.search-countdown[^}]*font-variant-numeric:\s*tabular-nums/);
    });

    it('والموعد يُرسَل من الخادم عند الإنشاء', () => {
        const routes = read('routes', 'orders.js');
        expect(routes).toContain('searchDeadlineAt: order.searchDeadlineAt');
        expect(routes).toContain('nudges.clientDecisionMin * 60000');
    });

    it('والطلب المجدول بلا نافذة — بحثه يبدأ وقت نشره', () => {
        const routes = read('routes', 'orders.js');
        expect(routes).toContain('if (!orderData.scheduledAt) {');
    });
});
