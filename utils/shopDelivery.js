/**
 * 🚚 إنشاء طلب التوصيل المقابل لطلب متجر — مصدرٌ واحد.
 *
 * لماذا فُصل: يُنشأ في موضعين — عند ضغط التاجر "جاهز"، وعند إعادة الأدمن
 * رفعَ طلبٍ عالق. نسختان تعنيان أن تُحسب العمولة بمدينةٍ في مسار وبأخرى في
 * الآخر، أو يُنسى ختمُ المدينة في أحدهما — والنتيجة طلبٌ لا يراه كباتن
 * مدينته ولا يُحاسَب بعمولتها، ولا يظهر الخطأ إلا في الدفتر بعد شهر.
 */

const logger = require('./logger');

/**
 * يبني طلب توصيل من طلب متجر جاهز.
 *
 * 🌍 المدينة تُقرأ من **العميل** لا من المتجر: الطلب يُبثّ لكباتن المدينة
 * التي سيُسلَّم فيها، وعمولتها تُحسب بإعدادات تلك المدينة.
 *
 * @param {object} shopOrder وثيقة ShopOrder (lean أو مستند)
 * @param {object} place وثيقة Place (المتجر)
 * @returns {Promise<object>} مستند Order محفوظ
 */
async function createDeliveryOrder(shopOrder, place) {
    const Order = require('../models/Order');
    const Settings = require('../models/Settings');
    const User = require('../models/User');

    const clientDoc = await User.findById(shopOrder.client).select('city').lean();
    const orderCity = clientDoc && clientDoc.city ? clientDoc.city : 'Khartoum';

    const settings = await Settings.getSettings(orderCity);
    const commissionRate = settings.commissionRate ?? 0.15;

    const deliveryFee = shopOrder.deliveryFee && shopOrder.deliveryFee > 0
        ? shopOrder.deliveryFee
        : (place.defaultDeliveryFee || 500);

    const order = new Order({
        client: shopOrder.client,
        city: orderCity,                 // 🌍 يُختم على الطلب — عليه يقوم كل حصر لاحق
        shopOrderId: shopOrder._id,
        shopId: place._id,
        shopName: place.name,
        shopPhone: place.phone,
        orderType: 'shop',
        pickup: {
            address: place.address || 'عنوان المتجر',
            contactName: place.name,
            contactPhone: place.phone || '0000000000',
            lat: place.location && place.location.lat,
            lng: place.location && place.location.lng
        },
        dropoff: shopOrder.dropoff,
        distanceType: 'custom',
        price: deliveryFee,
        appFee: deliveryFee * commissionRate,
        netRevenue: deliveryFee - (deliveryFee * commissionRate),
        details: shopOrder.notes,
        shopOrderDetails: (shopOrder.items || []).map(i => `${i.quantity}x ${i.name}`).join('، '),
        receiptImage: shopOrder.paymentReceiptImage,
        status: 'pending'                // ليظهر للكباتن
    });

    await order.save();
    return order;
}

/**
 * 🩹 يُعيد رفع طلب متجرٍ عالق للكباتن.
 *
 * «العالق» = ShopOrder على ready_for_pickup بلا طلب توصيل حيّ. خلّفه عطلٌ
 * سابق: أُلغي طلب التوصيل تلقائياً ولم تصل المزامنة، فبقي التاجر والعميل
 * يريان «جاري البحث» بلا أحد قادم.
 *
 * ⚠️ لا يُنشئ طلباً ثانياً إن كان ثمّة طلب حيّ — التكرار يعني كابتنين
 * يذهبان لنفس البضاعة وعمولةً تُحتسب مرّتين.
 *
 * @returns {Promise<{created:boolean, order?:object, reason?:string}>}
 */
async function republishShopOrder(shopOrder, place) {
    const Order = require('../models/Order');

    if (shopOrder.status !== 'ready_for_pickup') {
        return { created: false, reason: 'الطلب ليس في حالة "جاهز للاستلام"' };
    }

    const alive = await Order.findOne({
        shopOrderId: shopOrder._id,
        status: { $in: ['pending', 'scheduled', 'accepted', 'picked_up'] }
    }).select('_id status').lean();

    if (alive) {
        return { created: false, reason: 'يوجد طلب توصيل حيّ لهذا الطلب بالفعل' };
    }

    const order = await createDeliveryOrder(shopOrder, place);
    logger.info({ shopOrderId: String(shopOrder._id), orderId: String(order._id), city: order.city },
        'Republished stuck shop order');
    return { created: true, order };
}

module.exports = { createDeliveryOrder, republishShopOrder };
