/**
 * لقطات الإعلان من التطبيق الحقيقي — بيانات واقعية من الخرطوم.
 *   node tools/shots.js [name,name,...]
 */
const cap = require('./capture');
const OUT = __dirname + '/../screens/';
require('fs').mkdirSync(OUT, { recursive: true });

const ME = { _id: 'u1', id: 'u1', name: 'أحمد محمد', role: 'client', phone: '249912345678', city: 'Khartoum' };
const CATS = [
  { _id: 'c1', name: 'مطاعم', icon: 'restaurant' },
  { _id: 'c2', name: 'سوبر ماركت', icon: 'supermarket' },
  { _id: 'c3', name: 'صيدليات', icon: 'pharmacy' },
  { _id: 'c4', name: 'مخابز', icon: 'bakery' },
  { _id: 'c5', name: 'خضار وفواكه', icon: 'vegetables' }
];
const PLACES = [
  { _id: 'p1', name: 'مطعم الساحة', is_open: true, ratingAvg: 4.8, ratingCount: 214, location: { lat: 15.601, lng: 32.526 }, category: CATS[0] },
  { _id: 'p2', name: 'سوبر ماركت النيل', is_open: true, ratingAvg: 4.7, ratingCount: 98, location: { lat: 15.59, lng: 32.54 }, category: CATS[1] },
  { _id: 'p3', name: 'صيدلية الرياض', is_open: true, ratingAvg: 4.9, ratingCount: 61, location: { lat: 15.578, lng: 32.566 }, category: CATS[2] },
  { _id: 'p4', name: 'مخبز الأمل', is_open: true, ratingAvg: 4.6, ratingCount: 143, location: { lat: 15.605, lng: 32.55 }, category: CATS[3] }
];
const BASE = [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 0 }], [/banners/, []], [/favorites/, []]];

