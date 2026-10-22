// يرسم ملف HTML/SVG محلياً بكروم ⇐ PNG. node tools/snap.mjs in.html out.png W H
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const puppeteer = createRequire(import.meta.url)('C:/Users/kde/Desktop/wajeezsd/node_modules/puppeteer-core');
const [, , inp, out, w = 1600, h = 900, scale = 1] = process.argv;
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h, deviceScaleFactor: +scale });
await p.goto(pathToFileURL(resolve(inp)).href, { waitUntil: 'networkidle0' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: out, omitBackground: true });
await b.close();
