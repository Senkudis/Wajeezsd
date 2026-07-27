#!/usr/bin/env node
/**
 * 🍎 توليد أصول iOS (أيقونة App Store + شاشة البداية)
 *
 * المشكلة التي يحلّها:
 *   - resources/icon.png مقاسه 744×658 (غير مربّع) وبخلفية شفافة، والحلقة فيه
 *     بيضاء — أي أنه غير صالح إطلاقاً لأيقونة App Store: Apple ترفض أي أيقونة
 *     فيها قناة ألفا أو شفافية، وتطلب 1024×1024 بالضبط.
 *   - الحلقة البيضاء تختفي على خلفية بيضاء، فنُعيد تلوينها بالأخضر (#04553A)
 *     لتطابق أيقونة أندرويد الحالية (حلقة خضراء + سهم ذهبي على أبيض).
 *
 * المخرجات في resources/ios/:
 *   icon.png         1024×1024 معتمة تماماً بلا قناة ألفا (RGB)
 *   splash.png       2732×2732 خلفية العلامة + الشعار الأبيض
 *   splash-dark.png  نسخة الوضع الليلي (نفس الخلفية الخضراء)
 *
 * الاستخدام:
 *   node scripts/gen-ios-assets.js
 * ثم على الـ Mac بعد `npx cap add ios`:
 *   npx capacitor-assets generate --ios --assetPath resources/ios
 *
 * ملاحظة: يعتمد على jimp (تبعية إنتاج) و sharp (يأتي مع @capacitor/assets).
 * sharp وحده يستطيع كتابة PNG بلا قناة ألفا — وهو شرط قبول الأيقونة.
 */

const path = require('path');
const fs = require('fs');
const { Jimp } = require('jimp');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'resources', 'ios');
const TMP = path.join(OUT_DIR, '.tmp.png');

const BRAND_GREEN = { r: 0x04, g: 0x55, b: 0x3a };
const ICON_SIZE = 1024;
const SPLASH_SIZE = 2732;

// نسبة المساحة التي يشغلها الرمز داخل الأيقونة. Apple تقصّ الزوايا بنفسها،
// فالهامش يمنع قصّ أطراف الرمز على الأجهزة المستديرة الحواف.
const ICON_MARK_RATIO = 0.72;
const SPLASH_LOGO_RATIO = 0.52;

/** يستبدل كل بكسل أبيض (الحلقة) بالأخضر مع الحفاظ على الألفا (نعومة الحواف) */
function recolorWhiteToGreen(img) {
    const { width, height, data } = img.bitmap;
    img.scan(0, 0, width, height, (x, y, idx) => {
        if (data[idx + 3] === 0) return;                       // شفاف تماماً
        const [r, g, b] = [data[idx], data[idx + 1], data[idx + 2]];
        // الأبيض وتدرجاته الفاتحة فقط — السهم الذهبي (227,149,3) لا يتأثر
        if (r > 200 && g > 200 && b > 200) {
            data[idx] = BRAND_GREEN.r;
            data[idx + 1] = BRAND_GREEN.g;
            data[idx + 2] = BRAND_GREEN.b;
        }
    });
    return img;
}

/** يضع صورة داخل مربّع بخلفية معتمة، ثم يكتب PNG بلا قناة ألفا */
async function renderSquare({ source, size, ratio, background, recolor, outFile }) {
    const src = await Jimp.read(source);
    if (recolor) recolorWhiteToGreen(src);

    // احتواء (contain) داخل المربّع مع الحفاظ على النسبة
    const target = Math.round(size * ratio);
    const scale = Math.min(target / src.bitmap.width, target / src.bitmap.height);
    src.resize({
        w: Math.max(1, Math.round(src.bitmap.width * scale)),
        h: Math.max(1, Math.round(src.bitmap.height * scale))
    });

    const canvas = new Jimp({ width: size, height: size, color: background });
    canvas.composite(
        src,
        Math.round((size - src.bitmap.width) / 2),
        Math.round((size - src.bitmap.height) / 2)
    );
    await canvas.write(TMP);

    // removeAlpha ⇒ PNG بنوع لون RGB. Jimp يكتب RGBA دائماً، وApple ترفض وجود
    // القناة أصلاً حتى لو كانت معتمة بالكامل.
    await sharp(TMP)
        .flatten({ background })
        .removeAlpha()
        .png({ compressionLevel: 9 })
        .toFile(outFile);

    const meta = await sharp(outFile).metadata();
    console.log(
        `✅ ${path.relative(ROOT, outFile)} — ${meta.width}×${meta.height}, `
        + `channels=${meta.channels}, hasAlpha=${meta.hasAlpha}`
    );
    if (meta.hasAlpha) throw new Error('الملف ما زال يحتوي قناة ألفا — سيُرفض من App Store');
}

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    await renderSquare({
        source: path.join(ROOT, 'resources', 'icon.png'),
        size: ICON_SIZE,
        ratio: ICON_MARK_RATIO,
        background: '#FFFFFF',
        recolor: true,
        outFile: path.join(OUT_DIR, 'icon.png')
    });

    for (const name of ['splash.png', 'splash-dark.png']) {
        await renderSquare({
            source: path.join(ROOT, 'logo-white.png'),
            size: SPLASH_SIZE,
            ratio: SPLASH_LOGO_RATIO,
            background: '#04553A',
            recolor: false,
            outFile: path.join(OUT_DIR, name)
        });
    }

    if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
    console.log('\n🍎 جاهز. على الـ Mac: npx capacitor-assets generate --ios --assetPath resources/ios');
})().catch((err) => {
    console.error('❌ فشل التوليد:', err.message);
    process.exit(1);
});
