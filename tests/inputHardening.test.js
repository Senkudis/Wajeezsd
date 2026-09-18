/**
 * ⌨️ تقويم الإدخال في الحقول العامّة.
 *
 * العطل الجذري — وهو صامتٌ تماماً:
 *   لوحة المفاتيح العربية تكتب ٠١٢٣، و utils/phoneNormalizer ينظّف بـ
 *   [^0-9] فيُسقط تلك الأرقام إسقاطاً كاملاً:
 *
 *       normalizePhone('٠٩١٢٣٤٥٦٧٨')  →  '249'
 *
 *   فيُسجَّل الحساب بالرقم '249': لا يصله رمز تحقّق، ولا يستطيع الدخول،
 *   ويصطدم بفهرس الهاتف الفريد مع كل من وقع في الفخ نفسه. ولا خطأ يُرى.
 *
 * والمخطّط كان يقيس الطول وحده (6–20)، فيقبل ذلك ويقبل رقماً زائداً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const normalizePhone = require('../utils/phoneNormalizer');
const { isValidSudanPhone, foldDigits } = require('../utils/phoneNormalizer');

describe('📞 التطبيع يفهم الأرقام العربية', () => {
    it('🔑 الرقم المكتوب بلوحة عربية يصل سليماً — كان يصير 249', () => {
        expect(normalizePhone('٠٩١٢٣٤٥٦٧٨')).toBe('249912345678');
    });

    it('والفارسية كذلك', () => {
        expect(normalizePhone('۰۹۱۲۳۴۵۶۷۸')).toBe('249912345678');
    });

    it('ولم تتغيّر نتائج الصيغ اللاتينية', () => {
        expect(normalizePhone('0912345678')).toBe('249912345678');
        expect(normalizePhone('+249 91 234 5678')).toBe('249912345678');
        expect(normalizePhone('249912345678')).toBe('249912345678');
    });

    it('foldDigits مكشوفة للاستعمال المشترك', () => {
        expect(foldDigits('٥٠٠')).toBe('500');
    });
});

describe('✅ الحَكَم على صحّة الرقم', () => {
    it('يقبل المحمول السوداني بصيغه', () => {
        for (const p of ['0912345678', '0112345678', '٠٩١٢٣٤٥٦٧٨', '+249912345678']) {
            expect(isValidSudanPhone(p), p).toBe(true);
        }
    });

    it('🔑 ويرفض ما كان يُخزَّن بلا اعتراض', () => {
        expect(isValidSudanPhone('abc')).toBe(false);        // كان يصير '249'
        expect(isValidSudanPhone('09123456789')).toBe(false); // كان يصير 13 رقماً
        expect(isValidSudanPhone('')).toBe(false);
        expect(isValidSudanPhone('0812345678')).toBe(false);  // بادئة غير موجودة
    });
});

describe('🚪 المخطّط يرفض عند الباب', () => {
    const { registerSchema } = require('../schemas/authSchema');
    const base = { name: 'أحمد', email: 'a@b.com', password: '123456' };
    const parse = (phone) => registerSchema.safeParse({ ...base, phone });

    it('🔑 رقمٌ بأرقام عربية يُقبل ويُطبَّع', () => {
        expect(parse('٠٩١٢٣٤٥٦٧٨').success).toBe(true);
    });

    it('🔑 ورقمٌ فاسد يُرفض برسالة مفهومة بدل حسابٍ ميت', () => {
        const r = parse('09123456789');
        expect(r.success).toBe(false);
        expect(r.error.issues[0].message).toContain('0912345678');
    });
});

describe('⌨️ مقوّم الإدخال في الواجهة', () => {
    const src = read('public_html/js/input-hardener.js');

    it('🔑 يطوي الأرقام في حقول الأرقام وحدها', () => {
        expect(src).toContain('isNumericField');
        expect(src).toMatch(/NUMERIC_TYPES = \['tel', 'number'\]/);
    });

    it('🔑 ويحفظ موضع المؤشر — الاستبدال حرفٌ بحرف', () => {
        expect(src).toContain('selectionStart');
        expect(src).toContain('setSelectionRange');
    });

    it('يضبط dir=ltr للهاتف والبريد ولا يمسّ النصّ العادي', () => {
        expect(src).toMatch(/LTR_TYPES\s+= \['tel', 'number', 'email', 'url', 'password'\]/);
    });

    it('يقصّ المسافات عند الخروج ويستثني كلمة المرور', () => {
        expect(src).toContain("el.type === 'password'");
        expect(src).toContain('el.value.trim()');
    });

    it('يشمل الحقول المُضافة بعد التحميل', () => {
        expect(src).toContain('MutationObserver');
    });

    it('🔗 ومحمَّل في كل صفحة تُحمّل app-core', () => {
        const pages = fs.readdirSync(path.join(__dirname, '..', 'public_html'))
            .filter(f => f.endsWith('.html'))
            .filter(f => read(`public_html/${f}`).includes('js/app-core.js'));
        expect(pages.length).toBeGreaterThan(20);
        for (const f of pages) {
            expect(read(`public_html/${f}`), f).toContain('js/input-hardener.js');
        }
    });
});
