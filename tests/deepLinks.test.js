/**
 * 🔗 روابط تفتح التطبيق — على المنصّتين لا على واحدة.
 *
 * سؤال المستخدم: روابط المتاجر والمنتجات تفتح التطبيق في أندرويد؛ هل
 * الأمر كذلك في iOS؟ لم يكن: ملف apple-app-site-association كان يُخدَم
 * من الخادم، لكن **استحقاق associated-domains لم يكن في الحزمة** — وهو
 * نظير intent-filter. فبدونه لا يلتقط iOS الروابط إطلاقاً مهما صحّ
 * الملف، وتفتح في سفاري دائماً.
 *
 * وأُضيف رابط انتساب الكابتن: /join-captain يفتح صفحة الانتساب داخل
 * التطبيق إن كان مثبّتاً، وإلا فتح المتصفّح — وبعد الإرسال تُعرض بطاقة
 * «حمّل التطبيق» برابط متجر المنصّة.
 *
 * والعقد هنا **ثلاثيّ**: بيان أندرويد، وملف iOS، ومعالج appUrlOpen.
 * ومن يضيف مساراً في واحدٍ وينساه في الآخرين يُنتج رابطاً يعمل على نصف
 * الأجهزة — وهو أسوأ من رابطٍ لا يعمل، لأنه لا يُبلَّغ عنه.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const root = (...p) => path.join(__dirname, '..', ...p);
const read = (...p) => fs.readFileSync(root(...p), 'utf8');

const server = read('index.js');
const manifest = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');
const core = read('public_html', 'js', 'app-core.js');
const workflow = read('.github', 'workflows', 'ios-build.yml');
const signup = read('public_html', 'captain-signup.html');
const shareJs = read('public_html', 'js', 'share-app.js');

const aasa = server.slice(server.indexOf("'/.well-known/apple-app-site-association'"),
                          server.indexOf('FIX #18'));
const filter = manifest.slice(manifest.indexOf('android:autoVerify="true"'),
                              manifest.indexOf('</intent-filter>', manifest.indexOf('android:autoVerify="true"')));

describe('🍎 iOS يلتقط الروابط فعلاً', () => {
    it('🔴 الاستحقاق associated-domains مكتوبٌ في الحزمة', () => {
        // نظير intent-filter — وبدونه الملف على الخادم بلا أثر
        expect(workflow).toContain('com.apple.developer.associated-domains');
        expect(workflow).toContain('applinks:wajeezsd.com');
        expect(workflow).toContain('applinks:www.wajeezsd.com');
    });

    it('🔴 والحزمة الموقَّعة تُفحَص — التوقيع قد يُسقطه بصمت', () => {
        // إن لم تكن Associated Domains مفعّلةً على App ID يُسقط التوقيع
        // الاستحقاق ويمرّ البناء، فتبقى الروابط تفتح في سفاري بلا سبب ظاهر
        const verify = workflow.slice(workflow.indexOf('aps-environment'));
        expect(verify).toContain("grep -q 'applinks:wajeezsd.com'");
        expect(workflow).toContain('فعّل Associated Domains على App ID');
    });

    it('وملف AASA يُولَّد من معرّف الفريق لا يُثبَّت في الكود', () => {
        expect(aasa).toContain('process.env.APPLE_TEAM_ID');
        expect(aasa).toContain('com.wajeezsd.app');
    });

    it('🔴 وغيابُ المعرّف يُعطي 404 لا ملفاً مغلوطاً', () => {
        expect(aasa).toContain('return res.status(404)');
    });

    it('ويُخدَم بترويسة JSON كما تشترط آبل', () => {
        expect(aasa).toContain("res.type('application/json')");
    });
});

describe('🔗 المسارات متّفقةٌ على المنصّتين والمعالج', () => {
    it('أندرويد يلتقط المتاجر والمنتجات والانتساب', () => {
        expect(filter).toContain('android:pathPrefix="/s/"');
        expect(filter).toContain('android:pathPrefix="/p/"');
        expect(filter).toContain('android:path="/join-captain"');
    });

    it('🔴 و iOS يلتقط المسارات نفسها — لا أقلّ', () => {
        expect(aasa).toContain("'/s/*'");
        expect(aasa).toContain("'/p/*'");
        expect(aasa).toContain("'/join-captain'");
    });

    it('🔴 والمعالج يعرف كلّاً منها — وإلا فُتح التطبيق على الصفحة الخطأ', () => {
        const blk = core.slice(core.indexOf('setupDeepLinks'), core.indexOf('appUrlOpen listener not available'));
        expect(blk).toContain('/p/');
        expect(blk).toContain('/s/');
        expect(blk).toContain('join-captain');
        expect(blk).toContain("captain-signup.html");
    });

    it('وكلا النطاقين مغطّى (بـ www وبدونه)', () => {
        expect(filter).toContain('android:host="wajeezsd.com"');
        expect(filter).toContain('android:host="www.wajeezsd.com"');
    });

    it('⚠️ ومسار الانتساب path لا pathPrefix', () => {
        // pathPrefix="/join-captain" كان سيلتقط /join-captain-anything
        expect(filter).not.toContain('android:pathPrefix="/join-captain"');
    });
});

describe('🛵 رابط الانتساب يعمل على الويب أيضاً', () => {
    it('الخادم يخدم الصفحة على المسار القصير', () => {
        expect(server).toContain("app.get('/join-captain'");
        expect(server).toContain('captain-signup.html');
    });

    it('🔴 وبطاقة التحميل تظهر على الويب لا داخل التطبيق', () => {
        const fn = signup.slice(signup.indexOf('function showGetAppCard'),
                                signup.indexOf('async function submitRegistration'));
        expect(fn).toContain('isNativePlatform');
        expect(fn).toContain('if (inApp) return;');
    });

    it('وتُعرَض بعد الإرسال لا قبله', () => {
        // لا تعتمد على نهاية السطر: الملفات CRLF ولا يصحّ أن يكسر الاختبار بتحويلها
        const i = signup.indexOf('// Success');
        expect(i).toBeGreaterThan(0);
        expect(signup.slice(i, i + 200)).toContain('showGetAppCard();');
    });

    it('🔴 والرابط يتبع منصّة الجهاز', () => {
        const fn = signup.slice(signup.indexOf('function showGetAppCard'),
                                signup.indexOf('async function submitRegistration'));
        expect(fn).toContain('isApplePlatform');
        expect(fn).toContain('App Store');
        expect(fn).toContain('Google Play');
    });

    it('ومصدر الاختيار واحد — لا كشفَ منصّةٍ مكرّر', () => {
        // نسختان تتباعدان، وإحداهما تنسى أن iPadOS 13+ يقول Macintosh
        expect(shareJs).toContain('window.getAppStoreLink');
        expect(shareJs).toContain('window.isApplePlatform');
        expect(shareJs).toContain('maxTouchPoints');
        expect(signup).toContain('js/share-app.js');
    });

    it('والبطاقة لا تُفشل التسجيل إن تعثّرت', () => {
        const fn = signup.slice(signup.indexOf('function showGetAppCard'),
                                signup.indexOf('async function submitRegistration'));
        expect(fn).toContain('catch');
    });
});

describe('🤖 أندرويد كما كان', () => {
    it('assetlinks ما زال يُخدَم صراحةً (static يتجاهل مجلدات النقطة)', () => {
        expect(server).toContain("app.get('/.well-known/assetlinks.json'");
        expect(server).toContain("dotfiles: 'allow'");
    });

    it('وبصمة التوقيع موجودة', () => {
        const links = JSON.parse(read('public_html', '.well-known', 'assetlinks.json'));
        expect(links[0].target.package_name).toBe('com.wajeezsd.app');
        expect(links[0].target.sha256_cert_fingerprints[0]).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    });
});
