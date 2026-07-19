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

    it('العميل: تحديث الطلب يفتح التتبّع بالطلب المحدّد', () => {
        expect(resolvePushUrl('client', 'order_update', 'O')).toBe('/tracking.html?orderId=O');
        expect(resolvePushUrl('client', 'order_completed', 'O')).toBe('/client-my-orders.html?rateOrder=O');
    });

    it('الكابتن: طلب جديد يفتح قائمة الطلبات مع تحديد الطلب', () => {
        expect(resolvePushUrl('captain', 'new_order', 'O')).toBe('/captain-orders.html?highlight=O');
    });

    it('التاجر: طلب متجر يفتح طلبات التاجر مع تحديده', () => {
        expect(resolvePushUrl('merchant', 'shop_order_update', 'O')).toBe('/merchant-orders.html?highlight=O');
        expect(resolvePushUrl('merchant', 'low_stock', 'P')).toBe('/merchant-inventory.html');
    });

    it('نوع غير معروف يسقط لصفحة إشعارات الدور (لا كسر ولا وجهة خاطئة خطرة)', () => {
        expect(resolvePushUrl('client', 'some_unknown', 'X')).toBe('/notifications.html');
        expect(resolvePushUrl('captain', 'some_unknown', 'X')).toBe('/captain-notifications.html');
        expect(resolvePushUrl('merchant', 'some_unknown', 'X')).toBe('/merchant-notifications.html');
        expect(resolvePushUrl('admin', 'some_unknown', 'X')).toBe('/admin.html');
    });
});
