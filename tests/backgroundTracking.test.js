/**
 * 🛰️ التتبّع في الخلفية — السبب الجذري لشكوى «التتبّع ما شغال».
 *
 * الكود كان يبحث عن `BackgroundGeolocation` **ولا يجدها**: لم تكن مثبَّتة
 * أصلاً. فيسقط بصمت إلى `watchPosition` داخل WebView، وأندرويد يجمّدها لحظة
 * ما يقفل الكابتن شاشته. فيتجمّد مؤشّره عند العميل، ويصله هو إشعار «تتبّع
 * موقعك متوقّف» وهو واثقٌ أن أذوناته سليمة — وكلاهما صادق.
 *
 * وتثبيت الإضافة وحده لا يكفي؛ ثلاثة شروطٍ صامتة لولاها لبقي العطل كما هو
 * بينما يبدو كل شيء مضبوطاً:
 *
 *   ١. `useLegacyBridge` — بدونه تتوقّف القراءات بعد خمس دقائق في الخلفية.
 *   ٢. الناقل الأصليّ — أندرويد يخنق طلبات HTTP من WebView بعد خمس دقائق،
 *      فتصل القراءة إلى الكود ثم يموت الطلب في الطريق.
 *   ٣. مفاتيح Info.plist — بلا UIBackgroundModes يتوقّف iOS عند قفل الشاشة.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const service = read('public_html/js/captain-service.js');
const capConfig = JSON.parse(read('capacitor.config.json'));
const workflow = read('.github/workflows/ios-build.yml');
const pkg = JSON.parse(read('package.json'));

describe('الإضافة مثبَّتة ومسجَّلة', () => {
    it('في التبعيات', () => {
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        expect(deps['@capacitor-community/background-geolocation']).toBeTruthy();
    });

    it('وفي مشروع أندرويد — بلا التسجيل لا تُحمَّل مهما ثُبّتت', () => {
        const plugins = JSON.parse(read('android/app/src/main/assets/capacitor.plugins.json'));
        const names = plugins.map(p => p.classpath);
        expect(names.some(n => n.includes('capacitor_background_geolocation'))).toBe(true);
        expect(read('android/capacitor.settings.gradle'))
            .toContain('capacitor-community-background-geolocation');
    });

    it('وخدمتها أمامية من نوع location — لا إذن «الموقع دائماً»', () => {
        // الخدمة الأمامية تُعفينا من ACCESS_BACKGROUND_LOCATION، وهو إذنٌ
        // يطلب جوجل بلاي إقراراً وفيديو توضيحياً قبل قبول التحديث.
        const m = read('node_modules/@capacitor-community/background-geolocation/android/src/main/AndroidManifest.xml');
        expect(m).toContain('android:foregroundServiceType="location"');
        expect(m).not.toContain('ACCESS_BACKGROUND_LOCATION');
    });
});

describe('الشروط الصامتة الثلاثة', () => {
    it('١. useLegacyBridge — بدونه تتوقّف القراءات بعد خمس دقائق', () => {
        expect(capConfig.android && capConfig.android.useLegacyBridge).toBe(true);
        // وفي الأصول المحزومة كذلك، وإلا لم يقرأه التطبيق
        const shipped = JSON.parse(read('android/app/src/main/assets/capacitor.config.json'));
        expect(shipped.android.useLegacyBridge).toBe(true);
    });

    it('٢. الناقل الأصليّ — أندرويد يخنق HTTP من WebView في الخلفية', () => {
        expect(service).toContain('function getNativeHttp');
        expect(service).toContain('Capacitor.Plugins.CapacitorHttp');
        const i = service.indexOf('const nativeHttp = getNativeHttp();');
        const blk = service.slice(i, i + 700);
        expect(blk).toContain("nativeHttp.request({ url, method: 'PUT'");
        expect(blk).toContain('fetch(url, {');   // يبقى للويب
    });

    it('٣. مفاتيح Info.plist تُكتب في البناء — مجلد ios مُولَّد كل مرّة', () => {
        expect(workflow).toContain('NSLocationWhenInUseUsageDescription');
        expect(workflow).toContain('NSLocationAlwaysAndWhenInUseUsageDescription');
        expect(workflow).toContain('Add :UIBackgroundModes:0 string location');
    });

    it('ونصّ الإذن يشرح من ومتى ولماذا — آبل تسأل عن هذا بالضبط', () => {
        const i = workflow.indexOf('ALWAYS=');
        const line = workflow.slice(i, i + 400);
        expect(line).toContain('رحلة توصيل نشطة');
        expect(line).toContain('غير متصل');
    });

    it('والبناء يفشل صراحةً إن لم تُكتب — لا بناءٌ صامتٌ بلا تتبّع', () => {
        const i = workflow.indexOf('Enable background location');
        const blk = workflow.slice(i, i + 2600);
        expect(blk).toContain('::error::UIBackgroundModes:0');
    });
});

describe('البطارية والإيقاف', () => {
    it('الشاشة تبقى مضاءة في مسار الاحتياط وحده', () => {
        // مع الخدمة الخلفية، إبقاء الشاشة طوال الوردية استنزافٌ بلا مقابل
        expect(service).toContain('_startFallbackTracking');
        const i = service.indexOf('_startFallbackTracking: async');
        expect(service.slice(i, i + 420)).toContain('KeepAwake.keepAwake()');
        const j = service.indexOf('startTracking: async');
        expect(service.slice(j, service.indexOf('_startFallbackTracking: async')))
            .not.toContain('KeepAwake.keepAwake()');
    });

    it('والإيقاف يفرّق بوضع المراقبة لا بالمنصّة', () => {
        // حين تغيب الإضافة نسقط إلى watchPosition، وكان الإيقاف يدخل فرع
        // «الأصلي» لأن المنصّة أصلية — فلا يُلغى المراقب ويظلّ يُرسل الموقع
        // بعد أن أعلن الكابتن أنه غير متصل.
        expect(service).toContain("_watchMode = 'native'");
        expect(service).toContain("_watchMode = 'web'");
        expect(service).toContain("if (_watchMode === 'native' && watcherId)");
        expect(service).not.toContain('if (isNative && watcherId) {');
    });

    it('والشاشة تُطلَق عند الإيقاف مهما كان الوضع', () => {
        const i = service.indexOf('stopTracking: async');
        const blk = service.slice(i, i + 1400);
        expect(blk).toContain('KeepAwake.allowSleep()');
        expect(blk).toContain('_watchMode = null;');
    });
});
