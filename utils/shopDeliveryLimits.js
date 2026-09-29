/**
 * 🚚 حدود سعر توصيل طلب المتجر — مرآة getShopDeliveryLimits في shop-detail.html.
 *
 * العميل يقترح سعر التوصيل، والحدّ الأدنى (أقصى تخفيض) والأعلى (سقف الزيادة)
 * من إعدادات المدينة. كان يُفحص في الصفحة وحدها: طلبٌ يُرسَل للـ API مباشرة
 * بسعر 100 ج.س لمشوار 10 كم كان يُقبل — والكابتن يرى طلباً لا يغطّي وقوده.
 *
 * ⚠️ الصيغة **نفسها** التي في الصفحة حرفاً بحرف (بما فيها معامل التعرّج 1.4
 *    على المسافة المستقيمة) — لا utils/tripPricing التي لا تضربها فيه. صيغتان
 *    مختلفتان تعني أن الصفحة تقبل سعراً يرفضه الخادم.
 */
const TORTUOSITY = 1.4;

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * @param {object} settings إعدادات مدينة المتجر
 * @param {{lat,lng}|null} shop  موقع المتجر
 * @param {{lat,lng}|null} dest  نقطة التسليم
 * @returns {{estimated, minAllowed, maxAllowed, distKm|null}}
 */
function shopDeliveryLimits(settings, shop, dest) {
    const s = settings || {};
    const baseFare = s.baseFare || 1000;
    const perKm = s.costPerKm || 200;
    const maxDiscountPercent = typeof s.maxDiscountPercent === 'number' ? s.maxDiscountPercent : 10;
    const maxPriceSurgePercent = typeof s.maxPriceSurgePercent === 'number' ? s.maxPriceSurgePercent : 100;

    // isUsableCoord لا Number.isFinite: Number(null) = 0، فتسليمٌ بلا دبوس كان
    // يُقرأ (0, 0) في خليج غينيا — وحدٌّ أدنى بمئات آلاف الجنيهات
    const { isUsableCoord } = require('./coords');
    const ok = (p) => !!p && isUsableCoord(p.lat, p.lng);
    if (!ok(shop) || !ok(dest)) {
        // بلا موقعين: الأجرة الأساسية أرضيّة، والسقف حدّ الطلب المطلق
        return { estimated: baseFare, minAllowed: baseFare, maxAllowed: 1000000, distKm: null };
    }
    const distKm = haversineKm(Number(dest.lat), Number(dest.lng), Number(shop.lat), Number(shop.lng)) * TORTUOSITY;
    const estimated = Math.ceil((baseFare + distKm * perKm) / 100) * 100;
    const minAllowed = Math.max(baseFare, Math.ceil((estimated * (1 - maxDiscountPercent / 100)) / 100) * 100);
    const maxAllowed = Math.ceil((estimated * (1 + maxPriceSurgePercent / 100)) / 100) * 100;
    return { estimated, minAllowed, maxAllowed, distKm };
}

module.exports = { shopDeliveryLimits, TORTUOSITY };
