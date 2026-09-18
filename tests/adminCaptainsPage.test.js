/**
 * 🪪 صفحة ملفّات الكباتن.
 *
 * صفحةٌ تكشف بياناتٍ ثبوتية — الرقم الوطني، العنوان، جهة الطوارئ، صور
 * الهوية والسيلفي. ولذلك صلاحيتها مستقلّة عن view_captains: تلك تُظهر اسماً
 * ورقماً ورصيداً، وهذه تكشف هويّة إنسان. من يتابع أداء الكباتن ليس بالضرورة
 * من يُصرَّح له بالاطّلاع على هوياتهم — نفس منطق فصل view_chats.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const codeOnly = (src) => src.split('\n')
    .filter(l => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
    .join('\n');

describe('🔐 الصلاحية مستقلّة ومعروضة على الأدمن المساعد', () => {
    it('🔑 معرَّفة في نموذج المستخدم — وبدونها لا تُحفظ', () => {
        const model = read('models/User.js');
        const block = model.slice(model.indexOf('permissions:'), model.indexOf('teamProfile'));
        expect(block).toContain("'view_captain_details'");
    });

    it('🔑 وظاهرة في شاشة الأدمن المساعد ليُمنح أو يُمنع', () => {
        const page = read('public_html/admin-sub-admins.html');
        expect(page).toMatch(/id: 'view_captain_details'/);
    });

    it('الصفحة محروسة بها لا بـ view_captains', () => {
        const page = read('public_html/admin-captains.html');
        // ?v= يضيفه scripts/bump-cache.js، فنطابق بلا تقييدٍ به
        expect(page).toMatch(/js\/admin-guard\.js[^"]*"\s+data-perm="view_captain_details"/);
    });

    it('🔑 والمسار الخادميّ كذلك — حارس الواجهة وحده لا يحمي', () => {
        const route = read('routes/admin/users.js');
        const blk = route.slice(route.indexOf("router.get('/captains-detailed'"));
        expect(blk.slice(0, 200)).toContain("requirePermission('view_captain_details')");
    });

    it('ورابط اللوحة يحمل نفس الصلاحية فلا يظهر لمن لا يملكها', () => {
        const admin = read('public_html/admin.html');
        expect(admin).toMatch(/data-perm="view_captain_details"[^>]*admin-captains\.html|admin-captains\.html[^>]*data-perm="view_captain_details"/);
    });
});

describe('📦 المسار يُرجع ما تحتاجه الصفحة', () => {
    const route = read('routes/admin/users.js');
    const blk = codeOnly(route.slice(route.indexOf("router.get('/captains-detailed'")));
    const body = blk.slice(0, blk.indexOf("router.get('/merchants-list'"));

    it('🔑 يشمل المُرقَّين — دورهم client فلا يجدهم فلتر role وحده', () => {
        expect(body).toContain("'captainApplication.status': { $in: ['pending', 'rejected'] }");
    });

    it('ومقيَّدٌ بمدينة الأدمن المساعد', () => {
        expect(body).toContain('getAdminCityFilter(req)');
    });

    it('🔑 يعدّ التوصيلات من الطلبات لا من حقلٍ يُزاد يدوياً', () => {
        expect(body).toContain("status: 'delivered'");
        expect(body).toContain('deliveredCount');
    });

    it('يحسب نقص الوثائق الإجبارية الأربع', () => {
        for (const d of ['idImage', 'selfieImage', 'profilePhoto', 'vehiclePhoto']) {
            expect(body).toContain(d);
        }
        expect(body).toContain('missingDocsCount');
    });

    it('🔒 ولا يُسرّب أسراراً — لا كلمة مرور ولا رموز تحقّق ولا fcmToken', () => {
        const sel = body.slice(body.indexOf('.select('), body.indexOf('.sort('));
        for (const secret of ['password', 'verificationCode', 'otpCode', 'fcmToken', 'resetCode']) {
            expect(sel, secret).not.toContain(secret);
        }
    });

    it('📋 والاطّلاع يُسجَّل — بياناتٌ ثبوتية لا تُقرأ بلا أثر', () => {
        expect(body).toContain('logAdminAction');
    });
});

describe('🖥️ الصفحة', () => {
    const page = read('public_html/admin-captains.html');

    it('🔑 تستعمل البحث المشترك لا فلتراً خاصاً', () => {
        // وإلا عادت علّة «0912 لا تجد شيئاً» في هذه الصفحة وحدها
        expect(page).toContain('js/admin-search.js');
        expect(page).toContain('AdminSearch.matches(q, c, [');
    });

    it('وتبحث في الرقم الوطني واللوحة والعنوان أيضاً', () => {
        const fn = page.slice(page.indexOf('function visible()'), page.indexOf('function render()'));
        expect(fn).toContain('nationalId');
        expect(fn).toContain('plateNumber');
    });

    it('🔑 والوثائق تُعرض داخل التطبيق لا في متصفّح النظام', () => {
        expect(page).toContain('js/img-lightbox.js');
        expect(page).toContain('data-lightbox');
        expect(page).not.toContain('target="_blank"');
    });

    it('الأرقام معزولة بـ bdi — وإلا انقلب ترتيبها داخل النصّ العربي', () => {
        expect(page).toContain('<bdi dir="ltr">');
    });

    it('🔒 وكل قيمةٍ من الخادم مُهرَّبة قبل الحقن', () => {
        expect(page).toMatch(/const esc = \(s\) =>/);
        expect(page).toContain('esc(c.name');
        expect(page).toContain('esc(a.pledgeText)');
    });

    it('تحترم المساحة الآمنة بـ --sat/--sab لا env()', () => {
        expect(page).toContain('var(--sat');
        expect(page).toContain('var(--sab');
        expect(page).not.toMatch(/env\(safe-area/);
    });

    it('وتُنبّه أن الناقص يمنع الاعتماد — لا تعرض النقص وحده', () => {
        expect(page).toContain('لا يمكن اعتماده قبل رفعها');
    });
});
