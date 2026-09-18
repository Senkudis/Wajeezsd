/**
 * 🏪 وضوح خطوات الطلب عند التاجر.
 *
 * شكويان من التجّار:
 *   ١) «خيارات الطلب كثيرة ومتشابهة وما بقدروا يميّزوا».
 *   ٢) «مرّات التاجر يكون عامل تأكيد الطلب وقايلو كدا اتنشر للكباتن».
 *
 * والسببان واحد: ثلاثة إجراءات متتالية كانت **كلّها btn-green**، بنفس
 * الحجم وفي نفس الموضع — فتُقرأ زرّاً واحداً يتكرّر، ويضغطها التاجر بلا
 * قراءة. وشريط الخطوات كان يسمّي الخطوة الثالثة «التجهيز» — وهو نشاطٌ
 * داخل المتجر لا حدثٌ في النظام، فلا شيء في الشاشة كلّها كان يقول **متى
 * يُنشر الطلب للكباتن**.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const page = fs.readFileSync(path.join(__dirname, '..', 'public_html/merchant-orders.html'), 'utf8');

describe('شريط الخطوات يسمّي الأثر لا النشاط', () => {
    it('🔑 الخطوة الثالثة صارت «النشر للكباتن»', () => {
        expect(page).toContain("lbl: 'النشر للكباتن'");
    });

    it('ولم تعد تُسمّى «التجهيز» — الاسم الذي خلق سوء الفهم', () => {
        const steps = page.slice(page.indexOf('const steps = ['), page.indexOf('return `<div class="steps-wrap"'));
        expect(steps).not.toContain("lbl: 'التجهيز'");
    });
});

describe('🔑 لافتة «لم يُنشر بعد»', () => {
    it('موجودة وتُستدعى في بطاقة الطلب', () => {
        expect(page).toContain('function buildPublishState');
        expect(page).toContain('${buildPublishState(o)}');
    });

    it('تقول صراحةً إن أحداً لا يراه', () => {
        expect(page).toContain('لم يُنشر للكباتن بعد');
        expect(page).toContain('لا يراه أي كابتن');
    });

    it('🔑 وتختفي فور النشر — وإلا كذبت بعد أن صدقت', () => {
        const fn = page.slice(page.indexOf('function buildPublishState'), page.indexOf('// ── الإجراء التالي'));
        expect(fn).toMatch(/\['ready_for_pickup', 'captain_assigned', 'picked_up', 'delivered'\]/);
        expect(fn).toMatch(/if \(published[\s\S]{0,60}return ''/);
    });
});

describe('🎨 الأزرار الثلاثة لم تعد متشابهة', () => {
    it('🔑 لكل خطوة صنفها ولونها', () => {
        for (const c of ['btn-step1', 'btn-step2', 'btn-publish']) {
            expect(page, c).toContain('.' + c);
        }
    });

    it('🔑 ولا يتشارك إجراءان صنفاً واحداً — التشابه هو أصل الشكوى', () => {
        const actions = page.slice(page.indexOf('function buildNextAction'), page.indexOf('function buildOrderCard'));
        const classes = [...actions.matchAll(/class="btn-primary-step ([a-z0-9-]+)"/g)].map(m => m[1]);
        expect(classes.length).toBeGreaterThanOrEqual(4);
        expect(new Set(classes).size).toBe(classes.length);
    });

    it('ومرقّمة لتُربط بالشريط', () => {
        expect(page).toMatch(/<span class="step-num">١<\/span> قبول الطلب/);
        expect(page).toMatch(/<span class="step-num">٢<\/span> تأكيد استلام الدفع/);
        expect(page).toMatch(/<span class="step-num">٣<\/span> تمّ التجهيز — انشر الطلب للكباتن/);
    });

    it('🔑 وزرّ النشر يصف أثره لا حال البضاعة على الرفّ', () => {
        expect(page).toContain('انشر الطلب للكباتن');
        expect(page).not.toContain('الطلب جاهز للاستلام');
    });
});

describe('✋ النشر يُؤكَّد قبل وقوعه', () => {
    const fn = page.slice(page.indexOf('async function markReady'), page.indexOf('async function remindCaptains'));

    it('🔑 سؤالٌ قبل الإرسال — وهي الخطوة التي يُخطئ فيها التجّار', () => {
        expect(fn).toContain('ننشر الطلب للكباتن؟');
        expect(fn).toMatch(/if \(!ok\) return;/);
    });

    it('ويُشرح ما سيحدث لا ما تغيّر', () => {
        expect(fn).toContain('سيظهر الطلب فوراً لكباتن مدينتك');
    });

    it('ورسالة النجاح تؤكّد النشر لا «الجاهزية»', () => {
        expect(fn).toContain('نُشر للكباتن');
    });
});
