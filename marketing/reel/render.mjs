// node render.mjs --fps 30 --dur 15 --sub 2 [--from a --to b] [--still t1,t2,...]
// نسخة motion-reel/render.mjs بـ puppeteer-core وكروم المثبّت و ffmpeg من imageio
// (لا تنزيل لـ playwright). العقد نفسه: window.seek(t) يرسم الإطار.
import { createRequire } from 'node:module';
const puppeteer = createRequire(import.meta.url)('C:/Users/kde/Desktop/wajeezsd/node_modules/puppeteer-core');
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const FPS = Number(arg('fps', 30)), DUR = Number(arg('dur', 15)), SUB = Number(arg('sub', 2));
const STILL = arg('still', null);
const FF = execFileSync('python', ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())']).toString().trim();
mkdirSync('out', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--allow-file-access-from-files', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('PAGE', e.message));
await page.goto(pathToFileURL(resolve('index.html')).href);
await page.evaluate(() => window.ready);
const shot = async (t) => {
  const b64 = await page.evaluate((t) => { window.seek(t); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, t);
  return Buffer.from(b64, 'base64');
};

if (STILL) {
  for (const t of STILL.split(',').map(Number)) writeFileSync(`out/still_${t}.png`, await shot(t));
  await browser.close(); console.log('stills done'); process.exit(0);
}

const vf = SUB > 1 ? `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB` : 'null';
const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
  '-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', 'out/silent.mp4'],
  { stdio: ['pipe', 'inherit', 'inherit'] });
const total = Math.round(DUR * FPS * SUB);
for (let i = 0; i < total; i++) {
  const png = await shot(i / (FPS * SUB));
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % (FPS * SUB) === 0) console.log(`rendered ${i / (FPS * SUB)}s / ${DUR}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('done -> out/silent.mp4');
