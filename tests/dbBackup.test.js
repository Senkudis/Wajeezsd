/**
 * 💾 النسخ الاحتياطي والاستعادة.
 *
 * ما تحرسه هذه الاختبارات ليس «هل تعمل» بل **هل تكذب**:
 *
 *   ١. الأنواع تعود كما ذهبت. ObjectId يعود ObjectId لا نصّاً، والتاريخ
 *      تاريخاً. نسخةٌ تعيد `_id` نصّاً تبدو ناجحة ثم يفشل كل ربطٍ في
 *      التطبيق — وهذا أسوأ من فشلٍ صريح.
 *   ٢. النسخة المقطوعة تُرفض. لو انقطع الاتصال في منتصف مجموعة بقي
 *      الملف على القرص ناقصاً؛ البصمة هي ما يكشفه قبل الكتابة.
 *   ٣. حرّاس الكتابة فوق القاعدة الحيّة لا تُفتح بخيارٍ واحد.
 *   ٤. سياسة الإبقاء لا تحذف نسخةً سليمة لتُبقي على مقطوعة.
 *
 * كلها بلا قاعدة بيانات: الدوالّ المفحوصة نقيّة، والملفات في مجلد مؤقّت.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { EJSON, ObjectId } = require('bson');

const backup = require('../scripts/backup-db.js');
const restore = require('../scripts/restore-db.js');

let TMP;
beforeAll(() => { TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wajeez-bk-')); });
afterAll(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

/** يبني نسخةً على القرص بنفس صيغة السكربت، لاختبار الاستعادة عليها. */
function writeBackup(dirName, docsByCollection, over = {}) {
    const dir = path.join(TMP, dirName);
    fs.mkdirSync(dir, { recursive: true });
    const collections = [];
    for (const [name, docs] of Object.entries(docsByCollection)) {
        const body = docs.map(d => EJSON.stringify(d, { relaxed: false })).join('\n') + '\n';
        const file = path.join(dir, `${name}.ndjson.gz`);
        fs.writeFileSync(file, zlib.gzipSync(Buffer.from(body, 'utf8')));
        const bytes = fs.statSync(file).size;
        collections.push({
            name, count: docs.length, bytes,
            sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
        });
    }
    const manifest = {
        format: 'wajeez-backup/1', db: 'wajeez', appVersion: '0.0.0',
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        complete: true, error: null, collections, ...over
    };
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return { dir, manifest };
}

describe('الأنواع تعود كما ذهبت', () => {
    it('ObjectId يعود ObjectId، لا نصّاً يشبهه', async () => {
        const id = new ObjectId();
        const { dir } = writeBackup('t-types', { orders: [{ _id: id, n: 1 }] });
        const [doc] = await restore.readDocs(path.join(dir, 'orders.ndjson.gz'));
        expect(doc._id).toBeInstanceOf(ObjectId);
        expect(doc._id.toHexString()).toBe(id.toHexString());
    });

    it('والتاريخ تاريخاً — لا سلسلة ISO', async () => {
        const when = new Date('2026-03-04T05:06:07.008Z');
        const { dir } = writeBackup('t-date', { orders: [{ _id: new ObjectId(), createdAt: when }] });
        const [doc] = await restore.readDocs(path.join(dir, 'orders.ndjson.gz'));
        expect(doc.createdAt).toBeInstanceOf(Date);
        expect(doc.createdAt.toISOString()).toBe(when.toISOString());
    });

    it('والمستندات المتداخلة والمصفوفات تحفظ أنواعها في العمق', async () => {
        const inner = new ObjectId();
        const src = { _id: new ObjectId(), captain: { id: inner, at: new Date(0) }, tags: ['a', 2, null] };
        const { dir } = writeBackup('t-deep', { orders: [src] });
        const [doc] = await restore.readDocs(path.join(dir, 'orders.ndjson.gz'));
        expect(doc.captain.id).toBeInstanceOf(ObjectId);
        expect(doc.captain.id.toHexString()).toBe(inner.toHexString());
        expect(doc.captain.at).toBeInstanceOf(Date);
        // الأرقام تعود بأغلفة BSON (Int32/Double) لا بأرقام JS عارية — وهذا
        // هو المطلوب: الغلاف هو ما يحفظ نوع الرقم في القاعدة. فالمقياس
        // الصادق ليس شكل القيمة في JS بل أن يعود الترميز نفسه حرفياً.
        expect(EJSON.stringify(doc, { relaxed: false }))
            .toBe(EJSON.stringify(src, { relaxed: false }));
        expect(doc.tags.map(v => (v && typeof v.valueOf === 'function' ? v.valueOf() : v)))
            .toEqual(['a', 2, null]);
    });

    it('ومستندٌ بلا حقول اختيارية لا يكتسب حقولاً', async () => {
        const { dir } = writeBackup('t-sparse', { users: [{ _id: new ObjectId(), phone: '0912' }] });
        const [doc] = await restore.readDocs(path.join(dir, 'users.ndjson.gz'));
        expect(Object.keys(doc).sort()).toEqual(['_id', 'phone']);
    });
});

