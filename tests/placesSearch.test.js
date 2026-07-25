/**
 * Unit tests — حصر نتائج بحث "اشترِ لي" جغرافياً.
 *
 * لماذا تستحق التغطية: هاتان الدالتان تقرّران أي محلٍّ يراه العميل وأيٌّ يُحجب.
 * خطأ فيهما إما يعرض محلات من خارج البلد (حدث فعلاً: المسجد النبوي في نتائج
 * "الحرمين")، أو يُخفي محلات مشروعة فتبدو الخدمة معطّلة.
 */
const { isInsidePolygon } = require('../utils/geofence');
const { clampToCity, centerFor, CITY_CENTERS } = require('../utils/placesSearch');

// منطقة التوصيل الافتراضية في الإعدادات — مربع حول وسط الخرطوم
const ZONE = [
    { lat: 15.750, lng: 32.400 },
    { lat: 15.750, lng: 32.650 },
    { lat: 15.450, lng: 32.650 },
    { lat: 15.450, lng: 32.400 }
];

const place = (name, lat, lng) => ({ name, lat, lng, address: '', source: 'google' });

describe('isInsidePolygon', () => {
    it('يقبل نقطة في وسط المضلّع', () => {
        expect(isInsidePolygon(15.60, 32.53, ZONE)).toBe(true);
    });

    it('يرفض نقطة خارج المضلّع', () => {
        expect(isInsidePolygon(15.90, 32.45, ZONE)).toBe(false);   // شمال المنطقة
        expect(isInsidePolygon(15.60, 32.80, ZONE)).toBe(false);   // شرقها
    });

    it('يرفض نقطة في بلد آخر', () => {
        expect(isInsidePolygon(24.4672, 39.6112, ZONE)).toBe(false); // المدينة المنورة
    });

    it('🔒 يرفض بأمان حين يكون المضلّع ناقصاً أو غائباً', () => {
        expect(isInsidePolygon(15.60, 32.53, [])).toBe(false);
        expect(isInsidePolygon(15.60, 32.53, null)).toBe(false);
        expect(isInsidePolygon(15.60, 32.53, [{ lat: 15.5, lng: 32.5 }, { lat: 15.6, lng: 32.6 }])).toBe(false);
    });

    it('🔒 يرفض الإحداثيات غير الرقمية', () => {
        expect(isInsidePolygon(NaN, 32.53, ZONE)).toBe(false);
        expect(isInsidePolygon(15.60, undefined, ZONE)).toBe(false);
    });
});

describe('clampToCity', () => {
    it('يُبقي محلات داخل صندوق المدينة حين لا توجد منطقة توصيل', () => {
        const out = clampToCity([place('بقالة الخرطوم', 15.60, 32.53)], 'Khartoum', null);
        expect(out).toHaveLength(1);
    });

    it('🔒 يحجب نتائج من خارج البلد مهما كانت المنطقة', () => {
        const out = clampToCity([
            place('المسجد النبوي', 24.4672, 39.6112),
            place('المسجد الحرام', 21.4225, 39.8262),
            place('بقالة الخرطوم', 15.60, 32.53)
        ], 'Khartoum', null);
        expect(out.map(p => p.name)).toEqual(['بقالة الخرطوم']);
    });

    it('🔒 يحجب محلات داخل السودان لكن خارج المدينة', () => {
        // شندي والدامر ظهرا فعلاً في نتائج بحث "الحرمين"
        const out = clampToCity([
            place('معرض الحرمين — شندي', 16.6913, 33.4340),
            place('عطارة الحرمين — الدامر', 17.5900, 33.9700)
        ], 'Khartoum', null);
        expect(out).toHaveLength(0);
    });

    it('يحصر داخل منطقة التوصيل حين تكون مرسومة', () => {
        const out = clampToCity([
            place('داخل المنطقة', 15.60, 32.53),
            place('في المدينة خارج المنطقة', 16.20, 33.00)   // داخل صندوق الخرطوم لا المضلّع
        ], 'Khartoum', ZONE);
        expect(out.map(p => p.name)).toEqual(['داخل المنطقة']);
    });

    it('يستعمل صندوق بورتسودان لعملائها', () => {
        const psPlace = place('بقالة بورتسودان', 19.6158, 37.2164);
        expect(clampToCity([psPlace], 'PortSudan', null)).toHaveLength(1);
        // نفس المحل لا يظهر لعميل في الخرطوم
        expect(clampToCity([psPlace], 'Khartoum', null)).toHaveLength(0);
    });

    it('مدينة غير معروفة تعود لصندوق الخرطوم بدل السماح بكل شيء', () => {
        expect(clampToCity([place('المسجد النبوي', 24.4672, 39.6112)], 'Cairo', null)).toHaveLength(0);
    });
});

describe('centerFor — مركز البحث', () => {
    it('يتّبع موقع العميل حين يكون داخل مدينته', () => {
        const c = centerFor('Khartoum', 15.60, 32.53);
        expect(c.lat).toBe(15.60);
        expect(c.lng).toBe(32.53);
    });

    it('يعود لمركز المدينة بلا إحداثيات', () => {
        expect(centerFor('Khartoum')).toEqual(CITY_CENTERS.Khartoum);
        expect(centerFor('PortSudan', NaN, NaN)).toEqual(CITY_CENTERS.PortSudan);
    });

    it('🔒 يهمل موقع GPS خارج المدينة المختارة', () => {
        // حدث فعلاً: مدينة الحساب "الخرطوم" وGPS يقول بورتسودان. اتّباعه يعني
        // بحثاً حول بورتسودان ثم حجب كل نتيجة بصندوق الخرطوم ⇒ نتائج فارغة دائماً.
        expect(centerFor('Khartoum', 19.615234, 37.220093)).toEqual(CITY_CENTERS.Khartoum);
        expect(centerFor('PortSudan', 15.60, 32.53)).toEqual(CITY_CENTERS.PortSudan);
    });

    it('🔒 مركز البحث يبقى دائماً داخل نطاق يقبله الحصر الجغرافي', () => {
        // ضمانة ضد الوضع الذي يبحث فيه النظام حيث لا يستطيع عرض شيء
        for (const [city, coords] of [['Khartoum', [19.6, 37.2]], ['PortSudan', [15.6, 32.5]], ['Khartoum', [15.6, 32.5]]]) {
            const c = centerFor(city, coords[0], coords[1]);
            const kept = clampToCity([{ name: 'x', lat: c.lat, lng: c.lng }], city, null);
            expect(kept).toHaveLength(1);
        }
    });
});
