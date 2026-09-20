/**
 * Native Dialogs Helper - نوافذ حوار أصلية احترافية
 * يستخدم @capacitor/dialog للتطبيق الأصلي و SweetAlert2 للمتصفح
 */

// 🔌 الجسر المحلي بدل CDN — يعمل بلا إنترنت. عند غياب الإضافة نستخدم بديل SweetAlert.
const _ndPlugins = (window.Capacitor && window.Capacitor.Plugins) || {};
const Dialog = _ndPlugins.Dialog || null;
const Toast = _ndPlugins.Toast || null;

const NativeDialogs = {
    /**
     * عرض رسالة تنبيه بسيطة
     * @param {string} title - العنوان
     * @param {string} message - الرسالة
     */
    alert: async (title, message) => {
        if (Dialog) {
            await Dialog.alert({
                title: title,
                message: message,
                buttonTitle: 'حسناً'
            });
        } else {
            // Fallback للمتصفح
            if (window.Swal) {
                await Swal.fire({
                    title: title,
                    text: message,
                    icon: 'info',
                    confirmButtonText: 'حسناً',
                    confirmButtonColor: '#04553A'
                });
            } else {
                alert(`${title}\n\n${message}`);
            }
        }
    },

    /**
     * عرض نافذة تأكيد
     * @param {string} title - العنوان
     * @param {string} message - الرسالة
     * @param {string} confirmText - نص زر التأكيد
     * @param {string} cancelText - نص زر الإلغاء
     * @returns {Promise<boolean>} - true إذا تم التأكيد
     */
    confirm: async (title, message, confirmText = 'تأكيد', cancelText = 'إلغاء') => {
        if (Dialog) {
            const result = await Dialog.confirm({
                title: title,
                message: message,
                okButtonTitle: confirmText,
                cancelButtonTitle: cancelText
            });
            return result.value;
        } else {
            // Fallback للمتصفح
            if (window.Swal) {
                const result = await Swal.fire({
                    title: title,
                    text: message,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: confirmText,
                    cancelButtonText: cancelText,
                    confirmButtonColor: '#04553A',
                    cancelButtonColor: '#6c757d'
                });
                return result.isConfirmed;
            } else {
                return confirm(`${title}\n\n${message}`);
            }
        }
    },

    /**
     * طلب نصٍّ من المستخدم.
     *
     * ⚠️ وُجدت لأن `prompt()` الخام كان يُستدعى في مسارٍ حيّ (تسمية موقع
     *    محفوظ): نافذةٌ رماديّة من نظام التشغيل، بخطٍّ غير خطّ التطبيق
     *    وأزرارٍ إنجليزية، تظهر فجأةً وسط واجهةٍ عربية مصمَّمة. وعلى iOS
     *    داخل WebView تبدو كأنها تحذيرٌ من المتصفّح لا جزءٌ من التطبيق.
     *
     * @param {string} title العنوان
     * @param {string} message الشرح
     * @param {object} [opts] { placeholder, value, confirmText, cancelText, maxLength }
     * @returns {Promise<string|null>} النصّ، أو null إن أُلغي
     */
    prompt: async (title, message, opts = {}) => {
        const {
            placeholder = '', value = '',
            confirmText = 'حفظ', cancelText = 'إلغاء', maxLength = 40
        } = opts;

        // Dialog.prompt متاحة في الإضافة الأصلية؛ وإن غابت نزل إلى Swal
        if (Dialog && typeof Dialog.prompt === 'function') {
            const r = await Dialog.prompt({
                title, message,
                okButtonTitle: confirmText,
                cancelButtonTitle: cancelText,
                inputPlaceholder: placeholder,
                inputText: value
            });
            return r.cancelled ? null : (r.value || '').trim() || null;
        }

        if (window.Swal) {
            const r = await Swal.fire({
                title, text: message,
                input: 'text',
                inputValue: value,
                inputPlaceholder: placeholder,
                inputAttributes: { maxlength: String(maxLength), autocapitalize: 'off' },
                showCancelButton: true,
                confirmButtonText: confirmText,
                cancelButtonText: cancelText,
                confirmButtonColor: '#04553A',
                cancelButtonColor: '#6c757d',
                // التحقّق داخل النافذة: لا تُغلق ثم تُفتح رسالة خطأ منفصلة
                inputValidator: (v) => (!v || !v.trim()) ? 'اكتب اسماً أولاً' : undefined
            });
            return r.isConfirmed ? String(r.value || '').trim() : null;
        }

        const v = prompt(`${title}\n\n${message}`, value);
        return v === null ? null : (v.trim() || null);
    },

    /**
     * عرض رسالة نجاح
     * @param {string} title - العنوان
     * @param {string} message - الرسالة
     */
    success: async (title, message) => {
        if (Toast) {
            await Toast.show({
                text: `✅ ${title}: ${message}`,
                duration: 'long',
                position: 'top'
            });
        } else {
            if (window.Swal) {
                await Swal.fire({
                    title: title,
                    text: message,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                alert(`✅ ${title}\n\n${message}`);
            }
        }
    },

    /**
     * عرض رسالة خطأ
     * @param {string} title - العنوان
     * @param {string} message - الرسالة
     */
    error: async (title, message) => {
        if (Dialog) {
            await Dialog.alert({
                title: `❌ ${title}`,
                message: message,
                buttonTitle: 'حسناً'
            });
        } else {
            if (window.Swal) {
                await Swal.fire({
                    title: title,
                    text: message,
                    icon: 'error',
                    confirmButtonText: 'حسناً',
                    confirmButtonColor: '#dc3545'
                });
            } else {
                alert(`❌ ${title}\n\n${message}`);
            }
        }
    },

    /**
     * عرض رسالة تحذير
     * @param {string} title - العنوان
     * @param {string} message - الرسالة
     */
    warning: async (title, message) => {
        if (Dialog) {
            await Dialog.alert({
                title: `⚠️ ${title}`,
                message: message,
                buttonTitle: 'فهمت'
            });
        } else {
            if (window.Swal) {
                await Swal.fire({
                    title: title,
                    text: message,
                    icon: 'warning',
                    confirmButtonText: 'فهمت',
                    confirmButtonColor: '#ffc107'
                });
            } else {
                alert(`⚠️ ${title}\n\n${message}`);
            }
        }
    },

    /**
     * عرض Toast سريع (رسالة صغيرة)
     * @param {string} message - الرسالة
     * @param {string} duration - المدة: 'short' أو 'long'
     */
    toast: async (message, duration = 'short') => {
        if (Toast) {
            await Toast.show({
                text: message,
                duration: duration,
                position: 'bottom'
            });
        } else {
            // Fallback بسيط للمتصفح
            const toast = document.createElement('div');
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
                background: rgba(0,0,0,0.8); color: white; padding: 12px 24px;
                border-radius: 25px; z-index: 10000; font-size: 14px;
                animation: fadeInOut 2s ease-in-out;
            `;

            if (!document.getElementById('toast-animation')) {
                const style = document.createElement('style');
                style.id = 'toast-animation';
                style.innerHTML = `
                    @keyframes fadeInOut {
                        0%, 100% { opacity: 0; }
                        10%, 90% { opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), duration === 'long' ? 3500 : 2000);
        }
    }
};

// تصدير للاستخدام العام
window.NativeDialogs = NativeDialogs;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NativeDialogs;
}

