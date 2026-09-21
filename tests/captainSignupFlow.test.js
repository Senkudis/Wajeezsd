/**
 * 🪪 انتساب الكابتن — طريقٌ يُفضي إلى مكان.
 *
 * ما وجدناه في الإنتاج: من سجّل ككابتنٍ بلا حسابٍ سابق كان يقع في طريقٍ
 * مسدودٍ كامل. أربعة أعطالٍ متراكبة، كلٌّ منها يكفي وحده:
 *
 *   ١) الواجهة تقرأ data.token والخادم يسمّيه uploadToken — فالزائر الجديد
 *      (تخزينه فارغ) يرفع وثائقه بـ Bearer null.
 *   ٢) ولو صحّ الاسم، قائمة المسارات المسموحة للتوكن المقيّد كانت تحوي
 *      '/api/auth/upload-documents' — مسارٌ لا وجود له في المشروع — بينما
 *      الواجهة ترسل إلى /api/upload/captain-docs. فيُرفض بـ 403.
 *   ٣) الردّ يَعِد بـ requiresOtp وشاشةُ OTP غير موجودة، فيقفز إلى «تم
 *      الإرسال» ولا يُسأل كوداً — وكودٌ يُرسَل برسالةٍ لا مكان لإدخاله.
 *   ٤) وعند محاولة الدخول: فحص isVerified يسبق فحص الحالة، فيُقال له
 *      «حسابك غير مفعّل» وصفحةُ دخول الكباتن بلا حقل OTP.
 *
 * والنتيجة المقيسة: كل تسجيلٍ جديد في الإنتاج وثائقه صفر، فيُرفض لنقصها.
 * والترقية وحدها كانت تنجح لأن تخزينها يحمل توكناً حقيقياً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const NL = String.fromCharCode(10);
const auth = read('routes', 'auth.js');
const mw = read('middleware', 'authMiddleware.js');
const page = read('public_html', 'captain-signup.html');
const upload = read('routes', 'upload.js');

describe('🔴 وثائق المتقدّم تصل الإدارة', () => {
    it('الواجهة تقرأ الاسم الذي يُرسله الخادم فعلاً', () => {
        expect(page).toContain('data.uploadToken');
    });

    it('🔴 والمسار المسموح للتوكن المقيّد مسارٌ موجود', () => {
        const m = mw.match(/allowedPaths\s*=\s*\[([^\]]*)\]/);
        expect(m).not.toBeNull();
        const paths = m[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, ''));
        expect(paths.length).toBeGreaterThan(0);
        for (const p of paths) {
            const route = p.replace(/^\/api\/[a-z-]+/, '');
            const file = p.startsWith('/api/upload') ? upload : auth;
            expect(file, `المسار ${p} غير معرّف في أي راوتر`).toContain(`'${route}'`);
        }
    });

    it('وهو نفس المسار الذي ترسل إليه صفحة التسجيل', () => {
        const sent = page.match(/\/api\/upload\/[a-z-]+/);
        expect(sent).not.toBeNull();
        expect(mw).toContain(sent[0]);
    });

    it('والنطاق ما زال مُقيَّداً — لا توكن رفعٍ يفتح التطبيق كلّه', () => {
        expect(mw).toContain("decoded.scope !== 'full'");
        expect(mw).toContain('return res.status(403)');
    });
});

// جسد /register-captain بلا تعليقات: التعليقات تشرح ما حُذف فتذكر أسماءه
const regCode = () => auth
    .slice(auth.indexOf("router.post('/register-captain'"), auth.indexOf("router.post('/login'"))
    .split(NL).filter(l => !l.trim().startsWith('//')).join(NL);

describe('لا وعدٌ بشاشةٍ غير موجودة', () => {
    it('الردّ لا يطلب شاشة OTP', () => {
        expect(regCode()).not.toContain('requiresOtp');
    });

    it('ولا يُرسَل كودٌ لا مكان لإدخاله', () => {
        expect(regCode()).not.toContain('sendSmsOTP');
        expect(regCode()).not.toContain('generateOtpCode');
    });

    it('والتفعيل يقع مع القبول الإداري', () => {
        expect(read('routes', 'admin', 'users.js')).toContain('captain.isVerified = true');
    });
});

describe('🔴 رسالة الدخول تقول الحقيقة', () => {
    it('حالة الكابتن تُفحص قبل التفعيل — لا «فعّل حسابك» لمن ينتظر قراراً', () => {
        const login = auth.slice(auth.indexOf("router.post('/login'"),
                                 auth.indexOf("router.get('/firebase-web-config'"));
        const pending = login.indexOf("approvalStatus === 'pending'");
        const verify = login.indexOf('if (!user.isVerified)');
        expect(pending).toBeGreaterThan(0);
        expect(verify).toBeGreaterThan(0);
        expect(pending).toBeLessThan(verify);
    });

    it('والمرفوض كذلك', () => {
        const login = auth.slice(auth.indexOf("router.post('/login'"),
                                 auth.indexOf("router.get('/firebase-web-config'"));
        expect(login.indexOf("approvalStatus === 'rejected'"))
            .toBeLessThan(login.indexOf('if (!user.isVerified)'));
    });
});
