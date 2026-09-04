/**
 * Unit tests — utils/pushRouting
 * وجهة نقرة إشعار الـ push حسب الدور والنوع. يحمي من "الإشعار يودّي مكان خاطئ".
 */
const { resolvePushUrl } = require('../utils/pushRouting');

describe('resolvePushUrl', () => {
    it('🚨 الطوارئ: يتمركز على موقع النجدة عبر ?alert=<id>', () => {
        expect(resolvePushUrl('admin', 'emergency', 'ALERT1')).toBe('/admin-live-map.html?alert=ALERT1');
        // بلا معرّف: الخريطة بلا تمركز
        expect(resolvePushUrl('admin', 'emergency', null)).toBe('/admin-live-map.html');
    });

    it('إشعارات المحفظة/الدفع للكابتن تفتح المحفظة لا صفحة الإشعارات', () => {
        expect(resolvePushUrl('captain', 'wallet_update', 'X')).toBe('/captain-wallet.html');
        expect(resolvePushUrl('captain', 'payment_approved', 'X')).toBe('/captain-wallet.html');
        expect(resolvePushUrl('captain', 'payment_rejected', 'X')).toBe('/captain-wallet.html');
    });

    it('طلب السداد الجديد يفتح صفحة مالية الأدمن', () => {
        expect(resolvePushUrl('admin', 'payment_request', 'P')).toBe('/admin-finance.html');
    });

    it('المحادثة موحّدة لكل الأدوار وتفتح المحادثة بالطلب', () => {
        expect(resolvePushUrl('client', 'chat_message', 'O')).toBe('/chat.html?orderId=O');
        expect(resolvePushUrl('captain', 'chat', 'O')).toBe('/chat.html?orderId=O');
    });

    it('العميل: تحديث الطلب يفتح طلباتي بالتحديد المطلوب', () => {
        expect(resolvePushUrl('client', 'order_update', 'O')).toBe('/client-my-orders.html?highlight=O');
        expect(resolvePushUrl('client', 'order_searching', 'O')).toBe('/tracking.html?orderId=O');
        expect(resolvePushUrl('client', 'order_completed', 'O')).toBe('/client-my-orders.html?rateOrder=O');
    });

    it('الكابتن: طلب جديد يفتح قائمة الطلبات مع تحديد الطلب', () => {
        expect(resolvePushUrl('captain', 'new_order', 'O')).toBe('/captain-orders.html?highlight=O');
    });

    it('التاجر: طلب متجر يفتح طلبات التاجر مع تحديده', () => {
        expect(resolvePushUrl('merchant', 'shop_order_update', 'O')).toBe('/merchant-orders.html?highlight=O');
        expect(resolvePushUrl('merchant', 'low_stock', 'P')).toBe('/merchant-inventory.html');
    });

    // إشعارات نهاية الطلب: تفتح القائمة الصحيحة مع تحديد الطلب لا قائمة بلا سياق
    it('العميل: إشعارات نهاية الطلب تفتح طلباتي مع highlight', () => {
        expect(resolvePushUrl('client', 'order_delivered', 'O')).toBe('/client-my-orders.html?highlight=O');
        expect(resolvePushUrl('client', 'order_cancelled', 'O')).toBe('/client-my-orders.html?highlight=O');
        expect(resolvePushUrl('client', 'order_accepted', 'O')).toBe('/client-my-orders.html?highlight=O');
        // بلا معرّف: القائمة بلا تحديد
        expect(resolvePushUrl('client', 'order_delivered', null)).toBe('/client-my-orders.html');
    });

    it('الكابتن: إشعارات نهاية الرحلة تفتح السجل مع highlight', () => {
        expect(resolvePushUrl('captain', 'order_delivered', 'O')).toBe('/captain-history.html?highlight=O');
        expect(resolvePushUrl('captain', 'order_cancelled', 'O')).toBe('/captain-history.html?highlight=O');
    });

    it('التاجر: إلغاء الطلب يفتح الطلبات (تبويب ملغي) لا التقارير', () => {
        expect(resolvePushUrl('merchant', 'order_cancelled', 'O')).toBe('/merchant-orders.html?highlight=O');
    });

    it('نوع غير معروف يسقط لصفحة إشعارات الدور (لا كسر ولا وجهة خاطئة خطرة)', () => {
        expect(resolvePushUrl('client', 'some_unknown', 'X')).toBe('/notifications.html');
        expect(resolvePushUrl('captain', 'some_unknown', 'X')).toBe('/captain-notifications.html');
        expect(resolvePushUrl('merchant', 'some_unknown', 'X')).toBe('/merchant-notifications.html');
        expect(resolvePushUrl('admin', 'some_unknown', 'X')).toBe('/admin.html');
    });
});

