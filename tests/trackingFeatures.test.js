/**
 * 🛰️ لوحة التتبّع — ما أُضيف فوق البطاقات:
 *   • المسافة للمحلّ/العميل و«واقف لا يتحرّك»
 *   • تحديثٌ مباشر عبر الـ socket، وتنبيهٌ صوتيّ حين تصير رحلةٌ متأخّرة
 *   • زرّ الاتصال بالعميل
 *   • تقرير الكباتن: من يتكرّر تأخّره أو تسليمه البعيد
 *   • ردّ الكابتن على تنبيه الإدارة («حاضر، في الطريق»)
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const { captainReport } = require('../utils/trackingReport');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const N = { captainPickup1: 15, captainPickup2: 40, captainDeliver1: 30, captainDeliver2: 75 };
const t0 = new Date('2026-09-28T08:00:00Z');
const at = (m) => new Date(t0.getTime() + m * 60000);
const A = { _id: 'a1', name: 'أحمد', phone: '0911' };
const B = { _id: 'b1', name: 'بشير', phone: '0922' };
const trip = (captain, over = {}) => ({
    status: 'delivered', city: 'Khartoum', captain,
    acceptedAt: at(0), pickedUpAt: at(10), deliveredAt: at(30),
    proofOfPickupImage: '/p.jpg', deliveryProof: { verified: true, reason: 'ok', distanceM: 30 },
    ...over
});

describe('تقرير الكباتن', () => {
    const orders = [
        trip(A),
        trip(A, { pickedUpAt: at(50), deliveredAt: at(70) }),                          // استلام ٥٠ د ≥ ٤٠ ← متأخّرة
        trip(A, { deliveryProof: { verified: false, reason: 'too_far', distanceM: 1500 } }),
        trip(B, { proofOfPickupImage: null }),
        trip(B, {
            adminNudges: [
                { to: 'captain', at: at(5), ackAt: at(6), ackText: 'حاضر، في الطريق' },
                { to: 'captain', at: at(20) },
                { to: 'client', at: at(21) }
            ]
        })
    ];
    const rep = captainReport(orders, () => N);
    const byId = Object.fromEntries(rep.map(r => [r.id, r]));

    it('🔑 يعدّ لكل كابتن: المتأخّرة، والبعيدة، وبلا صورة', () => {
        expect(byId.a1).toMatchObject({ trips: 3, late: 1, far: 1, noPhoto: 0, issues: 2, lateRate: 33 });
        expect(byId.b1).toMatchObject({ trips: 2, late: 0, far: 0, noPhoto: 1, issues: 1 });
    });
    it('الأكثر ملاحظاتٍ أولاً', () => {
        expect(rep.map(r => r.id)).toEqual(['a1', 'b1']);
    });
    it('تنبيهات الإدارة للكابتن وكم ردّ منها — لا تنبيهات العميل', () => {
        expect(byId.b1).toMatchObject({ nudged: 2, acked: 1 });
    });
    it('«قارب» ليس تأخّراً: العتبة الثانية وحدها تُحسب على الكابتن', () => {
        const r = captainReport([trip(A, { pickedUpAt: at(20), deliveredAt: at(40) })], () => N);
        expect(r[0].late).toBe(0);                // ٢٠ د تجاوزت الأولى (١٥) لا الثانية (٤٠)
    });
    it('بعد نقل الطلب: الوقت من إسناد الكابتن الحاليّ', () => {
        const r = captainReport([trip(A, { captainAssignedAt: at(45), pickedUpAt: at(55), deliveredAt: at(70) })], () => N);
        expect(r[0].late).toBe(0);
    });
    it('متوسط المدّة', () => {
        expect(byId.b1.avgMin).toBe(30);
    });
});

describe('الخادم', () => {
    const route = read('routes/admin/tracking.js');
    const cap = read('routes/captain.js');

    it('مسار التقرير بصلاحية اللوحة ومدن الأدمن، وبفتراتٍ محدّدة', () => {
        const r = route.slice(route.indexOf("'/tracking/report'"));
        expect(r).toContain('protect, CAN_VIEW');
        expect(r).toContain('...getAdminCityFilter(req)');
        expect(route).toContain('const REPORT_DAYS = [1, 7, 30]');
    });
    it('الملخّص يعدّ الواقفين', () => {
        expect(route).toContain("stopped: count(t => t.motion && t.motion.state === 'stopped')");
    });

    it('🔑 ردّ الكابتن: على مهمّته الجارية وحدها، وبردودٍ ثابتة', () => {
        const r = cap.slice(cap.indexOf("'/nudges/:orderId/ack'"));
        expect(r).toContain('protect, captainOnly');
        expect(r).toContain('captain: req.user._id');
        expect(r).toContain("status: { $in: ['accepted', 'picked_up'] }");
        expect(cap).toContain("on_way:  'حاضر، في الطريق'");
        expect(r).toContain("if (!reply) return res.status(400)");
        // تنبيه الكابتن السابق (قبل نقل الطلب) لا يردّ عليه الجديد
        expect(r).toContain('currentNudges(order)');
        expect(r).toContain("'adminNudges.$.ackAt': at");
        // اللوحة المفتوحة تتحدّث فوراً، و«عندي مشكلة» يصل الإدارة إشعاراً
        expect(r).toContain("io.to('admin_room').emit('admin_order_update'");
        expect(r).toContain('notifyAdmins(req.app');
    });
    it('وحقلا الردّ معرّفان على التنبيه', () => {
        const Order = require('../models/Order');
        const sub = Order.schema.path('adminNudges').schema;
        expect(sub.path('ackAt')).toBeTruthy();
        expect(sub.path('ackText')).toBeTruthy();
    });
});

describe('اللوحة', () => {
    const js = read('public_html/js/admin-tracking.js');
    const html = read('public_html/admin-tracking.html');

    it('المسافة والتوقّف على البطاقة، ورقاقة «واقف لا يتحرّك»', () => {
        expect(js).toContain('function motionFact(t)');
        expect(js).toContain("key: 'stopped'");
        expect(js).toContain("stopped: running && t.motion && t.motion.state === 'stopped'");
        // الواقف يُقترح له «تحرّك» ولو لم يتأخّر بعد
        expect(js).toMatch(/motion\.state === 'stopped'\) return 'move_now'/);
    });
    it('زرّ الاتصال بالعميل', () => {
        expect(js).toContain('class="call-client" href="tel:${esc(t.client.phone)}"');
    });
    it('ردّ الكابتن يظهر على البطاقة — والنصّ مهرَّب', () => {
        expect(js).toContain('«${esc(n.ack.text)}»');
        expect(js).toContain('لم يردّ بعد');
    });
    it('🔑 مباشر عبر الـ socket: غرفة الإدارة، وإعادة تحميلٍ مجمّعة', () => {
        expect(html).toContain('vendor/socket.io/socket.io.min.js');
        expect(js).toContain("sock.emit('admin_join')");
        expect(js).toContain("sock.on('admin_order_update', soon)");
    });
    it('🔑 التنبيه الصوتيّ: لما **صار** متأخّراً فقط، ومفتاحٌ يحفظه الأدمن', () => {
        expect(js).toContain('if (alarmed === null) { alarmed = nowKeys; return; }');
        expect(js).toContain("localStorage.setItem('trk_sound'");
        expect(html).toMatch(/id="trkSound" aria-pressed="false"/);
    });
    it('تقرير الكباتن: تبويبان بسماتهما، وجدولٌ يُقرأ', () => {
        expect(html).toMatch(/role="tablist"/);
        expect(html).toMatch(/id="tabReport" aria-controls="viewReport"/);
        expect(html).toMatch(/id="viewReport" role="tabpanel"/);
        expect(js).toContain('<th scope="col">متأخّرة</th>');
        expect(js).toContain('/api/admin/tracking/report?');
    });
    it('بلا إيموجي في ما يُعرض', () => {
        const shown = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
            + js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/[^\n'"`]*$/gm, '');
        expect(shown).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });
});

describe('شاشة الكابتن', () => {
    const page = read('public_html/captain-missions.html');
    it('🔑 تنبيه الإدارة على المهمّة مع أزرار الردّ', () => {
        expect(page).toContain('${adminNudgeHtml(order)}');
        expect(page).toContain('/api/captain/nudges/${orderId}/ack');
        expect(page).toContain("['on_way', 'حاضر، في الطريق'");
    });
    it('نصّ الإدارة مهرَّب، وما قبل الإسناد ليس له', () => {
        expect(page).toContain('${esc(n.message)}');
        expect(page).toContain('new Date(n.at).getTime() >= since');
    });
    it('ويظهر فور وصوله', () => {
        expect(page).toContain("n.type === 'admin_nudge'");
    });
});
