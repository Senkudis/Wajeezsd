const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const PromoCode = require('../models/PromoCode');
const { protect, captainOnly, clientOnly } = require('../middleware/authMiddleware');
const { requireCity } = require('../middleware/cityMiddleware');
const { validateOrder } = require('../middleware/validateMiddleware');
const nodemailer = require('nodemailer');
const { sendNotification, notifyAdmins } = require('../utils/notificationHelper');
const { sendWhatsAppIfSubscribed, OrderMessages } = require('../utils/whatsappNotificationHelper');
const rateLimit = require('express-rate-limit');
const { saveBase64Image } = require('../utils/imageUpload');
const { validateOrderLocations } = require('../utils/geofence');
const logger = require('../utils/logger');

// ⚡ Settings cache — per-city Map, refresh every 60 seconds to avoid repeated DB queries
// Structure: Map<city, { data: settingsObj, time: timestamp }>
const _settingsCache = new Map();
const CACHE_TTL = 60_000;

async function getCachedSettings(city = 'Khartoum') {
    const cached = _settingsCache.get(city);
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
    const data = await Settings.getSettings(city);
    _settingsCache.set(city, { data, time: Date.now() });
    return data;
}

// Rate Limiter للطلبات الجديدة
const createOrderLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // ✅ 5 minutes
    max: 5, // 5 requests per 5 minutes
    message: { message: 'لقد تجاوزت الحد المسموح به. يرجى الانتظار 5 دقائق.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false }
});

// Rate Limiter للمفاوضات لمنع الإغراق
const negotiateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // 30 requests per 5 minutes
    message: { message: 'لقد تجاوزت الحد المسموح به لمحاولات التفاوض. يرجى الانتظار 5 دقائق.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false }
});

