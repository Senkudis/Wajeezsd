/**
 * ⌨️ ارتفاع لوحة المفاتيح كمتغيّر CSS: `--kb`.
 *
 * المشكلة: عند فتح الكيبورد على الهاتف تُقلَّص **نافذة العرض المرئية**
 * (visual viewport) وحدها، بينما نافذة التخطيط (layout viewport) تبقى كما
 * هي. فصفحةٌ ارتفاعها 100dvh لا تشعر بشيء، ويبقى شريط الإدخال في مكانه
 * أسفل التخطيط — أي **خلف الكيبورد**. والمستخدم يكتب ولا يرى ما يكتب.
 *
 * و`dvh` لا يحلّ هذا: هي تتعامل مع أشرطة المتصفّح المتحرّكة لا مع الكيبورد.
 *
 * الحل: نقيس الفرق ونُصدّره في `--kb`، وتقرّر كل صفحة ماذا تفعل به.
 * المحادثة تستعمله هكذا:
 *     body { height: calc(100dvh - var(--kb, 0px)); }
 * فينكمش غلاف التطبيق كلّه، ويرتفع شريط الإدخال بحكم تخطيط flex لا بإزاحة
 * يدوية — ولذلك تبقى قائمة الرسائل قابلة للتمرير على ما بقي من الشاشة.
 *
 * لماذا متغيّر لا إزاحة مباشرة: الإزاحة (transform) على شريط الإدخال ترفعه
 * فوق الكيبورد لكنها تترك فراغاً ميتاً تحته وتُبقي قائمة الرسائل بطولها
 * الأصلي، فتختفي آخر الرسائل خلف الكيبورد. تقليص الغلاف يُصلح الاثنين معاً.
 *
 * يعمل بلا أثر حيث لا يوجد visualViewport (متصفّحات قديمة) — يبقى `--kb`
 * صفراً والسلوك كما كان.
 */
(function () {
    'use strict';

    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;

    // 🔢 عتبة صغيرة: تغيّرات بضعة بكسلات تأتي من شريط عنوان المتصفّح وهو
    //    يظهر ويختفي مع التمرير، لا من كيبورد. اعتبارها كيبورداً يجعل
    //    الصفحة ترتجف أثناء التمرير العادي.
    const MIN_KEYBOARD_PX = 120;

    let raf = 0;

    function measure() {
        raf = 0;

        // ارتفاع نافذة التخطيط ناقص ما يظهر منها فعلاً = ما تحجبه لوحة المفاتيح.
        // offsetTop ضروري: iOS قد يُزيح النافذة المرئية لأعلى بدل تقليصها.
        const layoutH = root.clientHeight;
        const overlap = Math.max(0, Math.round(layoutH - (vv.height + vv.offsetTop)));

        // 📏 ارتفاع نافذة التخطيط بالبكسل.
        //
        // ⚠️ سببُ عطلٍ حقيقي: الصفحة كانت تعتمد `100dvh`، وهي وحدة لا تعرفها
        //    إصدارات WebView أقدم من Chrome 108. وفي CSS، إعلانٌ بوحدة مجهولة
        //    **يُهمل كلّه** — فتسقط `calc(100dvh - var(--kb))` بجملتها ويبقى
        //    `height:100vh` السابق، أي أن طرح الكيبورد لا يحدث إطلاقاً مهما
        //    قِيس بدقّة. والهاتف القديم هو بالضبط هاتف كثيرٍ من مستعملينا.
        //    نُصدّر الارتفاع بالبكسل ليصير الحساب صالحاً في كل متصفّح.
        if (layoutH > 0) {
            const prevH = parseInt(root.style.getPropertyValue('--app-h'), 10) || 0;
            if (Math.abs(layoutH - prevH) >= 2) root.style.setProperty('--app-h', layoutH + 'px');
        }

        const kb = overlap >= MIN_KEYBOARD_PX ? overlap : 0;
        const prev = parseInt(root.style.getPropertyValue('--kb'), 10) || 0;
        if (kb === prev) return;

        root.style.setProperty('--kb', kb + 'px');
        // 🏷️ صنفٌ على الجذر ليمكن للصفحات إخفاء عناصر غير أساسية وقت الكتابة
        root.classList.toggle('kb-open', kb > 0);

        // 📜 مع فتح الكيبورد تنكمش المساحة، فآخر رسالة قد تخرج من المشهد.
        //    نُبقيها ظاهرة — وهي الرسالة التي يردّ عليها المستخدم غالباً.
        if (kb > 0) {
            const list = document.querySelector('[data-kb-scroll], .chat-container');
            if (list) {
                requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
            }
        }
    }

    function schedule() {
        // ⏱️ التجميع في إطار واحد: iOS يُطلق resize و scroll عشرات المرّات
        //    أثناء انزلاق الكيبورد، وقياسٌ لكل حدث يعني تخطيطاً متكرّراً
        //    ورعشةً مرئية.
        if (!raf) raf = requestAnimationFrame(measure);
    }

    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    // تدوير الشاشة يغيّر نافذة التخطيط بلا حدث من visualViewport أحياناً
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', () => setTimeout(schedule, 120));

    // إغلاق الكيبورد بلا حدث resize يحدث على بعض الأجهزة — نُصفّر عند فقدان
    // التركيز احتياطاً.
    document.addEventListener('focusout', () => setTimeout(schedule, 60), true);

    schedule();
})();
