/**
 * Onboarding - رسائل الترحيب للمستخدم الجديد
 */

const Onboarding = {
    STORAGE_KEY: 'wajeezsd_onboarding_shown',

    /**
     * عرض رسالة الترحيب
     */
    show: async function () {
        // التحقق إذا تم عرضها من قبل
        const shown = localStorage.getItem(this.STORAGE_KEY);
        if (shown) return;

        // عرض رسالة الترحيب
        if (window.Swal) {
            await Swal.fire({
                title: 'مرحباً بك في وجيز',
                html: `
                    <div class="text-start" style="direction: rtl; max-height: 40vh; overflow-y: auto; padding-right: 5px;">
                        <p class="mb-3">نحن سعداء بانضمامك! إليك بعض النصائح السريعة:</p>
                        <ul class="list-unstyled">
                            <li class="mb-2">
                                <i class="bi bi-1-circle-fill text-success me-2"></i>
                                <strong>حدد موقعك:</strong> اضغط على الخريطة لتحديد موقع الاستلام والتسليم
                            </li>
                            <li class="mb-2">
                                <i class="bi bi-2-circle-fill text-success me-2"></i>
                                <strong>احفظ مواقعك المفضلة:</strong> استخدم زر النجمة لحفظ البيت والعمل
                            </li>
                            <li class="mb-2">
                                <i class="bi bi-3-circle-fill text-success me-2"></i>
                                <strong>تتبع طلبك:</strong> راقب الكابتن لحظة بلحظة من صفحة "طلباتي"
                            </li>
                            <li class="mb-2">
                                <i class="bi bi-4-circle-fill text-success me-2"></i>
                                <strong>الوضع الليلي:</strong> اضغط على زر القمر لتفعيل الوضع المريح للعين
                            </li>
                        </ul>
                        <p class="mt-3 text-muted small">
                            <i class="bi bi-info-circle me-1"></i>
                            يمكنك دائماً الوصول للمساعدة من القائمة الجانبية
                        </p>
                    </div>
                `,
                icon: 'info',
                confirmButtonText: 'فهمت، لنبدأ!',
                confirmButtonColor: '#04553A',
                width: '90%',
                showClass: {
                    popup: 'animate__animated animate__fadeInDown'
                },
                hideClass: {
                    popup: 'animate__animated animate__fadeOutUp'
                }
            });
        }

        // تسجيل أنه تم العرض
        localStorage.setItem(this.STORAGE_KEY, 'true');
    },

    /**
     * إعادة تعيين (للاختبار)
     */
    reset: function () {
        localStorage.removeItem(this.STORAGE_KEY);
    }
};

// تصدير للاستخدام العام
window.Onboarding = Onboarding;

// ملاحظة: لا نعرض رسالة الترحيب تلقائياً عند التحميل (كانت تتداخل مع اختيار المدينة وطلب الأذونات).
// تُستدعى يدوياً عند الحاجة عبر Onboarding.show() — مثلاً من زر «مساعدة» في القائمة.
