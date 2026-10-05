/**
 * لقطات فيديو شرح التاجر — التسجيل كتاجر ولوحة المتجر، من التطبيق الحقيقي
 * ببياناتٍ تجريبية واقعية (مطعم الساحة، الخرطوم).
 *   node tools/shots-merchant.js [name,name,...]
 * كل لقطة: screens/merchant/<name>.png + <name>.json
 *
 * ملاحظتان عن الإحداثيات (marks) في الـ json:
 *  - اللقطات العادية (fullPage=false): الإحداثيات **بإحداثيات الصورة** (CSS px)
 *    — تُطرح منها إزاحة التمرير إن مُرِّرت الصفحة قبل الالتقاط (scrollY محفوظ).
 *  - اللقطات الطويلة (fullPage): الترويسات اللاصقة (sticky) تُحوَّل إلى relative
 *    قبل القياس، فتبقى في رأس الصورة الطويلة وتطابق الإحداثياتُ الصورةَ.
 */
const cap = require('./capture');
const art = require('./merchant-art');
const fs = require('fs');
const OUT = __dirname + '/../screens/merchant/';
fs.mkdirSync(OUT, { recursive: true });

const MIN = 60000, now = Date.now();
const ago = (m) => new Date(now - m * MIN).toISOString();
const later = (d) => new Date(now + d * 86400000).toISOString();

// ── بيانات العرض ─────────────────────────────────────────────────────────
const MERCHANT = { _id: 'u1', id: 'u1', name: 'أحمد محمد', role: 'merchant', phone: '0912345678', email: 'ahmed.alsaha@example.com', city: 'Khartoum' };
const CLIENT = { _id: 'u1', id: 'u1', name: 'أحمد محمد', role: 'client', phone: '0912345678', city: 'Khartoum' };

const PAY = [
    { method: 'bankak', accountNumber: '0123456789', accountName: 'مطعم الساحة للأغذية' },
    { method: 'fawry', accountNumber: '4455667788', accountName: 'أحمد محمد' }
];
const PLACE = {
    _id: 'p1', name: 'مطعم الساحة', description: 'بيتزا وشاورما وبرقر طازجة، وعصائر فريش — توصيل سريع لكل أحياء الخرطوم.',
    is_open: true, isOpenOverride: true, tier: 'pro', shareCode: 'sa7a', category: { name: 'مطاعم' },
    address: 'الرياض، شارع عبيد ختم، جوار صيدلية النيل', phone: '0912345678', whatsapp: '0912345678',
    image_url: art.cover, workingHours: { open: '09:00', close: '23:30', days: [0, 1, 2, 3, 4, 6] },
    paymentMethods: PAY, city: 'Khartoum'
};
const P = (o) => Object.assign({ isAvailable: true, stock: null, cost: 0, lowStockThreshold: 5, salePrice: null }, o);
const PRODUCTS = [
    P({ _id: 'p1', name: 'بيتزا خضار', description: 'عجينة طازجة، صلصة طماطم، جبنة موزاريلا، فلفل رومي وزيتون أسود.', price: 5500, cost: 3200, category: 'بيتزا', stock: 18, sku: 'PZ-VEG', image: art.pizzaVeg }),
    P({ _id: 'p2', name: 'بيتزا مارغريتا', description: 'صلصة طماطم وجبنة موزاريلا وريحان.', price: 5000, cost: 2900, category: 'بيتزا', stock: 3, sku: 'PZ-MAR', image: art.pizzaMarg }),
    P({ _id: 'p3', name: 'شاورما فراخ', description: 'شاورما فراخ بالثومية والمخلل في خبز صاج.', price: 3500, cost: 1900, category: 'شاورما', salePrice: 3000, saleStartsAt: ago(60 * 24), saleEndsAt: later(6), sku: 'SH-CH', image: art.shawarmaChicken }),
    P({ _id: 'p4', name: 'شاورما لحم', description: 'شاورما لحم بالطحينة والبصل.', price: 4000, cost: 2400, category: 'شاورما', stock: 0, isAvailable: false, sku: 'SH-MT', image: art.shawarmaMeat }),
    P({ _id: 'p5', name: 'برقر لحم', description: 'قطعة لحم بقري 150 جرام، جبنة شيدر، خس وطماطم، مع بطاطس.', price: 4500, cost: 2600, category: 'برقر', stock: 12, sku: 'BG-BF', image: art.burgerBeef }),
    P({ _id: 'p6', name: 'برقر فراخ', description: 'صدر فراخ مقرمش مع صوص خاص.', price: 4000, cost: 2200, category: 'برقر', stock: 4, sku: 'BG-CH', image: art.burgerChicken }),
    P({ _id: 'p7', name: 'عصير مانجو', description: 'مانجو طازة بدون سكر مضاف.', price: 1500, cost: 700, category: 'عصائر', stock: 25, sku: 'JU-MG', image: art.juiceMango }),
    P({ _id: 'p8', name: 'عصير ليمون بالنعناع', description: 'ليمون ونعناع فريش مع ثلج.', price: 1200, cost: 450, category: 'عصائر', sku: 'JU-LM', image: art.juiceLemon })
];

