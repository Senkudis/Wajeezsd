const cron = require('node-cron');
const Order = require('./models/Order');
const User  = require('./models/User');
const nodemailer = require('nodemailer');
const logger = require('./utils/logger');

// إعداد الإيميل
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const startScheduler = (app) => {
    // Ensure DB connection is ready before scheduling tasks
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
        logger.warn('Scheduler called before DB ready — deferring until connected');
        return;
    }

    logger.info('Scheduler system started');

    // تشغيل الفحص كل ساعة (عند الدقيقة 0)
    cron.schedule('0 * * * *', async () => {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
            logger.warn('Skipping stale-order cleanup — DB not ready');
            return;
        }
        logger.info('Checking stale pending orders...');

        try {
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
            // ✅ BUG-011 FIX: استثناء الطلبات ذات عروض تفاوض نشطة لمنع حذفها وإشعار الكباتن بشكل خاطئ
            const staleOrders = await Order.find({
                status: 'pending',
                createdAt: { $lt: sixHoursAgo },
                negotiations: { $not: { $elemMatch: { status: 'pending' } } }
            }).populate('client', 'name email phone fcmToken');

            if (staleOrders.length === 0) {
                logger.info('No stale orders to delete');
                return;
            }

            logger.info({ count: staleOrders.length }, 'Found stale orders to delete');

            for (const order of staleOrders) {
                // ✅ FIX #6: إشعار الكباتن المتفاوضين قبل حذف الطلب
                if (order.negotiations && order.negotiations.length > 0) {
                    const io = app ? app.get('io') : null;
                    for (const n of order.negotiations) {
                        if (n.status === 'pending' && n.captainId) {
                            if (io) {
                                io.to(n.captainId.toString()).emit('negotiation_resolved', {
                                    orderId: order._id,
                                    result: 'order_expired'
                                });
                            }
                            // FCM push for offline captains
                            try {
                                const User = require('./models/User');
                                const cap = await User.findById(n.captainId).select('fcmToken');
                                if (cap && cap.fcmToken) {
                                    const { sendPush } = require('./utils/firebasePush');
                                    await sendPush(
                                        cap.fcmToken,
                                        '❌ انتهى الطلب قبل القبول',
                                        'انتهت مدة الطلب الذي كنت تتفاوض عليه وتم حذفه تلقائياً.',
                                        { type: 'order_expired', orderId: order._id.toString(), url: '/captain-orders.html' } // 🧭 وجهة الكابتن
                                    );
                                }
                            } catch (capPushErr) {
                                logger.warn({ err: capPushErr, orderId: order._id }, 'Failed to notify negotiating captain of stale order');
                            }
                        }
                    }
                }

                // 🔔 Push Notification للعميل (يوصل حتى لو التطبيق مغلق)
                if (order.client) {
                    try {
                        const { sendPush } = require('./utils/firebasePush');
                        if (order.client.fcmToken) {
                            await sendPush(
                                order.client.fcmToken,
                                '❌ تم إلغاء طلبك تلقائياً',
                                'مرت 6 ساعات ولم يتم قبول طلبك من أي كابتن. يمكنك إعادة المحاولة.',
                                // 🧭 الطلب حُذف — التتبع سيفشل، فالوجهة الصحيحة قائمة طلبات العميل
                                { type: 'order_cancelled', orderId: order._id.toString(), url: '/client-my-orders.html' }
                            );
                        }

                        // Socket notification (لو العميل أونلاين)
                        const io = app ? app.get('io') : null;
                        if (io) {
                            io.to(order.client._id.toString()).emit('new_notification', {
                                title: '❌ تم إلغاء طلبك تلقائياً',
                                message: 'مرت 6 ساعات ولم يتم قبول طلبك. يمكنك إعادة المحاولة.',
                                type: 'order_cancelled'
                            });
                            io.to(order.client._id.toString()).emit('order_status_updated', {
                                orderId: order._id, status: 'cancelled'
                            });
                        }

                        // Save notification to DB
                        const Notification = require('./models/Notification');
                        await Notification.create({
                            user: order.client._id,
                            title: '❌ تم إلغاء طلبك تلقائياً',
                            message: 'مرت 6 ساعات ولم يتم قبول طلبك من أي كابتن. يمكنك إعادة المحاولة ورفع السعر.',
                            type: 'order_cancelled',
                            relatedId: order._id
                        });
                    } catch (pushErr) {
                        logger.error({ orderId: order._id, err: pushErr }, 'Failed to send cancellation push');
                    }
                }

                // 📧 Email (إضافي — لو عنده إيميل)
                if (order.client && order.client.email) {
                    try {
                        await transporter.sendMail({
                            to: order.client.email,
                            subject: 'تم إلغاء طلبك لعدم توفر كابتن | وجيز',
                            html: `
                                <div style="text-align:right; direction:rtl; font-family: 'Cairo', sans-serif;">
                                    <h3>مرحباً ${order.client.name || 'عميلنا العزيز'} 👋</h3>
                                    <p>نأسف لإبلاغك بأنه قد مرت 6 ساعات على طلبك ولم يتم قبوله من قبل أي كابتن.</p>
                                    <p><b>لذلك تم إلغاء وحذف الطلب تلقائياً من النظام.</b></p>
                                    <p>يمكنك إعادة المحاولة ورفع السعر المقترح لجذب الكباتن.</p>
                                    <br>
                                    <p>شكراً لاستخدامك وجيز 🚴‍♂️</p>
                                </div>
                            `
                        });
                        logger.info({ email: order.client.email }, 'Sent cancellation email to client');
                    } catch (mailErr) {
                        logger.error({ orderId: order._id, err: mailErr }, 'Failed to send cancellation email');
                    }
                }
                await Order.findByIdAndDelete(order._id);
                logger.info({ orderId: order._id }, 'Deleted stale order');
            }

        } catch (error) {
            logger.error({ err: error }, 'Scheduler error in stale order cleanup');
        }
    });

    // ⏰ Publish Scheduled Orders (runs every minute)
    cron.schedule('* * * * *', async () => {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) return;
        try {
            const now = new Date();
            const dueOrders = await Order.find({
                status: 'scheduled',
                scheduledAt: { $lte: now }
            });

            if (dueOrders.length === 0) return;

            // ✅ Get io from the express app
            const io = app ? app.get('io') : null;

            for (const order of dueOrders) {
                order.status = 'pending';
                await order.save();
                logger.info({ orderId: order._id }, 'Scheduled order published');

                // ✅ FIX #18: Emit the correct event based on orderType
                // Shop orders must use 'shop_order_available', not 'new_order_available'
                if (io) {
                    // ✅ BUG-003 FIX: استخدام cityRoom بدلاً من io.emit() العامّ للحفاظ على عزل المدن
                    const cityRoom = `room_${order.city || 'Khartoum'}`;
                    if (order.orderType === 'shop') {
                        io.to(cityRoom).emit('shop_order_available', {
                            orderId: order._id,
                            shopName: order.shopName || 'محل',
                            pickup: order.pickup ? order.pickup.address : '',
                            price: order.price,
                            city: order.city
                        });
                    } else {
                        io.to(cityRoom).emit('new_order_available', {
                            orderId: order._id,
                            pickup: order.pickup ? order.pickup.address : '',
                            price: order.price,
                            city: order.city
                        });
                    }
                }

                // 🔔 FCM Push للكباتن النشطين (التطبيق مقفول)
                try {
                    const { sendPushToMany } = require('./utils/firebasePush');
                    // 🌍 عزل المدن: أرسل فقط لكباتن مدينة الطلب — لا تُنبّه كل كباتن السودان.
                    // (نفس المبدأ المطبَّق في بث السوكت أعلاه cityRoom وفي routes/merchant.js)
                    const activeCaptains = await User.find({
                        role: 'captain',
                        city: order.city || 'Khartoum',
                        fcmToken: { $exists: true, $ne: null },
                        isActive: true
                    }).select('fcmToken');

                    const tokens = activeCaptains.map(c => c.fcmToken).filter(Boolean);
                    if (tokens.length > 0) {
                        const isShop = order.orderType === 'shop';
                        const title = isShop ? '🛒 طلب محل مجدول متاح الآن! 🚨' : '📦 طلب توصيل مجدول متاح الآن! 🚨';
                        const body  = isShop
                            ? `طلب من ${order.shopName || 'محل'} بسعر ${order.price} ج.س — تم نشره الآن`
                            : `طلب توصيل بسعر ${order.price} ج.س — تم نشره الآن`;
                        await sendPushToMany(tokens, title, body, {
                            type: isShop ? 'shop_order' : 'new_order',
                            orderId: order._id.toString(),
                            url: `/captain-orders.html?highlight=${order._id.toString()}` // 🧭 وجهة الكابتن
                        });
                        logger.info({ orderId: order._id, captainCount: tokens.length }, 'Scheduled order FCM push sent');
                    }
                } catch (pushErr) {
                    logger.error({ err: pushErr, orderId: order._id }, 'Scheduled order FCM push failed');
                }
            }
        } catch (error) {
            logger.error({ err: error }, 'Scheduler error in publishing scheduled orders');
        }
    });

    // 📊 Daily Admin Report — every day at 08:00
    cron.schedule('0 8 * * *', async () => {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) return;

        try {
            const today = new Date();
            // ✅ BUG-007 FIX: حساب نطاق الأمس الكامل بدلاً من منتصف ليل اليوم (00:00 → 00:00 أمس)
            // التقرير يجري الساعة 8 صباحاً، والفلتر القديم كان يشمل 8 ساعات فقط من اليوم الحالي
            const endOfYesterday = new Date(today);
            endOfYesterday.setHours(0, 0, 0, 0); // منتصف ليل اليوم = نهاية الأمس
            const startOfYesterday = new Date(endOfYesterday);
            startOfYesterday.setDate(startOfYesterday.getDate() - 1); // بداية الأمس

            const [ordersToday, newCaptains, newClients, blockedCaptains] = await Promise.all([
                Order.find({ createdAt: { $gte: startOfYesterday, $lt: endOfYesterday } }),
                User.countDocuments({ role: 'captain', createdAt: { $gte: startOfYesterday, $lt: endOfYesterday } }),
                User.countDocuments({ role: 'client',  createdAt: { $gte: startOfYesterday, $lt: endOfYesterday } }),
                User.countDocuments({ role: 'captain', is_blocked: true })
            ]);

            const delivered  = ordersToday.filter(o => o.status === 'delivered').length;
            const cancelled  = ordersToday.filter(o => o.status === 'cancelled').length;
            const totalRev   = ordersToday.filter(o => o.status === 'delivered').reduce((s, o) => s + (o.appFee || 0), 0);

            const adminEmails = (process.env.ADMIN_EMAILS || process.env.EMAIL_USER || '').split(',').filter(Boolean);
            if (!adminEmails.length) return;

            await transporter.sendMail({
                to: adminEmails.join(','),
                subject: `📊 تقرير وجيز اليومي — ${today.toLocaleDateString('ar-SA')}`,
                html: `
                    <div style="text-align:right;direction:rtl;font-family:'Cairo',sans-serif;max-width:600px;margin:auto;">
                        <h2 style="color:#04553A;">📊 تقرير يومي — وجيز</h2>
                        <p style="color:#555;">الفترة: آخر 24 ساعة</p>
                        <table style="width:100%;border-collapse:collapse;">
                            <tr style="background:#f0fdf4;"><td style="padding:12px;border:1px solid #d1fae5;">📦 إجمالي الطلبات</td><td style="padding:12px;border:1px solid #d1fae5;font-weight:bold;">${ordersToday.length}</td></tr>
                            <tr><td style="padding:12px;border:1px solid #e5e7eb;">✅ مكتملة</td><td style="padding:12px;border:1px solid #e5e7eb;color:#059669;font-weight:bold;">${delivered}</td></tr>
                            <tr style="background:#fafafa;"><td style="padding:12px;border:1px solid #e5e7eb;">❌ ملغاة</td><td style="padding:12px;border:1px solid #e5e7eb;color:#dc2626;font-weight:bold;">${cancelled}</td></tr>
                            <tr><td style="padding:12px;border:1px solid #e5e7eb;">💰 إيرادات العمولة</td><td style="padding:12px;border:1px solid #e5e7eb;color:#04553A;font-weight:bold;">${totalRev.toFixed(0)} ج.س</td></tr>
                            <tr style="background:#fafafa;"><td style="padding:12px;border:1px solid #e5e7eb;">🏍️ كباتن جدد</td><td style="padding:12px;border:1px solid #e5e7eb;">${newCaptains}</td></tr>
                            <tr><td style="padding:12px;border:1px solid #e5e7eb;">👤 عملاء جدد</td><td style="padding:12px;border:1px solid #e5e7eb;">${newClients}</td></tr>
                            <tr style="background:#fff1f2;"><td style="padding:12px;border:1px solid #fecaca;">🔒 كباتن موقوفون</td><td style="padding:12px;border:1px solid #fecaca;color:#dc2626;font-weight:bold;">${blockedCaptains}</td></tr>
                        </table>
                        <p style="margin-top:20px;color:#9ca3af;font-size:12px;">هذا تقرير تلقائي من نظام وجيز 🚴‍♂️</p>
                    </div>
                `
            });
            logger.info('📊 Daily admin report sent via Email');

            // 🔔 إرسال إشعار منبثق لجميع الإداريين في التطبيق
            const { sendNotification } = require('./utils/notificationHelper');
            const admins = await User.find({ role: 'admin' });
            for (const admin of admins) {
                await sendNotification(app, {
                    userId: admin._id,
                    title: '📊 التقرير اليومي',
                    message: `📦 الطلبات: ${ordersToday.length} | ✅ مكتملة: ${delivered} | 💰 الإيرادات: ${totalRev.toFixed(0)} ج.س`,
                    type: 'system',
                    relatedId: null
                });
            }
            logger.info('🔔 Daily admin report sent via Push Notification');

        } catch (err) {
            logger.error({ err }, 'Failed to send daily admin report');
        }
    });

    // ====================================================
    // ⏰ FIX #8: Auto-expire stale negotiation offers (every 5 minutes)
    // Offers set expiresAt when created but were never cleaned server-side.
    // This job marks them 'expired' and notifies the affected captains.
    // ====================================================
    cron.schedule('*/5 * * * *', async () => {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) return;
        try {
            const now = new Date();
            // Find orders that still have pending (not yet resolved) expired offers
            const ordersWithExpiredOffers = await Order.find({
                status: 'pending',
                'negotiations.status': 'pending',
                'negotiations.expiresAt': { $lt: now }
            }).select('_id negotiations');

            if (ordersWithExpiredOffers.length === 0) return;

            const io = app ? app.get('io') : null;
            let expiredCount = 0;

            for (const order of ordersWithExpiredOffers) {
                let changed = false;
                for (let i = 0; i < order.negotiations.length; i++) {
                    const n = order.negotiations[i];
                    if (n.status === 'pending' && n.expiresAt && new Date(n.expiresAt) < now) {
                        order.negotiations[i].status = 'expired';
                        changed = true;
                        expiredCount++;
                        // Notify captain that their offer expired
                        if (n.captainId) {
                            if (io) {
                                io.to(n.captainId.toString()).emit('negotiation_resolved', {
                                    orderId: order._id,
                                    result: 'expired'
                                });
                            }
                            try {
                                const capUser = await User.findById(n.captainId).select('fcmToken').lean();
                                if (capUser?.fcmToken) {
                                    const { sendPush } = require('./utils/firebasePush');
                                    await sendPush(
                                        capUser.fcmToken,
                                        '❌ عرضك انتهى',
                                        'انتهت مدة عرضك للتفاوض. لا يزال الطلب متاحاً لتقديم عرض جديد.',
                                        { type: 'offer_expired', orderId: order._id.toString(), url: `/captain-orders.html?highlight=${order._id.toString()}` } // 🧭 وجهة الكابتن
                                    );
                                }
                            } catch (pushErr) {
                                logger.warn({ err: pushErr, captainId: n.captainId }, 'Failed to push offer expiry notice');
                            }
                        }
                    }
                }
                if (changed) await order.save();
            }

            if (expiredCount > 0) {
                logger.info({ expiredCount }, 'Auto-expired stale negotiation offers');
            }
        } catch (err) {
            logger.error({ err }, 'Scheduler error in negotiation expiry cleanup');
        }
    });
};

