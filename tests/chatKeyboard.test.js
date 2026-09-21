/**
 * ⌨️ شريط الكتابة يرتفع مع الكيبورد.
 *
 * بلاغ المستخدم: «قلت لي صلحتها بس ما ظهر لي الإصلاح».
 *
 * وكان محقّاً. الطبقة الويبية سليمةٌ منذ ذلك الإصلاح:
 *   • chat.html: body { height: calc(var(--app-h,100vh) - var(--kb,0px)) }
 *   • والشريط flex:0 0 auto داخل عمودٍ مرن، فتقليص الجسم يرفعه.
 * قِستُها في المتصفّح: بضبط --kb على 320 ارتفع الشريط 320 بكسل بالضبط.
 *
 * لكن على أندرويد **لا أحد يضبط --kb**. keyboard-inset.js يقيسه من
 * visualViewport، وهو قياسٌ صحيحٌ في المتصفّح — أمّا التطبيق فيعمل
 * edge-to-edge، فنافذة WebView لا تُقلَّص عند فتح الكيبورد: تبقى
 * visualViewport.height كما هي، فيُحسب الفرق صفراً ويبقى --kb صفراً.
 * معادلةٌ صحيحة لا تصلها بيانات — ولذلك «لم يظهر الإصلاح».
 *
 * والنظام يعرف الارتفاع (WindowInsetsCompat.Type.ime)، فأُخذ منه مباشرةً
 * في MainActivity — وهو المصدر نفسه الذي تُؤخذ منه --sat/--sab أصلاً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const root = (...p) => path.join(__dirname, '..', ...p);
const read = (...p) => fs.readFileSync(root(...p), 'utf8');

const chat = read('public_html', 'chat.html');
const kbJs = read('public_html', 'js', 'keyboard-inset.js');
const main = read('android', 'app', 'src', 'main', 'java', 'com', 'wajeezsd', 'app', 'MainActivity.java');
const manifest = read('android', 'app', 'src', 'main', 'AndroidManifest.xml');

describe('🤖 أندرويد يُبلّغ الويب بارتفاع الكيبورد', () => {
    it('🔴 MainActivity يقرأ inset الكيبورد من النظام', () => {
        // هذا ما كان ناقصاً: الـ listener كان يقرأ systemBars وdisplayCutout فقط
        expect(main).toContain('WindowInsetsCompat.Type.ime()');
        expect(main).toContain('isVisible(WindowInsetsCompat.Type.ime())');
    });

    it('🔴 ويحقنه في --kb', () => {
        expect(main).toContain("s.setProperty('--kb'");
        expect(main).toContain('kbHeight');
    });

    it('ويضع صنف kb-open كما يفعل مسار المتصفّح', () => {
        expect(main).toContain("classList.toggle('kb-open'");
    });

    it('⚠️ ويُصفّر --sab وقت فتحه — inset الكيبورد يشمل شريط التنقّل', () => {
        // إبقاؤهما معاً يُضاعف الحشو ويترك فجوةً تحت شريط الكتابة
        expect(main).toContain('if (ime > 0) bottom = 0;');
    });

    it('والنشاط يُعلن adjustResize', () => {
        expect(manifest).toContain('android:windowSoftInputMode="adjustResize"');
    });

    it('ويُطلق حدثاً تلتقطه الصفحة', () => {
        expect(main).toContain("wj-keyboard");
    });
});

describe('🌐 مسار المتصفّح لا يكتب فوق المصدر الأصلي', () => {
    it('🔴 يتنحّى حين يعمل المصدر الأصلي', () => {
        // بدون هذا يكتب صفراً مقيساً من visualViewport فوق القيمة الصحيحة
        expect(kbJs).toContain('if (window.__wjNativeKb) return;');
        expect(main).toContain('window.__wjNativeKb=true;');
    });

    it('والتنحّي يقع قبل كتابة --kb لا بعدها', () => {
        const i = kbJs.indexOf('__wjNativeKb');
        const j = kbJs.indexOf("root.style.setProperty('--kb'");
        expect(i).toBeGreaterThan(0);
        expect(j).toBeGreaterThan(i);
    });

    it('⚠️ ومستمع الحدث يُسجَّل قبل أي خروجٍ مبكر', () => {
        // المصدر الأصلي يعمل ولو غابت visualViewport، فلا يصحّ أن يسقط معها
        const listener = kbJs.indexOf("addEventListener('wj-keyboard'");
        const earlyExit = kbJs.indexOf('if (!vv) return;');
        expect(listener).toBeGreaterThan(0);
        expect(listener).toBeLessThan(earlyExit);
    });

    it('ويبقى --app-h يُقاس في الحالتين', () => {
        const i = kbJs.indexOf("setProperty('--app-h'");
        const j = kbJs.indexOf('if (window.__wjNativeKb) return;');
        expect(i).toBeLessThan(j);
    });
});

describe('📐 تخطيط المحادثة يستهلك القيمة', () => {
    it('الجسم يطرح الكيبورد من ارتفاعه', () => {
        expect(chat).toContain('calc(var(--app-h, 100vh) - var(--kb, 0px))');
    });

    it('🔴 ولا dvh في المعادلة — وحدةٌ مجهولة تُسقط الإعلان كلّه', () => {
        // WebView أقدم من Chrome 108 لا يعرف dvh، وCSS يُهمل الإعلان بجملته
        const body = chat.slice(chat.indexOf('body {'), chat.indexOf('.chat-header'));
        expect(body).not.toMatch(/height:\s*calc\([^)]*dvh/);
    });

    it('والشريط يرتفع بحكم التخطيط لا بإزاحة يدوية', () => {
        const body = chat.slice(chat.indexOf('body {'), chat.indexOf('.chat-header'));
        expect(body).toContain('display: flex');
        expect(body).toContain('flex-direction: column');
        expect(body).toContain('overflow: hidden');
    });

    it('والصفحة تُحمّل القارئ', () => {
        expect(chat).toContain('js/keyboard-inset.js');
    });
});
