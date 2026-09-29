/**
 * 🖼️ صورة المشاركة (Open Graph) لصفحة التعريف — 1200×630.
 *
 * كانت og:image أيقونة التطبيق المربّعة 512×512. واتساب وفيسبوك وتويتر
 * يعرضون المستطيل 1.91:1، فكانت الأيقونة تُقصّ أو تظهر مصغّرةً بلا نصّ —
 * رابط الموقع يُشارَك بلا اسمٍ ولا جملةٍ تقول ما هو.
 *
 * الخلفية والشعار ولقطة التطبيق من ملفات المشروع، والنصّ العربيّ يُرسم
 * بـ pango (يشكّل الحروف ويصلها ويعكس الاتجاه) بخطٍّ من خطوط النظام.
 *
 *   node scripts/gen-og-image.js            ← public_html/og-image.jpg
 *   OG_FONT="C:/Windows/Fonts/segoeuib.ttf" node scripts/gen-og-image.js
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', 'public_html');
const OUT = path.join(ROOT, 'og-image.jpg');
const W = 1200, H = 630;

const FONT_BOLD = process.env.OG_FONT || 'C:/Windows/Fonts/segoeuib.ttf';
const FONT_REG = process.env.OG_FONT_REGULAR || 'C:/Windows/Fonts/segoeui.ttf';

/** نصٌّ مرسومٌ صورةً شفّافة — pango يتولّى التشكيل والاتجاه */
async function text(str, { size, color = '#ffffff', bold = true, width = 640, align = 'right' }) {
    const font = bold ? FONT_BOLD : FONT_REG;
    if (!fs.existsSync(font)) throw new Error(`الخط غير موجود: ${font} — حدّده بـ OG_FONT`);
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return sharp({
        text: {
            text: `<span foreground="${color}">${esc(str)}</span>`,
            fontfile: font,
            font: `${bold ? 'Segoe UI Bold' : 'Segoe UI'} ${size}`,
            width,
            align,
            rgba: true,
            dpi: 72
        }
    }).png().toBuffer();
}

(async () => {
    // خلفيةٌ بتدرّج الهوية نفسها (#04553A ← #023926) وهالةٌ ذهبية خفيفة
    const bg = Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
            <defs>
                <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#067a52"/>
                    <stop offset=".55" stop-color="#04553A"/>
                    <stop offset="1" stop-color="#023926"/>
                </linearGradient>
                <radialGradient id="gold" cx=".85" cy=".1" r=".55">
                    <stop offset="0" stop-color="#e0b448" stop-opacity=".28"/>
                    <stop offset="1" stop-color="#e0b448" stop-opacity="0"/>
                </radialGradient>
                <pattern id="grid" width="46" height="46" patternUnits="userSpaceOnUse">
                    <path d="M46 0H0V46" fill="none" stroke="#ffffff" stroke-opacity=".05" stroke-width="1"/>
                </pattern>
            </defs>
            <rect width="${W}" height="${H}" fill="url(#g)"/>
            <rect width="${W}" height="${H}" fill="url(#grid)"/>
            <rect width="${W}" height="${H}" fill="url(#gold)"/>
        </svg>`);

    // لقطة التطبيق في إطار هاتف — يسار الصورة (النصّ العربيّ يمينها)
    const PHONE_W = 300, PHONE_H = 650, BORDER = 12;
    const shot = await sharp(path.join(ROOT, 'assets/app/home.jpg'))
        .resize(PHONE_W - BORDER * 2, PHONE_H - BORDER * 2, { fit: 'cover', position: 'top' })
        .composite([{
            input: Buffer.from(`<svg width="${PHONE_W - BORDER * 2}" height="${PHONE_H - BORDER * 2}"><rect width="100%" height="100%" rx="30" ry="30"/></svg>`),
            blend: 'dest-in'
        }])
        .png().toBuffer();
    const phone = await sharp(Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="${PHONE_W}" height="${PHONE_H}">
            <rect width="${PHONE_W}" height="${PHONE_H}" rx="42" ry="42" fill="#16241d"/>
        </svg>`))
        .composite([{ input: shot, left: BORDER, top: BORDER }])
        .png().toBuffer();

    const logo = await sharp(path.join(ROOT, 'logo-white.png')).resize({ height: 92 }).png().toBuffer();
    const logoMeta = await sharp(logo).metadata();

    const TEXT_RIGHT = W - 70;              // الحافّة اليمنى لعمود النصّ
    const TEXT_W = 660;
    const title = await text('وجيز - wajeezsd', { size: 64, width: TEXT_W });
    const line1 = await text('تطبيق التوصيل في أم درمان وبورتسودان', { size: 38, width: TEXT_W });
    const line2 = await text('متاجر مدينتك  ·  تتبّع حيّ  ·  كاش عند الاستلام',
        { size: 25, width: TEXT_W, bold: false, color: '#d8efe5' });
    const pill = await text('متاح على Google Play و App Store', { size: 24, color: '#023926', width: 520 });

    const m = async (buf) => sharp(buf).metadata();
    const [tM, l1M, l2M, pM] = await Promise.all([title, line1, line2, pill].map(m));

    // شارة «متاح على…» بخلفية بيضاء مستديرة
    const PAD_X = 26, PAD_Y = 14;
    const pillBox = await sharp(Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="${pM.width + PAD_X * 2}" height="${pM.height + PAD_Y * 2}">
            <rect width="100%" height="100%" rx="${(pM.height + PAD_Y * 2) / 2}" fill="#ffffff"/>
        </svg>`))
        .composite([{ input: pill, left: PAD_X, top: PAD_Y }])
        .png().toBuffer();
    const pbM = await sharp(pillBox).metadata();

    // الهاتف يخرج من أسفل الإطار — عمقٌ لا قصٌّ ظاهر. sharp يشترط أن تسع
    // الطبقة الإطار، فيُقتطع الجزء الظاهر وحده.
    const PHONE_TOP = 120;
    const phoneVisible = await sharp(phone)
        .extract({ left: 0, top: 0, width: PHONE_W, height: H - PHONE_TOP })
        .png().toBuffer();

    let y = 92;
    const layers = [
        { input: phoneVisible, left: 90, top: PHONE_TOP },
        { input: logo, left: TEXT_RIGHT - logoMeta.width, top: y }
    ];
    y += logoMeta.height + 34;
    layers.push({ input: title, left: TEXT_RIGHT - tM.width, top: y });   y += tM.height + 14;
    layers.push({ input: line1, left: TEXT_RIGHT - l1M.width, top: y });  y += l1M.height + 18;
    layers.push({ input: line2, left: TEXT_RIGHT - l2M.width, top: y });  y += l2M.height + 36;
    layers.push({ input: pillBox, left: TEXT_RIGHT - pbM.width, top: y });

    await sharp(bg).composite(layers).jpeg({ quality: 86, mozjpeg: true }).toFile(OUT);
    const size = fs.statSync(OUT).size;
    console.log(`og-image.jpg  ${W}×${H}  ${(size / 1024).toFixed(0)} KB`);
})().catch((e) => { console.error(e.message); process.exit(1); });
