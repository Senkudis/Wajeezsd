/**
 * 🛰️ لوحة التتبّع — منطقٌ خالص بلا قاعدة ولا شبكة، ليُختبر كما هو.
 *
 * ما تحتاجه الإدارة من رحلةٍ جارية جملةٌ واحدة: أين وصلت، ومنذ متى، وهل
 * هذا طبيعيّ. فكل رحلةٍ تُختصر هنا إلى:
 *
 *   stage     مرحلتها: بانتظار كابتن ← في الطريق للاستلام ← استلم وفي الطريق
 *             للعميل ← سُلِّمت
 *   steps     المراحل الأربع بتوقيت كلٍّ منها — شريط الأيقونات في البطاقة
 *   late      مستوى التأخّر (ok / warn / late) ومقداره بالدقائق
 *   gps       حداثة موقع الكابتن
 *
 * ⚠️ التأخّر بعتبات المدينة نفسها التي يُنبّه بها المُجدوِل آلياً
 *    (Settings.nudges: captainPickup1/2، captainDeliver1/2، gpsStale،
 *    clientDelay1/2). لو عرّفت اللوحة «التأخّر» بأرقامٍ ثانية لرأت الإدارة
 *    رحلةً «في الوقت» بينما وصل الكابتن تنبيهٌ آليّ بأنه متأخّر — أو العكس.
 *    مصدرٌ واحد للحكم.
 */

const MIN = 60 * 1000;

/** دقائق صحيحة بين طابعين — null إن غاب أحدهما */
function minutesBetween(from, to) {
    if (!from || !to) return null;
    const ms = new Date(to).getTime() - new Date(from).getTime();
    return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / MIN)) : null;
}

const STAGES = {
    pending:   { key: 'waiting',    label: 'بانتظار كابتن' },
    scheduled: { key: 'waiting',    label: 'مجدول' },
    accepted:  { key: 'to_pickup',  label: 'في الطريق للاستلام' },
    picked_up: { key: 'to_dropoff', label: 'استلم — في الطريق للعميل' },
    delivered: { key: 'delivered',  label: 'سُلِّم للعميل' },
    cancelled: { key: 'cancelled',  label: 'ملغى' }
};

/**
 * المرحلة الجارية ومن أيّ طابعٍ تُقاس.
 * بانتظار كابتن: من الإنشاء. في الطريق للاستلام: من القبول. استلم: من
 * الاستلام. سُلِّم: لا تُقاس — انتهت.
 */
function stageOf(order) {
    const s = STAGES[order.status] || STAGES.pending;
    const since =
        s.key === 'waiting'    ? order.createdAt :
        s.key === 'to_pickup'  ? (order.acceptedAt || order.createdAt) :
        s.key === 'to_dropoff' ? (order.pickedUpAt || order.acceptedAt) :
        s.key === 'delivered'  ? order.deliveredAt : null;
    return { ...s, since: since || null };
}

/**
 * شريط المراحل الأربع. لكلٍّ: تمّت؟ جارية؟ ومتى.
 * الترتيب ثابت ليُرسم بلا منطقٍ في الواجهة.
 */
function stepsOf(order) {
    const st = order.status;
    const reached = {
        accepted:  ['accepted', 'picked_up', 'delivered'].includes(st),
        picked_up: ['picked_up', 'delivered'].includes(st),
        delivered: st === 'delivered'
    };
    return [
        { key: 'accepted',  label: 'قَبِل الكابتن',     done: reached.accepted,  current: st === 'pending' || st === 'scheduled', at: order.acceptedAt || null },
        { key: 'picked_up', label: 'استلم الطلب',       done: reached.picked_up, current: st === 'accepted',  at: order.pickedUpAt || null },
        { key: 'on_way',    label: 'في الطريق للعميل',  done: reached.delivered, current: st === 'picked_up', at: order.pickedUpAt || null },
        { key: 'delivered', label: 'استلم العميل',      done: reached.delivered, current: false,              at: order.deliveredAt || null }
    ];
}

/**
 * مستوى التأخّر بعتبات المدينة.
 *   ok    قبل العتبة الأولى
 *   warn  تجاوز الأولى — وقتُ السؤال
 *   late  تجاوز الثانية — وقتُ التدخّل
 * lateBy: الدقائق بعد العتبة الأولى (ما يُقال «متأخّر بـ… دقيقة»).
 */