/**
 * 🔔 Send a reminder FCM push to a captain before their negotiation offer expires.
 * Call this after creating a negotiation with a short TTL.
 * @param {string} captainFcmToken
 * @param {string} orderId
 * @param {number} expiresInMs  - milliseconds until expiry (e.g. 5 * 60 * 1000)
 */
async function sendOfferExpiryReminder(captainFcmToken, orderId, expiresInMs) {
    if (!captainFcmToken || !orderId) return;
    const reminderDelay = expiresInMs - 2 * 60 * 1000; // 2 minutes before expiry
    if (reminderDelay <= 0) return;

    setTimeout(async () => {
        try {
            const { sendPush } = require('./utils/firebasePush');
            await sendPush(
                captainFcmToken,
                '⏰ عرضك على وشك الانتهاء!',
                'باقي دقيقتين على انتهاء عرضك للتفاوض. افتح التطبيق الآن.',
                { type: 'offer_expiry_reminder', orderId: orderId.toString(), url: `/captain-orders.html?highlight=${orderId.toString()}` } // 🧭 وجهة الكابتن
            );
            logger.debug({ orderId }, 'Offer expiry reminder sent');
        } catch (err) {
            logger.warn({ err, orderId }, 'Failed to send offer expiry reminder');
        }
    }, reminderDelay);
}

module.exports = { startScheduler: startScheduler, sendOfferExpiryReminder };
module.exports.default = startScheduler; // backwards compat
