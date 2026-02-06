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
            if (user.role === 'captain') {
                localStorage.setItem('captainName', user.name);
            } else {
                localStorage.setItem('userName', user.name);
            }
        }
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
        return userStr ? JSON.parse(userStr) : null;
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
     */
    logout: () => {
        localStorage.removeItem(Auth.TOKEN_KEY);
        localStorage.removeItem(Auth.USER_KEY);
        localStorage.removeItem('userId');
        localStorage.removeItem('userName');
        localStorage.removeItem('captainName');

        // Redirect to landing page
        window.location.href = 'index.html';
    },

    /**
     * Get Authorization Header for Fetch requests
     * @returns {object} Headers object
     */
    getAuthHeader: () => {
        const token = Auth.getToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }
};

// Expose globally
window.Auth = Auth;
