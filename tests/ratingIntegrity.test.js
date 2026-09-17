/**
 * 🧾 لا تقييم بلا شراء.
 *
 * العطل: مسارا تقييم المتجر والمنتج كانا يقبلان orderId **اختيارياً** ولا
 * يفحصانه: لا مِلكية، ولا ارتباطاً بالمتجر، ولا تسليماً. وفحص التكرار
 * الوحيد كان مقيّداً بـ client: req.user._id، فيكفي معرّفٌ عشوائيّ جديد في
 * كل مرّة ليمرّ الفحص ويُنشأ تقييم.
 *
 * أي أن أي حسابٍ يرفع متجراً أو يخفضه بلا حدّ بلا أن يطلب منه مرّةً —
 * ونجوم المتجر تُحسب من هذه التقييمات مباشرة.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('التحقّق من الشراء', () => {
    const src = read('utils/verifyPurchase.js');

    it('🔑 المِلكية والمتجر في الاستعلام نفسه — لا وجودُ الطلب وحده', () => {
        expect(src).toMatch(/_id: orderId,\s*\n\s*client: clientId,\s*\n\s*place: placeId/);
    });

    it('🔑 يشترط التسليم — لا تقييم لطلبٍ جارٍ أو ملغى', () => {
        expect(src).toMatch(/status !== 'delivered'/);
    });

    it('معرّف غير صالح يُردّ قبل أي استعلام', () => {
        expect(src).toContain('isValid(String(orderId))');
    });

    it('تقييم المنتج يشترط أنه ضمن مشتريات الطلب', () => {
        expect(src).toMatch(/order\.items \|\| \[\]\)\.some/);
    });
});

describe('🔗 المساران يستعملانه', () => {
    const src = read('routes/places.js');
    const placeRoute = src.slice(src.indexOf("router.post('/:id/rate'"), src.indexOf("router.post('/:placeId/products/:productId/rate'"));
    const prodRoute  = src.slice(src.indexOf("router.post('/:placeId/products/:productId/rate'"));

    it('🔑 تقييم المتجر: لا يمرّ بلا تحقّق', () => {
        expect(placeRoute).toContain('verifyShopPurchase');
        expect(placeRoute).toMatch(/if \(!purchase\.ok\)/);
    });

    it('🔑 ولم يعد الفحص مشروطاً بوجود orderId — غيابه كان يتخطّاه كلّه', () => {
        expect(placeRoute).not.toMatch(/if \(orderId\) \{[\s\S]{0,200}Rating\.findOne/);
    });

    it('🔑 تقييم المنتج: تحقّقٌ ومنعُ تكرار — لم يكن فيه أيٌّ منهما', () => {
        expect(prodRoute).toContain('verifyShopPurchase');
        expect(prodRoute).toMatch(/targetType: 'product', targetId: productId/);
    });

    it('التحقّق يسبق الإنشاء في المسارين', () => {
        for (const r of [placeRoute, prodRoute]) {
            expect(r.indexOf('verifyShopPurchase')).toBeLessThan(r.indexOf('Rating.create'));
        }
    });
});
