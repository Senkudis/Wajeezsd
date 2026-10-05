/**
 * شريط التاجر السفلي: شارةٌ واحدة لكل أيقونة — m-badge من js/merchant-badges.js.
 *
 *   صفحتا المحادثات والإشعارات كانتا ترسمان شارتهما الخاصة (navUnreadBadge،
 *   navConvBadge، navNotifBadge) بجانب m-badge، فتتراكب شارتان على الأيقونة.
 *   ويحقن notification-toast.js شارةً ثالثة (.unread-notif-badge) في رابط
 *   الإشعارات، فتُخفى داخل الشريط بقاعدة في merchant-ui.css.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public_html');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('شارة واحدة في شريط التاجر', () => {
    it.each(['merchant-conversations.html', 'merchant-notifications.html'])('%s', (f) => {
        const html = read(f);
        const nav = html.match(/<nav class="merchant-nav">[\s\S]*?<\/nav>/);
        expect(nav).toBeTruthy();
        expect(nav[0]).not.toMatch(/id="nav(Unread|Conv|Notif)Badge"/);
        expect(html).toContain('css/merchant-ui.css');
    });

    it('شارة notification-toast مخفيّة داخل merchant-nav', () => {
        expect(read('css/merchant-ui.css'))
            .toMatch(/\.merchant-nav \.unread-notif-badge\s*\{\s*display:\s*none\s*!important;?\s*\}/);
    });
});
