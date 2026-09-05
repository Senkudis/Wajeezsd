/**
 * ⌨️ ارتفاع لوحة المفاتيح في شاشة المراسلة.
 *
 * العطل: عند فتح الكيبورد يبقى شريط الإدخال خلفه، فيكتب المستخدم ولا يرى
 * ما يكتب. السبب أن الكيبورد يُقلّص **نافذة العرض المرئية** وحدها، بينما
 * نافذة التخطيط تبقى كما هي — و`100dvh` لا تُنقذ لأنها تتعامل مع أشرطة
 * المتصفّح المتحرّكة لا مع الكيبورد.
 *
 * الحلّ نصفان، وهذا الملف يحرسهما معاً: وحدةٌ تقيس وتُصدّر `--kb`، وقاعدةُ
 * CSS تطرحها من ارتفاع الغلاف. نصفٌ بلا الآخر لا يفعل شيئاً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('وحدة قياس الكيبورد', () => {
    const src = read('public_html/js/keyboard-inset.js');

    it('تقيس من visualViewport لا من window.innerHeight', () => {
        // innerHeight لا يتغيّر بفتح الكيبورد على iOS — القياس منه يعطي صفراً دائماً
        expect(src).toContain('window.visualViewport');
        expect(src).toContain('vv.height');
    });

    it('تحسب الفرق بين نافذة التخطيط والمرئية وتضمّ offsetTop', () => {
        // offsetTop ضروري: iOS قد يُزيح النافذة المرئية لأعلى بدل تقليصها،
        // فإهماله يجعل الإزاحة ناقصة بمقدار الإزاحة نفسها
        expect(src).toContain('root.clientHeight');
        expect(src).toContain('vv.offsetTop');
    });

    it('تُصدّر --kb وصنف kb-open', () => {
        expect(src).toContain("setProperty('--kb'");
        expect(src).toContain("classList.toggle('kb-open'");
    });

    it('🔑 عتبة تمنع الخلط بين الكيبورد وشريط عنوان المتصفّح', () => {
        // تغيّر بضعة بكسلات يأتي من ظهور شريط العنوان واختفائه مع التمرير،
        // واعتباره كيبورداً يجعل الصفحة ترتجف أثناء التمرير العادي
        expect(src).toMatch(/MIN_KEYBOARD_PX\s*=\s*\d+/);
    });

    it('تُجمّع الأحداث في إطار واحد — iOS يُطلقها عشرات المرّات أثناء الانزلاق', () => {
        expect(src).toContain('requestAnimationFrame');
    });

    it('تخرج بهدوء حيث لا visualViewport — لا تكسر المتصفّحات القديمة', () => {
        expect(src).toMatch(/if \(!vv\) return;/);
    });
});

describe('شاشة المراسلة تستهلك --kb', () => {
    const html = read('public_html/chat.html');

    it('🔑 ارتفاع الغلاف يطرح --kb — وإلا لم تفعل الوحدة شيئاً', () => {
        expect(html).toContain('calc(100dvh - var(--kb, 0px))');
    });

    it('تُحمّل الوحدة', () => {
        expect(html).toMatch(/js\/keyboard-inset\.js/);
    });

    it('يبقى 100vh احتياطاً قبلها للمتصفّحات بلا dvh', () => {
        expect(html).toMatch(/height:\s*100vh;[\s\S]{0,600}calc\(100dvh - var\(--kb/);
    });

    it('شريط الإدخال خارج المنطقة القابلة للتمرير — يرتفع بالتخطيط لا بإزاحة', () => {
        // الإزاحة (transform) ترفع الشريط لكنها تترك فراغاً ميتاً تحته وتُبقي
        // قائمة الرسائل بطولها الأصلي فتختفي آخر الرسائل خلف الكيبورد
        expect(html).toMatch(/\.input-area \{[\s\S]{0,300}flex-shrink:\s*0/);
        expect(html).toMatch(/\.chat-container \{[\s\S]{0,120}flex:\s*1/);
    });
});
