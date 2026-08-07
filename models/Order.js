const mongoose = require('mongoose');
const logger = require('../utils/logger'); // BUG-L2 FIX: استخدام logger الموحّد بدل console.error

const OrderSchema = new mongoose.Schema(
    {
        client: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        captain: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        // 👇 التعديل الجذري: تفاصيل الاستلام 👇
        pickup: {
            address: { type: String, required: true },
            contactName: { type: String, required: true },
            contactPhone: { type: String, required: true },
            lat: { type: Number },
            lng: { type: Number }
        },

        dropoff: {
            address: { type: String, required: true },
            receiverName: { type: String, required: true },
            receiverPhone: { type: String, required: true },
            lat: { type: Number },
            lng: { type: Number }
        },

        // 🧭 توصيل متعدد النقاط — رحلة واحدة بعدة محطات.
        // pickup/dropoff أعلاه تبقى مرآة لأول استلام وآخر تسليم (توافق كامل مع الكود الحالي).
        // stops مرتّبة: كل الاستلامات أولاً ثم كل التسليمات، بترتيب زيارة الكابتن.
        isMultiStop: { type: Boolean, default: false },
        stops: [{
            type:         { type: String, enum: ['pickup', 'dropoff'], required: true },
            address:      { type: String, required: true },
            contactName:  { type: String, default: '' },
            contactPhone: { type: String, default: '' },
            lat:  { type: Number },
            lng:  { type: Number },
            note: { type: String, default: '' },
            done: { type: Boolean, default: false },   // أكملها الكابتن؟
            doneAt: { type: Date, default: null }
        }],

        details: { type: String },

        // 👇 السعر والمسافة 👇
        distanceType: {
            type: String,
            enum: ['short', 'medium', 'long', 'custom'], // قريب، وسط، بعيد، مخصص
            required: true
        },
        price: { type: Number, required: true }, // السعر الإجمالي
        appFee: { type: Number, default: 0 }, // نسبة التطبيق
        netRevenue: { type: Number, default: 0 }, // صافي ربح الكابتن

        // 🎟️ كوبون الخصم
        promoCode:       { type: String, default: null },  // الكود المستخدم
        discountAmount:  { type: Number, default: 0 },     // قيمة الخصم بالجنيه
        originalPrice:   { type: Number, default: null },  // السعر قبل الخصم

        parcelImage: { type: String }, // 📷 صورة الطرد (اختياري من العميل)
        proofOfPickupImage: { type: String }, // 📸 صورة إثبات الاستلام (إلزامية من الكابتن)


        status: {
            type: String,
            enum: ['pending', 'scheduled', 'accepted', 'picked_up', 'delivered', 'cancelled'],
            default: 'pending',
        },
        scheduledAt: { type: Date, default: null }, // ⏰ طلب مجدول

        // ⏱️ طوابع انتقالات الحالة — تُغذّي الخط الزمني المرئي للعميل.
        // ملاحظة: deliveredAt كان يُكتب في معالج التسليم دون تعريفه هنا، فيُسقطه
        // وضع mongoose الصارم صامتاً (وقت التسليم لم يكن يُحفظ). تعريفه هنا يصلح ذلك.
        acceptedAt:  { type: Date, default: null },
        pickedUpAt:  { type: Date, default: null },
        deliveredAt: { type: Date, default: null },

        // 📣 وقت بثّ الطلب لكل الكباتن (الموجة 2). null = لم يُبَثّ للكل بعد.
        // شبكة الأمان في scheduler تلتقط الطلبات المعلّقة التي ضاع مؤقّت موجتها الثانية.
        dispatchedAllAt: { type: Date, default: null },

        // 🚫 تفاصيل الإلغاء — من ألغى ولماذا
        cancelledBy: { type: String, enum: ['client', 'captain', 'admin', 'system'], default: null },
        cancelReason: { type: String, default: null },
        // رمز ثابت يقابل cancelReason — النص الحر لا يصلح للتجميع الإحصائي،
        // والسؤال الذي نحتاج إجابته ("لماذا يتسرّب العملاء؟") تجميعي بطبعه.
        cancelReasonCode: { type: String, default: null },
        cancelledAt: { type: Date, default: null },

        // ⏳ عتبات التأخير التي أُرسل عنها تنبيه لهذا الطلب (بالدقائق).
        // مصفوفة لا علَم واحد: كل عتبة تُرسل مرة واحدة فقط مهما تكرّر مرور
        // المجدول، ومن دون هذا السجل يتلقّى العميل التنبيه نفسه كل خمس دقائق.
        delayNoticesSent: { type: [Number], default: [] },
        location: {
            lat: { type: Number },
            lng: { type: Number }
        },
        rating: {
            score: { type: Number, min: 1, max: 10 },
            comment: { type: String }
        },
        isRated: { type: Boolean, default: false }, // Prevent repeated rating prompts
        complaint: {
            text: { type: String },
            status: { type: String, enum: ['none', 'pending', 'resolved'], default: 'none' },
            createdAt: { type: Date }
        },

        // 💬 Negotiation System — Multi-Offer (each captain can submit their own)
        negotiations: [{
            captainId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            captainName: { type: String },
            // لقطة من بيانات الكابتن وقت تقديم العرض — لعرض احترافي للعميل
            captainVehicle: { type: String },
            captainRating: { type: Number },
            captainRatingCount: { type: Number },
            captainPhoto: { type: String },
            proposedPrice: { type: Number },
            originalPrice: { type: Number },
            expiresAt: { type: Date },
            status: {
                type: String,
                enum: ['pending', 'accepted', 'rejected', 'expired', 'withdrawn'],
                default: 'pending'
            }
        }],

        // 💬 [Legacy] kept for backward compat — no longer locks the order
        negotiation: {
            isActive: { type: Boolean, default: false },
            captainId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            proposedPrice: { type: Number },
            originalPrice: { type: Number },
            expiresAt: { type: Date },
            status: {
                type: String,
                enum: ['none', 'pending', 'accepted', 'rejected', 'expired'],
                default: 'none'
            }
        },

        // 🛒 Shop/Directory Order Fields
        orderType: {
            type: String,
            // errand = "اشترِ لي": الكابتن يشتري من محل غير مسجّل نيابةً عن العميل
            enum: ['delivery', 'shop', 'errand'],
            default: 'delivery'
        },
        shopOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopOrder' }, // 🔗 ربط بطلب المتجر الأصلي
        shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Place' },
        shopName: { type: String },
        shopPhone: { type: String },
        items: [{ type: String }], // list of requested item names / notes

        // 🛒 خدمة "اشترِ لي" (errand): سعر البضاعة مجهول حتى يصل الكابتن المحل.
        // price (أعلاه) = أجرة الخدمة فقط (عليها العمولة). البضاعة مالٌ يمرّ بين
        // العميل والكابتن نقداً، خارج دفتر التطبيق. حالياً الدفع نقدي (المحفظة لاحقاً).
        errand: {
            budget:        { type: Number, default: null },   // سقف تقديري اختياري من العميل
            goodsQuote:    { type: Number, default: null },   // سعر البضاعة الذي أدخله الكابتن عند المحل
            quoteStatus:   { type: String, enum: ['none', 'quoted', 'confirmed', 'declined'], default: 'none' },
            quotedAt:      { type: Date, default: null },
            respondedAt:   { type: Date, default: null },
            finalGoodsCost:{ type: Number, default: null },   // ما دُفع فعلاً (= goodsQuote عند التأكيد)
            receiptImage:  { type: String, default: null },   // صورة إيصال/بضاعة الشراء
            // 🚕 رسوم انتقال تُسجَّل عند رفض العميل السعر بعد وصول الكابتن (تعويض وقته).
            // تُسجَّل هنا للمتابعة؛ التسوية المالية الفعلية تأتي مع نظام المحفظة لاحقاً.
            tripFee:       { type: Number, default: 0 }
        },

        // 🧾 Pre-payment receipt (shop orders)
        shopOrderDetails: { type: String },      // تفاصيل الطلبية التي اتفق عليها مع المحل
        receiptImage: { type: String },          // صورة إشعار الدفع (base64 أو URL)

        // 🌍 Multi-City Isolation — determines which city's captain pool this
        // order is visible to. Set at creation from req.userCity. Never mutable by client.
        city: {
            type: String,
            enum: ['Khartoum', 'PortSudan'],
            default: 'Khartoum',
            required: true
        }
    },
    { timestamps: true }
);

