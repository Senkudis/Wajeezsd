/**
 * 🍏 لماذا لا تعمل الإشعارات على iOS.
 *
 * عطلان مستقلّان، كلٌّ منهما وحده كافٍ لتعطيلها تماماً:
 *
 * ١) لا استحقاق aps-environment في الحزمة. مجلد ios/ مُولَّد في كل بناء،
 *    فلا شيء يُضيفه. وبدونه يفشل registerForRemoteNotifications() فلا يحصل
 *    الجهاز على توكنٍ من أساسه.
 *
 * ٢) لو حصل عليه، فهو توكن **APNs** لا FCM: إضافة Capacitor على iOS تُسجّل
 *    مع آبل مباشرة وتُعيد توكن الجهاز (64 حرفاً ست‑عشرياً)، بينما الخادم
 *    يرسل عبر firebase-admin وحده. كان يُقبل ويُخزَّن ثم يُرفض عند الإرسال
 *    ويُحذف بوصفه ميتاً — بلا أثرٍ يدلّ على السبب.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('١ — استحقاق الإشعارات في بناء iOS', () => {
    const wf = read('.github/workflows/ios-build.yml');

    it('🔑 يُنشأ App.entitlements بـ aps-environment', () => {
        expect(wf).toContain('aps-environment');
        expect(wf).toContain('App.entitlements');
    });

    it('البيئة production — الصحيحة لـ App Store وTestFlight', () => {
        // نبحث عن مفتاح الـ plist نفسه لا عن ذكر الاسم في التعليق أعلاه
        const step = wf.slice(wf.indexOf('<key>aps-environment</key>'));
        expect(step.slice(0, 200)).toContain('<string>production</string>');
    });

    it('🔑 يُربط بإعدادات البناء وإلا لم يُوقَّع معه', () => {
        expect(wf).toContain('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;');
    });

    it('🔒 يفشل البناء إن لم يُربط — لا نُصدر نسخةً بلا إشعارات بصمت', () => {
        expect(wf).toMatch(/::error::تعذّر ربط App\.entitlements/);
    });

    it('⚠️ لا \t في نصّ استبدال sed — BSD sed على macOS يكتبها حرف t', () => {
        const line = wf.split('\n').find(l => l.includes("s|PRODUCT_BUNDLE_IDENTIFIER = com.wajeezsd.app;"));
        expect(line).toBeTruthy();
        expect(line).not.toContain('\t');
        expect(line).not.toContain('\t');
    });

    it('يسبق خطوة الأرشفة — الاستحقاق يُقرأ وقت التوقيع', () => {
        expect(wf.indexOf('aps-environment')).toBeLessThan(wf.indexOf('Archive (signed)'));
    });
});

describe('🔏 التوقيع لا يُمرَّر في سطر الأوامر', () => {
    const wf = read('.github/workflows/ios-build.yml');
    const archive = wf.slice(wf.indexOf('- name: Archive (signed)'), wf.indexOf('- name: Archive (unsigned'));

    it('🔑 أمر الأرشفة بلا إعدادات توقيع — تُطبَّق على أهداف SPM أيضاً فتفشل', () => {
        // "Firebase_FirebaseCore does not support provisioning profiles"
        expect(archive).not.toContain('PROVISIONING_PROFILE_SPECIFIER');
        expect(archive).not.toContain('CODE_SIGN_IDENTITY');
        expect(archive).not.toContain('DEVELOPMENT_TEAM');
    });

    it('الإعدادات تُكتب في هدف التطبيق بمرساةٍ لا ترد في أهداف الحزم', () => {
        const step = wf.slice(wf.indexOf('- name: Configure Manual Signing'), wf.indexOf('- name: Archive (signed)'));
        expect(step).toContain('PROVISIONING_PROFILE_SPECIFIER = $PP_UUID');
        expect(step).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.wajeezsd.app;');
    });

    it('🔒 يفشل البناء إن لم تُكتب', () => {
        const step = wf.slice(wf.indexOf('- name: Configure Manual Signing'), wf.indexOf('- name: Archive (signed)'));
        expect(step).toMatch(/::error::تعذّر كتابة إعدادات التوقيع/);
    });
});

describe('🔥 GoogleService-Info.plist داخل الحزمة فعلاً', () => {
    const wf = read('.github/workflows/ios-build.yml');

    it('🔑 يُضاف إلى موارد هدف التطبيق — النسخ إلى المجلد لا يحزمه', () => {
        // 1.4.1 بُني ورُفع بنجاح تام ثم تعطّل عند الإقلاع على كل جهاز:
        // حزم Firebase داخل الـIPA والملف ليس فيها
        expect(wf).toContain('Bundle GoogleService-Info.plist into the app target');
        expect(wf).toContain('target.add_resources([ref])');
    });

    it('🔒 يُفحص الناتج نفسه بعد الأرشفة لا النيّة', () => {
        const step = wf.slice(wf.indexOf('Verify Firebase config is inside the built app'));
        expect(step.slice(0, 1800)).toContain('"$APP/GoogleService-Info.plist"');
        expect(step.slice(0, 1800)).toMatch(/::error::GoogleService-Info\.plist ليس داخل الحزمة/);
    });

    it('والاستحقاق يُفحص على الحزمة الموقَّعة', () => {
        const step = wf.slice(wf.indexOf('Verify Firebase config is inside the built app'));
        expect(step.slice(0, 1800)).toContain('codesign -d --entitlements');
    });

    it('🔑 غياب السرّ يُفشل البناء الموقَّع بدل إنتاج تطبيق لا يفتح', () => {
        const step = wf.slice(wf.indexOf('- name: Detect signing mode'), wf.indexOf('- name: Decode GoogleService-Info.plist'));
        expect(step).toMatch(/::error::GOOGLE_SERVICE_INFO_PLIST_BASE64 غائب/);
        expect(step).toMatch(/exit 1/);
    });

    it('يُنبّه إن كان الملف لتطبيقٍ آخر', () => {
        expect(wf).toContain('Print :BUNDLE_ID');
    });
});

describe('٢ — توكن APNs لا يُقبل بوصفه FCM', () => {
    const auth = read('routes/auth.js');

    it('🔑 يُكشف قبل التخزين بدل أن يُبتلع', () => {
        expect(auth).toMatch(/\/\^\[0-9a-fA-F\]\{64\}\$\//);
        expect(auth).toContain('apns_token_not_fcm');
    });

    it('يُسجَّل كخطأ — كان يختفي بلا سطرٍ واحد في السجل', () => {
        const idx = auth.indexOf('apns_token_not_fcm');
        const around = auth.slice(idx - 900, idx);
        expect(around).toContain('logger.error');
    });

    it('🔒 النمط لا يُطابق توكن FCM حقيقياً', () => {
        const re = /^[0-9a-fA-F]{64}$/;
        // توكن FCM: أطول بكثير ويحوي ':' و'_' و'-'
        expect(re.test('dGhpc0lzQVRlc3Q:APA91bH' + 'x'.repeat(140))).toBe(false);
        // توكن APNs: 64 حرفاً ست‑عشرياً بالضبط
        expect(re.test('a'.repeat(64))).toBe(true);
        expect(re.test('A1B2C3D4'.repeat(8))).toBe(true);
        // 63 أو 65 ليسا توكن APNs
        expect(re.test('a'.repeat(63))).toBe(false);
        expect(re.test('a'.repeat(65))).toBe(false);
    });
});
