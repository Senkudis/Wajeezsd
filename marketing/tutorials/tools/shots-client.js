/**
 * لقطات فيديو شرح العميل — من التطبيق الحقيقي ببياناتٍ تجريبية واقعية.
 *   node tools/shots-client.js [name,name,...]
 * كل لقطة: screens/client/<name>.png + <name>.json (مواضع العناصر للنقرات والإبرازات)
 */
const cap = require('./capture');
const fs = require('fs');
const OUT = __dirname + '/../screens/client/';
fs.mkdirSync(OUT, { recursive: true });

const ME = { _id: 'u1', id: 'u1', name: 'أحمد محمد', role: 'client', phone: '249912345678', city: 'Khartoum' };
const BASE = [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 2 }], [/favorites/, []]];
const PRICE = [/price-config/, { city: 'Khartoum', baseFare: 1500, costPerKm: 400, costPerMinute: 25, extraStopFee: 500, maxDiscountPercent: 10, maxPriceSurgePercent: 100, maxTipAmount: 20000 }];
const ADDR = [/auth\/addresses/, { addresses: [
    { _id: 'a1', label: 'البيت', address: 'الرياض، شارع المشتل', lat: 15.581, lng: 32.570 },
    { _id: 'a2', label: 'الشغل', address: 'الخرطوم 2، شارع المك نمر', lat: 15.596, lng: 32.534 }] }];
const BANNERS = [/banners/, [{ _id: 'b1', title: 'توصيل أسرع في أم درمان', image: '/assets/app/home.jpg', linkType: 'none' }]];

