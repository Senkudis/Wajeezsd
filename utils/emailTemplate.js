/**
 * قالب بريد كود التحقق لتطبيق وجيز.
 *
 * مكتوب لعملاء البريد لا للمتصفح: تخطيط بالجداول وتنسيق مضمَّن في كل عنصر (Gmail يحذف أغلب
 * <style> وOutlook لا يفهم flex/grid)، وخطوط النظام فقط (لا تُحمَّل خطوط ويب في أغلب العملاء).
 * الشعار صورة مستضافة على الموقع (public_html/email/logo-white.png) بنص بديل إن حُجبت الصور.
 *
 * @param {string} code - كود التحقق
 * @param {{title?: string, intro?: string, minutes?: number}} [opts]
 *        العنوان والنص بحسب الغرض (تفعيل، استعادة…)، ومدة صلاحية الكود بالدقائق
 * @returns {string} HTML
 */
const SITE = 'https://wajeezsd.com';
const C = { green: '#048c5b', deep: '#033A27', ink: '#0d1117', text: '#3f4a55', muted: '#6b7680', gold: '#F5A623', bg: '#eef3f0' };
const FONT = "Tahoma, 'Segoe UI', Arial, sans-serif";

const getVerificationEmailTemplate = (code, opts = {}) => {
    const title = opts.title || 'تفعيل حسابك';
    const intro = opts.intro || 'مرحباً بك في <strong>وجيز</strong>. استخدم الكود أدناه لإتمام تفعيل حسابك:';
    const minutes = Number(opts.minutes) || 10;
    const year = new Date().getFullYear();
    const digits = String(code);

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title} — وجيز</title>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};-webkit-text-size-adjust:100%;">
<!-- نص المعاينة في صندوق الوارد -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">كود التحقق: ${digits} — صالح لمدة ${minutes} دقائق.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.bg};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:18px;overflow:hidden;">
    <!-- الرأس -->
    <tr><td align="center" bgcolor="${C.deep}" style="background-color:${C.deep};background-image:linear-gradient(135deg,${C.green} 0%,${C.deep} 100%);padding:30px 24px;">
      <img src="${SITE}/email/logo-white.png" width="150" alt="وجيز" style="display:block;width:150px;max-width:150px;height:auto;border:0;color:#ffffff;font-family:${FONT};font-size:28px;font-weight:bold;">
    </td></tr>
    <!-- المحتوى -->
    <tr><td dir="rtl" style="padding:36px 32px 8px 32px;font-family:${FONT};text-align:right;">
      <h1 style="margin:0 0 14px 0;font-size:22px;line-height:1.4;color:${C.ink};font-weight:bold;">${title}</h1>
      <p style="margin:0;font-size:15px;line-height:1.9;color:${C.text};">${intro}</p>
    </td></tr>
    <!-- الكود -->
    <tr><td align="center" style="padding:26px 32px 6px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
        <tr><td dir="ltr" align="center" style="background-color:#f0f7f3;border:1px solid #cfe5da;border-radius:14px;padding:18px 28px;font-family:'Courier New',Courier,monospace;font-size:36px;line-height:1;font-weight:bold;letter-spacing:10px;color:${C.deep};">${digits}</td></tr>
      </table>
      <p style="margin:12px 0 0 0;font-family:${FONT};font-size:13px;color:${C.muted};">الكود صالح لمدة <strong style="color:${C.ink};">${minutes} دقائق</strong></p>
    </td></tr>
    <!-- تنبيه أمني -->
    <tr><td style="padding:24px 32px 0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td dir="rtl" style="background-color:#fff8eb;border-right:4px solid ${C.gold};border-radius:10px;padding:14px 16px;font-family:${FONT};font-size:13px;line-height:1.8;color:#5c4a1f;text-align:right;">
          لا تشارك هذا الكود مع أي شخص. فريق وجيز لن يطلبه منك أبداً، لا بالاتصال ولا بالرسائل.
        </td></tr>
      </table>
    </td></tr>
    <tr><td dir="rtl" style="padding:18px 32px 32px 32px;font-family:${FONT};font-size:13px;line-height:1.8;color:${C.muted};text-align:right;">
      إذا لم تطلب هذا الكود فتجاهل هذه الرسالة، ولن يتغيّر شيء في حسابك.
    </td></tr>
    <!-- التذييل -->
    <tr><td align="center" style="background-color:#f7f9f8;border-top:1px solid #e6ece9;padding:20px 24px;font-family:${FONT};font-size:12px;line-height:1.9;color:${C.muted};">
      <strong style="color:${C.deep};">وجيز</strong> — توصيل لكل ما تحتاجه<br>
      <a href="${SITE}" style="color:${C.green};text-decoration:none;">wajeezsd.com</a>
      &nbsp;·&nbsp;
      <a href="${SITE}/privacy-policy.html" style="color:${C.green};text-decoration:none;">سياسة الخصوصية</a><br>
      هذه رسالة آلية، يرجى عدم الرد عليها. &copy; ${year} وجيز
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
};

module.exports = { getVerificationEmailTemplate };
