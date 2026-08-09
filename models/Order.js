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
        // ⚠️ طلب متجر طال انتظاره كابتناً فصُعِّد للإدارة وأُعيد بثّه.
        // يُختم مرّة واحدة: التصعيد تنبيهٌ لا حالة، وتكراره كل ساعة إزعاج.
        escalatedAt: { type: Date, default: null },

        // ⏳ مفاتيح تنبيهات التأخير المُرسلة لهذا الطلب ('delay1' / 'delay2').
        // مصفوفة لا علَم واحد: كل عتبة تُرسل مرة واحدة فقط مهما تكرّر مرور
        // المجدول، ومن دون هذا السجل يتلقّى العميل التنبيه نفسه كل خمس دقائق.
        //
        // النوع String لا Number: العتبات صارت قابلة للضبط من لوحة الإدارة،
        // فلو كان المفتاح هو الرقم لأدّى تعديل ٣٠ إلى ٤٥ إلى إعادة إشعار كل
        // طلب سبق إشعاره. وثائق قديمة قد تحمل أرقاماً — scheduler.js يترجمها.
        delayNoticesSent: { type: [String], default: [] },

        // 🏍️ تنبيهات الكابتن المُرسلة لهذا الطلب — مفاتيح نصّية مثل
        // 'pickup_15' و'deliver_30' و'gps_stale'. نصّية لا رقمية لأن
        // العتبات هنا تنتمي لمراحل مختلفة، والرقم وحده لا يميّز
        // "٣٠ دقيقة بلا استلام" عن "٣٠ دقيقة بلا تسليم".
        captainNudges: { type: [String], default: [] },
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
            // ✅ موافقة مسبقة: «اشترِ بلا سؤال ما دام ضمن ميزانيتي».
            // لماذا: الحالة الشائعة أن السعر ضمن التوقّع، فجولةُ سؤالٍ كاملة تُبقي
            // الكابتن واقفاً في المحل وتُبقي العميل ينتظر إشعاراً قد لا يراه أصلاً.
            autoApprove:   { type: Boolean, default: false },
            goodsQuote:    { type: Number, default: null },   // سعر البضاعة الذي أدخله الكابتن عند المحل
            // expired = مضت مهلة الردّ بلا جواب من العميل (انظر مؤقّت العرض في scheduler.js)
            quoteStatus:   { type: String, enum: ['none', 'quoted', 'confirmed', 'declined', 'expired'], default: 'none' },
            quotedAt:      { type: Date, default: null },
            reminderSentAt:{ type: Date, default: null },     // تذكير الردّ — مرة واحدة لا كل دقيقة
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

/**
 * 🔗 نفس المزامنة على مسار التحديث المباشر.
 *
 * ⚠️ العطل الذي يُغلقه هذا: خطّاف post('save') أعلاه لا يُنفَّذ إطلاقاً مع
 * findByIdAndUpdate / findOneAndUpdate / updateOne — وهي الطريقة المستعملة في
 * أربعة عشر موضعاً عبر المشروع، منها إلغاءُ المجدول للطلبات المعلّقة.
 *
 * النتيجة المرصودة فعلياً: طلبُ متجرٍ جُهّز ورُفع للكباتن، ألغاه المجدول بعد
 * ست ساعات، فاختفى من الكباتن — بينما بقي ShopOrder على ready_for_pickup،
 * فظلّ التاجر والعميل يريان «جاري البحث عن كابتن» إلى الأبد. طلبٌ ميّتٌ
 * يبدو حيّاً لطرفين، وحيٌّ يبدو ميّتاً لطرفٍ ثالث.
 *
 * نُعيد تحميل الوثيقة ونحفظها بـ save() ليمرّ التحديث بنفس الخطّاف الواحد،
 * فلا يفترق المنطقان.
 */
OrderSchema.post(['findOneAndUpdate', 'updateOne', 'updateMany'], async function () {
    try {
        // 🎯 حصرٌ على تحديثات الحالة وحدها: أغلب التحديثات تمسّ الموقع أو
        // الطوابع أو عدّادات، وإعادةُ حفظ الوثيقة لأجلها هدرٌ خالص.
        const update = this.getUpdate ? (this.getUpdate() || {}) : {};
        const fields = { ...(update.$set || {}), ...update };
        if (!Object.prototype.hasOwnProperty.call(fields, 'status')) return;

        const Order = mongoose.model('Order');
        // 🔒 السقف يحمي من تحديثٍ جماعي واسع يُترجَم إلى مئات الحفظات
        const docs = await Order.find({
            ...(this.getFilter ? this.getFilter() : {}),
            shopOrderId: { $ne: null }
        }).select('_id').limit(50).lean();

        for (const d of docs) {
            // إعادة الحفظ تُطلق post('save') فتجري المزامنة الكاملة (حالة،
            // كابتن، مخزون، دفتر أستاذ) بلا نسخِ منطقها هنا
            const fresh = await Order.findById(d._id);
            if (fresh) await fresh.save();
        }
    } catch (err) {
        logger.error({ err }, 'Error syncing Order to ShopOrder (update path)');
    }
});

module.exports = mongoose.model('Order', OrderSchema);