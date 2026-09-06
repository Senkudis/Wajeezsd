/**
 * 🌍 تبديل المدينة ونطاق التوصيل.
 *
 * العطل: بعد التبديل من الخرطوم إلى بورتسودان تنتقل الخريطة فعلاً، لكن مضلّع
 * النطاق يبقى مضلّع الخرطوم — يُحمَّل مرّة واحدة عند بناء الخريطة ولا شيء
 * يُعيد تحميله عند تغيّر المدينة. فيقف العميل فوق بورتسودان ويُقال له «خارج
 * منطقة التوصيل»، لأن الفحص يقيس موقعه على نطاق مدينةٍ أخرى.
 *
 * ولهذا بدا متقطّعاً — «مرّات بتغيّر طوالي ومرّات لا»: فتحُ التطبيق من جديد
 * يبني الخريطة بالمدينة المحفوظة فيعمل، والتبديل داخل الجلسة لا يعمل.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'public_html/js/home.js'), 'utf8');
const code = src.split('\n')
    .filter(l => { const t = l.trim(); return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*'); })
    .join('\n');

describe('تغيّر المدينة يُعيد تحميل النطاق', () => {

    it('🔑 مستمع city-changed يستدعي إعادة تحميل النطاق', () => {
        const idx = code.indexOf("addEventListener('city-changed'");
        expect(idx).toBeGreaterThan(-1);
        const handler = code.slice(idx, idx + 1200);
        expect(handler).toContain('window.reloadDeliveryZone');
    });

    it('ويُعيد الفحص بعد التحميل — وإلا بقيت اللافتة القديمة معروضة', () => {
        const idx = code.indexOf("addEventListener('city-changed'");
        const handler = code.slice(idx, idx + 1200);
        expect(handler).toContain('window.checkDeliveryZone()');
    });

    it('الدالة مكشوفة للنداء من خارج نطاق تعريفها', () => {
        expect(code).toContain('window.reloadDeliveryZone = initDeliveryZone');
    });
});

describe('🔒 إعادة الاستدعاء لا تُراكم آثاراً', () => {

    it('🔑 المضلّع القديم يُزال قبل رسم الجديد', () => {
        // بلا الإزالة يبقى نطاق الخرطوم مرسوماً على خريطة بورتسودان
        expect(code).toMatch(/if \(deliveryZonePolygon\) \{\s*\n\s*deliveryZonePolygon\.setMap\(null\);/);
    });

    it('مستمعو الخريطة والسوكت يُسجَّلون مرّة واحدة', () => {
        expect(code).toContain('window._zoneListenersBound');
        const guard = code.indexOf('window._zoneListenersBound = true');
        const drag = code.indexOf("map.addListener('dragend', window.checkDeliveryZone)");
        expect(drag).toBeGreaterThan(guard); // داخل الحارس لا قبله
    });
});

describe('مدينة بلا نطاق مُعرّف لا تُبقي تحذيراً معلّقاً', () => {

    it('🔑 غياب المضلّع يُخفي اللافتة ويُفعّل زر التأكيد بدل الخروج الصامت', () => {
        const idx = code.indexOf('window.checkDeliveryZone = function');
        const fn = code.slice(idx, idx + 900);
        expect(fn).toMatch(/if \(!deliveryZonePolygon\) \{[\s\S]{0,400}display = 'none'/);
        expect(fn).toMatch(/if \(!deliveryZonePolygon\) \{[\s\S]{0,400}disabled = false/);
    });

    it('الخروج المبكر لم يعد يشمل المضلّع', () => {
        const idx = code.indexOf('window.checkDeliveryZone = function');
        const firstLine = code.slice(idx, idx + 200);
        expect(firstLine).not.toMatch(/!google\.maps\.geometry\.poly \|\| !deliveryZonePolygon\) return/);
    });
});
