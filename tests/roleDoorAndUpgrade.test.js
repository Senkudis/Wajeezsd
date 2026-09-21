/**
 * 🚪 بابٌ يدلّ على بابه، وعميلٌ يصير كابتناً بموافقة.
 *
 * بلاغان:
 *
 * ١) من يدخل ببياناته الصحيحة من الباب الخطأ — عميلٌ في صفحة الكباتن أو
 *    العكس — كان يُقال له «عذراً، هذا الحساب ليس مسجلاً ككابتن» ثم يُترك
 *    واقفاً: لا يُقال له ما حسابه، ولا أين بابه. والمهمّ أن الدخول نجح
 *    فعلاً والخادم أصدر توكناً — الصفحة وحدها رفضت. فنحن نعرف من هو
 *    ونعرف مكانه، وأن نطلب منه إعادة الكتابة في صفحةٍ أخرى عبث.
 *
 * ٢) والأدمن حين يضيف كابتناً برقمٍ لعميلٍ مسجَّل كان يُقال له «المستخدم
 *    موجود بالفعل» ثم ينتهي الأمر. فيختلق رقماً ثانياً للشخص نفسه —
 *    حسابان لواحد — أو يتركه. الآن يُعرَض عليه تحويل الحساب نفسه.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const root = (...p) => path.join(__dirname, '..', ...p);
const read = (...p) => fs.readFileSync(root(...p), 'utf8');

const NL = String.fromCharCode(10);
const AdminLog = require('../models/AdminLog');

const helper = read('public_html', 'js', 'role-redirect.js');
const users = read('routes', 'admin', 'users.js');
const panel = read('public_html', 'js', 'admin-panel.js');

describe('🚪 الباب الخطأ يدلّ على بابه', () => {
    it('لكل دورٍ وجهةٌ معروفة', () => {
        for (const r of ['client', 'customer', 'merchant', 'captain', 'admin']) {
            expect(helper, `دورٌ بلا وجهة: ${r}`).toContain(`${r}:`);
        }
        expect(helper).toContain('index.html');
        expect(helper).toContain('merchant-dashboard.html');
        expect(helper).toContain('captain-dashboard.html');
        expect(helper).toContain('admin.html');
    });

    it('والزرّ يُدخله بالجلسة التي صدرت فعلاً — لا يُعيد الكتابة', () => {
        expect(helper).toContain('window.Auth.setAuth(token, user)');
        expect(helper).toContain('window.location.replace(home.url)');
    });

    it('🔴 ويهرب من اسم المستخدم قبل حقنه', () => {
        expect(helper).toContain('function esc');
        expect(helper).toContain('esc(user.name)');
        expect(helper).toContain('esc(home.label)');
    });

    it('ودورٌ مجهول لا يُنتج زرّاً معطوباً', () => {
        expect(helper).toContain('if (!home)');
    });

    const pages = [
        ['captain-login.html', 'حساب كابتن'],
        ['client-login.html', 'حساب عميل'],
        ['admin-login.html', 'حساب إداري']
    ];
    for (const [file, label] of pages) {
        it(`${file} تستعمله وتربط زرّه`, () => {
            const s = read('public_html', file);
            expect(s).toContain('js/role-redirect.js');
            expect(s).toContain(`RoleRedirect.wrongDoorHtml(data.user, '${label}')`);
            expect(s).toContain('RoleRedirect.bind(data.token, data.user)');
        });
    }

    it('🔴 ولم تبقَ رسالةُ الطريق المسدود في أيٍّ منها', () => {
        for (const [file] of pages) {
            // التعليقات تشرح ما أُزيل فتذكر نصّه — تُنزع قبل الفحص
            const s = read('public_html', file)
                .split(NL).filter(l => !l.trim().startsWith('//')).join(NL);
            expect(s, file).not.toContain('ليس مسجلاً ككابتن');
            expect(s, file).not.toContain('ليس حساب عميل أو تاجر');
            expect(s, file).not.toContain('ليس حساب مسؤول');
        }
    });

    it('⚠️ وصفحة الإدارة تحقن النصّ الغنيّ لا نصّاً خاماً', () => {
        // showError فيها تستعمل textContent، فالوسوم كانت ستظهر حرفياً
        const s = read('public_html', 'admin-login.html');
        expect(s).toContain('errorMsg.innerHTML = RoleRedirect.wrongDoorHtml');
    });
});

describe('🔁 ترقية عميلٍ قائم إلى كابتن', () => {
    const blk = users.slice(users.indexOf("router.post('/create-captain'"),
                            users.indexOf('Create Captain Error'));

    it('🔴 لا ترقية بلا موافقةٍ صريحة', () => {
        expect(blk).toContain('if (!req.body.confirmUpgrade)');
        expect(blk).toContain('canUpgrade: true');
        expect(blk).toContain('res.status(409)');
    });

    it('ويُعرَض من هو الحساب قبل السؤال', () => {
        expect(blk).toContain('existing: {');
        expect(blk).toContain('name: userExists.name');
        expect(blk).toContain('createdAt: userExists.createdAt');
    });

    it('🔴 ولا يُرقّى إلا عميل — لا تاجرٌ ولا كابتنٌ ولا مسؤول', () => {
        expect(blk).toContain("['client', 'customer'].includes(userExists.role)");
        expect(blk).toContain('if (!isUpgradable)');
    });

    it('🔒 ونطاق الأدمن المساعد يسري على الترقية', () => {
        expect(blk).toContain('adminCanActOnUser(req, userExists)');
    });

    it('والحساب نفسه يُرقّى — لا حسابٌ ثانٍ للشخص نفسه', () => {
        // الإنشاء يبقى لمن لا حساب له؛ الفحص على فرع الترقية وحده
        const upgrade = blk.slice(blk.indexOf('if (!req.body.confirmUpgrade)'),
                                  blk.indexOf('upgraded: true'));
        expect(upgrade).toContain("userExists.role            = 'captain'");
        expect(upgrade).toContain('await userExists.save()');
        expect(upgrade).not.toContain('User.create');
    });

    it('🔑 ولا تُمسّ كلمة مروره — يدخل بالتي يعرفها', () => {
        const body = blk.slice(blk.indexOf('confirmUpgrade'));
        expect(body).not.toContain('userExists.password =');
    });

    it('📜 والترقية تترك أثراً في سجلّ الإدارة', () => {
        expect(blk).toContain("logAdminAction(req, 'upgrade_client_to_captain'");
    });

    it('🔴 والفعل مُسجَّلٌ في المخطّط — وإلا سقطت الكتابة بصمت', () => {
        // adminLogger يبتلع خطأ الكتابة (non-fatal)، فالتحقّق هنا لا هناك
        expect(AdminLog.schema.path('action').enumValues).toContain('upgrade_client_to_captain');
    });

    it('ودورٌ غير قابلٍ للترقية يُسمّى للأدمن لا يُبهَم', () => {
        expect(blk).toContain('existingRole: userExists.role');
        expect(blk).toContain('كابتن');
        expect(blk).toContain('تاجر');
    });
});

describe('🖥️ واجهة الأدمن تسأل قبل أن تُرقّي', () => {
    const fn = panel.slice(panel.indexOf('async function submitCreateCaptain'),
                           panel.indexOf('// ── Broadcast ──'));

    it('تعرض بيانات الحساب القائم', () => {
        expect(fn).toContain('data.canUpgrade');
        expect(fn).toContain('window.escapeHtml(e.name');
        expect(fn).toContain('window.escapeHtml(e.phone');
    });

    it('ولا تُرسل التأكيد إلا بعد ضغطةٍ ثانية', () => {
        expect(fn).toContain('if (!c.isConfirmed) return;');
        expect(fn).toContain('confirmUpgrade: true');
    });

    it('وتُنبّه أن كلمة المرور المكتوبة لن تُستعمل', () => {
        expect(fn).toContain('لن تُستعمل كلمة المرور التي كتبتها');
    });

    it('وتُفرّق في نصّ النجاح بين إنشاءٍ وترقية', () => {
        expect(fn).toContain('data.upgraded');
    });
});
