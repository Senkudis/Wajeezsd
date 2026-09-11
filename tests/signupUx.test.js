/**
 * ✍️ تحسينات نموذج تسجيل الكابتن — بناءً على ملاحظات مستعمِلة:
 *
 *   1. «الأخطاء صامتة — لمّا أكتب حاجة غلط لازم أرجع فوق أشوف مكتوب شنو»
 *      الشريط أعلى النموذج، والحقل المخالف أسفل خطوةٍ طويلة، فلا يُرى.
 *   2. «ما عايز إيموجيز لأنها قبيحة»
 *   3. «كتابة الإقرار: خلّي النصّ جاهز، بس الزول يدخل اسمه ورقمه»
 *
 * وعطلٌ وجدته أثناء التنفيذ: حدّ الخادم 5MB للملف، والنموذج يرفع **خمس**
 * صور من كاميرا هاتف (3-8MB للواحدة). صورةٌ واحدة فوق الحدّ كانت تُفشل
 * الطلب كلّه فيبقى الكابتن بحسابٍ بلا وثائق ولا يعرف السبب.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const page = read('public_html/captain-signup.html');

describe('1. الأخطاء تظهر عند الحقل لا أعلى النموذج وحده', () => {
    it('لكل حقل مكانٌ لرسالته', () => {
        for (const id of ['name', 'city', 'email', 'phone', 'password', 'nationalId',
                          'address', 'whatsapp', 'emergencyContactName',
                          'emergencyPhone', 'emergencyRelation']) {
            expect(page).toContain(`id="${id}-error"`);
        }
    });

    it('الحقل المخالف يُعلَّم ويُمرَّر إليه ويُركَّز عليه', () => {
        expect(page).toContain('function showFieldError');
        expect(page).toContain("field.classList.add('is-invalid')");
        expect(page).toContain('scrollIntoView');
        expect(page).toContain('field.focus');
    });

    it('block:center لا start — الترويسة اللاصقة تغطّي الحقل', () => {
        expect(page).toMatch(/scrollIntoView\(\{\s*behavior:\s*'smooth',\s*block:\s*'center'\s*\}\)/);
    });

    it('العلامات القديمة تُمسح قبل إظهار خطأ جديد', () => {
        expect(page).toContain('function clearFieldErrors');
        const i = page.indexOf('function showFieldError');
        expect(page.slice(i, i + 400)).toContain('clearFieldErrors()');
    });

    it('لا رسالة جامعة «املأ جميع الحقول» — كلٌّ يُشار إليه بعينه', () => {
        expect(page).not.toContain('يرجى ملء جميع الحقول');
        expect(page).toContain("showFieldError('name'");
        expect(page).toContain("showFieldError('password'");
        expect(page).toContain("showFieldError('nationalId'");
    });

    it('خطأ الرقم الوطني يقول كم أدخل المستخدم فعلاً', () => {
        // «11 رقماً بالضبط» وحدها لا تُعين من كتب 10 على اكتشاف الفرق
        expect(page).toContain('أدخلت ${nid.length}');
    });
});

describe('2. لا إيموجي في واجهة النموذج', () => {
    const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

    it('لا إيموجي في أي سطر معروض', () => {
        const offenders = page.split(/\r?\n/)
            .map((l, i) => [i + 1, l])
            .filter(([, l]) => {
                const t = l.trim();
                if (!t || t.startsWith('//') || t.startsWith('*') ||
                    t.startsWith('/*') || t.startsWith('<!--')) return false;
                return EMOJI.test(l);
            });
        expect(offenders.map(([n, l]) => `${n}: ${l.trim().slice(0, 60)}`)).toEqual([]);
    });

    it('أيقونات المركبات من Bootstrap Icons لا رموز تعبيرية', () => {
        for (const icon of ['bi-scooter', 'bi-bicycle', 'bi-car-front-fill',
                            'bi-truck-front-fill', 'bi-taxi-front-fill', 'bi-ev-front-fill']) {
            expect(page).toContain(icon);
        }
    });
});

describe('3. الإقرار: نصّ جاهز واسم ورقم', () => {
    it('لا مربّع نصّ حرّ بعد الآن', () => {
        expect(page).not.toContain('id="pledgeText"');
        expect(page).toContain('id="pledgeName"');
        expect(page).toContain('id="pledgePhone"');
    });

    it('الاسم والرقم يُملآن من الخطوة الأولى', () => {
        expect(page).toContain('function prefillPledge');
        expect(page).toContain('if (step === 3) prefillPledge()');
    });

    it('النصّ يُركَّب بصيغة البند السادس حرفياً', () => {
        expect(page).toContain('function buildPledgeText');
        expect(page).toContain('أقرّ أنا الكابتن/ ${name} بأنني قرأت جميع الشروط والضوابط المذكورة أعلاه');
        expect(page).toContain('pledgeText:           buildPledgeText()');
    });

    it('موافقة صريحة مطلوبة قبل المتابعة', () => {
        expect(page).toContain('id="pledgeAgree"');
        expect(page).toContain("document.getElementById('pledgeAgree').checked");
    });
});

describe('4. ضغط الصور قبل الرفع', () => {
    const mod = read('public_html/js/image-compress.js');

    it('محمَّل في صفحة التسجيل، والرفع يستعمل المضغوط لا الأصل', () => {
        expect(page).toContain('js/image-compress.js');
        expect(page).toContain('function pickedFile');
        for (const f of ['driverLicense', 'profilePhoto', 'vehiclePhoto', 'idImage', 'selfieImage']) {
            expect(page).toContain(`pickedFile('${f}')`);
        }
        // لم يبقَ رفعٌ مباشر من حقل الملف
        expect(page).not.toMatch(/const (driverLicense|idImage|selfieImage) = document\.getElementById\([^)]+\)\.files\[0\]/);
    });

    it('يحترم دوران EXIF — وإلا وصلت الهوية مقلوبة للمراجع', () => {
        expect(mod).toContain("imageOrientation: 'from-image'");
    });

    it('يخفض الجودة تدريجياً حتى يبلغ الهدف بلا حلقة لا نهائية', () => {
        expect(mod).toContain('while (blob && blob.size > o.maxBytes && q > o.minQuality)');
        expect(mod).toContain('minQuality');
    });

    it('الهدف دون حدّ الخادم (5MB) بهامش واسع', () => {
        const m = mod.match(/maxBytes:\s*([\d.]+)\s*\*\s*1024\s*\*\s*1024/);
        expect(m).toBeTruthy();
        expect(parseFloat(m[1])).toBeLessThan(5);
    });

    it('لا يمنع المستخدم: أي فشل يُرجع الملف الأصلي', () => {
        expect(mod).toContain('return file;   // لا نمنع المستخدم بسبب فشل الضغط');
        expect(mod).toContain("if (!file || !file.type || file.type.indexOf('image/') !== 0) return file;");
    });

    it('خلفية بيضاء قبل الرسم — JPEG بلا شفافية', () => {
        // بدونها تصير المناطق الشفّافة سوداء في PNG المحوّلة
        expect(mod).toContain("ctx.fillStyle = '#fff'");
    });
});
