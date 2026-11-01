/**
 * 📒 كل حركة تغيّر رصيد الكابتن تترك أثراً في السجل المالي.
 *
 * ثلاثة مسارات كانت تصفّر الدين أو تنقصه بلا أثر:
 *   • الموافقة على سداد الكابتن — لا في كشف الحساب ولا في سجل النشاط.
 *   • تعديل الرصيد مباشرة من صفحة المستخدم — يُحفظ ولا يُسجَّل.
 *   • كشف الحساب نفسه كان يقصّ الدمج على 100، فمئة عمولة بعد تصفيرٍ تُخفيه.
 * وdeductedAmount كان يُكتب على طلب السداد ولا يُحفظ: لم يكن في المخطّط.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

describe('طلب السداد يحفظ أثره على الرصيد', () => {
    const PaymentRequest = require('../models/PaymentRequest');

    it('الحقول التي تكتبها الموافقة موجودة في المخطّط (لا يُسقطها Mongoose)', () => {
        const doc = new PaymentRequest({ captainId: '507f1f77bcf86cd799439011', amount: 500, transactionId: 'T1',
            deductedAmount: 400, appliedAmount: 300, balanceBefore: -300, balanceAfter: 0 });
        expect(doc.deductedAmount).toBe(400);
        expect(doc.appliedAmount).toBe(300);
        expect(doc.balanceBefore).toBe(-300);
        expect(doc.balanceAfter).toBe(0);
    });
});

describe('مسارات الإدارة المالية', () => {
    const finance = read('routes', 'admin', 'finance.js');
    const approve = finance.slice(finance.indexOf("router.put('/payment-requests/:id/approve'"), finance.indexOf("router.put('/payment-requests/:id/reject'"));
    const ledger = finance.slice(finance.indexOf("router.get('/ledger'"), finance.indexOf('// ⚙️ الجزء الخامس'));

    it('الموافقة على السداد تحفظ المخصوم فعلاً وتكتب في سجل النشاط', () => {
        expect(approve).toContain('appliedAmount: actualDeduction');
        expect(approve).toContain("logAdminAction(req, 'approve_payment'");
    });

    it('الرفض يُسجَّل في سجل النشاط', () => {
        expect(finance).toContain("logAdminAction(req, 'reject_payment'");
    });

    it('كشف الحساب يشمل السدادات المقبولة', () => {
        expect(ledger).toContain("status: 'approved'");
        expect(ledger).toContain('paymentEntries');
    });

    it('كشف الحساب لا يقصّ الدمج — العمولات لا تُخرج التصفير من الكشف', () => {
        expect(ledger).not.toMatch(/\.slice\(0,\s*100\)/);
    });

    it('واجهة الكشف تعرف أنواع السداد', () => {
        const ui = read('public_html', 'admin-finance.html');
        expect(ui).toContain("payment:      { label: 'سداد كابتن'");
        expect(ui).toContain("payment_zero: { label: 'سداد وتصفير'");
    });
});

describe('تعديل الرصيد من صفحة المستخدم', () => {
    const users = read('routes', 'admin', 'users.js');

    it('يُسجَّل كتعديل مديونية وفي سجل النشاط', () => {
        expect(users).toContain("require('../../models/DebtAdjustment').create(");
        expect(users).toMatch(/balanceAfter !== balanceBefore/);
    });
});

describe('💵 سجل إيداعات الكباتن', () => {
    const finance = read('routes', 'admin', 'finance.js');
    const route = finance.slice(finance.indexOf("router.get('/deposits'"), finance.indexOf('// ⚙️ الجزء الخامس'));

    it('مسارٌ محميّ بصلاحية المالية، ومقيّد بمدن الأدمن المساعد', () => {
        expect(route).toContain("requireAnyPermission(['view_finance', 'manage_finance'])");
        expect(route).toContain('scopedUserIds(req');
    });

    it('يعيد المخصوم فعلاً والرصيد قبل وبعد ومن راجع', () => {
        for (const k of ['applied:', 'balanceBefore:', 'balanceAfter:', 'reviewedBy:', 'totalApplied:']) expect(route).toContain(k);
    });

    it('للصفحة تبويبٌ يقرؤه', () => {
        const ui = read('public_html', 'admin-finance.html');
        expect(ui).toContain("switchTab('deposits', this)");
        expect(ui).toContain('/api/admin/deposits?');
    });
});
