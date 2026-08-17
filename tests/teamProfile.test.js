/**
 * 🪪 بطاقات الفريق — اشتقاق البيانات وقواعد الظهور.
 *
 * أهم ما يُحرَس هنا شيئان:
 *  1. أن المُسقِط العام لا يُسرّب رقم هاتف أو بريداً أو معرّفاً داخلياً. البطاقة
 *     تُطبع وتُفقَد ويمسحها غرباء، فأي حقل زائد هنا تسريبٌ لكل الكباتن دفعةً واحدة.
 *  2. أن `isTeamVisible` و`visibilityFilter` في routes/team.js يقولان الشيء نفسه.
 *     افتراقهما يعني أن أحدهما يُظهر من يجب إخفاؤه — وهو ما لا يظهر في أي اختبار
 *     يفحص أحدهما وحده.
 */

const {
    deriveJobTitles,
    deriveDepartment,
    derivePhoto,
    isTeamVisible,
    toPublicTeamMember,
    toAdminTeamMember,
    generatePublicId
} = require('../utils/teamProfile');

const { visibilityFilter } = require('../routes/team');

/** مستخدم صالح للظهور — الاختبارات تعدّل عليه ما تحتاجه فقط. */
function user(overrides = {}) {
    return Object.assign({
        _id: '507f1f77bcf86cd799439011',
        name: 'محمد الطيب',
        phone: '249912345678',
        email: 'x@example.com',
        role: 'captain',
        city: 'Khartoum',
        isActive: true,
        deletedAt: null,
        approvalStatus: 'approved',
        vehicleType: 'motorcycle',
        documents: { profilePhoto: '/uploads/profiles/a.jpg' }
    }, overrides);
}

describe('اشتقاق المسمّى الوظيفي', () => {
    it('الكابتن يأخذ مسمّاه من نوع مركبته', () => {
        expect(deriveJobTitles(user({ vehicleType: 'motorcycle' }))).toEqual(['كابتن دراجة نارية']);
        expect(deriveJobTitles(user({ vehicleType: 'rickshaw' }))).toEqual(['كابتن ركشة']);
    });

    it('كابتن بلا نوع مركبة يأخذ المسمّى العام لا "كابتن undefined"', () => {
        expect(deriveJobTitles(user({ vehicleType: undefined }))).toEqual(['كابتن توصيل']);
    });

    it('الأدمن الرئيسي مدير والمساعد مشرف مدينته', () => {
        expect(deriveJobTitles(user({ role: 'admin', adminRole: 'super_admin' }))).toEqual(['مدير النظام']);
        expect(deriveJobTitles(user({ role: 'admin', adminRole: 'sub_admin', city: 'PortSudan' })))
            .toEqual(['مشرف بورتسودان']);
    });

    it('أدمن قديم بلا adminRole يُعامَل مديراً لا "مشرف undefined"', () => {
        // adminRole=null يعني حساباً سابقاً لنظام الصلاحيات — بقية اللوحة تعامله super_admin
        expect(deriveJobTitles(user({ role: 'admin', adminRole: null }))).toEqual(['مدير النظام']);
    });

    it('الأقسام تُشتقّ من الدور', () => {
        expect(deriveDepartment(user())).toBe('الكباتن');
        expect(deriveDepartment(user({ role: 'admin' }))).toBe('الإدارة');
        expect(deriveDepartment(user({ role: 'merchant' }))).toBe('الشركاء');
    });
});

describe('اختيار الصورة', () => {
    it('صورة البطاقة اليدوية تتقدّم على صورة التسجيل', () => {
        const u = user({ teamProfile: { photo: '/uploads/profiles/team.jpg' } });
        expect(derivePhoto(u)).toBe('/uploads/profiles/team.jpg');
    });

    it('تعود لصورة التسجيل عند غياب اليدوية', () => {
        expect(derivePhoto(user({ teamProfile: { photo: '   ' } }))).toBe('/uploads/profiles/a.jpg');
    });

    it('تُرجع فراغاً لا undefined عند غياب الاثنتين — الواجهة ترسم صورة رمزية', () => {
        expect(derivePhoto(user({ documents: {} }))).toBe('');
    });
});

describe('قواعد الظهور', () => {
    it('الكابتن المعتمد النشط يظهر', () => {
        expect(isTeamVisible(user())).toBe(true);
    });

    it('العميل لا يظهر مهما كانت حالته', () => {
        expect(isTeamVisible(user({ role: 'client' }))).toBe(false);
        expect(isTeamVisible(user({ role: 'customer' }))).toBe(false);
    });

    it('الموقوف والمحذوف وغير المعتمد لا يظهرون', () => {
        expect(isTeamVisible(user({ isActive: false }))).toBe(false);
        expect(isTeamVisible(user({ deletedAt: new Date() }))).toBe(false);
        expect(isTeamVisible(user({ approvalStatus: 'pending' }))).toBe(false);
        expect(isTeamVisible(user({ approvalStatus: 'rejected' }))).toBe(false);
    });

    it('الإخفاء اليدوي يمنع الظهور، وغياب الحقل لا يمنعه', () => {
        expect(isTeamVisible(user({ teamProfile: { show: false } }))).toBe(false);
        // الحسابات المسجّلة قبل إضافة الحقل لا تحمله — يجب أن تظل ظاهرة
        expect(isTeamVisible(user({ teamProfile: {} }))).toBe(true);
        expect(isTeamVisible(user({ teamProfile: undefined }))).toBe(true);
    });
});

