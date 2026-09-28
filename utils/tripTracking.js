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

const { haversineKm } = require('./geofence');

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

/** أحدث الطوابع الصالحة — null إن لم يصحّ أيّها */
function latest(...dates) {
    let best = null;
    for (const d of dates) {
        if (!d) continue;
        const t = new Date(d).getTime();
        if (Number.isFinite(t) && (best === null || t > best)) best = t;
    }
    return best === null ? null : new Date(best);
}

/**
 * ⏱️ متى بدأت ساعة **الكابتن الحاليّ** في هذه المرحلة.
 *
 * القبول والاستلام طابعان على الطلب لا على الكابتن. فإن نقلت الإدارة الطلب
 * لكابتنٍ آخر، ورث الجديد ساعة القديم: «متأخّر ٣٥ د» منذ أول دقيقة، والمُجدوِل
 * يراه قد تجاوز العتبات. captainAssignedAt (يُضبط عند الإسناد اليدويّ) يبدأ
 * ساعته هو — ويبقى acceptedAt الأصليّ كما هو لإحصاءات زمن القبول.
 *
 * @param stage 'accepted' | 'picked_up' (حالة الطلب)
 * يستعمله المُجدوِل أيضاً — مصدرٌ واحد للحكم.
 */
function clockStart(order, stage) {
    if (stage === 'accepted') return latest(order.acceptedAt || order.createdAt, order.captainAssignedAt);
    if (stage === 'picked_up') return latest(order.pickedUpAt || order.acceptedAt, order.captainAssignedAt);
    return null;
}

/**
 * المرحلة الجارية ومن أيّ طابعٍ تُقاس.
 * بانتظار كابتن: من الإنشاء. في الطريق للاستلام: من القبول. استلم: من
 * الاستلام — وكلاهما من إسناد الكابتن الحاليّ إن جاء بعدهما. سُلِّم: لا
 * تُقاس — انتهت.
 */
