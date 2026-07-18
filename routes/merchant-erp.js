const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, merchantOnly, adminOnly, requirePermission } = require('../middleware/authMiddleware');
const Place = require('../models/Place');
const Product = require('../models/Product');
const ShopOrder = require('../models/ShopOrder');
const PosSale = require('../models/PosSale');
const StockMovement = require('../models/StockMovement');
const Expense = require('../models/Expense');
const ShopLedger = require('../models/ShopLedger');
const SettlementRequest = require('../models/SettlementRequest');
const { recordStockMovement, recordLedgerEntry, checkLowStockAlert } = require('../utils/erpHelpers');
const { sendNotification, notifyAdmins } = require('../utils/notificationHelper');
const logger = require('../utils/logger');

// 💼 ERP Mini للتاجر — تقارير، أرباح، مخزون متقدم، محاسبة ومصروفات، تسويات، نقطة بيع.
// كل مسارات التاجر مقيدة بمتجره عبر loadPlace. مسارات /admin/* للإدارة فقط.

// ──────────────────────────────────────────────
// Middleware: تحميل متجر التاجر
// ──────────────────────────────────────────────
async function loadPlace(req, res, next) {
    try {
        const place = await Place.findOne({ ownerId: req.user._id });
        if (!place) return res.status(404).json({ message: 'لا يوجد متجر مرتبط بحسابك' });
        req.place = place;
        next();
    } catch (err) {
        logger.error('loadPlace error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
}

// ──────────────────────────────────────────────
// Middleware: باقة المتجر الاحترافي (pro) فقط
// الأساسي (basic) يحتفظ بالمنتجات/الطلبات/المستحقات والتسويات —
// أما التقارير والمخزون المتقدم والمصروفات ونقطة البيع فللاحترافي.
// ──────────────────────────────────────────────
function requirePro(req, res, next) {
    if (req.place && req.place.tier === 'pro') return next();
    return res.status(403).json({
        message: 'هذه الميزة متاحة لباقة المتجر الكبير فقط — تواصل مع الإدارة للترقية',
        code: 'PRO_TIER_REQUIRED'
    });
}

// ──────────────────────────────────────────────
// Helper: نطاق الفترة الزمنية (توقيت السودان UTC+3)
// ──────────────────────────────────────────────
function getPeriodRange(period, fromStr, toStr) {
    const SUDAN_OFFSET = 3 * 60 * 60 * 1000;
    const now = new Date();
    const sudanNow = new Date(now.getTime() + SUDAN_OFFSET);
    // بداية اليوم بتوقيت السودان → نعيدها لـ UTC
    const startOfToday = new Date(Date.UTC(
        sudanNow.getUTCFullYear(), sudanNow.getUTCMonth(), sudanNow.getUTCDate()
    ) - SUDAN_OFFSET);

    let from, to = now;
    switch (period) {
        case 'today':
            from = startOfToday; break;
        case 'yesterday':
            from = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
            to = startOfToday; break;
        case 'week':
            from = new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000); break;
        case 'month':
            from = new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000); break;
        case 'custom': {
            const f = fromStr ? new Date(fromStr) : startOfToday;
            const t = toStr ? new Date(new Date(toStr).getTime() + 24 * 60 * 60 * 1000) : now;
            from = isNaN(f.getTime()) ? startOfToday : f;
            to = isNaN(t.getTime()) ? now : t;
            break;
        }
        default:
            from = startOfToday;
    }
    return { from, to };
}

// إيراد البضاعة لطلب تطبيق = الإجمالي مطروحاً منه خصم كوبون المنتجات فقط
const APP_GOODS_REVENUE_EXPR = {
    $cond: [
        { $eq: ['$promoAppliesTo', 'products'] },
        { $max: [0, { $subtract: ['$itemsTotal', { $ifNull: ['$discountAmount', 0] }] }] },
        '$itemsTotal'
    ]
};
// تكلفة البضاعة المباعة لبنود الطلب (COGS)
const ITEMS_COGS_EXPR = {
    $reduce: {
        input: { $ifNull: ['$items', []] },
        initialValue: 0,
        in: { $add: ['$$value', { $multiply: [{ $ifNull: ['$$this.cost', 0] }, { $ifNull: ['$$this.quantity', 1] }] }] }
    }
};
const ITEMS_QTY_EXPR = {
    $reduce: {
        input: { $ifNull: ['$items', []] },
        initialValue: 0,
        in: { $add: ['$$value', { $ifNull: ['$$this.quantity', 1] }] }
    }
};

