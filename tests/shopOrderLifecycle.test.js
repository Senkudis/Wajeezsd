/**
 * 🏪 طلب متجر: أربعة أعطال ظهرت معاً في طلبٍ واحد حقيقي.
 *
 * 1. التاجر لا يصله خبرٌ عن طلبه بعد وصوله: نقاط المزامنة تكتب حالة ShopOrder
 *    (captain_assigned ثم picked_up) وتُبلّغ العميل والكابتن والإدارة — ولا
 *    تُبلّغ التاجر. وخبر التسليم كان مدفوناً خلف شرطَي قيدٍ محاسبي.
 * 2. زرّ التقييم يختفي بمجرّد الردّ على سؤال «هل استلمت؟» — قبل أي تقييم.
 * 3. لافتة «تم تأكيد الدفع وجاري التجهيز» تبقى بعد التسليم.
 * 4. زرّ «محادثة التاجر» يبقى بعد التسليم، ويفتح الكابتن بدل التاجر.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const codeOnly = (src) => src.split('\n')
    .filter(l => { const t = l.trim(); return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*'); })
    .join('\n');

describe('١ — التاجر يُبلَّغ بتقدّم طلبه', () => {
    const helper = read('utils/shopOrderNotify.js');
    const orders = codeOnly(read('routes/orders.js'));

    it('توجد دالة مشتركة للإبلاغ', () => {
        expect(helper).toContain('notifyMerchantOfShopOrder');
        expect(helper).toContain('place.ownerId');
    });

    it('🔒 لا ترمي — فشلُ إشعارٍ لا يُفشل استلاماً أو تسليماً', () => {
        expect(helper).toMatch(/catch \(err\)[\s\S]{0,120}logger\.error/);
    });

    it('🔑 تُستدعى عند إسناد الكابتن والاستلام والتسليم — ثلاث نقاط', () => {
        const calls = orders.match(/notifyMerchantOfShopOrder\(req\.app/g) || [];
        expect(calls.length).toBeGreaterThanOrEqual(4); // قبول مباشر + قبول عرض + استلام + تسليم
    });

    it('🔑 خبر التسليم غير مشروط بنجاح القيد المحاسبي', () => {
        // كان الإشعار الوحيد داخل if (ledgerResult.ok) وداخل if (goodsAmount > 0)
        const deliveredCall = orders.indexOf("title: 'تم توصيل الطلب'");
        const ledgerGuard = orders.indexOf('if (ledgerResult.ok)');
        expect(deliveredCall).toBeGreaterThan(-1);
        expect(deliveredCall).toBeLessThan(ledgerGuard); // يسبق الشرط لا يقع داخله
    });
});

describe('٢ — زرّ التقييم لا يختفي قبل التقييم', () => {
    const html = read('public_html/client-my-orders.html');

    it('🔑 سؤال الاستلام يُوسم في مجموعة منفصلة عن المُقيَّمة', () => {
        expect(html).toContain('const promptedOrders = new Set()');
        expect(html).toMatch(/promptedOrders\.add\(orderId\)/);
    });

    it('🔑 تأكيد الاستلام لا يضع الطلب في ratedOrders', () => {
        const fn = html.slice(html.indexOf('function confirmDelivery'));
        const body = fn.slice(0, fn.indexOf('function showComplaintDialog'));
        expect(body).not.toMatch(/ratedOrders\.add/);
    });

    it('تقييم المتجر يفحص res.ok ولا يفشل بصمت', () => {
        const fn = html.slice(html.indexOf('function showPlaceRatingModal'));
        const body = fn.slice(0, 4000);
        expect(body).toMatch(/if \(!res\.ok\)/);
        expect(body).not.toMatch(/silent fail/);
    });

    it('الوسم كمُقيَّم يقع بعد نجاح الإرسال لا قبله', () => {
        const fn = html.slice(html.indexOf('function showPlaceRatingModal'));
        const okIdx = fn.indexOf('if (!res.ok)');
        const addIdx = fn.indexOf('ratedOrders.add(orderId)');
        expect(addIdx).toBeGreaterThan(okIdx);
    });
});

describe('٣ — لافتة الدفع تصدق بعد التسليم', () => {
    const html = read('public_html/client-my-orders.html');

    it('🔑 «جاري التجهيز» مشروطة بأن الطلب لم يُستلم بعد', () => {
        expect(html).toMatch(/stillPreparing = !\['picked_up', 'delivered'\]\.includes\(order\.status\)/);
        expect(html).toMatch(/stillPreparing \? 'تم تأكيد الدفع وجاري التجهيز!'/);
    });
});

describe('٤ — محادثة التاجر تصل التاجر', () => {
    const html = read('public_html/client-my-orders.html');
    const chat = read('public_html/chat.html');
    const merchant = codeOnly(read('routes/merchant.js'));

    it('🔑 الزرّ يمرّر peer=merchant — الاستدلال كان يقود للكابتن', () => {
        expect(html).toMatch(/chat\('\$\{order\.shopOrderId \|\| order\._id\}', '', 'merchant'\)/);
        expect(html).toMatch(/peer \? `\$\{q\}&peer=\$\{peer\}`/);
    });

    it('🔑 صفحة المحادثة لا تسأل /api/orders حين الطرف تاجر', () => {
        // ذاك المسار يترجم معرّف ShopOrder إلى طلب التوصيل فيُعيد الكابتن
        expect(chat).toContain("const chatPeer = urlParams.get('peer')");
        expect(chat).toMatch(/chatPeer === 'merchant'\s*\n?\s*\? \{ ok: false \}/);
    });

    it('الزرّ يختفي بعد التسليم', () => {
        expect(html).toMatch(/!\['chat_initiated', 'cancelled', 'delivered'\]\.includes\(order\.status\)/);
    });

    it('🔒 معرّف التاجر من ownerId وحده — لا رجوع إلى معرّف المتجر', () => {
        expect(merchant).toMatch(/merchantId: \(order\.place && order\.place\.ownerId\) \? String\(order\.place\.ownerId\) : null/);
    });
});
