const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const jimpModule = require('jimp');
const Jimp = jimpModule.Jimp || jimpModule;
const { protect, adminOnly } = require('../middleware/authMiddleware');
const User = require('../models/User');

// ==========================================
// 📁 Multer Storage Config
// ==========================================
// ⚠️ مهم: نكتب الصور داخل public_html/uploads — وهو docroot الذي يخدمه LiteSpeed
// مباشرةً على الاستضافة، فتظهر الصور دائماً بدون الاعتماد على روابط رمزية.
const uploadDir = path.join(__dirname, '..', 'public_html', 'uploads');

// Ensure upload directories exist
const dirs = ['profiles', 'documents', 'parcels', 'places', 'proofs', 'products'];

dirs.forEach(dir => {
    const fullPath = path.join(uploadDir, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.params.type || 'profiles';
        cb(null, path.join(uploadDir, type));
    },
    filename: (req, file, cb) => {
        const uniqueName = `${req.user._id}_${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم — يرجى رفع JPG أو PNG أو WebP'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// ==========================================
// 📷 1. رفع صورة البروفايل (Profile Photo)
// ==========================================
router.post('/profile-photo', protect, (req, res) => {
    req.params.type = 'profiles';
    upload.single('photo')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }

        const fileUrl = `/uploads/profiles/${req.file.filename}`;

        // Update user profile photo
        await User.findByIdAndUpdate(req.user._id, {
            'documents.profilePhoto': fileUrl
        });

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
router.post('/captain-docs', protect, (req, res) => {
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
router.post('/parcel-image', protect, (req, res) => {
    req.params.type = 'parcels';
    upload.single('parcelImage')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }

        const fileUrl = `/uploads/parcels/${req.file.filename}`;

        res.json({
            success: true,
            message: 'تم رفع صورة الشحنة',
            url: fileUrl
        });
    });
});

// ==========================================
// 🏪 4. رفع صورة غلاف المحل (Place Image) - Admin Only
// ==========================================
router.post('/place-image', protect, (req, res) => {
    req.params.type = 'places';
    upload.single('placeImage')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admins only' });
        }

        const fileUrl = `/uploads/places/${req.file.filename}`;
        res.json({ success: true, url: fileUrl });
    });
});

// ==========================================
// 📸 5. رفع صورة إثبات الاستلام (Proof of Pickup) — Captain Only
// ==========================================
router.post('/proof-image', protect, (req, res) => {
    req.params.type = 'proofs';
    upload.single('proofImage')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع صورة الإثبات' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        if (req.user.role !== 'captain') {
            return res.status(403).json({ message: 'مخصص للكباتن فقط' });
        }

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
router.post('/merchant-proof', protect, (req, res) => {
    req.params.type = 'proofs';
    upload.single('image')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }

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
router.post('/product-image', protect, (req, res) => {
    req.params.type = 'products';
    upload.single('image')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }

        try {
            // 🔄 ضغط وتصغير الصورة (Jimp v1: scaleToFit يأخذ كائن، والجودة تُمرر في خيارات write)
            const image = await Jimp.read(req.file.path);
            if (image.bitmap.width > 1000 || image.bitmap.height > 1000) {
                image.scaleToFit(1000, 1000);
            }
            // جودة 85% لتقليل الحجم مع الحفاظ على وضوح عالي للعين (تنطبق على JPEG فقط)
            const isJpeg = /\.jpe?g$/i.test(req.file.path);
            await image.write(req.file.path, isJpeg ? { quality: 85 } : undefined);
        } catch (jimpErr) {
            console.error('Error compressing product image:', jimpErr);
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
router.post('/shop-image', protect, (req, res) => {
    req.params.type = 'places';
    upload.single('image')(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || 'خطأ في رفع الصورة' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'لم يتم اختيار صورة' });
        }
        if (req.user.role !== 'merchant') {
            return res.status(403).json({ message: 'للتجار فقط' });
        }

        try {
            const image = await Jimp.read(req.file.path);
            if (image.bitmap.width > 1000 || image.bitmap.height > 1000) {
                image.scaleToFit(1000, 1000);
            }
            const isJpeg = /\.jpe?g$/i.test(req.file.path);
            await image.write(req.file.path, isJpeg ? { quality: 85 } : undefined);
        } catch (jimpErr) {
            console.error('Error compressing shop image:', jimpErr);
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
    filename: (req, file, cb) => cb(null, `captain_${req.params.id}_${Date.now()}${path.extname(file.originalname)}`)
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

module.exports = router;
