/**
 * 📸 ما رآه مراجع آبل فعلاً — من لقطاته المرفقة بالرفض.
 *
 * اللقطات كشفت عطلين ما كنتُ أراهما، وكلاهما يُقرأ «تطبيق ناقص»
 * (2.1.0 App Completeness):
 *
 *   ١. **«15560.6 كم» على كل بطاقة محل.** المراجع يفتح التطبيق من خارج
 *      السودان، فالمسافة صحيحة حسابياً وبلا معنى للقارئ. والتوصيل داخل
 *      المدينة أصلاً، فرقمٌ بآلاف الكيلومترات لا يصف بُعد المحل بل يصف أن
 *      العميل ليس في مدينة الخدمة.
 *
 *   ٢. **مربّع أبيض فارغ مكان أيقونة تصنيف.** الأيقونة يكتبها الأدمن نصّاً،
 *      واسمٌ خاطئ أو حقلٌ فارغ كان يُخرج `<i class="bi ">` بلا رسم.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const feature = fs.readFileSync(
    path.join(__dirname, '..', 'public_html', 'js', 'order-feature.js'), 'utf8');

describe('المسافة: رقمٌ مفهوم أو لا رقم', () => {
    it('حدٌّ أعلى معرَّف — التوصيل داخل المدينة', () => {
        expect(feature).toContain('MAX_SHOWN_DISTANCE_KM');
        expect(feature).toContain('function isShowableDistance');
    });

    it('فوق الحدّ: لا تُرسم شارة المسافة أصلاً', () => {
        // لا «15560.6 كم» ولا «--» — البطاقة تبقى كاملة بلا رقمٍ كاذب
        expect(feature).toContain("(p.distanceKm != null ? '' : `<span class=\"dist-loading\"></span>`)");
        expect(feature).toContain('${dist ? `<span class="meta-dot">·</span>');
    });

    it('والتحديث المتأخر يُزيلها كذلك لا يكتب رقماً', () => {
        const i = feature.indexOf('function applyFreshLocation');
        const blk = feature.slice(i, i + 1500);
        expect(blk).toContain('if (isShowableDistance(p.distanceKm)) el.textContent = formatDistance');
        expect(blk).toContain('else el.remove();');
    });

    it('ونافذة التفاصيل تُخفي السطر بدل «يبعد -- كم»', () => {
        expect(feature).toContain("_dEl.style.display = 'none'");
        expect(feature).not.toContain("Number(place.distanceKm).toFixed(1) : '--'");
    });

    it('الرقم يُنسَّق من مكانٍ واحد', () => {
        expect(feature).toContain('function formatDistance');
        // مرّةً واحدة: داخل formatDistance نفسها ولا نسخة ثانية مكتوبة بيدها
        expect((feature.match(/toFixed\(1\)\} كم/g) || []).length).toBe(1);
    });
});

describe('أيقونة التصنيف: احتياطيٌّ دائماً', () => {
    it('اسمٌ غير صالح أو فارغ يسقط إلى bi-shop', () => {
        expect(feature).toContain('function catIcon');
        const i = feature.indexOf('function catIcon');
        const blk = feature.slice(i, i + 260);
        expect(blk).toContain('/^bi-[a-z0-9-]+$/i');
        expect(blk).toContain("'bi-shop'");
    });

    it('ويُستعمل في كل موضعٍ تُرسم فيه أيقونة من بيانات الأدمن', () => {
        // شبكة التصنيفات، وشارة القسم على البطاقة، والغلاف البديل
        expect((feature.match(/catIcon\(/g) || []).length).toBeGreaterThanOrEqual(4);
        expect(feature).not.toContain('<i class="bi ${cat.icon}"');
        expect(feature).not.toContain("(cat && cat.icon) || 'bi-shop'");
    });
});

/**
 * 🖼️ الصندوق الرمادي الفارغ أعلى الشاشة الأولى.
 *
 * ظهر في لقطة App Store: إطارٌ رماديّ بلا محتوى بين الترويسة ونموذج الطلب.
 * سببه أن `onerror` على صورة الإعلان كان يُخفي **الشريحة** ويترك **القسم**
 * مفتوحاً — فإعلانٌ صورته مكسورة يترك إطاره فارغاً في أول ما يراه المستخدم.
 */
describe('قسم الإعلانات لا يترك إطاراً فارغاً', () => {
    const banners = fs.readFileSync(
        path.join(__dirname, '..', 'public_html', 'js', 'home-banners.js'), 'utf8');

    it('فشل الصورة يُعالَج بدالة لا بسطرٍ يُخفي الشريحة وحدها', () => {
        expect(banners).toContain('window.__bannerImgFailed');
        expect(banners).not.toContain("onerror=\"this.parentElement.style.display='none'\"");
    });

    it('وإن لم تبقَ شريحةٌ صالحة يُخفى القسم كلّه', () => {
        const i = banners.indexOf('window.__bannerImgFailed = function');
        const blk = banners.slice(i, i + 700);
        expect(blk).toContain("section.style.display = 'none'");
        expect(blk).toContain('.carousel-item:not([style*="display: none"])');
    });

    it('والقسم يبدأ مخفيّاً ولا يُفتح إلا بإعلانٍ فعلي', () => {
        const index = fs.readFileSync(
            path.join(__dirname, '..', 'public_html', 'index.html'), 'utf8');
        expect(index).toContain('id="home-banners-section" style="display:none;');
        expect(banners).toContain("bannersSection.style.display = 'none';");
    });
});
