/**
 * لقطات فيديو شرح الكابتن — من التطبيق الحقيقي ببياناتٍ تجريبية واقعية.
 *   node tools/shots-captain.js [name,name,...]
 * كل لقطة: screens/captain/<name>.png + <name>.json (مواضع العناصر للنقرات والإبرازات)
 *
 * الخادم كلّه محاكى (mocks) — لا اتصال بالخادم ولا بقاعدة البيانات.
 * الصور (وثائق، صورة الطلبية، الإشعار البنكي) ترسمها اللقطة على canvas
 * وتُمرَّر لحقول الملفات عبر DataTransfer، فيعمل كود الصفحة الحقيقي عليها.
 */
const cap = require('./capture');
const fs = require('fs');
const OUT = __dirname + '/../screens/captain/';
fs.mkdirSync(OUT, { recursive: true });

// ── الكابتن ───────────────────────────────────────────────────────────────
const CAP_USER = { name: 'محمد عبدالله', role: 'captain', vehicleType: 'motorcycle', approvalStatus: 'approved', phone: '0912345678', city: 'Khartoum' };
const ME = Object.assign({ _id: 'u1', id: 'u1', email: 'mohamed.abdalla@example.com' }, CAP_USER);
const LOCAL = { captainName: 'محمد عبدالله', captain_audio_enabled: 'true' };
const BASE = [[/auth\/me/, ME], [/auth\/refresh/, {}], [/unread-count/, { count: 2 }],
  [/admin\/pricing/, { commissionRate: 0.15 }], [/app-config/, { negotiationTtlMinutes: 5 }]];

const NOW = Date.now();
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const day = (d) => { const x = new Date(NOW); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };

const STATS = (o) => Object.assign({ today: { earnings: 18500, count: 9 }, week: { earnings: 96500, count: 47 }, earnings: 412000, completedCount: 1240,
  rating: 4.9, ratingCount: 312, isActive: true, availableCount: 4, activeMissions: 1,
  daily7: [11000, 14500, 9000, 16000, 12500, 15000, 18500].map((e, i) => ({ date: day(6 - i), earnings: e, count: Math.round(e / 2000) })) }, o || {});
const WALLET = (o) => Object.assign({ wallet_balance: -1850, credit_limit: -5000, usage_percent: 37, is_blocked: false, total_commission: 61800,
  bankName: 'بنك الخرطوم', bankAccountName: 'إدارة تطبيق وجيز', bankAccountNumber: '3104527' }, o || {});

// ── نقاط الخرطوم ─────────────────────────────────────────────────────────
const P = {
  saha: { address: 'مطعم الساحة، شارع عبيد ختم', contactName: 'مطعم الساحة', contactPhone: '0912000111', lat: 15.5838, lng: 32.5588 },
  riyadh: { address: 'الرياض، شارع المشتل', receiverName: 'سارة عبدالله', receiverPhone: '0923456789', lat: 15.5795, lng: 32.5702 },
  haj: { address: 'بقالة الحاج علي، الطائف', contactName: 'بقالة الحاج علي', contactPhone: '0912333444', lat: 15.5712, lng: 32.5841 },
  taif: { address: 'الطائف، مربع 3', receiverName: 'أم أحمد', receiverPhone: '0911223344', lat: 15.5668, lng: 32.5899 },
  mamoura: { address: 'المعمورة، شارع 41', receiverName: 'عمر الطيب', receiverPhone: '0915556677', lat: 15.5541, lng: 32.5693 }
};
const CLIENTS = { sara: { _id: 'c1', name: 'سارة عبدالله' }, omar: { _id: 'c2', name: 'عمر الطيب' }, um: { _id: 'c3', name: 'أم أحمد' } };

