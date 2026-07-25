const mongoose = require('mongoose');

/**
 * 🏬 مكان خارجي تعلّمناه من استخدام العملاء.
 *
 * لماذا: نتائج بحث جوجل كانت تُرمى بعد إنشاء الطلب، فيدفع النظام ثمن نفس المحل
 * مرة بعد مرة. هنا نحفظ كل محلٍّ اختاره عميل فعلاً، فيصير البحث التالي عنه مجانياً
 * ومن قاعدتنا. تراكمياً: قاعدة أماكن سودانية حقيقية مبنية من طلبات فعلية، لا من
 * تخمين جوجل — والتكلفة تنزل كل شهر عن الذي قبله.
 *
 * ⚠️ هذه ليست متاجر مسجّلة (Place): لا مالك ولا منتجات ولا ساعات عمل — مجرد نقطة
 * على الخريطة يشتري منها الكابتن نيابةً عن العميل.
 */
const ExternalPlaceSchema = new mongoose.Schema({
    // معرّف جوجل حين توفّر — أمتن مفتاح لمنع التكرار
    googlePlaceId: { type: String, default: null, index: true, sparse: true },

    name:    { type: String, required: true },
    address: { type: String, default: '' },
    lat:     { type: Number, required: true },
    lng:     { type: Number, required: true },
    // نص التصنيف كما يعرضه جوجل (مطعم، صيدلية…) — للعرض
    category: { type: String, default: '' },
    // مفتاح تصنيفنا (grocery/restaurant…) — عليه يقوم الفرز والأيقونة في الواجهة
    categoryKey: { type: String, default: '' },

    city: { type: String, default: 'Khartoum', index: true },

    // كم مرة اختاره عميل فعلاً — يرتّب "الأكثر طلباً" ويميّز الحقيقي عن العابر
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// البحث بالاسم داخل المدينة — المسار الساخن قبل أي نداء لجوجل
ExternalPlaceSchema.index({ city: 1, name: 1 });
ExternalPlaceSchema.index({ city: 1, usageCount: -1 });

/**
 * يسجّل اختيار عميل لمكان: ينشئه أو يزيد عدّاده.
 * التطابق بـ googlePlaceId حين يتوفّر، وإلا بالاسم + إحداثيات مقرَّبة (~11 متراً)
 * حتى لا يتضاعف المكان بسبب فروق عشرية تافهة بين اختيارين.
 * @returns {Promise<object|null>} الوثيقة، أو null إن كانت المدخلات ناقصة
 */
ExternalPlaceSchema.statics.recordUsage = async function ({ googlePlaceId, name, address, lat, lng, category, categoryKey, city }) {
    const cleanName = String(name || '').trim().slice(0, 160);
    if (!cleanName || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const filter = googlePlaceId
        ? { googlePlaceId: String(googlePlaceId) }
        : { name: cleanName, lat: { $gte: lat - 0.0001, $lte: lat + 0.0001 }, lng: { $gte: lng - 0.0001, $lte: lng + 0.0001 } };

    return this.findOneAndUpdate(
        filter,
        {
            $set: {
                name: cleanName,
                address: String(address || '').slice(0, 300),
                lat, lng,
                category: String(category || '').slice(0, 80),
                categoryKey: String(categoryKey || '').slice(0, 30),
                city: city || 'Khartoum',
                lastUsedAt: new Date(),
                ...(googlePlaceId ? { googlePlaceId: String(googlePlaceId) } : {})
            },
            $inc: { usageCount: 1 }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
};

module.exports = mongoose.model('ExternalPlace', ExternalPlaceSchema);
