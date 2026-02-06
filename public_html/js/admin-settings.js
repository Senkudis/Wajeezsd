// Admin Settings - Dynamic Pricing Configuration
const token = localStorage.getItem('adminToken');
if (!token) {
    window.location.href = 'admin-login.html';
}

// Load current settings on page load
async function loadSettings() {
    try {
        const res = await fetch(`${API_URL}/api/admin/settings`, {
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
        adminPhone: document.getElementById('adminPhone').value.trim()
    };

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

    try {
        const res = await fetch(`${API_URL}/api/admin/settings`, {
            method: 'POST',
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
