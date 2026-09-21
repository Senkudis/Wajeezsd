/**
 * ♿ الإتاحة في شاشة الإشعارات.
 *
 *   الشاشة في حالٍ أفضل من أخواتها: البطاقات `<button>` أصلاً، ورقائق
 *   التصفية عليها `aria-pressed`، والتنبيه `role="status"`. لكن بقيت
 *   فجوةٌ جوهرية:
 *
 *   ١. **المقروء وغير المقروء سواء عند القارئ.** الحالة تُعرض بلونٍ
 *      وشريطٍ جانبيّ (`.is-unread`) — وكلاهما لا يصل قارئ الشاشة. من
 *      يتصفّح إشعاراته سمعياً لا يعرف أيّها جديد، وهو المعنى الأول
 *      للشاشة كلّها.
 *
 *   ٢. **القائمة تُعاد كتابتها كاملةً** عند التحميل والتصفية و«تحديد الكل
 *      كمقروء» وعند وصول إشعارٍ جديد (`wajeez:new-notification`) — بلا
 *      `aria-live`.
 *
 *   ٣. **عناوين التجميع** (اليوم/أمس/أقدم) `<div>` عادية، فلا يُتنقَّل
 *      بينها بأمر «العنوان التالي» في قارئ الشاشة.
 *
 *   ٤. وشارة «غير المقروء» رقمٌ عارٍ يتبدّل في `refreshCounts` بلا تسمية.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('public_html/notifications.html');
const js = read('public_html/js/notifications-ui.js');
const css = read('public_html/css/notifications-ui.css');

describe('غير المقروء يُسمع لا يُرى فقط', () => {
    it('البطاقة غير المقروءة تُسبَق بنصٍّ للقارئ', () => {
        const i = js.indexOf('function itemHtml(n)');
        const blk = js.slice(i, i + 1400);
        expect(blk).toContain(`(n.isRead ? '' : '<span class="wn-sr">غير مقروء.</span>')`);
    });

    it('و wn-sr مُعرَّفةٌ في الأنماط لا مجرّد صنفٍ مُستعمَل', () => {
        const i = css.indexOf('.wn-sr {');
        expect(i, 'الصنف غير معرَّف — النصّ سيظهر على الشاشة').toBeGreaterThan(-1);
        const blk = css.slice(i, i + 260);
        expect(blk).toContain('position: absolute');
        expect(blk).toContain('clip: rect(0, 0, 0, 0)');
    });

    it('وأيقونة النوع والسهم زخرفةٌ لا تُقرأ فوق العنوان', () => {
        const i = js.indexOf('function itemHtml(n)');
        const blk = js.slice(i, i + 2200);
        expect(blk).toContain(`'<span class="wn-icon" aria-hidden="true"`);
        expect(blk).toContain(`'<i class="bi bi-chevron-left wn-go" aria-hidden="true"></i>'`);
    });
});

describe('القائمة تُعلِن ما يتبدّل فيها', () => {
    it('منطقةٌ حيّة مسمّاة', () => {
        const i = html.indexOf('id="notificationsList"');
        const tag = html.slice(i, i + 160);
        expect(tag).toContain('role="region"');
        expect(tag).toContain('aria-live="polite"');
        expect(tag).toContain('aria-label="الإشعارات"');
    });

    it('والهيكل العظميّ أثناء التحميل لا يُقرأ', () => {
        expect(js).toContain(`'<div class="wn-skel" aria-hidden="true">'`);
    });

    it('وأيقونة حالة الفراغ كذلك', () => {
        expect(js).toContain(`'<div class="wn-empty-icon" aria-hidden="true">`);
    });
});

describe('عناوين التجميع عناوينُ فعلاً', () => {
    it('اليوم/أمس/أقدم يُتنقَّل بينها بأمر العنوان التالي', () => {
        expect(js).toContain(`'<div class="wn-group-title" role="heading" aria-level="2">'`);
    });
});

describe('شارة غير المقروء وشريط التصفية', () => {
    it('الشريط مجموعةٌ مسمّاة', () => {
        expect(html).toContain('id="wnToolbar" role="group" aria-label="تصفية الإشعارات"');
    });

    it('والشارة مسمّاة، وتسميتها تتبع قيمتها لا تجمد عليها', () => {
        expect(html).toContain('id="unreadCount" aria-label="لا إشعارات غير مقروءة"');
        const i = js.indexOf('function refreshCounts()');
        const blk = js.slice(i, i + 700);
        expect(blk).toContain("countEl.setAttribute('aria-label'");
        expect(blk).toContain("' إشعار غير مقروء'");
        expect(blk).toContain("'لا إشعارات غير مقروءة'");
    });
});

describe('شريط التنقل', () => {
    it('مسمّى والصفحة الحالية معلَّمة', () => {
        expect(html).toContain('<nav class="mobile-nav-glass" aria-label="التنقل الرئيسي">');
        expect(html).toContain('class="nav-item-link active" aria-current="page"');
    });

    it('وأيقوناته الأربع صامتة', () => {
        const i = html.indexOf('<nav class="mobile-nav-glass"');
        const nav = html.slice(i, html.indexOf('</nav>', i));
        expect(nav.match(/<i class="bi /g) || []).toHaveLength(4);
        expect(nav.match(/aria-hidden="true"/g) || []).toHaveLength(4);
    });
});
