const express = require('express');
const router = express.Router();
const { protect, merchantOnly, adminOnly } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Place = require('../models/Place');
const Product = require('../models/Product');
const ShopOrder = require('../models/ShopOrder');
const PromoCode = require('../models/PromoCode');
const { sendNotification, notifyAdmins } = require('../utils/notificationHelper');
const logger = require('../utils/logger');

// 📡 بث تحديث طلب المتجر للوحة الأدمن الحية — كانت الإدارة عمياء تماماً عن
// مرحلة المتجر (جديد/تجهيز/دفع)؛ هذا الحدث يغذي صفحة admin-shop-orders لحظياً.
function emitShopOrderAdminUpdate(app, order, place, clientName) {
    try {
        const io = app.get('io');
        if (!io || !order) return;
        io.to('admin_room').emit('shop_order_admin_update', {
            orderId: String(order._id),
            status: order.status,
            paymentStatus: order.paymentStatus,
            shopName: place ? place.name : '',
            city: place ? place.city : '',
            clientName: clientName || '',
            itemsTotal: order.itemsTotal,
            totalAmount: order.totalAmount,
            updatedAt: new Date()
        });
    } catch (e) { logger.error('emitShopOrderAdminUpdate error:', e.message); }
}

// ──────────────────────────────────────────────
// 📦 PRODUCTS (Merchant manages their own products)
// ──────────────────────────────────────────────

