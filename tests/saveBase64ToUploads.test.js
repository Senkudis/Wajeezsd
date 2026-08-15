/**
 * Unit tests — utils/imageUpload.saveBase64ToUploads
 * تحويل صور الطلبات من Base64 إلى ملفات (بدل تخزينها داخل مستند الطلب).
 *
 * ⚠️ عيّنات هذا الملف كانت 36–40 بايت، وهو ما مرّ سنيناً حتى أُضيف حارس الحدّ
 * الأدنى (1KB) الذي يرفض الصور المبتورة — فصارت العيّنات نفسها ترتدّ null
 * وسقطت ثلاثة اختبارات دفعةً واحدة. العيّنات الآن بحجمٍ معقول، وأُضيفت تغطية
 * صريحة لكل حارسٍ جديد حتى لا يمرّ تغيير السلوك التالي بلا اختبار يكشفه.
 */
const fs = require('fs');
const path = require('path');
const { saveBase64ToUploads } = require('../utils/imageUpload');

const PUBLIC_UPLOADS = path.join(__dirname, '..', 'public_html', 'uploads');

// ترويسات حقيقية + حشوٌ يتجاوز الحدّ الأدنى (1KB) — صورة كاميرا حقيقية أكبر بكثير
const pad = (head, size = 2048) => Buffer.concat([Buffer.from(head), Buffer.alloc(size)]);
const JPG = pad([0xFF, 0xD8, 0xFF, 0xE0]);
const PNG = pad([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
// JPEG من بعض كاميرات أندرويد: 0xFF 0xD8 فقط، والبايت الثالث ليس 0xFF
const JPG_ANDROID = pad([0xFF, 0xD8, 0x00, 0x11]);
const PHP = Buffer.concat([Buffer.from('<?php system($_GET[1]); ?>'), Buffer.alloc(2048, 0x20)]);
const uri = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;

const created = [];
afterAll(() => {
    // ⚠️ كان المسار هنا يفتقد 'public_html' فيشير إلى جذر المستودع — أي أن
    // unlinkSync كان يرمي دائماً ويبتلعه الـ catch الفارغ، فلا يُحذف شيء.
    // تراكم من ذلك 251 ملفاً عبر ~84 تشغيلاً (كلها 36/40 بايت، وكلها متجاهَلة
    // في git فلم تظهر في أي diff — ولهذا لم يلحظها أحد).
    for (const rel of created) {
        if (typeof rel !== 'string') continue;
        try { fs.unlinkSync(path.join(__dirname, '..', 'public_html', rel.replace(/^\//, ''))); } catch (_) {}
    }
    // اختبار اجتياز المسار يُنشئ public_html/uploads/etc — يُزال وهو فارغ
    try { fs.rmdirSync(path.join(PUBLIC_UPLOADS, 'etc')); } catch (_) {}
});
// الرابط /uploads/<sub>/<file> يقابل ملفاً في public_html/uploads/<sub>/<file>
const absOf = (url) => path.join(PUBLIC_UPLOADS, url.replace('/uploads/', ''));

describe('saveBase64ToUploads', () => {
    it('يحوّل JPG صالحاً إلى ملف ويُرجع رابطاً تحت المجلد المطلوب', () => {
        const url = saveBase64ToUploads(uri('image/jpeg', JPG), 'parcels');
        created.push(url);
        expect(url).toMatch(/^\/uploads\/parcels\/img_\d+_[a-f0-9]{12}\.jpg$/);
        expect(fs.existsSync(absOf(url))).toBe(true);
    });

    it('يحترم المجلد الفرعي (proofs)', () => {
        const url = saveBase64ToUploads(uri('image/png', PNG), 'proofs');
        created.push(url);
        expect(url).toMatch(/^\/uploads\/proofs\/.+\.png$/);
    });

    it('🔒 يرفض base64 يدّعي صورة لكن محتواه شيفرة', () => {
        // الحشو هنا يتجاوز 1KB عمداً: نريد أن يسقط على بصمة الملف لا على الحجم
        expect(saveBase64ToUploads(uri('image/jpeg', PHP), 'parcels')).toBeNull();
    });

    it('🔄 متوافق مع القديم: رابط مخزّن مسبقاً يُعاد كما هو (idempotent)', () => {
        expect(saveBase64ToUploads('/uploads/parcels/old.jpg', 'parcels')).toBe('/uploads/parcels/old.jpg');
        expect(saveBase64ToUploads('https://cdn.x/y.jpg', 'parcels')).toBe('https://cdn.x/y.jpg');
    });

    it('يُرجع null للمدخلات الفارغة أو غير المتوقّعة', () => {
        expect(saveBase64ToUploads(null)).toBeNull();
        expect(saveBase64ToUploads('')).toBeNull();
        expect(saveBase64ToUploads('some-random-garbage')).toBeNull();
        expect(saveBase64ToUploads('data:text/html;base64,abcd')).toBeNull();
    });

    it('🔒 لا يسمح باجتياز المسار عبر subdir', () => {
        const url = saveBase64ToUploads(uri('image/jpeg', JPG), '../../../etc');
        created.push(url);
        // subdir يُنظَّف عبر path.basename ⇒ يبقى داخل uploads
        expect(url).toMatch(/^\/uploads\/etc\//);
        expect(url).not.toContain('..');
    });

    // ── حرّاس أُضيفوا لاحقاً وكانوا بلا تغطية ───────────────────────────────

    it('🔒 يرفض الصورة المبتورة (أقل من 1KB) — عادةً قصّها حدّ حجم الطلب', () => {
        const truncated = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(32)]);
        expect(saveBase64ToUploads(uri('image/jpeg', truncated), 'parcels')).toBeNull();
    });

    it('🔒 يرفض الصورة الضخمة (أكبر من 8MB)', () => {
        const huge = pad([0xFF, 0xD8, 0xFF, 0xE0], 9 * 1024 * 1024);
        expect(saveBase64ToUploads(uri('image/jpeg', huge), 'parcels')).toBeNull();
    });

    it('يقبل JPEG بترويسة أندرويد المختصرة (0xFF 0xD8 والبايت الثالث ليس 0xFF)', () => {
        const url = saveBase64ToUploads(uri('image/jpeg', JPG_ANDROID), 'parcels');
        created.push(url);
        expect(url).toMatch(/\.jpg$/);
    });

    it('يعامل HEIC/HEIF المُعلَنة كـ JPEG (iOS تلتقط HEIC افتراضياً)', () => {
        const url = saveBase64ToUploads(uri('image/heic', JPG), 'proofs');
        created.push(url);
        expect(url).toMatch(/^\/uploads\/proofs\/.+\.jpg$/);
    });

    it('🔒 الامتداد من بصمة الملف لا من ادّعاء العميل', () => {
        // العميل يقول png والمحتوى JPEG ⇒ يُحفظ .jpg لا .png
        const url = saveBase64ToUploads(uri('image/png', JPG), 'parcels');
        created.push(url);
        expect(url).toMatch(/\.jpg$/);
        expect(url).not.toMatch(/\.png$/);
    });
});
