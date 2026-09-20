/**
 * 🔌 توصيلُ الواجهة: ما يُنادى موجود، وما يُقرأ مكتوب.
 *
 * صنف العطل الذي تحرسه هذه الاختبارات ظهر مرّتين في يومٍ واحد:
 *
 *   • زرّ «تأكيد الموقع» كان يقرأ `window.map` — و`map` معرَّف بـ `let` في
 *     نطاق الملف، و`let` لا يضع المتغيّر على window. فالشرط يسقط بصمت.
 *   • تبديل المدينة كان ينادي `window.HomeBanners.loadBanners` — وهو كائنٌ
 *     لم يُنشأ قطّ، فتبقى إعلانات المدينة السابقة معروضة.
 *
 * الجامع بينهما أن **لا شيء ينهار**: الشرط يسقط، والصفحة تعمل، والميزة
 * وحدها لا تعمل. لذلك لا يمسكه إلا فحصٌ يطابق الطرفين — القارئ والكاتب.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, '..', 'public_html');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');

const pages = fs.readdirSync(PUB).filter(f => f.endsWith('.html'));
const jsFiles = fs.readdirSync(path.join(PUB, 'js')).filter(f => f.endsWith('.js'));

/** كل ما يُسنَد إلى window في أي ملف جافاسكربت — بأي من الشكلين */
const allWrites = (() => {
    const out = new Set();
    for (const f of jsFiles) {
        const src = read(path.join('js', f));
        for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
        // نمط IIFE: (function (global) { … global.X = … })(window)
        for (const m of src.matchAll(/global\.([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
    }
    for (const p of pages) {
        const src = read(p);
        for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
    }
    return out;
})();

describe('🔴 كائنٌ يُقرأ من window لا بدّ أن يُكتب', () => {
    // ما لا يُكتب في شِفرتنا بحكم طبيعته: يحقنه المتصفّح أو الغلاف الأصلي
    // أو مكتبةٌ خارجية. (`name in globalThis` لا يصلح: نحن في Node، فلا
    // location ولا google معرَّفان فيه.)
    const INJECTED = new Set([
        // الغلاف الأصلي
        'cordova', 'Capacitor', 'AndroidDownloader',
        // مكتبات خارجية
        'google', 'Swal', 'bootstrap', 'io', 'Chart', 'firebase', 'axios',
        'html2canvas', 'QRCode', 'JsBarcode', 'XLSX', 'jspdf', 'L', 'grecaptcha',
        // معرّفات المتصفّح
        'location', 'history', 'navigator', 'document', 'localStorage', 'console',
        'sessionStorage', 'screen', 'performance', 'crypto', 'caches', 'indexedDB',
        'visualViewport', 'matchMedia', 'getComputedStyle', 'speechSynthesis',
        'AudioContext', 'webkitAudioContext', 'Notification', 'CSS', 'URL', 'Intl',
        'parent', 'top', 'self', 'opener', 'frames', 'innerWidth', 'innerHeight'
    ]);

    it('لا اسمٍ مقروءٍ بلا إسناد في أي صفحة', () => {
        const missing = new Set();
        for (const p of pages) {
            const src = read(p);
            for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*(?:\.|\?\.)/g)) {
                const name = m[1];
                if (allWrites.has(name) || INJECTED.has(name)) continue;
                // لا globalThis هنا: نحن في Node فلا يعرف معرّفات المتصفّح
                missing.add(`${p} -> window.${name}`);
            }
        }
        expect([...missing]).toEqual([]);
    });

    it('وفي ملفات js كذلك', () => {
        // pendingShopInlineData استثناءٌ موثَّق: مسارٌ قديم لم يعد يُملأ،
        // وكل قراءاته بـ ?. فتسقط إلى بديلٍ من الـDOM. يبقى حتى يُحذف عمداً.
        const KNOWN_DEAD = new Set(['pendingShopInlineData']);
        const missing = new Set();
        for (const f of jsFiles) {
            const src = read(path.join('js', f));
            for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*(?:\.|\?\.)/g)) {
                const name = m[1];
                if (allWrites.has(name) || INJECTED.has(name) || KNOWN_DEAD.has(name)) continue;

                missing.add(`js/${f} -> window.${name}`);
            }
        }
        expect([...missing]).toEqual([]);
    });
});

describe('🔴 إعلانات المدينة تُعاد عند تبديلها', () => {
    it('home.js ينادي HomeBanners.loadBanners', () => {
        expect(read(path.join('js', 'home.js'))).toContain('window.HomeBanners.loadBanners()');
    });

    it('و home-banners.js ينشره فعلاً', () => {
        // الإعلانات مربوطة بالمدينة (‎?city=)، وتُجلب مرّة عند التحميل.
        // بلا هذا النشر يسقط الشرط في home.js وتبقى إعلانات المدينة السابقة.
        const src = read(path.join('js', 'home-banners.js'));
        expect(src).toMatch(/window\.HomeBanners\s*=\s*\{[^}]*loadBanners/);
        expect(src).toContain('?city=');
    });
});

