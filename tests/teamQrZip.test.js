/**
 * 🗜️ تنزيل كل رموز QR للفريق في ملف ZIP — GET /api/team/admin/qr-zip
 *
 * يُشغَّل المسار فعلاً: المصادقة والقاعدة مستبدلتان، والملف الناتج يُفكّ
 * ويُفحص — صورة PNG صالحة لكل عضو بترتيب الصفحة، ودليل CSV يقرؤه إكسل.
 */
const path = require('path');
const express = require('express');
const request = require('supertest');
const { crc32 } = require('../utils/zipStore');

// ── بدائل: مصادقة تمرّر الأدمن، و User.find يُرجع أعضاءً ثابتين ──
const authPath = require.resolve('../middleware/authMiddleware');
const realAuth = require(authPath);
let lastFilter = null;

function stubAuth() {
    require.cache[authPath] = {
        id: authPath, filename: authPath, loaded: true,
        exports: {
            ...realAuth,
            protect: (req, _res, next) => { req.user = { _id: 'a', role: 'admin', adminRole: 'super_admin' }; next(); },
            requirePermission: () => (_req, _res, next) => next(),
            getAdminCityFilter: () => ({})
        }
    };
}

const MEMBERS = [
    { _id: '507f1f77bcf86cd799439012', name: 'سارة "س" علي', role: 'admin', city: 'Khartoum', teamProfile: { publicId: 'b'.repeat(24), order: 2 } },
    { _id: '507f1f77bcf86cd799439011', name: 'محمد/أحمد', role: 'captain', city: 'PortSudan', vehicleType: 'motorcycle', teamProfile: { publicId: 'a'.repeat(24), order: 1 } }
];

function stubUser(docs) {
    const User = require('../models/User');
    User.find = (filter) => {
        lastFilter = filter;
        const chain = { select: () => chain, limit: () => chain, lean: async () => docs.map(d => JSON.parse(JSON.stringify(d))) };
        return chain;
    };
}

function app() {
    stubAuth();
    delete require.cache[require.resolve('../routes/team')];
    const instance = express();
    instance.use('/api/team', require('../routes/team'));
    return instance;
}

/** فكّ ZIP مخزَّن (store) — يكفي لما يُنتجه utils/zipStore */
function unzip(buf) {
    const out = [];
    let p = 0;
    while (buf.readUInt32LE(p) === 0x04034b50) {
        const size = buf.readUInt32LE(p + 18);
        const nameLen = buf.readUInt16LE(p + 26);
        const extra = buf.readUInt16LE(p + 28);
        const crc = buf.readUInt32LE(p + 14);
        const name = buf.slice(p + 30, p + 30 + nameLen).toString('utf8');
        const data = buf.slice(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
        out.push({ name, data, crcOk: crc32(data) === crc });
        p += 30 + nameLen + extra + size;
    }
    return out;
}

const binary = (res, cb) => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('GET /api/team/admin/qr-zip', () => {
    afterAll(() => { delete require.cache[authPath]; delete require.cache[require.resolve('../routes/team')]; });

    it('رمز PNG لكل عضو بترتيب الصفحة، بأسماءٍ آمنة، ودليل CSV', async () => {
        stubUser(MEMBERS);
        const res = await request(app()).get('/api/team/admin/qr-zip').buffer(true).parse(binary);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe('application/zip');
        expect(res.headers['content-disposition']).toMatch(/attachment; filename="wajeez-team-qr-\d{4}-\d{2}-\d{2}\.zip"/);
        expect(res.headers['x-team-count']).toBe('2');

        const files = unzip(res.body);
        expect(files.map(f => f.name)).toEqual([
            // ترتيب الصفحة العامة (compareTeamOrder): الدور أولاً — الإدارة قبل الكباتن
            '1-سارة س علي-bbbbbb.png',          // «"» محذوفٌ من اسم الملف
            '2-محمد أحمد-aaaaaa.png',           // و«/» لا يصنع مجلداً
            'دليل-البطاقات.csv'
        ]);
        for (const f of files) expect(f.crcOk).toBe(true);
        const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        expect(files[1].data.slice(0, 4).equals(PNG)).toBe(true);

        const csv = files[2].data.toString('utf8');
        expect(csv.charCodeAt(0)).toBe(0xfeff);                         // BOM لإكسل
        expect(csv).toContain('/team/m/' + 'a'.repeat(24));
        expect(csv.split('\r\n')[1]).toMatch(/^1,"سارة/);              // ترتيب الدليل = ترتيب الملفات
        expect(csv).toContain('"سارة ""س"" علي"');                      // تهريب الاقتباس
    });

    it('يتبع البحث والدور المختارين — نفس فلتر القائمة', async () => {
        stubUser(MEMBERS);
        await request(app()).get('/api/team/admin/qr-zip?role=captain&search=' + encodeURIComponent('محمد(')).buffer(true).parse(binary);
        expect(lastFilter.role).toBe('captain');
        // «(» مُهرَّب: يطابق حرفياً ولا يرمي خطأ RegExp
        expect(lastFilter.$or[0].name.test('محمد(')).toBe(true);
        expect(lastFilter.$or[0].name.test('محمد')).toBe(false);
        expect(lastFilter.approvalStatus).toBe('approved');
    });

    it('قائمة فارغة ⇒ 404 برسالة', async () => {
        stubUser([]);
        const res = await request(app()).get('/api/team/admin/qr-zip');
        expect(res.status).toBe(404);
        expect(res.body.message).toBeTruthy();
    });
});
