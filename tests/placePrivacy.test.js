/**
 * خصوصية بيانات المتاجر البنكية.
 *
 * لماذا: مسارات المتاجر العامة كانت تُرجع مستند المتجر كاملاً بلا select، فكان
 * رقم الحساب البنكي واسم صاحبه ورصيد محفظة المتجر مقروءةً لأي زائر بلا تسجيل
 * دخول (16 متجراً من 16 على الإنتاج). لا اختبار كان يمسك هذا: المسار يعمل
 * ويُرجع 200 وبيانات صحيحة — التسريب في *الزائد* لا في الناقص.
 *
 * هذه الاختبارات تحرس الحاجز من جهتين: تعريف الحقول الخاصة، وأن المسارات
 * العامة تستدعي الاستبعاد فعلاً.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const {
    PLACE_PRIVATE_FIELDS,
    PLACE_PUBLIC_EXCLUDE,
    stripPlacePrivateFields
} = require('../models/Place');

describe('تعريف حقول المتجر الخاصة', () => {
    it('يشمل كل حقل مالي في مخطط المتجر', () => {
        // لو أُضيف حقل مالي جديد للمخطط ونُسي هنا، يفشل هذا الاختبار
        const schema = read('models/Place.js');
        const financial = [...schema.matchAll(/^\s{4}(bank[A-Za-z]+|shopWallet[A-Za-z]+)\s*:/gm)]
            .map(m => m[1]);
        expect(financial.length).toBeGreaterThan(0);
        for (const f of financial) expect(PLACE_PRIVATE_FIELDS).toContain(f);
    });

    it('صيغة الاستبعاد صالحة لـ mongoose select', () => {
        expect(PLACE_PUBLIC_EXCLUDE).toBe(PLACE_PRIVATE_FIELDS.map(f => `-${f}`).join(' '));
        for (const f of PLACE_PRIVATE_FIELDS) expect(PLACE_PUBLIC_EXCLUDE).toContain(`-${f}`);
    });
});

describe('stripPlacePrivateFields', () => {
    it('يحذف الحقول المالية ويُبقي ما تحتاجه الواجهة', () => {
        const out = stripPlacePrivateFields({
            name: 'متجر', phone: '0912', address: 'الحارة 39', image_url: '/x.jpg',
            bankAccountName: 'اسم صاحب الحساب', bankAccountNumber: '941912345',
            bankName: 'بنك الخرطوم', shopWalletBalance: 15000
        });
        for (const f of PLACE_PRIVATE_FIELDS) expect(out[f]).toBeUndefined();
        expect(out.name).toBe('متجر');
        expect(out.phone).toBe('0912');
        expect(out.address).toBe('الحارة 39');
    });

    it('لا يرمي على مدخل غير كائن', () => {
        for (const bad of [null, undefined, 'x', 5]) {
            expect(() => stripPlacePrivateFields(bad)).not.toThrow();
        }
    });
});

describe('المسارات العامة تستبعد البيانات البنكية', () => {
    const src = read('routes/places.js');

    // نلتقط كل استعلام Place.find/findById في الملف ونتأكد أن العام منها مُقيَّد
    it('قائمة المتاجر وصفحة المتجر والبحث تستدعي الاستبعاد', () => {
        // الاستبعاد صار PLACE_CLIENT_EXCLUDE (بنكي + أرقام اتصال) بعد حجب رقم المتجر
        expect(src).toContain('PLACE_CLIENT_EXCLUDE');
        const uses = src.split('PLACE_CLIENT_EXCLUDE').length - 1;
        expect(uses).toBeGreaterThanOrEqual(4); // 1 استيراد + 3 استخدامات
    });

    it('صفحة المتجر تمرّ بشبكة أمان تحذف الحقول المحجوبة', () => {
        expect(src).toContain('stripPlaceClientFields(place.toJSON())');
    });

    it('لا يوجد Place.find بلا select في المسارات العامة', () => {
        // Place.find(...) مباشرة بلا .select ولا داخل حماية protect = تسريب محتمل
        const bare = [...src.matchAll(/Place\.find\(([^)]*)\)\s*\n?\s*\.populate/g)];
        // المسموح: أن يكون كل استعلام تالٍ لـ populate مسبوقاً بـ select
        for (const m of bare) {
            const around = src.slice(Math.max(0, m.index - 200), m.index + 200);
            expect(around).toContain('PLACE_CLIENT_EXCLUDE');
        }
    });
});

describe('حجب رقم المتجر عن العميل', () => {
    const {
        PLACE_CONTACT_FIELDS,
        PLACE_CLIENT_EXCLUDE,
        stripPlaceClientFields
    } = require('../models/Place');

    it('الهاتف والواتساب في قائمة الحجب عن العميل', () => {
        expect(PLACE_CONTACT_FIELDS).toEqual(['phone', 'whatsapp']);
        for (const f of PLACE_CONTACT_FIELDS) expect(PLACE_CLIENT_EXCLUDE).toContain(`-${f}`);
    });

    it('حجب العميل يشمل البيانات البنكية أيضاً — لا يستبدلها', () => {
        for (const f of PLACE_PRIVATE_FIELDS) expect(PLACE_CLIENT_EXCLUDE).toContain(`-${f}`);
    });

    it('stripPlaceClientFields يحذف الأرقام ويُبقي ما يحتاجه العرض', () => {
        const out = stripPlaceClientFields({
            name: 'مغسلة', address: 'أم درمان', image_url: '/x.jpg', is_open: true,
            phone: '0961234567', whatsapp: '0961234567',
            bankAccountNumber: '999', shopWalletBalance: 500
        });
        expect(out.phone).toBeUndefined();
        expect(out.whatsapp).toBeUndefined();
        expect(out.bankAccountNumber).toBeUndefined();
        expect(out.name).toBe('مغسلة');
        expect(out.is_open).toBe(true);
    });

    it('المسارات العامة تستعمل حجب العميل لا الحجب البنكي وحده', () => {
        const src = read('routes/places.js');
        expect(src).toContain('PLACE_CLIENT_EXCLUDE');
        expect(src).not.toContain('PLACE_PUBLIC_EXCLUDE');
    });

    it('السيرفر يشتقّ هاتف المتجر للكابتن ولا يقبله من العميل', () => {
        // لو عاد الاعتماد على ما يرسله العميل، لوصل الكابتن رقماً فارغاً
        const src = read('routes/orders.js');
        expect(src).toContain('contactPhone: place.phone');
        expect(src).toContain('orderData.shopPhone = place.phone');
    });

    it('التحقق لا يطالب العميل بهاتف الاستلام في طلب المتجر', () => {
        // وإلا رُفضت كل طلبات المتاجر بـ 400 بعد حجب الرقم
        const src = read('middleware/validateMiddleware.js');
        expect(src).toContain("orderType === 'shop'");
        expect(src).toContain('isShopOrder');
    });

    it('صفحة المتجر لا تعرض رابط اتصال بالمتجر', () => {
        const html = read('public_html/shop-detail.html');
        expect(html).not.toContain('tel:${shopData.phone}');
    });
});

describe('حقن أسماء المستخدمين في لوحة الإدارة', () => {
    it('صفحة المالية لا تمرّر اسم الكابتن داخل onclick', () => {
        // كان: onclick="quickAdjustDebt('${c._id}', '${c.name}', ...)" — كابتن يسمّي
        // نفسه بعلامة تنصيص يخرج من النص ويُنفّذ كوده في متصفح الأدمن
        const html = read('public_html/admin-finance.html');
        expect(html).not.toMatch(/onclick="[^"]*\$\{c\.name\}/);
        expect(html).not.toMatch(/onclick="[^"]*\$\{[^}]*\.name\}/);
    });

    it('صفحة المالية تهرّب اسم الكابتن ورقمه وملاحظة القيد', () => {
        const html = read('public_html/admin-finance.html');
        expect(html).toContain('const esc =');
        expect(html).toContain('${esc(c.name)');
        expect(html).toContain('${esc(captainName)}');
    });

    it('صفحة منتجات التاجر لا تمرّر اسم المنتج داخل onclick', () => {
        // اسم فيه علامة تنصيص كان يكسر الزر وظيفياً أيضاً لا أمنياً فقط
        const html = read('public_html/merchant-products.html');
        expect(html).not.toMatch(/onclick="deleteProduct\([^)]*\$\{p\.name\}/);
    });

    it('قائمة المحادثات تهرّب اسم الطرف الآخر وآخر رسالة', () => {
        const html = read('public_html/conversations.html');
        expect(html).toContain('esc(conv.user.name)');
        expect(html).toContain('esc(conv.lastMessage)');
    });
});

/**
 * ⚠️ الثغرة التي فاتت الجولة الأولى.
 *
 * الاختبارات أعلاه تحرس routes/places.js وحده، بينما المسار الذي تستدعيه صفحة
 * المتجر فعلياً لكل زائر يعيش في routes/merchant.js:
 *     GET /api/merchant/shop/:placeId/products
 * وكان يُرجع place.toJSON() كاملاً بلا select — أي اسم صاحب الحساب البنكي
 * ورقمه ورصيد محفظة المتجر وهاتفه، لأي شخص بلا تسجيل دخول. أُكِّد ذلك حيّاً
 * على بيانات الإنتاج قبل الإصلاح.
 *
 * الدرس المعمّم في هذه الاختبارات: الحراسة تكون على *كل* مسارٍ عام يُرجع
 * مستند متجر، لا على ملفٍ واحد اتُّفق أنه محلّ المشكلة يومها.
 */