describe('النسخة المعبوث بها تُرفض قبل أي كتابة', () => {
    it('بايتٌ واحد يتغيّر فتسقط البصمة', async () => {
        const { dir, manifest } = writeBackup('t-tamper', { users: [{ _id: new ObjectId(), a: 1 }] });
        const file = path.join(dir, 'users.ndjson.gz');
        const buf = fs.readFileSync(file);
        buf[buf.length - 1] ^= 0xff;
        fs.writeFileSync(file, buf);
        const bad = await restore.verifyFiles(dir, manifest, ['users']);
        expect(bad.length).toBe(1);
        expect(bad[0]).toContain('users');
    });

    it('وملفٌ مفقود يُبلَّغ عنه لا يُتجاوَز صامتاً', async () => {
        const { dir, manifest } = writeBackup('t-missing', { users: [{ _id: new ObjectId() }] });
        fs.rmSync(path.join(dir, 'users.ndjson.gz'));
        const bad = await restore.verifyFiles(dir, manifest, ['users']);
        expect(bad[0]).toContain('مفقود');
    });

    it('والنسخة الناقصة لا تُستعاد أصلاً', () => {
        const { manifest } = writeBackup('t-partial', { users: [] }, { complete: false, error: 'انقطع' });
        expect(() => restore.planRestore({ manifest, args: { yes: true } })).toThrow(/ناقصة/);
    });

    it('ومجلدٌ ليس نسخةً لهذا المشروع يُرفض', () => {
        expect(() => restore.planRestore({ manifest: { format: 'other' }, args: { yes: true } }))
            .toThrow(/ليس نسخة/);
    });
});

describe('الكتابة فوق القاعدة الحيّة لا تُفتح بخيارٍ واحد', () => {
    const manifest = { format: 'wajeez-backup/1', db: 'wajeez', complete: true, collections: [{ name: 'users' }] };
    const base = { from: 'x', only: null, yes: true, inPlace: true, confirmDb: 'wajeez', drop: false, to: null };

    it('الافتراضي قاعدةٌ جديدة — لا تُمسّ الحيّة', () => {
        const p = restore.planRestore({ manifest, args: { ...base, inPlace: false, confirmDb: null }, stamp: 'S' });
        expect(p.inPlace).toBe(false);
        expect(p.target).toBe('wajeez_restore_S');
        expect(p.target).not.toBe('wajeez');
    });

    it('وبلا --yes لا كتابة حتى إلى القاعدة الجديدة', () => {
        const p = restore.planRestore({ manifest, args: { ...base, inPlace: false, yes: false, confirmDb: null } });
        expect(p.write).toBe(false);
    });

    it('بلا متغيّر البيئة: يُرفض', () => {
        expect(() => restore.planRestore({ manifest, args: base, env: {} })).toThrow(new RegExp(restore.INPLACE_ENV));
    });

    it('بلا --confirm-db: يُرفض', () => {
        expect(() => restore.planRestore({
            manifest, args: { ...base, confirmDb: null }, env: { [restore.INPLACE_ENV]: '1' }
        })).toThrow(/confirm-db/);
    });

    it('و--confirm-db باسمٍ آخر: يُرفض', () => {
        expect(() => restore.planRestore({
            manifest, args: { ...base, confirmDb: 'wajeez_staging' }, env: { [restore.INPLACE_ENV]: '1' }
        })).toThrow(/لا يطابق/);
    });

    it('بلا --yes: يُرفض', () => {
        expect(() => restore.planRestore({
            manifest, args: { ...base, yes: false }, env: { [restore.INPLACE_ENV]: '1' }
        })).toThrow(/--yes/);
    });

    it('وبالأربعة معاً وحدها: يُسمح', () => {
        const p = restore.planRestore({ manifest, args: base, env: { [restore.INPLACE_ENV]: '1' } });
        expect(p.inPlace).toBe(true);
        expect(p.target).toBe('wajeez');
    });

    it('و--to الذي يساوي الحيّة يُرفض — بابٌ خلفي للكتابة فوقها', () => {
        expect(() => restore.planRestore({
            manifest, args: { ...base, inPlace: false, to: 'wajeez', confirmDb: null }
        })).toThrow(/in-place/);
    });
});

