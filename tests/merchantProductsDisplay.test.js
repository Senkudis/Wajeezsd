/**
 * 🧾 عرض المنتجات في لوحة التاجر.
 *
 * شكوى التاجر: العرض رديء، والوصف الطويل مكتوبٌ كاملاً.
 *
 * الوصف كان مقصوصاً بسطرين بلا طريقٍ لرؤية الباقي إلا `title` — وهو تلميحٌ
 * لا يعمل باللمس، أي أن الوصف كان محجوباً على الهاتف فعلياً. وكتابته كاملة
 * بديلٌ أسوأ: وصفٌ من عشرة أسطر يبتلع الشاشة فلا يرى التاجر إلا منتجاً
 * واحداً. فسطران وزرّ.
 *
 * والزرّ يظهر بالقياس بعد الرسم لا بعدّ الحروف: السطران يسعان كلماتٍ
 * مختلفة باختلاف عرض الشاشة وحجم خطّ النظام — والتاجر الذي كبّر خطّ هاتفه
 * هو أكثر من يحتاج الزرّ.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const page = fs.readFileSync(
    path.join(__dirname, '..', 'public_html', 'merchant-products.html'), 'utf8');

describe('الوصف الطويل: سطران ثم زرّ', () => {
    it('يُقصّ بسطرين افتراضياً', () => {
        expect(page).toContain('.product-desc.clamped');
        expect(page).toContain('-webkit-line-clamp: 2');
        expect(page).toContain('class="product-desc clamped"');
    });

    it('زرٌّ لفتحه — لا تلميح عنوانٍ لا يعمل باللمس', () => {
        expect(page).toContain('عرض الوصف');
        expect(page).toContain('onclick="toggleDesc(this)"');
        expect(page).not.toContain('product-desc-2l');
        // لا title على الوصف: بديلٌ وهميّ على الهاتف
        expect(page).not.toMatch(/class="[^"]*product-desc[^"]*"[^>]*title=/);
    });

    it('الزرّ مخفيٌّ حتى يثبت أن هناك مخفيّاً', () => {
        expect(page).toContain('.desc-toggle {');
        expect(page).toMatch(/\.desc-toggle \{[^}]*display: none/);
        expect(page).toContain('.desc-toggle.show { display: inline-flex; }');
    });

    it('القياس بعد الرسم لا تخمينٌ بعدد الحروف', () => {
        expect(page).toContain('function _markClampedDescriptions');
        expect(page).toContain('el.scrollHeight - el.clientHeight > 2');
        expect(page).not.toMatch(/description\.length\s*>\s*\d+/);
    });

    it('يُعاد القياس بعد تحميل الخطّ وعند تغيّر العرض', () => {
        // القياس بخطٍّ احتياطيّ يعطي ارتفاعاً مختلفاً عن Cairo
        expect(page).toContain('document.fonts.ready.then(_markClampedDescriptions)');
        expect(page).toContain("window.addEventListener('resize'");
    });

    it('يُستدعى بعد كل رسمٍ للقائمة لا مرّةً واحدة', () => {
        // البحث يعيد الرسم، فبطاقاتٌ جديدة بلا قياس = أزرارٌ لا تظهر
        const i = page.indexOf('function renderProducts');
        const blk = page.slice(i, page.indexOf('function _markClampedDescriptions'));
        expect(blk).toContain('_markClampedDescriptions();');
    });

    it('الزرّ يبدّل نصّه فيعرف التاجر ما يفعله', () => {
        expect(page).toContain('window.toggleDesc');
        expect(page).toContain('إخفاء الوصف');
        expect(page).toContain("el.classList.toggle('clamped')");
    });

    it('بلا رموز تعبيرية في الزرّ — أيقونات Bootstrap', () => {
        expect(page).toContain('bi-chevron-down');
        expect(page).toContain('bi-chevron-up');
        const btn = page.slice(page.indexOf('class="desc-toggle"'), page.indexOf('class="desc-toggle"') + 220);
        expect(btn).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });

    it('الوصف مهرَّب — يكتبه التاجر ويُحقن في innerHTML', () => {
        expect(page).toContain('${esc(p.description)}');
    });
});

describe('البطاقة تتّسع لمحتواها على الشاشات الضيّقة', () => {
    it('عمود المعلومات يقبل الانكماش', () => {
        // بلا min-width:0 يرفض عنصر flex النزول تحت عرض محتواه، فتُدفع
        // الشارات خارج البطاقة
        expect(page).toMatch(/\.product-info \{[^}]*min-width: 0/);
    });

    it('الوصف يكسر الكلمة الطويلة بدل تمديد البطاقة', () => {
        expect(page).toMatch(/\.product-desc \{[^}]*overflow-wrap: anywhere/);
    });

    it('أسفل الصفحة يتّسع للزرّ العائم فوق الشريط', () => {
        // 90px كانت تُبقي الزرّ فوق آخر بطاقة فيغطّي شاراتها
        expect(page).toContain('padding-bottom: calc(112px + var(--sab, 0px))');
        // لا env() خام: WebView أندرويد يعيد 0 — القيمة تُحقن في --sab
        expect(page).not.toMatch(/padding-bottom:[^;]*env\(safe-area-inset-bottom/);
    });

    it('الوضع الليلي يلوّن الوصف والزرّ', () => {
        expect(page).toContain('body.dark-mode .product-desc');
        expect(page).toContain('body.dark-mode .desc-toggle');
    });
});