function stageOf(order) {
    const s = STAGES[order.status] || STAGES.pending;
    const since =
        s.key === 'waiting'    ? order.createdAt :
        s.key === 'to_pickup'  ? clockStart(order, 'accepted') :
        s.key === 'to_dropoff' ? clockStart(order, 'picked_up') :
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

/** العتبات: «عند الهدف» ضمن هذا النطاق، و«متوقّف» بعد هذه الدقائق بلا حركة */
const AT_TARGET_M = 150;
const STOPPED_MIN = 10;

/**
 * 🎯 وجهة الكابتن الآن: المحلّ في الطريق للاستلام، والعميل بعده. وفي الرحلة
 * متعدّدة النقاط: أوّل محطّةٍ لم تكتمل من النوع المناسب.
 */
function targetOf(order, stageKey) {
    const kind = stageKey === 'to_pickup' ? 'pickup' : stageKey === 'to_dropoff' ? 'dropoff' : null;
    if (!kind) return null;
    const stops = Array.isArray(order.stops) ? order.stops : [];
    const next = order.isMultiStop ? stops.find(x => x.type === kind && !x.done && !x.doneAt) : null;
    const p = next || order[kind] || {};
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return { kind, lat: null, lng: null };
    return { kind, lat: p.lat, lng: p.lng };
}

/**
 * 🧭 هل الكابتن يتحرّك؟ وكم يبعد عن وجهته؟
 *
 * الوقت وحده لا يجيب «هل هو في الطريق فعلاً؟» — كابتنٌ متأخّر ٥ دقائق وهو
 * على بُعد ٣٠٠ م غير كابتنٍ متأخّر ٥ دقائق ولم يتحرّك من مكانه.
 *
 *   moving     تحرّك مؤخّراً
 *   at_target  عند المحلّ أو العميل (ينتظر التجهيز — طبيعيّ)
 *   stopped    لم يتحرّك منذ STOPPED_MIN دقيقة وهو بعيدٌ عن وجهته
 *   unknown    لا موقع حديث — لا حكم (حالة GPS تقول ذلك وحدها)
 *
 * movedAt يُضبط على الخادم حين يبتعد الكابتن عن آخر نقطة ثبات بأكثر من
 * utils/locationMotion.MOVE_THRESHOLD_M — فاهتزاز GPS في مكانه ليس حركة.
 */
function motionOf(captain, order, stageKey, gps, now = new Date()) {
    const target = targetOf(order, stageKey);
    if (!target) return null;
    const loc = captain && captain.currentLocation;
    const here = gps && (gps.state === 'fresh') && loc ? { lat: loc.lat, lng: loc.lng } : null;
    const distanceM = here && target.lat !== null ? Math.round(haversineKm(here, target) * 1000) : null;

    if (!here) return { target: target.kind, distanceM: null, stoppedMin: null, state: 'unknown' };

    // ساعة التوقّف لا تسبق بداية المرحلة: من استلم للتوّ بعد انتظارٍ عند
    // المحلّ لم «يتوقّف ٢٠ دقيقة في الطريق للعميل»
    const stillSince = latest(loc.movedAt, stageOf(order).since);
    const stoppedMin = loc.movedAt ? minutesBetween(stillSince, now) : null;
    const state =
        distanceM !== null && distanceM <= AT_TARGET_M ? 'at_target' :
        stoppedMin !== null && stoppedMin >= STOPPED_MIN ? 'stopped' : 'moving';
    return { target: target.kind, distanceM, stoppedMin, state };
}

/**
 * تنبيهات الإدارة التي تخصّ **الطرفين الحاليّين**: ما أُرسل للكابتن السابق
 * قبل نقل الطلب لا يُعرض على بطاقة الجديد («نُبِّه قبل ٥ د» وهو لم يُنبَّه)،
 * ولا يمنع تنبيهه بمهلة الدقيقتين.
 */
function currentNudges(order) {
    const all = Array.isArray(order.adminNudges) ? order.adminNudges : [];
    const since = order.captainAssignedAt ? new Date(order.captainAssignedAt).getTime() : null;
    if (!since) return all;
    return all.filter(x => x.to !== 'captain' || new Date(x.at).getTime() >= since);
}

/**
 * 📸📍 إثبات الرحلة: صورة الاستلام، وموقع الكابتن لحظة إعلان التسليم.
 *
 * الاستلام: /pickup يرفض بلا صورة، فغيابها على طلبٍ «مستلَم» يعني أنه لم
 * يمرّ بذلك الطريق — تغيير حالةٍ يدويّ أو طلبٌ أقدم من الشرط. يُعلَّم.
 *
 * التسليم: لا صورة فيه — الإثبات بالموقع (utils/deliveryProof). وفي الوضع
 * الافتراضيّ «مراقبة» يُسجَّل ولا يمنع، فكابتنٌ أعلن التسليم على بُعد
 * كيلومترين يُغلق طلبه بصمت — والسجلّ على الطلب لا يراه أحد. هنا يُرى.
 *
 *   ok          كان عند العميل (ضمن نصف القطر)
 *   far         أعلن التسليم بعيداً عن العميل
 *   no_location لا موقع له لحظة الإعلان، أو موقعه قديم
 *   no_address  عنوان العميل بلا إحداثيات — لا يمكن الحكم (لا ذنب للكابتن)
 *   unchecked   لم يُفحص (الفحص معطّل، أو طلبٌ أقدم من الميزة)
 */
function proofOf(order) {
    const photo = order.proofOfPickupImage || (order.errand && order.errand.receiptImage) || null;
    const pickedUp = order.status === 'picked_up' || order.status === 'delivered';

    let delivery = null;
    if (order.status === 'delivered') {
        const dp = order.deliveryProof || null;
        const r = dp && dp.reason;
        const state =
            !r || r === 'disabled'                              ? 'unchecked' :
            r === 'ok' && dp.verified                           ? 'ok' :
            r === 'too_far'                                     ? 'far' :
            r === 'no_captain_location' || r === 'stale_location' ? 'no_location' :
            r === 'no_dropoff_coords'                           ? 'no_address' : 'unchecked';
        delivery = {
            state,
            distanceM: dp && Number.isFinite(dp.distanceM) ? dp.distanceM : null,
            locationAgeMin: dp && Number.isFinite(dp.locationAgeSec) ? Math.round(dp.locationAgeSec / 60) : null
        };
    }

    const pickupPhotoMissing = pickedUp && !photo;
    return {
        pickupPhoto: photo,
        pickupPhotoMissing,
        delivery,
        // «مشكوكٌ فيه»: ما يستحقّ نظرة أدمن — لا ما لا يمكن الحكم عليه
        suspicious: pickupPhotoMissing || !!(delivery && (delivery.state === 'far' || delivery.state === 'no_location'))
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
    const nudgesNow = currentNudges(order);
    const lastNudge = nudgesNow.length ? nudgesNow[nudgesNow.length - 1] : null;
    const gps = cap ? gpsOf(cap, nudges, now) : null;
    const running = stage.key === 'to_pickup' || stage.key === 'to_dropoff';

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
        proof: proofOf(order),
        stops: (order.isMultiStop && stops.length)
            ? { total: stops.length, done: stops.filter(s => s.done || s.doneAt).length } : null,
        captain: cap ? {
            id: String(cap._id),
            name: cap.name || 'كابتن',
            phone: cap.phone || '',
            vehicleType: cap.vehicleType || '',
            photo: (cap.documents && cap.documents.profilePhoto) || null,
            gps
        } : null,
        motion: running && cap ? motionOf(cap, order, stage.key, gps, now) : null,
        client: cli ? { id: String(cli._id), name: cli.name || 'عميل', phone: cli.phone || '' } : null,
        lastNudge: lastNudge ? {
            at: lastNudge.at, to: lastNudge.to, byName: lastNudge.byName || '',
            agoMin: minutesBetween(lastNudge.at, now),
            // ردّ الكابتن على التنبيه من شاشته («حاضر، في الطريق»)
            ack: lastNudge.ackAt ? {
                at: lastNudge.ackAt, text: lastNudge.ackText || '',
                agoMin: minutesBetween(lastNudge.ackAt, now)
            } : null
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
    minutesBetween, latest, clockStart, stageOf, stepsOf, latenessOf, gpsOf, proofOf, buildTrip, compareTrips,
    targetOf, motionOf, currentNudges, AT_TARGET_M, STOPPED_MIN,
    NUDGE_TEMPLATES, buildNudge, cooldownLeft, NUDGE_COOLDOWN_MIN, CUSTOM_MAX, STAGES
};
