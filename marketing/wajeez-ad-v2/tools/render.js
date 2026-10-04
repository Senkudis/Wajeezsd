/**
 * تصيير الإعلان إطاراً إطاراً من comp/index.html (renderAt(t) حتميّة).
 *   node tools/render.js                 → كل الإطارات إلى frames/
 *   node tools/render.js preview 1.0,5.5 → إطاراتٌ معيّنة إلى scout/preview-*.jpg
 */
const puppeteer = require('C:/Users/kde/Desktop/wajeezsd/node_modules/puppeteer-core');
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const FPS = 30;
(async () => {
  const mode = process.argv[2] || 'all';
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('requestfailed', r => errs.push('failed ' + r.url().slice(-60)));
  await p.goto(require('url').pathToFileURL(path.join(ROOT, 'comp', 'index.html')).href, { waitUntil: 'networkidle0' });
  await p.waitForFunction('window.__ready === true');
  await p.evaluate(async () => { await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
  if (mode === 'preview') {
    const times = (process.argv[3] || '1,6,12,19,22,27,33,38,44').split(',').map(Number);
    for (const t of times) { await p.evaluate(t => window.renderAt(t), t); await p.screenshot({ path: path.join(ROOT, 'scout', `preview-${t}.jpg`), type: 'jpeg', quality: 85 }); }
    console.log('preview done', errs.slice(0, 5));
  } else {
    const OUT = path.join(ROOT, 'frames'); fs.mkdirSync(OUT, { recursive: true });
    const dur = await p.evaluate(() => window.DURATION);
    const n = Math.round(dur * FPS);
    const t0 = Date.now();
    // node tools/render.js range 700 940 — إعادة تصيير مقطعٍ وحده
    const from = mode === 'range' ? Number(process.argv[3]) : 0;
    const to = mode === 'range' ? Number(process.argv[4]) : n - 1;
    for (let f = from; f <= to; f++) {
      await p.evaluate(t => window.renderAt(t), f / FPS);
      await p.screenshot({ path: path.join(OUT, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 94 });
      if (f % 150 === 0) console.log(`frame ${f}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    console.log('done', n, 'frames', errs.slice(0, 5));
  }
  await b.close();
})();
