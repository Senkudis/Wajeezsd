/**
 * Console Cleaner - تنظيف رسائل Console في الإنتاج
 * يعطل رسائل console في البيئة الإنتاجية لتحسين الأمان والأداء
 */

(function () {
    'use strict';

    // التحقق من البيئة
    const isProduction = window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1' &&
        window.location.hostname !== '';

    if (isProduction) {
        // تعطيل console.log و console.warn و console.info
        console.log = function () { };
        console.warn = function () { };
        console.info = function () { };
        console.debug = function () { };

        // نبقي console.error للأخطاء المهمة فقط
        // يمكن تعطيله أيضاً إذا أردت
        // console.error = function() {};

        // رسالة واحدة للمطورين
        console.log('%c🔒 Console disabled in production', 'color: #04553A; font-size: 14px; font-weight: bold;');
    }
})();
