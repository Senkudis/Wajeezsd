const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const validateObjectId = require('../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب)
router.param('id', validateObjectId);
const Order = require('../models/Order');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Settings = require('../models/Settings');
const PromoCode = require('../models/PromoCode');
const Rating = require('../models/Rating');
const { protect, captainOnly, clientOnly } = require('../middleware/authMiddleware');
const { requireCity } = require('../middleware/cityMiddleware');
const { validateOrder } = require('../middleware/validateMiddleware');
const nodemailer = require('nodemailer');
const { sendNotification, notifyAdmins } = require('../utils/notificationHelper');
const { sendWhatsAppIfSubscribed, OrderMessages } = require('../utils/whatsappNotificationHelper');
const rateLimit = require('express-rate-limit');
const { saveBase64Image } = require('../utils/imageUpload');
const { validateOrderLocations } = require('../utils/geofence');
const { evaluateDeliveryProof } = require('../utils/deliveryProof');
const { NEGOTIATION_TTL_MS } = require('../utils/negotiation');
const logger = require('../utils/logger');

// ⚡ Settings cache — per-city Map, refresh every 60 seconds to avoid repeated DB queries
// Structure: Map<city, { data: settingsObj, time: timestamp }>
const _settingsCache = new Map();
const CACHE_TTL = 60_000;

async function getCachedSettings(city = 'Khartoum') {
    const cached = _settingsCache.get(city);
    // BUG-L5 FIX: إعادة نسخة سطحية لا المرجع المباشر — تمنع تلوّث الكاش من خارجه
    if (cached && Date.now() - cached.time < CACHE_TTL) return { ...cached.data };
    const data = await Settings.getSettings(city);
    _settingsCache.set(city, { data, time: Date.now() });
    return data;
}

// BUG-H7 FIX: دالة لمسح الكاش عند تحديث الإعدادات من لوحة الإدارة
// تُصدَّر لتُستخدَم في مسارات الإعدادات (routes/admin.js)
function invalidateSettingsCache(city) {
    if (city) {
        _settingsCache.delete(city);
    } else {
        _settingsCache.clear(); // مسح كل المدن إذا لم تُحدَّد مدينة
    }
}
module.exports.invalidateSettingsCache = invalidateSettingsCache;

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

// Rate Limiter للإكرامية — تعديلٌ متكرّر على مبلغٍ نقدي يستحقّ حدّاً
const tipLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { message: 'يرجى الانتظار قليلاً قبل تعديل الإكرامية مجدداً.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false }
});

