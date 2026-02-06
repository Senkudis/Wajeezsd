/**
 * Notification Sounds Manager - إدارة أصوات الإشعارات
 * Provides different sounds for different notification types
 */

const NotificationSounds = {
    // أصوات مختلفة لكل نوع
    sounds: {
        success: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE',
        error: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE',
        info: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE',
        warning: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE',
        newOrder: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE'
    },

    // حالة الصوت
    enabled: true,
    volume: 0.5,

    /**
     * تهيئة النظام
     */
    init: function () {
        // تحميل الإعدادات المحفوظة
        const savedEnabled = localStorage.getItem('wassili_sounds_enabled');
        const savedVolume = localStorage.getItem('wassili_sounds_volume');

        if (savedEnabled !== null) {
            this.enabled = savedEnabled === 'true';
        }
        if (savedVolume !== null) {
            this.volume = parseFloat(savedVolume);
        }
    },

    /**
     * تشغيل صوت
     */
    play: function (type = 'info') {
        if (!this.enabled) return;

        try {
            // استخدام Web Audio API للصوت
            const audio = new Audio(this.sounds[type] || this.sounds.info);
            audio.volume = this.volume;
            audio.play().catch(e => console.log('Sound play failed:', e));

            // اهتزاز مخصص حسب النوع
            this.vibrate(type);
        } catch (e) {
            console.error('Sound error:', e);
        }
    },

    /**
     * اهتزاز مخصص
     */
    vibrate: function (type) {
        if (!navigator.vibrate) return;

        const patterns = {
            success: [100],
            error: [100, 50, 100],
            warning: [50, 50, 50],
            info: [50],
            newOrder: [200, 100, 200]
        };

        navigator.vibrate(patterns[type] || [50]);
    },

    /**
     * تفعيل/تعطيل الأصوات
     */
    toggle: function () {
        this.enabled = !this.enabled;
        localStorage.setItem('wassili_sounds_enabled', this.enabled);
        return this.enabled;
    },

    /**
     * تعيين مستوى الصوت
     */
    setVolume: function (volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        localStorage.setItem('wassili_sounds_volume', this.volume);
    },

    /**
     * تشغيل صوت نجاح
     */
    playSuccess: function () {
        this.play('success');
    },

    /**
     * تشغيل صوت خطأ
     */
    playError: function () {
        this.play('error');
    },

    /**
     * تشغيل صوت تحذير
     */
    playWarning: function () {
        this.play('warning');
    },

    /**
     * تشغيل صوت معلومات
     */
    playInfo: function () {
        this.play('info');
    },

    /**
     * تشغيل صوت طلب جديد
     */
    playNewOrder: function () {
        this.play('newOrder');
    }
};

// تصدير للاستخدام العام
window.NotificationSounds = NotificationSounds;

// تهيئة تلقائية
document.addEventListener('DOMContentLoaded', () => {
    NotificationSounds.init();
});
