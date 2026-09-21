/**
 * ♿ لوحة الأوامر (Ctrl+K) — مكوّنٌ واحد على خمس عشرة صفحة إدارة.
 *
 *   اللوحة مبنيّةٌ للكيبورد أصلاً (أسهم، Enter، Esc) — ومع ذلك كانت
 *   غير مقروءة:
 *
 *   ١. **التركيز يبقى في الحقل** بينما تتنقّل الأسهم بين الخيارات. هذا
 *      هو النمط الصحيح، لكنه يتطلّب `aria-activedescendant` ليعرف القارئ
 *      أيّ خيارٍ صار مُبرَزاً — وبدونه لا يُنطَق شيءٌ عند كل ضغطة سهم.
 *      فالمستخدم يسمع صمتاً ويضغط Enter على المجهول.
 *
 *   ٢. **لا أدوار**: الغلاف ليس نافذةً حاجبة، والقائمة ليست قائمةَ اختيار،
 *      والنتائج روابطُ عادية لا خيارات.
 *
 *   ٣. **التركيز يضيع عند الإغلاق**: `closePalette` تُخفي الغلاف ولا
 *      تُعيد التركيز، فيقفز إلى أول الصفحة — ومن فتحها بـ Ctrl+K من وسط
 *      جدولٍ طويل يفقد مكانه.
 *
 *   ٤. **حقن خام**: `<p>...تطابق "${query}"</p>` بلا تهريب. المُدخِل هو
 *      الأدمن نفسه فالخطر محصورٌ به، لكن الحقن الخام في innerHTML لا
 *      يُترك لأن مصدره «موثوق».
 *
 *   ويُضاف هنا `.wj-sr-only` في `admin-mobile.css` — أداةٌ مشتركة على 23
 *   صفحة إدارة، لأن كثيراً من إشارات اللوحة لونٌ أو نقطةٌ بلا نصّ.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const js = read('public_html/js/admin-palette.js');
const panelCss = read('public_html/css/admin-panel.css');
const mobileCss = read('public_html/css/admin-mobile.css');

describe('اللوحة نافذةٌ حاجبة بقائمة اختيار', () => {
    it('الغلاف dialog مسمّى', () => {
        expect(js).toContain(`overlay.setAttribute('role', 'dialog')`);
        expect(js).toContain(`overlay.setAttribute('aria-modal', 'true')`);
        expect(js).toContain(`overlay.setAttribute('aria-label', 'لوحة الأوامر والتنقّل السريع')`);
    });

    it('والحقل combobox يقود القائمة', () => {
        const i = js.indexOf('id="adminPaletteInput"');
        const blk = js.slice(i, i + 400);
        expect(blk).toContain('role="combobox"');
        expect(blk).toContain('aria-controls="adminPaletteList"');
        expect(blk).toContain('aria-autocomplete="list"');
        expect(blk).toContain('aria-label="ابحث عن شاشة أو قسم إداري"');
    });

    it('والقائمة listbox مسمّاة', () => {
        expect(js).toContain(`role="listbox" aria-label="الشاشات الإدارية"`);
    });

    it('وكل نتيجة خيارٌ بمعرّفٍ يُشار إليه', () => {
        const i = js.indexOf('list.innerHTML = currentResults.map');
        const blk = js.slice(i, i + 900);
        expect(blk).toContain('id="adminPaletteOpt-${idx}" role="option"');
        expect(blk).toContain(`aria-selected="\${idx === 0 ? 'true' : 'false'}"`);
    });
});

describe('الأسهم تُنطِق ما تُبرزه', () => {
    it('أول خيارٍ يُشار إليه فور الرسم', () => {
        expect(js).toContain(`input.setAttribute('aria-activedescendant', 'adminPaletteOpt-0')`);
    });

    it('و highlightItem تنقل aria-selected و aria-activedescendant معاً', () => {
        const i = js.indexOf('function highlightItem()');
        const blk = js.slice(i, i + 700);
        expect(blk).toContain(`item.setAttribute('aria-selected', on ? 'true' : 'false')`);
        expect(blk).toContain(`input.setAttribute('aria-activedescendant', cur.id)`);
    });

    it('ولا إشارةَ إلى خيارٍ غير موجود حين تخلو النتائج', () => {
        const i = js.indexOf('currentResults.length === 0');
        const blk = js.slice(i, i + 900);
        expect(blk).toContain(`input.removeAttribute('aria-activedescendant')`);
    });

    it('و renderResults تملك مرجع الحقل أصلاً', () => {
        const i = js.indexOf("function renderResults(query = '')");
        expect(js.slice(i, i + 300)).toContain(`const input = modalEl.querySelector('#adminPaletteInput')`);
    });
});

describe('التركيز لا يضيع', () => {
    it('يُحفَظ عند الفتح', () => {
        const i = js.indexOf('function openPalette()');
        expect(js.slice(i, i + 200)).toContain('lastFocused = document.activeElement');
    });

    it('ويُعاد عند الإغلاق', () => {
        const i = js.indexOf('function closePalette()');
        const blk = js.slice(i, i + 500);
        expect(blk).toContain('lastFocused.focus()');
        expect(blk).toContain('lastFocused = null');
    });
});

describe('لا حقنَ خام ولو كان المُدخِل الأدمن', () => {
    it('دالّة تهريبٍ موجودة', () => {
        expect(js).toContain('function esc(s)');
        expect(js).toContain(`.replace(/</g, '&lt;')`);
    });

    it('والاستعلام يمرّ بها قبل الحقن', () => {
        expect(js).toContain('تطابق "${esc(query)}"');
        expect(js).not.toContain('تطابق "${query}"');
    });

    it('وحالة الفراغ تُعلَن', () => {
        expect(js).toContain('class="admin-palette-empty" role="status"');
    });
});

describe('الأنماط المشتركة', () => {
    it('.wj-sr-only مُعرَّفة في admin-mobile.css — 23 صفحة تحمّلها', () => {
        const i = mobileCss.indexOf('.wj-sr-only {');
        expect(i, 'الأداة غير معرَّفة').toBeGreaterThan(-1);
        const blk = mobileCss.slice(i, i + 400);
        expect(blk).toContain('position: absolute');
        expect(blk).toContain('clip: rect(0, 0, 0, 0)');
    });

    it('وهي خارج أي @media — وإلا لم تعمل إلا على الهاتف', () => {
        const i = mobileCss.indexOf('.wj-sr-only {');
        const before = mobileCss.slice(0, i).replace(/\/\*[\s\S]*?\*\//g, '');
        const depth = (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length;
        expect(depth, 'القاعدة داخل كتلةٍ مغلقة').toBe(0);
    });

    it('وللوحة الأوامر تركيزٌ مرئيّ', () => {
        expect(panelCss).toContain('.admin-palette-item:focus-visible');
        expect(panelCss).toContain('#adminPaletteInput:focus-visible');
    });

    it('والأيقونات الزخرفية فيها صامتة', () => {
        expect(js).toContain('class="fas fa-search admin-palette-search-icon" aria-hidden="true"');
        expect(js).toContain('class="admin-palette-item-icon" aria-hidden="true"');
        expect(js).toContain('class="fas fa-arrow-left admin-palette-item-arrow" aria-hidden="true"');
        expect(js).toContain('class="admin-palette-kbd" aria-hidden="true"');
    });
});
