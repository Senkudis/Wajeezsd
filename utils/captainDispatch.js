/**
 * توزيع إشعارات الطلب الجديد على الكباتن — شبكة سداسية (H3)، من الأقرب للأبعد.
 *
 * الفكرة: نقطة الاستلام تقع في خليّةٍ سداسية، وحولها حلقاتٌ من الخلايا
 * (الحلقة 1 = الجيران الستة، الحلقة 2 = ما يليهم…). نُشعر كباتن الحلقات
 * القريبة أولاً، ثم نتّسع حلقةً بعد حلقة بفاصلٍ قصير — فالأقرب يرى الطلب
 * ويقبله قبل أن يصل البعيد. وما دام الطلب مقبولاً لا نُزعج من بعده.
 *
 * لماذا السداسي لا نصف قطرٍ واحد: كان النظام موجتين (≤ 5 كم فوراً، والبقية
 * بعد 18ث) — كابتنٌ على بعد 300م وآخر على 4.9كم يُشعَران في اللحظة نفسها.
 * الحلقات تدرّج الأولوية، وكل خلايا الحلقة الواحدة على بعدٍ متقارب من المركز
 * (السداسي جيرانه الستة على المسافة نفسها، بخلاف المربّع وأقطاره).
 *
 * القاعدة الثابتة (بطلب المستخدم): الوصول للكل مضمون — آخر موجة هي كل من
 * تبقّى (البعيد، ومن لا موقع له، ومن موقعه قديم). وscheduler.js يبثّ للكل
 * إن ضاعت المؤقّتات بإعادة تشغيل الخادم (dispatchedAllAt).
 */
const h3 = require('h3-js');

// دقّة 8: ضلع الخليّة ≈ 0.46–0.53 كم، والحلقة ≈ 0.9 كم من المركز.
const H3_RES = 8;

// نطاقات الحلقات لكل موجة — [من، إلى] شاملة. بالمسافة تقريباً:
// ≤ 1.4كم، ≤ 3كم، ≤ 5.5كم، ≤ 11كم، ثم البقية.
const RING_BANDS = [[0, 1], [2, 3], [4, 6], [7, 12]];

// الفاصل بين موجةٍ غير فارغة والتي تليها
const WAVE_GAP_MS = 8000;

// موقعٌ أقدم من هذا لا يدلّ على مكان الكابتن الآن ⇒ يُعامَل كمجهول (آخر موجة)
const STALE_LOCATION_MS = 30 * 60 * 1000;

function validPoint(p) {
    return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
        && !(Number(p.lat) === 0 && Number(p.lng) === 0);
}

function cellOf(p) {
    try { return h3.latLngToCell(Number(p.lat), Number(p.lng), H3_RES); } catch (_) { return null; }
}

/** عدد الحلقات بين خليّتين — Infinity إن تعذّر (بعيدٌ جداً أو عبر خماسيّ) */
function ringsBetween(a, b) {
    if (!a || !b) return Infinity;
    try { return h3.gridDistance(a, b); } catch (_) { return Infinity; }
}

/**
 * يرتّب الكباتن في موجات حلقية.
 *
 * @param {Array<{fcmToken:string, currentLocation?:{lat,lng,fixedAt?,updatedAt?}}>} captains
 * @param {{lat:number,lng:number}} pickup
 * @param {object} [opts] { bands, now, staleMs }
 * @returns {Array<{ rings:[number,number]|null, tokens:string[] }>}
 *          الموجات غير الفارغة فقط، بالترتيب. rings = null لموجة «البقية».
 */
