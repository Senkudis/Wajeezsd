// ─── API Configuration ───
// غيّر هذا الرابط لرابط السيرفر الفعلي عند الرفع
const API_URL = 'https://wajeezsd.com/api';

// رابط موقع الإحالات (لتوليد روابط الدعوة)
const REFERRAL_SITE_URL = window.location.origin;

// ─── Auth Helpers ───
const Auth = {
    getToken: () => localStorage.getItem('ref_admin_token'),
    getUser: () => JSON.parse(localStorage.getItem('ref_admin_user') || 'null'),
    setSession: (token, user) => {
        localStorage.setItem('ref_admin_token', token);
        localStorage.setItem('ref_admin_user', JSON.stringify(user));
    },
    clearSession: () => {
        localStorage.removeItem('ref_admin_token');
        localStorage.removeItem('ref_admin_user');
    },
    requireAdmin: () => {
        const token = Auth.getToken();
        if (!token) {
            window.location.href = '../admin/login.html';
            return false;
        }
        return true;
    }
};

// ─── HTTP Helpers ───
async function apiFetch(endpoint, options = {}) {
    const token = Auth.getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

    if (res.status === 401) {
        Auth.clearSession();
        window.location.href = '../admin/login.html';
        return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
    return data;
}

// ─── Utility Functions ───
function showToast(message, type = 'default') {
    const container = document.getElementById('toast-container') || (() => {
        const el = document.createElement('div');
        el.id = 'toast-container';
        el.className = 'toast-container';
        document.body.appendChild(el);
        return el;
    })();

    const toast = document.createElement('div');
    const typeClass = (type && type !== 'default') ? ` toast-${type}` : '';
    toast.className = `toast${typeClass}`;
    const iconMap = { success: 'check-circle', error: 'alert-circle', default: 'info' };
    const icon = iconMap[type] || 'info';
    toast.innerHTML = `<i data-lucide="${icon}" style="width:16px;height:16px;flex-shrink:0;"></i><span>${message}</span>`;
    container.appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });
    setTimeout(() => toast.remove(), 3500);
}

function copyToClipboard(text, label = 'تم النسخ!') {
    navigator.clipboard.writeText(text).then(() => showToast(label, 'success'));
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ar-SA', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Sidebar Toggle (mobile) ───
function initSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.querySelector('.sidebar-backdrop');
    const menuBtn = document.querySelector('.mobile-menu-btn');

    if (!sidebar) return;

    menuBtn?.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        backdrop?.classList.toggle('open');
    });
    backdrop?.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop?.classList.remove('open');
    });
}

document.addEventListener('DOMContentLoaded', initSidebar);

// ─── CSV Export ───
function exportCSV(rows, filename = 'export.csv') {
    if (!rows || !rows.length) { showToast('لا توجد بيانات للتصدير', 'error'); return; }
    const headers = Object.keys(rows[0]);
    const escape  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines   = [headers.map(escape).join(',')];
    rows.forEach(r => lines.push(headers.map(h => escape(r[h])).join(',')));
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
    showToast('تم تصدير الملف', 'success');
}

// ─── Date Formatters ───
function formatDateShort(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ─── Pending Notifications Polling ───
// Call startPendingPolling() from any admin page to keep the sidebar badge live.
let _pollInterval = null;
function startPendingPolling(badgeSelector = '#pendingBadge') {
    if (_pollInterval) return; // already running
    async function checkPending() {
        try {
            const stats = await apiFetch('/referral/stats');
            const count = stats.pendingMarketers ?? 0;
            const prev  = parseInt(sessionStorage.getItem('_lastPending') || '0', 10);
            // Update all badge elements on the page
            document.querySelectorAll(badgeSelector).forEach(el => {
                if (count > 0) { el.textContent = count; el.style.display = 'inline'; }
                else           { el.style.display = 'none'; }
            });
            // Notify if new requests arrived
            if (count > prev && prev >= 0) {
                const diff = count - prev;
                showToast(`${diff} طلب مسوّق جديد بانتظار المراجعة`, 'default');
            }
            sessionStorage.setItem('_lastPending', count);
        } catch (_) { /* silent */ }
    }
    checkPending();
    _pollInterval = setInterval(checkPending, 45000); // every 45s
}
