/**
 * 🪪 حدود نطاق الفريق.
 *
 * على الاستضافة يشارك النطاق الفرعي جذر التطبيق نفسه، فلولا هذه القواعد
 * لصار الموقع كله — لوحة الأدمن وصفحات الكباتن والعملاء — مخدوماً من
 * team.wajeezsd.com كنسخة ثانية كاملة. الاختبارات هنا تحرس ذلك الحدّ.
 */

const {
    parseTeamHosts,
    isTeamHost,
    isPassthrough,
    isSharedAsset
} = require('../utils/teamHost');

describe('قراءة نطاقات الفريق من البيئة', () => {
    it('الافتراضي هو النطاق الفرعي المعتمد', () => {
        expect(parseTeamHosts(undefined)).toEqual(['team.wajeezsd.com']);
        expect(parseTeamHosts('')).toEqual(['team.wajeezsd.com']);
    });

    it('يقبل عدّة نطاقات ويُنظّف المسافات وحالة الأحرف', () => {
        expect(parseTeamHosts(' Team.Wajeezsd.com , captain.wajeezsd.com ,, '))
            .toEqual(['team.wajeezsd.com', 'captain.wajeezsd.com']);
    });
});

describe('مطابقة النطاق', () => {
    const hosts = parseTeamHosts('team.wajeezsd.com');

    it('يطابق بأي حالة أحرف — ترويسة Host تصل بأي صيغة', () => {
        expect(isTeamHost('team.wajeezsd.com', hosts)).toBe(true);
        expect(isTeamHost('TEAM.WajeezSD.com', hosts)).toBe(true);
    });

    it('لا يطابق النطاق الرئيسي ولا نطاقاً مشابهاً', () => {
        expect(isTeamHost('wajeezsd.com', hosts)).toBe(false);
        expect(isTeamHost('www.wajeezsd.com', hosts)).toBe(false);
        // ⚠️ لو استُعملت مطابقة "تنتهي بـ" بدل التساوي، لسيطر مهاجمٌ على
        // نطاقٍ مثل هذا وحصل على معاملة نطاق الفريق
        expect(isTeamHost('evil-team.wajeezsd.com.attacker.net', hosts)).toBe(false);
        expect(isTeamHost('', hosts)).toBe(false);
        expect(isTeamHost(undefined, hosts)).toBe(false);
    });
});

describe('المسارات الممرَّرة', () => {
    it('الـ API والرفوعات تمرّ على كل النطاقات', () => {
        expect(isPassthrough('/api/team')).toBe(true);
        expect(isPassthrough('/api/health')).toBe(true);
        expect(isPassthrough('/uploads/profiles/a.jpg')).toBe(true);
    });

    it('مسارات التطبيق لا تمرّ', () => {
        expect(isPassthrough('/')).toBe(false);
        expect(isPassthrough('/m/abc')).toBe(false);
    });
});

describe('🔒 الأصول المشتركة — قائمة سماح', () => {
    it('يسمح بالخطوط والشعارات التي تحتاجها صفحة الفريق', () => {
        expect(isSharedAsset('/vendor/fonts/fonts.css')).toBe(true);
        expect(isSharedAsset('/vendor/fonts/files/x.woff2')).toBe(true);
        expect(isSharedAsset('/logo-full.png')).toBe(true);
        expect(isSharedAsset('/favicon.ico')).toBe(true);
    });

    it('🔒 يمنع لوحة الأدمن وصفحات النظام من الظهور على نطاق الفريق', () => {
        // هذه هي النقطة كلها: النطاق الفرعي يشارك جذر التطبيق، فبلا هذا المنع
        // تصير لوحة التحكم مخدومةً من نطاقٍ عام مخصّص لبطاقات التعريف.
        for (const p of [
            '/admin.html', '/admin-team.html', '/admin-login.html',
            '/captain-dashboard.html', '/client-order.html', '/index.html',
            '/js/app-core.js', '/css/admin-dashboard.css', '/service-worker.js'
        ]) {
            expect(isSharedAsset(p)).toBe(false);
        }
    });

    it('🔒 لا يسمح بملف خارج القائمة لمجرّد تشابه البداية', () => {
        expect(isSharedAsset('/logo.png.html')).toBe(false);
        expect(isSharedAsset('/vendorX/secret.js')).toBe(false);
        expect(isSharedAsset('/assetsX/secret.js')).toBe(false);
    });
});