const SHOTS = {
  home: {
    url: 'index.html', role: 'client',
    mocks: [...BASE, [/price-config/, { baseFare: 1500, perKm: 400, minFare: 2000, surge: 1 }], [/addresses/, []]],
    before: () => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      set('pickup-addr', 'شارع المك نمر، الخرطوم 2'); set('pickup-name', 'أحمد محمد'); set('pickup-phone', '0912345678');
      set('dropoff-addr', 'الرياض، شارع المشتل'); set('dropoff-name', 'سارة عبدالله'); set('dropoff-phone', '0923456789');
      set('details', 'ظرف مستندات'); set('price', '3500');
      return true;
    }
  },
  stores: {
    url: 'client-order.html', role: 'client', wait: 2500, fullPage: true,
    mocks: [...BASE, [/places\/categories/, CATS], [/api\/places\?/, PLACES], [/api\/places(\/|$)/, PLACES]]
  },
  errand: {
    url: 'index.html?mode=errand', role: 'client', wait: 2500, fullPage: true,
    session: { errandContext: { shopName: 'بقالة الحاج علي', category: 'بقالة', categoryKey: 'grocery' } },
    mocks: [...BASE, [/price-config/, { baseFare: 1500, perKm: 400, minFare: 2000, surge: 1 }], [/addresses/, []]],
    before: () => {
      const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      set('errand-items', 'رغيف 10\nلبن 2 لتر\nسكر كيلو\nشاي أبونخلة');
      set('errand-shop-input', 'بقالة الحاج علي');
      set('errand-budget', '12000');
      set('price', '2500');
      set('dropoff-addr', 'الرياض، شارع المشتل'); set('dropoff-name', 'سارة عبدالله'); set('dropoff-phone', '0923456789');
      const ta = document.getElementById('errand-items'); if (ta) { ta.rows = 5; ta.style.height = 'auto'; ta.style.minHeight = '150px'; ta.scrollTop = 0; }
      return !!document.getElementById('errand-items');
    }
  },

  captainDash: {
    url: 'captain-dashboard.html', role: 'captain', wait: 3500,
    // تنبيه «إذن الموقع مرفوض» يظهر بعد التحميل — المتصفّح المؤتمت بلا إذن موقع، لا عطل
    before: () => { let n = 0; document.querySelectorAll('body *').forEach(e => { const ps = getComputedStyle(e).position;
      if ((ps === 'fixed' || ps === 'absolute') && /إذن الموقع/.test(e.textContent || '') && (e.textContent || '').length < 160) { e.remove(); n++; } }); return n; },
    user: { name: 'محمد عبدالله', role: 'captain', vehicleType: 'motorcycle', approvalStatus: 'approved' },
    mocks: [[/auth\/me/, { _id: 'u1', name: 'محمد عبدالله', role: 'captain', approvalStatus: 'approved', vehicleType: 'motorcycle' }], [/auth\/refresh/, {}], [/unread-count/, { count: 2 }],
      [/captain\/stats/, { today: { earnings: 18500, count: 9 }, week: { earnings: 96500, count: 47 }, earnings: 412000, completedCount: 1240,
        rating: 4.9, ratingCount: 312, isActive: true, availableCount: 3, activeMissions: 1,
        daily: [['2026-09-28', 11000, 6], ['2026-09-29', 14500, 7], ['2026-09-30', 9000, 5], ['2026-10-01', 16000, 8], ['2026-10-02', 12500, 6], ['2026-10-03', 15000, 7], ['2026-10-04', 18500, 9]]
          .map(([date, earnings, count]) => ({ date, earnings, count })) }],
      [/captain\/wallet/, { debt: 0, balance: 0, wallet: { debt: 0 } }], [/api\/orders/, []]]
  },

  captainOrders: {
    url: 'captain-orders.html', role: 'captain', wait: 2500,
    user: { name: 'محمد عبدالله', role: 'captain', vehicleType: 'motorcycle', approvalStatus: 'approved' },
    mocks: [[/auth\/me/, { _id: 'u1', name: 'محمد عبدالله', role: 'captain', approvalStatus: 'approved' }], [/auth\/refresh/, {}], [/unread-count/, { count: 1 }],
      [/admin\/pricing/, {}], [/my-missions/, []],
      [/api\/orders(\?|$)/, { orders: [
        { _id: 'o1', status: 'pending', orderType: 'delivery', price: 3500, distanceType: 'custom', city: 'Khartoum', createdAt: new Date(Date.now() - 60000).toISOString(),
          pickup: { address: 'شارع عبيد ختم', contactName: 'مطعم الساحة', lat: 15.599, lng: 32.558 }, dropoff: { address: 'الرياض، شارع المشتل', receiverName: 'سارة', lat: 15.581, lng: 32.570 }, details: 'وجبتين وعصير' },
        { _id: 'o2', status: 'pending', orderType: 'errand', price: 2500, distanceType: 'custom', city: 'Khartoum', createdAt: new Date(Date.now() - 180000).toISOString(),
          shopName: 'بقالة الحاج علي', items: ['رغيف 10', 'لبن 2 لتر', 'سكر كيلو'], errand: { budget: 12000 },
          pickup: { address: 'بقالة الحاج علي، الطائف', contactName: 'بقالة الحاج علي', lat: 15.585, lng: 32.585 }, dropoff: { address: 'الطائف، مربع 3', receiverName: 'أم أحمد', lat: 15.583, lng: 32.592 }, details: 'رغيف 10 • لبن 2 لتر • سكر كيلو' },
        { _id: 'o3', status: 'pending', orderType: 'delivery', price: 5000, distanceType: 'custom', city: 'Khartoum', createdAt: new Date(Date.now() - 300000).toISOString(),
          pickup: { address: 'أركويت، مربع 49', contactName: 'هالة', lat: 15.566, lng: 32.586 }, dropoff: { address: 'المعمورة', receiverName: 'عمر', lat: 15.552, lng: 32.570 }, details: 'مستندات' }
      ] }]]
  },

  merchantDash: {
    url: 'merchant-dashboard.html', role: 'merchant', wait: 2500,
    user: { name: 'أحمد محمد', role: 'merchant' },
    mocks: [[/auth\/me/, { _id: 'u1', name: 'أحمد محمد', role: 'merchant' }], [/auth\/refresh/, {}], [/unread-count/, { count: 3 }],
      [/merchant\/profile/, { place: { _id: 'p1', name: 'مطعم الساحة', isOpenOverride: true, is_open: true, tier: 'pro', shareCode: 'sa7a', category: { name: 'مطاعم' } } }],
      [/merchant\/badges/, { newOrders: 3, preparing: 2, ready: 1, messages: 2 }],
      [/merchant\/orders/, { orders: [
        { _id: 's1', status: 'shop_pending', paymentStatus: 'receipt_sent', paidVia: 'bankak', totalAmount: 12500, itemsTotal: 11000, createdAt: new Date(Date.now() - 120000).toISOString(), client: { name: 'سارة عبدالله' }, items: [{ name: 'بيتزا خضار', quantity: 2, price: 5500 }] },
        { _id: 's2', status: 'shop_preparing', paymentStatus: 'confirmed', totalAmount: 8200, itemsTotal: 7000, createdAt: new Date(Date.now() - 900000).toISOString(), client: { name: 'عمر الطيب' }, items: [{ name: 'شاورما', quantity: 2, price: 3500 }] }
      ], currentPage: 1, totalPages: 1, total: 2 }],
      [/merchant\/products/, { products: [] }], [/merchant/, {}]]
  },

  pay: {
    url: 'client-my-orders.html', role: 'client', wait: 2500, selector: '.o-actions',
    mocks: [...BASE, [/my-orders/, { orders: [{ _id: 'so1', shopOrderId: 'so1', orderType: 'shop', status: 'pending', realShopStatus: 'shop_pending', paymentStatus: 'pending',
      price: 12500, itemsTotal: 11000, deliveryFee: 1500, pickup: { address: 'مطعم الساحة' }, dropoff: { address: 'الرياض' }, createdAt: new Date().toISOString(), details: '2x بيتزا خضار',
      paymentMethods: [
        { method: 'bankak', label: 'بنكك', accountNumber: '0123456789', accountName: 'مطعم الساحة للأغذية' },
        { method: 'mycashi', label: 'ماي كاشي', accountNumber: '0912345678', accountName: 'أحمد محمد' },
        { method: 'fawry', label: 'فوري', accountNumber: '4455667788', accountName: 'أحمد محمد' },
        { method: 'ocash', label: 'أوكاش', accountNumber: '5566778899', accountName: 'أحمد محمد' }] }], hasMore: false, total: 1 }]],
    before: () => { const el = document.querySelector('.pm-pay-slot'); if (!el) return false; el.querySelectorAll('.pm-choice')[0].click(); return el.querySelectorAll('.pm-choice').length; }
  },

  registerPay: {
    url: 'client-register-shop.html', role: 'client', wait: 2500, selector: '#fPaymentMethods',
    mocks: [...BASE, [/merchant-requests\/my-request/, {}, 404], [/merchant-requests\/form-data/, { banks: [], categories: [{ _id: 'c1', name: 'مطعم' }] }]],
    before: () => {
      const tick = (id) => { const c = document.getElementById('pm-' + id); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); };
      tick('bankak'); tick('fawry');
      document.getElementById('pm-bankak-num').value = '0123456789'; document.getElementById('pm-bankak-name').value = 'مطعم الساحة للأغذية';
      document.getElementById('pm-fawry-num').value = '4455667788'; document.getElementById('pm-fawry-name').value = 'أحمد محمد';
      if (document.activeElement) document.activeElement.blur();
      return true;
    }
  }
};

(async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(SHOTS);
  for (const name of only) {
    const s = SHOTS[name];
    const r = await cap.shot({ dpr: 2.5, ...s, out: OUT + name + '.png', logRequests: true });
    console.log(name, JSON.stringify(r.info), r.errs.slice(0, 3).join(' | '));
    if (process.env.LOG) console.log('   ' + (r.seen || []).join('\n   '));
  }
  await cap.close();
})();