// صورة إشعار تحويل (SVG) — تظهر عند «عرض إشعار الدفع»
const RECEIPT_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520" viewBox="0 0 360 520">
<rect width="360" height="520" fill="#f8fafc"/><rect x="0" y="0" width="360" height="90" fill="#b91c1c"/>
<text x="180" y="55" font-family="Cairo,Tahoma" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">بنكك</text>
<circle cx="180" cy="150" r="34" fill="#16a34a"/><path d="M164 150l11 11 21-22" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>
<text x="180" y="220" font-family="Cairo,Tahoma" font-size="20" font-weight="700" fill="#0f172a" text-anchor="middle">تمت العملية بنجاح</text>
<text x="180" y="270" font-family="Cairo,Tahoma" font-size="30" font-weight="800" fill="#0f172a" text-anchor="middle">12,500 ج.س</text>
<g font-family="Cairo,Tahoma" font-size="15" fill="#475569"><text x="330" y="330" text-anchor="end">إلى: مطعم الساحة للأغذية</text>
<text x="330" y="365" text-anchor="end">رقم العملية: 2026100541187</text><text x="330" y="400" text-anchor="end">التاريخ: 05/10/2026 — 01:42 م</text>
<text x="330" y="435" text-anchor="end">من: سارة عبدالله</text></g></svg>`);

// ── أدوات داخل الصفحة ─────────────────────────────────────────────────────
// يزيل تنبيهات النظام العابرة (إذن الموقع…) — المتصفّح المؤتمت بلا إذن موقع، ليس عطلاً
const CLEAN = `(() => { let n = 0; document.querySelectorAll('body *').forEach(e => { const cs = getComputedStyle(e);
  if ((cs.position === 'fixed' || cs.position === 'absolute') && /إذن الموقع|خدمة الموقع|الموقع مرفوض|تعذّر تحديد الموقع/.test(e.textContent || '') && (e.textContent || '').length < 160) { e.remove(); n++; } });
  document.querySelectorAll('.toast, .wajeez-toast, .notification-toast').forEach(e => { if (/موقع/.test(e.textContent || '')) e.remove(); });
  const tt = document.querySelector('.theme-toggle'); if (tt) tt.remove(); return n; })()`;

// صورٌ مرسومة على canvas تُعاد File (PNG) لحقول الرفع
const MKIMG = `window.__mkImg = (kind, w, h) => new Promise(res => {
  w = w || 900; h = h || 600; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const txt = (s, x, y, size, color, align) => { g.font = '700 ' + size + 'px Cairo, Tahoma'; g.fillStyle = color; g.textAlign = align || 'right'; g.fillText(s, x, y); };
  if (kind === 'id') {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#e0f2fe'); gr.addColorStop(1, '#bbf7d0'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0f766e'; g.fillRect(0, 0, w, 90); txt('جمهورية السودان — البطاقة القومية', w - 30, 58, 34, '#fff');
    g.fillStyle = '#cbd5e1'; g.fillRect(40, 130, 220, 280); g.fillStyle = '#94a3b8'; g.beginPath(); g.arc(150, 230, 55, 0, 7); g.fill(); g.fillRect(80, 300, 140, 110);
    txt('الاسم: محمد عبدالله أحمد', w - 40, 180, 32, '#0f172a'); txt('الرقم الوطني: 1•••••••••8', w - 40, 240, 30, '#0f172a');
    txt('تاريخ الميلاد: 1996/03/14', w - 40, 300, 28, '#334155'); txt('مكان الإصدار: الخرطوم', w - 40, 355, 28, '#334155');
    g.fillStyle = '#0f766e'; g.fillRect(0, h - 40, w, 40);
  } else if (kind === 'bike') {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fde68a'); gr.addColorStop(1, '#f59e0b'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#a16207'; g.fillRect(0, h * .78, w, h * .22);
    g.lineWidth = 22; g.strokeStyle = '#111827'; [[230, 420], [670, 420]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 95, 0, 7); g.stroke(); });
    g.fillStyle = '#dc2626'; g.beginPath(); g.moveTo(300, 330); g.lineTo(560, 330); g.lineTo(640, 400); g.lineTo(330, 410); g.closePath(); g.fill();
    g.fillStyle = '#16a34a'; g.fillRect(300, 190, 190, 140); txt('وجيز', 470, 275, 48, '#fff');
    g.strokeStyle = '#374151'; g.lineWidth = 14; g.beginPath(); g.moveTo(600, 330); g.lineTo(650, 220); g.lineTo(700, 210); g.stroke();
  } else if (kind === 'parcel') {
    g.fillStyle = '#e7e5e4'; g.fillRect(0, 0, w, h); g.fillStyle = '#d6d3d1'; g.fillRect(0, h * .7, w, h * .3);
    g.fillStyle = '#b45309'; g.beginPath(); g.moveTo(260, 130); g.lineTo(640, 130); g.lineTo(680, 520); g.lineTo(220, 520); g.closePath(); g.fill();
    g.fillStyle = '#92400e'; g.fillRect(260, 120, 380, 30); g.strokeStyle = '#78350f'; g.lineWidth = 10; g.beginPath(); g.arc(450, 120, 70, Math.PI, 0); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(320, 260, 260, 120); txt('مطعم الساحة', 560, 318, 38, '#b91c1c'); txt('طلب #8F31', 560, 362, 28, '#334155');
  } else if (kind === 'receipt') {
    g.fillStyle = '#f8fafc'; g.fillRect(0, 0, w, h); g.fillStyle = '#b91c1c'; g.fillRect(0, 0, w, 130); txt('بنكك', w / 2, 82, 46, '#fff', 'center');
    g.fillStyle = '#16a34a'; g.beginPath(); g.arc(w / 2, 230, 55, 0, 7); g.fill(); txt('تمت العملية بنجاح', w / 2, 360, 34, '#0f172a', 'center');
    txt((window.__rcptAmt || '1,850') + ' ج.س', w / 2, 440, 52, '#0f172a', 'center');
    txt('إلى: إدارة تطبيق وجيز', w - 40, 540, 28, '#475569'); txt('رقم العملية: 2026100598812', w - 40, 600, 28, '#475569'); txt('التاريخ: 05/10/2026', w - 40, 660, 28, '#475569');
  } else {
    g.fillStyle = '#f1f5f9'; g.fillRect(0, 0, w, h);
  }
  c.toBlob(b => res(new File([b], kind + '.png', { type: 'image/png' })), 'image/png');
});
window.__setFile = async (input, kind, w, h) => { const el = typeof input === 'string' ? document.getElementById(input) : input; const f = await window.__mkImg(kind, w, h);
  const dt = new DataTransfer(); dt.items.add(f); el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true })); return f.size; };`;

const B = (fn) => `(async () => { ${MKIMG}; const __c = ${CLEAN}; const r = await (${fn.toString()})(); setTimeout(() => ${CLEAN}, 400); return r; })()`;
const sleep = `const sleep = (ms) => new Promise(r => setTimeout(r, ms));`;

// ── الطلبات المتاحة ──────────────────────────────────────────────────────
const ORD = {
  o1: { _id: 'a71c8f31', status: 'pending', orderType: 'delivery', price: 3500, tip: { amount: 1000 }, netRevenue: 3975, city: 'Khartoum', createdAt: ago(1),
    client: CLIENTS.sara, pickup: P.saha, dropoff: P.riyadh, details: 'وجبتين شاورما وعصير — الكيس مقفول، سلّمو لي سارة يد بيد' },
  o2: { _id: 'b52d4e07', status: 'pending', orderType: 'shop', shopName: 'مطعم الساحة', price: 1500, city: 'Khartoum', createdAt: ago(3),
    client: CLIENTS.omar, pickup: P.saha, dropoff: Object.assign({}, P.mamoura), shopOrderDetails: '2× شاورما دجاج\n1× عصير مانجو كبير', receiptImage: RECEIPT_SVG },
  o3: { _id: 'c93a6b12', status: 'pending', orderType: 'errand', shopName: 'بقالة الحاج علي', price: 2500, city: 'Khartoum', createdAt: ago(4),
    client: CLIENTS.um, items: ['رغيف 10 قطع', 'لبن 2 لتر', 'سكر كيلو', 'شاي الغزالين'], errand: { budget: 12000 }, pickup: P.haj, dropoff: P.taif },
  o4: { _id: 'd14f9a55', status: 'pending', orderType: 'delivery', isMultiStop: true, price: 6500, netRevenue: 5525, city: 'Khartoum', createdAt: ago(6),
    client: CLIENTS.sara, pickup: P.saha, dropoff: P.mamoura, details: 'تلاتة وجبات — كل وجبة لي زول',
    stops: [{ _id: 's1', type: 'pickup', address: P.saha.address, contactName: 'مطعم الساحة', contactPhone: '0912000111', lat: P.saha.lat, lng: P.saha.lng },
      { _id: 's2', type: 'dropoff', address: P.taif.address, contactName: 'أم أحمد', contactPhone: '0911223344', lat: P.taif.lat, lng: P.taif.lng },
      { _id: 's3', type: 'dropoff', address: P.mamoura.address, contactName: 'عمر الطيب', contactPhone: '0915556677', lat: P.mamoura.lat, lng: P.mamoura.lng }] }
};
const ORDERS_MOCK = (list) => [...BASE, [/api\/orders(\?|$)/, { orders: list }]];
const ORDERS_MARKS = { header: '.app-header', countBadge: '#orders-count-badge', refresh: 'button[onclick="fetchOrders()"]',
  card1: '#orders-list > div:nth-child(1) .card', price1: '#orders-list > div:nth-child(1) .card-header h5', net1: '#orders-list > div:nth-child(1) .card-header small',
  tip1: '#orders-list > div:nth-child(1) .bg-success-subtle', contacts1: '#orders-list > div:nth-child(1) .bg-light.rounded-3', notes1: '#orders-list > div:nth-child(1) .alert-warning',
  pickupNav1: '#orders-list > div:nth-child(1) .nav-btn[data-type="pickup"]', dropoffNav1: '#orders-list > div:nth-child(1) .nav-btn[data-type="dropoff"]',
  route1: '#orders-list > div:nth-child(1) a[href*="google.com/maps"]', accept1: '#orders-list > div:nth-child(1) button[onclick^="acceptOrder"]',
  negotiate1: '#orders-list > div:nth-child(1) button[onclick^="negotiateOrder"]',
  shopCard: '#orders-list > div:nth-child(2) .card', shopBadge: '#orders-list > div:nth-child(2) .badge.bg-success', prepaid: '#orders-list > div:nth-child(2) .alert-success',
  shopDetails: '#orders-list > div:nth-child(2) .bg-success.bg-opacity-10.p-3', receiptBtn: '#orders-list > div:nth-child(2) button[onclick^="viewReceipt"]',
  errandCard: '#orders-list > div:nth-child(3) .card', errandBadge: '#orders-list > div:nth-child(3) .card-header .badge', errandNote: '#orders-list > div:nth-child(3) .alert',
  errandItems: '#orders-list > div:nth-child(3) ul', multiCard: '#orders-list > div:nth-child(4) .card', multiBadge: '#orders-list > div:nth-child(4) .badge.bg-info',
  multiStops: '#orders-list > div:nth-child(4) .timeline', navOrders: '.captain-nav a[href="captain-orders.html"]' };

// ── المهام ───────────────────────────────────────────────────────────────
const TL = (status) => { const idx = { accepted: 1, picked_up: 2 }[status];
  const at = [ago(14), ago(11), ago(4), null];
  return { current: status, cancelled: false, steps: [['placed', 'تم إنشاء الطلب'], ['accepted', 'قَبِل الكابتن'], ['picked_up', 'استلم الطلب'], ['delivered', 'تم التسليم']]
    .map(([key, label], i) => ({ key, label, done: i <= idx, at: i <= idx ? at[i] : null })) }; };
const mission = (base, extra) => Object.assign({}, base, { captain: { _id: 'u1', name: 'محمد عبدالله' }, captainAssignedAt: ago(11) }, extra);
const M = {
  delivery: (st, x) => mission(ORD.o1, Object.assign({ status: st || 'accepted', eta: { text: st === 'picked_up' ? '9 دقائق' : '18 دقيقة', distanceKm: st === 'picked_up' ? 1.6 : 4.2 }, timeline: TL(st || 'accepted') }, x)),
  errand: (q, x) => mission(ORD.o3, Object.assign({ status: 'accepted', timeline: TL('accepted'), eta: { text: '22 دقيقة', distanceKm: 3.1 },
    errand: Object.assign({ budget: 12000 }, q) }, x)),
  multi: (st, x) => mission(ORD.o4, Object.assign({ status: st || 'accepted', timeline: TL(st || 'accepted'), eta: { text: '35 دقيقة', distanceKm: 7.4 } }, x))
};
const MISSIONS_MOCK = (list, more) => [...BASE, ...(more || []), [/my-missions/, list], [/api\/orders\/[^/]+\/stops\/suggest-route/, SUGGEST]];
const card = '#missions-container > .card';
const MISSION_MARKS = { card: card, orderId: card + ' .badge.bg-primary', price: card + ' .text-success.fw-bold', eta: card + ' .p-3 > div[style*="gradient"]',
  timeline: card + ' .p-3 > div[style*="display:flex;margin-bottom:12px"]', pickup: card + ' .bi-geo-alt-fill.fs-5', pickupNav: card + ' .nav-btn[data-type="pickup"]',
  pickupCall: card + ' .p-3 > .mb-3 > div:nth-child(1) a[href^="tel:"]', dropoffNav: card + ' .nav-btn[data-type="dropoff"]',
  dropoffCall: card + ' .p-3 > .mb-3 > div:nth-child(2) a[href^="tel:"]', details: card + ' .bg-light.p-2', action: card + ' .p-3 > button.w-100.py-2.mb-2, ' + card + ' .p-3 > .alert-info',
  chat: card + ' button[onclick^="openChat"]', release: card + ' button[onclick^="releaseOrder"]', navMissions: '.captain-nav a[href="captain-missions.html"]' };

const SUGGEST = { changed: true, currentKm: 9.8, optimizedKm: 7.4, savedKm: 2.4, order: ['s1', 's3', 's2'],
  stops: [ORD.o4.stops[0], ORD.o4.stops[2], ORD.o4.stops[1]] };

// ── اللقطات ───────────────────────────────────────────────────────────────
const NO_AUTH = { token: null, user: null, userId: null, captainToken: null, merchantToken: null, adminToken: null };
const REG_OPEN = [/captain-registration-status/, { open: { Khartoum: true, PortSudan: true, Atbara: true } }];
const SIGNUP_FILL = `const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
  set('name', 'محمد عبدالله أحمد'); set('city', 'Khartoum'); set('email', 'mohamed.abdalla@example.com'); set('phone', '0912345678'); set('password', 'wajeez2026');`;
const SIGNUP_S2 = `goToStep(2); const v = document.querySelector('.vehicle-option[data-vehicle="motorcycle"]'); if (v) selectVehicle(v, 'motorcycle');
  set('plateNumber', 'خ ط 4521'); set('hasCarrier', 'yes');`;
const SIGNUP_S3 = `goToStep(3); set('nationalId', '11928374650'); set('address', 'أم درمان - الثورة الحارة 21'); set('whatsapp', '0912345678');
  set('emergencyContactName', 'عبدالله أحمد'); set('emergencyPhone', '0918765432'); set('emergencyRelation', 'والد');
  const ag = document.getElementById('pledgeAgree'); if (ag) ag.checked = true;`;
const FIXBG = ` document.documentElement.style.setProperty('background', '#043d26', 'important'); document.body.style.setProperty('background', '#043d26', 'important'); `;
const SIGNUP_MARKS = { steps: '.step-indicator', title: '.step-section.active h5', alert: '#alert-box' };

const SHOTS = {
  // ── التسجيل ───────────────────────────────────────────────────────────
  signup1: {
    url: 'captain-signup.html', local: NO_AUTH, wait: 1800, mocks: [REG_OPEN],
    before: B(new Function(SIGNUP_FILL + ' if (document.activeElement) document.activeElement.blur(); return document.getElementById("city").selectedOptions[0].textContent;')),
    marks: Object.assign({ name: '#name', city: '#city', email: '#email', phone: '#phone', password: '#password', next: '#step-1 button.btn-success', login: 'a[onclick*="goToLogin"], a[href*="login"]' }, SIGNUP_MARKS)
  },
  signupCities: {
    // قائمة المدن مفتوحةً تبدو أصلية فقط في الهاتف؛ هنا نُظهر الخيارات كقائمة ممدودة
    url: 'captain-signup.html', local: NO_AUTH, wait: 1800, mocks: [REG_OPEN],
    before: B(() => { const s = document.getElementById('city'); s.size = 4; s.style.height = 'auto'; s.value = 'Khartoum'; return [...s.options].map(o => o.textContent).join(' | '); }),
    marks: { city: '#city' }
  },
  signup2: {
    url: 'captain-signup.html', local: NO_AUTH, wait: 1800, mocks: [REG_OPEN],
    before: B(new Function(SIGNUP_FILL + SIGNUP_S2 + ' window.scrollTo(0,0); return document.querySelector(".step-section.active").id;')),
    marks: Object.assign({ vehicleGrid: '#vehicleGrid', motorcycle: '.vehicle-option[data-vehicle="motorcycle"]', plate: '#plateNumber', carrier: '#hasCarrier',
      back: '#step-2 button.btn-outline-secondary', next: '#step-2 button.btn-success' }, SIGNUP_MARKS)
  },
  signup3: {
    url: 'captain-signup.html', local: NO_AUTH, wait: 1800, fullPage: true, mocks: [REG_OPEN],
    before: B(new Function(SIGNUP_FILL + SIGNUP_S2 + SIGNUP_S3 + FIXBG + ' if (document.activeElement) document.activeElement.blur(); return document.querySelector(".step-section.active").id;')),
    marks: Object.assign({ nationalId: '#nationalId', address: '#address', whatsapp: '#whatsapp', emergencyName: '#emergencyContactName', emergencyPhone: '#emergencyPhone',
      emergencyRelation: '#emergencyRelation', terms: '.cap-terms', pledge: '.pledge-card', pledgeName: '#pledgeName', pledgePhone: '#pledgePhone', agree: '#pledgeAgree',
      next: '#step-3 button.btn-success' }, SIGNUP_MARKS)
  },
  signup4: {
    url: 'captain-signup.html', local: NO_AUTH, wait: 1800, fullPage: true, mocks: [REG_OPEN], after: 1800,
    before: B(new Function(SIGNUP_FILL + SIGNUP_S2 + SIGNUP_S3 + ` goToStep(4);
      return (async () => { await window.__setFile('idImage', 'id', 900, 570); await window.__setFile('vehiclePhoto', 'bike', 900, 600); window.scrollTo(0, 0); ${FIXBG} return document.querySelector('.step-section.active').id; })();`)),
    marks: Object.assign({ idImage: '#idImage-label', selfie: '#selfieImage-label', license: '#driverLicense-label', profilePhoto: '#profilePhoto-label', vehiclePhoto: '#vehiclePhoto-label',
      idZone: '#step-4 .mb-3:nth-of-type(1) .upload-zone', submit: '#submitBtn', back: '#step-4 button.btn-outline-secondary' }, SIGNUP_MARKS)
  },
  regClosed: {
    url: 'captain-signup.html', local: NO_AUTH, wait: 1800,
    mocks: [[/captain-registration-status/, { open: { Khartoum: false, PortSudan: false, Atbara: false } }]],
    marks: { panel: '#regClosed', title: '.reg-closed-title', text: '#regClosedText', home: '#regClosed a.btn' }
  },
  regCityClosed: {
    // مدينة مغلقة وأخرى مفتوحة: الخيار المغلق معطّل والسبب تحت القائمة
    url: 'captain-signup.html', local: NO_AUTH, wait: 1800,
    mocks: [[/captain-registration-status/, { open: { Khartoum: true, PortSudan: false, Atbara: true } }]],
    before: B(() => { const s = document.getElementById('city'); s.size = 4; s.style.height = 'auto'; return document.getElementById('regCityNote').textContent; }),
    marks: { city: '#city', note: '#regCityNote' }
  },

  // ── الدخول ────────────────────────────────────────────────────────────
  login: {
    url: 'captain-login.html', local: NO_AUTH, wait: 1500,
    before: B(() => { document.getElementById('email').value = '0912345678'; document.getElementById('password').value = 'wajeez2026'; return true; }),
    marks: { id: '#email', password: '#password', submit: 'button[onclick="login()"]', home: 'a[href="index.html"]', forgot: 'a[href*="forgot"]' }
  },
  loginPending: {
    url: 'captain-login.html', local: NO_AUTH, wait: 1500,
    mocks: [[/auth\/login/, { message: 'طلبك قيد المراجعة من الإدارة. سيتم إشعارك عند الموافقة.' }, 403]],
    before: B(async () => { document.getElementById('email').value = '0912345678'; document.getElementById('password').value = 'wajeez2026'; await login(); return document.getElementById('alert-box').textContent.trim(); }),
    marks: { alert: '#alert-box', id: '#email', submit: 'button[onclick="login()"]' }
  },
  loginRejected: {
    url: 'captain-login.html', local: NO_AUTH, wait: 1500,
    mocks: [[/auth\/login/, { message: 'تم رفض طلبك — السبب: صورة الهوية غير واضحة. يمكنك تصحيح ذلك وإعادة التقديم من صفحة تسجيل الكباتن بنفس رقمك وكلمة مرورك.', rejected: true, canReapply: true }, 403]],
    before: B(async () => { document.getElementById('email').value = '0912345678'; document.getElementById('password').value = 'wajeez2026'; await login(); return document.getElementById('alert-box').textContent.trim().slice(0, 60); }),
    marks: { alert: '#alert-box', reapply: '#alert-box a[href="captain-signup.html"]' }
  },

  // ── اللوحة ────────────────────────────────────────────────────────────
  dashOffline: {
    url: 'captain-dashboard.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 3500,
    mocks: [...BASE, [/captain\/stats/, STATS({ isActive: false, today: { earnings: 0, count: 0 }, availableCount: 4, activeMissions: 0 })], [/captain\/wallet/, WALLET()]],
    before: B(() => document.getElementById('availabilityToggle').textContent.trim()),
    marks: { status: '#availabilityToggle', offlineBanner: '#offlineBanner', startShift: '#offlineBanner .cob-btn', hero: '.cap-hero', name: '#captainName' }
  },
  dashOnlineConfirm: {
    url: 'captain-dashboard.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 3500, keepOverlays: true, after: 900,
    mocks: [...BASE, [/captain\/stats/, STATS({ isActive: false, today: { earnings: 0, count: 0 }, activeMissions: 0 })], [/captain\/wallet/, WALLET()]],
    before: B(() => { if (!document.querySelector('.swal2-popup')) checkOnboarding(true); return true; }),
    marks: { dialog: '.swal2-popup', title: '.swal2-title', confirm: '.swal2-confirm', cancel: '.swal2-cancel' }
  },
  dashOnline: {
    url: 'captain-dashboard.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 3500,
    mocks: [...BASE, [/captain\/stats/, STATS()], [/captain\/wallet/, WALLET()]],
    before: B(() => document.getElementById('availabilityToggle').textContent.trim()),
    marks: { status: '#availabilityToggle', hero: '.cap-hero', heroValue: '#totalEarnings', periodTabs: '#periodTabs', tabToday: '.period-tab[data-period="today"]',
      tabWeek: '.period-tab[data-period="week"]', tabAll: '.period-tab[data-period="all"]', metrics: '.cap-metrics', trips: '.cap-metric.tone-green', rating: '.cap-metric.tone-amber',
      walletTile: 'a.cap-metric[href="captain-wallet.html"]', available: 'a.cap-action[href="captain-orders.html"]', availableCount: '#availableCount',
      missions: '.cap-actions a.cap-action[href="captain-missions.html"]', missionsCount: '#missionsCount', chart: '#earningsChart', weekTotal: '#weekTotalLabel', sos: '#sos-btn',
      nav: '.captain-nav', navHome: '.captain-nav a[href="captain-dashboard.html"]', navOrders: '.captain-nav a[href="captain-orders.html"]', navMissions: '.captain-nav a[href="captain-missions.html"]',
      navNotif: '.captain-nav a[href="captain-notifications.html"]', navProfile: '.captain-nav a[href="captain-profile.html"]' }
  },
  dashFull: {
    url: 'captain-dashboard.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 3500, fullPage: true,
    mocks: [...BASE, [/captain\/stats/, STATS()], [/captain\/wallet/, WALLET()]],
    before: B(() => true),
    marks: { chart: '#earningsChart', walletCard: '#walletCard', walletBalance: '#walletBalance', walletLimit: '#walletLimit', walletMeter: '.cap-meter',
      history: '.cap-actions a[href="captain-history.html"]', analytics: '.cap-actions a[href="captain-analytics.html"]', profile: '.cap-actions a[href="captain-profile.html"]' }
  },
  sos: {
    url: 'captain-dashboard.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 3500, keepOverlays: true, after: 900,
    mocks: [...BASE, [/captain\/stats/, STATS()], [/captain\/wallet/, WALLET()]],
    before: B(() => { document.querySelectorAll('.swal2-container').forEach(e => e.remove()); triggerSOS(); return true; }),
    marks: { dialog: '.swal2-popup', title: '.swal2-title', confirm: '.swal2-confirm', cancel: '.swal2-cancel', sos: '#sos-btn' }
  },
  blocked: {
    url: 'captain-dashboard.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 3500,
    mocks: [...BASE, [/captain\/stats/, STATS({ isActive: false })], [/wallet\/pay\/status/, { request: null }],
      [/captain\/wallet/, WALLET({ wallet_balance: -5250, usage_percent: 100, is_blocked: true })]],
    before: B(() => getComputedStyle(document.getElementById('blockedOverlay')).display),
    marks: { overlay: '#blockedOverlay', title: '#blockedOverlayTitle', balance: '#blockedBalanceVal', confirmPay: '#paymentConfirmBtn', refresh: '#blockedOverlay .cap-btn-ghost' }
  },
  dashPayModal: {
    // ورقة السداد من اللوحة: بيانات الحساب البنكي وزرّ النسخ
    url: 'captain-dashboard.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 3500, after: 1500,
    mocks: [...BASE, [/captain\/stats/, STATS({ isActive: false })], [/wallet\/pay\/status/, { request: null }],
      [/captain\/wallet/, WALLET({ wallet_balance: -5250, usage_percent: 100, is_blocked: true })]],
    before: B(async () => { document.getElementById('blockedOverlay').style.display = 'none'; openPaymentModal();
      document.getElementById('payAmount').value = '5250'; document.getElementById('payTransactionId').value = '2026100598812';
      if (typeof imageCompression === 'undefined') window.imageCompression = async (f) => f; window.__rcptAmt = '5,250'; await window.__setFile('payReceipt', 'receipt', 600, 760); return true; }),
    marks: { sheet: '#paymentModal .cap-sheet', bank: '.cap-bank', bankName: '#captainBankName', accName: '#captainBankAccountName', accNum: '#bankAccNum', copy: '#copyAccBtn',
      amount: '#payAmount', txId: '#payTransactionId', receipt: 'label.cap-drop', submit: '#paySubmitBtn', cancel: '#paymentModal .cap-btn-ghost' }
  },

  // ── الطلبات المتاحة ───────────────────────────────────────────────────
  soundBanner: {
    url: 'captain-orders.html', role: 'captain', user: CAP_USER, local: { captainName: 'محمد عبدالله', captain_audio_enabled: null }, wait: 2500,
    mocks: ORDERS_MOCK([ORD.o1]),
    before: B(() => { const b = document.getElementById('sound-enable-banner'); const was = !b.classList.contains('d-none'); if (typeof initAudio === 'function') initAudio(); b.classList.remove('d-none'); return was ? 'shown-by-page' : 'forced'; }),
    marks: { banner: '#sound-enable-banner', enable: '#sound-enable-banner button' }
  },
  ordersTop: {
    url: 'captain-orders.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500,
    mocks: ORDERS_MOCK([ORD.o1, ORD.o2, ORD.o3, ORD.o4]), before: B(() => document.querySelectorAll('#orders-list > div').length), marks: ORDERS_MARKS
  },
  ordersList: {
    url: 'captain-orders.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: ORDERS_MOCK([ORD.o1, ORD.o2, ORD.o3, ORD.o4]), before: B(() => document.querySelectorAll('#orders-list > div').length), marks: ORDERS_MARKS
  },
  shopOrder: {
    // طلب المحل كما يراه الكابتن قبل القبول: «مدفوعة مسبقاً — لا تدفع للمحل» و«عرض إشعار الدفع»
    url: 'captain-orders.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: ORDERS_MOCK([ORD.o2]), before: B(() => document.querySelectorAll('#orders-list > div').length),
    marks: { card: '#orders-list .card', badge: '#orders-list .card-header .badge', prepaid: '#orders-list .alert-success', details: '#orders-list .bg-success.bg-opacity-10.p-3',
      receiptBtn: '#orders-list button[onclick^="viewReceipt"]', accept: '#orders-list button[onclick^="acceptOrder"]', negotiate: '#orders-list button[onclick^="negotiateOrder"]' }
  },
  receiptView: {
    url: 'captain-orders.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, keepOverlays: true, after: 1000,
    mocks: ORDERS_MOCK([ORD.o2]),
    before: B(() => { const b = document.querySelector('#orders-list button[onclick^="viewReceipt"]'); if (b) b.click(); return !!b; }),
    marks: { dialog: '.swal2-popup', image: '.swal2-popup img', close: '.swal2-close' }
  },
  acceptConfirm: {
    url: 'captain-orders.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, keepOverlays: true, after: 900,
    mocks: ORDERS_MOCK([ORD.o1, ORD.o3]),
    before: B(() => { acceptOrder('a71c8f31'); return true; }),
    marks: { dialog: '.swal2-popup', title: '.swal2-title', confirm: '.swal2-confirm', cancel: '.swal2-cancel' }
  },
  negotiate: {
    url: 'captain-orders.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, keepOverlays: true, after: 900,
    mocks: ORDERS_MOCK([ORD.o1, ORD.o3]),
    before: B(async () => { negotiateOrder('a71c8f31', 3500); await new Promise(r => setTimeout(r, 700)); const i = document.getElementById('proposed-price-input'); if (i) i.value = 4000; return !!i; }),
    marks: { dialog: '.swal2-popup', title: '.swal2-title', input: '#proposed-price-input', confirm: '.swal2-confirm', cancel: '.swal2-cancel' }
  },
  offerSentDialog: {
    url: 'captain-orders.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, keepOverlays: true, after: 1400,
    mocks: [...BASE, [/negotiate$/, { message: 'ok' }], [/api\/orders(\?|$)/, { orders: [Object.assign({}, ORD.o1, { myOffer: { proposedPrice: 4000 } }), ORD.o3] }]],
    before: B(async () => { negotiateOrder('a71c8f31', 3500); await new Promise(r => setTimeout(r, 700)); document.getElementById('proposed-price-input').value = 4000; Swal.clickConfirm(); return true; }),
    marks: { dialog: '.swal2-popup', title: '.swal2-title', withdraw: '.swal2-popup button[onclick^="withdrawNegotiation"]', ok: '.swal2-confirm' }
  },
  offerSent: {
    url: 'captain-orders.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500,
    mocks: ORDERS_MOCK([Object.assign({}, ORD.o1, { myOffer: { proposedPrice: 4000 } }), ORD.o3]),
    before: B(() => document.querySelector('button[onclick^="withdrawNegotiation"]') ? 'ok' : 'missing'),
    marks: { card: '#orders-list > div:nth-child(1) .card', withdraw: 'button[onclick^="withdrawNegotiation"]', accept: '#orders-list > div:nth-child(1) button[onclick^="acceptOrder"]' }
  },

  // ── المهام ────────────────────────────────────────────────────────────
  missionDelivery: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: MISSIONS_MOCK([M.delivery('accepted')]), before: B(() => document.querySelectorAll('#missions-container > .card').length), marks: MISSION_MARKS
  },
  pickupPhoto: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, after: 2500,
    mocks: MISSIONS_MOCK([M.delivery('accepted')], [[/upload\/proof-image/, { url: '/uploads/proof/8f31.jpg', imageUrl: '/uploads/proof/8f31.jpg' }]]),
    before: B(async () => { openPickupPhotoModal('a71c8f31'); await new Promise(r => setTimeout(r, 600)); await window.__setFile('proofFileInput', 'parcel', 900, 640); return true; }),
    marks: { modal: '#pickupPhotoModal .modal-content', title: '#pickupPhotoModalLabel', preview: '#proofPreviewImg', retake: 'button[onclick="retakeProofPhoto()"]',
      status: '#proofUploadResult', confirm: '#confirmPickupBtn' }
  },
  missionPicked: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: MISSIONS_MOCK([M.delivery('picked_up')]), before: B(() => true), marks: Object.assign({}, MISSION_MARKS, { deliver: card + ' button[onclick^="markDelivered"]' })
  },
  deliverConfirm: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, keepOverlays: true, after: 900,
    mocks: MISSIONS_MOCK([M.delivery('picked_up')]), before: B(() => { markDelivered('a71c8f31'); return true; }),
    marks: { dialog: '.swal2-popup', title: '.swal2-title', confirm: '.swal2-confirm', cancel: '.swal2-cancel' }
  },
  missionErrandQuote: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: MISSIONS_MOCK([M.errand({ quoteStatus: 'none' })]), before: B(() => true),
    marks: Object.assign({}, MISSION_MARKS, { items: card + ' div[style*="f5f3ff"]', quote: card + ' button[id^="errand-quote-btn"]' })
  },
  errandQuoteDialog: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, keepOverlays: true, after: 900,
    mocks: MISSIONS_MOCK([M.errand({ quoteStatus: 'none' })]),
    before: B(async () => { openErrandQuote('c93a6b12', '', 12000, false); await new Promise(r => setTimeout(r, 600)); const i = document.querySelector('.swal2-input'); if (i) i.value = '10500'; return !!i; }),
    marks: { dialog: '.swal2-popup', title: '.swal2-title', budget: '.swal2-html-container', input: '.swal2-input', confirm: '.swal2-confirm', cancel: '.swal2-cancel' }
  },
  missionErrandWaiting: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: MISSIONS_MOCK([M.errand({ quoteStatus: 'quoted', goodsQuote: 10500 })]), before: B(() => true),
    marks: Object.assign({}, MISSION_MARKS, { waiting: card + ' .alert-info', edit: card + ' button[onclick^="openErrandQuote"]' })
  },
  missionErrandApproved: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: MISSIONS_MOCK([M.errand({ quoteStatus: 'confirmed', goodsQuote: 10500 })]), before: B(() => true),
    marks: Object.assign({}, MISSION_MARKS, { buy: card + ' button[onclick^="openPickupPhotoModal"]' })
  },
  missionMulti: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: MISSIONS_MOCK([M.multi('accepted')]), before: B(() => true),
    marks: Object.assign({}, MISSION_MARKS, { multiBadge: card + ' .badge.bg-info', routeMap: card + ' button[onclick^="openRouteMap"]', optimize: card + ' button[onclick^="suggestRoute"]',
      stop1: card + ' .mb-3 > div.d-flex:nth-of-type(2)', stop2: card + ' .mb-3 > div.d-flex:nth-of-type(3)', stop3: card + ' .mb-3 > div.d-flex:nth-of-type(4)',
      pickBtn: card + ' button[onclick^="openPickupPhotoModal"]' })
  },
  missionMultiPicked: {
    // بعد الاستلام: «تأكيد» لكل نقطة وسطية، والأخيرة بزرّ التسليم النهائي
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: MISSIONS_MOCK([M.multi('picked_up', { stops: [Object.assign({ done: true }, ORD.o4.stops[0]), ORD.o4.stops[1], ORD.o4.stops[2]] })]), before: B(() => true),
    marks: Object.assign({}, MISSION_MARKS, { stopConfirm: card + ' button[onclick^="markStopDone"]', waitBtn: card + ' button[disabled]' })
  },
  multiRoute: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, after: 3500,
    mocks: MISSIONS_MOCK([M.multi('accepted')]),
    before: B(async () => {
      const ME_AT = { lat: 15.5965, lng: 32.5335, accuracy: 12 };
      window.WajeezGeo.getPrecise = () => Promise.resolve(ME_AT);
      // خدمة الاتجاهات: المحوّل لا يرسم مساراً — نجلب مساراً حقيقياً على الطرق من OSRM
      const gm = google.maps;
      gm.DirectionsService = function () {
        this.route = async (req) => {
          const pts = [req.origin, ...(req.waypoints || []).map(w => w.location), req.destination];
          let geo = null, legs = null;
          try {
            const u = 'https://router.project-osrm.org/route/v1/driving/' + pts.map(p => p.lng + ',' + p.lat).join(';') + '?overview=full&geometries=geojson';
            const j = await (await fetch(u)).json();
            geo = j.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            legs = j.routes[0].legs.map(l => ({ distance: { value: l.distance }, duration: { value: l.duration * 1.6 } }));
          } catch (e) {
            geo = pts.map(p => [p.lat, p.lng]);
            legs = pts.slice(1).map((p, i) => { const d = L.latLng(pts[i].lat, pts[i].lng).distanceTo(L.latLng(p.lat, p.lng)) * 1.3; return { distance: { value: d }, duration: { value: d / 6 } }; });
          }
          return { routes: [{ legs, _geo: geo }] };
        };
      };
      gm.DirectionsRenderer = function (o) {
        let line = null; const m = o && o.map && o.map._m;
        this.setMap = () => {}; this.setDirections = (r) => { if (line) line.remove(); line = L.polyline(r.routes[0]._geo, { color: '#048c5b', weight: 5, opacity: .85 }).addTo(m); m.fitBounds(line.getBounds(), { padding: [30, 30] }); };
      };
      await openRouteMap('d14f9a55');
      return document.getElementById('routeSummary').textContent.replace(/\s+/g, ' ').trim();
    }),
    marks: { modal: '#routeMapModal .modal-content', map: '#routeMapCanvas', summary: '#routeSummary', close: '#routeMapModal .btn-close, #routeMapModal [data-bs-dismiss="modal"]' }
  },
  optimizeRoute: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, keepOverlays: true, after: 1500,
    mocks: MISSIONS_MOCK([M.multi('accepted')]),
    before: B(() => { window.WajeezGeo.getPrecise = () => Promise.resolve({ lat: 15.5965, lng: 32.5335, accuracy: 12 }); suggestRoute('d14f9a55'); return true; }),
    marks: { dialog: '.swal2-popup', title: '.swal2-title', list: '.swal2-html-container', confirm: '.swal2-confirm', cancel: '.swal2-cancel' }
  },
  releaseRequest: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, keepOverlays: true, after: 900,
    mocks: MISSIONS_MOCK([M.delivery('accepted')]),
    before: B(async () => { releaseOrder('a71c8f31'); await new Promise(r => setTimeout(r, 600)); const t = document.querySelector('.swal2-textarea'); if (t) t.value = 'لستك الموتر انفجر في شارع الستين — ما بقدر أكمّل المشوار'; return !!t; }),
    marks: { dialog: '.swal2-popup', title: '.swal2-title', reason: '.swal2-textarea', confirm: '.swal2-confirm', cancel: '.swal2-cancel' }
  },
  releasePending: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: MISSIONS_MOCK([M.delivery('accepted', { releaseRequest: { status: 'pending', captain: 'u1', reason: 'لستك الموتر انفجر' } })]), before: B(() => true),
    marks: Object.assign({}, MISSION_MARKS, { pending: card + ' .alert-secondary' })
  },
  adminNudge: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500,
    mocks: MISSIONS_MOCK([M.delivery('accepted', { adminNudges: [{ to: 'captain', at: ago(3), message: 'العميلة سارة بتسأل وين وصلت — طمّنها لو سمحت' }] })]), before: B(() => true),
    marks: Object.assign({}, MISSION_MARKS, { nudge: card + ' .alert-warning', replyOnWay: card + ' .alert-warning button:nth-child(1)', replyArrived: card + ' .alert-warning button:nth-child(2)',
      replyIssue: card + ' .alert-warning button:nth-child(3)' })
  },
  nudgeReplied: {
    url: 'captain-missions.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, after: 1200,
    mocks: MISSIONS_MOCK([M.delivery('accepted', { adminNudges: [{ to: 'captain', at: ago(3), message: 'العميلة سارة بتسأل وين وصلت — طمّنها لو سمحت' }] })],
      [[/nudges\/[^/]+\/ack/, { reply: 'حاضر، في الطريق' }]]),
    before: B(async () => { const b = document.querySelector('#missions-container > .card .alert-warning button'); if (b) b.click(); await new Promise(r => setTimeout(r, 800)); return document.querySelector('#missions-container > .card .alert-success') ? 'ok' : 'missing'; }),
    marks: { reply: card + ' .alert-success' }
  },

  // ── المحادثة ──────────────────────────────────────────────────────────
  chat: {
    url: 'chat.html?orderId=a71c8f31&receiverId=c1', role: 'captain', user: CAP_USER, local: LOCAL, wait: 3000,
    mocks: [...BASE, [/api\/chat\/read/, {}],
      [/api\/chat\/a71c8f31/, { messages: [
        { _id: 'm1', sender: { _id: 'u1', name: 'محمد عبدالله' }, receiver: 'c1', text: 'السلام عليكم، أنا الكابتن محمد — استلمت طلبك من مطعم الساحة وفي الطريق ليك', createdAt: ago(9), isRead: true },
        { _id: 'm2', sender: { _id: 'c1', name: 'سارة عبدالله' }, receiver: 'u1', text: 'وعليكم السلام، تمام. البيت جنب صيدلية المشتل، البوابة الخضراء', createdAt: ago(8), isRead: true },
        { _id: 'm3', sender: { _id: 'u1', name: 'محمد عبدالله' }, receiver: 'c1', text: 'تمام، قدامي حوالي ١٠ دقايق إن شاء الله', createdAt: ago(7), isRead: true },
        { _id: 'm4', sender: { _id: 'c1', name: 'سارة عبدالله' }, receiver: 'u1', text: 'شكراً، لما توصل اتصل علي', createdAt: ago(6), isRead: true },
        { _id: 'm5', sender: { _id: 'u1', name: 'محمد عبدالله' }, receiver: 'c1', text: 'وصلت جنب الصيدلية 👍', createdAt: ago(1), isRead: false }], hasMore: false }],
      [/api\/orders\/a71c8f31/, Object.assign({}, ORD.o1, { status: 'picked_up', captain: { _id: 'u1', name: 'محمد عبدالله' } })]],
    before: B(() => { const i = document.getElementById('messageInput'); if (i) { i.disabled = false; } return document.getElementById('receiverName').textContent; }),
    marks: { header: '#receiverName', safety: '#safetyBtn', messages: '#chatContainer', input: '#messageInput', send: '#sendBtn', attach: '#attachBtn' }
  },

  // ── المحفظة ───────────────────────────────────────────────────────────
  wallet: {
    url: 'captain-wallet.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: [...BASE, [/wallet\/pay\/history/, { requests: [
        { _id: 'p1', amount: 5000, status: 'approved', transactionId: '2026092811873', createdAt: day(7) + 'T10:20:00Z' },
        { _id: 'p2', amount: 3000, status: 'rejected', transactionId: '2026091407711', adminNote: 'رقم العملية غير مطابق — أعد الإرسال', createdAt: day(21) + 'T09:00:00Z' },
        { _id: 'p3', amount: 4500, status: 'approved', transactionId: '2026090903365', createdAt: day(26) + 'T15:40:00Z' }], summary: { totalApproved: 59950 } }],
      [/wallet\/transactions/, { transactions: [
        { type: 'commission_deducted', label: 'عمولة طلب #8F31', amount: 525, balance: -1850, note: 'مطعم الساحة ← الرياض', date: ago(40) },
        { type: 'commission_deducted', label: 'عمولة طلب #6B12', amount: 375, balance: -1325, note: 'بقالة الحاج علي ← الطائف', date: ago(160) },
        { type: 'payment_approved', label: 'سداد مقبول', amount: 5000, balance: -950, note: 'إشعار 2026092811873', date: day(7) + 'T10:20:00Z' },
        { type: 'commission_deducted', label: 'عمولة طلب #9A55', amount: 975, balance: -5950, note: 'رحلة متعددة النقاط', date: day(8) + 'T18:05:00Z' }], pagination: { hasMore: true } }],
      [/captain\/wallet/, WALLET()]],
    before: B(() => document.getElementById('wBalance').textContent.trim()),
    marks: { card: '.wallet-card', balance: '#wBalance', status: '#wStatusChip', limit: '#wLimit', pct: '#wPct', bar: '.progress-track', commissions: '#wTotalDeducted',
      commissionsTile: '.stats-grid .stat-tile:nth-child(1)', paidTile: '.stats-grid .stat-tile:nth-child(2)', payBtn: '#mainPayBtn', payHistory: '#payHistoryList', txList: '#txList', loadMore: '#txLoadMoreBtn' }
  },
  walletPay: {
    url: 'captain-wallet.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, after: 1500,
    mocks: [...BASE, [/wallet\/pay\/history/, { requests: [], summary: { totalApproved: 0 } }], [/wallet\/transactions/, { transactions: [] }], [/captain\/wallet/, WALLET()]],
    before: B(async () => { openSheet(); document.getElementById('sfAmount').value = '1850'; document.getElementById('sfTransId').value = '2026100598812';
      if (typeof imageCompression === 'undefined') window.imageCompression = async (f) => f; await window.__setFile('sfFile', 'receipt', 600, 760); return true; }),
    marks: { sheet: '#paySheet .sheet', amount: '#sfAmount', txId: '#sfTransId', receipt: '#sfPreview', submit: '#sfSubmitBtn', cancel: '#paySheet button[onclick="closeSheet()"]' }
  },

  // ── السجل والتحليلات ──────────────────────────────────────────────────
  history: {
    url: 'captain-history.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: [...BASE, [/captain\/stats/, STATS()], [/captain\/trips/, { trips: [
        { _id: 'h1', createdAt: ago(40), pickup: { address: P.saha.address }, dropoff: { address: P.riyadh.address }, price: 3500, commission: 525, netProfit: 2975 },
        { _id: 'h2', createdAt: ago(160), pickup: { address: P.haj.address }, dropoff: { address: P.taif.address }, price: 2500, commission: 375, netProfit: 2125 },
        { _id: 'h3', createdAt: ago(300), pickup: { address: 'أركويت، مربع 49' }, dropoff: { address: P.mamoura.address }, price: 4000, commission: 600, netProfit: 3400 },
        { _id: 'h4', createdAt: ago(1500), pickup: { address: 'الخرطوم 2، شارع المك نمر' }, dropoff: { address: 'بري، شارع الشهيد' }, price: 3000, commission: 450, netProfit: 2550 }],
      pagination: { hasMore: false, total: 1240 } }]],
    before: B(() => true),
    marks: { totalTrips: '#totalTrips', totalEarnings: '#totalEarnings', avg: '#avgProfit', trip1: '#tripsContainer .trip', price1: '#tripsContainer .trip .m-price',
      fee1: '#tripsContainer .trip .m-fee', net1: '#tripsContainer .trip .m-net' }
  },
  analytics: {
    url: 'captain-analytics.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 3000, fullPage: true, after: 2500,
    mocks: [...BASE, [/captain\/stats/, STATS()],
      [/rating-summary/, { days: 90, totalRated: 184, positive: [{ label: 'سريع في التوصيل', count: 96 }, { label: 'محترم ولبق', count: 81 }, { label: 'حافظ على الطلب', count: 57 }, { label: 'تواصل ممتاز', count: 33 }],
        negative: [{ label: 'تأخّر شوية', count: 6 }, { label: 'ما ردّ على التلفون', count: 2 }] }],
      [/captain\/trips/, { trips: [40, 160, 300, 1500, 1700, 2900, 3100, 4400, 5900, 7300, 8800].map((m, i) => ({ _id: 't' + i, createdAt: ago(m),
        pickup: { address: [P.saha.address, P.haj.address, 'أركويت، مربع 49'][i % 3] }, dropoff: { address: [P.riyadh.address, P.taif.address, P.mamoura.address][i % 3] },
        price: [3500, 2500, 4000, 3000][i % 4], netRevenue: [2975, 2125, 3400, 2550][i % 4] })) }]],
    before: B(async () => { const b = document.querySelectorAll('.period-btn')[1]; if (b) b.click(); await new Promise(r => setTimeout(r, 600)); return document.getElementById('stat-earnings').textContent; }),
    marks: { periods: '.period-btn', today: '.period-btn:nth-child(1)', week: '.period-btn:nth-child(2)', month: '.period-btn:nth-child(3)', all: '.period-btn:nth-child(4)',
      earnings: '#stat-earnings', orders: '#stat-orders', rating: '#stat-rating', avg: '#stat-avg', chart: '#earningsChart', tags: '#tags-summary', tagsPeriod: '#tags-period', trips: '#trips-list' }
  },

  // ── الحساب والإشعارات ─────────────────────────────────────────────────
  profile: {
    url: 'captain-profile.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500,
    mocks: [...BASE, [/profile-details/, { name: 'محمد عبدالله', email: 'mohamed.abdalla@example.com', phone: '0912345678', totalOrders: 1240, totalEarnings: 412000,
      approvalStatus: 'approved', vehicleType: 'motorcycle', plateNumber: 'خ ط 4521', joinDate: '2025-11-02T10:00:00Z',
      documentsStatus: { idImage: true, selfieImage: true, driverLicense: false, vehiclePhoto: true, profilePhoto: true } }]],
    before: B(() => document.getElementById('docsStatusBadge').textContent),
    marks: { avatar: '#profileAvatar', photoBtn: '#photoBtn', name: '#name', orders: '#orders', revenue: '#revenue', phone: '#phone', email: '#email', vehicle: '#vehicle-text',
      docs: '#docsSection', docsBadge: '#docsStatusBadge', docsHint: '#docsHint', docLicense: '[data-doc="driverLicense"]', docLicenseBtn: '[data-doc="driverLicense"] button',
      share: 'button[onclick*="share" i], [onclick*="Share"]', tour: 'button[onclick*="our"]', logout: 'button[onclick*="ogout"]' }
  },
  profileFull: {
    url: 'captain-profile.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500, fullPage: true,
    mocks: [...BASE, [/profile-details/, { name: 'محمد عبدالله', email: 'mohamed.abdalla@example.com', phone: '0912345678', totalOrders: 1240, totalEarnings: 412000,
      approvalStatus: 'approved', vehicleType: 'motorcycle', plateNumber: 'خ ط 4521', joinDate: '2025-11-02T10:00:00Z',
      documentsStatus: { idImage: true, selfieImage: true, driverLicense: false, vehiclePhoto: true, profilePhoto: true } }]],
    before: B(() => document.getElementById('docsStatusBadge').textContent),
    marks: { avatar: '#profileAvatar', photoBtn: '#photoBtn', name: '#name', orders: '#orders', revenue: '#revenue', phone: '#phone', email: '#email', vehicle: '#vehicle-text',
      docs: '#docsSection', docsBadge: '#docsStatusBadge', docsHint: '#docsHint', docLicense: '[data-doc="driverLicense"]', docLicenseBtn: '[data-doc="driverLicense"] button',
      share: 'button[onclick*="share" i], [onclick*="Share"]', tour: 'button[onclick*="our"]', logout: 'button[onclick*="ogout"]' }
  },
  notifications: {
    url: 'captain-notifications.html', role: 'captain', user: CAP_USER, local: LOCAL, wait: 2500,
    mocks: [...BASE, [/api\/notifications/, { notifications: [
        { _id: 'n1', type: 'new_order', title: 'طلب جديد قريب منك', message: 'مطعم الساحة ← الرياض — 3,500 ج.س + إكرامية 1,000', isRead: false, createdAt: ago(2), url: 'captain-orders.html' },
        { _id: 'n2', type: 'negotiation_accepted', title: 'العميل وافق على عرضك', message: 'سارة عبدالله وافقت على 4,000 ج.س — الطلب صار في مهامك', isRead: false, createdAt: ago(25), url: 'captain-missions.html' },
        { _id: 'n3', type: 'errand_quote', title: 'العميل أكّد سعر البضاعة', message: 'أم أحمد أكّدت 10,500 ج.س — اشترِ الأغراض الآن', isRead: true, createdAt: ago(90), url: 'captain-missions.html' },
        { _id: 'n4', type: 'payment_approved', title: 'تم قبول إشعار السداد', message: 'أُضيف 5,000 ج.س لمحفظتك', isRead: true, createdAt: ago(60 * 26), url: 'captain-wallet.html' },
        { _id: 'n5', type: 'wallet_update', title: 'اقتربت من حدّ المديونية', message: 'رصيدك -4,100 ج.س من حدّ -5,000 — سدّد لتستمر الطلبات', isRead: true, createdAt: ago(60 * 50), url: 'captain-wallet.html' }],
      currentPage: 1, totalPages: 1 }]],
    before: B(() => document.querySelectorAll('.wn-item').length),
    marks: { header: '.app-header', toolbar: '#wnToolbar', all: '#chipAll', unread: '#chipUnread', markAll: '#markAllReadBtn', first: '.wn-item', list: '#notificationsList' }
  }
};

(async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(SHOTS);
  for (const name of only) {
    const s = SHOTS[name];
    if (!s) { console.log('?', name); continue; }
    const r = await cap.shot({ dpr: 2.5, role: 'captain', ...s, out: OUT + name + '.png' });
    const missing = r.marks ? Object.entries(r.marks).filter(([, v]) => !v).map(([k]) => k) : [];
    console.log(`${name}  info=${JSON.stringify(r.info)}  ${missing.length ? 'marks-missing=' + missing.join(',') : ''}  ${r.errs.slice(0, 3).join(' | ')}`);
  }
  await cap.close();
})();
