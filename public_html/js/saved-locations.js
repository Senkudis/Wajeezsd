/**
 * Saved Locations Manager - إدارة المواقع المفضلة
 * يسمح للمستخدم بحفظ واستخدام المواقع المتكررة
 */

const SavedLocations = {
    STORAGE_KEY: 'wassili_saved_locations',

    /**
     * الحصول على جميع المواقع المحفوظة
     */
    getAll: function () {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    },

    /**
     * حفظ موقع جديد
     */
    save: function (name, address, lat, lng) {
        const locations = this.getAll();

        // التحقق من عدم وجود موقع بنفس الاسم
        const exists = locations.find(loc => loc.name === name);
        if (exists) {
            return { success: false, message: 'يوجد موقع بنفس الاسم بالفعل' };
        }

        locations.push({
            id: Date.now(),
            name: name,
            address: address,
            lat: lat,
            lng: lng,
            createdAt: new Date().toISOString()
        });

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(locations));
        return { success: true, message: 'تم حفظ الموقع بنجاح' };
    },

    /**
     * حذف موقع
     */
    delete: function (id) {
        let locations = this.getAll();
        locations = locations.filter(loc => loc.id !== id);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(locations));
        return { success: true, message: 'تم حذف الموقع' };
    },

    /**
     * الحصول على موقع محدد
     */
    get: function (id) {
        const locations = this.getAll();
        return locations.find(loc => loc.id === id);
    },

    /**
     * عرض قائمة المواقع المحفوظة
     */
    renderList: function (containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const locations = this.getAll();

        if (locations.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="bi bi-geo-alt fs-1"></i>
                    <p class="mt-2">لا توجد مواقع محفوظة</p>
                    <small>احفظ مواقعك المفضلة للوصول السريع</small>
                </div>
            `;
            return;
        }

        let html = '<div class="list-group">';
        locations.forEach(loc => {
            const icon = loc.name === 'البيت' ? 'house-door' :
                loc.name === 'العمل' ? 'briefcase' : 'geo-alt';

            html += `
                <div class="list-group-item d-flex align-items-center gap-3">
                    <div class="bg-success bg-opacity-10 p-2 rounded">
                        <i class="bi bi-${icon} text-success fs-5"></i>
                    </div>
                    <div class="flex-grow-1">
                        <h6 class="mb-0 fw-bold">${loc.name}</h6>
                        <small class="text-muted">${loc.address}</small>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-success" onclick="SavedLocations.use(${loc.id}, 'pickup')">
                            <i class="bi bi-arrow-up-circle"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="SavedLocations.use(${loc.id}, 'dropoff')">
                            <i class="bi bi-arrow-down-circle"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="SavedLocations.delete(${loc.id}); SavedLocations.renderList('saved-locations-list');">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
    },

    /**
     * استخدام موقع محفوظ
     */
    use: function (id, type) {
        const location = this.get(id);
        if (!location) return;

        // تحديث الحقل المناسب
        const field = type === 'pickup' ? 'pickup-addr' : 'dropoff-addr';
        document.getElementById(field).value = location.address;

        // تحديث الخريطة إذا كانت مفتوحة
        if (typeof handleMapSelection === 'function') {
            handleMapSelection(location.lat, location.lng);
        }

        // إغلاق القائمة
        const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById('savedLocationsModal'));
        if (offcanvas) offcanvas.hide();

        window.NativeDialogs.toast(`تم تحديد ${location.name} كـ${type === 'pickup' ? 'موقع الاستلام' : 'الوجهة'}`);
    },

    /**
     * حفظ الموقع الحالي
     */
    saveCurrentLocation: async function (type) {
        const field = type === 'pickup' ? 'pickup-addr' : 'dropoff-addr';
        const address = document.getElementById(field).value;

        if (!address) {
            await window.NativeDialogs.warning('تنبيه', 'الرجاء تحديد الموقع أولاً');
            return;
        }

        // استخراج الإحداثيات من العنوان (lat, lng)
        const coords = address.split(',').map(c => parseFloat(c.trim()));
        if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1])) {
            await window.NativeDialogs.error('خطأ', 'صيغة العنوان غير صحيحة');
            return;
        }

        // طلب اسم الموقع
        const name = prompt('أدخل اسم الموقع (مثل: البيت، العمل):', '');
        if (!name) return;

        const result = this.save(name, address, coords[0], coords[1]);

        if (result.success) {
            await window.NativeDialogs.success('تم!', result.message);
            this.renderList('saved-locations-list');
        } else {
            await window.NativeDialogs.error('خطأ', result.message);
        }
    }
};

// تصدير للاستخدام العام
window.SavedLocations = SavedLocations;

// دالة لفتح/إغلاق قائمة المواقع المحفوظة
function toggleSavedLocations() {
    const modal = new bootstrap.Offcanvas(document.getElementById('savedLocationsModal'));
    SavedLocations.renderList('saved-locations-list');
    modal.show();
}
