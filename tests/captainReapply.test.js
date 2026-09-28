/**
 * 🔁 الكابتن المرفوض يعيد التقديم — إلا من رفضه الأدمن نهائياً.
 *
 * كان من سجّل ككابتنٍ ابتداءً ثم رُفض مسدوداً من كل طريق: التسجيل بنفس
 * الرقم ← «لديك حساب كابتن»، برقمٍ جديد ← «الرقم الوطني مسجل»، الدخول ←
 * «حسابك موقوف». بينما رسالة الرفض تقول له «يمكنك التقديم من جديد».
 *
 * هذا الملف بلا قاعدة (يعمل محلياً)، والطريق كاملاً في captainReapply.db.test.js.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const R = require('../utils/captainReapply');
const { buildCaptainRejectionMessage } = require('../utils/captainApprovalMessage');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const rejected = (app = {}, over = {}) => ({
    role: 'captain', approvalStatus: 'rejected', rejectionReason: 'صورة الهوية غير واضحة',
    captainApplication: { status: 'none', rejectionReason: 'صورة الهوية غير واضحة', ...app }, ...over
});

describe('من يُعاد تقديمه', () => {
    it('🔑 المرفوض رفضاً عادياً: نعم', () => {
        expect(R.canReapply(rejected())).toBe(true);
    });
    it('عميلٌ رُفض طلب ترقيته (الحالة على الطلب لا على الحساب): نعم', () => {
        expect(R.canReapply({ role: 'client', approvalStatus: 'approved', captainApplication: { status: 'rejected' } })).toBe(true);
    });
    it('🔒 المرفوض نهائياً: لا', () => {
        expect(R.canReapply(rejected({ reapplyBlocked: true }))).toBe(false);
        expect(R.isFinallyRejected(rejected({ reapplyBlocked: true }))).toBe(true);
    });
    it('المعلّق والمقبول والمحذوف: لا', () => {
        expect(R.canReapply({ role: 'captain', approvalStatus: 'pending', captainApplication: {} })).toBe(false);
        expect(R.canReapply({ role: 'captain', approvalStatus: 'approved', captainApplication: {} })).toBe(false);
        expect(R.canReapply(rejected({}, { deletedAt: new Date() }))).toBe(false);
        expect(R.canReapply(null)).toBe(false);
    });
});

describe('رسالة الدخول', () => {
    it('تحمل السبب وتدلّ على الطريق', () => {
        const m = R.rejectedLoginMessage(rejected());
        expect(m).toContain('صورة الهوية غير واضحة');
        expect(m).toContain('إعادة التقديم');
        expect(m).toContain('بنفس رقمك وكلمة مرورك');
    });
    it('والنهائيّ لا يَعِد بما لن يقع', () => {
        const m = R.rejectedLoginMessage(rejected({ reapplyBlocked: true }));
        expect(m).toContain('نهائياً');
        expect(m).not.toContain('إعادة التقديم');
    });
});

describe('إعادة فتح الطلب', () => {
    it('🔑 يعود «قيد المراجعة» ويحفظ السبب السابق والعدد', () => {
        const u = rejected({ reapplyCount: 1 });
        R.reopenApplication(u, { nationalId: '12345678901', address: 'بحري' });
        expect(u.captainApplication).toMatchObject({
            status: 'pending', rejectionReason: '', reapplyBlocked: false,
            reapplyCount: 2, previousRejectionReason: 'صورة الهوية غير واضحة',
            nationalId: '12345678901', address: 'بحري'
        });
        expect(u.captainApplication.submittedAt).toBeInstanceOf(Date);
        expect(u.rejectionReason).toBe('');
    });
});

describe('رسالة الرفض على واتساب', () => {
    it('العاديّ: «يمكنك التقديم من جديد» وبنفس الرقم', () => {
        const m = buildCaptainRejectionMessage({ name: 'أحمد', reason: 'س' });
        expect(m).toContain('يمكنك التقديم من جديد');
        expect(m).toContain('بنفس رقم هاتفك وكلمة مرورك');
    });
    it('🔒 النهائيّ: بلا وعدٍ بإعادة التقديم', () => {
        expect(buildCaptainRejectionMessage({ name: 'أحمد', reason: 'س', final: true })).not.toContain('يمكنك التقديم من جديد');
    });
});

describe('الخادم', () => {
    const auth = read('routes/auth.js');
    const users = read('routes/admin/users.js');

    it('🔑 التسجيل بنفس الرقم يعيد التقديم — بكلمة المرور لا بدونها', () => {
        const fn = auth.slice(auth.indexOf('async function reapplyRejectedCaptain'), auth.indexOf("router.post('/register-captain'"));
        expect(fn).toContain('bcrypt.compare(');
        expect(fn).toContain('wrongPassword: true');
        // الرقم الوطنيّ فريدٌ إلا عن صاحبه
        expect(fn).toContain('_id: { $ne: user._id }');
        expect(fn).toContain("user.approvalStatus = 'pending'");
        expect(fn).toContain('user.isActive = true');
        expect(fn).toContain('reopenApplication(user');
        // يرفع وثائقه المصحّحة بالتوكن المقيّد نفسه
        expect(fn).toContain("scope: 'upload_only'");
        const reg = auth.slice(auth.indexOf("router.post('/register-captain'"));
        expect(reg).toContain('canReapply(existing)');
        expect(reg).toContain('isFinallyRejected(existing)');
    });

    it('🔒 الباب المغلق يسبق إعادة التقديم كما يسبق التسجيل', () => {
        const reg = auth.slice(auth.indexOf("router.post('/register-captain'"));
        expect(reg.indexOf('isCaptainRegistrationOpen')).toBeLessThan(reg.indexOf('reapplyRejectedCaptain('));
    });

    it('🔑 الدخول: رسالة الرفض قبل «موقوف» — في المسارين', () => {
        const blocks = auth.split("if (user.role === 'captain' && user.approvalStatus === 'rejected' && !user.deletedAt)");
        expect(blocks).toHaveLength(3);
        for (let i = 1; i < blocks.length; i++) {
            const after = blocks[i];
            expect(after.indexOf('rejectedLoginMessage(user)')).toBeLessThan(after.indexOf('if (!user.isActive)'));
        }
        expect(auth).not.toContain('تم رفض طلبك. تواصل مع الإدارة لمزيد من التفاصيل.');
    });

    it('طلب الترقية يحترم الرفض النهائي', () => {
        const ap = auth.slice(auth.indexOf("router.post('/captain-application'"), auth.indexOf('function captainAppFields'));
        expect(ap).toContain('isFinallyRejected(user)');
    });

    it('الأدمن يختار «رفض نهائي» صراحةً — والافتراضيّ مفتوح', () => {
        const rj = users.slice(users.indexOf("'/reject-captain/:id'"));
        expect(rj).toContain('const final = req.body.final === true');
        expect(rj).toContain('captainApplication.reapplyBlocked = final');
    });

    it('والحقول معرّفة', () => {
        const s = require('../models/User').schema;
        for (const p of ['reapplyBlocked', 'reapplyCount', 'previousRejectionReason']) {
            expect(s.path(`captainApplication.${p}`)).toBeTruthy();
        }
    });
});

describe('الواجهات', () => {
    const panel = read('public_html/js/admin-panel.js');
    const login = read('public_html/captain-login.html');
    const signup = read('public_html/captain-signup.html');

    it('نموذج الرفض فيه «رفض نهائي» ويرسله', () => {
        expect(panel).toContain('id="rejFinal"');
        expect(panel).toContain('JSON.stringify({ reason, final })');
    });

    it('المراجِع يرى أنها إعادة تقديم وسبب الرفض السابق', () => {
        expect(panel).toContain('_reapplyNote(c)');
        expect(panel).toContain('window.escapeHtml(a.previousRejectionReason)');
    });

    it('صفحة الدخول تدلّ المرفوض على إعادة التقديم — والسبب مهرَّب', () => {
        expect(login).toContain('data.rejected && data.canReapply');
        expect(login).toContain('${escHtml(data.message)}');
        expect(login).toContain('href="captain-signup.html"');
    });

    it('🔑 للكباتن رابط «نسيت كلمة المرور» — كان غائباً', () => {
        expect(login).toContain('client-login.html?forgot=1');
        expect(read('public_html/client-login.html')).toContain("get('forgot') === '1'");
        expect(signup).toContain('data.wrongPassword');
    });
});
