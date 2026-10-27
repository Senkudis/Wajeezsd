// تسجيل الدخول بقوقل — مصدر واحد لصفحتي الدخول والتسجيل.
//  • أندرويد (التطبيق): plugin GoogleAuth الأصلي عبر Capacitor.Plugins — يقرأ serverClientId من capacitor.config.
//    يشترط OAuth client لأندرويد ببصمة كل شهادة توقيع (التطوير، الرفع، و Play App Signing).
//  • الويب: Google Identity Services وزرّ Google الرسمي. مكتبة gapi.auth2 (نسخة الويب من الـ plugin)
//    أوقفتها Google للـ clients الجديدة، فلا تُستعمل هنا. الدومين مسجّل في Authorized JavaScript origins.
//  • iOS: مخفي — يحتاج REVERSED_CLIENT_ID في Info.plist، و Apple تشترط «Sign in with Apple» (البند 4.8).
// الخادم يتحقق من التوكن نفسه (/api/auth/google) — التوكن هنا مجرد وسيط.
(function () {
    const WEB_CLIENT_ID = '168664276687-64upjeh9ef6ph9r48jns5k46qe809mel.apps.googleusercontent.com';
    const platform = (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'web';

    const available = () => platform !== 'ios';

    async function nativeIdToken() {
        const GA = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.GoogleAuth;
        if (!GA) throw new Error('GoogleAuth plugin غير متاح');
        try { await GA.signOut(); } catch (_) { /* لا جلسة سابقة — نريد اختيار الحساب كل مرة */ }
        const user = await GA.signIn();
        return user && user.authentication && user.authentication.idToken;
    }

    let gisLoading = null;
    function loadGis() {
        if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
        if (!gisLoading) gisLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => { gisLoading = null; reject(new Error('تعذّر تحميل خدمة Google')); };
            document.head.appendChild(s);
        });
        return gisLoading;
    }

    // يرسم زر Google الرسمي داخل container ويستدعي onToken(idToken) بعد اختيار الحساب
    async function mountWebButton(container, onToken) {
        await loadGis();
        window.google.accounts.id.initialize({
            client_id: WEB_CLIENT_ID,
            callback: (resp) => onToken(resp.credential),
            ux_mode: 'popup',
            auto_select: false,
            cancel_on_tap_outside: true,
        });
        window.google.accounts.id.renderButton(container, {
            type: 'standard', theme: 'outline', size: 'large', shape: 'pill',
            text: 'continue_with', locale: 'ar', logo_alignment: 'left',
            width: Math.min(400, Math.max(220, container.clientWidth || 320)),
        });
    }

    window.WajeezGoogle = { platform, available, nativeIdToken, mountWebButton };
})();
