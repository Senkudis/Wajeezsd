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

    /**
     * Persist the selected city.
     * @param {string} city - 'Khartoum' | 'PortSudan'
     */
    setCity(city) {
        if (!this.VALID_CITIES.includes(city)) {
            console.warn('[CityService] Invalid city:', city, '— ignoring.');
            return Promise.resolve();
        }
        localStorage.setItem(this.STORAGE_KEY, city);
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
    }
};

// Expose globally
window.CityService = CityService;
