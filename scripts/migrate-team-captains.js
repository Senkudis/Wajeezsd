/**
 * 🪪 هجرة بيانات موقع الكباتن القديم (captin-verfiy) إلى بطاقات الفريق.
 *
 * الموقع القديم كان يحمل مجموعة `captains` مستقلة تُملأ يدوياً بالاسم والمسمّى
 * الوظيفي والقسم والصورة. بعد الدمج صار مصدر الحقيقة هو `users`، فهذا السكربت
 * يمرّ على السجلات القديمة ويُلحق ما يستحق النقل بحساب المستخدم المطابق.
 *
 * المطابقة بالهاتف بعد التطبيع (utils/phoneNormalizer.js): الأسماء تُكتب
 * بصيغ مختلفة ولا يُعتمد عليها للمطابقة، والرقم هو المعرّف الفعلي للحساب في
 * هذا النظام (فريد في مجموعة users).
 *
 * ما يُنقل: المسمّيات الوظيفية والقسم والصورة — أي ما كتبه إنسانٌ يدوياً ولا
 * يمكن اشتقاقه. ما لا يُنقل: الاسم والهاتف (بيانات الحساب الرسمية أدقّ).
 *
 * الاستعمال:
 *   node scripts/migrate-team-captains.js --dry-run
 *   node scripts/migrate-team-captains.js --apply
 *   node scripts/migrate-team-captains.js --apply --overwrite
 *
 * الخيارات:
 *   --dry-run     (افتراضي) يعرض ما سيحدث دون أي كتابة
 *   --apply       ينفّذ التعديلات فعلياً
 *   --overwrite   يستبدل قيمة موجودة في teamProfile بدل تخطّيها
 *
 * البيئة:
 *   MONGODB_URI            قاعدة بيانات وجيز (من .env)
 *   OLD_TEAM_MONGODB_URI   قاعدة بيانات captin-verfiy القديمة
 *   OLD_TEAM_COLLECTION    اسم المجموعة القديمة (افتراضي: captains)
 */

require('dotenv').config();

const mongoose = require('mongoose');
const normalizePhone = require('../utils/phoneNormalizer');
const { generatePublicId } = require('../utils/teamProfile');

const APPLY = process.argv.includes('--apply');
const OVERWRITE = process.argv.includes('--overwrite');
const OLD_COLLECTION = process.env.OLD_TEAM_COLLECTION || 'captains';

function log(...args) { console.log(...args); }

/** صورة قديمة صالحة للنقل: مسار رفع محلي أو رابط https. */
function usablePhoto(value) {
    const url = String(value || '').trim();
    if (url === '') return '';
    // /uploads/captains/... من السيرفر القديم يقابله /uploads/... في الجديد
    if (url.startsWith('/uploads/')) return url;
    if (url.startsWith('https://')) return url;
    return '';
}

/** المسمّيات القديمة: الحقل الجديد jobTitles أولاً، ثم jobTitle المفرد القديم. */
function extractTitles(doc) {
    if (Array.isArray(doc.jobTitles) && doc.jobTitles.length > 0) {
        return doc.jobTitles.map(t => String(t).trim()).filter(Boolean).slice(0, 5);
    }
    const single = String(doc.jobTitle || '').trim();
    return single ? [single] : [];
}

