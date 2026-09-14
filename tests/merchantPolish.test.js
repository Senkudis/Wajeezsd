/**
 * 🧹 فحص لوحة التاجر — أحد عشر صفحة.
 *
 * ما وجدته وأُصلح هنا:
 *
 *   ١. **حشوٌ سفلي ثابت 80/90px في ثماني صفحات** بلا `--sab`. الشريط السفلي
 *      مثبَّت، وشريط إيماءات النظام تحته: فآخر سطرٍ في كل قائمة يجلس تحتهما.
 *      وصفحتان منها فيهما زرٌّ عائم فوق الشريط، فيغطّي آخر بطاقة — نفس العطل
 *      الذي أُصلح في صفحة المنتجات وحدها.
 *
 *   ٢. **إيموجي في نصوصٍ معروضة**: رسالة رفع الصورة، وتنبيه نفاد الكمية،
 *      وفاتورة نقطة البيع التي تُرسَل للزبون على واتساب.
 *
 * وما فحصته فلم أجد فيه عيباً: ترويسات الجداول تطابق خلاياها في كل صفحات
 * التاجر (العطل الذي وجدته في صفحة المحلات بالإدارة لم يتكرّر هنا).
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, '..', 'public_html');
const read = (f) => fs.readFileSync(path.join(PUB, f), 'utf8');
const merchantPages = fs.readdirSync(PUB).filter(f => /^merchant-.*\.html$/.test(f));

describe('المساحة السفلية تحترم الشريط وشريط الإيماءات', () => {
    it('لا حشوٌ سفلي ثابت 80/90px في أي صفحة تاجر', () => {
        const offenders = merchantPages.filter(f => /padding-bottom:\s*(80|90)px;/.test(read(f)));
        expect(offenders).toEqual([]);
    });

    it('وكل صفحة تحسبه بـ --sab', () => {
        const missing = merchantPages.filter(f => {
            const s = read(f);
            // الصفحات التي تُحدّد حشواً سفلياً للجسم يجب أن تضمّ --sab
            return /padding-bottom:\s*calc\(/.test(s) && !/var\(--sab/.test(s);
        });
        expect(missing).toEqual([]);
    });

    it('وصفحات الزرّ العائم تترك له مساحته', () => {
        // الزرّ يجلس فوق الشريط السفلي، فحشوٌ بقدر الشريط وحده يُبقيه فوق
        // آخر بطاقة فيغطّيها
        for (const f of merchantPages) {
            const s = read(f);
            if (!/class="m-fab"/.test(s)) continue;
            expect(s, f).toMatch(/padding-bottom:\s*calc\(112px \+ var\(--sab/);
        }
    });

    it('ولا env() خام — WebView أندرويد يعيد صفراً', () => {
        const raw = merchantPages.filter(f => {
            const s = read(f);
            return /padding-bottom:[^;]*env\(safe-area-inset/.test(s);
        });
        expect(raw).toEqual([]);
    });
});

describe('لا إيموجي في نصوص لوحة التاجر', () => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

    it('لا إيموجي في أي سطرٍ معروض', () => {
        // التعليقات تشرح العلل ولا تُعرض — تُنزع قبل الفحص بدل ترشيح كل
        // سطرٍ على حدة، فالتعليق متعدّد الأسطر يفلت من ذلك.
        const stripComments = (src) => src
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split(/\r?\n/).map(l => l.split('//')[0]).join('\n');

        const offenders = [];
        for (const f of merchantPages) {
            stripComments(read(f)).split(/\r?\n/).forEach((line, i) => {
                if (EMOJI.test(line)) offenders.push(`${f}:~${i + 1}`);
            });
        }
        expect(offenders).toEqual([]);
    });

    it('وفاتورة نقطة البيع نظيفة — تُرسَل للزبون على واتساب', () => {
        const pos = read('merchant-pos.html');
        const i = pos.indexOf('lines.push(`*${shopName}*`)');
        expect(i).toBeGreaterThan(-1);
        expect(pos).not.toContain('شكراً لتعاملكم معنا 🌟');
    });
});

describe('ترويسات جداول التاجر تطابق خلاياها', () => {
    it('لا اختلاف في أي صفحة', () => {
        const bad = [];
        for (const f of merchantPages) {
            const s = read(f);
            const th = [...s.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
                .map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
            if (!th.length) continue;
            const tds = [...s.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
                .map(m => (m[1].match(/<td/g) || []).length);
            const maxTd = tds.length ? Math.max(...tds) : 0;
            if (maxTd && th.length !== maxTd) bad.push(`${f}: th=${th.length} td=${maxTd}`);
        }
        expect(bad).toEqual([]);
    });
});
