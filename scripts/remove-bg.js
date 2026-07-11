/**
 * remove-bg.js — removes white background from logo
 * Usage: node remove-bg.js [input.png] [output.png]
 */
const jimpModule = require('jimp');
const Jimp = jimpModule.Jimp || jimpModule;

const inputPath = process.argv[2] || 'public_html/logo.png';
const outputPath = process.argv[3] || 'public_html/logo-transparent.png';

// Tolerance for white detection (0-255).  25 = remove near-whites too
const THRESHOLD = 25;

(async () => {
    console.log('📂 Reading:', inputPath);
    const img = await Jimp.read(inputPath);

    const { width, height, data } = img.bitmap;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // If pixel is close to white → make transparent
            if (r >= 255 - THRESHOLD && g >= 255 - THRESHOLD && b >= 255 - THRESHOLD) {
                const whiteness = Math.min(r, g, b);
                const alphaRatio = (whiteness - (255 - THRESHOLD)) / THRESHOLD;
                data[idx + 3] = Math.max(0, Math.round((1 - alphaRatio) * 255));
            }
        }
    }

    await img.write(outputPath);
    console.log('✅ Saved:', outputPath, `(${width}x${height}px)`);
})().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
