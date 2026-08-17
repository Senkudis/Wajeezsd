const express = require('express');
const router = express.Router();
const validateObjectId = require('../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب)
router.param('id', validateObjectId);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const jimpModule = require('jimp');
const Jimp = jimpModule.Jimp || jimpModule;
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { MIME_EXT, detectImageExtOfFile, safeUnlink, safeUploadName } = require('../utils/imageUpload');
const User = require('../models/User');
const logger = require('../utils/logger');

// 🛡️ يمنع أي دور غير المطلوب من الوصول لـ multer أصلاً.
// كان فحص الدور يأتي بعد كتابة الملف على القرص، فالـ 403 لا يمنع الرفع.
const requireRole = (role) => (req, res, next) => {
    if (!req.user || req.user.role !== role) {
        return res.status(403).json({ message: 'غير مصرح' });
    }
    next();
};

// 🔄 ضغط وتصغير صورة — متوافق مع Jimp v0.x و v1 معاً.
// السبب: package.json يطلب v1 لكن سيرفر الاستضافة قد يحمل v0 قديمة في node_modules،
// وواجهتا scaleToFit/write مختلفتان بينهما (v0: write(path, cb) — تمرير options كان
// يرمي "cb must be a function" ويُفشل الضغط بصمت على الإنتاج).
async function compressImageFile(filePath, maxSize = 1000, quality = 85) {
    const image = await Jimp.read(filePath);
    const isV0 = typeof image.writeAsync === 'function'; // writeAsync موجودة في v0 فقط
    if (image.bitmap.width > maxSize || image.bitmap.height > maxSize) {
        if (isV0) image.scaleToFit(maxSize, maxSize);
        else image.scaleToFit({ w: maxSize, h: maxSize });
    }
    const isJpeg = /\.jpe?g$/i.test(filePath);
    if (isV0) {
        if (isJpeg && typeof image.quality === 'function') image.quality(quality);
        await image.writeAsync(filePath);
    } else {
        await image.write(filePath, isJpeg ? { quality } : undefined);
    }
}

// ==========================================
// 📁 Multer Storage Config
// ==========================================
// ⚠️ مهم: نكتب الصور داخل public_html/uploads — وهو docroot الذي يخدمه LiteSpeed
// مباشرةً على الاستضافة، فتظهر الصور دائماً بدون الاعتماد على روابط رمزية.
const uploadDir = path.join(__dirname, '..', 'public_html', 'uploads');

// Ensure upload directories exist
// chat: صور الدردشة — مجلد منفصل لأن مهمة الحذف بعد 48 ساعة تعمل عليه وحده
const dirs = ['profiles', 'documents', 'parcels', 'places', 'proofs', 'products', 'chat'];

dirs.forEach(dir => {
    const fullPath = path.join(uploadDir, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

const setUploadType = (type) => (req, res, next) => {
    req.uploadType = type;
    if (!req.params) req.params = {};
    req.params.type = type;
    next();
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.uploadType || req.params?.type || 'profiles';
        cb(null, path.join(uploadDir, type));
    },
    filename: (req, file, cb) => {
        // 🛡️ CRITICAL: الامتداد من القائمة البيضاء — لا من اسم الملف الذي يرسله العميل.
        // كان path.extname(file.originalname) يسمح برفع "shell.php" أو "x.html"
        // (لأن fileFilter يفحص mimetype وهي ترويسة يزوّرها العميل بحرية) فيُحفظ
        // داخل public_html ويُقدَّم من نفس أصل التطبيق ⇒ XSS مخزّن، واحتمال تنفيذ PHP.
        cb(null, safeUploadName(req.user._id, file.mimetype));
    }
});

const fileFilter = (req, file, cb) => {
    // فحص مبدئي فقط — mimetype غير موثوقة. التحقق الحقيقي بعد الكتابة عبر magic bytes.
    // نضيف HEIC/HEIF لأن iOS يرسلها بهذا الـ MIME ولكن الضغط في الـ frontend يحوّلها JPEG.
    const ALLOWED = { ...MIME_EXT, 'image/heic': '.jpg', 'image/heif': '.jpg' };
    if (ALLOWED[file.mimetype]) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم — يرجى رفع JPG أو PNG أو WebP'), false);
    }
};

/**
 * 🛡️ يتحقق أن كل ملف مرفوع صورة حقيقية بفحص محتواه، ويحذف المزيّف.
 * يُستدعى بعد multer لأن ترويسة Content-Type وحدها لا تثبت شيئاً.
 * @returns {Promise<string|null>} رسالة الخطأ، أو null عند السلامة
 */
async function rejectNonImages(req) {
    const files = [];
    if (req.file) files.push(req.file);
    if (req.files) {
        // upload.fields يعطي كائناً {حقل: [ملفات]}، وupload.array يعطي مصفوفة
        for (const v of Object.values(req.files)) {
            Array.isArray(v) ? files.push(...v) : files.push(v);
        }
    }

    for (const f of files) {
        const realExt = await detectImageExtOfFile(f.path);
        if (!realExt) {
            // محتوى ليس صورة إطلاقاً — احذف كل ملفات هذا الطلب ولا تُبقِ أثراً
            await Promise.all(files.map(x => safeUnlink(x.path)));
            return 'الملف ليس صورة صالحة';
        }
    }
    return null;
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// ==========================================
// 📷 1. رفع صورة البروفايل (Profile Photo)
// ==========================================
router.post('/profile-photo', protect, setUploadType('profiles'), (req, res) => {
    req.params.type = 'profiles';
    upload.single('photo')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        // 🗜️ الضغط ليس تحسيناً هنا بل شرط صلاحية:
        // هذه الصورة تظهر أيضاً في صفحة الفريق العامة التي تعرض ٢٤ صورة دفعةً
        // واحدة. صورة هاتف خام (٣–٥ ميغا) × ٢٤ = عشرات الميغابايت على بيانات
        // الجوال في كل فتحة للصفحة. ٨٠٠px تكفي لأكبر عرض (١١٦px على شاشة ×2).
        try {
            await compressImageFile(req.file.path, 800, 82);
        } catch (e) {
            logger.warn({ err: e }, '[Upload] تعذّر ضغط صورة البروفايل — تُحفظ كما هي');
        }

        const fileUrl = `/uploads/profiles/${req.file.filename}`;
        const previous = req.user.documents && req.user.documents.profilePhoto;

        // Update user profile photo
        await User.findByIdAndUpdate(req.user._id, {
            'documents.profilePhoto': fileUrl
        });

        // 🧹 حذف الصورة السابقة بعد نجاح التحديث لا قبله: الحذف أولاً يعني أن
        // فشل الكتابة يترك المستخدم بلا صورة إطلاقاً. مقيّد بمجلد الملفات
        // الشخصية كي لا يمسّ مساراً خارجياً أو صورة يشاركها سجلّ آخر.
        if (previous && previous !== fileUrl && previous.startsWith('/uploads/profiles/')) {
            safeUnlink(path.join(uploadDir, 'profiles', path.basename(previous)));
        }

        res.json({
            success: true,
            message: 'تم رفع الصورة بنجاح',
            url: fileUrl
        });
    });
});