const DROP = (address, name, phone) => ({ address, receiverName: name, receiverPhone: phone });
const ORD = {
    newOrder: { _id: '66f0a1b2c3d4e5f6a7b81a01', status: 'shop_pending', paymentStatus: 'pending', createdAt: ago(2),
        client: { _id: 'c1', name: 'سارة عبدالله' },
        items: [{ name: 'بيتزا خضار', quantity: 2, price: 5500 }, { name: 'عصير مانجو', quantity: 1, price: 1500 }], itemsTotal: 12500,
        dropoff: DROP('الرياض، شارع المشتل، بالقرب من صيدلية الشفاء', 'سارة عبدالله', '0923456789'),
        notes: 'لو سمحت بدون بصل، والعصير يكون بارد' },
    receipt: { _id: '66f0a1b2c3d4e5f6a7b82b02', status: 'shop_preparing', paymentStatus: 'receipt_sent', paidVia: 'bankak', paymentReceiptImage: art.receipt, createdAt: ago(9),
        client: { _id: 'c1', name: 'سارة عبدالله' },
        items: [{ name: 'بيتزا خضار', quantity: 2, price: 5500 }, { name: 'عصير مانجو', quantity: 1, price: 1500 }], itemsTotal: 12500,
        dropoff: DROP('الرياض، شارع المشتل، بالقرب من صيدلية الشفاء', 'سارة عبدالله', '0923456789') },
    remind: { _id: '66f0a1b2c3d4e5f6a7b83c03', status: 'shop_preparing', paymentStatus: 'pending', createdAt: ago(14),
        client: { _id: 'c2', name: 'عمر الطيب' },
        items: [{ name: 'شاورما فراخ', quantity: 3, price: 3000 }, { name: 'عصير ليمون بالنعناع', quantity: 2, price: 1200 }], itemsTotal: 11400,
        dropoff: DROP('المعمورة، شارع 41، عمارة الصفا', 'عمر الطيب', '0915556677') },
    publish: { _id: '66f0a1b2c3d4e5f6a7b84d04', status: 'shop_preparing', paymentStatus: 'confirmed', paidVia: 'fawry', createdAt: ago(22),
        client: { _id: 'c3', name: 'منى إبراهيم' },
        items: [{ name: 'برقر لحم', quantity: 2, price: 4500 }, { name: 'عصير مانجو', quantity: 2, price: 1500 }], itemsTotal: 12000,
        dropoff: DROP('الطائف، مربع 3، بيت رقم 27', 'منى إبراهيم', '0912223344') },
    waiting: { _id: '66f0a1b2c3d4e5f6a7b85e05', status: 'ready_for_pickup', paymentStatus: 'confirmed', createdAt: ago(31),
        client: { _id: 'c4', name: 'خالد حسن' },
        items: [{ name: 'بيتزا مارغريتا', quantity: 1, price: 5000 }, { name: 'شاورما فراخ', quantity: 2, price: 3000 }], itemsTotal: 11000,
        dropoff: DROP('أركويت، مربع 49، جوار مسجد النور', 'خالد حسن', '0918887766') },
    withCaptain: { _id: '66f0a1b2c3d4e5f6a7b86f06', status: 'captain_assigned', paymentStatus: 'confirmed', createdAt: ago(40),
        client: { _id: 'c2', name: 'عمر الطيب' }, captain: { _id: 'k1', name: 'محمد عثمان', phone: '0911223344' },
        items: [{ name: 'برقر فراخ', quantity: 2, price: 4000 }, { name: 'عصير ليمون بالنعناع', quantity: 1, price: 1200 }], itemsTotal: 9200,
        dropoff: DROP('الخرطوم 2، شارع المك نمر', 'عمر الطيب', '0915556677') },
    delivered: { _id: '66f0a1b2c3d4e5f6a7b87a07', status: 'delivered', paymentStatus: 'confirmed', createdAt: ago(95),
        client: { _id: 'c5', name: 'هالة يوسف' }, items: [{ name: 'بيتزا خضار', quantity: 1, price: 5500 }], itemsTotal: 5500, dropoff: DROP('بري، شارع الشهيد', 'هالة يوسف', '0919990011') },
    cancelled: { _id: '66f0a1b2c3d4e5f6a7b88b08', status: 'cancelled', paymentStatus: 'pending', createdAt: ago(130), cancelReason: 'العميل طلب الإلغاء قبل التجهيز',
        client: { _id: 'c6', name: 'ياسر محمود' }, items: [{ name: 'شاورما لحم', quantity: 2, price: 4000 }], itemsTotal: 8000, dropoff: DROP('الصحافة، مربع 12', 'ياسر محمود', '0914443322') }
};
// الطلب المعنيّ أوّلاً — يظهر بطاقةً أولى في تبويب «نشط» بلا تمرير
const ordersWith = (first) => ({ orders: [ORD[first], ...Object.keys(ORD).filter(k => k !== first).map(k => ORD[k])], currentPage: 1, totalPages: 1, total: 8 });

const CONVS = [
    { userId: 'c1', user: { name: 'سارة عبدالله', role: 'client' }, lastMessage: 'تمام، حوّلت المبلغ ورفعت الإيصال', lastMessageAt: ago(3), lastSender: 'c1', unreadCount: 2, orderId: ORD.receipt._id },
    { userId: 'c2', user: { name: 'عمر الطيب', role: 'client' }, lastMessage: 'الطلب حيكون جاهز بعد ربع ساعة إن شاء الله', lastMessageAt: ago(38), lastSender: 'u1', unreadCount: 0, orderId: ORD.remind._id },
    { userId: 'c3', user: { name: 'منى إبراهيم', role: 'client' }, lastMessage: 'ممكن البرقر بدون طماطم؟', lastMessageAt: ago(65), lastSender: 'c3', unreadCount: 1, orderId: ORD.publish._id },
    { userId: 'c4', user: { name: 'خالد حسن', role: 'client' }, lastMessage: 'شكراً، الأكل وصل سخن', lastMessageAt: ago(60 * 26), lastSender: 'c4', unreadCount: 0, orderId: ORD.waiting._id },
    { userId: 'c5', user: { name: 'هالة يوسف', role: 'client' }, lastMessage: 'عندكم بيتزا فراخ؟', lastMessageAt: ago(60 * 24 * 3), lastSender: 'c5', unreadCount: 0, orderId: ORD.delivered._id }
];
const MSG = (id, from, text, m, extra) => Object.assign({ _id: id, sender: from === 'me' ? 'u1' : { _id: 'c1', name: 'سارة عبدالله' }, text, createdAt: ago(m), isRead: true }, extra || {});
const CHAT = [
    MSG('m1', 'c', 'السلام عليكم، طلبت بيتزا خضار اتنين وعصير مانجو', 16),
    MSG('m2', 'me', 'وعليكم السلام يا أستاذة سارة، الطلب وصلنا وقبلناهو', 15),
    MSG('m3', 'me', 'ممكن تحوّلي 12,500 ج.س على بنكك وترفعي الإيصال من صفحة الطلب', 15),
    MSG('m4', 'c', 'تمام، حوّلت المبلغ ورفعت الإيصال', 4),
    MSG('m5', 'c', 'بالله العصير يكون بارد', 3),
    MSG('m6', 'me', 'أكيد، أكّدنا الدفع وبنجهّز الطلب هسي — دقايق وبنرسلو مع الكابتن', 1, { isRead: false })
];

const NOTIFS = [
    { _id: 'n1', type: 'new_shop_order', title: 'طلب جديد', message: 'سارة عبدالله طلبت 2 بيتزا خضار وعصير مانجو — 12,500 ج.س', createdAt: ago(2), isRead: false },
    { _id: 'n2', type: 'payment_receipt', title: 'وصل إشعار دفع', message: 'سارة عبدالله رفعت إيصال التحويل — راجعه وأكّد الاستلام', createdAt: ago(8), isRead: false },
    { _id: 'n3', type: 'order_assigned', title: 'كابتن في الطريق إليك', message: 'الكابتن محمد عثمان قبل طلب عمر الطيب وفي طريقه لاستلامه', createdAt: ago(35), isRead: false },
    { _id: 'n4', type: 'low_stock', title: 'مخزون منخفض', message: 'بيتزا مارغريتا: تبقّت 3 قطع فقط', createdAt: ago(80), isRead: true },
    { _id: 'n5', type: 'order_delivered', title: 'تم تسليم الطلب', message: 'وصل طلب هالة يوسف بنجاح', createdAt: ago(60 * 3), isRead: true },
    { _id: 'n6', type: 'order_cancelled', title: 'أُلغي طلب', message: 'ياسر محمود ألغى طلبه قبل التجهيز', createdAt: ago(60 * 26), isRead: true },
    { _id: 'n7', type: 'tier_change', title: 'متجرك صار احترافياً', message: 'فُعّلت لك نقطة البيع والتقارير والمخزون المتقدّم', createdAt: ago(60 * 24 * 3), isRead: true }
];

