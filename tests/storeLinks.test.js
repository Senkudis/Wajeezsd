/**
 * 🔗 رابط المتجر حسب الجهاز.
 *
 * كان رابط جوجل بلاي وحده هو «رابط التطبيق» في كل مكان: مستخدم آيفون يضغط
 * «شارك التطبيق» فيصل صديقَه رابطُ متجرٍ لا يملكه — زرٌّ يبدو أنه عمل وهو
 * لم يفعل شيئاً نافعاً. وكذلك رسالة قبول الكابتن، وهي أول خطوةٍ نطلبها منه.
 *
 * والرابطان من إعدادات اللوحة لا من الكود: تغيّر رابطٍ لا يستحقّ نشر إصدار.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const share = read('public_html/js/share-app.js');
const settingsModel = read('models/Settings.js');
const adminRoute = read('routes/admin/settings.js');
const authRoute = read('routes/auth.js');
const adminPage = read('public_html/admin-settings.html');
const adminJs = read('public_html/js/admin-settings.js');

/** يُقيّم دالة كشف المنصّة من الملف نفسه — لا نسخةً مكتوبة في الاختبار */
function detectApple(ua, touchPoints) {
    const m = share.match(/function isApplePlatform\(\)[\s\S]*?\n    \}/)[0];
    const fn = new Function('navigator', 'window', m + '; return isApplePlatform();');
    return fn({ userAgent: ua, maxTouchPoints: touchPoints }, {});
}

describe('كشف المنصّة', () => {
    it('آيفون وآيباد ⇒ آبل', () => {
        expect(detectApple('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true);
        expect(detectApple('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)', 5)).toBe(true);
    });

    it('iPadOS يُعرّف نفسه Macintosh — يُميَّز باللمس', () => {
        expect(detectApple('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    });

    it('ماك بلا لمس ⇒ ليس آبل هنا — لا تطبيق لنا على الماك', () => {
        expect(detectApple('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    });

    it('أندرويد ⇒ ليس آبل', () => {
        expect(detectApple('Mozilla/5.0 (Linux; Android 13; SM-A536E)', 5)).toBe(false);
    });

    it('وداخل التطبيق يُسأل Capacitor لا سلسلة المتصفّح', () => {
        expect(share).toContain("Capacitor.getPlatform() === 'ios'");
    });
});

describe('المشاركة تختار الرابط', () => {
    it('لكل منصّة رابطها من الإعدادات', () => {
        expect(share).toContain('function pickStoreLink');
        expect(share).toContain('cfg.appStoreLink');
        expect(share).toContain('cfg.playStoreLink');
    });

    it('واحتياطيّان لا واحد — لئلّا يعود رابط أندرويد لآيفون عند فشل الجلب', () => {
        expect(share).toContain('FALLBACK_APPLE');
        expect(share).toContain('FALLBACK_PLAY');
        expect(share).toContain('.catch(function () { return pickStoreLink(null); })');
        expect(share).not.toContain('FALLBACK_URL');
    });
});

describe('الإعداد يُضبط من اللوحة', () => {
    it('حقلٌ في المخطّط بافتراضٍ صالح', () => {
        expect(settingsModel).toContain('appStoreLink: {');
        expect(settingsModel).toContain('https://apps.apple.com/app/id6807840888');
    });

    it('ويُقبل في الحفظ — بلا هذا يُهمَل بصمت', () => {
        expect(adminRoute).toContain("'playStoreLink', 'appStoreLink'");
    });

    it('ويُعاد في app-config لتقرأه الواجهة', () => {
        const i = authRoute.indexOf("router.get('/app-config'");
        expect(authRoute.slice(i, i + 900)).toContain('appStoreLink');
    });

    it('وله خانة في صفحة الإعدادات تُملأ وتُحفظ', () => {
        expect(adminPage).toContain('id="appStoreLink"');
        expect(adminJs).toContain("document.getElementById('appStoreLink')");
        expect(adminJs).toContain('data.appStoreLink');
    });
});

describe('رسالة قبول الكابتن تعطي الرابطين', () => {
    const { buildCaptainApprovalMessage } = require('../utils/captainApprovalMessage');

    it('الرسالة تصل واتساب ولا نعرف جهازه — فالرابطان معاً', () => {
        const m = buildCaptainApprovalMessage({
            name: 'ك', phone: '0912345678',
            appLink: 'https://play.google.com/store/apps/details?id=com.wajeezsd.app',
            appLinkIos: 'https://apps.apple.com/app/id6807840888'
        });
        expect(m).toContain('أندرويد: https://play.google.com');
        expect(m).toContain('آيفون: https://apps.apple.com');
    });

    it('وبرابطٍ واحد لا يظهر سطرُ الآخر فارغاً', () => {
        const m = buildCaptainApprovalMessage({ name: 'ك', appLink: 'https://play.google.com/x' });
        expect(m).toContain('أندرويد: https://play.google.com/x');
        expect(m).not.toContain('آيفون:');
    });

    it('وبلا أيٍّ منهما لا عنوانَ تحميلٍ فارغ', () => {
        const m = buildCaptainApprovalMessage({ name: 'ك' });
        expect(m).not.toContain('*تحميل التطبيق*');
    });

    it('والمسار يمرّر الرابطين من الإعدادات', () => {
        const users = read('routes/admin/users.js');
        expect(users).toContain('appLinkIos: settings && settings.appStoreLink');
    });
});
