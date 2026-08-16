/**
 * ثوابت العرض لموقع بطاقات الفريق.
 *
 * رقم الدعم هنا هو رقم التواصل الوحيد الظاهر في الموقع كله: بطاقة العضو لا
 * تعرض رقمه الشخصي إطلاقاً (البطاقة تُفقَد وتُمسَح من الغرباء)، فمن وجد بطاقة
 * أو أراد التحقق من كابتن يمرّ عبر الدعم الرسمي.
 */

export const BRAND_NAME = 'وجيز';
export const SUPPORT_PHONE = '+249112046348';
export const SUPPORT_WHATSAPP = '249112046348';
export const MAIN_SITE_URL = 'https://wajeezsd.com';

/** صورة رمزية محايدة تُرسم بدل صورة مكسورة أو غائبة. */
export const AVATAR_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>" +
      "<rect width='120' height='120' fill='#e8f0ec'/>" +
      "<circle cx='60' cy='47' r='22' fill='#b6cec3'/>" +
      "<path d='M18 116c0-23 19-42 42-42s42 19 42 42' fill='#b6cec3'/>" +
      '</svg>'
  );