const fill = (pairs) => `(() => { const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }; ${pairs.map(([k, v]) => `set(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} return true; })()`;

// ── بيانات تجريبية للتسوّق والطلبات والتتبّع (الخرطوم) ──────────────────────
const NOW = Date.now();
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const ahead = (min) => new Date(NOW + min * 60000).toISOString();
// تُبنى سلسلة before من دالةٍ ووسائط — لتمرير البيانات إلى الصفحة
const call = (fn, ...args) => `(${fn.toString()})(${args.map(a => JSON.stringify(a)).join(',')})`;
// آخر موقعٍ معروف (حيّ الرياض) — المسافات تظهر فوراً بدل مؤشّرٍ دوّار
const LASTFIX = { wajeez_last_fix: { lat: 15.581, lng: 32.570, ts: NOW } };
const RECEIPT_IMG = 'data:image/jpeg;base64,' + fs.readFileSync(__dirname + '/assets/chat-receipt.jpg').toString('base64');

const CATS = [
    { _id: 'c1', name: 'مطاعم', icon: 'bi-cup-hot-fill' },
    { _id: 'c2', name: 'سوبر ماركت', icon: 'bi-cart4' },
    { _id: 'c3', name: 'صيدليات', icon: 'bi-capsule' },
    { _id: 'c4', name: 'مخابز', icon: 'bi-basket2-fill' },
    { _id: 'c5', name: 'خضار وفواكه', icon: 'bi-flower1' },
    { _id: 'c6', name: 'هدايا', icon: 'bi-gift-fill' },
    { _id: 'c7', name: 'إلكترونيات', icon: 'bi-phone-fill' },
    { _id: 'c8', name: 'أدوات منزلية', icon: 'bi-house-heart-fill' }
];
const PID = { sa7a: '64f1a2b3c4d5e6f7a8b9c0d1', nile: '64f1a2b3c4d5e6f7a8b9c0d2', riyadh: '64f1a2b3c4d5e6f7a8b9c0d3', amal: '64f1a2b3c4d5e6f7a8b9c0d4', fruit: '64f1a2b3c4d5e6f7a8b9c0d5', gift: '64f1a2b3c4d5e6f7a8b9c0d6' };
const PLACES = [
    { _id: PID.sa7a, name: 'مطعم الساحة', is_open: true, ratingAvg: 4.8, ratingCount: 214, ownerId: 'm1', menu: '/uploads/menus/sa7a.jpg', address: 'الرياض، شارع عبيد ختم', location: { lat: 15.592, lng: 32.558 }, category: CATS[0] },
    { _id: PID.nile, name: 'سوبر ماركت النيل', is_open: true, ratingAvg: 4.7, ratingCount: 98, ownerId: 'm2', address: 'الرياض، شارع المشتل', location: { lat: 15.584, lng: 32.566 }, category: CATS[1] },
    { _id: PID.riyadh, name: 'صيدلية الرياض', is_open: true, ratingAvg: 4.9, ratingCount: 61, ownerId: 'm3', address: 'الرياض، مربع 12', location: { lat: 15.578, lng: 32.574 }, category: CATS[2] },
    { _id: PID.amal, name: 'مخبز الأمل', is_open: true, ratingAvg: 4.6, ratingCount: 143, address: 'الطائف، شارع 15', location: { lat: 15.587, lng: 32.585 }, category: CATS[3] },
    { _id: PID.fruit, name: 'فواكه المشتل', is_open: true, ratingAvg: 0, ratingCount: 0, ownerId: 'm5', address: 'المشتل', location: { lat: 15.575, lng: 32.561 }, category: CATS[4] },
    { _id: PID.gift, name: 'هدايا الأمير', is_open: false, ratingAvg: 4.5, ratingCount: 27, ownerId: 'm6', address: 'العمارات، شارع 61', location: { lat: 15.574, lng: 32.548 }, category: CATS[5] }
];
const SHOP_MOCKS = [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 2 }], [/banners/, []],
    [/places\/categories/, CATS], [/places\/favorites\/ids/, { ids: [PID.sa7a, PID.nile] }], [/places\/favorites/, [PLACES[0], PLACES[1]]],
    [/api\/places\?/, PLACES], PRICE];

// متجر مطعم الساحة ومنتجاته
const PRODUCTS = [
    { _id: 'p01', name: 'شاورما دجاج عربي', category: 'وجبات', description: 'شاورما دجاج بالثومية والمخلل والبطاطس، مع عيش صاج طازة.', price: 5000, listPrice: 5000, effectivePrice: 4250, onSale: true, discountPercent: 15, stock: 12, ratingAvg: 4.9, ratingCount: 87 },
    { _id: 'p02', name: 'برجر لحم مع بطاطس', category: 'وجبات', description: 'قطعة لحم بقري 150 جم، جبنة شيدر، خس وطماطم، مع بطاطس مقلية.', price: 6000, ratingAvg: 4.7, ratingCount: 56 },
    { _id: 'p03', name: 'فراخ مشوية — نص', category: 'وجبات', description: 'نص فرخة مشوية على الفحم مع رز بسمتي وسلطة.', price: 9000, stock: 3, ratingAvg: 4.8, ratingCount: 41 },
    { _id: 'p04', name: 'بيتزا خضار وسط', category: 'وجبات', description: 'عجينة رقيقة، صلصة طماطم، فلفل، زيتون وجبنة موزاريلا.', price: 7000, stock: 0, ratingAvg: 4.5, ratingCount: 19 },
    { _id: 'p05', name: 'فول بالجبنة والبيض', category: 'فطور', description: 'فول مدمس بالزيت والجبنة والبيض مع عيش بلدي.', price: 2500, stock: 8, ratingAvg: 4.6, ratingCount: 112 },
    { _id: 'p06', name: 'سندوتش طعمية', category: 'فطور', description: 'طعمية سخنة بالسلطة والدكوة.', price: 1500, ratingAvg: 4.4, ratingCount: 73 },
    { _id: 'p07', name: 'عصير مانجو طازج', category: 'مشروبات', description: 'مانجو طازة بدون سكر مضاف — كوب كبير.', price: 2500, listPrice: 2500, effectivePrice: 2000, onSale: true, discountPercent: 20, stock: 5, ratingAvg: 4.9, ratingCount: 64 },
    { _id: 'p08', name: 'ليمون بالنعناع', category: 'مشروبات', description: 'ليمون فريش بالنعناع والثلج.', price: 1500, ratingAvg: 4.7, ratingCount: 38 }
];
const SHOP_PLACE = Object.assign({}, PLACES[0], { isOpenOverride: true, viewsCount: 5320, shareCode: 'sa7a', city: 'Khartoum' });
const SHOP_DETAIL_MOCKS = [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 2 }],
    [/merchant\/shop\/[0-9a-f]+\/products/, { place: SHOP_PLACE, products: PRODUCTS }],
    [/places\/favorites\/ids/, { ids: [PID.sa7a] }], [/apply-promo/, { discount: 500, appliesTo: 'delivery', scopeLabel: 'التوصيل' }],
    [/delivery-zone/, {}], PRICE];
// يضيف أصنافاً للسلة كما يفعل العميل (ثم يُخفي نوافذ «تمت الإضافة» العابرة)
const addItems = () => {
    addToCart('p01'); changeQty('p01', 1); addToCart('p07'); addToCart('p05');
    document.querySelectorAll('.swal2-container').forEach(e => e.remove());
    document.body.classList.remove('swal2-shown', 'swal2-height-auto');
    return Object.keys(cart).length;
};

// ── طلباتي ──
const ORDER_IDS = { search: '650000000000000000b1a001', deliv: '650000000000000000b1a002', shopDone: '650000000000000000b1a003', cancel: '650000000000000000b1a004', cancelShop: '650000000000000000b1a005', errand: '650000000000000000b1a006', pay: '650000000000000000b1a007', pay2: '650000000000000000b1a008' };
const baseDelivery = (o) => Object.assign({
    _id: ORDER_IDS.search, status: 'pending', orderType: 'delivery', price: 3500, city: 'Khartoum', client: 'u1',
    pickup: { address: 'الخرطوم 2، شارع المك نمر', contactName: 'أحمد محمد', contactPhone: '0912345678', lat: 15.596, lng: 32.534 },
    dropoff: { address: 'الرياض، شارع المشتل', receiverName: 'سارة عبدالله', receiverPhone: '0923456789', lat: 15.581, lng: 32.570 },
    details: 'ظرف مستندات مهم', createdAt: ago(2), negotiations: []
}, o);
const OFFERS = [
    { captainId: 'cap1', captainName: 'محمد عبدالله', captainRating: 4.9, captainRatingCount: 312, captainVehicle: 'motorcycle', proposedPrice: 3500, status: 'pending', expiresAt: ahead(4.2) },
    { captainId: 'cap2', captainName: 'عثمان الطيب', captainRating: 4.7, captainRatingCount: 88, captainVehicle: 'rickshaw', proposedPrice: 4000, status: 'pending', expiresAt: ahead(2.6) }
];
const PAY_METHODS = [
    { method: 'bankak', label: 'بنكك', accountNumber: '0123456789', accountName: 'مطعم الساحة للأغذية' },
    { method: 'mycashi', label: 'ماي كاشي', accountNumber: '0912345678', accountName: 'مطعم الساحة' },
    { method: 'fawry', label: 'فوري', accountNumber: '4455667788', accountName: 'مطعم الساحة' },
    { method: 'ocash', label: 'أوكاش', accountNumber: '5566778899', accountName: 'مطعم الساحة' }];
const shopOrder = (o) => Object.assign({
    _id: ORDER_IDS.pay, shopOrderId: ORDER_IDS.pay, orderType: 'shop', status: 'pending', realShopStatus: 'shop_pending', paymentStatus: 'pending',
    placeId: PID.sa7a, price: 15250, itemsTotal: 12250, deliveryFee: 3000, pickup: { address: 'مطعم الساحة' }, dropoff: { address: 'الرياض، شارع المشتل' },
    createdAt: ago(6), details: '2x شاورما دجاج عربي، 1x عصير مانجو طازج، 1x فول بالجبنة والبيض', paymentMethods: PAY_METHODS, negotiations: []
}, o);
const TL = (cur, base = 0) => {
    const keys = [['placed', 'تم الطلب', 25], ['accepted', 'قبول الكابتن', 21], ['picked_up', 'الاستلام', 12], ['delivered', 'التسليم', 1]];
    const ci = keys.findIndex(k => k[0] === cur);
    return { current: cur, steps: keys.map((k, i) => ({ key: k[0], label: k[1], done: i <= ci, at: i <= ci ? ago(k[2] + base) : null })) };
};
const ORDERS_MOCKS = (orders, extra = []) => [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 1 }], ...extra,
    [/feedback\/pending/, { pending: null }],
    [/rating-tags/, { positive: [{ code: 'fast', label: 'سريع' }, { code: 'polite', label: 'محترم' }, { code: 'careful', label: 'حافظ على الطلب' }, { code: 'on_time', label: 'وصل في الوقت' }],
        negative: [{ code: 'late', label: 'تأخّر كثيراً' }, { code: 'rude', label: 'تعامل سيئ' }, { code: 'damaged', label: 'الطلب تضرّر' }], maxTags: 4 }],
    [/my-orders/, { orders, currentPage: 1, totalPages: 1, total: orders.length }]];
const swalOk = () => !!document.querySelector('.swal2-popup');

// ── التتبّع ── (المسار الحقيقي: شارع عبيد ختم ثم المشتل — من أداة الإعلان)
const PATH = JSON.parse(fs.readFileSync(__dirname + '/../../wajeez-ad-v2/tools/path.json', 'utf8'));
const pathAt = (f) => PATH[Math.min(PATH.length - 1, Math.max(0, Math.round(f * (PATH.length - 1))))];
const TRACK_ID = '650000000000000000a7c3f1';
const CAPTAIN = { _id: 'cap1', name: 'محمد عبدالله', phone: '0912345678', vehicleType: 'motorcycle', averageRating: 4.9, ratingCount: 312, completedTrips: 1240 };
const trackOrder = (o) => Object.assign({
    _id: TRACK_ID, status: 'picked_up', orderType: 'delivery', price: 3500, city: 'Khartoum', client: { _id: 'u1', name: 'أحمد محمد' },
    pickup: { address: 'مطعم الساحة، شارع عبيد ختم', contactName: 'مطعم الساحة', contactPhone: '0912000111', lat: PATH[0].lat, lng: PATH[0].lng },
    dropoff: { address: 'الرياض، شارع المشتل', receiverName: 'أحمد محمد', receiverPhone: '0912345678', lat: PATH[PATH.length - 1].lat, lng: PATH[PATH.length - 1].lng },
    captain: Object.assign({}, CAPTAIN, { currentLocation: Object.assign({ fixedAt: new Date(NOW - 8000).toISOString() }, pathAt(0.55)) }),
    createdAt: ago(25), acceptedAt: ago(21), pickedUpAt: ago(12), details: 'وجبتين شاورما وعصير', timeline: TL('picked_up'), tip: { amount: 0 }
}, o);
const TRACK_MOCKS = (order) => [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }],
    [/price-config/, { maxTipAmount: 20000 }], [new RegExp('api/orders/' + order._id), order],
    [/api\/captain\/cap1\/location/, Object.assign({}, order.captain.currentLocation)], [/tip/, {}]];
// الخريطة: يُستدعى initTrackingMap إن سبقه الطلب، ويُرسم المسار (محوّل Leaflet لا يرسم Directions)
const trackBefore = async (path, cap, withRoute) => {
    // نافذة Swal تضع height:auto على الصفحة فتنطوي الخريطة (ارتفاع 100%) إلى صفر
    document.documentElement.classList.remove('swal2-height-auto'); document.body.classList.remove('swal2-height-auto');
    for (let i = 0; i < 4 && !window.__lmap; i++) {
        if (window.initTrackingMap) window.initTrackingMap();
        await new Promise(r => setTimeout(r, 1500));
    }
    if (window.__lmap) window.__lmap.invalidateSize();
    if (window.__lmap && withRoute) {
        L.polyline(path.map(p => [p.lat, p.lng]), { color: '#ffffff', weight: 9, opacity: 0.9 }).addTo(window.__lmap);
        L.polyline(path.map(p => [p.lat, p.lng]), { color: '#0A8754', weight: 5, opacity: 0.95 }).addTo(window.__lmap);
    }
    (window.__h.captain_location_updated || []).forEach(fn => fn({ orderId: '650000000000000000a7c3f1', lat: cap.lat, lng: cap.lng, fixAge: 0 }));
    await new Promise(r => setTimeout(r, 1800));
    return !!window.__lmap;
};

// ── المحادثة ──
const CHAT_MSGS = [
    { _id: 'm1', sender: { _id: 'cap1', name: 'محمد عبدالله' }, text: 'السلام عليكم، أنا في سوبر ماركت النيل هسي', createdAt: ago(14), isRead: true },
    { _id: 'm2', sender: { _id: 'u1', name: 'أحمد محمد' }, text: 'وعليكم السلام، تمام يا كابتن', createdAt: ago(13), isRead: true },
    { _id: 'm3', sender: { _id: 'cap1', name: 'محمد عبدالله' }, text: 'اللبن 2 لتر ما في، أجيب لتر ونص اتنين؟', createdAt: ago(12), isRead: true },
    { _id: 'm4', sender: { _id: 'u1', name: 'أحمد محمد' }, text: 'أيوه جيب اتنين، وشكراً', createdAt: ago(11), isRead: true },
    { _id: 'm5', sender: { _id: 'cap1', name: 'محمد عبدالله' }, imageUrl: RECEIPT_IMG, text: 'دي الفاتورة، وأنا جايك في الطريق', createdAt: ago(5), isRead: true },
    { _id: 'm6', sender: { _id: 'u1', name: 'أحمد محمد' }, text: 'تمام، البيت جنب الجامع — البوابة الخضراء', createdAt: ago(4), isRead: true }
];
const CHAT_MOCKS = [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }],
    [/api\/chat\/read/, {}], [/api\/chat\//, { messages: CHAT_MSGS, hasMore: false }],
    [/api\/orders\//, trackOrder({})]];
const chatBefore = async () => {
    (window.__h.connect || []).forEach(f => { try { f(); } catch (e) {} });
    await new Promise(r => setTimeout(r, 600));
    const c = document.getElementById('chatContainer'); if (c) c.scrollTop = c.scrollHeight;
    return document.querySelectorAll('.msg-wrapper').length;
};

// ── الإشعارات ──
const NOTIFS = [
    { _id: 'n1', type: 'order_accepted', title: 'تم قبول طلبك', message: 'الكابتن محمد عبدالله في الطريق إليك الآن.', isRead: false, createdAt: ago(3), url: 'tracking.html?orderId=' + TRACK_ID },
    { _id: 'n2', type: 'chat_message', title: 'رسالة جديدة من الكابتن', message: 'دي الفاتورة، وأنا جايك في الطريق', isRead: false, createdAt: ago(5), url: 'chat.html?orderId=' + TRACK_ID },
    { _id: 'n3', type: 'errand_quote', title: 'سعر طلبك جاهز', message: 'سعر البضاعة من سوبر ماركت النيل 10,500 ج.س — وافق ليبدأ الكابتن الشراء.', isRead: true, createdAt: ago(16), url: 'client-my-orders.html' },
    { _id: 'n4', type: 'payment_confirmed', title: 'تم تأكيد الدفع', message: 'مطعم الساحة أكّد استلام قيمة طلبك وبدأ التجهيز.', isRead: true, createdAt: ago(60 * 22), url: 'client-my-orders.html' },
    { _id: 'n5', type: 'order_delivered', title: 'تم توصيل طلبك', message: 'وصل طلبك من صيدلية الرياض. قيّم تجربتك مع الكابتن.', isRead: true, createdAt: ago(60 * 26), url: 'client-my-orders.html' },
    { _id: 'n6', type: 'order_cancelled', title: 'أُلغي الطلب', message: 'أُلغي طلب التوصيل بناءً على طلبك.', isRead: true, createdAt: ago(60 * 24 * 4) },
    { _id: 'n7', type: 'system', title: 'مرحباً بك في وجيز', message: 'اطلب توصيلاً أو تسوّق من المحلات القريبة منك.', isRead: true, createdAt: ago(60 * 24 * 9) }
];

// ── الدعم ──
const TICKETS = [
    { _id: '66aa00000000000000c0ff01', subject: 'الطلب وصل ناقص عصير', category: 'missing_item', status: 'in_progress', description: 'طلبت من مطعم الساحة عصيرين ووصلني واحد بس.', createdAt: ago(60 * 20),
        replies: [{ senderRole: 'admin', message: 'نعتذر ليك يا أحمد. تواصلنا مع المطعم وحيتم تعويضك بعصير في طلبك الجاي.', createdAt: ago(60 * 18) }] },
    { _id: '66aa00000000000000c0ff02', subject: 'استفسار عن الدفع ببنكك', category: 'payment', status: 'resolved', description: 'حولت المبلغ ونسيت أرفع الإشعار، أعمل شنو؟', createdAt: ago(60 * 24 * 6),
        replies: [{ senderRole: 'admin', message: 'ارفع صورة الإشعار من صفحة طلباتي تحت الطلب، والمتجر بيأكّد طوالي.', createdAt: ago(60 * 24 * 6 - 30) }] }
];

const SHOTS = {
    // ── البداية ──────────────────────────────────────────────────────────
    cityPicker: {
        url: 'index.html', local: { selected_city: null, home_city: null }, keepOverlays: true, wait: 2500,
        mocks: [...BASE, PRICE, ADDR, BANNERS],
        marks: { khartoum: '.city-card[data-city="Khartoum"]', portsudan: '.city-card[data-city="PortSudan"]', atbara: '.city-card[data-city="Atbara"]' }
    },
    cityPicked: {
        url: 'index.html', local: { selected_city: null, home_city: null }, keepOverlays: true, wait: 2500,
        mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: () => { const c = document.querySelector('.city-card[data-city="Khartoum"]'); if (c) c.click(); return !!c; },
        marks: { khartoum: '.city-card[data-city="Khartoum"]', confirm: '.city-confirm-btn' }
    },
    register: {
        url: 'client-register.html', user: { _id: null }, local: { token: null, user: null }, wait: 1800, fullPage: true,
        mocks: [],
        before: () => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
            set('name', 'أحمد محمد'); set('phone', '0912345678'); set('email', 'ahmed@example.com'); set('password', 'wajeez2026'); set('registerCity', 'Khartoum');
            if (document.activeElement) document.activeElement.blur(); return true;
        },
        marks: { name: '#name', phone: '#phone', email: '#email', password: '#password', city: '#registerCity', submit: 'button[onclick="registerStep()"]' }
    },
    login: {
        url: 'client-login.html', local: { token: null, user: null }, wait: 1800,
        mocks: [],
        before: () => { const e = document.getElementById('email'); if (e) e.value = '0912345678'; const p = document.getElementById('password'); if (p) p.value = 'wajeez2026'; return true; },
        marks: { id: '#email', password: '#password', submit: 'button[onclick="login()"]', forgot: 'a[data-bs-target="#forgotPasswordModal"], [onclick*="orgot"]' }
    },

    // ── الرئيسية ─────────────────────────────────────────────────────────
    home: {
        url: 'index.html', wait: 2500, mocks: [...BASE, PRICE, ADDR, BANNERS],
        marks: { menu: '[data-bs-target="#sideMenu"]', greeting: '#greeting', banners: '#home-banners-section', saved: '#savedAddressBar', pickupBtn: '#pickup-block .map-select-btn',
                 navHome: '#nav-home-tab', navShop: '#nav-order-tab', navOrders: 'a[href="client-my-orders.html"].nav-item-link', navNotif: 'a[href="notifications.html"].nav-item-link' }
    },
    menu: {
        // userName: القائمة الجانبية تقرأ الاسم منه — بدونه تعرض «زائر» و«تسجيل الدخول»
        url: 'index.html', wait: 2500, local: { userName: 'أحمد محمد' }, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: () => { const el = document.getElementById('sideMenu'); if (window.bootstrap && el) { bootstrap.Offcanvas.getOrCreateInstance(el).show(); } return !!el; },
        after: 900
    },

    // ── طلب توصيل ────────────────────────────────────────────────────────
    orderForm: {
        url: 'index.html', wait: 2500, fullPage: true, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: () => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
            set('pickup-addr', 'الخرطوم 2، شارع المك نمر'); set('pickup-name', 'أحمد محمد'); set('pickup-phone', '0912345678');
            set('dropoff-addr', 'الرياض، شارع المشتل'); set('dropoff-name', 'سارة عبدالله'); set('dropoff-phone', '0923456789');
            set('pickup-lat', '15.596'); set('pickup-lng', '32.534'); set('dropoff-lat', '15.581'); set('dropoff-lng', '32.570');
            set('details', 'ظرف مستندات مهم — سلّمو لي سارة يد بيد'); set('price', '3500');
            if (document.activeElement) document.activeElement.blur(); return true;
        },
        marks: { saved: '#savedAddressBar', savedChip: '#savedAddressChips > *', pickupBtn: '#pickup-block .map-select-btn', pickupAddr: '#pickup-addr', pickupName: '#pickup-name', pickupPhone: '#pickup-phone',
                 dropoffBtn: '#dropoff-block .map-select-btn, [onclick*="openMapModal(\'dropoff\')"]', dropoffAddr: '#dropoff-addr', dropoffName: '#dropoff-name', dropoffPhone: '#dropoff-phone',
                 saveAddr: '[onclick*="saveCurrent"], [onclick*="SaveAddress"], [onclick*="saveDropoff"]',
                 multi: '#multi-stop-actions', addDrop: '#multi-stop-actions button:first-child', addPick: '#multi-stop-actions button:last-child',
                 details: '#details', photo: '#parcel-image', price: '#price', minus: '#price-minus', plus: '#price-plus', cityLine: '#order-city-line', submit: '#submit-btn' }
    },
    multiStop: {
        url: 'index.html', wait: 2500, fullPage: true, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: () => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
            set('pickup-addr', 'مطعم الساحة، شارع عبيد ختم'); set('pickup-name', 'مطعم الساحة'); set('pickup-phone', '0912000111');
            set('dropoff-addr', 'الرياض، شارع المشتل'); set('dropoff-name', 'سارة عبدالله'); set('dropoff-phone', '0923456789');
            if (typeof addStop === 'function') { addStop('dropoff'); if (window.closeMapUI) closeMapUI(); addStop('dropoff'); if (window.closeMapUI) closeMapUI(); }
            ['stop-1', 'stop-2'].forEach((id, k) => { set(id + '-lat', k ? '15.574' : '15.560'); set(id + '-lng', k ? '32.548' : '32.552'); });
            const extra = document.querySelectorAll('#extraStopsList input');
            const vals = ['الطائف، مربع 3', 'أم أحمد', '0911223344', 'المعمورة، شارع 41', 'عمر الطيب', '0915556677'];
            let i = 0; extra.forEach(inp => { if (inp.type !== 'hidden' && !inp.readOnly && i < vals.length) { inp.value = vals[i++]; } else if (inp.readOnly && i < vals.length) { inp.value = vals[i++]; } });
            set('details', 'تلاتة وجبات — كل وجبة لي زول'); set('price', '6500');
            if (document.activeElement) document.activeElement.blur(); return document.querySelectorAll('#extraStopsList > *').length;
        },
        marks: { extra: '#extraStopsList', stop1: '#extraStopsList > :nth-child(1)', stop2: '#extraStopsList > :nth-child(2)', multi: '#multi-stop-actions', hint: '#multi-stop-hint', price: '#price' }
    },
    mapPicker: {
        url: 'index.html', wait: 2500, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: () => { if (typeof openMapModal === 'function') openMapModal('pickup'); return true; },
        after: 3500,
        marks: { modeLabel: '#map-mode-label', cityChip: '#map-city-btn', search: '#map-search-input', locate: '#locate-me-btn', layer: '#map-layer-btn', theme: '#map-theme-btn',
                 sheet: '#wj-map-sheet', preview: '#map-address-preview', linkHost: '#mapLinkHost, [id*="mapLink"], details', confirm: '#map-confirm-btn' }
    },
    citySheet: {
        url: 'index.html', wait: 2500, keepOverlays: true, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: () => { if (typeof openMapModal === 'function') openMapModal('pickup'); setTimeout(() => CityService.showCitySheet(), 1200); return true; },
        after: 3200,
        marks: { khartoum: '.wj-city-opt[data-city="Khartoum"]', portsudan: '.wj-city-opt[data-city="PortSudan"]', atbara: '.wj-city-opt[data-city="Atbara"]' }
    },
    cityAway: {
        url: 'index.html', wait: 2500, fullPage: true, local: { selected_city: 'Atbara', home_city: 'Khartoum' }, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: () => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
            set('pickup-addr', 'عطبرة، السوق الكبير'); set('pickup-name', 'أحمد محمد'); set('pickup-phone', '0912345678');
            set('dropoff-addr', 'عطبرة، حي الداخلة'); set('dropoff-name', 'خالد عثمان'); set('dropoff-phone', '0918877665');
            set('details', 'هدية لي خالد — برّاد شاي جديد'); set('price', '3000');
            if (document.activeElement) document.activeElement.blur(); return true;
        },
        marks: { cityLine: '#order-city-line', submit: '#submit-btn', price: '#price' }
    },
    // ── التسوّق ──────────────────────────────────────────────────────────
    shopBrowse: {
        url: 'client-order.html', wait: 3000, fullPage: true, local: LASTFIX, mocks: SHOP_MOCKS,
        before: () => { document.querySelectorAll('.place-card').forEach(c => { c.style.opacity = 1; c.style.animation = 'none'; }); return document.querySelectorAll('.place-card').length; },
        marks: { search: '#globalSearchInput', errandPromo: '#errandPromo', categories: '#categories-grid', catFirst: '#categories-grid .cat-chip',
                 favorites: '#favorites-section', favCard: '#favorites-grid .place-card', favHeart: '#favorites-grid .place-fav-btn',
                 nearby: '#featured-section', nearbyCard: '#featured-grid .place-card', shopBtn: '#featured-grid .place-card-cta', closedBadge: '#featured-grid .place-card-status.closed' }
    },
    storeSheet: {
        url: 'client-order.html', wait: 3000, local: LASTFIX, mocks: SHOP_MOCKS,
        before: call((id) => { openPlaceDetails(id); return !!document.getElementById('placeDetailsModal'); }, PID.sa7a), after: 1200,
        marks: { sheet: '#placeDetailsModal .modal-content', name: '#placeModalName', status: '#placeModalStatus', distance: '#placeModalDistance',
                 chat: '#placeModalChatBtn', map: '#placeModalMap', browse: '#btnBrowseProducts', menu: '#placeModalMenuBtn' }
    },
    shopDetail: {
        url: 'shop-detail.html?placeId=' + PID.sa7a, wait: 2500, fullPage: true, mocks: SHOP_DETAIL_MOCKS,
        marks: { back: '.shop-hero a[href^="javascript"], a[href="javascript:history.back()"]', openBadge: '#shopBadge', share: '#shopShareBtn', fav: '#shopFavBtn', name: '#shopName',
                 rating: '#shopRatingBar', reviews: '#reviewsHint', search: '#storeProductSearch', tabs: '#catTabs', tabMeals: '#catTabs .cat-tab[data-cat="وجبات"]',
                 saleCard: '#pc-p01', saleBadge: '#pc-p01 .sale-badge', oldPrice: '#pc-p01 .price-was', stock: '#pc-p03 .product-card-body', outOfStock: '#pc-p04 .add-to-cart-btn',
                 addBtn: '#pc-p02 .add-to-cart-btn', details: '#pc-p01 .product-name' }
    },
    shopReviews: {
        url: 'shop-detail.html?placeId=' + PID.sa7a, wait: 2500, mocks: [[/reviews/, { ratingAvg: 4.8, ratingCount: 214, reviews: [
            { _id: 'r1', score: 5, comment: 'الشاورما ممتازة ووصلت سخنة. التوصيل سريع.', client: { name: 'سارة عبدالله' }, createdAt: ago(60 * 24 * 2) },
            { _id: 'r2', score: 5, comment: 'أحسن عصير مانجو في الرياض', client: { name: 'محمد عبدالله' }, createdAt: ago(60 * 24 * 5) },
            { _id: 'r3', score: 4, comment: 'الأكل كويس، بس البطاطس كانت باردة شوية.', client: { name: 'عمر الطيب' }, createdAt: ago(60 * 24 * 9) }] }], ...SHOP_DETAIL_MOCKS],
        before: async () => { await openReviews(); return true; }, after: 900,
        marks: { sheet: '#reviewsSheet > div' }
    },
    productDrawer: {
        url: 'shop-detail.html?placeId=' + PID.sa7a, wait: 2500, mocks: SHOP_DETAIL_MOCKS,
        before: () => { openProductDetails('p01'); return document.getElementById('productDrawer').classList.contains('open'); }, after: 900,
        marks: { drawer: '#productDrawer', price: '#productDetailBody .pd-price', saleBadge: '#productDetailBody .pd-sale-badge', desc: '#productDetailBody .pd-desc', share: '#productDetailBody .btn', add: '#productDetailFooter .add-to-cart-btn' }
    },
    cartBar: {
        url: 'shop-detail.html?placeId=' + PID.sa7a, wait: 2500, mocks: SHOP_DETAIL_MOCKS,
        before: () => { const n = (() => { addToCart('p01'); changeQty('p01', 1); addToCart('p07'); addToCart('p05'); return Object.keys(cart).length; })();
            setTimeout(() => { document.querySelectorAll('.swal2-container').forEach(e => e.remove()); document.body.classList.remove('swal2-shown', 'swal2-height-auto'); }, 300); return n; }, after: 900,
        marks: { qty: '#pc-p01 .qty-control', plus: '#pc-p01 .qty-btn:last-child', minus: '#pc-p01 .qty-btn:first-child', fab: '#cartFab', fabCount: '#cartFab .cart-count-badge', fabTotal: '#cartFabTotal' }
    },
    cart: {
        url: 'shop-detail.html?placeId=' + PID.sa7a, wait: 2500, mocks: SHOP_DETAIL_MOCKS,
        before: () => { addToCart('p01'); changeQty('p01', 1); addToCart('p07'); addToCart('p05');
            setTimeout(() => { document.querySelectorAll('.swal2-container').forEach(e => e.remove()); document.body.classList.remove('swal2-shown', 'swal2-height-auto'); openCart(); }, 300); return Object.keys(cart).length; }, after: 1200,
        marks: { drawer: '#cartDrawer', items: '#cartBody', firstItem: '#cartBody .cart-item', qty: '#cartBody .cart-item .qty-control', total: '#cartTotal', proceed: '#cartDrawer .btn-success', close: '#cartDrawer .btn-outline-secondary' }
    },
    checkout: {
        // نافذة التأكيد طويلة وقابلة للتمرير — نافذة عرضٍ أطول (h) تُظهرها كاملة
        url: 'shop-detail.html?placeId=' + PID.sa7a, wait: 2500, h: 1640, mocks: SHOP_DETAIL_MOCKS, user: { phone: '0912345678' },
        before: async () => {
            addToCart('p01'); changeQty('p01', 1); addToCart('p07'); addToCart('p05');
            await new Promise(r => setTimeout(r, 300));
            document.querySelectorAll('.swal2-container').forEach(e => e.remove()); document.body.classList.remove('swal2-shown', 'swal2-height-auto');
            proceedToOrder();
            await new Promise(r => setTimeout(r, 700));
            document.getElementById('deliveryLat').value = 15.5812; document.getElementById('deliveryLng').value = 32.5698;
            document.getElementById('deliveryAddress').value = 'الرياض، شارع المشتل — جنب الجامع';
            updateShopDeliveryFee(15.5812, 32.5698);
            document.getElementById('orderNotes').value = 'الشاورما بدون ثوم لو سمحت';
            document.getElementById('promoCodeInput').value = 'WAJEEZ500';
            await applyPromo();
            if (document.activeElement) document.activeElement.blur();
            return document.getElementById('deliveryFee').value;
        }, after: 800,
        marks: { modal: '#orderModal .modal-content', summary: '#orderSummary', mapBtn: '#orderModal .map-pick-btn', address: '#deliveryAddress', linkBox: '#shopLinkBox summary',
                 fee: '#deliveryFee', feeMinus: '#shop-price-minus', feePlus: '#shop-price-plus', feeHint: '#deliveryFeeHint', name: '#receiverName', phone: '#receiverPhone',
                 notes: '#orderNotes', promo: '#promoCodeInput', promoApply: '#applyPromoBtn', promoResult: '#promoResult', totals: '#orderSummaryBox', discount: '#sumDiscountRow',
                 payNote: '#orderModal .pay-note', submit: '#orderModal .modal-footer .btn-success', edit: '#orderModal .modal-footer .btn-outline-secondary' }
    },

    // ── اشترِ لي ─────────────────────────────────────────────────────────
    errandPicker: {
        url: 'client-order.html', wait: 2500, local: LASTFIX,
        mocks: [[/errand-categories/, [{ key: 'grocery', label: 'بقالة', icon: 'bi-basket2-fill' }, { key: 'restaurant', label: 'مطاعم', icon: 'bi-cup-hot-fill' }, { key: 'pharmacy', label: 'صيدلية', icon: 'bi-capsule' }, { key: 'bakery', label: 'مخبز', icon: 'bi-basket3-fill' }, { key: 'vegetables', label: 'خضار وفواكه', icon: 'bi-flower1' }]],
            [/errand-search/, { ours: [{ source: 'wajeez', placeId: PID.nile, name: 'سوبر ماركت النيل', address: 'الرياض، شارع المشتل', lat: 15.584, lng: 32.566, categoryKey: 'grocery' }],
                external: [{ source: 'google', externalId: 'g1', name: 'بقالة الأمين', address: 'الرياض، مربع 9', lat: 15.579, lng: 32.572, categoryKey: 'grocery', category: 'بقالة' },
                           { source: 'google', externalId: 'g2', name: 'بقالة الحاج علي', address: 'الطائف، شارع 15', lat: 15.586, lng: 32.584, categoryKey: 'grocery', category: 'بقالة' },
                           { source: 'google', externalId: 'g3', name: 'ميني ماركت الصفا', address: 'المعمورة، شارع 41', lat: 15.566, lng: 32.569, categoryKey: 'grocery', category: 'بقالة' }] }],
            [/errand-featured/, { curated: [], popular: [] }], ...SHOP_MOCKS],
        before: async () => { window.userLocation = { lat: 15.581, lng: 32.570 }; await openErrandPicker('بقالة'); await new Promise(r => setTimeout(r, 900)); return document.querySelectorAll('.errand-place').length; }, after: 900,
        marks: { sheet: '#errandSheet .errand-sheet', search: '#errandSearch', cats: '#errandCats', groupOurs: '.errand-group', ourCard: '.errand-place:not(.custom)', mapBtn: '.errand-map-btn', other: '.errand-place.custom' }
    },
    errandForm: {
        url: 'index.html?mode=errand', wait: 2500, fullPage: true, mocks: [...BASE, PRICE, ADDR, BANNERS],
        session: { errandContext: { source: 'wajeez', shopId: PID.nile, shopName: 'سوبر ماركت النيل', address: 'الرياض، شارع المشتل', lat: 15.584, lng: 32.566, category: 'بقالة', categoryKey: 'grocery' } },
        before: () => {
            const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
            set('errand-items', 'رغيف ×10\nلبن 2 لتر\nسكر 1 كيلو\nشاي');
            set('errand-budget', '12000');
            const chk = document.getElementById('errand-auto-approve'); if (chk) chk.checked = true;
            set('dropoff-addr', 'الرياض، شارع المشتل — جنب الجامع'); set('dropoff-name', 'أحمد محمد'); set('dropoff-phone', '0912345678');
            set('dropoff-lat', '15.5812'); set('dropoff-lng', '32.5698');
            set('price', '2500');
            const ta = document.getElementById('errand-items'); if (ta) { ta.rows = 5; ta.style.minHeight = '130px'; }
            if (document.activeElement) document.activeElement.blur();
            return !!window._errandMode;
        },
        marks: { shopBanner: '#errand-shop-banner', pickupSummary: '#errand-pickup-summary', items: '#errand-items', budget: '#errand-budget', autoApprove: '#errand-autoapprove-wrap',
                 dropoffBtn: "button[onclick*=\"openMapModal('dropoff')\"]", dropoffAddr: '#dropoff-addr', dropoffName: '#dropoff-name', dropoffPhone: '#dropoff-phone', price: '#price', submit: '#submit-btn' }
    },

    // ── طلباتي: البحث والعروض ────────────────────────────────────────────
    ordersSearching: {
        url: 'client-my-orders.html', wait: 2500, mocks: ORDERS_MOCKS([baseDelivery({ searchDeadlineAt: ahead(8.4) })]),
        marks: { tabs: '#ordersFilterBar', card: '.o-card', status: '.o-card .o-status', radar: '.searching-panel .radar', title: '.searching-title', countdown: '.search-countdown', cancel: '.o-actions .btn-outline-danger' }
    },
    ordersOffers: {
        url: 'client-my-orders.html', wait: 2500, fullPage: true, mocks: ORDERS_MOCKS([baseDelivery({ searchDeadlineAt: ahead(8.4), negotiations: OFFERS })]),
        marks: { header: '.offers-header', offer1: '.offer-card', avatar: '.offer-card .offer-avatar', rating: '.offer-card .offer-meta', price: '.offer-card .offer-price-box', expires: '.offer-card .offer-countdown',
                 accept: '.offer-card .btn-success', reject: '.offer-card .btn-outline-danger', offer2: '.offer-card:nth-of-type(3)', cancel: '.o-actions > .btn-outline-danger' }
    },
    ordersTimeout: {
        url: 'client-my-orders.html', wait: 2500, mocks: ORDERS_MOCKS([baseDelivery({ createdAt: ago(16), searchDeadlineAt: ago(1) })]),
        marks: { panel: '.searching-panel.decision', title: '.searching-panel .searching-title', keep: '.searching-panel .btn-success', cancel: '.searching-panel .decision-cancel' }
    },
    cancelModal: {
        url: 'client-my-orders.html', wait: 2500, keepOverlays: true, mocks: ORDERS_MOCKS([baseDelivery({ searchDeadlineAt: ahead(8.4) })]),
        before: async () => { cancelOrder('650000000000000000b1a001'); await new Promise(r => setTimeout(r, 600));
            const r = document.querySelector('input[name="cancelReason"][value="price_high"]'); if (r) r.checked = true;
            const n = document.getElementById('crNote'); if (n) n.value = 'لقيت زول ماشي نفس الاتجاه';
            if (document.activeElement) document.activeElement.blur(); return !!r; }, after: 600,
        marks: { popup: '.swal2-popup', reasons: '.cr-list', picked: '.cr-opt:has(input:checked)', note: '#crNote', confirm: '.swal2-confirm', back: '.swal2-cancel' }
    },
    acceptedPopup: {
        url: 'client-my-orders.html', wait: 2500, keepOverlays: true, mocks: ORDERS_MOCKS([baseDelivery({ searchDeadlineAt: ahead(8.4), negotiations: OFFERS })]),
        before: () => { (window.__h.order_status_updated || []).forEach(f => f({ orderId: '650000000000000000b1a001', status: 'accepted' })); return !!document.querySelector('.swal2-popup'); }, after: 900,
        marks: { popup: '.swal2-popup', title: '.swal2-title', track: '.swal2-confirm' }
    },
    errandQuote: {
        // نافذة الموافقة في صفحة التتبّع — فيها علامة «أعلى من ميزانيتك»
        url: 'tracking.html?orderId=650000000000000000b1a006', wait: 3000, keepOverlays: true,
        mocks: TRACK_MOCKS(trackOrder({ _id: ORDER_IDS.errand, status: 'accepted', orderType: 'errand', price: 2500, shopName: 'سوبر ماركت النيل', timeline: TL('accepted'),
            errand: { goodsQuote: 13500, budget: 12000, quoteStatus: 'quoted' }, pickup: { address: 'سوبر ماركت النيل، الرياض', lat: 15.584, lng: 32.566 } })),
        before: call(trackBefore, PATH, pathAt(0.1), false), after: 1200,
        marks: { popup: '.swal2-popup', title: '.swal2-title', amount: '.swal2-html-container', accept: '.swal2-confirm', reject: '.swal2-cancel' }
    },
    errandQuoteCard: {
        url: 'client-my-orders.html', wait: 2500, mocks: ORDERS_MOCKS([baseDelivery({ _id: ORDER_IDS.errand, status: 'accepted', orderType: 'errand', price: 2500, shopName: 'سوبر ماركت النيل',
            captain: CAPTAIN, pickup: { address: 'سوبر ماركت النيل، الرياض' }, details: 'رغيف ×10 • لبن 2 لتر • سكر 1 كيلو • شاي',
            errand: { goodsQuote: 10500, budget: 12000, quoteStatus: 'quoted' } })]),
        marks: { card: '.o-card', quote: '.o-actions > div:first-child', accept: '.o-actions .d-flex .btn:first-child', reject: '.o-actions .btn-outline-danger' }
    },

    // ── التتبّع ──────────────────────────────────────────────────────────
    tracking: {
        url: 'tracking.html?orderId=' + TRACK_ID, wait: 3000, mocks: TRACK_MOCKS(trackOrder({})),
        before: call(trackBefore, PATH, pathAt(0.55), true), after: 1500,
        marks: { back: '#backBtn', map: '#map', status: '#order-status', steps: '#status-steps', captain: '#captain-info', captainName: '#captain-name', rating: '#captain-rating',
                 call: '#captain-call-btn', chat: '#captain-chat-btn', route: '#routeRow', eta: '#eta-container', etaTime: '#eta-text', distance: '#eta-distance', price: '#order-price', tip: '#tipBox' }
    },
    tipSheet: {
        url: 'tracking.html?orderId=' + TRACK_ID, wait: 3000, mocks: TRACK_MOCKS(trackOrder({ tip: { amount: 1000 } })),
        before: call(trackBefore, PATH, pathAt(0.55), true) + ".then(() => { const t = document.getElementById('tipBox'); if (t) t.scrollIntoView({ block: 'center' }); return !!t; })", after: 1200,
        marks: { tipBox: '#tipBox', current: '#tipCurrent', chips: '#tipChips', chip500: '#tipChips .tip-chip:nth-child(1)', chip1000: '#tipChips .tip-chip:nth-child(2)', chip2000: '#tipChips .tip-chip:nth-child(3)',
                 other: '#tipChips .tip-chip:nth-child(4)', clear: '#tipChips .tip-chip.clear', price: '#order-price' }
    },
    tipCustom: {
        url: 'tracking.html?orderId=' + TRACK_ID, wait: 3000, keepOverlays: true, mocks: TRACK_MOCKS(trackOrder({})),
        before: call(trackBefore, PATH, pathAt(0.55), true) + `.then(async () => { promptCustomTip(); await new Promise(r => setTimeout(r, 500)); const i = document.querySelector('.swal2-input'); document.documentElement.classList.remove('swal2-height-auto'); document.body.classList.remove('swal2-height-auto'); if (i) { i.value = '1500'; i.blur(); } return !!i; })`, after: 500,
        marks: { popup: '.swal2-popup', input: '.swal2-input', confirm: '.swal2-confirm' }
    },

    // ── المحادثة ─────────────────────────────────────────────────────────
    chat: {
        url: 'chat.html?orderId=' + TRACK_ID + '&receiverId=cap1', wait: 2500, mocks: CHAT_MOCKS,
        before: chatBefore, after: 900,
        marks: { back: '.chat-header button, .back-btn', name: '#receiverName', track: '#track-order-btn', safety: '#safetyBtn', image: '.msg-image', attach: '#attachBtn', input: '#messageInput', send: '#sendBtn' }
    },
    chatMenu: {
        url: 'chat.html?orderId=' + TRACK_ID + '&receiverId=cap1', wait: 2500, keepOverlays: true, mocks: CHAT_MOCKS,
        before: async () => { (window.__h.connect || []).forEach(f => { try { f(); } catch (e) {} }); await new Promise(r => setTimeout(r, 500)); openSafetyMenu(); return true; }, after: 900,
        marks: { popup: '.swal2-popup', report: '.swal2-confirm', block: '.swal2-deny', cancel: '.swal2-cancel' }
    },

    // ── الدفع للمتجر ─────────────────────────────────────────────────────
    payShop: {
        url: 'client-my-orders.html', wait: 2500, fullPage: true, mocks: ORDERS_MOCKS([shopOrder({})]),
        before: () => { const el = document.querySelector('.pm-pay-slot'); if (!el) return false; const c = el.querySelectorAll('.pm-choice'); if (c[0]) c[0].click(); return c.length; }, after: 600,
        marks: { card: '.o-card', status: '.o-card .o-status', payBox: '.o-actions > .border-warning', amount: '.o-actions .text-danger.fs-5', methods: '.pm-pay-slot', bankak: '.pm-choice', copy: '.pm-pay-slot button[onclick*="opy"], .pm-pay-slot .pm-copy, .pm-pay-slot button',
                 upload: '.upload-receipt-btn', merchantChat: '.o-actions button[onclick*="merchant"]', waiting: '.searching-panel--merchant', cost: '.o-cost', cancel: '.o-actions > .btn-outline-danger' }
    },
    payReview: {
        url: 'client-my-orders.html', wait: 2500, fullPage: true,
        mocks: ORDERS_MOCKS([shopOrder({ paymentStatus: 'receipt_sent', paidVia: 'bankak' }),
            shopOrder({ _id: ORDER_IDS.pay2, shopOrderId: ORDER_IDS.pay2, status: 'accepted', realShopStatus: 'shop_preparing', paymentStatus: 'confirmed', placeId: PID.riyadh, pickup: { address: 'صيدلية الرياض' },
                price: 9800, itemsTotal: 7300, deliveryFee: 2500, details: '1x بانادول، 2x فيتامين سي', createdAt: ago(40) })]),
        marks: { reviewCard: '#order-650000000000000000b1a007', reviewing: '#order-650000000000000000b1a007 .border-info', confirmedCard: '#order-650000000000000000b1a008',
                 confirmed: '#order-650000000000000000b1a008 .border-success', remaining: '#order-650000000000000000b1a008 .o-cost' }
    },

    // ── الاستلام والتقييم ────────────────────────────────────────────────
    confirmReceipt: {
        url: 'client-my-orders.html', wait: 2500, keepOverlays: true, mocks: ORDERS_MOCKS([baseDelivery({ _id: ORDER_IDS.deliv, status: 'delivered', captain: CAPTAIN, timeline: TL('delivered') })]),
        before: () => { (window.__h.delivery_attempted || []).forEach(f => f({ orderId: '650000000000000000b1a002' })); return !!document.querySelector('.swal2-popup'); }, after: 900,
        marks: { popup: '.swal2-popup', yes: '.swal2-confirm', no: '.swal2-cancel' }
    },
    rating: {
        url: 'client-my-orders.html', wait: 2500, keepOverlays: true, mocks: ORDERS_MOCKS([baseDelivery({ _id: ORDER_IDS.deliv, status: 'delivered', captain: CAPTAIN, timeline: TL('delivered') })]),
        before: async () => { // showRatingModal دالةٌ غير متزامنة داخل كتلة — ليست عامّة؛ نصلها كما يصلها العميل: «نعم، استلمت»
            confirmDelivery('650000000000000000b1a002', null); await new Promise(r => setTimeout(r, 700)); Swal.clickConfirm(); await new Promise(r => setTimeout(r, 1200)); selectStar(5);
            document.querySelectorAll('#ratingTags .rate-tag').forEach((b, i) => { if (i < 2) b.click(); });
            const c = document.getElementById('captainComment'); if (c) c.value = 'كابتن محترم ووصل بدري، شكراً';
            if (document.activeElement) document.activeElement.blur(); return document.querySelectorAll('#ratingTags .rate-tag').length; }, after: 600,
        marks: { popup: '.swal2-popup', stars: '#starRating', star5: '#starRating .rate-star[data-val="5"]', label: '#starLabel', tags: '#ratingTags', comment: '#captainComment', send: '.swal2-confirm', skip: '.swal2-cancel' }
    },
    storeRating: {
        url: 'client-my-orders.html', wait: 2500, keepOverlays: true, mocks: ORDERS_MOCKS([shopOrder({ _id: ORDER_IDS.shopDone, shopOrderId: ORDER_IDS.shopDone, status: 'delivered', realShopStatus: 'delivered', paymentStatus: 'confirmed', captain: CAPTAIN })]),
        before: async () => { showPlaceRatingModal('650000000000000000b1a003', '64f1a2b3c4d5e6f7a8b9c0d1'); await new Promise(r => setTimeout(r, 700)); selectPS(5);
            const c = document.getElementById('placeComment'); if (c) c.value = 'الأكل ممتاز والتغليف نضيف'; if (document.activeElement) document.activeElement.blur(); return true; }, after: 600,
        marks: { popup: '.swal2-popup', stars: '#placeStars', comment: '#placeComment', send: '.swal2-confirm', skip: '.swal2-cancel' }
    },
    ordersHistory: {
        url: 'client-my-orders.html', wait: 2500, fullPage: true,
        mocks: ORDERS_MOCKS([
            shopOrder({ _id: ORDER_IDS.shopDone, shopOrderId: ORDER_IDS.shopDone, status: 'delivered', realShopStatus: 'delivered', paymentStatus: 'confirmed', captain: CAPTAIN, createdAt: ago(60 * 22), timeline: TL('delivered', 60 * 22) }),
            baseDelivery({ _id: ORDER_IDS.deliv, status: 'delivered', captain: CAPTAIN, createdAt: ago(60 * 26), timeline: TL('delivered', 60 * 26), dropoff: { address: 'الصافية، شارع المعونة' }, pickup: { address: 'صيدلية الرياض' }, details: 'دواء ضغط — علبتين', price: 4000 }),
            baseDelivery({ _id: ORDER_IDS.cancel, status: 'cancelled', createdAt: ago(60 * 24 * 4), timeline: { current: 'cancelled', steps: [{ key: 'placed', label: 'تم الطلب', done: true, at: ago(60 * 24 * 4) }, { key: 'cancelled', label: 'أُلغي', done: true, cancelled: true, at: ago(60 * 24 * 4 - 6) }] } })
        ]),
        before: () => { const b = document.getElementById('ordersFilterBar'); if (b) b.style.setProperty('position', 'static', 'important');
            applyOrderFilter('all'); const t = document.querySelector('.of-tab.active'); if (t) { t.scrollIntoView({ inline: 'center', block: 'nearest' }); window.scrollTo(0, 0); }
            return document.querySelectorAll('.o-card').length; },
        marks: { tabs: '#ordersFilterBar', tabActive: '#ordersFilterBar .of-tab:nth-child(1)', tabWaiting: '#ordersFilterBar .of-tab:nth-child(2)', tabDone: '#ordersFilterBar .of-tab:nth-child(3)',
                 tabCancelled: '#ordersFilterBar .of-tab:nth-child(4)', tabAll: '#ordersFilterBar .of-tab:nth-child(5)', shopCard: '#order-650000000000000000b1a003', breakdown: '#order-650000000000000000b1a003 .o-cost',
                 rate: '[data-rate-id]', timeline: '.o-timeline', reorder: 'button[onclick^="reorderDelivery"]', cancelledCard: '#order-650000000000000000b1a004' }
    },

    // ── الإشعارات والدعم والحساب ─────────────────────────────────────────
    notifications: {
        url: 'notifications.html', wait: 2500, fullPage: true,
        mocks: [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 2 }], [/api\/notifications\?/, { notifications: NOTIFS, currentPage: 1, totalPages: 1 }]],
        marks: { subtitle: '#headerSubtitle', chipAll: '#chipAll', chipUnread: '#chipUnread', markAll: '#markAllReadBtn', groupToday: '.wn-group-title', firstItem: '.wn-item', unreadItem: '.wn-item.is-unread' }
    },
    support: {
        url: 'client-complaint.html', wait: 2000, mocks: [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/complaints\/mine/, { complaints: TICKETS }]],
        before: () => { const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            set('fSubject', 'الطلب وصل ناقص عصير'); set('fCategory', 'wrong_item'); set('fOrderId', '650000000000000000b1a003'.slice(-6)); set('fDescription', 'طلبت من مطعم الساحة عصيرين مانجو ووصلني واحد بس.');
            if (document.activeElement) document.activeElement.blur(); return true; },
        marks: { tabNew: '#tabNewBtn', tabMine: '#tabMyBtn', subject: '#fSubject', type: '#fCategory', orderNo: '#fOrderId', details: '#fDescription', submit: '#submitBtn' }
    },
    supportTickets: {
        url: 'client-complaint.html', wait: 2000, mocks: [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/complaints\/mine/, { complaints: TICKETS }]],
        before: async () => { switchTab('my'); await new Promise(r => setTimeout(r, 600)); return document.querySelectorAll('.ticket-card').length; },
        marks: { tabMine: '#tabMyBtn', badge: '#ticketCountBadge', ticket: '.ticket-card', status: '.ticket-card .badge-status', replies: '.ticket-card .replies-badge' }
    },
    supportThread: {
        url: 'client-complaint.html', wait: 2000, mocks: [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/complaints\/mine/, { complaints: TICKETS }], [/complaints\/66aa/, TICKETS[0]]],
        before: async () => { switchTab('my'); await new Promise(r => setTimeout(r, 500)); await openThread('66aa00000000000000c0ff01', 'الطلب وصل ناقص عصير'); return true; }, after: 1000,
        marks: { modal: '#threadModal .modal-content', clientMsg: '#threadBody .msg-client', adminMsg: '#threadBody .msg-admin', reply: '#replyInput' }
    },
    deleteMenu: {
        url: 'index.html', wait: 2500, local: { userName: 'أحمد محمد' }, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: async () => { const el = document.getElementById('sideMenu'); bootstrap.Offcanvas.getOrCreateInstance(el).show(); await new Promise(r => setTimeout(r, 700));
            const b = document.getElementById('menu-delete-account-btn'); if (b) { b.scrollIntoView({ block: 'center' }); } return !!b; }, after: 700,
        marks: { deleteBtn: '#menu-delete-account-btn' }
    },
    deleteAccount: {
        url: 'index.html', wait: 2500, keepOverlays: true, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: () => { openDeleteAccount(); return true; }, after: 900,
        marks: { popup: '.swal2-popup', contact: '.swal2-confirm', wantDelete: '.swal2-cancel' }
    },
    deleteConfirm: {
        url: 'index.html', wait: 2500, keepOverlays: true, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: async () => { openDeleteAccount(); await new Promise(r => setTimeout(r, 700)); Swal.clickCancel(); await new Promise(r => setTimeout(r, 900)); return !!document.querySelector('.swal2-input'); }, after: 600,
        marks: { popup: '.swal2-popup', phone: '.swal2-input', del: '.swal2-confirm', cancel: '.swal2-cancel' }
    },

    // ── الخريطة بعنوانٍ واقعي، وحقل رابط خرائط جوجل ───────────────────────
    mapPickerFilled: {
        url: 'index.html', wait: 2500, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: async () => { openMapModal('pickup'); await new Promise(r => setTimeout(r, 3000));
            const p = document.getElementById('map-address-preview'); if (p) { p.textContent = 'أم درمان، شارع الأربعين — قرب استاد الهلال'; p.style.color = ''; } return !!p; }, after: 800,
        marks: { modeLabel: '#map-mode-label', cityChip: '#map-city-btn', search: '#map-search-input', locate: '#locate-me-btn', layer: '#map-layer-btn',
                 sheet: '#wj-map-sheet', preview: '#map-address-preview', linkToggle: '#mapLinkBox summary', confirm: '#map-confirm-btn' }
    },
    mapLink: {
        url: 'index.html', wait: 2500, mocks: [...BASE, PRICE, ADDR, BANNERS],
        before: async () => { openMapModal('pickup'); await new Promise(r => setTimeout(r, 3500));
            const box = document.getElementById('mapLinkBox'); if (box) box.open = true; await new Promise(r => setTimeout(r, 600));
            const i = document.querySelector('#mapLinkHost input'); if (i) { i.value = 'https://maps.app.goo.gl/7xQkR2wHn5'; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); }
            return !!i; }, after: 700,
        marks: { linkBox: '#mapLinkBox', host: '#mapLinkHost', input: '#mapLinkHost input', use: '#mapLinkHost button', confirm: '#map-confirm-btn' }
    },
};

(async () => {
    const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(SHOTS);
    for (const name of only) {
        const s = SHOTS[name];
        if (!s) { console.log('?', name); continue; }
        // زرّ الوضع الليلي العائم يعود بعد التحميل، ورسائل التنبيه العابرة (wj-toast)
        // تُطلقها أحداث المقبس المحاكاة — كلاهما ليس من الشاشة المشروحة
        // وفي اللقطات الطويلة تُخفي capture.js كل شريطٍ لاصق — وشرائط التبويب والتصفية
        // جزءٌ مما نشرحه، فتُثبَّت في مكانها (static) لتبقى في الصورة
        const KEEP = s.fullPage ? '#ordersFilterBar,#catTabs,#wnToolbar{position:static!important}' : '';
        const HIDE = `(() => { const st = document.createElement('style'); st.textContent = '.theme-toggle,.wj-toast-container{display:none!important}${KEEP}'; document.head.appendChild(st); })()`;
        const inner = s.before ? (typeof s.before === 'function' ? `(${s.before.toString()})()` : s.before) : 'true';
        const before = `(async () => { ${HIDE}; return await ${inner}; })()`;
        const r = await cap.shot({ dpr: 2.5, ...s, before, out: OUT + name + '.png' });
        const missing = r.marks ? Object.entries(r.marks).filter(([, v]) => !v).map(([k]) => k) : [];
        console.log(`${name}  info=${JSON.stringify(r.info)}  ${missing.length ? 'marks-missing=' + missing.join(',') : ''}  ${r.errs.slice(0, 2).join(' | ')}`);
    }
    await cap.close();
})();
