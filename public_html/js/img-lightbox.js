/**
 * 🖼️ عارض صور داخل الصفحة.
 *
 * العطل: الصور كانت تُفتح بـ `target="_blank"` أو `window.open(src)`. وهذا
 * داخل تطبيق Capacitor **يخرج من التطبيق** إلى متصفّح النظام: يفقد المستخدم
 * سياقه، ويعود بضغطة رجوعٍ تُعيد تحميل الصفحة من أوّلها، وقد لا يعود أصلاً.
 * وفي وثائق الكابتن تحديداً — حيث يقلّب الأدمن هويةً ورخصةً وسيلفي — كان كل
 * نقرةٍ قفزةً خارج التطبيق.
 *
 * الاستعمال:
 *   window.openImage(src)                     ← برمجياً
 *   <img data-lightbox src="...">             ← نقرةٌ تفتحه
 *   <a data-lightbox href="...">              ← يُمنع الانتقال ويُعرض بدله
 *
 * التفويض على مستوى المستند، فيعمل مع المحتوى المُضاف لاحقاً بلا إعادة ربط.
 */
(function () {
    'use strict';

    let overlay = null;
    let imgEl = null;

    function build() {
        if (overlay) return;

        overlay = document.createElement('div');
        overlay.className = 'wj-lightbox';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'عرض الصورة');
        overlay.innerHTML =
            '<button type="button" class="wj-lightbox-x" aria-label="إغلاق">&times;</button>' +
            '<img alt="">';

        const style = document.createElement('style');
        style.textContent =
            '.wj-lightbox{position:fixed;inset:0;z-index:2147483000;display:none;' +
            'align-items:center;justify-content:center;background:rgba(0,0,0,.92);' +
            'padding:calc(16px + var(--sat,0px)) 16px calc(16px + var(--sab,0px));}' +
            '.wj-lightbox.open{display:flex;}' +
            '.wj-lightbox img{max-width:100%;max-height:100%;object-fit:contain;' +
            'border-radius:8px;}' +
            '.wj-lightbox-x{position:absolute;top:calc(10px + var(--sat,0px));' +
            'inset-inline-end:14px;width:40px;height:40px;border:0;border-radius:50%;' +
            'background:rgba(255,255,255,.15);color:#fff;font-size:26px;line-height:1;' +
            'cursor:pointer;}';

        document.head.appendChild(style);
        document.body.appendChild(overlay);
        imgEl = overlay.querySelector('img');

        overlay.addEventListener('click', (e) => {
            // الإغلاق بالنقر على الخلفية أو زرّ الإغلاق — لا على الصورة نفسها
            if (e.target === imgEl) return;
            close();
        });
    }

    function close() {
        if (!overlay) return;
        overlay.classList.remove('open');
        imgEl.src = '';
        document.body.style.overflow = '';
    }

    window.openImage = function (src) {
        if (!src) return;
        build();
        imgEl.src = src;
        overlay.classList.add('open');
        // منع تمرير ما خلف العارض
        document.body.style.overflow = 'hidden';
    };

    window.closeImage = close;

    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-lightbox]');
        if (!el) return;
        const src = el.tagName === 'IMG' ? el.src : (el.getAttribute('href') || '');
        if (!src) return;
        // 🔑 على الروابط: نمنع الانتقال، وهو أصل الخروج من التطبيق
        e.preventDefault();
        window.openImage(src);
    }, true);

    // زرّ الرجوع يُغلق العارض بدل مغادرة الصفحة
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) close();
    });
})();