const SALES = [
    { _id: 'v1', totalAmount: 12000, itemsTotal: 12500, discount: 500, paymentMethod: 'cash', createdAt: ago(12), items: [{ name: 'بيتزا خضار', quantity: 2, price: 5500, subtotal: 11000 }, { name: 'عصير مانجو', quantity: 1, price: 1500, subtotal: 1500 }] },
    { _id: 'v2', totalAmount: 9000, itemsTotal: 9000, discount: 0, paymentMethod: 'bank', createdAt: ago(48), items: [{ name: 'برقر لحم', quantity: 2, price: 4500, subtotal: 9000 }] },
    { _id: 'v3', totalAmount: 6000, itemsTotal: 6000, discount: 0, paymentMethod: 'cash', createdAt: ago(95), items: [{ name: 'شاورما فراخ', quantity: 2, price: 3000, subtotal: 6000 }] },
    { _id: 'v4', totalAmount: 4800, itemsTotal: 4800, discount: 0, paymentMethod: 'cash', createdAt: ago(140), items: [{ name: 'عصير ليمون بالنعناع', quantity: 4, price: 1200, subtotal: 4800 }], isVoided: true },
    { _id: 'v5', totalAmount: 6700, itemsTotal: 6700, discount: 0, paymentMethod: 'cash', createdAt: ago(200), items: [{ name: 'بيتزا مارغريتا', quantity: 1, price: 5000, subtotal: 5000 }, { name: 'عصير مانجو', quantity: 1, price: 1500, subtotal: 1500 }] }
];
const SERIES = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 86400000).toISOString().slice(0, 10);
    const rev = [52000, 61500, 48000, 73500, 88000, 69500, 94000][i];
    return { date: d, revenue: rev, profit: Math.round(rev * 0.41) };
});
const PROMOS = [
    { _id: 'pr1', code: 'SAHA20', type: 'percentage', value: 20, maxDiscount: 3000, isActive: true, validUntil: later(20), usedCount: 14, usageLimit: 100, products: [], minOrderValue: 8000, description: 'خصم افتتاح فرع الرياض' },
    { _id: 'pr2', code: 'JUICE3', type: 'bogo', bogo: { buyQuantity: 2, freeQuantity: 1 }, isActive: true, validUntil: later(9), usedCount: 6, usageLimit: null,
      products: [{ _id: 'p7', name: 'عصير مانجو' }, { _id: 'p8', name: 'عصير ليمون بالنعناع' }], minQuantity: 3, description: 'اشترِ عصيرين والتالت علينا' },
    { _id: 'pr3', code: 'WEEKEND1000', type: 'fixed', value: 1000, isActive: true, validUntil: ago(60 * 24 * 2), usedCount: 31, usageLimit: 50, products: [{ _id: 'p5', name: 'برقر لحم' }, { _id: 'p6', name: 'برقر فراخ' }], description: 'عرض نهاية الأسبوع' }
];

// ── المحاكيات ────────────────────────────────────────────────────────────
const M = (orders = ordersWith('newOrder'), extra = []) => [
    ...extra,
    [/auth\/me/, MERCHANT], [/auth\/refresh/, {}],
    [/merchant\/badges/, { orders: 2, messages: 3, notifications: 3, products: 3 }],
    [/merchant\/orders\/[^/]+\/delivery-order/, { orderId: 'd1' }],
    [/merchant\/orders/, orders],
    [/merchant\/profile/, { place: PLACE, user: MERCHANT }],
    [/merchant\/products/, { place: PLACE, products: PRODUCTS }],
    [/merchant\/promo-codes/, PROMOS],
    [/chat\/conversations/, CONVS],
    [/notifications\/unread-count/, { count: 3 }],
    [/notifications/, { notifications: NOTIFS, currentPage: 1, totalPages: 1 }],
    [/merchant-erp\/pos\/sale$/, { sale: SALES[0] }],
    [/merchant-erp\/pos\/sales/, { sales: SALES, totalPages: 1, today: { count: 7, revenue: 38500 } }],
    [/inventory\/low-stock/, { products: PRODUCTS.filter(p => p.stock !== null && p.stock <= 5) }],
    [/inventory\/movements/, { total: 46, totalPages: 2, movements: [
        { productName: 'بيتزا خضار', type: 'sale', quantity: -2, balanceAfter: 18, createdAt: ago(12), reason: 'نقطة بيع' },
        { productName: 'برقر لحم', type: 'purchase', quantity: 20, balanceAfter: 24, createdAt: ago(60 * 3), reason: 'توريد من المورّد' },
        { productName: 'برقر لحم', type: 'sale', quantity: -2, balanceAfter: 12, createdAt: ago(48), reason: 'طلب تطبيق' },
        { productName: 'بيتزا مارغريتا', type: 'adjustment', quantity: -1, balanceAfter: 3, createdAt: ago(60 * 5), reason: 'تلف' },
        { productName: 'شاورما لحم', type: 'sale', quantity: -3, balanceAfter: 0, createdAt: ago(60 * 7), reason: 'طلب تطبيق' },
        { productName: 'عصير مانجو', type: 'return', quantity: 1, balanceAfter: 25, createdAt: ago(60 * 26), reason: 'إلغاء فاتورة' },
        { productName: 'برقر فراخ', type: 'sale', quantity: -4, balanceAfter: 4, createdAt: ago(60 * 28), reason: 'طلب تطبيق' }] }],
    [/reports\/summary/, { revenue: 486500, breakdown: { app: { revenue: 352000 }, pos: { revenue: 134500 } }, grossProfit: 198300, cogs: 288200, ordersCount: 94, itemsSold: 212, avgOrderValue: 5176 }],
    [/reports\/sales-series/, { series: SERIES }],
    [/reports\/profit/, { revenue: 486500, cogs: 288200, grossProfit: 198300, expensesTotal: 92000, netProfit: 106300,
        expensesByCategory: [{ _id: 'rent', total: 45000 }, { _id: 'salaries', total: 35000 }, { _id: 'utilities', total: 12000 }] }],
    [/reports\/top-products/, { top: [
        { name: 'بيتزا خضار', qty: 58, revenue: 319000, profit: 133400 }, { name: 'شاورما فراخ', qty: 46, revenue: 138000, profit: 50600 },
        { name: 'برقر لحم', qty: 31, revenue: 139500, profit: 58900 }, { name: 'عصير مانجو', qty: 44, revenue: 66000, profit: 35200 }] }],
    [/reports\/customers/, { customers: [
        { name: 'سارة عبدالله', orders: 9, total: 98500 }, { name: 'عمر الطيب', orders: 7, total: 71200 }, { name: 'منى إبراهيم', orders: 5, total: 54000 }] }]
];
const CLIENT_BASE = [[/auth\/me/, CLIENT], [/auth\/refresh/, {}], [/unread-count/, { count: 2 }], [/favorites/, []], [/auth\/addresses/, { addresses: [] }],
    [/price-config/, { city: 'Khartoum', baseFare: 1500, costPerKm: 400, costPerMinute: 25, extraStopFee: 500, maxDiscountPercent: 10, maxPriceSurgePercent: 100, maxTipAmount: 20000 }]];