// تجميع موحّد لطلبات التطبيق الموصّلة + مبيعات نقطة البيع في فترة
async function aggregateSales(placeId, from, to) {
    const [appAgg] = await ShopOrder.aggregate([
        { $match: { place: placeId, status: 'delivered', deliveredAt: { $gte: from, $lt: to } } },
        {
            $group: {
                _id: null,
                revenue: { $sum: APP_GOODS_REVENUE_EXPR },
                cogs: { $sum: ITEMS_COGS_EXPR },
                itemsSold: { $sum: ITEMS_QTY_EXPR },
                count: { $sum: 1 }
            }
        }
    ]);
    const [posAgg] = await PosSale.aggregate([
        { $match: { placeId: placeId, isVoided: false, createdAt: { $gte: from, $lt: to } } },
        {
            $group: {
                _id: null,
                revenue: { $sum: '$totalAmount' },
                cogs: { $sum: ITEMS_COGS_EXPR },
                itemsSold: { $sum: ITEMS_QTY_EXPR },
                count: { $sum: 1 }
            }
        }
    ]);
    const app = appAgg || { revenue: 0, cogs: 0, itemsSold: 0, count: 0 };
    const pos = posAgg || { revenue: 0, cogs: 0, itemsSold: 0, count: 0 };
    return {
        app, pos,
        revenue: app.revenue + pos.revenue,
        cogs: app.cogs + pos.cogs,
        itemsSold: app.itemsSold + pos.itemsSold,
        ordersCount: app.count + pos.count,
        grossProfit: (app.revenue + pos.revenue) - (app.cogs + pos.cogs)
    };
}

// ══════════════════════════════════════════════
// 📊 REPORTS — التقارير والتحليلات
// ══════════════════════════════════════════════

