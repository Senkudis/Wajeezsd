const express = require('express');
const router = express.Router();
const Place = require('../models/Place');
const PlaceCategory = require('../models/PlaceCategory');
const Product = require('../models/Product');
const Rating = require('../models/Rating');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { logAdminAction } = require('../utils/adminLogger');
const { normalizePhone } = require('../utils/phoneNormalizer');
const logger = require('../utils/logger');

// 🔤 Arabic-aware search regex.
// يبني تعبيراً نمطياً يطابق كل أشكال الحرف العربي ويتجاهل التشكيل والتطويل،
// فيجد النتائج مهما اختلف رسم الهمزة/التاء/الياء في بيانات القاعدة.
function arabicFlexibleRegex(term) {
    // احذف التشكيل (الحركات) والتطويل (ـ)
    const cleaned = String(term).replace(/[ً-ْٰـ]/g, '').trim();
    // مجموعات الحروف المتكافئة في البحث
    const groups = ['اأإآٱ', 'ةه', 'يىئ', 'وؤ'];
    const classOf = (ch) => {
        for (const g of groups) if (g.includes(ch)) return '[' + g + ']';
        // هروب رموز regex الخاصة
        if (/[.*+?^${}()|[\]\\]/.test(ch)) return '\\' + ch;
        return ch;
    };
    // اسمح بوجود تشكيل اختياري في بيانات القاعدة بين الحروف (مثل "مَطعَم")
    const parts = [];
    for (const ch of cleaned) parts.push(classOf(ch));
    const out = parts.join('[ً-ْٰ]*');
    return new RegExp(out || '.*', 'i');
}