describe('كل معالج inline له تعريف', () => {
    const JS_BUILTINS = new Set([
        'if', 'for', 'while', 'switch', 'return', 'typeof', 'new', 'setTimeout',
        'setInterval', 'alert', 'confirm', 'prompt', 'print', 'open', 'parseInt',
        'parseFloat', 'fetch', 'encodeURIComponent', 'decodeURIComponent'
    ]);
    const LIB_GLOBALS = new Set(['google', 'Swal', 'bootstrap', 'io', 'Capacitor', 'Chart']);

    const definedIn = (src) => {
        const out = new Set();
        const pats = [
            /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
            /window\.([A-Za-z_$][\w$]*)\s*=/g,
            /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g,
            /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>/g,
        ];
        for (const re of pats) for (const m of src.matchAll(re)) out.add(m[1]);
        return out;
    };

    it('لا onclick ينادي دالةً غير موجودة في الصفحة أو سكربتاتها', () => {
        const bad = [];
        for (const p of pages) {
            const raw = read(p);
            const html = raw.replace(/<!--[\s\S]*?-->/g, '');

            let bundle = [...raw.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
                .map(m => m[1]).join('\n');
            for (const m of raw.matchAll(/<script[^>]+src="([^"]+)"/g)) {
                if (/^https?:|^\/\//.test(m[1])) continue;
                const f = path.join(PUB, m[1].split('?')[0].replace(/^\//, ''));
                if (fs.existsSync(f)) bundle += '\n' + fs.readFileSync(f, 'utf8');
            }
            const defined = definedIn(bundle);

            for (const m of html.matchAll(/\son(?:click|change|input|submit)="\s*([A-Za-z_$][\w$.]*)\s*\(/g)) {
                let name = m[1].startsWith('window.') ? m[1].slice(7) : m[1];
                if (name.includes('.')) continue;
                if (defined.has(name) || JS_BUILTINS.has(name) || LIB_GLOBALS.has(name)) continue;
                bad.push(`${p} -> ${name}()`);
            }
        }
        expect([...new Set(bad)]).toEqual([]);
    });
});

describe('لا env() خام في أي ورقة أنماط أو صفحة', () => {
    it('الاستثناء الوحيد تعريف المتغيّرات نفسها', () => {
        // WebView أندرويد يعيد صفراً من env()، والقيمة الحقيقية يحقنها
        // MainActivity في --sat/--sab. فالاستعمال المسموح: var(--sab, env(…)).
        const offenders = [];
        const files = [
            ...pages.map(f => [f, read(f)]),
            ...fs.readdirSync(path.join(PUB, 'css')).filter(f => f.endsWith('.css'))
                .map(f => [`css/${f}`, read(path.join('css', f))])
        ];
        for (const [name, src] of files) {
            if (name === 'css/mobile-overrides.css') continue;   // هنا تُعرَّف --sat/--sab
            src.split(/\r?\n/).forEach((line, i) => {
                if (!/env\(\s*safe-area-inset/.test(line)) return;
                if (/var\(--s[atbl]\w*\s*,\s*env\(/.test(line)) return;  // النمط الصحيح
                if (/@supports/.test(line)) return;                       // استعلام دعم
                offenders.push(`${name}:${i + 1}  ${line.trim().slice(0, 70)}`);
            });
        }
        expect(offenders).toEqual([]);
    });
});

describe('تنظيف الطرفية يعمل في كل الصفحات', () => {
    it('كل صفحة تحمّل سكربتات المشروع تحمّل console-cleaner', () => {
        // كان محمَّلاً في صفحتين من سبعين، فتُطبع 46 رسالة تشخيص في طرفية
        // المستخدم على البقيّة — أثرٌ يُقرأ «نسخة تطوير» لا منتجاً.
        const missing = pages.filter(f => {
            const s = read(f);
            return /<script src="js\//.test(s) && !/console-cleaner/.test(s);
        });
        expect(missing).toEqual([]);
    });

    it('ولا يسبق حارس الإدارة — الحارس أوّل ما يعمل', () => {
        // سبقُه يعني ومضةً من محتوى الإدارة لمن لا يملك صلاحية
        for (const f of pages.filter(p => read(p).includes('admin-guard.js'))) {
            const s = read(f);
            expect(s.indexOf('admin-guard.js'), f).toBeLessThan(s.indexOf('console-cleaner.js'));
        }
    });
});