// Rate Limiter للتقييمات
const ratingLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: { message: 'يرجى الانتظار قليلاً قبل إرسال تقييم جديد.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false }
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// @route   POST /api/orders
// @desc    Create a new order (with duplicate check)
// 🌍 requireCity: validates the user has a city, stamps it on the order,
//            and rejects body.city spoofing attempts.
router.post('/', protect, requireCity, createOrderLimiter, validateOrder, async (req, res) => {
    try {
        // ملاحظة: discountAmount لا يُقرأ من العميل عمداً — يُحسب خادمياً أدناه.
        const { pickup, dropoff, details, price, distanceType, scheduledAt, orderType, shopId, shopName, shopPhone, items, promoCode } = req.body;

        // Duplicate Check
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const duplicateOrder = await Order.findOne({
            client: req.user.id,
            price: price,
            'pickup.address': pickup.address,
            status: { $in: ['pending', 'scheduled'] },
            createdAt: { $gt: oneMinuteAgo }
        });

        if (duplicateOrder) {
            return res.status(400).json({ message: 'لقد أرسلت هذا الطلب مؤخراً، يرجى الانتظار قليلاً قبل المحاولة مجدداً.' });
        }

        // 🇸🇩 Geofence: Validate locations are inside Sudan (pickup/dropoff = mirror of first/last stop)
        const geoCheck = validateOrderLocations(pickup, dropoff);
        if (!geoCheck.valid) {
            return res.status(400).json({ message: geoCheck.message });
        }

        // 🧭 توصيل متعدد النقاط — تحقق من كل المحطات وجهّز نسخة معقّمة (done دائماً false عند الإنشاء)
        let sanitizedStops = null;
        const rawStops = Array.isArray(req.body.stops) ? req.body.stops : null;
        if (rawStops && rawStops.length >= 2) {
            const { validateStopsLocations } = require('../utils/geofence');
            const stopsCheck = validateStopsLocations(rawStops);
            if (!stopsCheck.valid) {
                return res.status(400).json({ message: stopsCheck.message });
            }
            sanitizedStops = rawStops.map(s => ({
                type: s.type === 'pickup' ? 'pickup' : 'dropoff',
                address: String(s.address || '').slice(0, 300),
                contactName: String(s.contactName || '').slice(0, 100),
                contactPhone: String(s.contactPhone || '').slice(0, 20),
                lat: Number(s.lat), lng: Number(s.lng),
                note: String(s.note || '').slice(0, 200),
                done: false, doneAt: null
            }));
        }
        const isMultiStop = !!sanitizedStops;

        // ✅ Get commission rate from the user's CITY Settings (fully isolated per city)
        const settings = await getCachedSettings(req.userCity);
        const commissionRate = settings.commissionRate ?? 0.15; // null-safe fallback only

        // ✅ Server-Side Security: Prevent clients from sending an abnormally low price
        // Uses THIS city's baseFare, plus the per-extra-stop fee for multi-stop trips.
        const base = settings.baseFare || 1000;
        const extraStopFee = settings.extraStopFee || 0;
        const minPrice = base + (isMultiStop ? extraStopFee * Math.max(0, sanitizedStops.length - 2) : 0);
        if (price < minPrice) {
            return res.status(400).json({ message: `عذراً، السعر المطلوب (${price}) أقل من الحد الأدنى لتسعيرة مدينة ${req.userCity} (${minPrice})` });
        }

        const appFee = price * commissionRate;
        const netRevenue = price - appFee;

        // 🖼️ Store parcel image as-is (Base64 compressed on client ~500KB)
        // File system saving was unreliable on cPanel — MongoDB storage is safer
        const parcelImageUrl = req.body.parcelImage || null;

        // 🧾 Store receipt image as-is (Base64 compressed on client)
        const receiptImageUrl = req.body.receiptImage || null;

        // ⏰ Scheduled order support
        const isScheduled = scheduledAt && new Date(scheduledAt) > new Date();
        const orderStatus = isScheduled ? 'scheduled' : 'pending';

        // 🎟️ الكوبون: يُتحقَّق ويُحسب خادمياً — لا يُوثق بأي discountAmount من العميل.
        // كان الإنشاء يخزّن قيمة العميل مباشرةً (حتى لكود وهمي/منتهٍ) ويتخطّى فحوصات
        // المدينة/الحد الأدنى/حد المستخدم التي يطبّقها /apply-promo.
        // نتيجة أي فشل: خصم صفر وكود ملغى — لا نُبقي أثراً مفبركاً.
        let appliedPromoCode = null;
        let serverDiscount = 0;
        let validatedPromoDoc = null;
        if (promoCode) {
            const { validatePromo, computeDiscount } = require('../utils/promo');
            const PromoCode = require('../models/PromoCode');
            const now = new Date();
            const promoDoc = await PromoCode.findOne({
                code: String(promoCode).toUpperCase().trim(),
                isActive: true,
                validFrom: { $lte: now },
                validUntil: { $gte: now }
            }).lean();

            // قيمة الطلب الأساس من قيم موثوقة خادمياً: الأجرة (price) هي المتاح الوحيد
            // عند الإنشاء. البضاعة تُخصم في مسار المتجر المنفصل عبر ShopOrder.
            const fullOrderValue = Number(price) || 0;
            const check = promoDoc
                ? validatePromo(promoDoc, { userId: req.user._id, userCity: req.userCity, fullOrderValue })
                : { ok: false };

            if (check.ok) {
                const { discount } = computeDiscount(promoDoc, {
                    productsTotal: Number(req.body.productsTotal) || 0,
                    deliveryFee: Number(price) || 0,
                    fullOrderValue
                });
                if (discount > 0) {
                    serverDiscount = discount;
                    appliedPromoCode = promoDoc.code;
                    validatedPromoDoc = promoDoc;
                }
            } else {
                logger.info({ promoCode, reason: check.error }, 'Promo rejected at order creation — stored discount = 0');
            }
        }

        const orderData = {
            client: req.user.id,
            city: req.userCity,   // 🌍 CRITICAL: stamp city from the authenticated user
            pickup, dropoff, details, distanceType, price,
            ...(isMultiStop ? { isMultiStop: true, stops: sanitizedStops } : {}),
            appFee, netRevenue,
            parcelImage: parcelImageUrl,
            receiptImage: receiptImageUrl,
            status: orderStatus,
            scheduledAt: isScheduled ? new Date(scheduledAt) : null,
            orderType: orderType || 'delivery',
            promoCode: appliedPromoCode,      // 🔒 الكود المُتحقَّق فقط، أو null
            discountAmount: serverDiscount    // 🔒 القيمة الخادمية فقط
        };

        if (orderType === 'shop') {
            const Place = require('../models/Place');
            // 🔒 تحقّق أن المتجر موجود ونشط — كان الفحص `if (place && ...)` يمرّ عند
            // عدم وجوده فيُنشأ طلب يتيم بمعرّف متجر عشوائي.
            if (!shopId || !mongoose.Types.ObjectId.isValid(shopId)) {
                return res.status(400).json({ message: 'معرّف المتجر غير صالح' });
            }
            const place = await Place.findById(shopId).select('ownerId name phone isActive');
            if (!place) {
                return res.status(404).json({ message: 'المتجر غير موجود' });
            }
            if (place.isActive === false) {
                return res.status(400).json({ message: 'هذا المتجر غير متاح حالياً' });
            }
            if (place.ownerId && place.ownerId.toString() === req.user.id.toString()) {
                return res.status(403).json({ message: 'لا يمكنك الطلب من متجرك الخاص' });
            }

            orderData.shopId = shopId;
            // 🔒 الاسم والهاتف من قاعدة البيانات لا من العميل (منع تخزين قيم مزوّرة)
            orderData.shopName = place.name || shopName || '';
            orderData.shopPhone = place.phone || shopPhone || '';
            orderData.items = items;
            // حفظ تفاصيل الطلبية كنص (للعرض في كارت الكابتن)
            if (req.body.shopOrderDetails) {
                orderData.shopOrderDetails = req.body.shopOrderDetails;
            }
        }

        const order = await Order.create(orderData);

        // ✅ تحديث عداد الكوبون — فقط للكود الذي تحقّقنا منه وأنتج خصماً فعلياً.
        // الخصم هنا هو serverDiscount المحسوب أعلاه؛ لا إعادة حساب من قيمة العميل.
        if (validatedPromoDoc && serverDiscount > 0) {
            const PromoCode = require('../models/PromoCode');
            // ✅ BUG-002: تحديث ذرّي بشرط usageLimit — يمنع سباق يتخطّى الحد الأقصى
            const atomicPromoFilter = {
                code: validatedPromoDoc.code,
                $or: [
                    { usageLimit: null },
                    { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
                ]
            };
            const updatedPromo = await PromoCode.findOneAndUpdate(
                atomicPromoFilter,
                {
                    $inc: { usedCount: 1 },
                    $push: {
                        usedBy: {
                            user: req.user.id,
                            usedAt: new Date(),
                            orderId: order._id,
                            discountAmount: serverDiscount
                        }
                    }
                }
            ).catch(err => {
                logger.error({ err }, 'Failed to update PromoCode usage');
                return null;
            });
            if (!updatedPromo) {
                logger.warn({ promoCode: validatedPromoDoc.code, orderId: order._id }, 'Promo code usage limit reached during atomic check');
            }
        }

        // إشعار للكباتن فقط إذا الطلب فوري (ليس مجدولاً)
        if (!isScheduled) {
            const io = req.app.get('io');
            if (io) {
                // 🌍 CRITICAL: Broadcast ONLY to the order's city room.
                // Replaces io.emit() which would have notified captains in ALL cities.
                const cityRoom = `room_${order.city}`;

                if (orderType === 'shop') {
                    io.to(cityRoom).emit('shop_order_available', {
                        orderId: order._id,
                        shopName: order.shopName,
                        pickup: order.pickup.address,
                        price: order.price,
                        city: order.city
                    });
                } else {
                    io.to(cityRoom).emit('new_order_available', {
                        orderId: order._id,
                        pickup: order.pickup.address,
                        price: order.price,
                        city: order.city
                    });
                }

            }

            // ✅ إشعار الأدمن: يُحفظ في القاعدة (سجلّ دائم يظهر باللوحة) + socket فوري + FCM push.
            // ⚠️ خارج شرط `if (io)` عمداً: كان بالداخل، فلو لم يكن io مهيّأً لا يصل الأدمن
            // إشعارَ push ولا يُحفظ له سجلّ إطلاقاً. الـ push لا يعتمد على السوكت.
            notifyAdmins(req.app, {
                title: 'طلب جديد',
                message: `طلب ${orderType === 'shop' ? 'محل' : 'توصيل'} جديد بسعر ${order.price} ج.س — ${order.city}`,
                type: 'admin_order_alert',
                relatedId: order._id
            });

            // 📣 Multicast Push for All Orders (Delivery & Shop)
            // Fire and forget to prevent HTTP timeouts
            setImmediate(async () => {
                try {
                    const { sendPushToMany, sendAdminPushToMany } = require('../utils/firebasePush');
                    
                    // 1. Send Push ONLY to captains in the same city
                    const activeCaptains = await User.find({
                        role: 'captain',
                        city: order.city,   // 🌍 Scoped to order's city
                        fcmToken: { $exists: true, $ne: null },
                        isActive: true              // account not suspended by admin
                    }).select('fcmToken');

                    const tokens = activeCaptains.map(c => c.fcmToken);
                    if (tokens.length === 0) {
                        // 🔍 قابلية التشخيص: بدون هذا السطر كان "ما وصل إشعار للكباتن" حالةً صامتة
                        // لا نعرف أهي صفر توكنات (مدينة/isActive/توكن مفقود) أم فشل إرسال.
                        logger.warn({ orderId: order._id, city: order.city }, 'New order: no captain FCM tokens in city — push skipped');
                    } else {
                        const title = orderType === 'shop' ? '🛒 طلب محل جديد! 🚨' : '📦 طلب توصيل جديد! 🚨';
                        const bodyMsg = orderType === 'shop'
                            ? `طلب من ${order.shopName || 'محل'} بسعر ${order.price} ج.س. عرض التفاصيل!`
                            : `طلب توصيل جديد متاح بسعر ${order.price} ج.س! عرض التفاصيل`;

                        const result = await sendPushToMany(tokens, title, bodyMsg, {
                            type: orderType === 'shop' ? 'shop_order' : 'new_order',
                            orderId: order._id.toString(),
                            url: `/captain-orders.html?highlight=${order._id.toString()}` // 🧭 وجهة الكابتن
                        });
                        logger.info({
                            orderId: order._id, city: order.city,
                            targeted: tokens.length, sent: result.success, failed: result.failure,
                            errors: result.errors
                        }, 'New order captain push result');
                    }
                    // ملاحظة: إشعار/دفعة الأدمن تُعالَج عبر notifyAdmins (حفظ + socket + push) أعلاه.
                } catch (pushErr) {
                    logger.error({ err: pushErr }, 'Multicast Push Failed in background');
                }
            });
        }

        const msg = isScheduled
            ? `تم جدولة طلبك بنجاح! سيُنشر للكباتن في ${new Date(scheduledAt).toLocaleString('ar-SA')}`
            : 'تم إنشاء الطلب بنجاح';

        res.status(201).json({ message: msg, order });
    } catch (error) {
        logger.error({ err: error }, 'Create Order Failed');
        res.status(500).json({ message: 'حدث خطأ في الخادم' });
    }
});

// @route   PUT /api/orders/:id/cancel
router.put('/:id/cancel', protect, async (req, res) => {
    try {
        let order = await Order.findById(req.params.id);
        
        // If not found in Order, check ShopOrder
        if (!order) {
            const ShopOrder = require('../models/ShopOrder');
            const shopOrder = await ShopOrder.findById(req.params.id);
            if (!shopOrder) return res.status(404).json({ message: 'Order not found' });
            
            if (shopOrder.client.toString() !== req.user.id) {
                return res.status(403).json({ message: 'You are not authorized to cancel this order' });
            }
            if (shopOrder.status !== 'shop_pending') {
                return res.status(400).json({ message: 'لا يمكن إلغاء الطلب لأن المتجر بدأ في تجهيزه' });
            }
            
            shopOrder.status = 'cancelled';
            shopOrder.cancelledBy = 'client';
            shopOrder.cancelReason = 'إلغاء من قبل العميل';
            await shopOrder.save();

            // ✅ FIX #2 + #14: استعادة المخزون عند إلغاء العميل لـ ShopOrder
            // (merchant/reject يفعل هذا بالفعل، لكن كان مفقوداً هنا)
            if (shopOrder.items && shopOrder.items.length > 0) {
                const Product = require('../models/Product');
                const { recordStockMovement } = require('../utils/erpHelpers');
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
                                reason: 'إرجاع للمخزون — إلغاء العميل',
                                refModel: 'ShopOrder', refId: shopOrder._id,
                                createdBy: req.user._id
                            });
                        }
                    }
                }
            }

            // Notify merchant and client/captain
            const io = req.app.get('io');
            if (io) {
                io.to(shopOrder.client.toString()).emit('order_status_updated', { orderId: shopOrder._id, status: 'cancelled' });
                if (shopOrder.captain) {
                    io.to(shopOrder.captain.toString()).emit('order_status_updated', { orderId: shopOrder._id, status: 'cancelled' });
                }
            }
            if (shopOrder.place) {
                const Place = require('../models/Place');
                const place = await Place.findById(shopOrder.place);
                if (place && place.ownerId) {
                    const io = req.app.get('io');
                    if (io) {
                        io.to(place.ownerId.toString()).emit('merchant_order_update', { orderId: shopOrder._id, status: 'cancelled' });
                    }
                    await sendNotification(req.app, {
                        userId: place.ownerId,
                        title: '⚠️ تم إلغاء الطلب',
                        message: `العميل قام بإلغاء الطلب رقم ${shopOrder._id.toString().slice(-6)}`,
                        type: 'order_update',
                        relatedId: shopOrder._id
                    });
                }
            }

            return res.json({ message: 'Order cancelled successfully', order: shopOrder });
        }

        // --- NORMAL ORDER CANCELLATION ---
        if (order.client.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You are not authorized to cancel this order' });
        }

        // 🚫 لا يمكن الإلغاء بعد أن يقبل الكابتن الطلب أو يستلم الطرد
        if (['accepted', 'picked_up', 'delivered'].includes(order.status)) {
            return res.status(400).json({ message: 'لا يمكن إلغاء الطلب بعد قبول الكابتن. تواصل مع الدعم إن كان هناك مشكلة.' });
        }

        const { reason } = req.body || {};

        // ✅ الإلغاء مسموح فقط في حالتي pending و scheduled
        const cancelledOrder = await Order.findOneAndUpdate(
            { _id: req.params.id, status: { $in: ['pending', 'scheduled'] }, client: req.user.id },
            { $set: {
                status: 'cancelled',
                cancelledBy: 'client',
                cancelReason: (reason && reason.trim()) || 'إلغاء من قبل العميل',
                cancelledAt: new Date()
            } },
            { new: true }
        );
        if (!cancelledOrder) {
            return res.status(400).json({ message: 'This order cannot be cancelled as it is already in progress or completed' });
        }
        order = cancelledOrder; // update the local reference

        // 🚀 FIX 3: Notify negotiating captains when client cancels
        const io = req.app.get('io');
        if (order.negotiations && order.negotiations.length > 0) {
            for (let i = 0; i < order.negotiations.length; i++) {
                if (order.negotiations[i].status === 'pending') {
                    order.negotiations[i].status = 'rejected';
                    const capId = order.negotiations[i].captainId;
                    if (capId) {
                        if (io) {
                            io.to(capId.toString()).emit('negotiation_resolved', {
                                orderId: order._id,
                                result: 'order_taken' // reusing 'order_taken' to tell them it's gone
                            });
                        }
                        await sendNotification(req.app, {
                            userId: capId,
                            title: '⚠️ تم إلغاء الطلب',
                            message: 'قام العميل بإلغاء الطلب الذي قدمت عليه عرضاً.',
                            type: 'order_update',
                            relatedId: order._id
                        });
                    }
                }
            }
        }

        await order.save();
        
        // Notify admin and client about cancellation
        if (io) {
            io.to('admin_room').emit('admin_order_update', { orderId: order._id, status: 'cancelled', city: order.city });
            io.to(order.client.toString()).emit('order_status_updated', { orderId: order._id, status: 'cancelled' });
        }

        // إشعار للكابتن إذا كان هناك كابتن قد قبل الطلب
        if (order.captain) {
            if (io) {
                io.to(order.captain.toString()).emit('order_status_updated', { orderId: order._id, status: 'cancelled' });
            }
            await sendNotification(req.app, {
                userId: order.captain,
                title: '⚠️ تم إلغاء الطلب',
                message: `العميل ألغى الطلب رقم ${order._id.toString().slice(-6)}${order.cancelReason ? ` — السبب: ${order.cancelReason}` : ''}`,
                type: 'order_update',
                relatedId: order._id
            });
        }

        res.json({ message: 'Order cancelled successfully', order });
    } catch (error) {
        logger.error({ err: error }, 'Cancel order error');
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/orders/shop/:id/upload-receipt
// @desc    Client uploads payment receipt for a shop order
router.put('/shop/:id/upload-receipt', protect, async (req, res) => {
    try {
        const ShopOrder = require('../models/ShopOrder');
        const Place = require('../models/Place');
        const { sendNotification } = require('../utils/notificationHelper');
        const { receiptImage } = req.body;
        if (!receiptImage) return res.status(400).json({ message: 'الرجاء إرفاق صورة الإشعار' });

        const order = await ShopOrder.findOne({ _id: req.params.id, client: req.user.id });
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
        
        order.paymentReceiptImage = receiptImage;
        order.paymentStatus = 'receipt_sent';
        await order.save();

        // Notify merchant
        const place = await Place.findById(order.place);
        if (place && place.ownerId) {
            await sendNotification(req.app, {
                userId: place.ownerId,
                title: '🧾 إشعار دفع جديد',
                message: `قام العميل بإرفاق إشعار الدفع للطلب رقم ${order._id.toString().slice(-6)}. يرجى مراجعته وتأكيده للبدء في التجهيز.`,
                type: 'shop_order_update',
                relatedId: order._id
            });
            const io = req.app.get('io');
            if (io) io.to(place.ownerId.toString()).emit('shop_order_updated', { orderId: order._id, status: 'receipt_sent' });
        }

        res.json({ message: 'تم إرسال إشعار الدفع للتاجر بنجاح', order });
    } catch (err) {
        logger.error({ err }, 'Upload shop receipt error');
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/orders/my-orders (للعميل)
router.get('/my-orders', protect, async (req, res) => {
    const startTime = Date.now();
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(20, parseInt(req.query.limit) || 10);

        // ✅ FIX #4: Apply a date cap to avoid fetching ALL orders into memory.
        // Default: last 6 months. Client can pass ?since=YYYY-MM-DD for older history.
        const MAX_FETCH = 200; // hard cap per collection
        const sinceParam = req.query.since ? new Date(req.query.since) : null;
        const defaultSince = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000); // 6 months
        const since = sinceParam || defaultSince;
        const dateFilter = { createdAt: { $gte: since } };
        
        // Fetch normal Orders (excluding the cloned shop deliveries so we don't duplicate)
        const orders = await Order.find({ client: req.user.id, orderType: { $ne: 'shop' }, ...dateFilter })
            .select('-parcelImage')
            .populate('captain', 'name phone vehicleType currentLocation documents.profilePhoto')
            .sort({ createdAt: -1 })
            .limit(MAX_FETCH)
            .lean();

        // 📸 وضع علامة hasImage على الطلبات التي تحوي صورة طرد (دون تحميل الـ Base64 الثقيل)
        //    حتى تعرض الواجهة زر "عرض صورة الطرد" وتجلبها عند الطلب فقط.
        const orderIds = orders.map(o => o._id);
        if (orderIds.length) {
            const withImg = await Order.find({
                _id: { $in: orderIds },
                parcelImage: { $type: 'string', $ne: '' }
            }).select('_id').lean();
            const imgSet = new Set(withImg.map(d => String(d._id)));
            orders.forEach(o => { o.hasImage = imgSet.has(String(o._id)); });
        }

        // Fetch ShopOrders — BUG #30 FIX: exclude paymentReceiptImage to avoid leaking large base64 data
        const ShopOrder = require('../models/ShopOrder');
        const shopOrders = await ShopOrder.find({ client: req.user.id, status: { $ne: 'chat_initiated' }, ...dateFilter })
            .select('-paymentReceiptImage')
            .populate('place', 'name address bankAccountName bankAccountNumber bankName')
            .populate('captain', 'name phone vehicleType currentLocation documents.profilePhoto')
            .sort({ createdAt: -1 })
            .limit(MAX_FETCH)
            .lean();

        // Fetch corresponding delivery Orders for these ShopOrders to get negotiations
        const shopOrderIds = shopOrders.map(so => so._id);
        const deliveryOrders = await Order.find({ shopOrderId: { $in: shopOrderIds }, orderType: 'shop' })
            .select('negotiations shopOrderId captain')
            .lean();

        // Map ShopOrders to match Order format
        const mappedShopOrders = shopOrders.map(so => {
            const relatedDelivery = deliveryOrders.find(doObj => doObj.shopOrderId && doObj.shopOrderId.toString() === so._id.toString());
            
            let mappedStatus = 'pending';
            if (so.status === 'chat_initiated') mappedStatus = 'chat_initiated';
            else if (so.status === 'shop_pending') mappedStatus = 'pending';
            else if (so.status === 'shop_preparing' || so.status === 'ready_for_pickup' || so.status === 'captain_assigned') mappedStatus = 'accepted';
            else if (so.status === 'picked_up') mappedStatus = 'picked_up';
            else if (so.status === 'delivered') mappedStatus = 'delivered';
            else if (so.status === 'cancelled') mappedStatus = 'cancelled';

            return {
                _id: so._id,
                deliveryOrderId: relatedDelivery ? relatedDelivery._id : null,
                negotiations: relatedDelivery ? relatedDelivery.negotiations : [],
                orderType: 'shop',
                shopOrderId: so._id,
                placeId: so.place ? so.place._id : null,
                pickup: { address: so.place ? `🏖️ ${so.place.name}` : 'متجر' },
                dropoff: so.dropoff || { address: 'غير محدد' },
                price: so.totalAmount || 0,
                itemsTotal: so.itemsTotal || 0,
                deliveryFee: so.deliveryFee || 0,
                status: mappedStatus,
                realShopStatus: so.status,
                createdAt: so.createdAt,
                // ⏱️ طوابع الانتقالات للخط الزمني (متوفّرة إن سجّلها ShopOrder، وإلا تُتجاهل)
                acceptedAt: so.acceptedAt || so.captainAssignedAt || null,
                pickedUpAt: so.pickedUpAt || null,
                deliveredAt: so.deliveredAt || null,
                cancelledAt: so.cancelledAt || null,
                captain: so.captain || (relatedDelivery ? relatedDelivery.captain : null),
                isRated: false,
                proofOfPickupImage: so.proofOfPickupImage,
                paymentStatus: so.paymentStatus,
                hasReceipt: !!so.paymentReceiptImage,
                bankInfo: so.place ? {
                    name: so.place.bankAccountName,
                    account: so.place.bankAccountNumber,
                    bank: so.place.bankName
                } : null,
                details: (so.items && so.items.length > 0)
                    ? so.items.map(i => `${i.quantity}x ${i.name}`).join('، ')
                    : '💬 محادثة مباشرة'
            };
        });

        // Merge, sort, and paginate (in-memory only across capped result sets)
        const allOrders = [...orders, ...mappedShopOrders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const skip = (page - 1) * limit;
        const paginatedOrders = allOrders.slice(skip, skip + limit);

        // 📊 إثراء كل طلب بالخط الزمني و ETA (بعد الترقيم لتوفير الحساب) — مصدر مشترك
        const { enrichOrder } = require('../utils/orderEnrich');
        paginatedOrders.forEach(enrichOrder);

        // ✅ BUG-014 FIX: استخدام عدادات DB الحقيقية للـ pagination بدلاً من طول المصفوفة المقطوعة
        // allOrders.length تعكس فقط ما تم جلبه (MAX_FETCH=200) وليس الإجمالي الحقيقي في DB
        const [realOrderCount, realShopOrderCount] = await Promise.all([
            Order.countDocuments({ client: req.user.id, orderType: { $ne: 'shop' }, ...dateFilter }),
            ShopOrder.countDocuments({ client: req.user.id, status: { $ne: 'chat_initiated' }, ...dateFilter })
        ]);
        const total = realOrderCount + realShopOrderCount;

        logger.debug({ durationMs: Date.now() - startTime, total }, 'fetchMyOrders completed');

        res.json({
            orders: paginatedOrders,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalOrders: total,
            since: since.toISOString() // let frontend know the applied filter
        });
    } catch (error) {
        logger.error({ err: error }, 'Fetch my-orders error');
        res.status(500).json({ message: 'خطأ' });
    }
});


// @route   GET /api/orders/my-missions (للكابتن - المهام الجارية)
router.get('/my-missions', protect, captainOnly, async (req, res) => {
    try {
        const orders = await Order.find({
            captain: req.user.id,
            status: { $in: ['accepted', 'picked_up'] }
        })
            .populate('client', 'name phone')
            .sort({ updatedAt: -1 })
            .lean();

        // 📊 إثراء بالخط الزمني و ETA (للكابتن: تقدّم المهمة ووقت الوصول للتسليم)
        const { enrichOrder } = require('../utils/orderEnrich');
        orders.forEach(enrichOrder);

        res.json(orders);
    } catch (err) {
        logger.error({ err }, 'Fetch my-missions error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/orders (for captains — available orders)
// 🌍 requireCity: captains only see pending orders from THEIR city
router.get('/', protect, requireCity, captainOnly, async (req, res) => {
    // 🚨 منع الكابتن المحظور من رؤية الطلبات الجديدة
    if (req.user.is_blocked) {
        return res.status(403).json({ message: 'حسابك موقوف مؤقتاً لتجاوزك الحد الائتماني للمديونية' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    try {
        // 🌍 CRITICAL: Only show pending orders from the captain's own city
        const cityFilter = { status: 'pending', city: req.userCity };

        const orders = await Order.find(cityFilter)
            .populate('client', 'name') // Phone removed for privacy before acceptance
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Order.countDocuments(cityFilter);

        // ✅ For each order, flag if this captain already submitted an offer
        const captainId = req.user._id.toString();
        const enriched = orders.map(order => {
            const o = order.toObject();
            const myOffer = (o.negotiations || []).find(
                n => n.captainId && n.captainId.toString() === captainId && n.status === 'pending'
            );
            o.myOffer = myOffer || null;
            return o;
        });

        res.json({
            orders: enriched,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalOrders: total
        });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});


// ==========================================
// 💬 التفاوض — كابتن يقترح سعر جديد (متعدد الكباتن)
// @route   PUT /api/orders/:id/negotiate
// ==========================================
router.put('/:id/negotiate', protect, captainOnly, async (req, res) => {
    // 🚨 منع الكابتن المحظور من التفاوض
    if (req.user.is_blocked) {
        return res.status(403).json({ message: 'حسابك محجوب ولا يمكنك تقديم عروض' });
    }

    try {
        const { proposedPrice } = req.body;
        if (!proposedPrice || proposedPrice <= 0) {
            return res.status(400).json({ message: 'يرجى إدخال سعر صحيح' });
        }

        // ✅ FIX #6: Enforce a reasonable max price cap
        const MAX_PRICE = 1_000_000;
        if (proposedPrice > MAX_PRICE) {
            return res.status(400).json({ message: `السعر المقترح يتجاوز الحد الأقصى المسموح (${MAX_PRICE.toLocaleString()} ج.س)` });
        }

        const order = await Order.findById(req.params.id).populate('client', 'name');
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        if (order.status !== 'pending') {
            return res.status(400).json({ message: 'الطلب غير متاح للتفاوض' });
        }

        // BUG #22 FIX: Prevent captain from negotiating on their own order
        if (req.user.id === order.client._id.toString()) {
            return res.status(403).json({ message: 'لا يمكنك التفاوض على طلبك الخاص' });
        }

        // Check if this captain already has an active offer
        const captainId = req.user._id.toString();
        const existingOffer = order.negotiations.find(
            n => n.captainId && n.captainId.toString() === captainId && n.status === 'pending'
        );
        if (existingOffer) {
            return res.status(400).json({ message: 'لديك عرض نشط بالفعل على هذا الطلب. يمكنك سحبه أولاً.' });
        }

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        // ✅ Push new offer to the negotiations array — مع لقطة بيانات الكابتن لعرض احترافي
        order.negotiations.push({
            captainId: req.user._id,
            captainName: req.user.name,
            captainVehicle: req.user.vehicleType || null,
            captainRating: typeof req.user.averageRating === 'number' ? Math.min(5, req.user.averageRating) : null,
            captainRatingCount: req.user.ratingCount || 0,
            captainPhoto: (req.user.documents && req.user.documents.profilePhoto) || null,
            proposedPrice,
            originalPrice: order.price,
            expiresAt,
            status: 'pending'
        });
        await order.save();

        // ✅ BUG-013 FIX: استدعاء sendOfferExpiryReminder فعلياً بعد حفظ العرض
        // يرسل إشعاراً FCM للكابتن قبل دقيقتين من انتهاء عرضه
        try {
            const { sendOfferExpiryReminder } = require('../scheduler');
            if (req.user.fcmToken) {
                sendOfferExpiryReminder(req.user.fcmToken, order._id, 5 * 60 * 1000);
            }
        } catch (reminderErr) {
            logger.warn({ err: reminderErr }, 'Failed to schedule offer expiry reminder');
        }

        // 🔔 Notify client via socket
        const io = req.app.get('io');
        if (io) {
            io.to(order.client._id.toString()).emit('negotiation_started', {
                orderId: order._id,
                captainName: req.user.name,
                captainId: req.user._id,
                originalPrice: order.price,
                proposedPrice,
                expiresAt
            });
        }

        // 🔔 Notification
        await sendNotification(req.app, {
            userId: order.client._id,
            title: '💬 عرض سعر جديد',
            message: `الكابتن ${req.user.name} يقترح سعر ${proposedPrice} ج.س بدلاً من ${order.price} ج.س`,
            type: 'order_update',
            relatedId: order._id
        });

        res.json({ message: 'تم إرسال عرض التفاوض', order });
    } catch (error) {
        logger.error({ err: error }, 'Negotiate Error');
        res.status(500).json({ message: 'Server Error' });
    }
});


// ==========================================
// 💬 رد العميل على عرض محدد
// @route   PUT /api/orders/:id/negotiate-response
// body: { action: 'accept'|'reject', captainId: '...' }
// ==========================================
router.put('/:id/negotiate-response', protect, negotiateLimiter, async (req, res) => {
    try {
        const { action, captainId } = req.body; // 'accept' or 'reject' + which captain's offer
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        // 🚀 FIX 1: Ensure order is still pending before accepting negotiation
        if (order.status !== 'pending') {
            return res.status(400).json({ message: 'الطلب لم يعد متاحاً للتفاوض أو تم إغلاقه' });
        }

        // Only the client who owns the order can respond
        if (order.client.toString() !== req.user.id) {
            return res.status(403).json({ message: 'غير مصرح' });
        }

        if (!captainId) {
            return res.status(400).json({ message: 'يرجى تحديد الكابتن' });
        }

        // BUG #29 FIX: Validate captainId is a valid MongoDB ObjectId before using it
        if (!mongoose.Types.ObjectId.isValid(captainId)) {
            return res.status(400).json({ message: 'معرف الكابتن غير صالح' });
        }

        // Find the specific offer in the negotiations array
        const offerIndex = order.negotiations.findIndex(
            n => n.captainId && n.captainId.toString() === captainId && n.status === 'pending'
        );

        if (offerIndex === -1) {
            return res.status(400).json({ message: 'لم يتم العثور على عرض نشط لهذا الكابتن' });
        }

        const offer = order.negotiations[offerIndex];

        // ✅ Check expiry
        if (offer.expiresAt && new Date() > new Date(offer.expiresAt)) {
            order.negotiations[offerIndex].status = 'expired';
            await order.save();
            return res.status(400).json({ message: 'انتهت صلاحية هذا العرض — الطلب متاح مجدداً للكباتن' });
        }

        const io = req.app.get('io');

        if (action === 'accept') {
            // Accept: update price, assign captain, change status
            order.price = offer.proposedPrice;
            order.captain = captainId;
            order.status = 'accepted';
            order.negotiations[offerIndex].status = 'accepted';

            // Reject all other pending negotiations
            order.negotiations.forEach((n, i) => {
                if (i !== offerIndex && n.status === 'pending') {
                    order.negotiations[i].status = 'rejected';
                }
            });

            // Clear legacy lock
            order.negotiation = { isActive: false, status: 'none' };

            // Recalculate fees using the ORDER's city commission rate
            const settings = await getCachedSettings(order.city || 'Khartoum');
            const commissionRate = settings.commissionRate ?? 0.15;
            order.appFee = order.price * commissionRate;
            order.netRevenue = order.price - order.appFee;

            // 🛡️ CRITICAL FIX: Atomic update for negotiation accept to prevent race condition with captain direct acceptance
            const updatedOrder = await Order.findOneAndUpdate(
                { _id: req.params.id, status: 'pending' },
                {
                    $set: {
                        price: order.price,
                        captain: order.captain,
                        status: 'accepted',
                        acceptedAt: new Date(),   // ⏱️ للخط الزمني
                        negotiation: order.negotiation,
                        negotiations: order.negotiations,
                        appFee: order.appFee,
                        netRevenue: order.netRevenue
                    }
                },
                { new: true }
            );

            if (!updatedOrder) {
                return res.status(400).json({ message: 'الطلب لم يعد متاحاً أو تم قبوله بالفعل' });
            }

            // Sync ShopOrder manually
            if (updatedOrder.shopOrderId) {
                try {
                    const ShopOrder = require('../models/ShopOrder');
                    await ShopOrder.findByIdAndUpdate(updatedOrder.shopOrderId, {
                        status: 'captain_assigned',
                        captain: updatedOrder.captain
                    });
                } catch (err) { logger.error('Error syncing ShopOrder negotiate', err); }
            }

            // Notify winning captain
            if (io) {
                io.to(captainId.toString()).emit('negotiation_resolved', {
                    orderId: order._id,
                    result: 'accepted',
                    finalPrice: order.price
                });
                io.to(order.client.toString()).emit('order_status_updated', {
                    orderId: order._id,
                    status: 'accepted',
                    captainId
                });
            }

            // ✅ FIX #4: استخدام updatedOrder.negotiations بدلاً من order.negotiations القديم
            // order.negotiations كانت تشير للكائن قبل findOneAndUpdate
            // وكانت فهرسة offerIndex تستخدم الترتيب القديم بدلاً من تحديد الكابتن الفائز بدقة
            const rejectedCaptains = updatedOrder.negotiations.filter(
                (n) => String(n.captainId) !== String(captainId) && n.captainId
            );
            for (const n of rejectedCaptains) {
                if (io) {
                    io.to(n.captainId.toString()).emit('negotiation_resolved', {
                        orderId: updatedOrder._id,
                        result: 'order_taken'
                    });
                }
                await sendNotification(req.app, {
                    userId: n.captainId,
                    title: '❌ قُبل عرض كابتن آخر',
                    message: 'تم قبول عرض كابتن آخر من قبل العميل.',
                    type: 'order_update',
                    relatedId: updatedOrder._id
                });
            }

            await sendNotification(req.app, {
                userId: captainId,
                title: '✅ تم قبول عرضك!',
                message: `العميل وافق على السعر ${order.price} ج.س — انطلق الآن!`,
                type: 'order_accepted',
                relatedId: order._id
            });

            res.json({ message: 'تم قبول العرض — الطلب مؤكد', order: updatedOrder });

        } else if (action === 'reject') {
            // Reject: mark only this offer as rejected
            order.negotiations[offerIndex].status = 'rejected';
            await order.save();

            // Notify that specific captain
            if (io) {
                io.to(captainId.toString()).emit('negotiation_resolved', {
                    orderId: order._id,
                    result: 'rejected'
                });
            }

            await sendNotification(req.app, {
                userId: captainId,
                title: '❌ تم رفض عرضك',
                message: 'العميل رفض السعر المقترح. الطلب لا يزال متاحاً.',
                type: 'order_update',
                relatedId: order._id
            });

            res.json({ message: 'تم رفض العرض — الطلب لا يزال متاحاً', order });
        } else {
            res.status(400).json({ message: 'action must be accept or reject' });
        }
    } catch (error) {
        logger.error({ err: error }, 'Negotiate Response Error');
        res.status(500).json({ message: 'Server Error' });
    }
});


// ==========================================
// 🚫 انسحاب الكابتن من عرضه
// @route   PUT /api/orders/:id/negotiate-withdraw
// ==========================================
router.put('/:id/negotiate-withdraw', protect, captainOnly, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        const captainId = req.user._id.toString();
        const offerIndex = order.negotiations.findIndex(
            n => n.captainId && n.captainId.toString() === captainId && n.status === 'pending'
        );

        if (offerIndex === -1) {
            return res.status(400).json({ message: 'لا يوجد عرض نشط لسحبه' });
        }

        order.negotiations[offerIndex].status = 'withdrawn';
        await order.save();

        // Notify client that the offer was withdrawn
        const io = req.app.get('io');
        if (io) {
            io.to(order.client.toString()).emit('negotiation_withdrawn', {
                orderId: order._id,
                captainId: req.user._id
            });
        }

        res.json({ message: 'تم سحب عرضك بنجاح', order });
    } catch (error) {
        logger.error({ err: error }, 'Withdraw Error');
        res.status(500).json({ message: 'Server Error' });
    }
});


// ============================================================
// 🔥🔥🔥 دالة القبول المعدلة (تم تصحيح اسم الحقل إلى message) 🔥🔥🔥
// @route   PUT /api/orders/:id/accept
// ============================================================
router.put('/:id/accept', protect, captainOnly, async (req, res) => {
    // 🚨 منع الكابتن المحظور من قبول الطلبات
    if (req.user.is_blocked) {
        return res.status(403).json({ message: 'حسابك محجوب ولا يمكنك استلام طلبات جديدة' });
    }
    // ✅ BUG-009 FIX: منع الكابتن الغير متاح من قبول طلبات
    if (!req.user.isAvailableForWork) {
        return res.status(403).json({ message: 'أنت في وضع "غير متاح". يرجى تفعيل وضع الاستقبال أولاً.' });
    }

    try {
        // 🛡️ CRITICAL FIX: Atomic update to prevent Race Condition
        const updatedOrder = await Order.findOneAndUpdate(
            { _id: req.params.id, status: 'pending' },
            {
                $set: {
                    status: 'accepted',
                    captain: req.user.id,
                    acceptedAt: new Date(),   // ⏱️ للخط الزمني
                    negotiation: { isActive: false, status: 'none' }
                }
            },
            { new: false } // return old document so we can check negotiations
        );

        if (!updatedOrder) {
            return res.status(400).json({ message: 'الطلب غير متاح أو تم قبوله من كابتن آخر' });
        }

        const order = await Order.findById(req.params.id); // Fetch the fresh updated document

        // 🚀 Clear negotiation state AND notify rejected captains
        const io = req.app.get('io');
        const rejectedCaptains = [];
        let negotiationsUpdated = false;
        
        if (order.negotiations && order.negotiations.length > 0) {
            order.negotiations.forEach((n, i) => {
                if (n.status === 'pending') {
                    order.negotiations[i].status = 'rejected';
                    negotiationsUpdated = true;
                    if (n.captainId && n.captainId.toString() !== req.user.id.toString()) {
                        rejectedCaptains.push(n.captainId);
                    }
                }
            });
            if (negotiationsUpdated) {
                await order.save(); // this will also trigger the post('save') hook!
            }
        } else {
             // If we didn't save the order (no negotiations to update), we must manually trigger post('save') logic for ShopOrder sync
             if (order.shopOrderId) {
                 try {
                     const ShopOrder = require('../models/ShopOrder');
                     await ShopOrder.findByIdAndUpdate(order.shopOrderId, {
                         status: 'captain_assigned',
                         captain: order.captain
                     });
                 } catch (err) { logger.error('Error syncing ShopOrder', err); }
             }
        }
        
        // Notify rejected captains
        for (const rCapId of rejectedCaptains) {
            if (io) {
                io.to(rCapId.toString()).emit('negotiation_resolved', {
                    orderId: order._id,
                    result: 'order_taken'
                });
            }
            await sendNotification(req.app, {
                userId: rCapId,
                title: '❌ قُبل عرض كابتن آخر',
                message: 'قام كابتن آخر بقبول الطلب مباشرة.',
                type: 'order_update',
                relatedId: order._id
            });
        }

        await sendNotification(req.app, {
            userId: order.client,
            title: '🎉 تم قبول طلبك!',
            message: `الكابتن ${req.user.name || 'متاح'} وافق على الطلب وهو في الطريق إليك.`,
            type: 'order_accepted',
            relatedId: order._id
        });

        await sendWhatsAppIfSubscribed(
            order.client,
            OrderMessages.orderAccepted(req.user.name || 'الكابتن', order._id.toString())
        );
        if (io) {
            io.to(order.client.toString()).emit('order_status_updated', {
                orderId: order._id,
                status: 'accepted',
                captainId: req.user.id
            });
            // 📢 Notify admin panel (admin_room sees all cities)
            io.to('admin_room').emit('admin_order_update', { orderId: order._id, status: 'accepted', captainName: req.user.name, city: order.city });
            // 🚗 أعلِم بقية كباتن المدينة أن الطلب لم يعد متاحاً ليختفي فوراً من قوائمهم
            io.to(`room_${order.city}`).emit('order_taken', { orderId: order._id });
        }

        res.json({ message: 'Order accepted', order });
    } catch (error) {
        logger.error({ err: error }, 'Order accept error');
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
});

// @route   PUT /api/orders/:id/release
// @desc    Captain releases an order they accepted — returns it to the pending pool
//          (only allowed BEFORE pickup). Protects the client from a stuck order.
router.put('/:id/release', protect, captainOnly, async (req, res) => {
    try {
        const { reason } = req.body || {};

        // 🛡️ Atomic: only the assigned captain can release, and only while 'accepted'
        const released = await Order.findOneAndUpdate(
            { _id: req.params.id, captain: req.user.id, status: 'accepted' },
            { $set: { status: 'pending', captain: null } },
            { new: true }
        );

        if (!released) {
            return res.status(400).json({ message: 'لا يمكن التنازل عن هذا الطلب (غير مقبول منك أو تم استلامه بالفعل).' });
        }

        // 🔗 أعد طلب المتجر إلى حالة "جاهز للاستلام" حتى يلتقطه كابتن آخر
        if (released.shopOrderId) {
            try {
                const ShopOrder = require('../models/ShopOrder');
                await ShopOrder.findByIdAndUpdate(released.shopOrderId, {
                    status: 'ready_for_pickup',
                    captain: null
                });
            } catch (err) { logger.error('Error syncing ShopOrder release', err); }
        }

        const io = req.app.get('io');

        // إشعار العميل: نبحث عن كابتن آخر
        await sendNotification(req.app, {
            userId: released.client,
            title: '🔄 جارٍ البحث عن كابتن آخر',
            message: `اعتذر الكابتن عن إكمال طلبك${reason && reason.trim() ? ` (${reason.trim()})` : ''}. نبحث لك عن كابتن جديد الآن.`,
            type: 'order_update',
            relatedId: released._id
        });

        if (io) {
            io.to(released.client.toString()).emit('order_status_updated', { orderId: released._id, status: 'pending' });
            io.to('admin_room').emit('admin_order_update', { orderId: released._id, status: 'pending', city: released.city });
        }

        res.json({ message: 'تم التنازل عن الطلب وإعادته للكباتن', order: released });
    } catch (error) {
        logger.error({ err: error }, 'Order release error');
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/orders/:id/pickup
router.put('/:id/pickup', protect, captainOnly, async (req, res) => {
    try {
        const { proofImage } = req.body;

        // 📸 إلزامي: يجب إرسال صورة إثبات الاستلام
        if (!proofImage) {
            return res.status(400).json({ message: 'يجب رفع صورة إثبات الاستلام قبل التأكيد' });
        }

        // 🛡️ CRITICAL FIX: Atomic update for pickup state
        const updatedOrder = await Order.findOneAndUpdate(
            { _id: req.params.id, captain: req.user.id, status: 'accepted' },
            {
                $set: {
                    status: 'picked_up',
                    pickedUpAt: new Date(),   // ⏱️ للخط الزمني
                    proofOfPickupImage: proofImage
                }
            },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(400).json({ message: 'الطلب غير متاح أو تم تحديث حالته مسبقاً' });
        }

        const order = updatedOrder; // for subsequent logic

        // 🧭 توصيل متعدد النقاط: علّم أول نقطة استلام كمُنجَزة
        if (order.isMultiStop && Array.isArray(order.stops)) {
            const firstPickup = order.stops.find(s => s.type === 'pickup' && !s.done);
            if (firstPickup) {
                firstPickup.done = true;
                firstPickup.doneAt = new Date();
                await order.save();
            }
        }

        // Sync ShopOrder manually since findOneAndUpdate bypasses post('save')
        if (order.shopOrderId) {
            try {
                const ShopOrder = require('../models/ShopOrder');
                await ShopOrder.findByIdAndUpdate(order.shopOrderId, { status: 'picked_up' });
            } catch (err) { logger.error('Error syncing ShopOrder pickup', err); }
        }

        await sendNotification(req.app, {
            userId: order.client,
            title: '📦 الكابتن استلم الطلب',
            message: `الكابتن ${req.user.name} قام باستلام طلبك الآن وهو في طريق للتوصيل.`,
            type: 'order_update',
            relatedId: order._id
        });

        await sendWhatsAppIfSubscribed(
            order.client,
            OrderMessages.orderPickedUp(req.user.name || 'الكابتن', order._id.toString())
        );

        const io = req.app.get('io');
        if (io) {
            io.to(order.client.toString()).emit('order_status_updated', {
                orderId: order._id,
                status: 'picked_up',
                proofOfPickupImage: proofImage
            });
            io.to('admin_room').emit('admin_order_update', { orderId: order._id, status: 'picked_up', city: order.city });
        }

        res.json({ message: 'Order picked up', order });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});


// @route   PUT /api/orders/:id/stops/:index/done
// @desc    🧭 توصيل متعدد النقاط: تأكيد إكمال نقطة وسطية (ليست أول استلام ولا آخر نقطة).
//          أول استلام يمرّ عبر /pickup (بالإثبات)، والنقطة الأخيرة عبر /deliver (بالعمولة).
router.put('/:id/stops/:index/done', protect, captainOnly, async (req, res) => {
    try {
        const idx = parseInt(req.params.index, 10);
        const order = await Order.findOne({ _id: req.params.id, captain: req.user.id });
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
        if (!order.isMultiStop || !Array.isArray(order.stops)) {
            return res.status(400).json({ message: 'هذا الطلب ليس متعدد النقاط' });
        }
        if (order.status !== 'picked_up') {
            return res.status(400).json({ message: 'أكّد استلام أول نقطة أولاً' });
        }
        if (isNaN(idx) || idx < 0 || idx >= order.stops.length) {
            return res.status(400).json({ message: 'رقم النقطة غير صالح' });
        }
        const stop = order.stops[idx];
        if (stop.done) return res.status(400).json({ message: 'هذه النقطة مؤكّدة مسبقاً' });

        // النقطة الأخيرة المتبقية تُؤكَّد عبر /deliver (لإتمام التوصيل واحتساب العمولة)
        const remaining = order.stops.filter(s => !s.done).length;
        if (remaining <= 1) {
            return res.status(400).json({ message: 'هذه آخر نقطة — استخدم «تأكيد التسليم»' });
        }

        stop.done = true;
        stop.doneAt = new Date();
        await order.save();

        // إشعار العميل بتقدّم الرحلة (خفيف)
        const label = stop.type === 'pickup' ? 'استلم من نقطة' : 'سلّم في نقطة';
        await sendNotification(req.app, {
            userId: order.client,
            title: '🧭 تقدّم في التوصيل',
            message: `الكابتن ${req.user.name} ${label}: ${stop.address}`,
            type: 'order_update',
            relatedId: order._id
        });

        const io = req.app.get('io');
        if (io) {
            io.to(order.client.toString()).emit('order_status_updated', { orderId: order._id, status: 'picked_up' });
        }

        res.json({ message: 'تم تأكيد النقطة', order });
    } catch (error) {
        logger.error({ err: error.message }, 'stop done error');
        res.status(500).json({ message: 'Server error' });
    }
});


// ============================================================================
// 🧭 ترتيب محطات الرحلة متعددة النقاط
//
// الترتيب المخزَّن هو ترتيب إدخال العميل حرفياً — لا علاقة له بالجغرافيا. هذان
// المساران يعطيان الكابتن ترتيباً أقصر محسوباً من موقعه الفعلي، ويتركان له القرار:
// الكابتن يعرف الشارع (طريق مقطوع، اتجاه واحد، زحمة) أكثر من أي خوارزمية.
//
// القيد المحفوظ في الحالتين: كل الاستلامات قبل أي تسليم، والمحطات المكتملة لا تتحرّك.
// ============================================================================

// جلب الطلب مع التحققات المشتركة بين المسارين
async function loadReorderableOrder(req, res) {
    const order = await Order.findOne({ _id: req.params.id, captain: req.user.id });
    if (!order) { res.status(404).json({ message: 'الطلب غير موجود' }); return null; }
    if (!order.isMultiStop || !Array.isArray(order.stops) || order.stops.length < 2) {
        res.status(400).json({ message: 'هذا الطلب ليس متعدد النقاط' }); return null;
    }
    // بعد التسليم النهائي لم يعد للترتيب معنى
    if (!['accepted', 'picked_up'].includes(order.status)) {
        res.status(400).json({ message: 'لا يمكن إعادة ترتيب رحلة منتهية' }); return null;
    }
    return order;
}

// @route   POST /api/orders/:id/stops/suggest-route
// @desc    يقترح ترتيباً أقصر من موقع الكابتن — اقتراح فقط، لا يحفظ شيئاً
// @access  Captain (صاحب الطلب)
router.post('/:id/stops/suggest-route', protect, captainOnly, async (req, res) => {
    try {
        const order = await loadReorderableOrder(req, res);
        if (!order) return;

        const lat = Number(req.body.lat);
        const lng = Number(req.body.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({ message: 'موقعك الحالي مطلوب لحساب أفضل مسار' });
        }

        const { optimizeStops } = require('../utils/routeOptimizer');
        const result = optimizeStops(order.stops, { lat, lng });

        res.json({
            order: result.order,                              // فهارس بالترتيب المقترح
            stops: result.order.map(i => order.stops[i]),     // المحطات نفسها، جاهزة للعرض
            currentKm: result.currentKm,
            optimizedKm: result.optimizedKm,
            savedKm: result.savedKm,
            changed: result.changed
        });
    } catch (error) {
        // أخطاء المُحسِّن رسائلها عربية موجّهة للمستخدم (بلا إحداثيات / موقع غير صالح)
        logger.warn({ err: error.message, orderId: req.params.id }, 'suggest-route failed');
        res.status(400).json({ message: error.message || 'تعذّر حساب أفضل مسار' });
    }
});

// @route   PUT /api/orders/:id/stops/reorder
// @desc    يطبّق ترتيباً وافق عليه الكابتن
// @access  Captain (صاحب الطلب)
router.put('/:id/stops/reorder', protect, captainOnly, async (req, res) => {
    try {
        const order = await loadReorderableOrder(req, res);
        if (!order) return;

        const newOrder = req.body.order;
        const n = order.stops.length;

        // 🔒 لا نثق بالعميل: يجب أن يكون الترتيب تبديلاً كاملاً لفهارس المحطات — لا أكثر ولا أقل.
        // بدون هذا يستطيع كابتن مُعدِّل للطلب حذف محطة أو تكرارها.
        if (!Array.isArray(newOrder) || newOrder.length !== n) {
            return res.status(400).json({ message: 'ترتيب غير صالح' });
        }
        const seen = new Set(newOrder);
        if (seen.size !== n || newOrder.some(i => !Number.isInteger(i) || i < 0 || i >= n)) {
            return res.status(400).json({ message: 'ترتيب غير صالح' });
        }

        const reordered = newOrder.map(i => order.stops[i]);

        // 🔒 القيد نفسه يُفرض هنا أيضاً — الاقتراح يحترمه، لكن هذا المسار عام ولا يفترض حسن النية
        const firstDropoff = reordered.findIndex(s => s.type !== 'pickup');
        const lastPickup   = reordered.map(s => s.type).lastIndexOf('pickup');
        if (firstDropoff !== -1 && lastPickup > firstDropoff) {
            return res.status(400).json({ message: 'لا يمكن تسليم طرد قبل استلامه — كل الاستلامات أولاً' });
        }

        // 🔒 المحطات المكتملة سجلٌّ لما حدث فعلاً: يجب أن تبقى في المقدّمة وبترتيبها الزمني
        const doneCount = order.stops.filter(s => s.done).length;
        if (reordered.slice(0, doneCount).some(s => !s.done)) {
            return res.status(400).json({ message: 'لا يمكن تحريك المحطات المكتملة' });
        }

        order.stops = reordered;

        // pickup/dropoff مرآةٌ لأول استلام وآخر تسليم (عقد موثّق في models/Order.js) —
        // بدون تحديثها هنا تشير بطاقةُ الطلب وشاشةُ التتبّع لنقاطٍ لم تعد في مكانها بالمسار.
        const firstPickup = reordered.find(s => s.type === 'pickup');
        const lastDropoff = [...reordered].reverse().find(s => s.type === 'dropoff');
        if (firstPickup && Number.isFinite(firstPickup.lat)) {
            order.pickup.address = firstPickup.address;
            order.pickup.lat = firstPickup.lat;
            order.pickup.lng = firstPickup.lng;
            if (firstPickup.contactName)  order.pickup.contactName  = firstPickup.contactName;
            if (firstPickup.contactPhone) order.pickup.contactPhone = firstPickup.contactPhone;
        }
        if (lastDropoff && Number.isFinite(lastDropoff.lat)) {
            order.dropoff.address = lastDropoff.address;
            order.dropoff.lat = lastDropoff.lat;
            order.dropoff.lng = lastDropoff.lng;
            if (lastDropoff.contactName)  order.dropoff.receiverName  = lastDropoff.contactName;
            if (lastDropoff.contactPhone) order.dropoff.receiverPhone = lastDropoff.contactPhone;
        }

        await order.save();
        logger.info({ orderId: order._id, captain: req.user.id }, 'Captain reordered trip stops');

        res.json({ message: 'تم تحديث ترتيب المسار', order });
    } catch (error) {
        logger.error({ err: error.message }, 'stops reorder error');
        res.status(500).json({ message: 'Server error' });
    }
});


// @route   PUT /api/orders/:id/deliver
router.put('/:id/deliver', protect, captainOnly, async (req, res) => {
    try {
        // 🧭 توصيل متعدد النقاط: لا يُسمح بالتسليم النهائي إلا بعد إكمال كل النقاط الأخرى.
        // (النقطة الأخيرة المتبقية هي التي يؤكّدها هذا الـ endpoint.)
        const multiCheck = await Order.findOne({ _id: req.params.id, captain: req.user.id })
            .select('isMultiStop stops status');
        if (multiCheck && multiCheck.isMultiStop && Array.isArray(multiCheck.stops)) {
            const undone = multiCheck.stops.filter(s => !s.done).length;
            if (undone > 1) {
                return res.status(400).json({ message: `أكمل باقي النقاط أولاً — تبقّى ${undone} نقطة قبل التسليم النهائي` });
            }
        }

        // 🛡️ CRITICAL FIX: Atomic update for delivery state to prevent Double Commission
        const updatedOrder = await Order.findOneAndUpdate(
            { _id: req.params.id, captain: req.user.id, status: 'picked_up' },
            { $set: { status: 'delivered', deliveredAt: new Date() } },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(400).json({ message: 'الطلب غير متاح للتوصيل أو تم توصيله مسبقاً.' });
        }

        const order = updatedOrder; // for subsequent logic

        // 🧭 علّم كل النقاط المتبقية كمُنجَزة عند التسليم النهائي
        if (order.isMultiStop && Array.isArray(order.stops)) {
            let changed = false;
            order.stops.forEach(s => { if (!s.done) { s.done = true; s.doneAt = new Date(); changed = true; } });
            if (changed) await order.save();
        }

        // Sync ShopOrder manually since findOneAndUpdate bypasses post('save')
        if (order.shopOrderId) {
            try {
                const ShopOrder = require('../models/ShopOrder');
                const shopOrder = await ShopOrder.findByIdAndUpdate(order.shopOrderId, {
                    status: 'delivered',
                    deliveredAt: new Date()
                }, { new: true }).select('itemsTotal discountAmount promoAppliesTo place');

                // 💼 ERP: إغلاق البيع محاسبياً — قيد دخل في دفتر أستاذ المتجر
                // يزيد رصيد مستحقات التاجر لدى التطبيق بقيمة البضاعة
                // (بعد خصم كوبون المنتجات إن وُجد — التوصيل للكابتن لا للتاجر).
                // القيد محمي من التكرار بفهرس فريد على (refId + sale_income).
                if (shopOrder && shopOrder.place) {
                    const goodsAmount = shopOrder.promoAppliesTo === 'products'
                        ? Math.max(0, shopOrder.itemsTotal - (shopOrder.discountAmount || 0))
                        : shopOrder.itemsTotal;
                    if (goodsAmount > 0) {
                        const { recordLedgerEntry } = require('../utils/erpHelpers');
                        const ledgerResult = await recordLedgerEntry({
                            placeId: shopOrder.place,
                            type: 'sale_income',
                            amount: goodsAmount,
                            refModel: 'ShopOrder',
                            refId: shopOrder._id,
                            note: 'دخل بيع — توصيل طلب متجر'
                        });
                        if (ledgerResult.ok) {
                            // إشعار التاجر بإضافة المستحقات
                            try {
                                const Place = require('../models/Place');
                                const placeDoc = await Place.findById(shopOrder.place).select('ownerId').lean();
                                if (placeDoc && placeDoc.ownerId) {
                                    const { sendNotification } = require('../utils/notificationHelper');
                                    await sendNotification(req.app, {
                                        userId: placeDoc.ownerId,
                                        title: 'تمت إضافة مستحقات لرصيدك',
                                        message: `تم توصيل الطلب بنجاح وأُضيف مبلغ ${goodsAmount} ج.س لرصيد مستحقاتك. الرصيد الحالي: ${ledgerResult.balanceAfter} ج.س.`,
                                        type: 'shop_ledger',
                                        relatedId: shopOrder._id
                                    });
                                }
                            } catch (notifErr) { logger.error('Merchant ledger notification failed:', notifErr.message); }
                        }
                    }
                }
            } catch (err) { logger.error('Error syncing ShopOrder deliver', err); }
        }

        // 💳 Commission Deduction — Negative Wallet System
        // ✅ FIX #2: Use the stored order.appFee (locked at order creation time)
        // Do NOT recalculate from live settings — commission rate may have changed.
        let creditLimit = -5000; // fallback
        try {
            const liveSettings = await getCachedSettings(order.city || 'Khartoum');
            if (liveSettings?.defaultCreditLimit) creditLimit = liveSettings.defaultCreditLimit;
        } catch (settingsErr) {
            logger.warn('Could not load settings for credit limit, using default');
        }

        // Use stored appFee; fall back to recalculation only if missing (legacy orders)
        const commissionAmount = order.appFee
            ? parseFloat(order.appFee.toFixed(2))
            : parseFloat(((order.price || 0) * 0.15).toFixed(2));

        logger.info({ orderId: order._id, storedAppFee: order.appFee, commissionAmount }, 'Using stored appFee for commission deduction');

        // 🛡️ CRITICAL FIX: Atomic Wallet Deduction ($inc)
        const User = require('../models/User');
        const captain = await User.findByIdAndUpdate(
            order.captain,
            { $inc: { wallet_balance: -commissionAmount } },
            { new: true } // Returns the document AFTER the update
        );

        if (captain) {
            // ✅ BUG-001 FIX: تعريف المتغيرات المفقودة لمنع ReferenceError في logger
            const orderPrice = order.price;
            const commissionRate = orderPrice > 0 ? commissionAmount / orderPrice : 0;
            // ─── 📋 Detailed server log for verification ───
            logger.info({
                captain: captain.name,
                captainId: captain._id,
                orderId: order._id,
                orderPrice,
                commissionRate: (commissionRate * 100).toFixed(1) + '%',
                commissionAmount,
                newBalance: captain.wallet_balance,
                creditLimit
            }, 'Commission deducted atomically');

            // إيقاف الحساب تلقائياً إذا تجاوز الحد
            if (captain.wallet_balance <= creditLimit && !captain.is_blocked) {
                captain.is_blocked = true;
                await captain.save(); // save the blocked status
                logger.info({ captainId: captain._id, walletBalance: captain.wallet_balance, creditLimit }, 'Captain BLOCKED — exceeded credit limit');

                // 🔔 Push notification to captain
                try {
                    const { sendNotification } = require('../utils/notificationHelper');
                    await sendNotification(req.app, {
                        userId: captain._id,
                        title: '⛔ تم إيقاف حسابك',
                        message: 'تجاوزت الحد الائتماني. يرجى سداد المديونية لإعادة تفعيل الحساب.',
                        type: 'system',
                        relatedId: order._id
                    });
                } catch (notifErr) {
                    logger.error({ err: notifErr }, 'Block notification failed');
                }

                // 🔴 Real-Time Block: emit socket event to captain immediately
                const ioForBlock = req.app.get('io');
                if (ioForBlock) {
                    ioForBlock.to(captain._id.toString()).emit('wallet_limit_reached', {
                        wallet_balance: captain.wallet_balance,
                        credit_limit:   creditLimit,
                        message: 'تجاوزت الحد الائتماني — تم إيقاف حسابك.'
                    });
                    logger.info({ captainId: captain._id }, 'Emitted wallet_limit_reached to captain');
                }
            }
        }


        await sendNotification(req.app, {
            userId: order.client,
            title: '✅ تم التوصيل بنجاح',
            message: `تم توصيل طلبك بنجاح. شكراً لاستخدامك وجيز! لا تنسى تقييم الكابتن.`,
            type: 'order_completed',
            relatedId: order._id
        });

        await sendWhatsAppIfSubscribed(
            order.client,
            OrderMessages.orderDelivered(order._id.toString())
        );

        const io = req.app.get('io');
        if (io) {
            io.to(order.client.toString()).emit('order_status_updated', {
                orderId: order._id,
                status: 'delivered'
            });
            io.to(order.client.toString()).emit('delivery_attempted', {
                orderId: order._id,
                placeId: order.place || null
            });
            // 📢 Notify admin panel — admin_room sees all cities
            io.to('admin_room').emit('admin_order_update', { orderId: order._id, status: 'delivered', captainName: req.user.name, price: order.price, city: order.city });
        }

        // 📊 تتبع إحالات المسوقين — زيادة عداد الأوردرات المؤهِّلة للمكافأة
        // يتم ذلك فقط عند التوصيل الناجح من متجر مُحال عبر نظام الإحالات
        if (order.shopId) {
            try {
                const Referral = require('../models/Referral');
                await Referral.findOneAndUpdate(
                    { placeId: order.shopId },
                    { $inc: { qualifiedOrders: 1 } }
                );
            } catch (refTrackErr) {
                logger.error('Referral order tracking error:', refTrackErr.message);
            }
        }

        res.json({ message: 'Order delivered', order });

    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});




// @route   POST /api/orders/:id/complain
router.post('/:id/complain', protect, async (req, res) => {
    try {
        const { text } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (order.client.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });

        order.complaint = { text, status: 'pending', createdAt: new Date() };
        await order.save();

        // ✅ Send unified notification to all admins about the complaint
        notifyAdmins(req.app, {
            title: '⚠️ شكوى جديدة',
            message: `شكوى جديدة من العميل ${req.user.name || 'أحد العملاء'} على الطلب #${order._id.toString().slice(-6)}`,
            type: 'system',
            relatedId: order._id
        });

        res.json({ message: 'Complaint submitted', order });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});



// ==========================================
// ⭐ تقييم الكابتن (جديد)
// ==========================================
router.post('/:id/rate', protect, ratingLimiter, async (req, res) => {
    try {
        // ⭐ مقياس موحّد 1-5 نجوم (مطابق لواجهة العميل وتقييم المتاجر)
        const rating = Math.round(Number(req.body.rating));
        const orderId = req.params.id;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'التقييم يجب أن يكون بين 1 و 5 نجوم' });
        }

        let order = await Order.findOne({ _id: orderId, client: req.user._id });
        let captainId = null;
        
        // If not found in Order, check ShopOrder
        if (!order) {
            const ShopOrder = require('../models/ShopOrder');
            const shopOrder = await ShopOrder.findOne({ _id: orderId, client: req.user._id });
            if (shopOrder) {
                // ✅ FIX #5: ShopOrder.captain might be null — look up the linked delivery Order
                if (shopOrder.captain) {
                    captainId = shopOrder.captain;
                } else {
                    const deliveryOrder = await Order.findOne({ shopOrderId: shopOrder._id, orderType: 'shop' })
                        .select('captain').lean();
                    captainId = deliveryOrder?.captain || null;
                }
                order = shopOrder;
            }
        } else {
            captainId = order.captain;
        }

        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        // BUG #21 FIX: Ensure the order is actually delivered before allowing rating
        if (order.status !== 'delivered') {
            return res.status(400).json({ message: 'يمكنك التقييم فقط بعد اكتمال التوصيل' });
        }

        // Prevent double rating
        if (order.isRated) {
            return res.status(400).json({ message: 'تم تقييم هذا الطلب مسبقاً' });
        }

        // ✅ FIX #5: Use resolved captainId (works for both Order and ShopOrder)
        const captain = await User.findById(captainId);
        if (!captain) return res.status(404).json({ message: 'الكابتن غير موجود أو لم يُسنَد لهذا الطلب' });

        // Update Captain Stats
        captain.ratingSum = (captain.ratingSum || 0) + rating;
        captain.ratingCount = (captain.ratingCount || 0) + 1;
        captain.averageRating = captain.ratingSum / captain.ratingCount;

        await captain.save();

        // ✅ Save rating in order (as object with score)
        order.rating = { score: rating, comment: '' };
        order.isRated = true;
        await order.save();

        // ✅ Send notification to captain with rating
        await sendNotification(req.app, {
            userId: captainId,
            title: rating >= 4 ? '⭐ تقييم ممتاز!' : rating >= 3 ? '⭐ تقييم جيد' : '⚠️ تقييم منخفض',
            message: `حصلت على تقييم ${rating}/5 ⭐ من العميل ${req.user.name || 'أحد العملاء'}`,
            type: 'system',
            relatedId: order._id
        });

        res.json({ message: 'تم التقييم بنجاح', newAverage: captain.averageRating });

    } catch (error) {
        logger.error({ err: error }, 'Rate order error');
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   GET /api/orders/price-config
// @desc    Get dynamic pricing settings for the authenticated user's city
// ✅ FIX #20: This named route MUST stay above GET /:id — otherwise Express treats
// 'price-config' as an :id param and passes it to findById(), causing a crash.
router.get('/price-config', protect, requireCity, async (req, res) => {
    try {
        // 🌍 Returns pricing for the user's own city — fully isolated
        const settings = await getCachedSettings(req.userCity);
        res.json({
            city: req.userCity,
            baseFare: settings.baseFare ?? 1000,
            costPerKm: settings.costPerKm ?? 200,
            costPerMinute: settings.costPerMinute ?? 25,
            extraStopFee: settings.extraStopFee ?? 0   // 🧭 رسم النقطة الإضافية للتوصيل متعدد النقاط
        });
    } catch (error) {
        logger.error({ err: error }, 'Price Config Error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/orders/:id
// @desc    Get a single order by ID — accessible by its client, captain, admin, or any captain for pending orders
// ✅ FIX #20 (guard): Validate :id is a valid ObjectId before hitting DB
router.get('/:id', protect, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'معرف الطلب غير صحيح' });
        }

        const order = await Order.findById(req.params.id)
            .populate('client', 'name phone')
            // ⭐ averageRating/ratingCount: لإظهار تقييم الكابتن للعميل
            .populate('captain', 'name phone vehicleType currentLocation documents.profilePhoto averageRating ratingCount')
            .lean();

        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        // Access control:
        // - The order's client can view it
        // - The assigned captain can view it
        // - Admin can view any
        // - ✅ ANY captain can view PENDING orders (no captain assigned yet) to see details before accepting
        const userId = req.user.id;
        const isClient = order.client && String(order.client._id) === userId;
        const isCaptain = order.captain && String(order.captain._id) === userId;
        const isAdmin = req.user.role === 'admin';
        // ✅ FIX #11: الكابتن المحجوب لا يمكنه رؤية تفاصيل أي طلب لا يخصه
        const isPendingAndUserIsCaptain = (
            order.status === 'pending' &&
            !order.captain &&
            req.user.role === 'captain' &&
            !req.user.is_blocked  // ✅ FIX: منع الكابتن المحجوب
        );

        // 🏪 تاجر المتجر صاحب الطلب يمكنه تتبع توصيل طلبات متجره
        let isShopOwner = false;
        if (!isClient && !isCaptain && !isAdmin && !isPendingAndUserIsCaptain &&
            req.user.role === 'merchant' && order.shopId) {
            const Place = require('../models/Place');
            const place = await Place.findById(order.shopId).select('ownerId').lean();
            isShopOwner = !!(place && place.ownerId && String(place.ownerId) === userId);
        }

        if (!isClient && !isCaptain && !isAdmin && !isPendingAndUserIsCaptain && !isShopOwner) {
            return res.status(403).json({ message: 'غير مصرح' });
        }

        // 📊 إثراء الرد بالخط الزمني و ETA (بيانات محسوبة، لا تُخزَّن) — مصدر مشترك.
        require('../utils/orderEnrich').enrichOrder(order);

        res.json(order);
    } catch (error) {
        logger.error({ err: error }, 'Get Order Error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 🎟️ التحقق من كوبون الخصم
// =========================================================

// @route  POST /api/orders/apply-promo
// @desc   التحقق من صحة كود الخصم وحساب قيمة الخصم
// @access Client
router.post('/apply-promo', protect, async (req, res) => {
    try {
        const { code, orderValue, productsTotal, deliveryFee, city } = req.body;
        // قيمة الطلب الكاملة (بضاعة + توصيل) — تُحسب من المُرسَل أو من المجموع
        const fullOrderValue = Number(orderValue) ||
            ((Number(productsTotal) || 0) + (Number(deliveryFee) || 0));
        if (!code || !fullOrderValue) {
            return res.status(400).json({ message: 'الكود وقيمة الطلب مطلوبان' });
        }

        const now = new Date();
        const promo = await PromoCode.findOne({
            code:     code.toUpperCase().trim(),
            isActive: true,
            validFrom:  { $lte: now },
            validUntil: { $gte: now }
        });

        // 🔒 نفس المنطق المشترك المستخدم في إنشاء الطلب — مصدر واحد يمنع تباين المسارين.
        // ✅ BUG-006: المدينة تُقارن بمدينة المستخدم المصادق عليه لا بما يرسله العميل.
        const { validatePromo, computeDiscount } = require('../utils/promo');
        const check = validatePromo(promo, {
            userId: req.user._id,
            userCity: req.user.city,
            fullOrderValue
        });
        if (!check.ok) {
            const status = check.error.includes('غير صحيح') ? 404 : 400;
            return res.status(status).json({ message: check.error });
        }

        const calc = computeDiscount(promo, {
            productsTotal: Number(productsTotal) || 0,
            deliveryFee: Number(deliveryFee) || 0,
            fullOrderValue
        });
        if (calc.error) {
            return res.status(400).json({ message: calc.error });
        }
        const scope = calc.scope;
        const scopeLabel = scope === 'products' ? 'المنتجات' : (scope === 'delivery' ? 'التوصيل' : 'الإجمالي');
        const discount = calc.discount;

        res.json({
            valid:         true,
            code:          promo.code,
            type:          promo.type,
            value:         promo.value,
            appliesTo:     scope,
            scopeLabel,
            discount,
            finalPrice:    Math.max(0, fullOrderValue - discount),
            description:   promo.description
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/orders/:id/image
// @desc    جلب صورة الطرد عند الطلب فقط (لأطراف الطلب) — لتفادي تحميل Base64 في القوائم
router.get('/:id/image', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).select('parcelImage client captain');
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        const uid = req.user.id;
        const isParticipant = [order.client, order.captain]
            .filter(Boolean)
            .some(x => x.toString() === uid);
        if (!isParticipant) return res.status(403).json({ message: 'غير مصرح بعرض هذه الصورة' });

        if (!order.parcelImage) return res.status(404).json({ message: 'لا توجد صورة لهذا الطلب' });

        res.json({ parcelImage: order.parcelImage });
    } catch (error) {
        logger.error({ err: error }, 'Order image fetch error');
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;