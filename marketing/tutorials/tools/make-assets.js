/**
 * صورٌ تجريبية تُستعمل داخل اللقطات (data URI): صورة فاتورة يرسلها الكابتن في
 * المحادثة، وإشعار تحويل. تُرسم بالمتصفّح نفسه — لا صور خارجية ولا بيانات حقيقية.
 *   node tools/make-assets.js
 */
const puppeteer = require('C:/Users/kde/Desktop/wajeezsd/node_modules/puppeteer-core');
const fs = require('fs');
const OUT = __dirname + '/assets/';
fs.mkdirSync(OUT, { recursive: true });

const RECEIPT = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:P;src:url(http://localhost:4175/assets/fonts/PlexArabic-SemiBold.woff2)}
body{margin:0;width:600px;height:450px;background:radial-gradient(circle at 30% 30%,#c9a77c,#8a6a45);display:flex;align-items:center;justify-content:center;font-family:P,Tahoma}
.r{width:300px;background:#fbfaf6;padding:22px 24px;transform:rotate(-4deg);box-shadow:0 18px 40px rgba(0,0,0,.35);font-size:15px;color:#333}
h1{font-size:20px;text-align:center;margin:0 0 4px}.s{text-align:center;font-size:12px;color:#777;margin-bottom:12px}
.l{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #ccc}.t{font-size:18px;font-weight:bold;border:0;margin-top:8px}
</style></head><body><div class="r"><h1>سوبر ماركت النيل</h1><div class="s">الرياض — فاتورة رقم 4471</div>
<div class="l"><span>رغيف ×10</span><span>2,000</span></div>
<div class="l"><span>لبن 2 لتر</span><span>3,500</span></div>
<div class="l"><span>سكر 1 كيلو</span><span>2,800</span></div>
<div class="l"><span>شاي</span><span>2,200</span></div>
<div class="l t"><span>الجملة</span><span>10,500</span></div></div></body></html>`;

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 600, height: 450, deviceScaleFactor: 1 });
  await p.setContent(RECEIPT, { waitUntil: 'networkidle0' });
  await p.screenshot({ path: OUT + 'chat-receipt.jpg', type: 'jpeg', quality: 80 });
  await b.close();
  console.log('ok', fs.statSync(OUT + 'chat-receipt.jpg').size);
})();
