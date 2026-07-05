/**
 * i18n - نظام الترجمة المتعدد اللغات
 * Internationalization System
 */

const i18n = {
    currentLang: 'ar',
    STORAGE_KEY: 'wajeezsd_language',

    translations: {
        ar: {
            // Header
            'greeting': 'مرحباً',
            'guest': 'زائر',

            // Navigation
            'home': 'الرئيسية',
            'orders': 'الطلبات',
            'notifications': 'الإشعارات',

            // Sidebar
            'my_account': 'حسابي',
            'login': 'تسجيل الدخول',
            'my_orders': 'طلباتي السابقة',
            'wallet': 'المحفظة',
            'saved_locations': 'المواقع المفضلة',
            'about': 'عن وجيز',
            'logout': 'تسجيل الخروج',
            'dark_mode': 'الوضع الليلي',
            'version': 'إصدار التطبيق',

            // Order Form
            'pickup_location': 'مكان الاستلام (من وين؟)',
            'select_on_map': 'اضغط لتحديد الموقع على الخريطة',
            'pickup_address': 'موقع الاستلام',
            'dropoff_location': 'الوجهة (لي وين؟)',
            'select_destination': 'اضغط لتحديد الوجهة على الخريطة',
            'dropoff_address': 'موقع التسليم',

            // Pricing
            'pricing': 'التسعير والدفع',
            'distance': 'المسافة',
            'estimated_time': 'الوقت المتوقع',
            'price': 'السعر',
            'payment_method': 'طريقة الدفع',
            'cash': 'كاش',

            // Buttons
            'order_now': 'اطلب الكابتن الآن',
            'confirm': 'تأكيد',
            'cancel': 'إلغاء',
            'save': 'حفظ',
            'delete': 'حذف',
            'select': 'اختيار',

            // Messages
            'loading': 'جاري التحميل...',
            'success': 'تم بنجاح',
            'error': 'حدث خطأ',
            'no_saved_locations': 'لا توجد مواقع محفوظة',
            'save_favorite_locations': 'احفظ مواقعك المفضلة للوصول السريع',

            // Units
            'km': 'كم',
            'minutes': 'دقيقة',
            'sdg': 'ج.س'
        },

        en: {
            // Header
            'greeting': 'Hello',
            'guest': 'Guest',

            // Navigation
            'home': 'Home',
            'orders': 'Orders',
            'notifications': 'Notifications',

            // Sidebar
            'my_account': 'My Account',
            'login': 'Login',
            'my_orders': 'My Orders',
            'wallet': 'Wallet',
            'saved_locations': 'Saved Locations',
            'about': 'About Wajeez',
            'logout': 'Logout',
            'dark_mode': 'Dark Mode',
            'version': 'App Version',

            // Order Form
            'pickup_location': 'Pickup Location',
            'select_on_map': 'Tap to select location on map',
            'pickup_address': 'Pickup Address',
            'dropoff_location': 'Destination',
            'select_destination': 'Tap to select destination on map',
            'dropoff_address': 'Dropoff Address',

            // Pricing
            'pricing': 'Pricing & Payment',
            'distance': 'Distance',
            'estimated_time': 'Estimated Time',
            'price': 'Price',
            'payment_method': 'Payment Method',
            'cash': 'Cash',

            // Buttons
            'order_now': 'Order Now',
            'confirm': 'Confirm',
            'cancel': 'Cancel',
            'save': 'Save',
            'delete': 'Delete',
            'select': 'Select',

            // Messages
            'loading': 'Loading...',
            'success': 'Success',
            'error': 'Error',
            'no_saved_locations': 'No saved locations',
            'save_favorite_locations': 'Save your favorite locations for quick access',

            // Units
            'km': 'km',
            'minutes': 'min',
            'sdg': 'SDG'
        }
    },

    /**
     * تهيئة النظام
     */
    init: function () {
        const savedLang = localStorage.getItem(this.STORAGE_KEY);
        if (savedLang) {
            this.currentLang = savedLang;
        }
        this.applyLanguage();
    },

    /**
     * الحصول على ترجمة
     */
    t: function (key) {
        return this.translations[this.currentLang][key] || key;
    },

    /**
     * تغيير اللغة
     */
    setLanguage: function (lang) {
        if (!this.translations[lang]) return;

        this.currentLang = lang;
        localStorage.setItem(this.STORAGE_KEY, lang);
        this.applyLanguage();

        // إعادة تحميل الصفحة لتطبيق التغييرات
        window.location.reload();
    },

    /**
     * تطبيق اللغة على الصفحة
     */
    applyLanguage: function () {
        // تغيير اتجاه الصفحة
        if (this.currentLang === 'ar') {
            document.documentElement.setAttribute('dir', 'rtl');
            document.documentElement.setAttribute('lang', 'ar');
        } else {
            document.documentElement.setAttribute('dir', 'ltr');
            document.documentElement.setAttribute('lang', 'en');
        }

        // تطبيق الترجمات على العناصر
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = this.t(key);
        });

        // تطبيق الترجمات على placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            element.placeholder = this.t(key);
        });
    },

    /**
     * التبديل بين اللغات
     */
    toggle: function () {
        const newLang = this.currentLang === 'ar' ? 'en' : 'ar';
        this.setLanguage(newLang);
    },

    /**
     * الحصول على اللغة الحالية
     */
    getCurrentLanguage: function () {
        return this.currentLang;
    }
};

// تصدير للاستخدام العام
window.i18n = i18n;

// تهيئة تلقائية
document.addEventListener('DOMContentLoaded', () => {
    i18n.init();
});

// دالة للتبديل من القائمة
function toggleLanguage() {
    i18n.toggle();
}
