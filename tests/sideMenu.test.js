/**
 * 🧭 القائمة الجانبية — مفروزةً ومقروءة.
 *
 * البلاغ: الشكل العام، وسهولة الكلمات، والفرز.
 *
 * وما كان: ثماني وصلاتٍ في كومةٍ واحدة — حسابٌ ودعمٌ ودعايةٌ وسياسةُ
 * خصوصية بلا فاصل — ولكلٍّ أيقونةٌ بلونٍ مختلف. ثمانيةُ ألوانٍ لا يحمل
 * أيٌّ منها معنى، واللونُ حين لا يعني شيئاً ضجيجٌ يوقف العين عند كل سطر.
 * وفيها كلماتٌ لا تُقال: «بوابات أخرى»، و«انضم كتاجر (سجل متجرك)» تشرح
 * نفسها مرّتين، و«دخول المسؤول» بلونٍ أحمر أمام كل عميل ولا شأن له به.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const root = (...p) => path.join(__dirname, '..', ...p);
const page = fs.readFileSync(root('public_html', 'index.html'), 'utf8');
const css = fs.readFileSync(root('public_html', 'css', 'enhanced-styles.css'), 'utf8');
const dark = fs.readFileSync(root('public_html', 'css', 'dark-mode.css'), 'utf8');

const menu = page.slice(page.indexOf('id="sideMenu"'), page.indexOf('function updateMenuState'));
// التعليقات تشرح ما حُذف فتذكر ألفاظه — تُنزع قبل فحص الكلمات
const words = menu.replace(/<!--[\s\S]*?-->/g, '');

describe('الفرز: مجموعاتٌ معنونة لا كومة', () => {
    it('أربع مجموعات بعناوينها', () => {
        for (const g of ['حسابي', 'اشتغل معانا', 'مساعدة', 'عن وجيز']) {
            expect(menu).toContain(`class="wj-menu-group">${g}<`);
        }
    });

    it('وكلٌّ في مجموعته: الطلبات مع الحساب، والمتجر مع العمل', () => {
        const at = s => menu.indexOf(s);
        expect(at('>حسابي<')).toBeLessThan(at('client-my-orders.html'));
        expect(at('client-my-orders.html')).toBeLessThan(at('>اشتغل معانا<'));
        expect(at('>اشتغل معانا<')).toBeLessThan(at('client-register-shop.html'));
        expect(at('client-register-shop.html')).toBeLessThan(at('>مساعدة<'));
        expect(at('>مساعدة<')).toBeLessThan(at('client-complaint.html'));
    });

    it('🔴 ودخول المسؤول ليس بين وصلات العميل', () => {
        const admin = menu.indexOf('admin-login.html');
        expect(admin).toBeGreaterThan(0);
        expect(admin).toBeGreaterThan(menu.indexOf('privacy-policy.html'));
        // ولا يُصرخ به بالأحمر
        const row = menu.slice(admin - 200, admin + 200);
        expect(row).toContain('text-muted');
    });
});

describe('الكلمات: قصيرةٌ تُقال', () => {
    it('لا «بوابات أخرى» — لا أحد يقولها', () => {
        expect(words).not.toContain('بوابات أخرى');
    });

    it('ولا شرحٌ مكرّرٌ بين قوسين', () => {
        expect(words).not.toContain('انضم كتاجر (سجل متجرك)');
        expect(words).toContain('سجّل متجرك');
    });

    it('والألفاظ المختصرة حلّت محلّ الطويلة', () => {
        expect(words).toContain('> طلباتي');
        expect(words).toContain('> شارك وجيز');
        expect(words).toContain('> شرح التطبيق');
        expect(words).not.toContain('شارك التطبيق مع أصحابك');
        expect(words).not.toContain('إعادة الجولة التعريفية');
    });

    it('🔤 و«الشكاوى» بألفها المقصورة', () => {
        expect(words).toContain('الدعم والشكاوى');
        expect(words).not.toContain('الشكاوي');
    });
});

describe('الشكل: لونٌ واحد للأيقونات', () => {
    it('لا لونَ بوتستراب على أيقونات القائمة', () => {
        const items = menu.match(/<i class="bi [^"]*"><\/i>/g) || [];
        expect(items.length).toBeGreaterThan(8);
        for (const i of items) {
            expect(i, `أيقونةٌ ما زالت ملوّنة: ${i}`).not.toMatch(/text-(primary|success|danger|warning|info|secondary)/);
        }
    });

    it('واللون يأتي من ورقة الأنماط', () => {
        expect(css).toContain('.wj-menu .list-group-item i');
        expect(css).toContain('.wj-menu-group');
    });
});

describe('🌙 الوضع الليلي لا يُفسد ما صُحّح', () => {
    it('زرّ الإغلاق الأبيض لا يُقلَب ولا يُلبَس خلفية', () => {
        // القاعدتان معاً كانتا تُخرجانه مربّعاً رمادياً فوق الترويسة الخضراء
        expect(dark).not.toMatch(/body\.dark-mode \.btn-close \{/);
        expect(dark).toContain('.btn-close:not(.btn-close-white)');
    });

    it('و«تسجيل الخروج» يبقى أحمر في الوضعين', () => {
        expect(dark).toContain('.wj-menu .list-group-item.text-danger');
    });
});

describe('ما تعتمد عليه الشيفرة باقٍ', () => {
    it('المعرّفات التي يقلّبها updateMenuState لم تسقط', () => {
        for (const id of ['menu-username', 'menu-login-btn', 'menu-logout-btn',
                          'menu-delete-account-btn', 'menu-replay-tour']) {
            expect(menu, `سقط المعرّف ${id}`).toContain(`id="${id}"`);
        }
    });

    it('وكل وصلةٍ تشير إلى صفحةٍ موجودة', () => {
        const hrefs = [...menu.matchAll(/href="([a-z0-9-]+\.html)"/g)].map(m => m[1]);
        expect(hrefs.length).toBeGreaterThan(5);
        for (const h of new Set(hrefs)) {
            expect(fs.existsSync(root('public_html', h)), `صفحةٌ مفقودة: ${h}`).toBe(true);
        }
    });
});
