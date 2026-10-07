/**
 * 📍 تحديد موقع المتجر في طلب الانضمام — حين لا ينفع «موقعي».
 *
 * تاجرٌ في بورتسودان لم يستطع تحديد محلّه: تشويش الـGPS يعطي الجهاز نقطةً
 * بعيدة، و«موقعي» كان يحرّك الخريطة إليها بلا سؤال، والبحث يعتمد على جوجل
 * وحده فيسكت حين لا يجد شيئاً. هذا الملف يحرس:
 *   - خانة «الصق الرابط» في النموذج (وزرّها من داخل الخريطة)
 *   - «موقعي» يمرّ بـ WajeezGeo ويرفض نقطةً خارج مدن وجيز ثم يجرّب الشبكة
 *   - البحث يرجع إلى OpenStreetMap ويعرض «لا نتائج» بدل السكوت
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public_html', 'client-register-shop.html'), 'utf8');

describe('client-register-shop — تحديد الموقع', () => {
    it('يحمّل أدوات الموقع والرابط المشتركة', () => {
        for (const f of ['js/geo.js', 'js/maps-link.js', 'js/maps-link-input.js']) {
            expect(html).toContain(`<script src="${f}?v=`);
        }
    });

    it('خانة لصق الرابط في النموذج، تُركَّب بعد كل رسمٍ للنموذج', () => {
        expect(html).toContain('id="shopLinkBox"');
        expect(html).toContain('id="shopLinkHost"');
        expect(html).toMatch(/MapsLinkInput\.mount\('#shopLinkHost'/);
        expect(html).toMatch(/PaymentMethods\.renderPicker[^\n]*\n\s*bindShopLinkBox\(\);/);
    });

    it('زرّ الرابط ظاهر داخل الخريطة', () => {
        expect(html).toContain('id="mapLinkChip" onclick="openShopLinkFromMap()"');
    });

    it('«موقعي» يرفض نقطةً خارج مدن وجيز ويجرّب موقع الشبكة', () => {
        expect(html).toContain('WajeezGeo.getPrecise(');
        expect(html).toMatch(/function inServedCity\(lat, lng\) \{ return !!WajeezCities\.cityAt\(lat, lng\); \}/);
        expect(html).toMatch(/enableHighAccuracy: false/);
        // لا عودة إلى getCurrentPosition عالي الدقّة الذي يحرّك الخريطة بلا فحص
        expect(html).not.toMatch(/enableHighAccuracy: true, timeout: 10000/);
    });

    it('البحث يرجع إلى OpenStreetMap مقيّداً بحدود المدينة، ويُهرّب النتائج', () => {
        expect(html).toContain('nominatim.openstreetmap.org/search');
        expect(html).toContain('&bounded=1');
        expect(html).toContain('لا نتائج لـ «${_esc(q)}»');
        // أسماء الأماكن من مصدرٍ خارجي — لا تُحقن في الصفحة خاماً
        expect(html).not.toContain('${p.structured_formatting.main_text}');
    });
});
