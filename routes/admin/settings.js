// routes/admin/settings.js — مُولّد من تقسيم admin.js الأصلي.
// كل وحدة Router مستقلة تُركّب على /api/admin عبر routes/admin.js.
const express = require('express');
const { CITY_KEYS, cityLabel } = require('../../config/cities');   // 🌍 المدن — مصدرٌ واحد
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
const { protect, adminOnly, superAdminOnly, requirePermission, isSubAdmin, adminCities, adminCoversCity } = require('../../middleware/authMiddleware');
const { logAdminAction } = require('../../utils/adminLogger');
const { normalizePhone } = require('../../utils/phoneNormalizer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');

const SessionRequest = require('../../models/SessionRequest');

router.get('/settings', protect, adminOnly, async (req, res) => {
    try {
        const VALID_CITIES = CITY_KEYS;
        let city = VALID_CITIES.includes(req.query.city) ? req.query.city : 'Khartoum';
        // 🌍 الأدمن المساعد يقرأ إعدادات مدنه وحدها
        if (isSubAdmin(req) && !adminCoversCity(req.user, city)) city = adminCities(req.user)[0] || city;
        // 🌍 Uses getSettings(city) — auto-creates doc with defaults if missing
        const settings = await Settings.getSettings(city);
        // 🔒 الوثائق السابقة للميزة لا تحمل الحقل (lean بلا افتراضيات)، فيصل
        //    undefined — والمفتاح في الواجهة يحتاج قيمةً صريحة يُعرض بها.
        //    المعنى نفسه في الخادم: كل ما ليس true مغلق.
        res.json({ ...settings, captainRegistrationOpen: settings.captainRegistrationOpen === true });
    } catch (error) {
        logger.error('Settings Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   GET /api/admin/debug-settings
// @desc    تشخيص — يعرض كل وثائق Settings في DB (للأدمن فقط)

// 🔒 للأكبر وحده: يكشف الحساب البنكي والعمولة لكل المدن معاً
router.get('/debug-settings', protect, superAdminOnly, async (req, res) => {
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
        const city = CITY_KEYS.includes(req.query.city) ? req.query.city : 'Khartoum';
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
            extraStopFee: settings.extraStopFee || 0,
            commissionRate: settings.commissionRate ?? 0.15, // ✅ نسبة العمولة الرسمية
            maxDiscountPercent: settings.maxDiscountPercent ?? 10, // 📉 أقصى نسبة تخفيض مسموحة للعميل
            maxPriceSurgePercent: settings.maxPriceSurgePercent ?? 100, // 📈 أقصى نسبة زيادة / سقف السعر
            maxTipAmount: settings.maxTipAmount ?? 20000, // 💚 سقف إكرامية الكابتن
            // 📍 إثبات التسليم
            deliveryProofMode: settings.deliveryProofMode || 'observe',
            deliveryProofRadiusMeters: settings.deliveryProofRadiusMeters ?? 500,
            deliveryProofMaxLocationAgeMin: settings.deliveryProofMaxLocationAgeMin ?? 10
        });
    } catch (error) {
        logger.error("Pricing Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
});

// @route   PUT /api/admin/settings
// @desc    تحديث إعدادات مدينة محددة — city-aware atomic upsert
// 🌍 Body must include `city` (a config/cities key). Defaults to Khartoum.

router.put('/settings', protect, superAdminOnly, async (req, res) => {

    try {
        const VALID_CITIES = CITY_KEYS;
        const city = VALID_CITIES.includes(req.body.city) ? req.body.city : 'Khartoum';

        const allowedFields = [
            'baseFare', 'costPerKm', 'costPerMinute', 'extraStopFee',
            'errandTripFee', 'errandQuoteReminderMin', 'errandQuoteExpiryMin',
            'commissionRate', 'maxDiscountPercent', 'maxPriceSurgePercent', 'maxTipAmount', 'adminPhone',
            'deliveryProofMode', 'deliveryProofRadiusMeters', 'deliveryProofMaxLocationAgeMin',
            'defaultCreditLimit',
            'bankName', 'bankAccountName', 'bankAccountNumber',
            'appVersion', 'minVersion', 'iosAppVersion', 'iosMinVersion',
            'playStoreLink', 'appStoreLink', 'forceUpdate',
            // 👥 روابط مجموعات واتساب — لكل مدينة مجموعتها
            'captainGroupLink', 'merchantGroupLink',
            // 🔒 باب تسجيل الكباتن — لكل مدينة
            'captainRegistrationOpen'
        ];

        const updates = { updatedBy: req.user._id };
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        // 🔗 رابط المجموعة: فارغٌ (تعطيل) أو رابط دعوة واتساب صحيح.
        //    لا نقبل أي نصّ: الرابط يُرسَل إلى كل مقبولٍ بعده، وخطؤه لا
        //    يُكتشف إلا حين يشتكي من ضغطه — بعد أن يكون قد وصل عشرات.
        for (const f of ['captainGroupLink', 'merchantGroupLink']) {
            if (updates[f] === undefined) continue;
            const v = String(updates[f] || '').trim();
            if (v && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]/.test(v)) {
                return res.status(400).json({
                    message: 'رابط المجموعة يجب أن يبدأ بـ https://chat.whatsapp.com/ — انسخه من «دعوة عبر رابط» في إعدادات المجموعة'
                });
            }
            updates[f] = v;
        }

        // 📱 أرقام الإصدار بصيغة x.y.z — رقمٌ مشوّه («1.6.2 » أو «v1.6») يُقارَن
        //    خطأً في التطبيق فيُظهر «تحديث» لمن هو محدَّث. إصدارا الآيفون
        //    يقبلان الفراغ (= لا تنبيه للآيفون).
        {
            const { isValidVersion } = require('../../utils/appConfig');
            for (const f of ['appVersion', 'minVersion', 'iosAppVersion', 'iosMinVersion']) {
                if (updates[f] === undefined) continue;
                updates[f] = String(updates[f] || '').trim();
                if (!isValidVersion(updates[f], { allowEmpty: f.startsWith('ios') })) {
                    return res.status(400).json({ message: `رقم الإصدار «${updates[f]}» غير صالح — اكتبه هكذا: 1.6.2` });
                }
            }
        }

        // 🔒 باب التسجيل: true أو false فقط. mongoose يحوّل أيّ نصٍّ آخر
        //    إلى خطأ cast بصيغة 500 إنجليزية — والأسوأ أن «1» أو «yes» قد
        //    تُفهم فتحاً لم يقصده أحد. قرارٌ كهذا يُكتب صريحاً أو يُرفض.
        if (updates.captainRegistrationOpen !== undefined) {
            const v = updates.captainRegistrationOpen;
            if (v === true || v === 'true') updates.captainRegistrationOpen = true;
            else if (v === false || v === 'false') updates.captainRegistrationOpen = false;
            else return res.status(400).json({ message: 'حالة باب تسجيل الكباتن يجب أن تكون مفتوحاً أو مغلقاً' });
        }

        const numericFields = ['baseFare', 'costPerKm', 'costPerMinute', 'extraStopFee', 'errandTripFee', 'errandQuoteReminderMin', 'errandQuoteExpiryMin', 'commissionRate', 'maxDiscountPercent', 'maxPriceSurgePercent', 'maxTipAmount', 'deliveryProofRadiusMeters', 'deliveryProofMaxLocationAgeMin', 'defaultCreditLimit'];
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
                } else if (field === 'deliveryProofRadiusMeters') {
                    if (val < 50 || val > 5000) return res.status(400).json({ message: `نصف قطر إثبات التسليم يجب أن يكون بين 50 و 5000 متر` });
                } else if (field === 'deliveryProofMaxLocationAgeMin') {
                    if (val < 1 || val > 120) return res.status(400).json({ message: `أقصى عمر مقبول لموقع الكابتن يجب أن يكون بين دقيقة و 120 دقيقة` });
                } else if (field === 'maxDiscountPercent') {
                    if (val < 0 || val > 90) return res.status(400).json({ message: `أقصى نسبة تخفيض مسموحة يجب أن تكون بين 0% و 90%` });
                } else if (field === 'maxTipAmount') {
                    if (val < 0 || val > 1000000) return res.status(400).json({ message: `سقف الإكرامية يجب أن يكون بين 0 و 1,000,000` });
                } else if (field === 'maxPriceSurgePercent') {
                    if (val < 0 || val > 5000) return res.status(400).json({ message: `سقف السعر (نسبة الزيادة المسموحة) يجب أن يكون بين 0% و 5000%` });
                } else {
                    if (val < 0) return res.status(400).json({ message: `القيمة المدخلة في ${field} غير صالحة (يجب أن تكون موجبة)` });
                    if (field !== 'commissionRate' && val > 1000000) return res.status(400).json({ message: `القيمة المدخلة في ${field} مبالغ فيها` });
                    if (field === 'commissionRate' && val > 1) return res.status(400).json({ message: `نسبة العمولة يجب أن تكون بين 0 و 1` });
                }
            }
        }

        // 📍 وضع إثبات التسليم — نصّي لا رقمي، فيُتحقَّق صراحةً هنا كي تعود
        //    رسالة عربية بدل خطأ enum من mongoose بصيغة 500.
        if (updates.deliveryProofMode !== undefined) {
            const { MODES } = require('../../utils/deliveryProof');
            if (!MODES.includes(updates.deliveryProofMode)) {
                return res.status(400).json({
                    message: `وضع إثبات التسليم يجب أن يكون أحد: ${MODES.join('، ')}`
                });
            }
        }

        // ⏱️ عتبات التنبيهات الاستباقية — كائن متداخل، فيُعالَج على حدة.
        // نكتب كل مفتاح بمساره الكامل (nudges.x) لا ككائن واحد: الكتابة
        // ككائن تمسح أي حقل لم يُرسل في هذا الطلب.
        if (req.body.nudges && typeof req.body.nudges === 'object') {
            const incoming = req.body.nudges;

            // الحدود مُكرّرة هنا رغم وجودها في المخطّط، كي تعود للأدمن رسالة
            // عربية تسمّي الحقل بدل رسالة mongoose الإنجليزية العامة
            const RANGES = {
                clientDelay1: [1, 1440], clientDelay2: [1, 1440],
                captainPickup1: [1, 1440], captainPickup2: [1, 1440],
                captainDeliver1: [1, 1440], captainDeliver2: [1, 1440],
                gpsStale: [1, 240], chatUnread: [1, 240],
                creditWarnPct: [50, 99], creditResetPct: [0, 98]
            };
            const LABELS = {
                clientDelay1: 'تنبيه العميل الأول', clientDelay2: 'تنبيه العميل الثاني',
                captainPickup1: 'تنبيه الاستلام الأول', captainPickup2: 'تنبيه الاستلام الثاني',
                captainDeliver1: 'تنبيه التسليم الأول', captainDeliver2: 'تنبيه التسليم الثاني',
                gpsStale: 'توقّف التتبّع', chatUnread: 'رسالة بلا رد',
                creditWarnPct: 'نسبة تحذير المديونية', creditResetPct: 'نسبة تصفير التحذير'
            };

            // القيم النهائية = المرسَل فوق المخزَّن فوق الافتراضي، كي تُفحص
            // العلاقات بين الحقول حتى لو أرسلت الواجهة حقلاً واحداً
            const current = await Settings.getNudgeSettings(city);
            const merged = { ...current };

            if (incoming.enabled !== undefined) {
                merged.enabled = !!incoming.enabled;
                updates['nudges.enabled'] = merged.enabled;
            }

            for (const key of Object.keys(RANGES)) {
                if (incoming[key] === undefined) continue;
                const val = parseFloat(incoming[key]);
                if (!Number.isFinite(val)) {
                    return res.status(400).json({ message: `قيمة "${LABELS[key]}" غير صالحة` });
                }
                const [min, max] = RANGES[key];
                if (val < min || val > max) {
                    return res.status(400).json({
                        message: `"${LABELS[key]}" يجب أن تكون بين ${min} و${max}`
                    });
                }
                merged[key] = val;
                updates[`nudges.${key}`] = val;
            }

            // ترتيب العتبات: التنبيه الثاني بعد الأول دائماً، وإلا لن ينطلق
            // الأول أبداً (planNudge يختار الأعلى المستحقّة ويستهلك ما دونها)
            const ORDERED_PAIRS = [
                ['clientDelay1', 'clientDelay2'],
                ['captainPickup1', 'captainPickup2'],
                ['captainDeliver1', 'captainDeliver2']
            ];
            for (const [first, second] of ORDERED_PAIRS) {
                if (merged[second] <= merged[first]) {
                    return res.status(400).json({
                        message: `"${LABELS[second]}" يجب أن تكون أكبر من "${LABELS[first]}"`
                    });
                }
            }
            if (merged.creditResetPct >= merged.creditWarnPct) {
                return res.status(400).json({
                    message: `"${LABELS.creditResetPct}" يجب أن تكون أقل من "${LABELS.creditWarnPct}"`
                });
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

        // 🔒 فتح باب التسجيل وإغلاقه قرارٌ يُسأل عنه لاحقاً («من فتحه؟ متى؟»)
        //    والسطر العامّ أعلاه يذكر اسم الحقل لا اتجاهه. فله سطرٌ صريح.
        if (updates.captainRegistrationOpen !== undefined) {
            await logAdminAction(req, 'captain_registration_toggle',
                `${updates.captainRegistrationOpen ? 'فُتح' : 'أُغلق'} باب تسجيل الكباتن في ${cityLabel(city)}`,
                '', city, { city, open: updates.captainRegistrationOpen }
            );
        }

        res.json({ message: `تم تحديث إعدادات ${city} بنجاح`, city, settings });
    } catch (error) {
        logger.error('Settings Update Error:', error);
        res.status(500).json({ message: 'فشل حفظ الإعدادات: ' + error.message });
    }
});

// =========================================================
// 👥 روابط مجموعات واتساب — كل المدن في شاشةٍ واحدة
// =========================================================
// GET  /api/admin/group-links  → { cities: [{ city, label, captainGroupLink, merchantGroupLink }] }
// PUT  /api/admin/group-links  { links: { <city>: { captainGroupLink?, merchantGroupLink? } } }
//
// كان لكل مدينة خانةٌ واحدة تتبدّل مع «المدينة» أعلى صفحة الإعدادات: الأدمن
// يرى خانةً بلا اسم مدينة، فيلصق رابط أم درمان وهو على بورتسودان (أو يحفظ
// ولم يغيّر المدينة) — فيصل كابتن بورتسودان رابطُ أم درمان. الآن كل مدينة
// باسمها وخانتيها جنباً إلى جنب، وما يُحفظ لكل مدينة هو ما في سطرها.
const GROUP_LINK_FIELDS = ['captainGroupLink', 'merchantGroupLink'];
const GROUP_LINK_RX = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]/;

