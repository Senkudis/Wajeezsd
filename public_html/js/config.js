/**
 * API Configuration
 * تكوين عناوين API للتطوير والإنتاج
 */

const API_CONFIG = {
    // للتطوير المحلي - استخدم localhost أو IP جهازك
    // لتغيير IP: اكتب ipconfig في CMD واستخدم IPv4 Address
    development: 'http://localhost:5000',

    // للإنتاج - رابط السيرفر
    // 💡 ملاحظة: الكود يضيف /api تلقائياً، لذا نضع الرابط الأساسي فقط
    production: 'https://wassili.site',

    // اختيار تلقائي
    get baseURL() {
        // 🔥 FORCE INDEPENDENT API: Using wassili.site/api
        console.log('🌐 Using Independent App Server: wassili.site/api');
        return this.production;

        /* OLD LOGIC - Commented out for now
        // إذا كان التطبيق يعمل على الموبايل (Native)، استخدم Production دائماً
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            console.log('📱 App running on Native Mode: Using Production URL');
            return this.production;
        }

        // إذا كان التطبيق يعمل على المتصفح المحلي (Localhost)
        if (window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1') {

            // 🚨 إصلاح هام: إذا كان يعمل على هاتف (Android/iOS) ولكن الرابط localhost
            // (وهذا يحدث أحياناً في الـ WebView)، يجب استخدام Production
            const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
            if (isMobile) {
                console.log('📱 Mobile Device on Localhost detected - Forcing Production URL');
                return this.production;
            }

            return this.development;
        }

        // غير ذلك (مثل رفع الموقع على استضافة أو فتحه من الهاتف)
        return this.production;
        */
    }
};

// تصدير للاستخدام العام
window.API_CONFIG = API_CONFIG;
window.API_URL = API_CONFIG.baseURL;

console.log('🌐 API URL:', window.API_URL);
