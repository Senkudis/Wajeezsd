/**
 * 💬 رسائل الخطأ التي يراها المستخدم — لا نصّ تقنيّ إنجليزيّ في تطبيقٍ عربيّ.
 *
 *   ظهر على شاشة التسوّق نفسها سطرٌ أحمر: «Failed to fetch». كان
 *   `order-feature.js` يكتب `${err.message}` في شبكة التصنيفات كما هو.
 *   وهذا صحيحٌ حين يرمي الكود رسالة الخادم العربية («الطلب منتهٍ»)، وخاطئٌ
 *   حين يرمي المتصفّح نفسه: انقطاع الشبكة يُنتج «Failed to fetch» في
 *   Chrome و«Load failed» في Safari و«NetworkError…» في Firefox، وردٌّ
 *   غير JSON يُنتج «Unexpected token <». تسعة عشر موضعاً كذلك في شاشات
 *   العميل والكابتن — وسبعةٌ منها تحقن النصّ في innerHTML بلا تهريب.
 *
 *   الحلّ دالّةٌ واحدة `friendlyError` في config.js (محمَّل أولاً في كل
 *   صفحة). القاعدة: التطبيق عربيٌّ كلّه ورسائل الخادم عربيةٌ كلّها —
 *   فرسالةٌ بلا حرفٍ عربيٍّ واحد رسالةٌ تقنية لم تُكتب للمستخدم.
 *
 *   وكشف التحقّق البصريّ عيباً ثانياً: `UIState.error` تُلحق بطاقتها عنصراً
 *   واحداً في الحاوية، وشبكة التصنيفات أربعة أعمدة، فحُشرت البطاقة في
 *   الخلية الأولى (146 من 343 بكسلاً) وتكسّر زرّها على سطرين.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'public_html');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// نُحمّل config.js الحقيقيّ في سياقٍ معزول ونختبر الدالّة نفسها لا نسخةً منها
function loadFriendlyError() {
    const win = {};
    const ctx = {
        window: win, console: { log() {}, warn() {} },
        localStorage: { getItem() { return null; } },
        location: { hostname: 'wajeezsd.com', protocol: 'https:', origin: 'https://wajeezsd.com' },
        navigator: { userAgent: '' },
        document: { addEventListener() {}, querySelector() { return null; }, readyState: 'complete' },
    };
    Object.assign(win, { location: ctx.location, navigator: ctx.navigator, document: ctx.document });
    vm.createContext(ctx);
    try { vm.runInContext(read('js/config.js'), ctx); } catch (_) { /* أجزاءٌ تعتمد على DOM حقيقيّ */ }
    return win.friendlyError;
}

describe('friendlyError — تترجم التقنيّ وتُمرّر العربيّ', () => {
    const fe = loadFriendlyError();
    const NET = 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.';

    it('معرَّفةٌ عالمياً', () => {
        expect(typeof fe).toBe('function');
    });

    it.each([
        ['Chrome', 'Failed to fetch'],
        ['Safari', 'Load failed'],
        ['Firefox', 'NetworkError when attempting to fetch resource.'],
        ['React Native / WebView', 'Network request failed'],
        ['مهلة', 'The operation timed out.'],
        ['إلغاء', 'The user aborted a request.'],
    ])('انقطاع الشبكة في %s ← رسالةٌ عربية', (_, msg) => {
        expect(fe(new Error(msg))).toBe(NET);
    });

    it('ردٌّ غير JSON (صفحة 502 من الوكيل) ← رسالةٌ عربية', () => {
        expect(fe(new Error('Unexpected token < in JSON at position 0')))
            .toBe('استجابةٌ غير متوقّعة من الخادم. حاول مجدداً بعد قليل.');
    });

    it('أيّ رسالةٍ إنجليزية أخرى لا تُعرض خاماً', () => {
        expect(fe(new Error("Cannot read properties of undefined (reading 'map')")))
            .toBe('حدث خطأ غير متوقّع. حاول مجدداً.');
    });

    it('ورسالة الخادم العربية تمرّ كما هي — لا تراجع عن السلوك الصحيح', () => {
        expect(fe(new Error('الطلب منتهٍ، لا يمكن الإرسال'))).toBe('الطلب منتهٍ، لا يمكن الإرسال');
    });

    it('وجسم ردّ الخادم ({ message }) يعمل كالاستثناء', () => {
        expect(fe({ message: 'الصورة أكبر من 5 ميجابايت' })).toBe('الصورة أكبر من 5 ميجابايت');
    });

    it('والبديل المخصّص يُحترم حين لا يصلح النصّ', () => {
        expect(fe(new Error('x is not a function'), 'فشل إرسال الطلب')).toBe('فشل إرسال الطلب');
    });

    it('والفارغ و null لا يُسقطان الدالّة', () => {
        expect(fe(new Error(''))).toBe('حدث خطأ غير متوقّع. حاول مجدداً.');
        expect(fe(null)).toBe('حدث خطأ غير متوقّع. حاول مجدداً.');
        expect(fe(undefined, 'بديل')).toBe('بديل');
    });
});

