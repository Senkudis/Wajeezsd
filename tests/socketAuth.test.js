/**
 * Unit tests — utils/socketAuth
 *
 * يغطّي الثغرة الحرجة: قبل الإصلاح كان user_join يثق بالـ userId القادم من العميل،
 * فأمكن لأي شخص انتحال أي مستخدم (بما فيهم الأدمن). الهوية الآن من التوكن حصراً.
 */
const jwt = require('jsonwebtoken');
const { verifySocketToken, resolveSocketIdentity } = require('../utils/socketAuth');

const SECRET = 'test-secret-that-is-at-least-32-bytes-long!!';
const LEGACY = 'legacy-secret-that-is-also-long-enough-xx';

const VICTIM_ID = '507f1f77bcf86cd799439011';
const ATTACKER_ID = '507f1f77bcf86cd799439022';
const ADMIN_ID = '507f1f77bcf86cd799439033';

// قاعدة مستخدمين وهمية
const USERS = {
    [VICTIM_ID]:   { _id: VICTIM_ID,   role: 'client',  city: 'Khartoum',  isActive: true },
    [ATTACKER_ID]: { _id: ATTACKER_ID, role: 'client',  city: 'PortSudan', isActive: true },
    [ADMIN_ID]:    { _id: ADMIN_ID,    role: 'admin',   city: 'Khartoum',  isActive: true },
    suspended:     { _id: 'suspended', role: 'captain', city: 'Khartoum',  isActive: false }
};
const findUserById = async (id) => USERS[id] || null;

const sign = (payload, opts = {}) => jwt.sign(payload, SECRET, opts);
const OPTS = { secret: SECRET, legacySecret: LEGACY };

describe('verifySocketToken', () => {
    it('يقبل توكناً موقّعاً بالسر الحالي', () => {
        const token = sign({ userId: VICTIM_ID, role: 'client' });
        expect(verifySocketToken(token, OPTS)?.userId).toBe(VICTIM_ID);
    });

    it('يرفض توكناً موقّعاً بسر آخر', () => {
        const forged = jwt.sign({ userId: VICTIM_ID }, 'some-other-attacker-secret-value-xxxx');
        expect(verifySocketToken(forged, OPTS)).toBeNull();
    });

    it('يرفض توكناً منتهي الصلاحية', () => {
        const token = sign({ userId: VICTIM_ID }, { expiresIn: '-1s' });
        expect(verifySocketToken(token, OPTS)).toBeNull();
    });

    it('يرفض توكن alg=none (هجوم إسقاط التوقيع)', () => {
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const body = Buffer.from(JSON.stringify({ userId: ADMIN_ID })).toString('base64url');
        expect(verifySocketToken(`${header}.${body}.`, OPTS)).toBeNull();
    });

    it('يرفض القيم الفارغة وغير النصية', () => {
        expect(verifySocketToken(null, OPTS)).toBeNull();
        expect(verifySocketToken(undefined, OPTS)).toBeNull();
        expect(verifySocketToken('', OPTS)).toBeNull();
        expect(verifySocketToken({ userId: ADMIN_ID }, OPTS)).toBeNull();
        expect(verifySocketToken('not-a-jwt', OPTS)).toBeNull();
    });

    it('يقبل توكن النسخ القديمة عبر السر القديم', () => {
        const legacyToken = jwt.sign({ userId: VICTIM_ID }, LEGACY);
        expect(verifySocketToken(legacyToken, OPTS)?.userId).toBe(VICTIM_ID);
    });

    it('يرفض توكن السر القديم إذا لم يُضبط LEGACY', () => {
        const legacyToken = jwt.sign({ userId: VICTIM_ID }, LEGACY);
        expect(verifySocketToken(legacyToken, { secret: SECRET, legacySecret: undefined })).toBeNull();
    });
});