const JOIN = (req, status) => [...CLIENT_BASE, [/merchant-requests\/my-request/, req, status],
    [/merchant-requests\/form-data/, { banks: [], categories: [{ _id: 'c1', name: 'مطاعم' }, { _id: 'c2', name: 'بقالات' }, { _id: 'c3', name: 'مخابز' }, { _id: 'c4', name: 'أجهزة وإلكترونيات' }] }]];

// ── أدوات داخل الصفحة (نصوص تُحقن قبل دالة before) ──────────────────────
const HELPERS = `
window.__set = (id, v) => { const el = document.getElementById(id); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; };
window.__blur = () => { if (document.activeElement) document.activeElement.blur(); };
window.__sleep = (ms) => new Promise(r => setTimeout(r, ms));
window.__scrollTo = (sel, pad) => { const el = document.querySelector(sel); if (!el) return false; const hdr = document.querySelector('.page-header, .m-page-header'); const h = hdr ? hdr.getBoundingClientRect().height : 0; window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - h - (pad == null ? 12 : pad)), behavior: 'instant' }); return true; };
window.__file = async (inputId, dataUrl, name) => { const b = await (await fetch(dataUrl)).blob(); const dt = new DataTransfer(); dt.items.add(new File([b], name, { type: b.type })); const inp = document.getElementById(inputId); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); };
`;
const UNSTICK = `document.querySelectorAll('body *').forEach(e => { if (getComputedStyle(e).position === 'sticky') e.style.position = 'relative'; });`;

// ── اللقطات ──────────────────────────────────────────────────────────────
const MERCH = { role: 'merchant', user: MERCHANT, local: { shop_audio_enabled: null, posHelpSeen: '1' } };
const NAV = { navHome: '.merchant-nav a:nth-child(1)', navOrders: '.merchant-nav a:nth-child(2)', navMessages: '.merchant-nav a:nth-child(3)', navNotifs: '.merchant-nav a:nth-child(4)', navLogout: '.merchant-nav a:nth-child(5)' };
const JOIN_FILL = async () => {
    await __sleep(300);
    __set('fBusinessName', 'مطعم الساحة'); __set('fCategory', 'c1');
    __set('fDescription', 'بيتزا وشاورما وبرقر طازجة، وعصائر فريش — توصيل سريع لكل أحياء الخرطوم.');
    __set('fReferralSource', 'social'); __set('fReferralDetail', 'فيسبوك — صفحة وجيز');
    __set('fOwnerName', 'أحمد محمد عبدالرحمن'); __set('fPhone', '0912345678');
    __set('fAddress', 'الرياض، شارع عبيد ختم، جوار صيدلية النيل');
    const loc = document.getElementById('locationBtn');
    loc.classList.add('selected'); loc.innerHTML = '<span><i class="bi bi-geo-alt-fill me-2"></i>تم تحديد الموقع</span><i class="bi bi-check-circle-fill"></i>';
    const tick = (id) => { const c = document.getElementById('pm-' + id); if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } };
    tick('bankak'); tick('fawry');
    __set('pm-bankak-num', '0123456789'); __set('pm-bankak-name', 'مطعم الساحة للأغذية');
    __set('pm-fawry-num', '4455667788'); __set('pm-fawry-name', 'أحمد محمد');
    await __sleep(250); __blur(); await __sleep(1200);
};
const JOIN_MARKS = { name: '#fBusinessName', category: '#fCategory', description: '#fDescription', referral: '#fReferralSource', referralDetail: '#fReferralDetail',
    location: '#locationBtn', address: '#fAddress', ownerName: '#fOwnerName', phone: '#fPhone', payTitle: '#fPaymentTitle', payBox: '#fPaymentMethods',
    bankak: '#pm-bankak', fawry: '#pm-fawry', logo: '#box-logo', ownerId: '#box-id', terms: '#termsCheck', termsLink: '.terms-link', submit: '#submitBtn' };
// الشعار والهوية مرفوعان: نفس مسار handleFile الحقيقي بملفّ صورةٍ مختار
const JOIN_DOCS = `await __file('fLogo', ${JSON.stringify(art.logo)}, 'logo.svg'); await __file('fId', ${JSON.stringify(art.logo)}, 'id.svg'); document.getElementById('termsCheck').checked = true;`;