// GET /api/merchant-erp/reports/summary?period=today|week|month|custom&from&to
router.get('/reports/summary', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const { from, to } = getPeriodRange(req.query.period, req.query.from, req.query.to);
        const totals = await aggregateSales(req.place._id, from, to);
        res.json({
            from, to,
            revenue: totals.revenue,
            ordersCount: totals.ordersCount,
            avgOrderValue: totals.ordersCount > 0 ? Math.round(totals.revenue / totals.ordersCount) : 0,
            itemsSold: totals.itemsSold,
            cogs: totals.cogs,
            grossProfit: totals.grossProfit,
            breakdown: {
                app: { revenue: totals.app.revenue, count: totals.app.count },
                pos: { revenue: totals.pos.revenue, count: totals.pos.count }
            }
        });
    } catch (err) {
        logger.error('reports/summary error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/merchant-erp/reports/sales-series?period=week|month
router.get('/reports/sales-series', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const period = ['week', 'month'].includes(req.query.period) ? req.query.period : 'week';
        const { from, to } = getPeriodRange(period);
        const dateFmt = { format: '%Y-%m-%d', timezone: '+03:00' };

        const appSeries = await ShopOrder.aggregate([
            { $match: { place: req.place._id, status: 'delivered', deliveredAt: { $gte: from, $lt: to } } },
            {
                $group: {
                    _id: { $dateToString: { ...dateFmt, date: '$deliveredAt' } },
                    revenue: { $sum: APP_GOODS_REVENUE_EXPR },
                    cogs: { $sum: ITEMS_COGS_EXPR },
                    orders: { $sum: 1 }
                }
            }
        ]);
        const posSeries = await PosSale.aggregate([
            { $match: { placeId: req.place._id, isVoided: false, createdAt: { $gte: from, $lt: to } } },
            {
                $group: {
                    _id: { $dateToString: { ...dateFmt, date: '$createdAt' } },
                    revenue: { $sum: '$totalAmount' },
                    cogs: { $sum: ITEMS_COGS_EXPR },
                    orders: { $sum: 1 }
                }
            }
        ]);

        // دمج السلسلتين + تعبئة الأيام الفارغة
        const byDay = {};
        for (const r of [...appSeries, ...posSeries]) {
            if (!byDay[r._id]) byDay[r._id] = { revenue: 0, cogs: 0, orders: 0 };
            byDay[r._id].revenue += r.revenue;
            byDay[r._id].cogs += r.cogs;
            byDay[r._id].orders += r.orders;
        }
        const series = [];
        const SUDAN_OFFSET = 3 * 60 * 60 * 1000;
        for (let t = from.getTime(); t < to.getTime(); t += 24 * 60 * 60 * 1000) {
            const key = new Date(t + SUDAN_OFFSET).toISOString().slice(0, 10);
            const d = byDay[key] || { revenue: 0, cogs: 0, orders: 0 };
            series.push({ date: key, revenue: d.revenue, profit: d.revenue - d.cogs, orders: d.orders });
        }
        res.json({ series });
    } catch (err) {
        logger.error('reports/sales-series error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/merchant-erp/reports/top-products?period&limit
router.get('/reports/top-products', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const { from, to } = getPeriodRange(req.query.period, req.query.from, req.query.to);
        const limit = Math.min(20, parseInt(req.query.limit) || 10);

        const itemsPipeline = (matchStage, dateField) => ([
            { $match: matchStage },
            { $unwind: '$items' },
            {
                $group: {
                    _id: { $ifNull: ['$items.productId', '$items.name'] },
                    name: { $last: '$items.name' },
                    qty: { $sum: { $ifNull: ['$items.quantity', 1] } },
                    revenue: { $sum: { $multiply: ['$items.price', { $ifNull: ['$items.quantity', 1] }] } },
                    profit: { $sum: { $multiply: [{ $subtract: ['$items.price', { $ifNull: ['$items.cost', 0] }] }, { $ifNull: ['$items.quantity', 1] }] } }
                }
            }
        ]);

        const appTop = await ShopOrder.aggregate(itemsPipeline(
            { place: req.place._id, status: 'delivered', deliveredAt: { $gte: from, $lt: to } }
        ));
        const posTop = await PosSale.aggregate(itemsPipeline(
            { placeId: req.place._id, isVoided: false, createdAt: { $gte: from, $lt: to } }
        ));

        const merged = {};
        for (const r of [...appTop, ...posTop]) {
            const key = String(r._id);
            if (!merged[key]) merged[key] = { productId: key, name: r.name, qty: 0, revenue: 0, profit: 0 };
            merged[key].qty += r.qty;
            merged[key].revenue += r.revenue;
            merged[key].profit += r.profit;
        }
        const top = Object.values(merged).sort((a, b) => b.qty - a.qty).slice(0, limit);
        res.json({ top });
    } catch (err) {
        logger.error('reports/top-products error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/merchant-erp/reports/customers?period&limit — أفضل العملاء (طلبات التطبيق)
router.get('/reports/customers', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const { from, to } = getPeriodRange(req.query.period, req.query.from, req.query.to);
        const limit = Math.min(20, parseInt(req.query.limit) || 10);
        const customers = await ShopOrder.aggregate([
            { $match: { place: req.place._id, status: 'delivered', deliveredAt: { $gte: from, $lt: to } } },
            {
                $group: {
                    _id: '$client',
                    orders: { $sum: 1 },
                    total: { $sum: APP_GOODS_REVENUE_EXPR },
                    lastOrderAt: { $max: '$deliveredAt' }
                }
            },
            { $sort: { total: -1 } },
            { $limit: limit },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            {
                $project: {
                    orders: 1, total: 1, lastOrderAt: 1,
                    name: { $ifNull: [{ $arrayElemAt: ['$user.name', 0] }, 'عميل'] }
                }
            }
        ]);
        res.json({ customers });
    } catch (err) {
        logger.error('reports/customers error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/merchant-erp/reports/profit?period — الأرباح والخسائر (P&L)
router.get('/reports/profit', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const { from, to } = getPeriodRange(req.query.period, req.query.from, req.query.to);
        const totals = await aggregateSales(req.place._id, from, to);

        const expensesByCategory = await Expense.aggregate([
            { $match: { placeId: req.place._id, date: { $gte: from, $lt: to } } },
            { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } }
        ]);
        const expensesTotal = expensesByCategory.reduce((s, e) => s + e.total, 0);

        res.json({
            from, to,
            revenue: totals.revenue,
            cogs: totals.cogs,
            grossProfit: totals.grossProfit,
            expensesTotal,
            expensesByCategory,
            netProfit: totals.grossProfit - expensesTotal,
            ordersCount: totals.ordersCount
        });
    } catch (err) {
        logger.error('reports/profit error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ══════════════════════════════════════════════
// 📦 INVENTORY — إدارة المخزون المتقدمة
// ══════════════════════════════════════════════

// GET /api/merchant-erp/inventory/low-stock
router.get('/inventory/low-stock', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        // المنتجات المتتبَّعة فقط: تحت حد التنبيه المحدد، أو ≤ 5 افتراضياً
        const products = await Product.find({
            placeId: req.place._id,
            stock: { $ne: null },
            $expr: { $lte: ['$stock', { $ifNull: ['$lowStockThreshold', 5] }] }
        }).sort({ stock: 1 }).select('name category stock lowStockThreshold cost price image sku');
        res.json({ products });
    } catch (err) {
        logger.error('inventory/low-stock error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/merchant-erp/inventory/movements?productId&type&page&limit
router.get('/inventory/movements', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 30);
        const filter = { placeId: req.place._id };
        if (req.query.productId && mongoose.isValidObjectId(req.query.productId)) filter.productId = req.query.productId;
        if (req.query.type && ['purchase', 'sale', 'adjustment', 'return'].includes(req.query.type)) filter.type = req.query.type;

        const [movements, total] = await Promise.all([
            StockMovement.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            StockMovement.countDocuments(filter)
        ]);
        res.json({ movements, currentPage: page, totalPages: Math.ceil(total / limit), total });
    } catch (err) {
        logger.error('inventory/movements error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /api/merchant-erp/inventory/restock — توريد بضاعة
// body: { productId, quantity > 0, unitCost?, addAsExpense? }
router.post('/inventory/restock', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const { productId, quantity, unitCost, addAsExpense } = req.body;
        const qty = parseInt(quantity);
        if (!mongoose.isValidObjectId(productId) || isNaN(qty) || qty <= 0) {
            return res.status(400).json({ message: 'المنتج والكمية (رقم موجب) مطلوبان' });
        }
        const cost = (unitCost !== undefined && unitCost !== null && unitCost !== '') ? Number(unitCost) : null;
        if (cost !== null && (isNaN(cost) || cost < 0)) {
            return res.status(400).json({ message: 'تكلفة الوحدة يجب أن تكون رقماً موجباً' });
        }

        const product = await Product.findOne({ _id: productId, placeId: req.place._id });
        if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });

        // منتج غير متتبَّع (غير محدود) → التوريد يبدأ التتبع من الكمية الموردة
        product.stock = (product.stock === null || product.stock === undefined) ? qty : product.stock + qty;
        product.isAvailable = product.stock > 0 ? true : product.isAvailable;
        if (cost !== null) product.cost = cost; // تحديث التكلفة لآخر سعر شراء
        await product.save();

        recordStockMovement({
            placeId: req.place._id, productId: product._id, productName: product.name,
            type: 'purchase', quantity: qty, balanceAfter: product.stock,
            unitCost: cost !== null ? cost : (product.cost || 0),
            reason: 'توريد بضاعة', createdBy: req.user._id
        });

        // خيار: تسجيل قيمة التوريد كمصروف (للتقارير فقط)
        let expense = null;
        if (addAsExpense && cost !== null && cost > 0) {
            expense = await Expense.create({
                placeId: req.place._id,
                category: 'supplies',
                amount: Math.round(cost * qty),
                description: `توريد ${qty} × ${product.name}`,
                createdBy: req.user._id
            });
        }

        res.json({ message: `تم توريد ${qty} قطعة — المخزون الآن ${product.stock}`, product, expense });
    } catch (err) {
        logger.error('inventory/restock error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /api/merchant-erp/inventory/adjust — تسوية جرد يدوية
// body: { productId, newStock (>=0 أو null لإيقاف التتبع), reason }
router.post('/inventory/adjust', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const { productId, newStock, reason } = req.body;
        if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ message: 'المنتج مطلوب' });

        let stockValue = null;
        if (newStock !== null && newStock !== undefined && newStock !== '') {
            stockValue = parseInt(newStock);
            if (isNaN(stockValue) || stockValue < 0) {
                return res.status(400).json({ message: 'الكمية الجديدة يجب أن تكون رقماً موجباً أو فارغة' });
            }
        }

        const product = await Product.findOne({ _id: productId, placeId: req.place._id });
        if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });

        const previous = product.stock;
        product.stock = stockValue;
        if (stockValue !== null) product.isAvailable = stockValue > 0;
        else product.isAvailable = true;
        await product.save();

        if (stockValue !== null && stockValue !== previous) {
            recordStockMovement({
                placeId: req.place._id, productId: product._id, productName: product.name,
                type: 'adjustment',
                quantity: (previous === null || previous === undefined) ? stockValue : stockValue - previous,
                balanceAfter: stockValue,
                reason: (reason || 'تسوية جرد').slice(0, 200),
                createdBy: req.user._id
            });
        }

        res.json({ message: 'تمت التسوية', product });
    } catch (err) {
        logger.error('inventory/adjust error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ══════════════════════════════════════════════
// 💳 FINANCE — المحاسبة: المحفظة، كشف الحساب، المصروفات
// ══════════════════════════════════════════════

// GET /api/merchant-erp/finance/overview
router.get('/finance/overview', protect, merchantOnly, loadPlace, async (req, res) => {
    try {
        const { from, to } = getPeriodRange('month');
        const [monthLedger, pendingAgg, monthExpensesAgg] = await Promise.all([
            ShopLedger.aggregate([
                { $match: { placeId: req.place._id, createdAt: { $gte: from, $lt: to } } },
                { $group: { _id: '$type', total: { $sum: '$amount' } } }
            ]),
            SettlementRequest.aggregate([
                { $match: { placeId: req.place._id, status: 'pending' } },
                { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
            ]),
            Expense.aggregate([
                { $match: { placeId: req.place._id, date: { $gte: from, $lt: to } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);
        const ledgerMap = {};
        for (const l of monthLedger) ledgerMap[l._id] = l.total;

        res.json({
            walletBalance: req.place.shopWalletBalance || 0,
            monthIncome: ledgerMap.sale_income || 0,
            monthSettled: Math.abs(ledgerMap.settlement || 0),
            pendingSettlements: pendingAgg[0] ? pendingAgg[0].total : 0,
            pendingSettlementsCount: pendingAgg[0] ? pendingAgg[0].count : 0,
            monthExpenses: monthExpensesAgg[0] ? monthExpensesAgg[0].total : 0
        });
    } catch (err) {
        logger.error('finance/overview error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/merchant-erp/finance/ledger?page&limit&type — كشف الحساب
router.get('/finance/ledger', protect, merchantOnly, loadPlace, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 30);
        const filter = { placeId: req.place._id };
        if (req.query.type && ['sale_income', 'settlement', 'adjustment'].includes(req.query.type)) filter.type = req.query.type;

        const [entries, total] = await Promise.all([
            ShopLedger.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            ShopLedger.countDocuments(filter)
        ]);
        res.json({ entries, currentPage: page, totalPages: Math.ceil(total / limit), total });
    } catch (err) {
        logger.error('finance/ledger error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ── المصروفات (للتقارير فقط — لا تمس رصيد المحفظة) ──

// GET /api/merchant-erp/expenses?page&limit&category&from&to
router.get('/expenses', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 30);
        const filter = { placeId: req.place._id };
        if (req.query.category) filter.category = req.query.category;
        if (req.query.from || req.query.to) {
            const { from, to } = getPeriodRange('custom', req.query.from, req.query.to);
            filter.date = { $gte: from, $lt: to };
        }
        const [expenses, total, sumAgg] = await Promise.all([
            Expense.find(filter).sort({ date: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            Expense.countDocuments(filter),
            Expense.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }])
        ]);
        res.json({ expenses, currentPage: page, totalPages: Math.ceil(total / limit), total, totalAmount: sumAgg[0] ? sumAgg[0].total : 0 });
    } catch (err) {
        logger.error('expenses GET error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /api/merchant-erp/expenses
router.post('/expenses', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const { category, amount, description, date } = req.body;
        const numericAmount = Number(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ message: 'المبلغ مطلوب ويجب أن يكون رقماً موجباً' });
        }
        const expense = await Expense.create({
            placeId: req.place._id,
            category: ['rent', 'salaries', 'supplies', 'utilities', 'transport', 'other'].includes(category) ? category : 'other',
            amount: Math.round(numericAmount),
            description: (description || '').slice(0, 300),
            date: date ? new Date(date) : new Date(),
            createdBy: req.user._id
        });
        res.status(201).json(expense);
    } catch (err) {
        logger.error('expenses POST error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/merchant-erp/expenses/:id
router.put('/expenses/:id', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const updateData = {};
        if ('category' in req.body && ['rent', 'salaries', 'supplies', 'utilities', 'transport', 'other'].includes(req.body.category)) {
            updateData.category = req.body.category;
        }
        if ('amount' in req.body) {
            const numericAmount = Number(req.body.amount);
            if (isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ message: 'المبلغ يجب أن يكون رقماً موجباً' });
            updateData.amount = Math.round(numericAmount);
        }
        if ('description' in req.body) updateData.description = (req.body.description || '').slice(0, 300);
        if ('date' in req.body && req.body.date) updateData.date = new Date(req.body.date);

        const expense = await Expense.findOneAndUpdate(
            { _id: req.params.id, placeId: req.place._id },
            updateData, { new: true }
        );
        if (!expense) return res.status(404).json({ message: 'المصروف غير موجود' });
        res.json(expense);
    } catch (err) {
        logger.error('expenses PUT error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// DELETE /api/merchant-erp/expenses/:id
router.delete('/expenses/:id', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const expense = await Expense.findOneAndDelete({ _id: req.params.id, placeId: req.place._id });
        if (!expense) return res.status(404).json({ message: 'المصروف غير موجود' });
        res.json({ message: 'تم حذف المصروف' });
    } catch (err) {
        logger.error('expenses DELETE error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ══════════════════════════════════════════════
// 🏦 SETTLEMENTS — تسوية مستحقات التاجر (يدوية عبر الأدمن)
// ══════════════════════════════════════════════

// GET /api/merchant-erp/finance/settlements — طلبات التاجر
router.get('/finance/settlements', protect, merchantOnly, loadPlace, async (req, res) => {
    try {
        const settlements = await SettlementRequest.find({ placeId: req.place._id })
            .sort({ createdAt: -1 }).limit(50).lean();
        res.json({ settlements });
    } catch (err) {
        logger.error('settlements GET error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// POST /api/merchant-erp/finance/settlements — طلب سحب جديد
router.post('/finance/settlements', protect, merchantOnly, loadPlace, async (req, res) => {
    try {
        const { amount, note } = req.body;
        const numericAmount = Math.round(Number(amount));
        if (isNaN(numericAmount) || numericAmount <= 0) {
            return res.status(400).json({ message: 'المبلغ مطلوب ويجب أن يكون رقماً موجباً' });
        }

        // الرصيد المتاح = رصيد المحفظة - مجموع الطلبات المعلقة (منع السحب المزدوج)
        const pendingAgg = await SettlementRequest.aggregate([
            { $match: { placeId: req.place._id, status: 'pending' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const pendingTotal = pendingAgg[0] ? pendingAgg[0].total : 0;
        const available = (req.place.shopWalletBalance || 0) - pendingTotal;
        if (numericAmount > available) {
            return res.status(400).json({
                message: `المبلغ يتجاوز رصيدك المتاح للسحب (${available} ج.س)${pendingTotal > 0 ? ` — لديك ${pendingTotal} ج.س في طلبات معلقة` : ''}`,
                available
            });
        }

        const settlement = await SettlementRequest.create({
            placeId: req.place._id,
            merchantId: req.user._id,
            amount: numericAmount,
            note: (note || '').slice(0, 300)
        });

        notifyAdmins(req.app, {
            title: 'طلب تسوية مستحقات جديد',
            message: `تاجر ${req.place.name} طلب سحب ${numericAmount} ج.س من مستحقاته.`,
            type: 'settlement_request',
            relatedId: settlement._id
        });

        res.status(201).json({ message: 'تم إرسال طلب التسوية — ستصلك الموافقة بعد مراجعة الإدارة', settlement });
    } catch (err) {
        logger.error('settlements POST error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ── ADMIN: مراجعة التسويات ──

// GET /api/merchant-erp/admin/settlements?status=pending
router.get('/admin/settlements', protect, adminOnly, requirePermission('view_finance'), async (req, res) => {
    try {
        const filter = {};
        if (req.query.status && ['pending', 'approved', 'rejected'].includes(req.query.status)) filter.status = req.query.status;
        const settlements = await SettlementRequest.find(filter)
            .populate('placeId', 'name city shopWalletBalance bankAccountName bankAccountNumber bankName')
            .populate('merchantId', 'name phone')
            .sort({ createdAt: -1 }).limit(100).lean();
        res.json({ settlements });
    } catch (err) {
        logger.error('admin/settlements GET error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/merchant-erp/admin/settlements/:id/approve
// body: { transactionId?, receiptImage? }
router.put('/admin/settlements/:id/approve', protect, adminOnly, requirePermission('manage_finance'), async (req, res) => {
    try {
        // 🧾 تحويل إيصال التسوية من Base64 إلى ملف قبل التخزين (بدل حشوه في المستند)
        const { saveBase64ToUploads } = require('../utils/imageUpload');
        const savedReceipt = saveBase64ToUploads(req.body.receiptImage, 'proofs');

        // انتقال ذري: pending → approved (يمنع الموافقة المزدوجة)
        const settlement = await SettlementRequest.findOneAndUpdate(
            { _id: req.params.id, status: 'pending' },
            {
                $set: {
                    status: 'approved',
                    transactionId: (req.body.transactionId || '').slice(0, 100),
                    receiptImage: savedReceipt,
                    reviewedBy: req.user._id,
                    reviewedAt: new Date()
                }
            },
            { new: true }
        );
        if (!settlement) return res.status(400).json({ message: 'الطلب غير موجود أو تمت مراجعته مسبقاً' });

        // خصم ذري من رصيد المحفظة + قيد settlement — يفشل لو الرصيد غير كافٍ
        const ledgerResult = await recordLedgerEntry({
            placeId: settlement.placeId,
            type: 'settlement',
            amount: -settlement.amount,
            refModel: 'SettlementRequest',
            refId: settlement._id,
            note: `تسوية مستحقات${settlement.transactionId ? ' — إشعار ' + settlement.transactionId : ''}`,
            createdBy: req.user._id
        });
        if (!ledgerResult.ok) {
            // تراجع: أعد الطلب لحالة الانتظار
            await SettlementRequest.findByIdAndUpdate(settlement._id, {
                $set: { status: 'pending', reviewedBy: null, reviewedAt: null }
            });
            return res.status(400).json({ message: 'رصيد محفظة المتجر لا يغطي مبلغ التسوية — تحقق من الرصيد' });
        }

        await sendNotification(req.app, {
            userId: settlement.merchantId,
            title: 'تمت الموافقة على التسوية',
            message: `تم تحويل ${settlement.amount} ج.س من مستحقاتك. رصيدك الحالي: ${ledgerResult.balanceAfter} ج.س.`,
            type: 'settlement_approved',
            relatedId: settlement._id
        });

        res.json({ message: 'تمت الموافقة وخصم المبلغ من رصيد المتجر', settlement, balanceAfter: ledgerResult.balanceAfter });
    } catch (err) {
        logger.error('admin/settlements approve error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/merchant-erp/admin/settlements/:id/reject
router.put('/admin/settlements/:id/reject', protect, adminOnly, requirePermission('manage_finance'), async (req, res) => {
    try {
        const settlement = await SettlementRequest.findOneAndUpdate(
            { _id: req.params.id, status: 'pending' },
            {
                $set: {
                    status: 'rejected',
                    adminNote: (req.body.adminNote || '').slice(0, 300),
                    reviewedBy: req.user._id,
                    reviewedAt: new Date()
                }
            },
            { new: true }
        );
        if (!settlement) return res.status(400).json({ message: 'الطلب غير موجود أو تمت مراجعته مسبقاً' });

        await sendNotification(req.app, {
            userId: settlement.merchantId,
            title: 'تم رفض طلب التسوية',
            message: `تم رفض طلب سحب ${settlement.amount} ج.س.${settlement.adminNote ? ' السبب: ' + settlement.adminNote : ''}`,
            type: 'settlement_rejected',
            relatedId: settlement._id
        });

        res.json({ message: 'تم رفض الطلب', settlement });
    } catch (err) {
        logger.error('admin/settlements reject error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ── ADMIN: باقة المتجر (ناشئ/كبير) ──

// PUT /api/merchant-erp/admin/places/:id/tier — body: { tier: 'basic' | 'pro' }
router.put('/admin/places/:id/tier', protect, adminOnly, requirePermission('manage_stores'), async (req, res) => {
    try {
        const { tier } = req.body;
        if (!['basic', 'pro'].includes(tier)) {
            return res.status(400).json({ message: 'الباقة يجب أن تكون basic أو pro' });
        }
        const place = await Place.findByIdAndUpdate(
            req.params.id,
            { $set: { tier } },
            { new: true }
        ).select('name tier ownerId');
        if (!place) return res.status(404).json({ message: 'المتجر غير موجود' });

        // إشعار التاجر بتغيير باقته
        if (place.ownerId) {
            await sendNotification(req.app, {
                userId: place.ownerId,
                title: tier === 'pro' ? 'تمت ترقية متجرك' : 'تم تغيير باقة متجرك',
                message: tier === 'pro'
                    ? 'أصبح متجرك على باقة المتجر الكبير — نقطة البيع والتقارير والمخزون المتقدم والمصروفات متاحة الآن من لوحتك.'
                    : 'أصبح متجرك على الباقة الأساسية. مستحقاتك وتسوياتك تعمل كالمعتاد.',
                type: 'tier_change',
                relatedId: place._id
            });
        }

        res.json({ message: `تم تغيير باقة "${place.name}" إلى ${tier === 'pro' ? 'متجر كبير' : 'أساسي'}`, place });
    } catch (err) {
        logger.error('admin tier change error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// ══════════════════════════════════════════════
// 🧾 POS — نقطة بيع مباشرة (Walk-in)
// ══════════════════════════════════════════════

// POST /api/merchant-erp/pos/sale
// body: { items: [{productId, quantity}], discount?, paymentMethod?, note? }
router.post('/pos/sale', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const { items, discount, paymentMethod, note } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'أضف منتجاً واحداً على الأقل للفاتورة' });
        }
        if (items.length > 50) return res.status(400).json({ message: 'عدد أصناف الفاتورة كبير جداً' });

        // التحقق وحساب الإجمالي — الأسعار والتكاليف من قاعدة البيانات فقط
        let itemsTotal = 0;
        const validatedItems = [];
        for (const item of items) {
            if (!mongoose.isValidObjectId(item.productId)) {
                return res.status(400).json({ message: 'منتج غير صالح في الفاتورة' });
            }
            const product = await Product.findOne({ _id: item.productId, placeId: req.place._id });
            if (!product) return res.status(400).json({ message: `المنتج غير موجود في متجرك` });
            const qty = Math.max(1, parseInt(item.quantity) || 1);
            if (product.stock !== null && product.stock !== undefined && product.stock < qty) {
                return res.status(400).json({ message: `المنتج "${product.name}" متوفر منه ${product.stock} فقط` });
            }
            const subtotal = product.price * qty;
            itemsTotal += subtotal;
            validatedItems.push({
                productId: product._id, name: product.name,
                price: product.price, cost: product.cost || 0,
                quantity: qty, subtotal
            });
        }

        const discountValue = Math.max(0, Math.min(Math.round(Number(discount) || 0), itemsTotal));
        const totalAmount = itemsTotal - discountValue;

        // خصم المخزون ذرياً مع تراجع كامل عند أي فشل (نفس نمط طلبات التطبيق)
        const reserved = [];
        const movementsToLog = [];
        let stockError = null;
        for (const item of validatedItems) {
            const productCheck = await Product.findById(item.productId).select('stock');
            if (productCheck && productCheck.stock !== null && productCheck.stock !== undefined) {
                const updated = await Product.findOneAndUpdate(
                    { _id: item.productId, stock: { $gte: item.quantity } },
                    [
                        {
                            $set: {
                                stock: { $subtract: ['$stock', item.quantity] },
                                isAvailable: {
                                    $cond: {
                                        if: { $lte: [{ $subtract: ['$stock', item.quantity] }, 0] },
                                        then: false, else: '$isAvailable'
                                    }
                                }
                            }
                        }
                    ],
                    { new: true }
                );
                if (!updated) { stockError = `المنتج "${item.name}" نفد أو الكمية غير كافية`; break; }
                reserved.push(item);
                movementsToLog.push({ item, balanceAfter: updated.stock, updatedDoc: updated });
            } else {
                reserved.push(item);
            }
        }
        if (stockError) {
            for (const r of reserved) {
                const p = await Product.findById(r.productId).select('stock');
                if (p && p.stock !== null && p.stock !== undefined) {
                    await Product.findByIdAndUpdate(r.productId, { $inc: { stock: r.quantity }, $set: { isAvailable: true } });
                }
            }
            return res.status(400).json({ message: stockError });
        }

        const sale = await PosSale.create({
            placeId: req.place._id,
            items: validatedItems,
            itemsTotal,
            discount: discountValue,
            totalAmount,
            paymentMethod: paymentMethod === 'bank' ? 'bank' : 'cash',
            note: (note || '').slice(0, 300),
            createdBy: req.user._id
        });

        for (const mv of movementsToLog) {
            recordStockMovement({
                placeId: req.place._id, productId: mv.item.productId, productName: mv.item.name,
                type: 'sale', quantity: -mv.item.quantity, balanceAfter: mv.balanceAfter,
                reason: 'بيع — نقطة بيع', refModel: 'PosSale', refId: sale._id,
                createdBy: req.user._id
            });
            checkLowStockAlert(req.app, req.place, mv.updatedDoc);
        }

        res.status(201).json({ message: 'تم تسجيل البيع', sale });
    } catch (err) {
        logger.error('pos/sale error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// GET /api/merchant-erp/pos/sales?page&limit — سجل فواتير نقطة البيع
router.get('/pos/sales', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const filter = { placeId: req.place._id };

        const { from, to } = getPeriodRange('today');
        const [sales, total, todayAgg] = await Promise.all([
            PosSale.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            PosSale.countDocuments(filter),
            PosSale.aggregate([
                { $match: { placeId: req.place._id, isVoided: false, createdAt: { $gte: from, $lt: to } } },
                { $group: { _id: null, revenue: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
            ])
        ]);
        res.json({
            sales, currentPage: page, totalPages: Math.ceil(total / limit), total,
            today: { revenue: todayAgg[0] ? todayAgg[0].revenue : 0, count: todayAgg[0] ? todayAgg[0].count : 0 }
        });
    } catch (err) {
        logger.error('pos/sales GET error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

// PUT /api/merchant-erp/pos/sales/:id/void — إلغاء فاتورة وإرجاع المخزون
router.put('/pos/sales/:id/void', protect, merchantOnly, loadPlace, requirePro, async (req, res) => {
    try {
        // انتقال ذري يمنع الإلغاء المزدوج (وبالتالي الإرجاع المزدوج للمخزون)
        const sale = await PosSale.findOneAndUpdate(
            { _id: req.params.id, placeId: req.place._id, isVoided: false },
            {
                $set: {
                    isVoided: true,
                    voidedAt: new Date(),
                    voidReason: (req.body.reason || '').slice(0, 200)
                }
            },
            { new: true }
        );
        if (!sale) return res.status(400).json({ message: 'الفاتورة غير موجودة أو ملغاة مسبقاً' });

        // إرجاع المخزون للمنتجات المتتبَّعة
        for (const item of sale.items) {
            if (item.productId) {
                const prod = await Product.findById(item.productId).select('stock');
                if (prod && prod.stock !== null && prod.stock !== undefined) {
                    const restored = await Product.findByIdAndUpdate(item.productId, {
                        $inc: { stock: item.quantity },
                        $set: { isAvailable: true }
                    }, { new: true }).select('stock name');
                    recordStockMovement({
                        placeId: req.place._id, productId: item.productId, productName: item.name,
                        type: 'return', quantity: item.quantity,
                        balanceAfter: restored ? restored.stock : null,
                        reason: 'إرجاع — إلغاء فاتورة نقطة بيع', refModel: 'PosSale', refId: sale._id,
                        createdBy: req.user._id
                    });
                }
            }
        }

        res.json({ message: 'تم إلغاء الفاتورة وإرجاع المخزون', sale });
    } catch (err) {
        logger.error('pos/void error:', err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