describe('لا موضعَ يعرض رسالة الخطأ الخام', () => {
    // شاشات العميل والكابتن والتاجر ووحداتها المشتركة (لا الإدارة)
    const targets = [];
    for (const f of fs.readdirSync(ROOT)) {
        if (/^(index|client-|captain-|merchant-|shop-detail|chat|notifications|tracking|conversations).*\.html$/.test(f)) {
            targets.push(f);
        }
    }
    for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
        // input-validator: رسائل تحقّقٍ عربية يكتبها التطبيق نفسه («الاسم مطلوب»)
        if (!/^admin/.test(f) && f.endsWith('.js') && f !== 'input-validator.js') targets.push('js/' + f);
    }

    const RAW = [
        /\$\{\s*(e|err|error)\.message\s*\}/,
        /(innerHTML|textContent|innerText)\s*=\s*[^;]*\b(e|err|error)\.message/,
        /text:\s*(e|err|error)\.message/,
    ];

    it('صفر مواضع', () => {
        const hits = [];
        for (const f of targets) {
            read(f).split(/\r?\n/).forEach((line, i) => {
                if (/^\s*(\/\/|\*)/.test(line) || /console\./.test(line)) return;
                if (RAW.some(re => re.test(line))) hits.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`);
            });
        }
        expect(hits, hits.join('\n')).toHaveLength(0);
    });
});

describe('شبكة التصنيفات — الموضع الذي ظهر فيه «Failed to fetch»', () => {
    const js = read('js/order-feature.js');

    it('تمرّ بالحالة الموحّدة مع زرّ إعادة محاولة', () => {
        expect(js).toContain('UIState.error(grid, { text: friendlyError(err), onRetry: fetchCategories })');
    });

    it('والبديل حين تغيب UIState مهرَّبٌ لا خام', () => {
        expect(js).toContain('${escapeHtml(friendlyError(err))}');
    });

    it('وحالة فشل المحلات بلا إيموجي — أيقونةٌ بدل 📍', () => {
        const i = js.indexOf('فشل تحميل المحلات');
        const blk = js.slice(Math.max(0, i - 300), i);
        expect(blk).not.toContain('📍');
        expect(blk).toContain('bi-geo-alt');
    });
});

describe('بطاقة الحالة تمتدّ على الشبكة كلّها', () => {
    const js = read('js/ui-states.js');

    it('grid-column: 1/-1 على بطاقة الفراغ والخطأ', () => {
        const i = js.indexOf("'.uis-state{");
        const rule = js.slice(i, i + 260);
        expect(rule).toContain('grid-column:1/-1');
        expect(rule).toContain('width:100%');
    });

    it('لا على بطاقات الهيكل العظميّ — تلك تملأ الخلايا كالعناصر الحقيقية', () => {
        const i = js.indexOf("'.uis-sk-card{");
        expect(js.slice(i, i + 200)).not.toContain('grid-column');
    });
});
