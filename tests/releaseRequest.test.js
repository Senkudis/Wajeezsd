/**
 * 🙋 طلب التنازل — «الكباتن ما يلعبو يقبلو اوردرات ويتنازلو».
 *
 * كان «تنازل» يعيد الطلب للسوق بضغطة. الآن:
 *   • الكابتن يكتب سببه، والطلب يبقى معه.
 *   • الإدارة تقبل (فيعود متاحاً ويُبلَّغ الكباتن المؤهّلون) أو ترفض.
 *   • لا بعد الاستلام، ولا طلبان معلّقان، ولا أكثر من ثلاث مرّات.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const orders = read('routes/orders.js');
const route = orders.slice(orders.indexOf("router.put('/:id/release'"), orders.indexOf("router.put('/:id/pickup'"));
const admin = read('routes/admin/orders.js');
const decide = admin.slice(admin.indexOf('async function decideRelease'), admin.indexOf('// 📣 تذكير كباتن المدينة'));

describe('الكابتن يطلب — لا يتنازل', () => {
    it('السبب إلزاميّ، والخطأ في خانته', () => {
        const { cleanReason, REASON_MIN } = require('../utils/releaseRequest');
        expect(REASON_MIN).toBe(5);
        expect(cleanReason('  <b>تعطّلت</b>   المركبة ')).toBe('تعطّلت المركبة');
        expect(cleanReason(null)).toBe('');
        expect(cleanReason('x'.repeat(500))).toHaveLength(300);
        expect(route).toContain('reason.length < REASON_MIN');
        expect(route).toContain("field: 'reason'");
    });

    it('الطلب يبقى معه: التحديث لا يمسّ status ولا captain', () => {
        const upd = route.slice(route.indexOf('Order.findOneAndUpdate'), route.indexOf('if (!updated)'));
        // status هنا حالة طلب التنازل داخل releaseRequest لا حالة الطلب
        expect(upd).toContain("$set: { releaseRequest: {");
        expect(upd).not.toContain('captain: null');
        expect(upd).not.toContain('CLEAN_SLATE');
    });

    it('ذرّياً: معه، قبل الاستلام، وبلا طلبٍ معلّق', () => {
        expect(route).toContain("{ _id: req.params.id, captain: req.user.id, status: 'accepted', 'releaseRequest.status': { $ne: 'pending' } }");
        expect(route).toContain("current.status === 'picked_up'");
        expect(route).toContain('409');
    });

    it('حدٌّ لتكرار الطلب على الطلب نفسه', () => {
        const { MAX_REQUESTS_PER_ORDER } = require('../utils/releaseRequest');
        expect(MAX_REQUESTS_PER_ORDER).toBe(3);
        expect(route).toContain('mine >= MAX_REQUESTS_PER_ORDER');
        expect(route).toContain('429');
    });

    it('الإدارة تعرف فوراً — إشعارٌ وتحديث اللوحة', () => {
        expect(route).toContain('notifyAdmins(req.app');
        expect(route).toContain("releaseRequest: 'pending'");
        expect(read('models/Notification.js')).toContain("'admin_alert'");
    });
});

describe('الإدارة تقرّر', () => {
    it('بصلاحية إدارة الطلبات، وفي نطاق المدينة', () => {
        expect(admin).toContain("router.put('/orders/:id/release/approve', protect, requirePermission('manage_orders')");
        expect(admin).toContain("router.put('/orders/:id/release/reject', protect, requirePermission('manage_orders')");
        expect(decide).toContain('adminCoversCity(req.user');
    });

    it('ذرّياً: ما زال مع الكابتن الطالب والطلب معلّق — والقبول قبل الاستلام وحده', () => {
        expect(decide).toContain("const filter = { _id: current._id, 'releaseRequest.status': 'pending', captain: rr.captain }");
        expect(decide).toContain("if (approve) filter.status = 'accepted'");
    });

    it('القبول: يعود متاحاً نظيفاً، ويُبلَّغ الكباتن والعميل', () => {
        expect(decide).toContain('...CLEAN_SLATE');
        expect(decide).toContain('rebroadcast(req.app, order, rr.captain)');
        // طلب المتجر يعود «جاهزاً» فقط إن كان مُسنداً
        expect(decide).toContain("status: 'captain_assigned'");
    });

    it('كلا القرارين في السجلّ — والإجراءان في قائمة AdminLog', () => {
        expect(decide).toContain('$push: { releaseHistory: history }');
        const log = read('models/AdminLog.js');
        expect(log).toContain("'approve_release'");
        expect(log).toContain("'reject_release'");
    });
});

describe('إعادة البثّ للمؤهّلين وحدهم', () => {
    const userPath = require.resolve('../models/User');
    const pushPath = require.resolve('../utils/firebasePush');
    const helperPath = require.resolve('../utils/releaseRequest');
    let saved, filter, pushed, emitted;

    beforeEach(() => {
        saved = { u: require.cache[userPath], p: require.cache[pushPath] };
        pushed = null; emitted = [];
        require.cache[userPath] = { id: userPath, filename: userPath, loaded: true, exports: {
            find: (f) => { filter = f; return { select: () => ({ lean: async () => [{ fcmToken: 't1' }, { fcmToken: 't2' }] }) }; }
        } };
        require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {
            sendPushToMany: async (tokens, title, body, data) => { pushed = { tokens, title, data }; }
        } };
        delete require.cache[helperPath];
    });
    afterEach(() => {
        for (const [k, p] of [['u', userPath], ['p', pushPath]]) {
            if (saved[k]) require.cache[p] = saved[k]; else delete require.cache[p];
        }
        delete require.cache[helperPath];
    });

    it('معتمدون، نشطون، غير محظورين، متاحون — ولا المتنازل', async () => {
        const { rebroadcast } = require('../utils/releaseRequest');
        const io = { to: (room) => ({ emit: (ev, d) => emitted.push({ room, ev, d }) }) };
        const app = { get: () => io };
        const n = await rebroadcast(app, { _id: 'o1', city: 'Khartoum', price: 3000, orderType: 'delivery', pickup: { address: 'x' } }, 'cap1');
        expect(n).toBe(2);
        expect(filter).toMatchObject({
            role: 'captain', city: 'Khartoum', approvalStatus: 'approved', isActive: true,
            is_blocked: { $ne: true }, isAvailableForWork: true, _id: { $ne: 'cap1' }
        });
        expect(pushed.tokens).toEqual(['t1', 't2']);
        expect(pushed.data.type).toBe('new_order');
        expect(emitted[0]).toMatchObject({ room: 'room_Khartoum', ev: 'new_order_available' });
    });
});

describe('الواجهات', () => {
    it('الكابتن: زرّ «طلب تنازل» بسببٍ إلزاميّ، وحالة الطلب المعلّق', () => {
        const m = read('public_html/captain-missions.html');
        expect(m).toContain('طلب تنازل عن الطلب');
        expect(m).toContain("input: 'textarea'");
        expect(m).toContain('v.trim().length < 5');
        expect(m).toContain('قيد مراجعة الإدارة');
        // رفضٌ لكابتنٍ سابق لا يُعرض على الحاليّ
        expect(m).toContain('String(rr.captain) === String(me)');
    });

    it('لوحة التتبّع: فلتر «طلبات تنازل» وزرّا قبول ورفض', () => {
        const j = read('public_html/js/admin-tracking.js');
        expect(j).toContain("key: 'release'");
        expect(j).toContain('data-decision="approve"');
        expect(j).toContain('data-decision="reject"');
        expect(j).toContain("/release/${approve ? 'approve' : 'reject'}");
    });

    it('الطلبات المعلّقة أوّلاً في اللوحة', () => {
        const T = require('../utils/tripTracking');
        const base = { stage: 'to_pickup', late: { level: 'late', elapsed: 50 } };
        const list = [{ ...base, releaseRequest: null }, { ...base, late: { level: 'ok', elapsed: 1 }, releaseRequest: { reason: 'x' } }];
        list.sort(T.compareTrips);
        expect(list[0].releaseRequest).toBeTruthy();
    });
});
