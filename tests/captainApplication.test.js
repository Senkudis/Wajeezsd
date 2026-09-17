/**
 * 🪪 منطق طلب الانتساب ككابتن.
 *
 * عطلان مترابطان، سببهما واحد: الدور كان يحمل **حالة الطلب**.
 *
 * ١) عميلٌ يضغط «إرسال» فيصير role='captain' في اللحظة نفسها — يفقد حسابه
 *    كعميل قبل أن ينظر أحدٌ في طلبه.
 * ٢) وإن رُفض بقي كابتناً مرفوضاً، وتسجيل الدخول ممنوع على الكابتن المرفوض،
 *    و isActive=false فوقها — فيصير **محظوراً من التطبيق كلّه** عقوبةً على
 *    أنه تقدّم لوظيفة.
 *
 * القاعدة الآن: الدور لا يتغيّر إلا عند القبول. حالة الطلب في حقلها.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const codeOnly = (src) => src.split('\n')
    .filter(l => { const t = l.trim(); return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*'); })
    .join('\n');

describe('حالة الطلب مستقلّة عن الدور', () => {
    const model = read('models/User.js');

    it('الحقل موجود بقيمه الأربع', () => {
        const block = model.slice(model.indexOf('captainApplication'));
        expect(block).toMatch(/enum: \['none', 'pending', 'approved', 'rejected'\]/);
        expect(block).toMatch(/default: 'none'/);
    });
});

describe('تقديم الطلب لا يُرقّي', () => {
    const src = codeOnly(read('routes/auth.js'));
    const route = src.slice(src.indexOf("router.post('/captain-application'"), src.indexOf("router.get('/check-subscription"));

    it('🔑 لا يضع role = captain', () => {
        expect(route).not.toMatch(/user\.role\s*=\s*'captain'/);
    });

    it('🔑 ولا يضع approvalStatus = pending — ذاك يقفل الدخول على الكابتن', () => {
        expect(route).not.toMatch(/user\.approvalStatus\s*=\s*'pending'/);
    });

    it('يضع حالة الطلب بدلاً منهما', () => {
        expect(route).toMatch(/status: 'pending'/);
    });

    it('طلبٌ قيد المراجعة يمنع طلباً ثانياً', () => {
        expect(route).toMatch(/captainApplication\.status === 'pending'/);
    });

    it('🔑 والمرفوض يُعاد تقديمه — أكثر أسباب الرفض قابلٌ للإصلاح', () => {
        // الحارس على 'pending' وحدها، فلا شيء يمنع المرفوض
        expect(route).not.toMatch(/status === 'rejected'[\s\S]{0,120}return res\.status\(40/);
    });
});

describe('الأدمن يرى الطلبات ويتصرّف فيها', () => {
    const users = codeOnly(read('routes/admin/users.js'));
    const dash  = codeOnly(read('routes/admin/dashboard.js'));

    it('🔑 القائمة تشمل ترقيات العملاء — دورهم client فلا يجدها الفلتر القديم', () => {
        const list = users.slice(users.indexOf("'/pending-captains'"), users.indexOf("'/approve-captain/:id'"));
        expect(list).toContain("'captainApplication.status': 'pending'");
    });

    it('والعدّاد في اللوحة كذلك — وإلا أظهر صفراً والقائمة غير فارغة', () => {
        expect(dash).toContain("'captainApplication.status': 'pending'");
    });

    it('🔑 القبول هو الموضع الوحيد الذي يُرقّي', () => {
        const ap = users.slice(users.indexOf("'/approve-captain/:id'"), users.indexOf("'/reject-captain/:id'"));
        expect(ap).toMatch(/if \(isUpgrade\) captain\.role = 'captain'/);
    });

    it('🔑 الرفض يُبقي العميل عاملاً — لا يُعطّل حسابه', () => {
        const rj = users.slice(users.indexOf("'/reject-captain/:id'"));
        expect(rj).toMatch(/if \(isUpgrade\)[\s\S]{0,400}captain\.isActive = true/);
    });

    it('ورفضُ حسابٍ أُنشئ ككابتن يبقى كما كان', () => {
        const rj = users.slice(users.indexOf("'/reject-captain/:id'"));
        expect(rj).toMatch(/else \{[\s\S]{0,200}approvalStatus = 'rejected'[\s\S]{0,120}isActive = false/);
    });
});

describe('🖼️ الصور تُعرض داخل التطبيق', () => {
    const lb = read('public_html/js/img-lightbox.js');

    it('تُعرّف openImage وتعترض data-lightbox', () => {
        expect(lb).toContain('window.openImage');
        expect(lb).toContain("closest('[data-lightbox]')");
    });

    it('🔑 تمنع الانتقال على الروابط — وهو أصل الخروج من التطبيق', () => {
        expect(lb).toContain('e.preventDefault()');
    });

    it('تحترم المساحة الآمنة بـ --sat/--sab لا env()', () => {
        expect(lb).toContain('var(--sat');
        expect(lb).toContain('var(--sab');
        expect(lb).not.toMatch(/env\(safe-area/);
    });

    it('🔑 وثائق الكابتن لم تعد تفتح خارج التطبيق', () => {
        const panel = read('public_html/js/admin-panel.js');
        const doc = panel.slice(panel.indexOf('class="cap-doc" data-lightbox'), panel.indexOf('class="cap-doc" data-lightbox') + 300);
        expect(doc).not.toContain('target="_blank"');
    });

    it('ولا window.open(this.src) في صفحات الأدمن', () => {
        for (const f of ['public_html/admin-chats.html', 'public_html/admin-order-details.html']) {
            expect(read(f)).not.toContain('window.open(this.src)');
        }
    });

    it('الوحدة محمّلة في الصفحات التي تستعملها', () => {
        for (const f of ['public_html/admin.html', 'public_html/admin-chats.html', 'public_html/admin-order-details.html']) {
            expect(read(f)).toContain('js/img-lightbox.js');
        }
    });
});
