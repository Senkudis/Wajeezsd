const cron = require('node-cron');
const Order = require('./models/Order');
const User  = require('./models/User');
const nodemailer = require('nodemailer');
const logger = require('./utils/logger');
const { planNudge } = require('./utils/nudgePlanner');

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
            // ✅ BUG-011 FIX: استثناء الطلبات ذات عروض تفاوض نشطة لمنع إلغائها وإشعار الكباتن بشكل خاطئ
            const staleOrders = await Order.find({
                status: 'pending',
                createdAt: { $lt: sixHoursAgo },
                negotiations: { $not: { $elemMatch: { status: 'pending' } } }
            }).populate('client', 'name email phone fcmToken');

            if (staleOrders.length === 0) {
                logger.info('No stale orders to archive');
                return;
            }

            logger.info({ count: staleOrders.length }, 'Found stale orders to archive');

            for (const order of staleOrders) {
                // ✅ FIX #6: إشعار الكباتن المتفاوضين قبل إلغاء الطلب
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
                                        'انتهت مدة الطلب الذي كنت تتفاوض عليه وتم إلغاؤه تلقائياً.',
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
                                // 🧭 الطلب أُلغي فلا معنى لصفحة التتبّع — قائمة الطلبات مع إبراز الطلب
                                { type: 'order_cancelled', orderId: order._id.toString(), url: `/client-my-orders.html?highlight=${order._id}` }
                            );
                        }

                        // Socket notification (لو العميل أونلاين)
                        const io = app ? app.get('io') : null;
                        if (io) {
                            io.to(order.client._id.toString()).emit('new_notification', {
                                title: 'تم إلغاء طلبك تلقائياً',
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
                            title: 'تم إلغاء طلبك تلقائياً',
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
                                    <p><b>لذلك تم إلغاء الطلب تلقائياً.</b> يبقى الطلب محفوظاً في سجل طلباتك بحالة "ملغى" للرجوع إليه.</p>
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
                // BUG-M4 FIX: أرشفة الطلب بدل حذفه نهائياً — لضمان التتبع وحل النزاعات
                await Order.findByIdAndUpdate(order._id, {
                    status: 'cancelled',
                    cancelledBy: 'system',
                    cancelledAt: new Date(),
                    cancelReason: 'انتهت المهلة تلقائياً — 6 ساعات بلا قبول من أي كابتن'
                });
                logger.info({ orderId: order._id }, 'Archived stale order (status=cancelled)');
            }

        } catch (error) {
            logger.error({ err: error }, 'Scheduler error in stale order cleanup');
        }
    });

    // ════════════════════════════════════════════════════════════
    // ⏳ تنبيهات تأخّر الطلب — الطلب معلّق ولم يقبله كابتن بعد
    // ════════════════════════════════════════════════════════════
    // المشكلة التي تعالجها: بين إنشاء الطلب وإلغائه التلقائي بعد ٦ ساعات
    // كان العميل في صمت تام. الصمت يُقرأ إهمالاً، فيغادر العميل قبل أن
    // يصله كابتن أصلاً. هذه العتبات تُبقيه على علم وتمنحه خيار التصرّف.
    //
    // كل عتبة تُرسل مرة واحدة لكل طلب — delayNoticesSent يمنع التكرار
    // مهما مرّ المجدول (كل ٥ دقائق) على الطلب نفسه.
    //
    // ⚠️ المفتاح ثابت ('delay1') ولا يحمل قيمة الدقائق. لو كان المفتاح هو
    // الرقم نفسه، لأدّى تعديل الأدمن للعتبة من ٣٠ إلى ٤٥ إلى عدم تطابق
    // العلامة المخزّنة فيُعاد إشعار كل طلب سبق إشعاره.
    // afterMin تُقرأ من إعدادات المدينة وقت التشغيل — انظر nudgeConfigFor.
    const DELAY_NOTICE_TEXT = {
        delay1: {
            title: 'ما زلنا نبحث لك عن كابتن',
            message: 'طلبك ما زال معروضاً على الكباتن القريبين. سنخبرك فور قبوله.'
        },
        delay2: {
            title: 'طلبك يستغرق وقتاً أطول من المعتاد',
            message: 'لم يقبل أي كابتن طلبك حتى الآن. يمكنك رفع سعر التوصيل لجذب الكباتن، أو إلغاء الطلب دون أي رسوم.'
        }
    };

    // 🔁 علامات النسخة السابقة (قيم رقمية، ومفاتيح تحمل الدقائق). تُترجَم
    // عند القراءة كي لا يتلقّى طلبٌ قيد التنفيذ وقت النشر إشعاراً مكرّراً.
    const LEGACY_NUDGE_KEYS = {
        30: 'delay1', 120: 'delay2',
        pickup_15: 'pickup_1', pickup_40: 'pickup_2',
        deliver_30: 'deliver_1', deliver_75: 'deliver_2'
    };
    const normalizeSentKeys = (arr) =>
        (arr || []).map(k => LEGACY_NUDGE_KEYS[k] ?? LEGACY_NUDGE_KEYS[String(k)] ?? k);

    /** عتبات مدينة واحدة، بصيغة planNudge */
    const nudgeConfigFor = (n) => ({
        clientDelay: [
            { key: 'delay1', afterMin: n.clientDelay1, ...DELAY_NOTICE_TEXT.delay1 },
            { key: 'delay2', afterMin: n.clientDelay2, ...DELAY_NOTICE_TEXT.delay2 }
        ],
        accepted: [
            {
                key: 'pickup_1', afterMin: n.captainPickup1,
                title: 'هل وصلت لنقطة الاستلام؟',
                message: `مرّ ${n.captainPickup1} دقيقة على قبولك الطلب. إن تأخّرت، اتصل بالعميل وأخبره — انتظارٌ بلا خبر هو أكثر ما يفقدنا العملاء.`
            },
            {
                key: 'pickup_2', afterMin: n.captainPickup2,
                title: 'الطلب ما زال بانتظار الاستلام',
                message: `مرّ ${n.captainPickup2} دقيقة ولم تستلم الطرد بعد. إن حدث ما يمنعك، تواصل مع العميل أو مع الإدارة لإعادة إسناد الطلب.`
            }
        ],
        picked_up: [
            {
                key: 'deliver_1', afterMin: n.captainDeliver1,
                title: 'هل حصل شيء في الطريق؟',
                message: `مرّ ${n.captainDeliver1} دقيقة على استلامك الطرد. لو تأخّرت لزحام أو عطل، اتصل بالعميل — رسالة قصيرة تكفي لطمأنته.`
            },
            {
                key: 'deliver_2', afterMin: n.captainDeliver2,
                title: 'التوصيل استغرق وقتاً طويلاً',
                message: `مرّ ${n.captainDeliver2} دقيقة على استلام الطرد ولم يُسجَّل التسليم. إن كنت قد سلّمته فعلاً، اضغط "تم التسليم" في المهمة. وإن واجهتك مشكلة، تواصل مع الإدارة.`
            }
        ]
    });

    const NUDGE_CITIES = ['Khartoum', 'PortSudan'];

    /** يحمّل عتبات كل المدن مرة واحدة لكل دورة مجدول */
    async function loadNudgeSettings() {
        const Settings = require('./models/Settings');
        const map = new Map();
        for (const city of NUDGE_CITIES) {
            try {
                map.set(city, await Settings.getNudgeSettings(city));
            } catch (err) {
                logger.warn({ err: err?.message, city }, 'Nudge settings load failed — using defaults');
                map.set(city, { ...Settings.NUDGE_DEFAULTS });
            }
        }
        // مدينة غير معروفة على وثيقة قديمة ⇒ إعدادات الخرطوم
        return (city) => map.get(city) || map.get('Khartoum');
    }

    cron.schedule('*/5 * * * *', async () => {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) return;
        try {
            const now = Date.now();
            const nudgeFor = await loadNudgeSettings();

            // أضيق عتبة عبر كل المدن — نجلب المرشّحين بها ثم يُطبَّق على كل
            // طلب سقفُ مدينته. استعلام واحد بدل استعلام لكل مدينة ولكل عتبة.
            const minThreshold = Math.min(
                ...NUDGE_CITIES.map(c => nudgeFor(c).clientDelay1)
            );

            const candidates = await Order.find({
                status: 'pending',
                captain: null,
                createdAt: { $lte: new Date(now - minThreshold * 60 * 1000) }
            })
                .select('_id client city createdAt delayNoticesSent')
                .limit(300)
                .lean();

            for (const order of candidates) {
                if (!order.client) continue;
                const cityNudges = nudgeFor(order.city);
                if (!cityNudges.enabled) continue;

                const ageMin = (now - new Date(order.createdAt).getTime()) / 60000;
                const plan = planNudge(
                    nudgeConfigFor(cityNudges).clientDelay,
                    ageMin,
                    normalizeSentKeys(order.delayNoticesSent)
                );
                if (!plan) continue;

                const notice = plan.fire;
                // 🔒 المطالبة الذرّية أولاً: تضمن إشعاراً واحداً حتى لو
                // شُغّلت نسختان من الخادم في وقت واحد. والعتبات الأدنى
                // تُستهلك معها فلا تنطلق بأثر رجعي في الدورة نفسها.
                const claimed = await Order.updateOne(
                    { _id: order._id, delayNoticesSent: { $ne: notice.key } },
                    { $addToSet: { delayNoticesSent: { $each: [notice.key, ...plan.consume] } } }
                );
                if (!claimed.modifiedCount) continue;

                try {
                    const { sendNotification } = require('./utils/notificationHelper');
                    await sendNotification(app, {
                        userId: order.client,
                        title: notice.title,
                        message: notice.message,
                        type: 'order_delayed',
                        relatedId: order._id
                    });
                    logger.info(
                        { orderId: order._id, threshold: notice.afterMin },
                        'Delay notice sent to client'
                    );
                } catch (nErr) {
                    logger.warn(
                        { err: nErr?.message, orderId: order._id, threshold: notice.afterMin },
                        'Delay notice failed'
                    );
                }
            }
        } catch (error) {
            logger.error({ err: error }, 'Scheduler error in delay notices');
        }
    });

    // ════════════════════════════════════════════════════════════
    // 🏍️ تنبيهات الكابتن — الحالات التي يصمت فيها النظام اليوم
    // ════════════════════════════════════════════════════════════
    // المبدأ: لا نراقب الكابتن، بل نلتقط اللحظات التي يخسر فيها العميل
    // ثقته والكابتن لا يدري. كل تنبيه يقترح فعلاً محدّداً (اتصل، فعّل
    // الموقع، سدّد) لا لوماً — التنبيه الذي لا يقترح فعلاً إزعاج.
    //
    // كل مفتاح يُرسل مرة واحدة لكل طلب: captainNudges يمنع التكرار
    // مهما مرّ المجدول على المهمة نفسها.
    // العتبات والنصوص تُبنى من إعدادات المدينة — انظر nudgeConfigFor أعلاه.
    // المراحل المرتبطة بحالة الطلب: 'accepted' يقاس من acceptedAt،
    // و'picked_up' من pickedUpAt.
    const NUDGE_STAGES = ['accepted', 'picked_up'];

    // 🛡️ سقف عمري لكل تنبيه. بدونه يُطلق أول تشغيل بعد النشر موجةَ تنبيهات
    // عن كل مهمة ورسالة قديمة في قاعدة البيانات دفعةً واحدة — والتنبيه عن
    // رسالة عمرها أسبوعان بلا فائدة أصلاً.
    const NUDGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

    cron.schedule('*/5 * * * *', async () => {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) return;

        const { sendNotification } = require('./utils/notificationHelper');

        /**
         * يطالب بالمفتاح ذرياً ثم يرسل — تنبيه واحد حتى مع تعدّد نسخ الخادم.
         * consume: مفاتيح إضافية تُعلَّم مستهلَكة مع هذا المفتاح، كي لا تنطلق
         * العتبات الأدنى في الدورة نفسها فيتلقّى الكابتن رسالتين متناقضتين.
         */
        async function nudgeOnce(order, key, payload, consume = []) {
            const claimed = await Order.updateOne(
                { _id: order._id, captainNudges: { $ne: key } },
                { $addToSet: { captainNudges: { $each: [key, ...consume] } } }
            );
            if (!claimed.modifiedCount) return false;
            try {
                await sendNotification(app, {
                    userId: order.captain,
                    relatedId: order._id,
                    ...payload
                });
                logger.info({ orderId: order._id, key }, 'Captain nudge sent');
                return true;
            } catch (err) {
                logger.warn({ err: err?.message, orderId: order._id, key }, 'Captain nudge failed');
                return false;
            }
        }

        const nudgeFor = await loadNudgeSettings();

        // ── ١. تأخّر الاستلام والتسليم ──────────────────────────
        try {
            const now = Date.now();

            for (const stage of NUDGE_STAGES) {
                const stampField = stage === 'accepted' ? 'acceptedAt' : 'pickedUpAt';

                // أضيق عتبة عبر المدن لجلب المرشّحين، ثم يُطبَّق سقف كل مدينة
                const minAfter = Math.min(
                    ...NUDGE_CITIES.map(c => {
                        const list = nudgeConfigFor(nudgeFor(c))[stage];
                        return Math.min(...list.map(n => n.afterMin));
                    })
                );

                const due = await Order.find({
                    status: stage,
                    captain: { $ne: null },
                    [stampField]: {
                        $ne: null,
                        $lte: new Date(now - minAfter * 60 * 1000),
                        $gte: new Date(now - NUDGE_MAX_AGE_MS)
                    }
                })
                    .select(`_id captain city captainNudges ${stampField}`)
                    .limit(300)
                    .lean();

                for (const order of due) {
                    if (!order.captain) continue;
                    const cityNudges = nudgeFor(order.city);
                    if (!cityNudges.enabled) continue;

                    const stamp = order[stampField];
                    if (!stamp) continue;
                    const ageMin = (now - new Date(stamp).getTime()) / 60000;

                    const plan = planNudge(
                        nudgeConfigFor(cityNudges)[stage],
                        ageMin,
                        normalizeSentKeys(order.captainNudges)
                    );
                    if (!plan) continue;

                    await nudgeOnce(order, plan.fire.key, {
                        title: plan.fire.title,
                        message: plan.fire.message,
                        type: 'order_update'
                    }, plan.consume);
                }
            }
        } catch (error) {
            logger.error({ err: error }, 'Scheduler error in captain delay nudges');
        }

        // ── ٢. تتبّع متوقّف أثناء مهمة نشطة ────────────────────
        // العميل يرى مؤشّر الكابتن جامداً على الخريطة ويظنّه متوقّفاً أو
        // مهملاً. السبب الغالب إذنُ موقعٍ سُحب أو التطبيق أُغلق في الخلفية.
        try {
            // لا ترشيح زمني في الاستعلام: نافذة التقادم تُقيَّم لكل طلب
            // بحسب مدينته أدناه، والمهام النشطة قليلة أصلاً.
            const active = await Order.find({
                status: { $in: ['accepted', 'picked_up'] },
                captain: { $ne: null },
                captainNudges: { $ne: 'gps_stale' }
            })
                .select('_id captain city')
                .limit(300)
                .lean();

            if (active.length) {
                const captainIds = [...new Set(active.map(o => String(o.captain)))];
                const captains = await User.find({ _id: { $in: captainIds } })
                    .select('currentLocation.updatedAt')
                    .lean();
                const lastSeen = new Map(
                    captains.map(c => [String(c._id), c.currentLocation?.updatedAt || null])
                );

                for (const order of active) {
                    const cityNudges = nudgeFor(order.city);
                    if (!cityNudges.enabled) continue;

                    const seen = lastSeen.get(String(order.captain));
                    const cityCutoff = new Date(Date.now() - cityNudges.gpsStale * 60 * 1000);
                    if (seen && new Date(seen) >= cityCutoff) continue;
                    await nudgeOnce(order, 'gps_stale', {
                        title: 'تتبّع موقعك متوقّف',
                        message: 'العميل يتابع رحلتك على الخريطة ولا يرى تحرّكك. افتح التطبيق وتأكّد أن إذن الموقع مفعّل.',
                        type: 'order_update'
                    });
                }
            }
        } catch (error) {
            logger.error({ err: error }, 'Scheduler error in GPS stale nudges');
        }

        // ── ٣. رسالة عميل بلا قراءة ────────────────────────────
        try {
            const Message = require('./models/Message');
            // ⚠️ أضيق نافذة للجلب لا أوسعها: النافذة الواسعة تُقصي رسالةً
            // استحقّت التذكير في مدينةٍ نافذتها أضيق، لأن createdAt يكون
            // أحدث من عتبة الجلب فلا تظهر في النتيجة أصلاً.
            const minUnread = Math.min(...NUDGE_CITIES.map(c => nudgeFor(c).chatUnread));
            const cutoff = new Date(Date.now() - minUnread * 60 * 1000);

            const waiting = await Message.find({
                isRead: false,
                nudgedAt: null,
                createdAt: { $lte: cutoff, $gte: new Date(Date.now() - NUDGE_MAX_AGE_MS) }
            })
                .select('_id sender receiver order createdAt')
                .limit(300)
                .lean();

            for (const msg of waiting) {
                // نُذكّر الكابتن وحده: العميل ينتظر ردّاً، والكابتن هو من
                // يملك الإجابة. الطلب المنتهي لا يستحق تذكيراً.
                const order = await Order.findOne({
                    _id: msg.order,
                    status: { $in: ['pending', 'accepted', 'picked_up'] }
                }).select('_id city').lean();
                if (!order) continue;

                const cityNudges = nudgeFor(order.city);
                if (!cityNudges.enabled) continue;

                // ⏳ الفحص قبل المطالبة: المطالبة تضبط nudgedAt نهائياً، فلو
                // سبقت الفحص لأُهدر تذكير رسالةٍ لم تبلغ نافذة مدينتها بعد.
                const ageMin = (Date.now() - new Date(msg.createdAt).getTime()) / 60000;
                if (ageMin < cityNudges.chatUnread) continue;

                const receiver = await User.findById(msg.receiver).select('role').lean();
                if (!receiver || receiver.role !== 'captain') continue;

                // المطالبة الذرّية أخيراً — أي فشل بعدها لا يُعيد المحاولة للأبد
                const claimed = await Message.updateOne(
                    { _id: msg._id, nudgedAt: null },
                    { $set: { nudgedAt: new Date() } }
                );
                if (!claimed.modifiedCount) continue;

                try {
                    await sendNotification(app, {
                        userId: msg.receiver,
                        title: 'العميل بانتظار ردّك',
                        message: 'وصلتك رسالة من العميل ولم تُقرأ بعد. ردٌّ سريع يمنع إلغاء الطلب.',
                        type: 'chat_message',
                        relatedId: msg.order
                    });
                } catch (err) {
                    logger.warn({ err: err?.message, messageId: msg._id }, 'Chat nudge failed');
                }
            }
        } catch (error) {
            logger.error({ err: error }, 'Scheduler error in unread chat nudges');
        }

        // ── ٤. اقتراب الحد الائتماني ───────────────────────────
        // كان الكابتن يُنبَّه لحظة الحجب فقط — أي بعد أن يتوقّف دخله.
        // التحذير عند ٨٠٪ يمنحه فرصة السداد قبل أن يفقد يوم عمل.
        try {
            const captains = await User.find({
                role: 'captain',
                isActive: true,
                is_blocked: false,
                wallet_balance: { $lt: 0 }
            })
                .select('wallet_balance credit_limit creditWarnedAt city')
                .limit(500)
                .lean();

            for (const cap of captains) {
                const cityNudges = nudgeFor(cap.city);
                if (!cityNudges.enabled) continue;

                const limit = cap.credit_limit ?? -5000;
                if (!limit) continue;
                const usedPct = Math.min(100, Math.max(0, (cap.wallet_balance / limit) * 100));

                // تعافى الرصيد ⇒ صفّر التحذير كي يعمل في الدورة التالية
                if (usedPct < cityNudges.creditResetPct) {
                    if (cap.creditWarnedAt) {
                        await User.updateOne({ _id: cap._id }, { $set: { creditWarnedAt: null } });
                    }
                    continue;
                }
                if (usedPct < cityNudges.creditWarnPct || cap.creditWarnedAt) continue;

                const claimed = await User.updateOne(
                    { _id: cap._id, creditWarnedAt: null },
                    { $set: { creditWarnedAt: new Date() } }
                );
                if (!claimed.modifiedCount) continue;

                const remaining = Math.max(0, Math.abs(limit) - Math.abs(cap.wallet_balance));
                try {
                    await sendNotification(app, {
                        userId: cap._id,
                        title: 'اقتربت من الحد الائتماني',
                        message: `مديونيتك بلغت ${Math.round(usedPct)}٪ من حدّك. تبقّى ${Math.round(remaining)} ج.س قبل إيقاف الحساب — سدّد الآن لتواصل العمل بلا انقطاع.`,
                        type: 'wallet_update'
                        // بلا relatedId: الحقل يشير إلى Order في المخطّط، ووجهة
                        // النقر (captain-wallet.html) لا تستخدمه أصلاً
                    });
                    logger.info({ captainId: cap._id, usedPct: Math.round(usedPct) }, 'Credit limit warning sent');
                } catch (err) {
                    logger.warn({ err: err?.message, captainId: cap._id }, 'Credit warning failed');
                }
            }
        } catch (error) {
            logger.error({ err: error }, 'Scheduler error in credit limit warnings');
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

    // 📣 شبكة أمان لتوزيع الطلبات — كل دقيقة.
    // الموجة 2 (بثّ الطلب لكل الكباتن) تُطلق عبر مؤقّت في ذاكرة العملية؛ لو أُعيد
    // تشغيل السيرفر خلال نافذته يُفقَد المؤقّت فلا يصل الإشعار لبقية الكباتن.
    // هنا نلتقط أي طلب معلّق غير مُسنَد مضى عليه >90ث ولم يُبَثّ للكل، فنبثّه ونعلّمه.
    cron.schedule('* * * * *', async () => {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) return;
        try {
            const cutoff = new Date(Date.now() - 90 * 1000); // مهلة كافية لمؤقّت الموجة 2 الطبيعي
            const stale = await Order.find({
                status: 'pending',
                captain: null,
                dispatchedAllAt: null,
                scheduledAt: null,
                createdAt: { $lt: cutoff }
            }).select('_id city orderType shopName price').limit(50);

            if (!stale.length) return;

            const { sendPushToMany } = require('./utils/firebasePush');
            for (const order of stale) {
                try {
                    const captains = await User.find({
                        role: 'captain', city: order.city,
                        fcmToken: { $exists: true, $ne: null }, isActive: true
                    }).select('fcmToken');
                    const tokens = [...new Set(captains.map(c => c.fcmToken).filter(Boolean))];

                    // علّم البثّ أولاً (ذري) لمنع تكرار الإطلاق لو تأخّر الإرسال
                    await Order.updateOne({ _id: order._id }, { $set: { dispatchedAllAt: new Date() } });

                    if (tokens.length) {
                        const title = order.orderType === 'shop' ? '🛒 طلب محل جديد! 🚨' : '📦 طلب توصيل جديد! 🚨';
                        const bodyMsg = order.orderType === 'shop'
                            ? `طلب من ${order.shopName || 'محل'} بسعر ${order.price} ج.س. عرض التفاصيل!`
                            : `طلب توصيل جديد متاح بسعر ${order.price} ج.س! عرض التفاصيل`;
                        await sendPushToMany(tokens, title, bodyMsg, {
                            type: order.orderType === 'shop' ? 'shop_order' : 'new_order',
                            orderId: order._id.toString(),
                            url: `/captain-orders.html?highlight=${order._id.toString()}`
                        });
                        logger.info({ orderId: order._id, city: order.city, targeted: tokens.length }, 'Dispatch safety-net: broadcast to all city captains');
                    }
                } catch (oneErr) {
                    logger.error({ err: oneErr, orderId: order._id }, 'Dispatch safety-net failed for order');
                }
            }
        } catch (error) {
            logger.error({ err: error }, 'Dispatch safety-net scheduler error');
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
            const totalRev   = ordersToday.filter(o => o.status === 'delivered').reduce((s, o) => s + (o.appFee ?? 0), 0);

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
                    title: 'التقرير اليومي',
                    message: `الطلبات: ${ordersToday.length} | مكتملة: ${delivered} | الإيرادات: ${totalRev.toFixed(0)} ج.س`,
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

    // ====================================================
    // 🧹 حذف صور الدردشة بعد 48 ساعة (كل ساعة عند الدقيقة 15)
    //
    // لماذا: صور المحادثات تتراكم بلا سقف على قرص الاستضافة، ومعظمها لقطة عنوان
    // أو إشعار دفع لا قيمة لها بعد تسليم الطلب. وحذفها تقليلٌ حقيقي لما نحتفظ به
    // من بيانات المستخدمين (وهو ما تصرّح به سياسة الخصوصية).
    //
    // نحذف الملف من القرص ونمسح imageUrl، ونضع imageExpiredAt فتعرض الواجهة
    // "انتهت صلاحية الصورة" بدل صورة مكسورة — والرسالة نفسها تبقى فلا ينقطع
    // سياق المحادثة عند المراجعة أو حسم شكوى.
    // ====================================================
    cron.schedule('15 * * * *', async () => {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) return;
        try {
            const Message = require('./models/Message');
            const { CHAT_IMAGE_TTL_MS, CHAT_IMAGE_TTL_HOURS } = require('./utils/chatImage');
            const { safeUnlink } = require('./utils/imageUpload');
            const path = require('path');

            const cutoff = new Date(Date.now() - CHAT_IMAGE_TTL_MS);
            const stale = await Message.find({
                imageUrl: { $ne: null },
                createdAt: { $lt: cutoff }
            }).select('_id imageUrl').limit(500).lean();

            if (stale.length === 0) return;

            const UPLOADS = path.join(__dirname, 'public_html');
            let removed = 0;
            for (const msg of stale) {
                // imageUrl مثل /uploads/chat/xxx.jpg — تحقّق أخير من المجلد قبل أي حذف
                if (!/^\/uploads\/chat\//.test(msg.imageUrl)) continue;
                await safeUnlink(path.join(UPLOADS, msg.imageUrl));
                removed++;
            }

            await Message.updateMany(
                { _id: { $in: stale.map(m => m._id) } },
                { $set: { imageUrl: null, imageExpiredAt: new Date() } }
            );

            logger.info({ removed, ttlHours: CHAT_IMAGE_TTL_HOURS }, 'Expired chat images deleted');
        } catch (err) {
            logger.error({ err }, 'Scheduler error in chat image cleanup');
        }
    });

    // ====================================================
    // 🧹 كنس الصور اليتيمة في uploads/chat (كل ساعة عند الدقيقة 40)
    //
    // لماذا مهمة ثانية: الصورة تُرفع قبل إنشاء الرسالة (لتفادي إرسال base64 في
    // السوكيت). فإن فشل الإرسال بعد الرفع — انقطاع شبكة، إغلاق التطبيق، طلب
    // انتهى فرُفض الإرسال — يبقى الملف على القرص ولا رسالة تشير إليه، والمهمة
    // أعلاه تبحث عبر الرسائل فقط فلا تراه أبداً. النتيجة: تسريب مساحة دائم.
    //
    // نحذف بعمر الملف نفسه (mtime) لا بمراجع قاعدة البيانات، فيغطي الحالتين.
    // ====================================================
    cron.schedule('40 * * * *', async () => {
        try {
            const fs = require('fs');
            const path = require('path');
            const { CHAT_IMAGE_TTL_MS } = require('./utils/chatImage');
            const { safeUnlink } = require('./utils/imageUpload');

            const dir = path.join(__dirname, 'public_html', 'uploads', 'chat');
            if (!fs.existsSync(dir)) return;

            const cutoff = Date.now() - CHAT_IMAGE_TTL_MS;
            const names = await fs.promises.readdir(dir);
            let swept = 0;

            for (const name of names) {
                const full = path.join(dir, name);
                try {
                    const st = await fs.promises.stat(full);
                    if (!st.isFile() || st.mtimeMs >= cutoff) continue;
                    await safeUnlink(full);
                    swept++;
                } catch (_) { /* ملف اختفى بين readdir وstat — لا يهم */ }
            }

            if (swept > 0) logger.info({ swept }, 'Swept old chat image files from disk');
        } catch (err) {
            logger.error({ err }, 'Scheduler error in chat image sweep');
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
