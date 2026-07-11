/**
 * Unit tests — البنية التحتية للتحقق ومعالجة الأخطاء
 * يغطي: authSchema (Zod) + validate middleware + asyncHandler + AppError.
 */
// describe/it/expect/vi متاحة كـ globals (globals: true في vitest.config.js)
const { registerSchema, loginSchema } = require('../schemas/authSchema');
const { validate } = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

// helper: يبني req/res/next وهميين لاختبار الـ middleware
const mockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = vi.fn((code) => { res.statusCode = code; return res; });
    res.json = vi.fn((body) => { res.body = body; return res; });
    return res;
};

describe('authSchema — registerSchema', () => {
    it('accepts a valid registration payload and lowercases the email', () => {
        const parsed = registerSchema.parse({
            name: 'أحمد',
            email: 'Test@Example.COM',
            phone: '0912345678',
            password: 'secret1',
        });
        expect(parsed.email).toBe('test@example.com');
    });

    it('rejects a short password', () => {
        expect(() => registerSchema.parse({
            name: 'أحمد', email: 'a@b.com', phone: '0912345678', password: '123',
        })).toThrow();
    });

    it('rejects an invalid email', () => {
        expect(() => registerSchema.parse({
            name: 'أحمد', email: 'not-an-email', phone: '0912345678', password: 'secret1',
        })).toThrow();
    });

    it('keeps extra fields via passthrough (e.g. role, city)', () => {
        const parsed = registerSchema.parse({
            name: 'أحمد', email: 'a@b.com', phone: '0912345678', password: 'secret1',
            role: 'captain', city: 'Khartoum',
        });
        expect(parsed.role).toBe('captain');
    });
});

describe('authSchema — loginSchema', () => {
    it('requires a password', () => {
        expect(() => loginSchema.parse({ email: 'a@b.com', password: '' })).toThrow();
    });

    it('accepts an email identifier', () => {
        expect(() => loginSchema.parse({ email: 'a@b.com', password: 'secret1' })).not.toThrow();
    });

    it('accepts a phone-number identifier (login is email OR phone)', () => {
        // المعرّف قد يكون رقم هاتف — يجب ألا يُرفض كبريد غير صالح
        const parsed = loginSchema.parse({ email: '0912345678', password: 'secret1' });
        expect(parsed.email).toBe('0912345678');
    });

    it('rejects an empty identifier', () => {
        expect(() => loginSchema.parse({ email: '', password: 'secret1' })).toThrow();
    });
});

describe('validate middleware', () => {
    it('calls next() with no error on valid body', () => {
        const req = { body: { email: 'a@b.com', password: 'secret1' } };
        const res = mockRes();
        const next = vi.fn();
        validate(loginSchema)(req, res, next);
        expect(next).toHaveBeenCalledOnce();
        expect(next.mock.calls[0].length).toBe(0); // next() بدون خطأ
    });

    it('responds 400 with an Arabic message on invalid body', () => {
        const req = { body: { email: 'bad', password: '' } };
        const res = mockRes();
        const next = vi.fn();
        validate(loginSchema)(req, res, next);
        expect(res.statusCode).toBe(400);
        expect(typeof res.body.message).toBe('string');
        expect(next).not.toHaveBeenCalled();
    });
});

describe('asyncHandler', () => {
    it('forwards a thrown error to next()', async () => {
        const boom = new Error('boom');
        const next = vi.fn();
        await asyncHandler(async () => { throw boom; })({}, {}, next);
        expect(next).toHaveBeenCalledWith(boom);
    });

    it('does not call next() when the handler resolves', async () => {
        const next = vi.fn();
        await asyncHandler(async (req, res) => { res.ok = true; })({}, {}, next);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('AppError', () => {
    it('carries a statusCode and is flagged operational', () => {
        const err = new AppError('الطلب غير موجود', 404);
        expect(err.statusCode).toBe(404);
        expect(err.isOperational).toBe(true);
        expect(err.message).toBe('الطلب غير موجود');
    });

    it('defaults to status 400', () => {
        expect(new AppError('خطأ').statusCode).toBe(400);
    });
});
