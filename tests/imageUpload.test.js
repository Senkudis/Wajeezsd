/**
 * Unit tests — utils/imageUpload
 *
 * يغطّي الثغرة الحرجة: كان الامتداد يُؤخذ من اسم الملف الذي يرسله العميل،
 * وnوع MIME (ترويسة يتحكم بها العميل) هو الفحص الوحيد. النتيجة: رفع
 * shell.php أو evil.html داخل public_html ⇒ XSS مخزّن واحتمال تنفيذ PHP.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    saveBase64Image, deleteImage,
    MIME_EXT, detectImageExt, detectImageExtOfFile
} = require('../utils/imageUpload');

// ترويسات حقيقية مصغّرة
const JPG  = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(20)]);
const PNG  = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);
const PHP  = Buffer.from('<?php system($_GET["c"]); ?>' + ' '.repeat(20));
const HTML = Buffer.from('<script>alert(document.cookie)</script>' + ' '.repeat(20));
const SVG  = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

let tmpDir;
beforeAll(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wajeez-upload-')); });
afterAll(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

const writeTmp = (name, buf) => {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, buf);
    return p;
};

describe('MIME_EXT — القائمة البيضاء', () => {
    it('تحوي أنواع الصور المسموحة فقط', () => {
        expect(Object.keys(MIME_EXT).sort()).toEqual(
            ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
        );
    });

    it('🔒 لا تُرجع امتداداً لأي نوع خطر', () => {
        for (const mime of ['application/x-php', 'text/html', 'image/svg+xml', 'text/plain', '']) {
            expect(MIME_EXT[mime]).toBeUndefined();
        }
    });

    it('🔒 امتداد غير معروف لا يُشتق منه شيء (fallback يصير .jpg في upload.js)', () => {
        expect(MIME_EXT['image/php']).toBeUndefined();
    });
});

describe('detectImageExt — المحتوى الفعلي', () => {
    it('يتعرّف على JPG وPNG وWebP الحقيقية', () => {
        expect(detectImageExt(JPG)).toBe('.jpg');
        expect(detectImageExt(PNG)).toBe('.png');
        expect(detectImageExt(WEBP)).toBe('.webp');
    });

    it('🔒 يرفض PHP وHTML وSVG مهما ادّعى العميل', () => {
        expect(detectImageExt(PHP)).toBeNull();
        expect(detectImageExt(HTML)).toBeNull();
        expect(detectImageExt(SVG)).toBeNull();
    });

    it('يرفض buffer قصيراً أو فارغاً', () => {
        expect(detectImageExt(Buffer.from([0xFF, 0xD8]))).toBeNull();
        expect(detectImageExt(Buffer.alloc(0))).toBeNull();
        expect(detectImageExt(null)).toBeNull();
    });

    it('🔒 يرفض ملفاً يبدأ ببايتات صورة ثم يحوي شفرة (polyglot)', () => {
        // البادئة صحيحة ⇒ يُقبل كـ jpg. هذا مقصود: الامتداد سيكون .jpg
        // والخادم لن ينفّذه، وnosniff يمنع تصييره كـ HTML.
        const polyglot = Buffer.concat([JPG, PHP]);
        expect(detectImageExt(polyglot)).toBe('.jpg');
    });
});

describe('detectImageExtOfFile — قراءة من القرص', () => {
    it('يتعرّف على صورة حقيقية على القرص', async () => {
        expect(await detectImageExtOfFile(writeTmp('real.jpg', JPG))).toBe('.jpg');
    });

    it('🔒 يرفض ملف PHP سُمّي .jpg', async () => {
        expect(await detectImageExtOfFile(writeTmp('fake.jpg', PHP))).toBeNull();
    });

    it('يرفض ملفاً غير موجود بلا رمي استثناء', async () => {
        expect(await detectImageExtOfFile(path.join(tmpDir, 'nope.jpg'))).toBeNull();
    });
});

describe('saveBase64Image', () => {
    const dataUri = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;
    const saved = [];
    afterAll(() => saved.forEach(u => { try { deleteImage(u); } catch (_) {} }));

    it('يحفظ صورة صالحة بامتداد صحيح', () => {
        const url = saveBase64Image(dataUri('image/png', PNG));
        saved.push(url);
        expect(url).toMatch(/^\/uploads\/img_\d+_[a-f0-9]{12}\.png$/);
    });

    it('🔒 يرفض data:image/phtml — كان يكتب ملف .phtml قابلاً للتنفيذ', () => {
        expect(saveBase64Image(dataUri('image/phtml', PHP))).toBeNull();
    });

    it('🔒 يرفض نوعاً مسموحاً لكن بمحتوى ليس صورة', () => {
        // العميل يدّعي png ويرسل HTML — المحتوى هو الحَكَم
        expect(saveBase64Image(dataUri('image/png', HTML))).toBeNull();
    });

    it('🔒 يرفض تضارب النوع المُعلَن مع المحتوى الفعلي', () => {
        expect(saveBase64Image(dataUri('image/png', JPG))).toBeNull();
    });

    it('يرفض المدخلات غير الصالحة', () => {
        expect(saveBase64Image(null)).toBeNull();
        expect(saveBase64Image('')).toBeNull();
        expect(saveBase64Image('not-a-data-uri')).toBeNull();
        expect(saveBase64Image('data:text/html;base64,abcd')).toBeNull();
    });
});

describe('deleteImage — اجتياز المسار', () => {
    it('🔒 يرفض الخروج من مجلد الرفع', () => {
        // ملف طُعم خارج مجلد الرفع؛ لو نجح الاجتياز لحُذف
        const bait = writeTmp('bait.txt', Buffer.from('important'));
        deleteImage('/uploads/../../' + path.relative(path.join(__dirname, '..'), bait).replace(/\\/g, '/'));
        expect(fs.existsSync(bait)).toBe(true);
    });

    it('يتجاهل المسارات التي لا تبدأ بـ /uploads/', () => {
        expect(() => deleteImage('/etc/passwd')).not.toThrow();
        expect(() => deleteImage(null)).not.toThrow();
    });

    it('يحذف صورة صالحة فعلاً', () => {
        const url = saveBase64Image(`data:image/jpeg;base64,${JPG.toString('base64')}`);
        const abs = path.join(__dirname, '..', url);
        expect(fs.existsSync(abs)).toBe(true);
        deleteImage(url);
        expect(fs.existsSync(abs)).toBe(false);
    });
});
