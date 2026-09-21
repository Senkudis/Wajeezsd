/**
 * ♿ الإتاحة في «سجل طلباتي» — صفرُ سماتٍ في 2064 سطراً، وفيها عطبان
 *    يمنعان الاستعمال لا يُجمّلانه:
 *
 *   ١. **التقييم كان مستحيلاً بلا فأرة.** نجوم تقييم الكابتن وتقييم المتجر
 *      كانت `<i class="bi bi-star-fill" onclick="selectStar(3)">` — عنصرُ
 *      زخرفةٍ لا يُركَّز بـ Tab ولا يُفعَّل بـ Enter ولا اسم له. من يستعمل
 *      الكيبورد أو قارئ الشاشة لا يستطيع تقييم كابتنه إطلاقاً. صارت
 *      `<button>` في مجموعةٍ مسمّاة، لكلٍّ منها اسمٌ ونصُّ درجته.
 *
 *   ٢. **الفلترة كذلك.** أزرار «قيد التنفيذ / مكتملة / ملغاة / الكل» كانت
 *      `<div onclick>`. العميل الذي لا يستعمل الفأرة يرى سجلّه كاملاً بلا
 *      وسيلةٍ لتضييقه.
 *
 *   ٣. وما بقي: قائمة الطلبات تُملأ وتُفلتَر بلا `aria-live`، وشريط التنقل
 *      بلا اسم ولا `aria-current`، ونجوم استمارة الرأي مربّعاتُ اختيارٍ
 *      مخفيةٌ داخل تسمياتٍ فارغةٍ إلا من أيقونة — بلا اسمٍ تُقرأ به.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public_html/client-my-orders.html'), 'utf8');

describe('التقييم صار ممكناً بالكيبورد', () => {
    it('نجوم الكابتن أزرارٌ لا أيقونات', () => {
        const i = html.indexOf('id="starRating"');
        const blk = html.slice(i, i + 1200);
        expect(blk).toContain('<button type="button" class="rate-star"');
        expect(blk).toContain('aria-pressed="false"');
        expect(blk).not.toMatch(/<i class="bi bi-star-fill" data-val=/);
    });

    it('ولكلٍّ اسمٌ يحمل درجته', () => {
        const i = html.indexOf('id="starRating"');
        expect(html.slice(i, i + 1200)).toContain("من 5 — ${['','ضعيف','مقبول','جيد','جيد جداً','ممتاز'][i]}");
    });

    it('نجوم المتجر كذلك', () => {
        const i = html.indexOf('id="placeStars"');
        const blk = html.slice(i, i + 1000);
        expect(blk).toContain('<button type="button" class="rate-star"');
        expect(blk).toContain('aria-label="${i} من 5"');
        expect(blk).not.toMatch(/<i class="bi bi-star-fill" data-val=/);
    });

    it('والتركيز يضيء النجوم كما يفعل مرور الفأرة', () => {
        const i = html.indexOf('id="starRating"');
        const blk = html.slice(i, i + 1200);
        expect(blk).toContain('onfocus="hoverStars(${i})"');
        expect(blk).toContain('onblur="resetStars()"');
    });

    it('والاختيار يُنقَل إلى aria-pressed في التقييمين', () => {
        const a = html.indexOf('window.selectStar = (val)');
        expect(html.slice(a, a + 500)).toContain("#starRating .rate-star");
        const b = html.indexOf('window.selectPS = (val)');
        expect(html.slice(b, b + 400)).toContain("#placeStars .rate-star");
    });

    it('ونصّ الدرجة يُعلَن عند تبدّله', () => {
        const i = html.indexOf('id="starLabel"');
        expect(html.slice(i, i + 120)).toContain('aria-live="polite"');
    });

    it('وللنجوم تركيزٌ مرئيّ — زرٌّ بلا خلفيةٍ يختفي حدّه بلا outline', () => {
        expect(html).toContain('.of-tab:focus-visible, .rate-star:focus-visible');
        const i = html.indexOf('.rate-star {');
        expect(html.slice(i, i + 200)).toContain('background: none; border: 0;');
    });
});

describe('الفلترة صارت ممكنة بالكيبورد', () => {
    it('أزرار الفلاتر <button> لا <div>', () => {
        const i = html.indexOf('function renderOrderTabs()');
        const blk = html.slice(i, i + 900);
        expect(blk).toContain('<button type="button" class="of-tab');
        expect(blk).toContain('aria-pressed="${on}"');
        expect(blk).not.toContain('<div class="of-tab');
    });

    it('والشريط مجموعةٌ مسمّاة', () => {
        expect(html).toContain('id="ordersFilterBar" role="group" aria-label="تصفية الطلبات"');
    });

    it('وعدّاد كل فلتر مسمّى — رقمٌ عارٍ لا يُفهم', () => {
        const i = html.indexOf('function renderOrderTabs()');
        expect(html.slice(i, i + 900)).toContain('aria-label="${n} طلب"');
    });

    it('والزرّ يرث خطّ الصفحة — <button> لا يرثه تلقائياً', () => {
        const i = html.indexOf('.of-tab {');
        expect(html.slice(i, i + 320)).toContain('font-family: inherit');
    });
});

describe('ما بقي', () => {
    it('قائمة الطلبات منطقةٌ حيّة مسمّاة', () => {
        const i = html.indexOf('id="orders-list"');
        const tag = html.slice(i, i + 200);
        expect(tag).toContain('aria-live="polite"');
        expect(tag).toContain('aria-label="قائمة طلباتي"');
    });

    it('شريط التنقل مسمّى والصفحة الحالية معلَّمة', () => {
        expect(html).toContain('<nav class="mobile-nav-glass" aria-label="التنقل الرئيسي">');
        expect(html).toContain('class="nav-item-link active" aria-current="page"');
    });

    it('وأيقوناته الأربع مخفيةٌ عن القارئ', () => {
        const i = html.indexOf('<nav class="mobile-nav-glass"');
        const nav = html.slice(i, html.indexOf('</nav>', i));
        expect(nav.match(/<i class="bi /g) || []).toHaveLength(4);
        expect(nav.match(/aria-hidden="true"/g) || []).toHaveLength(4);
    });

    it('نجوم استمارة الرأي لها أسماء', () => {
        expect(html).toContain('name="fbRating" value="${n}" aria-label="${n} من 5"');
    });

    it('والصورة المكبّرة لها بديلٌ نصّي واسمٌ لنافذتها', () => {
        expect(html).toContain('id="imgModal" tabindex="-1" aria-label="عرض الصورة بالحجم الكامل"');
        expect(html).toContain('id="full-img" class="w-100 object-fit-cover" alt="صورة مرفقة بالطلب"');
    });
});