// GET /api/merchant/products — list own products
router.get('/products', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'لا يوجد متجر مرتبط بحسابك' });
        const products = await Product.find({ placeId: place._id }).sort({ category: 1, sortOrder: 1 });
        res.json({ place, products });
    } catch (err) {
        logger.error('merchant/products GET error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /api/merchant/products — add product
router.post('/products', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'لا يوجد متجر مرتبط بحسابك' });
        const { name, description, price, image, category, sortOrder, stock, cost, lowStockThreshold, sku } = req.body;
        if (!name || price === undefined) return res.status(400).json({ message: 'الاسم والسعر مطلوبان' });

        // 🛡️ CRITICAL FIX: Validate price is not negative
        const numericPrice = Number(price);
        if (isNaN(numericPrice) || numericPrice < 0) {
            return res.status(400).json({ message: 'السعر يجب أن يكون رقماً موجباً أو صفراً' });
        }

        // 💼 ERP: سعر التكلفة (اختياري)
        const numericCost = (cost !== undefined && cost !== null && cost !== '') ? Number(cost) : 0;
        if (isNaN(numericCost) || numericCost < 0) {
            return res.status(400).json({ message: 'سعر التكلفة يجب أن يكون رقماً موجباً أو صفراً' });
        }

        // 💼 ERP: حد تنبيه المخزون المنخفض (اختياري)
        const thresholdValue = (lowStockThreshold !== undefined && lowStockThreshold !== null && lowStockThreshold !== '') ? parseInt(lowStockThreshold) : null;
        if (thresholdValue !== null && (isNaN(thresholdValue) || thresholdValue < 0)) {
            return res.status(400).json({ message: 'حد التنبيه يجب أن يكون رقماً موجباً أو فارغاً' });
        }

        // stock: null = غير محدود، رقم موجب = كمية محددة
        const stockValue = (stock !== undefined && stock !== null && stock !== '') ? parseInt(stock) : null;
        if (stockValue !== null && (isNaN(stockValue) || stockValue < 0)) {
            return res.status(400).json({ message: 'الكمية يجب أن تكون رقماً موجباً أو فارغة (غير محدودة)' });
        }

        const product = await Product.create({
            placeId: place._id,
            name, description, price, image, category, sortOrder,
            cost: numericCost,
            lowStockThreshold: thresholdValue,
            sku: (typeof sku === 'string' ? sku.trim().slice(0, 50) : ''),
            stock: stockValue,
            // لو الكمية صفر عند الإنشاء، اجعله غير متاح مباشرة
            isAvailable: stockValue === 0 ? false : true
        });

        // 💼 ERP: مخزون افتتاحي → حركة توريد في السجل
        if (stockValue !== null && stockValue > 0) {
            const { recordStockMovement } = require('../utils/erpHelpers');
            recordStockMovement({
                placeId: place._id, productId: product._id, productName: product.name,
                type: 'purchase', quantity: stockValue, balanceAfter: stockValue,
                unitCost: numericCost, reason: 'مخزون افتتاحي عند إنشاء المنتج',
                createdBy: req.user._id
            });
        }

        res.status(201).json(product);
    } catch (err) {
        logger.error('merchant/products POST error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/merchant/products/:id — update product
router.put('/products/:id', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(403).json({ message: 'غير مصرح' });

        // معالجة حقل stock بشكل صريح قبل التحديث
        const updateData = { ...req.body };
        
        // 🛡️ CRITICAL FIX: Prevent Mass Assignment of protected fields
        delete updateData._id;
        delete updateData.placeId;
        
        // 🛡️ CRITICAL FIX: Validate price if it's being updated
        if ('price' in updateData) {
            const numericPrice = Number(updateData.price);
            if (isNaN(numericPrice) || numericPrice < 0) {
                return res.status(400).json({ message: 'السعر يجب أن يكون رقماً موجباً أو صفراً' });
            }
            updateData.price = numericPrice;
        }

        // 💼 ERP: التحقق من سعر التكلفة عند تعديله
        if ('cost' in updateData) {
            if (updateData.cost === null || updateData.cost === '') {
                updateData.cost = 0;
            } else {
                const numericCost = Number(updateData.cost);
                if (isNaN(numericCost) || numericCost < 0) {
                    return res.status(400).json({ message: 'سعر التكلفة يجب أن يكون رقماً موجباً أو صفراً' });
                }
                updateData.cost = numericCost;
            }
        }

        // 💼 ERP: التحقق من حد تنبيه المخزون عند تعديله
        if ('lowStockThreshold' in updateData) {
            if (updateData.lowStockThreshold === null || updateData.lowStockThreshold === '') {
                updateData.lowStockThreshold = null;
            } else {
                const parsedThreshold = parseInt(updateData.lowStockThreshold);
                if (isNaN(parsedThreshold) || parsedThreshold < 0) {
                    return res.status(400).json({ message: 'حد التنبيه يجب أن يكون رقماً موجباً أو فارغاً' });
                }
                updateData.lowStockThreshold = parsedThreshold;
            }
        }

        if ('sku' in updateData) {
            updateData.sku = (typeof updateData.sku === 'string') ? updateData.sku.trim().slice(0, 50) : '';
        }

        if ('stock' in updateData) {
            const rawStock = updateData.stock;
            if (rawStock === null || rawStock === '' || rawStock === undefined) {
                updateData.stock = null; // غير محدود
            } else {
                const parsed = parseInt(rawStock);
                if (isNaN(parsed) || parsed < 0) {
                    return res.status(400).json({ message: 'الكمية يجب أن تكون رقماً موجباً أو فارغة (غير محدودة)' });
                }
                updateData.stock = parsed;
                // لو الكمية صفر، اجعل المنتج غير متاح تلقائياً
                if (parsed === 0) updateData.isAvailable = false;
                // لو الكمية أكبر من صفر وكان غير متاح بسبب نفاد الكمية، أعده متاحاً
                if (parsed > 0 && updateData.isAvailable === undefined) {
                    // نتحقق من الحالة الحالية
                    const existing = await Product.findOne({ _id: req.params.id, placeId: place._id }).select('isAvailable stock');
                    if (existing && !existing.isAvailable && existing.stock === 0) {
                        updateData.isAvailable = true;
                    }
                }
            }
        }

        const product = await Product.findOneAndUpdate(
            { _id: req.params.id, placeId: place._id },
            updateData,
            { new: true }
        );
        if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// DELETE /api/merchant/products/:id — delete product
router.delete('/products/:id', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(403).json({ message: 'غير مصرح' });
        await Product.findOneAndDelete({ _id: req.params.id, placeId: place._id });
        res.json({ message: 'تم حذف المنتج' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// PATCH /api/merchant/products/:id/stock — تعديل كمية منتج بسرعة
// body: { stock: number | null }
//   null  = غير محدود
//   0     = نفدت (يُعيَّن isAvailable: false تلقائياً)
//   n > 0 = كمية جديدة (يُعيَّن isAvailable: true تلقائياً)
router.patch('/products/:id/stock', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(403).json({ message: 'غير مصرح' });

        const product = await Product.findOne({ _id: req.params.id, placeId: place._id });
        if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });

        const { stock } = req.body;
        const previousStock = product.stock; // 💼 ERP: لحساب فرق التسوية

        if (stock === null || stock === undefined || stock === '') {
            // غير محدود
            product.stock = null;
            product.isAvailable = true;
        } else {
            const parsed = parseInt(stock);
            if (isNaN(parsed) || parsed < 0) {
                return res.status(400).json({ message: 'الكمية يجب أن تكون رقماً موجباً أو null (غير محدودة)' });
            }
            product.stock = parsed;
            product.isAvailable = parsed > 0;
        }

        await product.save();

        // 💼 ERP: توثيق التعديل السريع كحركة تسوية (فقط عند تغيّر فعلي لكمية متتبَّعة)
        if (product.stock !== null && product.stock !== previousStock) {
            const { recordStockMovement } = require('../utils/erpHelpers');
            recordStockMovement({
                placeId: place._id, productId: product._id, productName: product.name,
                type: 'adjustment',
                quantity: (previousStock === null || previousStock === undefined) ? product.stock : (product.stock - previousStock),
                balanceAfter: product.stock,
                reason: 'تعديل سريع من لوحة التاجر',
                createdBy: req.user._id
            });
        }

        // 📡 Feature 1: إرسال تحديث المخزون للعملاء المتواجدين في صفحة المتجر فوراً
        try {
            const io = req.app.get('io');
            if (io) {
                io.to(`shop_${place._id.toString()}`).emit('product_stock_changed', {
                    productId: product._id.toString(),
                    stock: product.stock,
                    isAvailable: product.isAvailable
                });
            }
        } catch (_) {}

        res.json({
            message: product.stock === null
                ? 'تم تعيين الكمية كغير محدودة'
                : product.stock === 0
                    ? 'تم تعيين المنتج كمنتهي الكمية'
                    : `تم تحديث الكمية إلى ${product.stock}`,
            product
        });
    } catch (err) {
        logger.error('stock patch error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});


// ──────────────────────────────────────────────
// 🛒 ORDERS (Merchant receives & manages orders)
// ──────────────────────────────────────────────

// GET /api/merchant/orders — list incoming orders with pagination
router.get('/orders', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'لا يوجد متجر مرتبط بحسابك' });

        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const filter = { place: place._id, status: { $ne: 'chat_initiated' } };
        const [orders, total] = await Promise.all([
            ShopOrder.find(filter)
                .populate('client', 'name phone')
                .populate('captain', 'name phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ShopOrder.countDocuments(filter)
        ]);
        res.json({ orders, currentPage: page, totalPages: Math.ceil(total / limit), total });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/merchant/orders/:id/accept — merchant accepts & starts preparing
router.put('/orders/:id/accept', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'لا يوجد متجر مرتبط بحسابك' });
        // 🛡️ CRITICAL FIX: Atomic state transition
        const order = await ShopOrder.findOneAndUpdate(
            { _id: req.params.id, place: place._id, status: 'shop_pending' },
            { $set: { status: 'shop_preparing', merchantConfirmedAt: new Date() } },
            { new: true }
        );
        if (!order) return res.status(400).json({ message: 'الطلب غير موجود أو لا يمكن قبوله الآن' });

        // Notify client — مبلغ البضاعة المطلوب تحويله للتاجر (مخصوماً منه خصم المنتجات إن وُجد)
        const goodsToMerchant = order.promoAppliesTo === 'products'
            ? Math.max(0, order.itemsTotal - (order.discountAmount || 0))
            : order.itemsTotal;
        await sendNotification(req.app, {
            userId: order.client,
            title: '💸 المتجر بانتظار الدفع!',
            message: `وافق ${place.name} على طلبك! يرجى تحويل مبلغ البضاعة (${goodsToMerchant} ج.س) للمتجر وإرفاق الإشعار. سعر التوصيل يُدفع كاش للكابتن عند الاستلام.`,
            type: 'shop_order_update',
            relatedId: order._id
        });

        const io = req.app.get('io');
        if (io) io.to(order.client.toString()).emit('shop_order_updated', { orderId: order._id, status: 'shop_preparing' });
        emitShopOrderAdminUpdate(req.app, order, place);

        res.json({ message: 'تم قبول الطلب', order });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/merchant/orders/:id/ready — merchant marks order as ready for pickup
router.put('/orders/:id/ready', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'لا يوجد متجر مرتبط بحسابك' });

        // ✅ FIX #9: التحقق من تأكيد الدفع قبل إنشاء طلب التوصيل
        // لو العميل لم يدفع بعد، لا يجب نشر الطلب للكباتن
        const pendingOrder = await ShopOrder.findOne({ _id: req.params.id, place: place._id });
        if (!pendingOrder) return res.status(404).json({ message: 'الطلب غير موجود' });
        if (pendingOrder.status !== 'shop_preparing') {
            return res.status(400).json({ message: 'الطلب ليس في مرحلة التجهيز' });
        }
        if (pendingOrder.paymentStatus !== 'confirmed') {
            return res.status(400).json({ 
                message: 'لا يمكن تحديد الطلب كجاهز قبل تأكيد الدفع من العميل',
                paymentStatus: pendingOrder.paymentStatus
            });
        }

        // 🛡️ CRITICAL FIX: Atomic state transition
        const order = await ShopOrder.findOneAndUpdate(
            { _id: req.params.id, place: place._id, status: 'shop_preparing' },
            { $set: { status: 'ready_for_pickup', readyAt: new Date() } },
            { new: true }
        );
        if (!order) return res.status(400).json({ message: 'الطلب غير موجود أو ليس في مرحلة التجهيز' });

        // 🚀 Create the delivery Order for the captains to see and accept
        const Order = require('../models/Order');
        const deliveryFee = order.deliveryFee && order.deliveryFee > 0 ? order.deliveryFee : (place.defaultDeliveryFee || 500);
        
        // Settings for commission — use the CLIENT's city for correct rates
        const Settings = require('../models/Settings');
        const User = require('../models/User');
        const clientDoc = await User.findById(order.client).select('city').lean();
        const orderCity = clientDoc?.city || 'Khartoum';
        const settings = await Settings.getSettings(orderCity);
        const commissionRate = settings.commissionRate ?? 0.15;

        const newDeliveryOrder = new Order({
            client: order.client,
            city: orderCity,       // 🌍 Stamp city on the delivery order
            shopOrderId: order._id,
            shopId: place._id,
            shopName: place.name,
            shopPhone: place.phone,
            orderType: 'shop',
            pickup: {
                address: place.address || 'عنوان المتجر',
                contactName: place.name,
                contactPhone: place.phone || '0000000000',
                lat: place.location?.lat,
                lng: place.location?.lng
            },
            dropoff: order.dropoff,
            distanceType: 'custom',
            price: deliveryFee,
            appFee: deliveryFee * commissionRate,
            netRevenue: deliveryFee - (deliveryFee * commissionRate),
            details: order.notes,
            shopOrderDetails: order.items.map(i => `${i.quantity}x ${i.name}`).join('، '),
            receiptImage: order.paymentReceiptImage,
            status: 'pending' // So it appears to captains!
        });

        // ✅ FIX #7: Wrap delivery order save in try/catch with ShopOrder rollback
        try {
            await newDeliveryOrder.save();
        } catch (deliveryErr) {
            logger.error({ err: deliveryErr }, 'Failed to create delivery order — rolling back ShopOrder status');
            // Rollback: revert ShopOrder back to shop_preparing so merchant can retry
            await ShopOrder.findByIdAndUpdate(req.params.id, { status: 'shop_preparing' });
            return res.status(500).json({ message: 'فشل إنشاء طلب التوصيل. يرجى المحاولة مجدداً.' });
        }

        // Notify client
        await sendNotification(req.app, {
            userId: order.client,
            title: '✅ طلبك جاهز!',
            message: `طلبك من ${place.name} جاهز وتم إرسال طلب للكباتن للتوصيل.`,
            type: 'shop_order_update',
            relatedId: order._id
        });

        const io = req.app.get('io');
        if (io) {
            io.to(order.client.toString()).emit('shop_order_updated', { orderId: order._id, status: 'ready_for_pickup' });
            
            // 🌍 CRITICAL: Broadcast ONLY to captains in the order's city room
            const cityRoom = `room_${orderCity}`;
            io.to(cityRoom).emit('shop_order_available', { 
                orderId: newDeliveryOrder._id,
                shopName: place.name, 
                pickup: place.address,
                price: newDeliveryOrder.price,
                city: orderCity
            });

            
            // Broadcast to admins
            io.to('admin_room').emit('new_order_available', {
                orderId: newDeliveryOrder._id,
                pickup: place.name,
                price: newDeliveryOrder.price
            });
        }
        
        // 📣 Send Push ONLY to captains in the same city
        try {
            const { sendPushToMany } = require('../utils/firebasePush');
            const activeCaptains = await User.find({
                role: 'captain',
                city: orderCity,   // 🌍 Scoped to order's city
                fcmToken: { $exists: true, $ne: null },
                isActive: true
            }).select('fcmToken');

            const tokens = activeCaptains.map(c => c.fcmToken);
            if (tokens.length > 0) {
                await sendPushToMany(tokens, '🛒 طلب محل جاهز! 🚨', `طلب من ${place.name} بسعر ${newDeliveryOrder.price} ج.س. متاح للتوصيل الآن!`, {
                    type: 'shop_order',
                    orderId: newDeliveryOrder._id.toString(),
                    url: `/captain-orders.html?highlight=${newDeliveryOrder._id.toString()}` // 🧭 وجهة الكابتن
                });
            }
        } catch (pushErr) {
            logger.error({ err: pushErr }, 'Captain push failed for shop order');
        }


        emitShopOrderAdminUpdate(req.app, order, place);
        res.json({ message: 'تم تحديد الطلب كجاهز', order });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/merchant/orders/:id/reject — merchant rejects order
router.put('/orders/:id/reject', protect, merchantOnly, async (req, res) => {
    try {
        const { reason } = req.body;
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'لا يوجد متجر مرتبط بحسابك' });

        // BUG #25 FIX: Check for assigned captain BEFORE modifying the order
        // If a captain is already assigned (en route), merchant cannot reject
        const existingOrder = await ShopOrder.findOne({
            _id: req.params.id,
            place: place._id,
            status: { $in: ['shop_pending', 'shop_preparing'] }
        }).select('captain').lean();
        if (!existingOrder) return res.status(400).json({ message: 'الطلب غير موجود أو لا يمكن رفضه الآن' });
        if (existingOrder.captain) {
            return res.status(400).json({ message: 'لا يمكن رفض الطلب — كابتن في طريقه لاستلام الطلب' });
        }

        // 🛡️ CRITICAL FIX: Atomic state transition (only after captain check passes)
        const order = await ShopOrder.findOneAndUpdate(
            { _id: req.params.id, place: place._id, status: { $in: ['shop_pending', 'shop_preparing'] }, captain: { $exists: false } },
            {
                $set: {
                    status: 'cancelled',
                    cancelledBy: 'merchant',
                    cancelReason: reason || 'رفض التاجر'
                }
            },
            { new: true }
        );
        if (!order) return res.status(400).json({ message: 'الطلب غير موجود أو تم تعيين كابتن في هذه اللحظة — لا يمكن رفضه' });

        // 📦 إعادة المخزون للمنتجات عند رفض التاجر
        if (order.items && order.items.length > 0) {
            const { recordStockMovement } = require('../utils/erpHelpers');
            for (const item of order.items) {
                if (item.productId) {
                    // أعد الكمية فقط لو كان المنتج يتتبع مخزوناً
                    const Product = require('../models/Product');
                    const prod = await Product.findById(item.productId).select('stock');
                    if (prod && prod.stock !== null && prod.stock !== undefined) {
                        const restored = await Product.findByIdAndUpdate(item.productId, {
                            $inc: { stock: item.quantity },
                            $set: { isAvailable: true }
                        }, { new: true }).select('stock name');
                        // 💼 ERP: توثيق حركة الإرجاع
                        recordStockMovement({
                            placeId: place._id, productId: item.productId,
                            productName: item.name || (restored && restored.name) || '',
                            type: 'return', quantity: item.quantity,
                            balanceAfter: restored ? restored.stock : null,
                            reason: 'إرجاع للمخزون — رفض الطلب', refModel: 'ShopOrder', refId: order._id,
                            createdBy: req.user._id
                        });
                    }
                }
            }
        }

        await sendNotification(req.app, {
            userId: order.client,
            title: '❌ طلبك تم رفضه',
            message: `للأسف رفض ${place.name} طلبك. السبب: ${reason || 'غير محدد'}`,
            type: 'shop_order_update',
            relatedId: order._id
        });

        const io = req.app.get('io');
        if (io) io.to(order.client.toString()).emit('shop_order_updated', { orderId: order._id, status: 'cancelled' });

        emitShopOrderAdminUpdate(req.app, order, place);
        res.json({ message: 'تم رفض الطلب', order });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/merchant/profile — get own shop info
router.get('/profile', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id }).populate('category', 'name icon');

        // 🔗 توليد كسول لكود المشاركة — المتاجر القديمة تحصل على كودها أول ما يفتح
        // التاجر لوحته، فيصير زر "شارك متجرك" جاهزاً دائماً بلا migration إلزامي.
        if (place && !place.shareCode) {
            try {
                const { ensureShareCode } = require('../utils/shareCode');
                await ensureShareCode(place);
            } catch (scErr) { logger.error('shareCode lazy generation failed:', scErr.message); }
        }

        res.json({ user: req.user, place });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/merchant/profile — تعديل بيانات المتجر من قِبل صاحبه
// الحقول المسموح للتاجر بتعديلها فقط (لا يمس التصنيف/المدينة/الباقة/الرصيد — تلك للأدمن)
router.put('/profile', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'المتجر غير موجود' });

        const {
            name, description, phone, whatsapp, address, image_url,
            workingHours, bankAccountName, bankAccountNumber, bankName
        } = req.body;

        if (typeof name === 'string') {
            const trimmed = name.trim();
            if (!trimmed) return res.status(400).json({ message: 'اسم المتجر لا يمكن أن يكون فارغاً' });
            place.name = trimmed.slice(0, 100);
        }
        if (typeof description === 'string') place.description = description.trim().slice(0, 500);
        if (typeof phone === 'string') place.phone = phone.trim().slice(0, 20);
        if (typeof whatsapp === 'string') place.whatsapp = whatsapp.trim().slice(0, 20);
        if (typeof address === 'string') place.address = address.trim().slice(0, 200);
        if (typeof image_url === 'string') place.image_url = image_url.trim();
        if (typeof bankAccountName === 'string') place.bankAccountName = bankAccountName.trim().slice(0, 100);
        if (typeof bankAccountNumber === 'string') place.bankAccountNumber = bankAccountNumber.trim().slice(0, 50);
        if (typeof bankName === 'string') place.bankName = bankName.trim().slice(0, 100);

        // ساعات العمل — تحقق من صيغة HH:MM وقائمة الأيام (0..6)
        if (workingHours && typeof workingHours === 'object') {
            const timeRe = /^([01]?\d|2[0-3]):[0-5]\d$/;
            if (typeof workingHours.open === 'string' && timeRe.test(workingHours.open)) {
                place.workingHours.open = workingHours.open;
            }
            if (typeof workingHours.close === 'string' && timeRe.test(workingHours.close)) {
                place.workingHours.close = workingHours.close;
            }
            if (Array.isArray(workingHours.days)) {
                const days = [...new Set(workingHours.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))];
                if (days.length) place.workingHours.days = days;
            }
        }

        await place.save();
        const updated = await Place.findById(place._id).populate('category', 'name icon');
        res.json({ message: 'تم تحديث بيانات المتجر بنجاح', place: updated });
    } catch (err) {
        logger.error({ err }, 'Error updating merchant profile');
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/merchant/profile/status — toggle open/closed status
router.put('/profile/status', protect, merchantOnly, async (req, res) => {
    try {
        const { isOpenOverride } = req.body;
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'المتجر غير موجود' });
        
        place.isOpenOverride = isOpenOverride;
        await place.save();
        
        res.json({ message: 'تم تحديث حالة المتجر بنجاح', isOpenOverride: place.isOpenOverride });
    } catch (err) {
        logger.error({ err }, 'Error updating shop status');
        res.status(500).json({ message: 'Server Error' });
    }
});

