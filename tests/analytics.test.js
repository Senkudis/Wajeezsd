/**
 * 📈 قياس المنتج.
 *
 * لم يكن في المشروع أي قياس: لا gtag ولا Firebase Analytics ولا شيء. فلا
 * إجابة على «أين يسقط المستخدم في التسجيل؟» ولا «كم نسبة من يفتح متجراً
 * ثم يطلب؟» — فيُطوَّر بالحدس.
 *
 * وما تحرسه هذه الاختبارات ثلاثة:
 *
 *   ١. **العدّاد الصامت**: حدثٌ باسمٍ مطبعيّ خاطئ كان سيُكتب في حقلٍ غير
 *      موجود في المخطّط فيسقط صامتاً، فتبقى اللوحة تقول صفراً وتُقرأ «لا
 *      أحد يفعل هذا» بينما الحقيقة «لا أحد يقيسه». وهذا أسوأ من غياب
 *      القياس: رقمٌ كاذب يُبنى عليه قرار.
 *   ٢. **النِّسَب**: كل نسبة تُحسب على خطوتها السابقة لا على القمّة. خلطهما
 *      يخفي أين يقع التسرّب فعلاً.
 *   ٣. **الخصوصية**: لا شيء هنا يخصّ فرداً — أعدادٌ مجمَّعة فقط.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const analytics = require('../utils/analytics');
const { buildIncrement, summarize, normalizeCity, EVENTS } = analytics;

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

describe('🔴 العدّاد الصامت ممنوع', () => {
    it('كل حدثٍ في القائمة له حقلٌ في المخطّط', () => {
        // حدثٌ بلا حقل يُكتب في العدم: $inc على حقلٍ غير موجود لا يرمي
        const model = read('models', 'DailyStat.js');
        const missing = EVENTS.filter(e => !new RegExp('\\b' + e + ':\\s*\\{').test(model));
        expect(missing).toEqual([]);
    });

    it('وكل حقلٍ عدّاد في المخطّط له حدثٌ يملؤه', () => {
        // حقلٌ بلا حدث عمودٌ يبقى صفراً في اللوحة بلا سبب
        const model = read('models', 'DailyStat.js');
        const fields = [...model.matchAll(/^\s{4}(\w+):\s*\{ type: Number/gm)].map(m => m[1]);
        expect(fields.length).toBeGreaterThan(0);
        const orphans = fields.filter(f => !EVENTS.includes(f));
        expect(orphans).toEqual([]);
    });

    it('واسمٌ مجهول لا يُكتب — يُردّ null', () => {
        expect(buildIncrement('orderCreated')).toEqual({ orderCreated: 1 });
        expect(buildIncrement('orderCreatd')).toBeNull();
        expect(buildIncrement('')).toBeNull();
        expect(buildIncrement(undefined)).toBeNull();
    });

    it('واسمٌ مجهول يصرخ في السجلّ بدل أن يُبتلع', () => {
        const src = read('utils', 'analytics.js');
        expect(src).toContain('logger.error');
        expect(src).toContain('حدث غير معروف');
    });
});

describe('المدينة لا تُفجّر الوثائق', () => {
    it('المدن المعروفة تمرّ كما هي', () => {
        expect(normalizeCity('Khartoum')).toBe('Khartoum');
        expect(normalizeCity('PortSudan')).toBe('PortSudan');
    });

    it('وكل ما عداها يُجمع تحت unknown', () => {
        // بلا هذا تصير كل قيمة يرسلها العميل وثيقةً يومية جديدة
        for (const v of [undefined, null, '', 'Cairo', '<script>', 'خرطوم', 123]) {
            expect(normalizeCity(v)).toBe('unknown');
        }
    });
});

describe('النِّسَب تُحسب على الخطوة السابقة', () => {
    const rows = [
        { storeOpened: 60, orderCreated: 30, orderAccepted: 24, orderDelivered: 18, orderCancelled: 3 },
        { storeOpened: 40, orderCreated: 20, orderAccepted: 16, orderDelivered: 12, orderCancelled: 1 }
    ];

    it('المجاميع تُطبق الأيام', () => {
        const s = summarize(rows);
        expect(s.totals.storeOpened).toBe(100);
        expect(s.totals.orderCreated).toBe(50);
        expect(s.totals.orderDelivered).toBe(30);
    });

    it('🔴 وكل نسبةٍ على سابقتها لا على القمّة', () => {
        const f = summarize(rows).funnels.order;
        expect(f.openToOrder).toBe(50);       // 50 من 100
        expect(f.orderToAccept).toBe(80);     // 40 من 50
        expect(f.acceptToDeliver).toBe(75);   // 30 من 40
        // لو حُسبت على القمّة لصارت 30% — ولبدا أن العطل في التسليم
        // بينما التسرّب الأكبر بين فتح المتجر وإنشاء الطلب.
        expect(f.acceptToDeliver).not.toBe(30);
    });

    it('ونسبة الإلغاء على الطلبات المنشأة', () => {
        expect(summarize(rows).funnels.order.cancelRate).toBe(8);  // 4 من 50
    });

    it('والقسمة على صفرٍ تعطي null لا NaN ولا صفراً', () => {
        // صفرٌ يُقرأ «لا أحد أكمل»، و null يُقرأ «لا بيانات» — وهما مختلفان
        const f = summarize([]).funnels;
        expect(f.register.completionRate).toBeNull();
        expect(f.order.openToOrder).toBeNull();
        expect(f.otp.verifyRate).toBeNull();
    });

    it('وصفوفٌ ناقصةٌ الحقول لا تكسر الجمع', () => {
        const s = summarize([{ orderCreated: 5 }, {}, { orderCreated: null }, { orderCreated: 'x' }]);
        expect(s.totals.orderCreated).toBe(5);
        expect(s.totals.storeOpened).toBe(0);
    });

    it('ولا مدخلٌ غائبٌ أصلاً', () => {
        expect(() => summarize(undefined)).not.toThrow();
        expect(summarize(null).totals.orderCreated).toBe(0);
    });
});

describe('القياس لا يعطّل شيئاً', () => {
    it('track ليست async — فلا يستطيع النداء أن ينتظرها أصلاً', () => {
        const src = read('utils', 'analytics.js');
        // الكتابة تقع داخل Promise منفصل (وفيه await، وهذا صحيح)، أما track
        // نفسها فمتزامنة وتعود فوراً: مسار الاستجابة لا يُعلَّق عليها.
        expect(src).toContain('function track(event, { city } = {})');
        expect(src).not.toContain('async function track');
        expect(src).toContain('Promise.resolve()');
        expect(src).toContain('.catch(');
    });

    it('والنداء في المسارات بلا await — وإلا صار القياس في طريق العميل', () => {
        for (const f of [['routes', 'orders.js'], ['routes', 'auth.js'], ['routes', 'places.js']]) {
            const src = read(...f);
            expect(src, f.join('/')).not.toMatch(/await\s+(analytics\.)?track\(/);
            expect(src, f.join('/')).not.toMatch(/await\s+require\('\.\.\/utils\/analytics'\)/);
        }
    });

    it('ونداءٌ بحدثٍ مجهول لا يرمي', () => {
        expect(() => analytics.track('nope', { city: 'Khartoum' })).not.toThrow();
    });
});

describe('🔒 لا بيانات تخصّ فرداً', () => {
    it('المخطّط أعدادٌ فقط — لا مستخدم ولا جهاز ولا جلسة', () => {
        const model = read('models', 'DailyStat.js');
        for (const forbidden of ['userId', 'deviceId', 'sessionId', 'ip', 'phone']) {
            expect(model, forbidden).not.toContain(forbidden);
        }
    });

    it('وtrack لا يقبل إلا المدينة', () => {
        const src = read('utils', 'analytics.js');
        expect(src).toContain('function track(event, { city } = {})');
    });

    it('ولا خدمة خارجية: البيانات لا تغادر الخادم', () => {
        const src = read('utils', 'analytics.js');
        for (const vendor of ['gtag', 'google-analytics', 'mixpanel', 'posthog', 'segment', 'axios', 'fetch(']) {
            expect(src, vendor).not.toContain(vendor);
        }
    });
});

describe('الوصل بالمسارات الفعلية', () => {
    it('مسار الطلب مقيسٌ من أوّله إلى آخره', () => {
        const orders = read('routes', 'orders.js');
        for (const e of ['orderCreated', 'orderAccepted', 'orderDelivered', 'orderCancelled']) {
            expect(orders, e).toContain("analytics.track('" + e + "'");
        }
    });

    it('🔴 والقبول يُعدّ بعد التحديث الذرّي لا قبله', () => {
        // قبله يُعدّ كل كابتن حاول، فتصير النسبة أكبر من مئة بالمئة
        const s = read('routes', 'orders.js');
        const i = s.indexOf("analytics.track('orderAccepted'");
        expect(i).toBeGreaterThan(-1);
        const before = s.slice(0, i);
        expect(before).toContain('const order = updatedOrder;');
    });

    it('والتسليم يُعدّ بعد حارس التكرار', () => {
        const s = read('routes', 'orders.js');
        const i = s.indexOf("analytics.track('orderDelivered'");
        const guard = s.indexOf("return res.json({ message: 'Order delivered', order: existing });");
        expect(guard).toBeGreaterThan(-1);
        expect(i).toBeGreaterThan(guard);
    });

    it('ومسار التسجيل يُعدّ المحاولة والنجاح معاً — الفارق هو التسرّب', () => {
        const auth = read('routes', 'auth.js');
        expect(auth).toContain("analytics.track('registerStarted'");
        expect(auth).toContain("analytics.track('registerCompleted'");
        expect(auth).toContain("analytics.track('otpSent'");
        expect(auth).toContain("analytics.track('otpVerified'");
    });

    it('وفتح المتجر والانضمام مقيسان', () => {
        expect(read('routes', 'places.js')).toContain("track('storeOpened'");
        expect(read('routes', 'auth.js')).toContain("analytics.track('captainSignup'");
        expect(read('routes', 'merchantRequests.js')).toContain("track('merchantRequest'");
    });
});

describe('القراءة للإدارة', () => {
    const route = read('routes', 'admin', 'subadmins.js');

    it('المسار موجودٌ ومحميّ للمسؤول الرئيسي', () => {
        expect(route).toContain("router.get('/analytics', protect, superAdminOnly");
    });

    it('والنطاق محدودٌ بتسعين يوماً', () => {
        expect(route).toContain('Math.min(90, Number(req.query.days)');
    });

    it('ويردّ المجاميع والمسارات والسلسلة اليومية', () => {
        expect(route).toContain('analytics.summarize(rows)');
        expect(route).toContain('daily: rows');
    });

    it('والمدينة تُطبَّع قبل الاستعلام — لا تُحقن كما جاءت', () => {
        expect(route).toContain('analytics.normalizeCity(req.query.city)');
    });
});