async function main() {
    const newUri = process.env.MONGODB_URI;
    const oldUri = process.env.OLD_TEAM_MONGODB_URI;

    if (!newUri) {
        console.error('✖ MONGODB_URI غير مضبوط — راجع ملف .env');
        process.exit(1);
    }
    if (!oldUri) {
        console.error('✖ OLD_TEAM_MONGODB_URI غير مضبوط.');
        console.error('  ضع فيه رابط قاعدة بيانات captin-verfiy القديمة ثم أعد التشغيل.');
        process.exit(1);
    }

    log(APPLY ? '⚙ وضع التنفيذ الفعلي' : '👁 وضع المعاينة (لا كتابة) — أضف --apply للتنفيذ');
    if (APPLY && OVERWRITE) log('⚠ الاستبدال مفعّل: القيم الموجودة في teamProfile ستُدهس');

    const oldConn = await mongoose.createConnection(oldUri).asPromise();
    const newConn = await mongoose.createConnection(newUri).asPromise();

    try {
        const oldDocs = await oldConn.collection(OLD_COLLECTION).find({}).toArray();
        log(`\n📦 سجلات في المجموعة القديمة "${OLD_COLLECTION}": ${oldDocs.length}`);
        if (oldDocs.length === 0) {
            log('لا يوجد ما يُنقل.');
            return;
        }

        const users = newConn.collection('users');
        const stats = { matched: 0, updated: 0, skippedNoPhone: 0, skippedNoUser: 0, skippedNothing: 0 };
        const unmatched = [];

        for (const doc of oldDocs) {
            const phone = normalizePhone(doc.phoneNumber || doc.phone);
            if (!phone) {
                stats.skippedNoPhone++;
                continue;
            }

            // الأرقام في users مخزّنة بصيغ متعدّدة تاريخياً — نطابق الرقم المطبَّع
            // وصيغته المحلية (09…) معاً بدل افتراض صيغة واحدة.
            const local = '0' + phone.slice(3);
            const user = await users.findOne({ phone: { $in: [phone, local, '+' + phone] } });

            if (!user) {
                stats.skippedNoUser++;
                unmatched.push(`${doc.name || '?'} — ${doc.phoneNumber || '?'}`);
                continue;
            }

            stats.matched++;
            const existing = user.teamProfile || {};
            const set = {};

            const titles = extractTitles(doc);
            if (titles.length > 0 && (OVERWRITE || !(existing.jobTitles || []).length)) {
                set['teamProfile.jobTitles'] = titles;
            }

            const dept = String(doc.department || '').trim();
            if (dept && (OVERWRITE || !existing.department)) {
                set['teamProfile.department'] = dept.slice(0, 100);
            }

            const photo = usablePhoto(doc.imageUrl);
            if (photo && (OVERWRITE || !existing.photo)) {
                set['teamProfile.photo'] = photo;
            }

            if (typeof doc.order === 'number' && (OVERWRITE || typeof existing.order !== 'number')) {
                set['teamProfile.order'] = doc.order;
            }

            // البطاقات المطبوعة القديمة تحمل روابط الموقع السابق ولا يمكن إنقاذها،
            // لكن نضمن أن لكل عضو منقول معرّفاً عاماً جاهزاً لبطاقته الجديدة.
            if (!existing.publicId) {
                set['teamProfile.publicId'] = generatePublicId();
            }

            if (Object.keys(set).length === 0) {
                stats.skippedNothing++;
                continue;
            }

            log(`  ✎ ${user.name} (${user.phone}) ← ${Object.keys(set).map(k => k.replace('teamProfile.', '')).join(', ')}`);

            if (APPLY) {
                await users.updateOne({ _id: user._id }, { $set: set });
            }
            stats.updated++;
        }

        log('\n──────── الخلاصة ────────');
        log(`مطابَق بحساب موجود : ${stats.matched}`);
        log(`${APPLY ? 'حُدِّث' : 'سيُحدَّث'}            : ${stats.updated}`);
        log(`بلا رقم هاتف        : ${stats.skippedNoPhone}`);
        log(`بلا حساب مطابق      : ${stats.skippedNoUser}`);
        log(`لا جديد لنقله       : ${stats.skippedNothing}`);

        if (unmatched.length > 0) {
            log('\n⚠ سجلات قديمة بلا حساب مطابق في وجيز — تحتاج إنشاء حساب أولاً:');
            unmatched.forEach(line => log('   • ' + line));
        }

        if (!APPLY) log('\n👁 لم يُكتب شيء. أعد التشغيل بـ --apply للتنفيذ.');
    } finally {
        await oldConn.close();
        await newConn.close();
    }
}

main().catch((err) => {
    console.error('✖ فشلت الهجرة:', err.message);
    process.exit(1);
});