function latenessOf(order, nudges, now = new Date()) {
    const stage = stageOf(order);
    const n = nudges || {};
    const limits =
        stage.key === 'waiting'    ? [n.clientDelay1, n.clientDelay2] :
        stage.key === 'to_pickup'  ? [n.captainPickup1, n.captainPickup2] :
        stage.key === 'to_dropoff' ? [n.captainDeliver1, n.captainDeliver2] : null;

    const elapsed = minutesBetween(stage.since, now);
    if (!limits || elapsed === null) return { level: 'ok', elapsed, lateBy: 0, warnAt: null, lateAt: null };

    const [warnAt, lateAt] = limits.map(Number);
    const level = elapsed >= lateAt ? 'late' : elapsed >= warnAt ? 'warn' : 'ok';
    return { level, elapsed, lateBy: level === 'ok' ? 0 : elapsed - warnAt, warnAt, lateAt };
}

/**
 * حداثة موقع الكابتن.
 * fixedAt (متى قيس على الجهاز) أصدق من updatedAt (متى وصلنا): النبض يعيد
 * إرسال آخر قراءة فيبقى updatedAt طازجاً بموقعٍ عمره دقائق.
 */
function gpsOf(captain, nudges, now = new Date()) {
    const loc = captain && captain.currentLocation;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
        return { state: 'none', ageMin: null, lat: null, lng: null };
    }
    const age = minutesBetween(loc.fixedAt || loc.updatedAt, now);
    const staleAfter = Number((nudges && nudges.gpsStale) || 12);
    return {
        state: age === null ? 'unknown' : age >= staleAfter ? 'stale' : 'fresh',
        ageMin: age, lat: loc.lat, lng: loc.lng, staleAfter
    };
}

const TYPE_LABEL = { delivery: 'توصيل', shop: 'طلب متجر', errand: 'اشترِ لي' };

function short(s, n = 90) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** بطاقةٌ واحدة كما تعرضها اللوحة — لا حقل هنا لا تحتاجه الواجهة */
function buildTrip(order, nudges, now = new Date()) {
    const cap = order.captain && typeof order.captain === 'object' ? order.captain : null;
    const cli = order.client && typeof order.client === 'object' ? order.client : null;
    const stage = stageOf(order);
    const late = latenessOf(order, nudges, now);
    const stops = Array.isArray(order.stops) ? order.stops : [];
    const lastNudge = Array.isArray(order.adminNudges) && order.adminNudges.length
        ? order.adminNudges[order.adminNudges.length - 1] : null;

    return {
        id: String(order._id),
        ref: String(order._id).slice(-6).toUpperCase(),
        city: order.city || 'Khartoum',
        type: order.orderType || 'delivery',
        typeLabel: TYPE_LABEL[order.orderType] || TYPE_LABEL.delivery,
        status: order.status,
        stage: stage.key,
        stageLabel: stage.label,
        stageSince: stage.since,
        steps: stepsOf(order),
        late,
        price: order.price || 0,
        createdAt: order.createdAt || null,
        totalMin: minutesBetween(order.acceptedAt || order.createdAt, order.deliveredAt || now),
        pickup: {
            address: short(order.pickup && order.pickup.address),
            name: short(order.pickup && order.pickup.contactName, 40)
        },
        dropoff: {
            address: short(order.dropoff && order.dropoff.address),
            name: short(order.dropoff && order.dropoff.receiverName, 40)
        },
        stops: (order.isMultiStop && stops.length)
            ? { total: stops.length, done: stops.filter(s => s.done || s.doneAt).length } : null,
        captain: cap ? {
            id: String(cap._id),
            name: cap.name || 'كابتن',
            phone: cap.phone || '',
            vehicleType: cap.vehicleType || '',
            photo: (cap.documents && cap.documents.profilePhoto) || null,
            gps: gpsOf(cap, nudges, now)
        } : null,
        client: cli ? { id: String(cli._id), name: cli.name || 'عميل', phone: cli.phone || '' } : null,
        lastNudge: lastNudge ? {
            at: lastNudge.at, to: lastNudge.to, byName: lastNudge.byName || '',
            agoMin: minutesBetween(lastNudge.at, now)
        } : null
    };
}

/** الأخطر أولاً: متأخّر ← قارب ← في الوقت، ثم الأطول انتظاراً، والمُسلَّمة آخراً */
function compareTrips(a, b) {
    const rank = t => t.stage === 'delivered' ? 3 : ({ late: 0, warn: 1, ok: 2 })[t.late.level];
    const r = rank(a) - rank(b);
    if (r) return r;
    if (a.stage === 'delivered') {
        return new Date(b.stageSince || 0) - new Date(a.stageSince || 0);   // الأحدث تسليماً أولاً
    }
    return (b.late.elapsed || 0) - (a.late.elapsed || 0);
}

// ─── الإشعار من اللوحة ─────────────────────────────────────────────────
//
// نصوصٌ جاهزة لأشيع الحالات — الأدمن يضغط ولا يكتب. والنصّ يُبنى في الخادم
// لا في المتصفّح: ما يصل الكابتن هو ما في هذه القائمة، لا ما يُرسله أيّ طلب.
// والنصّ الحرّ مسموح (custom) بسقف طول.

