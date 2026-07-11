/**
 * generate-icons.js — uses 'sharp' (already in project)
 * Generates Android mipmap icons with proper padding so logo is never cropped.
 *
 * Android Adaptive Icon safe zone: inner 66% of the 108dp canvas is always visible.
 * So foreground image should have the logo within the center 66%, meaning ~17% padding each side.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, 'public_html', 'icons', 'icon-512x512.png');
const RES_DIR = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const ICONS_DIR = path.join(__dirname, 'public_html', 'icons');

// Standard launcher icon sizes (regular, with white bg)
const LAUNCHER_SIZES = {
    'mipmap-ldpi': 36,
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
};

// Adaptive icon foreground sizes (108dp equivalent per density)
const FOREGROUND_SIZES = {
    'mipmap-ldpi': 81,
    'mipmap-mdpi': 108,
    'mipmap-hdpi': 162,
    'mipmap-xhdpi': 216,
    'mipmap-xxhdpi': 324,
    'mipmap-xxxhdpi': 432,
};

async function makeIconWithPadding(inputPath, size, paddingPercent, bgColor, outputPath) {
    const logoSize = Math.round(size * (1 - paddingPercent * 2));
    const pad = Math.round(size * paddingPercent);

    // Resize the logo
    const logoBuffer = await sharp(inputPath)
        .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

    // Create canvas with background and composite logo centered
    await sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: bgColor
        }
    })
        .composite([{ input: logoBuffer, top: pad, left: pad }])
        .png()
        .toFile(outputPath);

    console.log(`✅ ${path.basename(path.dirname(outputPath))}/${path.basename(outputPath)} (${size}x${size})`);
}

async function makeWhiteBackground(size, outputPath) {
    await sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 255 }
        }
    }).png().toFile(outputPath);
    console.log(`✅ background: ${path.basename(outputPath)}`);
}

async function makeNotificationIcon(inputPath, size, outputPath) {
    // Notification icons must be white silhouette on transparent background
    const logoSize = Math.round(size * 0.75);
    const pad = Math.round(size * 0.125);

    const logoBuffer = await sharp(inputPath)
        .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

    // Make it white silhouette
    const whiteBuffer = await sharp(logoBuffer)
        .threshold(128)
        .negate()
        .toBuffer();

    await sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite([{ input: whiteBuffer, top: pad, left: pad }])
        .png()
        .toFile(outputPath);

    console.log(`✅ Notification icon: ${path.basename(outputPath)}`);
}

async function main() {
    console.log('🎨 Generating icons...\n');

    // 1. Regular launcher icons (white bg, 12% padding)
    for (const [folder, size] of Object.entries(LAUNCHER_SIZES)) {
        const dir = path.join(RES_DIR, folder);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const bg = { r: 255, g: 255, b: 255, alpha: 255 };
        await makeIconWithPadding(SOURCE, size, 0.12, bg, path.join(dir, 'ic_launcher.png'));
        await makeIconWithPadding(SOURCE, size, 0.12, bg, path.join(dir, 'ic_launcher_round.png'));
    }

    // 2. Adaptive icon foreground (transparent bg, 18% padding for safe zone)
    for (const [folder, size] of Object.entries(FOREGROUND_SIZES)) {
        const dir = path.join(RES_DIR, folder);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
        await makeIconWithPadding(SOURCE, size, 0.18, transparent, path.join(dir, 'ic_launcher_foreground.png'));

        // White background layer
        await makeWhiteBackground(size, path.join(dir, 'ic_launcher_background.png'));
    }

    // 3. PWA icons (10% padding, white bg)
    const pwaBg = { r: 255, g: 255, b: 255, alpha: 255 };
    await makeIconWithPadding(SOURCE, 192, 0.10, pwaBg, path.join(ICONS_DIR, 'icon-192x192.png'));
    await makeIconWithPadding(SOURCE, 512, 0.10, pwaBg, path.join(ICONS_DIR, 'icon-512x512.png'));
    await makeIconWithPadding(SOURCE, 180, 0.10, pwaBg, path.join(ICONS_DIR, 'apple-touch-icon.png'));

    // 4. Notification icon in drawable
    const drawableDir = path.join(RES_DIR, 'drawable');
    if (!fs.existsSync(drawableDir)) fs.mkdirSync(drawableDir, { recursive: true });
    await makeNotificationIcon(SOURCE, 96, path.join(drawableDir, 'ic_stat_notification.png'));

    console.log('\n🎉 All icons generated! Run: npx cap sync android');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
