/**
 * 🛰️ «التتبّع ما شغال كويس» — شكوى عميل، و«تتبّع موقعك متوقّف» — إشعارٌ
 * يصل الكابتن وهو واثقٌ أنه منح كل الأذونات.
 *
 * الشكويان عَرَضان لعلّةٍ واحدة، وثالثةٌ وجدتها في الطريق:
 *
 *   ١. **النبض كان يكذب.** `startHeartbeat` يعيد إرسال **آخر إحداثيات
 *      معروفة** كل ٨ ثوانٍ مهما قدُمت. فيبقى ختم الخادم طازجاً بموقعٍ عمره
 *      دقائق: العميل يرى مؤشّراً يبدو حيّاً وهو جامد، والخادم لا يرى عطلاً
 *      فلا ينبّه أحداً. أي أن أسوأ الحالات كانت **تُخفى** لا تُكتشف.
 *
 *   ٢. **`updatedAt` كان يُقرأ خطأً.** هو «متى وصلنا الموقع» لا «متى كان
 *      الكابتن هناك». صار معه `fixedAt` = لحظة القياس على الجهاز، وعليه
 *      وحده يُبنى الحكم.
 *
 *   ٣. **خطأ إذن الموقع كان يُبتلع في console.error.** الكابتن يظنّ التتبّع
 *      يعمل، ولا يعلم إلا بإشعارٍ من الخادم بعد دقائق.
 *
 * ⚠️ ما لا تصلحه هذه الاختبارات: `BackgroundGeolocation` **غير مثبَّتة**
 *    أصلاً (لا في package.json ولا في capacitor.plugins.json)، فالتتبّع
 *    يسقط إلى watchPosition داخل WebView — وأندرويد يجمّدها في الخلفية.
 *    ذلك يحتاج إضافةً أصلية وقراراً (انظر تقرير الجلسة).
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const service = read('public_html/js/captain-service.js');
const route = read('routes/captain.js');
const model = read('models/User.js');
const tracking = read('public_html/tracking.html');

describe('النبض لا يعيد إرسال قراءةٍ ميتة', () => {
    it('حدٌّ أقصى لعمر القراءة المُعاد إرسالها', () => {
        expect(service).toContain('MAX_FIX_AGE_MS');
        const i = service.indexOf('startHeartbeat:');
        const blk = service.slice(i, i + 1200);
        expect(blk).toContain('if (age > MAX_FIX_AGE_MS)');
        expect(blk).toContain('_onTrackingDegraded(age)');
    });

    it('ولا يرسل «آخر موقع» بلا عمرٍ كما كان', () => {
        const i = service.indexOf('startHeartbeat:');
        const blk = service.slice(i, i + 1200);
        expect(blk).not.toContain('CaptainService.lastLocation;');
        expect(blk).toContain('CaptainService.lastFix');
    });

    it('القراءة تُسجَّل بلحظة قياسها من الجهاز', () => {
        expect(service).toContain('const at = pos.timestamp || Date.now();');
        expect(service).toContain('CaptainService.lastFix = {');
        expect(service).toContain('function');
    });
});

describe('عمر القراءة يسافر إلى الخادم', () => {
    it('يُرسل مع كل تحديث', () => {
        expect(service).toContain('_fixAge:');
        expect(service).toContain('fixAge: CaptainService._fixAge()');
    });

    it('والخادم يحفظ لحظة القياس لا لحظة الوصول وحدها', () => {
        expect(model).toContain('fixedAt: { type: Date }');
        expect(route).toContain('fixedAt: new Date(now.getTime() - fixAge)');
    });

    it('مع حارسٍ ضد قيمةٍ عبثية أو غائبة', () => {
        const i = route.indexOf('const rawAge = Number(req.body.fixAge)');
        const blk = route.slice(i, i + 320);
        expect(blk).toContain('Math.min(rawAge, 24 * 60 * 60 * 1000)');
        expect(blk).toContain(': 0;');
    });

    it('ويُبثّ للعميل مع الموقع الحيّ', () => {
        const i = route.indexOf("emit('captain_location_updated'");
        expect(route.slice(i, i + 400)).toContain('fixAge');
    });
});

describe('الكابتن يُبلَّغ في التطبيق لا بعد دقائق', () => {
    it('تنبيهٌ فوري عند تعثّر التتبّع', () => {
        expect(service).toContain('_onTrackingDegraded');
        expect(service).toContain('تعذّر تحديث موقعك منذ');
    });

    it('بلا إغراقٍ بالتكرار', () => {
        expect(service).toContain('DEGRADED_WARN_EVERY_MS');
        expect(service).toContain('_lastDegradedWarnAt');
    });

    it('ورفض الإذن يُقال له صراحةً', () => {
        expect(service).toContain('إذن الموقع مرفوض');
        expect(service).toContain('err.code === 1');
    });

    it('ويُعاد تشغيل المراقب — قد يكون مات والإذن سليم', () => {
        expect(service).toContain('_restartWatch');
        const i = service.indexOf('_restartWatch: () => {');
        expect(service.slice(i, i + 400)).toContain('_lastWatchRestartAt < 60000');
    });
});

describe('شاشة العميل تقول الحقيقة وتُريح', () => {
    it('ثلاث حالات صريحة لا مؤشّرٌ صامت', () => {
        expect(tracking).toContain('يتحرّك الآن');
        expect(tracking).toContain('آخر تحديث ');
        expect(tracking).toContain('بانتظار إشارة الكابتن');
    });

    it('والحكم من لحظة القياس لا لحظة الوصول', () => {
        expect(tracking).toContain('loc.fixedAt || loc.updatedAt');
        expect(tracking).toContain('markCaptainFix(data.fixAge)');
    });

    it('النصّ يشيخ وحده بلا تحديث الصفحة', () => {
        expect(tracking).toContain('setInterval(renderTrackingFreshness, 15000)');
    });

    it('وعند الانقطاع الطويل: تفسيرٌ وطمأنة لا صمت', () => {
        expect(tracking).toContain('انقطع تحديث موقع الكابتن');
        expect(tracking).toContain('الطلب ماضٍ');
        expect(tracking).toContain('STALE_MS');
    });

    it('بلا إيموجي في الشريط — أيقونات Bootstrap', () => {
        expect(tracking).toContain('<i class="bi bi-clock-fill"></i> وقت الوصول');
        expect(tracking).not.toContain('⏱ وقت الوصول');
        expect(tracking).not.toContain('💰 السعر');
    });
});
