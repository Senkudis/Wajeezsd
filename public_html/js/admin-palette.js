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
        { title: 'منسق مناطق التوصيل (Geofence)', icon: 'fas fa-draw-polygon', url: 'admin-zone-builder.html', tags: 'zone builder مناطق ترسيم حدود' },
        { title: 'سجل المديونيات والتحصيل', icon: 'fas fa-file-invoice-dollar', url: 'admin-debt-history.html', tags: 'debt history ديون سداد' },
        { title: 'الدعم الفني والشكاوى', icon: 'fas fa-headset', url: 'admin-complaints.html', tags: 'complaints support تذاكر بلاغات' },
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

    function createPaletteModal() {
        if (modalEl) return modalEl;

        const overlay = document.createElement('div');
        overlay.id = 'adminPaletteOverlay';
        overlay.className = 'admin-palette-overlay';
        overlay.style.display = 'none';

        overlay.innerHTML = `
            <div class="admin-palette-box">
                <div class="admin-palette-header">
                    <i class="fas fa-search admin-palette-search-icon"></i>
                    <input type="text" id="adminPaletteInput" placeholder="ابحث عن شاشة، أمر، أو قسم إداري... (Ctrl + K)" autocomplete="off">
                    <kbd class="admin-palette-kbd">Esc</kbd>
                </div>
                <div class="admin-palette-list" id="adminPaletteList"></div>
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
        const q = query.toLowerCase();

        currentResults = ADMIN_SCREENS.filter(item => {
            if (!q) return true;
            return item.title.toLowerCase().includes(q) || item.tags.toLowerCase().includes(q) || item.url.toLowerCase().includes(q);
        });

        selectedIdx = 0;

        if (currentResults.length === 0) {
            list.innerHTML = `
                <div class="admin-palette-empty">
                    <i class="fas fa-search" style="font-size: 24px; opacity: 0.4; margin-bottom: 8px;"></i>
                    <p>لم يتم العثور على نتائج تطابق "${query}"</p>
                </div>
            `;
            return;
        }

        list.innerHTML = currentResults.map((item, idx) => `
            <a href="${item.url}" class="admin-palette-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}">
                <div class="admin-palette-item-icon"><i class="${item.icon}"></i></div>
                <div class="admin-palette-item-content">
                    <div class="admin-palette-item-title">${item.title}</div>
                    <div class="admin-palette-item-url">${item.url}</div>
                </div>
                <i class="fas fa-arrow-left admin-palette-item-arrow"></i>
            </a>
        `).join('');

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
            if (idx === selectedIdx) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }

    function openPalette() {
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
