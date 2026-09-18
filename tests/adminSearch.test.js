/**
 * 🔎 البحث في لوحة الإدارة.
 *
 * الشكوى: «مرّات إلّا أكتب 91234 بدون الصفر، وبالإيميل ما شغّال».
 *
 * السبب: كل صفحةٍ تكتب فلترها بيدها، وكلّها تفعل الشيء نفسه:
 *     (u.phone || '').includes(q)
 *
 * وهذا معطوبٌ ثلاث مرّات دفعةً واحدة:
 *   ١) الهاتف يُخزَّن 249XXXXXXXXX، فـ `0912345678` لا تطابق شيئاً أبداً.
 *      الصيغة الوحيدة التي تعمل مصادفةً هي إسقاط الصفر.
 *   ٢) البريد لا يُبحَث فيه إطلاقاً — لا في الخادم ولا في أي صفحة.
 *   ٣) الاسم العربي يُطابَق حرفياً: «احمد» لا تجد «أحمد».
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const A = require('../public_html/js/admin-search.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('📞 الهاتف: كل الصيغ تصل إلى صاحبها', () => {
    const stored = { phone: '249912345678', name: 'محمد', email: 'm@x.com' };

    it('🔑 الصيغة المحلّية بالصفر — وهي التي كانت تفشل دائماً', () => {
        expect(A.matches('0912345678', stored)).toBe(true);
    });

    it('وبلا صفر، وبرمز الدولة، وبعلامة +، وبمسافات', () => {
        for (const q of ['912345678', '249912345678', '+249912345678', '+249 91 234 5678', '00249912345678']) {
            expect(A.matches(q, stored), q).toBe(true);
        }
    });

    it('والأرقام العربية‑الهندية', () => {
        expect(A.matches('٠٩١٢٣٤٥٦٧٨', stored)).toBe(true);
    });

    it('البحث أثناء الكتابة يجد قبل اكتمال الرقم', () => {
        expect(A.matches('91234', stored)).toBe(true);
    });

    it('🔒 ورقمٌ آخر لا يطابق — التطبيع لا يعني التساهل', () => {
        expect(A.matches('0999999999', stored)).toBe(false);
    });
});

describe('📧 البريد', () => {
    it('🔑 يُبحَث فيه — لم يكن يُبحَث إطلاقاً', () => {
        expect(A.matches('diaa@x.com', { email: 'Diaa@X.com' })).toBe(true);
        expect(A.matches('diaa', { email: 'diaa@x.com' })).toBe(true);
    });
});

describe('🔤 الاسم العربي', () => {
    it('🔑 صور الألف والياء والتاء المربوطة تتساوى', () => {
        expect(A.matches('احمد', { name: 'أحمد علي' })).toBe(true);
        expect(A.matches('فاطمه', { name: 'فاطمة' })).toBe(true);
        expect(A.matches('يحيى', { name: 'يحيي' })).toBe(true);
    });

    it('والتشكيل والتطويل لا يمنعان', () => {
        expect(A.matches('محمد', { name: 'مُحَمَّد' })).toBe(true);
        expect(A.matches('محمد', { name: 'محـــمد' })).toBe(true);
    });

    it('ولا يطابق اسماً مختلفاً', () => {
        expect(A.matches('خالد', { name: 'أحمد' })).toBe(false);
    });
});

describe('🛡️ تهريب المُدخَل', () => {
    it('المحارف الخاصّة تُهرَّب قبل بناء النمط', () => {
        expect(A.escapeRegex('a+b.c(')).toBe(String.raw`a\+b\.c\(`);
    });

    it('🔑 ولا يُسقط استعلامٌ يحوي محرفاً خاصّاً المطابقةَ', () => {
        expect(() => A.matches('a+b', { name: 'a+b' })).not.toThrow();
        expect(A.matches('a+b', { name: 'xa+by' })).toBe(true);
    });
});

describe('🔗 الخادم يستعمل المصدر نفسه', () => {
    const src = read('routes/admin/users.js');
    const route = src.slice(src.indexOf("router.get('/users/search'"));

    it('يستورد الوحدة المشتركة لا ينسخ منطقها', () => {
        expect(route).toContain("require('../../public_html/js/admin-search')");
    });

    it('🔑 يبحث في البريد', () => {
        expect(route).toMatch(/\{ email: \{ \$regex/);
    });

    it('🔑 ويطابق جوهر الرقم لا نصّه الخام', () => {
        expect(route).toContain('AdminSearch.phoneCore(q)');
    });

    it('🛡️ ولا يحقن q خاماً في $regex', () => {
        expect(route).toContain('AdminSearch.escapeRegex(q)');
        expect(route).not.toMatch(/\$regex: q\b/);
    });

    it('ولا يُرسي على نهاية الرقم — يكسر البحث أثناء الكتابة', () => {
        expect(route).not.toMatch(/escapeRegex\(core\) \+ '\$'/);
    });
});

describe('🧹 لا فلاتر خام باقية في صفحات الإدارة', () => {
    const files = [
        'public_html/js/admin-panel.js',
        'public_html/js/admin-live-map.js',
        'public_html/admin-merchants-list.html',
        'public_html/admin-debt-history.html',
        'public_html/admin-finance.html'
    ];

    it('🔑 اختفى النمط المعطوب (phone).includes(q)', () => {
        for (const f of files) {
            const code = read(f).split('\n')
                .filter(l => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*'); })
                .join('\n');
            expect(code, f).not.toMatch(/phone \|\| ''\)\.?(toLowerCase\(\)\.)?includes\(/);
        }
    });

    it('وكلّها تُحمّل الوحدة', () => {
        for (const f of ['public_html/admin.html', 'public_html/admin-live-map.html',
                         'public_html/admin-merchants-list.html', 'public_html/admin-debt-history.html',
                         'public_html/admin-finance.html']) {
            expect(read(f), f).toContain('js/admin-search.js');
        }
    });
});