describe('تطابق فلتر قاعدة البيانات مع قاعدة الظهور', () => {
    const filter = visibilityFilter();

    it('يحمل الأدوار الثلاثة نفسها', () => {
        // نسخة قبل الفرز: TEAM_ROLES مجمّدة و sort() تُعدّل في مكانها
        expect([...filter.role.$in].sort()).toEqual(['admin', 'captain', 'merchant']);
    });

    it('يشترط النشاط والاعتماد وعدم الحذف', () => {
        expect(filter.isActive).toBe(true);
        expect(filter.deletedAt).toBe(null);
        expect(filter.approvalStatus).toBe('approved');
    });

    it('يقبل غياب teamProfile.show لا القيمة true وحدها', () => {
        // ⚠️ العطل الحقيقي: { 'teamProfile.show': true } وحده يُخفي كل من سُجّل
        // قبل إضافة الحقل — أي كل الكباتن القدامى دفعةً واحدة.
        const branches = JSON.stringify(filter.$or);
        expect(branches).toContain('$exists');
        expect(filter.$or.some(b => b['teamProfile.show'] === true)).toBe(true);
    });
});

describe('المُسقِط العام', () => {
    it('لا يُخرج هاتفاً ولا بريداً ولا معرّفاً داخلياً', () => {
        const out = toPublicTeamMember(user({ teamProfile: { publicId: 'a'.repeat(24) } }));
        const keys = Object.keys(out);
        expect(keys).not.toContain('phone');
        expect(keys).not.toContain('phoneNumber');
        expect(keys).not.toContain('email');
        expect(keys).not.toContain('_id');
        expect(keys).not.toContain('city');
        expect(JSON.stringify(out)).not.toContain('249912345678');
    });

    it('المسمّيات اليدوية تتقدّم على المشتقّة', () => {
        const out = toPublicTeamMember(user({
            teamProfile: { publicId: 'b'.repeat(24), jobTitles: ['قائد الفريق', 'مدرّب'] }
        }));
        expect(out.jobTitles).toEqual(['قائد الفريق', 'مدرّب']);
        expect(out.jobTitle).toBe('قائد الفريق');
    });

    it('مسمّيات يدوية فارغة تعيد الاشتقاق التلقائي', () => {
        // مسح الحقول من اللوحة يجب أن يعيد السلوك الافتراضي لا أن يترك بطاقة بلا مسمّى
        const out = toPublicTeamMember(user({ teamProfile: { publicId: 'c'.repeat(24), jobTitles: ['  ', ''] } }));
        expect(out.jobTitles).toEqual(['كابتن دراجة نارية']);
    });

    it('يُرجع publicId فارغاً لا undefined عند غيابه', () => {
        expect(toPublicTeamMember(user()).publicId).toBe('');
    });
});

describe('المُسقِط الإداري', () => {
    it('يفصل المكتوب يدوياً عن المشتقّ ليعرضهما اللوحة معاً', () => {
        const out = toAdminTeamMember(user({ teamProfile: { jobTitles: ['قائد'] } }));
        expect(out.jobTitles).toEqual(['قائد']);
        expect(out.derivedJobTitles).toEqual(['كابتن دراجة نارية']);
        expect(out.derivedDepartment).toBe('الكباتن');
        expect(out.visible).toBe(true);
    });

    it('يُظهر الهاتف — لوحة الأدمن تحتاجه للتمييز بين متشابهي الأسماء', () => {
        expect(toAdminTeamMember(user()).phone).toBe('249912345678');
    });
});

describe('ترتيب العرض', () => {
    const { compareTeamOrder } = require('../utils/teamProfile');
    const sortNames = (list) => [...list].sort(compareTeamOrder).map(u => u.name);

    it('🔒 من رُتِّب عمداً يتقدّم على من لا ترتيب له', () => {
        // ⚠️ العطل الحقيقي: sort في Mongo يعامل الحقل الغائب null وهو أصغر من أي
        // رقم، فبعد الهجرة انتقل المؤسّس والمدراء — وهم وحدهم من حملوا ترتيباً —
        // إلى آخر القائمة خلف ٩٥ تاجراً.
        const list = [
            user({ name: 'تاجر', role: 'merchant', teamProfile: {} }),
            user({ name: 'المؤسّس', role: 'admin', teamProfile: { order: 0 } }),
            user({ name: 'كابتن', teamProfile: undefined })
        ];
        expect(sortNames(list)[0]).toBe('المؤسّس');
    });

    it('يحترم الأرقام تصاعدياً', () => {
        const list = [
            user({ name: 'ثالث', teamProfile: { order: 2 } }),
            user({ name: 'أول', teamProfile: { order: 0 } }),
            user({ name: 'ثانٍ', teamProfile: { order: 1 } })
        ];
        expect(sortNames(list)).toEqual(['أول', 'ثانٍ', 'ثالث']);
    });

    it('المتساوون وبلا ترتيب يُرتَّبون أبجدياً لا عشوائياً', () => {
        // ترتيب مستقرّ يعني أن الصفحة لا تتبدّل بين تحديث وآخر
        const list = [
            user({ name: 'ياسر', teamProfile: {} }),
            user({ name: 'أحمد', teamProfile: {} }),
            user({ name: 'خالد', teamProfile: {} })
        ];
        expect(sortNames(list)).toEqual(['أحمد', 'خالد', 'ياسر']);
    });
});

describe('المعرّف العام', () => {
    it('24 محرف hex — نفس شكل روابط البطاقات', () => {
        expect(generatePublicId()).toMatch(/^[a-f0-9]{24}$/);
    });

    it('لا يتكرّر عبر آلاف التوليدات', () => {
        const set = new Set(Array.from({ length: 5000 }, generatePublicId));
        expect(set.size).toBe(5000);
    });
});
