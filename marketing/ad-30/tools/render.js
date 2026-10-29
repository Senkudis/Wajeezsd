/**
 * يصيّر comp/index.html (seek(t) نقيّة) إلى صور أو فيديو — بنية render.mjs في مهارة
 * explainer-default، بـ puppeteer-core ومتصفّح Chrome المثبّت بدل Playwright.
 *
 *   node tools/render.js stills out.png 0.5,1.2,3          ورقة لقطات (3 في الصف)
 *   node tools/render.js video out.mp4 [fps=30] [sub=1] [workers=4] [from=0] [to=dur]
 */
const puppeteer = require('C:/Users/kde/Desktop/wajeezsd/node_modules/puppeteer-core');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const [, , mode, out, a3, a4, a5, a6, a7] = process.argv;
const PAGE = 'file:///' + path.resolve(__dirname, '..', 'comp', 'index.html').replace(/\\/g, '/') + '?render' + (process.env.AR === '916' ? '&ar=916' : '');
const VW = process.env.AR === '916' ? 1080 : 1920, VH = process.env.AR === '916' ? 1920 : 1080;
const FFMPEG = 'C:/Users/kde/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe';
const run = (args) => new Promise((res, rej) => { const p = spawn(FFMPEG, args, { stdio: 'inherit' }); p.on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res()); });

async function open(browser) {
  const p = await browser.newPage();
  await p.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.warn('pageerror:', e.message.split('\n')[0]));
  await p.goto(PAGE, { waitUntil: 'load' });
  await p.waitForFunction(() => window.READY === true, { timeout: 120000 });
  const bad = await p.evaluate(() => [...document.fonts].filter(f => f.status !== 'loaded').map(f => f.family));
  if (bad.length) console.warn('WARNING fonts not loaded:', bad.join(', '));
  return p;
}
const shot = async (p, t) => { await p.evaluate(t => window.seek(t), t); return p.screenshot({ type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: VW, height: VH } }); };

(async () => {
  // متصفّحٌ لكل عامل: الصفحات الخلفية في متصفّحٍ واحد تُخنق فتتعلّق لقطاتها
  const launch = () => puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', protocolTimeout: 300000,
    args: ['--allow-file-access-from-files', '--hide-scrollbars', '--force-color-profile=srgb', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const browser = await launch();
  if (mode === 'stills') {
    const p = await open(browser);
    const times = a3.split(',').map(Number), dir = out + '.frames';
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < times.length; i++) fs.writeFileSync(`${dir}/${String(i).padStart(3, '0')}.jpg`, await shot(p, times[i]));
    await browser.close();
    if (times.length === 1) { fs.copyFileSync(`${dir}/000.jpg`, out.replace(/\.png$/, '.jpg')); }
    const cols = Math.min(3, times.length), rows = Math.ceil(times.length / cols);
    await run(['-v', 'error', '-y', '-framerate', '1', '-i', `${dir}/%03d.jpg`, '-vf', `scale=${VW > VH ? 960 : 540}:-1,tile=${cols}x${rows}:padding=6:color=gray`, '-frames:v', '1', out]);
    console.log('stills ->', out); return;
  }
  const fps = +(a3 || 30), sub = Math.max(1, +(a4 || 1)), workers = Math.max(1, +(a5 || 4));
  const T0 = +(a6 || 0), T1 = +(a7 || 30), N = Math.round((T1 - T0) * fps);
  const base = out.replace(/\.mp4$/, ''), vf = sub > 1 ? ['-vf', `tmix=frames=${sub},select='eq(mod(n\\,${sub})\\,${sub - 1})',setpts=N/(${fps}*TB)`] : [];
  const per = Math.ceil(N / workers), segs = []; const t0 = Date.now(); let done = 0;
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const a = w * per, b = Math.min(N, a + per); if (a >= b) return;
    const s = `${base}_seg${w}.mp4`; segs[w] = s;
    const wb = await launch(); const p = await open(wb);
    const ff = spawn(FFMPEG, ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps * sub), '-i', '-', ...vf,
      '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'medium', s], { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise(r => ff.on('close', r));
    for (let f = a; f < b; f++) {
      for (let k = 0; k < sub; k++) {
        const buf = await shot(p, T0 + (f + (sub > 1 ? (k / sub) * 0.5 : 0)) / fps);
        if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      }
      if (++done % 60 === 0) console.log(`${done}/${N} frames ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end(); await closed; await wb.close();
  }));
  const list = base + '_segs.txt';
  fs.writeFileSync(list, segs.filter(Boolean).map(s => `file '${path.resolve(s).replace(/\\/g, '/')}'`).join('\n'));
  await run(['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  segs.filter(Boolean).forEach(s => fs.unlinkSync(s)); fs.unlinkSync(list);
  console.log(`video -> ${out} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  await browser.close();
})();
