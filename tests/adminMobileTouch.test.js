/**
 * 📱 صفحات الإدارة على الهاتف — «ما بتستجيب للمس وما متناسقة».
 *
 * قيست الصفحات السبع والعشرون على شاشة 375 بكسل بلمسٍ حقيقيّ (puppeteer
 * touchscreen). ما وُجد وأُصلح:
 *   • لوحة التحكم: القائمة الجانبية تفتح بلا خلفية فلا يغلقها اللمس خارجها،
 *     وفتح قسمٍ «يغلقها» بتبديلٍ يفتحها إن كانت مغلقة.
 *   • الإحصاءات: زرّ القائمة يبدّل «active» والأنماط تنتظر «show» — لا يفعل شيئاً.
 *   • التكبير بإصبعين معطّل في 23 صفحة (user-scalable=no).
 *   • أهداف لمسٍ دون 44 بكسل: التصدير 28×30، القائمة 29×34، التبويبات 29.
 *   • ترويسةٌ تلتفّ أدواتها لسطرٍ ثانٍ، وزرٌّ عائم يغطّي المحتوى، وبطاقات
 *     إحصاء بعناوين 10 بكسل، ونصٌّ رماديّ على بطاقاتٍ ملوّنة.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const adminPages = fs.readdirSync(path.join(__dirname, '..', 'public_html')).filter(f => /^admin.*\.html$/.test(f));
const mobileCss = read('public_html/css/admin-mobile.css');

describe('القائمة الجانبية', () => {
    const panel = read('public_html/js/admin-panel.js');
    const fn = panel.slice(panel.indexOf('function toggleMobileSidebar'), panel.indexOf('// Esc يغلقها'));

    it('🔑 لوحة التحكم: القيمة المطلوبة تُحترم — false يغلق ولا يفتح', () => {
        expect(fn).toContain("typeof force === 'boolean' ? force : !sb.classList.contains('mobile-open')");
        expect(fn).toContain("sb.classList.toggle('mobile-open', open)");
    });

    it('🔑 والخلفية المعتمة تظهر معها — اللمس خارجها يغلقها', () => {
        expect(fn).toContain("ov.classList.toggle('show', open)");
        expect(read('public_html/admin.html')).toContain('id="gvSidebarOverlay" onclick="toggleMobileSidebar(false)"');
    });

    it('🔑 الإحصاءات: الصنف الذي تنتظره الأنماط («show» لا «active»)', () => {
        const s = read('public_html/admin-stats.html');
        const t = s.slice(s.indexOf('function toggleSidebar'), s.indexOf('function toggleSidebar') + 250);
        expect(t).toContain("classList.toggle('show')");
        expect(t).not.toContain("'active'");
        expect(read('public_html/css/admin-dashboard.css')).toContain('.sidebar.show');
    });

    it('القائمة بارتفاع الشاشة الظاهرة وتتمرّر — لا يُقصّ «خروج»', () => {
        expect(mobileCss).toContain('height: 100dvh !important;');
        expect(mobileCss).toMatch(/\.gv-sidebar \{[\s\S]{0,600}overflow-y: auto !important;/);
    });
});

describe('التكبير بإصبعين', () => {
    it('🔑 لا صفحة إدارةٍ تمنعه', () => {
        const blocked = adminPages.filter(f => /user-scalable=no|maximum-scale=1/.test(read('public_html/' + f)));
        expect(blocked).toEqual([]);
    });

    it('ولا يقفز iOS بالتكبير عند لمس حقل — الحقول 16 بكسل على الهاتف', () => {
        expect(mobileCss).toMatch(/input, select, textarea \{\s*font-size: 16px !important;/);
    });
});

describe('مساحة اللمس', () => {
    it('🔑 44 بكسل للأزرار التي قيست أصغر', () => {
        const sec = mobileCss.slice(mobileCss.indexOf('١٥) مساحة اللمس'));
        for (const sel of ['.admin-export-btn', '.menu-toggle', '.tab-btn', '[id^="pill-"][onclick]', '#btn-start-draw']) {
            expect(sec, sel).toContain(sel);
        }
        expect(sec).toContain('min-height: 44px !important;');
    });

    it('مفتاح تسجيل الكباتن: مساحة لمسٍ حوله لا على البطاقة كلّها', () => {
        const s = read('public_html/admin-settings.html');
        expect(s).toContain('<label for="captainRegistrationOpen" style="position:absolute;inset:-12px;');
    });

    it('مقبض لوحة خريطة الرحلة 36 بكسل', () => {
        expect(read('public_html/admin-trip-map.html')).toMatch(/\.tm-handle \{[\s\S]{0,300}min-height: 36px;/);
    });
});

describe('التناسق', () => {
    it('زرّ التصدير مصمَّمٌ في صفحات القالب الذي لا يحمّل admin-panel.css', () => {
        expect(read('public_html/css/admin-dashboard.css')).toContain('.admin-export-btn {');
    });

    it('🔑 الترويسة سطرٌ واحد: الحاوية flex صراحةً، و«الرئيسية» تصير سهماً في الضيّق', () => {
        expect(mobileCss).toContain('.page-header:has(> h1) > div:last-child {\n        display: flex !important;');
        const backs = adminPages.filter(f => read('public_html/' + f).includes('class="admin-back-btn"'));
        expect(backs.length).toBeGreaterThan(0);
        for (const f of backs) {
            expect(read('public_html/' + f), f).toContain('<span class="btn-label">الرئيسية</span>');
        }
    });

    it('قاعدة الترويسة لا تمسّ عناوين الأقسام (سجل المديونية، المالية)', () => {
        expect(mobileCss).toContain('.page-header:has(> h1):has(> div:last-child) { flex-wrap: nowrap !important; }');
        expect(mobileCss).not.toMatch(/^\s*\.page-header \{ flex-wrap: nowrap/m);
    });

    it('لا زرّ وضعٍ ليليّ عائمٍ يغطّي المحتوى', () => {
        expect(read('public_html/admin-reports.html')).toContain('data-theme-toggle');
        expect(read('public_html/admin-order-details.html')).toContain('ThemeManager.createToggleButton()');
    });

    it('بطاقات الإحصاء: عنوان 12 ورقم 18 — ونصٌّ أبيض على الملوّنة', () => {
        const sec = mobileCss.slice(mobileCss.indexOf('١٧) بطاقات الإحصاء مقروءة'));
        expect(sec).toContain('font-size: 12px !important;');
        expect(sec).toContain('font-size: 18px !important;');
        expect(sec).toContain('.stat-card.text-white h6, .stat-card.text-white h3 { color: #ffffff !important; }');
    });

    it('سجل المديونية: البطاقة عمودية كما صُمّمت', () => {
        expect(read('public_html/admin-debt-history.html')).toContain('.kpi-grid .kpi-card { display: block; }');
    });
});