// ──────────────────────────────────────────────
// 🛒 PUBLIC — Client browses products of a shop
// ──────────────────────────────────────────────

// GET /api/merchant/shop/:placeId/products — public product listing
router.get('/shop/:placeId/products', async (req, res) => {
    try {
        const place = await Place.findById(req.params.placeId).populate('category', 'name icon');
        if (!place || !place.isActive) return res.status(404).json({ message: 'المتجر غير موجود' });
        const products = await Product.find({ placeId: place._id, isAvailable: true })
            .sort({ category: 1, sortOrder: 1 });
        res.json({ place: place.toJSON(), products });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ──────────────────────────────────────────────
// 💬 CLIENT — Get latest ShopOrder for a place (for merchant chat)
// ──────────────────────────────────────────────

// GET /api/merchant/shop/:placeId/my-latest-order
router.get('/shop/:placeId/my-latest-order', protect, async (req, res) => {
    try {
        const ShopOrder = require('../models/ShopOrder');
        const order = await ShopOrder.findOne({
            client: req.user.id,
            place: req.params.placeId,
            status: { $nin: ['cancelled'] }
        }).sort({ createdAt: -1 }).lean();

        if (!order) return res.status(404).json({ message: 'لا يوجد طلب سابق مع هذا المتجر' });

        const place = await Place.findById(req.params.placeId).select('ownerId').lean();
        res.json({ orderId: order._id, merchantId: place ? place.ownerId : null });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ──────────────────────────────────────────────
// 💬 CLIENT — Start or resume direct chat with merchant (no order needed)
// ──────────────────────────────────────────────

// POST /api/merchant/shop/:placeId/start-chat
router.post('/shop/:placeId/start-chat', protect, async (req, res) => {
    try {
        const ShopOrder = require('../models/ShopOrder');

        // 🚫 منع التاجر من محادثة متجره الخاص
        const placeCheck = await Place.findById(req.params.placeId).select('ownerId').lean();
        if (placeCheck && placeCheck.ownerId && placeCheck.ownerId.toString() === req.user._id.toString()) {
            return res.status(403).json({ message: 'لا يمكنك محادثة متجرك الخاص' });
        }

        // Find an existing active chat/order for this client+place
        let chatOrder = await ShopOrder.findOne({
            client: req.user.id,
            place: req.params.placeId,
            status: { $nin: ['cancelled'] }
        }).sort({ createdAt: -1 }).lean();

        // If none exists, create a chat_initiated placeholder
        if (!chatOrder) {
            chatOrder = await ShopOrder.create({
                client: req.user.id,
                place: req.params.placeId,
                items: [],
                itemsTotal: 0,
                deliveryFee: 0,
                totalAmount: 0,
                dropoff: {
                    address: req.body?.dropoffAddress || 'غير محدد بعد',
                    lat: req.body?.lat || 0,
                    lng: req.body?.lng || 0,
                    receiverName: req.user.name || req.user.username || 'العميل',
                    receiverPhone: req.user.phone || req.body?.phone || '0000000000'
                },
                status: 'chat_initiated'
            });
        }

        const place = await Place.findById(req.params.placeId).select('ownerId name').lean();
        res.json({
            orderId: chatOrder._id,
            merchantId: place ? place.ownerId : null,
            shopName: place ? place.name : ''
        });
    } catch (err) {
        logger.error('[start-chat] Error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ──────────────────────────────────────────────
// 💬 Chat Info — resolve names for ShopOrder chat room
// ──────────────────────────────────────────────

// GET /api/merchant/shop-order/:orderId/chat-info
router.get('/shop-order/:orderId/chat-info', protect, async (req, res) => {
    try {
        const ShopOrder = require('../models/ShopOrder');
        const User = require('../models/User');
        const order = await ShopOrder.findById(req.params.orderId)
            .populate('client', 'name')
            .populate('place', 'name ownerId')
            .lean();

        if (!order) return res.status(404).json({ message: 'Order not found' });

        const merchantUser = order.place && order.place.ownerId
            ? await User.findById(order.place.ownerId).select('name').lean()
            : null;

        res.json({
            clientId: order.client ? String(order.client._id || order.client) : null,
            clientName: (order.client && order.client.name) || 'العميل',
            merchantId: order.place ? String(order.place.ownerId || order.place._id || order.place) : null,
            merchantName: (merchantUser && merchantUser.name) || (order.place && order.place.name) || 'التاجر'
        });
    } catch (err) {
        logger.error({ err }, 'Chat info error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// ──────────────────────────────────────────────
// 🛒 CLIENT — Place a shop order
// ──────────────────────────────────────────────

// POST /api/merchant/shop/:placeId/order — client places order
router.post('/shop/:placeId/order', protect, async (req, res) => {
    try {
        const { items, dropoff, notes, deliveryFee: rawDeliveryFee, promoCode } = req.body;
        if (!items || items.length === 0 || !dropoff) {
            return res.status(400).json({ message: 'المنتجات وعنوان التوصيل مطلوبان' });
        }
        
        // 🛡️ CRITICAL FIX: Payload size limits to prevent DB DOS
        if (notes && typeof notes === 'string' && notes.length > 500) {
            return res.status(400).json({ message: 'وصف الطلب طويل جداً (الحد الأقصى 500 حرف)' });
        }
        if (dropoff && dropoff.address && dropoff.address.length > 300) {
            return res.status(400).json({ message: 'عنوان التوصيل طويل جداً (الحد الأقصى 300 حرف)' });
        }

        const place = await Place.findById(req.params.placeId);
        if (!place || !place.isActive) return res.status(404).json({ message: 'المتجر غير متاح' });

        // 🚫 منع التاجر من الطلب من متجره الخاص
        if (place.ownerId && place.ownerId.toString() === req.user._id.toString()) {
            return res.status(403).json({ message: 'لا يمكنك الطلب من متجرك الخاص' });
        }

        // Validate products & compute totals
        let itemsTotal = 0;
        const validatedItems = [];
        for (const item of items) {
            const product = await Product.findOne({ _id: item.productId, placeId: place._id, isAvailable: true });
            if (!product) return res.status(400).json({ message: `المنتج ${item.name || ''} غير متاح` });
            const qty = Math.max(1, parseInt(item.quantity) || 1);

            // 📦 Stock check: لو الكمية محددة (مش null)، تحقق من التوفر
            if (product.stock !== null && product.stock !== undefined) {
                if (product.stock < qty) {
                    const available = product.stock;
                    if (available === 0) {
                        return res.status(400).json({ message: `المنتج "${product.name}" نفدت كميته` });
                    }
                    return res.status(400).json({
                        message: `المنتج "${product.name}" متوفر منه ${available} فقط، وطلبت ${qty}`
                    });
                }
            }

            const subtotal = product.price * qty;
            itemsTotal += subtotal;
            // 💼 ERP: تثبيت التكلفة (snapshot) وقت الطلب — لدقة تقارير الأرباح تاريخياً
            validatedItems.push({ productId: product._id, name: product.name, price: product.price, cost: product.cost || 0, quantity: qty, subtotal });
        }

        // 🚚 سعر التوصيل: يحدّده العميل (قابل للتفاوض) — مع حدود منطقية، وإلا الافتراضي للمتجر
        let deliveryFee = Number(rawDeliveryFee);
        if (!Number.isFinite(deliveryFee) || deliveryFee <= 0) {
            deliveryFee = place.defaultDeliveryFee || 0;
        }
        if (deliveryFee > 1000000) deliveryFee = 1000000; // حماية من القيم الشاذة

        const originalTotal = itemsTotal + deliveryFee;

        // 🎟️ إعادة التحقق من كود الخصم في السيرفر (لا نثق بقيمة الخصم من العميل)
        let discountAmount = 0;
        let appliedPromoCode = null;
        let promoAppliesTo = 'total';
        let promoDoc = null;
        if (promoCode && typeof promoCode === 'string') {
            const now = new Date();
            promoDoc = await PromoCode.findOne({
                code: promoCode.toUpperCase().trim(),
                isActive: true,
                validFrom:  { $lte: now },
                validUntil: { $gte: now }
            });
            if (promoDoc) {
                const underTotalLimit = promoDoc.usageLimit === null || promoDoc.usedCount < promoDoc.usageLimit;
                const userUsages = promoDoc.usedBy.filter(u => u.user && u.user.toString() === req.user._id.toString()).length;
                const underUserLimit = userUsages < promoDoc.userUsageLimit;
                const meetsMin = originalTotal >= promoDoc.minOrderValue;
                const cityOk = promoDoc.city === 'all' || !place.city || promoDoc.city === place.city;

                if (underTotalLimit && underUserLimit && meetsMin && cityOk) {
                    const scope = promoDoc.appliesTo || 'total';
                    const base = scope === 'products' ? itemsTotal
                               : scope === 'delivery' ? deliveryFee
                               : originalTotal;
                    if (base > 0) {
                        let d = promoDoc.type === 'percentage' ? (base * promoDoc.value) / 100 : Math.min(promoDoc.value, base);
                        if (promoDoc.type === 'percentage' && promoDoc.maxDiscount !== null) d = Math.min(d, promoDoc.maxDiscount);
                        discountAmount = Math.round(d);
                        appliedPromoCode = promoDoc.code;
                        promoAppliesTo = scope;
                    }
                }
            }
            // كود غير صالح → يُتجاهل بهدوء (الخصم = 0) دون رفض الطلب
        }

        const totalAmount = Math.max(0, originalTotal - discountAmount);

        // 🛡️ CRITICAL FIX: Atomic Stock Reservation with Rollback
        const reservedItems = [];
        const stockMovementsToLog = []; // 💼 ERP: حركات تُسجَّل بعد نجاح إنشاء الطلب
        let stockError = null;

        for (const item of validatedItems) {
            if (item.productId) {
                // Determine if product tracks stock
                const productCheck = await Product.findById(item.productId).select('stock');
                if (productCheck && productCheck.stock !== null && productCheck.stock !== undefined) {
                    const updated = await Product.findOneAndUpdate(
                        {
                            _id: item.productId,
                            stock: { $gte: item.quantity },
                            isAvailable: true
                        },
                        [
                            {
                                $set: {
                                    stock: { $subtract: ['$stock', item.quantity] },
                                    isAvailable: {
                                        $cond: {
                                            if: { $lte: [{ $subtract: ['$stock', item.quantity] }, 0] },
                                            then: false,
                                            else: '$isAvailable'
                                        }
                                    }
                                }
                            }
                        ],
                        { new: true }
                    );

                    if (!updated) {
                        stockError = `عذراً، المنتج "${item.name}" نفد أو لم يعد متوفراً بالكمية المطلوبة. يرجى تحديث السلة.`;
                        break;
                    } else {
                        reservedItems.push(item);
                        // 💼 ERP: توثيق حركة البيع (تُكتب بعد نجاح إنشاء الطلب)
                        stockMovementsToLog.push({
                            productId: item.productId, productName: item.name,
                            quantity: -item.quantity, balanceAfter: updated.stock
                        });
                        if (updated.stock <= 0 && place.ownerId) {
                            const io = req.app.get('io');
                            if (io) {
                                io.to(place.ownerId.toString()).emit('out_of_stock_alert', {
                                    productId: updated._id,
                                    productName: updated.name
                                });
                            }
                        } else {
                            // 💼 ERP: تنبيه مخزون منخفض عند الهبوط لحد التنبيه
                            const { checkLowStockAlert } = require('../utils/erpHelpers');
                            checkLowStockAlert(req.app, place, updated);
                        }
                    }

                } else {
                    // Stock is null (unlimited), just push to reserved to track it if we needed to rollback something else, though rollback for unlimited is no-op
                    reservedItems.push(item);
                }
            }
        }

        // If any item failed to reserve, rollback all previously reserved items
        if (stockError) {
            for (const resItem of reservedItems) {
                const p = await Product.findById(resItem.productId).select('stock');
                if (p && p.stock !== null && p.stock !== undefined) {
                    await Product.findByIdAndUpdate(resItem.productId, {
                        $inc: { stock: resItem.quantity },
                        $set: { isAvailable: true } // Restore availability if it was exhausted
                    });
                }
            }
            return res.status(400).json({ message: stockError });
        }

        // Now that stock is safely reserved, create the order
        const order = await ShopOrder.create({
            client: req.user._id,
            place: place._id,
            items: validatedItems,
            itemsTotal,
            deliveryFee,
            totalAmount,
            originalTotal,
            discountAmount,
            promoCode: appliedPromoCode,
            promoAppliesTo,
            dropoff,
            notes: notes || '',
        });

        // 💼 ERP: تسجيل حركات المخزون (بيع) مرتبطة بالطلب
        if (stockMovementsToLog.length > 0) {
            const { recordStockMovement } = require('../utils/erpHelpers');
            for (const mv of stockMovementsToLog) {
                recordStockMovement({
                    placeId: place._id, productId: mv.productId, productName: mv.productName,
                    type: 'sale', quantity: mv.quantity, balanceAfter: mv.balanceAfter,
                    reason: 'بيع — طلب تطبيق', refModel: 'ShopOrder', refId: order._id,
                    createdBy: req.user._id
                });
            }
        }

        // 🎟️ تسجيل استخدام الكوبون بعد نجاح إنشاء الطلب
        if (promoDoc && appliedPromoCode) {
            await PromoCode.findByIdAndUpdate(promoDoc._id, {
                $inc: { usedCount: 1 },
                $push: { usedBy: { user: req.user._id, orderId: order._id, discountAmount } }
            }).catch(err => logger.error('Promo usage record error:', err.message));
        }

        // Notify the merchant
        if (place.ownerId) {
            await sendNotification(req.app, {
                userId: place.ownerId,
                title: '🛒 طلب جديد وصلك!',
                message: `طلب جديد من ${req.user.name} بقيمة ${itemsTotal} ج.س`,
                type: 'new_shop_order',
                relatedId: order._id
            });
            const io = req.app.get('io');
            if (io) io.to(place.ownerId.toString()).emit('new_shop_order', { orderId: order._id, clientName: req.user.name, total: itemsTotal });
        }

        // 🔔 إشعار الأدمن بطلب متجر جديد (حفظ + socket + push) — كان ناقصاً تماماً،
        // فطلبات المتجر (ومنها بورتسودان) لم تكن تصل للأدمن إطلاقاً.
        notifyAdmins(req.app, {
            title: 'طلب متجر جديد',
            message: `طلب جديد من متجر ${place.name || ''} بقيمة ${itemsTotal} ج.س${place.city ? ' — ' + place.city : ''}`,
            type: 'admin_order_alert',
            relatedId: order._id
        });
        emitShopOrderAdminUpdate(req.app, order, place, req.user.name);

        res.status(201).json({ message: 'تم إرسال الطلب للمتجر', order });
    } catch (err) {
        logger.error('Place shop order error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/merchant/client/orders — client views their shop orders (with pagination)
router.get('/client/orders', protect, async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 10);
        const skip  = (page - 1) * limit;

        const filter = { client: req.user._id };
        const [orders, total] = await Promise.all([
            ShopOrder.find(filter)
                .populate('place', 'name image_url address')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ShopOrder.countDocuments(filter)
        ]);
        res.json({ orders, currentPage: page, totalPages: Math.ceil(total / limit), total });
    } catch (err) {
        logger.error({ err: err.message, stack: err.stack }, 'merchant/client/orders GET error');
        res.status(500).json({ message: err.message || 'Server Error' });
    }
});

// PUT /api/merchant/client/orders/:id/payment-receipt — client uploads payment receipt
// ✅ FIX #10: Unified with /api/orders/shop/:id/upload-receipt — both now send socket + notification
router.put('/client/orders/:id/payment-receipt', protect, async (req, res) => {
    try {
        const { receiptImage } = req.body;
        if (!receiptImage) return res.status(400).json({ message: 'صورة الإيصال مطلوبة' });
        const order = await ShopOrder.findOneAndUpdate(
            { _id: req.params.id, client: req.user._id },
            { paymentReceiptImage: receiptImage, paymentStatus: 'receipt_sent' },
            { new: true }
        );
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
        // Notify merchant via push + socket
        const place = await Place.findById(order.place);
        if (place?.ownerId) {
            await sendNotification(req.app, {
                userId: place.ownerId,
                title: '🧾 إشعار دفع جديد',
                message: `قام العميل بإرفاق إشعار الدفع للطلب رقم ${order._id.toString().slice(-6)}. يرجى مراجعته وتأكيده للبدء في التجهيز.`,
                type: 'payment_receipt',
                relatedId: order._id
            });
            const io = req.app.get('io');
            if (io) io.to(place.ownerId.toString()).emit('shop_order_updated', { orderId: order._id, status: 'receipt_sent' });
        }
        emitShopOrderAdminUpdate(req.app, order, place, req.user.name);
        res.json({ message: 'تم إرسال إشعار الدفع', order });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});


// PUT /api/merchant/orders/:id/confirm-payment — merchant confirms payment
router.put('/orders/:id/confirm-payment', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'لا يوجد متجر مرتبط بحسابك' });
        const order = await ShopOrder.findOne({ _id: req.params.id, place: place._id });
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
        if (!['shop_pending', 'shop_preparing'].includes(order.status)) {
            return res.status(400).json({ message: 'لا يمكن تأكيد دفع هذا الطلب في حالته الحالية' });
        }
        order.paymentStatus = 'confirmed';
        await order.save();
        await sendNotification(req.app, {
            userId: order.client,
            title: '✅ تأكيد الدفع',
            message: 'تم تأكيد دفعك من قبل المتجر. سيتم تجهيز طلبك الآن.',
            type: 'payment_confirmed',
            relatedId: order._id
        });
        emitShopOrderAdminUpdate(req.app, order, place);
        res.json({ message: 'تم تأكيد الدفع', order });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ──────────────────────────────────────────────
// 🔧 ADMIN — assign merchant to a place
// ──────────────────────────────────────────────
router.put('/admin/assign-merchant', protect, adminOnly, async (req, res) => {
    try {
        const { placeId, merchantPhone } = req.body;
        const merchant = await User.findOne({ phone: merchantPhone, role: 'merchant' });
        if (!merchant) return res.status(404).json({ message: 'لا يوجد تاجر بهذا الرقم' });
        const place = await Place.findByIdAndUpdate(placeId, { ownerId: merchant._id }, { new: true });
        if (!place) return res.status(404).json({ message: 'المتجر غير موجود' });
        res.json({ message: 'تم ربط التاجر بالمتجر', place, merchant: { name: merchant.name, phone: merchant.phone } });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ──────────────────────────────────────────────
// 🔔 MERCHANT — remind client to complete payment
// ──────────────────────────────────────────────
// POST /api/merchant/orders/:id/remind-payment
router.post('/orders/:id/remind-payment', protect, merchantOnly, async (req, res) => {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'لا يوجد متجر مرتبط بحسابك' });
        const order = await ShopOrder.findOne({ _id: req.params.id, place: place._id });
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });
        if (order.paymentStatus === 'confirmed') {
            return res.status(400).json({ message: 'الدفع مؤكد بالفعل، لا حاجة للتذكير' });
        }
        await sendNotification(req.app, {
            userId: order.client,
            title: '⏰ تذكير بالدفع',
            message: `الرجاء إكمال الدفع لطلبك من متجر ${place.name} حتى نتمكن من تجهيز طلبك.`,
            type: 'payment_reminder',
            relatedId: order._id
        });
        // Also emit via socket
        const io = req.app.get('io');
        if (io && order.client) {
            io.to(order.client.toString()).emit('payment_reminder', { orderId: order._id, shopName: place.name });
        }
        res.json({ message: 'تم إرسال التذكير للعميل' });
    } catch (err) {
        logger.error('[remind-payment] Error:', err);
        res.status(500).json({ message: err.message || 'Server Error' });
    }
});

module.exports = router;
