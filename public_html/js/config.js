/**
 * API Configuration
 */

// ✅ Guard: منع الخطأ عند تحميل الملف مرتين
if (!window.API_CONFIG) {
    window.API_CONFIG = {
        // رابط السيرفر الحي الثابت
        production: 'https://wajeezsd.com',

        // للتطوير المحلي فقط — غيّر هذا يدوياً عند الحاجة
        development: 'http://localhost:3000',

        get baseURL() {
            if (typeof window !== 'undefined') {
                const hostname = window.location.hostname;
                const protocol = window.location.protocol;
                
                // ✅ التحقق إذا كنا داخل تطبيق الموبايل (Capacitor)
                const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
                
                // إذا كنا داخل التطبيق، اتصل بالسيرفر الحي دائماً (لأن localhost في الموبايل هو الموبايل نفسه!)
                if (isNative || hostname === 'wajeezsd.secure.local') {
                    return this.production;
                }

                // بيئة التطوير المحلية (على متصفح الكمبيوتر فقط)
                if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
                    return this.development;
                }
            }
            return this.production;
        }
    };

    // ✅ WAF (ModSecurity) Bypass Interceptor:
    // يقوم باعتراض جميع طلبات الجافاسكريبت وتحويل طلبات PUT و DELETE
    // إلى POST مع إضافة ?_method=... في الرابط لتخطي حجب جدار حماية الاستضافة
    if (typeof window !== 'undefined' && window.fetch) {
        if (!window.__fetchIntercepted) {
            window.__fetchIntercepted = true;
            const _origFetch = window.fetch;
            window.fetch = async function(resource, options) {
                try {
                    if (options && typeof options.method === 'string') {
                        const method = options.method.toUpperCase();
                        if (method === 'PUT' || method === 'DELETE') {
                            // لا نتدخل إذا كان resource من نوع Request (نادر في هذا المشروع)
                            if (typeof resource === 'string' || resource instanceof URL) {
                                const urlObj = new URL(resource, window.location.origin);
                                urlObj.searchParams.set('_method', method);
                                resource = urlObj.toString();
                                options.method = 'POST';
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[WAF Bypass] Error intercepting fetch:', e);
                }
                return _origFetch.apply(this, arguments);
            };
        }
    }

    window.API_URL = window.API_CONFIG.baseURL;
}

/**
 * تحويل مسار الصورة النسبي إلى رابط كامل
 * - إذا كان الرابط http/https → يُرجعه كما هو
 * - إذا كان data:image (base64) → يُرجعه كما هو
 * - إذا كان مسار نسبي (مثل /uploads/...) → يُضيف API_URL
 *
 * ملاحظة: على السيرفر الحي (wajeezsd.com)، الصور محفوظة تحت /api/uploads
 * لأن Node.js app يشتغل تحت PassengerBaseURI "/api".
 * على المحلي (localhost:5000)، الصور مباشرة تحت /uploads.
 */
window.getFullImageUrl = function(url) {
    if (!url) return '';
    if (url.startsWith('data:image')) return url;
    
    // ✅ تحويل الروابط القديمة المخزنة في قاعدة البيانات تلقائياً للموقع الجديد
    if (url.includes('wassili.site')) {
        url = url.replace(/https?:\/\/(www\.)?wassili\.site/ig, window.API_URL || 'https://wajeezsd.com');
    }

    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base = window.API_URL || 'https://wajeezsd.com';
    const clean = url.replace(/\\/g, '/');
    const withSlash = clean.startsWith('/') ? clean : '/' + clean;
    // على السيرفر الحي، الصور موجودة تحت /api/uploads لأن Passenger يضع الـ app تحت /api
    // على المحلي (localhost:5000)، الصور مباشرة تحت /uploads بدون /api
    const isLocal = base.includes('localhost') || base.includes('127.0.0.1');
    if (!isLocal && withSlash.startsWith('/uploads')) {
        return base + '/api' + withSlash;
    }
    return base + withSlash;
};

// أظهر فقط في بيئة التطوير
if (window.API_URL.includes('localhost') || window.API_URL.includes('127.0.0.1')) {
    console.log('🌐 API URL:', window.API_URL);
}

/**
 * تأمين النص من XSS قبل وضعه في HTML
 * متاحة عالمياً لجميع الصفحات
 */
window.escapeHtml = function(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/**
 * 💬 رسالة خطأٍ تصلح أن تُعرض للمستخدم.
 *
 * كان كثيرٌ من الشاشات يعرض err.message كما هو. وهذا صحيحٌ حين يكون
 * الخطأ مرميّاً من ردّ الخادم («الطلب منتهٍ») — تلك رسائل عربية كُتبت
 * للمستخدم. وخاطئٌ حين يأتي من المتصفّح نفسه: انقطاع الشبكة يرمي
 * «Failed to fetch» في Chrome و«Load failed» في Safari و«NetworkError…»
 * في Firefox، وردٌّ غير JSON يرمي «Unexpected token <». فيرى العميل
 * نصّاً إنجليزياً تقنياً بالأحمر في تطبيقٍ عربيّ.
 *
 * القاعدة: التطبيق عربيٌّ كلّه، ورسائل الخادم عربيةٌ كلّها — فرسالةٌ بلا
 * حرفٍ عربيٍّ واحد رسالةٌ تقنية لم تُكتب للمستخدم، ولا تُعرض خاماً أبداً.
 * والعربية تمرّ كما هي.
 *
 *     friendlyError(err)                  ← النصّ المناسب
 *     friendlyError(err, 'فشل الإرسال')  ← بديلٌ حين لا يصلح النصّ
 */
window.friendlyError = function (err, fallback) {
    var generic = fallback || 'حدث خطأ غير متوقّع. حاول مجدداً.';
    var msg = (err && (err.message || (typeof err === 'string' ? err : ''))) || '';
    msg = String(msg).trim();
    if (!msg) return generic;
    // انقطاع الشبكة — بصيغ المتصفّحات الثلاثة ومهلة الطلب وإلغائه
    if (/failed to fetch|load failed|networkerror|network request failed|internet connection|timed? ?out|timeout|aborted|abort/i.test(msg)) {
        return 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.';
    }
    // الخادم ردّ بصفحة HTML (خطأ 502 من الوكيل مثلاً) لا بـ JSON
    if (/unexpected token|json|syntaxerror/i.test(msg)) {
        return 'استجابةٌ غير متوقّعة من الخادم. حاول مجدداً بعد قليل.';
    }
    // لا حرف عربياً ⇒ رسالةٌ تقنية لم تُكتب للمستخدم
    if (!/[\u0600-\u06FF]/.test(msg)) return generic;
    return msg;
};

/**
 * 🎓 طابور الشرح اللحظي.
 *
 * صفحات كثيرة تجلب بياناتها في سكربت مضمّن يبدأ فوراً، بينما coach.js
 * يُحمَّل في آخر <body>. على شبكة سريعة يعود الردّ ويُرسَم المحتوى قبل
 * أن يصل المحلّل إلى وسم coach.js، فيكون window.Coach غير معرّف —
 * وحارس `if (window.Coach)` يبتلع النداء بصمت فلا يظهر الشرح أبداً.
 *
 * الطابور يُعرَّف هنا لأن config.js أول ما تُحمّله كل الصفحات، فأي نداء
 * مبكّر يُخزَّن، ثم يستنزفه coach.js عند جاهزيته. الترتيب لم يعد يهمّ.
 */
window.__coachQ = window.__coachQ || [];
window.coachFire = function (key, selector) {
    window.__coachQ.push([key, selector]);
};
