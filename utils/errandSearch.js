/**
 * 🛒 نواة بحث "اشترِ لي" — طبقةٌ واحدة يستهلكها مساران بسياستَي تكلفة مختلفتين.
 *
 * لماذا فُصلت عن routes/places.js: البحث العام في الرئيسية صار يعرض نتائج
 * "اشترِ لي" حين لا يكون المحل مسجّلاً عندنا. لو نسخنا المنطق هناك لانفرق
 * الترتيبُ والتطبيعُ والحصرُ الجغرافي بين الشاشتين بمرور الوقت، ولصار نفس
 * البحث يعطي نتيجتين مختلفتين حسب من أين دخل العميل.
 *
 * 💸 مفتاح التصميم كله هو `allowGoogle`:
 *   - الطبقة المجانية (allowGoogle=false): قاعدتنا وحدها — أماكن تعلّمناها من
 *     طلبات سابقة (ExternalPlace). لا تكلفة، فتُستدعى مع كل ضغطة زر في البحث
 *     العام بلا خوف، ومفتوحة للزائر غير المسجّل.
 *   - الطبقة المدفوعة (allowGoogle=true): نداء Google Places. لا تُستدعى إلا
 *     بنيّة صريحة من العميل (زر "ابحث في كل محلات المدينة") أو من داخل منتقي
 *     "اشترِ لي" نفسه، ودائماً خلف تسجيل الدخول وسقف المعدّل في المسار.
 */

const logger = require('./logger');
const { arabicFlexibleRegex } = require('./arabicSearch');

/** منطقة التوصيل المرسومة للمدينة — أو null حين لا تُضبط بعد */
async function deliveryZoneFor(city) {
    try {
        const Settings = require('../models/Settings');
        const s = await Settings.getSettings(city);
        if (Array.isArray(s.deliveryZone) && s.deliveryZone.length >= 3) {
            return s.deliveryZone.map(p => ({ lat: p.lat, lng: p.lng }));
        }
    } catch (_) { /* بلا منطقة: يبقى حصر صندوق المدينة وحده */ }
    return null;
}

/** كم مكاناً متعلَّماً يكفي للاستغناء عن نداء جوجل المدفوع */
const LOCAL_ENOUGH = 5;

/**
 * @param {object} p
 * @param {string} [p.q] بحث حر بالاسم
 * @param {string} [p.categoryKey] تصنيف جاهز (بقالات/صيدليات…)
 * @param {string} p.city
 * @param {number} [p.lat] موقع العميل — يوجّه البحث بالتصنيف نحو الأقرب
 * @param {number} [p.lng]
 * @param {boolean} [p.allowGoogle=true] هل يُسمح بنداء مدفوع عند الحاجة؟
 * @param {number} [p.limit=0] سقف نتائج خارجية (0 = بلا سقف)
 * @returns {Promise<{ours:Array, external:Array, externalError:?string, googleCalled:boolean, localOnly:boolean}>}
 */