const NUDGE_TEMPLATES = {
    captain: [
        { id: 'move_now',      title: 'تأخّرت — تحرّك الآن',          stages: ['to_pickup', 'to_dropoff'],
          message: 'تأخّرت على هذا الطلب. تحرّك الآن من فضلك، وأخبر العميل بموعد وصولك.' },
        { id: 'pickup_late',   title: 'لم تستلم الطلب بعد',            stages: ['to_pickup'],
          message: 'مرّ وقتٌ طويل على قبولك الطلب ولم تستلمه. توجّه لنقطة الاستلام الآن، وإن منعك شيء تواصل مع الإدارة لإعادة الإسناد.' },
        { id: 'deliver_late',  title: 'العميل ينتظر',                  stages: ['to_dropoff'],
          message: 'العميل ينتظر طلبه. أكمل التوصيل الآن، وإن سلّمته فعلاً فاضغط «تم التسليم» في المهمة.' },
        { id: 'call_client',   title: 'اتصل بالعميل',                  stages: ['to_pickup', 'to_dropoff'],
          message: 'من فضلك اتصل بالعميل الآن وطمئنه على طلبه وموعد وصولك.' },
        { id: 'gps_off',       title: 'موقعك لا يتحدّث',               stages: ['to_pickup', 'to_dropoff'],
          message: 'موقعك متوقّف عن التحديث. افتح التطبيق وتأكّد أن خدمة الموقع مفعّلة ليرى العميل مكانك.' },
        { id: 'confirm_delivery', title: 'سجّل التسليم',               stages: ['to_dropoff'],
          message: 'إن كنت قد سلّمت الطلب فاضغط «تم التسليم» في شاشة المهمة الآن.' }
    ],
    client: [
        { id: 'on_the_way',    title: 'الكابتن في الطريق',             stages: ['to_pickup', 'to_dropoff'],
          message: 'نتابع طلبك الآن — الكابتن في الطريق إليك. نعتذر عن التأخير.' },
        { id: 'we_follow',     title: 'نتابع طلبك',                    stages: ['to_pickup', 'to_dropoff'],
          message: 'فريق وجيز يتابع طلبك الآن وسنحرص على وصوله في أقرب وقت. شكراً لصبرك.' }
    ]
};

const CUSTOM_MAX = 300;

/**
 * يبني الإشعار من الطلب — أو يقول لماذا لا يصحّ.
 * @returns {{ok:true, title, message, template} | {ok:false, error}}
 */
function buildNudge({ to, template, message }, trip) {
    if (to !== 'captain' && to !== 'client') return { ok: false, error: 'المستلم غير صالح' };
    if (to === 'captain' && !trip.captain) return { ok: false, error: 'لا كابتن على هذا الطلب بعد' };
    if (to === 'client' && !trip.client) return { ok: false, error: 'لا عميل مرتبط بهذا الطلب' };
    if (trip.stage === 'delivered' || trip.stage === 'cancelled') return { ok: false, error: 'الطلب منتهٍ — لا داعي للتنبيه' };

    const ref = `طلب #${trip.ref}`;
    if (template === 'custom') {
        const text = String(message || '').replace(/\s+/g, ' ').trim();
        if (text.length < 3) return { ok: false, error: 'اكتب نصّ الإشعار' };
        if (text.length > CUSTOM_MAX) return { ok: false, error: `النصّ أطول من ${CUSTOM_MAX} حرفاً` };
        return { ok: true, template: 'custom', title: `رسالة من إدارة وجيز — ${ref}`, message: text };
    }
    const t = (NUDGE_TEMPLATES[to] || []).find(x => x.id === template);
    if (!t) return { ok: false, error: 'نوع الإشعار غير معروف' };
    return { ok: true, template: t.id, title: `${t.title} — ${ref}`, message: t.message };
}

/** دقائق يُمنع فيها تكرار الإشعار نفسه لنفس المستلم على نفس الطلب */
const NUDGE_COOLDOWN_MIN = 2;

function cooldownLeft(adminNudges, to, now = new Date()) {
    const last = (adminNudges || []).filter(x => x.to === to).slice(-1)[0];
    if (!last) return 0;
    const ago = (now.getTime() - new Date(last.at).getTime()) / MIN;
    return ago < NUDGE_COOLDOWN_MIN ? Math.ceil((NUDGE_COOLDOWN_MIN - ago) * 60) : 0;   // بالثواني
}

module.exports = {
    minutesBetween, stageOf, stepsOf, latenessOf, gpsOf, buildTrip, compareTrips,
    NUDGE_TEMPLATES, buildNudge, cooldownLeft, NUDGE_COOLDOWN_MIN, CUSTOM_MAX, STAGES
};
