import { describe, it, expect, vi } from 'vitest';

// 🔒 توكن الرفع المقيّد لا يصلح إلا لمسار الوثائق — ولا يُخدع بالاستعلام
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'z'.repeat(40);
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

function run(url) {
    const token = jwt.sign({ userId: 'u1', scope: 'upload_only' }, process.env.JWT_SECRET);
    const req = { headers: { authorization: 'Bearer ' + token }, originalUrl: url };
    let status = null; let nextCalled = false;
    const res = { status(c) { status = c; return this; }, json() { return this; } };
    return protect(req, res, () => { nextCalled = true; }).then(() => ({ status, nextCalled }));
}

describe('🔒 التوكن المقيّد', () => {
    vi.spyOn(User, 'findById').mockImplementation(() => ({
        select: async () => ({ _id: 'u1', role: 'captain', isActive: true, tokenVersion: 0 })
    }));
    it('يمرّ على مسار الوثائق', async () => {
        expect((await run('/api/upload/captain-docs')).nextCalled).toBe(true);
    });
    it('يُرفض على مسارٍ آخر ولو حمل اسم المسار في الاستعلام', async () => {
        const r = await run('/api/orders?x=/api/upload/captain-docs');
        expect(r.nextCalled).toBe(false);
        expect(r.status).toBe(403);
    });
});
