const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const validateObjectId = require('../../middleware/validateObjectId');
const Order = require('../../models/Order');
const Settings = require('../../models/Settings');
const {
    protect, requireAnyPermission, getAdminCityFilter, adminCoversCity, VALID_CITIES
} = require('../../middleware/authMiddleware');
const { sendNotification } = require('../../utils/notificationHelper');
const { logAdminAction } = require('../../utils/adminLogger');
const logger = require('../../utils/logger');
const T = require('../../utils/tripTracking');

/**
 * 🛰️ لوحة التتبّع — كل رحلةٍ جارية: أين وصلت، ومنذ متى، وهل هذا طبيعيّ.
 *
 * الخريطة الحيّة تُظهر **مواقع** الكباتن. هذه تُظهر **الرحلات**: هل استلم
 * الكابتن من المحل؟ هل وصل الطلب العميل؟ كم تأخّر؟ ومن هنا يُنبَّه المتأخّر.
 *
 * والتأخّر بعتبات المدينة نفسها التي يُنبّه بها المُجدوِل آلياً — انظر
 * utils/tripTracking.js. مصدرٌ واحد للحكم.
 */

router.param('id', validateObjectId);

const CAN_VIEW = requireAnyPermission(['view_map', 'view_orders']);
// التنبيه عملٌ تشغيليّ على طلبٍ جارٍ — من يرى الرحلة يستطيع تنبيه صاحبها
const CAN_NUDGE = requireAnyPermission(['view_map', 'view_orders', 'send_notifications']);

const RECENT_DEFAULT_MIN = 180;
const RECENT_MAX_MIN = 720;

const ORDER_FIELDS = '_id status city orderType price createdAt acceptedAt pickedUpAt deliveredAt ' +
    'pickup.address pickup.contactName dropoff.address dropoff.receiverName isMultiStop stops.done stops.doneAt ' +
    'captain client adminNudges captainAssignedAt proofOfPickupImage errand.receiptImage deliveryProof';
const CAPTAIN_FIELDS = 'name phone vehicleType currentLocation documents.profilePhoto';
const CLIENT_FIELDS = 'name phone';

/** عتبات كل مدينة مرّة واحدة لكل طلب — لا استعلام لكل بطاقة */
async function nudgeMap(cities) {
    const map = {};
    for (const c of cities) {
        try { map[c] = await Settings.getNudgeSettings(c); }
        catch (e) { map[c] = { ...Settings.NUDGE_DEFAULTS }; }
    }
    return map;
}

// ─── GET /api/admin/tracking ─────────────────────────────────────────────
router.get('/tracking', protect, CAN_VIEW, async (req, res) => {
    try {
        const now = new Date();
        const scope = getAdminCityFilter(req);
        const recentMin = Math.min(RECENT_MAX_MIN,
            Math.max(10, parseInt(req.query.recent, 10) || RECENT_DEFAULT_MIN));

        const [active, delivered] = await Promise.all([
            // الكباتن الذين يحملون طلباً الآن — لا كل الكباتن، ولا طلبات لم
            // يقبلها أحد بعد: اللوحة لمتابعة من في الطريق
            Order.find({ ...scope, status: { $in: ['accepted', 'picked_up'] }, captain: { $ne: null } })
                .select(ORDER_FIELDS)
                .populate('captain', CAPTAIN_FIELDS)
                .populate('client', CLIENT_FIELDS)
                .sort({ createdAt: 1 })
                .limit(300)
                .lean(),
            // «هل استلم العميل؟» — المُسلَّمة حديثاً تبقى ظاهرة بأيقونتها
            Order.find({ ...scope, status: 'delivered', captain: { $ne: null }, deliveredAt: { $gte: new Date(now - recentMin * 60000) } })
                .select(ORDER_FIELDS)
                .populate('captain', CAPTAIN_FIELDS)
                .populate('client', CLIENT_FIELDS)
                .sort({ deliveredAt: -1 })
                .limit(100)
                .lean()
        ]);

        const all = active.concat(delivered);
        const nudges = await nudgeMap([...new Set(all.map(o => o.city || 'Khartoum').concat(VALID_CITIES))]);
        const trips = all.map(o => T.buildTrip(o, nudges[o.city] || nudges.Khartoum, now)).sort(T.compareTrips);

        const count = (pred) => trips.filter(pred).length;
        const running = (t) => t.stage !== 'delivered';
        res.json({
            now,
            recentMin,
            thresholds: nudges,
            summary: {
                // كباتن يحملون طلباً الآن (قد يحمل كابتنٌ أكثر من طلب)
                carrying: new Set(trips.filter(running).map(t => t.captain.id)).size,
                active: count(running),
                toPickup: count(t => t.stage === 'to_pickup'),
                toDropoff: count(t => t.stage === 'to_dropoff'),
                delivered: count(t => t.stage === 'delivered'),
                late: count(t => running(t) && t.late.level === 'late'),
                warn: count(t => running(t) && t.late.level === 'warn'),
                gpsStale: count(t => running(t) && t.captain.gps.state === 'stale'),
                // واقفٌ بعيداً عن وجهته — الوقت وحده لا يكشفه
                stopped: count(t => t.motion && t.motion.state === 'stopped'),
                // إثباتٌ يستحقّ نظرة: مُستلَمٌ بلا صورة، أو تسليمٌ أُعلن بعيداً أو بلا موقع
                suspicious: count(t => t.proof.suspicious)
            },
            // نصف قطر قبول التسليم لكل مدينة — لتقول الشارة «ضمن 500 م»
            deliveryRadius: Object.fromEntries(await Promise.all(VALID_CITIES.map(async c => {
                try { const s = await Settings.getSettings(c); return [c, s.deliveryProofRadiusMeters ?? 500]; }
                catch (e) { return [c, 500]; }
            }))),
            templates: T.NUDGE_TEMPLATES,
            trips
        });
    } catch (err) {
        logger.error({ err: err.message }, '[admin/tracking] load failed');
        res.status(500).json({ message: 'تعذّر تحميل لوحة التتبّع' });
    }
});

