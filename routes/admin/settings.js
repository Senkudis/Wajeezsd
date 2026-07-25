// routes/admin/settings.js — مُولّد من تقسيم admin.js الأصلي.
// كل وحدة Router مستقلة تُركّب على /api/admin عبر routes/admin.js.
const express = require('express');
const router = express.Router();
const validateObjectId = require('../../middleware/validateObjectId');
// 🆔 أي :id ليس ObjectId ⇒ 404 لا 500 (انظر الملف للسبب)
router.param('id', validateObjectId);
const mongoose = require('mongoose');
const User = require('../../models/User');
const Order = require('../../models/Order');
const Settings = require('../../models/Settings');
const AdminLog = require('../../models/AdminLog');
const PromoCode = require('../../models/PromoCode');
const Rating = require('../../models/Rating');
const Banner = require('../../models/Banner');
const { protect, adminOnly, superAdminOnly, requirePermission } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { normalizePhone } = require('../../utils/phoneNormalizer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

const SessionRequest = require('../../models/SessionRequest');

router.get('/settings', protect, adminOnly, async (req, res) => {
    try {
        const VALID_CITIES = ['Khartoum', 'PortSudan'];
        const city = VALID_CITIES.includes(req.query.city) ? req.query.city : 'Khartoum';
        // 🌍 Uses getSettings(city) — auto-creates doc with defaults if missing
        const settings = await Settings.getSettings(city);
        res.json(settings);
    } catch (error) {
        logger.error('Settings Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/admin/debug-settings
// @desc    تشخيص — يعرض كل وثائق Settings في DB (للأدمن فقط)

router.get('/debug-settings', protect, adminOnly, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const allDocs = await mongoose.connection.db
            .collection('settings')
            .find({})
            .toArray();
        res.json({
            count: allDocs.length,
            docs: allDocs.map(d => ({
                _id: d._id,
                defaultCreditLimit: d.defaultCreditLimit,
                bankName: d.bankName,
                bankAccountName: d.bankAccountName,
                bankAccountNumber: d.bankAccountNumber,
                commissionRate: d.commissionRate,
                updatedAt: d.updatedAt
            }))
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// @route   GET /api/admin/pricing
// @desc    جلب إعدادات التسعير فقط (متاح لجميع المستخدمين المسجلين)
// 🌍 Accepts optional ?city= query param to fetch a specific city's pricing.
// Defaults to Khartoum for backward compat.

router.get('/pricing', protect, async (req, res) => {
    try {
        const city = ['Khartoum', 'PortSudan'].includes(req.query.city) ? req.query.city : 'Khartoum';
        const settings = await Settings.getSettings(city);
        // نُعيد فقط حقول التسعير — لا بيانات حساسة
        res.json({
            city,
            baseFare: settings.baseFare || 1000,
            shortDistance: settings.shortDistance || 1000,
            mediumDistance: settings.mediumDistance || 3000,
            longDistance: settings.longDistance || 6000,
            costPerKm: settings.costPerKm || 200,
            costPerMinute: settings.costPerMinute || 0,
            commissionRate: settings.commissionRate ?? 0.15, // ✅ نسبة العمولة الرسمية
        });
    } catch (error) {
        logger.error("Pricing Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/settings
// @desc    تحديث إعدادات مدينة محددة — city-aware atomic upsert
// 🌍 Body must include `city` ('Khartoum' | 'PortSudan'). Defaults to Khartoum.

router.put('/settings', protect, superAdminOnly, async (req, res) => {

    try {
        const VALID_CITIES = ['Khartoum', 'PortSudan'];
        const city = VALID_CITIES.includes(req.body.city) ? req.body.city : 'Khartoum';

        const allowedFields = [
            'baseFare', 'costPerKm', 'costPerMinute', 'extraStopFee',
            'errandTripFee',
            'commissionRate', 'adminPhone',
            'defaultCreditLimit',
            'bankName', 'bankAccountName', 'bankAccountNumber',
            'appVersion', 'minVersion', 'playStoreLink', 'forceUpdate'
        ];

        const updates = { updatedBy: req.user._id };
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        const numericFields = ['baseFare', 'costPerKm', 'costPerMinute', 'extraStopFee', 'errandTripFee', 'commissionRate', 'defaultCreditLimit'];
        for (const field of numericFields) {
            if (updates[field] !== undefined) {
                let rawVal = updates[field];
                if (typeof rawVal === 'string') {
                    rawVal = rawVal.trim();
                    if (rawVal.endsWith('-')) {
                        rawVal = '-' + rawVal.slice(0, -1);
                    }
                }
                const val = parseFloat(rawVal);
                if (isNaN(val)) return res.status(400).json({ message: `القيمة المدخلة في ${field} غير صالحة` });

                updates[field] = val;

                if (field === 'defaultCreditLimit') {
                    if (val > 0) return res.status(400).json({ message: `الحد الائتماني يجب أن يكون صفراً أو سالباً (مثال: -5000)` });
                    if (val < -1000000) return res.status(400).json({ message: `القيمة المدخلة في ${field} مبالغ فيها` });
                } else {
                    if (val < 0) return res.status(400).json({ message: `القيمة المدخلة في ${field} غير صالحة (يجب أن تكون موجبة)` });
                    if (field !== 'commissionRate' && val > 1000000) return res.status(400).json({ message: `القيمة المدخلة في ${field} مبالغ فيها` });
                    if (field === 'commissionRate' && val > 1) return res.status(400).json({ message: `نسبة العمولة يجب أن تكون بين 0 و 1` });
                }
            }
        }

        // 🌍 CITY-AWARE: findOneAndUpdate scoped to the target city
        // upsert:true ensures a new city doc is created if it doesn't exist yet
        const settings = await Settings.findOneAndUpdate(
            { city },
            { $set: { ...updates, city } },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );

        logger.info({ city, fields: Object.keys(updates) }, `✅ Settings updated for city: ${city}`);

        // ✅ Sync credit_limit ONLY to captains in THIS city
        if (updates.defaultCreditLimit !== undefined) {
            const newLimit = updates.defaultCreditLimit;
            if (!isNaN(newLimit) && newLimit <= 0) {
                const result = await User.updateMany(
                    { role: { $in: ['captain', 'driver'] }, city },
                    { $set: { credit_limit: newLimit } }
                );
                logger.info({ city, updated: result.modifiedCount }, `✅ Credit limit synced to ${newLimit} for ${city} captains`);

                await User.updateMany(
                    { role: { $in: ['captain', 'driver'] }, city, credit_limit: { $exists: false } },
                    { $set: { credit_limit: newLimit } }
                );
            }
        }

        await logAdminAction(req, 'update_settings',
            `تم تحديث إعدادات ${city}: ${Object.keys(updates).filter(k => k !== 'updatedBy').join(', ')}`,
            '', city, { city, updatedFields: Object.keys(updates).filter(k => k !== 'updatedBy') }
        );

        res.json({ message: `تم تحديث إعدادات ${city} بنجاح`, city, settings });
    } catch (error) {
        logger.error('Settings Update Error:', error);
        res.status(500).json({ message: 'فشل حفظ الإعدادات: ' + error.message });
    }
});


// =========================================================
// 🗺️ منطقة التوصيل (Delivery Zone / Geofencing)
// =========================================================

// @route   GET /api/admin/delivery-zone
// @desc    جلب إحداثيات منطقة التوصيل (متاح للجميع لكي يتمكن التطبيق من فحص النطاق)
// 🌍 ?city=Khartoum | PortSudan  (defaults to Khartoum)

router.get('/delivery-zone', async (req, res) => {
    try {
        const VALID_CITIES = ['Khartoum', 'PortSudan'];
        const city = VALID_CITIES.includes(req.query.city) ? req.query.city : 'Khartoum';
        const settings = await Settings.getSettings(city);
        res.json({ city, deliveryZone: settings.deliveryZone || [] });
    } catch (error) {
        logger.error("Delivery Zone GET Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/delivery-zone
// @desc    حفظ إحداثيات منطقة التوصيل الجديدة (أدمن فقط)

router.put('/delivery-zone', protect, superAdminOnly, async (req, res) => {

    try {
        const { deliveryZone } = req.body;

        if (!Array.isArray(deliveryZone) || deliveryZone.length < 3) {
            return res.status(400).json({ message: 'يجب أن تحتوي منطقة التوصيل على 3 نقاط على الأقل' });
        }

        // Validate each coordinate
        for (const point of deliveryZone) {
            if (typeof point.lat !== 'number' || typeof point.lng !== 'number') {
                return res.status(400).json({ message: 'تنسيق الإحداثيات غير صحيح — يجب أن تكون أرقاماً' });
            }
        }

        // ✅ FIX #13: Use getSettings(city) for the specific city's zone doc
        let settings = await Settings.getSettings(req.body.city || 'Khartoum');
        const zoneCity = ['Khartoum', 'PortSudan'].includes(req.body.city) ? req.body.city : 'Khartoum';
        if (!settings._id) {
            // 🌍 لازم نمرّر المدينة عند الإنشاء وإلا تُحفظ المنطقة للخرطوم خطأً
            settings = await Settings.create({ city: zoneCity, deliveryZone });
        } else {
            await Settings.findByIdAndUpdate(settings._id, {
                $set: { deliveryZone, updatedBy: req.user._id }
            });
        }

        // Broadcast to all clients in this city's room (each city has its own delivery zone)
        const io = req.app.get('io');
        if (io) {
            // Admin must pass the city for which this zone applies
            const zoneCity = req.body.city || 'Khartoum';
            io.to(`room_${zoneCity}`).emit('delivery_zone_updated', { deliveryZone, city: zoneCity });
        }

        res.json({ message: '✅ تم حفظ منطقة التوصيل بنجاح', deliveryZone });
    } catch (error) {
        logger.error("Delivery Zone PUT Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// =========================================================
// 🗑️ الجزء السادس: الحذف والتعديل الشامل (Super Admin)
// =========================================================

// @route   DELETE /api/admin/users/:id
// @desc    حذف مستخدم نهائياً

router.get('/migrate-cities-legacy-data', protect, superAdminOnly, async (req, res) => {
    try {
        logger.info('[Migration] Starting multi-city legacy data migration...');

        const ShopOrder = require('../../models/ShopOrder');
        const Place     = require('../../models/Place');

        // Run all updateMany in parallel for speed
        const [userResult, orderResult, settingsResult, shopOrderResult, placeResult] = await Promise.all([
            // Stamp all Users that have no city yet (new field is NOT $exists yet)
            require('../../models/User').updateMany(
                { city: { $exists: false } },
                { $set: { city: 'Khartoum' } }
            ),
            // Stamp all Orders
            require('../../models/Order').updateMany(
                { city: { $exists: false } },
                { $set: { city: 'Khartoum' } }
            ),
            // Stamp all Settings docs (handles legacy single-city doc)
            // After migration, admin should update the Settings doc via PUT /api/admin/settings?city=Khartoum
            Settings.updateMany(
                { city: { $exists: false } },
                { $set: { city: 'Khartoum' } }
            ),
            // Stamp ShopOrders if they exist
            ShopOrder.updateMany(
                { city: { $exists: false } },
                { $set: { city: 'Khartoum' } }
            ).catch(() => ({ modifiedCount: 0, matchedCount: 0 })), // graceful if model differs
            // 🌍 NEW: Stamp all Places (shops) — added in multi-city v2
            Place.updateMany(
                { city: { $exists: false } },
                { $set: { city: 'Khartoum' } }
            ).catch(() => ({ modifiedCount: 0, matchedCount: 0 }))
        ]);

        const summary = {
            users:      { matched: userResult.matchedCount,      updated: userResult.modifiedCount },
            orders:     { matched: orderResult.matchedCount,     updated: orderResult.modifiedCount },
            settings:   { matched: settingsResult.matchedCount,  updated: settingsResult.modifiedCount },
            shopOrders: { matched: shopOrderResult.matchedCount, updated: shopOrderResult.modifiedCount },
            places:     { matched: placeResult.matchedCount,     updated: placeResult.modifiedCount }
        };

        logger.info({ summary }, '[Migration] Multi-city migration complete');

        res.json({
            message: '✅ تمت عملية ترحيل البيانات بنجاح. جميع السجلات القديمة الآن في مدينة "الخرطوم".',
            note: '⚠️ يرجى حذف هذا الـ endpoint من الكود بعد التحقق من النتائج.',
            summary
        });

    } catch (err) {
        logger.error({ err }, '[Migration] Error during city migration');
        res.status(500).json({
            message: 'حدث خطأ أثناء عملية الترحيل: ' + err.message
        });
    }
});

// =========================================================
// 🖼️ ضغط الصور القديمة (صيانة) — يشغّل compress_images.js على السيرفر
// =========================================================
// حالة التشغيل تُحفظ في الذاكرة كي لا تعمل عمليتان معاً ولتتبع النتيجة
let imageCompression = { running: false, startedAt: null, finishedAt: null, stats: null, error: null };

// @route   POST /api/admin/compress-images
// @desc    يبدأ ضغط الصور القديمة في الخلفية (uploads/products و uploads/places)
router.post('/compress-images', protect, superAdminOnly, async (req, res) => {
    if (imageCompression.running) {
        return res.json({ message: 'عملية الضغط تعمل حالياً بالفعل', state: imageCompression });
    }

    imageCompression = { running: true, startedAt: new Date(), finishedAt: null, stats: null, error: null };
    logger.info('[ImageCompression] Started by admin');

    const { run } = require('../../compress_images');
    run()
        .then(stats => {
            imageCompression = { ...imageCompression, running: false, finishedAt: new Date(), stats };
            logger.info({ stats }, '[ImageCompression] Finished');
        })
        .catch(err => {
            imageCompression = { ...imageCompression, running: false, finishedAt: new Date(), error: err.message };
            logger.error({ err }, '[ImageCompression] Failed');
        });

    res.json({ message: 'بدأت عملية ضغط الصور القديمة في الخلفية', state: imageCompression });
});

// @route   GET /api/admin/compress-images/status
// @desc    متابعة حالة عملية الضغط (للاستعلام الدوري من لوحة التحكم)
router.get('/compress-images/status', protect, adminOnly, (req, res) => {
    res.json(imageCompression);
});

// =========================================================
// 📋 سجل نشاط الإدارة (Activity Log)
// =========================================================

// @route   GET /api/admin/activity-log
// @desc    سجل العمليات الإدارية مع دعم الفلترة
// ?page=1 &limit=50 &action= &adminId= &from= &to=

module.exports = router;
