const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function makeIcons() {
    console.log('🖼️ Creating App Icons and Splash Screens...');

    if (!fs.existsSync('assets')) {
        fs.mkdirSync('assets');
    }

    const logo = await loadImage('public_html/logo-transparent.png');

    // 1. Icon (1024x1024) - White background 
    // Android icons circle-crop the image, so we must add generous padding 
    // to ensure the logo is fully visible and not cut off on the edges.
    const iconCanvas = createCanvas(1024, 1024);
    const iconCtx = iconCanvas.getContext('2d');

    iconCtx.fillStyle = '#ffffff';
    iconCtx.fillRect(0, 0, 1024, 1024);

    // Scale logo to 65% of width to ensure it fits perfectly inside any phone's icon mask
    const scale = (1024 * 0.65) / logo.width;
    const drawWidth = logo.width * scale;
    const drawHeight = logo.height * scale;
    const x = (1024 - drawWidth) / 2;
    const y = (1024 - drawHeight) / 2;

    iconCtx.drawImage(logo, x, y, drawWidth, drawHeight);

    const iconOut = fs.createWriteStream('assets/icon.png');
    iconCanvas.createPNGStream().pipe(iconOut);

    // 2. Splash Screen (2732x2732) - Green background like the app
    const splashCanvas = createCanvas(2732, 2732);
    const splashCtx = splashCanvas.getContext('2d');

    // Wassili Green
    splashCtx.fillStyle = '#0a8754';
    splashCtx.fillRect(0, 0, 2732, 2732);

    // Center logo on splash screen
    const splashScale = (2732 * 0.35) / logo.width;
    const splashW = logo.width * splashScale;
    const splashH = logo.height * splashScale;
    const splashX = (2732 - splashW) / 2;
    const splashY = (2732 - splashH) / 2;

    splashCtx.drawImage(logo, splashX, splashY, splashW, splashH);

    const splashOut = fs.createWriteStream('assets/splash.png');
    splashCanvas.createPNGStream().pipe(splashOut);

    console.log('✅ assets/icon.png and assets/splash.png created!');
}

makeIcons();
