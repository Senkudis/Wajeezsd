/**
 * 🚪 نافذة الإلغاء عند التاجر.
 *
 * الشكوى: «ليه التاجر ما بيقدر يلغي الطلب؟ لازم في مرحلة يكون عندو فرصة».
 *
 * وكان الأمر أغرب من منعٍ مقصود: **الخادم كان يسمح بالإلغاء في مرحلة
 * التجهيز أصلاً** (shop_preparing ضمن الحالات المقبولة)، والواجهة وحدها هي
 * التي أخفت الزرّ — تعرضه عند shop_pending فقط. فالتاجر الذي قَبِل الطلب ثم
 * اكتشف أن المنتج تالف أو أن العميل لا يردّ لم يكن له مخرج، مع أن الطريق
 * كان مفتوحاً تحته.
 *
 * والحدّ الصحيح ليس الحالة بل **وجود كابتن**: ما دام لم يقبله أحد فلا أحد
 * في الطريق. وبعد الإسناد يصير القرار إدارياً — كابتنٌ قطع الطريق يستحقّ
 * تعويضاً لا زرّاً في يد الطرف الآخر.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const page  = read('public_html/merchant-orders.html');
const route = read('routes/merchant.js');
const reject = route.slice(route.indexOf("router.put('/orders/:id/reject'"), route.indexOf("router.put('/profile'"));

describe('🖥️ الواجهة تُظهر الطريق الذي كان مفتوحاً', () => {
    it('🔑 الزرّ لم يعد مقصوراً على الطلب الجديد', () => {
        expect(page).toContain('function canCancel(o)');
        expect(page).toMatch(/\$\{canCancel\(o\) \?/);
        // الشرط القديم: o.status === 'shop_pending' ? زرّ الرفض
        expect(page).not.toMatch(/o\.status === 'shop_pending' \? `\s*<button class="btn-sec danger"/);
    });

    it('🔑 ويشمل مرحلة التجهيز وما بعد النشر', () => {
        const fn = page.slice(page.indexOf('function canCancel(o)'), page.indexOf('// ── الإجراء التالي'));
        expect(fn).toContain("'shop_preparing'");
        expect(fn).toContain("'ready_for_pickup'");
    });

    it('🔒 ويتوقّف عند إسناد كابتن', () => {
        const fn = page.slice(page.indexOf('function canCancel(o)'), page.indexOf('// ── الإجراء التالي'));
        expect(fn).toContain('!o.captain');
    });

    it('واللفظ يتبع المرحلة: «رفض» للجديد و«إلغاء» لما بعده', () => {
        expect(page).toMatch(/o\.status === 'shop_pending' \? 'رفض الطلب' : 'إلغاء الطلب'/);
    });
});

describe('⚠️ العواقب تُقال قبل الضغط لا بعده', () => {
    const fn = page.slice(page.indexOf('async function rejectOrder'), page.indexOf('async function remindPayment'));

    it('🔑 عميلٌ دفع ⇒ تحذيرٌ صريح بأن الإلغاء يُلزم بردّ المبلغ', () => {
        expect(fn).toContain("o.paymentStatus === 'confirmed'");
        expect(fn).toContain('يُلزمك بردّ المبلغ');
    });

    it('وطلبٌ منشور ⇒ يُقال إنه سيُسحب من الكباتن', () => {
        expect(fn).toContain('سيُسحب منهم فوراً');
    });

    it('🔒 والسبب إلزاميّ — يقرأه العميل', () => {
        expect(fn).toContain('inputValidator');
    });

    it('وفشل الإلغاء يُعيد المزامنة — الحالة تغيّرت على الخادم', () => {
        expect(fn).toMatch(/Swal\.fire\('تعذّر الإلغاء'[\s\S]{0,160}loadOrders\(true\)/);
    });
});

describe('🛡️ الخادم يحرس الحدّ الحقيقي', () => {
    it('🔑 يقبل الحالات الثلاث', () => {
        expect(reject).toMatch(/CANCELLABLE = \['shop_pending', 'shop_preparing', 'ready_for_pickup'\]/);
    });

    it('🔒 ويرفض إن أُسنِد كابتن على طلب المتجر', () => {
        expect(reject).toMatch(/if \(existingOrder\.captain\)/);
    });

    it('🔑 أو على طلب التوصيل — قد يقبله كابتن في هذه اللحظة', () => {
        // السباق الحقيقي: النشر يُنشئ Order منفصلاً يراه الكباتن
        expect(reject).toContain('linkedDelivery');
        expect(reject).toMatch(/if \(linkedDelivery && linkedDelivery\.captain\)/);
    });

    it('🧹 ويُلغي طلب التوصيل المرتبط — وإلا بقي معروضاً لطلبٍ لا وجود له', () => {
        expect(reject).toMatch(/OrderModel\.updateOne\([\s\S]{0,240}status: 'cancelled'/);
    });

    it('والإلغاء مشروطٌ ذرّياً بغياب الكابتن', () => {
        expect(reject).toMatch(/\{ _id: linkedDelivery\._id, captain: \{ \$exists: false \} \}/);
    });

    it('📦 والمخزون يعود كما كان', () => {
        expect(reject).toContain("type: 'return'");
    });
});
