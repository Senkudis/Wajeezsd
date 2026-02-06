/**
 * Live Tracking - مشاركة الموقع الحي
 * Frontend component for real-time location tracking
 * Note: Requires backend WebSocket support
 */

const LiveTracking = {
    trackingMap: null,
    captainMarker: null,
    clientMarker: null,
    routeLine: null,
    updateInterval: null,
    orderId: null,

    /**
     * بدء التتبع
     */
    startTracking: function (orderId, captainLocation, clientLocation) {
        this.orderId = orderId;

        // إنشاء الخريطة إذا لم تكن موجودة
        if (!this.trackingMap) {
            this.initTrackingMap();
        }

        // تحديث المواقع الأولية
        this.updateCaptainLocation(captainLocation);
        this.updateClientLocation(clientLocation);

        // بدء التحديث الدوري (كل 5 ثواني)
        this.updateInterval = setInterval(() => {
            this.fetchCaptainLocation();
        }, 5000);
    },

    /**
     * إيقاف التتبع
     */
    stopTracking: function () {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    },

    /**
     * تهيئة خريطة التتبع
     */
    initTrackingMap: function () {
        const mapElement = document.getElementById('tracking-map');
        if (!mapElement) return;

        // إنشاء الخريطة
        this.trackingMap = L.map('tracking-map').setView([15.5007, 32.5599], 13);

        // إضافة طبقة الخريطة
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.trackingMap);
    },

    /**
     * تحديث موقع الكابتن
     */
    updateCaptainLocation: function (location) {
        if (!this.trackingMap) return;

        const { lat, lng } = location;

        // إنشاء أو تحديث علامة الكابتن
        if (!this.captainMarker) {
            const captainIcon = L.divIcon({
                className: 'captain-marker',
                html: '<div style="background: #0a8754; color: white; padding: 8px; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="bi bi-person-fill"></i></div>',
                iconSize: [40, 40]
            });

            this.captainMarker = L.marker([lat, lng], { icon: captainIcon })
                .addTo(this.trackingMap)
                .bindPopup('الكابتن 🚗');
        } else {
            // تحريك العلامة بسلاسة
            this.captainMarker.setLatLng([lat, lng]);
        }

        // تحديث الخط
        this.updateRoute();

        // تحديث العرض
        this.fitBounds();
    },

    /**
     * تحديث موقع العميل
     */
    updateClientLocation: function (location) {
        if (!this.trackingMap) return;

        const { lat, lng } = location;

        if (!this.clientMarker) {
            const clientIcon = L.divIcon({
                className: 'client-marker',
                html: '<div style="background: #dc3545; color: white; padding: 8px; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><i class="bi bi-geo-alt-fill"></i></div>',
                iconSize: [40, 40]
            });

            this.clientMarker = L.marker([lat, lng], { icon: clientIcon })
                .addTo(this.trackingMap)
                .bindPopup('موقعك 📍');
        }
    },

    /**
     * تحديث الخط بين الكابتن والعميل
     */
    updateRoute: function () {
        if (!this.captainMarker || !this.clientMarker) return;

        const captainPos = this.captainMarker.getLatLng();
        const clientPos = this.clientMarker.getLatLng();

        if (this.routeLine) {
            this.trackingMap.removeLayer(this.routeLine);
        }

        this.routeLine = L.polyline([captainPos, clientPos], {
            color: '#0a8754',
            weight: 3,
            opacity: 0.7,
            dashArray: '10, 10'
        }).addTo(this.trackingMap);
    },

    /**
     * ضبط العرض ليشمل جميع العلامات
     */
    fitBounds: function () {
        if (!this.captainMarker || !this.clientMarker) return;

        const group = L.featureGroup([this.captainMarker, this.clientMarker]);
        this.trackingMap.fitBounds(group.getBounds().pad(0.1));
    },

    /**
     * جلب موقع الكابتن من السيرفر
     */
    fetchCaptainLocation: async function () {
        if (!this.orderId) return;

        try {
            // هنا يجب الاتصال بالـ API
            // const response = await fetch(`/api/orders/${this.orderId}/captain-location`);
            // const data = await response.json();
            // this.updateCaptainLocation(data.location);

            // مثال تجريبي (حركة عشوائية)
            if (this.captainMarker) {
                const currentPos = this.captainMarker.getLatLng();
                const newLat = currentPos.lat + (Math.random() - 0.5) * 0.001;
                const newLng = currentPos.lng + (Math.random() - 0.5) * 0.001;
                this.updateCaptainLocation({ lat: newLat, lng: newLng });
            }
        } catch (error) {
            console.error('Error fetching captain location:', error);
        }
    },

    /**
     * حساب المسافة المتبقية
     */
    getDistance: function () {
        if (!this.captainMarker || !this.clientMarker) return 0;

        const captainPos = this.captainMarker.getLatLng();
        const clientPos = this.clientMarker.getLatLng();

        return (captainPos.distanceTo(clientPos) / 1000).toFixed(2); // بالكيلومتر
    },

    /**
     * التحقق من اقتراب الكابتن
     */
    checkProximity: function () {
        const distance = this.getDistance();

        if (distance < 0.5 && !this.proximityAlerted) {
            this.proximityAlerted = true;

            // إشعار للعميل
            if (window.NativeDialogs) {
                window.NativeDialogs.success('الكابتن قريب!', 'الكابتن على بعد أقل من 500 متر منك');
            }

            // صوت واهتزاز
            if (window.NotificationSounds) {
                window.NotificationSounds.playNewOrder();
            }
        }
    }
};

// تصدير للاستخدام العام
window.LiveTracking = LiveTracking;

// مثال على الاستخدام:
// LiveTracking.startTracking(orderId, { lat: 15.5007, lng: 32.5599 }, { lat: 15.5107, lng: 32.5699 });
