/**
 * 🔒 باب تسجيل الكباتن — مغلقٌ افتراضياً، تفتحه الإدارة لكل مدينة.
 *
 *   التسجيل المفتوح دائماً يُغرق الإدارة بطلباتٍ في مدينةٍ مكتفية، ويترك
 *   متقدّمين ينتظرون مراجعةً لن تأتي.
 *
 *   ما يحرسه هذا الملف (بلا قاعدة بيانات — يعمل محلياً):
 *
 *   ١. **مغلقٌ ما لم يُفتح صراحةً.** getSettings تستعمل .lean() فلا تُطبَّق
 *      القيم الافتراضية على الوثائق الموجودة: الحقل يُقرأ undefined. فالفحص
 *      `=== true` حرفياً — لا قيمةٌ «صادقة» كـ 1 أو "yes".
 *
 *   ٢. **البابان كلاهما.** دور الكابتن يُنال من مدخلين: حسابٌ جديد
 *      (register-captain) وترقيةُ عميلٍ قائم (captain-application). فحصُ
 *      أحدهما دون الآخر يجعل المغلق مفتوحاً من الباب الثاني.
 *
 *   ٣. **الباب قبل البحث في الحسابات.** لو فُحص بعده لكشف التسجيلُ المغلق
 *      أيَّ هاتفٍ مسجَّلٌ مسبقاً.
 *
 *   ٤. **الإدارة تكتب true أو false لا غير**، ويُسجَّل الاتجاه لا اسم الحقل.
 *      وفعل السجلّ معرَّفٌ في AdminLog — وإلا رُفض و ابتلع adminLogger
 *      الخطأ بصمت فيَعِد التعليقُ بتدقيقٍ لا يقع.
 *
 *   والمسار الحقيقيّ على خادمٍ وقاعدة في captainRegistrationLock.db.test.js.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const Settings = require('../models/Settings');
const gate = require('../utils/captainRegistration');

// ─── الدالّة نفسها، بإعداداتٍ محاكاة (getSettings وحدها تُستبدل) ───────────
describe('isCaptainRegistrationOpen — مغلقٌ ما لم يُفتح صراحةً', () => {
    const real = Settings.getSettings;
    let stored;
    beforeEach(() => {
        stored = {};
        Settings.getSettings = async (city) => stored[city];
    });
    afterEach(() => { Settings.getSettings = real; });

    it('وثيقةٌ سابقة للميزة بلا الحقل ← مغلق', async () => {
        stored.Khartoum = { city: 'Khartoum', baseFare: 1000 };   // lean: لا افتراضيات
        expect(await gate.isCaptainRegistrationOpen('Khartoum')).toBe(false);
    });

    it('true صريحةً ← مفتوح', async () => {
        stored.Khartoum = { captainRegistrationOpen: true };
        expect(await gate.isCaptainRegistrationOpen('Khartoum')).toBe(true);
    });

    it.each([
        ['false', false], ['null', null], ['الرقم 1', 1], ['النصّ "true"', 'true'], ['النصّ "yes"', 'yes'],
    ])('%s ← مغلق (لا قيمةٌ «صادقة» تفتحه)', async (_, v) => {
        stored.Khartoum = { captainRegistrationOpen: v };
        expect(await gate.isCaptainRegistrationOpen('Khartoum')).toBe(false);
    });

    it('غياب الوثيقة كلّها ← مغلق لا استثناء', async () => {
        expect(await gate.isCaptainRegistrationOpen('Khartoum')).toBe(false);
    });

    it('كل مدينةٍ بابها', async () => {
        stored.Khartoum = { captainRegistrationOpen: false };
        stored.PortSudan = { captainRegistrationOpen: true };
        // عطبرة بلا وثيقة إعدادات بعد ← مغلقة حتى تفتحها الإدارة
        expect(await gate.captainRegistrationStatus()).toEqual({ Khartoum: false, PortSudan: true, Atbara: false });
    });

    it('مدينةٌ مجهولة تُحلَّل إلى الخرطوم — كما يُنشأ الحساب تماماً', async () => {
        stored.Khartoum = { captainRegistrationOpen: true };
        expect(await gate.isCaptainRegistrationOpen('Atlantis')).toBe(true);
        expect(await gate.isCaptainRegistrationOpen(undefined)).toBe(true);
    });

    it('ورسالة الإغلاق تسمّي المدينة بالعربية', () => {
        expect(gate.closedMessage('PortSudan')).toContain('بورتسودان');
        expect(gate.closedMessage('Khartoum')).toContain('الخرطوم');
        expect(gate.closedMessage('Atlantis')).toContain('الخرطوم');
    });
});

// ─── النموذج ──────────────────────────────────────────────────────────────
describe('Settings — الحقل مغلقٌ افتراضياً', () => {
    it('default: false', () => {
        const p = Settings.schema.path('captainRegistrationOpen');
        expect(p).toBeTruthy();
        expect(p.instance).toBe('Boolean');
        expect(p.defaultValue).toBe(false);
    });
});

// ─── المدخلان في auth.js ──────────────────────────────────────────────────
describe('البابان كلاهما مقفلان على الخادم', () => {
    const src = read('routes/auth.js');
    const handler = (route) => {
        const i = src.indexOf(`router.post('${route}'`);
        expect(i, route + ' غير موجود').toBeGreaterThan(-1);
        const end = src.indexOf('\nrouter.', i + 10);
        return src.slice(i, end === -1 ? undefined : end);
    };

    it('register-captain يفحص الباب', () => {
        const h = handler('/register-captain');
        expect(h).toContain('isCaptainRegistrationOpen(req.body.city)');
        expect(h).toContain('registrationClosed: true');
        expect(h).toContain('res.status(403)');
    });

    it('…قبل أي بحثٍ في الحسابات — وإلا كشف المغلقُ الهواتفَ المسجّلة', () => {
        const h = handler('/register-captain');
        const gateAt = h.indexOf('isCaptainRegistrationOpen');
        const lookupAt = h.indexOf('User.findOne');
        expect(gateAt).toBeGreaterThan(-1);
        expect(lookupAt).toBeGreaterThan(-1);
        expect(gateAt).toBeLessThan(lookupAt);
    });

    it('captain-application يفحص الباب — الباب الثاني إلى الدور نفسه', () => {
        const h = handler('/captain-application');
        // باب مدينة العمل التي اختارها، لا مدينة حسابه كعميل
        expect(h).toContain('isCaptainRegistrationOpen(workCity)');
        expect(h).toContain('registrationClosed: true');
    });

    it('…بعد «طلبك قيد المراجعة» — صاحب الطلب المعلّق يرى حالة طلبه', () => {
        const h = handler('/captain-application');
        expect(h.indexOf('طلبك قيد المراجعة بالفعل')).toBeLessThan(h.indexOf('isCaptainRegistrationOpen'));
    });

    it('…وقبل حفظ ملفّ الانتساب', () => {
        const h = handler('/captain-application');
        expect(h.indexOf('isCaptainRegistrationOpen')).toBeLessThan(h.indexOf('await user.save()'));
    });

    it('ومسار الحالة عامٌّ بلا كاش', () => {
        const i = src.indexOf("router.get('/captain-registration-status'");
        expect(i).toBeGreaterThan(-1);
        const h = src.slice(i, i + 500);
        expect(h).not.toContain('protect');
        expect(h).toContain("'no-store'");
    });
});

// ─── الإدارة ──────────────────────────────────────────────────────────────
describe('الإدارة تفتح الباب وتغلقه', () => {
    const src = read('routes/admin/settings.js');

    it('الحقل في القائمة المسموحة', () => {
        const i = src.indexOf('const allowedFields = [');
        expect(src.slice(i, src.indexOf('];', i))).toContain("'captainRegistrationOpen'");
    });

    it('true أو false فقط — «1» و«yes» تُرفض برسالة عربية', () => {
        expect(src).toContain("if (v === true || v === 'true') updates.captainRegistrationOpen = true;");
        expect(src).toContain("else if (v === false || v === 'false') updates.captainRegistrationOpen = false;");
        expect(src).toContain('حالة باب تسجيل الكباتن يجب أن تكون مفتوحاً أو مغلقاً');
    });

    it('القراءة تُطبّع الغائب إلى false صريحة', () => {
        expect(src).toContain('captainRegistrationOpen: settings.captainRegistrationOpen === true');
    });

    it('ويُسجَّل الاتجاه لا اسم الحقل', () => {
        expect(src).toContain("'captain_registration_toggle'");
        expect(src).toContain("'فُتح' : 'أُغلق'");
    });

    it('وفعل السجلّ معرَّفٌ في AdminLog — وإلا ضاع بصمت', () => {
        const AdminLog = require('../models/AdminLog');
        expect(AdminLog.schema.path('action').enumValues).toContain('captain_registration_toggle');
    });
});

// ─── الواجهات ─────────────────────────────────────────────────────────────
describe('لوحة الإدارة', () => {
    const html = read('public_html/admin-settings.html');
    const js = read('public_html/js/admin-settings.js');

    it('المفتاح دوره switch واسمه صريح', () => {
        expect(html).toContain('role="switch" id="captainRegistrationOpen"');
        // التسمية نفسها تمتدّ حول المفتاح مساحةَ لمس (tests/adminMobileTouch)،
        // والاسم فيها نصٌّ مخفيٌّ بصرياً يقرؤه قارئ الشاشة
        expect(html).toMatch(/<label for="captainRegistrationOpen"[^>]*>\s*<span class="visually-hidden">فتح تسجيل الكباتن في هذه المدينة<\/span>\s*<\/label>/);
    });

    it('يُحفظ فور تبديله بطلبٍ يحمل الحقل وحده — لا يُعيد حفظ التسعير', () => {
        expect(js).toContain('body: JSON.stringify({ city, captainRegistrationOpen: wantOpen })');
    });

    it('ولا يدخل في حفظ النموذج العامّ', () => {
        const i = js.indexOf('async function saveSettings');
        const end = js.indexOf('\n}', i);
        expect(js.slice(i, end)).not.toContain('captainRegistrationOpen');
    });

    it('بتأكيدٍ قبله، والإلغاء والفشل يُعيدان المفتاح لحقيقته', () => {
        const i = js.indexOf('function bindRegGate');
        const blk = js.slice(i, i + 4000);
        expect(blk).toContain('Swal.fire(');
        expect(blk).toContain('if (!ok) { renderRegGate(!wantOpen); return; }');
        expect(blk).toContain('renderRegGate(!wantOpen);   // الفشل لا يترك المفتاح يكذب');
    });

    it('ويعرض ما حفظه الخادم فعلاً لا ما ضُغط', () => {
        expect(js).toContain('data.settings.captainRegistrationOpen === true');
    });
});

describe('صفحة التسجيل', () => {
    const html = read('public_html/captain-signup.html');

    it('تسأل الخادم قبل عرض النموذج', () => {
        expect(html).toContain('/api/auth/captain-registration-status');
        expect(html).toContain('checkRegistrationGate();');
    });

    it('وتفشل مفتوحةً — عطلٌ عابر لا يحجب النموذج، والخادم يحسم عند الإرسال', () => {
        const i = html.indexOf('async function checkRegistrationGate');
        const blk = html.slice(i, i + 700);
        expect(blk).toContain('if (!res.ok) return;');
        expect(blk).toContain('} catch (_) { return; }');
    });

    it('والترقية تختار مدينة عملها كالتسجيل الجديد — المغلقة تُعطَّل', () => {
        const i = html.indexOf('async function checkRegistrationGate');
        const body = html.slice(i, i + 1500);
        expect(body).not.toContain('if (upgradeMode)');
        expect(body).toContain('applyCityGate(open)');
    });

    it('والإغلاق أثناء الملء (403) يعرض اللوحة لا رسالة خطأٍ عامّة', () => {
        expect(html).toContain('if (res.status === 403 && data.registrationClosed)');
    });

    it('واللوحة بلا إيموجي', () => {
        // حدود اللوحة بعلاماتٍ في محتواها لا بنهاية سطر — الملف CRLF،
        // و'</div>\n' لا يُطابَق فيمتدّ المقطع إلى آخر الملف.
        const i = html.indexOf('id="regClosed"');
        const end = html.indexOf('</a>', html.indexOf('العودة للرئيسية', i)) + 4;
        const panel = html.slice(i, end);
        expect(panel.length).toBeGreaterThan(200);
        expect(panel.length).toBeLessThan(2000);
        expect(panel).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });
});

// ─── عيبان قائمان أُصلحا في المنطقة نفسها ────────────────────────────────
describe('عيبان قائمان في صفحة التسجيل', () => {
    const html = read('public_html/captain-signup.html');

    it('خطأ المدينة خارج <select> — داخله لا يُرسَم (0×0) فلم يكن يُرى أبداً', () => {
        const s = html.indexOf('<select id="city"');
        const e = html.indexOf('</select>', s);
        expect(html.slice(s, e)).not.toContain('city-error');
        expect(html.indexOf('id="city-error"')).toBeGreaterThan(e);
    });

    it('نصّ الشعار البديل لم يعد «???? ????» التالف', () => {
        expect(html).not.toContain('alt="???? ????"');
    });
});