describe('resolveSocketIdentity', () => {
    it('يُرجع هوية موثوقة لتوكن صالح لحساب نشط', async () => {
        const token = sign({ userId: VICTIM_ID, role: 'client' });
        const identity = await resolveSocketIdentity(token, findUserById, OPTS);
        expect(identity).toEqual({ userId: VICTIM_ID, role: 'client', city: 'Khartoum' });
    });

    it('🔒 الهوية تأتي من التوكن — لا من أي إدخال للعميل', async () => {
        // المهاجم يملك توكنه الصحيح لكنه يدّعي أنه الضحية.
        // resolveSocketIdentity لا تقبل أصلاً أي userId من العميل — التوقيع هو المصدر الوحيد.
        const attackerToken = sign({ userId: ATTACKER_ID, role: 'client' });
        const identity = await resolveSocketIdentity(attackerToken, findUserById, OPTS);
        expect(identity.userId).toBe(ATTACKER_ID);
        expect(identity.userId).not.toBe(VICTIM_ID);
    });

    it('🔒 دور الأدمن لا يُنتزع بتزوير role داخل توكن غير موقّع', async () => {
        // تزوير الدور في الحمولة لا ينفع: التوقيع يفشل.
        const forged = jwt.sign({ userId: ATTACKER_ID, role: 'admin' }, 'wrong-secret-wrong-secret-wrong!!');
        expect(await resolveSocketIdentity(forged, findUserById, OPTS)).toBeNull();
    });

    it('🔒 الدور يُقرأ من قاعدة البيانات لا من التوكن', async () => {
        // توكن صحيح التوقيع لكن يدّعي role=admin لحساب عميل عادي.
        const token = sign({ userId: ATTACKER_ID, role: 'admin' });
        const identity = await resolveSocketIdentity(token, findUserById, OPTS);
        expect(identity.role).toBe('client'); // القيمة من DB تفوز
    });

    it('يمنح الأدمن الحقيقي دور admin', async () => {
        const token = sign({ userId: ADMIN_ID, role: 'admin' });
        expect((await resolveSocketIdentity(token, findUserById, OPTS)).role).toBe('admin');
    });

    it('يرفض حساباً أوقفته الإدارة (isActive=false)', async () => {
        const token = sign({ userId: 'suspended', role: 'captain' });
        expect(await resolveSocketIdentity(token, findUserById, OPTS)).toBeNull();
    });

    it('يرفض توكناً لمستخدم محذوف', async () => {
        const token = sign({ userId: '507f1f77bcf86cd799439099' });
        expect(await resolveSocketIdentity(token, findUserById, OPTS)).toBeNull();
    });

    it('يرفض التوكن المقيّد upload_only', async () => {
        const token = sign({ userId: VICTIM_ID, role: 'captain', scope: 'upload_only' });
        expect(await resolveSocketIdentity(token, findUserById, OPTS)).toBeNull();
    });

    it('يقبل التوكن ذا scope=full صراحةً', async () => {
        const token = sign({ userId: VICTIM_ID, role: 'client', scope: 'full' });
        expect((await resolveSocketIdentity(token, findUserById, OPTS)).userId).toBe(VICTIM_ID);
    });

    it('يرفض غياب التوكن تماماً (اتصال مجهول)', async () => {
        expect(await resolveSocketIdentity(undefined, findUserById, OPTS)).toBeNull();
        expect(await resolveSocketIdentity('', findUserById, OPTS)).toBeNull();
    });

    it('يرفض توكناً بلا userId', async () => {
        const token = sign({ role: 'admin' });
        expect(await resolveSocketIdentity(token, findUserById, OPTS)).toBeNull();
    });

    it('يُرجع city=null لمستخدم قديم بلا مدينة', async () => {
        const finder = async () => ({ _id: VICTIM_ID, role: 'client', isActive: true });
        const token = sign({ userId: VICTIM_ID });
        expect((await resolveSocketIdentity(token, finder, OPTS)).city).toBeNull();
    });
});
