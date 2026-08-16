/**
 * 🪪 بطاقة الفريق العامة — اشتقاق البيانات المعروضة من حساب المستخدم نفسه.
 *
 * صفحة الفريق (team.wajeezsd.com) تُبنى مباشرةً من مجموعة `users`، فلا توجد
 * مجموعة كباتن منفصلة ولا إدخال يدوي: أي كابتن يُعتمَد أو أدمن يُضاف يظهر تلقائياً.
 *
 * القاعدة في كل حقل: ما يكتبه الأدمن في `teamProfile` يتقدّم دائماً على الاشتقاق.
 * الاشتقاق هو القيمة الافتراضية المعقولة لا القيمة النهائية.
 *
 * ⛔ رقم الهاتف لا يخرج من هنا إطلاقاً. البطاقة العامة تثبت أن الشخص معتمد فقط،
 * ورقم التواصل الوحيد المعروض هو رقم دعم وجيز الموحّد. أي إضافة لحقل هاتف
 * في المُسقِط العام تكشف أرقام الكباتن لكل من يمسح بطاقةً وجدها في الشارع.
 */

const crypto = require('crypto');
const { getVehicleLabel } = require('./vehicleTypes');

/** الأدوار التي تظهر في صفحة الفريق. */
const TEAM_ROLES = Object.freeze(['captain', 'admin', 'merchant']);

/** أقسام الفريق — تُستعمل في فلتر الصفحة العامة. */
const DEPARTMENTS = Object.freeze({
    captain: 'الكباتن',
    admin: 'الإدارة',
    merchant: 'الشركاء'
});

const CITY_LABELS = Object.freeze({
    Khartoum: 'الخرطوم',
    PortSudan: 'بورتسودان'
});

/**
 * معرّف عام غُفل للبطاقة المطبوعة.
 * 24 محرفاً hex — نفس طول ObjectId شكلاً (فالروابط القديمة والجديدة متطابقة الشكل)
 * لكن من مصدر عشوائي آمن، فلا يُستدل منه على أي معرّف داخلي ولا على وقت الإنشاء.
 */
function generatePublicId() {
    return crypto.randomBytes(12).toString('hex');
}

/**
 * المسمّى الوظيفي الافتراضي المشتقّ من الدور.
 * الكابتن: نوع مركبته هو مسمّاه الحقيقي أمام الناس («كابتن دراجة نارية»)،
 * والأدمن: super_admin مدير، sub_admin مشرف مدينته.
 *
 * @param {object} user مستند مستخدم (lean أو مستند mongoose)
 * @returns {string[]} قائمة مسمّيات — أولها الأساسي
 */
function deriveJobTitles(user) {
    if (!user) return [];

    if (user.role === 'captain') {
        const vehicle = user.vehicleType ? getVehicleLabel(user.vehicleType) : '';
        return [vehicle ? `كابتن ${vehicle}` : 'كابتن توصيل'];
    }

    if (user.role === 'admin') {
        // adminRole = null يعني أدمن قديم سابق لنظام الصلاحيات ⇒ يُعامَل super_admin
        if (user.adminRole === 'sub_admin') {
            const city = CITY_LABELS[user.city];
            return [city ? `مشرف ${city}` : 'مشرف'];
        }
        return ['مدير النظام'];
    }

    if (user.role === 'merchant') {
        return ['شريك تجاري'];
    }

    return [];
}

/** القسم الافتراضي المشتقّ من الدور. */
function deriveDepartment(user) {
    if (!user) return '';
    return DEPARTMENTS[user.role] || '';
}

/**
 * الصورة المعروضة.
 * الأولوية: صورة الفريق التي يرفعها الأدمن ← الصورة الشخصية في وثائق التسجيل.
 * الفراغ مقصود: الواجهة ترسم صورة رمزية بدلاً من صورة مكسورة.
 */
function derivePhoto(user) {
    if (!user) return '';
    const manual = user.teamProfile && user.teamProfile.photo;
    if (manual && String(manual).trim() !== '') return String(manual).trim();
    const doc = user.documents && user.documents.profilePhoto;
    if (doc && String(doc).trim() !== '') return String(doc).trim();
    return '';
}

/**
 * هل يظهر هذا المستخدم في صفحة الفريق العامة؟
 *
 * الشروط مُطبَّقة أيضاً كفلتر Mongo في routes/team.js — هذه الدالة هي المرجع
 * المقروء ونقطة الاختبار، لا حارس الأداء.
 */
function isTeamVisible(user) {
    if (!user) return false;
    if (!TEAM_ROLES.includes(user.role)) return false;
    if (user.isActive === false) return false;
    if (user.deletedAt) return false;
    // الكباتن والتجار يحتاجون اعتماداً؛ الأدمن approvalStatus عنده 'approved' افتراضاً
    if (user.approvalStatus && user.approvalStatus !== 'approved') return false;
    // الإخفاء اليدوي من لوحة الأدمن — الافتراضي ظاهر
    if (user.teamProfile && user.teamProfile.show === false) return false;
    return true;
}

/**
 * المُسقِط العام — الشكل الوحيد الذي يخرج إلى صفحة الفريق.
 *
 * لا هاتف، لا بريد، لا مدينة، لا رصيد، ولا معرّف داخلي: اسم وصورة ومسمّى وقسم فقط.
 *
 * @param {object} user مستند مستخدم
 * @returns {{publicId:string,name:string,jobTitles:string[],jobTitle:string,department:string,imageUrl:string}}
 */
function toPublicTeamMember(user) {
    const manualTitles = (user.teamProfile && Array.isArray(user.teamProfile.jobTitles))
        ? user.teamProfile.jobTitles.filter(t => typeof t === 'string' && t.trim() !== '').map(t => t.trim())
        : [];
    const jobTitles = manualTitles.length > 0 ? manualTitles : deriveJobTitles(user);

    const manualDept = (user.teamProfile && user.teamProfile.department || '').trim();
    const department = manualDept !== '' ? manualDept : deriveDepartment(user);

    return {
        publicId: (user.teamProfile && user.teamProfile.publicId) || '',
        name: user.name || '',
        jobTitles,
        jobTitle: jobTitles[0] || '',   // توافق مع أي مستهلك يقرأ حقلاً مفرداً
        department,
        imageUrl: derivePhoto(user)
    };
}

/**
 * المُسقِط الإداري — كل ما تحتاجه لوحة الأدمن لتعرض الصف وتعرف ما هو مشتقّ
 * وما هو مكتوب يدوياً. `derived*` يُستعمل كنص شبح في حقول النموذج.
 */
function toAdminTeamMember(user) {
    const tp = user.teamProfile || {};
    return {
        id: String(user._id),
        publicId: tp.publicId || '',
        name: user.name || '',
        phone: user.phone || '',
        role: user.role,
        city: user.city || '',
        show: tp.show !== false,
        order: typeof tp.order === 'number' ? tp.order : 0,
        jobTitles: Array.isArray(tp.jobTitles) ? tp.jobTitles : [],
        department: tp.department || '',
        photo: tp.photo || '',
        derivedJobTitles: deriveJobTitles(user),
        derivedDepartment: deriveDepartment(user),
        effectiveImage: derivePhoto(user),
        visible: isTeamVisible(user)
    };
}

module.exports = {
    TEAM_ROLES,
    DEPARTMENTS,
    CITY_LABELS,
    generatePublicId,
    deriveJobTitles,
    deriveDepartment,
    derivePhoto,
    isTeamVisible,
    toPublicTeamMember,
    toAdminTeamMember
};
