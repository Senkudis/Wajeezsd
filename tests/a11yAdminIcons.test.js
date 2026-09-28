/**
 * ♿ مسحٌ شاملٌ على صفحات الإدارة الأربع والعشرين.
 *
 *   لوحة الإدارة تعتمد FontAwesome اعتماداً كاملاً: 596 أيقونةً في 24
 *   صفحة، ولا واحدةٌ منها تحمل نصّاً داخلها. وهذا يُنتج عيبين متعاكسين:
 *
 *   ١. **أيقونةٌ بجانب نصّ**: تُقرأ مرّتين أو تُنطَق اسم صنفٍ لا معنى له،
 *      فتُثقل كل صفٍّ في كل جدول.
 *
 *   ٢. **أيقونةٌ وحدها داخل زرّ**: الزرّ بلا اسمٍ إطلاقاً. خمسةٌ وسبعون
 *      زرّاً كذلك — «إغلاق» و«حذف» و«قبول» و«رفض» و«الصفحة التالية»
 *      و«فتح القائمة الجانبية» — كلّها تُنطَق «زر» فحسب. ومنها أزرارٌ
 *      تُنهي شكوى أو ترفضها، أي أفعالٌ لا تُجرَّب لمعرفة ما تفعل.
 *
 *   ستّةٌ وأربعون منها كان لها `title` يحمل الاسم الصحيح أصلاً — و`title`
 *   تلميحُ فأرةٍ لا اسمٌ موثوق: لا تظهر باللمس، وقارئات الشاشة تختلف في
 *   قراءتها. فاشتُقّ منها `aria-label` صريح. والتسعة والعشرون الباقية
 *   سُمّيت من فعلها في `onclick`.
 *
 *   هذا الاختبار يحرس الحالتين آلياً على كل الصفحات — فأي أيقونةٍ جديدة
 *   أو زرٍّ أيقونيٍّ جديد يسقط هنا.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public_html');
const files = fs.readdirSync(ROOT).filter(f => /^admin.*\.html$/.test(f));
const pages = files.map(f => ({ name: f, html: fs.readFileSync(path.join(ROOT, f), 'utf8') }));

// زرٌّ أو وصلةٌ لا يحوي إلا أيقونةً (وفراغاً)
const ICON_ONLY = /<(button|a)\b([^>]*)>((?:\s|<i\b[^>]*><\/i>)+)<\/\1>/g;

describe('كل صفحات الإدارة مشمولة', () => {
    // العدد ثابتٌ عمداً: صفحة إدارةٍ جديدة تمرّ من هنا فيُسأل صاحبها — هل
    // أيقوناتها صامتة وأزرارها مسمّاة؟ (٢٥: لوحة التتبّع admin-tracking.html)
    it('خمسٌ وعشرون صفحة', () => {
        expect(pages.length).toBe(25);
    });
});

describe('لا أيقونةَ تُقرأ', () => {
    it('كل <i> في كل صفحة عليها aria-hidden', () => {
        const offenders = [];
        for (const p of pages) {
            for (const m of p.html.matchAll(/<i\b([^>]*)><\/i>/g)) {
                if (!/aria-hidden/.test(m[1])) offenders.push(p.name + ': ' + m[0].slice(0, 80));
            }
        }
        expect(offenders, offenders.slice(0, 5).join('\n')).toHaveLength(0);
    });

    it('ولا أيقونةَ تحمل نصّاً — الإخفاء الشامل يبقى آمناً', () => {
        const withText = [];
        for (const p of pages) {
            for (const m of p.html.matchAll(/<i\b[^>]*>([\s\S]*?)<\/i>/g)) {
                if (m[1].trim()) withText.push(p.name + ': ' + m[0].slice(0, 80));
            }
        }
        expect(withText, withText.slice(0, 5).join('\n')).toHaveLength(0);
    });
});

describe('لا زرَّ أيقونيٍّ بلا اسم', () => {
    it('كل زرٍّ محتواه أيقونةٌ وحدها له aria-label', () => {
        const nameless = [];
        for (const p of pages) {
            for (const m of p.html.matchAll(ICON_ONLY)) {
                if (!/aria-label=/.test(m[2])) {
                    nameless.push(p.name + ': ' + m[0].replace(/\s+/g, ' ').slice(0, 100));
                }
            }
        }
        expect(nameless, nameless.slice(0, 5).join('\n')).toHaveLength(0);
    });

    it('ولا اسمَ فارغاً ولا مكرّراً ولا معطوب الاقتباس', () => {
        const bad = [];
        for (const p of pages) {
            for (const m of p.html.matchAll(/<(?:button|a)\b([^>]*)>/g)) {
                const attrs = m[1];
                const count = (attrs.match(/aria-label=/g) || []).length;
                if (count > 1) { bad.push('مكرّر — ' + p.name + ': ' + m[0].slice(0, 80)); continue; }
                if (count === 0) continue;
                const v = attrs.match(/aria-label="([^"]*)"/);
                if (!v) bad.push('اقتباس — ' + p.name + ': ' + m[0].slice(0, 80));
                else if (!v[1].trim()) bad.push('فارغ — ' + p.name + ': ' + m[0].slice(0, 80));
            }
        }
        expect(bad, bad.slice(0, 5).join('\n')).toHaveLength(0);
    });
});

describe('أسماءٌ بعينها — الأفعال التي لا تُجرَّب لمعرفتها', () => {
    const find = (file) => pages.find(p => p.name === file).html;

    it('إنهاء شكوى ورفضها متمايزان', () => {
        const h = find('admin-complaints.html');
        expect(h).toContain('aria-label="إنهاء الشكوى"');
        expect(h).toContain('aria-label="رفض الشكوى"');
        expect(h).toContain('aria-label="عرض تفاصيل الشكوى"');
        expect(h).toContain('aria-label="إرسال الرد"');
    });

    it('وصفحتا التنقّل لا سهمان متشابهان', () => {
        const h = find('admin-complaints.html');
        expect(h).toContain('aria-label="الصفحة السابقة"');
        expect(h).toContain('aria-label="الصفحة التالية"');
    });

    it('ونوافذ المحلات كلٌّ تقول ما تُغلق', () => {
        const h = find('admin-places.html');
        for (const label of ['إغلاق نافذة إضافة تصنيف', 'إغلاق نافذة تعديل التصنيف',
                             'إغلاق نافذة إضافة محل', 'إغلاق نافذة تعديل المحل',
                             'حذف صورة المحل', 'حذف صورة المنيو']) {
            expect(h, 'ناقص: ' + label).toContain('aria-label="' + label + '"');
        }
    });

    it('ومفاتيح التفعيل تتبع حالتها لا تجمد على كلمة', () => {
        expect(find('admin-banners.html'))
            .toContain(`aria-label="\${b.isActive ? 'إيقاف البانر' : 'تفعيل البانر'}"`);
        expect(find('admin-promo-codes.html'))
            .toContain(`aria-label="\${p.isActive ? 'إيقاف الكوبون' : 'تفعيل الكوبون'}"`);
    });

    it('وزرّ القائمة الجانبية مسمّى في كل صفحةٍ فيها', () => {
        const withToggle = pages.filter(p => /onclick="toggle(Mobile)?Sidebar\(\)"/.test(p.html));
        expect(withToggle.length).toBeGreaterThan(5);
        for (const p of withToggle) {
            expect(p.html, p.name).toContain('aria-label="فتح القائمة الجانبية"');
        }
    });
});