async function runErrandSearch({ q = '', categoryKey = '', city = 'Khartoum', lat, lng, allowGoogle = true, limit = 0 }) {
    const Place = require('../models/Place');
    const ExternalPlace = require('../models/ExternalPlace');
    const { searchText, searchByCategory, clampToCity } = require('./placesSearch');

    q = String(q || '').trim();
    categoryKey = String(categoryKey || '').trim();
    if (!q && !categoryKey) {
        return { ours: [], external: [], externalError: null, googleCalled: false, localOnly: true };
    }

    // 1) متاجرنا المسجّلة أولاً: أدقّ بيانات وأقرب علاقة بالعميل.
    //    البحث بالاسم فقط — التصنيف عندنا (PlaceCategory) لا يقابل تصنيفات جوجل.
    let ours = [];
    if (q) {
        const rx = arabicFlexibleRegex(q);
        const docs = await Place.find({ isActive: true, city, $or: [{ name: rx }, { address: rx }] })
            .select('name address location image_url errandEnabled category').populate('category', 'name')
            .limit(8)
            .lean();
        ours = docs.map(p => ({
            placeId: String(p._id),
            name: p.name,
            address: p.address || '',
            lat: p.location ? p.location.lat : null,
            lng: p.location ? p.location.lng : null,
            image_url: p.image_url || '',
            // قسم المتجر عندنا نصٌّ للعرض — لا يقابل مفاتيح تصنيفات جوجل،
            // فيبقى categoryKey فارغاً ويظهر النص كما هو على البطاقة.
            category: (p.category && p.category.name) || '',
            curated: p.errandEnabled === true,
            source: 'wajeez'
        })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    }

    // 2) بقية العالم — محصورة في منطقة توصيل المدينة.
    //    محلٌّ خارجها لا نوصّل منه أصلاً، فعرضه وعدٌ كاذب للعميل.
    const zone = await deliveryZoneFor(city);

    // 2.أ) أماكن تعلّمناها من طلبات سابقة — مجانية وأدقّ (اختارها عملاء فعلاً).
    //      تُبحث قبل جوجل، وإن كفت أوقفنا النداء المدفوع أصلاً.
    let learned = [];
    const learnedFilter = q
        ? { city, $or: [{ name: arabicFlexibleRegex(q) }, { address: arabicFlexibleRegex(q) }] }
        // بلا نصّ: التصنيف وحده. يخدم الطبقة المجانية حين لا يُسمح بنداء جوجل.
        : { city, categoryKey };
    const docs = await ExternalPlace.find(learnedFilter)
        .sort({ usageCount: -1 })
        .limit(10)
        .lean();
    learned = docs.map(d => ({
        externalId: d.googlePlaceId || '',
        name: d.name, address: d.address,
        lat: d.lat, lng: d.lng,
        category: d.category, categoryKey: d.categoryKey || '',
        source: 'google'   // للواجهة: مكان عام لا متجر مسجّل
    }));
    learned = clampToCity(learned, city, zone);

    // نداء جوجل مدفوع: لا نطلبه إن مُنع، ولا إن كفانا ما تعلّمناه. البحث بالتصنيف
    // يستدعيه دائماً لأنه يعتمد على القرب لا على الاسم، وقاعدتنا لا ترتّب بالمسافة.
    const skipGoogle = !allowGoogle || (!categoryKey && learned.length >= LOCAL_ENOUGH);

    let external = learned;
    let externalError = null;
    let googleCalled = false;
    if (!skipGoogle) {
        try {
            const fresh = categoryKey
                ? await searchByCategory({ categoryKey, city, lat, lng, zone })
                : await searchText({ query: q, city, lat, lng, zone });
            googleCalled = !fresh.cached;
            // المتعلَّم أولاً ثم بقية جوجل، بلا تكرار
            const seen = new Set(learned.map(p => p.externalId || p.name.trim().toLowerCase()));
            external = learned.concat(fresh.results.filter(p => !seen.has(p.externalId || p.name.trim().toLowerCase())));
        } catch (e) {
            // فشل البحث الخارجي لا يُسقط ما عندنا — نُبلّغ الواجهة لتشرح للعميل
            logger.warn({ err: e.message }, 'errand external search failed');
            externalError = e.message === 'PLACES_KEY_MISSING'
                ? 'بحث الأماكن غير مفعّل حالياً'
                : 'تعذّر البحث الخارجي — جرّب لاحقاً';
        }
    }

    // لا نكرّر متجراً عندنا كنتيجة خارجية (تطابق الاسم يكفي عملياً)
    const ourNames = new Set(ours.map(p => p.name.trim().toLowerCase()));
    external = external.filter(p => !ourNames.has(p.name.trim().toLowerCase()));

    if (limit > 0) external = external.slice(0, limit);

    return { ours, external, externalError, googleCalled, localOnly: skipGoogle };
}

module.exports = { runErrandSearch, deliveryZoneFor, LOCAL_ENOUGH };
