/**
 * 👥 «ضفت كابتن من بورتسودان، والرسالة فيها رابط أم درمان».
 *
 * سببان، كلاهما هنا:
 *   ١. الترقية (عميلٌ يتقدّم ككابتن من التطبيق) كانت تتجاهل المدينة التي
 *      اختارها في النموذج وتُبقي مدينة حسابه كعميل — «الخرطوم» غالباً. فرسالة
 *      قبوله تُبنى من إعدادات الخرطوم: رابط مجموعة أم درمان.
 *   ٢. رابط المجموعة كان خانةً واحدة في الإعدادات تتبدّل مع المدينة المختارة
 *      أعلى الصفحة بلا اسم مدينةٍ عليها — سهلٌ أن يُلصق رابط مدينة في أخرى.
 *      الآن: بطاقةٌ بكل المدن، كلٌّ باسمها، تُحفظ بمسارها (group-links).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import express from 'express';
import request from 'supertest';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const { CITY_KEYS } = require('../config/cities');

// ── المسار بمصادقةٍ محاكاة: الدور من ترويسة الاختبار ─────────────────────
const authPath = require.resolve('../middleware/authMiddleware');
const realAuth = require(authPath);
require.cache[authPath].exports = {
    ...realAuth,
    protect: (req, _res, next) => {
        req.user = { _id: '507f1f77bcf86cd799439011', name: 'أدمن', role: 'admin', adminRole: req.headers['x-role'] || 'super_admin' };
        next();
    },
    adminOnly: (_q, _s, n) => n(),
    superAdminOnly: (req, res, next) => req.user.adminRole === 'super_admin' ? next() : res.status(403).json({ message: 'للمسؤول الرئيسي فقط' })
};
const loggerPath = require.resolve('../utils/adminLogger');
require(loggerPath);
require.cache[loggerPath].exports = { logAdminAction: async () => {} };

const routePath = require.resolve('../routes/admin/settings.js');
delete require.cache[routePath];
const router = require(routePath);
const Settings = require('../models/Settings');

function app() {
    const a = express();
    a.use(express.json());
    a.use('/api/admin', router);
    return a;
}

const LINK = (code) => `https://chat.whatsapp.com/${code}`;
let store;

beforeEach(() => {
    store = {
        Khartoum:  { city: 'Khartoum',  captainGroupLink: LINK('Omdurman1'), merchantGroupLink: '' },
        PortSudan: { city: 'PortSudan', captainGroupLink: '', merchantGroupLink: '' },
        Atbara:    { city: 'Atbara',    captainGroupLink: '', merchantGroupLink: '' }
    };
    vi.spyOn(Settings, 'getSettings').mockImplementation(async (c) => ({ ...store[c] }));
    vi.spyOn(Settings, 'findOneAndUpdate').mockImplementation(async (q, upd) => {
        Object.assign(store[q.city], upd.$set);
        return store[q.city];
    });
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/admin/group-links — كل المدن باسمها', () => {
    it('سطرٌ لكل مدينة بترتيبها، بخانتيها', async () => {
        const res = await request(app()).get('/api/admin/group-links');
        expect(res.status).toBe(200);
        expect(res.body.cities.map(c => c.city)).toEqual(CITY_KEYS);
        const k = res.body.cities.find(c => c.city === 'Khartoum');
        expect(k).toEqual({ city: 'Khartoum', label: 'الخرطوم', captainGroupLink: LINK('Omdurman1'), merchantGroupLink: '' });
        expect(res.body.cities.find(c => c.city === 'Atbara').label).toBe('عطبرة');
    });
});

describe('PUT /api/admin/group-links', () => {
    it('رابط بورتسودان يُحفظ لبورتسودان وحدها — والخرطوم كما هي', async () => {
        const res = await request(app()).put('/api/admin/group-links').send({
            links: {
                Khartoum:  { captainGroupLink: LINK('Omdurman1'), merchantGroupLink: '' },
                PortSudan: { captainGroupLink: LINK('PortSudan9') },
                Atbara:    { captainGroupLink: LINK('Atbara7'), merchantGroupLink: LINK('AtbaraShops') }
            }
        });
        expect(res.status).toBe(200);
        expect(store.PortSudan.captainGroupLink).toBe(LINK('PortSudan9'));
        expect(store.Atbara.captainGroupLink).toBe(LINK('Atbara7'));
        expect(store.Atbara.merchantGroupLink).toBe(LINK('AtbaraShops'));
        expect(store.Khartoum.captainGroupLink).toBe(LINK('Omdurman1'));
        // الخرطوم لم تتغيّر فلا تُكتب أصلاً
        const written = Settings.findOneAndUpdate.mock.calls.map(c => c[0].city);
        expect(written.sort()).toEqual(['Atbara', 'PortSudan']);
        expect(res.body.changed.join(' ')).toContain('بورتسودان');
    });

    it('رابطٌ خاطئ في مدينة يُرفض قبل حفظ أيّ مدينة — ويُسمّي المدينة', async () => {
        const res = await request(app()).put('/api/admin/group-links').send({
            links: {
                Atbara:    { captainGroupLink: LINK('Atbara7') },
                PortSudan: { captainGroupLink: 'https://wa.me/123' }
            }
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toContain('بورتسودان');
        expect(res.body.city).toBe('PortSudan');
        expect(Settings.findOneAndUpdate).not.toHaveBeenCalled();
        expect(store.Atbara.captainGroupLink).toBe('');
    });

    it('خانةٌ فارغة تُفرغ الرابط (بلا رابط في الرسالة)', async () => {
        const res = await request(app()).put('/api/admin/group-links').send({ links: { Khartoum: { captainGroupLink: '  ' } } });
        expect(res.status).toBe(200);
        expect(store.Khartoum.captainGroupLink).toBe('');
    });

    it('مدينةٌ مجهولة تُرفض، والأدمن المساعد لا يحفظ', async () => {
        expect((await request(app()).put('/api/admin/group-links').send({ links: { Kassala: { captainGroupLink: LINK('x') } } })).status).toBe(400);
        const sub = await request(app()).put('/api/admin/group-links').set('x-role', 'sub_admin')
            .send({ links: { PortSudan: { captainGroupLink: LINK('y') } } });
        expect(sub.status).toBe(403);
        expect(store.PortSudan.captainGroupLink).toBe('');
    });
});

describe('الترقية تحفظ مدينة العمل المختارة', () => {
    const auth = read('routes', 'auth.js');
    const h = auth.slice(auth.indexOf("router.post('/captain-application'"), auth.indexOf("router.get('/check-subscription"));
    const page = read('public_html', 'captain-signup.html');

    it('الخادم: المدينة من النموذج إن صحّت، وإلا مدينة الحساب — وتُحفظ', () => {
        expect(h).toContain("const workCity = CITY_KEYS.includes(req.body.city) ? req.body.city : (user.city || 'Khartoum');");
        expect(h).toContain('user.city = workCity;');
        expect(h).toContain('isCaptainRegistrationOpen(workCity)');
        expect(h).not.toContain('isCaptainRegistrationOpen(user.city)');
    });

    it('الصفحة: ترسل المدينة في الترقية أيضاً', () => {
        expect(page).toContain("const account = upgradeMode ? { city: document.getElementById('city').value } :");
    });
});

describe('الأدمن يرى مدينة الكابتن ورابطها قبل الإرسال', () => {
    it('ردّا القبول ونصّ الرسالة يحملان المدينة', () => {
        const u = read('routes', 'admin', 'users.js');
        expect(u.split("cityLabel: cityLabel(captain.city || 'Khartoum')").length - 1).toBe(2);
        expect(u).toContain('groupLinkSet,');
        expect(read('routes', 'merchantRequests.js')).toContain("city, cityLabel: require('../config/cities').cityLabel(city)");
    });

    it('نافذة القبول تقول مدينته وهل رابطها مضبوط', () => {
        const p = read('public_html', 'js', 'admin-panel.js');
        expect(p).toContain('مدينة الكابتن: <b>${cityTxt}</b>');
        expect(p).toContain('لا رابط لمجموعة كباتن');
        expect(read('public_html', 'admin-captains.html')).toContain("'الرسالة برابط مجموعة كباتن ' + data.cityLabel");
    });
});