// ==========================================
// 📄 2. رفع وثائق الكابتن (Captain Documents)
// ==========================================
router.post('/captain-docs', protect, setUploadType('documents'), (req, res) => {
    req.params.type = 'documents';
    const uploadFields = upload.fields([
        { name: 'driverLicense', maxCount: 1 },
        { name: 'profilePhoto', maxCount: 1 },
        { name: 'vehiclePhoto', maxCount: 1 }
    ]);

    uploadFields(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الملفات' });
        }
        // بلا هذا كان req.files غير معرّف عند طلب بلا ملفات ⇒ TypeError ⇒ 500
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ message: 'لم يتم اختيار أي ملف' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        const updates = {};
        if (req.files.driverLicense) {
            updates['documents.driverLicense'] = `/uploads/documents/${req.files.driverLicense[0].filename}`;
        }
        if (req.files.profilePhoto) {
            updates['documents.profilePhoto'] = `/uploads/documents/${req.files.profilePhoto[0].filename}`;
        }
        if (req.files.vehiclePhoto) {
            updates['documents.vehiclePhoto'] = `/uploads/documents/${req.files.vehiclePhoto[0].filename}`;
        }

        if (Object.keys(updates).length > 0) {
            await User.findByIdAndUpdate(req.user._id, updates);
        }

        // 🔔 تنبيه الإدارة: الكابتن يُبلَّغ عند التسجيل بأن «طلبه سيُراجَع»، ولم يكن
        // أحد يُخبر الإدارة بذلك إطلاقاً — فيبقى ينتظر اعتماداً لا يعلم به أحد.
        // اللحظة هي رفع الوثائق لا التسجيل: قبلها لا شيء لتراجعه الإدارة.
        if (req.user.role === 'captain' && req.user.approvalStatus === 'pending') {
            try {
                const { notifyAdmins } = require('../utils/notificationHelper');
                await notifyAdmins(req.app, {
                    title: 'كابتن جديد بانتظار الاعتماد',
                    message: `${req.user.name || 'كابتن'} رفع وثائقه ويحتاج مراجعة`,
                    type: 'captain_pending',
                    relatedId: req.user._id
                });
            } catch (e) {
                logger.error({ err: e }, 'تعذّر تنبيه الإدارة برفع وثائق كابتن (غير حرج)');
            }
        }

        res.json({
            success: true,
            message: 'تم رفع الوثائق بنجاح',
            files: updates
        });
    });
});

