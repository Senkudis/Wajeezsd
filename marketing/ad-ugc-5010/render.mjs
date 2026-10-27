// node render.mjs [--still t1,t2] — يرسم طبقة الموشن (شفافة) إلى out/overlay.mov (qtrle بألفا)
import { createRequire } from 'node:module';
const puppeteer = createRequire(import.meta.url)('C:/Users/kde/Desktop/wajeezsd/node_modules/puppeteer-core');
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const FF = readFileSync('tools/ffpath.txt', 'utf8').trim().replace(/^\/c\//, 'C:/');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = 30, STILL = arg('still', null), DUR = Number(arg('dur', 0));
mkdirSync('out', { recursive: true }); mkdirSync('qc', { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('PAGE', e.message)); page.on('console', m => console.log('LOG', m.text()));
await page.goto(pathToFileURL(resolve('index.html')).href);
await page.evaluate(() => window.ready);
const shot = async (t) => Buffer.from(await page.evaluate((t) => { window.seek(t); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }, t), 'base64');
if (STILL) { for (const t of STILL.split(',').map(Number)) writeFileSync(`qc/ov_${t}.png`, await shot(t)); await browser.close(); process.exit(0); }
const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'qtrle', '-pix_fmt', 'argb', 'out/overlay.mov'], { stdio: ['pipe', 'inherit', 'inherit'] });
const total = Math.round(DUR * FPS);
for (let i = 0; i < total; i++) { const png = await shot(i / FPS); if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r)); if (i % FPS === 0) process.stdout.write(`${i / FPS}s `); }
ff.stdin.end(); await new Promise(r => ff.on('close', r)); await browser.close(); console.log('\noverlay done');
