/**
 * Input Validator - التحقق المحسّن من الإدخال
 * يوفر دوال للتحقق من صحة البيانات المدخلة
 */

const InputValidator = {
    /**
     * التحقق من الاسم (عربي أو إنجليزي)
     */
    validateName: function (name) {
        if (!name || name.trim().length === 0) {
            return { valid: false, message: 'الاسم مطلوب' };
        }

        if (name.length > 50) {
            return { valid: false, message: 'الاسم طويل جداً (الحد الأقصى 50 حرف)' };
        }

        // السماح بالعربي والإنجليزي والمسافات فقط
        const nameRegex = /^[\u0600-\u06FFa-zA-Z\s]+$/;
        if (!nameRegex.test(name)) {
            return { valid: false, message: 'الاسم يجب أن يحتوي على حروف فقط' };
        }

        return { valid: true };
    },

    /**
     * التحقق من رقم الهاتف
     */
    validatePhone: function (phone) {
        if (!phone || phone.trim().length === 0) {
            return { valid: false, message: 'رقم الهاتف مطلوب' };
        }

        // إزالة المسافات والشرطات
        const cleanPhone = phone.replace(/[\s-]/g, '');

        if (cleanPhone.length < 9 || cleanPhone.length > 15) {
            return { valid: false, message: 'رقم الهاتف يجب أن يكون بين 9-15 رقم' };
        }

        // السماح بالأرقام و + فقط
        const phoneRegex = /^[0-9+]+$/;
        if (!phoneRegex.test(cleanPhone)) {
            return { valid: false, message: 'رقم الهاتف غير صحيح' };
        }

        return { valid: true, cleaned: cleanPhone };
    },

    /**
     * التحقق من السعر
     */
    validatePrice: function (price) {
        const numPrice = parseFloat(price);

        if (isNaN(numPrice)) {
            return { valid: false, message: 'السعر يجب أن يكون رقماً' };
        }

        if (numPrice <= 0) {
            return { valid: false, message: 'السعر يجب أن يكون أكبر من صفر' };
        }

        if (numPrice > 999999) {
            return { valid: false, message: 'السعر كبير جداً' };
        }

        return { valid: true, value: numPrice };
    },

    /**
     * التحقق من النص (التفاصيل)
     */
    validateText: function (text, maxLength = 500) {
        if (text && text.length > maxLength) {
            return { valid: false, message: `النص طويل جداً (الحد الأقصى ${maxLength} حرف)` };
        }

        return { valid: true };
    },

    /**
     * التحقق من الإحداثيات
     */
    validateCoordinates: function (coords) {
        if (!coords || coords.trim().length === 0) {
            return { valid: false, message: 'الإحداثيات مطلوبة' };
        }

        const parts = coords.split(',').map(c => parseFloat(c.trim()));

        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
            return { valid: false, message: 'صيغة الإحداثيات غير صحيحة' };
        }

        // التحقق من نطاق الإحداثيات (السودان تقريباً)
        const [lat, lng] = parts;
        if (lat < 3 || lat > 23 || lng < 21 || lng > 39) {
            return { valid: false, message: 'الإحداثيات خارج نطاق السودان' };
        }

        return { valid: true, lat: parts[0], lng: parts[1] };
    },

    /**
     * تنظيف النص من HTML والسكريبتات
     */
    sanitizeText: function (text) {
        if (!text) return '';

        // إزالة HTML tags
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * التحقق من نموذج الطلب بالكامل
     */
    validateOrderForm: function (formData) {
        const errors = [];

        // التحقق من اسم المرسل
        const pickupNameResult = this.validateName(formData.pickupName);
        if (!pickupNameResult.valid) {
            errors.push({ field: 'pickup-name', message: pickupNameResult.message });
        }

        // التحقق من هاتف المرسل
        const pickupPhoneResult = this.validatePhone(formData.pickupPhone);
        if (!pickupPhoneResult.valid) {
            errors.push({ field: 'pickup-phone', message: pickupPhoneResult.message });
        }

        // التحقق من اسم المستلم
        const dropoffNameResult = this.validateName(formData.dropoffName);
        if (!dropoffNameResult.valid) {
            errors.push({ field: 'dropoff-name', message: dropoffNameResult.message });
        }

        // التحقق من هاتف المستلم
        const dropoffPhoneResult = this.validatePhone(formData.dropoffPhone);
        if (!dropoffPhoneResult.valid) {
            errors.push({ field: 'dropoff-phone', message: dropoffPhoneResult.message });
        }

        // التحقق من السعر
        const priceResult = this.validatePrice(formData.price);
        if (!priceResult.valid) {
            errors.push({ field: 'price', message: priceResult.message });
        }

        // التحقق من التفاصيل
        const detailsResult = this.validateText(formData.details);
        if (!detailsResult.valid) {
            errors.push({ field: 'details', message: detailsResult.message });
        }

        // التحقق من الإحداثيات
        const pickupCoordsResult = this.validateCoordinates(formData.pickupCoords);
        if (!pickupCoordsResult.valid) {
            errors.push({ field: 'pickup-addr', message: pickupCoordsResult.message });
        }

        const dropoffCoordsResult = this.validateCoordinates(formData.dropoffCoords);
        if (!dropoffCoordsResult.valid) {
            errors.push({ field: 'dropoff-addr', message: dropoffCoordsResult.message });
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    },

    /**
     * عرض أخطاء التحقق
     */
    showValidationErrors: async function (errors) {
        if (errors.length === 0) return;

        const errorMessages = errors.map(e => `• ${e.message}`).join('\n');

        if (window.NativeDialogs) {
            await window.NativeDialogs.error(
                'بيانات غير صحيحة',
                errorMessages
            );
        } else {
            alert('بيانات غير صحيحة:\n\n' + errorMessages);
        }

        // تمييز الحقل الأول الخاطئ
        if (errors[0] && errors[0].field) {
            const field = document.getElementById(errors[0].field);
            if (field) {
                field.focus();
                field.classList.add('is-invalid');
                setTimeout(() => field.classList.remove('is-invalid'), 3000);
            }
        }
    }
};

// تصدير للاستخدام العام
window.InputValidator = InputValidator;

// إضافة CSS للحقول الخاطئة
const style = document.createElement('style');
style.innerHTML = `
    .is-invalid {
        border-color: #dc3545 !important;
        animation: shake 0.5s;
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
`;
document.head.appendChild(style);
