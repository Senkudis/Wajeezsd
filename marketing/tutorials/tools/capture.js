/**
 * التقاط شاشات التطبيق الحقيقية لإعلان وجيز.
 * كل شاشة: صفحةٌ من public_html تعمل بكودها الحقيقي، والخادم محاكى
 * (mocks) ببياناتٍ واقعية، والخرائط OpenStreetMap عبر محوّل Leaflet.
 *
 *   const cap = require('./capture');
 *   await cap.shot({ url, role, mocks: [[/regex/, body, status]], before: fn, out, w, h, dpr, dark });
 */
const puppeteer = require('C:/Users/kde/Desktop/wajeezsd/node_modules/puppeteer-core');
// خادم الصفحات الثابتة (public_html) — .claude/launch.json → static-public-4175
const PORT = process.env.STATIC_PORT || '4175';
const BASE = `http://localhost:${PORT}/`;
const fs = require('fs');
const path = require('path');

const LEAFLET_JS = fs.readFileSync(path.join(__dirname, 'leaflet.js'), 'utf8');
const LEAFLET_CSS = fs.readFileSync(path.join(__dirname, 'leaflet.css'), 'utf8');
const ADAPTER = fs.readFileSync(path.join(__dirname, 'gmaps-leaflet.js'), 'utf8');

