#!/usr/bin/env node
/**
 * 📱 لقطات شاشة App Store بمقاس iPhone 6.9 بوصة (1290×2796).
 *
 * لماذا سكربت: Apple تطلب مقاساً بالبكسل بالضبط، ولقطة واحدة خاطئة المقاس تُعيد
 * النموذج كله. المقاس هنا = 430×932 نقطة × كثافة 3 = 1290×2796 تماماً، وهو نفس
 * ما يعطيه iPhone 16 Pro Max. يعمل من ويندوز بـ Chrome المثبَّت (لا يحمّل متصفحاً).
 *
 * ⚠️ لا يلتقط من https://wajeezsd.com: النطاق يخدم **صفحة الهبوط** التسويقية التي
 * تحوي زر "Google Play"، وApple ترفض أي لقطة تشير إلى متجر منافس. فنخدم
 * public_html محلياً (وهو نفس ما يُحزَم في التطبيق) ونوجّه نداءات الـ API للإنتاج
 * عبر بذر window.API_CONFIG قبل تحميل js/config.js.
 *
 * الاستخدام:
 *   node scripts/gen-ios-screenshots.js                     → الشاشات العامة فقط
 *   REVIEW_PHONE=09xx REVIEW_PASSWORD=xxx node scripts/gen-ios-screenshots.js
 *                                                           → + شاشات العميل المحمية
 *
 * متغيّرات اختيارية:
 *   CHROME_PATH   مسار chrome.exe إن لم يكن في مكانه المعتاد
 *   REVIEW_PHONE / REVIEW_PASSWORD  حساب عميل (انظر scripts/create-review-accounts.js)
 *
 * المخرجات: resources/ios/screenshots/NN-الاسم.png
 *
 * ملاحظة: اللقطات من متصفح لا من محاكي iOS، فلا يظهر شريط حالة iPhone — وهذا
 * مقبول (Apple لا تشترط إطار الجهاز). لا تُضف إطاراً مزيّفاً؛ إيهام واجهة نظام
 * غير حقيقية سبب رفض.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'public_html');
const OUT_DIR = path.join(ROOT, 'resources', 'ios', 'screenshots');

const API = 'https://wajeezsd.com';
// المنفذ 3000 مدرَج في approvedOrigins داخل index.js، فتمرّ نداءات الـ API وSocket.io
const PORT = Number(process.env.SHOT_PORT || 3000);

// 430×932 @3x = 1290×2796 — مقاس App Store لشاشة 6.9 بوصة
const VIEWPORT = { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome'
].filter(Boolean);

function findChrome() {
    for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
    throw new Error('لم يُعثر على Chrome. اضبط CHROME_PATH=مسار chrome.exe وأعد المحاولة.');
}

/** تسجيل دخول عبر الـ API مباشرة — أسرع وأثبت من ملء النموذج */
async function login() {
    const phone = process.env.REVIEW_PHONE;
    const password = process.env.REVIEW_PASSWORD;
    if (!phone || !password) return null;

    const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: phone, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        console.warn(`⚠️  فشل تسجيل الدخول (${res.status}): ${data.message || 'خطأ غير معروف'}`);
        console.warn('    ستُلتقط الشاشات العامة فقط.');
        return null;
    }
    console.log(`✓ سجّل الدخول: ${data.user?.name} (${data.user?.role})`);
    return { token: data.token, user: data.user };
}

