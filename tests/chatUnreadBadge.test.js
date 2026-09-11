/**
 * 🔔 الشارة الحمراء العالقة في المراسلة.
 *
 * الشكوى: الشارة تبقى معلّقة حتى بعد قراءة الرسائل.
 *
 * السبب: قائمة المحادثات تجمع **بالطرف الآخر** (محادثة واحدة لكل عميل)
 * فكان unreadCount يعدّ رسائل ذلك العميل عبر **كل طلباته**. لكن شاشة
 * الدردشة تفتح طلباً واحداً (lastOrderId) و POST /api/chat/read يُعلّم ذلك
 * الطلب وحده. فرسائل طلبٍ أقدم من نفس العميل تبقى isRead:false إلى الأبد —
 * لا تُعرض في شاشة، ولا سبيل لتعليمها ⇒ رقمٌ أحمر لا ينطفئ مهما قرأ.
 *
 * ويقع هذا حتماً مع كل عميل متكرّر: كل طلب مستند ShopOrder جديد، فمحادثته
 * منفصلة عن سابقتها.
 *
 * القاعدة بعد الإصلاح: **يُعدّ ما يمكن فتحه وتعليمه**. والرسائل الأقدم تبقى
 * في القاعدة بلا مساس — لا تُعلَّم مقروءةً زوراً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const codeOnly = (s) => s.split(/\r?\n/)
    .filter(l => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
    .join('\n');

const { unreadByPeerAndOrder, totalReachableUnread } = require('../utils/chatUnread');

// نموذج Message وهمي: aggregate يردّ ما نُلقّمه حسب شكل خط الأنابيب
function fakeMessage({ unread = [], lastOrders = [] }) {
    return {
        aggregate(pipeline) {
            const isUnreadPipe = JSON.stringify(pipeline).includes('"isRead":false');
            return Promise.resolve(isUnreadPipe ? unread : lastOrders);
        }
    };
}

describe('unreadByPeerAndOrder', () => {
    it('يفهرس بالطرف والطلب معاً', async () => {
        const M = fakeMessage({
            unread: [
                { _id: { peer: 'c1', order: 'o9' }, n: 3 },
                { _id: { peer: 'c1', order: 'o1' }, n: 2 },
                { _id: { peer: 'c2', order: 'o5' }, n: 1 }
            ]
        });
        const { key, map } = await unreadByPeerAndOrder(M, 'me');
        expect(map.get(key('c1', 'o9'))).toBe(3);
        expect(map.get(key('c1', 'o1'))).toBe(2);
        expect(map.get(key('c2', 'o5'))).toBe(1);
        expect(map.get(key('c1', 'oX'))).toBeUndefined();
    });
});

describe('totalReachableUnread', () => {
    it('يعدّ آخر طلبٍ لكل عميل فقط — لا مجموع طلباته', async () => {
        // العميل c1: 3 غير مقروءة على طلبه الأخير o9، و2 على طلبٍ أقدم o1.
        // الطلب الأقدم لا يُفتح من أي شاشة ⇒ لا يُعدّ.
        const M = fakeMessage({
            unread: [
                { _id: { peer: 'c1', order: 'o9' }, n: 3 },
                { _id: { peer: 'c1', order: 'o1' }, n: 2 }
            ],
            lastOrders: [{ _id: 'c1', lastOrderId: 'o9' }]
        });
        expect(await totalReachableUnread(M, 'me')).toBe(3);
    });

    it('صفرٌ حين يكون كل غير المقروء على طلبات قديمة — الشارة تنطفئ', async () => {
        // هذه هي الحالة العالقة بالضبط: التاجر قرأ محادثة الطلب الأخير،
        // فلم يبقَ غير مقروءٍ إلا على طلبٍ أقدم لا يُعرض. كان الرقم يبقى 2.
        const M = fakeMessage({
            unread: [{ _id: { peer: 'c1', order: 'o1' }, n: 2 }],
            lastOrders: [{ _id: 'c1', lastOrderId: 'o9' }]
        });
        expect(await totalReachableUnread(M, 'me')).toBe(0);
    });

    it('يجمع عبر عدّة عملاء', async () => {
        const M = fakeMessage({
            unread: [
                { _id: { peer: 'c1', order: 'o9' }, n: 3 },
                { _id: { peer: 'c2', order: 'o5' }, n: 1 },
                { _id: { peer: 'c3', order: 'old' }, n: 7 }   // قديم ⇒ يُهمَل
            ],
            lastOrders: [
                { _id: 'c1', lastOrderId: 'o9' },
                { _id: 'c2', lastOrderId: 'o5' },
                { _id: 'c3', lastOrderId: 'o7' }
            ]
        });
        expect(await totalReachableUnread(M, 'me')).toBe(4);
    });

    it('لا شيء غير مقروء ⇒ صفر', async () => {
        expect(await totalReachableUnread(fakeMessage({}), 'me')).toBe(0);
    });
});

describe('قائمة المحادثات تستعمل التعريف المشترك', () => {
    const src = codeOnly(read('routes/chat.js'));

    it('لا تحسب unreadCount داخل $group بعد الآن', () => {
        // كان العدّ داخل التجميع بالطرف الآخر — وهو منبع العطل
        expect(src).toContain("require('../utils/chatUnread')");
        expect(src).toContain('unreadByPeerAndOrder');
    });

    it('ترجع العدّ على الطلب الذي يفتحه السطر', () => {
        expect(src).toContain('unreadMap.get(unreadKey(conv._id, conv.lastOrderId))');
    });
});

describe('مسار الشارات للتاجر', () => {
    const src = codeOnly(read('routes/merchant.js'));
    const i = src.indexOf("router.get('/badges'");
    const block = src.slice(i, src.indexOf('\nrouter.', i + 20));

    it('موجود ومحمي بدور التاجر', () => {
        expect(i).toBeGreaterThan(-1);
        expect(src).toMatch(/router\.get\('\/badges',\s*protect,\s*merchantOnly/);
    });

    it('يعدّ ما ينتظر فعلاً: طلبٌ جديد أو قيد التجهيز', () => {
        expect(block).toContain("status: 'shop_pending'");
        expect(block).toContain("status: 'shop_preparing'");
    });

    it('يستعمل نفس تعريف غير المقروء لا حساباً مستقلاً', () => {
        expect(block).toContain('totalReachableUnread');
    });

    it('المخزون: الصفر وحده نفاد — null يعني غير محدود', () => {
        expect(block).toContain('stock: 0');
    });

    it('يحصر كل عدّ بمتجر الطالب', () => {
        expect(block).toContain('ownerId: req.user._id');
        expect(block).toContain('place: place._id');
        expect(block).toContain('placeId: place._id');
    });
});

describe('وحدة الشارات في الواجهة', () => {
    const raw = read('public_html/js/merchant-badges.js');
    // الفحوص السلبية على الكود وحده: التعليقات هنا تذكر display و
    // requestAnimationFrame لشرح سبب تجنّبهما، فمطابقة النص الخام كانت
    // تُفشل الاختبار على شرحه نفسه.
    const src = codeOnly(raw);

    it('طلبٌ واحد لكل الأرقام لا أربعة', () => {
        expect(src).toContain('/api/merchant/badges');
        expect((src.match(/fetch\(/g) || []).length).toBe(1);
    });

    it('الإخفاء بـ hidden لا بـ display — display لا يقبل الانتقال', () => {
        expect(src).toContain('el.hidden = true');
        expect(src).not.toContain('style.display');
    });

    it('إعادة تدفّق مفروضة لا rAF — الصفحة قد تكون مخفيّة', () => {
        // rAF لا تُستدعى إطلاقاً والصفحة مخفيّة، فتبقى الشارة شفّافة
        // رغم أن رقمها وصل — أي لا يراها أحد.
        expect(src).toContain('void el.offsetWidth');
        expect(src).not.toContain('requestAnimationFrame');
    });

    it('الجلب الأول يعمل ولو كانت الصفحة مخفيّة، والدوري لا', () => {
        expect(src).toContain('refresh(true)');
        expect(src).toContain('if (document.hidden && !idleOk) return;');
    });

    it('يُحدَّث فور العودة للصفحة — لا انتظار دورة الاستطلاع', () => {
        expect(src).toContain("addEventListener('visibilitychange'");
        expect(src).toContain('window.refreshMerchantBadges');
    });

    it('النبضة عند الازدياد وحده', () => {
        expect(src).toContain('n > _last[key]');
    });
});
