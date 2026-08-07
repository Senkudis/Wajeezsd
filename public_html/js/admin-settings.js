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
        if (document.getElementById('extraStopFee')) document.getElementById('extraStopFee').value = settings.extraStopFee || 0;
        if (document.getElementById('errandTripFee')) document.getElementById('errandTripFee').value = settings.errandTripFee || 0;
        document.getElementById('costPerMinute').value = settings.costPerMinute || 2;
        document.getElementById('commissionRate').value = settings.commissionRate || 0.15;
        document.getElementById('adminPhone').value = settings.adminPhone || '249112046348';
        
        // App Settings
        if (document.getElementById('appVersion')) {
            document.getElementById('appVersion').value = settings.appVersion || '1.0.6';
            document.getElementById('minVersion').value = settings.minVersion || settings.appVersion || '1.0.6';
            document.getElementById('playStoreLink').value = settings.playStoreLink || 'https://play.google.com/store/apps/details?id=com.wajeezsd.app';
            document.getElementById('forceUpdate').checked = settings.forceUpdate || false;
        }

        // ⏱️ عتبات التنبيهات الاستباقية.
        // الافتراضيات مكرّرة هنا لأن وثائق الإعدادات المنشأة قبل هذه الميزة
        // لا تحتوي حقل nudges، فتظهر الخانات فارغة بلا هذا السقوط الآمن.
        const NUDGE_DEFAULTS = {
            clientDelay1: 30, clientDelay2: 120,
            captainPickup1: 15, captainPickup2: 40,
            captainDeliver1: 30, captainDeliver2: 75,
            gpsStale: 12, chatUnread: 8,
            creditWarnPct: 80, creditResetPct: 60
        };
        const n = settings.nudges || {};
        for (const [key, fallback] of Object.entries(NUDGE_DEFAULTS)) {
            const el = document.getElementById(key);
            if (el) el.value = Number.isFinite(n[key]) ? n[key] : fallback;
        }
        const enabledEl = document.getElementById('nudgesEnabled');
        if (enabledEl) enabledEl.checked = n.enabled !== false;

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
        extraStopFee: parseFloat(document.getElementById('extraStopFee')?.value) || 0,
        errandTripFee: parseFloat(document.getElementById('errandTripFee')?.value) || 0,
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

    // ⏱️ عتبات التنبيهات — تُرسل ككائن متداخل يتحقّق منه الخادم
    const NUDGE_KEYS = [
        'clientDelay1', 'clientDelay2',
        'captainPickup1', 'captainPickup2',
        'captainDeliver1', 'captainDeliver2',
        'gpsStale', 'chatUnread',
        'creditWarnPct', 'creditResetPct'
    ];
    if (document.getElementById('clientDelay1')) {
        data.nudges = { enabled: document.getElementById('nudgesEnabled').checked };
        for (const key of NUDGE_KEYS) {
            const raw = document.getElementById(key).value;
            const val = parseFloat(raw);
            if (!Number.isFinite(val)) {
                Swal.fire({
                    icon: 'warning', title: 'تحذير',
                    text: 'كل عتبات التنبيهات يجب أن تحتوي رقماً صالحاً',
                    confirmButtonColor: '#667eea'
                });
                return;
            }
            data.nudges[key] = val;
        }

        // فحص محلي للترتيب قبل الإرسال — الخادم يفحصه أيضاً، لكن الرد
        // الفوري أوضح للأدمن من رحلة ذهاب وإياب
        const ORDERED = [
            ['clientDelay1', 'clientDelay2', 'تنبيه العميل'],
            ['captainPickup1', 'captainPickup2', 'تنبيه الاستلام'],
            ['captainDeliver1', 'captainDeliver2', 'تنبيه التسليم']
        ];
        for (const [first, second, label] of ORDERED) {
            if (data.nudges[second] <= data.nudges[first]) {
                Swal.fire({
                    icon: 'warning', title: 'ترتيب العتبات',
                    text: `${label} الثاني يجب أن يكون أكبر من الأول`,
                    confirmButtonColor: '#667eea'
                });
                return;
            }
        }
        if (data.nudges.creditResetPct >= data.nudges.creditWarnPct) {
            Swal.fire({
                icon: 'warning', title: 'ترتيب النسب',
                text: 'نسبة تصفير التحذير يجب أن تكون أقل من نسبة التحذير',
                confirmButtonColor: '#667eea'
            });
            return;
        }
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

// ============================================================
// 📊 تكلفة بحث "اشترِ لي"
//
// لماذا: بنينا كاشاً دائماً وقاعدة أماكن تتعلّم من الطلبات لخفض فاتورة جوجل، بلا
// وسيلة للتأكد أنها تعمل. بدون هذه اللوحة يبقى الدليل الوحيد فاتورةَ جوجل آخر
// الشهر — أي أن أي خلل يُكتشف بعد الدفع لا قبله.
// ============================================================
(function initSearchStats() {
    const body = document.getElementById('searchStatsBody');
    if (!body) return;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const fmtDate = (iso) => {
        if (!iso) return '';
        try { return new Date(iso).toLocaleDateString('ar-SD', { day: '2-digit', month: '2-digit' }); }
        catch { return ''; }
    };

    const tile = (label, value, hint, color) => `
        <div class="col-6 col-md-3 mb-2">
            <div class="p-2 rounded bg-light h-100">
                <div class="text-muted" style="font-size:11px;">${esc(label)}</div>
                <div class="fw-bold" style="font-size:19px;color:${color || '#0d6efd'};">${esc(value)}</div>
                ${hint ? `<div class="text-muted" style="font-size:10.5px;">${esc(hint)}</div>` : ''}
            </div>
        </div>`;

    const queryTable = (title, rows, countKey, countLabel, emptyMsg) => {
        if (!rows || !rows.length) return `<div class="text-muted mb-3" style="font-size:12px;">${esc(title)}: ${esc(emptyMsg)}</div>`;
        return `
        <div class="mb-3">
            <div class="fw-bold mb-1" style="font-size:12.5px;">${esc(title)}</div>
            <div class="table-responsive">
                <table class="table table-sm mb-0" style="font-size:12px;">
                    <thead><tr>
                        <th>الكلمة</th><th>${esc(countLabel)}</th><th>آخر مرة</th>
                    </tr></thead>
                    <tbody>${rows.map(r => `<tr>
                        <td>${esc(r.query)}</td>
                        <td>${esc(r[countKey])}</td>
                        <td class="text-muted">${esc(fmtDate(r.lastAt))}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </div>`;
    };

    function render(d) {
        const t = d.totals || {};
        // البحث الفاشل: أثمن رقم هنا — محلات يطلبها العملاء ولا نجدها
        const failed = d.failedQueries || [];

        body.innerHTML = `
            <div class="row g-2 mb-3">
                ${tile('عمليات البحث', t.searches || 0, `آخر ${d.days} يوماً`)}
                ${tile('نداءات جوجل (مدفوعة)', t.googleCalls || 0, 'ما كلّفنا مالاً', '#dc3545')}
                ${tile('النسبة الموفَّرة', (t.savedPercent || 0) + '%', 'كاش + قاعدتنا', '#198754')}
                ${tile('أماكن تعلّمناها', d.learnedCount || 0, 'تُخدم مجاناً', '#6f42c1')}
            </div>
            <div class="row g-2 mb-3">
                ${tile('من الكاش', t.cacheHits || 0, '')}
                ${tile('من قاعدتنا وحدها', t.localOnly || 0, 'بلا نداء لجوجل')}
                ${tile('بحث بلا نتائج', t.emptyResults || 0, '', '#fd7e14')}
                ${tile('أخطاء', t.errorCount || 0, '', (t.errorCount ? '#dc3545' : '#6c757d'))}
            </div>

            ${failed.length ? `<div class="alert alert-warning py-2 px-3 small mb-3">
                <i class="bi bi-lightbulb-fill"></i>
                <b>فرصة:</b> الكلمات أدناه بحث عنها عملاء ولم يجدوا شيئاً — هذه قائمة متاجر جاهزة لفريق التسجيل،
                أو دليل على أن منطقة التوصيل أضيق من الطلب الحقيقي.
            </div>` : ''}

            ${queryTable('بحث لم يجد شيئاً', failed, 'emptyCount', 'مرات الفشل', 'لا يوجد — كل عمليات البحث وجدت نتائج')}
            ${queryTable('الأكثر بحثاً', d.topQueries, 'searches', 'مرات البحث', 'لا توجد بيانات بعد')}

            ${(d.topPlaces && d.topPlaces.length) ? `
            <div>
                <div class="fw-bold mb-1" style="font-size:12.5px;">الأكثر طلباً من الأماكن المتعلَّمة</div>
                <div class="table-responsive">
                    <table class="table table-sm mb-0" style="font-size:12px;">
                        <thead><tr><th>المحل</th><th>عدد الطلبات</th></tr></thead>
                        <tbody>${d.topPlaces.map(p => `<tr>
                            <td>${esc(p.name)}<div class="text-muted" style="font-size:10.5px;">${esc(p.address || '')}</div></td>
                            <td>${esc(p.usageCount)}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>` : ''}`;
    }

    async function load() {
        body.innerHTML = 'جاري التحميل…';
        try {
            const city = document.getElementById('citySelector')?.value || 'Khartoum';
            const res = await fetch(`${API_URL}/api/places/errand-stats?city=${encodeURIComponent(city)}&days=30`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('تعذّر تحميل الإحصاءات');
            render(await res.json());
        } catch (err) {
            body.innerHTML = `<span class="text-danger">${err.message || 'تعذّر الاتصال بالسيرفر'}</span>`;
        }
    }

    document.getElementById('reloadSearchStatsBtn')?.addEventListener('click', load);
    // الإحصاءات تخصّ المدينة المختارة — تتبع نفس المُبدّل كبقية الصفحة
    document.getElementById('citySelector')?.addEventListener('change', load);
    load();
})();

// ============================================================
// 🐞 أخطاء الإنتاج
//
// لماذا: errorTracker كان يسجّل الأخطاء ويعرضها على /api/admin/errors، لكن بلا أي
// شاشة تقرؤها — فلم يكن أحد يراها إلا بـ curl يدوي. أخطاء تُسجَّل ولا تُقرأ كأنها
// غير مسجَّلة.
// ============================================================
(function initErrorLog() {
    const body = document.getElementById('errorsBody');
    if (!body) return;

    const esc = (s) => String(s == null ? '' : s)
        .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const ago = (iso) => {
        if (!iso) return '';
        const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (mins < 1) return 'الآن';
        if (mins < 60) return `قبل ${mins} د`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `قبل ${hrs} س`;
        return `قبل ${Math.floor(hrs / 24)} يوم`;
    };

    const statusColor = (c) => c >= 500 ? '#dc3545' : (c >= 400 ? '#fd7e14' : '#6c757d');

    function render(d) {
        const errors = d.errors || [];
        if (!errors.length) {
            body.innerHTML = `<div class="alert alert-success py-2 px-3 mb-0 small">
                <i class="bi bi-check-circle-fill"></i> لا توجد أخطاء مسجّلة.</div>`;
            return;
        }

        // التخزين الدائم يعني أن أخطاء ما قبل إعادة التشغيل باقية — نوضّح المصدر
        const note = d.source === 'memory'
            ? `<div class="alert alert-warning py-2 px-3 small mb-2">
                 <i class="bi bi-exclamation-triangle"></i> تعذّرت قراءة السجلّ الدائم — المعروض من ذاكرة العملية فقط.</div>`
            : '';

        body.innerHTML = note + `
            <div class="table-responsive">
                <table class="table table-sm align-middle mb-0" style="font-size:12px;">
                    <thead><tr>
                        <th style="width:52px;">الحالة</th><th>الخطأ</th>
                        <th style="width:58px;">التكرار</th><th style="width:78px;">آخر مرة</th>
                    </tr></thead>
                    <tbody>${errors.map((e, i) => `
                        <tr>
                            <td><span class="badge" style="background:${statusColor(e.statusCode)};">${esc(e.statusCode)}</span></td>
                            <td>
                                <div class="fw-bold" style="word-break:break-word;">${esc(e.message)}</div>
                                <div class="text-muted" style="font-size:10.5px;">
                                    ${esc(e.method || '')} ${esc(e.path || '')}
                                </div>
                                ${e.stack ? `<a href="#" class="text-decoration-none" style="font-size:10.5px;"
                                    onclick="event.preventDefault();document.getElementById('errStack${i}').classList.toggle('d-none');">عرض الأثر</a>
                                    <pre id="errStack${i}" class="d-none bg-light p-2 mt-1 mb-0 rounded"
                                         style="font-size:10px;white-space:pre-wrap;max-height:180px;overflow:auto;">${esc(e.stack)}</pre>` : ''}
                            </td>
                            <td>${esc(e.count || 1)}</td>
                            <td class="text-muted">${esc(ago(e.at))}</td>
                        </tr>`).join('')}</tbody>
                </table>
            </div>`;
    }

    async function load() {
        body.innerHTML = 'جاري التحميل…';
        try {
            const res = await fetch(`${API_URL}/api/admin/errors?limit=30`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.status === 403) {
                body.innerHTML = `<span class="text-muted">متاح للمسؤول الرئيسي فقط.</span>`;
                return;
            }
            if (!res.ok) throw new Error('تعذّر تحميل الأخطاء');
            render(await res.json());
        } catch (err) {
            body.innerHTML = `<span class="text-danger">${err.message || 'تعذّر الاتصال بالسيرفر'}</span>`;
        }
    }

    document.getElementById('reloadErrorsBtn')?.addEventListener('click', load);
    load();
})();
