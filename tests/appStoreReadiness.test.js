/**
 * متطلبات القبول في App Store — فحص آلي للشروط التي تُرفض النسخة بدونها.
 *
 * لماذا: هذه الشروط لا يكشفها أي اختبار وظيفي، ولا تظهر إلا في رسالة رفض بعد
 * أيام من الانتظار (حذف الحساب، رابط خصوصية مكسور، أيقونة بقناة ألفا، أصل CORS
 * ناقص فلا يعمل التطبيق على الآيفون أصلاً). كلها ثابتة يمكن التحقق منها هنا.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('متطلّبات Google Play — مستوى واجهة البرمجة المستهدَف', () => {
    // اعتباراً من 1 نوفمبر 2026 يرفض Play أي تحديث لتطبيق لا يستهدف مستوى
    // واجهة برمجة صدر خلال سنة من أحدث إصدار أندرويد. أندرويد 16 = API 36.
    //
    // ⚠️ سبب وجود هذا الاختبار: تاريخ android/variables.gradle يُظهر أن القيمة
    //    رُجّعت من 36 إلى 35 مرة ثم أُعيدت. لا شيء كان يمنع تكرار ذلك، والعطل
    //    لا يظهر إلا في رفض Play للحزمة — بعد البناء والرفع والانتظار.
    const MIN_TARGET_SDK = 36;
    const gradle = read('android/variables.gradle');

    const num = (re) => {
        const m = gradle.match(re);
        return m ? Number(m[1]) : null;
    };
    const targetSdk = () => num(/targetSdkVersion\s*=\s*(\d+)/);
    const compileSdk = () => num(/compileSdkVersion\s*=\s*(\d+)/);

    it('القيمتان مقروءتان فعلاً من الملف — لا اختبار يمرّ على null', () => {
        expect(targetSdk()).toBeTypeOf('number');
        expect(compileSdk()).toBeTypeOf('number');
    });

    it('targetSdkVersion لا يقلّ عن 36 (أندرويد 16)', () => {
        expect(targetSdk()).toBeGreaterThanOrEqual(MIN_TARGET_SDK);
    });

    it('compileSdkVersion لا يقلّ عن targetSdkVersion', () => {
        expect(compileSdk()).toBeGreaterThanOrEqual(targetSdk());
    });

    it('app/build.gradle يقرأ القيم من variables.gradle ولا يتجاوزها برقم ثابت', () => {
        const app = read('android/app/build.gradle');
        expect(app).toMatch(/targetSdkVersion\s+rootProject\.ext\.targetSdkVersion/);
        expect(app).toMatch(/compileSdk\s*=\s*rootProject\.ext\.compileSdkVersion/);
    });

    it('لا opt-out من edge-to-edge — يتجاهله أندرويد 16 فوجوده يعني توقّعاً خاطئاً', () => {
        expect(read('android/app/src/main/res/values/styles.xml'))
            .not.toMatch(/OptOutEdgeToEdgeEnforcement/);
    });
});

describe('حذف الحساب (App Store 5.1.1(v))', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/auth'));

    it('المسار موجود ومحمي — بلا توكن يردّ 401 لا 404', async () => {
        const res = await request(app).delete('/api/auth/me');
        expect(res.status).toBe(401);
    });

    it('واجهة الحذف مربوطة في صفحات الأدوار الثلاثة', () => {
        for (const page of ['index.html', 'captain-profile.html', 'merchant-profile.html']) {
            const html = read(path.join('public_html', page));
            expect(html).toContain('openDeleteAccount');
            // الوحدة نفسها يجب أن تكون محمَّلة، وإلا كان الزر يرمي خطأ عند اللمس
            expect(html).toMatch(/js\/delete-account\.js/);
        }
    });
});

describe('سياسة الخصوصية', () => {
    it('الصفحة موجودة فعلاً (الرابط في القائمة كان يشير لملف غير موجود)', () => {
        const link = read('public_html/index.html')
            .match(/https:\/\/wajeezsd\.com\/([\w-]+\.html)"[^>]*>\s*<i[^>]*><\/i>\s*سياسة الخصوصية/);
        const file = link ? link[1] : 'privacy-policy.html';
        expect(fs.existsSync(path.join(ROOT, 'public_html', file))).toBe(true);
    });

    it('تذكر كيفية حذف الحساب — يسأل عنها مراجع Apple', () => {
        expect(read('public_html/privacy-policy.html')).toContain('حذف الحساب');
    });
});

describe('المنطقة الآمنة على iOS — مصدر واحد لا مصدران', () => {
    /**
     * العطل الذي يحرسه هذا: كانت `contentInset: "always"` تجعل WKWebView
     * يُزيح المحتوى تحت شريط الحالة بنفسه، بينما الـ CSS يضيف
     * `padding-top: calc(var(--sat) + …)` فوق ذلك — فتُطبَّق الإزاحة مرّتين
     * وتنزل أزرار الشريط العلوي إلى منتصف الخريطة على الآيفون وحده.
     *
     * أندرويد لم يكن يعاني لأن مصدره واحد: MainActivity يحقن --sat
     * والويب‑فيو حافّة‑إلى‑حافّة. و"never" تُطابق iOS بأندرويد، وتُطابق
     * أيضاً `viewport-fit=cover` المعلَن في وسوم الصفحات — وهو إعلانٌ
     * صريح بأن المحتوى يمتدّ تحت المناطق الآمنة وأن الـ CSS يتولّاها.
     */
    const cfg = JSON.parse(read('capacitor.config.json'));

    it('contentInset = never — الإزاحة من الـ CSS وحده', () => {
        expect(cfg.ios.contentInset).toBe('never');
    });

    it('viewport-fit=cover معلَن — وإلا عاد env() صفراً ولم يُزَح شيء', () => {
        expect(read('public_html/index.html')).toContain('viewport-fit=cover');
    });

    it('الشريط العلوي للخريطة يُزاح بـ --sat لا بـ env() خاماً', () => {
        // env() الخام يعود صفراً على WebView أندرويد — لذلك المتغيّر أولاً
        // ثم env() احتياطاً، وهو النمط المتّبع في المشروع كلّه.
        const html = read('public_html/index.html');
        expect(html).toContain('var(--sat, env(safe-area-inset-top, 0px))');
    });
});