/** معرّف متجر حقيقي لصفحة تفاصيل المتجر — الاسم والصور تأتي من الإنتاج */
async function firstPlaceId() {
    try {
        const res = await fetch(`${API}/api/places`);
        const list = await res.json();
        const withImage = Array.isArray(list) && (list.find((p) => p.image_url) || list[0]);
        return withImage?._id || null;
    } catch (_) {
        return null;
    }
}

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const executablePath = findChrome();
    const session = await login();
    const placeId = await firstPlaceId();

    const SHOTS = [
        { file: '01-الرئيسية', url: 'index.html', auth: false, wait: 4500 },
        { file: '02-إنشاء-طلب', url: 'client-order.html', auth: true, wait: 5000 },
        { file: '03-المتاجر', url: placeId ? `shop-detail.html?id=${placeId}` : null, auth: false, wait: 4000 },
        { file: '04-طلباتي', url: 'client-my-orders.html', auth: true, wait: 4000 },
        { file: '05-العناوين-المحفوظة', url: 'index.html#saved', auth: true, wait: 4000 }
    ];

    // خدمة الواجهة محلياً — نفس ملفات public_html التي تُحزَم في التطبيق
    const app = express();
    app.use(express.static(WEB_DIR, { extensions: ['html'] }));
    const server = await new Promise((resolve, reject) => {
        const s = app.listen(PORT, '127.0.0.1', () => resolve(s));
        s.on('error', reject);
    });
    const BASE = `http://localhost:${PORT}`;
    console.log(`🌐 الواجهة محلياً: ${BASE}  →  API: ${API}`);

    const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--lang=ar', '--font-render-hinting=none', '--hide-scrollbars']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport(VIEWPORT);
        await page.emulateTimezone('Africa/Khartoum');

        // بذر ما قبل تحميل أي سكربت في الصفحة:
        //  • API_CONFIG مُعيَّن مسبقاً ⇒ js/config.js يتخطّى كتلته الشرطية فلا يوجّه
        //    الطلبات إلى localhost:3000 (وهو خادم اللقطات لا السيرفر الحقيقي)
        //  • كتم شاشة الترحيب، وإلا ظهرت نافذة onboarding فوق أول لقطة
        await page.evaluateOnNewDocument((s, api) => {
            window.API_CONFIG = { production: api, development: api, baseURL: api };
            window.API_URL = api;
            localStorage.setItem('wajeezsd_onboarding_shown', 'true');
            // بلا مدينة محفوظة تحجب شاشة "اختر مدينتك" كل شيء خلفها
            localStorage.setItem('selected_city', 'Khartoum');
            if (!s) return;
            localStorage.setItem('token', s.token);
            localStorage.setItem('user', JSON.stringify(s.user));
            localStorage.setItem('userId', s.user._id);
            localStorage.setItem('role', s.user.role);
            localStorage.setItem('userName', s.user.name);
        }, session, API);

        let taken = 0;
        for (const shot of SHOTS) {
            if (!shot.url) {
                console.log(`  ⏭️  ${shot.file} — تعذّر جلب معرّف متجر (تخطّي)`);
                continue;
            }
            if (shot.auth && !session) {
                console.log(`  ⏭️  ${shot.file} — يحتاج تسجيل دخول (تخطّي)`);
                continue;
            }
            try {
                await page.goto(`${BASE}/${shot.url}`, { waitUntil: 'networkidle2', timeout: 45000 });
            } catch (_) {
                // networkidle2 لا يتحقق مع socket.io المفتوح دائماً — نكمل بعد المهلة
                console.log(`  ⏳ ${shot.file} — لم تهدأ الشبكة (socket مفتوح)، نكمل`);
            }
            await new Promise((r) => setTimeout(r, shot.wait));

            const out = path.join(OUT_DIR, `${shot.file}.png`);
            await page.screenshot({ path: out, fullPage: false });

            const buf = fs.readFileSync(out);
            const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
            const ok = w === 1290 && h === 2796;
            console.log(`  ${ok ? '✅' : '❌'} ${shot.file}.png — ${w}×${h}`);
            if (ok) taken++;
        }

        console.log(`\n📸 ${taken} لقطة بالمقاس الصحيح في resources/ios/screenshots/`);
        if (!session) {
            console.log('💡 لشاشات العميل: REVIEW_PHONE و REVIEW_PASSWORD ثم أعد التشغيل.');
        }
    } finally {
        await browser.close();
        server.close();
    }
})().catch((err) => {
    console.error('❌ فشل:', err.message);
    process.exit(1);
});