// ==========================================
// 📦 3. رفع صورة الشحنة (Parcel Image)
// ==========================================
router.post('/parcel-image', protect, setUploadType('parcels'), (req, res) => {
    req.params.type = 'parcels';
    upload.single('parcelImage')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        const fileUrl = `/uploads/parcels/${req.file.filename}`;

        res.json({
            success: true,
            message: 'تم رفع صورة الشحنة',
            url: fileUrl
        });
    });
});

// ==========================================
// 💬 3.5 رفع صورة داخل الدردشة (Chat Image)
// ==========================================
// صور فقط — لا ملفات عامة. rejectNonImages يفحص magic bytes بعد الكتابة فلا
// تنفع ترويسة mimetype مزوّرة، والصورة تُضغط لأن شبكات السودان بطيئة والصورة
// ستُحذف بعد 48 ساعة على أي حال فلا معنى لتخزين 5 ميجا.
router.post('/chat-image', protect, setUploadType('chat'), (req, res) => {
    req.params.type = 'chat';
    upload.single('image')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        try {
            await compressImageFile(req.file.path, 1200, 80);
        } catch (compressErr) {
            // الضغط تحسين لا شرط — الصورة الأصلية مكتوبة وصالحة
            logger.warn({ err: compressErr }, 'Chat image compression failed');
        }

        res.json({
            success: true,
            message: 'تم رفع الصورة',
            url: `/uploads/chat/${req.file.filename}`
        });
    });
});

// ==========================================
// 🏪 4. رفع صورة غلاف المحل (Place Image) - Admin Only
// ==========================================
router.post('/place-image', protect, requireRole('admin'), setUploadType('places'), (req, res) => {
    req.params.type = 'places';
    upload.single('placeImage')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        const fileUrl = `/uploads/places/${req.file.filename}`;
        res.json({ success: true, url: fileUrl });
    });
});

// ==========================================
// 📸 5. رفع صورة إثبات الاستلام (Proof of Pickup) — Captain Only
// ==========================================
router.post('/proof-image', protect, requireRole('captain'), setUploadType('proofs'), (req, res) => {
    req.params.type = 'proofs';
    upload.single('proofImage')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع صورة الإثبات' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        const fileUrl = `/uploads/proofs/${req.file.filename}`;
        res.json({
            success: true,
            message: 'تم رفع صورة الإثبات بنجاح',
            url: fileUrl
        });
    });
});

// ==========================================
// 🏪 6. رفع صور التاجر (Merchant Registration Proofs)
// ==========================================
router.post('/merchant-proof', protect, setUploadType('proofs'), (req, res) => {
    req.params.type = 'proofs';
    upload.single('image')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        const fileUrl = `/uploads/proofs/${req.file.filename}`;
        res.json({
            success: true,
            message: 'تم رفع الصورة بنجاح',
            url: fileUrl
        });
    });
});

