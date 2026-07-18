/**
 * Unit tests — utils/imageUpload.saveBase64ToUploads
 * تحويل صور الطلبات من Base64 إلى ملفات (بدل تخزينها داخل مستند الطلب).
 */
const fs = require('fs');
const path = require('path');
const { saveBase64ToUploads } = require('../utils/imageUpload');

const PUBLIC_UPLOADS = path.join(__dirname, '..', 'public_html', 'uploads');

// ترويسات حقيقية
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(32)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(32)]);
const PHP = Buffer.from('<?php system($_GET[1]); ?>' + ' '.repeat(32));
const uri = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;

const created = [];
afterAll(() => {
    for (const rel of created) {
        try { fs.unlinkSync(path.join(__dirname, '..', rel.replace(/^\//, ''))); } catch (_) {}
    }
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
        // subdir يُنظَّف عبr path.basename ⇒ يبقى داخل uploads
        expect(url).toMatch(/^\/uploads\/etc\//);
        expect(url).not.toContain('..');
    });
});
