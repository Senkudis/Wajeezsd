/**
 * إصلاحات واجهة العميل (أكتوبر 2026):
 *   ١) «اطلب من نفس المتجر»: طلب المتجر يصل بـ placeId لا shopId، وصفحة
 *      المتجر تقرأ ?placeId= — فكان الزر لا يظهر، والرابط بـ ?id= لا يفتح.
 *   ٢) تذاكر الدعم: الموضوع والوصف والردود تُهرَّب قبل innerHTML.
 *   ٣) بطاقة المحل: شارة «مفتوح الآن» يتبدّل لونها وحده — كان className
 *      يُستبدل كاملاً فيُمحى موضعها (position-absolute) فلا تظهر.
 *   ٤) قائمة «اطلب من أي محل»: الشارة inline-block وبينها وبين الاسم مسافة —
 *      وإلا اتّصل آخر حرف في الاسم بأول حرف في الشارة فبدا مقصوصاً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('إصلاحات واجهة العميل', () => {
    it('إعادة الطلب من نفس المتجر: placeId في الشرط والرابط', () => {
        const html = read('public_html/client-my-orders.html');
        expect(html).not.toMatch(/shop-detail\.html\?id=/);
        expect(html).toMatch(/const reorderPlace = order\.placeId \|\| order\.shopId;/);
        expect(html).toMatch(/shop-detail\.html\?placeId=\$\{encodeURIComponent\(reorderPlace\)\}/);
        // والخادم يرسل placeId لطلبات المتجر
        expect(read('routes/orders.js')).toMatch(/placeId: so\.place \? so\.place\._id : null/);
    });

    it('تذاكر الدعم تُهرّب نصوص المستخدم', () => {
        const html = read('public_html/client-complaint.html');
        expect(html).toContain('${escapeHtml(t.subject || \'—\')}');
        expect(html).toContain('${escapeHtml(t.description || \'\')}');
        expect(html).toContain('${escapeHtml(c.description || \'\')}');
        expect(html).toContain('${escapeHtml(r.message || \'\')}');
        // الموضوع لا يمرّ عبر نصّ JS داخل onclick
        expect(html).toContain('onclick="openThread(this.dataset.id, this.dataset.subject)"');
    });

    it('شارة حالة المحل: اللون وحده يتبدّل', () => {
        const js = read('public_html/js/order-feature.js');
        expect(js).not.toMatch(/statusEl\.className\s*=/);
        expect(js).toMatch(/statusEl\.classList\.remove\('bg-success', 'bg-danger'\)/);
    });

    it('شارة «متجر مسجّل» لا تتّصل حروفها بالاسم', () => {
        expect(read('public_html/js/errand-picker.js')).toContain("${isOurs ? ' ' + badges[0] : ''}");
        expect(read('public_html/client-order.html')).toMatch(/\.errand-place-badge \{\s*display: inline-block;/);
    });

    it('لا رمز تعبيري في عناوين نوافذ العميل وأزرارها', () => {
        const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u;
        for (const f of ['public_html/client-my-orders.html', 'public_html/tracking.html']) {
            const lines = read(f).split('\n').filter(l => /(title|confirmButtonText|cancelButtonText)\s*:/.test(l));
            for (const l of lines) expect(l, `${f}: ${l.trim()}`).not.toMatch(emoji);
        }
    });
});
