/**
 * 📞 البند 8 — الخادم يفحص الهاتف كما تفحصه الواجهة.
 *
 * كانت الواجهة وحدها تفحص الرقم (public_html/js/field-errors.js)، والخادم
 * يقبل ما يصله: نسخةٌ قديمة من التطبيق أو طلبٌ مباشر يُدخل «123» أو «-»
 * فيصل الكابتن رقمٌ لا يُتّصل به. الآن يُرفض في خانته برسالة الواجهة نفسها،
 * والمقبول يُحفظ بالصيغة المحلية 0912345678.
 */
import { describe, it, expect, beforeAll } from 'vitest';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const phone = require('../utils/phoneNormalizer');
const { validateOrder } = require('../middleware/validateMiddleware');

let SudanPhone;
beforeAll(() => {
    const win = {};
    vm.runInNewContext(read('public_html/js/field-errors.js'), { window: win, document: {}, localStorage: { getItem: () => null } });
    SudanPhone = win.SudanPhone;
});

/** يشغّل validateOrder ويعيد { status, body } أو { next: true, body: req.body } */
function run(body) {
    const req = { body };
    let out = null;
    const res = {
        status(code) { out = { status: code }; return this; },
        json(b) { out.body = b; return this; }
    };
    validateOrder(req, res, () => { out = { next: true, body: req.body }; });
    return out;
}

const base = () => ({
    pickup: { address: 'الخرطوم 2', contactName: 'علي', contactPhone: '0912345678', lat: 15.6, lng: 32.5 },
    dropoff: { address: 'الرياض', receiverName: 'أحمد', receiverPhone: '0923456789', lat: 15.58, lng: 32.57 },
    price: 3000, distanceType: 'custom'
});

describe('الحكم نفسه في الخادم والواجهة', () => {
    const samples = ['', '-', '0912', '912345678', '0912345678', '+249 91 234 5678', '00249912345678',
        '٠٩١٢٣٤٥٦٧٨', '09123456789', '0812345678', '123', '0000000000', '+966501234567'];

    it('phoneProblem مرآة SudanPhone.problem', () => {
        for (const p of samples) expect(phone.phoneProblem(p), p).toBe(SudanPhone.problem(p));
    });

    it('toLocalPhone مرآة SudanPhone.toLocal', () => {
        for (const p of samples) expect(phone.toLocalPhone(p), p).toBe(SudanPhone.toLocal(p));
    });

    it('نصّ الرسالة هو نصّ الواجهة', () => {
        const home = read('public_html/js/home.js');
        for (const pr of ['empty', 'short', 'invalid']) {
            const msg = phone.phoneMessage('المستلم', pr).replace('المستلم', '${who}');
            expect(home).toContain(msg);
        }
    });
});

describe('الطلب — POST /api/orders', () => {
    it('طلبٌ سليم يمرّ، والأرقام بالصيغة المحلية', () => {
        const b = base();
        b.pickup.contactPhone = '+249 91 234 5678';
        b.dropoff.receiverPhone = '٠٩٢٣٤٥٦٧٨٩';
        const r = run(b);
        expect(r.next).toBe(true);
        expect(r.body.pickup.contactPhone).toBe('0912345678');
        expect(r.body.dropoff.receiverPhone).toBe('0923456789');
    });

    it('هاتف المرسل الناقص يُرفض في خانته', () => {
        const b = base(); b.pickup.contactPhone = '0912';
        const r = run(b);
        expect(r.status).toBe(400);
        expect(r.body.field).toBe('pickup.contactPhone');
        expect(r.body.message).toContain('ناقص');
    });

    it('هاتف المستلم غير الصالح يُرفض في خانته', () => {
        const b = base(); b.dropoff.receiverPhone = '0000000000';
        const r = run(b);
        expect(r.status).toBe(400);
        expect(r.body.field).toBe('dropoff.receiverPhone');
        expect(r.body.message).toBe('رقم هاتف المستلم غير صحيح — اكتبه هكذا: 0912345678');
    });

    it('«اشترِ لي»: هاتف المحل «-» يمرّ كما هو — والمستلم يُفحص', () => {
        const b = base(); b.orderType = 'errand'; b.pickup.contactPhone = '-';
        const ok = run(b);
        expect(ok.next).toBe(true);
        expect(ok.body.pickup.contactPhone).toBe('-');
        b.dropoff.receiverPhone = '123';
        expect(run(b).body.field).toBe('dropoff.receiverPhone');
    });

    it('طلب المتجر: هاتف الاستلام يُشتقّ في الخادم — لا يُطلب', () => {
        const b = base(); b.orderType = 'shop'; delete b.pickup.contactPhone; delete b.pickup.contactName;
        expect(run(b).next).toBe(true);
    });

    it('هاتف المحطة اختياريّ — والمكتوب منه يُفحص ويُوحَّد', () => {
        const b = base();
        b.stops = [
            { type: 'pickup', address: 'أ', contactPhone: '' },
            { type: 'dropoff', address: 'ب', contactPhone: '+249923456789' }
        ];
        const ok = run(b);
        expect(ok.next).toBe(true);
        expect(ok.body.stops[1].contactPhone).toBe('0923456789');
        b.stops[0].contactPhone = '555';
        const bad = run(b);
        expect(bad.status).toBe(400);
        expect(bad.body.field).toBe('stops');
        expect(bad.body.message).toContain('المحطة 1');
    });
});

describe('طلب المتجر — POST /api/merchant/shop/:placeId/order', () => {
    const m = read('routes/merchant.js');
    const route = m.slice(m.indexOf("router.post('/shop/:placeId/order'"), m.indexOf("const place = await Place.findById(req.params.placeId);", m.indexOf("router.post('/shop/:placeId/order'")));

    it('الاسم والهاتف يُفحصان قبل أيّ استعلام، في خانتيهما', () => {
        expect(route).toContain("field: 'dropoff.receiverName'");
        expect(route).toContain("phoneMessage('المستلم', p), field: 'dropoff.receiverPhone'");
        expect(route).toContain('dropoff.receiverPhone = toLocalPhone(dropoff.receiverPhone)');
    });

    it('والواجهة تعرض خطأ الخادم في خانته', () => {
        expect(read('public_html/shop-detail.html')).toContain("'dropoff.receiverPhone': 'receiverPhone'");
    });
});

describe('طلب انضمام المتجر', () => {
    const r = read('routes/merchantRequests.js');

    it('رقم المتجر يُفحص عند الطلب وعند تعديل الأدمن', () => {
        expect(r).toContain("phoneMessage('المتجر', phoneErr), field: 'phone'");
        expect(r).toContain('const phone = toLocalPhone(req.body.phone)');
        expect(r).toContain('request.phone = toLocalPhone(phone)');
    });

    it('والنموذج يعرض خطأ الخادم تحت خانة الهاتف', () => {
        const page = read('public_html/client-register-shop.html');
        // الخانة من الخادم ← خانة النموذج: الهاتف، أو خانة طريقة دفع (js/payment-methods.js)
        expect(page).toContain("const fieldInput = errField === 'phone' ? 'fPhone'");
        expect(page).toContain('FieldErrors.show(fieldInput, errMsg)');
    });
});