const tok = (role, id = 'u1') => Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64') + '.' +
  Buffer.from(JSON.stringify({ id, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64') + '.s';

let browser = null;
async function getBrowser() {
  if (!browser) browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--hide-scrollbars'] });
  return browser;
}

async function shot(o) {
  const b = await getBrowser();
  const p = await b.newPage();
  await p.setViewport({ width: o.w || 390, height: o.h || 844, deviceScaleFactor: o.dpr || 3, isMobile: true, hasTouch: true });
  if (o.virtualTime) {
    // ⏱️ ساعةٌ يتحكّم بها الالتقاط: الحركة في الصفحة (MarkerMotion، Leaflet،
    //    النبض) تتقدّم بإطاراتٍ مضبوطة 30/ث — كل لقطةٍ في لحظتها بالضبط
    await p.evaluateOnNewDocument(() => {
      let vt = 1000; let q = [];
      const realNow = performance.now.bind(performance);
      performance.now = () => vt;
      window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
      window.cancelAnimationFrame = () => {};
      window.__advance = (ms, step) => {
        step = step || (1000 / 30);
        const end = vt + ms;
        while (vt < end - 1e-6) { vt = Math.min(end, vt + step); const run = q; q = []; run.forEach(f => { try { f(vt); } catch (e) {} }); }
        return vt;
      };
      window.__realNow = realNow;
    });
  }
  await p.evaluateOnNewDocument((t, role, dark, user, LJS, LCSS, ADP, withMaps, session, local) => {
    Object.entries(session || {}).forEach(([k, v]) => sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));
    localStorage.setItem('token', t); localStorage.setItem('merchantToken', t); localStorage.setItem('captainToken', t);
    localStorage.setItem('adminToken', t);
    localStorage.setItem('userId', user._id);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('wajeezsd_theme', dark ? 'dark' : 'light');
    localStorage.setItem('selected_city', 'Khartoum');
    localStorage.setItem('home_city', 'Khartoum');
    // حالة محفوظة خاصّة باللقطة (null = حذف): شاشة اختيار المدينة الأولى مثلاً
    Object.entries(local || {}).forEach(([k, v]) => { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); });
    const _gi = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) { if (/^wajeez_tour_done_|coach/i.test(String(k))) return '1'; return _gi.call(this, k); };
    // المقبس: يحفظ المستمعين في __h ليُطلق الالتقاطُ الأحداث (موقع الكابتن…)
    window.__h = {};
    window.io = function () { const s = { on(e, f) { (window.__h[e] = window.__h[e] || []).push(f); return s; }, emit() {}, off() {}, connected: true, disconnect() {} }; return s; };
    // الخرائط تُحقن في رأس الصفحة عند تقديمها (انظر المعترض أدناه) — هنا
    // لم يُنشأ document.documentElement بعد فيفشل Leaflet عند تحميله
  }, tok(o.role || 'client'), o.role || 'client', !!o.dark,
     Object.assign({ _id: 'u1', id: 'u1', name: 'أحمد محمد', role: o.role || 'client', phone: '249912345678', city: 'Khartoum' }, o.user || {}),
     LEAFLET_JS, LEAFLET_CSS, ADAPTER, o.maps !== false, o.maps !== false ? { gmapsKey: 'leaflet-demo', ...(o.session || {}) } : (o.session || null), o.local || null);
  await p.setRequestInterception(true);
  const seen = [];
  p.on('request', r => {
    const u = r.url();
    // 🗺️ الصفحة نفسها: Leaflet ومحوّل google.maps أوّلَ رأسها، قبل سكربتاتها
    if (o.maps !== false && r.resourceType() === 'document' && u.startsWith(BASE)) {
      const rel = decodeURIComponent(new URL(u).pathname.replace(/^\//, '')) || 'index.html';
      const file = path.join('C:/Users/kde/Desktop/wajeezsd/public_html', rel);
      if (fs.existsSync(file)) {
        const html = fs.readFileSync(file, 'utf8').replace(/<head([^>]*)>/i, (m) => m +
          '<style>' + LEAFLET_CSS + '</style><script>' + LEAFLET_JS + '</script><script>' + ADAPTER + '</script>');
        return r.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      }
    }
    // مكتبة socket.io الحقيقية تطمس مقبسنا المحاكى — تُستبدل بملفٍّ فارغ
    if (/socket\.io\.min\.js/.test(u)) return r.respond({ status: 200, contentType: 'application/javascript', body: '/* stub */' });
    if (!/localhost:3000|wajeezsd\.com\/api/.test(u)) return r.continue();
    const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: H, body: '' });
    seen.push(r.method() + ' ' + u.replace(/^https?:\/\/[^/]+/, ''));
    for (const [re, body, status] of (o.mocks || [])) {
      if (re.test(u)) return r.respond({ status: status || 200, headers: H, contentType: 'application/json', body: JSON.stringify(typeof body === 'function' ? body(u, r) : body) });
    }
    return r.respond({ status: 200, headers: H, contentType: 'application/json', body: o.fallback || '[]' });
  });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.split('\n')[0].slice(0, 160)));
  await p.goto(BASE + o.url, { waitUntil: 'networkidle2', timeout: 45000 }).catch(e => errs.push('nav ' + e.message));
  await new Promise(r => setTimeout(r, o.wait || 1500));
  // لا نوافذ ولا جولات فوق اللقطة (إلا إن طلبت اللقطة إبقاءها)
  if (!o.keepOverlays) await p.evaluate(() => {
    document.querySelectorAll('.swal2-container').forEach(e => e.remove());
    document.body.classList.remove('swal2-shown', 'swal2-height-auto');
    document.querySelectorAll('[class*="tour"],[id*="tour"],[class*="coach"],.install-prompt,#installPrompt').forEach(e => { if (getComputedStyle(e).position === 'fixed') e.remove(); });
    // زرّ الوضع الليلي العائم، ورسائل النظام العابرة (تفعيل الموقع…) — ليست من التجربة
    document.querySelectorAll('.theme-toggle').forEach(e => e.remove());
    document.querySelectorAll('body *').forEach(e => {
      const cs = getComputedStyle(e);
      if ((cs.position === 'fixed' || cs.position === 'absolute') && /فعّل خدمة الموقع|فعل خدمة الموقع|إذن الموقع|خدمة الموقع/.test(e.textContent || '') && (e.textContent || '').length < 80) e.remove();
    });
  }).catch(() => {});
  let info = null;
  if (o.before) { info = await p.evaluate(o.before).catch(e => 'before-error: ' + e.message); await new Promise(r => setTimeout(r, o.after || 700)); }
  // 📍 مواضع العناصر المهمّة (بإحداثيات الصفحة بالبكسل المنطقي) — عليها تقع
  //    النقرات والإبرازات في الفيديو بالضبط، لا بتخمين الإحداثيات
  let marks = null;
  const measure = async () => {
    if (!o.marks) return null;
    return p.evaluate((m) => {
      const out = {};
      for (const [k, sel] of Object.entries(m)) {
        const el = typeof sel === 'string' ? document.querySelector(sel) : null;
        if (!el) { out[k] = null; continue; }
        const r = el.getBoundingClientRect();
        out[k] = { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
      }
      return out;
    }, o.marks).catch(e => ({ error: e.message }));
  };
  // الصفحة الطويلة تُخفى أشرطتها الثابتة قبل القياس، فإخفاؤها يزيح المحتوى
  if (!(o.out && o.fullPage && !o.selector)) marks = await measure();
  if (o.out) {
    if (o.selector) {
      // لقطة عنصر: الأشرطة المثبّتة (ترويسة، تبويبات) تعلو العنصر في الصورة — تُخفى
      await p.evaluate(() => document.querySelectorAll('body *').forEach(e => { const ps = getComputedStyle(e).position; if (ps === 'sticky' || ps === 'fixed') e.style.visibility = 'hidden'; }));
      const el = await p.$(o.selector); if (el) await el.screenshot({ path: o.out });
    }
    else {
      // الصفحة كاملة: العناصر الثابتة (الشريط السفلي) تُرسم في منتصف الصورة الطويلة — تُخفى
      if (o.fullPage) await p.evaluate(() => document.querySelectorAll('body *').forEach(e => { const ps = getComputedStyle(e).position; const cn = String(e.className || ''); if (ps === 'fixed' || ps === 'sticky' || /mobile-nav|bottom-nav|bottomNav/.test(cn)) e.style.setProperty('display', 'none', 'important'); }));
      if (o.fullPage) marks = await measure();
      await p.screenshot({ path: o.out, fullPage: !!o.fullPage });
    }
  }
  if (o.out) {
    const dims = await p.evaluate(() => ({ w: innerWidth, h: innerHeight, docH: document.documentElement.scrollHeight })).catch(() => null);
    fs.writeFileSync(o.out.replace(/\.png$/, '.json'), JSON.stringify({ marks, dims, fullPage: !!o.fullPage }, null, 1));
  }
  const res = { url: o.url, errs, info, marks, seen: o.logRequests ? seen : undefined };
  if (!o.keep) await p.close(); else res.page = p;
  return res;
}

async function close() { if (browser) await browser.close(); browser = null; }
module.exports = { shot, close, tok };