const SHOTS = {
    // ── 1) الوصول للتسجيل ───────────────────────────────────────────────
    joinEntry: {
        url: 'index.html', role: 'client', user: CLIENT, local: { userName: 'أحمد محمد' }, wait: 2500, mocks: CLIENT_BASE, after: 900,
        before: () => { const el = document.getElementById('sideMenu'); bootstrap.Offcanvas.getOrCreateInstance(el).show(); return !!el; },
        marks: { menuGroup: '#sideMenu .list-group + .wj-menu-group', registerShop: '#sideMenu a[href="client-register-shop.html"]', registerCaptain: '#sideMenu a[href="captain-signup.html"]' }
    },
    // ── 2) نموذج الانضمام ───────────────────────────────────────────────
    joinForm1: {
        url: 'client-register-shop.html', role: 'client', user: CLIENT, wait: 2200, mocks: JOIN({}, 404),
        before: `(async () => { await (${JOIN_FILL.toString()})(); window.scrollTo({ top: 0, behavior: 'instant' }); return true; })()`, marks: JOIN_MARKS
    },
    joinMap: {
        url: 'client-register-shop.html', role: 'client', user: CLIENT, wait: 2200, mocks: JOIN({}, 404), after: 4500,
        before: async () => {
            openMap(); await __sleep(600); document.getElementById('map').style.isolation = 'isolate';
            map.setCenter({ lat: 15.5838, lng: 32.5627 }); map.setZoom(17);
            document.getElementById('map-address-preview').innerHTML = '<i class="bi bi-geo-alt-fill text-success"></i> الرياض، شارع عبيد ختم، الخرطوم';
            return true;
        },
        marks: { close: '#mapModal .btn-light', title: '#mapModal .map-ui-layer > div:nth-child(2)', search: '#map-search-input', locate: '#locateMeBtn', pin: '.pin-marker', preview: '#map-address-preview', confirm: '#mapModal .btn-success' }
    },
    joinForm2: {
        url: 'client-register-shop.html', role: 'client', user: CLIENT, wait: 2200, mocks: JOIN({}, 404),
        before: `(async () => { await (${JOIN_FILL.toString()})(); __scrollTo('#fReferralSource', 10); return true; })()`, marks: JOIN_MARKS
    },
    joinPay: {
        url: 'client-register-shop.html', role: 'client', user: CLIENT, wait: 2200, mocks: JOIN({}, 404),
        before: `(async () => { await (${JOIN_FILL.toString()})(); __scrollTo('#fPaymentTitle', 28); return true; })()`, marks: JOIN_MARKS
    },
    joinDocs: {
        url: 'client-register-shop.html', role: 'client', user: CLIENT, wait: 2200, mocks: JOIN({}, 404),
        before: `(async () => { await (${JOIN_FILL.toString()})(); ${JOIN_DOCS} await __sleep(200); __scrollTo('#box-logo', 90); return true; })()`, marks: JOIN_MARKS
    },
    joinFull: {
        url: 'client-register-shop.html', role: 'client', user: CLIENT, wait: 2200, mocks: JOIN({}, 404), fullPage: true,
        before: `(async () => { await (${JOIN_FILL.toString()})(); ${JOIN_DOCS} return true; })()`, marks: JOIN_MARKS
    },
    joinTerms: {
        url: 'client-register-shop.html', role: 'client', user: CLIENT, wait: 2200, mocks: JOIN({}, 404), keepOverlays: true,
        before: () => { openTermsModal(); return true; },
        marks: { sheet: '#termsModal .terms-sheet', accept: '#termsAcceptBtn', close: '.terms-close-btn' }
    },
    // ── 3) حالة الطلب ───────────────────────────────────────────────────
    joinPending: {
        url: 'client-register-shop.html', role: 'client', user: CLIENT, wait: 2200, mocks: JOIN({ status: 'pending' }),
        marks: { card: '.status-card', title: '.status-card h4' }
    },
    joinApproved: {
        url: 'client-register-shop.html', role: 'client', user: CLIENT, wait: 2200, mocks: JOIN({ status: 'approved' }),
        marks: { card: '.status-card', title: '.status-card h4', goDashboard: '.status-card a.btn' }
    },
    upgradePopup: {
        url: 'index.html', role: 'client', user: CLIENT, wait: 3000, keepOverlays: true,
        mocks: [[/auth\/me/, { ...MERCHANT }], ...CLIENT_BASE.slice(1)],
        before: () => { document.querySelectorAll('.theme-toggle').forEach(e => e.remove()); return true; },
        marks: { popup: '.swal2-popup', title: '.swal2-title', goDashboard: '.swal2-confirm', later: '.swal2-cancel' }
    },
    // ── 4) لوحة التاجر ──────────────────────────────────────────────────
    dash: {
        url: 'merchant-dashboard.html', ...MERCH, wait: 2600, mocks: M(),
        marks: { merchantName: '#merchantName', shopName: '#shopName', openToggle: '#statusToggleBtn', statNew: '#tile-pending', statPreparing: '.m-hstat:nth-of-type(1)',
                 statsRow: '#stat-pending', quickProfile: 'a.m-quick-btn[href="merchant-profile.html"]', quickProducts: 'a.m-quick-btn[href="merchant-products.html"]',
                 quickPromos: 'a.m-quick-btn[href="merchant-promos.html"]', quickOrders: 'a.m-quick-btn[href="merchant-orders.html"]', quickMessages: 'a.m-quick-btn[href="merchant-conversations.html"]',
                 erpTitle: '#erpSectionTitle', pos: 'a.m-quick-btn[href="merchant-pos.html"]', reports: 'a.m-quick-btn[href="merchant-reports.html"]', inventory: 'a.m-quick-btn[href="merchant-inventory.html"]',
                 orderCaptain: 'a[href="index.html?from=merchant"]', share: 'a[onclick="openShareModal()"]', recentOrders: '#recentOrders', ...NAV }
    },
    dashFull: {
        url: 'merchant-dashboard.html', ...MERCH, wait: 2600, mocks: M(), fullPage: true,
        marks: { openToggle: '#statusToggleBtn', statNew: '#tile-pending', quickProfile: 'a.m-quick-btn[href="merchant-profile.html"]', quickProducts: 'a.m-quick-btn[href="merchant-products.html"]',
                 quickPromos: 'a.m-quick-btn[href="merchant-promos.html"]', quickOrders: 'a.m-quick-btn[href="merchant-orders.html"]', quickMessages: 'a.m-quick-btn[href="merchant-conversations.html"]',
                 erpTitle: '#erpSectionTitle', erpGrid: '#erpGrid', orderCaptain: 'a[href="index.html?from=merchant"]', share: 'a[onclick="openShareModal()"]', recentOrders: '#recentOrders', firstOrder: '#recentOrders .m-order-row' }
    },
    shareStore: {
        url: 'merchant-dashboard.html', ...MERCH, wait: 2600, mocks: M(), after: 900,
        before: () => { openShareModal(); return !!document.querySelector('#shareQr canvas, #shareQr img'); },
        marks: { sheet: '#shareModal > div', link: '#shareLinkText', copy: '#shareModal button[onclick="copyShareLink()"]', preview: '#shareModal button[onclick="previewStore()"]',
                 whatsapp: '#shareModal button[onclick="shareViaWhatsApp()"]', share: '#shareModal button[onclick="shareViaSystem()"]', qr: '#shareQr', downloadQr: '#shareModal button[onclick="downloadShareQr()"]' }
    },
    // ── 6) الملف ────────────────────────────────────────────────────────
    profile: {
        url: 'merchant-profile.html', ...MERCH, wait: 2200, mocks: M(),
        marks: { edit: '#editToggleBtn', cover: '.shop-cover', tier: '.tier-badge', preview: 'button[onclick="previewStore()"]', info: '.profile-card:nth-of-type(2)' }
    },
    profileFull: {
        url: 'merchant-profile.html', ...MERCH, wait: 2200, mocks: M(), fullPage: true,
        marks: { edit: '#editToggleBtn', cover: '.shop-cover', tier: '.tier-badge', preview: 'button[onclick="previewStore()"]', replayTour: 'button[onclick="replayTour()"]' }
    },
    profileEdit: {
        url: 'merchant-profile.html', ...MERCH, wait: 2200, mocks: M(), fullPage: true,
        before: () => { enterEditMode(); return true; },
        marks: { image: '.cover-edit-btn', name: '#fName', desc: '#fDesc', address: '#fAddress', phone: '#fPhone', whatsapp: '#fWhatsapp',
                 open: '#fOpen', close: '#fClose', days: '#daysWrap', payments: '#fPaymentMethods', save: '#btnSave' }
    },
    // ── 7) المنتجات ─────────────────────────────────────────────────────
    products: {
        url: 'merchant-products.html', ...MERCH, wait: 2200, mocks: M(), fullPage: true,
        marks: { search: '#productSearch', stats: '#productStats', firstCard: '.product-card', saleBadge: '.product-meta .badge.bg-danger', lowStock: '.badge-low-stock',
                 editBtn: '.product-actions .icon-btn:nth-child(1)', hideBtn: '.product-actions .icon-btn:nth-child(2)', deleteBtn: '.product-actions .icon-btn:nth-child(3)' }
    },
    productsTop: {
        url: 'merchant-products.html', ...MERCH, wait: 2200, mocks: M(),
        marks: { search: '#productSearch', stats: '#productStats', firstCard: '.product-card', fab: '.m-fab', editBtn: '.product-actions .icon-btn:nth-child(1)', ...NAV }
    },
    productForm: {
        url: 'merchant-products.html', ...MERCH, wait: 2200, mocks: M(), keepOverlays: true, after: 900,
        before: () => { openEditModal('p3'); return true; },
        marks: { title: '#modalTitle', name: '#pName', desc: '#pDesc', price: '#pPrice', cost: '#pCost', margin: '#marginPreview', saleBox: '#pSalePrice', salePreview: '#salePreview', saleStart: '#pSaleStart', saleEnd: '#pSaleEnd' }
    },
    productFormBottom: {
        url: 'merchant-products.html', ...MERCH, wait: 2200, mocks: M(), keepOverlays: true, after: 900,
        before: async () => { openEditModal('p5'); await __sleep(500); const b = document.querySelector('#productModal .modal-body'); b.scrollTop = b.scrollHeight; return true; },
        marks: { category: '#pCategory', sku: '#pSku', image: 'label[for="productImageUpload"]', imagePreview: '#productImagePreview', stock: '#pStock', lowStock: '#pLowStock', available: '#pAvailable', save: '#btnSaveProduct' }
    },
    productAdd: {
        url: 'merchant-products.html', ...MERCH, wait: 2200, mocks: M(), keepOverlays: true, after: 900,
        before: async () => {
            openAddModal(); await __sleep(400);
            __set('pName', 'برقر لحم دبل'); __set('pDesc', 'قطعتين لحم بقري، جبنة شيدر، بصل مكرمل، مع بطاطس.');
            __set('pPrice', '6500'); __set('pCost', '3800'); updateMarginPreview(); __blur(); return true;
        },
        marks: { title: '#modalTitle', name: '#pName', desc: '#pDesc', price: '#pPrice', cost: '#pCost', margin: '#marginPreview', saleBox: '#pSalePrice' }
    },
    // ── 8-12) الطلبات ───────────────────────────────────────────────────
    ordersNew: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('newOrder')),
        marks: { tabs: '#filterTabs', tabActive: '#filterTabs .filter-tab:nth-child(1)', tabNew: '#filterTabs .filter-tab:nth-child(2)', tabPreparing: '#filterTabs .filter-tab:nth-child(3)',
                 tabCaptain: '#filterTabs .filter-tab:nth-child(4)', card: '.order-card', ribbon: '.order-card .new-ribbon', items: '.order-card .items-box', money: '.order-card .money-box',
                 address: '.order-card .addr-box', notes: '.order-card .addr-box[style*="fffbeb"]', steps: '.order-card .steps', publishState: '.order-card .publish-state',
                 accept: '.order-card .btn-step1', chat: '.order-card .btn-sec.chat', reject: '.order-card .btn-sec.danger', refresh: 'button[onclick="loadOrders()"]' }
    },
    ordersNewFull: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('newOrder')), fullPage: true,
        marks: { tabs: '#filterTabs', card: '.order-card', accept: '.order-card .btn-step1', reject: '.order-card .btn-sec.danger' }
    },
    ordersReceipt: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('receipt')),
        before: () => { __scrollTo('.order-card .money-box', 6); return true; },
        marks: { card: '.order-card', receipt: '.order-card .receipt-box', receiptImg: '.order-card .receipt-img', paidVia: '.order-card .receipt-box span.d-flex', steps: '.order-card .steps',
                 confirmPay: '.order-card .btn-step2', chat: '.order-card .btn-sec.chat', cancel: '.order-card .btn-sec.danger' }
    },
    receiptZoom: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('receipt')), keepOverlays: true, after: 900,
        before: () => { document.querySelector('.order-card .receipt-img').click(); return true; },
        marks: { image: '#fullImg', close: '#imgModal .modal-footer button' }
    },
    ordersRemind: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('remind')),
        marks: { card: '.order-card', steps: '.order-card .steps', hint: '.order-card .next-hint', remind: '.order-card .btn-amber', chat: '.order-card .btn-sec.chat', cancel: '.order-card .btn-sec.danger' }
    },
    ordersPublish: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('publish')),
        marks: { card: '.order-card', steps: '.order-card .steps', publishState: '.order-card .publish-state', hint: '.order-card .next-hint', publish: '.order-card .btn-publish' }
    },
    publishConfirm: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('publish')), keepOverlays: true, after: 900,
        before: () => { document.querySelector('.order-card .btn-publish').click(); return true; },
        marks: { popup: '.swal2-popup', title: '.swal2-title', confirm: '.swal2-confirm', cancel: '.swal2-cancel' }
    },
    ordersWaitingCaptain: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('waiting')),
        marks: { card: '.order-card', steps: '.order-card .steps', waiting: '.order-card .track-box', remindCaptains: '.order-card [id^="nudge-"]', cancel: '.order-card .btn-sec.danger' }
    },
    ordersWithCaptain: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('withCaptain')),
        marks: { card: '.order-card', steps: '.order-card .steps', captain: '.order-card .track-box', captainPhone: '.order-card .track-box a', track: '.order-card .btn-track', chat: '.order-card .btn-sec.chat' }
    },
    rejectModal: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('newOrder')), keepOverlays: true, after: 900,
        before: async () => { document.querySelector('.order-card .btn-sec.danger').click(); await __sleep(500); const i = document.querySelector('.swal2-input'); i.value = 'بيتزا الخضار خلصت الليلة'; i.blur(); return true; },
        marks: { popup: '.swal2-popup', title: '.swal2-title', reason: '.swal2-input', confirm: '.swal2-confirm', cancel: '.swal2-cancel' }
    },
    cancelPaidModal: {
        url: 'merchant-orders.html', ...MERCH, wait: 2400, mocks: M(ordersWith('publish')), keepOverlays: true, after: 900,
        before: () => { document.querySelector('.order-card .btn-sec.danger').click(); return true; },
        marks: { popup: '.swal2-popup', title: '.swal2-title', warning: '.swal2-html-container > div', reason: '.swal2-input', confirm: '.swal2-confirm', cancel: '.swal2-cancel' }
    },
    // ── 13) الرسائل ─────────────────────────────────────────────────────
    conversations: {
        url: 'merchant-conversations.html', ...MERCH, wait: 2200, mocks: M(),
        marks: { unreadTotal: '#unreadTotalBadge', first: '.conv-item', firstUnread: '.conv-item .unread-badge', search: 'input[type="search"], input[oninput*="filter"]' }
    },
    chat: {
        url: `chat.html?orderId=${ORD.receipt._id}&receiverId=c1`, ...MERCH, wait: 2600,
        mocks: M(undefined, [[/\/api\/orders\//, { message: 'not found' }, 404],
            [/shop-order\/[^/]+\/chat-info/, { clientId: 'c1', clientName: 'سارة عبدالله', merchantId: 'u1', merchantName: 'مطعم الساحة' }],
            [/\/api\/chat\/read/, {}], [/\/api\/chat\/[0-9a-f]{24}/, { messages: CHAT, hasMore: false }]]),
        marks: { receiver: '#receiverName', messages: '#chatContainer', input: '#messageInput, textarea', send: '#sendBtn, button[onclick*="send"]', attach: 'button[onclick*="image"], label[for*="image"], #attachBtn' }
    },
    // ── 14) نقطة البيع ──────────────────────────────────────────────────
    posIntro: {
        url: 'merchant-pos.html', ...MERCH, local: { posHelpSeen: null }, wait: 2200, mocks: M(),
        marks: { explainer: '#posExplainer', help: '.m-header-title .bi-question-circle', invoices: 'button[onclick="showSalesLog()"]', today: '#todayStats' }
    },
    pos: {
        url: 'merchant-pos.html', ...MERCH, wait: 2200, mocks: M(),
        before: () => { ['p1', 'p1', 'p7', 'p7', 'p5'].forEach(addToCart); return true; },
        marks: { today: '#todayStats', invoices: 'button[onclick="showSalesLog()"]', search: '#posSearch', grid: '#productsGrid', firstProduct: '.pos-product', inCart: '.pos-product.in-cart',
                 cartBar: '#cartBar', cartTotal: '#cartTotal', clear: 'button[onclick="clearCart()"]', checkout: 'button[onclick="openCheckout()"]' }
    },
    posCheckout: {
        url: 'merchant-pos.html', ...MERCH, wait: 2200, mocks: M(), keepOverlays: true, after: 900,
        before: async () => { ['p1', 'p1', 'p7', 'p7', 'p5'].forEach(addToCart); openCheckout(); await __sleep(400); __set('coDiscount', '500'); updateCheckoutTotal(); __blur(); return true; },
        marks: { items: '#checkoutItems', firstQty: '#checkoutItems .cart-item-row', discount: '#coDiscount', payment: '#coPayment', note: '#coNote', total: '#coTotal', confirm: '#btnConfirmSale' }
    },
    posDone: {
        url: 'merchant-pos.html', ...MERCH, wait: 2200, mocks: M(), keepOverlays: true, after: 700,
        before: async () => { ['p1', 'p1', 'p7'].forEach(addToCart); openCheckout(); await __sleep(500); __set('coDiscount', '500'); confirmSale(); await __sleep(600); return true; },
        marks: { popup: '.swal2-popup', title: '.swal2-title', receipt: '.swal2-confirm', done: '.swal2-cancel' }
    },
    posReceipt: {
        url: 'merchant-pos.html', ...MERCH, wait: 2200, mocks: M(), keepOverlays: true, after: 900,
        before: null, // يُضبط أدناه (يحتاج بيانات الفاتورة)
        marks: { popup: '.swal2-popup', title: '.swal2-title', receipt: '.swal2-html-container', share: '.swal2-confirm', print: '.swal2-deny', close: '.swal2-cancel' }
    },
    invoices: {
        url: 'merchant-pos.html', ...MERCH, wait: 2200, mocks: M(), keepOverlays: true, after: 1200,
        before: () => { showSalesLog(); return true; },
        marks: { modal: '#salesLogModal .modal-content', first: '#salesLogBody > div', receiptBtn: '#salesLogBody button[onclick^="shareReceipt"]', voidBtn: '#salesLogBody button[onclick^="voidSale"]', voided: '#salesLogBody .badge.bg-danger' }
    },
    // ── 15) المخزون ─────────────────────────────────────────────────────
    inventory: {
        url: 'merchant-inventory.html', ...MERCH, wait: 2200, mocks: M(),
        marks: { tabLow: '.tab-btn[data-tab="low"]', tabMoves: '.tab-btn[data-tab="movements"]', first: '.item-card', restock: 'button[onclick^="openRestock"]', adjust: 'button[onclick^="openAdjust"]', sub: '#headerSub' }
    },
    inventoryMoves: {
        url: 'merchant-inventory.html', ...MERCH, wait: 2200, mocks: M(), after: 1200,
        before: () => { switchTab('movements', document.querySelector('.tab-btn[data-tab="movements"]')); return true; },
        marks: { tabLow: '.tab-btn[data-tab="low"]', tabMoves: '.tab-btn[data-tab="movements"]', first: '.item-card', sub: '#headerSub' }
    },
    restock: {
        url: 'merchant-inventory.html', ...MERCH, wait: 2200, mocks: M(), keepOverlays: true, after: 900,
        before: async () => { await openRestock('p2'); await __sleep(400); __set('rsQty', '20'); __set('rsCost', '2900'); document.getElementById('rsAsExpense').checked = true; __blur(); return true; },
        marks: { modal: '#restockModal .modal-content', product: '#rsProductName', qty: '#rsQty', cost: '#rsCost', asExpense: '#rsAsExpense', confirm: '#restockModal .btn-warning' }
    },
    adjust: {
        url: 'merchant-inventory.html', ...MERCH, wait: 2200, mocks: M(), keepOverlays: true, after: 900,
        before: async () => { await openAdjust('p6'); await __sleep(400); __set('adjStock', '2'); __set('adjReason', 'جرد دوري — قطعتين تالفات'); __blur(); return true; },
        marks: { modal: '#adjustModal .modal-content', product: '#adjProductName', current: '#adjCurrent', newStock: '#adjStock', reason: '#adjReason', save: '#adjustModal .btn-warning' }
    },
    // ── 16) التقارير ────────────────────────────────────────────────────
    reports: {
        url: 'merchant-reports.html', ...MERCH, wait: 3000, mocks: M(), fullPage: true,
        marks: { periods: '#periodTabs', today: '.period-tab[data-period="today"]', week: '.period-tab[data-period="week"]', month: '.period-tab[data-period="month"]',
                 revenue: '#kpiRevenue', profit: '#kpiProfit', orders: '#kpiOrders', items: '#kpiItems', avg: '#kpiAvg', chart: '#salesChart', pl: '#plBox', netProfit: '#plBox > div:last-child',
                 topProducts: '#topProducts', topCustomers: '#topCustomers' }
    },
    reportsTop: {
        url: 'merchant-reports.html', ...MERCH, wait: 3000, mocks: M(),
        marks: { periods: '#periodTabs', revenue: '#kpiRevenue', profit: '#kpiProfit', orders: '#kpiOrders', chart: '#salesChart' }
    },
    // ── 17) الأكواد ─────────────────────────────────────────────────────
    promos: {
        url: 'merchant-promos.html', ...MERCH, wait: 2200, mocks: M(),
        marks: { info: '.alert-info', first: '.promo-card', code: '.promo-card .promo-code', value: '.promo-card .promo-value', expired: '.promo-card.is-off', fab: '.m-fab' }
    },
    // ⚠️ الخادم يعيد {place, products} والصفحة تتوقّع مصفوفة — انظر MANIFEST
    promoForm: {
        url: 'merchant-promos.html', ...MERCH, wait: 2200, mocks: M(undefined, [[/merchant\/products/, PRODUCTS]]), keepOverlays: true, after: 900,
        before: async () => {
            openAddModal(); await __sleep(400);
            __set('fCode', 'SAHA20'); __set('fType', 'percentage'); onTypeChange(); __set('fValue', '20'); __set('fMaxDiscount', '3000');
            __blur(); return true;
        },
        marks: { title: '#modalTitle', code: '#fCode', type: '#fType', value: '#fValue', maxDiscount: '#fMaxDiscount', products: '#fProducts' }
    },
    promoFormBogo: {
        url: 'merchant-promos.html', ...MERCH, wait: 2200, mocks: M(undefined, [[/merchant\/products/, PRODUCTS]]), keepOverlays: true, after: 900,
        before: async () => {
            openAddModal(); await __sleep(400);
            __set('fCode', 'JUICE3'); __set('fType', 'bogo'); onTypeChange(); __set('fBuyQty', '2'); __set('fFreeQty', '1'); updateBogoHint();
            const sel = document.getElementById('fProducts'); [...sel.options].forEach(o => { o.selected = ['p7', 'p8'].includes(o.value); }); sel.scrollTop = sel.scrollHeight;
            __set('fMinQty', '3'); __set('fUsageLimit', '200'); __set('fUserLimit', '2');
            const d = new Date(Date.now() + 9 * 864e5); __set('fUntil', new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16));
            __set('fDesc', 'اشترِ عصيرين والتالت علينا'); __blur();
            const b = document.querySelector('#promoModal .modal-body'); b.scrollTop = 150; return true;
        },
        marks: { type: '#fType', buyQty: '#fBuyQty', freeQty: '#fFreeQty', hint: '#bogoHint', products: '#fProducts', minQty: '#fMinQty', usage: '#fUsageLimit', perUser: '#fUserLimit', until: '#fUntil', active: '#fActive' }
    },
    // ── 18) الإشعارات ───────────────────────────────────────────────────
    notifications: {
        url: 'merchant-notifications.html', ...MERCH, wait: 2400, mocks: M(),
        marks: { chipAll: '#chipAll', chipUnread: '#chipUnread', markAll: '#markAllReadBtn', list: '#notificationsList', first: '#notificationsList .wn-item, #notificationsList [class*="wn-"]', ...NAV }
    }
};

