/**
 * 🔒 وثائق الكباتن والتجّار: مجلدٌ خاصّ ورابطٌ موقّعٌ مؤقّت.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-anywhere-else';
const P = require('../utils/privateFiles');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('التوقيع', () => {
    const url = '/api/files/documents/abc_123_ff.jpg';

    it('🔑 رابطٌ موقّع يُقبل حتى ينتهي', () => {
        const now = Date.UTC(2026, 8, 29);
        const signed = P.sign(url, 3600, now);
        const u = new URL('http://x' + signed);
        expect(P.verify(u.pathname, u.searchParams.get('exp'), u.searchParams.get('sig'), now + 1000)).toBe(true);
        expect(P.verify(u.pathname, u.searchParams.get('exp'), u.searchParams.get('sig'), now + 3601 * 1000)).toBe(false);
    });
    it('🔑 التوقيع لا يُنقل إلى ملفٍّ آخر، ولا يُزوَّر', () => {
        const u = new URL('http://x' + P.sign(url));
        expect(P.verify('/api/files/documents/other.jpg', u.searchParams.get('exp'), u.searchParams.get('sig'))).toBe(false);
        expect(P.verify(u.pathname, u.searchParams.get('exp'), 'forged')).toBe(false);
        expect(P.verify(u.pathname, String(Number(u.searchParams.get('exp')) + 999), u.searchParams.get('sig'))).toBe(false);
    });
    it('الروابط العامّة كما هي — الصورة الشخصية تبقى للعملاء', () => {
        expect(P.sign('/uploads/documents/x.jpg')).toBe('/uploads/documents/x.jpg');
        const d = P.signDocs({ idImage: url, profilePhoto: '/uploads/documents/p.jpg' });
        expect(d.idImage).toMatch(/\?exp=\d+&sig=/);
        expect(d.profilePhoto).toBe('/uploads/documents/p.jpg');
    });
    it('لا خروج من المجلد الخاصّ', () => {
        expect(P.resolvePrivate('documents', '../../.env')).toBe(null);
        expect(P.resolvePrivate('secrets', 'a.jpg')).toBe(null);
        expect(P.resolvePrivate('documents', 'a.jpg')).toBe(path.join(P.PRIVATE_DIR, 'documents', 'a.jpg'));
    });
});

describe('المسار /api/files', () => {
    const name = `test_${Date.now()}_aa.jpg`;
    const file = path.join(P.PRIVATE_DIR, 'documents', name);
    let app;
    beforeAll(() => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
        app = express();
        app.use('/api/files', require('../routes/files'));
    });
    afterAll(() => { try { fs.unlinkSync(file); } catch (_) {} });

    it('🔑 برابطٍ موقّع: يُخدَم، بلا تخزين', async () => {
        const res = await request(app).get(P.sign(`/api/files/documents/${name}`));
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toContain('no-store');
    });
    it('🔑 بلا توقيع أو بتوقيعٍ مزوّر: 404', async () => {
        expect((await request(app).get(`/api/files/documents/${name}`)).status).toBe(404);
        expect((await request(app).get(`/api/files/documents/${name}?exp=9999999999&sig=x`)).status).toBe(404);
    });
});

describe('الرفع والعرض', () => {
    it('🔑 الهوية والسيلفي والرخصة إلى المجلد الخاصّ — الشخصية والمركبة عامّتان', () => {
        const up = read('routes/upload.js');
        expect(up).toContain("updates['documents.idImage'] = priv('idImage')");
        expect(up).toContain("updates['documents.selfieImage'] = priv('selfieImage')");
        expect(up).toContain("updates['documents.driverLicense'] = priv('driverLicense')");
        expect(up).toContain("updates['documents.profilePhoto'] = `/uploads/documents/");
        expect(up).toContain("moveToPrivate(req.file.path, 'merchant-ids')");
        expect(read('public_html/client-register-shop.html')).toContain("uploadFile(files.id, 'إثبات الهوية', 'id')");
    });
    it('🔑 view_users وحدها لا تكشف البطاقات — تُفرَّغ', () => {
        const u = read('routes/admin/users.js');
        expect(u).toContain("p.includes('view_captain_details') || p.includes('manage_captains')");
        expect(u).toContain('res.json(docsForAdmin(req, users))');
        expect(u).toContain('res.json(docsForAdmin(req, user))');
        expect(u).toContain('res.json(docsForAdmin(req, captains))');
        expect(u).toContain("idImage:       sign(docs.idImage || '')");
    });
    it('المجلد الخاصّ خارج public_html وخارج git، وسكربت النقل معاينةٌ افتراضياً', () => {
        expect(P.PRIVATE_DIR).not.toContain('public_html');
        expect(read('.gitignore')).toContain('private_uploads/');
        expect(read('scripts/migrate-private-docs.js')).toContain("const APPLY = process.argv.includes('--apply')");
        expect(read('index.js')).toContain("apiRoutes.use('/files', require('./routes/files'))");
    });
});
