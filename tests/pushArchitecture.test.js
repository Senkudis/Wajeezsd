/**
 * 🔔 معمارية الإشعارات على المنصّتين.
 *
 * القاعدة التي يحرسها هذا الملف: **مصدرٌ واحد للتوكن، وخدمةٌ واحدة للعرض.**
 *
 * ما كان قبلها:
 * - iOS: @capacitor/push-notifications تُسجّل مع APNs مباشرة وتُعيد توكن
 *   جهاز آبل (٦٤ حرفاً ست‑عشرياً). والخادم يرسل عبر firebase-admin وحده،
 *   فيرفضه FCM ثم يحذفه منظّف التوكنات الميتة. إشعارات iOS لم تكن لتعمل
 *   أبداً مهما صحّت المفاتيح.
 * - أندرويد: خدمتان تُعلنان MESSAGING_EVENT، والعامل منهما هو أوّل ما
 *   يُعيده مدير الحزم. كان يعمل لأن مدمج البيان يضع خدمة التطبيق أولاً —
 *   سببٌ عرضيّ لا ضمان، وإضافةُ مكتبةٍ ثالثة تُراهن عليه.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('مصدر واحد للتوكن', () => {
    const js = read('public_html/js/native-notifications.js');
    const pkg = JSON.parse(read('package.json'));

    it('الإضافة مثبَّتة — هي التي تجلب Firebase iOS SDK عبر SPM', () => {
        expect(pkg.dependencies['@capacitor-firebase/messaging']).toBeTruthy();
    });

    it('🔑 التوكن يُسحب بـ getToken لا يُنتظر كحدث', () => {
        // حدث registration يُطلق مرّة واحدة عند الإقلاع — قبل تسجيل الدخول —
        // ولا يتكرّر، وهو سبب حِيَل إعادة المزامنة المتراكمة
        expect(js).toContain('FM.getToken()');
        expect(js).toMatch(/pullToken: async/);
    });

    it('🔑 توكن APNs يُرفض في الواجهة أيضاً لا في الخادم فقط', () => {
        const idx = js.indexOf("addListener('registration'");
        const body = js.slice(idx, idx + 1600);
        expect(body).toMatch(/\/\^\[0-9a-fA-F\]\{64\}\$\//);
        // ويعود قبل التخزين
        const guard = body.indexOf('[0-9a-fA-F]{64}');
        const store = body.indexOf("localStorage.setItem('fcmToken'");
        expect(guard).toBeLessThan(store);
    });

    it('تجدُّد التوكن مُلتقَط — FCM يُدوّره من تلقائه', () => {
        expect(js).toMatch(/addListener\('tokenReceived'/);
    });

    it('🛟 نسخة قديمة بلا الإضافة تبقى عاملة على أندرويد', () => {
        const idx = js.indexOf('pullToken: async');
        const body = js.slice(idx, idx + 1200);
        expect(body).toMatch(/if \(!FM\)/);
        expect(body).toContain('PN.register()');
    });

    it('طلب الإذن يُفضّل Firebase — هي التي تُهيّئ سلسلة iOS كاملة', () => {
        expect(js).toContain('getFirebaseMessaging() || getPushNotifications()');
    });

    it('🔒 لا نُنادي register() على إضافة لا تملكها', () => {
        expect(js).toMatch(/typeof PushNotifications\.register === 'function'/);
    });
});

describe('خدمة FCM واحدة على أندرويد', () => {
    const mf = read('android/app/src/main/AndroidManifest.xml');

    it('🔑 خدمات المكتبات محذوفة صراحةً وقت الدمج', () => {
        expect(mf).toContain('xmlns:tools');
        expect(mf).toMatch(/com\.capacitorjs\.plugins\.pushnotifications\.MessagingService"\s*\n?\s*tools:node="remove"/);
        expect(mf).toMatch(/io\.capawesome\.capacitorjs\.plugins\.firebase\.messaging\.MessagingService"\s*\n?\s*tools:node="remove"/);
    });

    it('🔑 خدمة التطبيق وحدها تُعلن MESSAGING_EVENT', () => {
        const declared = (mf.match(/com\.google\.firebase\.MESSAGING_EVENT/g) || []).length;
        expect(declared).toBe(1);
        expect(mf).toContain('.WassiliFCMService');
    });

    it('العرض ما زال لخدمة التطبيق — BigText وتوجيه النقر يعتمدان عليها', () => {
        const svc = read('android/app/src/main/java/com/wajeezsd/app/WassiliFCMService.java');
        expect(svc).toContain('onMessageReceived');
        expect(svc).toContain('BigTextStyle');
    });
});

describe('iOS: عرض المقدمة مضبوط', () => {
    const cfg = JSON.parse(read('capacitor.config.json'));

    it('presentationOptions معرَّفة للإضافة الجديدة', () => {
        expect(cfg.plugins.FirebaseMessaging.presentationOptions).toEqual(['badge', 'sound', 'alert']);
    });
});
