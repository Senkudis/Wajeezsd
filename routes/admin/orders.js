// routes/admin/orders.js — مُولّد من تقسيم admin.js الأصلي.
// كل وحدة Router مستقلة تُركّب على /api/admin عبر routes/admin.js.
const express = require('express');
const router = express.Router();
const validateObjectId = require('../../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب)
router.param('id', validateObjectId);
const mongoose = require('mongoose');
const User = require('../../models/User');
const Order = require('../../models/Order');
const Settings = require('../../models/Settings');
const AdminLog = require('../../models/AdminLog');
const PromoCode = require('../../models/PromoCode');
const Rating = require('../../models/Rating');
const Banner = require('../../models/Banner');
const { protect, adminOnly, superAdminOnly, requirePermission, getAdminCityFilter } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { normalizePhone } = require('../../utils/phoneNormalizer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

const SessionRequest = require('../../models/SessionRequest');
const { summarizeNegotiations } = require('../../utils/negotiation');

/**
 * يستبدل مصفوفة negotiations الضخمة بملخّص للعرض في اللوحة.
 * الحمولة الكاملة (لقطة بيانات كل كابتن) لا لزوم لها في جدولٍ من 200 صف،
 * وصفحة تفاصيل الطلب تجلب المستند كاملاً على أي حال.
 */
function withNegotiationSummary(order) {
    const { negotiations, ...rest } = order;
    return { ...rest, negotiationSummary: summarizeNegotiations(negotiations) };
}

/**
 * 🛒 الحقول التي تُميّز طلب المتجر عن التوصيل العادي.
 *
 * ⚠️ كانت محذوفة من select في مساري اللوحة معاً، فتُعرض طلبات المتاجر
 * كتوصيلٍ مجهول المصدر: لا اسم متجر ولا نوع ولا رابطٌ بطلب المتجر — فيتعذّر
 * على المتابعة معرفةُ أيّ طلبٍ يخصّ أيّ تاجر، وهو أوّل ما تحتاجه.
 */
const ORDER_LIST_FIELDS =
    'status price pickup dropoff createdAt client captain type city negotiations ' +
    'orderType shopOrderId shopName escalatedAt';

/**
 * 🛒 طلبات متاجر لم يُنشأ لها طلب توصيل بعد (وصلت التاجر أو قيد التجهيز).
 *
 * بدونها تختفي مرحلةٌ كاملة عن اللوحة: العميل دفع والتاجر يُجهّز، ولا أثر
 * لذلك عند الإدارة حتى يضغط التاجر "جاهز". وهي بالضبط المرحلة التي تحتاج
 * المتابعة فيها أن ترى أين وقف الطلب.
 *
 * 🌍 ShopOrder بلا حقل مدينة، فتُقرأ من العميل ويُطبَّق عليها حصر المدينة يدوياً.
 *
 * @param {object|null} cityFilter مرشّح مدينة الأدمن ({} للمدير العام)
 * @param {number} limit
 */
async function pendingAtMerchantOrders(cityFilter, limit = 100) {
    try {
        const ShopOrder = require('../../models/ShopOrder');
        const raw = await ShopOrder.find({ status: { $in: ['shop_pending', 'shop_preparing'] } })
            .select('status createdAt client place itemsTotal deliveryFee paymentStatus')
            .populate('client', 'name phone city')
            .populate('place', 'name city')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const wantCity = cityFilter && cityFilter.city;
        return raw
            .filter(so => !wantCity || (so.client && so.client.city) === wantCity)
            .map(so => ({
                _id: so._id,
                isShopOnly: true,          // للواجهة: لا طلب توصيل له بعد
                orderType: 'shop',
                shopOrderId: so._id,
                shopName: so.place ? so.place.name : '—',
                status: so.status,
                price: so.deliveryFee || 0,
                totalAmount: so.itemsTotal || 0,
                paymentStatus: so.paymentStatus,
                city: (so.client && so.client.city) || 'Khartoum',
                client: so.client ? { name: so.client.name, phone: so.client.phone } : null,
                captain: null,
                createdAt: so.createdAt
            }));
    } catch (e) {
        // فشل الدمج لا يُسقط قائمة الطلبات الأساسية
        logger.error({ err: e.message }, 'admin orders: shop-only merge failed');
        return [];
    }
}

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

router.get('/orders/live', protect, requirePermission('view_orders'), async (req, res) => {
    try {
        // 🌍 sub_admin يرى طلبات مدينته فقط
        const cityFilter = getAdminCityFilter(req);
        const liveStatuses = ['pending', 'scheduled', 'accepted', 'picked_up'];
        const orders = await Order.find({ status: { $in: liveStatuses }, ...cityFilter })
            .select(ORDER_LIST_FIELDS)
            .populate('client', 'name phone')
            .populate('captain', 'name phone')
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        // 🛒 وطلبات المتاجر التي ما زالت عند التاجر — «نشطة» بكل معنى الكلمة:
        // العميل دفع وينتظر. غيابها عن اللوحة العامة كان يُخفي أكثر المراحل
        // احتياجاً للمتابعة.
        const atMerchant = await pendingAtMerchantOrders(cityFilter, 50);

        // 💬 ملخّص عروض المفاوضة لكل طلب — الإدارة كانت لا ترى المفاوضات إطلاقاً،
        // فطلبٌ عليه ثلاثة عروض يبدو مهملاً تماماً كطلبٍ لم يلتفت إليه أحد.
        res.json(orders.map(withNegotiationSummary).concat(atMerchant).sort(byNewest));
    } catch (error) {
        logger.error("Live Orders Error:", error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/admin/shop-orders
// @desc    🛒 مراقبة طلبات المحلات — كانت الإدارة عمياء تماماً عن مرحلة المتجر
//          (جديد/تجهيز/دفع)؛ لا يظهر لها الطلب إلا بعد الجاهزية كطلب توصيل.
//          يُرجع القائمة مع فلترة الحالة + عدّادات لكل حالة + عزل المدينة.
router.get('/shop-orders', protect, requirePermission('view_orders'), async (req, res) => {
    try {
        const ShopOrder = require('../../models/ShopOrder');
        const Place = require('../../models/Place');

        const page  = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 30);
        const skip  = (page - 1) * limit;

        // 🌍 عزل المدينة: ShopOrder بلا حقل city — نشتقه من متجره
        const cityFilter = getAdminCityFilter(req);
        const reqCity = req.query.city && req.query.city !== 'all' ? req.query.city : null;
        const effectiveCity = cityFilter.city || reqCity; // صلاحية الـ sub_admin تسبق اختيار الفلتر
        let placeScope = null;
        if (effectiveCity) {
            const cityPlaces = await Place.find({ city: effectiveCity }).select('_id').lean();
            placeScope = cityPlaces.map(p => p._id);
        }

        const filter = { status: { $ne: 'chat_initiated' } }; // محادثات بلا طلب لا تُعرض
        if (placeScope) filter.place = { $in: placeScope };
        if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;

        const countFilter = { ...filter };
        delete countFilter.status;
        countFilter.status = { $ne: 'chat_initiated' };

        const [orders, total, countsAgg] = await Promise.all([
            ShopOrder.find(filter)
                .populate('client', 'name phone')
                .populate('place', 'name city phone')
                .populate('captain', 'name phone')
                .sort({ createdAt: -1 })
                .skip(skip).limit(limit)
                .lean(),
            ShopOrder.countDocuments(filter),
            ShopOrder.aggregate([
                { $match: countFilter },
                { $group: { _id: '$status', n: { $sum: 1 } } }
            ])
        ]);

        const counts = {};
        countsAgg.forEach(c => { counts[c._id] = c.n; });

        res.json({ orders, total, counts, currentPage: page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        logger.error('Admin shop-orders error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/admin/shop-orders/:id/cancel-force
// @desc    إلغاء إجباري لطلب المتجر من قبل الإدارة وإرجاع المخزون
router.put('/shop-orders/:id/cancel-force', protect, requirePermission('manage_orders'), async (req, res) => {
    try {
        const ShopOrder = require('../../models/ShopOrder');
        const shopOrder = await ShopOrder.findById(req.params.id);
        if (!shopOrder) return res.status(404).json({ message: 'الطلب غير موجود' });

        if (shopOrder.status === 'cancelled') {
            return res.status(400).json({ message: 'الطلب ملغي مسبقاً' });
        }
        if (shopOrder.status === 'ready_for_pickup' || shopOrder.status === 'captain_assigned' || shopOrder.status === 'picked_up' || shopOrder.status === 'delivered') {
            return res.status(400).json({ message: 'تم إرسال الطلب للتوصيل بالفعل. يرجى إلغاء طلب التوصيل من شاشة الطلبات الرئيسية.' });
        }

        shopOrder.status = 'cancelled';
        shopOrder.cancelledBy = 'admin';
        shopOrder.cancelReason = 'إلغاء إداري (من قِبل لوحة التحكم)';
        shopOrder.cancelledAt = new Date();   // ⏱️ للخط الزمني
        await shopOrder.save();

        // 📦 استعادة المخزون
        if (shopOrder.items && shopOrder.items.length > 0) {
            const Product = require('../../models/Product');
            const { recordStockMovement } = require('../../utils/erpHelpers');
            for (const item of shopOrder.items) {
                if (item.productId) {
                    const prod = await Product.findById(item.productId).select('stock');
                    if (prod && prod.stock !== null && prod.stock !== undefined) {
                        const restored = await Product.findByIdAndUpdate(item.productId, {
                            $inc: { stock: item.quantity },
                            $set: { isAvailable: true }
                        }, { new: true }).select('stock name');
                        // 💼 ERP: توثيق حركة الإرجاع
                        recordStockMovement({
                            placeId: shopOrder.place, productId: item.productId,
                            productName: item.name || (restored && restored.name) || '',
                            type: 'return', quantity: item.quantity,
                            balanceAfter: restored ? restored.stock : null,
                            reason: 'إرجاع للمخزون — إلغاء إداري إجباري',
                            refModel: 'ShopOrder', refId: shopOrder._id,
                            createdBy: req.user._id
                        });
                    }
                }
            }
        }

        const io = req.app.get('io');
        const { sendNotification } = require('../../utils/notificationHelper');

        // Notify client
        if (shopOrder.client) {
            if (io) io.to(shopOrder.client.toString()).emit('order_status_updated', { orderId: shopOrder._id, status: 'cancelled' });
            await sendNotification(req.app, {
                userId: shopOrder.client,
                title: 'تم إلغاء الطلب إدارياً',
                message: `قامت الإدارة بإلغاء طلبك رقم ${shopOrder._id.toString().slice(-6)}.`,
                type: 'order_update',
                relatedId: shopOrder._id
            });
        }

        // Notify merchant
        if (shopOrder.place) {
            const Place = require('../../models/Place');
            const place = await Place.findById(shopOrder.place);
            if (place && place.ownerId) {
                if (io) io.to(place.ownerId.toString()).emit('merchant_order_update', { orderId: shopOrder._id, status: 'cancelled' });
                await sendNotification(req.app, {
                    userId: place.ownerId,
                    title: 'تم إلغاء الطلب إدارياً',
                    message: `قامت الإدارة بإلغاء طلب المتجر رقم ${shopOrder._id.toString().slice(-6)}. تم إرجاع المخزون.`,
                    type: 'order_update',
                    relatedId: shopOrder._id
                });
            }
        }

        res.json({ message: 'تم إلغاء الطلب إجبارياً واستعادة المخزون', order: shopOrder });
    } catch (error) {
        logger.error('Admin shop-order force cancel error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/admin/orders/:id
// @desc    جلب طلب واحد بالتفصيل (لصفحة تفاصيل الطلب)

router.get('/orders/:id', protect, requirePermission('view_orders'), async (req, res) => {
    try {
        // نتحقق من أن الـ id أوبجكت صحيح لتفادي كراش
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ message: 'Not found' });
        }
        const order = await Order.findById(req.params.id)
            .populate('client', 'name phone')
            .populate('captain', 'name phone')
            .lean();
        if (!order) return res.status(404).json({ message: 'Not found' });
        // 🌍 sub_admin لا يرى طلباً خارج مدينته
        if (req.user.adminRole === 'sub_admin' && order.city !== req.user.city) {
            return res.status(403).json({ message: 'غير مصرح — هذا الطلب خارج مدينتك' });
        }
        // 📊 إثراء بالخط الزمني و ETA — مصدر مشترك مع بقية المسارات
        require('../../utils/orderEnrich').enrichOrder(order);
        res.json(order);
    } catch (error) {
        logger.error("Order Details Error:", error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/admin/orders
// @desc    جلب جميع الطلبات (مع فلتر اختياري بالمدينة)
// 🌍 ?city=Khartoum | PortSudan (optional)

router.get('/orders', protect, requirePermission('view_orders'), async (req, res) => {
    try {
        // 🌍 sub_admin يرى طلبات مدينته فقط
        const cityFilter = getAdminCityFilter(req);

        const orders = await Order.find(cityFilter)
            .select(ORDER_LIST_FIELDS + ' totalAmount cancelledBy cancelReason')
            .populate('client', 'name phone')
            .populate('captain', 'name phone')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        const pendingAtMerchant = await pendingAtMerchantOrders(cityFilter, 100);

        const merged = orders.map(withNegotiationSummary).concat(pendingAtMerchant)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(merged);
    } catch (error) {
        logger.error("Orders Error:", error);
        res.status(500).json({ message: 'Server error' });
    }
});

// =========================================================
// 🚩 الجزء الرابع: الشكاوى
// =========================================================

// @route   GET /api/admin/complaints
// @desc    جلب الطلبات التي بها شكاوى

router.put('/orders/:id/cancel-force', protect, requirePermission('manage_orders'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        if (order.status === 'delivered') {
            return res.status(400).json({ message: 'لا يمكن إلغاء طلب تم توصيله بالفعل' });
        }
        if (order.status === 'cancelled') {
            return res.status(400).json({ message: 'الطلب ملغي مسبقاً' });
        }

        // 🚀 FIX 4: Send all missing notifications on admin force-cancel
        const io = req.app.get('io');
        const { sendNotification } = require('../../utils/notificationHelper');
        
        order.status = 'cancelled';
        
        // Notify negotiating captains — collect capIds first, emit AFTER save
        const pendingCapIds = [];
        if (order.negotiations && order.negotiations.length > 0) {
            for (let i = 0; i < order.negotiations.length; i++) {
                if (order.negotiations[i].status === 'pending') {
                    order.negotiations[i].status = 'rejected';
                    const capId = order.negotiations[i].captainId;
                    if (capId) pendingCapIds.push(capId);
                }
            }
        }
        await order.save();

        // BUG #18 FIX: All socket emits and notifications are now AFTER save
        for (const capId of pendingCapIds) {
            if (io) {
                io.to(capId.toString()).emit('negotiation_resolved', {
                    orderId: order._id,
                    result: 'order_taken'
                });
            }
        }

        // Notify client
        if (order.client) {
            if (io) io.to(order.client.toString()).emit('order_status_updated', { orderId: order._id, status: 'cancelled' });
            await sendNotification(req.app, {
                userId: order.client,
                title: 'تم إلغاء الطلب إدارياً',
                message: `قامت الإدارة بإلغاء طلبك رقم ${order._id.toString().slice(-6)}.`,
                type: 'order_update',
                relatedId: order._id
            });
        }
        
        // Notify assigned captain if any
        if (order.captain) {
            if (io) io.to(order.captain.toString()).emit('order_status_updated', { orderId: order._id, status: 'cancelled' });
            await sendNotification(req.app, {
                userId: order.captain,
                title: 'تم إلغاء الطلب إدارياً',
                message: `قامت الإدارة بإلغاء الطلب الذي تم تعيينه لك.`,
                type: 'order_update',
                relatedId: order._id
            });
        }
        
        // Broadcast to admin panel only (not to all clients)
        if (io) io.to('admin_room').emit('admin_order_update', { orderId: order._id, status: 'cancelled', city: order.city });

        await logAdminAction(req, 'delete_order', `إلغاء طلب إدارياً`, order._id, `طلب #${order._id.toString().slice(-6)}`);

        res.json({ message: 'تم إلغاء الطلب إجبارياً بواسطة الإدارة وإشعار الأطراف', order });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 🔄 تبديل الكابتن على طلب نشط (Admin Reassign)
// @route   PUT /api/admin/orders/:id/reassign-captain
// body: { newCaptainId: '...' }
// =========================================================

router.put('/orders/:id/reassign-captain', protect, requirePermission('manage_orders'), async (req, res) => {
    try {
        const { sendNotification } = require('../../utils/notificationHelper');
        const { newCaptainId } = req.body;
        if (!newCaptainId) return res.status(400).json({ message: 'يرجى تحديد الكابتن الجديد' });

        const order = await Order.findById(req.params.id).populate('captain', 'name');
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        // ✅ pending مسموح الآن: هذا هو **التعيين اليدوي** — الحالة التي يحتاجها
        // الأدمن أكثر من غيرها. كان المسار يرفضها، فيقف أمام طلبٍ لا يلتقطه
        // أحد بلا حيلة إلا الإلغاء. تعيين كابتن على طلب معلّق ينقله إلى
        // 'accepted' كما لو قبِله بنفسه.
        if (!['pending', 'accepted', 'picked_up'].includes(order.status)) {
            return res.status(400).json({ message: 'لا يمكن تعيين كابتن على طلب منتهٍ أو ملغى' });
        }
        const isManualAssign = order.status === 'pending';

        const newCaptain = await User.findById(newCaptainId).select('name phone role is_blocked');
        if (!newCaptain || newCaptain.role !== 'captain') {
            return res.status(404).json({ message: 'الكابتن الجديد غير موجود' });
        }

        // 🚀 FIX 5: Prevent reassigning to a blocked captain
        if (newCaptain.is_blocked) {
            return res.status(400).json({ message: 'لا يمكن إسناد الطلب لهذا الكابتن لأن حسابه محظور (تجاوز الحد الائتماني)' });
        }

        const oldCaptainId = order.captain?._id;
        const oldCaptainName = order.captain?.name || 'الكابتن السابق';

        // 🌍 حصر المدينة: كابتن بورتسودان لا يُعيَّن على طلب الخرطوم. لا يمنعه
        // شيء تقنياً، والنتيجة طلبٌ مسنَدٌ لمن لا يستطيع الوصول إليه أصلاً.
        const capCity = await User.findById(newCaptainId).select('city').lean();
        if (capCity && capCity.city && order.city && capCity.city !== order.city) {
            return res.status(400).json({
                message: `الكابتن من ${capCity.city === 'PortSudan' ? 'بورتسودان' : 'الخرطوم'} والطلب في ${order.city === 'PortSudan' ? 'بورتسودان' : 'الخرطوم'}`
            });
        }

        // Reassign
        order.captain = newCaptainId;
        // التعيين اليدوي على طلب معلّق ينقله لحالة "مقبول" — وبحفظه عبر save()
        // يمرّ على خطّاف المزامنة فيصير ShopOrder = captain_assigned تلقائياً
        if (isManualAssign) order.status = 'accepted';
        await order.save();

        const io = req.app.get('io');

        // Notify OLD captain
        if (oldCaptainId) {
            if (io) {
                io.to(oldCaptainId.toString()).emit('order_status_updated', {
                    orderId: order._id,
                    status: 'reassigned'
                });
            }
            await sendNotification(req.app, {
                userId: oldCaptainId,
                title: 'تم نقل الطلب',
                message: `قامت الإدارة بنقل الطلب #${order._id.toString().slice(-6)} إلى كابتن آخر.`,
                type: 'order_update',
                relatedId: order._id
            });
        }

        // Notify NEW captain
        if (io) {
            io.to(newCaptainId.toString()).emit('order_reassigned', {
                orderId: order._id,
                message: 'تم تعيينك على طلب من قِبل الإدارة'
            });
        }
        await sendNotification(req.app, {
            userId: newCaptainId,
            title: 'تم تعيينك على طلب',
            message: `قامت الإدارة بتعيينك على الطلب #${order._id.toString().slice(-6)}.`,
            type: 'order_accepted',
            relatedId: order._id
        });

        // Notify client
        if (io) {
            io.to(order.client.toString()).emit('new_notification', {
                title: 'تم تغيير الكابتن',
                message: `قامت الإدارة بتعيين الكابتن ${newCaptain.name} على طلبك.`,
                type: 'order_update'
            });
        }

        res.json({
            message: isManualAssign
                ? `تم تعيين ${newCaptain.name} على الطلب`
                : `تم تحويل الطلب من ${oldCaptainName} إلى ${newCaptain.name} بنجاح`,
            manualAssign: isManualAssign,
            order
        });
    } catch (error) {
        logger.error({ err: error }, 'Reassign Captain Error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 📣 تذكير كباتن المدينة بطلبٍ معلّق — Admin
// @route   POST /api/admin/orders/:id/remind-captains
// =========================================================
//
// نظير زرّ التاجر، لكن **بلا مهلة**: الأدمن يتدخّل عند عطلٍ قائم، وتقييده
// بخمس دقائق يعطّل معالجةً عاجلة. الحدّ هنا صلاحيةُ manage_orders نفسها.
router.post('/orders/:id/remind-captains', protect, requirePermission('manage_orders'), async (req, res) => {
    try {
        const { notifyCityCaptains } = require('../../utils/captainBroadcast');

        const order = await Order.findById(req.params.id).select('status city price shopName orderType').lean();
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
        if (order.status !== 'pending') {
            return res.status(400).json({ message: 'الطلب ليس معلّقاً — لا حاجة لتنبيه الكباتن' });
        }

        // 🌍 sub_admin لا يُنبّه كباتن مدينة أخرى
        const cityFilter = getAdminCityFilter(req);
        if (cityFilter && cityFilter.city && cityFilter.city !== order.city) {
            return res.status(403).json({ message: 'هذا الطلب خارج مدينتك' });
        }

        const isShop = order.orderType === 'shop';
        const result = await notifyCityCaptains(req.app, {
            city: order.city,
            title: isShop ? '🛒 طلب محل ينتظر كابتن' : '📦 طلب ينتظر كابتن',
            body: `${isShop ? `طلب من ${order.shopName || 'متجر'}` : 'طلب توصيل'} بأجرة ${order.price} ج.س ما زال متاحاً.`,
            data: {
                type: isShop ? 'shop_order' : 'new_order',
                orderId: String(order._id),
                url: `/captain-orders.html?highlight=${order._id}`
            },
            socketEvent: isShop ? 'shop_order_available' : 'new_order_available',
            socketPayload: { orderId: order._id, shopName: order.shopName, price: order.price, kind: 'admin_reminder' }
        });

        await logAdminAction(req, 'remind_captains', `تنبيه كباتن ${result.city} لطلب ${String(order._id).slice(-6)}`, order._id);

        res.json({
            message: result.targeted
                ? `تم تنبيه ${result.targeted} كابتن`
                : 'لا يوجد كباتن متاحون في هذه المدينة',
            targeted: result.targeted
        });
    } catch (error) {
        logger.error({ err: error.message }, 'Admin remind captains error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 💳 إدارة مديونية كابتن (تصفير / نقص جزء / إضافة دين) — Admin Debt Adjust
// @route   PUT /api/admin/captains/:id/adjust-debt
// body: { mode: 'zero' | 'partial' | 'add', amount?: number, note?: string }
// =========================================================
// mode=zero   => reset balance to 0
// mode=partial => reduce debt by `amount` (bring closer to 0)
// mode=add     => add debt by `amount` (push balance further negative)

router.delete('/orders/:id', protect, requirePermission('manage_orders'), async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        // ✅ Emit socket events — city-scoped for captain broadcasts, admin_room for admin feed
        const io = req.app.get('io');
        if (io) {
            // Refresh captain list for THIS city only
            io.to(`room_${order.city || 'Khartoum'}`).emit('new_order_available');
            if (order.client) io.to(order.client.toString()).emit('order_status_updated', { orderId: order._id, status: 'deleted' });
            if (order.captain) io.to(order.captain.toString()).emit('order_status_updated', { orderId: order._id, status: 'deleted' });
            io.to('admin_room').emit('admin_order_update', { orderId: order._id, status: 'deleted', city: order.city });
        }

        res.json({ message: 'تم حذف الطلب بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/orders/:id
// @desc    تعديل بيانات الطلب شاملة

router.put('/orders/:id', protect, requirePermission('manage_orders'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        const oldStatus = order.status; // ✅ Track old status to detect changes

        // تحديث الحقول المسموح بها
        if (req.body.status) order.status = req.body.status;
        if (req.body.price !== undefined) {
            order.price = req.body.price;
            // ✅ FIX #9: Auto-recalculate appFee & netRevenue when price changes
            try {
                // 🌍 Use the order's city to get the correct commission rate
                const liveSettings = await Settings.getSettings(order.city || 'Khartoum');
                const commissionRate = liveSettings.commissionRate ?? 0.15;
                order.appFee = order.price * commissionRate;
                order.netRevenue = order.price - order.appFee;
            } catch (settingsErr) {
                logger.warn('Could not load settings for fee recalculation, keeping existing fees');
            }

        }
        // Only allow explicit appFee override if price was NOT changed
        if (req.body.appFee !== undefined && req.body.price === undefined) order.appFee = req.body.appFee;

        // تحديث تفاصيل الاستلام والتسليم إذا وجدت
        if (req.body.pickup) order.pickup = { ...order.pickup, ...req.body.pickup };
        if (req.body.dropoff) order.dropoff = { ...order.dropoff, ...req.body.dropoff };

        await order.save();

        // ✅ Emit socket event and notify if status changed (e.g. restored from cancelled)
        if (oldStatus !== order.status) {
            
            // 💰 Commission Deduction & Refund Logic (When Admin manually completes/cancels an order)
            if ((order.status === 'completed' || order.status === 'delivered') && order.captain && oldStatus !== 'completed' && oldStatus !== 'delivered') {
                try {
                    const commissionAmount = order.appFee || 0;
                    if (commissionAmount > 0) {
                        const liveSettings = await Settings.getSettings(order.city || 'Khartoum');
                        const creditLimit = liveSettings?.defaultCreditLimit ?? -5000;
                        const updatedCaptainBefore = await User.findByIdAndUpdate(
                            order.captain,
                            [
                                { $set: { wallet_balance: { $subtract: ["$wallet_balance", commissionAmount] } } },
                                { $set: { is_blocked: { $cond: { if: { $lte: ["$wallet_balance", creditLimit] }, then: true, else: "$is_blocked" } } } }
                            ],
                            { new: false }
                        );
                        const updatedCaptain = await User.findById(order.captain);
                        if (updatedCaptain) {
                            logger.info({ admin: req.user._id, captainId: updatedCaptain._id, orderId: order._id, deducted: commissionAmount, newBalance: updatedCaptain.wallet_balance }, 'Admin completed order — Commission deducted');
                            
                            if (updatedCaptainBefore && !updatedCaptainBefore.is_blocked && updatedCaptain.is_blocked) {
                                const ioForBlock = req.app.get('io');
                                if (ioForBlock) {
                                    ioForBlock.to(updatedCaptain._id.toString()).emit('wallet_limit_reached', {
                                        wallet_balance: updatedCaptain.wallet_balance,
                                        credit_limit: creditLimit,
                                        message: 'تجاوزت الحد الائتماني — تم إيقاف حسابك.'
                                    });
                                }
                            }
                        }
                    }
                } catch (err) { logger.error({ err, orderId: order._id }, 'Failed to deduct commission on admin update'); }
            } else if ((oldStatus === 'completed' || oldStatus === 'delivered') && (order.status === 'cancelled' || order.status === 'pending') && order.captain) {
                // 🔄 Refund if admin reverts a completed order
                try {
                    const commissionAmount = order.appFee || 0;
                    if (commissionAmount > 0) {
                        const updatedCaptain = await User.findByIdAndUpdate(
                            order.captain,
                            { $inc: { wallet_balance: commissionAmount } },
                            { new: true }
                        );
                        if (updatedCaptain) {
                            logger.info({ admin: req.user._id, captainId: updatedCaptain._id, orderId: order._id, refunded: commissionAmount, newBalance: updatedCaptain.wallet_balance }, 'Admin reverted completed order — Commission refunded');
                            
                            const liveSettings = await Settings.getSettings(order.city || 'Khartoum');
                            const creditLimit = liveSettings?.defaultCreditLimit ?? -5000;
                            if (updatedCaptain.wallet_balance > creditLimit && updatedCaptain.is_blocked) {
                                updatedCaptain.is_blocked = false;
                                await updatedCaptain.save();
                            }
                        }
                    }
                } catch (err) { logger.error({ err, orderId: order._id }, 'Failed to refund commission on admin update'); }
            }

            const io = req.app.get('io');
            const { sendNotification } = require('../../utils/notificationHelper');
            
            if (io) {
                io.to('admin_room').emit('admin_order_update', { orderId: order._id, status: order.status, city: order.city });
                if (order.status === 'pending' || order.status === 'scheduled') {
                    // Reopen: notify captains in THIS city only
                    io.to(`room_${order.city || 'Khartoum'}`).emit('new_order_available');
                }
            }
            
            if (order.client) {
                if (io) io.to(order.client.toString()).emit('order_status_updated', { orderId: order._id, status: order.status });
                await sendNotification(req.app, {
                    userId: order.client,
                    title: 'تحديث حالة الطلب',
                    message: `تم تغيير حالة طلبك رقم ${order._id.toString().slice(-6)} إدارياً إلى: ${order.status}`,
                    type: 'order_update',
                    relatedId: order._id
                });
            }
            if (order.captain) {
                if (io) io.to(order.captain.toString()).emit('order_status_updated', { orderId: order._id, status: order.status });
                await sendNotification(req.app, {
                    userId: order.captain,
                    title: 'تحديث حالة الطلب',
                    message: `تم تغيير حالة الطلب رقم ${order._id.toString().slice(-6)} إدارياً إلى: ${order.status}`,
                    type: 'order_update',
                    relatedId: order._id
                });
            }
        }

        res.json({ message: 'تم تحديث الطلب بنجاح', order });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
