/**
 * 🔓 التصفّح بلا حساب — سبب رفض آبل لإصدار 1.4.2 (32).
 *
 *   Guideline 5.1.1(v): «The app requires customers to register before
 *   browsing products and stores. Registration can only be required for
 *   account-based features like adding to cart or checking out.»
 *
 * وكان ذلك صحيحاً حرفياً: صفحة التسوّق تستبدل شبكة التصنيفات ببطاقة تقول
 * «يجب عليك تسجيل الدخول أو إنشاء حساب لعرض المحلات»، وشبكة التصنيفات
 * نفسها مُخفاة بـ CSS قبل ذلك.
 *
 * القاعدة التي نحرسها هنا: كل ما يُعرض (التصنيفات، المحلات، المنتجات،
 * الأسعار، التقييمات، البحث) مفتوح. والحساب يُطلب عند السلة والطلب
 * والمفضّلة والمحادثة — وهي ميزات حسابية بنصّ التوجيه نفسه.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const readPub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public_html', f), 'utf8');
const readSrv = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const shopPage = readPub('client-order.html');
const feature = readPub('js/order-feature.js');
const detail = readPub('shop-detail.html');
const placesRoute = readSrv('routes/places.js');
const merchantRoute = readSrv('routes/merchant.js');

describe('لا بوّابة تسجيل أمام التصفّح', () => {
    it('لم تبقَ عبارة «يجب عليك تسجيل الدخول ... لعرض المحلات»', () => {
        for (const src of [shopPage, feature]) {
            expect(src).not.toContain('يجب عليك تسجيل الدخول أو إنشاء حساب لعرض المحلات');
        }
    });

    it('ولا بطاقة الزائر التي كانت تحلّ محلّ المحتوى', () => {
        expect(shopPage).not.toContain('class="guest-card"');
        expect(feature).not.toContain('id="guest-view"');
    });

    it('ولا إخفاءٌ لشبكة التصنيفات عن غير المسجَّل', () => {
        expect(shopPage).not.toContain('#categories-grid { visibility: hidden; }');
    });

    it('التصنيفات تُجلب بلا شرط توكن', () => {
        const i = shopPage.indexOf("document.addEventListener('DOMContentLoaded'");
        const blk = shopPage.slice(i, i + 1800);
        // fetchCategories قبل أي تفريع على وجود التوكن
        expect(blk.indexOf('fetchCategories();')).toBeLessThan(blk.indexOf('if (token)'));
    });

    it('والمحلات القريبة تُعرض للزائر كما تُعرض لصاحب الحساب', () => {
        const i = shopPage.indexOf('} else {');
        const blk = shopPage.slice(i, i + 500);
        expect(blk).toContain('loadFeaturedShops()');
    });

    it('showOrderSection لم يعد يفحص التوكن', () => {
        const i = feature.indexOf('window.showOrderSection');
        const blk = feature.slice(i, i + 1400);
        expect(blk).not.toContain("localStorage.getItem('token')");
    });
});

describe('ما يبقى خلف الحساب — وهو حسابيٌّ فعلاً', () => {
    it('المفضّلة لا تُحمَّل للزائر', () => {
        const i = shopPage.indexOf('if (token) {');
        const blk = shopPage.slice(i, i + 700);
        expect(blk).toContain('loadFavoriteIds');
        expect(blk).toContain('loadFavoritePlaces');
    });

    it('الإضافة للسلة تطلب الدخول — وتترك خيار متابعة التصفّح', () => {
        expect(detail).toContain('تصفح كزائر');
        expect(detail).toContain('الرجاء تسجيل الدخول أولاً لإضافة المنتجات لسلتك');
    });
});

describe('الدعوة دعوةٌ لا حاجز', () => {
    it('شريطٌ يُغلَق ويبقى مغلقاً', () => {
        expect(shopPage).toContain('function showGuestInvite');
        expect(shopPage).toContain('guestInviteDismissed');
        expect(shopPage).toContain('window.dismissGuestInvite');
    });

    it('ونصّه يقول إن الحساب للطلب لا للتصفّح', () => {
        expect(shopPage).toContain('تصفّح المحلات والمنتجات بحرّية');
    });
});

describe('البحث الخارجي المدفوع: يشرح ولا يحوّل صامتاً', () => {
    it('لا تحويل مباشر إلى صفحة الدخول', () => {
        const search = readPub('js/smart-search.js');
        const i = search.indexOf('function deepErrandSearch');
        const blk = search.slice(i, i + 1400);
        expect(blk).not.toMatch(/^\s*if \(!localStorage\.getItem\('token'\)\) \{ window\.location\.href/m);
        expect(blk).toContain('أكمل التصفّح');
    });
});

describe('الخادم يخدم الزائر فعلاً', () => {
    it('التصنيفات والمحلات والبحث وصفحة المحل بلا protect', () => {
        for (const line of ["router.get('/categories', async",
                            "router.get('/', async",
                            "router.get('/search', async",
                            "router.get('/:id', async"]) {
            expect(placesRoute).toContain(line);
        }
    });

    it('ومنتجات المتجر كذلك', () => {
        expect(merchantRoute).toContain("router.get('/shop/:placeId/products', async");
    });
});