// ✅ Adding Indexes for Performance
OrderSchema.index({ client: 1 });
OrderSchema.index({ captain: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ captain: 1, status: 1 });       // 🔒 Compound index for trips query
OrderSchema.index({ client: 1, createdAt: -1 });    // 🚀 PERFORMANCE: Queries for "My Orders"
OrderSchema.index({ status: 1, createdAt: -1 });    // 🚀 PERFORMANCE: Captain sorting pending orders
OrderSchema.index({ createdAt: -1 });               // For sorting by date
OrderSchema.index({ scheduledAt: 1, status: 1 });  // ⏰ For scheduled order cron job
// 🌍 City-isolation indexes — CRITICAL: prevent cross-city data leakage at the query level
OrderSchema.index({ city: 1 });                             // Admin city filter
OrderSchema.index({ city: 1, status: 1 });                  // Captain sees only own-city pending orders
OrderSchema.index({ city: 1, status: 1, createdAt: -1 });   // City-scoped sorted pending list
OrderSchema.index({ city: 1, captain: 1, status: 1 });      // Captain's city-scoped active orders
OrderSchema.index({ client: 1, orderType: 1, createdAt: -1 }); // 🚀 BUG-H1 FIX: my-orders pagination (client + type + date)

// 🔄 Sync Order status back to ShopOrder
OrderSchema.post('save', async function(doc) {
    if (doc.shopOrderId) {
        try {
            const ShopOrder = mongoose.model('ShopOrder');
            const shopOrder = await ShopOrder.findById(doc.shopOrderId);
            if (shopOrder) {
                let changed = false;
                if (doc.status === 'accepted' && shopOrder.status !== 'captain_assigned') {
                    shopOrder.status = 'captain_assigned';
                    shopOrder.captain = doc.captain;
                    changed = true;
                } else if (doc.status === 'picked_up' && shopOrder.status !== 'picked_up') {
                    shopOrder.status = 'picked_up';
                    changed = true;
                } else if (doc.status === 'delivered' && shopOrder.status !== 'delivered') {
                    shopOrder.status = 'delivered';
                    shopOrder.deliveredAt = new Date();
                    changed = true;

                    // 💼 ERP: قيد دخل البيع في دفتر أستاذ المتجر (مسار التعديل الإداري).
                    // محمي من الازدواج مع مسار توصيل الكابتن بفهرس فريد على (refId + sale_income).
                    try {
                        const goodsAmount = shopOrder.promoAppliesTo === 'products'
                            ? Math.max(0, shopOrder.itemsTotal - (shopOrder.discountAmount || 0))
                            : shopOrder.itemsTotal;
                        if (goodsAmount > 0 && shopOrder.place) {
                            const { recordLedgerEntry } = require('../utils/erpHelpers');
                            await recordLedgerEntry({
                                placeId: shopOrder.place,
                                type: 'sale_income',
                                amount: goodsAmount,
                                refModel: 'ShopOrder',
                                refId: shopOrder._id,
                                note: 'دخل بيع — توصيل طلب متجر (مزامنة إدارية)'
                            });
                        }
                    } catch (ledgerErr) {
                        logger.error({ err: ledgerErr }, 'Ledger sync (admin path) failed');
                    }
                } else if (doc.status === 'cancelled' && shopOrder.status !== 'cancelled') {
                    shopOrder.status = 'cancelled';
                    shopOrder.cancelledBy = shopOrder.cancelledBy || 'admin';
                    shopOrder.cancelReason = shopOrder.cancelReason || 'إلغاء إداري أو من قبل الكابتن';
                    changed = true;
                    
                    // 📦 استعادة المخزون
                    if (shopOrder.items && shopOrder.items.length > 0) {
                        const Product = mongoose.model('Product');
                        const { recordStockMovement } = require('../utils/erpHelpers');
                        for (const item of shopOrder.items) {
                            if (item.productId) {
                                const prod = await Product.findById(item.productId).select('stock');
                                if (prod && prod.stock !== null && prod.stock !== undefined) {
                                    const restored = await Product.findByIdAndUpdate(item.productId, {
                                        $inc: { stock: item.quantity },
                                        $set: { isAvailable: true }
                                    }, { new: true }).select('stock name');
                                    // 💼 ERP: توثيق حركة الإرجاع (إلغاء إداري/كابتن)
                                    recordStockMovement({
                                        placeId: shopOrder.place, productId: item.productId,
                                        productName: item.name || (restored && restored.name) || '',
                                        type: 'return', quantity: item.quantity,
                                        balanceAfter: restored ? restored.stock : null,
                                        reason: 'إرجاع للمخزون — إلغاء الطلب',
                                        refModel: 'ShopOrder', refId: shopOrder._id
                                    });
                                }
                            }
                        }
                    }
                }
                
                if (changed) {
                    await shopOrder.save();
                }
            }
        } catch (err) {
            logger.error({ err }, 'Error syncing Order to ShopOrder');
        }
    }
});

module.exports = mongoose.model('Order', OrderSchema);