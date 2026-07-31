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
        expect(src).toContain('PLACE_PUBLIC_EXCLUDE');
        // ثلاثة مواضع عامة: القائمة، البحث، صفحة المتجر
        const uses = src.split('PLACE_PUBLIC_EXCLUDE').length - 1;
        expect(uses).toBeGreaterThanOrEqual(4); // 1 استيراد + 3 استخدامات
    });

    it('صفحة المتجر تمرّ بشبكة الأمان stripPlacePrivateFields', () => {
        expect(src).toContain('stripPlacePrivateFields(place.toJSON())');
    });

    it('لا يوجد Place.find بلا select في المسارات العامة', () => {
        // Place.find(...) مباشرة بلا .select ولا داخل حماية protect = تسريب محتمل
        const bare = [...src.matchAll(/Place\.find\(([^)]*)\)\s*\n?\s*\.populate/g)];
        // المسموح: أن يكون كل استعلام تالٍ لـ populate مسبوقاً بـ select
        for (const m of bare) {
            const around = src.slice(Math.max(0, m.index - 200), m.index + 200);
            expect(around).toContain('PLACE_PUBLIC_EXCLUDE');
        }
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