// ============================================================
// @route   GET /api/places/categories
// @desc    Get all active categories
// ============================================================
router.get('/categories', async (req, res) => {
    try {
        const categories = await PlaceCategory.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
        res.json(categories);
    } catch (err) {
        logger.error('Places Categories Error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// @route   GET /api/places?category_id=X&city=Khartoum
// @desc    Get places for a category, scoped to a city
// ============================================================
router.get('/', async (req, res) => {
    try {
        const { category_id, city } = req.query;
        const query = { isActive: true };
        if (category_id) query.category = category_id;
        // 🛒 قائمة أماكن "اشترِ لي" المنسّقة (?errand=1) لمنتقي خدمة الشراء
        if (req.query.errand === '1' || req.query.errand === 'true') query.errandEnabled = true;

        // 🌍 City isolation: only return places in the requested city.
        // If city='all', bypass the city filter (useful for admin dashboard).
        // If no city is provided, fall back to Khartoum (safe default for legacy clients).
        if (city === 'all') {
            // No city filter applied
        } else {
            query.city = city || 'Khartoum';
        }

        const places = await Place.find(query).populate('category', 'name icon');

        // زيادة عداد المشاهدات (fire & forget)
        if (places.length > 0) {
            Place.updateMany(
                { _id: { $in: places.map(p => p._id) } },
                { $inc: { viewsCount: 1 } }
            ).catch(() => {});
        }

        // Return with virtuals + ownerId so client can show "Browse Products" button for merchant stores
        res.json(places.map(p => {
            const obj = p.toJSON();
            // Explicitly include ownerId so the client knows if this place has a merchant
            if (p.ownerId) obj.ownerId = p.ownerId;
            return obj;
        }));
    } catch (err) {
        logger.error('Places List Error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// @route   GET /api/places/search
// @desc    بحث موحّد عبر المتاجر + المنتجات داخل المدينة، مرتّب بالأقرب.
//          يدعم البحث التنبّؤي (autocomplete) في قسم "تسوق".
//          ⚠️ يجب تعريفه قبل /:id حتى لا يلتقطه مسار المعرّف.
// ============================================================
router.get('/search', async (req, res) => {
    try {
        const term = (req.query.q || '').trim();
        if (term.length < 1) return res.json({ places: [], products: [] });

        const cityFilter = (req.query.city && req.query.city !== 'all') ? req.query.city : 'Khartoum';

        // 🔤 تطبيع البحث العربي: يطابق كل أشكال الحرف ويتجاهل التشكيل
        //    (أ/إ/آ/ا متكافئة، ة/ه، ي/ى/ئ، و/ؤ) — يطابق بيانات القاعدة مهما كان رسمها.
        const rx = arabicFlexibleRegex(term);

        const userLat = parseFloat(req.query.lat);
        const userLng = parseFloat(req.query.lng);
        const hasLoc = !isNaN(userLat) && !isNaN(userLng);
        const distKm = (loc) => {
            if (!loc || typeof loc.lat !== 'number') return undefined;
            const R = 6371;
            const dLat = (loc.lat - userLat) * Math.PI / 180;
            const dLng = (loc.lng - userLng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(userLat * Math.PI / 180) * Math.cos(loc.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
            return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
        };

        // 0) أقسام/تصنيفات مطابقة بالاسم (كلمات عامة مثل "مطاعم"، "صيدلية")
        const matchedCats = await PlaceCategory.find({ isActive: true, name: rx })
            .select('name icon').limit(10).lean();
        const matchedCatIds = matchedCats.map(c => c._id);

        // 1) متاجر: مطابقة بالاسم أو ضمن قسم مطابق (في المدينة، فعّالة)
        const placeOr = [{ name: rx }];
        if (matchedCatIds.length) placeOr.push({ category: { $in: matchedCatIds } });
        const placeDocs = await Place.find({ isActive: true, city: cityFilter, $or: placeOr })
            .populate('category', 'name icon')
            .limit(20);

        // 2) منتجات: مطابقة بالاسم أو الوصف أو التصنيف الداخلي (كلمات عامة)،
        //    ثم نربطها بمتاجرها داخل نفس المدينة
        const productDocs = await Product.find({
            isAvailable: true,
            $or: [{ name: rx }, { description: rx }, { category: rx }]
        })
            .select('name price image placeId category ratingAvg')
            .limit(40)
            .lean();

        const prodPlaceIds = [...new Set(productDocs.map(p => String(p.placeId)))];
        const prodPlaces = await Place.find({ _id: { $in: prodPlaceIds }, isActive: true, city: cityFilter })
            .select('name location image_url')
            .lean();
        const placeMap = {};
        prodPlaces.forEach(pl => { placeMap[String(pl._id)] = pl; });

        // متاجر للعرض (مع الـ virtuals مثل is_open) + المسافة
        let places = placeDocs.map(p => {
            const obj = p.toJSON();
            if (p.ownerId) obj.ownerId = p.ownerId;
            if (hasLoc) obj.distanceKm = distKm(obj.location);
            return obj;
        });

        // منتجات للعرض (فقط ما متجره ضمن المدينة وفعّال) + اسم المتجر + المسافة
        let products = productDocs
            .filter(pr => placeMap[String(pr.placeId)])
            .map(pr => {
                const pl = placeMap[String(pr.placeId)];
                const out = {
                    _id: pr._id, name: pr.name, price: pr.price,
                    image: pr.image, category: pr.category, ratingAvg: pr.ratingAvg,
                    place: { _id: pl._id, name: pl.name, image_url: pl.image_url, location: pl.location }
                };
                if (hasLoc) out.distanceKm = distKm(pl.location);
                return out;
            });

        // ترتيب بالأقرب عند توفّر الموقع
        if (hasLoc) {
            const byDist = (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9);
            places.sort(byDist);
            products.sort(byDist);
        }

        res.json({ categories: matchedCats, places, products });
    } catch (err) {
        logger.error('Places Search Error:', err);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// 🛒 بحث "اشترِ لي" — الأماكن المفتوحة (لا تقتصر على متاجرنا المسجّلة)
// ⚠️ يجب تعريفهما قبل /:id حتى لا يلتقطهما مسار المعرّف.
// ============================================================

// @route   GET /api/places/errand-categories
// @desc    التصنيفات الثابتة المعروضة في منتقي "اشترِ لي"
router.get('/errand-categories', (req, res) => {
    const { ERRAND_CATEGORIES } = require('../utils/placesSearch');
    // types أنواع جوجل الداخلية — لا شأن للواجهة بها
    res.json(ERRAND_CATEGORIES.map(({ key, label, icon }) => ({ key, label, icon })));
});

// @route   GET /api/places/errand-featured?city=
// @desc    شاشة المنتقي الأولى قبل أن يكتب العميل: محلات مميّزة يختارها الأدمن
//          (errandEnabled) + الأكثر طلباً فعلاً. بلا أي نداء مدفوع لجوجل.
// @access  عام — بيانات من قاعدتنا فقط
router.get('/errand-featured', async (req, res) => {
    try {
        const city = req.query.city === 'PortSudan' ? 'PortSudan' : 'Khartoum';

        const [curated, popular] = await Promise.all([
            // ⚠️ errandEnabled فقد دوره القديم (كان السبيل الوحيد لإضافة محل) حين صار
            // البحث مفتوحاً. أُعيد توظيفه: ترشيح الأدمن لمحلات تتصدّر الشاشة الأولى.
            Place.find({ isActive: true, errandEnabled: true, city })
                .select('name address location image_url').limit(6).lean(),
            require('../models/ExternalPlace')
                .find({ city, usageCount: { $gte: 2 } })
                .sort({ usageCount: -1 }).limit(8).lean()
        ]);

        res.json({
            curated: curated
                .map(p => ({
                    placeId: String(p._id), name: p.name, address: p.address || '',
                    lat: p.location ? p.location.lat : null, lng: p.location ? p.location.lng : null,
                    image_url: p.image_url || '', source: 'wajeez'
                }))
                .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
            popular: popular.map(d => ({
                externalId: d.googlePlaceId || '', name: d.name, address: d.address || '',
                lat: d.lat, lng: d.lng, category: d.category || '',
                categoryKey: d.categoryKey || '', source: 'google'
            }))
        });
    } catch (err) {
        logger.error({ err: err.message }, 'errand featured error');
        res.json({ curated: [], popular: [] });   // الشاشة الأولى لا تستحق رسالة خطأ
    }
});

// @route   GET /api/places/errand-stats?city=&days=30
// @desc    📊 أدمن فقط: هل تعمل طبقات خفض التكلفة؟ وما الذي يبحث عنه العملاء ولا يجدونه؟
router.get('/errand-stats', protect, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    try {
        const PlaceSearchStat = require('../models/PlaceSearchStat');
        const PlaceSearchQuery = require('../models/PlaceSearchQuery');
        const ExternalPlace = require('../models/ExternalPlace');

        const city = req.query.city === 'PortSudan' ? 'PortSudan' : 'Khartoum';
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
        const since = new Date(Date.now() + 3 * 60 * 60 * 1000 - days * 86400000)
            .toISOString().slice(0, 10);

        const [daily, topQueries, failedQueries, learnedCount, topPlaces] = await Promise.all([
            PlaceSearchStat.find({ city, day: { $gte: since } }).sort({ day: 1 }).lean(),
            PlaceSearchQuery.find({ city }).sort({ searches: -1 }).limit(10)
                .select('query searches emptyCount lastResultCount lastAt').lean(),
            // الأثمن: ما يطلبه العملاء ولا نجده — قائمة تسجيل متاجر جاهزة
            PlaceSearchQuery.find({ city, emptyCount: { $gt: 0 } }).sort({ emptyCount: -1 }).limit(15)
                .select('query searches emptyCount lastAt').lean(),
            ExternalPlace.countDocuments({ city }),
            ExternalPlace.find({ city }).sort({ usageCount: -1 }).limit(10)
                .select('name usageCount address').lean()
        ]);

        const sum = (k) => daily.reduce((a, d) => a + (d[k] || 0), 0);
        const searches = sum('searches');
        const googleCalls = sum('googleCalls');

        res.json({
            city, days,
            totals: {
                searches,
                googleCalls,
                cacheHits: sum('cacheHits'),
                localOnly: sum('localOnly'),
                emptyResults: sum('emptyResults'),
                errors: sum('errors'),
                // النسبة التي وفّرناها فعلاً — المؤشّر الوحيد الذي يهمّ
                savedPercent: searches ? Math.round((1 - googleCalls / searches) * 100) : 0
            },
            daily: daily.map(d => ({
                day: d.day, searches: d.searches, googleCalls: d.googleCalls,
                cacheHits: d.cacheHits, localOnly: d.localOnly, emptyResults: d.emptyResults
            })),
            topQueries, failedQueries, learnedCount, topPlaces
        });
    } catch (err) {
        logger.error({ err: err.message }, 'errand stats error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/places/errand-diagnose
// @desc    🩺 أدمن فقط: أيّ مفتاح مستعمل وما رسالة جوجل الحقيقية — بلا كشف المفتاح
router.get('/errand-diagnose', protect, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
    try {
        const { diagnose } = require('../utils/placesSearch');
        res.json(await diagnose());
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// @route   GET /api/places/errand-search?q=&category=&city=&lat=&lng=
// @desc    بحث مفتوح عن محل بالاسم أو بالتصنيف، مع دمج متاجرنا المسجّلة أولاً
// @access  محمي — البحث الخارجي مدفوع، فلا يُفتح للزوّار
// ⚠️ كان السقف في ذاكرة العملية: يضيع مع كل إعادة تشغيل (فيُصفَّر للجميع)، ولا
// يُشارَك بين نسخ التطبيق — فمن يوزّع طلبه على نسختين يحصل على ضعف السقف. وهذا
// بالضبط ما يحميه السقف: استنزاف نداءات جوجل المدفوعة. الآن عدّاد مشترك في مونجو.
const ERRAND_SEARCH_LIMIT = 30;        // في الدقيقة — سخيّ للإنسان، ضيّق على السكربت
const ERRAND_SEARCH_WINDOW_MS = 60000;

async function errandSearchThrottled(userId) {
    const RateCounter = require('../models/RateCounter');
    const window = Math.floor(Date.now() / ERRAND_SEARCH_WINDOW_MS);
    const { allowed } = await RateCounter.hit(
        `errand-search:${userId}:${window}`, ERRAND_SEARCH_LIMIT, ERRAND_SEARCH_WINDOW_MS
    );
    return !allowed;
}

router.get('/errand-search', protect, async (req, res) => {
    try {
        if (await errandSearchThrottled(String(req.user.id))) {
            return res.status(429).json({ message: 'بحث كثير في وقت قصير — انتظر قليلاً' });
        }

        const { searchText, searchByCategory, clampToCity, normalizeQuery } = require('../utils/placesSearch');
        const q = String(req.query.q || '').trim();
        const categoryKey = String(req.query.category || '').trim();
        const city = req.query.city === 'PortSudan' ? 'PortSudan' : 'Khartoum';
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);

        if (!q && !categoryKey) return res.json({ ours: [], external: [] });

        // 1) متاجرنا المسجّلة أولاً: أدقّ بيانات وأقرب علاقة بالعميل.
        //    البحث بالاسم فقط — التصنيف عندنا (PlaceCategory) لا يقابل تصنيفات جوجل.
        let ours = [];
        if (q) {
            const rx = arabicFlexibleRegex(q);
            ours = await Place.find({ isActive: true, city, $or: [{ name: rx }, { address: rx }] })
                .select('name address location image_url errandEnabled category').populate('category', 'name')
                .limit(8)
                .lean();
            ours = ours.map(p => ({
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

        // 2) بقية العالم من جوجل — محصورة في منطقة توصيل المدينة.
        //    محلٌّ خارجها لا نوصّل منه أصلاً، فعرضه وعدٌ كاذب للعميل.
        let zone = null;
        try {
            const Settings = require('../models/Settings');
            const s = await Settings.getSettings(city);
            if (Array.isArray(s.deliveryZone) && s.deliveryZone.length >= 3) {
                zone = s.deliveryZone.map(p => ({ lat: p.lat, lng: p.lng }));
            }
        } catch (_) { /* بلا منطقة: يبقى حصر صندوق المدينة */ }

        // 2.أ) أماكن تعلّمناها من طلبات سابقة — مجانية وأدقّ (اختارها عملاء فعلاً).
        //      تُبحث قبل جوجل، وإن كفت أوقفنا النداء المدفوع أصلاً.
        const ExternalPlace = require('../models/ExternalPlace');
        let learned = [];
        if (q) {
            const rx = arabicFlexibleRegex(q);
            const docs = await ExternalPlace.find({ city, $or: [{ name: rx }, { address: rx }] })
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
        }
        learned = clampToCity(learned, city, zone);

        // نداء جوجل مدفوع: لا نطلبه إن كفانا ما تعلّمناه. البحث بالتصنيف يستدعيه
        // دائماً لأنه يعتمد على القرب لا على الاسم، وقاعدتنا لا ترتّب بالمسافة.
        const LOCAL_ENOUGH = 5;
        const skipGoogle = !categoryKey && learned.length >= LOCAL_ENOUGH;

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

        // 📈 ما يراه العميل فعلاً هو ما نقيسه: نتيجة فارغة هنا تعني بحثاً فاشلاً
        // مهما أرجع جوجل قبل الحصر الجغرافي.
        require('../utils/searchStats').record({
            city,
            query: categoryKey ? '' : normalizeQuery(q),
            resultCount: ours.length + external.length,
            googleCalled,
            localOnly: skipGoogle,
            failed: !!externalError
        });

        res.json(externalError ? { ours, external, externalError } : { ours, external });
    } catch (err) {
        logger.error({ err: err.message }, 'errand search error');
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// @route   GET /api/places/resolve/:code
// @desc    Public: حلّ كود المشاركة القصير إلى معرّف المتجر
//          يستخدمه معالج الـ deep link في تطبيق أندرويد.
//          ⚠️ يجب تعريفه قبل /:id حتى لا يلتقطه مسار المعرّف.
// ============================================================
router.get('/resolve/:code', async (req, res) => {
    try {
        const code = String(req.params.code || '').trim();
        if (!code || code.length > 20) return res.status(400).json({ message: 'كود غير صالح' });
        const place = await Place.findOne({ shareCode: code, isActive: true }).select('_id name').lean();
        if (!place) return res.status(404).json({ message: 'المتجر غير موجود' });
        res.json({ placeId: place._id, name: place.name });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// @route   GET /api/places/resolve-product/:id
// @desc    Public: حلّ معرّف المنتج لمعرفة المتجر التابع له
//          يستخدمه معالج الـ deep link في التطبيق
// ============================================================
router.get('/resolve-product/:id', async (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!/^[0-9a-fA-F]{24}$/.test(id)) return res.status(400).json({ message: 'معرف غير صالح' });
        const product = await require('../models/Product').findById(id).select('placeId name').lean();
        if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });
        res.json({ placeId: product.placeId, productId: product._id, name: product.name });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// @route   GET /api/places/:id
// @desc    Get a single place by ID
// ============================================================
router.get('/:id', async (req, res) => {
    try {
        const place = await Place.findById(req.params.id).populate('category', 'name icon');
        if (!place) return res.status(404).json({ message: 'المحل غير موجود' });
        res.json(place.toJSON());
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// @route   POST /api/places/categories
// @desc    Admin: Create a category
// ============================================================
router.post('/categories', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
        const { name, icon, sortOrder, notes } = req.body;
        if (!name) return res.status(400).json({ message: 'اسم الفئة مطلوب' });
        const cat = await PlaceCategory.create({ name, icon, sortOrder, notes });
        await logAdminAction(req, 'create_category', `إضافة قسم جديد: ${name}`, cat._id, name);
        res.status(201).json(cat);
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/places/categories/:id
router.put('/categories/:id', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
        const cat = await PlaceCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!cat) return res.status(404).json({ message: 'غير موجود' });
        await logAdminAction(req, 'update_category', `تعديل قسم: ${cat.name}`, cat._id, cat.name);
        res.json(cat);
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   DELETE /api/places/categories/:id
router.delete('/categories/:id', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
        const cat = await PlaceCategory.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        if (cat) await logAdminAction(req, 'delete_category', `إخفاء قسم: ${cat.name}`, cat._id, cat.name);
        res.json({ message: 'تم إخفاء التصنيف' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// @route   POST /api/places
// @desc    Admin: Create a place (optionally with a new merchant account)
// ============================================================
router.post('/', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });

        const {
            name, category, image_url, phone, whatsapp, location, address,
            map_url, workingHours, menu, notes,
            // 👤 بيانات التاجر (اختياري)
            ownerName, ownerPhone, ownerEmail, ownerPassword, ownerBankAccount,
            ownerId // ربط بمستخدم موجود مسبقاً
        } = req.body;

        if (!name || !category || !location) {
            return res.status(400).json({ message: 'الاسم والفئة والموقع مطلوبة' });
        }

        // 🗺️ رفض الإحداثيات غير الصالحة بدل حفظ قيم افتراضية صامتة (كانت تُنتج دبابيس عشوائية)
        const locLat = Number(location.lat);
        const locLng = Number(location.lng);
        if (!Number.isFinite(locLat) || !Number.isFinite(locLng)) {
            return res.status(400).json({ message: 'حدد موقع المتجر على الخريطة — الإحداثيات غير صالحة' });
        }

        let resolvedOwnerId = ownerId || null;
        let createdMerchantInfo = null; // ✅ بيانات حساب التاجر المُنشأ لإعادتها للأدمن

        // ─── حالة 1: إنشاء حساب تاجر جديد ───────────────────────
        if (ownerName && ownerPhone && ownerPassword && !ownerId) {
            // 🔑 تطبيع الهاتف إلزامي: /login يبحث دائماً بـ normalizePhone.
            const merchantPhone = normalizePhone(ownerPhone);
            const merchantEmail = ownerEmail ? String(ownerEmail).toLowerCase().trim() : undefined;
            if (!merchantPhone) {
                return res.status(400).json({ message: 'رقم هاتف التاجر غير صالح' });
            }
            if (!ownerPassword || String(ownerPassword).length < 6) {
                return res.status(400).json({ message: 'كلمة مرور التاجر يجب أن تكون 6 أحرف على الأقل' });
            }

            // تحقق من عدم تكرار الهاتف (بالصيغة المُطبَّعة)
            const existingByPhone = await User.findOne({ phone: merchantPhone });
            if (existingByPhone) {
                return res.status(400).json({ message: `رقم الهاتف ${merchantPhone} مسجّل مسبقاً لمستخدم آخر` });
            }

            // ✅ تحقق من تكرار البريد الإلكتروني — كان مفقوداً فيُنتج خطأ قاعدة بيانات غامضاً (E11000)
            if (merchantEmail) {
                const existingByEmail = await User.findOne({ email: merchantEmail });
                if (existingByEmail) {
                    return res.status(400).json({ message: `البريد الإلكتروني ${merchantEmail} مسجّل مسبقاً لمستخدم آخر` });
                }
            }

            const newMerchant = new User({
                name: ownerName,
                phone: merchantPhone,
                email: merchantEmail,
                password: ownerPassword,
                role: 'merchant',
                city: req.body.city || 'Khartoum', // ✅ حقل المدينة مطلوب في Schema
                approvalStatus: 'approved',
                isVerified: true
            });
            await newMerchant.save();
            resolvedOwnerId = newMerchant._id;
            createdMerchantInfo = { name: ownerName, phone: merchantPhone, email: merchantEmail || null };

            // حفظ رقم الحساب البنكي في MerchantRequest إن أُرسل
            if (ownerBankAccount) {
                const MerchantRequest = require('../models/MerchantRequest');
                const PlaceCategory = require('../models/PlaceCategory');
                let categoryDoc = null;
                if (require('mongoose').Types.ObjectId.isValid(category)) {
                    categoryDoc = await PlaceCategory.findById(category);
                }
                await MerchantRequest.create({
                    userId: resolvedOwnerId,
                    businessName: name,
                    ownerName,
                    phone: merchantPhone,
                    category: categoryDoc ? categoryDoc.name : '',
                    address: address || '',
                    bankAccount: ownerBankAccount,
                    status: 'approved',
                    logoImage: image_url || ''
                });
            }
        }

        // ─── حالة 2: ربط بمستخدم موجود ──────────────────────────
        if (ownerId && !ownerName) {
            // تأكد إن المستخدم موجود وحوّل دوره لتاجر
            await User.findByIdAndUpdate(ownerId, { role: 'merchant', approvalStatus: 'approved' });
        }

        // ─── إنشاء المتجر ─────────────────────────────────────────
        // 🌍 المدينة: الإحداثيات مصدر الحقيقة (تصحّح اختيار مدينة خاطئ في النموذج)،
        //    ثم اختيار الأدمن، ثم الخرطوم كاحتياط أخير.
        const { cityFromCoords } = require('../utils/geofence');
        const resolvedCity = cityFromCoords(locLat, locLng) || req.body.city || 'Khartoum';

        const place = await Place.create({
            name, category, image_url, phone, whatsapp, location, address,
            map_url, workingHours, menu, notes,
            ownerId: resolvedOwnerId,
            city: resolvedCity,
            isActive: true,
            isOpenOverride: true,
            deliveryAvailable: true,
            // 🛒 مكان "اشترِ لي" (يضيفه الأدمن بلا حساب تاجر)
            errandEnabled: req.body.errandEnabled === true || req.body.errandEnabled === 'true'
        });

        // 🔗 كود مشاركة قصير للمتجر الجديد — wajeezsd.com/s/<code>
        try {
            const { ensureShareCode } = require('../utils/shareCode');
            await ensureShareCode(place);
        } catch (scErr) { logger.error('shareCode generation failed:', scErr.message); }

        // ✅ إعادة المتجر + بيانات حساب التاجر المُنشأ
        const response = place.toJSON();
        if (createdMerchantInfo) response.merchantAccount = createdMerchantInfo;
        res.status(201).json(response);
    } catch (err) {
        logger.error('Create Place Error:', err);
        res.status(500).json({ message: err.message || 'Server Error' });
    }
});

// ============================================================
// @route   PUT /api/places/:id
// @desc    Admin: Update a place
// ============================================================
router.put('/:id', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });

        const update = { ...req.body };

        // 🗺️ إحداثيات غير صالحة في التعديل → لا تلمس الموقع المحفوظ
        // (كان الافتراضي الصامت يكتب وسط الخرطوم فوق مواقع صحيحة → دبابيس عشوائية)
        if (update.location) {
            const uLat = Number(update.location.lat);
            const uLng = Number(update.location.lng);
            if (!Number.isFinite(uLat) || !Number.isFinite(uLng)) {
                delete update.location;
            } else {
                // 🌍 صحّح المدينة من الإحداثيات إن كانت داخل مدينة معروفة
                const { cityFromCoords } = require('../utils/geofence');
                const coordCity = cityFromCoords(uLat, uLng);
                if (coordCity) update.city = coordCity;
            }
        }

        const place = await Place.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!place) return res.status(404).json({ message: 'غير موجود' });
        await logAdminAction(req, 'update_store', `تعديل متجر: ${place.name}`, place._id, place.name);
        res.json(place.toJSON());
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// @route   DELETE /api/places/:id
// @desc    Admin: Delete/deactivate a place
// ============================================================
router.delete('/:id', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
        
        const place = await Place.findById(req.params.id);
        if (!place) return res.status(404).json({ message: 'المتجر غير موجود' });

        const ownerId = place.ownerId;
        const placeName = place.name;

        // 1. Delete the Place and its Products
        await Place.findByIdAndDelete(req.params.id);
        
        const Product = require('../models/Product');
        await Product.deleteMany({ placeId: req.params.id });

        if (ownerId) {
            // 2. Delete the associated MerchantRequest so it disappears from the requests page
            const MerchantRequest = require('../models/MerchantRequest');
            await MerchantRequest.findOneAndDelete({ userId: ownerId });

            // 3. Check if user has other places, if not, revert role to client
            const otherPlaces = await Place.countDocuments({ ownerId: ownerId });
            if (otherPlaces === 0) {
                const User = require('../models/User');
                await User.findByIdAndUpdate(ownerId, { role: 'client' });
            }
        }

        res.json({ message: 'تم حذف المتجر وبياناته ومزامنته بنجاح' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// @route   POST /api/places/seed-demo
// @desc    Admin: Seed demo categories & places for testing
// ============================================================
router.post('/seed-demo', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });

        // Clear existing
        await PlaceCategory.deleteMany({});
        await Place.deleteMany({});

        const categories = await PlaceCategory.insertMany([
            { name: 'صيدليات', icon: 'bi-capsule-pill', sortOrder: 1 },
            { name: 'مطاعم', icon: 'bi-cup-hot-fill', sortOrder: 2 },
            { name: 'سوبرماركت', icon: 'bi-cart-fill', sortOrder: 3 },
            { name: 'مخابز', icon: 'bi-egg-fried', sortOrder: 4 },
            { name: 'إلكترونيات', icon: 'bi-phone-fill', sortOrder: 5 },
            { name: 'ملابس', icon: 'bi-bag-fill', sortOrder: 6 },
        ]);

        const pharma = categories[0]._id;
        const restaurants = categories[1]._id;
        const supermarket = categories[2]._id;
        const bakery = categories[3]._id;

        // Demo places around Khartoum
        await Place.insertMany([
            {
                name: 'صيدلية النيل', category: pharma,
                image_url: 'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400',
                phone: '0912345678', whatsapp: '249912345678',
                location: { lat: 15.5010, lng: 32.5590 },
                workingHours: { open: '08:00', close: '22:00', days: [0, 1, 2, 3, 4, 5, 6] }
            },
            {
                name: 'صيدلية الخرطوم', category: pharma,
                image_url: 'https://images.unsplash.com/photo-1582281298055-e25b84a30b0b?w=400',
                phone: '0922345678', whatsapp: '249922345678',
                location: { lat: 15.5050, lng: 32.5630 },
                workingHours: { open: '09:00', close: '21:00', days: [1, 2, 3, 4, 5, 6] }
            },
            {
                name: 'مطعم البيت السوداني', category: restaurants,
                image_url: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400',
                phone: '0933345678', whatsapp: '249933345678',
                location: { lat: 15.4980, lng: 32.5570 },
                workingHours: { open: '07:00', close: '23:00', days: [0, 1, 2, 3, 4, 5, 6] }
            },
            {
                name: 'مطعم شاورما بيروت', category: restaurants,
                image_url: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=400',
                phone: '0944345678', whatsapp: '249944345678',
                location: { lat: 15.5035, lng: 32.5615 },
                workingHours: { open: '11:00', close: '02:00', days: [0, 1, 2, 3, 4, 5, 6] }
            },
            {
                name: 'سوبرماركت الفردوس', category: supermarket,
                image_url: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400',
                phone: '0955345678', whatsapp: '249955345678',
                location: { lat: 15.5020, lng: 32.5600 },
                workingHours: { open: '07:00', close: '23:00', days: [0, 1, 2, 3, 4, 5, 6] }
            },
            {
                name: 'مخبز الأمل', category: bakery,
                image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400',
                phone: '0966345678', whatsapp: '249966345678',
                location: { lat: 15.4995, lng: 32.5580 },
                workingHours: { open: '05:00', close: '20:00', days: [0, 1, 2, 3, 4, 5, 6] }
            }
        ]);

        res.json({
            message: 'تم إدراج البيانات التجريبية بنجاح ✅',
            categories: categories.length,
            places: 6
        });

    } catch (err) {
        logger.error('Seed Error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ============================================================
// ⭐ نظام التقييمات + عداد المشاهدات
// ============================================================

// تسجيل مشاهدة لمتجر (fire & forget)
router.post('/:id/view', async (req, res) => {
    try {
        await Place.findByIdAndUpdate(req.params.id, { $inc: { viewsCount: 1 } });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// تسجيل مشاهدة لمنتج (fire & forget)
router.post('/:placeId/products/:productId/view', async (req, res) => {
    try {
        await Product.findByIdAndUpdate(req.params.productId, { $inc: { viewsCount: 1 } });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// جلب تقييمات متجر
router.get('/:id/reviews', async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);

        const [reviews, total] = await Promise.all([
            Rating.find({ targetType: 'place', targetId: req.params.id, isHidden: false })
                .populate('client', 'name')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select('score comment createdAt client'),
            Rating.countDocuments({ targetType: 'place', targetId: req.params.id, isHidden: false })
        ]);

        const place = await Place.findById(req.params.id).select('ratingAvg ratingCount');
        res.json({ reviews, total, page, ratingAvg: place?.ratingAvg || 0, ratingCount: place?.ratingCount || 0 });
    } catch (e) {
        logger.error('Place reviews error:', e);
        res.status(500).json({ message: 'Server Error' });
    }
});

// جلب تقييمات منتج
router.get('/:placeId/products/:productId/reviews', async (req, res) => {
    try {
        const [reviews, total] = await Promise.all([
            Rating.find({ targetType: 'product', targetId: req.params.productId, isHidden: false })
                .populate('client', 'name')
                .sort({ createdAt: -1 })
                .limit(30)
                .select('score comment createdAt client'),
            Rating.countDocuments({ targetType: 'product', targetId: req.params.productId, isHidden: false })
        ]);
        const product = await Product.findById(req.params.productId).select('ratingAvg ratingCount');
        res.json({ reviews, total, ratingAvg: product?.ratingAvg || 0, ratingCount: product?.ratingCount || 0 });
    } catch (e) {
        res.status(500).json({ message: 'Server Error' });
    }
});

// تقييم متجر من عميل
router.post('/:id/rate', protect, async (req, res) => {
    try {
        const { score, comment, orderId } = req.body;
        const placeId = req.params.id;

        if (!score || score < 1 || score > 5) {
            return res.status(400).json({ message: 'التقييم يجب أن يكون بين 1 و 5 نجوم' });
        }

        const place = await Place.findById(placeId);
        if (!place) return res.status(404).json({ message: 'المتجر غير موجود' });

        // منع التقييم المزدوج لنفس الطلب
        if (orderId) {
            const exists = await Rating.findOne({ client: req.user._id, order: orderId, targetType: 'place' });
            if (exists) return res.status(400).json({ message: 'لقد قيّمت هذا المتجر مسبقاً لهذا الطلب' });
        }

        await Rating.create({
            client:     req.user._id,
            targetType: 'place',
            targetId:   placeId,
            order:      orderId || null,
            orderModel: 'ShopOrder',
            score:      Number(score),
            comment:    comment || ''
        });

        // تحديث متوسط التقييم
        const stats = await Rating.aggregate([
            { $match: { targetType: 'place', targetId: place._id, isHidden: false } },
            { $group: { _id: null, avg: { $avg: '$score' }, count: { $sum: 1 } } }
        ]);
        if (stats.length > 0) {
            place.ratingAvg   = Math.round(stats[0].avg * 10) / 10;
            place.ratingCount = stats[0].count;
            await place.save();
        }

        res.status(201).json({ message: 'شكراً على تقييمك!', ratingAvg: place.ratingAvg, ratingCount: place.ratingCount });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ message: 'لقد قيّمت هذا المتجر مسبقاً' });
        logger.error('Place rate error:', e);
        res.status(500).json({ message: 'Server Error' });
    }
});

// تقييم منتج من عميل
router.post('/:placeId/products/:productId/rate', protect, async (req, res) => {
    try {
        const { score, comment, orderId } = req.body;
        const productId = req.params.productId;
        const placeId   = req.params.placeId;

        if (!score || score < 1 || score > 5) {
            return res.status(400).json({ message: 'التقييم يجب أن يكون بين 1 و 5 نجوم' });
        }

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });

        await Rating.create({
            client:     req.user._id,
            targetType: 'product',
            targetId:   productId,
            place:      placeId,
            order:      orderId || null,
            orderModel: 'ShopOrder',
            score:      Number(score),
            comment:    comment || ''
        });

        // تحديث متوسط تقييم المنتج
        const stats = await Rating.aggregate([
            { $match: { targetType: 'product', targetId: product._id, isHidden: false } },
            { $group: { _id: null, avg: { $avg: '$score' }, count: { $sum: 1 } } }
        ]);
        if (stats.length > 0) {
            product.ratingAvg   = Math.round(stats[0].avg * 10) / 10;
            product.ratingCount = stats[0].count;
            await product.save();
        }

        res.status(201).json({ message: 'شكراً على تقييمك!', ratingAvg: product.ratingAvg });
    } catch (e) {
        if (e.code === 11000) return res.status(400).json({ message: 'لقد قيّمت هذا المنتج مسبقاً' });
        logger.error('Product rate error:', e);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ============================================================
// 🛒 Admin Product Management — إدارة منتجات أي متجر من لوحة الأدمن
// ============================================================

// @route   GET /api/places/:placeId/products/admin  (admin: list all products of a store)
router.get('/:placeId/products/admin', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
        const products = await Product.find({ placeId: req.params.placeId })
            .sort({ category: 1, sortOrder: 1, createdAt: -1 });
        res.json(products);
    } catch (e) {
        logger.error('Admin list products error:', e);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   POST /api/places/:placeId/products  (admin: add product to a store)
router.post('/:placeId/products', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
        const place = await Place.findById(req.params.placeId);
        if (!place) return res.status(404).json({ message: 'المتجر غير موجود' });

        const { name, description, price, image, category, isAvailable } = req.body;
        if (!name || price === undefined || price === '') {
            return res.status(400).json({ message: 'الاسم والسعر مطلوبان' });
        }
        const numericPrice = Number(price);
        if (isNaN(numericPrice) || numericPrice < 0) {
            return res.status(400).json({ message: 'سعر غير صحيح' });
        }
        const product = await Product.create({
            placeId: place._id,
            name: name.trim(),
            description: description || '',
            price: numericPrice,
            image: image || '',
            category: category || 'عام',
            isAvailable: isAvailable === undefined ? true : !!isAvailable
        });
        res.status(201).json(product);
    } catch (e) {
        logger.error('Admin create product error:', e);
        res.status(500).json({ message: e.message || 'Server Error' });
    }
});

// @route   PUT /api/places/:placeId/products/:productId  (admin: edit product)
router.put('/:placeId/products/:productId', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
        const updateData = { ...req.body };
        delete updateData.placeId;
        delete updateData._id;
        if ('price' in updateData) {
            const np = Number(updateData.price);
            if (isNaN(np) || np < 0) return res.status(400).json({ message: 'سعر غير صحيح' });
            updateData.price = np;
        }
        const product = await Product.findOneAndUpdate(
            { _id: req.params.productId, placeId: req.params.placeId },
            updateData, { new: true }
        );
        if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });
        res.json(product);
    } catch (e) {
        logger.error('Admin update product error:', e);
        res.status(500).json({ message: e.message || 'Server Error' });
    }
});

// @route   DELETE /api/places/:placeId/products/:productId  (admin: delete product)
router.delete('/:placeId/products/:productId', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admins only' });
        const product = await Product.findOneAndDelete({ _id: req.params.productId, placeId: req.params.placeId });
        if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });
        res.json({ message: 'تم حذف المنتج بنجاح' });
    } catch (e) {
        logger.error('Admin delete product error:', e);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
