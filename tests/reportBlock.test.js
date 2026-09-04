/**
 * 🚩 الإبلاغ عن محتوى مسيء + حظر المستخدمين.
 *
 * الخلفية: App Store Review Guideline 1.2 يشترط على أي تطبيق يعرض محتوىً من
 * المستخدمين آليةَ إبلاغ وقدرةً على حظر المسيئين. تعليقات التقييم في وجيز
 * تُعرض علناً (GET /api/places/:id/reviews مسار عام)، فالشرط ينطبق — ورُفض
 * التقديم الأول على App Store بطلب إظهار الآليتين في تسجيل الشاشة.
 *
 * هذه الاختبارات تحرس الأمرين: أن النموذجين يمنعان ما يجب منعه، وأن الحظر
 * مُطبَّق فعلاً في مسار الرسائل لا معرَّف في المخطّط وحده.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const Report = require('../models/Report');
const User = require('../models/User');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const REPORTER = '507f1f77bcf86cd799439011';
const TARGET   = '507f1f77bcf86cd799439012';

describe('نموذج البلاغ', () => {
    const base = { reporter: REPORTER, targetType: 'rating', targetId: TARGET, reason: 'offensive' };

    it('يقبل بلاغاً صحيحاً ويبدأ معلّقاً', () => {
        const doc = new Report(base);
        expect(doc.validateSync()).toBeUndefined();
        expect(doc.status).toBe('pending');
    });

    it('🔒 يرفض نوع هدف مجهول', () => {
        const doc = new Report({ ...base, targetType: 'invoice' });
        expect(doc.validateSync()?.errors?.targetType).toBeDefined();
    });

    it('🔒 يرفض سبباً خارج القائمة — الأسباب تُجمَّع إحصائياً فلا تقبل نصّاً حرّاً', () => {
        const doc = new Report({ ...base, reason: 'ما بعجبني' });
        expect(doc.validateSync()?.errors?.reason).toBeDefined();
    });

    it('يغطّي الأنواع الثلاثة: تقييم ورسالة ومستخدم', () => {
        for (const t of ['rating', 'message', 'user']) {
            expect(new Report({ ...base, targetType: t }).validateSync()).toBeUndefined();
        }
    });

    it('🔑 فهرس فريد يمنع تكرار البلاغ من نفس الشخص على نفس المحتوى', () => {
        // التكرار ضغطُ زرٍّ لا إشارةُ خطورة، وعدّه يُضلّل الأدمن
        const idx = Report.schema.indexes()
            .find(([keys]) => keys.reporter === 1 && keys.targetType === 1 && keys.targetId === 1);
        expect(idx).toBeDefined();
        expect(idx[1].unique).toBe(true);
    });

    it('يحفظ لقطة من المحتوى — قد يُحذف قبل أن يراه الأدمن', () => {
        expect(Object.keys(Report.schema.paths)).toContain('snapshot');
        const doc = new Report({ ...base, snapshot: 'نصّ التعليق المُبلَّغ عنه' });
        expect(doc.snapshot).toBe('نصّ التعليق المُبلَّغ عنه');
    });
});

describe('حظر المستخدمين', () => {
    it('blockedUsers مصفوفة مراجع إلى User وتبدأ فارغة', () => {
        const p = User.schema.path('blockedUsers');
        expect(p).toBeDefined();
        expect(p.caster.options.ref).toBe('User');
        const u = new User({ name: 'ن', phone: '0900000000', password: 'x', city: 'Khartoum' });
        expect(u.blockedUsers).toHaveLength(0);
    });

    it('🔑 منفصل عن is_blocked — حجبٌ اجتماعي لا مالي', () => {
        // is_blocked تفرضه الإدارة على الكابتن عند تجاوز حدّه الائتماني.
        // خلطهما كان سيجعل حظر مستخدمٍ لكابتن يبدو إيقافاً مالياً له.
        const paths = Object.keys(User.schema.paths);
        expect(paths).toContain('is_blocked');
        expect(paths).toContain('blockedUsers');
        expect(User.schema.path('is_blocked').instance).toBe('Boolean');
        expect(User.schema.path('blockedUsers').instance).toBe('Array');
    });
});

describe('🔗 الحظر مُطبَّق في مسار الرسائل لا في المخطّط وحده', () => {
    const chat = read('routes/chat.js');

    it('يمنع من حظرتَه من تلقّي رسالتك', () => {
        expect(chat).toContain('iBlockedThem');
    });

    it('🔑 ويمنع من حظرك من مراسلتك — الفحص في الاتجاهين', () => {
        // بفحص اتجاه واحد يبقى المسيء قادراً على الوصول متى بدأ هو المحادثة،
        // وهو بالضبط ما يهرب منه الحظر.
        expect(chat).toContain('theyBlockedMe');
    });

    it('لا يكشف للمُرسِل أن الحظر هو السبب', () => {
        // كشفه يحوّل الحظر إلى إشارة تستفزّ وقد تدفع لحسابٍ آخر
        expect(chat).toContain('delivery_blocked');
        expect(chat).toContain('تعذّر إرسال الرسالة إلى هذا المستخدم');
    });
});

describe('🔗 الواجهات تعرض الآليتين فعلاً', () => {
    it('زر إبلاغ على كل رأي في صفحة المتجر', () => {
        expect(read('public_html/shop-detail.html')).toContain("reportContent('rating'");
    });

    it('قائمة سلامة في المحادثة فيها إبلاغ وحظر', () => {
        const chatHtml = read('public_html/chat.html');
        expect(chatHtml).toContain('openSafetyMenu');
        expect(chatHtml).toContain("reportContent('user'");
        expect(chatHtml).toContain('blockUser(');
    });

    it('الوحدة المشتركة محمَّلة في الصفحتين — لا نسختان تفترقان', () => {
        expect(read('public_html/shop-detail.html')).toContain('js/report-block.js');
        expect(read('public_html/chat.html')).toContain('js/report-block.js');
    });

    it('شاشة الأدمن موجودة ومربوطة في القائمة', () => {
        expect(fs.existsSync(path.join(__dirname, '..', 'public_html/admin-reports.html'))).toBe(true);
        expect(read('public_html/admin.html')).toContain('admin-reports.html');
    });
});

describe('🔗 المسارات مركّبة', () => {
    it('مسار البلاغات العام مركّب على /api/reports', () => {
        expect(read('index.js')).toContain("apiRoutes.use('/reports', require('./routes/reports'))");
    });

    it('مسار الأدمن مركّب', () => {
        expect(read('routes/admin.js')).toContain("require('./admin/reports')");
    });

    it('الإخفاء يستعمل isHidden الموجود أصلاً في Rating — لا حقل ثانٍ', () => {
        const adminReports = read('routes/admin/reports.js');
        expect(adminReports).toContain('isHidden: true');
        // ومسار الآراء العام يفلتر به أصلاً، فالإخفاء يسري فوراً بلا تغيير هناك
        expect(read('routes/places.js')).toContain('isHidden: false');
    });
});
