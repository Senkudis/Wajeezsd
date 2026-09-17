/**
 * 🪪 عميلٌ قائم يريد العمل ككابتن.
 *
 * كان مصدوداً تماماً: /register-captain يردّ «مسجل مسبقاً» ويقف. وهو أكثر
 * المتقدّمين ترجيحاً — جرّب الخدمة فأرادها عملاً. وكان يضطر لحسابٍ ثانٍ
 * برقمٍ ثانٍ، فيفقد تاريخه وتفقده الإدارة.
 *
 * والقيد الحاكم: المسار يعدّل **حساباً قائماً**، فلا بدّ من مصادقة. لو فُتح
 * بلا توكن لاستطاع من يعرف هاتف أي عميل تحويلَ حسابه. وكلمة المرور لا
 * تُقبل في جسمه إطلاقاً — قبولها من مسارٍ يعدّل حساباً = استيلاء كامل.
 *
 * وتزامن المركبات: التسمية كانت مكتوبة ثلاث مرّات (التقديم، الإضافة
 * اليدوية، عرض العميل) فافترقت — الإدارة تضيف ثلاثة أنواع بينما التقديم
 * يعرض ستة. المصدر صار واحداً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const auth = read('routes/auth.js');
const schema = read('schemas/authSchema.js');
const page = read('public_html/captain-signup.html');

const iUp = auth.indexOf("'/captain-application'");
const upBlock = auth.slice(iUp, auth.indexOf('\nrouter.', iUp + 30));

describe('المسار مُصادَق ولا يقبل كلمة مرور', () => {
    it('protect قبل أي شيء', () => {
        expect(upBlock.slice(0, 200)).toContain('protect');
    });

    it('الهوية من التوكن لا من الجسم', () => {
        expect(upBlock).toContain('User.findById(req.user._id)');
        expect(upBlock).not.toContain('req.body.phone');
        expect(upBlock).not.toContain('req.body.email');
    });

    it('مخطّط الترقية لا يحوي كلمة مرور ولا اسماً', () => {
        const i = schema.indexOf('const captainApplicationFields');
        const fields = schema.slice(i, schema.indexOf('};', i));
        expect(fields).not.toContain('password');
        expect(fields).not.toContain('name:');
    });

    it('لا كلمة مرور تُكتب على الحساب في المسار', () => {
        expect(upBlock).not.toContain('user.password');
    });
});

describe('الحالات التي تُرفض', () => {
    it('كابتن بالفعل: 409 بحالته لا خطأ مبهم', () => {
        expect(upBlock).toContain("user.role === 'captain'");
        expect(upBlock).toContain('409');
        expect(upBlock).toContain('قيد المراجعة');
    });

    it('تاجر أو أدمن: لا ترقية صامتة لدوره', () => {
        expect(upBlock).toContain("user.role === 'merchant'");
        expect(upBlock).toContain('403');
    });

    it('رقم وطني مستعمَل بحسابٍ آخر يُرفض — مع استثناء صاحبه', () => {
        expect(upBlock).toContain("'captainApplication.nationalId'");
        expect(upBlock).toContain('_id: { $ne: user._id }');
    });
});

describe('ما تفعله الترقية فعلاً', () => {
    it('🔑 نفس الحساب، والدور **لا يتغيّر** — الطلب حالةٌ لا ترقية', () => {
        // كان هذا الاختبار يحرس `user.role = 'captain'` بوصفه السلوك الصحيح،
        // وهو نفسه العطل: العميل يفقد حسابه لحظة الضغط على «إرسال»، وإن رُفض
        // بقي كابتناً مرفوضاً — والكابتن المرفوض ممنوعٌ من الدخول أصلاً، فيصير
        // محظوراً من التطبيق كلّه عقوبةً على أنه تقدّم لوظيفة.
        expect(upBlock).not.toMatch(/user\.role\s*=\s*'captain'/);
        expect(upBlock).not.toMatch(/user\.approvalStatus\s*=\s*'pending'/);

        expect(upBlock).toContain("status: 'pending'");
        expect(upBlock).toContain('user.vehicleType = req.body.vehicleType');
        expect(upBlock).toContain('user.captainApplication = {');
        expect(upBlock).toContain('submittedAt');
    });

    it('لا يُنشئ حساباً ثانياً — التاريخ يبقى', () => {
        expect(upBlock).not.toContain('User.create');
        expect(upBlock).not.toContain('new User(');
    });

    it('توكنٌ جديد: القديم يحمل دور client فيبقى التطبيق يعامله كعميل', () => {
        expect(upBlock).toContain('signUserToken(user)');
        expect(upBlock).toContain('token');
    });
});

describe('التسجيل العادي يدلّ العميل على الطريق بدل صدّه', () => {
    it('يردّ 409 مع دور الحساب القائم لا رسالة نهائية', () => {
        const i = auth.indexOf("'/register-captain'");
        const blk = auth.slice(i, auth.indexOf('\nrouter.', i + 30));
        expect(blk).toContain('accountExists');
        expect(blk).toContain('existingRole');
    });
});

describe('الواجهة: نفس النموذج يرقّي حين يكون داخلاً', () => {
    it('تكشف الجلسة وتفعّل وضع الترقية', () => {
        expect(page).toContain('function detectExistingSession');
        expect(page).toContain("user.role !== 'client'");
        expect(page).toContain('upgradeMode = true');
        expect(page).toContain('detectExistingSession();');
    });

    it('تُستدعى بعد تعريف upgradeMode — النداء قبله يرمي TDZ', () => {
        // وقع فعلاً: الاستدعاء كان مع بقية التهيئة أعلى الملف، فترمي
        // ReferenceError عند أول إسناد وتبقى الصفحة كأن لا جلسة.
        const decl = page.indexOf('let upgradeMode');
        const call = page.indexOf('\n        detectExistingSession();');
        expect(decl).toBeGreaterThan(-1);
        expect(call).toBeGreaterThan(decl);
    });

    it('تخفي كلمة المرور ولا تطلبها — يدخل بكلمته القائمة', () => {
        expect(page).toContain("document.getElementById('passwordWrap')");
        expect(page).toContain('if (!upgradeMode) {');
    });

    it('ترسل للمسار المصادَق بالتوكن، وبلا حقول حساب', () => {
        expect(page).toContain("upgradeMode ? 'captain-application' : 'register-captain'");
        expect(page).toContain("'Authorization': `Bearer ${sessionToken}`");
        expect(page).toContain('const account = upgradeMode ? {} :');
    });

    it('🔑 لا تكتب دور captain في التخزين — الدور يبقى client حتى القبول', () => {
        // كانت تكتب data.user (وفيه role: 'captain') فوق المستخدم المخزَّن،
        // فيخرج من الصفحة وقد فقد واجهة العميل قبل أن ينظر أحدٌ في طلبه.
        expect(page).not.toContain('Object.assign(u, data.user');
        expect(page).toContain('u.applicationStatus');
        expect(page).toContain("localStorage.setItem('token', data.token)");
    });

    it('غير الداخل يجد زرّ دخولٍ يعود به إلى هنا', () => {
        expect(page).toContain('data.accountExists');
        expect(page).toContain('goToLogin()');
        expect(page).toContain("localStorage.setItem('returnUrl', 'captain-signup.html')");
    });
});

describe('وسائل التوصيل: مصدرٌ واحد للتسمية والأيقونة', () => {
    const server = require('../utils/vehicleTypes');
    const client = read('public_html/js/vehicle-types.js');
    const panel = read('public_html/js/admin-panel.js');

    it('الخادم والواجهة متطابقان قيمةً وتسمية', () => {
        for (const t of server.VEHICLE_TYPES) {
            expect(client).toContain(`'${t.value}'`);
            expect(client).toContain(t.label);
        }
    });

    it('لكل وسيلة أيقونة في المصدر نفسه — لا تفترق عن اسمها', () => {
        for (const t of server.VEHICLE_TYPES) {
            expect(t.biIcon).toMatch(/^bi-/);
        }
    });

    it('نموذج التقديم يبنيها من المصدر لا يكتبها', () => {
        expect(page).toContain('VehicleTypes.list.map');
        expect(page).not.toContain('data-vehicle="motorcycle"');
    });

    it('الإضافة اليدوية في اللوحة: كل الأنواع لا ثلاثة', () => {
        expect(panel).toContain('VehicleTypes.plainOptionsHtml()');
        const i = panel.indexOf('VehicleTypes.plainOptionsHtml()');
        const blk = panel.slice(Math.max(0, i - 400), i + 200);
        // لا قائمةٌ مكتوبةٌ بجانبها تُعيد الافتراق
        expect(blk.match(/<option value="(rickshaw|car|bicycle)"/g)).toBeNull();
    });

    it('خيارات اللوحة بلا رموز تعبيرية', () => {
        const { plainOptionsHtml } = requireClient();
        const html = plainOptionsHtml();
        expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
        for (const t of server.VEHICLE_TYPES) expect(html).toContain(t.label);
    });

    function requireClient() {
        // الملف واجهةٌ خالصة — نُقيّمه على window صوري لقراءة دواله
        const sandbox = { window: {} };
        new Function('window', client).call(sandbox, sandbox.window);
        return sandbox.window.VehicleTypes;
    }
});