describe('تهيئة iOS', () => {
    it('أصل WebView الخاص بالآيفون مسموح في CORS', () => {
        const cfg = JSON.parse(read('capacitor.config.json'));
        const scheme = cfg.server.iosScheme || 'capacitor';
        const expected = `${scheme}://${cfg.server.hostname}`;
        expect(read('index.js')).toContain(expected);
    });

    it('ملف Universal Links يُخدَم من نفس مسارات روابط أندرويد', () => {
        const idx = read('index.js');
        expect(idx).toContain('/.well-known/apple-app-site-association');
        expect(idx).toContain('APPLE_TEAM_ID');
        for (const prefix of ['/s/*', '/p/*']) expect(idx).toContain(prefix);
    });

    it('بيان الخصوصية موجود وبلا تتبّع إعلاني', () => {
        const manifest = read('resources/ios/PrivacyInfo.xcprivacy');
        expect(manifest).toContain('NSPrivacyTracking');
        expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
        expect(manifest).toContain('NSPrivacyCollectedDataTypePreciseLocation');
    });

    it('سكربت Info.plist يغطي كل أوصاف الأذونات المستخدمة', () => {
        const src = read('scripts/patch-ios-plist.js');
        for (const key of [
            'NSLocationWhenInUseUsageDescription',
            'NSLocationAlwaysAndWhenInUseUsageDescription',
            'NSCameraUsageDescription',
            'NSPhotoLibraryUsageDescription',
            'UIBackgroundModes',
            'ITSAppUsesNonExemptEncryption'
        ]) expect(src).toContain(key);
    });
});

describe('أيقونة App Store', () => {
    // نقرأ رأس PNG مباشرة (IHDR) بلا أي مكتبة: العرض والارتفاع ثم نوع اللون.
    // colorType 2 = RGB بلا قناة ألفا، و6 = RGBA (مرفوضة من App Store).
    function pngHeader(file) {
        const buf = fs.readFileSync(path.join(ROOT, file));
        return {
            width: buf.readUInt32BE(16),
            height: buf.readUInt32BE(20),
            colorType: buf.readUInt8(25)
        };
    }

    it('1024×1024 بلا قناة ألفا', () => {
        const { width, height, colorType } = pngHeader('resources/ios/icon.png');
        expect([width, height]).toEqual([1024, 1024]);
        expect(colorType).toBe(2);
    });

    it('كل لقطة موجودة بمقاس iPhone 6.9 بوصة بالضبط', () => {
        // لقطة بمقاس مختلف يرفضها App Store Connect عند الرفع ويُعاد النموذج كله
        const dir = path.join(ROOT, 'resources', 'ios', 'screenshots');
        if (!fs.existsSync(dir)) return;
        const shots = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
        for (const f of shots) {
            const { width, height } = pngHeader(path.join('resources/ios/screenshots', f));
            expect([f, width, height]).toEqual([f, 1290, 2796]);
        }
    });

    it('شاشة البداية 2732×2732 بلا شفافية', () => {
        for (const f of ['resources/ios/splash.png', 'resources/ios/splash-dark.png']) {
            const { width, height, colorType } = pngHeader(f);
            expect([width, height]).toEqual([2732, 2732]);
            expect(colorType).toBe(2);
        }
    });
});
