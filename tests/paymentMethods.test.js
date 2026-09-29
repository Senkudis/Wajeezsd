/**
 * 💳 طرق الدفع — بنكك، ماي كاشي، فوري، أوكاش.
 *
 * ما طُلب:
 *   • التاجر عند التسجيل يختار طريقةً أو أكثر، ولكلٍّ رقم الحساب والاسم.
 *   • العميل عند الدفع للتاجر: إن كانت أكثر من طريقة «اختر طريقة الدفع»،
 *     وحين يختار تظهر بياناتها.
 *   • أيقونة كل طريقة بشكلٍ مضبوط.
 *
 * وما وُجد في الطريق: نموذج التسجيل كان يرسل اسم البنك في «bankName» والخادم
 * يقرأ «bankAccount» فيضيع؛ وشاشة العميل كانت تُدرج رقم الحساب واسمه (نصٌّ
 * يكتبه التاجر) بلا تهريب — وداخل onclick.
 */
import { describe, it, expect, beforeAll } from 'vitest';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const PM = require('../utils/paymentMethods');

let FE;
beforeAll(() => {
    const win = {};
    vm.runInNewContext(read('public_html/js/payment-methods.js'), { window: win, document: {}, navigator: {} });
    FE = win.PaymentMethods;
});

describe('القائمة', () => {
    it('الطرق الأربع بالترتيب نفسه في الخادم والواجهة', () => {
        expect(PM.METHOD_IDS).toEqual(['bankak', 'mycashi', 'fawry', 'ocash']);
        expect(FE.LIST.map(m => m.id)).toEqual(PM.METHOD_IDS);
        expect(FE.LIST.map(m => m.label)).toEqual(PM.METHOD_IDS.map(id => PM.METHODS[id].label));
    });

    it('ولكلٍّ أيقونتها في الحزمة', () => {
        for (const id of PM.METHOD_IDS) {
            const p = path.join(__dirname, '..', 'public_html', 'icons', 'payments', id + '.png');
            expect(fs.existsSync(p), id).toBe(true);
            expect(fs.statSync(p).size).toBeGreaterThan(1000);
        }
    });

    it('والنموذجان يقبلان الطرق الأربع وحدها', () => {
        for (const f of ['models/Place.js', 'models/MerchantRequest.js']) {
            expect(read(f), f).toContain("enum: ['bankak', 'mycashi', 'fawry', 'ocash']");
        }
    });

    it('🔒 وطرق الدفع خاصّةٌ بالمتجر — لا تخرج في مسارات المتاجر العامة', () => {
        expect(read('models/Place.js')).toMatch(/PLACE_PRIVATE_FIELDS = \[[\s\S]*'paymentMethods'/);
    });
});

describe('الفحص في الخادم', () => {
    const ok = (arr, o) => PM.cleanPaymentMethods(arr, o);

    it('🔑 طريقةٌ أو أكثر، بترتيب القائمة، والأرقام العربية تُوحَّد', () => {
        const r = ok([
            { method: 'ocash', accountNumber: '٠٩١٢ ٣٤٥-٦٧٨', accountName: '  أحمد   علي ' },
            { method: 'bankak', accountNumber: '1234567', accountName: 'أحمد علي' }
        ], { required: true });
        expect(r.ok).toBe(true);
        expect(r.methods.map(m => m.method)).toEqual(['bankak', 'ocash']);
        expect(r.methods[1]).toEqual({ method: 'ocash', accountNumber: '0912345678', accountName: 'أحمد علي' });
    });

    it('🔑 عند التسجيل: واحدةٌ على الأقل', () => {
        const r = ok([], { required: true });
        expect(r.ok).toBe(false);
        expect(r.field).toBe('paymentMethods');
    });

    it('الخطأ في خانة الطريقة نفسها', () => {
        expect(ok([{ method: 'fawry', accountNumber: '', accountName: 'أحمد' }]).field).toBe('paymentMethods.fawry.accountNumber');
        expect(ok([{ method: 'fawry', accountNumber: '12ab34', accountName: 'أحمد' }]).field).toBe('paymentMethods.fawry.accountNumber');
        expect(ok([{ method: 'fawry', accountNumber: '123', accountName: 'أحمد' }]).field).toBe('paymentMethods.fawry.accountNumber');
        expect(ok([{ method: 'mycashi', accountNumber: '12345', accountName: 'أ' }]).field).toBe('paymentMethods.mycashi.accountName');
    });

    it('🔒 لا طريقة غير معروفة، ولا تكرار، ولا وسومٌ في الاسم', () => {
        expect(ok([{ method: 'paypal', accountNumber: '12345', accountName: 'أحمد' }]).ok).toBe(false);
        expect(ok([
            { method: 'bankak', accountNumber: '12345', accountName: 'أحمد' },
            { method: 'bankak', accountNumber: '67890', accountName: 'أحمد' }
        ]).ok).toBe(false);
        const r = ok([{ method: 'bankak', accountNumber: '12345', accountName: '<img src=x onerror=alert(1)>أحمد علي' }]);
        expect(r.methods[0].accountName).toBe('أحمد علي');
        expect(ok('bankak').ok).toBe(false);
    });

    it('الحقول القديمة مرآةٌ لأوّل طريقة', () => {
        expect(PM.legacyMirror([{ method: 'mycashi', accountNumber: '0911', accountName: 'سارة' }]))
            .toEqual({ bankName: 'ماي كاشي', bankAccountNumber: '0911', bankAccountName: 'سارة' });
        expect(PM.legacyMirror([])).toEqual({ bankName: '', bankAccountNumber: '', bankAccountName: '' });
    });
});

describe('المتجر القديم (حسابٌ واحدٌ نصّيّ) لا يختفي عن العميل', () => {
    it('يُعرض بأقرب طريقة إن عُرفت من اسم بنكه', () => {
        expect(PM.methodsForPlace({ bankName: 'بنك الخرطوم - بنكك', bankAccountNumber: '123456', bankAccountName: 'علي' }))
            .toEqual([{ method: 'bankak', label: 'بنكك', accountNumber: '123456', accountName: 'علي' }]);
    });

    it('وإلا «حساب بنكي» باسم بنكه', () => {
        const r = PM.methodsForPlace({ bankName: 'بنك النيل', bankAccountNumber: '99887' });
        expect(r[0]).toMatchObject({ method: 'bank', label: 'بنك النيل', accountNumber: '99887' });
    });

    it('والجديد يُقدَّم على القديم', () => {
        const r = PM.methodsForPlace({
            bankName: 'بنك النيل', bankAccountNumber: '1',
            paymentMethods: [{ method: 'fawry', accountNumber: '5555', accountName: 'منى' }]
        });
        expect(r).toEqual([{ method: 'fawry', label: 'فوري', accountNumber: '5555', accountName: 'منى' }]);
        expect(PM.methodsForPlace(null)).toEqual([]);
    });

    it('تخمين الطريقة نفسه في الخادم والواجهة', () => {
        for (const s of ['بنكك', 'بنك الخرطوم', 'ماي كاشي', 'MyCashi', 'فوري', 'أوكاش', 'O-Cash', 'بنك أمدرمان الوطني', 'بنك النيل', '']) {
            expect(FE.guessMethod(s), s).toBe(PM.guessMethod(s));
        }
    });

    it('وتنظيف الرقم نفسه', () => {
        expect(FE.cleanNumber('٠٩١٢ ٣٤٥-٦٧٨')).toBe('0912345678');
    });

    it('خطأ الخادم يُحوَّل إلى خانته في النموذج', () => {
        expect(FE.inputFor('paymentMethods.ocash.accountNumber')).toBe('pm-ocash-num');
        expect(FE.inputFor('paymentMethods.bankak.accountName')).toBe('pm-bankak-name');
        expect(FE.inputFor('phone')).toBe(null);
    });
});

describe('المسارات', () => {
    const reqs = read('routes/merchantRequests.js');
    const merchant = read('routes/merchant.js');

    it('🔑 التسجيل يقبل paymentMethods ويفحصها — والقديم (موقع الإحالة) يبقى مقبولاً', () => {
        expect(reqs).toContain('PM.cleanPaymentMethods(req.body.paymentMethods, { required: true })');
        expect(reqs).toContain('bankAccount, bankAccountNumber, bankAccountOwner, paymentMethods, logoImage');
    });

    it('🔑 وإصلاح اسم البنك الضائع (bankName ← bankAccount)', () => {
        expect(reqs).toContain('else if (!bankAccount && req.body.bankName)');
    });

    it('القبول ينسخ الطرق إلى المتجر', () => {
        expect(reqs).toContain('paymentMethods: request.paymentMethods || [],');
    });

    it('التاجر يعدّلها من ملفّه — والنسخ القديمة بالحقول القديمة', () => {
        expect(merchant).toContain('if (req.body.paymentMethods !== undefined) {');
        expect(merchant).toContain('Object.assign(place, PM.legacyMirror(pm.methods));');
    });

    it('العميل يستلم كل طرق المتجر مع طلبه', () => {
        const o = read('routes/orders.js');
        expect(o).toContain(".populate('place', 'name address bankAccountName bankAccountNumber bankName paymentMethods')");
        expect(o).toContain("paymentMethods: require('../utils/paymentMethods').methodsForPlace(so.place),");
    });

    it('والتسويات تعرضها للأدمن', () => {
        expect(read('routes/merchant-erp.js')).toContain('s.placeId.paymentMethodsView = methodsForPlace(s.placeId)');
    });
});

describe('الواجهات', () => {
    it('🔑 التسجيل: بطاقات الطرق بدل قائمة البنوك، والفحص قبل الإرسال', () => {
        const s = read('public_html/client-register-shop.html');
        expect(s).toContain('src="js/payment-methods.js');
        expect(s).toContain("PaymentMethods.renderPicker(document.getElementById('fPaymentMethods'))");
        expect(s).toContain("PaymentMethods.readPicker(document.getElementById('fPaymentMethods')).errors");
        expect(s).not.toContain('id="fBankName"');
    });

    it('🔑 العميل: «اختر طريقة الدفع» حين تتعدّد، والبيانات عند الاختيار', () => {
        const js = read('public_html/js/payment-methods.js');
        expect(js).toContain('اختر طريقة الدفع');
        expect(js).toContain('role="radiogroup"');
        expect(js).toContain("slot.innerHTML = detailHtml(box._pmMethods[i])");
        // طريقةٌ واحدة: البيانات مباشرة بلا اختيار
        expect(js).toContain("if (methods.length === 1)");
    });

    it('🔒 العميل: لا نصّ تاجرٍ بلا تهريب — ولا onclick بالرقم', () => {
        const s = read('public_html/client-my-orders.html');
        expect(s).not.toContain("navigator.clipboard.writeText('${order.bankInfo.account}')");
        expect(s).toContain('data-pm="${encodeURIComponent(JSON.stringify(payMethodsOf(order)))}"');
        expect(s).toContain('hydratePaymentSlots(list);');
        const js = read('public_html/js/payment-methods.js');
        expect(js).toContain("'<div class=\"pm-v pm-num\" dir=\"ltr\">' + esc(pm.accountNumber)");
    });

    it('ملفّ التاجر والإدارة', () => {
        expect(read('public_html/merchant-profile.html')).toContain('PaymentMethods.renderPicker(document.getElementById(\'fPaymentMethods\'), { value: PaymentMethods.fromPlace(place) })');
        expect(read('public_html/admin-merchant-requests.html')).toContain("id=\"dPayMethods\"");
        expect(read('public_html/admin-settlements.html')).toContain('PaymentMethods.summaryHtml(pms)');
    });

    it('بلا رموز تعبيرية في الوحدة', () => {
        expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(read('public_html/js/payment-methods.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))).toBe(false);
    });
});
