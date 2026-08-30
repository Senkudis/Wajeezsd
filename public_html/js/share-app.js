/**
 * 📤 مشاركة التطبيق.
 *
 * الرابط يأتي من playStoreLink في إعدادات الأدمن (عبر /api/auth/app-config) لا مثبّتاً
 * في الكود: إن تغيّر رابط المتجر أو أُضيفت منصّة أخرى، يُضبط من اللوحة بلا نشر جديد.
 * يُخزَّن في الجلسة فلا يُطلب مع كل ضغطة.
 *
 * ورقة المشاركة الأصلية (navigator.share) هي المسار المفضّل: تعرض واتساب وغيره كما
 * اعتاد المستخدم. حين تغيب — متصفّح سطح مكتب مثلاً — ننسخ الرابط ونُعلم المستخدم،
 * لأن زرّاً لا يفعل شيئاً أسوأ من غيابه.
 */
(function () {
    'use strict';

    var FALLBACK_URL = 'https://play.google.com/store/apps/details?id=com.wajeezsd.app';
    var CACHE_KEY = 'wajeez_share_link';

    function apiBase() {
        return window.API_BASE_URL || window.API_URL || 'https://wajeezsd.com';
    }

    function getShareUrl() {
        var cached = null;
        try { cached = sessionStorage.getItem(CACHE_KEY); } catch (_) {}
        if (cached) return Promise.resolve(cached);

        return fetch(apiBase() + '/api/auth/app-config')
            .then(function (r) { return r.ok ? r.json() : {}; })
            .then(function (cfg) {
                var url = (cfg && cfg.playStoreLink) || FALLBACK_URL;
                try { sessionStorage.setItem(CACHE_KEY, url); } catch (_) {}
                return url;
            })
            .catch(function () { return FALLBACK_URL; });
    }

    function toast(msg, ok) {
        if (window.Swal) {
            Swal.fire({
                toast: true, position: 'top', icon: ok ? 'success' : 'info',
                title: msg, showConfirmButton: false, timer: 2600, timerProgressBar: true
            });
        } else {
            alert(msg);
        }
    }

    /**
     * الملاذ الأخير حين يُرفض النسخ (سياق غير آمن، أو منع من المتصفح):
     * نعرض الرابط في حقل قابل للتحديد بدل إظهاره في تنبيه يختفي — رابطٌ طويل
     * يمرّ في ثانيتين لا يستطيع أحد استعماله.
     */
    function showLinkDialog(url) {
        if (!window.Swal) { window.prompt('انسخ الرابط:', url); return; }
        Swal.fire({
            title: 'شارك وجيز',
            html: '<p style="font-size:13px;color:#64748b;margin-bottom:10px;">انسخ الرابط وأرسله لأصحابك</p>' +
                  '<input id="wj-share-input" class="swal2-input" readonly value="' +
                  String(url).replace(/"/g, '&quot;') + '" style="font-size:12px;direction:ltr;text-align:left;">',
            confirmButtonText: 'نسخ',
            confirmButtonColor: '#04553A',
            showCancelButton: true,
            cancelButtonText: 'إغلاق',
            didOpen: function () {
                var el = document.getElementById('wj-share-input');
                if (el) { el.focus(); el.select(); }
            },
            preConfirm: function () {
                var el = document.getElementById('wj-share-input');
                if (el) { el.select(); try { document.execCommand('copy'); } catch (_) {} }
            }
        });
    }

    function copyFallback(text) {
        // clipboard API يحتاج سياقاً آمناً؛ نرجع لطريقة قديمة تعمل في كل مكان
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                ok ? resolve() : reject(new Error('copy failed'));
            } catch (e) { reject(e); }
        });
    }

    /**
     * يفتح ورقة المشاركة، أو ينسخ الرابط حين تغيب.
     * @param {string} [source] من أين ضُغط الزر — للتتبّع لاحقاً إن لزم
     */
    window.shareApp = function (source) {
        getShareUrl().then(function (url) {
            var title = 'وجيز — توصيل وتسوّق';
            var text = 'جرّب تطبيق وجيز: توصيل سريع وتسوّق من محلات قريبة منك بكل سهولة.';

            if (navigator.share) {
                navigator.share({ title: title, text: text, url: url })
                    .catch(function (e) {
                        // إلغاء المستخدم ليس خطأً — لا نُزعجه برسالة
                        if (e && e.name === 'AbortError') return;
                        copyFallback(text + '\n' + url)
                            .then(function () { toast('تم نسخ رابط التطبيق', true); })
                            .catch(function () { showLinkDialog(url); });
                    });
                return;
            }

            copyFallback(text + '\n' + url)
                .then(function () { toast('تم نسخ رابط التطبيق — الصقه لأصحابك', true); })
                .catch(function () { showLinkDialog(url); });
        });
    };
})();
