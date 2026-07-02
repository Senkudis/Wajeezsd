/**
 * Live Tracking - مشاركة الموقع الحي
 * Frontend component for real-time location tracking
 * Note: Requires backend WebSocket support
 */



const LiveTracking = {
    trackingMap: null,

    socketHandler: null,

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

        // الاستماع لتحديثات الموقع الحية عبر المقبس (Socket.IO)
        if (window.socket) {
            this.socketHandler = (data) => {
                if (data.orderId === this.orderId) {
                    this.updateCaptainLocation({ lat: data.lat, lng: data.lng });
                    this.checkProximity();
                }
            };
            window.socket.on('captain_location_updated', this.socketHandler);
        } else {
            console.warn('Socket is not connected. Live tracking defaults to initial location.');
        }
    },

    /**
     * إيقاف التتبع
     */
    stopTracking: function () {
        if (window.socket && this.socketHandler) {
            window.socket.off('captain_location_updated', this.socketHandler);
            this.socketHandler = null;
        }
    },

    /**
     * تهيئة خريطة التتبع
     */
    initTrackingMap: async function () {
        const mapElement = document.getElementById('tracking-map');
        if (!mapElement) return;

        const GoogleMap = (window.Capacitor && window.Capacitor.Plugins)
            ? (window.Capacitor.Plugins.GoogleMap || window.Capacitor.Plugins.CapacitorGoogleMaps)
            : null;

        if (!GoogleMap) {
            console.error('Critical Error: GoogleMap plugin is not registered in Capacitor.Plugins.');
            return;
        }

        try {
            // Force layout so the plugin can measure the element
            mapElement.style.display = 'block';
            mapElement.style.width = '100%';
            mapElement.style.minHeight = '400px';
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => requestAnimationFrame(r));
            await new Promise(r => setTimeout(r, 100)); // settle لـ native layer

            const rect = mapElement.getBoundingClientRect();
            const mapWidth  = Math.round(rect.width  || window.innerWidth);
            const mapHeight = Math.round(rect.height || 400);
            const mapX      = Math.round(rect.x || 0);
            const mapY      = Math.round(rect.y || 0);

            // ID فريد لكل session — يتجنب deadlock مع instances قديمة
            const sessionId = 'wajeezsd-map-tracking-' + Date.now();

            // timeout أمان 8 ثوانٍ — لا تعليق أبداً
            const newMap = await Promise.race([
                GoogleMap.create({
                    id: sessionId,
                    element: mapElement,
                    apiKey: (window.getMapsApiKey ? await window.getMapsApiKey() : ''),
                    config: {
                        width:  mapWidth,
                        height: mapHeight,
                        x:      mapX,
                        y:      mapY,
                        center: { lat: 15.6445, lng: 32.4777 },
                        zoom: 13,
                        androidLiteMode: false,
                    },
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('MAP_CREATION_TIMEOUT')), 8000))
            ]);

            await newMap.addMarker({
                coordinate: { lat: 15.6445, lng: 32.4777 },
                title: 'Wajeez Location',
            });

            this.trackingMap = newMap;
            console.log('✅ Tracking map created:', sessionId);

        } catch (error) {
            if (error.message === 'MAP_CREATION_TIMEOUT') {
                console.error('⏰ Tracking map creation timed out — UI protected from freeze.');
            } else {
                console.error('Error creating Native Google Map:', error);
            }
        }
    },

    /**
     * تحديث موقع الكابتن
     */
    updateCaptainLocation: function (location) {
        // Disabled Leaflet logic
    },

    /**
     * تحديث موقع العميل
     */
    updateClientLocation: function (location) {
        // Disabled Leaflet logic
    },

    /**
     * تحديث الخط بين الكابتن والعميل
     */
    updateRoute: function () {
        // Disabled Leaflet logic
    },

    /**
     * ضبط العرض ليشمل جميع العلامات
     */
    fitBounds: function () {
        // Disabled Leaflet logic
    },

    /**
     * حساب المسافة المتبقية
     */
    getDistance: function () {
        return 0;
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