describe('مسار منتجات المتجر العام (routes/merchant.js)', () => {
    const src = read('routes/merchant.js');

    it('يستورد مرشّح حقول العميل', () => {
        expect(src).toContain('PLACE_CLIENT_EXCLUDE');
        expect(src).toContain('stripPlaceClientFields');
    });

    it('استعلام المتجر في المسار العام مُقيَّد بالاستبعاد', () => {
        // نلتقط الاستعلام الذي يخدم /shop/:placeId/products تحديداً
        const idx = src.indexOf("router.get('/shop/:placeId/products'");
        expect(idx).toBeGreaterThan(-1);
        const handler = src.slice(idx, idx + 1600);
        expect(handler).toContain('PLACE_CLIENT_EXCLUDE');
    });

    it('الاستجابة تمرّ بشبكة الأمان لا بـ toJSON خاماً', () => {
        const idx = src.indexOf("router.get('/shop/:placeId/products'");
        const handler = src.slice(idx, idx + 1600);
        expect(handler).toContain('stripPlaceClientFields(place.toJSON())');
        // النمط القديم الذي سرّب: res.json({ place: place.toJSON(), ... })
        expect(handler).not.toMatch(/place:\s*place\.toJSON\(\)/);
    });
});

describe('زر مشاركة المتجر في صفحة المتجر', () => {
    const html = read('public_html/shop-detail.html');

    it('الزر موجود ويستدعي دالة المشاركة', () => {
        expect(html).toContain('id="shopShareBtn"');
        expect(html).toContain('window.shareShop');
    });

    it('يظهر للزائر غير المسجَّل — لا يُشترط له حساب', () => {
        // المفضّلة تُظهَر بـ JS بعد التحقّق من التوكن؛ المشاركة تولد ظاهرة.
        // لو فُقد الصنف visible من الترميز عاد الزر مخفياً بلا أن يلاحظ أحد.
        expect(html).toMatch(/id="shopShareBtn"[\s\S]{0,200}class="shop-hero-action visible"|class="shop-hero-action visible"[\s\S]{0,200}id="shopShareBtn"/);
    });

    it('يُفضّل الرابط القصير ويسقط إلى الطويل عند غياب الكود', () => {
        // الرابط القصير وحده يحمل وسوم Open Graph (routes/share.js)،
        // والمتاجر القديمة بلا كود يجب أن تبقى قابلة للمشاركة لا معطّلة.
        expect(html).toContain('/s/${shopData.shareCode}');
        expect(html).toContain('shop-detail.html?placeId=${placeId}');
    });
});
