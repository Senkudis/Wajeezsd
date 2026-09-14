/**
 * ✨ تلميعٌ قبل الإرسال — عيوبٌ صغيرة تُقرأ «تطبيقاً غير مكتمل».
 *
 *   ١. **زرّ الوضع الليلي العائم يغطّي المحتوى.** ثابتٌ أسفل يمين كل شاشة
 *      فوق كل شيء: بطاقة منتج، اسم محل، آخر سطرٍ في قائمة. ظهر في لقطات
 *      App Store نفسها — وفي 35 صفحة (صفحات الإدارة وحدها تحلّه بزرٍّ في
 *      الترويسة). وهو زرٌّ لا يُستعمل إلا نادراً، فالأولى أن يغيب حين يقرأ
 *      المستخدم ويعود حين يتوقّف.
 *
 *   ٢. **صورة منتج مكسورة كانت تمسح شارة العرض وزرّ المشاركة معها**:
 *      `onerror` يكتب على `parentElement.innerHTML` كاملاً. فمنتجٌ عليه
 *      تخفيض يفقد شارته من العرض لأن صورته لم تُحمَّل — وهو أسوأ من غياب
 *      الصورة وحدها.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('الزرّ العائم لا يحجب المحتوى', () => {
    const css = read('public_html/css/dark-mode.css');
    const js = read('public_html/js/theme-manager.js');

    it('يغيب أثناء التمرير ويعود عند التوقّف', () => {
        expect(js).toContain('bindScrollHide');
        expect(css).toContain('.theme-toggle.is-hidden');
        const i = js.indexOf('bindScrollHide: function');
        const blk = js.slice(i, i + 900);
        expect(blk).toContain("button.classList.add('is-hidden')");
        expect(blk).toContain("setTimeout(() => button.classList.remove('is-hidden')");
    });

    it('ولا يلتقط الحدث من النافذة وحدها — صفحاتٌ تُمرّر داخل حاوية', () => {
        const i = js.indexOf('bindScrollHide: function');
        expect(js.slice(i, i + 900)).toContain('capture: true');
    });

    it('ولا يُربط مرّتين', () => {
        expect(js).toContain('_scrollHideBound');
    });

    it('ويغيب والكيبورد مفتوح — الشاشة وقتها ضيّقة أصلاً', () => {
        expect(css).toContain('html.kb-open .theme-toggle');
    });

    it('وهو مخفيٌّ بلا تفاعل لا شفّافاً فقط', () => {
        const i = css.indexOf('.theme-toggle.is-hidden');
        expect(css.slice(i, i + 200)).toContain('pointer-events: none');
    });
});

describe('صورة المنتج المكسورة لا تأخذ معها غيرها', () => {
    const html = read('public_html/shop-detail.html');

    it('تُستبدل الصورة وحدها لا الحاوية', () => {
        expect(html).toContain('window.prodImgFallback');
        expect(html).toContain('onerror="prodImgFallback(this)"');
        expect(html).not.toContain("onerror=\"this.parentElement.innerHTML=");
    });

    it('والاستبدال يحافظ على بقية العناصر في مكانها', () => {
        const i = html.indexOf('window.prodImgFallback');
        const blk = html.slice(i, i + 240);
        expect(blk).toContain('img.replaceWith(ph)');
        // لا كتابة على الحاوية — هي مَن كانت تُمسح
        expect(blk).not.toContain('parentElement');
    });
});
