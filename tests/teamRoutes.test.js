/**
 * 🪪 مسارات بطاقات الفريق — الحراسة والشكل، بلا قاعدة بيانات.
 *
 * ما يُفحص هنا هو ما يُحسم قبل أي استعلام: بوابات الصلاحيات، وترتيب المسارات
 * (مسار إداري يبتلعه `/:publicId` العام كارثةٌ صامتة: يصير مسار الإدارة عاماً
 * ويردّ 404 بدل أن يعمل)، وفحص شكل المعرّف قبل ضرب قاعدة البيانات.
 */

const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

// استعلامات بلا اتصال ترمي فوراً بدل انتظار مهلة طويلة
mongoose.set('bufferCommands', false);

function app() {
    const instance = express();
    instance.use(express.json());
    instance.use('/api/team', require('../routes/team'));
    return instance;
}

describe('team — بوابات الصلاحيات', () => {
    const server = app();

    it('🔒 كل مسارات الإدارة مغلقة بلا رمز دخول', async () => {
        const routes = [
            ['get', '/api/team/admin/members'],
            ['get', '/api/team/admin/members/507f1f77bcf86cd799439011/qr'],
            ['patch', '/api/team/admin/members/507f1f77bcf86cd799439011'],
            ['put', '/api/team/admin/reorder']
        ];
        for (const [method, path] of routes) {
            const res = await request(server)[method](path).send({});
            expect(res.status).toBe(401);
        }
    });
});

describe('team — ترتيب المسارات', () => {
    const server = app();

    it('مسار الإدارة لا يلتقطه /:publicId العام', async () => {
        // ⚠️ لو التقطه، لصار /api/team/admin/members مساراً عاماً بلا مصادقة
        // يردّ 404 — عطلٌ أمني ووظيفي معاً لا تكشفه قراءة الكود.
        const res = await request(server).get('/api/team/admin/members');
        expect(res.status).toBe(401);
        expect(res.status).not.toBe(404);
    });
});

describe('team — فحص شكل المعرّف قبل قاعدة البيانات', () => {
    const server = app();

    it('معرّف عام غير صالح الشكل يردّ 404 دون استعلام', async () => {
        // بلا اتصال بقاعدة البيانات: وصول الطلب إلى الاستعلام يعني 500 لا 404،
        // فنجاح هذا الفحص هو نفسه إثبات أن الشكل فُحص أولاً.
        for (const bad of ['abc', '123', 'not-an-id', 'ZZZZZZZZZZZZZZZZZZZZZZZZ', 'a'.repeat(23)]) {
            const res = await request(server).get(`/api/team/${bad}`);
            expect(res.status).toBe(404);
        }
    });

    it('معرّف صالح الشكل يتجاوز الفحص ويصل إلى الاستعلام', async () => {
        const res = await request(server).get(`/api/team/${'a'.repeat(24)}`);
        expect(res.status).toBe(500); // فشل الاتصال — أي أنه تجاوز حارس الشكل
    });
});

describe('team — رابط البطاقة', () => {
    it('يُبنى على نطاق الفريق بلا شرطة مكرّرة', () => {
        const { TEAM_BASE_URL } = require('../routes/team');
        expect(TEAM_BASE_URL).toMatch(/^https?:\/\//);
        expect(TEAM_BASE_URL.endsWith('/')).toBe(false);
    });
});
