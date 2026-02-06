/**
 * Theme Manager - إدارة الوضع الليلي/النهاري
 */

const ThemeManager = {
    STORAGE_KEY: 'wassili_theme',

    /**
     * تهيئة النظام
     */
    init: function () {
        // تحميل الثيم المحفوظ
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);
        if (savedTheme === 'dark') {
            this.enableDarkMode();
        }

        // إضافة زر التبديل
        this.createToggleButton();
    },

    /**
     * إنشاء زر التبديل
     */
    createToggleButton: function () {
        const button = document.createElement('button');
        button.className = 'theme-toggle';
        button.innerHTML = '<i class="bi bi-moon-stars-fill"></i>';
        button.onclick = () => this.toggle();
        button.title = 'تبديل الوضع الليلي';
        document.body.appendChild(button);

        // تحديث الأيقونة
        this.updateButtonIcon();
    },

    /**
     * تفعيل الوضع الليلي
     */
    enableDarkMode: function () {
        document.body.classList.add('dark-mode');
        localStorage.setItem(this.STORAGE_KEY, 'dark');
        this.updateButtonIcon();
    },

    /**
     * تعطيل الوضع الليلي
     */
    disableDarkMode: function () {
        document.body.classList.remove('dark-mode');
        localStorage.setItem(this.STORAGE_KEY, 'light');
        this.updateButtonIcon();
    },

    /**
     * التبديل بين الوضعين
     */
    toggle: function () {
        if (document.body.classList.contains('dark-mode')) {
            this.disableDarkMode();
            if (window.NativeDialogs) {
                window.NativeDialogs.toast('تم التبديل للوضع النهاري ☀️');
            }
        } else {
            this.enableDarkMode();
            if (window.NativeDialogs) {
                window.NativeDialogs.toast('تم التبديل للوضع الليلي 🌙');
            }
        }
    },

    /**
     * تحديث أيقونة الزر
     */
    updateButtonIcon: function () {
        const button = document.querySelector('.theme-toggle');
        if (!button) return;

        if (document.body.classList.contains('dark-mode')) {
            button.innerHTML = '<i class="bi bi-sun-fill"></i>';
        } else {
            button.innerHTML = '<i class="bi bi-moon-stars-fill"></i>';
        }
    },

    /**
     * التحقق من الوضع الحالي
     */
    isDarkMode: function () {
        return document.body.classList.contains('dark-mode');
    }
};

// تصدير للاستخدام العام
window.ThemeManager = ThemeManager;

// تهيئة تلقائية عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
});

// دالة للتبديل من القائمة الجانبية
function toggleDarkMode() {
    ThemeManager.toggle();
}
