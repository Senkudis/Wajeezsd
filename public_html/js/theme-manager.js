/**
 * Theme Manager - إدارة الوضع الليلي/النهاري
 * مع دعم StatusBar من Capacitor
 */

const ThemeManager = {
    STORAGE_KEY: 'wajeezsd_theme',

    /**
     * ضبط StatusBar حسب الوضع الحالي
     */
    applyStatusBar: function (isDark) {
        try {
            const { StatusBar } = Capacitor.Plugins;
            if (!StatusBar) return;

            if (isDark) {
                // وضع ليلي: نص أبيض على خلفية داكنة
                StatusBar.setStyle({ style: 'DARK' });
                StatusBar.setBackgroundColor({ color: '#1a1a2e' });
            } else {
                // وضع نهاري: نص داكن على خلفية خضراء (لون Header التطبيق)
                StatusBar.setStyle({ style: 'LIGHT' });
                StatusBar.setBackgroundColor({ color: '#04553A' });
            }
        } catch (e) {
            // البيئة ليست Capacitor Native (مثل المتصفح) — تجاهل
        }
    },

    /**
     * تهيئة النظام
     */
    init: function () {
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);
        const isDark = savedTheme === 'dark';

        if (isDark) {
            document.body.classList.add('dark-mode');
        }

        // ضبط StatusBar عند تحميل الصفحة
        this.applyStatusBar(isDark);

        // إضافة زر التبديل
        this.createToggleButton();
    },

    /**
     * إنشاء زر التبديل
     */
    createToggleButton: function () {
        const button = document.createElement('button');
        button.className = 'theme-toggle';
        button.onclick = () => this.toggle();
        button.title = 'تبديل الوضع الليلي';
        document.body.appendChild(button);
        this.updateButtonIcon();
    },

    /**
     * تفعيل الوضع الليلي
     */
    enableDarkMode: function () {
        document.body.classList.add('dark-mode');
        localStorage.setItem(this.STORAGE_KEY, 'dark');
        this.applyStatusBar(true);
        this.updateButtonIcon();
    },

    /**
     * تعطيل الوضع الليلي
     */
    disableDarkMode: function () {
        document.body.classList.remove('dark-mode');
        localStorage.setItem(this.STORAGE_KEY, 'light');
        this.applyStatusBar(false);
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
