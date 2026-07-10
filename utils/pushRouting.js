// 🧭 موجّه روابط الإشعارات — مصدر الحقيقة الوحيد لوجهة نقرة الـ push.
// المشكلة الأصلية: معالجات النقر (service-worker.js / native-notifications.js)
// كانت توجّه حسب "نوع" الإشعار فقط، والنوع الواحد (مثل order_update) يصل
// لأدوار مختلفة (عميل/كابتن/تاجر) — فيهبط المستخدم في صفحة دور آخر.
// الحل: السيرفر يعرف دور المستقبِل، فيحسب الرابط هنا ويرسله في data.url —
// وكلا المعالجَين يعطيان data.url الأولوية على خرائط الأنواع المحلية.

/**
 * @param {string} role - دور المستقبِل: client | captain | merchant | admin
 * @param {string} type - نوع الإشعار
 * @param {string|null} relatedId - معرّف السجل المرتبط (طلب/منتج/تسوية...)
 * @returns {string} مسار نسبي يبدأ بـ /
 */
function resolvePushUrl(role, type, relatedId) {
    const r = relatedId ? relatedId.toString() : '';

    // المحادثات موحّدة لكل الأدوار (chat.html تخدم العميل والكابتن والتاجر)
    if (type === 'chat' || type === 'chat_message') {
        return r ? `/chat.html?orderId=${r}` : '/conversations.html';
    }

    switch (role) {
        case 'client':
            switch (type) {
                case 'order_completed':
                    return r ? `/client-my-orders.html?rateOrder=${r}` : '/client-my-orders.html';
                case 'shop_order_update':
                case 'payment_confirmed':
                case 'payment_reminder':
                case 'shop_order':
                    return `/client-shop-orders.html${r ? `?highlight=${r}` : ''}`;
                case 'order_update':
                case 'order_accepted':
                case 'order_delivered':
                case 'order_cancelled':
                case 'order_expired':
                    return r ? `/tracking.html?orderId=${r}` : '/client-my-orders.html';
                default:
                    return '/notifications.html';
            }

        case 'captain':
            switch (type) {
                case 'new_order':
                case 'shop_order':
                case 'offer_expired':
                case 'offer_expiry_reminder':
                case 'order_expired':
                    return `/captain-orders.html${r ? `?highlight=${r}` : ''}`;
                case 'order_assigned':
                case 'negotiation_accepted':
                case 'order_accepted':
                case 'order_update':
                case 'order_cancelled':
                    return '/captain-missions.html';
                case 'wallet_update':
                case 'payment_approved':
                case 'payment_rejected':
                    return '/captain-wallet.html';
                default:
                    return '/captain-notifications.html';
            }

        case 'merchant':
            switch (type) {
                case 'new_shop_order':
                case 'payment_receipt':
                case 'shop_order_update':
                case 'order_update':
                case 'shop_order':
                case 'order_cancelled':
                    return `/merchant-orders.html${r ? `?highlight=${r}` : ''}`;
                case 'low_stock':
                    return '/merchant-inventory.html';
                case 'shop_ledger':
                case 'settlement_approved':
                case 'settlement_rejected':
                    return '/merchant-finance.html';
                case 'tier_change':
                    return '/merchant-dashboard.html';
                default:
                    return '/merchant-notifications.html';
            }

        case 'admin':
            switch (type) {
                case 'merchant_request':
                    return '/admin-merchant-requests.html';
                case 'settlement_request':
                    return '/admin-settlements.html';
                case 'emergency':
                    return '/admin-live-map.html';
                case 'payment_receipt':
                case 'payment_request':
                    return '/admin-finance.html';
                case 'shop_order':
                case 'admin_order_alert':
                default:
                    return '/admin.html';
            }

        default:
            return '/notifications.html';
    }
}

module.exports = { resolvePushUrl };
