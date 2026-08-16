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
 *   node scripts/migrate-team-captains.js --apply --fetch-images
 *
 * الخيارات:
 *   --dry-run        (افتراضي) يعرض ما سيحدث دون أي كتابة
 *   --apply          ينفّذ التعديلات فعلياً
 *   --overwrite      يستبدل قيمة موجودة في teamProfile بدل تخطّيها
 *   --fetch-images   ينزّل صور الأعضاء من الموقع القديم إلى public_html/uploads/profiles
 *
 * البيئة:
 *   MONGO_URI              قاعدة بيانات وجيز (من .env — نفس الاسم في config/db.js)
 *   OLD_TEAM_MONGODB_URI   قاعدة بيانات captin-verfiy القديمة
 *   OLD_TEAM_COLLECTION    اسم المجموعة القديمة (افتراضي: captains)
 *   OLD_TEAM_BASE_URL      أصل الموقع القديم لتنزيل الصور (افتراضي: https://captain.wassili.site)
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const normalizePhone = require('../utils/phoneNormalizer');
const { generatePublicId, DEPARTMENTS } = require('../utils/teamProfile');

const APPLY = process.argv.includes('--apply');
const OVERWRITE = process.argv.includes('--overwrite');
const FETCH_IMAGES = process.argv.includes('--fetch-images');
const OLD_COLLECTION = process.env.OLD_TEAM_COLLECTION || 'captains';
const OLD_BASE_URL = (process.env.OLD_TEAM_BASE_URL || 'https://captain.wassili.site').replace(/\/+$/, '');

const UPLOADS_DIR = path.join(__dirname, '..', 'public_html', 'uploads', 'profiles');

function log(...args) { console.log(...args); }

/**
 * الصورة القديمة.
 *
 * ⚠️ مسارات `/uploads/captains/...` تشير إلى قرص السيرفر القديم لا الجديد،
 * فنقلها حرفياً يعطي ١٨ صورة مكسورة من أصل ١٩. لذلك لا يُنقل المسار إلا إذا
 * كان الملف موجوداً فعلاً في رفوعات وجيز، أو نُزِّل بـ --fetch-images.
 * غير ذلك تُترك فارغة فيقع الاشتقاق على `documents.profilePhoto` — صورة
 * التسجيل الحقيقية للكابتن، وهي أضمن من رابط ميّت.
 *
 * @returns {{url:string, note:string}}
 */
function resolvePhoto(doc) {
    const raw = String(doc.imageUrl || '').trim();
    if (raw === '') return { url: '', note: '' };

    // رابط خارجي كامل يعمل كما هو
    if (/^https:\/\//i.test(raw)) return { url: raw, note: '' };
    if (!raw.startsWith('/uploads/')) return { url: '', note: 'مسار صورة غير مفهوم' };

    const fileName = path.basename(raw);
    const localPath = path.join(UPLOADS_DIR, fileName);
    if (fs.existsSync(localPath)) {
        return { url: `/uploads/profiles/${fileName}`, note: '' };
    }
    return { url: '', note: 'الصورة على السيرفر القديم فقط' };
}

/** ينزّل صورة من الموقع القديم إلى رفوعات وجيز ويُرجع مسارها الجديد. */
async function fetchPhoto(oldPath) {
    const url = OLD_BASE_URL + oldPath;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const type = res.headers.get('content-type') || '';
    if (!/^image\//.test(type)) throw new Error('المحتوى ليس صورة');

    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[type.split(';')[0]] || '.jpg';
    const name = `team_${Date.now()}_${crypto.randomBytes(5).toString('hex')}${ext}`;

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(await res.arrayBuffer()));
    return `/uploads/profiles/${name}`;
}

/** المسمّيات القديمة: الحقل الجديد jobTitles أولاً، ثم jobTitle المفرد القديم. */
function extractTitles(doc) {
    if (Array.isArray(doc.jobTitles) && doc.jobTitles.length > 0) {
        return doc.jobTitles.map(t => String(t).trim()).filter(Boolean);
    }
    const single = String(doc.jobTitle || '').trim();
    return single ? [single] : [];
}

/**
 * تنظيف المسمّيات قبل النقل.
 *
 * الموقع القديم يحمل مسمّيات مثل «كابتن لدى وصل لي» — نقلها حرفياً يعيد
 * العلامة القديمة إلى الصفحة الجديدة، وهو أوّل ما طُلب إزالته. وهي أيضاً
 * أفقر من الاشتقاق التلقائي («كابتن دراجة نارية») فلا قيمة في الإبقاء عليها.
 *
 * القاعدة: مسمّى الكابتن العام يُسقَط ليتولّى الاشتقاق، وما عداه يُبقى مع
 * استبدال اسم العلامة القديم.
 */
function sanitizeTitles(titles) {
    const OLD_BRAND = /وص(?:ّ)?ل\s*لي/g;
    const GENERIC_CAPTAIN = /^كابتن(\s+(لدى|في|مع)\s+.*)?$/;

    const cleaned = [];
    for (const raw of titles) {
        const withoutBrand = raw.replace(OLD_BRAND, 'وجيز').replace(/\s+/g, ' ').trim();
        // «كابتن» أو «كابتن لدى وجيز» ⇒ اتركه للاشتقاق التلقائي
        if (GENERIC_CAPTAIN.test(withoutBrand)) continue;
        if (withoutBrand.length < 2 || withoutBrand.length > 100) continue;
        if (!cleaned.includes(withoutBrand)) cleaned.push(withoutBrand);
    }
    return cleaned.slice(0, 5);
}

/**
 * توحيد اسم القسم مع الأقسام المشتقّة.
 * «كباتن» و«الكباتن» قسمان مختلفان في شريط الفلترة رغم أنهما واحد — التوحيد
 * هنا يمنع ظهور زرّين لنفس القسم في الصفحة العامة.
 */
function normalizeDept(value, role) {
    const raw = String(value || '').trim();
    if (raw === '') return '';

    const canonical = Object.values(DEPARTMENTS);
    let dept = raw;
    if (!canonical.includes(dept)) {
        // «كباتن» ⇒ «الكباتن»، «ادارة»/«الادارة» ⇒ «الإدارة»
        const match = canonical.find(c => c.replace(/^ال/, '') === dept.replace(/^ال/, ''));
        if (match) dept = match;
        else if (/^(ادار|إدار)/.test(dept)) dept = DEPARTMENTS.admin;
        else return dept.slice(0, 100); // قسم مخصّص فعلاً مثل «التسويق»
    }

    // مطابق للافتراضي المشتقّ من الدور ⇒ لا يُخزَّن. تخزينه يجعل اللوحة تعرضه
    // كقيمة كتبها أدمن يدوياً، فيتجمّد القسم ولا يتبع الدور إن تغيّر لاحقاً.
    return dept === (DEPARTMENTS[role] || '') ? '' : dept;
}

async function main() {
    // MONGO_URI لا MONGODB_URI: هذا اسم المتغيّر في هذا المشروع (config/db.js)،
    // والمشروع القديم كان يسمّيه MONGODB_URI — الخلط بينهما يوقف السكربت بلا سبب واضح.
    const newUri = process.env.MONGO_URI;
    const oldUri = process.env.OLD_TEAM_MONGODB_URI;

    if (!newUri) {
        console.error('✖ MONGO_URI غير مضبوط — راجع ملف .env');
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
        const stats = { matched: 0, updated: 0, skippedNoPhone: 0, skippedNoUser: 0, skippedNothing: 0, photosMissing: 0, photosFetched: 0 };
        const unmatched = [];
        const foreignNumbers = [];

        for (const doc of oldDocs) {
            const rawPhone = String(doc.phoneNumber || doc.phone || '');
            const phone = normalizePhone(rawPhone);
            if (!phone) {
                stats.skippedNoPhone++;
                continue;
            }

            // ⚠️ normalizePhone سوداني الافتراض: رقم بمقدّمة دولة أخرى (+20 مثلاً)
            // يخرج منه «249» ملصقة على رقم كامل — لا يطابق شيئاً ولا يشتكي.
            // نرصده صراحةً بدل أن يُحسَب «بلا حساب مطابق» ويضيع سببه.
            const digits = rawPhone.replace(/[^0-9]/g, '');
            if (digits.length >= 10 && !digits.startsWith('249') && !digits.startsWith('0')) {
                foreignNumbers.push(`${doc.name || '?'} — ${rawPhone}`);
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

            const notes = [];

            const titles = sanitizeTitles(extractTitles(doc));
            if (titles.length > 0 && (OVERWRITE || !(existing.jobTitles || []).length)) {
                set['teamProfile.jobTitles'] = titles;
            }

            const dept = normalizeDept(doc.department, user.role);
            if (dept && (OVERWRITE || !existing.department)) {
                set['teamProfile.department'] = dept;
            }

            const photo = resolvePhoto(doc);
            let photoUrl = photo.url;
            if (!photoUrl && photo.note === 'الصورة على السيرفر القديم فقط') {
                if (FETCH_IMAGES && APPLY) {
                    try {
                        photoUrl = await fetchPhoto(doc.imageUrl);
                        stats.photosFetched++;
                    } catch (err) {
                        notes.push(`تعذّر تنزيل الصورة (${err.message})`);
                        stats.photosMissing++;
                    }
                } else {
                    notes.push(FETCH_IMAGES ? 'ستُنزَّل الصورة عند --apply' : 'الصورة متروكة ⇒ تُستعمل صورة التسجيل');
                    stats.photosMissing++;
                }
            }
            if (photoUrl && (OVERWRITE || !existing.photo)) {
                set['teamProfile.photo'] = photoUrl;
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

            const fields = Object.keys(set).map(k => k.replace('teamProfile.', '')).join(', ');
            log(`  ✎ ${user.name} (${user.phone}) ← ${fields}`);
            if (set['teamProfile.jobTitles']) {
                log(`      المسمّيات: ${set['teamProfile.jobTitles'].join(' • ')}`);
            }
            notes.forEach(n => log(`      ⚠ ${n}`));

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
        log(`صور على السيرفر القديم: ${stats.photosMissing}`);
        if (stats.photosFetched) log(`صور نُزِّلت          : ${stats.photosFetched}`);

        if (unmatched.length > 0) {
            log('\n⚠ سجلات قديمة بلا حساب مطابق في وجيز — تحتاج إنشاء حساب أولاً:');
            unmatched.forEach(line => log('   • ' + line));
        }

        if (foreignNumbers.length > 0) {
            log('\n⚠ أرقام بمقدّمة دولة غير سودانية — المطابقة الآلية لا تصلح لها، راجعها يدوياً:');
            foreignNumbers.forEach(line => log('   • ' + line));
        }

        if (stats.photosMissing > 0 && !FETCH_IMAGES) {
            log('\nℹ صور الأعضاء موجودة على السيرفر القديم فقط. أضف --fetch-images لتنزيلها،');
            log('  أو اتركها فتُستعمل صورة التسجيل الموجودة في وجيز.');
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
