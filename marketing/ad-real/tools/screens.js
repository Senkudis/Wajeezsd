/**
 * إعلان وجيز العمودي — لقطات الشاشات الحقيقية (public_html بكودها نفسه، الخادم محاكى).
 * المقاس: إطار هاتف 390×844 بدقّة 3× (1170×2532) — ما يراه المستخدم على الهاتف.
 *
 *   node tools/screens.js [name,name,...]     (خادم public_html على 4175 — launch.json: static-public-4175)
 *
 * سياسة البيانات (docs/ad-ui-evidence.md):
 *  - الكابتن: بلا اسم ولا تقييم ← التطبيق يعرض بدائله الحقيقية «كابتن» / «كابتن جديد» / «الكابتن».
 *  - العناوين: أحياء وشوارع حقيقية في الخرطوم، بلا أسماء أشخاص ولا أرقام هواتف.
 *  - السعر: قيمة مثال يكتبها المستخدم بنفسه في حقل «سعرك»؛ العرض بالسعر نفسه (لا ادّعاء توفير).
 *  - المتجر: لا بيانات متجرٍ حقيقي بعد ← لقطات SHOP_* بياناتها توضيحية للتحقق من الوصول فقط، لا تدخل الإعلان.
 */
const cap = require('../../tutorials/tools/capture');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'screens');
fs.mkdirSync(OUT, { recursive: true });
const LOCAL = { selected_city: 'Khartoum', home_city: 'Khartoum' };
const ME = { _id: 'u1', id: 'u1', name: '', role: 'client', phone: '', city: 'Khartoum' };
const BASE = [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/favorites/, []], [/banners/, []], [/auth\/addresses/, { addresses: [] }]];
const PRICE = [/price-config/, { city: 'Khartoum', baseFare: 1500, costPerKm: 400, costPerMinute: 25, extraStopFee: 500, maxDiscountPercent: 10, maxPriceSurgePercent: 100, maxTipAmount: 20000 }];
const NOW = Date.now();
const ago = (m) => new Date(NOW - m * 60000).toISOString();
const ahead = (s) => new Date(NOW + s * 1000).toISOString();

const PATH = require('../../wajeez-ad-v2/tools/path.json');
const A = PATH[0], B = PATH[PATH.length - 1];
const PICK = 'شارع عبيد ختم، الخرطوم', DROP = 'الرياض، شارع المشتل';
const STOPS = [['الطائف', 15.5905, 32.5790], ['العمارات', 15.5760, 32.5480]];
const YOUR_PRICE = 3500;   // مثال: ما يكتبه المستخدم

