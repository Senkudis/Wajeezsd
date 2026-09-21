/**
 * 💰 السعر يتبع المشوار — لا يتجمّد عند أوّل قطاع.
 *
 * العطل كما أبلغ عنه المستخدم: «رفعت طلبات متعددة بس الأسعار ما ظبطت،
 * جاني سعر المشوار الأول بس وباقي النقاط ما اتحسبت».
 *
 * والسبب لم يكن في الحساب — utils/tripPricing يجمع كل القطاعات، والخادم
 * يمرّر له stops كاملة. السبب راية `isPriceManuallyEdited`: تلتصق عند أوّل
 * لمسةٍ لحقل السعر، و`calculatePrice` تخرج فوراً إن كانت مرفوعة. وكان
 * `removeStop` وحده يُصفّرها — أما إضافة وجهة فلا. فمن يضبط نقطتين ثم
 * يعدّل السعر ثم يضيف وجهةً ثالثة، يبقى معه سعر المشوار الأوّل.
 *
 * والسعر هنا ميزانية المشوار لا رأياً فيه: المستخدم يضيف الوجهة ليرى كم
 * ستكلّفه. فكل تغيّرٍ في هندسة المشوار يُعيد الحساب.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const home = fs.readFileSync(path.join(__dirname, '..', 'public_html', 'js', 'home.js'), 'utf8');

describe('🔴 كل تغيّرٍ في المشوار يُعيد حساب السعر', () => {
    it('تأكيد موقعٍ على الخريطة يمرّ بـ onTripChanged لا بـ calculatePrice مباشرة', () => {
        // النقطة الإضافية تُحدَّد من نفس نافذة الخريطة، فهذا هو المسار
        const i = home.indexOf('window.closeMapUI();');
        expect(i).toBeGreaterThan(0);
        const blk = home.slice(i - 400, i);
        expect(blk).toContain('onTripChanged()');
    });

    it('وحذف نقطة كذلك', () => {
        const i = home.indexOf('window.removeStop = function');
        const blk = home.slice(i, i + 300);
        expect(blk).toContain('onTripChanged()');
    });

    it('🔴 و onTripChanged يُصفّر راية التعديل اليدوي', () => {
        // بدون التصفير يخرج calculatePrice فوراً ويبقى سعر المشوار الأوّل
        const i = home.indexOf('function onTripChanged');
        const blk = home.slice(i, home.indexOf('\n}', i));
        expect(blk).toContain('isPriceManuallyEdited = false');
        expect(blk).toContain('calculatePrice()');
    });

    it('ولا يُعاد الحساب بنقطةٍ واحدة — لا مشوار بعد', () => {
        const i = home.indexOf('function onTripChanged');
        const blk = home.slice(i, home.indexOf('\n}', i));
        expect(blk).toContain('pts.length < 2');
    });
});

describe('الحساب يشمل كل القطاعات', () => {
    it('getPriceLimits يجمع ما بين كل محطّتين متتاليتين', () => {
        const i = home.indexOf('function getPriceLimits');
        const blk = home.slice(i, home.indexOf('\n}', i));
        expect(blk).toContain('for (let i = 1; i < pts.length; i++)');
        expect(blk).toContain('distanceKm +=');
    });

    it('ويحتسب رسم النقاط الإضافية', () => {
        const i = home.indexOf('function getPriceLimits');
        const blk = home.slice(i, home.indexOf('\n}', i));
        expect(blk).toContain('extraStopFee * extraStops');
        expect(blk).toContain('Math.max(0, pts.length - 2)');
    });

    it('ونصّ التلميح في موضعٍ واحد — لا نسختان تتباعدان', () => {
        expect(home).toContain('function updatePriceHint');
        const calc = home.slice(home.indexOf('function calculatePrice'), home.indexOf('function previewImage'));
        expect(calc).toContain('updatePriceHint(limits)');
        expect(calc).not.toContain('السعر التقديري:');
    });
});