// 💵 إجمالي ما يدفعه العميل نقداً: الأجرة بعد الخصم زائد الإكرامية.
// دالةٌ واحدة لا حسابٌ مكرّر في كل معالج — اختلافُ نسختين من هذه المعادلة
// يعني رقمين مختلفين على شاشة العميل وشاشة الكابتن لنفس الطلب.
function totalDueFromClient(order) {
    const price = Number(order?.price) || 0;
    const discount = Number(order?.discountAmount) || 0;
    const tip = Number(order?.tip?.amount) || 0;
    return Math.max(0, price - discount) + tip;
}
module.exports.totalDueFromClient = totalDueFromClient;

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

        // ✅ Get commission rate and pricing limits from the user's CITY Settings (fully isolated per city)
        const settings = await getCachedSettings(req.userCity);
        const commissionRate = settings.commissionRate ?? 0.15; // null-safe fallback only

        // 📏 حساب المسافة التقديرية والتسعيرة المحسوبة للرحلة
        const { haversineKm } = require('../utils/geofence');
        let totalDistanceKm = 0;
        if (isMultiStop && Array.isArray(sanitizedStops) && sanitizedStops.length >= 2) {
            for (let i = 1; i < sanitizedStops.length; i++) {
                const segDist = haversineKm(sanitizedStops[i - 1], sanitizedStops[i]);
                if (typeof segDist === 'number' && Number.isFinite(segDist)) {
                    totalDistanceKm += segDist;
                }
            }
        } else if (pickup && dropoff) {
            const dist = haversineKm(pickup, dropoff);
            if (typeof dist === 'number' && Number.isFinite(dist)) {
                totalDistanceKm = dist;
            }
        }

        const base = settings.baseFare || 1000;
        const costPerKm = settings.costPerKm || 200;
        const extraStopFee = settings.extraStopFee || 0;
        const extraStops = isMultiStop ? Math.max(0, sanitizedStops.length - 2) : 0;

        // تسعيرة التطبيق المقدرة للرحلة
        let calculatedPrice = base + (totalDistanceKm * costPerKm) + (extraStopFee * extraStops);
        calculatedPrice = Math.ceil(calculatedPrice / 100) * 100;

        // نسب التخفيض والسقف من الإعدادات
        const maxDiscountPercent = typeof settings.maxDiscountPercent === 'number' ? settings.maxDiscountPercent : 10;
        const maxPriceSurgePercent = typeof settings.maxPriceSurgePercent === 'number' ? settings.maxPriceSurgePercent : 100;

        // ✅ Server-Side Security: Prevent clients from sending an abnormally low price below the relative discount limit
        const minPriceFloor = base + (extraStopFee * extraStops);
        const relativeMinPrice = Math.ceil((calculatedPrice * (1 - (maxDiscountPercent / 100))) / 100) * 100;
        const minAllowedPrice = Math.max(minPriceFloor, relativeMinPrice);

        // سقف السعر الأقصى المسموح
        const maxAllowedPrice = Math.ceil((calculatedPrice * (1 + (maxPriceSurgePercent / 100))) / 100) * 100;

        if (price < minAllowedPrice) {
            return res.status(400).json({
                message: `عذراً، السعر المطلوب (${price} ج.س) أقل من الحد الأدنى المسموح به لهذا المشوار (${minAllowedPrice} ج.س). أقصى نسبة تخفيض مسموحة هي ${maxDiscountPercent}% من تسعيرة التطبيق المقدرة (${calculatedPrice} ج.س).`,
                calculatedPrice,
                minAllowedPrice,
                maxAllowedPrice,
                maxDiscountPercent
            });
        }

        if (price > maxAllowedPrice) {
            return res.status(400).json({
                message: `عذراً، السعر المطلوب (${price} ج.س) يتجاوز الحد الأعلى المسموح به لهذا المشوار (${maxAllowedPrice} ج.س).`,
                calculatedPrice,
                minAllowedPrice,
                maxAllowedPrice,
                maxPriceSurgePercent
            });
        }

        const appFee = price * commissionRate;
        const netRevenue = price - appFee;

        // 🖼️ صور الطلب: تُحوَّل من Base64 إلى ملفات بدل تخزينها داخل المستند
        // (كان الـ base64 ~500KB يُضخّم كل مستند طلب ويبطئ استعلامات القوائم).
        // متوافق مع القديم: لو فشل التحويل أو كان فارغاً ⇒ null بلا كسر الطلب.
        const { saveBase64ToUploads } = require('../utils/imageUpload');
        let parcelImageUrl = null, receiptImageUrl = null;
        try { parcelImageUrl = saveBase64ToUploads(req.body.parcelImage, 'parcels'); }
        catch (e) { logger.error({ err: e }, 'parcelImage save failed'); }
        try { receiptImageUrl = saveBase64ToUploads(req.body.receiptImage, 'proofs'); }
        catch (e) { logger.error({ err: e }, 'receiptImage save failed'); }

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

            // 📞 هاتف نقطة الاستلام يُشتق هنا من مستند المتجر، ولم يعد يأتي من
            // العميل. سببان:
            //   1) رقم المتجر صار محجوباً عن العميل (لا يتواصل خارج التطبيق)،
            //      فلو بقي الاعتماد على ما يرسله لوصل الكابتن '0000000000'.
            //   2) كان بإمكان العميل إرسال أي رقم فيُخزَّن كهاتف المتجر.
            // الكابتن يبقى يرى الرقم — هو يحتاجه للاستلام فعلاً.
            orderData.pickup = {
                ...(orderData.pickup || {}),
                contactName: place.name || (orderData.pickup && orderData.pickup.contactName) || '',
                contactPhone: place.phone || ''
            };
            orderData.items = items;
            // حفظ تفاصيل الطلبية كنص (للعرض في كارت الكابتن)
            if (req.body.shopOrderDetails) {
                orderData.shopOrderDetails = req.body.shopOrderDetails;
            }
        }

        // 🛒 خدمة "اشترِ لي": محل غير مسجّل + أصناف نصية + سعر بضاعة يُحسم لاحقاً.
        // price هنا = أجرة الخدمة (كالتوصيل، عليها العمولة). البضاعة نقدية بين العميل والكابتن.
        if (orderType === 'errand') {
            const { validateErrandInput } = require('../utils/errand');
            const chk = validateErrandInput({ shopId, shopName, pickup, items });
            if (!chk.valid) return res.status(400).json({ message: chk.message });

            // محل منسّق؟ خذ اسمه الرسمي من القاعدة. وإلا الاسم المخصّص من العميل.
            let curatedId = null, resolvedName = shopName;
            if (shopId && mongoose.Types.ObjectId.isValid(shopId)) {
                const Place = require('../models/Place');
                const place = await Place.findById(shopId).select('name errandEnabled isActive').lean();
                if (place && place.errandEnabled !== false && place.isActive !== false) {
                    curatedId = place._id;
                    resolvedName = place.name;
                }
            }

            orderData.orderType = 'errand';
            orderData.shopId = curatedId;
            orderData.shopName = String(resolvedName || 'محل').slice(0, 120);
            orderData.items = chk.items.map(s => s.slice(0, 200));
            const budget = Number(req.body.budget) > 0 ? Number(req.body.budget) : null;
            orderData.errand = {
                budget,
                // ⚠️ الموافقة المسبقة بلا سقف بيضاء: إذنٌ مفتوح بإنفاق مال العميل.
                // لا تُقبل إلا مقرونةً بميزانية تحدّها.
                autoApprove: !!budget && (req.body.autoApprove === true || req.body.autoApprove === 'true'),
                quoteStatus: 'none'
            };

            // 🧠 تعلَّم المكان: مكانٌ اختاره عميل فعلاً يستحق الحفظ، فالبحث التالي عنه
            // يأتي من قاعدتنا بلا نداء مدفوع لجوجل. لا يعطّل الطلب إن فشل.
            if (!curatedId) {
                try {
                    const ExternalPlace = require('../models/ExternalPlace');
                    await ExternalPlace.recordUsage({
                        googlePlaceId: req.body.externalPlaceId || null,
                        name: orderData.shopName,
                        address: pickup && pickup.address,
                        lat: pickup && Number(pickup.lat),
                        lng: pickup && Number(pickup.lng),
                        category: req.body.shopCategory || '',
                        categoryKey: req.body.shopCategoryKey || '',
                        city: req.userCity
                    });
                } catch (e) {
                    logger.warn({ err: e.message }, 'external place learn failed');
                }
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
            const _kindLabel = orderType === 'shop' ? 'محل' : orderType === 'errand' ? 'شراء' : 'توصيل';
            notifyAdmins(req.app, {
                title: 'طلب جديد',
                message: `طلب ${_kindLabel} جديد بسعر ${order.price} ج.س — ${order.city}`,
                type: 'admin_order_alert',
                relatedId: order._id
            });

            // 📣 توزيع ذكي للكباتن: الأقرب أولاً ثم البقية جميعاً كشبكة أمان.
            // Fire and forget to prevent HTTP timeouts
            setImmediate(async () => {
                try {
                    const { sendPushToMany } = require('../utils/firebasePush');
                    const { planDispatch } = require('../utils/captainDispatch');

                    // كباتن المدينة الفعّالون ذوو توكن FCM (+ موقعهم للترتيب بالقرب)
                    const activeCaptains = await User.find({
                        role: 'captain',
                        city: order.city,   // 🌍 Scoped to order's city
                        fcmToken: { $exists: true, $ne: null },
                        isActive: true              // account not suspended by admin
                    }).select('fcmToken currentLocation');

                    const { near, rest } = planDispatch(
                        activeCaptains.map(c => ({ fcmToken: c.fcmToken, currentLocation: c.currentLocation })),
                        order.pickup
                    );

                    if (near.length === 0) {
                        // 🔍 قابلية التشخيص: صفر توكنات (مدينة/isActive/توكن مفقود) — حالة كانت صامتة
                        logger.warn({ orderId: order._id, city: order.city }, 'New order: no captain FCM tokens in city — push skipped');
                        return;
                    }

                    let title, bodyMsg, pushType;
                    if (orderType === 'shop') {
                        title = '🛒 طلب محل جديد! 🚨';
                        bodyMsg = `طلب من ${order.shopName || 'محل'} بسعر ${order.price} ج.س. عرض التفاصيل!`;
                        pushType = 'shop_order';
                    } else if (orderType === 'errand') {
                        title = '🛍️ طلب شراء جديد! 🚨';
                        bodyMsg = `اشترِ من ${order.shopName || 'محل'} — أجرة الخدمة ${order.price} ج.س. عرض التفاصيل!`;
                        pushType = 'errand';
                    } else {
                        title = '📦 طلب توصيل جديد! 🚨';
                        bodyMsg = `طلب توصيل جديد متاح بسعر ${order.price} ج.س! عرض التفاصيل`;
                        pushType = 'new_order';
                    }
                    const pushData = {
                        type: pushType,
                        orderId: order._id.toString(),
                        url: `/captain-orders.html?highlight=${order._id.toString()}` // 🧭 وجهة الكابتن
                    };

                    // 🌊 الموجة 1: الأقرب فوراً
                    const r1 = await sendPushToMany(near, title, bodyMsg, pushData);
                    logger.info({
                        orderId: order._id, city: order.city, wave: 1,
                        targeted: near.length, sent: r1.success, failed: r1.failure
                    }, 'New order captain push (wave 1 — nearest)');

                    // لا موجة ثانية (كل الكباتن في الأولى) ⇒ علّم البثّ للكل مكتملاً
                    if (rest.length === 0) {
                        await Order.updateOne({ _id: order._id }, { $set: { dispatchedAllAt: new Date() } });
                    }

                    // 🌊 الموجة 2: بقية كباتن المدينة بعد مهلة قصيرة، فقط إن ظلّ الطلب معلّقاً.
                    // شبكة أمان: لو ضاع إشعار الأقرب ولم يُقبل الطلب، يصل الجميع خلال ~18ث.
                    // (لو قَبِل الأقرب سريعاً لا نُزعج البقية — الطلب لم يعد متاحاً.)
                    if (rest.length) {
                        setTimeout(async () => {
                            try {
                                const fresh = await Order.findById(order._id).select('status captain');
                                if (fresh && fresh.status === 'pending' && !fresh.captain) {
                                    const r2 = await sendPushToMany(rest, title, bodyMsg, pushData);
                                    // 🏷️ علّم أن البثّ للكل تمّ — يمنع شبكة الأمان في scheduler من التكرار
                                    await Order.updateOne({ _id: order._id }, { $set: { dispatchedAllAt: new Date() } });
                                    logger.info({
                                        orderId: order._id, city: order.city, wave: 2,
                                        targeted: rest.length, sent: r2.success, failed: r2.failure
                                    }, 'New order captain push (wave 2 — fallback to all)');
                                } else {
                                    logger.debug({ orderId: order._id }, 'Wave 2 skipped — order no longer pending');
                                }
                            } catch (w2Err) {
                                logger.error({ err: w2Err, orderId: order._id }, 'Wave 2 push failed');
                            }
                        }, 18000);
                    }
                    // ملاحظة: إشعار/دفعة الأدمن تُعالَج عبر notifyAdmins (حفظ + socket + push) أعلاه.
                } catch (pushErr) {
                    logger.error({ err: pushErr }, 'Multicast Push Failed in background');
                }
            });
        }

        // 💬 طمأنة فورية للعميل: الصمت بعد الضغط على "أرسل" هو أول لحظة يشكّ
        // فيها العميل أن شيئاً لم يحدث. الإشعار يصله حتى لو أغلق التطبيق،
        // ويظهر في سجل إشعاراته كأثر مكتوب أن الطلب استُلم فعلاً.
        if (!isScheduled && order.client) {
            sendNotification(req.app, {
                userId: order.client,
                title: 'استلمنا طلبك',
                message: 'نبحث لك الآن عن أقرب كابتن متاح — لا تقلق، سنخبرك فور قبول الطلب.',
                type: 'order_searching',
                relatedId: order._id
            }).catch(e => logger.warn({ err: e?.message, orderId: order._id }, 'Order-received notification failed'));
        }

        const msg = isScheduled
            ? `تم جدولة طلبك بنجاح! سيُنشر للكباتن في ${new Date(scheduledAt).toLocaleString('ar-SA')}`
            : 'تم إنشاء الطلب بنجاح — نبحث لك عن أقرب كابتن';

        // BUG-C4 FIX: إرسال الحقول الضرورية للعميل فقط — لا تسريب appFee/netRevenue/city/parcelImage
        res.status(201).json({
            message: msg,
            order: {
                _id: order._id,
                orderType: order.orderType,
                status: order.status,
                price: order.price,
                discountAmount: order.discountAmount || 0,
                pickup: order.pickup,
                dropoff: order.dropoff,
                stops: order.stops,
                isMultiStop: order.isMultiStop,
                scheduledAt: order.scheduledAt,
                promoCode: order.promoCode,
                paymentMethod: order.paymentMethod,
                tip: order.tip?.amount || 0,
                createdAt: order.createdAt
            }
        });
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
            shopOrder.cancelledAt = new Date();   // ⏱️ للخط الزمني
            await shopOrder.save();

            // BUG-BL1 FIX: العميل ألغى ShopOrder، يجب إلغاء طلب التوصيل المرتبط (إن وجد)
            const linkedOrder = await Order.findOne({ shopOrderId: shopOrder._id, status: { $in: ['pending', 'accepted'] } });
            if (linkedOrder) {
                linkedOrder.status = 'cancelled';
                linkedOrder.cancelledBy = 'client';
                await linkedOrder.save();
                logger.info(`🔗 Linked delivery Order ${linkedOrder._id} cancelled with ShopOrder ${shopOrder._id}`);
            }

            // BUG-C2 FIX: استعادة المخزون بشكل ذري — حذف الاستعلام المنفصل findById
            if (shopOrder.items && shopOrder.items.length > 0) {
                const Product = require('../models/Product');
                const { recordStockMovement } = require('../utils/erpHelpers');
                for (const item of shopOrder.items) {
                    if (item.productId) {
                        const restored = await Product.findOneAndUpdate(
                            { _id: item.productId, stock: { $ne: null } },
                            { $inc: { stock: item.quantity } },
                            { new: true }
                        ).select('stock name');

                        if (restored) {
                            if (restored.stock > 0) {
                                await Product.updateOne({ _id: item.productId }, { $set: { isAvailable: true } });
                            }
                            recordStockMovement({
                                placeId: shopOrder.place, productId: item.productId,
                                productName: item.name || restored.name || '',
                                type: 'return', quantity: item.quantity,
                                balanceAfter: restored.stock,
                                reason: 'ارجاع للمخزون - الغاء العميل',
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
                        title: 'تم إلغاء الطلب',
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

        // BL-M3 FIX: منع تخطي حماية إلغاء طلب المتجر عبر طلب التوصيل المرتبط.
        // السيناريو: المتجر بدأ بالتجهيز → حُظر إلغاء ShopOrder. لكن العميل يملك
        // deliveryOrderId المرتبط (حالته pending) ويلغيه مباشرة → Hook يُلغي ShopOrder تلقائياً!
        // الحل: أي Order مرتبط بـ ShopOrder لا يُلغى من هنا — استخدم مسار ShopOrder.
        if (order.shopOrderId) {
            return res.status(400).json({ message: 'هذا الطلب مرتبط بطلب متجر. استخدم مسار إلغاء طلب المتجر.' });
        }

        if (['accepted', 'picked_up', 'delivered'].includes(order.status)) {
            return res.status(400).json({ message: 'لا يمكن إلغاء الطلب بعد قبول الكابتن. تواصل مع الدعم إن كان هناك مشكلة.' });
        }

        const { reason, reasonCode } = req.body || {};

        // 📊 رمز السبب يأتي من قائمة ثابتة — أي قيمة خارجها تُهمَل بدل أن
        // تلوّث التجميع الإحصائي برموز مخترَعة من الواجهة.
        const { CANCEL_REASONS } = require('../models/Feedback');
        const safeReasonCode = reasonCode && Object.hasOwn(CANCEL_REASONS, reasonCode)
            ? reasonCode
            : null;

        // ✅ الإلغاء مسموح فقط في حالتي pending و scheduled
        // BUG-M2 FIX: تعقيم سبب الإلغاء لمنع XSS في الإشعارات — نُزيل وسوم HTML
        const freeText = reason
            ? String(reason).trim().replace(/<[^>]*>/g, '').substring(0, 200)
            : '';
        const sanitizedReason = freeText
            || (safeReasonCode ? CANCEL_REASONS[safeReasonCode] : '')
            || 'إلغاء من قبل العميل';

        const cancelledOrder = await Order.findOneAndUpdate(
            { _id: req.params.id, status: { $in: ['pending', 'scheduled'] }, client: req.user.id },
            { $set: {
                status: 'cancelled',
                cancelledBy: 'client',
                cancelReason: sanitizedReason,
                cancelReasonCode: safeReasonCode,
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

        // BUG-L3 FIX: جمع العروض المعلّقة من cancelledOrder (مع new:true)
        // ثم تحديث ذري في DB بدل تعديل الكائن المحلي ثم save()
        // — save() كان يكتب كل الحقول ويُطلق post('save') hook (ShopOrder sync)
        const pendingNegotiations = (order.negotiations || []).filter(n => n.status === 'pending');

        if (pendingNegotiations.length > 0) {
            // تحديث ذري: رفض كل العروض المعلّقة بعملية واحدة
            await Order.updateOne(
                { _id: order._id },
                { $set: { 'negotiations.$[elem].status': 'rejected' } },
                { arrayFilters: [{ 'elem.status': 'pending' }] }
            );
        }

        // إشعار كل كابتن بعرض معلّق
        for (const neg of pendingNegotiations) {
            const capId = neg.captainId;
            if (capId) {
                if (io) {
                    io.to(capId.toString()).emit('negotiation_resolved', {
                        orderId: order._id,
                        result: 'order_taken'
                    });
                }
                await sendNotification(req.app, {
                    userId: capId,
                    title: 'تم إلغاء الطلب',
                    message: 'قام العميل بإلغاء الطلب الذي قدمت عليه عرضاً.',
                    type: 'order_update',
                    relatedId: order._id
                });
            }
        }

        
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
                title: 'تم إلغاء الطلب',
                message: `العميل ألغى الطلب رقم ${order._id.toString().slice(-6)}${order.cancelReason ? ` — السبب: ${order.cancelReason}` : ''}`,
                type: 'order_update',
                relatedId: order._id
            });
        }

        // 📊 سجّل سبب الإلغاء في "صوت العميل" — يُقرأ مجمّعاً في لوحة الإدارة.
        // خارج المسار الحرِج: فشل التسجيل لا يمنع إتمام الإلغاء نفسه.
        if (safeReasonCode || freeText) {
            try {
                const Feedback = require('../models/Feedback');
                const fb = await Feedback.create({
                    user: req.user._id,
                    kind: 'cancellation',
                    order: order._id,
                    orderModel: 'Order',
                    reasonCode: safeReasonCode,
                    message: freeText,
                    city: order.city || req.user.city || 'Khartoum'
                });
                if (io) {
                    io.to('admin_room').emit('new_feedback', {
                        id: fb._id, kind: 'cancellation',
                        reasonCode: safeReasonCode, city: fb.city
                    });
                }
            } catch (fbErr) {
                // 11000 = العميل ضغط "إلغاء" مرتين — السبب مسجَّل مسبقاً
                if (!fbErr || fbErr.code !== 11000) {
                    logger.warn({ err: fbErr?.message, orderId: order._id }, 'Cancellation feedback not recorded');
                }
            }
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

        // 🧾 حوّل إشعار الدفع من Base64 إلى ملف (بدل تخزينه داخل مستند ShopOrder)
        const { saveBase64ToUploads } = require('../utils/imageUpload');
        const savedReceipt = saveBase64ToUploads(receiptImage, 'proofs');
        if (!savedReceipt) return res.status(400).json({ message: 'صورة الإشعار غير صالحة' });
        order.paymentReceiptImage = savedReceipt;
        order.paymentStatus = 'receipt_sent';
        await order.save();

        // Notify merchant
        const place = await Place.findById(order.place);
        if (place && place.ownerId) {
            await sendNotification(req.app, {
                userId: place.ownerId,
                title: 'إشعار دفع جديد',
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
        // BUG-M5 FIX: التحقق من صحة التاريخ قبل استخدامه — ?since=INVALID_DATE كان يُعيد نتائج فارغة
        const _sinceRaw = req.query.since ? new Date(req.query.since) : null;
        const sinceParam = (_sinceRaw && !isNaN(_sinceRaw.getTime())) ? _sinceRaw : null;
        const defaultSince = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000); // 6 months
        const since = sinceParam || defaultSince;
        const dateFilter = { createdAt: { $gte: since } };
        // BUG-H1 FIX: الجلب الصحيح بـ DB-level skip/limit يبدأ من السطر 806
        const ShopOrder = require('../models/ShopOrder');
        // BUG-H1 FIX: حساب skip صحيح لكل collection بدلاً من تحميل 200 ثم التقطيع
        // نستخدم countDocuments لمعرفة التوزيع الحقيقي بين النوعين،
        // ثم نُحسب نقطة البداية (skip) لكل collection بناءً على الصفحة المطلوبة.
        const [realOrderCount, realShopOrderCount] = await Promise.all([
            Order.countDocuments({ client: req.user.id, orderType: { $ne: 'shop' }, ...dateFilter }),
            ShopOrder.countDocuments({ client: req.user.id, status: { $ne: 'chat_initiated' }, ...dateFilter })
        ]);
        const total = realOrderCount + realShopOrderCount;
        const skip = (page - 1) * limit;

        // تحديد كمية الجلب من كل collection بشكل ذكي: نجلب slice مناسباً فقط
        // بدلاً من MAX_FETCH=200 الثابت الذي يفشل مع أكثر من 200 طلب
        const orderSkip      = Math.min(skip, realOrderCount);
        const orderLimit     = Math.max(0, Math.min(limit, realOrderCount - orderSkip));
        const shopSkip       = Math.max(0, skip - realOrderCount);
        const shopLimitBound = Math.max(0, limit - orderLimit);

        // إذا كانت الصفحة المطلوبة تمتد عبر النوعين — نجلب بعضاً من كل واحد
        // (الدمج في الذاكرة ضروري هنا لكنه محدود بـ limit فقط لا 200)
        const ordersPage = orderLimit > 0
            ? await Order.find({ client: req.user.id, orderType: { $ne: 'shop' }, ...dateFilter })
                .select('-parcelImage')
                .populate('captain', 'name phone vehicleType currentLocation documents.profilePhoto averageRating ratingCount completedTrips')
                .sort({ createdAt: -1 })
                .skip(orderSkip)
                .limit(orderLimit)
                .lean()
            : [];

        const shopOrdersPage = shopLimitBound > 0
            ? await ShopOrder.find({ client: req.user.id, status: { $ne: 'chat_initiated' }, ...dateFilter })
                .select('-paymentReceiptImage')
                .populate('place', 'name address bankAccountName bankAccountNumber bankName')
                .populate('captain', 'name phone vehicleType currentLocation documents.profilePhoto averageRating ratingCount completedTrips')
                .sort({ createdAt: -1 })
                .skip(shopSkip)
                .limit(shopLimitBound)
                .lean()
            : [];

        // لا نزال بحاجة لـ hasImage marks لـ ordersPage
        const pageOrderIds = ordersPage.map(o => o._id);
        if (pageOrderIds.length) {
            const withImg = await Order.find({
                _id: { $in: pageOrderIds },
                parcelImage: { $type: 'string', $ne: '' }
            }).select('_id').lean();
            const imgSet = new Set(withImg.map(d => String(d._id)));
            ordersPage.forEach(o => { o.hasImage = imgSet.has(String(o._id)); });
        }

        // جلب negotiations للـ shopOrders في هذه الصفحة
        const pageShopIds = shopOrdersPage.map(so => so._id);
        const pageDeliveryOrders = pageShopIds.length
            ? await Order.find({ shopOrderId: { $in: pageShopIds }, orderType: 'shop' })
                .select('negotiations shopOrderId captain')
                .lean()
            : [];

        // Map ShopOrders to match Order format
        const mappedShopOrders = shopOrdersPage.map(so => {
            const relatedDelivery = pageDeliveryOrders.find(doObj => doObj.shopOrderId && doObj.shopOrderId.toString() === so._id.toString());

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
                acceptedAt: so.merchantConfirmedAt || so.captainAssignedAt || null,
                pickedUpAt: so.pickedUpAt || null,
                deliveredAt: so.deliveredAt || null,
                cancelledAt: so.cancelledAt || null,
                captain: so.captain || (relatedDelivery ? relatedDelivery.captain : null),
                isRated: so.isRated || false,
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

        // دمج وترتيب داخل الصفحة فقط (لا نحمّل أكثر من limit مستند)
        const paginatedOrders = [...ordersPage, ...mappedShopOrders]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // 📊 إثراء كل طلب بالخط الزمني و ETA (بعد الترقيم لتوفير الحساب) — مصدر مشترك
        const { enrichOrder } = require('../utils/orderEnrich');
        paginatedOrders.forEach(enrichOrder);

        // total, realOrderCount, realShopOrderCount محسوبة مسبقاً في BUG-H1 FIX أعلاه

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
    // BUG-L6 FIX: منع الكابتن غير المعتمد من التفاوض — is_blocked يُعيَّن مالياً
    // لكن كابتن approvalStatus='pending' قد لا يكون is_blocked بعد
    if (req.user.approvalStatus !== 'approved') {
        return res.status(403).json({ message: 'حسابك قيد المراجعة ولم يُعتمد بعد — لا يمكنك تقديم عروض' });
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

        const expiresAt = new Date(Date.now() + NEGOTIATION_TTL_MS);

        // BL-RC1 FIX: استبدال order.negotiations.push(...) + order.save() بـ تحديث ذري.
        // المشكلة: كابتنان يرسلان عرضاً في نفس اللحظة → كلاهما يقرأ المستند → كل save()
        // يكتب فوق الآخر → عرض أحدهما يُمسح نهائياً من قاعدة البيانات.
        // $push هنا ذري تماماً: MongoDB يضمن أن العرضين يصلان حتى لو جاءا في نفس الجزء من الثانية.
        const newOffer = {
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
        };

        await Order.updateOne(
            { _id: order._id },
            { $push: { negotiations: newOffer } }
        );

        // ✅ BUG-013 FIX: استدعاء sendOfferExpiryReminder فعلياً بعد حفظ العرض
        // يرسل إشعاراً FCM للكابتن قبل دقيقتين من انتهاء عرضه
        try {
            const { sendOfferExpiryReminder } = require('../scheduler');
            if (req.user.fcmToken) {
                sendOfferExpiryReminder(req.user.fcmToken, order._id, NEGOTIATION_TTL_MS);
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

            // 📢 الإدارة كانت عمياء تماماً عن المفاوضات: ترى الطلب "قيد الانتظار"
            // بلا أي أثر لعروض الكباتن عليه، فلا تعرف إن كان مهملاً أم تحت تفاوض نشط.
            io.to('admin_room').emit('negotiation_update', {
                orderId: order._id,
                city: order.city,
                captainName: req.user.name,
                proposedPrice,
                originalPrice: order.price,
                expiresAt
            });
        }

        // 🔔 Notification
        await sendNotification(req.app, {
            userId: order.client._id,
            title: 'عرض سعر جديد',
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
            // BUG-C6 FIX: التحقق من حالة الكابتن قبل إسناد الطلب — قد يُوقَف بعد تقديم عرضه
            const User = require('../models/User');
            const captainDoc = await User.findById(captainId).select('is_blocked').lean();
            if (captainDoc && captainDoc.is_blocked) {
                return res.status(400).json({
                    message: 'لا يمكن قبول عرض هذا الكابتن — حسابه موقوف حالياً. اختر كابتناً آخر.'
                });
            }

            // Accept: update price, assign captain, change status
            // BUG-L2 FIX: لا نُعدِّل order.negotiations المحلي ثم نكتبها كاملاً ($set: negotiations)
            // — ذلك يُضيّع عروض كباتن أضافوا عرضاً بين findById والـ findOneAndUpdate.
            // الحل: findOneAndUpdate يحمي الحقول الرئيسية فقط، ثم عمليتان ذريتان للـ negotiations.

            // Recalculate fees using the ORDER's city commission rate
            const settings = await getCachedSettings(order.city || 'Khartoum');
            const commissionRate = settings.commissionRate ?? 0.15;
            const acceptedPrice  = offer.proposedPrice;
            const newAppFee      = acceptedPrice * commissionRate;
            const newNetRevenue  = acceptedPrice - newAppFee;

            // 🛡️ Step 1: قبول الطلب ذرياً — بدون كتابة negotiations
            const updatedOrder = await Order.findOneAndUpdate(
                { _id: req.params.id, status: 'pending' },
                {
                    $set: {
                        price: acceptedPrice,
                        captain: captainId,
                        status: 'accepted',
                        acceptedAt: new Date(),   // ⏱️ للخط الزمني
                        negotiation: { isActive: false, status: 'none' },
                        appFee: newAppFee,
                        // ➕ الإكرامية جزء من صافي الكابتن ولا تمسّها المفاوضة
                        netRevenue: newNetRevenue + (Number(order.tip?.amount) || 0)
                    }
                },
                { new: true }
            );

            if (!updatedOrder) {
                return res.status(400).json({ message: 'الطلب لم يعد متاحاً أو تم قبوله بالفعل' });
            }

            // 🛡️ Step 2: تحديث negotiations بعمليات ذرية — لا نكتب المصفوفة كاملاً
            // علّم عرض الكابتن الفائز كمقبول (positional $)
            await Order.updateOne(
                { _id: updatedOrder._id, 'negotiations.captainId': new mongoose.Types.ObjectId(captainId), 'negotiations.status': 'pending' },
                { $set: { 'negotiations.$.status': 'accepted' } }
            ).catch(e => logger.warn({ err: e.message }, 'BUG-L2: mark winner offer failed'));

            // ارفض كل العروض المعلّقة الأخرى (arrayFilters)
            await Order.updateOne(
                { _id: updatedOrder._id },
                { $set: { 'negotiations.$[elem].status': 'rejected' } },
                { arrayFilters: [{ 'elem.status': 'pending', 'elem.captainId': { $ne: new mongoose.Types.ObjectId(captainId) } }] }
            ).catch(e => logger.warn({ err: e.message }, 'BUG-L2: reject other offers failed'));

            // Sync ShopOrder manually
            if (updatedOrder.shopOrderId) {
                try {
                    const ShopOrder = require('../models/ShopOrder');
                    await ShopOrder.findByIdAndUpdate(updatedOrder.shopOrderId, {
                        status: 'captain_assigned',
                        captain: updatedOrder.captain,
                        captainAssignedAt: new Date()   // ⏱️ للخط الزمني
                    });
                } catch (err) { logger.error('Error syncing ShopOrder negotiate', err); }
            }

            // Notify winning captain
            if (io) {
                io.to(captainId.toString()).emit('negotiation_resolved', {
                    orderId: order._id,
                    result: 'accepted',
                    finalPrice: acceptedPrice
                });
                io.to(order.client.toString()).emit('order_status_updated', {
                    orderId: order._id,
                    status: 'accepted',
                    captainId
                });
                // قبول عرض يُسند الطلب لكابتن دون أن يمرّ بمسار /accept، فلولا هذا
                // البثّ تبقى لوحة الإدارة تعرض الطلب "قيد الانتظار" حتى تحديث الصفحة
                io.to('admin_room').emit('admin_order_update', {
                    orderId: order._id,
                    status: 'accepted',
                    captainName: offer.captainName || null,
                    city: order.city
                });
            }

            // BUG-H3 FIX: فلترة الكباتن ذوي العروض المعلّقة من updatedOrder (قبل Step 2)
            // الكباتن الذين رُفضوا في Step 2 ستظهر عروضهم لا تزال 'pending' في updatedOrder
            // لأن updatedOrder جُلب قبل Step 2 — نستخدم $ne لتجنب إشعار الفائز
            const rejectedCaptains = updatedOrder.negotiations.filter(
                (n) => String(n.captainId) !== String(captainId) && n.captainId && n.status === 'pending'
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
                    title: 'قُبل عرض كابتن آخر',
                    message: 'تم قبول عرض كابتن آخر من قبل العميل.',
                    type: 'order_update',
                    relatedId: updatedOrder._id
                });
            }

            await sendNotification(req.app, {
                userId: captainId,
                title: 'تم قبول عرضك!',
                message: `العميل وافق على السعر ${acceptedPrice} ج.س — انطلق الآن!`,
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
                io.to('admin_room').emit('negotiation_update', {
                    orderId: order._id,
                    city: order.city,
                    rejected: true
                });
            }

            await sendNotification(req.app, {
                userId: captainId,
                title: 'تم رفض عرضك',
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

        // BUG-H5 FIX: لا يمكن سحب عرض على طلب مُغلَق أو مكتمل
        if (order.status !== 'pending') {
            return res.status(400).json({ message: 'لا يمكن سحب عرض — الطلب لم يعد في حالة انتظار' });
        }

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
            // عدّاد العروض في لوحة الإدارة يجب أن ينقص فوراً كما يزيد
            io.to('admin_room').emit('negotiation_update', {
                orderId: order._id,
                city: order.city,
                withdrawn: true
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
    // BUG-L6 FIX: منع الكابتن غير المعتمد من قبول طلبات — is_blocked يُعيَّن مالياً
    // لكن كابتن approvalStatus='pending' قد لا يكون is_blocked بعد
    if (req.user.approvalStatus !== 'approved') {
        return res.status(403).json({ message: 'حسابك قيد المراجعة ولم يُعتمد بعد' });
    }

    try {
        // 🛡️ CRITICAL FIX: Atomic update to prevent Race Condition
        // BUG-H2 FIX: أضيف city لمنع الكابتن من قبول طلب من مدينة أخرى
        const updatedOrder = await Order.findOneAndUpdate(
            { _id: req.params.id, status: 'pending', city: req.user.city },
            {
                $set: {
                    status: 'accepted',
                    captain: req.user.id,
                    acceptedAt: new Date(),   // ⏱️ للخط الزمني
                    negotiation: { isActive: false, status: 'none' }
                }
            },
            { new: true } // BUG-C5 FIX: غيير من false لـ true — يُعيد المستند بعد التحديث مباشرة دون استعلام إضافي
        );

        if (!updatedOrder) {
            return res.status(400).json({ message: 'الطلب غير متاح أو تم قبوله من كابتن آخر' });
        }

        // BUG-C5 FIX: حذف الاستعلام المكرّر — updatedOrder يحتوي على النسخة الحديثة بعد new:true
        const order = updatedOrder;

        // 🚀 Clear negotiation state AND notify rejected captains
        const io = req.app.get('io');
        const rejectedCaptains = [];
        let negotiationsUpdated = false;
        
        if (order.negotiations && order.negotiations.length > 0) {
            // BL-RC1b FIX: رفض العروض المعلّقة بشكل ذري بدل تعديلها في الذاكرة ثم save().
            // forEach + save() في حضور طلبات متزامنة يمحو عروضاً وصلت أثناء القراءة.
            const pendingNegs = order.negotiations.filter(n => n.status === 'pending' && n.captainId?.toString() !== req.user.id.toString());
            pendingNegs.forEach(n => rejectedCaptains.push(n.captainId));

            await Order.updateOne(
                { _id: order._id },
                { $set: { 'negotiations.$[elem].status': 'rejected' } },
                { arrayFilters: [{ 'elem.status': 'pending', 'elem.captainId': { $ne: req.user._id } }] }
            );
        }

        // مزامنة ShopOrder دائماً بعد القبول (بغض النظر عن وجود عروض)
        if (order.shopOrderId) {
            try {
                const ShopOrder = require('../models/ShopOrder');
                await ShopOrder.findByIdAndUpdate(order.shopOrderId, {
                    status: 'captain_assigned',
                    captain: order.captain,
                    captainAssignedAt: new Date()
                });
            } catch (err) { logger.error('Error syncing ShopOrder on accept', err); }
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
                title: 'قُبل عرض كابتن آخر',
                message: 'قام كابتن آخر بقبول الطلب مباشرة.',
                type: 'order_update',
                relatedId: order._id
            });
        }

        await sendNotification(req.app, {
            userId: order.client,
            title: 'تم قبول طلبك!',
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
            title: 'جارٍ البحث عن كابتن آخر',
            message: `اعتذر الكابتن عن إكمال طلبك${reason && reason.trim() ? ` (${reason.trim()})` : ''}. نبحث لك عن كابتن جديد الآن.`,
            type: 'order_update',
            relatedId: released._id
        });

        if (io) {
            io.to(released.client.toString()).emit('order_status_updated', { orderId: released._id, status: 'pending' });
            io.to('admin_room').emit('admin_order_update', { orderId: released._id, status: 'pending', city: released.city });
        }

        // 📣 إعادة إشعار الكباتن في نفس المدينة بأن الطلب متاح من جديد
        setImmediate(async () => {
            try {
                const { sendPushToMany } = require('../utils/firebasePush');
                const User = require('../models/User');

                const activeCaptains = await User.find({
                    role: 'captain',
                    city: released.city,
                    fcmToken: { $exists: true, $ne: null },
                    isActive: true,
                    _id: { $ne: req.user.id } // لا نرسل للكابتن الذي تنازل للتو
                }).select('fcmToken');

                const tokens = activeCaptains.map(c => c.fcmToken);
                if (tokens.length > 0) {
                    let title = '📦 طلب توصيل متاح من جديد! 🚨';
                    let bodyMsg = `تم إعادة طلب للسوق بسعر ${released.price} ج.س. سارع بقبوله!`;
                    let pushType = 'new_order';
                    
                    if (released.orderType === 'shop') {
                        title = '🛒 طلب محل متاح من جديد! 🚨';
                        bodyMsg = `طلب محل بسعر ${released.price} ج.س في انتظارك!`;
                        pushType = 'shop_order';
                    } else if (released.orderType === 'errand') {
                        title = '🛍️ طلب شراء متاح من جديد! 🚨';
                        bodyMsg = `طلب شراء بسعر ${released.price} ج.س في انتظارك!`;
                        pushType = 'errand';
                    }

                    await sendPushToMany(tokens, title, bodyMsg, {
                        type: pushType,
                        orderId: released._id.toString(),
                        url: `/captain-orders.html?highlight=${released._id.toString()}`
                    });
                }
                
                // إعادة بث عبر Socket
                if (io && released.city) {
                    const cityRoom = `room_${released.city}`;
                    const eventName = released.orderType === 'shop' ? 'shop_order_available' : 'new_order_available';
                    io.to(cityRoom).emit(eventName, {
                        orderId: released._id,
                        shopName: released.shopName || '',
                        pickup: released.pickup ? released.pickup.address : '',
                        price: released.price,
                        city: released.city
                    });
                }
            } catch (err) {
                logger.error({ err }, 'Error broadcasting released order to captains');
            }
        });

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

        // BUG-C3 FIX: تحويل proofImage من Base64 لملف (URL) بدل تخزينه خاماً
        // كان ~500KB base64 يُضخّم كل مستند طلب ويُبطّئ استعلامات القوائم
        const { saveBase64ToUploads } = require('../utils/imageUpload');
        const proofImageUrl = saveBase64ToUploads(proofImage, 'proofs');
        if (!proofImageUrl) {
            return res.status(400).json({ message: 'صورة الإثبات غير صالحة — يرجى إعادة الرفع' });
        }

        // 🛒 errand: لا شراء (pickup) قبل أن يؤكّد العميل سعر البضاعة — يحمي الطرفين
        const errandPre = await Order.findOne({ _id: req.params.id, captain: req.user.id })
            .select('orderType errand status');
        if (errandPre && errandPre.orderType === 'errand') {
            const { canMarkPurchased } = require('../utils/errand');
            const chk = canMarkPurchased(errandPre);
            if (!chk.ok) return res.status(400).json({ message: chk.message });
        }

        // 🛡️ CRITICAL FIX: Atomic update for pickup state
        const updatedOrder = await Order.findOneAndUpdate(
            { _id: req.params.id, captain: req.user.id, status: 'accepted' },
            {
                $set: {
                    status: 'picked_up',
                    pickedUpAt: new Date(),   // ⏱️ للخط الزمني
                    proofOfPickupImage: proofImageUrl  // BUG-C3 FIX: URL للملف بدل Base64
                }
            },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(400).json({ message: 'الطلب غير متاح أو تم تحديث حالته مسبقاً' });
        }

        const order = updatedOrder; // for subsequent logic

        // 🛒 errand: صورة الاستلام هي إيصال/بضاعة الشراء — احفظها في errand.receiptImage
        if (order.orderType === 'errand' && order.errand) {
            order.errand.receiptImage = proofImageUrl; // BUG-C3 FIX: URL بدل Base64
            await order.save();
        }

        // 🧭 توصيل متعدد النقاط: علّم أول نقطة استلام كمُنجَزة (تحديث ذري)
        if (order.isMultiStop && Array.isArray(order.stops)) {
            // BL-RC2 FIX: استخدمنا $set مع arrayFilters بدل التعديل في الذاكرة + save()
            // لأن save() يمحو أي تعديل متزامن حصل بعد الـ findOneAndUpdate الفوق.
            await Order.updateOne(
                { _id: order._id },
                { $set: { 'stops.$[elem].done': true, 'stops.$[elem].doneAt': new Date() } },
                { arrayFilters: [{ 'elem.type': 'pickup', 'elem.done': { $ne: true } }] }
            );
        }

        // Sync ShopOrder manually since findOneAndUpdate bypasses post('save')
        if (order.shopOrderId) {
            try {
                const ShopOrder = require('../models/ShopOrder');
                await ShopOrder.findByIdAndUpdate(order.shopOrderId, { status: 'picked_up', pickedUpAt: new Date() });
            } catch (err) { logger.error('Error syncing ShopOrder pickup', err); }
        }

        await sendNotification(req.app, {
            userId: order.client,
            title: 'الكابتن استلم الطلب',
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
                proofOfPickupImage: proofImageUrl  // BUG-L1 FIX: URL المحوَّل لا Base64 الأصلي
            });
            io.to('admin_room').emit('admin_order_update', { orderId: order._id, status: 'picked_up', city: order.city });
        }

        res.json({ message: 'Order picked up', order });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});


// @route   PUT /api/orders/:id/stops/:stopRef/done
// @desc    🧭 توصيل متعدد النقاط: تأكيد إكمال نقطة وسطية (ليست أول استلام ولا آخر نقطة).
//          أول استلام يمرّ عبر /pickup (بالإثبات)، والنقطة الأخيرة عبر /deliver (بالعمولة).
//          stopRef يقبل معرّف المحطة (_id) — الأمتن — أو فهرسها (للتوافق مع النسخ القديمة).
router.put('/:id/stops/:stopRef/done', protect, captainOnly, async (req, res) => {
    try {
        const ref = String(req.params.stopRef);
        const order = await Order.findOne({ _id: req.params.id, captain: req.user.id });
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
        if (!order.isMultiStop || !Array.isArray(order.stops)) {
            return res.status(400).json({ message: 'هذا الطلب ليس متعدد النقاط' });
        }
        if (order.status !== 'picked_up') {
            return res.status(400).json({ message: 'أكّد استلام أول نقطة أولاً' });
        }

        // 🔒 عنونة بالـ _id (24-hex) لتفادي إصابة نقطة خاطئة لو تغيّر الترتيب؛
        //    وإلا فالفهرس (نسخ قديمة). كلاهما يشير لنفس المحطات.
        let stop = null;
        if (/^[0-9a-fA-F]{24}$/.test(ref)) {
            stop = order.stops.id(ref);
        } else {
            const idx = parseInt(ref, 10);
            if (!isNaN(idx) && idx >= 0 && idx < order.stops.length) stop = order.stops[idx];
        }
        if (!stop) {
            return res.status(400).json({ message: 'رقم النقطة غير صالح' });
        }
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
            title: 'تقدّم في التوصيل',
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
            .select('isMultiStop stops status dropoff city');
        if (multiCheck && multiCheck.isMultiStop && Array.isArray(multiCheck.stops)) {
            const undone = multiCheck.stops.filter(s => !s.done).length;
            if (undone > 1) {
                return res.status(400).json({ message: `أكمل باقي النقاط أولاً — تبقّى ${undone} نقطة قبل التسليم النهائي` });
            }
        }

        // 📍 إثبات التسليم — يُقيَّم قبل أي تغيير حالة، وإلا خُصمت العمولة ثم مُنع.
        //    المصدر هو الموقع المحفوظ خادمياً (سوكت كل ثلاث ثوانٍ + update-location)
        //    عمداً لا إحداثيات من جسم الطلب: قبولها يجعل الالتفاف تعديل سطر واحد
        //    بدل الحاجة إلى تطبيق تزييف موقع، بلا أي مكسب — الموقع طازج أصلاً.
        let deliveryProof = null;
        if (multiCheck) {
            const proofSettings = await getCachedSettings(multiCheck.city || 'Khartoum');
            const mode = proofSettings?.deliveryProofMode || 'observe';

            if (mode !== 'off') {
                const evaluated = evaluateDeliveryProof({
                    captainLocation: req.user.currentLocation,
                    dropoff: multiCheck.dropoff,
                    mode,
                    radiusMeters: proofSettings?.deliveryProofRadiusMeters ?? 500,
                    maxLocationAgeSec: (proofSettings?.deliveryProofMaxLocationAgeMin ?? 10) * 60
                });

                deliveryProof = {
                    verified: evaluated.verified,
                    reason: evaluated.reason,
                    distanceM: evaluated.distanceM,
                    locationAgeSec: evaluated.locationAgeSec,
                    lat: evaluated.lat,
                    lng: evaluated.lng,
                    at: new Date()
                };

                if (evaluated.blocked) {
                    logger.warn({
                        orderId: String(req.params.id), captainId: String(req.user.id),
                        reason: evaluated.reason, distanceM: evaluated.distanceM
                    }, 'Delivery blocked by proof check');
                    return res.status(409).json({
                        message: evaluated.message,
                        code: `delivery_proof_${evaluated.reason}`,
                        distanceM: evaluated.distanceM
                    });
                }

                if (!evaluated.verified) {
                    // وضع المراقبة: يمرّ لكن يُسجَّل — هذه السجلات هي ما يُبنى
                    // عليه قرار رفع الوضع إلى 'enforce'.
                    logger.warn({
                        orderId: String(req.params.id), captainId: String(req.user.id),
                        reason: evaluated.reason, distanceM: evaluated.distanceM, mode
                    }, 'Delivery proof not verified (observe mode — allowed)');
                }
            }
        }

        // 🛡️ CRITICAL FIX: Idempotent & Atomic Delivery State Update
        let order = await Order.findOneAndUpdate(
            { _id: req.params.id, captain: req.user.id, status: 'picked_up' },
            { $set: { status: 'delivered', deliveredAt: new Date(),
                      ...(deliveryProof ? { deliveryProof } : {}) } },
            { new: true }
        );

        if (!order) {
            // 🔄 Idempotency / Retry Guard: If order is ALREADY delivered by this captain, return success instead of error!
            const existing = await Order.findOne({ _id: req.params.id, captain: req.user.id }).lean();
            if (existing && existing.status === 'delivered') {
                return res.json({ message: 'Order delivered', order: existing });
            }
            return res.status(400).json({ message: 'الطلب غير متاح للتوصيل أو تم توصيله مسبقاً.' });
        }

        // 🏁 عدّاد رحلات الكابتن — يزداد مرة واحدة فقط
        User.updateOne({ _id: req.user.id }, { $inc: { completedTrips: 1 } })
            .catch(e => logger.warn({ err: e.message }, 'completedTrips increment failed'));

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

                if (shopOrder && shopOrder.place) {
                    const goodsAmount = shopOrder.promoAppliesTo === 'products'
                        ? Math.max(0, shopOrder.itemsTotal - (shopOrder.discountAmount || 0))
                        : shopOrder.itemsTotal;
                    if (goodsAmount > 0) {
                        const { recordLedgerEntry } = require('../utils/erpHelpers');
                        // BL-M1 FIX: العميل دفع قيمة البضاعة بنكياً مباشرة للتاجر (paymentReceiptImage).
                        // تسجيل 'sale_income' كان يضيف goodsAmount لمحفظة التاجر داخل التطبيق أيضاً
                        // → التاجر يقبض مرتين (بنك + تطبيق). نُسجّل 'sale_record' للإحصاء فقط
                        // بدون تعديل shopWalletBalance.
                        const ledgerResult = await recordLedgerEntry({
                            placeId: shopOrder.place,
                            type: 'sale_record',   // ← إحصاء فقط، لا تعديل للرصيد
                            amount: goodsAmount,
                            refModel: 'ShopOrder',
                            refId: shopOrder._id,
                            note: 'تسجيل مبيعات — المبلغ مدفوع بنكياً خارج التطبيق'
                        });
                        if (ledgerResult.ok) {
                            try {
                                const Place = require('../models/Place');
                                const placeDoc = await Place.findById(shopOrder.place).select('ownerId').lean();
                                if (placeDoc && placeDoc.ownerId) {
                                    const { sendNotification } = require('../utils/notificationHelper');
                                    await sendNotification(req.app, {
                                        userId: placeDoc.ownerId,
                                        title: 'تم توصيل الطلب بنجاح',
                                        message: `تم توصيل الطلب بنجاح. قيمة البضاعة ${goodsAmount} ج.س تم دفعها عبر التحويل البنكي.`,
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
        let creditLimit = -5000;
        try {
            const liveSettings = await getCachedSettings(order.city || 'Khartoum');
            if (liveSettings?.defaultCreditLimit) creditLimit = liveSettings.defaultCreditLimit;
        } catch (settingsErr) {
            logger.warn('Could not load settings for credit limit, using default');
        }

        // BL-M2 FIX: العمولة تُحسب على المبلغ الفعلي الذي استلمه الكابتن من العميل.
        // قبل الإصلاح: commissionAmount = appFee أو price * 15% (بغض النظر عن الكوبون)
        // سيناريو المشكلة: أجرة 1000 + كوبون 300 → الكابتن يستلم 700 نقداً لكن عمولته 150.
        // المنصة تحمّل الكابتن الـ 45 فرق الكوبون من ماله الخاص!
        // الإصلاح: إذا كان appFee محفوظاً نستخدمه مباشرة (هو بالفعل على السعر الصحيح عند الإنشاء).
        // وإذا احتجنا نحسبه: نطرح discountAmount أولاً.
        const discount = Number(order.discountAmount) || 0;
        const effectivePrice = Math.max(0, (Number(order.price) || 0) - discount);
        const rawCommission = (order.appFee != null)
            ? Number(order.appFee)
            : (effectivePrice * 0.15);
        const commissionAmount = Math.max(0, parseFloat((isNaN(rawCommission) ? 0 : rawCommission).toFixed(2)));

        logger.info({ orderId: order._id, storedAppFee: order.appFee, commissionAmount }, 'Commission deduction on deliver');

        // 🛡️ Atomic Wallet Deduction ($inc)
        if (commissionAmount > 0 && order.captain) {
            try {
                const User = require('../models/User');
                // new:true يعيد صورة ما بعد الخصم مباشرة — لا حاجة لقراءة ثانية
                const captain = await User.findByIdAndUpdate(
                    order.captain,
                    { $inc: { wallet_balance: -commissionAmount } },
                    { new: true }
                );

                if (captain) {
                    const orderPrice = order.price || 0;
                    const commissionRate = orderPrice > 0 ? commissionAmount / orderPrice : 0;
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

                    // 🛡️ الحجب بتحديث ذرّي مشروط بدل captain.save():
                    // save() يكتب المستند كاملاً فيمحو أي عمولة أو دفعة سُجّلت بين
                    // القراءة والحفظ. وشرط is_blocked:false يضمن أن الإشعار
                    // والـ socket يُرسلان مرة واحدة فقط مهما تزامنت التوصيلات.
                    let justBlocked = false;
                    if (captain.wallet_balance <= creditLimit) {
                        const blockRes = await User.updateOne(
                            { _id: captain._id, is_blocked: false },
                            { $set: { is_blocked: true } }
                        ).catch(e => { logger.error({ err: e }, 'Captain block update failed'); return null; });
                        justBlocked = !!(blockRes && blockRes.modifiedCount > 0);
                    }

                    if (justBlocked) {
                        logger.info({ captainId: captain._id, walletBalance: captain.wallet_balance, creditLimit }, 'Captain BLOCKED — exceeded credit limit');

                        try {
                            const { sendNotification } = require('../utils/notificationHelper');
                            await sendNotification(req.app, {
                                userId: captain._id,
                                title: 'تم إيقاف حسابك',
                                message: 'تجاوزت الحد الائتماني. يرجى سداد المديونية لإعادة تفعيل الحساب.',
                                type: 'wallet_update',
                                relatedId: order._id
                            });
                        } catch (notifErr) { logger.error({ err: notifErr }, 'Block notification failed'); }

                        // 🔔 الإدارة أيضاً: كابتن محجوب يتوقف عن استقبال الطلبات، وهو
                        // نقصٌ في الأسطول تحتاج الإدارة معرفته فوراً لا اكتشافه من شكوى.
                        try {
                            const { notifyAdmins } = require('../utils/notificationHelper');
                            await notifyAdmins(req.app, {
                                title: 'كابتن حُجب لتجاوز الحد الائتماني',
                                message: `${captain.name || 'كابتن'} — الرصيد ${Math.round(captain.wallet_balance)} والحد ${creditLimit}`,
                                type: 'captain_blocked',
                                relatedId: captain._id
                            });
                        } catch (e) { logger.error({ err: e }, 'Admin block alert failed (non-critical)'); }

                        const ioForBlock = req.app.get('io');
                        if (ioForBlock) {
                            ioForBlock.to(captain._id.toString()).emit('wallet_limit_reached', {
                                wallet_balance: captain.wallet_balance,
                                credit_limit:   creditLimit,
                                message: 'تجاوزت الحد الائتماني — تم إيقاف حسابك.'
                            });
                        }
                    }
                }
            } catch (commErr) {
                logger.error({ err: commErr, orderId: order._id }, 'Commission deduction failed on deliver');
            }
        }

        // 🔔 Push notification & WhatsApp to Client (Safely guarded against null client)
        if (order.client) {
            try {
                const { sendNotification } = require('../utils/notificationHelper');
                await sendNotification(req.app, {
                    userId: order.client,
                    title: 'تم التوصيل بنجاح',
                    message: `تم توصيل طلبك بنجاح. شكراً لاستخدامك وجيز! لا تنسى تقييم الكابتن.`,
                    type: 'order_completed',
                    relatedId: order._id
                });
            } catch (nErr) { logger.error('Client notification error on deliver:', nErr.message); }

            // 💬 أول توصيلة مكتملة لهذا العميل ⇒ اسأله عن التجربة.
            // اللحظة مقصودة: الانطباع طازج، والعميل الذي لم يعد بعد أول طلب
            // هو بالضبط من نريد أن نعرف لماذا لم يعد. يُرسل مرة واحدة فقط —
            // countDocuments == 1 يعني أن هذا الطلب هو الأول (حُدِّث للتوّ).
            try {
                // BUG-L9 FIX: عدّ كل الطلبات المكتملة (عادية + متجر) لتجنّب إشعار مُضلَّل
                // لعميل أكمل 5 طلبات متجر ثم أول توصيل عادي
                const ShopOrder = require('../models/ShopOrder');
                const [deliveredCount, shopDeliveredCount] = await Promise.all([
                    Order.countDocuments({ client: order.client, status: 'delivered' }),
                    ShopOrder.countDocuments({ client: order.client, status: 'delivered' })
                ]);
                const totalDelivered = deliveredCount + shopDeliveredCount;
                if (totalDelivered === 1) {
                    const Feedback = require('../models/Feedback');
                    const already = await Feedback.exists({ user: order.client, kind: 'first_order' });
                    if (!already) {
                        const { sendNotification } = require('../utils/notificationHelper');
                        await sendNotification(req.app, {
                            userId: order.client,
                            title: 'كيف كانت تجربتك الأولى؟',
                            message: 'رأيك يهمّنا — ما الذي أعجبك وما الذي تقترح تحسينه؟ دقيقة واحدة تكفي.',
                            type: 'feedback_request',
                            relatedId: order._id
                        });
                    }
                }
            } catch (fbErr) {
                logger.warn({ err: fbErr?.message, orderId: order._id }, 'First-order feedback prompt failed');
            }

            try {
                await sendWhatsAppIfSubscribed(
                    order.client,
                    OrderMessages.orderDelivered(order._id.toString())
                );
            } catch (wErr) { logger.error('Client WhatsApp error on deliver:', wErr.message); }

            const io = req.app.get('io');
            if (io) {
                const clientStr = order.client.toString();
                io.to(clientStr).emit('order_status_updated', {
                    orderId: order._id,
                    status: 'delivered'
                });
                const rateOrderId = order.shopOrderId || order._id;
                io.to(clientStr).emit('delivery_attempted', {
                    orderId: rateOrderId,
                    placeId: order.place || null
                });
            }
        }

        const ioAdmin = req.app.get('io');
        if (ioAdmin) {
            ioAdmin.to('admin_room').emit('admin_order_update', {
                orderId: order._id,
                status: 'delivered',
                captainName: req.user.name,
                price: order.price,
                city: order.city
            });
        }

        // 📊 Referrals tracking
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
        logger.error({ err: error, orderId: req.params.id }, 'Deliver order endpoint unexpected failure');
        res.status(500).json({ message: 'Server error' });
    }
});


// ═══════════════════════════════════════════════════════════════════
// 🛒 خدمة "اشترِ لي" (errand) — عرض سعر البضاعة وتأكيده قبل الشراء
// ═══════════════════════════════════════════════════════════════════

// @route   POST /api/orders/:id/errand/quote  (الكابتن يُدخل سعر البضاعة عند المحل)
router.post('/:id/errand/quote', protect, captainOnly, async (req, res) => {
    try {
        const { canSubmitQuote, validateQuoteAmount, evaluateQuote } = require('../utils/errand');
        const amountChk = validateQuoteAmount(req.body.amount);
        if (!amountChk.valid) return res.status(400).json({ message: amountChk.message });

        const order = await Order.findOne({ _id: req.params.id, captain: req.user.id });
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        const chk = canSubmitQuote(order);
        if (!chk.ok) return res.status(400).json({ message: chk.message });

        const amount = amountChk.amount;
        const shop = order.shopName || 'المحل';
        const io = req.app.get('io');
        const verdict = evaluateQuote({
            budget: order.errand.budget,
            autoApprove: order.errand.autoApprove,
            amount
        });

        order.errand.goodsQuote = amount;
        order.errand.quotedAt = new Date();
        order.errand.reminderSentAt = null;   // عرضٌ جديد ⇒ مهلة جديدة

        // ✅ ضمن ميزانية أذِن العميل بها مسبقاً: لا جولة سؤال — يشتري الكابتن فوراً
        if (verdict.autoConfirm) {
            order.errand.quoteStatus = 'confirmed';
            order.errand.finalGoodsCost = amount;
            order.errand.respondedAt = new Date();
            await order.save();

            await sendNotification(req.app, {
                userId: order.client,
                title: 'تم تأكيد السعر تلقائياً',
                message: `سعر البضاعة من ${shop}: ${amount} ج.س — ضمن ميزانيتك (${order.errand.budget} ج.س)، فبدأ الكابتن الشراء.`,
                type: 'errand_quote',
                relatedId: order._id
            });
            if (io) io.to(order.client.toString()).emit('errand_quote_confirmed', {
                orderId: order._id, amount, shopName: shop, auto: true
            });

            return res.json({ message: 'ضمن ميزانية العميل — أُكّد تلقائياً، ابدأ الشراء', autoConfirmed: true, order });
        }

        order.errand.quoteStatus = 'quoted';
        await order.save();

        // إشعار العميل ليؤكّد/يرفض السعر. تجاوز الميزانية يُقال صراحةً: العميل
        // يقارن رقمين لا رقماً واحداً، وإخفاؤه يجعل الرفض مفاجأةً للكابتن.
        await sendNotification(req.app, {
            userId: order.client,
            title: verdict.overBudget ? 'السعر أعلى من ميزانيتك' : 'سعر طلبك جاهز',
            message: verdict.overBudget
                ? `سعر البضاعة من ${shop}: ${amount} ج.س — أعلى بـ ${verdict.overBy} ج.س من ميزانيتك (${order.errand.budget} ج.س). أكّد أو ارفض.`
                : `سعر البضاعة من ${shop}: ${amount} ج.س. أكّد لبدء الشراء.`,
            type: 'errand_quote',
            relatedId: order._id
        });
        if (io) io.to(order.client.toString()).emit('errand_quote', {
            orderId: order._id, amount, shopName: shop,
            budget: order.errand.budget || null,
            overBudget: verdict.overBudget, overBy: verdict.overBy
        });

        res.json({
            message: verdict.overBudget
                ? `أُرسل السعر — تنبيه: أعلى بـ ${verdict.overBy} ج.س من ميزانية العميل`
                : 'تم إرسال السعر للعميل',
            overBudget: verdict.overBudget, overBy: verdict.overBy,
            order
        });
    } catch (error) {
        logger.error({ err: error.message }, 'errand quote error');
        res.status(500).json({ message: 'Server error' });
    }
});

// @route   PUT /api/orders/:id/errand/respond  (العميل يوافق/يرفض السعر)  body: { accept }
router.put('/:id/errand/respond', protect, async (req, res) => {
    try {
        const { canRespondQuote } = require('../utils/errand');
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
        if (String(order.client) !== req.user.id) {
            return res.status(403).json({ message: 'غير مصرح' });
        }
        const chk = canRespondQuote(order);
        if (!chk.ok) return res.status(400).json({ message: chk.message });

        const accept = req.body.accept === true || req.body.accept === 'true';
        order.errand.respondedAt = new Date();
        const io = req.app.get('io');

        if (accept) {
            order.errand.quoteStatus = 'confirmed';
            order.errand.finalGoodsCost = order.errand.goodsQuote;
            await order.save();

            if (order.captain) {
                await sendNotification(req.app, {
                    userId: order.captain,
                    title: 'وافق العميل على السعر',
                    message: `وافق العميل على ${order.errand.goodsQuote} ج.س. يمكنك الشراء الآن.`,
                    type: 'order_update',
                    relatedId: order._id
                });
                if (io) io.to(order.captain.toString()).emit('errand_quote_confirmed', { orderId: order._id });
            }
            return res.json({ message: 'تم تأكيد السعر — سيبدأ الكابتن بالشراء', order });
        }

        // رفض: يُلغى الطلب. تُسجَّل رسوم انتقال للكابتن (تعويض وقته) إن حُدّدت.
        // 🚕 التسوية المالية الفعلية للرسوم تأتي مع نظام المحفظة لاحقاً — هنا تسجيل وإشعار.
        let tripFee = 0;
        try {
            const s = await getCachedSettings(order.city || 'Khartoum');
            tripFee = Number(s.errandTripFee) > 0 ? Number(s.errandTripFee) : 0;
        } catch (_) {}

        order.errand.quoteStatus = 'declined';
        order.errand.tripFee = tripFee;
        order.status = 'cancelled';
        order.cancelledBy = 'client';
        order.cancelReason = 'رفض العميل سعر البضاعة';
        order.cancelledAt = new Date();
        await order.save();

        // BUG-L12 FIX: مزامنة ShopOrder المرتبط إذا وُجد (حالة نادرة لكن ممكنة)
        if (order.shopOrderId) {
            try {
                const ShopOrder = require('../models/ShopOrder');
                await ShopOrder.findByIdAndUpdate(order.shopOrderId, {
                    status: 'cancelled',
                    cancelledBy: 'client',
                    cancelReason: 'رفض العميل سعر البضاعة (errand)'
                });
            } catch (shopSyncErr) {
                logger.warn({ err: shopSyncErr, orderId: order._id }, 'errand decline: ShopOrder sync failed');
            }
        }

        if (order.captain) {
            await sendNotification(req.app, {
                userId: order.captain,
                title: 'رفض العميل السعر',
                message: tripFee > 0
                    ? `رفض العميل سعر البضاعة وأُلغي الطلب. ستُحتسب لك رسوم انتقال ${tripFee} ج.س.`
                    : 'رفض العميل سعر البضاعة وأُلغي الطلب.',
                type: 'order_cancelled',
                relatedId: order._id
            });
            if (io) io.to(order.captain.toString()).emit('order_status_updated', { orderId: order._id, status: 'cancelled' });
        }
        if (io) io.to('admin_room').emit('admin_order_update', { orderId: order._id, status: 'cancelled', city: order.city });

        res.json({ message: 'تم رفض السعر وإلغاء الطلب', order });
    } catch (error) {
        logger.error({ err: error.message }, 'errand respond error');
        res.status(500).json({ message: 'Server error' });
    }
});


// @route   POST /api/orders/:id/complain
// ============================================================
// @route   PUT /api/orders/:id/tip
// @desc    العميل يحدّد إكرامية الكابتن (تُدفع نقداً مع الأجرة عند التسليم)
//
// 🔑 قرارات التصميم:
//  • قبل التسليم فقط — الدفع نقديٌّ، وما بعد مفارقة الباب لا يُحصَّل.
//  • مبلغٌ مطلق لا تراكمي: الطلب يحمل إكراميةً واحدة، وإرسال 500 مرّتين
//    يعني 500 لا 1000. التراكم يجعل كل إعادةِ إرسالٍ من الشبكة هديّةً
//    مضاعفة لا يقصدها أحد.
//  • صفر مسموح — تراجعُ العميل عن الإكرامية قبل التسليم حقّه.
//  • لا تمسّ appFee ولا العمولة: تصل الكابتن كاملة (انظر models/Order.js).
// ============================================================
router.put('/:id/tip', protect, tipLimiter, async (req, res) => {
    try {
        const raw = Number(req.body.amount);
        if (!Number.isFinite(raw) || raw < 0) {
            return res.status(400).json({ message: 'مبلغ الإكرامية غير صالح' });
        }
        // 🔢 أعدادٌ صحيحة: لا كسور في العملة المتداولة نقداً
        const amount = Math.round(raw);

        const order = await Order.findOne({ _id: req.params.id, client: req.user._id });
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        const OPEN_STATES = ['pending', 'scheduled', 'accepted', 'picked_up'];
        if (!OPEN_STATES.includes(order.status)) {
            return res.status(400).json({
                message: order.status === 'delivered'
                    ? 'لا يمكن إضافة إكرامية بعد التسليم — الدفع نقدي ويُسلَّم مع الأجرة'
                    : 'لا يمكن تعديل الإكرامية على طلب مُلغى'
            });
        }

        const settings = await getCachedSettings(order.city || 'Khartoum');
        const maxTip = Number(settings?.maxTipAmount ?? 20000);
        if (maxTip <= 0) {
            return res.status(400).json({ message: 'خدمة الإكرامية غير مفعّلة حالياً' });
        }
        if (amount > maxTip) {
            return res.status(400).json({ message: `أقصى إكرامية مسموحة ${maxTip.toLocaleString('en-US')} ج.س` });
        }

        const previous = Number(order.tip?.amount) || 0;
        if (previous === amount) {
            return res.json({ message: 'لا تغيير', tip: amount, total: totalDueFromClient(order) });
        }

        order.tip = { amount, addedAt: amount > 0 ? new Date() : null };
        // 💰 `netRevenue` هو ما يخرج به الكابتن من الطلب، وكل شاشات أرباحه
        //    (اليوم، السجل، التحليلات) تجمعه وحده. لو تُركت الإكرامية خارجه
        //    لوصلت الكابتن نقداً ولم تظهر في أي رقمٍ يراه — فيبدو أنها ضاعت.
        order.netRevenue = Math.max(0, (Number(order.price) || 0) - (Number(order.appFee) || 0)) + amount;
        await order.save();

        const io = req.app.get('io');

        // 📣 الكابتن يرى المبلغ الجديد فوراً: الإكرامية حافزٌ إن وصلت وقتها،
        //    ومفاجأةٌ بلا أثر إن وصلت بعد أن سلّم.
        if (order.captain) {
            if (io) {
                io.to(order.captain.toString()).emit('order_tip_updated', {
                    orderId: order._id, tip: amount, total: totalDueFromClient(order)
                });
            }
            if (amount > previous) {
                sendNotification(req.app, {
                    userId: order.captain,
                    title: '💚 إكرامية من العميل',
                    message: `أضاف العميل إكرامية ${amount.toLocaleString('en-US')} ج.س لهذا الطلب — تُستلم كاملة بلا عمولة.`,
                    type: 'order_tip',
                    relatedId: order._id
                }).catch(e => logger.warn({ err: e.message }, 'tip notification failed'));
            }
        } else if (io) {
            // 🔎 طلبٌ ما زال معروضاً: تحديث البطاقة في قوائم الكباتن يجعل
            //    الإكرامية حافزَ قبولٍ فعلياً لا رقماً يُكتشف بعد الارتباط.
            io.to(`room_${order.city || 'Khartoum'}`).emit('order_tip_updated', {
                orderId: order._id, tip: amount, total: totalDueFromClient(order)
            });
        }

        if (io) io.to('admin_room').emit('admin_order_update', { orderId: order._id, tip: amount, city: order.city });

        res.json({
            message: amount > 0 ? 'تمت إضافة الإكرامية' : 'تم إلغاء الإكرامية',
            tip: amount,
            total: totalDueFromClient(order)
        });
    } catch (error) {
        logger.error({ err: error }, 'Set tip error');
        res.status(500).json({ message: 'Server error' });
    }
});

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
            title: 'شكوى جديدة',
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

        // 🏷️ وسوم + تعليق. الوسوم تُنقّى مركزياً (utils/ratingTags) فلا يدخل
        //    رمزٌ مجهول إلى الإحصاء، والتعليق يُقصّ عند حدّ مخطّط Rating.
        const { sanitizeTags } = require('../utils/ratingTags');
        const tags = sanitizeTags(req.body.tags);
        const comment = typeof req.body.comment === 'string'
            ? req.body.comment.trim().slice(0, 500)
            : '';

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
        order.rating = { score: rating, comment, tags };
        order.isRated = true;
        await order.save();

        // 📋 سجلّ التقييم المستقل — قبل هذا كان تقييم الكابتن يعيش في مستند
        //    الطلب وحده: لا يظهر في لوحة تقييمات الإدارة (targetType: 'captain'
        //    لم يُنشأ قطّ)، ولا يمكن إخفاؤه إن كان مسيئاً، ولا تُجمَّع وسومه.
        //    تقييمات المتاجر والمنتجات كانت تُسجَّل هكذا أصلاً — الكابتن وحده
        //    كان خارج السجل. لا نُفشل الطلب إن فشل الحفظ: النجوم وصلت الكابتن
        //    بالفعل، وفهرسٌ فريدٌ يمنع تكراراً هو نجاحٌ لا خطأ.
        try {
            await Rating.create({
                client: req.user._id,
                targetType: 'captain',
                targetId: captainId,
                captain: captainId,
                order: order._id,
                orderModel: order.constructor?.modelName === 'ShopOrder' ? 'ShopOrder' : 'Order',
                score: rating,
                comment,
                tags
            });
        } catch (ratingDocErr) {
            if (ratingDocErr.code !== 11000) {
                logger.warn({ err: ratingDocErr.message, orderId }, 'Captain Rating doc create failed');
            }
        }

        // ✅ Send notification to captain with rating
        // 🏷️ الوسوم في نصّ الإشعار: "٣ من ٥" لا يقول للكابتن ما الذي يُصلحه،
        //    و"تأخّر كثيراً" يقوله في كلمتين.
        const { TAG_LABELS } = require('../utils/ratingTags');
        const tagText = tags.length ? ` — ${tags.map(t => TAG_LABELS[t]).filter(Boolean).join('، ')}` : '';
        await sendNotification(req.app, {
            userId: captainId,
            title: rating >= 4 ? '⭐ تقييم ممتاز!' : rating >= 3 ? '⭐ تقييم جيد' : '⚠️ تقييم منخفض',
            message: `حصلت على تقييم ${rating}/5 من العميل ${req.user.name || 'أحد العملاء'}${tagText}`,
            type: 'system',
            relatedId: order._id
        });

        res.json({ message: 'تم التقييم بنجاح', newAverage: captain.averageRating });

    } catch (error) {
        logger.error({ err: error }, 'Rate order error');
        res.status(500).json({ message: 'Server error' });
    }
});

// ============================================================
// @route   GET /api/orders/rating-tags
// @desc    قائمة وسوم التقييم المعروضة للعميل — مصدرها utils/ratingTags
//
// لماذا من الخادم لا ثابتةً في الواجهة: نسخ التطبيق المثبّتة على الأجهزة
// تتأخّر أشهراً. لو كانت القائمة في الحزمة لبقيت وسومٌ ألغيناها تُرسَل من
// أجهزةٍ قديمة، ولما ظهر وسمٌ جديد إلا بعد تحديث المتجر.
// ⚠️ يجب أن يبقى فوق GET /:id وإلا التقطه كمعرّف.
// ============================================================
router.get('/rating-tags', (req, res) => {
    const { POSITIVE_TAGS, NEGATIVE_TAGS, MAX_TAGS_PER_RATING } = require('../utils/ratingTags');
    // 🗓️ ثابتة فعلياً — التخزين يوماً يوفّر طلباً في كل فتحِ نافذة تقييم
    res.set('Cache-Control', 'public, max-age=86400');
    res.json({ positive: POSITIVE_TAGS, negative: NEGATIVE_TAGS, maxTags: MAX_TAGS_PER_RATING });
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
            extraStopFee: settings.extraStopFee ?? 0,   // 🧭 رسم النقطة الإضافية للتوصيل متعدد النقاط
            maxDiscountPercent: settings.maxDiscountPercent ?? 10, // 📉 أقصى نسبة تخفيض مسموحة للعميل
            maxPriceSurgePercent: settings.maxPriceSurgePercent ?? 100, // 📈 أقصى نسبة زيادة / سقف السعر
            maxTipAmount: settings.maxTipAmount ?? 20000 // 💚 سقف إكرامية الكابتن (0 = معطّلة)
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

        let order = await Order.findById(req.params.id)
            .populate('client', 'name phone')
            .populate('captain', 'name phone vehicleType currentLocation documents.profilePhoto averageRating ratingCount completedTrips')
            .lean();

        // 🏪 Fallback: If req.params.id is a ShopOrder ID instead of a delivery Order ID
        // يصبح true عندما لا يوجد طلب توصيل مقابل ونبني كائناً اصطناعياً من ShopOrder
        let isSyntheticShopOrder = false;
        if (!order) {
            const ShopOrder = require('../models/ShopOrder');
            const shopOrder = await ShopOrder.findById(req.params.id)
                .populate('client', 'name phone')
                .populate('captain', 'name phone vehicleType currentLocation documents.profilePhoto averageRating ratingCount completedTrips')
                .lean();

            if (shopOrder) {
                // Try finding associated delivery Order
                order = await Order.findOne({ shopOrderId: shopOrder._id })
                    .populate('client', 'name phone')
                    .populate('captain', 'name phone vehicleType currentLocation documents.profilePhoto averageRating ratingCount completedTrips')
                    .lean();

                if (!order) {
                    order = {
                        _id: shopOrder._id,
                        status: (shopOrder.status === 'pending' || shopOrder.status === 'confirmed') ? 'pending' : shopOrder.status,
                        client: shopOrder.client,
                        captain: shopOrder.captain,
                        price: shopOrder.deliveryFee || 0,
                        pickup: shopOrder.pickupLocation,
                        dropoff: shopOrder.deliveryLocation,
                        shopId: shopOrder.place,
                        place: shopOrder.place,
                        createdAt: shopOrder.createdAt
                    };
                    isSyntheticShopOrder = true;
                }
            }
        }

        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        // Access control:
        const userId = req.user.id;
        const isClient = order.client && (String(order.client._id || order.client) === userId);
        const isCaptain = order.captain && (String(order.captain._id || order.captain) === userId);
        const isAdmin = req.user.role === 'admin';
        // ⚠️ الاستثناء أدناه غرضه أن يعاين الكابتن طلب توصيل مطروحاً قبل قبوله.
        // طلب المتجر الذي لم يُنشأ له طلب توصيل بعد ليس مطروحاً لأحد، وحالته
        // الاصطناعية 'pending' بلا كابتن كانت تُفعّل الاستثناء وتكشف اسم العميل
        // ورقم هاتفه لأي كابتن في النظام.
        // 🌍 ونطاق المدينة: قائمة الطلبات المعروضة (GET /) محميّة بـ requireCity
        //    فيرى الكابتن طلبات مدينته وحدها، لكن هذا المسار كان بلا نطاق —
        //    فأي كابتن في أي مدينة يقرأ اسم العميل وهاتفه وعنوانه لأي طلب معلّق
        //    بمجرد معرفة معرّفه. الشرط هنا يُطابق ما تفرضه القائمة.
        const isPendingAndUserIsCaptain = (
            !isSyntheticShopOrder &&
            order.status === 'pending' &&
            !order.captain &&
            req.user.role === 'captain' &&
            !req.user.is_blocked &&
            !!order.city && String(order.city) === String(req.user.city)
        );

        // 🏪 تاجر المتجر صاحب الطلب يمكنه تتبع توصيل طلبات متجره
        let isShopOwner = false;
        if (!isClient && !isCaptain && !isAdmin && !isPendingAndUserIsCaptain && req.user.role === 'merchant') {
            const placeId = order.shopId || order.place;
            if (placeId) {
                const Place = require('../models/Place');
                const place = await Place.findById(placeId).select('ownerId').lean();
                isShopOwner = !!(place && place.ownerId && String(place.ownerId) === userId);
            }
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