// ── الطلب ──────────────────────────────────────────────────────────────
const set = `const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };`;
const rect = `const R = (e) => { if (typeof e === 'string') e = document.querySelector(e); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top + scrollY, b.width, b.height].map(Math.round); };`;
const fillForm = (price) => `(() => { ${set} ${rect}
  set('pickup-addr', ${JSON.stringify(PICK)}); set('pickup-lat', '${A.lat}'); set('pickup-lng', '${A.lng}');
  set('dropoff-addr', ${JSON.stringify(DROP)}); set('dropoff-lat', '${B.lat}'); set('dropoff-lng', '${B.lng}');
  ${price ? `set('price', '${price}');` : ''}
  if (document.activeElement) document.activeElement.blur();
  return { form: R('#pickup-addr'), drop: R('#dropoff-addr'), price: R('#price'), plus: R('#price-plus'), addStop: R('#multi-stop-actions'),
    submit: R([...document.querySelectorAll('button')].find(x => /اطلب الكابتن/.test(x.textContent))) };
})()`;
const scrollTo = (sel, off) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) window.scrollTo(0, e.getBoundingClientRect().top + scrollY - ${off}); return scrollY; })()`;
const multiStops = `(() => { ${set}
  window.openMapModal = () => {};             // نافذة الخريطة تُفتح عند الإضافة — نملأ الموقع مباشرة كما لو حُدّد
  ${JSON.stringify(STOPS)}.forEach(([addr, lat, lng]) => { addStop('dropoff'); const id = 'stop-' + document.querySelectorAll('#extraStopsList .extra-stop-card').length;
    const c = [...document.querySelectorAll('#extraStopsList .extra-stop-card')].pop().getAttribute('data-stopid');
    set(c + '-addr', addr); set(c + '-lat', lat); set(c + '-lng', lng); });
  return document.querySelectorAll('#extraStopsList .extra-stop-card').length; })()`;

// ── طلباتي: البحث ← العرض ← القبول ──────────────────────────────────────
const OID = '650000000000000000b1a001';
const OFFER = { captainId: 'cap1', captainVehicle: 'motorcycle', proposedPrice: YOUR_PRICE, status: 'pending', expiresAt: ahead(240) };
const order = (negs) => ({ _id: OID, status: 'pending', orderType: 'delivery', price: YOUR_PRICE, city: 'Khartoum', client: 'u1',
  pickup: { address: PICK, lat: A.lat, lng: A.lng }, dropoff: { address: DROP, lat: B.lat, lng: B.lng },
  createdAt: ago(1), searchDeadlineAt: ahead(500), negotiations: negs });
const ORDERS = (list) => [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/feedback\/pending/, { pending: null }],
  [/my-orders/, () => ({ orders: list, currentPage: 1, totalPages: 1, total: list.length })]];

// ── المتجر ─────────────────────────────────────────────────────────────
// بيانات المتجر الشريك من partner-shop/shop.json — تُستعمل فقط بعد موافقة صاحبه (consent.approved).
// بدونها: بيانات توضيحية للتحقق من الوصول، ولقطاتها SHOP_* لا تدخل الإعلان.
const PDIR = path.join(__dirname, '..', 'partner-shop');
const PS = JSON.parse(fs.readFileSync(path.join(PDIR, 'shop.json'), 'utf8'));
const PARTNER = !!(PS.consent && PS.consent.approved && PS.shop && PS.shop.name && PS.products.some(x => x.name));
const img = (f) => { if (!f) return null; const fp = path.join(PDIR, f); if (!fs.existsSync(fp)) throw new Error('صورة غير موجودة: ' + f);
  const ext = path.extname(f).slice(1).toLowerCase().replace('jpg', 'jpeg'); return `data:image/${ext};base64,` + fs.readFileSync(fp).toString('base64'); };
const PID = '64f1a2b3c4d5e6f7a8b9c0d1';
const CAT = PARTNER ? { _id: 'c1', name: PS.shop.category, icon: PS.shop.categoryIcon || 'bi-shop' } : { _id: 'c1', name: 'سوبر ماركت', icon: 'bi-cart4' };
const CATS = [CAT];
const SHOP_NAME = PARTNER ? PS.shop.name : 'متجر (توضيحي)';
const PLACE = { _id: PID, name: SHOP_NAME, is_open: true, isOpenOverride: true, ratingAvg: 0, ratingCount: 0, ownerId: 'm1',
  address: PARTNER ? PS.shop.address : 'الرياض', location: { lat: 15.584, lng: 32.566 }, category: CAT, city: 'Khartoum',
  image_url: PARTNER ? img(PS.shop.cover || PS.shop.logo) : undefined, logo: PARTNER ? img(PS.shop.logo) : undefined };
const PRODUCTS = PARTNER
  ? PS.products.filter(x => x.name).map((x, i) => ({ _id: 'p0' + (i + 1), name: x.name, category: x.section || '', price: Number(x.price) || 0, image: img(x.image), stock: 10 }))
  : [1, 2, 3, 4, 5, 6].map(i => ({ _id: 'p0' + i, name: 'منتج ' + i + ' (توضيحي)', category: 'قسم', price: 1000 * i, stock: 10 }));
const PICKS = (PARTNER ? PS.cartPicks : [0, 1]).map(i => PRODUCTS[i] && PRODUCTS[i]._id).filter(Boolean);
const SHOP_LIST = [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/banners/, []], [/places\/categories/, CATS],
  [/places\/favorites\/ids/, { ids: [] }], [/places\/favorites/, []], [/api\/places\?/, [PLACE]], PRICE];
const SHOP_DETAIL = [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/merchant\/shop\/[0-9a-f]+\/products/, { place: PLACE, products: PRODUCTS }],
  [/places\/favorites\/ids/, { ids: [] }], [/delivery-zone/, {}], PRICE];
const addItems = `(() => { ${JSON.stringify(PICKS)}.forEach(id => addToCart(id)); document.querySelectorAll('.swal2-container').forEach(e => e.remove()); document.body.classList.remove('swal2-shown','swal2-height-auto'); return Object.keys(cart).length; })()`;
// رقم الحساب لا يظهر أبداً في الإعلان
const PAY = [{ method: (PS.paymentMethod || {}).method || 'bankak', label: (PS.paymentMethod || {}).label || 'بنكك', accountNumber: '—', accountName: SHOP_NAME }];
const ITEMS = PICKS.reduce((t, id) => t + ((PRODUCTS.find(x => x._id === id) || {}).price || 0), 0);
const shopOrder = (st, ps) => ({ _id: 'so1', shopOrderId: 'so1', orderType: 'shop', status: 'pending', realShopStatus: st, paymentStatus: ps || 'pending',
  placeId: PID, price: PARTNER ? ITEMS : 0, itemsTotal: PARTNER ? ITEMS : 0, pickup: { address: SHOP_NAME }, dropoff: { address: DROP }, createdAt: ago(3),
  details: PARTNER ? PICKS.map(id => '1x ' + PRODUCTS.find(x => x._id === id).name).join('، ') : '', paymentMethods: PAY, negotiations: [] });
const SP = PARTNER ? 'shop_' : 'SHOP_';   // لقطات الإعلان (shop_) أو التحقق فقط (SHOP_)

// ── التتبّع ─────────────────────────────────────────────────────────────
const TID = '650000000000000000a7c3f1';
const CAPT = (c) => ({ _id: 'cap1', vehicleType: 'motorcycle', phone: '', currentLocation: { lat: c.lat, lng: c.lng, fixedAt: new Date(NOW - 5000).toISOString() } });
const TL = (cur) => { const k = [['placed', 'تم الطلب', 25], ['accepted', 'قبول الكابتن', 21], ['picked_up', 'الاستلام', 12], ['delivered', 'التسليم', 0]]; const ci = k.findIndex(x => x[0] === cur);
  return { current: cur, steps: k.map((x, i) => ({ key: x[0], label: x[1], done: i <= ci, at: i <= ci ? ago(x[2]) : null })) }; };
const track = (status, c, extra) => Object.assign({ _id: TID, status, orderType: 'delivery', price: YOUR_PRICE, city: 'Khartoum', client: { _id: 'u1' },
  pickup: { address: PICK, lat: A.lat, lng: A.lng }, dropoff: { address: DROP, lat: B.lat, lng: B.lng }, captain: CAPT(c),
  createdAt: ago(25), acceptedAt: ago(21), pickedUpAt: ago(12), deliveredAt: status === 'delivered' ? ago(0) : null, timeline: TL(status), tip: { amount: 0 } }, extra || {});
const MULTI = { isMultiStop: true, stops: [
  { type: 'pickup', address: PICK, lat: A.lat, lng: A.lng, done: true },
  { type: 'dropoff', address: DROP, lat: B.lat, lng: B.lng, done: true },
  { type: 'dropoff', address: STOPS[0][0], lat: STOPS[0][1], lng: STOPS[0][2], done: false },
  { type: 'dropoff', address: STOPS[1][0], lat: STOPS[1][1], lng: STOPS[1][2], done: false }] };
const TMOCK = (o) => [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/price-config/, { maxTipAmount: 20000 }],
  [new RegExp('api/orders/' + TID), o], [/api\/captain\/cap1\/location/, o.captain.currentLocation], [/tip|feedback|rating/, {}]];
const mapReady = (route) => `(async () => { document.documentElement.classList.remove('swal2-height-auto'); document.body.classList.remove('swal2-height-auto');
  for (let i = 0; i < 4 && !window.__lmap; i++) { try { if (window.initTrackingMap) window.initTrackingMap(); } catch (e) { return e.stack.slice(0, 500); } await new Promise(r => setTimeout(r, 1500)); }
  if (window.__lmap) { window.__lmap.invalidateSize();
    ${route ? `L.polyline(${JSON.stringify(PATH.map(p => [p.lat, p.lng]))}, { color: '#ffffff', weight: 9, opacity: 0.9 }).addTo(window.__lmap);
    L.polyline(${JSON.stringify(PATH.map(p => [p.lat, p.lng]))}, { color: '#0A8754', weight: 5, opacity: 0.95 }).addTo(window.__lmap);` : ''} }
  document.querySelectorAll('.swal2-container').forEach(e => e.remove()); await new Promise(r => setTimeout(r, 1800)); return !!window.__lmap; })()`;
const mid = PATH[Math.round(PATH.length * 0.55)];

const HIDE = `(() => { const st = document.createElement('style'); st.textContent = '.theme-toggle,.wj-toast-container{display:none!important}'; document.head.appendChild(st); })()`;
const S = {
  // 01 الرئيسية/شاشة الطلب كما تُفتح
  order_home:      { url: 'index.html', mocks: [...BASE, PRICE], before: `(() => { window.scrollTo(0, 0); return true; })()` },
  // 02 الحقول ممتلئة، و«سعرك» ظاهر
  order_filled:    { url: 'index.html', mocks: [...BASE, PRICE], before: fillForm(YOUR_PRICE), then: scrollTo('#pickup-addr', 140) },
  order_price:     { url: 'index.html', mocks: [...BASE, PRICE], before: fillForm(YOUR_PRICE), then: scrollTo('#price', 380) },
  // 03 البحث، 04 العرض، 05 القبول
  search:          { url: 'client-my-orders.html', mocks: ORDERS([order([])]) },
  offer:           { url: 'client-my-orders.html', mocks: ORDERS([order([OFFER])]) },
  accepted:        { url: 'client-my-orders.html', keepOverlays: true, mocks: ORDERS([order([OFFER])]),
                     before: `(() => { (window.__h.order_status_updated || []).forEach(f => f({ orderId: '${OID}', status: 'accepted' })); return !!document.querySelector('.swal2-popup'); })()`, after: 900 },
  // 06 التوصيل المتعدد في نموذج الطلب، 07 تقدّم المحطات في التتبّع
  multi_form:      { url: 'index.html', mocks: [...BASE, PRICE], before: fillForm(0), then: multiStops, then2: scrollTo('#dropoff-addr', 160) },
  multi_track:     { url: 'tracking.html?orderId=' + TID, mocks: TMOCK(track('picked_up', mid, MULTI)), before: mapReady(false) },
  // 08–14 المتجر: الشريك (shop_*) أو توضيحي للتحقق (SHOP_*)
  [SP + 'list']:       { url: 'client-order.html', local: { wajeez_last_fix: { lat: 15.581, lng: 32.570, ts: NOW } }, mocks: SHOP_LIST },
  [SP + 'detail']:     { url: 'shop-detail.html?placeId=' + PID, mocks: SHOP_DETAIL },
  [SP + 'cart']:       { url: 'shop-detail.html?placeId=' + PID, mocks: SHOP_DETAIL, before: addItems },
  [SP + 'drawer']:     { url: 'shop-detail.html?placeId=' + PID, mocks: SHOP_DETAIL, before: addItems, then: `(() => { if (window.openCart) openCart(); else if (window.toggleCart) toggleCart(); return true; })()` },
  [SP + 'pending']:    { url: 'client-my-orders.html', mocks: ORDERS([shopOrder('shop_pending')]) },
  [SP + 'preparing']:  { url: 'client-my-orders.html', mocks: ORDERS([shopOrder('shop_preparing', 'confirmed')]) },
  [SP + 'ready']:      { url: 'client-my-orders.html', mocks: ORDERS([shopOrder('ready_for_pickup', 'confirmed')]) },
  // 12 التتبّع، 13 الوصول
  tracking:        { url: 'tracking.html?orderId=' + TID, mocks: TMOCK(track('picked_up', mid)), before: mapReady(true) },
  delivered:       { url: 'tracking.html?orderId=' + TID, mocks: TMOCK(track('delivered', B)), before: mapReady(true) }
};

(async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const info = {};
  for (const [name, s] of Object.entries(S)) {
    if (only && !only.includes(name)) continue;
    const steps = [s.before, s.then, s.then2].filter(Boolean);
    const before = `(async () => { ${HIDE}; let r = null; ${steps.map(b => `r = await ${b}; await new Promise(q => setTimeout(q, 500));`).join(' ')} return r; })()`;
    const r = await cap.shot({ dpr: 3, w: 390, h: 844, wait: 2500, local: LOCAL, ...s, local: Object.assign({}, LOCAL, s.local || {}), before, out: path.join(OUT, name + '.png') });
    info[name] = { info: r.info, errs: r.errs.slice(0, 3) };
    console.log(name.padEnd(16), JSON.stringify(r.info).slice(0, 110), r.errs.slice(0, 2).join(' | '));
  }
  const f = path.join(OUT, 'capture-log.json');
  const old = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  fs.writeFileSync(f, JSON.stringify(Object.assign(old, info), null, 1));
  await cap.close();
})();
