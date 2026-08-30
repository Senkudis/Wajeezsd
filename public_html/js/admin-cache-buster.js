/**
 * Admin Cache Buster
 * إجبار الأدمن على استخدام أحدث نسخة من الصفحات دائماً.
 * يحذف الـ Service Worker القديم وإعادة تسجيل الجديد.
 */
(function() {
    const CURRENT_VERSION = 'admin-2026.mobile-compact-v4';
    const storedVersion = localStorage.getItem('admin_ui_version');

    // إذا النسخة مختلفة، امسح الكاش كلياً
    if (storedVersion !== CURRENT_VERSION) {
        console.log('🔄 Admin UI version updated — clearing cache');

        // 1. احذف كل الـ Caches
        if ('caches' in window) {
            caches.keys().then(keys => {
                keys.forEach(key => caches.delete(key));
            }).catch(() => {});
        }

        // 2. أعد تسجيل الـ Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(regs => {
                regs.forEach(reg => reg.update());
            }).catch(() => {});
        }

        localStorage.setItem('admin_ui_version', CURRENT_VERSION);

        // 3. إذا هذه أول زيارة بعد التحديث — اعمل hard reload
        if (storedVersion && storedVersion !== CURRENT_VERSION) {
            console.log('🔁 Hard reload to pick up new admin UI');
            window.location.reload(true);
        }
    }
})();