describe('سياسة الإبقاء لا تحذف السليم لتُبقي المقطوع', () => {
    const e = (name, complete = true) => ({ name, complete });

    it('تُبقي الأحدث بالعدد المطلوب', () => {
        const all = ['2026-01-01T000000Z', '2026-01-02T000000Z', '2026-01-03T000000Z'].map(n => e(n));
        expect(backup.pruneList(all, 2)).toEqual(['2026-01-01T000000Z']);
    });

    it('والمقطوعة لا تُحتسب ضمن المُبقى فتُحذف هي لا السليمة', () => {
        const all = [e('2026-01-01T000000Z'), e('2026-01-02T000000Z'), e('2026-01-03T000000Z', false)];
        // بعددٍ 2: السليمتان تبقيان، والمقطوعة (وهي الأحدث) تُحذف
        expect(backup.pruneList(all, 2)).toEqual(['2026-01-03T000000Z']);
    });

    it('ولا تحذف شيئاً حين تكون النسخ أقلّ من العدد', () => {
        expect(backup.pruneList([e('2026-01-01T000000Z')], 14)).toEqual([]);
    });

    it('وما ليس مجلد نسخةٍ لا يدخل الحساب أصلاً', () => {
        expect(backup.isBackupDirName('2026-01-01T000000Z')).toBe(true);
        expect(backup.isBackupDirName('notes')).toBe(false);
        expect(backup.isBackupDirName('2026-01-01')).toBe(false);
    });
});

describe('قراءة الخيارات', () => {
    it('الافتراضات معقولة', () => {
        const a = backup.parseArgs([]);
        expect(a.dryRun).toBe(false);
        expect(a.keep).toBe(14);
        expect(a.only).toBeNull();
    });

    it('و--only تُقرأ قائمةً', () => {
        expect(backup.parseArgs(['--only', 'orders, users']).only).toEqual(['orders', 'users']);
    });

    it('وخيارٌ مكتوبٌ خطأً يصرخ بدل أن يُتجاهل', () => {
        expect(() => backup.parseArgs(['--drirun'])).toThrow(/غير معروف/);
        expect(() => restore.parseArgs(['--from', 'x', '--yess'])).toThrow(/غير معروف/);
    });

    it('و--keep صفراً يُرفض — وإلا حذفت النسخة التي كتبتها للتوّ', () => {
        expect(() => backup.parseArgs(['--keep', '0'])).toThrow(/keep/);
    });

    it('والاستعادة بلا --from لا معنى لها', () => {
        expect(() => restore.parseArgs([])).toThrow(/--from/);
    });
});

describe('اسم المجلد', () => {
    it('مرتَّبٌ أبجدياً = مرتَّبٌ زمنياً', () => {
        const a = backup.stampFor(new Date('2026-09-16T10:15:00Z'));
        const b = backup.stampFor(new Date('2026-09-16T10:16:00Z'));
        expect(a < b).toBe(true);
    });

    it('وبلا نقطتين — ويندوز لا يقبلهما في اسم ملف', () => {
        expect(backup.stampFor(new Date('2026-09-16T10:15:00Z'))).toBe('2026-09-16T101500Z');
    });
});
