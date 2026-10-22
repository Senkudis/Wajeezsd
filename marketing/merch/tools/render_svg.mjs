// node render_svg.mjs in.svg out.png widthPx [bg]   — يرسم SVG بكروم إلى PNG (شفاف إن لم تُعطَ خلفية)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const puppeteer = createRequire(import.meta.url)('C:/Users/kde/Desktop/wajeezsd/node_modules/puppeteer-core');
const [, , inp, out, w, bg] = process.argv;
const svg = readFileSync(inp, 'utf8');
const m = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
const W = Number(w), H = Math.round(W * Number(m[4]) / Number(m[3]));
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await p.setContent(`<html><body style="margin:0;background:${bg || 'transparent'}">${svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${W}" height="${H}"`)}</body></html>`);
await p.screenshot({ path: out, omitBackground: !bg, clip: { x: 0, y: 0, width: W, height: H } });
await b.close();
console.log('rendered', out, W + 'x' + H);
