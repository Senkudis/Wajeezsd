/**
 * Cache Manager - إدارة التخزين المؤقت
 * Improves performance by caching frequently accessed data
 */

const CacheManager = {
    CACHE_PREFIX: 'wajeezsd_cache_',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

    /**
     * حفظ بيانات في الكاش
     */
    set: function (key, data, duration = this.CACHE_DURATION) {
        const cacheData = {
            data: data,
            timestamp: Date.now(),
            duration: duration
        };

        try {
            localStorage.setItem(this.CACHE_PREFIX + key, JSON.stringify(cacheData));
            return true;
        } catch (e) {
            console.error('Cache set error:', e);
            return false;
        }
    },

    /**
     * الحصول على بيانات من الكاش
     */
    get: function (key) {
        try {
            const cached = localStorage.getItem(this.CACHE_PREFIX + key);
            if (!cached) return null;

            const cacheData = JSON.parse(cached);
            const now = Date.now();

            // التحقق من انتهاء الصلاحية
            if (now - cacheData.timestamp > cacheData.duration) {
                this.remove(key);
                return null;
            }

            return cacheData.data;
        } catch (e) {
            console.error('Cache get error:', e);
            return null;
        }
    },

    /**
     * حذف عنصر من الكاش
     */
    remove: function (key) {
        localStorage.removeItem(this.CACHE_PREFIX + key);
    },

    /**
     * مسح كل الكاش
     */
    clear: function () {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(this.CACHE_PREFIX)) {
                localStorage.removeItem(key);
            }
        });
    },

    /**
     * التحقق من وجود بيانات في الكاش
     */
    has: function (key) {
        return this.get(key) !== null;
    },

    /**
     * حفظ آخر الطلبات
     */
    saveRecentOrders: function (orders) {
        this.set('recent_orders', orders, 10 * 60 * 1000); // 10 minutes
    },

    /**
     * الحصول على آخر الطلبات
     */
    getRecentOrders: function () {
        return this.get('recent_orders');
    },

    /**
     * حفظ إعدادات التسعير
     */
    savePricingConfig: function (config) {
        this.set('pricing_config', config, 30 * 60 * 1000); // 30 minutes
    },

    /**
     * الحصول على إعدادات التسعير
     */
    getPricingConfig: function () {
        return this.get('pricing_config');
    },

    /**
     * حفظ بيانات المستخدم
     */
    saveUserData: function (userData) {
        this.set('user_data', userData, 60 * 60 * 1000); // 1 hour
    },

    /**
     * الحصول على بيانات المستخدم
     */
    getUserData: function () {
        return this.get('user_data');
    }
};

// تصدير للاستخدام العام
window.CacheManager = CacheManager;

// تنظيف الكاش القديم عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // يمكن إضافة منطق تنظيف تلقائي هنا إذا لزم الأمر
});