// ─── POST /api/admin/tracking/:id/notify ─────────────────────────────────
const nudgeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req) => String(req.user && req.user._id),
    validate: { xForwardedForHeader: false, trustProxy: false, ip: false },
    message: { message: 'تنبيهاتٌ كثيرة في دقيقة واحدة — انتظر قليلاً' }
});

router.post('/tracking/:id/notify', protect, CAN_NUDGE, nudgeLimiter, async (req, res) => {
    try {
        const { to, template, message } = req.body || {};
        const order = await Order.findById(req.params.id)
            .select(ORDER_FIELDS)
            .populate('captain', CAPTAIN_FIELDS)
            .populate('client', CLIENT_FIELDS)
            .lean();
        if (!order) return res.status(404).json({ message: 'الطلب غير موجود' });

        // 🌍 الأدمن المساعد لا يُنبّه على طلبٍ خارج مدنه — ولو عرف معرّفه
        if (!adminCoversCity(req.user, order.city || 'Khartoum')) {
            return res.status(403).json({ message: 'هذا الطلب خارج نطاق مدينتك' });
        }

        const nudges = await Settings.getNudgeSettings(order.city || 'Khartoum');
        const trip = T.buildTrip(order, nudges, new Date());
        const built = T.buildNudge({ to, template, message }, trip);
        if (!built.ok) return res.status(400).json({ message: built.error });

        // لا يُكرَّر لنفس المستلم على نفس الطلب في دقيقتين — ضغطتان متتاليتان
        // أو أدمنان في آنٍ واحد لا تُمطران الكابتن بإشعارين متطابقين
        // تنبيهات الكابتن السابق (قبل نقل الطلب) لا تمنع تنبيه الحاليّ
        const wait = T.cooldownLeft(T.currentNudges(order), to);
        if (wait > 0) {
            return res.status(429).json({ message: `نُبِّه للتوّ — انتظر ${wait} ثانية قبل إعادة التنبيه`, retryAfter: wait });
        }

        const recipient = to === 'captain' ? trip.captain : trip.client;
        await sendNotification(req.app, {
            userId: recipient.id,
            title: built.title,
            message: built.message,
            type: 'admin_nudge',
            relatedId: order._id
        });

        const entry = {
            at: new Date(), by: req.user._id, byName: req.user.name || '',
            to, template: built.template, message: built.message
        };
        await Order.updateOne({ _id: order._id }, { $push: { adminNudges: { $each: [entry], $slice: -20 } } });

        await logAdminAction(req, 'nudge_user',
            `نبّه ${to === 'captain' ? 'الكابتن' : 'العميل'} ${recipient.name} على الطلب #${trip.ref}: ${built.title}`,
            String(order._id), recipient.name,
            { orderId: String(order._id), to, template: built.template, stage: trip.stage, lateBy: trip.late.lateBy }
        );

        res.json({ ok: true, sentTo: recipient.name, nudge: { at: entry.at, to, template: built.template } });
    } catch (err) {
        logger.error({ err: err.message }, '[admin/tracking] notify failed');
        res.status(500).json({ message: 'تعذّر إرسال التنبيه' });
    }
});

module.exports = router;