router.get('/group-links', protect, adminOnly, async (req, res) => {
    try {
        const cities = [];
        // 🌍 الأدمن المساعد يرى روابط مجموعات مدنه وحدها
        for (const city of (isSubAdmin(req) ? adminCities(req.user) : CITY_KEYS)) {
            const s = await Settings.getSettings(city);
            cities.push({
                city, label: cityLabel(city),
                captainGroupLink: (s && s.captainGroupLink) || '',
                merchantGroupLink: (s && s.merchantGroupLink) || ''
            });
        }
        res.json({ cities });
    } catch (error) {
        logger.error({ err: error.message }, 'group-links GET error');
        res.status(500).json({ message: 'تعذّر تحميل روابط المجموعات' });
    }
});

router.put('/group-links', protect, superAdminOnly, async (req, res) => {
    try {
        const links = (req.body && req.body.links) || {};
        if (typeof links !== 'object' || Array.isArray(links)) {
            return res.status(400).json({ message: 'صيغة الروابط غير صحيحة' });
        }

        // التحقّق كلّه قبل أيّ حفظ: رابطٌ خاطئ في مدينة لا يحفظ نصف الشاشة
        const plan = [];
        for (const [city, vals] of Object.entries(links)) {
            if (!CITY_KEYS.includes(city)) {
                return res.status(400).json({ message: `مدينة غير معروفة: ${city}` });
            }
            const set = {};
            for (const f of GROUP_LINK_FIELDS) {
                if (!vals || vals[f] === undefined) continue;
                const v = String(vals[f] || '').trim();
                if (v && !GROUP_LINK_RX.test(v)) {
                    const who = f === 'captainGroupLink' ? 'الكباتن' : 'التجار';
                    return res.status(400).json({
                        message: `رابط مجموعة ${who} في ${cityLabel(city)} يجب أن يبدأ بـ https://chat.whatsapp.com/ — انسخه من «دعوة عبر رابط» في إعدادات المجموعة`,
                        city, field: f
                    });
                }
                set[f] = v;
            }
            if (Object.keys(set).length) plan.push([city, set]);
        }

        const changed = [];
        for (const [city, set] of plan) {
            const before = await Settings.getSettings(city);
            const diff = GROUP_LINK_FIELDS.filter(f => set[f] !== undefined && set[f] !== ((before && before[f]) || ''));
            if (!diff.length) continue;
            await Settings.findOneAndUpdate(
                { city },
                { $set: { ...set, city, updatedBy: req.user._id } },
                { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
            );
            changed.push(`${cityLabel(city)} (${diff.map(f => f === 'captainGroupLink' ? 'الكباتن' : 'التجار').join(' و')})`);
        }

        if (changed.length) {
            await logAdminAction(req, 'update_settings',
                `تحديث روابط مجموعات واتساب: ${changed.join('، ')}`, '', '', { groupLinks: changed });
        }
        res.json({ message: changed.length ? 'تم حفظ روابط المجموعات' : 'لا تغيير', changed });
    } catch (error) {
        logger.error({ err: error.message }, 'group-links PUT error');
        res.status(500).json({ message: 'تعذّر حفظ روابط المجموعات' });
    }
});


// =========================================================
// 🗺️ منطقة التوصيل (Delivery Zone / Geofencing)
// =========================================================

// @route   GET /api/admin/delivery-zone
// @desc    جلب إحداثيات منطقة التوصيل (متاح للجميع لكي يتمكن التطبيق من فحص النطاق)
// 🌍 ?city=<config/cities key>  (defaults to Khartoum)

router.get('/delivery-zone', async (req, res) => {
    try {
        const VALID_CITIES = CITY_KEYS;
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
        const zoneCity = CITY_KEYS.includes(req.body.city) ? req.body.city : 'Khartoum';
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

        res.json({ message: 'تم حفظ منطقة التوصيل بنجاح', deliveryZone });
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
            message: 'تمت عملية ترحيل البيانات بنجاح. جميع السجلات القديمة الآن في مدينة "الخرطوم".',
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
