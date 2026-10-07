/**
 * 📎 كباتن يصلون الإدارة بلا صور (أكتوبر 2026).
 *
 * الحساب يُنشأ أولاً ثم تُرفع الصور في طلبٍ لاحق. كانت الخمس في طلبٍ واحدٍ
 * بلا إعادة، فيسقط على شبكةٍ ضعيفة؛ وصفحة النجاح تقول «سجّل الدخول وأعد
 * رفعها» — والدخول يردّ المعلّق بـ«قيد المراجعة». طريقٌ مسدود من طرفيه.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('الرفع: صورةٌ صورة وبإعادة', () => {
    const js = read('public_html/js/captain-docs-upload.js');
    it('كل صورةٍ في طلبها، وثلاث محاولات', () => {
        expect(js).toContain('fd.append(field, file)');
        expect(js).toContain('attempt <= 3');
    });
    it('صفحة التسجيل تستعمله ولها زرّ إعادة، ولا تَعِد بطريقٍ مسدود', () => {
        const html = read('public_html/captain-signup.html');
        expect(html).toContain('js/captain-docs-upload.js');
        expect(html).toContain('window.CaptainDocs.upload(pendingDocsToken');
        expect(html).toContain('onclick="retryDocs()"');
        expect(html).not.toContain('أعد رفعها من صفحة حسابك');
    });
});

describe('الدخول يفتح طريق الإكمال', () => {
    const auth = read('routes/auth.js');
    it('المعلّق الناقص يُعطى توكن رفعٍ مقيّداً — بعد فحص كلمة المرور', () => {
        const login = auth.slice(auth.indexOf("router.post('/login'"));
        const pwd = login.indexOf('bcrypt.compare(password, user.password)');
        const needs = login.indexOf('needsDocs: true');
        expect(pwd).toBeGreaterThan(0);
        expect(needs).toBeGreaterThan(pwd);
        expect(login.slice(needs, needs + 300)).toContain("claims: { scope: 'upload_only' }");
    });
    it('صفحة دخول الكابتن تحوّله لصفحة الإكمال', () => {
        const html = read('public_html/captain-login.html');
        expect(html).toContain("data.needsDocs && data.uploadToken");
        expect(html).toContain("'captain-docs.html'");
        expect(fs.existsSync(path.join(__dirname, '..', 'public_html/captain-docs.html'))).toBe(true);
    });
});

describe('تنبيه الإدارة مرّة عند الاكتمال', () => {
    it('لا يُنبَّه بطلبٍ ناقص ولا مع كل صورة', () => {
        const up = read('routes/upload.js');
        expect(up).toContain('if (_isCaptainApplicant && docsReadyForReview)');
        expect(up).toContain('nowComplete && (!wasComplete');
    });
});
