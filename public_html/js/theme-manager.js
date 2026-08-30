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

            // ⚠️ لا setBackgroundColor: تستدعي Window.setStatusBarColor المتوقّفة نهائياً،
            // وأندرويد 15 يتجاهلها أصلاً (بلاغ Play: android.view.Window.setStatusBarColor).
            // التطبيق edge-to-edge: محتوى الصفحة نفسه يمتدّ خلف الشريط ويرسم لونه —
            // الترويسة الخضراء تحت --sat هي ما يراه المستخدم، لا لون الشريط.
            // يبقى setStyle لأنه يضبط لون الأيقونات عبر WindowInsetsController ولم يتوقّف.
            StatusBar.setStyle({ style: isDark ? 'DARK' : 'LIGHT' });
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
     * تحديث أيقونات أزرار الثيم في الصفحة
     */
    updateButtonIcon: function () {
        const isDark = document.body.classList.contains('dark-mode');

        // ☀️ أيقونة الشمس (للوضع الليلي للتحويل إلى النهاري)
        const sunSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="theme-svg theme-sun"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';

        // 🌙 أيقونة القمر النصفي / الهلال (للوضع النهاري للتحويل إلى الليلي)
        const moonSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="theme-svg theme-moon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

        const iconHtml = isDark ? sunSvg : moonSvg;
        const title = isDark ? 'تبديل للوضع النهاري ☀️' : 'تبديل للوضع الليلي 🌙';

        const buttons = document.querySelectorAll('.theme-toggle, .header-theme-toggle, .gv-theme-btn, [data-theme-toggle]');
        buttons.forEach(btn => {
            btn.innerHTML = iconHtml;
            btn.setAttribute('title', title);
            btn.setAttribute('aria-label', title);
        });
    },

    /**
     * إنشاء زر التبديل العائم إذا لم يوجد زر في الترويسة أو الصفحة
     */
    createToggleButton: function () {
        // إذا كان بالصفحة زر مخصص في الترويسة أو في بطاقة الدخول لا ننشئ العائم لتفادي التداخل
        const customToggle = document.querySelector('.header-theme-toggle, .gv-theme-btn, [data-theme-toggle]');
        const floatingBtn = document.querySelector('.theme-toggle');

        if (customToggle) {
            if (floatingBtn) floatingBtn.remove();
            this.updateButtonIcon();
            return;
        }

        let button = floatingBtn;
        if (!button) {
            button = document.createElement('button');
            button.className = 'theme-toggle';
            button.onclick = () => this.toggle();
            document.body.appendChild(button);
        }
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
     * التحقق من الوضع الحالي
     */
    isDarkMode: function () {
        return document.body.classList.contains('dark-mode');
    }
};

// تصدير للاستخدام العام
window.ThemeManager = ThemeManager;

// تهيئة تلقائية عند تحميل الصفحة أو DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
} else {
    ThemeManager.init();
}

// ربط أي أزرار ثيم في الترويسة ديناميكياً
document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.header-theme-toggle, .gv-theme-btn, [data-theme-toggle]');
    if (toggleBtn) {
        e.preventDefault();
        ThemeManager.toggle();
    }
});

// دالة للتبديل من القائمة الجانبية
function toggleDarkMode() {
    ThemeManager.toggle();
}
