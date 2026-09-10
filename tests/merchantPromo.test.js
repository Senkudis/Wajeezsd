/**
 * 🎟️ أكواد الخصم التي يُنشئها التاجر.
 *
 * الضابط الوحيد الذي يهمّ هنا محاسبيّ: إيراد التاجر يُخصم منه الكوبون فقط
 * حين appliesTo === 'products' (routes/merchant-erp.js). فكودٌ على التوصيل
 * أو الإجمالي ينفق من عمولة المنصّة وأجرة الكابتن — أي أن التاجر يوزّع مال
 * غيره. لذلك appliesTo و places و merchantPlace و city تُفرض خادمياً **ولا
 * تُقرأ من الجسم إطلاقاً**: الحقل الذي لا يُقرأ لا يمكن تزويره.
 */
import { describe, it, expect } from 'vitest';

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'routes/merchant.js'), 'utf8');
const codeOnly = (s) => s.split(/\r?\n/)
    .filter(l => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
    .join('\n');

const PromoCode = require('../models/PromoCode');

// يُحدَّد بتصريح المسار كاملاً: '/promo-codes' وحدها تطابق GET و POST
// و PUT معاً، فكانت الكتلة المُقتطعة تخصّ مساراً غير الذي يفحصه الاختبار.
const blockOf = (decl) => {
    const i = src.indexOf(decl);
    if (i < 0) return '';
    const rest = src.slice(i + decl.length);
    const rel = rest.search(/\r?\nrouter\./);
    const j = rel < 0 ? -1 : i + decl.length + rel;
    return codeOnly(src.slice(i, j < 0 ? src.length : j));
};
const CREATE = blockOf("router.post('/promo-codes'");
const UPDATE = blockOf("router.put('/promo-codes/:id'");
const LIST   = blockOf("router.get('/promo-codes'");
const REMOVE = blockOf("router.delete('/promo-codes/:id'");

describe('مخطّط الملكية', () => {
    it('merchantPlace يفصل كود التاجر عن كود الإدارة', () => {
        const doc = new PromoCode({
            code: 'X', type: 'fixed', value: 10, validUntil: new Date(Date.now() + 86400000)
        });
        expect(doc.merchantPlace).toBeNull();   // كود إدارة افتراضاً
    });

    it('الملكية تُصرَّح ولا تُستنتج من places', () => {
        // الإدارة قد تُنشئ كوداً محصوراً بمتجر التاجر (حملة تدفعها المنصّة).
        // لو استُنتجت الملكية من places لاستطاع التاجر حذفه.
        const adminCode = new PromoCode({
            code: 'PLATFORM50', type: 'percentage', value: 50,
            places: ['507f1f77bcf86cd799430009'],
            validUntil: new Date(Date.now() + 86400000)
        });
        expect(adminCode.merchantPlace).toBeNull();
        expect(adminCode.places).toHaveLength(1);
    });
});

describe('الحقول المفروضة خادمياً', () => {

    it('appliesTo مثبَّت على products ولا يُقرأ من الجسم', () => {
        expect(CREATE).toContain("appliesTo: 'products'");
        expect(CREATE).not.toContain('req.body.appliesTo');
    });

    it('places و merchantPlace من متجر الطالب لا من الجسم', () => {
        expect(CREATE).toContain('places: [place._id]');
        expect(CREATE).toContain('merchantPlace: place._id');
        expect(CREATE).not.toContain('req.body.places');
        expect(CREATE).not.toContain('req.body.merchantPlace');
    });

    it('المدينة من المتجر لا من الجسم', () => {
        expect(CREATE).toContain('city: place.city');
        expect(CREATE).not.toContain('req.body.city');
    });

    it('createdBy من التوكن', () => {
        expect(CREATE).toContain('createdBy: req.user._id');
    });
});

describe('الملكية عند التعديل والحذف', () => {
    it('التعديل يُطابق merchantPlace في المرشّح لا بعد الجلب', () => {
        expect(UPDATE).toContain('merchantPlace: place._id');
        expect(UPDATE).toContain('_id: req.params.id');
    });

    it('الحذف كذلك — كود الإدارة لا يُطابَق أصلاً', () => {
        expect(REMOVE).toContain('findOneAndDelete({ _id: req.params.id, merchantPlace: place._id })');
    });

    it('الكود نفسه لا يُعدَّل بعد الإنشاء', () => {
        expect(UPDATE).not.toContain('existing.code =');
    });
});

describe('التحقّق من المدخلات', () => {
    const fn = codeOnly(src.slice(
        src.indexOf('async function buildMerchantPromoFields'),
        src.indexOf("router.get('/promo-codes'")
    ));

    it('نسبة فوق ١٠٠٪ مرفوضة', () => {
        expect(fn).toContain("type === 'percentage' && value > 100");
    });

    it('bogo يتطلّب قطعة واحدة على الأقل لكلٍّ من الشراء والمجان', () => {
        expect(fn).toContain('buy < 1');
        expect(fn).toContain('free < 1');
    });

    it('bogo يصفّر value و maxDiscount — لا معنى لهما فيه', () => {
        expect(fn).toContain('out.value = 0;');
        expect(fn).toContain('out.maxDiscount = null;');
    });

    it('المنتجات المشمولة يجب أن تكون من متجره', () => {
        expect(fn).toContain('placeId: place._id');
        expect(fn).toContain('ليست من متجرك');
    });

    it('تاريخ الانتهاء مطلوب وفي المستقبل', () => {
        expect(fn).toContain('until.getTime() <= Date.now()');
    });

    it('صيغة الكود مقيَّدة', () => {
        expect(CREATE).toContain('/^[A-Z0-9_-]{3,30}$/');
    });

    it('سقف للأكواد الفعّالة', () => {
        expect(CREATE).toContain('MERCHANT_PROMO_MAX_ACTIVE');
    });

    it('تصادم الكود يُشرح لا يُرمى 500', () => {
        expect(CREATE).toContain('11000');
    });
});

describe('الخصوصية', () => {
    it('usedBy لا يُرسل للتاجر — سجلٌّ بمعرّفات العملاء', () => {
        expect(LIST).toContain("select('-usedBy')");
        expect(LIST).toContain('merchantPlace: place._id');
    });
});
