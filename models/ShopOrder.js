const mongoose = require('mongoose');

// دورة حياة طلب المتجر:
// shop_pending (وصل للتاجر) -> shop_preparing (التاجر قبل وبدأ التجهيز)
// -> ready_for_pickup (جاهز، ينتظر كابتن) -> captain_assigned (كابتن قبل)
// -> picked_up (كابتن استلم من المتجر) -> delivered (وصل للعميل) | cancelled

const ShopOrderSchema = new mongoose.Schema({
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    place: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        // 💼 ERP: لقطة (snapshot) لتكلفة المنتج وقت الطلب — تبقى تقارير الأرباح
        // دقيقة تاريخياً حتى لو عدّل التاجر سعر التكلفة لاحقاً
        cost: { type: Number, default: 0 },
        quantity: { type: Number, default: 1 },
        subtotal: { type: Number }
    }],

    itemsTotal:   { type: Number, required: true },   // إجمالي المنتجات
    deliveryFee:  { type: Number, default: 0 },       // رسوم التوصيل
    totalAmount:  { type: Number, required: true },   // الإجمالي الكلي

    // 🎟️ كوبون الخصم
    promoCode:      { type: String, default: null },  // الكود المستخدم
    discountAmount: { type: Number, default: 0 },     // قيمة الخصم بالجنيه
    originalTotal:  { type: Number, default: null },  // الإجمالي قبل الخصم
    // نطاق الخصم: products = على البضاعة، delivery = على التوصيل، total = على الإجمالي
    promoAppliesTo: { type: String, enum: ['total', 'products', 'delivery'], default: 'total' },

    // عنوان التوصيل
    dropoff: {
        address: { type: String, required: false, default: 'غير محدد بعد' },
        receiverName: { type: String, required: false, default: 'العميل' },
        receiverPhone: { type: String, required: false, default: '0000000000' },
        lat: { type: Number, default: 0 },
        lng: { type: Number, default: 0 }
    },

    notes: { type: String, default: '' }, // ملاحظات إضافية

    // 💳 الدفع — بدون محفظة: العميل يرسل إشعار الدفع في المحادثة
    paymentStatus: {
        type: String,
        enum: ['pending', 'receipt_sent', 'confirmed', 'failed'],
        default: 'pending'
    },
    paymentReceiptImage: { type: String, default: null }, // صورة إشعار الدفع

    status: {
        type: String,
        enum: [
            'chat_initiated',    // 💬 محادثة مباشرة بدون طلب
            'shop_pending',      // وصل الطلب للتاجر
            'shop_preparing',    // التاجر قبل وبدأ التجهيز
            'ready_for_pickup',  // جاهز، ينتظر كابتن
            'captain_assigned',  // كابتن اختار الطلب
            'picked_up',         // كابتن استلم من المتجر
            'delivered',         // تم التوصيل
            'cancelled'
        ],
        default: 'shop_pending'
    },

    cancelledBy: { type: String, enum: ['client', 'merchant', 'admin'], default: null },
    cancelReason: { type: String, default: '' },

    proofOfPickupImage: { type: String, default: null }, // صورة إثبات الاستلام
    // ⏱️ طوابع انتقالات الحالة — تُغذّي الخط الزمني المرئي (نظير طوابع Order)
    merchantConfirmedAt: { type: Date, default: null }, // التاجر قبل وبدأ التجهيز
    readyAt:             { type: Date, default: null }, // جاهز للاستلام
    captainAssignedAt:   { type: Date, default: null }, // كابتن قبل الطلب
    pickedUpAt:          { type: Date, default: null }, // كابتن استلم من المتجر
    deliveredAt:         { type: Date, default: null }, // وصل للعميل
    cancelledAt:         { type: Date, default: null }, // أُلغي

}, { timestamps: true });

ShopOrderSchema.index({ client: 1, createdAt: -1 });
ShopOrderSchema.index({ place: 1, status: 1 });
ShopOrderSchema.index({ captain: 1, status: 1 });
ShopOrderSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ShopOrder', ShopOrderSchema);
