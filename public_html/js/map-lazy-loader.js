/**
 * Map Lazy Loader - تحميل الخريطة عند الحاجة
 * Improves initial page load performance
 */

const MapLazyLoader = {
    mapLoaded: false,
    mapContainer: null,

    /**
     * تهيئة النظام
     */
    init: function () {
        // تأجيل تحميل الخريطة
        this.mapContainer = document.getElementById('map');

        // تحميل عند النقر على زر الخريطة
        document.querySelectorAll('.map-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.loadMap();
            });
        });
    },

    /**
     * تحميل الخريطة
     */
    loadMap: function () {
        if (this.mapLoaded) return;

        // عرض مؤشر التحميل
        if (this.mapContainer) {
            this.mapContainer.innerHTML = `
                <div class="d-flex align-items-center justify-content-center h-100">
                    <div class="text-center">
                        <div class="spinner-border text-success mb-3" role="status">
                            <span class="visually-hidden">جاري التحميل...</span>
                        </div>
                        <p class="text-muted">جاري تحميل الخريطة...</p>
                    </div>
                </div>
            `;
        }

        // تحميل Leaflet إذا لم يكن محملاً
        if (typeof L === 'undefined') {
            this.loadLeafletLibrary();
        } else {
            this.initializeMap();
        }
    },

    /**
     * تحميل مكتبة Leaflet
     */
    loadLeafletLibrary: function () {
        // تحميل CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        // تحميل JS
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => {
            this.initializeMap();
        };
        document.head.appendChild(script);
    },

    /**
     * تهيئة الخريطة
     */
    initializeMap: function () {
        this.mapLoaded = true;

        // إعادة تهيئة الخريطة (سيتم استدعاء الدالة الأصلية)
        if (typeof initMap === 'function') {
            initMap();
        }
    },

    /**
     * التحقق من تحميل الخريطة
     */
    isLoaded: function () {
        return this.mapLoaded;
    }
};

// تصدير للاستخدام العام
window.MapLazyLoader = MapLazyLoader;

// تهيئة تلقائية (لكن لا تحمل الخريطة)
document.addEventListener('DOMContentLoaded', () => {
    // تعطيل التحميل التلقائي للخريطة
    // MapLazyLoader.init();

    // ملاحظة: يمكن تفعيل هذا لاحقاً إذا أردت تحسين الأداء
});
