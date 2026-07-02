const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const MerchantRequest = require('../models/MerchantRequest');
const Place = require('../models/Place');
const PlaceCategory = require('../models/PlaceCategory');
const User = require('../models/User');
const Settings = require('../models/Settings');
const Marketer = require('../models/Marketer');
const Referral = require('../models/Referral');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');
const { logAdminAction } = require('../utils/adminLogger');

// GET /form-data (public)
router.get('/form-data', async (req, res) => {
    try {
        const settings = await Settings.getSettings();
        const categories = await PlaceCategory.find({ isActive: true });
        
        res.json({
            banks: settings.availableBanks || [],
            categories
        });
    } catch (error) {
        logger.error('Error fetching form data:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST / (client submits request, protect, check if user already has pending request)
router.post('/', protect, async (req, res) => {
    try {
        // Check if user already has a pending or approved request (prevent duplicates)
        const existingRequest = await MerchantRequest.findOne({ 
            userId: req.user._id, 
            status: { $in: ['pending', 'approved'] }
        });
        
        if (existingRequest) {
            if (existingRequest.status === 'approved') {
                return res.status(400).json({ message: 'لديك متجر مسجل بالفعل. تواصل مع الإدارة للتعديل.' });
            }
            return res.status(400).json({ message: 'لديك طلب قيد المراجعة بالفعل' });
        }

        const { businessName, ownerName, phone, location, address, category, description, bankAccount, bankAccountNumber, bankAccountOwner, logoImage, idImage, referralSource, referralDetail, referralCode } = req.body;

        const newRequest = new MerchantRequest({
            businessName, ownerName, phone, location, address, category, description,
            bankAccount, bankAccountNumber, bankAccountOwner, logoImage, idImage,
            referralSource: ['social', 'person', 'captain', 'whatsapp', 'google', 'ad', 'market', 'other'].includes(referralSource) ? referralSource : '',
            referralDetail: (referralDetail || '').toString().slice(0, 120),
            userId: req.user._id,
            status: 'pending'
        });

        await newRequest.save();

        // 🔔 إشعار الأدمن بطلب انضمام تاجر جديد (حفظ + socket + push)
        try {
            const { notifyAdmins } = require('../utils/notificationHelper');
            notifyAdmins(req.app, {
                title: 'طلب انضمام تاجر جديد',
                message: `متجر "${businessName || 'غير مسمّى'}" بانتظار المراجعة والموافقة.`,
                type: 'merchant_request',
                relatedId: newRequest._id
            });
        } catch (e) { logger.error('notifyAdmins (merchant request) failed:', e.message); }

        // ✅ تسجيل الإحالة لو جاء التسجيل عبر رابط مسوق
        if (referralCode) {
            try {
                const marketer = await Marketer.findOne({
                    referralCode: referralCode.trim().toUpperCase(),
                    status: 'active'
                });
                if (marketer) {
                    await new Referral({
                        marketerId: marketer._id,
                        referralCode: marketer.referralCode,
                        merchantRequestId: newRequest._id,
                        businessName: businessName || '',
                        ownerName: ownerName || '',
                        phone: phone || ''
                    }).save();
                }
            } catch (refErr) {
                // فشل حفظ الإحالة لا يوقف عملية التسجيل
                logger.error('Referral save error:', refErr.message);
            }
        }

        res.status(201).json(newRequest);
    } catch (error) {
        logger.error('Error creating merchant request:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /my-request (protect, returns latest request for user)
router.get('/my-request', protect, async (req, res) => {
    try {
        const request = await MerchantRequest.findOne({ userId: req.user._id })
            .sort({ createdAt: -1 });
            
        res.json(request || null);
    } catch (error) {
        logger.error('Error fetching my request:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /admin/all (protect, adminOnly, returns all requests sorted by createdAt desc)
router.get('/admin/all', protect, adminOnly, async (req, res) => {
    try {
        const requests = await MerchantRequest.find()
            .populate('userId', 'name phone email')
            .sort({ createdAt: -1 });
            
        res.json(requests);
    } catch (error) {
        logger.error('Error fetching all requests:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /admin/:id/status (protect, adminOnly)
router.put('/admin/:id/status', protect, adminOnly, async (req, res) => {
    try {
        const { status, rejectReason } = req.body;
        const request = await MerchantRequest.findById(req.params.id);

        if (!request) {
            return res.status(404).json({ message: 'الطلب غير موجود' });
        }

        if (status === 'rejected') {
            request.status = 'rejected';
            request.rejectReason = rejectReason;
            await request.save();

            // 🔔 إشعار للمستخدم برفض طلبه
            try {
                const { sendNotification } = require('../utils/notificationHelper');
                await sendNotification(req.app, {
                    userId: request.userId,
                    title: '❌ تم رفض طلب انضمامك كتاجر',
                    message: `سبب الرفض: ${rejectReason || 'لم يتم تحديد السبب'}. يمكنك التواصل مع الإدارة لمزيد من التفاصيل.`,
                    type: 'system',
                    relatedId: request._id
                });
            } catch (notifErr) {
                logger.error('Merchant reject notification error:', notifErr.message);
            }

            await logAdminAction(req, 'reject_store', `تم رفض المتجر: ${request.businessName}`, request._id, request.businessName, { reason: rejectReason });

            return res.json(request);
        }

        if (status === 'approved') {
            const wasAlreadyApproved = request.status === 'approved';

            // Update request details if provided
            const { businessName, ownerName, phone, category, address, description, location, logoImage, idImage } = req.body;
            if (businessName) request.businessName = businessName;
            if (ownerName) request.ownerName = ownerName;
            if (phone) request.phone = phone;
            if (category) request.category = category;
            if (address) request.address = address;
            if (description !== undefined) request.description = description;
            // 🗺️ حدّث الموقع فقط بإحداثيات صالحة — يمنع طمس موقع محفوظ بقيم null/NaN
            if (location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))) {
                request.location = location;
            }
            if (logoImage) request.logoImage = logoImage;
            if (idImage) request.idImage = idImage;

            request.status = 'approved';
            request.rejectReason = '';
            await request.save();

            // Find category
            let categoryDoc = null;
            if (mongoose.Types.ObjectId.isValid(request.category)) {
                categoryDoc = await PlaceCategory.findById(request.category);
            }
            if (!categoryDoc) {
                // Try to find an ACTIVE category with this name first
                categoryDoc = await PlaceCategory.findOne({ name: request.category, isActive: true });
            }
            if (!categoryDoc) {
                // Fallback: any category with this name
                categoryDoc = await PlaceCategory.findOne({ name: request.category });
            }
            if (!categoryDoc) {
                // If not found by name, try to use the first active category
                categoryDoc = await PlaceCategory.findOne({ isActive: true });
            }
            if (!categoryDoc) {
                // If STILL not found, create a generic category so Place validation passes
                categoryDoc = new PlaceCategory({ name: 'أخرى', isActive: true });
                await categoryDoc.save();
            }

            // 🗺️ حارس الموقع: Place يتطلب lat/lng إلزامياً — بدونهما كانت الموافقة
            // تنفجر بخطأ 500 غامض. نرفض مبكراً برسالة واضحة ليعدّل الأدمن الموقع أولاً.
            const reqLat = Number(request.location?.lat);
            const reqLng = Number(request.location?.lng);
            const hasValidLocation = Number.isFinite(reqLat) && Number.isFinite(reqLng);
            if (!hasValidLocation) {
                return res.status(400).json({
                    message: 'لا يمكن الموافقة: موقع المتجر غير محدد. عدّل الطلب وحدد الموقع على الخريطة أولاً.'
                });
            }

            if (wasAlreadyApproved) {
                // Update existing place to avoid duplication
                const existingPlace = await Place.findOne({ ownerId: request.userId });
                if (existingPlace) {
                    existingPlace.name = request.businessName;
                    existingPlace.phone = request.phone;
                    existingPlace.location = request.location;
                    existingPlace.address = request.address;
                    existingPlace.category = categoryDoc._id;
                    if (request.logoImage) existingPlace.image_url = request.logoImage;
                    if (request.description) existingPlace.description = request.description;
                    // 🌍 صحّح المدينة من الإحداثيات إن أمكن (الموقع أصدق من إعداد الحساب)
                    const { cityFromCoords } = require('../utils/geofence');
                    const coordCity = cityFromCoords(reqLat, reqLng);
                    if (coordCity) existingPlace.city = coordCity;
                    await existingPlace.save();
                    return res.json({ request, place: existingPlace, updated: true });
                }
            }

            // 1. Update user role
            await User.findByIdAndUpdate(request.userId, { role: 'merchant' });

            // 2. تحديد مدينة المتجر — الإحداثيات أولاً (مصدر الحقيقة)، ثم مدينة حساب
            //    التاجر كاحتياط. يضمن ظهور المتجر في مدينته الصحيحة في التطبيق.
            const { cityFromCoords } = require('../utils/geofence');
            const merchantUser = await User.findById(request.userId).select('city').lean();
            const merchantCity = cityFromCoords(reqLat, reqLng) || merchantUser?.city || 'Khartoum';

            const newPlace = new Place({
                ownerId: request.userId,
                name: request.businessName,
                phone: request.phone,
                location: request.location,
                address: request.address,
                category: categoryDoc._id,
                image_url: request.logoImage || '',
                description: request.description || '',
                bankAccountName: request.bankAccountOwner || '',
                bankAccountNumber: request.bankAccountNumber || '',
                bankName: request.bankAccount || '',
                city: merchantCity,  // 🌍 Inherit from merchant's user city
                isActive: true,
                isOpenOverride: true, // as requested "is_open: true" via isOpenOverride which feeds virtual
                deliveryAvailable: true
            });

            await newPlace.save();

            // 🔗 كود مشاركة قصير للمتجر الجديد — wajeezsd.com/s/<code>
            try {
                const { ensureShareCode } = require('../utils/shareCode');
                await ensureShareCode(newPlace);
            } catch (scErr) { logger.error('shareCode generation failed:', scErr.message); }

            // 🔔 إشعار للمستخدم بقبول طلبه وتحويله لتاجر
            try {
                const { sendNotification } = require('../utils/notificationHelper');
                await sendNotification(req.app, {
                    userId: request.userId,
                    title: '🎉 تمت الموافقة على طلبك كتاجر!',
                    message: `مبروك! تم قبول طلبك وإنشاء متجرك "${request.businessName}" في وجيز. يمكنك الآن تسجيل الدخول وإدارة متجرك.`,
                    type: 'system',
                    relatedId: newPlace._id
                });
            } catch (notifErr) {
                logger.error('Merchant approve notification error:', notifErr.message);
            }

            await logAdminAction(req, 'approve_store', `تم قبول المتجر: ${request.businessName}`, request.userId, request.businessName, { phone: request.phone });

            // ✅ ربط الإحالة بـ userId و placeId عند القبول (لتتبع الأوردرات لاحقاً)
            try {
                const Referral = require('../models/Referral');
                await Referral.findOneAndUpdate(
                    { merchantRequestId: request._id },
                    {
                        merchantUserId: request.userId,
                        placeId: newPlace._id
                    }
                );
            } catch (refLinkErr) {
                logger.error('Referral place link error:', refLinkErr.message);
            }

            return res.json({ request, place: newPlace });

        }

        res.status(400).json({ message: 'حالة غير صالحة' });

    } catch (error) {
        logger.error('Error updating status:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
