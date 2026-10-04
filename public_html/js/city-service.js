/**
 * 🌍 City Service — Central city management for the Wajeez multi-city platform.
 * 
 * Responsibilities:
 * - Persist the selected city in localStorage
 * - Provide a full-screen city selection UI on first launch
 * - Expose getters/setters used by all pages (order, registration, pricing, etc.)
 * 
 * Usage:
 *   CityService.getCity()         → 'Khartoum' | 'PortSudan'
 *   CityService.hasCity()         → boolean
 *   CityService.setCity('PortSudan')
 *   CityService.showCityPicker()  → Promise (resolves after user picks)
 *   CityService.ensureCity()      → Promise (shows picker only if no city is set)
 */

const CityService = {
    STORAGE_KEY: 'selected_city',
    VALID_CITIES: ['Khartoum', 'PortSudan'],

    /** Arabic labels for UI display */
    CITY_LABELS: {
        Khartoum:  'الخرطوم (أم درمان)',
        PortSudan: 'بورتسودان'
    },

    /**
     * Get the currently selected city.
     * Falls back to 'Khartoum' if nothing is stored (backward compat).
     * @returns {string} 'Khartoum' | 'PortSudan'
     */
    getCity() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        return this.VALID_CITIES.includes(saved) ? saved : null;
    },

    /**
     * Check if a city has been explicitly selected.
     * @returns {boolean}
     */
    hasCity() {
        return this.VALID_CITIES.includes(localStorage.getItem(this.STORAGE_KEY));
    },

    // ═══════════════════════════════════════════════════════════════
    // 🏠 مدينتك / المدينة المعروضة الآن
    //
    // كان اختيار المدينة واحداً يغيّر الحساب نفسه: من حوّل لبورتسودان ليطلب
    // لقريبه ونسي الرجوع، بقي التطبيق وحسابه على بورتسودان. الآن شيئان:
    //   home_city      مدينتك الدائمة — تُحفظ في الحساب (setCity)
    //   selected_city  المعروضة الآن — قد تكون مؤقتة لطلبٍ واحد (setTempCity)
    // وبعد إرسال الطلب يعود التطبيق لمدينتك (returnHomeAfterOrder). والخادم
    // يختم الطلب بمدينة مكانه على أيّ حال (utils/geofence.resolveOrderCity).
    // ═══════════════════════════════════════════════════════════════
    HOME_KEY: 'home_city',
    // اختار مدينةً مؤقتة في هذه الجلسة — لا ننبّهه على ما اختاره بنفسه للتوّ
    TEMP_SESSION_KEY: 'city_temp_chosen',

    /** حدود المدينتين — نسخة utils/geofence.CITY_BOUNDS (الخادم هو الحَكَم) */
    CITY_BOUNDS: {
        Khartoum:  { minLat: 15.0, maxLat: 16.4, minLng: 32.0, maxLng: 33.2 },
        PortSudan: { minLat: 19.2, maxLat: 20.1, minLng: 36.8, maxLng: 37.7 }
    },
    CITY_CENTERS: {
        Khartoum:  { lat: 15.6445, lng: 32.4777 },
        PortSudan: { lat: 19.6151, lng: 37.2164 }
    },
    /** أسماء قصيرة لشريحة الخريطة والرسائل */
    SHORT_LABELS: { Khartoum: 'أم درمان', PortSudan: 'بورتسودان' },
    CROSS_CITY_MESSAGE: 'التوصيل بين المدن غير متاح حالياً — الاستلام والتسليم لازم يكونوا في نفس المدينة',

    /** مدينتك الدائمة. حسابٌ قديم بلا home_city: المعروضة هي مدينته */
    getHomeCity() {
        let home = null;
        try { home = localStorage.getItem(this.HOME_KEY); } catch (_) {}
        if (this.VALID_CITIES.includes(home)) return home;
        return this.getCity();
    },

    /** المعروضة الآن غير مدينتك؟ */
    isAway() {
        const cur = this.getCity(), home = this.getHomeCity();
        return !!(cur && home && cur !== home);
    },

    shortLabel(city) {
        const c = city || this.getCity() || 'Khartoum';
        return this.SHORT_LABELS[c] || this.getCityLabel(c);
    },

    /** المدينة التي تقع فيها نقطة — null خارج المدينتين */
    cityAt(lat, lng) {
        lat = Number(lat); lng = Number(lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        for (const [city, b] of Object.entries(this.CITY_BOUNDS)) {
            if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) return city;
        }
        return null;
    },

    /** النقطة في المدينة المعروضة (أو خارج المدينتين — لا حكم)؟ */
    inCurrentCity(loc) {
        if (!loc) return false;
        const c = this.cityAt(loc.lat, loc.lng);
        return !c || c === this.getCity();
    },

    /**
     * نقاط طلبٍ واحد في مدينتين؟ التوصيل بين المدن غير متاح حتى تُضاف
     * خدمة الإرساليات — نفس حكم الخادم، لكن قبل الإرسال لا بعده.
     * @returns {string|null} رسالة الخطأ، أو null إن صحّ
     */
    crossCityProblem(points) {
        const seen = [];
        (points || []).forEach(p => {
            const c = p && this.cityAt(p.lat, p.lng);
            if (c && !seen.includes(c)) seen.push(c);
        });
        return seen.length > 1 ? this.CROSS_CITY_MESSAGE : null;
    },

    /**
     * تبديلٌ مؤقت للمدينة المعروضة — لا يغيّر مدينة الحساب.
     * @param {string} city
     * @param {object} [opts] { silent: لا تُعلَّم «اختارها بنفسه» }
     */
    setTempCity(city, opts = {}) {
        if (!this.VALID_CITIES.includes(city)) return;
        // أوّل تبديلٍ على حسابٍ قديم: ثبّت مدينته الحالية «مدينتك» قبل أن تتغيّر
        try {
            if (!this.VALID_CITIES.includes(localStorage.getItem(this.HOME_KEY)) && this.getCity()) {
                localStorage.setItem(this.HOME_KEY, this.getCity());
            }
            localStorage.setItem(this.STORAGE_KEY, city);
            if (!opts.silent) sessionStorage.setItem(this.TEMP_SESSION_KEY, city);
        } catch (_) {}
        this._hideBanner();
        window.dispatchEvent(new CustomEvent('city-changed', { detail: { city, temporary: true } }));
    },

    /** عُد لمدينتك */
    returnHome() {
        const home = this.getHomeCity();
        try { sessionStorage.removeItem(this.TEMP_SESSION_KEY); } catch (_) {}
        if (home && home !== this.getCity()) this.setTempCity(home, { silent: true });
    },

    /**
     * بعد إرسال طلبٍ من مدينةٍ مؤقتة: التطبيق يعود لمدينتك. فلا يُنسى على
     * بورتسودان حتى الطلب التالي من أم درمان.
     * @returns {string|null} اسم مدينتك إن أُعيد إليها — لتقوله رسالة النجاح
     */
    returnHomeAfterOrder() {
        if (!this.isAway()) return null;
        this.returnHome();
        return this.shortLabel(this.getHomeCity());
    },

    /** سطرٌ جاهز لرسالة النجاح */
    returnedNoteHtml(label) {
        return label
            ? `<div style="margin-top:8px;font-size:.85rem;color:#475569;">رجّعنا التطبيق لمدينتك: <b>${label}</b></div>`
            : '';
    },

    /**
     * Persist the selected city — مدينتك الدائمة: تُحفظ هنا وفي الحساب.
     * @param {string} city - 'Khartoum' | 'PortSudan'
     */
    setCity(city) {
        if (!this.VALID_CITIES.includes(city)) {
            console.warn('[CityService] Invalid city:', city, '— ignoring.');
            return Promise.resolve();
        }
        localStorage.setItem(this.STORAGE_KEY, city);
        try {
            localStorage.setItem(this.HOME_KEY, city);
            sessionStorage.removeItem(this.TEMP_SESSION_KEY);
        } catch (_) {}
        this._hideBanner();
        // Emit a DOM event so any open page can react (e.g., admin panel city switch)
        window.dispatchEvent(new CustomEvent('city-changed', { detail: { city } }));
        console.log('🌍 City set to:', city);

        // 🔑 CRITICAL FIX: sync city to the server's DB so new orders go to the right city's captains.
        // Returns a Promise so callers (showCityPicker, chooseMapCity) can await server confirmation
        // before reloading the page — prevents race condition where the page reloads before the
        // DB is updated, causing the next order to still be stamped with the old city.
        const token = localStorage.getItem('token');
        if (!token) return Promise.resolve();

        const apiBase = (typeof API_URL !== 'undefined' ? API_URL : '') ||
                        (typeof window.API_URL !== 'undefined' ? window.API_URL : '');
        return fetch(`${apiBase}/api/auth/city`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ city })
        }).then(r => {
            if (r.ok) console.log('[CityService] Server city updated to:', city);
            else r.json().then(e => console.warn('[CityService] Server city update failed:', e.message)).catch(() => {});
        }).catch(e => console.warn('[CityService] City sync network error:', e.message));
    },

    /**
     * Get the Arabic display label for a city.
     * @param {string} [city] - defaults to current city
     * @returns {string}
     */
    getCityLabel(city) {
        const c = city || this.getCity() || 'Khartoum';
        return this.CITY_LABELS[c] || c;
    },

    /**
     * Show the full-screen city selection modal.
     * Returns a Promise that resolves with the selected city string.
     * The user CANNOT dismiss this without selecting — it's a hard gate.
     * @returns {Promise<string>}
     */
    showCityPicker() {
        return new Promise((resolve) => {
            // Create a full-screen overlay
            const overlay = document.createElement('div');
            overlay.id = 'city-picker-overlay';
            const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
            overlay.innerHTML = `
                <div class="city-picker-container">
                    <img src="/logo-white.png" alt="وجيز" class="city-picker-logo">
                    <h2>اختر مدينتك</h2>
                    <p>لنعرض لك المتاجر والخدمات المتاحة في منطقتك</p>
                    <div class="city-picker-cards">
                        <button class="city-card" data-city="Khartoum">
                            <span class="city-card-ico">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="7" height="13" rx="1"/><rect x="13" y="4" width="8" height="17" rx="1"/><path d="M6 12h1M6 15.5h1M16 8h2M16 12h2M16 16h2"/></svg>
                            </span>
                            <span class="city-card-text">
                                <span class="city-card-name">الخرطوم</span>
                                <span class="city-card-sub">الخرطوم · أم درمان · بحري</span>
                            </span>
                            <span class="city-card-check">${CHECK_SVG}</span>
                        </button>
                        <button class="city-card" data-city="PortSudan">
                            <span class="city-card-ico">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7c2 0 2 1.4 4 1.4S8 7 10 7s2 1.4 4 1.4S16 7 18 7s2 1.4 4 1.4"/><path d="M2 12c2 0 2 1.4 4 1.4S8 12 10 12s2 1.4 4 1.4S16 12 18 12s2 1.4 4 1.4"/><path d="M2 17c2 0 2 1.4 4 1.4S8 17 10 17s2 1.4 4 1.4S16 17 18 17s2 1.4 4 1.4"/></svg>
                            </span>
                            <span class="city-card-text">
                                <span class="city-card-name">بورتسودان</span>
                                <span class="city-card-sub">ولاية البحر الأحمر</span>
                            </span>
                            <span class="city-card-check">${CHECK_SVG}</span>
                        </button>
                    </div>
                </div>
            `;

            // Inject styles (scoped to the overlay)
            const style = document.createElement('style');
            style.textContent = `
                #city-picker-overlay {
                    position: fixed; inset: 0; z-index: 2147483647;
                    background: radial-gradient(circle at 50% 22%, #0a6e47 0%, #04553A 55%, #032e1f 100%);
                    display: flex; align-items: center; justify-content: center;
                    font-family: 'Cairo', 'Segoe UI', sans-serif; direction: rtl;
                    animation: cityPickerFadeIn 0.4s ease-out; padding: 24px;
                }
                @keyframes cityPickerFadeIn { from { opacity: 0; } to { opacity: 1; } }
                .city-picker-container { text-align: center; max-width: 400px; width: 100%; }
                .city-picker-logo {
                    width: 150px; height: auto; margin-bottom: 26px;
                    animation: cityLogoFloat 3s ease-in-out infinite;
                }
                @keyframes cityLogoFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
                .city-picker-container h2 { color: #fff; font-size: 1.5rem; font-weight: 800; margin: 0 0 6px; }
                .city-picker-container > p { color: rgba(255,255,255,0.72); font-size: 0.92rem; margin: 0 0 26px; }
                .city-picker-cards { display: flex; flex-direction: column; gap: 14px; }
                .city-card {
                    display: flex; align-items: center; gap: 14px; width: 100%;
                    background: rgba(255,255,255,0.08);
                    border: 2px solid rgba(255,255,255,0.18);
                    border-radius: 18px; padding: 15px 18px; cursor: pointer;
                    color: #fff; font-family: inherit; text-align: right;
                    transition: all 0.25s cubic-bezier(0.4,0,0.2,1); outline: none;
                }
                .city-card:hover, .city-card:focus {
                    background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.35);
                }
                .city-card-ico {
                    width: 54px; height: 54px; border-radius: 15px; flex-shrink: 0;
                    background: rgba(255,255,255,0.13);
                    display: flex; align-items: center; justify-content: center;
                }
                .city-card-ico svg { width: 28px; height: 28px; color: #fff; }
                .city-card-text { display: flex; flex-direction: column; flex: 1; }
                .city-card-name { font-size: 1.15rem; font-weight: 800; }
                .city-card-sub { font-size: 0.76rem; color: rgba(255,255,255,0.6); margin-top: 2px; }
                .city-card-check {
                    width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
                    border: 2px solid rgba(255,255,255,0.35);
                    display: flex; align-items: center; justify-content: center;
                    color: transparent; transition: all 0.2s;
                }
                .city-card-check svg { width: 15px; height: 15px; }
                .city-card.selected { border-color: #D8B765; background: rgba(191,139,31,0.16); }
                .city-card.selected .city-card-check { background: #BF8B1F; border-color: #BF8B1F; color: #fff; }
                .city-card.selected .city-card-ico { background: rgba(216,183,101,0.28); }
                .city-picker-note { color: rgba(255,255,255,0.5); font-size: 0.74rem; margin-top: 24px; }
                .city-confirm-wrap { margin-top: 22px; animation: cityConfirmSlideUp 0.3s ease-out; }
                @keyframes cityConfirmSlideUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
                .city-confirm-btn {
                    background: linear-gradient(135deg, #BF8B1F, #D8B765); color: #fff; border: none;
                    border-radius: 14px; padding: 15px 0; width: 100%; font-size: 1.05rem; font-weight: 800;
                    font-family: inherit; cursor: pointer; box-shadow: 0 8px 24px rgba(191,139,31,0.35);
                    transition: transform 0.2s, box-shadow 0.2s;
                }
                .city-confirm-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(191,139,31,0.45); }
            `;
            document.head.appendChild(style);
            document.body.appendChild(overlay);

            let selectedCity = null;
            const cards = overlay.querySelectorAll('.city-card');
            const cardsContainer = overlay.querySelector('.city-picker-cards');

            cards.forEach(card => {
                card.addEventListener('click', () => {
                    selectedCity = card.dataset.city;
                    // Highlight selected card
                    cards.forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');

                    // Show confirm button if not already shown
                    if (!overlay.querySelector('.city-confirm-wrap')) {
                        const confirmWrap = document.createElement('div');
                        confirmWrap.className = 'city-confirm-wrap';
                        confirmWrap.innerHTML = `<button class="city-confirm-btn">تأكيد — ${CityService.CITY_LABELS[selectedCity]}</button>`;
                        cardsContainer.parentElement.insertBefore(confirmWrap, overlay.querySelector('.city-picker-note'));

                        confirmWrap.querySelector('.city-confirm-btn').addEventListener('click', async () => {
                            // Disable button to prevent double-clicks during server sync
                            const btn = confirmWrap.querySelector('.city-confirm-btn');
                            btn.disabled = true;
                            // 🔑 Await server sync BEFORE resolving — eliminates the race condition
                            // where page reload happens before city is updated in DB
                            await CityService.setCity(selectedCity);
                            overlay.style.animation = 'cityPickerFadeIn 0.3s ease-out reverse';
                            setTimeout(() => {
                                overlay.remove();
                                style.remove();
                                resolve(selectedCity);
                            }, 280);
                        });
                    } else {
                        // Update button text if user switches selection
                        overlay.querySelector('.city-confirm-btn').textContent = `تأكيد — ${CityService.CITY_LABELS[selectedCity]}`;
                    }
                });
            });
        });
    },

    /**
     * Ensure a city is selected. If not, shows the picker.
     * Call this at app startup to gate the experience.
     * @returns {Promise<string>} The selected city
     */
    async ensureCity() {
        if (this.hasCity()) {
            return this.getCity();
        }
        return this.showCityPicker();
    },

    // ═══════════════════════════════════════════════════════════════
    // 🔀 لوحة التبديل — من أسفل الشاشة، لا نافذة الفتح الأول الكاملة
    // ═══════════════════════════════════════════════════════════════
    _styles() {
        if (document.getElementById('wj-city-ui-styles')) return;
        const st = document.createElement('style');
        st.id = 'wj-city-ui-styles';
        st.textContent = `
            .wj-city-backdrop { position: fixed; inset: 0; z-index: 2147483647; background: rgba(15,23,42,.45);
                display: flex; align-items: flex-end; justify-content: center; font-family: 'Cairo', sans-serif; direction: rtl;
                animation: wjCityFade .2s ease-out; }
            @keyframes wjCityFade { from { opacity: 0; } to { opacity: 1; } }
            @keyframes wjCityUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            .wj-city-sheet { width: 100%; max-width: 480px; background: #fff; color: #0f172a; border-radius: 22px 22px 0 0;
                padding: 10px 18px calc(var(--sab, 0px) + 18px); box-shadow: 0 -8px 30px rgba(0,0,0,.18);
                animation: wjCityUp .25s cubic-bezier(.2,.8,.2,1); }
            .wj-city-grab { width: 44px; height: 5px; border-radius: 3px; background: #cbd5e1; margin: 2px auto 12px; }
            .wj-city-sheet h2 { font-size: 1.05rem; font-weight: 800; margin: 0 0 4px; }
            .wj-city-sheet .wj-city-sub { font-size: .82rem; color: #64748b; margin: 0 0 14px; line-height: 1.7; }
            .wj-city-opt { width: 100%; display: flex; align-items: center; gap: 12px; text-align: right; font-family: inherit;
                background: #fff; border: 2px solid #e2e8f0; border-radius: 16px; padding: 12px 14px; margin-bottom: 10px;
                cursor: pointer; color: inherit; min-height: 64px; }
            .wj-city-opt[aria-checked="true"] { border-color: #04553A; background: #f0fdf4; }
            .wj-city-opt:focus-visible { outline: 3px solid #60a5fa; outline-offset: 2px; }
            .wj-city-opt .nm { font-weight: 800; font-size: 1rem; display: block; }
            .wj-city-opt .ds { font-size: .78rem; color: #64748b; display: block; }
            .wj-city-opt .tx { flex: 1; min-width: 0; }
            .wj-city-tag { font-size: .7rem; font-weight: 800; color: #04553A; background: #dcfce7; border-radius: 999px; padding: 2px 9px; white-space: nowrap; }
            .wj-city-radio { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #cbd5e1; flex: none; }
            .wj-city-opt[aria-checked="true"] .wj-city-radio { border: 7px solid #04553A; }
            .wj-city-note { font-size: .8rem; color: #92400e; background: #fef3c7; border-radius: 12px; padding: 9px 12px; line-height: 1.7; margin: 2px 0 10px; }
            .wj-city-link { display: block; width: 100%; background: none; border: none; font-family: inherit; font-weight: 800;
                font-size: .85rem; color: #04553A; padding: 10px; cursor: pointer; text-decoration: underline; }
            .wj-city-banner { position: fixed; z-index: 2147483647; left: 12px; right: 12px; max-width: 520px; margin: 0 auto;
                top: calc(var(--sat, 0px) + 122px); background: #fffbeb; color: #78350f; border: 1.5px solid #f59e0b;
                border-radius: 14px; padding: 10px 12px; box-shadow: 0 6px 20px rgba(0,0,0,.15); font-family: 'Cairo', sans-serif;
                direction: rtl; display: flex; align-items: center; gap: 10px; font-size: .85rem; font-weight: 700; line-height: 1.6;
                animation: wjCityFade .2s ease-out; }
            .wj-city-banner .tx { flex: 1; min-width: 0; }
            .wj-city-banner .go { background: #04553A; color: #fff; border: none; border-radius: 10px; padding: 8px 12px;
                font-family: inherit; font-weight: 800; font-size: .82rem; cursor: pointer; white-space: nowrap; min-height: 40px; }
            .wj-city-banner .x { background: none; border: none; color: #92400e; font-size: 1.2rem; width: 36px; height: 36px; cursor: pointer; flex: none; }
            .wj-city-toast { position: fixed; z-index: 2147483647; left: 50%; transform: translateX(-50%);
                top: calc(var(--sat, 0px) + 14px); max-width: calc(100vw - 32px); width: max-content;
                background: #0f172a; color: #fff; border-radius: 14px; padding: 10px 16px; font-family: 'Cairo', sans-serif;
                font-size: .86rem; font-weight: 700; line-height: 1.6; text-align: center; direction: rtl;
                box-shadow: 0 8px 24px rgba(0,0,0,.25); animation: wjCityFade .2s ease-out; }
            body.dark-mode .wj-city-sheet { background: #1e293b; color: #f1f5f9; }
            body.dark-mode .wj-city-opt { background: #0f172a; border-color: #334155; }
            body.dark-mode .wj-city-opt[aria-checked="true"] { background: #052e1a; border-color: #4ade80; }
            body.dark-mode .wj-city-opt .ds, body.dark-mode .wj-city-sheet .wj-city-sub { color: #94a3b8; }
            body.dark-mode .wj-city-link { color: #4ade80; }
            body.dark-mode .wj-city-banner { background: #2a1f05; color: #fde68a; }
            body.dark-mode .wj-city-banner .x { color: #fde68a; }
        `;
        document.head.appendChild(st);
    },

    /**
     * لوحة التبديل: المدينتان، والحالية معلَّمة، و«مدينتك» موسومة.
     * اختيار غير مدينتك تبديلٌ مؤقت — يعود التطبيق بعد إرسال الطلب.
     * @returns {Promise<string|null>} المدينة المختارة، أو null إن أُغلقت
     */
    showCitySheet() {
        this._styles();
        const existing = document.querySelector('.wj-city-backdrop');
        if (existing) existing.remove();
        const cur = this.getCity() || 'Khartoum';
        const home = this.getHomeCity() || cur;
        const lastFocus = document.activeElement;
        const DESC = { Khartoum: 'الخرطوم · أم درمان · بحري', PortSudan: 'ولاية البحر الأحمر' };

        return new Promise((resolve) => {
            const bd = document.createElement('div');
            bd.className = 'wj-city-backdrop';
            bd.innerHTML = `
                <div class="wj-city-sheet" role="dialog" aria-modal="true" aria-labelledby="wjCityTitle">
                    <div class="wj-city-grab" aria-hidden="true"></div>
                    <h2 id="wjCityTitle">المدينة</h2>
                    <p class="wj-city-sub">المتاجر والأسعار والكباتن تتبع المدينة المختارة.</p>
                    <div role="radiogroup" aria-labelledby="wjCityTitle">
                        ${this.VALID_CITIES.map(c => `
                            <button type="button" class="wj-city-opt" role="radio" data-city="${c}" aria-checked="${c === cur}">
                                <span class="wj-city-radio" aria-hidden="true"></span>
                                <span class="tx"><span class="nm">${this.CITY_LABELS[c]}</span><span class="ds">${DESC[c] || ''}</span></span>
                                ${c === home ? '<span class="wj-city-tag">مدينتك</span>' : ''}
                            </button>`).join('')}
                    </div>
                    ${cur !== home ? `
                        <div class="wj-city-note">أنت الآن على ${this.shortLabel(cur)} مؤقتاً. بعد إرسال الطلب يرجع التطبيق لـ${this.shortLabel(home)}.</div>
                        <button type="button" class="wj-city-link" data-make-home="${cur}">اجعل ${this.shortLabel(cur)} مدينتي الدائمة</button>`
                    : `<div class="wj-city-sub" style="margin:4px 0 0;">تطلب لزول في مدينة تانية؟ اختارها — بعد ما ترسل الطلب بنرجّعك لـ${this.shortLabel(home)}.</div>`}
                </div>`;
            document.body.appendChild(bd);

            const close = (val) => {
                document.removeEventListener('keydown', onKey, true);
                bd.remove();
                if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus();
                resolve(val);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
                if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                const opts = Array.from(bd.querySelectorAll('.wj-city-opt'));
                const i = opts.indexOf(document.activeElement);
                if (i === -1) return;
                e.preventDefault();
                opts[(i + 1) % opts.length].focus();
            };
            document.addEventListener('keydown', onKey, true);

            bd.addEventListener('click', async (e) => {
                if (e.target === bd) { close(null); return; }
                const mk = e.target.closest('[data-make-home]');
                if (mk) {
                    await this.setCity(mk.dataset.makeHome);
                    this._toast(`${this.shortLabel(mk.dataset.makeHome)} صارت مدينتك`);
                    close(mk.dataset.makeHome);
                    return;
                }
                const opt = e.target.closest('.wj-city-opt');
                if (!opt) return;
                const city = opt.dataset.city;
                if (city === cur) { close(city); return; }
                if (city === home) {
                    this.returnHome();
                    this._toast(`رجعت لـ${this.shortLabel(city)}`);
                } else {
                    this.setTempCity(city);
                    this._toast(`الطلب الجاي في ${this.shortLabel(city)} — بعد ما ترسله بنرجّعك لـ${this.shortLabel(home)}`);
                }
                close(city);
            });

            const first = bd.querySelector('.wj-city-opt[aria-checked="true"]') || bd.querySelector('.wj-city-opt');
            if (first) first.focus();
        });
    },

    // توستٌ خاصّ لا Swal: الخريطة بأعلى طبقة (z-index أقصى) فتختفي توستات
    // Swal تحتها — ونفس الطبقة مع إلحاقٍ بآخر الصفحة يظهر فوقها
    _toast(text) {
        try {
            this._styles();
            const old = document.querySelector('.wj-city-toast');
            if (old) old.remove();
            const t = document.createElement('div');
            t.className = 'wj-city-toast';
            t.setAttribute('role', 'status');
            t.textContent = text;
            document.body.appendChild(t);
            setTimeout(() => t.remove(), 3600);
        } catch (_) {}
    },

    // ═══════════════════════════════════════════════════════════════
    // 📍 «إنت في أم درمان والتطبيق على بورتسودان»
    // نسي الرجوع من جلسةٍ سابقة؟ موقعه يقول ذلك — نقترح الرجوع بضغطة.
    // لا ننبّه على مدينةٍ اختارها بنفسه في هذه الجلسة، ولا مرّتين لنفس الحال.
    // ═══════════════════════════════════════════════════════════════
    noticeLocation(lat, lng) {
        const here = this.cityAt(lat, lng);
        const cur = this.getCity();
        if (!here || !cur || here === cur) { this._hideBanner(); return; }
        let chosen = null, dismissed = null;
        try {
            chosen = sessionStorage.getItem(this.TEMP_SESSION_KEY);
            dismissed = sessionStorage.getItem('city_banner_dismissed');
        } catch (_) {}
        if (chosen === cur) return;
        const key = `${here}>${cur}`;
        if (dismissed === key) return;
        if (document.querySelector('.wj-city-banner')) return;

        this._styles();
        const b = document.createElement('div');
        b.className = 'wj-city-banner';
        b.setAttribute('role', 'status');
        b.innerHTML = `
            <span class="tx">إنت في ${this.shortLabel(here)} والتطبيق على ${this.shortLabel(cur)}</span>
            <button type="button" class="go">انتقل لـ${this.shortLabel(here)}</button>
            <button type="button" class="x" aria-label="إخفاء">&times;</button>`;
        b.querySelector('.go').addEventListener('click', () => {
            // مدينة موقعه هي مدينته؟ رجوع. وإلا تبديلٌ مؤقت إليها
            if (here === this.getHomeCity()) this.returnHome();
            else this.setTempCity(here);
            this._hideBanner();
            this._toast(`صرت على ${this.shortLabel(here)}`);
        });
        b.querySelector('.x').addEventListener('click', () => {
            try { sessionStorage.setItem('city_banner_dismissed', key); } catch (_) {}
            this._hideBanner();
        });
        document.body.appendChild(b);
    },

    _hideBanner() {
        const b = typeof document !== 'undefined' && document.querySelector('.wj-city-banner');
        if (b) b.remove();
    }
};

// Expose globally
window.CityService = CityService;
