const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

const uploadsDir = path.join(__dirname, 'public_html', 'uploads');
const foldersToCompress = ['products', 'places'];

const MAX_WIDTH = 1000;
const QUALITY = 85;

async function processImage(filePath) {
    try {
        const stats = fs.statSync(filePath);
        // Only process images > 300KB to save time, unless they are huge in dimensions
        if (stats.size < 300 * 1024) return;

        const image = await Jimp.read(filePath);

        if (image.bitmap.width > MAX_WIDTH || image.bitmap.height > MAX_WIDTH) {
            // Scale to fit MAX_WIDTH x MAX_WIDTH (Jimp v1 API: object argument)
            image.scaleToFit({ w: MAX_WIDTH, h: MAX_WIDTH });
        }

        // We always re-save if size was > 300KB — quality applies to JPEG only
        const isJpeg = /\.jpe?g$/i.test(filePath);
        await image.write(filePath, isJpeg ? { quality: QUALITY } : undefined);
        console.log(`✅ Compressed: ${path.basename(filePath)} (was ${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (err) {
        console.error(`❌ Failed to process: ${path.basename(filePath)}`, err.message);
    }
}

async function run() {
    console.log('Starting image compression...');
    for (const folder of foldersToCompress) {
        const dir = path.join(uploadsDir, folder);
        if (!fs.existsSync(dir)) continue;

        const files = fs.readdirSync(dir);
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                const filePath = path.join(dir, file);
                await processImage(filePath);
            }
        }
    }
    console.log('🎉 Compression finished!');
}

run();