function planHexWaves(captains, pickup, opts = {}) {
    const bands   = opts.bands || RING_BANDS;
    const now     = opts.now ?? Date.now();
    const staleMs = opts.staleMs ?? STALE_LOCATION_MS;
    const origin  = validPoint(pickup) ? cellOf(pickup) : null;

    // كل كابتن بحلقته — والجهاز الواحد (توكن مكرّر) يُحسب مرة بأقرب حلقة
    const ringByToken = new Map();
    for (const c of captains || []) {
        if (!c || !c.fcmToken) continue;
        const loc = c.currentLocation;
        let ring = Infinity;
        if (origin && validPoint(loc)) {
            const at = loc.fixedAt || loc.updatedAt;
            const t = at ? new Date(at).getTime() : NaN;
            // بلا وقتٍ إطلاقاً ⇒ بيانات قديمة من قبل حقلَي الوقت؛ نثق بها كما كان النظام
            const fresh = !at || (Number.isFinite(t) && now - t <= staleMs);
            if (fresh) ring = ringsBetween(origin, cellOf(loc));
        }
        const prev = ringByToken.get(c.fcmToken);
        if (prev === undefined || ring < prev) ringByToken.set(c.fcmToken, ring);
    }

    const waves = bands.map(([from, to]) => ({ rings: [from, to], tokens: [] }));
    const rest = { rings: null, tokens: [] };
    // داخل الموجة: الأقرب أولاً (للسجلّ وللتشخيص — الإرسال نفسه متزامن)
    const sorted = [...ringByToken.entries()].sort((a, b) => a[1] - b[1]);
    for (const [token, ring] of sorted) {
        const w = waves.find(x => ring >= x.rings[0] && ring <= x.rings[1]);
        (w || rest).tokens.push(token);
    }
    return [...waves, rest].filter(w => w.tokens.length);
}

/**
 * يُطلق الموجات: الأولى فوراً، وكل تالية بعد WAVE_GAP_MS — بشرط أن يبقى
 * الطلب معلّقاً. لا يُنتظر انتهاؤه (المؤقّتات تعمل في الخلفية).
 *
 * @param {object} p
 * @param {Array} p.captains            كما في planHexWaves
 * @param {{lat,lng}} p.pickup
 * @param {(tokens:string[]) => Promise<{success?:number,failure?:number}>} p.send
 * @param {() => Promise<boolean>} p.stillPending  يُسأل قبل كل موجة بعد الأولى
 * @param {() => Promise<void>} [p.onAllDispatched] بعد آخر موجة (علامة dispatchedAllAt)
 * @param {object} [p.log]   pino logger
 * @param {object} [p.meta]  حقول تُضاف لكل سطر سجلّ (orderId, city)
 * @param {number} [p.gapMs]
 * @returns {Promise<{waves:number, first:number}>} عدد الموجات، وحجم الأولى
 */
async function dispatchInHexWaves({ captains, pickup, send, stillPending, onAllDispatched, log, meta = {}, gapMs = WAVE_GAP_MS }) {
    const waves = planHexWaves(captains, pickup);
    if (!waves.length) return { waves: 0, first: 0 };

    const fire = async (i) => {
        const w = waves[i];
        const r = await send(w.tokens) || {};
        log && log.info({
            ...meta, wave: i + 1, of: waves.length,
            rings: w.rings ? `${w.rings[0]}-${w.rings[1]}` : 'rest',
            targeted: w.tokens.length, sent: r.success, failed: r.failure
        }, 'Order captain push (hex wave)');
        if (i === waves.length - 1 && onAllDispatched) await onAllDispatched();
    };

    await fire(0);

    const next = (i) => {
        if (i >= waves.length) return;
        setTimeout(async () => {
            try {
                if (!(await stillPending())) {
                    log && log.debug({ ...meta, wave: i + 1 }, 'Hex dispatch stopped — order no longer pending');
                    return;
                }
                await fire(i);
                next(i + 1);
            } catch (err) {
                log && log.error({ ...meta, err, wave: i + 1 }, 'Hex dispatch wave failed');
            }
        }, gapMs);
    };
    next(1);

    return { waves: waves.length, first: waves[0].tokens.length };
}

module.exports = {
    planHexWaves, dispatchInHexWaves,
    H3_RES, RING_BANDS, WAVE_GAP_MS, STALE_LOCATION_MS
};