/**
 * 📦 دمج طلبات المتاجر في «طلباتي».
 *
 * كان للعميل مكانان لطلبٍ واحد: client-shop-orders.html وclient-my-orders.html
 * — بينما الثانية تعرض طلبات المتاجر أصلاً وبكامل إجراءاتها (المحادثة،
 * إعادة الطلب، رفع إيصال الدفع)، لأن GET /api/orders/my-orders يدمج
 * Order و ShopOrder في قائمة واحدة مرتّبة. فكان العميل يفتح الاثنين ليعرف
 * أين طلبه.
 *
 * الحراسة هنا على المداخل الثلاثة معاً: الخادم (pushRouting) والعامل الخدمي
 * والإشعارات الأصلية. مدخلٌ يُنسى يعني إشعاراً يهبط بالمستخدم في صفحةٍ
 * متقاعدة.
 */
describe('طلبات المتاجر تهبط في «طلباتي»', () => {
    const fs = require('fs');
    const path = require('path');
    const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const ID = '507f1f77bcf86cd799439011';

    const SHOP_TYPES = [
        'shop_order_update', 'payment_confirmed', 'payment_reminder',
        'shop_order', 'new_shop_order'
    ];

    it('كل أنواع إشعارات المتاجر تقود العميل إلى client-my-orders', () => {
        for (const t of SHOP_TYPES) {
            expect(resolvePushUrl('client', t, ID)).toBe(`/client-my-orders.html?highlight=${ID}`);
        }
    });

    it('معامل highlight يُمرَّر — وإلا هبط العميل على قائمة بلا معرفة أيّ طلب قُصد', () => {
        expect(resolvePushUrl('client', 'shop_order_update', ID)).toContain(`highlight=${ID}`);
        // وبلا معرّف: الصفحة نفسها بلا معامل
        expect(resolvePushUrl('client', 'shop_order_update', null)).toBe('/client-my-orders.html');
    });

    it('🔑 لا مدخل باقٍ يوجّه إلى الصفحة المتقاعدة', () => {
        // ⚠️ نمنع التوجيه لا الذِّكر: التعليقات تسمّي الصفحة القديمة عمداً
        //    ليعرف قارئٌ لاحق لماذا تقاعدت، فمنعُ الاسم نصّاً يُفشل الاختبار
        //    على توثيقٍ صحيح. المُلاحَق هو الاسم داخل نصٍّ برمجي (رابط).
        const URL_LITERAL = /['"`]\/?client-shop-orders\.html/;
        for (const f of ['utils/pushRouting.js',
                         'public_html/service-worker.js',
                         'public_html/js/native-notifications.js']) {
            expect(read(f)).not.toMatch(URL_LITERAL);
        }
    });

    it('الصفحة القديمة تُحوِّل ولا تُحذف — إشعارات قديمة في أجهزة المستخدمين تحملها', () => {
        const stub = read('public_html/client-shop-orders.html');
        expect(stub).toContain("window.location.replace('client-my-orders.html'");
        // ✅ تمرير الاستعلام: بدونه يضيع highlight ويهبط العميل على قائمة عمياء
        expect(stub).toContain('window.location.search');
        // ⚠️ replace لا assign: assign تُبقي الصفحة في السجل فيعيدها زرّ
        //    الرجوع فتُحوّل من جديد — حلقة لا مخرج منها
        expect(stub).not.toMatch(/location\.href\s*=\s*['"`]client-my-orders/);
    });

    it('«طلباتي» تُبرز البطاقة بالمعرّف القادم من الإشعار', () => {
        const page = read('public_html/client-my-orders.html');
        // معرّف بطاقة طلب المتجر هو _id وهو نفسه shopOrderId في استجابة
        // my-orders، وهو ما يحمله relatedId في الإشعار
        expect(page).toContain('id="order-${order._id}"');
        expect(page).toContain("urlParams.get('highlight')");
    });
});
