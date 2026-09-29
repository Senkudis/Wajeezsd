/**
 * 🔍 لوحة الأوامر والتنقل السريع لإدارة وجيز (Wajeez Admin Command Palette - Ctrl + K)
 */

(function () {
    'use strict';

    const ADMIN_SCREENS = [
        { title: 'لوحة التحكم الرئيسية', icon: 'fas fa-chart-pie', url: 'admin.html', tags: 'dashboard home رئيسية إحصائيات' },
        { title: 'الإدارة المالية والمحافظ', icon: 'fas fa-wallet', url: 'admin-finance.html', tags: 'finance money رصيد شحن محفظة' },
        { title: 'طلبات المتاجر (Shopping)', icon: 'fas fa-shopping-basket', url: 'admin-shop-orders.html', tags: 'orders shop طلبات تسوق' },
        { title: 'تسويات مستحقات التجار', icon: 'fas fa-hand-holding-usd', url: 'admin-settlements.html', tags: 'settlement سحب أرباح تحويل' },
        { title: 'طلبات انضمام المتاجر', icon: 'fas fa-store', url: 'admin-merchant-requests.html', tags: 'merchant join تسجيل متجر' },
        { title: 'لائحة المتاجر والشركاء', icon: 'fas fa-shop', url: 'admin-merchants-list.html', tags: 'merchants list محلات شركاء' },
        { title: 'المحلات والأماكن والتصنيفات', icon: 'fas fa-map-marked-alt', url: 'admin-places.html', tags: 'places categories تصنيفات أقسام' },
        { title: 'الخريطة المباشرة للكباتن', icon: 'fas fa-satellite-dish', url: 'admin-live-map.html', tags: 'live map خريطة مباشر كباتن تتبع' },
        { title: 'لوحة التتبّع — الرحلات الجارية', icon: 'fas fa-route', url: 'admin-tracking.html', tags: 'tracking trips تتبع رحلات تأخير متأخر تنبيه كابتن استلم' },
        { title: 'تعثّر العملاء في النماذج', icon: 'fas fa-triangle-exclamation', url: 'admin-client-errors.html', tags: 'errors client أخطاء تعثر خانة هاتف طلب فشل' },
        { title: 'منسق مناطق التوصيل (Geofence)', icon: 'fas fa-draw-polygon', url: 'admin-zone-builder.html', tags: 'zone builder مناطق ترسيم حدود' },
        { title: 'سجل المديونيات والتحصيل', icon: 'fas fa-file-invoice-dollar', url: 'admin-debt-history.html', tags: 'debt history ديون سداد' },
        { title: 'الدعم الفني والشكاوى', icon: 'fas fa-headset', url: 'admin-complaints.html', tags: 'complaints support تذاكر بلاغات' },
        { title: 'بلاغات المحتوى المسيء', icon: 'fas fa-flag', url: 'admin-reports.html', tags: 'reports abuse بلاغ إساءة تقييم حظر' },
        { title: 'المحادثات المباشرة', icon: 'fas fa-comments', url: 'admin-chats.html', tags: 'chats messages شات دردشة' },
        { title: 'صوت العميل والملاحظات', icon: 'fas fa-comment-dots', url: 'admin-feedback.html', tags: 'feedback review تقييمات ملاحظات' },
        { title: 'البانرات الإعلانية', icon: 'fas fa-images', url: 'admin-banners.html', tags: 'banners ads إعلانات صور' },
        { title: 'كوبونات وعروض الخصم', icon: 'fas fa-ticket-alt', url: 'admin-promo-codes.html', tags: 'promo coupon أكواد خصم' },
        { title: 'إعدادات الأسعار والتسعيرة', icon: 'fas fa-cog', url: 'admin-settings.html', tags: 'settings pricing تسعير كيلومتر رحلات' },
        { title: 'سجل النشاط والعمليات', icon: 'fas fa-history', url: 'admin-activity.html', tags: 'activity audit log سجل عمليات أحداث' },
        { title: 'الأدمن المساعد والمشرفين', icon: 'fas fa-users-cog', url: 'admin-sub-admins.html', tags: 'sub admins permissions صلاحيات مشرفين' }
    ];

    let modalEl = null;
    let selectedIdx = 0;
    let currentResults = [];
    // ↩️ العنصر الذي كان مركَّزاً قبل الفتح: بلا حفظه يعود التركيز إلى
    //    أول الصفحة عند الإغلاق، فيضيع مكان المستخدم في اللوحة.
    let lastFocused = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function createPaletteModal() {
        if (modalEl) return modalEl;

        const overlay = document.createElement('div');
        overlay.id = 'adminPaletteOverlay';
        overlay.className = 'admin-palette-overlay';
        overlay.style.display = 'none';

        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'لوحة الأوامر والتنقّل السريع');

        overlay.innerHTML = `
            <div class="admin-palette-box">
                <div class="admin-palette-header">
                    <i class="fas fa-search admin-palette-search-icon" aria-hidden="true"></i>
                    <input type="text" id="adminPaletteInput" role="combobox"
                        aria-label="ابحث عن شاشة أو قسم إداري"
                        aria-expanded="true" aria-controls="adminPaletteList"
                        aria-autocomplete="list"
                        placeholder="ابحث عن شاشة، أمر، أو قسم إداري... (Ctrl + K)" autocomplete="off">
                    <kbd class="admin-palette-kbd" aria-hidden="true">Esc</kbd>
                </div>
                <div class="admin-palette-list" id="adminPaletteList"
                    role="listbox" aria-label="الشاشات الإدارية"></div>
                <div class="admin-palette-footer">
                    <span><kbd>↑</kbd> <kbd>↓</kbd> للتنقل</span>
                    <span><kbd>Enter</kbd> للفتح</span>
                    <span><kbd>Esc</kbd> للإغلاق</span>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // إغلاق عند النقر على الخلفية
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePalette();
        });

        // الاستماع لحقل البحث
        const input = overlay.querySelector('#adminPaletteInput');
        input.addEventListener('input', (e) => {
            renderResults(e.target.value.trim());
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentResults.length > 0) {
                    selectedIdx = (selectedIdx + 1) % currentResults.length;
                    highlightItem();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentResults.length > 0) {
                    selectedIdx = (selectedIdx - 1 + currentResults.length) % currentResults.length;
                    highlightItem();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentResults[selectedIdx]) {
                    window.location.href = currentResults[selectedIdx].url;
                }
            } else if (e.key === 'Escape') {
                closePalette();
            }
        });

        modalEl = overlay;
        return overlay;
    }

    function renderResults(query = '') {
        const list = modalEl.querySelector('#adminPaletteList');
        const input = modalEl.querySelector('#adminPaletteInput');
        const q = query.toLowerCase();

        currentResults = ADMIN_SCREENS.filter(item => {
            if (!q) return true;
            return item.title.toLowerCase().includes(q) || item.tags.toLowerCase().includes(q) || item.url.toLowerCase().includes(q);
        });

        selectedIdx = 0;

        if (currentResults.length === 0) {
            // كان ${query} يُحقن خاماً في innerHTML — تهريبه إلزاميّ
            // حتى لو كان المُدخِل هو الأدمن نفسه.
            list.innerHTML = `
                <div class="admin-palette-empty" role="status">
                    <i class="fas fa-search" aria-hidden="true" style="font-size: 24px; opacity: 0.4; margin-bottom: 8px;"></i>
                    <p>لم يتم العثور على نتائج تطابق "${esc(query)}"</p>
                </div>
            `;
            input.removeAttribute('aria-activedescendant');
            return;
        }

        list.innerHTML = currentResults.map((item, idx) => `
            <a href="${item.url}" id="adminPaletteOpt-${idx}" role="option"
                aria-selected="${idx === 0 ? 'true' : 'false'}"
                class="admin-palette-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
                <div class="admin-palette-item-icon" aria-hidden="true"><i class="${item.icon}"></i></div>
                <div class="admin-palette-item-content">
                    <div class="admin-palette-item-title">${item.title}</div>
                    <div class="admin-palette-item-url">${item.url}</div>
                </div>
                <i class="fas fa-arrow-left admin-palette-item-arrow" aria-hidden="true"></i>
            </a>
        `).join('');
        // الحقل يُبقي التركيز عنده بينما تتنقّل الأسهم بين الخيارات،
        // فاسم الخيار الحالي يُبلَّغ عبر aria-activedescendant لا بالتركيز.
        input.setAttribute('aria-activedescendant', 'adminPaletteOpt-0');

        // دعم النقر بالماوس
        list.querySelectorAll('.admin-palette-item').forEach(el => {
            el.addEventListener('mouseenter', () => {
                selectedIdx = parseInt(el.getAttribute('data-idx'), 10);
                highlightItem();
            });
        });
    }

    function highlightItem() {
        const items = modalEl.querySelectorAll('.admin-palette-item');
        items.forEach((item, idx) => {
            const on = idx === selectedIdx;
            item.classList.toggle('active', on);
            item.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) item.scrollIntoView({ block: 'nearest' });
        });
        const input = modalEl.querySelector('#adminPaletteInput');
        const cur = items[selectedIdx];
        if (input && cur) input.setAttribute('aria-activedescendant', cur.id);
    }

    function openPalette() {
        lastFocused = document.activeElement;
        const modal = createPaletteModal();
        modal.style.display = 'flex';
        const input = modal.querySelector('#adminPaletteInput');
        input.value = '';
        renderResults('');
        setTimeout(() => input.focus(), 50);
    }

    function closePalette() {
        if (modalEl) {
            modalEl.style.display = 'none';
        }
        // إعادة التركيز إلى ما كان قبل الفتح — وإلا عاد إلى أول الصفحة
        if (lastFocused && typeof lastFocused.focus === 'function') {
            lastFocused.focus();
        }
        lastFocused = null;
    }

    // الاستماع لاختصار لوحة المفاتيح Ctrl + K / Cmd + K
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (modalEl && modalEl.style.display === 'flex') {
                closePalette();
            } else {
                openPalette();
            }
        }
    });

    // ربط أي زر يحمل [data-admin-search]
    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-admin-search], .admin-search-btn')) {
            openPalette();
        }
    });

    window.AdminPalette = {
        open: openPalette,
        close: closePalette
    };
})();
