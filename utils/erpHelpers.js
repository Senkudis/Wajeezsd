const logger = require('./logger');

// 💼 ERP: مساعدات مركزية لحركة المخزون ودفتر الأستاذ المالي.
// كل الكتابة المالية/المخزنية تمر من هنا حتى يبقى مصدر الحقيقة واحداً.

/**
 * تسجيل حركة مخزون (سطر تدقيق). لا يعدّل المخزون نفسه —
 * التعديل يتم في مكان الاستدعاء ذرياً، وهنا نوثّق الحركة فقط.
 * فشل التسجيل لا يُفشل العملية الأصلية (best-effort audit).
 */
async function recordStockMovement({ placeId, productId, productName, type, quantity, balanceAfter = null, unitCost = 0, reason = '', refModel = null, refId = null, createdBy = null }) {
    try {
        const StockMovement = require('../models/StockMovement');
        await StockMovement.create({
            placeId, productId,
            productName: productName || '',
            type, quantity, balanceAfter, unitCost, reason, refModel, refId, createdBy
        });
    } catch (err) {
        logger.error({ err: err.message, productId, type }, 'recordStockMovement failed');
    }
}

/**
 * قيد مالي ذري في دفتر أستاذ المتجر + تحديث رصيد المحفظة (Place.shopWalletBalance).
 * amount موجب = دخل للتاجر، سالب = تسوية/صرف.
 * لقيود settlement السالبة نتحقق ذرياً أن الرصيد يكفي (يمنع السحب فوق الرصيد).
 * يرجع { ok, balanceAfter } أو { ok: false, reason }.
 */
async function recordLedgerEntry({ placeId, type, amount, refModel = null, refId = null, note = '', createdBy = null }) {
    const Place = require('../models/Place');
    const ShopLedger = require('../models/ShopLedger');

    if (!Number.isFinite(amount) || amount === 0) {
        return { ok: false, reason: 'invalid_amount' };
    }

    // خصم (تسوية): تحقق ذري أن الرصيد >= المبلغ المخصوم
    const filter = amount < 0
        ? { _id: placeId, shopWalletBalance: { $gte: Math.abs(amount) } }
        : { _id: placeId };

    const place = await Place.findOneAndUpdate(
        filter,
        { $inc: { shopWalletBalance: amount } },
        { new: true }
    ).select('shopWalletBalance');

    if (!place) return { ok: false, reason: 'insufficient_balance_or_missing_place' };

    try {
        await ShopLedger.create({
            placeId, type, amount,
            balanceAfter: place.shopWalletBalance,
            refModel, refId, note, createdBy
        });
    } catch (err) {
        // قيد مكرر (unique index على sale_income لنفس الطلب) → تراجع عن تعديل الرصيد
        if (err.code === 11000) {
            await Place.findByIdAndUpdate(placeId, { $inc: { shopWalletBalance: -amount } });
            logger.warn({ placeId, refId, type }, 'Duplicate ledger entry prevented — balance reverted');
            return { ok: false, reason: 'duplicate_entry' };
        }
        // فشل كتابة القيد لأي سبب آخر → تراجع أيضاً للحفاظ على التطابق
        await Place.findByIdAndUpdate(placeId, { $inc: { shopWalletBalance: -amount } })
            .catch(e => logger.error({ err: e.message, placeId }, 'CRITICAL: ledger revert failed'));
        logger.error({ err: err.message, placeId, type }, 'recordLedgerEntry create failed — balance reverted');
        return { ok: false, reason: 'ledger_write_failed' };
    }

    return { ok: true, balanceAfter: place.shopWalletBalance };
}

/**
 * فحص المخزون المنخفض بعد بيع — يرسل تنبيهاً للتاجر (socket + إشعار محفوظ + push)
 * عندما يهبط المخزون إلى/تحت حد التنبيه المحدد للمنتج.
 */
async function checkLowStockAlert(app, place, product) {
    try {
        if (!product || product.stock === null || product.stock === undefined) return;
        const threshold = product.lowStockThreshold;
        if (threshold === null || threshold === undefined) return;
        if (product.stock > threshold || product.stock <= 0) return; // النفاد الكامل له تنبيهه الخاص

        const ownerId = place && place.ownerId ? place.ownerId : null;
        if (!ownerId) return;

        const io = app.get('io');
        if (io) {
            io.to(ownerId.toString()).emit('low_stock_alert', {
                productId: product._id.toString(),
                productName: product.name,
                stock: product.stock,
                threshold
            });
        }

        const { sendNotification } = require('./notificationHelper');
        await sendNotification(app, {
            userId: ownerId,
            title: 'تنبيه مخزون منخفض',
            message: `المنتج "${product.name}" وصل إلى ${product.stock} قطعة (حد التنبيه: ${threshold}). يُنصح بإعادة التوريد.`,
            type: 'low_stock',
            relatedId: product._id
        });
    } catch (err) {
        logger.error({ err: err.message }, 'checkLowStockAlert failed');
    }
}

module.exports = { recordStockMovement, recordLedgerEntry, checkLowStockAlert };
