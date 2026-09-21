/**
 * 🪪 بيانات المتقدّمين — من يراها، ومتى لا تكون موجودةً أصلاً.
 *
 * سؤالان من المستخدم:
 *
 * ١) هل طلبات انضمام المتاجر ضمن صلاحيات الأدمن المساعد؟
 *    كانت `adminOnly` وحدها — أي أدمنٍ مساعد يصل إلى بيانات كل المتقدّمين
 *    (أسماء وهواتف وحسابات بنكية وصور هوية) ولو لم تُمنح له صلاحية.
 *    وحارس الصفحة يُخفي الزرّ فقط، والواجهة تُتجاوَز بطلبٍ مباشر.
 *
 * ٢) ولماذا يقول أدمنٌ رئيسي إن بيانات المتقدّمين لا تظهر؟ لسببين
 *    مختلفين لا واحد — وكلاهما يبدو للأدمن عطلاً في الشاشة:
 *
 *    • المتاجر: البيانات موجودةٌ كاملة، لكن الصفحة تفتح على تبويب «قيد
 *      المراجعة» وهو فارغٌ تماماً (كل الطلبات في الإنتاج مقبولة).
 *    • الكباتن: 89 من 97 حسابٍ لا ملفّ انتساب له إطلاقاً — أُنشئوا من
 *      اللوحة، ومسار الإنشاء لا يجمع تلك الحقول. فتظهر شرطاتٌ بلا تفسير.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const root = (...p) => path.join(__dirname, '..', ...p);
const read = (...p) => fs.readFileSync(root(...p), 'utf8');

const User = require('../models/User');
const AdminLog = require('../models/AdminLog');

const reqRoutes = read('routes', 'merchantRequests.js');
const merchantPage = read('public_html', 'admin-merchant-requests.html');
const captainsPage = read('public_html', 'admin-captains.html');

describe('🔐 طلبات المتاجر: صلاحيةٌ لا دورٌ فقط', () => {
    const get = reqRoutes.slice(reqRoutes.indexOf("router.get('/admin/all'"),
                                reqRoutes.indexOf("router.put('/admin/:id/status'"));
    const put = reqRoutes.slice(reqRoutes.indexOf("router.put('/admin/:id/status'"));

    it('🔴 القراءة تقتضي صلاحية — لا يكفي أن يكون أدمناً', () => {
        expect(get).toContain('requireAnyPermission');
        expect(get).toContain('view_merchant_requests');
    });

    it('🔴 والقبول/الرفض صلاحيةٌ أخرى — من يراجع ليس من يقرّر', () => {
        expect(put).toContain('requireAnyPermission');
        expect(put).toContain('manage_merchant_requests');
        expect(put).not.toContain("'view_merchant_requests'");
    });

    it('والصلاحيتان معرَّفتان في مخطّط المستخدم', () => {
        const perms = User.schema.path('permissions').caster.enumValues;
        expect(perms).toContain('view_merchant_requests');
        expect(perms).toContain('manage_merchant_requests');
    });

    it('وحارس الصفحة يوافق الخادم', () => {
        const page = read('public_html', 'admin-merchant-requests.html');
        expect(page).toMatch(/admin-guard\.js[^"]*"\s+data-perm="view_merchant_requests"/);
    });
});

describe('🔴 طلبات المتاجر مقيَّدةٌ بالمدينة', () => {
    const MerchantRequest = require('../models/MerchantRequest');

    it('الحقل في المخطّط — كان الكيانَ الوحيد بلا مدينة', () => {
        // الطلبات، الكباتن، المتاجر: كلّها مقيَّدة منذ البداية. هذه وحدها
        // كانت مفتوحة، فأدمنُ مدينةٍ يرى متقدّمي السودان كلّه — أسماءهم
        // وهواتفهم وأرقام حساباتهم البنكية وصور هوياتهم.
        const f = MerchantRequest.schema.path('city');
        expect(f).toBeTruthy();
        expect(f.enumValues).toEqual(['Khartoum', 'PortSudan']);
    });

    it('🔴 والقائمة تُرشَّح بمدن الأدمن', () => {
        const get = reqRoutes.slice(reqRoutes.indexOf("router.get('/admin/all'"),
                                    reqRoutes.indexOf("router.put('/admin/:id/status'"));
        expect(get).toContain('getAdminCityFilter(req)');
    });

    it('🔴 والقرار كذلك — لا يُقبل طلبٌ خارج النطاق بمعرفة معرّفه', () => {
        const put = reqRoutes.slice(reqRoutes.indexOf("router.put('/admin/:id/status'"));
        expect(put).toContain('adminCoversCity(req.user, request.city)');
    });

    it('ورسالة القبول محميّةٌ بالنطاق نفسه', () => {
        const msg = reqRoutes.slice(reqRoutes.indexOf("router.get('/admin/:id/approval-message'"),
                                    reqRoutes.indexOf("router.put('/admin/:id/status'"));
        expect(msg).toContain('adminCoversCity');
    });

    it('وتُختم عند الإنشاء من الإحداثيات لا من فراغ', () => {
        const post = reqRoutes.slice(reqRoutes.indexOf("router.post('/', protect"),
                                     reqRoutes.indexOf("router.get('/my-request'"));
        expect(post).toContain('cityFromCoords');
        expect(post).toContain('city: reqCity');
    });

    it('والتنبيه يتبع المدينة — لا يُزعج أدمن المدينة الأخرى', () => {
        const post = reqRoutes.slice(reqRoutes.indexOf("router.post('/', protect"),
                                     reqRoutes.indexOf("router.get('/my-request'"));
        expect(post).toContain('city: reqCity');
    });
});

describe('🗂️ الصفحة لا تفتح على تبويبٍ فارغ', () => {
    it('🔴 تنتقل إلى «الكل» حين تخلو قائمة الانتظار', () => {
        // كل طلبات الإنتاج مقبولة وصفرٌ معلّق، فكانت الشاشة تُفتح فارغة
        expect(merchantPage).toContain('function _pickOpeningTab');
        expect(merchantPage).toContain("_reqFilter = 'all'");
    });

    it('ولا تُغيّر اختيار الأدمن بعد أن يختار', () => {
        const fn = merchantPage.slice(merchantPage.indexOf('function _pickOpeningTab'),
                                      merchantPage.indexOf('function renderTable'));
        expect(fn).toContain('_openingTabPicked');
    });

    it('وتبقى قائمة الانتظار الافتتاحية حين يكون فيها شيء', () => {
        const fn = merchantPage.slice(merchantPage.indexOf('function _pickOpeningTab'),
                                      merchantPage.indexOf('function renderTable'));
        expect(fn).toContain('if (!pending && requests.length)');
    });

    it('والعدّادات ظاهرةٌ على التبويبات', () => {
        expect(merchantPage).toContain('counts[key]');
    });
});

describe('🪪 غياب الملفّ يُقال لا يُترك شرطات', () => {
    it('🔴 حساب أنشأته الإدارة يُبيَّن سببُ خلوّه', () => {
        expect(captainsPage).toContain('_hasApplication');
        expect(captainsPage).toContain('أُنشئ من لوحة الإدارة، فلا يوجد ملفّ انتساب');
    });

    it('ويُكشف عن غيابه بأكثر من حقل — لا بحقلٍ واحد قد يخلو وحده', () => {
        const line = captainsPage.slice(captainsPage.indexOf('const _hasApplication'),
                                        captainsPage.indexOf('const _noAppNote'));
        for (const f of ['nationalId', 'address', 'whatsapp', 'emergencyPhone']) {
            expect(line).toContain(f);
        }
    });

    it('ولا تُعرَض الملاحظة لمن له ملفٌّ فعلاً', () => {
        expect(captainsPage).toContain("_hasApplication ? '' :");
    });
});

describe('📜 ما يُسجَّل يجب أن يكون معرَّفاً', () => {
    it('🔴 view_captain_details مُسجَّل — كان يسقط بصمت', () => {
        // الشيفرة تَعِد بأن كل اطّلاع يُسجَّل، وadminLogger يبتلع خطأ
        // الكتابة (non-fatal) — فالوعد لم يكن يقع
        expect(AdminLog.schema.path('action').enumValues).toContain('view_captain_details');
    });

    it('والمسار ما زال يسجّله', () => {
        expect(read('routes', 'admin', 'users.js')).toContain("'view_captain_details'");
    });

    it('🔴 وكل فعلٍ يُكتب في مسارات الإدارة معرَّفٌ في المخطّط', () => {
        // كل الراوترات لا مجلد admin وحده: approve_device يقع في
        // routes/admin/auth.js وغيره خارجها، وسبعةٌ منها كانت تسقط بصمت
        const allowed = AdminLog.schema.path('action').enumValues;
        const used = new Set();
        for (const dir of [root('routes'), root('routes', 'admin')]) {
            for (const f of fs.readdirSync(dir)) {
                if (!f.endsWith('.js')) continue;
                const src = fs.readFileSync(path.join(dir, f), 'utf8');
                for (const m of src.matchAll(/logAdminAction\(\s*req\s*,\s*'([a-z_]+)'/g)) used.add(m[1]);
            }
        }
        expect(used.size).toBeGreaterThan(20);
        for (const a of used) {
            expect(allowed, `فعلٌ يُكتب ولا يُقبل في المخطّط: ${a}`).toContain(a);
        }
    });
});
