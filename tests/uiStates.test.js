/**
 * ⏳ حالات الواجهة: تحميل، فراغ، خطأ، وانقطاع الشبكة.
 *
 * العلّة التي عولجت: الصفحة التي تنقصها هذه الحالات تبدو **معطّلة** وهي
 * سليمة. تُفتح بيضاء فارغة فلا يعرف المستخدم أما زالت تُحمّل، أم لا يوجد
 * شيء، أم انقطع الاتصال. وكانت متفرّقة: الهيكل العظمي في سبعَ عشرة صفحة
 * من سبعين، وحالة الفراغ بثمانية أسماء أصناف، والانقطاع في تسعة ملفات.
 *
 * هنا يُفحص المصدر نصّاً (سلوك الوحدة نفسه فُحص في متصفّح حقيقي: هيكلٌ
 * يُرسم، وبَنَرٌ يظهر ويختفي، وحدث ui:reconnected يُطلق مرّة واحدة).
 * وما يُحرس هنا هو ما يسهل أن ينكسر صامتاً: التغطية، وقواعد المشروع.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, '..', 'public_html');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const mod = read(path.join('js', 'ui-states.js'));
const pages = fs.readdirSync(PUB).filter(f => f.endsWith('.html'));

describe('الوحدة تصل كل صفحة', () => {
    it('كل صفحة تحمّل safe-area تحمّل حالات الواجهة معها', () => {
        // safe-area هو أوسع ما تحمّله الصفحات (63 من 70)، فهو المقياس:
        // بَنَر الانقطاع لا معنى له إن غاب عن نصف التطبيق.
        const missing = pages.filter(f => {
            const s = read(f);
            return /js\/safe-area\.js/.test(s) && !/js\/ui-states\.js/.test(s);
        });
        expect(missing).toEqual([]);
    });

    it('وتُحمَّل في ثلاثٍ وستّين صفحة على الأقل', () => {
        const n = pages.filter(f => /js\/ui-states\.js/.test(read(f))).length;
        expect(n).toBeGreaterThanOrEqual(63);
    });

    it('وبرقم نسخةٍ للكاش — وإلا بقيت النسخة القديمة على الأجهزة', () => {
        const withVersion = pages.filter(f => /js\/ui-states\.js\?v=[0-9a-f]+/.test(read(f))).length;
        const total = pages.filter(f => /js\/ui-states\.js/.test(read(f))).length;
        expect(withVersion).toBe(total);
    });
});

describe('قواعد المشروع محفوظة في الوحدة', () => {
    it('لا env() خام — WebView أندرويد يعيد صفراً فيختفي البنر تحت الشقّ', () => {
        expect(mod).not.toMatch(/env\(safe-area-inset/);
        expect(mod).toContain('var(--sat');
    });

    it('ولا إيموجي في نصٍّ معروض', () => {
        const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
        const code = mod
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split(/\r?\n/).map(l => l.split('//')[0]).join('\n');
        expect(EMOJI.test(code)).toBe(false);
    });

    it('والحركة تتوقّف لمن طلب تقليلها', () => {
        expect(mod).toContain('prefers-reduced-motion:reduce');
    });

    it('والوضع الداكن مغطّى بأشكاله الثلاثة في المشروع', () => {
        expect(mod).toContain('body.dark-mode .uis-sk');
        expect(mod).toContain('[data-theme="dark"] .uis-sk');
        expect(mod).toContain('prefers-color-scheme:dark');
    });
});

describe('النصّ يُكتب نصّاً لا ماركب', () => {
    it('لا innerHTML في الوحدة — العناوين تأتي أحياناً من الخادم', () => {
        // حقن عنوانٍ قادمٍ من الخادم كـ HTML هو ثغرة XSS مفتوحة
        expect(mod).not.toContain('innerHTML');
        expect(mod).toContain('textContent');
    });

    it('والأنماط تُحقن مرّة واحدة لا مرّة لكل نداء', () => {
        expect(mod).toContain("document.getElementById(STYLE_ID)");
        expect(mod).toContain('if (window.UIState) return;');
    });
});

describe('الوصول', () => {
    it('التحميل يُعلَن بـ aria-busy ويُرفع بعده', () => {
        expect(mod).toContain("setAttribute('aria-busy', 'true')");
        expect(mod).toContain("removeAttribute('aria-busy')");
    });

    it('والفراغ حالة، والخطأ تنبيه — صفحةٌ فارغة بلا إعلان لا يعرف بها القارئ الصوتي', () => {
        expect(mod).toContain("kind === 'error' ? 'alert' : 'status'");
    });

    it('وبَنَر الانقطاع يُعلن نفسه بلطف', () => {
        expect(mod).toContain("aria-live', 'polite'");
    });

    it('وزرّ الحالة بارتفاعٍ يُلمس', () => {
        expect(mod).toMatch(/\.uis-state-btn\{[^}]*min-height:44px/);
    });
});

describe('عودة الاتصال تُعيد الجلب بلا ضغطة', () => {
    it('الوحدة تُطلق ui:reconnected عند العودة لا عند الانقطاع', () => {
        const i = mod.indexOf("window.addEventListener('online'");
        const blk = mod.slice(i, i + 320);
        expect(blk).toContain("new CustomEvent('ui:reconnected')");
        const off = mod.indexOf("window.addEventListener('offline'");
        expect(mod.slice(off, off + 120)).not.toContain('ui:reconnected');
    });

    it('والصفحات المتبنّية تستمع له فعلاً', () => {
        for (const f of ['captain-missions.html', 'merchant-promos.html']) {
            expect(read(f), f).toContain('UIState.onReconnect');
        }
    });
});

describe('الصفحات المتبنّية', () => {
    it('مهامّ الكابتن ترسم هيكلاً قبل الجلب', () => {
        const s = read('captain-missions.html');
        const i = s.indexOf('async function fetchMissions');
        const blk = s.slice(i, i + 500);
        expect(blk).toContain("UIState.skeleton('#missions-container'");
        // قبل الجلب لا بعده — وإلا مسح النتيجة
        expect(blk.indexOf('UIState.skeleton')).toBeLessThan(blk.indexOf('fetchWithRetry'));
    });

    it('وأكواد الخصم ترسم هيكلاً وتستبدل رسالة الخطأ الخام', () => {
        const s = read('merchant-promos.html');
        expect(s).toContain("UIState.skeleton('#promosContainer'");
        expect(s).toContain("UIState.error('#promosContainer'");
        expect(s).not.toContain('تعذّر تحميل الأكواد. تحقّق من الاتصال ثم <button');
    });

    it('والنداء محروسٌ بوجود الوحدة — صفحةٌ لم تحمّلها لا تنكسر', () => {
        for (const f of ['captain-missions.html', 'merchant-promos.html']) {
            const s = read(f);
            for (const m of s.matchAll(/UIState\.(skeleton|error|empty|onReconnect)/g)) {
                const line = s.slice(s.lastIndexOf('\n', m.index) + 1, s.indexOf('\n', m.index));
                expect(line.includes('window.UIState') || line.trim().startsWith('UIState'), `${f}: ${line.trim()}`)
                    .toBe(true);
            }
        }
    });
});
