/**
 * Auth Helper - Unified Authentication Management
 * Handles Token Storage, Retrieval, and Validation
 */

const Auth = {
    // Keys for storage
    TOKEN_KEY: 'token',
    USER_KEY: 'user',

    /**
     * Save authentication data
     * @param {string} token - JWT Token
     * @param {object} user - User object
     */
    setAuth: (token, user) => {
        if (!token) return;

        // Ensure standard Bearer format if missing or clean if duplicate
        // But usually we store raw token and add Bearer in header
        localStorage.setItem(Auth.TOKEN_KEY, token);

        if (user) {
            localStorage.setItem(Auth.USER_KEY, JSON.stringify(user));
            // Backwards compatibility for existing pages
            localStorage.setItem('userId', user._id);
            if (user.role) {
                localStorage.setItem('role', user.role);
            }
            if (user.role === 'captain') {
                localStorage.setItem('captainName', user.name);
            } else if (user.role === 'merchant') {
                localStorage.setItem('merchantName', user.name || user.shopName);
            } else {
                localStorage.setItem('userName', user.name);
            }
        }

        // 🔔 توكن FCM مرتبط بالجهاز لا بالحساب — عند تسجيل دخول حساب (قد يكون مختلفاً على
        // نفس الهاتف) يجب إعادة مزامنة التوكن مع هذا الحساب. نمسح علامتي المزامنة والتهدئة
        // حتى تُنفّذ الصفحة التالية مزامنة نظيفة عبر NativeNotifications.updateServerToken.
        try {
            localStorage.removeItem('fcmToken_synced');
            localStorage.removeItem('fcmToken_lastAttempt');
        } catch (_) {}
    },

    /**
     * Get the raw token
     * @returns {string|null}
     */
    getToken: () => {
        return localStorage.getItem(Auth.TOKEN_KEY);
    },

    /**
     * Get the User object
     * @returns {object|null}
     */
    getUser: () => {
        const userStr = localStorage.getItem(Auth.USER_KEY);
        // ✅ إصلاح BUG-5: try/catch لحماية ضد JSON فاسد في localStorage
        if (!userStr) return null;
        try {
            return JSON.parse(userStr);
        } catch (e) {
            console.warn('[Auth] بيانات المستخدم تالفة — تنظيف localStorage');
            localStorage.removeItem(Auth.USER_KEY);
            return null;
        }
    },

    /**
     * Check if user is authenticated and token is valid
     * @returns {boolean}
     */
    isAuthenticated: () => {
        const token = Auth.getToken();
        if (!token) return false;

        if (Auth.isTokenExpired(token)) {
            Auth.logout();
            return false;
        }

        return true;
    },

    /**
     * Decode JWT to check expiration
     * @param {string} token 
     * @returns {boolean}
     */
    isTokenExpired: (token) => {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));

            const { exp } = JSON.parse(jsonPayload);
            const now = Date.now() / 1000;

            return exp < now;
        } catch (e) {
            return true; // Assume expired if invalid
        }
    },

    /**
     * clear auth data and redirect
     * @param {string} redirectUrl - URL to redirect to after logout
     */
    logout: async (redirectUrl = null) => {
        const role = localStorage.getItem('role') || '';
        const userStr = localStorage.getItem(Auth.USER_KEY);
        let isClient = role === 'client' || role === 'customer';
        let isCaptain = role === 'captain';
        let isMerchant = role === 'merchant';
        let isAdmin = role === 'admin';

        if (!isClient && !isCaptain && !isMerchant && !isAdmin && userStr) {
            try {
                const userObj = JSON.parse(userStr);
                isClient = userObj.role === 'client' || userObj.role === 'customer';
                isCaptain = userObj.role === 'captain';
                isMerchant = userObj.role === 'merchant';
                isAdmin = userObj.role === 'admin';
            } catch(e) {}
        }

        // ✅ تحديد صفحة الـ redirect تلقائياً حسب الدور إن لم تُحدد
        if (!redirectUrl) {
            if (isCaptain) redirectUrl = 'captain-login.html';
            else if (isMerchant) redirectUrl = 'merchant-dashboard.html';
            else if (isAdmin) redirectUrl = 'admin-login.html';
            else redirectUrl = 'index.html';
        }

        // ✅ إصلاح BUG-4: إزالة CDN import الذي يفشل offline — Google Sign Out لا يستحق تعطيل Logout
        if (isClient && window.Capacitor?.Plugins?.GoogleAuth) {
            try { await window.Capacitor.Plugins.GoogleAuth.signOut(); } catch (_) {}
        }

        // ✅ FIX: Set captain offline in DB immediately on logout
        if (isCaptain) {
            try {
                const token = localStorage.getItem(Auth.TOKEN_KEY);
                const apiUrl = window.API_URL || window.API_BASE_URL || 'https://wajeezsd.com';
                await fetch(`${apiUrl}/api/captain/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
                });
            } catch (_) { /* Non-fatal */ }
        }

        // ✅ تنظيف localStorage بالكامل
        localStorage.removeItem(Auth.TOKEN_KEY);
        localStorage.removeItem(Auth.USER_KEY);
        localStorage.removeItem('userId');
        localStorage.removeItem('userName');
        localStorage.removeItem('captainName');
        localStorage.removeItem('role');
        localStorage.removeItem('userPhone');
        // 🔔 امسح علامتي مزامنة FCM حتى يُعاد ربط توكن الجهاز بالحساب التالي الذي يسجّل الدخول.
        // (لا نمسح 'fcmToken' نفسه — فهو توكن الجهاز ويُسرّع المزامنة عند الدخول التالي.)
        localStorage.removeItem('fcmToken_synced');
        localStorage.removeItem('fcmToken_lastAttempt');

        // ✅ تنظيف الكاش المحلي (cache-manager)
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('wajeezsd_cache_') || k.startsWith('wassili_cache_')) {
                localStorage.removeItem(k);
            }
        });

        window.location.href = redirectUrl;
    },

    /**
     * Get Authorization Header for Fetch requests
     * @returns {object} Headers object
     */
    getAuthHeader: () => {
        const token = Auth.getToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    },

    getTokenSecondsLeft: () => {
        try {
            const token = Auth.getToken();
            if (!token) return 0;
            const base64Url = token.split('.')[1];
            let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const { exp } = JSON.parse(decodeURIComponent(window.atob(base64).split('').map(c =>
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
            return Math.max(0, exp - Date.now() / 1000);
        } catch (e) { return 0; }
    },

    /**
     * Silently refresh token if it expires in less than 24 hours
     */
    autoRefreshToken: async () => {
        const secondsLeft = Auth.getTokenSecondsLeft();
        if (secondsLeft <= 0 || secondsLeft > 86400) return; // Only refresh if < 24h left

        try {
            const API_BASE = (typeof window !== 'undefined' && window.API_URL)
                ? window.API_URL
                : (localStorage.getItem('API_URL') || 'https://wajeezsd.com');
            const res = await fetch(`${API_BASE}/api/auth/refresh`, {
                method: 'POST',
                headers: Auth.getAuthHeader()
            });
            if (res.ok) {
                const data = await res.json();
                if (data.token) {
                    localStorage.setItem(Auth.TOKEN_KEY, data.token);
                    console.log('🔄 Token refreshed silently');
                }
            }
        } catch (e) { /* Silent fail */ }
    },

    /**
     * 🔄 مزامنة الدور — يجلب الدور الحالي من السيرفر ويحدّث localStorage
     * يحل مشكلة: التاجر بعد موافقة الأدمن لازم يسجل خروج/دخول عشان يشوف لوحته
     */
    syncRole: async () => {
        try {
            const API_BASE = window.API_URL || window.API_BASE_URL || 'https://wajeezsd.com';
            const res = await fetch(`${API_BASE}/api/auth/me`, {
                headers: Auth.getAuthHeader()
            });
            if (!res.ok) return;

            const serverUser = await res.json();
            const localUser = Auth.getUser();
            const localRole = localStorage.getItem('role') || (localUser && localUser.role);

            // إذا تغيّر الدور في السيرفر عن اللي في localStorage
            if (serverUser.role && localRole && serverUser.role !== localRole) {
                // تحديث localStorage فوراً
                localStorage.setItem('role', serverUser.role);
                if (localUser) {
                    localUser.role = serverUser.role;
                    localUser.approvalStatus = serverUser.approvalStatus;
                    localStorage.setItem(Auth.USER_KEY, JSON.stringify(localUser));
                }

                // 🎉 إذا صار تاجر — أعرض رسالة ترحيبية ونقله للوحته
                if (serverUser.role === 'merchant' && localRole === 'client') {
                    if (typeof Swal !== 'undefined') {
                        const result = await Swal.fire({
                            icon: 'success',
                            title: '🎉 مبروك! تمت الموافقة على متجرك',
                            text: 'تم ترقية حسابك إلى تاجر. هل تريد الانتقال للوحة التاجر الآن؟',
                            confirmButtonText: 'الذهاب للوحة التاجر',
                            cancelButtonText: 'لاحقاً',
                            showCancelButton: true,
                            confirmButtonColor: '#04553A'
                        });
                        if (result.isConfirmed) {
                            window.location.href = 'merchant-dashboard.html';
                        }
                    } else {
                        // Fallback بدون Swal
                        if (confirm('🎉 مبروك! تمت الموافقة على متجرك. هل تريد الانتقال للوحة التاجر؟')) {
                            window.location.href = 'merchant-dashboard.html';
                        }
                    }
                }

                // 🚗 إذا صار كابتن
                if (serverUser.role === 'captain' && localRole === 'client') {
                    if (typeof Swal !== 'undefined') {
                        const result = await Swal.fire({
                            icon: 'success',
                            title: '🎉 تمت الموافقة على طلبك ككابتن!',
                            text: 'هل تريد الانتقال للوحة الكابتن؟',
                            confirmButtonText: 'الذهاب للوحة الكابتن',
                            cancelButtonText: 'لاحقاً',
                            showCancelButton: true,
                            confirmButtonColor: '#04553A'
                        });
                        if (result.isConfirmed) {
                            window.location.href = 'captain-orders.html';
                        }
                    }
                }
            }
        } catch (e) { /* Silent fail — لا نعطّل التطبيق لو السيرفر مش متاح */ }
    }
};

// Expose globally
window.Auth = Auth;

// ✅ إصلاح BUG-D: استخدام isAuthenticated() بدل التحقق المزدوج
if (Auth.isAuthenticated()) {
    Auth.autoRefreshToken();
    Auth.syncRole(); // 🔄 مزامنة الدور عند كل فتح صفحة

    // ✅ إصلاح BUG-13: تجديد دوري كل 30 دقيقة طوال الجلسة
    setInterval(() => {
        if (Auth.isAuthenticated()) {
            Auth.autoRefreshToken();
        }
    }, 30 * 60 * 1000); // كل 30 دقيقة
}

// 🏪 Inject "Back to Dashboard" button for merchants exploring client pages
function injectMerchantBtn() {
    if (document.getElementById('merchant-back-btn')) return; // already injected
    const role = localStorage.getItem('role');
    const uName = localStorage.getItem('userName');
    
    // Ensure we're a merchant and NOT on a merchant/dashboard page
    const isMerchantPage = window.location.pathname.includes('merchant-') || 
                           window.location.pathname.includes('captain-') || 
                           window.location.pathname.includes('admin-');
                           
    if (role === 'merchant' && uName && !isMerchantPage) {
        const btn = document.createElement('a');
        btn.id = 'merchant-back-btn';
        btn.href = 'merchant-dashboard.html';
        btn.innerHTML = '<i class="bi bi-shop-window me-2"></i> عودة للوحة المتجر';
        btn.style.cssText = 'position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 9999; background: #fbbf24; color: #000; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 0.9rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-decoration: none; display: flex; align-items: center; border: 2px solid #fff;';
        document.body.appendChild(btn);
    }
}
document.addEventListener('DOMContentLoaded', injectMerchantBtn);
