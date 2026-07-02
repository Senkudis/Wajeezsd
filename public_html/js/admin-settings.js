// Admin Settings - Dynamic Pricing Configuration
const token = localStorage.getItem('adminToken');
let userObj = null;
try { userObj = JSON.parse(localStorage.getItem('user')); } catch(e) {}
if (!token || !userObj || userObj.role !== 'admin') {
    window.location.href = 'admin-login.html';
}

// Load current settings on page load
async function loadSettings() {
    try {
        const city = document.getElementById('citySelector')?.value || 'Khartoum';
        const res = await fetch(`${API_URL}/api/admin/settings?city=${encodeURIComponent(city)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            throw new Error('Failed to load settings');
        }

        const settings = await res.json();

        // Fill form with current values
        document.getElementById('baseFare').value = settings.baseFare || 10;
        document.getElementById('costPerKm').value = settings.costPerKm || 5;
        document.getElementById('costPerMinute').value = settings.costPerMinute || 2;
        document.getElementById('commissionRate').value = settings.commissionRate || 0.15;
        document.getElementById('adminPhone').value = settings.adminPhone || '249112046348';
        
        // App Settings
        if (document.getElementById('appVersion')) {
            document.getElementById('appVersion').value = settings.appVersion || '1.0.2';
            document.getElementById('minVersion').value = settings.minVersion || settings.appVersion || '1.0.2';
            document.getElementById('playStoreLink').value = settings.playStoreLink || 'https://play.google.com/store/apps/details?id=com.wajeezsd.app';
            document.getElementById('forceUpdate').checked = settings.forceUpdate || false;
        }

        // Show last update info
        if (settings.updatedAt) {
            const lastUpdateDiv = document.getElementById('currentSettings');
            const lastUpdateText = document.getElementById('lastUpdate');
            lastUpdateText.textContent = new Date(settings.updatedAt).toLocaleString('ar-EG');
            lastUpdateDiv.style.display = 'block';
        }

    } catch (error) {
        console.error('Error loading settings:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'فشل تحميل الإعدادات الحالية',
            confirmButtonColor: '#667eea'
        });
    }
}

// Save settings
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        baseFare: parseFloat(document.getElementById('baseFare').value),
        costPerKm: parseFloat(document.getElementById('costPerKm').value),
        costPerMinute: parseFloat(document.getElementById('costPerMinute').value),
        commissionRate: parseFloat(document.getElementById('commissionRate').value),
        adminPhone: document.getElementById('adminPhone').value.trim(),
        city: document.getElementById('citySelector').value
    };

    if (document.getElementById('appVersion')) {
        data.appVersion = document.getElementById('appVersion').value.trim();
        data.minVersion = document.getElementById('minVersion').value.trim();
        data.playStoreLink = document.getElementById('playStoreLink').value.trim();
        data.forceUpdate = document.getElementById('forceUpdate').checked;
    }

    // Validation
    if (data.commissionRate < 0 || data.commissionRate > 1) {
        Swal.fire({
            icon: 'warning',
            title: 'تحذير',
            text: 'نسبة العمولة يجب أن تكون بين 0 و 1',
            confirmButtonColor: '#667eea'
        });
        return;
    }

    const resultConfirm = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: 'تغيير هذه الإعدادات سيؤثر على تسعير الطلبات الجديدة فوراً!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e74c3c',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'نعم، قم بالحفظ',
        cancelButtonText: 'إلغاء'
    });

    if (!resultConfirm.isConfirmed) return;

    try {
        const res = await fetch(`${API_URL}/api/admin/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!res.ok) {
            throw new Error('Failed to save settings');
        }

        const result = await res.json();

        Swal.fire({
            icon: 'success',
            title: 'تم الحفظ!',
            text: 'تم تحديث إعدادات الأسعار بنجاح',
            confirmButtonColor: '#667eea',
            timer: 2000
        });

        // Update last update info
        const lastUpdateDiv = document.getElementById('currentSettings');
        const lastUpdateText = document.getElementById('lastUpdate');
        lastUpdateText.textContent = new Date().toLocaleString('ar-EG');
        lastUpdateDiv.style.display = 'block';

    } catch (error) {
        console.error('Error saving settings:', error);
        Swal.fire({
            icon: 'error',
            title: 'خطأ',
            text: 'فشل حفظ الإعدادات. حاول مرة أخرى.',
            confirmButtonColor: '#e74c3c'
        });
    }
});

// Load settings on page load
loadSettings();

// Reload settings when city changes
if (document.getElementById('citySelector')) {
    document.getElementById('citySelector').addEventListener('change', loadSettings);
}

// ─── صيانة: ضغط الصور القديمة على السيرفر ───────────────────
const compressBtn = document.getElementById('compressImagesBtn');
if (compressBtn) {
    const compressStatusEl = document.getElementById('compressStatus');
    let compressPollTimer = null;

    // يعرض حالة العملية ويعيد true إذا انتهت (نجاحاً أو فشلاً)
    function renderCompressState(state) {
        if (state.running) {
            compressStatusEl.textContent = 'العملية جارية على السيرفر... تُحدَّث الحالة تلقائياً.';
            return false;
        }
        if (state.error) {
            compressStatusEl.textContent = 'فشلت العملية: ' + state.error;
            return true;
        }
        if (state.stats) {
            const mb = (state.stats.savedBytes / 1024 / 1024).toFixed(1);
            compressStatusEl.textContent =
                `اكتملت العملية: ضُغطت ${state.stats.processed} صورة، وتم تجاوز ${state.stats.skipped} (صغيرة أصلاً)، وفشلت ${state.stats.failed}. المساحة الموفرة: ${mb} ميجابايت.`;
            return true;
        }
        compressStatusEl.textContent = '';
        return true;
    }

    async function pollCompressStatus() {
        try {
            const res = await fetch(`${API_URL}/api/admin/compress-images/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return; // خطأ مؤقت — نحاول في الدورة القادمة
            const state = await res.json();
            if (renderCompressState(state)) {
                clearInterval(compressPollTimer);
                compressPollTimer = null;
                compressBtn.disabled = false;
            }
        } catch { /* خطأ شبكة مؤقت — الاستعلام التالي سيعوضه */ }
    }

    compressBtn.addEventListener('click', async () => {
        compressBtn.disabled = true;
        compressStatusEl.textContent = 'جاري بدء العملية...';
        try {
            const res = await fetch(`${API_URL}/api/admin/compress-images`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'فشل بدء العملية');
            renderCompressState(data.state || { running: true });
            compressPollTimer = setInterval(pollCompressStatus, 3000);
        } catch (err) {
            compressStatusEl.textContent = err.message || 'تعذر الاتصال بالسيرفر';
            compressBtn.disabled = false;
        }
    });
}
