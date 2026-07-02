/**
 * compress_images.js — ضغط رجعي للصور القديمة في public_html/uploads
 *
 * الاستخدام:
 *   1. CLI على السيرفر:        node compress_images.js
 *   2. من كود السيرفر:         const { run } = require('./compress_images'); await run();
 *      (مستخدم في POST /api/admin/compress-images)
 */
const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

const uploadsDir = path.join(__dirname, 'public_html', 'uploads');
const foldersToCompress = ['products', 'places'];

const MAX_WIDTH = 1000;
const QUALITY = 85;
const MIN_SIZE = 300 * 1024; // تجاهل الملفات الأصغر من 300KB

async function processImage(filePath) {
    const sizeBefore = fs.statSync(filePath).size;
    if (sizeBefore < MIN_SIZE) return { status: 'skipped', sizeBefore, sizeAfter: sizeBefore };

    const image = await Jimp.read(filePath);

    if (image.bitmap.width > MAX_WIDTH || image.bitmap.height > MAX_WIDTH) {
        // Jimp v1: scaleToFit يأخذ كائن { w, h }
        image.scaleToFit({ w: MAX_WIDTH, h: MAX_WIDTH });
    }

    // الجودة تنطبق على JPEG فقط؛ PNG تُصغّر أبعادها فقط
    const isJpeg = /\.jpe?g$/i.test(filePath);
    await image.write(filePath, isJpeg ? { quality: QUALITY } : undefined);

    const sizeAfter = fs.statSync(filePath).size;
    return { status: 'ok', sizeBefore, sizeAfter };
}

async function run() {
    const stats = { processed: 0, skipped: 0, failed: 0, savedBytes: 0, failures: [] };

    for (const folder of foldersToCompress) {
        const dir = path.join(uploadsDir, folder);
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir);
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;

            const filePath = path.join(dir, file);
            try {
                const r = await processImage(filePath);
                if (r.status === 'skipped') {
                    stats.skipped++;
                } else {
                    stats.processed++;
                    stats.savedBytes += Math.max(0, r.sizeBefore - r.sizeAfter);
                    console.log(`✅ Compressed: ${file} (${(r.sizeBefore / 1024 / 1024).toFixed(2)} MB → ${(r.sizeAfter / 1024).toFixed(0)} KB)`);
                }
            } catch (err) {
                stats.failed++;
                if (stats.failures.length < 20) stats.failures.push({ file, error: err.message });
                console.error(`❌ Failed to process: ${file}`, err.message);
            }
        }
    }

    return stats;
}

module.exports = { run };

if (require.main === module) {
    console.log('Starting image compression...');
    run()
        .then(stats => {
            console.log(`🎉 Compression finished! processed=${stats.processed} skipped=${stats.skipped} failed=${stats.failed} saved=${(stats.savedBytes / 1024 / 1024).toFixed(2)} MB`);
        })
        .catch(err => {
            console.error('Compression run failed:', err);
            process.exit(1);
        });
}
