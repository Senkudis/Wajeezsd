/**
 * 🏪 روابط المحالّ من خرائط جوجل — «رابط النقطة يشتغل ورابط المحل لا».
 *
 * ثلاث طبقاتٍ كان كلٌّ منها يُسقط رابط المحل:
 *
 *   ١. **المتصفّح لم يُرسله للخادم أصلاً.** بطاقة مشاركة المحل تُنسخ
 *      «الاسم ⏎ العنوان ⏎ الرابط»، والحقل سطرٌ واحد يُلصقها متلاصقة، فلا
 *      يبدأ النصّ بـ https:// — isShortLink = false، فرسالة «لم نجد
 *      إحداثيات» دون أيّ طلب. مشاركة الدبوس رابطٌ وحده فتعمل.
 *
 *   ٢. **والخادم لم يكن ليجده.** رابط المحل يُحوِّل إلى
 *      /maps/place/الاسم/data=!4m2!3m1!1s0x…:0x… — بلا إحداثيات. وصفحة جوجل
 *      تُرسَم في المتصفّح: قيس على ثلاثة أشكالٍ لرابط محلٍّ واحد فأعادت
 *      للخادم **مركز الخريطة الافتراضيّ** نفسه في أم درمان، بعيداً عن المحل.
 *      فالحلّ Places API بمعرّفات الرابط، ومطابقة CID (نصف ftid الثاني)
 *      مع googleMapsUri لكل نتيجة — فيُعرف المحلّ عينه لا شبيهه.
 *
 *   ٣. **وفي صفحة المتجر** كان الرابط يكتب الإحداثيات في حقلين مخفيّين
 *      فقط: لا سعر توصيل، ولا عنوان جديد، ولا ملخّص — انظر آخر الملف.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const M = require('../public_html/js/maps-link');

// المحلّ الحقيقيّ الذي قيست عليه ردود جوجل (فندق كورنثيا، شارع النيل)
const REAL = {
    lat: 15.6065049, lng: 32.5135774,
    ftid: '0x168e8e74a47c334b:0xb1ecfdd0d9fde7ae',
    cid: '12820901312669280174',
    placeId: 'ChIJSzN8pHSOjhYRruf92dD97LE'
};
// ما كانت صفحة جوجل تُعيده للخادم لكل رابط محلّ: مركز الخريطة الافتراضيّ
const FAKE_VIEWPORT = { lat: 15.6434432, lng: 32.505856 };

// ─── ١. المحلّل ───────────────────────────────────────────────────────────
describe('📋 بطاقة المشاركة — الرابط مدفونٌ بعد الاسم والعنوان', () => {
    const card = 'Corinthia Hotel\nNile St, Khartoum, Sudan\nhttps://maps.app.goo.gl/AbCdEf123';
    // ما يصير إليه اللصق في حقلٍ من سطرٍ واحد: الأسطر تلتصق
    const glued = card.replace(/\n/g, '');

    it('🔴 كان يُرفض قبل أن يصل الخادم — isShortLink على النصّ الملتصق', () => {
        expect(M.extractUrl(glued)).toBe('https://maps.app.goo.gl/AbCdEf123');
        expect(M.isShortLink(glued)).toBe(true);
        expect(M.needsServer(glued)).toBe(true);
    });

    it('والاسم والعنوان يبقيان دليلاً للبحث', () => {
        expect(M.shareHint(card)).toBe('Corinthia Hotel Nile St, Khartoum, Sudan');
    });

    it('ورابطٌ بلا بروتوكول يُقبل', () => {
        expect(M.extractUrl('افتح maps.app.goo.gl/AbCd')).toBe('https://maps.app.goo.gl/AbCd');
    });
});

describe('🧭 أشكالٌ جديدة تحمل إحداثياتها', () => {
    const cases = [
        ['/search/ بعلامة +', 'https://www.google.com/maps/search/15.583469,+32.531042?entry=tts', 15.583469, 32.531042],
        ['/place/ بإحداثيات', 'https://www.google.com/maps/place/15.583469,32.531042/@15.5,32.5,17z', 15.583469, 32.531042],
        ['درجات خام', '15°35\'10.2"N 32°31\'55.1"E', 15.5861667, 32.5319722],
        ['اتجاهات: الوجهة آخر نقطة', 'https://www.google.com/maps/dir/15.1,32.1/15.62,32.55/@15.3,32.3,12z', 15.62, 32.55],
        ['واتساب %2C', 'https://maps.google.com/maps?q=15.61%2C32.54&z=17', 15.61, 32.54],
        ['Waze', 'https://ul.waze.com/ul?ll=15.61%2C32.54&navigate=yes', 15.61, 32.54],
        ['Apple', 'https://maps.apple.com/?ll=15.61,32.54&q=Home', 15.61, 32.54],
    ];
    for (const [label, url, lat, lng] of cases) {
        it(label, () => {
            const r = M.parse(url);
            expect(r, url).toBeTruthy();
            expect(r.lat).toBeCloseTo(lat, 5);
            expect(r.lng).toBeCloseTo(lng, 5);
        });
    }

    it('🔑 الدبوس بالدرجات المُرمَّزة يسبق @ الكاميرا في الأصل', () => {
        // الحلقة الخارجية هي النمط: الكاميرا ظاهرةٌ في الأصل والدبوس لا يظهر
        // إلا بعد الفكّ — ولو جُرّب الأصل بكل الأنماط أولاً لفازت الكاميرا
        const r = M.parse("https://www.google.com/maps/place/15%C2%B035'10.2%22N+32%C2%B031'55.1%22E/@15.5,32.5,17z");
        expect(r.lat).toBeCloseTo(15.5861667, 6);
        expect(r.lng).toBeCloseTo(32.5319722, 6);
    });

    it('و %% مفردةٌ في نصٍّ طويل لا تُسقط الفكّ كلّه', () => {
        expect(M.parse('خصم 50% https://maps.google.com/maps?q=15.61%2C32.54')).toBeTruthy();
    });
});

describe('🏪 placeRef — مرجع المحلّ في رابطٍ بلا إحداثيات', () => {
    it('رابط المشاركة بعد الفكّ: اسمٌ و ftid ← CID', () => {
        const r = M.placeRef(`https://www.google.com/maps/place/Corinthia+Hotel/data=!4m2!3m1!1s${REAL.ftid}?utm_source=mstt_1`);
        expect(r.name).toBe('Corinthia Hotel');
        expect(r.cid).toBe(REAL.cid);
    });

    it('?cid= وحده', () => {
        expect(M.placeRef(`https://maps.google.com/?cid=${REAL.cid}`).cid).toBe(REAL.cid);
    });

    it('?q=الاسم&ftid=', () => {
        const r = M.placeRef(`https://www.google.com/maps?q=Corinthia+Hotel&ftid=${REAL.ftid}`);
        expect(r.name).toBe('Corinthia Hotel');
        expect(r.cid).toBe(REAL.cid);
    });

    it('!19s معرّف Places — أدقّها', () => {
        const r = M.placeRef(`https://www.google.com/maps/place/X/data=!4m7!3m6!1s${REAL.ftid}!19s${REAL.placeId}`);
        expect(r.placeId).toBe(REAL.placeId);
    });

    it('query_place_id في روابط Maps URLs', () => {
        expect(M.placeRef(`https://www.google.com/maps/search/?api=1&query=X&query_place_id=${REAL.placeId}`).placeId)
            .toBe(REAL.placeId);
    });

    it('اسمٌ عربيّ مُرمَّز يُفكّ', () => {
        const r = M.placeRef('https://www.google.com/maps/place/%D9%85%D8%AE%D8%A8%D8%B2+%D8%A7%D9%84%D8%A3%D9%85%D9%8A%D9%86/');
        expect(r.name).toBe('مخبز الأمين');
    });

    it('رابط دبوسٍ بإحداثيات ليس محلاً', () => {
        expect(M.placeRef('https://www.google.com/maps/place/15.58,32.53')).toBeNull();
    });

    it('🔒 ولا يُطلق بحثاً مدفوعاً لمضيفٍ خارج قائمة جوجل', () => {
        expect(M.placeRef('https://evil.example/maps/place/X?cid=123456')).toBeNull();
        expect(M.placeRef('https://google.com.evil.example/maps/place/X')).toBeNull();
    });

    it('hexToDec يطابق BigInt، وله بديلٌ حيث لا BigInt', () => {
        expect(M.hexToDec('0xb1ecfdd0d9fde7ae')).toBe(REAL.cid);
        const B = global.BigInt;
        try { global.BigInt = undefined; expect(M.hexToDec('0xb1ecfdd0d9fde7ae')).toBe(REAL.cid); }
        finally { global.BigInt = B; }
    });
});

// ─── ٢. Places API — بردودٍ بشكل الـ API الحقيقيّ ────────────────────────
//
// ⚠️ مفتاح Places غير موجود في .env المحليّ، فلم يُجرَّب نداءٌ حقيقيّ. هذه
//    الردود بالشكل الموثّق لـ Places API (New): googleMapsUri بـ ?cid=…

function stubModule(rel, exportsObj) {
    const p = require.resolve(rel);
    const prev = require.cache[p];
    require.cache[p] = { id: p, filename: p, loaded: true, exports: exportsObj };
    return () => { if (prev) require.cache[p] = prev; else delete require.cache[p]; };
}
function forget(rel) { delete require.cache[require.resolve(rel)]; }

const place = (name, lat, lng, cid, id = 'ChIJx') => ({
    id, displayName: { text: name }, formattedAddress: `${name}، الخرطوم، السودان`,
    location: { latitude: lat, longitude: lng },
    googleMapsUri: `https://maps.google.com/?cid=${cid}`
});

let calls = [];
let placesReply = null;
const realFetch = global.fetch;
const savedKey = process.env.GOOGLE_PLACES_API_KEY;
let restoreCache;

beforeAll(() => {
    // الكاش في القاعدة — لا قاعدة هنا، فنُعطيه نموذجاً فارغاً لا ينتظر اتصالاً
    restoreCache = stubModule('../models/PlaceSearchCache', {
        findOne: () => ({ lean: async () => null }),
        updateOne: async () => ({})
    });
    forget('../utils/placesSearch');
    global.fetch = async (url, opts = {}) => {
        calls.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null });
        const r = typeof placesReply === 'function' ? placesReply(String(url)) : placesReply;
        return { ok: true, status: 200, json: async () => r };
    };
});
afterAll(() => {
    global.fetch = realFetch;
    if (savedKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = savedKey;
    restoreCache();
    forget('../utils/placesSearch');
});
beforeEach(() => {
    calls = []; placesReply = null; process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    // النتائج الدقيقة تُخزَّن في ذاكرة الوحدة (سلوكٌ مقصود في الإنتاج) — فلكل
    // اختبارٍ وحدةٌ جديدة، وإلا قرأ اختبارٌ ما خزّنه سابقه بالـ CID نفسه
    forget('../utils/placesSearch');
    forget('../routes/maps');
});

describe('🔎 resolvePlaceRef', () => {
    const P = () => require('../utils/placesSearch');

    it('🔑 مطابقة CID تختار المحلّ عينه لا أولى النتائج', async () => {
        placesReply = { places: [
            place('Corinthia Hotel', 35.9, 14.5, '999'),               // فرعٌ آخر بالاسم نفسه
            place('Corinthia Hotel', REAL.lat, REAL.lng, REAL.cid)
        ] };
        const r = await P().resolvePlaceRef({ name: 'Corinthia Hotel', cid: REAL.cid, city: 'Khartoum' });
        expect(r.lat).toBe(REAL.lat);
        expect(r.exact).toBe(true);
        expect(r.via).toBe('cid');
    });

    it('بلا CID ← أولى النتائج، مع exact:false — لا تخمينٌ صامت', async () => {
        placesReply = { places: [place('مخبز الأمين', 15.6, 32.5, '1'), place('مخبز الأمين', 15.7, 32.6, '2')] };
        const r = await P().resolvePlaceRef({ name: 'مخبز الأمين', city: 'Khartoum' });
        expect(r.lat).toBe(15.6);
        expect(r.exact).toBe(false);
    });

    it('CID لا يطابق شيئاً ← تقريبيّ أيضاً', async () => {
        placesReply = { places: [place('متجر النيل', 15.6, 32.5, '1')] };
        expect((await P().resolvePlaceRef({ name: 'متجر النيل', cid: '42', city: 'Khartoum' })).exact).toBe(false);
    });

    it('placeId ← جلبٌ مباشر لتفاصيل المكان', async () => {
        placesReply = place('Corinthia Hotel', REAL.lat, REAL.lng, REAL.cid, REAL.placeId);
        const r = await P().resolvePlaceRef({ placeId: REAL.placeId, city: 'Khartoum' });
        expect(calls[0].url).toContain(`/v1/places/${REAL.placeId}`);
        expect(calls[0].method).toBe('GET');
        expect(r.exact).toBe(true);
        expect(r.via).toBe('placeId');
    });

    it('CID بلا اسم ← يُبحث بدليل البطاقة (الاسم والعنوان)', async () => {
        placesReply = { places: [place('Corinthia Hotel', REAL.lat, REAL.lng, REAL.cid)] };
        const r = await P().resolvePlaceRef({ cid: REAL.cid, hint: 'Corinthia Hotel Nile St', city: 'Khartoum' });
        expect(calls[0].body.textQuery).toBe('Corinthia Hotel Nile St');
        expect(r.exact).toBe(true);
    });

    it('الطلب: ترجيحٌ لا حصر، و googleMapsUri في الحقول', async () => {
        placesReply = { places: [] };
        await P().resolvePlaceRef({ name: 'X Y', city: 'PortSudan' });
        const c = calls[0];
        expect(c.body.locationBias).toBeTruthy();
        // bias و restriction معاً = INVALID_ARGUMENT (انظر textSearchBody)
        expect(c.body.locationRestriction).toBeUndefined();
        expect(c.headers['X-Goog-FieldMask']).toContain('places.googleMapsUri');
    });

    it('🔑 لا مرشّحات «اشترِ لي»: مبنى مغلقٌ نهائياً ما زال عنوان تسليم', async () => {
        const closed = { ...place('Corinthia Hotel', REAL.lat, REAL.lng, REAL.cid), businessStatus: 'CLOSED_PERMANENTLY', primaryType: 'pharmacy' };
        placesReply = { places: [closed] };
        const r = await P().resolvePlaceRef({ name: 'Corinthia Hotel', cid: REAL.cid, city: 'Khartoum' });
        expect(r).toBeTruthy();
        expect(r.lat).toBe(REAL.lat);
    });

    it('لا نتائج ← null', async () => {
        placesReply = { places: [] };
        expect(await P().resolvePlaceRef({ name: 'لا شيء', city: 'Khartoum' })).toBeNull();
    });

    it('بلا مفتاح ← خطأٌ صريح لا نداءٌ فاشل', async () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        await expect(P().resolvePlaceRef({ name: 'X Y', city: 'Khartoum' })).rejects.toThrow('PLACES_KEY_MISSING');
        expect(calls).toHaveLength(0);
    });
});

// ─── ٣. المسار كاملاً عبر HTTP، بتحويلات جوجل محاكاة ────────────────────
describe('🔗 POST /api/maps/resolve', () => {
    const axios = require('axios');
    const realGet = axios.get;
    let gets = [];
    let hops = {};           // url → { status, location?, data? }
    let app, restoreAuth;

    beforeAll(() => {
        restoreAuth = stubModule('../middleware/authMiddleware', {
            protect: (req, res, next) => { req.user = { city: 'Khartoum' }; next(); }
        });
        axios.get = async (url) => {
            gets.push(url);
            const h = hops[url];
            if (!h) throw Object.assign(new Error('unexpected fetch ' + url), { response: undefined });
            return { status: h.status, headers: h.location ? { location: h.location } : {}, data: h.data || '' };
        };
    });
    afterAll(() => { axios.get = realGet; restoreAuth(); forget('../routes/maps'); });
    beforeEach(() => {
        gets = []; hops = {};
        // المسار يلتقط resolvePlaceRef عند تحميله — فيُبنى من جديد بعد تجديد الوحدة
        app = express();
        app.use(express.json());
        app.use('/api/maps', require('../routes/maps'));
    });

    const resolve = (body) => request(app).post('/api/maps/resolve').send(body);
    const PLACE_URL = `https://www.google.com/maps/place/Corinthia+Hotel/data=!4m2!3m1!1s${REAL.ftid}?utm_source=mstt_1`;

    it('🔴 بطاقة مشاركة محلّ ← تُفكّ ← يوجد المحلّ عينه', async () => {
        hops['https://maps.app.goo.gl/AbCdEf123'] = { status: 302, location: PLACE_URL };
        placesReply = { places: [place('Corinthia', 35.9, 14.5, '999'), place('Corinthia Hotel', REAL.lat, REAL.lng, REAL.cid)] };

        const res = await resolve({ url: 'Corinthia HotelNile St, Khartoum, Sudanhttps://maps.app.goo.gl/AbCdEf123' });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ lat: REAL.lat, lng: REAL.lng, source: 'place', exact: true });
        expect(res.body.name).toBe('Corinthia Hotel');
        // توقّف عند رابط المحل: لم يفتح صفحة جوجل (التي تحمل الموقع الخطأ)
        expect(gets).toEqual(['https://maps.app.goo.gl/AbCdEf123']);
    });

    it('⛔ صفحةٌ بلا تحويلة تحمل مركز الخريطة الافتراضيّ ← 422 لا موقعٌ خاطئ', async () => {
        // الفخّ المقيس: صفحة جوجل تُعيد للخادم «مركز» أم درمان لأيّ رابط
        hops['https://maps.app.goo.gl/Nope'] = { status: 302, location: 'https://www.google.com/maps' };
        hops['https://www.google.com/maps'] = {
            status: 200,
            data: `<meta content="https://maps.google.com/maps/api/staticmap?center=${FAKE_VIEWPORT.lat}%2C${FAKE_VIEWPORT.lng}&amp;zoom=11" itemprop="image">` +
                  `window.APP_INITIALIZATION_STATE=[[[983559.4,${FAKE_VIEWPORT.lng},${FAKE_VIEWPORT.lat}]`
        };
        const res = await resolve({ url: 'https://maps.app.goo.gl/Nope' });
        expect(res.status).toBe(422);
        expect(res.body.lat).toBeUndefined();
    });

    it('رابط الدبوس يبقى يعمل — بلا Places', async () => {
        hops['https://maps.app.goo.gl/Pin1'] = { status: 302, location: 'https://www.google.com/maps/search/15.583469,+32.531042?entry=tts' };
        const res = await resolve({ url: 'https://maps.app.goo.gl/Pin1' });
        expect(res.body).toMatchObject({ lat: 15.583469, lng: 32.531042 });
        expect(calls).toHaveLength(0);
    });

    it('رابط محلٍّ طويل بلا إحداثيات ← Places مباشرةً بلا أيّ طلبٍ لجوجل', async () => {
        placesReply = { places: [place('Corinthia Hotel', REAL.lat, REAL.lng, REAL.cid)] };
        const res = await resolve({ url: PLACE_URL });
        expect(res.body).toMatchObject({ lat: REAL.lat, exact: true });
        expect(gets).toHaveLength(0);
    });

    it('صفحة الموافقة: الوجهة من معامل continue', async () => {
        const target = 'https://www.google.com/maps/search/15.61,+32.54';
        hops['https://maps.app.goo.gl/Cons'] = {
            status: 302,
            location: 'https://consent.google.com/ml?continue=' + encodeURIComponent(target) + '&gl=SD'
        };
        const res = await resolve({ url: 'https://maps.app.goo.gl/Cons' });
        expect(res.body).toMatchObject({ lat: 15.61, lng: 32.54 });
    });

    it('🔒 continue إلى خارج جوجل يُرفض كأيّ قفزة', async () => {
        hops['https://maps.app.goo.gl/Evil'] = {
            status: 302,
            location: 'https://consent.google.com/ml?continue=' + encodeURIComponent('https://169.254.169.254/latest/meta-data')
        };
        const res = await resolve({ url: 'https://maps.app.goo.gl/Evil' });
        expect(res.status).toBe(400);
        expect(gets).toEqual(['https://maps.app.goo.gl/Evil']);
    });

    it('🔒 تحويلةٌ إلى مضيفٍ خارجيّ تُرفض', async () => {
        hops['https://maps.app.goo.gl/Out'] = { status: 302, location: 'https://evil.example/x' };
        expect((await resolve({ url: 'https://maps.app.goo.gl/Out' })).status).toBe(400);
    });

    it('بلا مفتاح Places ← رسالةٌ تدلّ على الطريق البديل (إسقاط دبوس)', async () => {
        delete process.env.GOOGLE_PLACES_API_KEY;
        const res = await resolve({ url: PLACE_URL });
        expect(res.status).toBe(422);
        expect(res.body.message).toContain('إسقاط دبوس');
    });

    it('تقريبيّ ← exact:false في الردّ لتطلب الواجهة التأكّد', async () => {
        placesReply = { places: [place('مخبز', 15.6, 32.5, '1')] };
        const res = await resolve({ url: 'https://www.google.com/maps/place/%D9%85%D8%AE%D8%A8%D8%B2/' });
        expect(res.body.exact).toBe(false);
    });
});

// ─── ٤. الواجهة وصفحة المتجر ──────────────────────────────────────────────
describe('🖥️ حقل اللصق', () => {
    const w = read('public_html/js/maps-link-input.js');

    it('يقرأ الحافظة بأسطرها قبل أن يُلصقها الحقل', () => {
        expect(w).toContain("(e.clipboardData || window.clipboardData).getData('text')");
        expect(w).toContain('e.preventDefault();');
        expect(w).toContain('input.value = url;');
    });

    it('حقلٌ نصّيّ لا url — البطاقة نصٌّ لا رابطٌ صرف', () => {
        expect(w).toContain('type="text" dir="ltr" inputmode="url"');
        expect(w).not.toContain('type="url"');
    });

    it('يُرسل دليل البطاقة مع الرابط', () => {
        expect(w).toContain('hint: MapsLink.shareHint(full)');
    });

    it('التقريبيّ يُقال صراحةً قبل الاعتماد', () => {
        expect(w).toContain('تأكّد أن الدبوس على المحل الصحيح');
    });

    it('واسم المحل وعنوانه يُعرضان بدل عكس الإحداثيات', () => {
        expect(w).toContain("[place.name, place.address].filter(Boolean).join(' — ')");
    });
});

describe('🛒 صفحة المتجر — الرابط يمرّ بطريق منتقي الخريطة نفسه', () => {
    const html = read('public_html/shop-detail.html');

    const enclosing = (needle) => {
        // أيّ دالّةٍ تحوي النصّ؟ بتوازن الأقواس من بداية confirmShopMap
        const start = html.indexOf('async function confirmShopMap()');
        const open = html.indexOf('{', start);
        let d = 0, end = -1;
        for (let i = open; i < html.length; i++) {
            if (html[i] === '{') d++;
            else if (html[i] === '}') { d--; if (!d) { end = i; break; } }
        }
        const at = html.indexOf(needle);
        return at > open && at < end ? 'confirmShopMap' : 'top';
    };

    it('🔴 getShopDeliveryLimits في المستوى الأعلى — أزرار ±100 تراها الآن', () => {
        expect(enclosing('function getShopDeliveryLimits')).toBe('top');
        expect(enclosing('function updateShopDeliveryFee')).toBe('top');
    });

    it('منتقي الخريطة يحسب السعر بالدالّة المشتركة', () => {
        expect(enclosing('updateShopDeliveryFee(lat, lng);')).toBe('confirmShopMap');
    });

    it('والرابط كذلك — لا إحداثياتٌ في الخفاء وسعرٌ صفر', () => {
        const i = html.indexOf("MapsLinkInput.mount('#shopLinkHost'");
        const blk = html.slice(i, i + 2500);
        expect(blk).toContain('updateShopDeliveryFee(lat, lng)');
    });

    it('والعنوان يُكتب دائماً — لا «إن كان فارغاً» فيبقى القديم مع إحداثياتٍ جديدة', () => {
        const i = html.indexOf("MapsLinkInput.mount('#shopLinkHost'");
        const blk = html.slice(i, i + 2500);
        expect(blk).not.toContain('!addr.value.trim()');
        expect(blk).toContain("addr.value = text || 'موقع من رابط خرائط جوجل'");
    });

    it('وسعرٌ عدّله العميل بيده لا يُمحى', () => {
        const i = html.indexOf('function updateShopDeliveryFee');
        expect(html.slice(i, i + 400)).toContain('if (isPriceManuallyEdited) return;');
    });
});