// إيصال نقطة البيع: يُبنى من بيانات الفاتورة الأولى نفسها
SHOTS.posReceipt.before = `(async () => { await __sleep(300); _salesCache['v1'] = ${JSON.stringify(SALES[0])}; shareReceipt('v1'); return true; })()`;

const fnBody = (b) => typeof b === 'function' ? `(${b.toString()})()` : b;

(async () => {
    const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(SHOTS);
    for (const name of only) {
        const s = SHOTS[name];
        if (!s) { console.log('?', name); continue; }
        const inner = s.before ? fnBody(s.before) : 'true';
        const before = `(async () => { ${HELPERS} const r = await ${inner}; document.querySelectorAll('.theme-toggle').forEach(e => e.remove()); ${s.fullPage ? UNSTICK + ' window.scrollTo({ top: 0, behavior: "instant" });' : ''} await new Promise(q => setTimeout(q, 50)); return { r, sy: Math.round(window.scrollY) }; })()`;
        const o = { dpr: 2.5, ...s, before, out: OUT + name + '.png' };
        const res = await cap.shot(o);
        const sy = (res.info && res.info.sy) || 0;
        // الإحداثيات بإحداثيات الصورة (اللقطات العادية بعد التمرير)
        const jf = OUT + name + '.json';
        if (fs.existsSync(jf)) {
            const j = JSON.parse(fs.readFileSync(jf, 'utf8'));
            if (!s.fullPage && sy && j.marks) Object.values(j.marks).forEach(m => { if (m && typeof m.y === 'number') m.y -= sy; });
            j.scrollY = s.fullPage ? 0 : sy;
            j.coords = 'screenshot CSS px (multiply by dpr 2.5 for image px)';
            fs.writeFileSync(jf, JSON.stringify(j, null, 1));
        }
        const missing = res.marks ? Object.entries(res.marks).filter(([, v]) => !v).map(([k]) => k) : [];
        console.log(`${name}  info=${JSON.stringify(res.info).slice(0, 120)}  ${missing.length ? 'marks-missing=' + missing.join(',') : ''}  ${res.errs.slice(0, 3).join(' | ')}`);
    }
    await cap.close();
})();
