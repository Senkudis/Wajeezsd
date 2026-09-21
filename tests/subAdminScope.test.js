/**
 * 🧭 نطاق الأدمن المساعد — مدينةٌ أو أكثر، وإحصاءٌ يخصّه.
 *
 * ثلاثةُ بلاغاتٍ من الاستعمال الفعلي:
 *
 *  ١) لا إحصاءات له إطلاقاً. /dashboard يقتضي view_revenue فهو محجوب،
 *     فيدير مدينةً ولا يعرف كم طلباً جاءها أمس. ← /scoped-stats.
 *  ٢) لا يُعيَّن إلا على مدينةٍ واحدة. من يشرف على الخرطوم وبورتسودان معاً
 *     كان يحتاج حسابين. ← حقل cities.
 *  ٣) «توزيع حالات الطلبات» يبقى دائرةَ تحميلٍ لا تنتهي. والسبب أن
 *     renderStatusBar تُستدعى في فرع الأدمن الأعلى وحده، و/dashboard-limited
 *     لا يُرسل ordersByStatus أصلاً.
 *
 * وعُثر أثناء الإصلاح على عطلٍ رابع لم يُبلَّغ عنه: قائمة الصلاحيات كانت
 * مكتوبةً يدوياً في مسار الإنشاء ومسار التعديل، وتباعدت عن مخطّط النموذج —
 * فـ view_chats و manage_chats و view_captain_details معروضةٌ في الواجهة
 * ويُسقطها الخادم بصمت. من يمنحها لا يراها تُحفظ ولا يُقال له لماذا.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const root = (...p) => path.join(__dirname, '..', ...p);
const read = (...p) => fs.readFileSync(root(...p), 'utf8');

const User = require('../models/User');
const {
    getAdminCityFilter, resolveCreationCity, adminCanActOnUser,
    adminCities, adminCoversCity
} = require('../middleware/authMiddleware');

const sub = (over = {}) => ({ adminRole: 'sub_admin', city: 'Khartoum', ...over });
const req = (user, query = {}) => ({ user, query });

describe('🌍 مدن الأدمن المساعد', () => {
    it('حسابٌ قديم بلا cities يبقى على مدينته — لا هجرةَ بيانات', () => {
        expect(adminCities(sub())).toEqual(['Khartoum']);
        expect(getAdminCityFilter(req(sub()))).toEqual({ city: 'Khartoum' });
    });

    it('ومن عُيّن على مدينتين يرى الاثنتين', () => {
        const u = sub({ cities: ['Khartoum', 'PortSudan'] });
        expect(getAdminCityFilter(req(u))).toEqual({ city: { $in: ['Khartoum', 'PortSudan'] } });
    });

    it('ويُضيَّق على واحدةٍ منهما حين يبدّل المدينة في اللوحة', () => {
        const u = sub({ cities: ['Khartoum', 'PortSudan'] });
        expect(getAdminCityFilter(req(u, { city: 'PortSudan' }))).toEqual({ city: 'PortSudan' });
    });

    it('🔴 ولا يتوسّع بطلبِ مدينةٍ خارج نطاقه', () => {
        const u = sub({ cities: ['PortSudan'] });
        expect(getAdminCityFilter(req(u, { city: 'Khartoum' }))).toEqual({ city: 'PortSudan' });
    });

    it('🔴 وقيمةٌ غريبة في الحقل تُضيّق لا تفتح', () => {
        const u = sub({ cities: ['Atbara', 'Nyala'] });
        expect(adminCities(u)).toEqual(['Khartoum']);
        expect(getAdminCityFilter(req(u))).toEqual({ city: 'Khartoum' });
    });

    it('والمسؤول الرئيسي يرى كل المدن', () => {
        expect(getAdminCityFilter(req({ adminRole: 'super_admin' }))).toEqual({});
        expect(getAdminCityFilter(req({ adminRole: null, city: 'PortSudan' }))).toEqual({});
    });
});

describe('🔒 التصرّف في المستخدمين محدودٌ بالنطاق', () => {
    it('يتصرّف في مستخدمي مدنه كلّها', () => {
        const u = sub({ cities: ['Khartoum', 'PortSudan'] });
        expect(adminCanActOnUser(req(u), { role: 'captain', city: 'PortSudan' })).toBe(true);
        expect(adminCanActOnUser(req(u), { role: 'client', city: 'Khartoum' })).toBe(true);
    });

    it('ولا في مستخدمٍ خارجها', () => {
        const u = sub({ cities: ['PortSudan'] });
        expect(adminCanActOnUser(req(u), { role: 'captain', city: 'Khartoum' })).toBe(false);
    });

    it('🔴 ولا في حساب أدمن مهما اتّسع نطاقه — منع تصعيد الصلاحيات', () => {
        const u = sub({ cities: ['Khartoum', 'PortSudan'] });
        expect(adminCanActOnUser(req(u), { role: 'admin', city: 'Khartoum' })).toBe(false);
    });

    it('و adminCoversCity تُطابق النطاق نفسه', () => {
        const u = sub({ cities: ['PortSudan'] });
        expect(adminCoversCity(u, 'PortSudan')).toBe(true);
        expect(adminCoversCity(u, 'Khartoum')).toBe(false);
        expect(adminCoversCity({ adminRole: 'super_admin' }, 'Khartoum')).toBe(true);
    });
});

describe('ختم مدينة السجلات الجديدة', () => {
    it('صاحبُ مدينتين يختار في أيّهما يُنشئ', () => {
        const u = sub({ cities: ['Khartoum', 'PortSudan'] });
        expect(resolveCreationCity(req(u), 'PortSudan')).toBe('PortSudan');
    });

    it('🔴 ولا يُنشئ خارج نطاقه ولو طلب', () => {
        const u = sub({ cities: ['PortSudan'] });
        expect(resolveCreationCity(req(u), 'Khartoum')).toBe('PortSudan');
    });

    it('وبلا اختيارٍ تُختم بأولى مدنه', () => {
        expect(resolveCreationCity(req(sub({ cities: ['PortSudan'] })), undefined)).toBe('PortSudan');
    });
});

describe('🔴 قائمة الصلاحيات مصدرها واحد', () => {
    const modelPerms = User.schema.path('permissions').caster.enumValues;
    const routes = read('routes', 'admin', 'subadmins.js');
    const page = read('public_html', 'admin-sub-admins.html');

    it('المسار يشتقّها من المخطّط لا يكتبها بجانبه', () => {
        expect(routes).toContain("User.schema.path('permissions').caster.enumValues");
    });

    it('ولا قائمةَ صلاحياتٍ مكتوبةً يدوياً بقيت فيه', () => {
        const hand = routes.match(/'view_orders', 'manage_orders'/g) || [];
        expect(hand.length).toBe(0);
    });

    it('وكل صلاحيةٍ تُعرض في الواجهة موجودةٌ في المخطّط', () => {
        const shown = [...page.matchAll(/\{ id: '([a-z_]+)'/g)].map(m => m[1]);
        expect(shown.length).toBeGreaterThan(20);
        for (const p of shown) {
            expect(modelPerms, `صلاحيةٌ معروضةٌ وغير معرّفة: ${p}`).toContain(p);
        }
    });

    it('والصلاحيات الجديدة موجودة', () => {
        for (const p of ['view_settlements', 'manage_settlements', 'view_feedback',
                         'view_reports', 'manage_promos', 'view_activity_log',
                         'manage_places', 'manage_zones', 'view_merchant_requests']) {
            expect(modelPerms).toContain(p);
        }
    });
});

describe('🔴 توزيع الحالات يصل الأدمن المساعد', () => {
    const api = read('routes', 'admin', 'dashboard.js');
    const ui = read('public_html', 'js', 'admin-panel.js');
    const limited = () => api.slice(api.indexOf("'/dashboard-limited'"), api.indexOf("'/push-status'"));

    it('الخادم يُرسل ordersByStatus في dashboard-limited', () => {
        expect(limited()).toContain('ordersByStatus');
        expect(limited()).toContain('$group');
    });

    it('ومقيّدةً بمدنه لا بكل المدن', () => {
        expect(limited()).toContain('$match: { ...cityFilter }');
    });

    it('والواجهة ترسمها في فرعه لا في فرع المسؤول وحده', () => {
        const start = ui.indexOf('async function loadDashboard');
        const blk = ui.slice(ui.indexOf('if (isSubAdmin) {', ui.indexOf('const endpoint', start)),
                             ui.indexOf('} else {', start));
        expect(blk).toContain('renderStatusBar');
    });

    it('ولا تنهار حين يغيب الردّ', () => {
        const fn = ui.slice(ui.indexOf('function renderStatusBar'),
                            ui.indexOf('async function loadOnlineCaptainsCount'));
        expect(fn).toContain('counts && counts[k]');
        expect(fn).toContain('if (!bar) return;');
    });
});

describe('📊 مسار الإحصاءات المقيَّد بالنطاق', () => {
    const api = read('routes', 'admin', 'dashboard.js');
    const blk = api.slice(api.indexOf("'/scoped-stats'"), api.indexOf("'/dashboard-limited'"));

    it('يقتضي view_stats لا view_revenue', () => {
        expect(blk).toContain("requirePermission('view_stats')");
    });

    it('ويقيّد كل استعلامٍ بمدن الأدمن', () => {
        expect(blk).toContain('getAdminCityFilter(req)');
        expect(blk).toContain('...cityFilter');
    });

    it('ويدعم يوماً وأسبوعاً وشهراً', () => {
        expect(blk).toContain('day: 1');
        expect(blk).toContain('week: 7');
        expect(blk).toContain('month: 30');
    });

    it('🔴 ولا يكشف المال لمن لا يملك view_finance', () => {
        expect(blk).toContain("includes('view_finance')");
        expect(blk).toContain('canSeeMoney');
    });

    it('ويقارن بالفترة السابقة — الرقم وحده لا يقول شيئاً', () => {
        expect(blk).toContain('previousOrders');
        expect(blk).toContain('prevSince');
    });
});

describe('🔔 الإشعارات تتبع النطاق', () => {
    const helper = read('utils', 'notificationHelper.js');

    it('notifyAdmins تقبل مدينةً وتُرشّح بها', () => {
        expect(helper).toContain('relatedId, city }');
        expect(helper).toContain("a.adminRole !== 'sub_admin'");
    });

    it('وبلا مدينةٍ يُنبَّه الجميع كما كان', () => {
        expect(helper).toContain('VALID_CITIES.includes(city)');
    });

    it('ومواضع النداء تُمرّر مدينة الحدث', () => {
        expect(read('routes', 'orders.js')).toContain('city: order.city');
        expect(read('routes', 'upload.js')).toContain('city: req.user.city');
    });
});

describe('لا مقارنةَ مدينةٍ مباشرة بقيت في مسارات الأدمن', () => {
    it('كلها تمرّ بـ adminCoversCity', () => {
        for (const f of ['chats.js', 'orders.js']) {
            const s = read('routes', 'admin', f);
            expect(s, f).not.toMatch(/order\.city !== req\.user\.city/);
            expect(s, f).toContain('adminCoversCity');
        }
    });
});

describe('🖥️ صفحة الإحصاءات', () => {
    const page = read('public_html', 'admin-stats.html');

    it('محروسةٌ بـ view_stats', () => {
        expect(page).toMatch(/admin-guard\.js[^"]*"\s+data-perm="view_stats"/);
    });

    it('وفيها الفترات الثلاث', () => {
        for (const r of ['day', 'week', 'month']) expect(page).toContain(`data-range="${r}"`);
    });

    it('🔴 وكل فشلٍ ينتهي برسالة — لا دائرةَ تحميلٍ أبدية', () => {
        expect(page).toContain('function showError');
        expect(page).toContain('إعادة المحاولة');
        const load = page.slice(page.indexOf('async function loadStats'), page.indexOf('function showError'));
        expect(load).toContain('if (!res.ok)');
        expect(load).toContain('catch');
    });

    it('ومربوطةٌ من تنقّل اللوحة', () => {
        expect(read('public_html', 'admin.html')).toContain('admin-stats.html');
    });

    it('وتهرب من محتوى المستخدم قبل حقنه', () => {
        expect(page).toContain('const esc =');
        expect(page).toContain('esc(r.name)');
    });
});

describe('🏙️ واجهة تعيين المدن', () => {
    const page = read('public_html', 'admin-sub-admins.html');

    it('صناديق اختيارٍ لا قائمةً بخيارٍ واحد', () => {
        expect(page).toContain('form-check-input city-cb');
        expect(page).toContain('value="PortSudan"');
        expect(page).not.toContain("getElementById('aCity')");
    });

    it('🔴 والنطاق قابلٌ للتعديل بعد الإنشاء', () => {
        const edit = page.slice(page.indexOf('function openEditModal'), page.indexOf('async function save'));
        expect(edit).toContain('.city-cb');
        expect(edit).not.toContain('disabled = true;\n            document.querySelectorAll');
    });

    it('ولا يُحفَظ نطاقٌ فارغ', () => {
        expect(page).toContain('اختر مدينةً واحدة على الأقل');
        expect(read('routes', 'admin', 'subadmins.js')).toContain('اختر مدينةً واحدة على الأقل');
    });

    it('والمدن تُرسَل في الإنشاء والتعديل معاً', () => {
        const save = page.slice(page.indexOf('const selectedPerms'), page.indexOf('const btn = document.getElementById'));
        const payload = save.slice(save.indexOf('const payload'), save.indexOf('if (isNew)'));
        expect(payload).toContain('cities: selectedCities');
    });
});
