/**
 * ♿ الإتاحة في المحادثة — خمسُ سماتٍ في 1944 سطراً، وأثقلُ عيبٍ فيها
 *    أنّ المحادثة نفسها كانت صامتة.
 *
 *   ١. **الرسائل الواردة لا تُعلَن.** `#chatContainer` تُحقن فيه الرسائل من
 *      السوكت بلا `aria-live` ولا `role="log"`. من يستعمل قارئ شاشة لا
 *      يعلم أن رسالةً وصلت أصلاً — يبقى ينتظر ردّاً وصل قبل دقائق.
 *
 *   ٢. **لا يُعرَف مَن أرسل.** الفقاعة تتمايز بالمحاذاة واللون وحدهما،
 *      وكلاهما لا يصل القارئ. ورسالتي بلا اسمٍ إطلاقاً (الاسم يُعرض
 *      للوارد فقط). صارت تُسبَق بـ «أنت:» أو «رسالة واردة:» نصّاً للقارئ.
 *
 *   ٣. **الصورة لا تُفتح بالكيبورد.** `<img class="msg-image" onclick=
 *      "openLightbox(this.src)">` — صورةٌ بمستمع نقرٍ لا تُركَّز ولا تُفعَّل
 *      بـ Enter. صارت داخل `<button>` مسمّى.
 *
 *   ٤. **حالة الرسالة ثلاثُ أيقوناتٍ صامتة**: ساعةٌ وصحٌّ وصحّان. والفرق
 *      بين «أُرسلت» و«قُرئت» يهمّ المستخدم.
 *
 *   ٥. **حقل الكتابة وزرّ الإرسال بلا اسم**، وبانر الاتصال ومؤشّر «يكتب»
 *      يتبدّلان بصمت.
 *
 *   ٦. و`alert()` خام على مسار 403 (الطلب منتهٍ) رغم أن SweetAlert محمَّلٌ
 *      في الصفحة — يحجب الواجهة ويبدو غريباً داخل التطبيق المغلَّف.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public_html/chat.html'), 'utf8');

const near = (anchor, span = 300) => {
    const i = html.indexOf(anchor);
    expect(i, 'لم يُعثر على ' + anchor).toBeGreaterThan(-1);
    return html.slice(i, i + span);
};

describe('المحادثة تُعلِن ما يصلها', () => {
    it('حاوية الرسائل سجلٌّ حيّ', () => {
        const tag = near('id="chatContainer"', 140);
        expect(tag).toContain('role="log"');
        expect(tag).toContain('aria-live="polite"');
        expect(tag).toContain('aria-label="الرسائل"');
    });

    it('وبانر الاتصال يُعلَن عند تبدّله', () => {
        expect(near('id="connectionBanner"', 120)).toContain('role="status"');
    });

    it('ومؤشّر «يكتب» كذلك، ونقاطه الثلاث صامتة', () => {
        const i = html.indexOf('id="typingIndicator"');
        const blk = html.slice(i, i + 400);
        expect(blk).toContain('role="status"');
        expect(blk.match(/class="dot" aria-hidden="true"/g) || []).toHaveLength(3);
    });

    it('وحالة «متصل / غير متصل» في الترويسة', () => {
        expect(near('id="statusText"', 140)).toContain('aria-live="polite"');
    });
});

describe('الفقاعة تقول من أرسلها وما حالتها', () => {
    it('رسالتي تُسبَق بـ «أنت:» والواردة المجهولة بـ «رسالة واردة:»', () => {
        const i = html.indexOf('const nameHtml = senderName && !isMe');
        const blk = html.slice(i, i + 400);
        expect(blk).toContain("isMe ? 'أنت:' : 'رسالة واردة:'");
        expect(blk).toContain('class="sr-only"');
    });

    it('و sr-only مُعرَّفةٌ فعلاً لا مجرّد صنفٍ مُستعمَل', () => {
        const i = html.indexOf('.sr-only {');
        expect(i).toBeGreaterThan(-1);
        const css = html.slice(i, i + 260);
        expect(css).toContain('position: absolute');
        expect(css).toContain('clip: rect(0, 0, 0, 0)');
    });

    it('وحالة الإرسال نصٌّ لا أيقونةٌ صامتة', () => {
        expect(html).toContain("const STATUS_LABEL = { sending: 'قيد الإرسال', sent: 'أُرسلت', read: 'قُرئت' };");
        expect(html).toContain('aria-label="${STATUS_LABEL[initialStatus]}"');
    });

    it('و setMessageStatus تُبقي النصّ متطابقاً مع الأيقونة', () => {
        const i = html.indexOf('function setMessageStatus');
        const blk = html.slice(i, i + 1200);
        expect(blk).toContain("statusEl.setAttribute('aria-label', STATUS_LABEL[status])");
        expect(blk.match(/aria-hidden="true"/g) || []).toHaveLength(3);
    });
});

describe('الصورة تُفتح بالكيبورد', () => {
    it('داخل زرٍّ مسمّى لا <img onclick>', () => {
        const i = html.indexOf('mediaHtml = `<button type="button" class="msg-image-btn"');
        expect(i, 'الصورة ما زالت <img onclick>').toBeGreaterThan(-1);
        const blk = html.slice(i, i + 420);
        expect(blk).toContain('aria-label="فتح الصورة بالحجم الكامل"');
        expect(blk).toContain('alt="صورة مُرسَلة"');
        expect(html).not.toContain('onclick="openLightbox(this.src)"');
    });

    it('وللزرّ تركيزٌ مرئيّ', () => {
        expect(html).toContain('.msg-image-btn:focus-visible');
        const i = html.indexOf('.msg-image-btn {');
        expect(html.slice(i, i + 200)).toContain('background: none; border: 0;');
    });

    it('والعارض نافذةٌ حاجبة', () => {
        const tag = near('id="imgLightbox"', 260);
        expect(tag).toContain('role="dialog"');
        expect(tag).toContain('aria-modal="true"');
    });
});

describe('شريط الإدخال والترويسة', () => {
    it('حقل الكتابة وزرّ الإرسال لهما أسماء', () => {
        expect(near('id="messageInput"', 200)).toContain('aria-label="اكتب رسالة"');
        expect(near('id="sendBtn"', 200)).toContain('aria-label="إرسال"');
    });

    it('وزرّ الرجوع', () => {
        expect(html).toContain('onclick="goBack()" aria-label="رجوع"');
    });

    it('والصورة الرمزية زخرفةٌ — الحالة تُقرأ من نصّها لا من نقطتها', () => {
        expect(near('id="chatAvatar"', 120)).toContain('aria-hidden="true"');
    });
});

describe('لا alert() خام على مسارٍ حيّ', () => {
    it('رفض 403 يمرّ عبر SweetAlert المحمَّل في الصفحة', () => {
        // ثلاثة مواضع تفحص 403؛ المقصود هنا مسار إرسال الرسالة
        const i = html.indexOf("} else if (res.status === 403) {", html.indexOf('async function sendMessage'));
        expect(i).toBeGreaterThan(-1);
        const blk = html.slice(i, i + 900);
        expect(blk).toContain('await Swal.fire({');
        expect(blk).toContain("title: 'تعذّر الإرسال'");
        expect(blk).not.toMatch(/\n\s+alert\(/);
    });

    it('ولم يبقَ alert إلا بديلاً حين يغيب Swal نفسه', () => {
        const calls = [...html.matchAll(/[^.a-zA-Z]alert\(/g)];
        expect(calls).toHaveLength(1);
        const i = html.indexOf("alert('رابط المحادثة غير صالح')");
        expect(i).toBeGreaterThan(-1);
        // يقع داخل فرع else التابع لفحص وجود Swal
        expect(html.slice(Math.max(0, i - 700), i)).toContain("typeof Swal !== 'undefined'");
    });
});
