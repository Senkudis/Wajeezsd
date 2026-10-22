// node shot_html.mjs page.html out.png width height [transparent]
// لقطة لصفحة HTML محلية بكروم (يشكّل العربي صحيحاً، بخلاف PIL هنا بلا raqm)
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const puppeteer = createRequire(import.meta.url)('C:/Users/kde/Desktop/wajeezsd/node_modules/puppeteer-core');
const [, , page, out, w, h, transparent] = process.argv;
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--allow-file-access-from-files'] });
const p = await b.newPage();
await p.setViewport({ width: Number(w), height: Number(h) });
await p.goto(pathToFileURL(resolve(page)).href);
await p.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 400));
await p.screenshot({ path: out, omitBackground: !!transparent });
await b.close();
console.log('shot', out);
