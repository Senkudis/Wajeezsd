/**
 * ♿ الإتاحة في لوحة الكابتن — سمتان `aria-` في 1183 سطراً.
 *
 *   اللوحة هي الشاشة التي يقضي فيها الكابتن يومه، وفيها قراراتٌ تمسّ دخله
 *   وحسابه. العيوب التي أُصلحت هنا ليست تجميلية:
 *
 *   ١. **مفتاح الوردية بلا حالةٍ مُعلَنة.** `#availabilityToggle` هو أهمّ
 *      زرٍّ في التطبيق كلّه — عليه يتوقّف وصول الطلبات. كان `aria-pressed`
 *      يُضبط في `updateUI` وحدها، أي بعد أول استجابةٍ من الشبكة؛ وقبلها
 *      يُقرأ الزرّ زرّاً عادياً لا مفتاحاً له وضعان.
 *
 *   ٢. **لافتتان حرجتان صامتتان.** «ورديتك متوقّفة — لن تصلك طلبات» تظهر
 *      وتختفي بـ `classList.toggle('show')` بلا `role="status"`، و«اقتربت
 *      من الحد الأقصى للمديونية» تظهر فجأةً بلا `role="alert"` — وهي
 *      التحذير الأخير قبل إيقاف الحساب.
 *
 *   ٣. **طبقةُ إيقافٍ وورقةُ سدادٍ بلا أدوار.** كلتاهما تحجب الشاشة كاملةً،
 *      وما خلفهما يبقى في شجرة القراءة. وخطأ نموذج السداد يُكتب في
 *      `#payError` بلا `role="alert"` فلا يُعلَن للكابتن الذي أخطأ الإدخال.
 *
 *   ٤. **رقم الأرباح يتبدّل بصمت** عند تبديل الفترة، وأزرار الفترات ثلاثةُ
 *      أزرارٍ متجاورةٍ لا يُعرَف أيّها المختار.
 *
 *   ٥. **شارتا العمل المنتظر رقمان عاريان.** «0» بعد عنوان الصفّ بلا
 *      معنى — وتُحدَّث من `renderWorkCounts` فيلزم أن تُحدَّث تسميتها معها.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public_html/captain-dashboard.html'), 'utf8');

describe('مفتاح الوردية مفتاحٌ لا زرّ', () => {
    it('يُولَد بـ aria-pressed لا ينتظر أول استجابةٍ من الشبكة', () => {
        const i = html.indexOf('id="availabilityToggle"');
        expect(html.slice(i, i + 300)).toContain('aria-pressed="false"');
    });

    it('و updateUI تُبقيها متطابقةً مع الحالة الحقيقية', () => {
        const i = html.indexOf('function updateUI(active)');
        expect(html.slice(i, i + 700)).toContain("badge.setAttribute('aria-pressed'");
    });
});

describe('اللافتات الحرجة تُعلَن', () => {
    it('«ورديتك متوقّفة» حالةٌ تُنطَق عند ظهورها', () => {
        const i = html.indexOf('id="offlineBanner"');
        expect(html.slice(i, i + 80)).toContain('role="status"');
    });

    it('«اقتربت من حدّ المديونية» تنبيهٌ فوريّ', () => {
        const i = html.indexOf('id="warningBanner"');
        expect(html.slice(i, i + 80)).toContain('role="alert"');
    });

    it('وخطأ نموذج السداد كذلك', () => {
        const i = html.indexOf('id="payError"');
        expect(html.slice(i, i + 80)).toContain('role="alert"');
    });
});

describe('ما يحجب الشاشة نافذةٌ حاجبة', () => {
    it('طبقة إيقاف الحساب', () => {
        const i = html.indexOf('id="blockedOverlay"');
        const tag = html.slice(i, i + 220);
        expect(tag).toContain('role="dialog"');
        expect(tag).toContain('aria-modal="true"');
        expect(tag).toContain('aria-labelledby="blockedOverlayTitle"');
        expect(html).toContain('<h2 id="blockedOverlayTitle">');
    });

    it('ورقة سداد المديونية', () => {
        const i = html.indexOf('id="paymentModal"');
        const tag = html.slice(i, i + 220);
        expect(tag).toContain('role="dialog"');
        expect(tag).toContain('aria-modal="true"');
        expect(tag).toContain('aria-labelledby="paymentSheetTitle"');
        expect(html).toContain('id="paymentSheetTitle"');
    });

    it('وتسمية «صورة الإشعار» لم تعد يتيمة', () => {
        expect(html).toContain('<label class="cap-label" for="payReceipt">صورة الإشعار</label>');
    });
});

describe('الأرقام المتبدّلة تُقرأ', () => {
    it('رقم الأرباح منطقةٌ حيّة', () => {
        const i = html.indexOf('<div class="cap-hero"');
        expect(html.slice(i, i + 120)).toContain('aria-live="polite"');
    });

    it('أزرار الفترة مجموعةٌ مسمّاة، والمختارة معلومة', () => {
        const i = html.indexOf('id="periodTabs"');
        const tag = html.slice(i, i + 160);
        expect(tag).toContain('role="group"');
        expect(tag).toContain('aria-label="فترة الأرباح"');
        expect(html).toContain('data-period="today" aria-pressed="true"');
    });

    it('و setStatsPeriod تنقل الاختيار في الحالتين معاً', () => {
        const i = html.indexOf('function setStatsPeriod(p)');
        const blk = html.slice(i, i + 500);
        expect(blk).toContain("b.classList.toggle('active', on)");
        expect(blk).toContain("b.setAttribute('aria-pressed'");
    });

    it('شارتا العمل المنتظر مسمّاتان، وتتبع التسمية الرقم', () => {
        expect(html).toContain('id="availableCount" class="cap-count" aria-label="لا طلبات متاحة"');
        expect(html).toContain('id="missionsCount" class="cap-count" aria-label="لا مهامّ نشطة"');
        const i = html.indexOf('function renderWorkCounts()');
        const blk = html.slice(i, i + 800);
        expect(blk).toContain("el.setAttribute('aria-label'");
        expect(blk).toContain('طلب متاح');
        expect(blk).toContain('مهمّة نشطة');
    });
});

describe('شريط التنقل', () => {
    it('مسمّى والصفحة الحالية معلَّمة', () => {
        expect(html).toContain('<nav class="captain-nav" aria-label="تنقل الكابتن">');
        expect(html).toContain('class="active" aria-current="page"');
    });

    it('وأيقوناته الخمس مخفيةٌ عن القارئ — النصّ بجانبها يكفي', () => {
        const i = html.indexOf('<nav class="captain-nav"');
        const nav = html.slice(i, html.indexOf('</nav>', i));
        expect(nav.match(/<i class="bi /g) || []).toHaveLength(5);
        expect(nav.match(/aria-hidden="true"/g) || []).toHaveLength(5);
    });
});

describe('لا أيقونةَ زخرفيةٍ تُقرأ مرّتين', () => {
    it('كل <i class="bi ..."> داخل زرٍّ له نصّ مخفيّ عن القارئ', () => {
        // الأزرار ذات النصّ: الأيقونة فيها تكرارٌ صامت يُربك القراءة
        const labelled = [
            '<i class="bi bi-check2-circle" aria-hidden="true"></i> تأكيد السداد',
            '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i> تحديث الحالة',
            '<i class="bi bi-clipboard" aria-hidden="true"></i> نسخ',
            '<i class="bi bi-send-fill" aria-hidden="true"></i> إرسال إشعار السداد',
        ];
        for (const frag of labelled) expect(html).toContain(frag);
    });

    it('وزرّ النسخ له اسمٌ يصف ما يُنسخ', () => {
        expect(html).toContain('id="copyAccBtn" class="cap-copy" aria-label="نسخ رقم الحساب"');
    });
});