// ==========================================
// 🍔 7. رفع صورة المنتج (Product Image)
// ==========================================
router.post('/product-image', protect, setUploadType('products'), (req, res) => {
    req.params.type = 'products';
    upload.single('image')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        try {
            await compressImageFile(req.file.path);
        } catch (jimpErr) {
            logger.error({ err: jimpErr }, 'Error compressing product image');
            // نستمر في العمل حتى لو فشل الضغط
        }

        const fileUrl = `/uploads/products/${req.file.filename}`;
        res.json({
            success: true,
            message: 'تم رفع صورة المنتج بنجاح',
            url: fileUrl
        });
    });
});

// ==========================================
// 🏪 رفع صورة المتجر من قِبل التاجر نفسه (لبروفايل متجره)
//    POST /api/upload/shop-image  (merchant)
//    place-image أعلاه للأدمن فقط؛ هذا يسمح للتاجر برفع صورة متجره الخاص.
// ==========================================
router.post('/shop-image', protect, requireRole('merchant'), setUploadType('places'), (req, res) => {
    req.params.type = 'places';
    upload.single('image')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        try {
            await compressImageFile(req.file.path);
        } catch (jimpErr) {
            logger.error({ err: jimpErr }, 'Error compressing shop image');
        }

        const fileUrl = `/uploads/places/${req.file.filename}`;
        res.json({ success: true, message: 'تم رفع صورة المتجر بنجاح', url: fileUrl });
    });
});

// ==========================================
// 👮 8. رفع صورة بروفايل الكابتن من لوحة الإدارة
//    POST /api/upload/admin/captain-photo/:id  (adminOnly)
//    الإدارة تختار صورة لكابتن معيّن فتُحفظ في documents.profilePhoto
//    ثم تظهر للعميل عند ربطه بهذا الكابتن في طلب.
// ==========================================
const captainPhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(uploadDir, 'profiles')),
    // 🛡️ الامتداد من القائمة البيضاء لا من اسم الملف — نفس ثغرة storage أعلاه
    filename: (req, file, cb) => cb(null, safeUploadName(`captain${req.params.id}`, file.mimetype))
});
const captainPhotoUpload = multer({ storage: captainPhotoStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/admin/captain-photo/:id', protect, adminOnly, (req, res) => {
    // تحقق من صحة المعرّف قبل حفظ أي ملف لتجنّب ملفات يتيمة
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'معرف المستخدم غير صحيح' });
    }

    captainPhotoUpload.single('photo')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        try {
            const fileUrl = `/uploads/profiles/${req.file.filename}`;
            const target = await User.findByIdAndUpdate(
                req.params.id,
                { 'documents.profilePhoto': fileUrl },
                { new: true }
            ).select('_id name documents.profilePhoto');

            if (!target) {
                return res.status(404).json({ message: 'المستخدم غير موجود' });
            }

            res.json({
                success: true,
                message: 'تم تحديث صورة الكابتن بنجاح',
                url: fileUrl
            });
        } catch (e) {
            return res.status(500).json({ message: 'تعذّر حفظ صورة الكابتن' });
        }
    });
});

// 🪪 صورة بطاقة الفريق العامة — منفصلة عن documents.profilePhoto عمداً:
// صورة الوثائق هي ما رفعه الكابتن عند التسجيل (قد تكون رديئة أو غير لائقة للنشر)،
// وهذه هي الصورة التي يختارها الأدمن للعرض العلني. الأولى تبقى كما هي للتحقق.
const teamPhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(uploadDir, 'profiles')),
    filename: (req, file, cb) => cb(null, safeUploadName(`team${req.params.id}`, file.mimetype))
});
const teamPhotoUpload = multer({ storage: teamPhotoStorage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/admin/team-photo/:id', protect, adminOnly, (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'معرف المستخدم غير صحيح' });
    }

    teamPhotoUpload.single('photo')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        const bad = await rejectNonImages(req);
        if (bad) return res.status(400).json({ message: bad });

        try {
            const fileUrl = `/uploads/profiles/${req.file.filename}`;
            const target = await User.findByIdAndUpdate(
                req.params.id,
                { 'teamProfile.photo': fileUrl },
                { new: true }
            ).select('_id name teamProfile.photo');

            if (!target) {
                return res.status(404).json({ message: 'المستخدم غير موجود' });
            }

            res.json({ success: true, message: 'تم تحديث صورة البطاقة', url: fileUrl });
        } catch (e) {
            return res.status(500).json({ message: 'تعذّر حفظ صورة البطاقة' });
        }
    });
});

module.exports = router;
