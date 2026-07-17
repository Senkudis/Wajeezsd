/**
 * Unit tests — utils/chatAuth
 *
 * يغطّي الثغرة: /api/beacon كان يحفظ أي رسالة لأي مستخدم بلا تفويض.
 * هذه الدالة هي الحارس الموحّد الذي صار beacon يستدعيه.
 */
const { authorizeChatMessage } = require('../utils/chatAuth');

const CLIENT = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const CAPTAIN = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const MERCHANT = 'ccccccccccccccccccccccc3';
const STRANGER = 'ddddddddddddddddddddddd4';

// بنّاء نماذج وهمية
function makeModels({ users = {}, orders = {}, shopOrders = {} } = {}) {
    const lean = (v) => ({ lean: async () => v, select: function () { return this; }, populate: function () { return this; } });
    return {
        User:      { findById: (id) => lean(users[id] ?? null) },
        Order:     { findById: (id) => lean(orders[id] ?? null) },
        ShopOrder: { findById: (id) => lean(shopOrders[id] ?? null) }
    };
}

const activeUsers = {
    [CLIENT]:   { _id: CLIENT,   is_blocked: false },
    [CAPTAIN]:  { _id: CAPTAIN,  is_blocked: false },
    [MERCHANT]: { _id: MERCHANT, is_blocked: false },
    [STRANGER]: { _id: STRANGER, is_blocked: false }
};

describe('authorizeChatMessage — طلب توصيل عادي', () => {
    const models = makeModels({
        users: activeUsers,
        orders: { ord1: { _id: 'ord1', client: CLIENT, captain: CAPTAIN, status: 'accepted' } }
    });

    it('يسمح للعميل بمراسلة كابتن طلبه', async () => {
        const r = await authorizeChatMessage({ sender: CLIENT, receiver: CAPTAIN, order: 'ord1' }, models);
        expect(r.ok).toBe(true);
    });

    it('يسمح للكابتن بمراسلة عميل طلبه', async () => {
        const r = await authorizeChatMessage({ sender: CAPTAIN, receiver: CLIENT, order: 'ord1' }, models);
        expect(r.ok).toBe(true);
    });

    it('🔒 يمنع غريباً ليس طرفاً في الطلب (جوهر ثغرة beacon)', async () => {
        const r = await authorizeChatMessage({ sender: STRANGER, receiver: CLIENT, order: 'ord1' }, models);
        expect(r.ok).toBe(false);
        expect(r.status).toBe(403);
    });

    it('🔒 يمنع إرسالاً لمستقبِل ليس طرفاً في الطلب', async () => {
        const r = await authorizeChatMessage({ sender: CLIENT, receiver: STRANGER, order: 'ord1' }, models);
        expect(r.ok).toBe(false);
        expect(r.status).toBe(403);
    });

    it('🔒 يمنع الدردشة على طلب مُسلَّم أو ملغى', async () => {
        for (const status of ['delivered', 'cancelled']) {
            const m = makeModels({ users: activeUsers, orders: { o: { _id: 'o', client: CLIENT, captain: CAPTAIN, status } } });
            const r = await authorizeChatMessage({ sender: CLIENT, receiver: CAPTAIN, order: 'o' }, m);
            expect(r.ok).toBe(false);
        }
    });
});

describe('authorizeChatMessage — طلب متجر (عميل ↔ تاجر)', () => {
    const models = makeModels({
        users: activeUsers,
        shopOrders: { shop1: { _id: 'shop1', client: CLIENT, place: { ownerId: MERCHANT }, status: 'pending' } }
    });

    it('يسمح للعميل بمراسلة تاجر المتجر', async () => {
        const r = await authorizeChatMessage({ sender: CLIENT, receiver: MERCHANT, order: 'shop1' }, models);
        expect(r.ok).toBe(true);
        expect(r.orderModel).toBe('ShopOrder');
    });

    it('🔒 يمنع غريباً من دردشة طلب متجر', async () => {
        const r = await authorizeChatMessage({ sender: STRANGER, receiver: MERCHANT, order: 'shop1' }, models);
        expect(r.ok).toBe(false);
        expect(r.status).toBe(403);
    });

    it('🔒 يمنع الدردشة على طلب متجر ملغى', async () => {
        const m = makeModels({ users: activeUsers, shopOrders: { s: { _id: 's', client: CLIENT, place: { ownerId: MERCHANT }, status: 'cancelled' } } });
        const r = await authorizeChatMessage({ sender: CLIENT, receiver: MERCHANT, order: 's' }, m);
        expect(r.ok).toBe(false);
    });
});

describe('authorizeChatMessage — فحوصات عامة', () => {
    const models = makeModels({ users: activeUsers, orders: { ord1: { _id: 'ord1', client: CLIENT, captain: CAPTAIN, status: 'accepted' } } });

    it('يرفض الحقول الناقصة', async () => {
        expect((await authorizeChatMessage({ sender: CLIENT, receiver: '', order: 'ord1' }, models)).status).toBe(400);
        expect((await authorizeChatMessage({ sender: '', receiver: CAPTAIN, order: 'ord1' }, models)).status).toBe(400);
        expect((await authorizeChatMessage({ sender: CLIENT, receiver: CAPTAIN, order: '' }, models)).status).toBe(400);
    });

    it('يرفض مراسلة النفس', async () => {
        expect((await authorizeChatMessage({ sender: CLIENT, receiver: CLIENT, order: 'ord1' }, models)).status).toBe(400);
    });

    it('🔒 يمنع كابتن محجوباً من الإرسال', async () => {
        const m = makeModels({
            users: { ...activeUsers, [CAPTAIN]: { _id: CAPTAIN, is_blocked: true } },
            orders: { ord1: { _id: 'ord1', client: CLIENT, captain: CAPTAIN, status: 'accepted' } }
        });
        const r = await authorizeChatMessage({ sender: CAPTAIN, receiver: CLIENT, order: 'ord1' }, m);
        expect(r.ok).toBe(false);
        expect(r.status).toBe(403);
    });

    it('يرفض طلباً غير موجود في أي مجموعة', async () => {
        const r = await authorizeChatMessage({ sender: CLIENT, receiver: CAPTAIN, order: 'ghost' }, models);
        expect(r.status).toBe(404);
    });

    it('يرفض مرسِلاً محذوفاً', async () => {
        const m = makeModels({ users: {}, orders: { ord1: { _id: 'ord1', client: CLIENT, captain: CAPTAIN, status: 'accepted' } } });
        const r = await authorizeChatMessage({ sender: CLIENT, receiver: CAPTAIN, order: 'ord1' }, m);
        expect(r.status).toBe(403);
    });
});
