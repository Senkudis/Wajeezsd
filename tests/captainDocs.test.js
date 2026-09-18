/**
 * 📎 وثائق طلب الانتساب.
 *
 * الشكوى: طلباتٌ تصل لوحة المراجعة بخمس علامات ✕ — لا هوية ولا صورة شخصية
 * ولا صورة وسيلة.
 *
 * السبب: لا شيء كان يفحصها. التحقّق كلّه على الخطوة الثالثة (الحقول
 * النصّية)، والوثائق في الرابعة بلا شرطٍ واحد. و submitRegistration ترفع
 * «ما وُجد» — فإن لم يُختر ملفٌ واحد لم يُستدعَ مسار الرفع أصلاً. فلا
 * المتقدّم يعلم أنه نسي، ولا شيء منعه.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const codeOnly = (src) => src.split('\n')
    .filter(l => { const t = l.trim(); return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*'); })
    .join('\n');

describe('الواجهة تمنع الإرسال الناقص', () => {
    const page = read('public_html/captain-signup.html');

    it('🔑 الأربع الإجبارية معرَّفة', () => {
        expect(page).toContain('REQUIRED_DOCS');
        for (const id of ['idImage', 'selfieImage', 'profilePhoto', 'vehiclePhoto']) {
            expect(page).toContain(`['${id}',`);
        }
    });

    it('🔑 الفحص داخل submitRegistration لا في goToStep', () => {
        // زرّ الإرسال يستدعي submitRegistration مباشرة، و goToStep(5) لا تقع
        // إلا **بعد** نجاح الإرسال — فالفحص هناك لا يعمل أبداً
        const fn = page.slice(page.indexOf('async function submitRegistration'));
        expect(fn.slice(0, 600)).toContain('missingRequiredDoc()');
    });

    it('ويعود قبل أي طلب شبكة', () => {
        const fn = page.slice(page.indexOf('async function submitRegistration'));
        expect(fn.indexOf('missingRequiredDoc()')).toBeLessThan(fn.indexOf('fetch('));
    });
});

describe('🪪 رخصة القيادة اختيارية — ووسمُها يقول ذلك', () => {
    const page = read('public_html/captain-signup.html');

    it('ليست ضمن الإجباريات', () => {
        const block = page.slice(page.indexOf('REQUIRED_DOCS'), page.indexOf('function missingRequiredDoc'));
        expect(block).not.toContain('driverLicense');
    });

    it('🔑 والوسوم تطابق القواعد — لا نجمة على اختياري ولا غيابها عن إجباري', () => {
        expect(page).toContain('رخصة القيادة <span class="text-muted fw-normal">(اختياري)</span>');
        expect(page).toContain('صورة شخصية *');
        expect(page).toContain('صورة المركبة *');
    });
});

describe('🔒 الخادم لا يقبل كابتناً بوثائق ناقصة', () => {
    const users = codeOnly(read('routes/admin/users.js'));
    const ap = users.slice(users.indexOf("'/approve-captain/:id'"), users.indexOf("'/reject-captain/:id'"));

    it('🔑 يفحصها كلّها قبل الترقية — الواجهة تُتجاوَز', () => {
        for (const f of ['docs.idImage', 'docs.selfieImage', 'docs.profilePhoto', 'docs.vehiclePhoto']) {
            expect(ap).toContain(f);
        }
        expect(ap).toMatch(/missingDocuments/);
    });

    it('والفحص يسبق تغيير الدور', () => {
        expect(ap.indexOf('missing.length')).toBeLessThan(ap.indexOf("captain.role = 'captain'"));
    });
});

describe('🔔 تنبيه الإدارة يصل في ترقيات العملاء', () => {
    const up = codeOnly(read('routes/upload.js'));

    it('🔑 لا يعتمد على الدور وحده — المُرقَّى يبقى عميلاً حتى القبول', () => {
        // كان الشرط role === 'captain' فقط، فتوقّف التنبيه تماماً بعد أن
        // صار الدور لا يتغيّر عند التقديم
        expect(up).toContain("captainApplication?.status === 'pending'");
    });

    it('ويبقى يعمل للتسجيل المباشر ككابتن', () => {
        expect(up).toMatch(/role === 'captain' && req\.user\.approvalStatus === 'pending'/);
    });
});
