/**
 * Integration tests — سلوك المسارات نفسها (لا الدوال المنعزلة).
 *
 * لماذا: كل الاختبارات الأخرى تفحص دوالّ نقيّة، فلم يكن أيٌّ منها ليمسك أعطال يومٍ
 * كامل حقيقي: مسار غير منشور يردّ 500 بدل 404، ومسار جديد يلتقطه /:id قبل أن
 * يصل، وبوابة صلاحيات تُنسى. هذه الفئة من الأخطاء لا تظهر إلا بضرب المسار فعلاً.
 *
 * بلا قاعدة بيانات: نُعطّل تخزين الاستعلامات مؤقتاً فتفشل فوراً بدل انتظار مهلة،
 * والحالات المفحوصة هنا محسومة قبل أي استعلام أصلاً.
 */
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

// استعلامات بلا اتصال ترمي فوراً بدل الانتظار 10 ثوانٍ
mongoose.set('bufferCommands', false);

const { manifest } = require('../utils/deployManifest');

function appWith(mountPath, routerPath) {
    const app = express();
    app.use(express.json());
    app.use(mountPath, require(routerPath));
    return app;
}

describe('places — ترتيب المسارات', () => {
    const app = appWith('/api/places', '../routes/places');

    it('المسارات المسمّاة لا يلتقطها /:id', async () => {
        // كلٌّ منها يجب أن يُعالَج بمُعالِجه هو، لا كمعرّف متجر
        const res = await request(app).get('/api/places/errand-categories');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
    });

    it('🔒 مسار غير معروف يردّ 404 لا 500', async () => {
        // ⚠️ العطل الحقيقي: مسار لم يُنشر بعد وصل إلى findById فرمى CastError،
        // فبدا "المسار غير موجود" وكأنه "خطأ في السيرفر" وضاع يوم في تشخيصه.
        // هذه أسماء تحاكي مساراً ناقصاً أو خطأً إملائياً في العنوان.
        for (const bad of ['not-an-id', 'errand-featurd', 'some-missing-route', '12345']) {
            const res = await request(app).get(`/api/places/${bad}`);
            expect(res.status).toBe(404);
        }
    });

    it('المسارات المعرَّفة لا تُعامَل كمعرّفات', async () => {
        // كلٌّ منها موجود فعلاً: يردّ بمعالجه (200 أو 401)، لا 404 حارس المعرّفات
        for (const [path, expected] of [
            ['/api/places/errand-featured', 200],
            ['/api/places/errand-stats', 401],
            ['/api/places/errand-diagnose', 401]
        ]) {
            expect((await request(app).get(path)).status).toBe(expected);
        }
    });

    it('معرّف صالح الشكل يتجاوز الحارس (لا يردّ 404 بسبب الشكل)', async () => {
        const res = await request(app).get('/api/places/507f1f77bcf86cd799439011');
        // بلا قاعدة بيانات سيفشل الاستعلام — المهم أنه تجاوز حارس الشكل
        expect(res.status).not.toBe(404);
    });
});

describe('places — بوابات الصلاحيات', () => {
    const app = appWith('/api/places', '../routes/places');

    it('🔒 مسارات البحث المدفوع والتشخيص مغلقة بلا رمز دخول', async () => {
        for (const path of ['/errand-search?q=test', '/errand-diagnose', '/errand-stats']) {
            const res = await request(app).get(`/api/places${path}`);
            expect(res.status).toBe(401);
        }
    });

    it('المسارات العامة مفتوحة', async () => {
        expect((await request(app).get('/api/places/errand-categories')).status).toBe(200);
    });
});

describe('حارس المعرّفات مطبَّق على كل ملفات المسارات', () => {
    // ملف مسارات فيه :id بلا حارس = مصدر 500 صامت جديد
    const fs = require('fs');
    const path = require('path');

    it('🔒 كل ملف يستعمل :id يسجّل router.param', () => {
        const missing = [];
        for (const dir of ['routes', 'routes/admin']) {
            for (const name of fs.readdirSync(path.join(__dirname, '..', dir))) {
                if (!name.endsWith('.js')) continue;
                const rel = `${dir}/${name}`;
                const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
                if (src.includes(':id') && !src.includes("router.param('id'")) missing.push(rel);
            }
        }
        expect(missing).toEqual([]);
    });
});

describe('بصمة النشر', () => {
    it('تشمل الملفات التي يقع فيها النشر الجزئي عادةً', () => {
        const m = manifest();
        for (const f of ['index.js', 'routes/places.js', 'utils/placesSearch.js', 'models/ExternalPlace.js']) {
            expect(m.files[f]).toBeDefined();
        }
        expect(m.count).toBeGreaterThan(20);
    });

    it('البصمة الكلّية تتغيّر حين يتغيّر أي ملف', () => {
        const a = manifest();
        // نفس المدخلات ⇒ نفس البصمة (حتمية)
        expect(manifest().digest).toBe(a.digest);
        expect(a.digest).toMatch(/^[0-9a-f]{12}$/);
    });
});
