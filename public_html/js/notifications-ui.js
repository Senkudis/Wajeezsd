/*
 * ════════════════════════════════════════════════════════════════
 *  notifications-ui.js — منطق شاشة الإشعارات الموحّدة
 * ════════════════════════════════════════════════════════════════
 *  يخدم العميل والكابتن والتاجر. الاختلاف بين الأدوار في الترويسة
 *  والتنقّل السفلي فقط — أما القائمة والفرز والتوجيه فواحدة.
 *
 *  الاستعمال:
 *      WajeezNotifications.init({ loginUrl: 'captain-login.html' });
 *
 *  وجهة النقر تأتي من الخادم في n.url (utils/pushRouting.js) — المصدر
 *  نفسه الذي تستخدمه دفعات FCM. حسابها هنا يعني نسختين تتباعدان مع
 *  كل نوع إشعار جديد.
 * ════════════════════════════════════════════════════════════════
 */
window.WajeezNotifications = (function () {
    'use strict';

    // ── الهوية البصرية لكل نوع ─────────────────────────────────
    // العائلة تحمل المعنى: أخضر أُنجز، أحمر تعطّل، كهرماني ينتظرك.
    // بلا هذا التصنيف يصبح كل إشعار جرساً رمادياً واحداً — إشعار
    // إلغاء وإشعار ترحيب بالمظهر نفسه.
    const FAMILY = {
        success: { fg: '#0a8754', bg: '#e7f5ef' },
        active:  { fg: '#2563eb', bg: '#dbeafe' },
        warn:    { fg: '#b45309', bg: '#fef3c7' },
        danger:  { fg: '#dc2626', bg: '#fee2e2' },
        chat:    { fg: '#7c3aed', bg: '#ede9fe' },
        money:   { fg: '#0f766e', bg: '#ccfbf1' },
        voice:   { fg: '#be185d', bg: '#fce7f3' },
        shop:    { fg: '#4338ca', bg: '#e0e7ff' },
        system:  { fg: '#475569', bg: '#e8ebef' }
    };

    const TYPES = {
        order_completed:       ['success', 'bi-check-circle-fill'],
        order_delivered:       ['success', 'bi-check-circle-fill'],
        payment_confirmed:     ['success', 'bi-patch-check-fill'],
        payment_approved:      ['success', 'bi-patch-check-fill'],
        settlement_approved:   ['success', 'bi-patch-check-fill'],
        negotiation_accepted:  ['success', 'bi-hand-thumbs-up-fill'],

        order_accepted:        ['active', 'bi-bicycle'],
        order_assigned:        ['active', 'bi-person-check-fill'],
        order_update:          ['active', 'bi-arrow-repeat'],
        order_searching:       ['active', 'bi-broadcast'],
        new_order:             ['active', 'bi-box-seam'],

        order_delayed:         ['warn', 'bi-hourglass-split'],
        payment_reminder:      ['warn', 'bi-alarm-fill'],
        offer_expiry_reminder: ['warn', 'bi-alarm-fill'],
        low_stock:             ['warn', 'bi-box-seam'],

        order_cancelled:       ['danger', 'bi-x-circle-fill'],
        order_expired:         ['danger', 'bi-clock-history'],
        offer_expired:         ['danger', 'bi-clock-history'],
        payment_rejected:      ['danger', 'bi-shield-exclamation'],
        settlement_rejected:   ['danger', 'bi-shield-exclamation'],
        emergency:             ['danger', 'bi-exclamation-triangle-fill'],

        chat:                  ['chat', 'bi-chat-dots-fill'],
        chat_message:          ['chat', 'bi-chat-dots-fill'],

        wallet_update:         ['money', 'bi-wallet2'],
        payment_request:       ['money', 'bi-cash-coin'],
        payment_receipt:       ['money', 'bi-receipt'],
        shop_ledger:           ['money', 'bi-journal-text'],

        feedback_request:      ['voice', 'bi-chat-heart-fill'],

        new_shop_order:        ['shop', 'bi-bag-plus-fill'],
        shop_order:            ['shop', 'bi-bag-fill'],
        shop_order_update:     ['shop', 'bi-bag-check-fill'],
        errand_quote:          ['shop', 'bi-tag-fill'],
        tier_change:           ['shop', 'bi-award-fill'],

        system:                ['system', 'bi-bell-fill']
    };

    function visualFor(type) {
        const pair = TYPES[type] || TYPES.system;
        return Object.assign({}, FAMILY[pair[0]], { icon: pair[1] });
    }

    // العنوان والرسالة قد يحملان محتوى كتبه طرف آخر (سبب إلغاء مثلاً).
    // الحقن الخام في innerHTML كان يفتح ثغرة XSS.
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    const DAY = 86400000;

    function startOfDay(d) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x.getTime();
    }

    /** المجموعة الزمنية — الترتيب مقصود، أول تطابق يفوز */
    function groupOf(date) {
        const today = startOfDay(new Date());
        const day = startOfDay(date);
        if (day === today) return 'اليوم';
        if (day === today - DAY) return 'أمس';
        if (day > today - 7 * DAY) return 'هذا الأسبوع';
        return 'أقدم';
    }

    /**
     * الوقت المعروض. عرض الساعة وحدها لكل إشعار كان يُظهر إشعار
     * الشهر الماضي كـ"10:30" بلا تاريخ — لا يميّزه القارئ عن إشعار اليوم.
     */
    function timeLabel(date) {
        const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
        if (diffMin < 1) return 'الآن';
        if (diffMin < 60) return 'قبل ' + diffMin + ' د';

        const today = startOfDay(new Date());
        const day = startOfDay(date);
        if (day === today) {
            return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        }
        if (day > today - 7 * DAY) {
            return date.toLocaleDateString('ar-EG', { weekday: 'long' });
        }
        return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
    }

    function init(options) {
        const opts = Object.assign({
            mount: '#notificationsList',
            toolbar: '#wnToolbar',
            subtitle: '#headerSubtitle',
            toast: '#wnToast',
            loginUrl: 'client-login.html',
            registerUrl: '',
            guestTitle: 'سجّل الدخول لعرض إشعاراتك',
            guestText: 'ستصلك هنا كل التحديثات المتعلقة بحسابك.',
            emptyTitle: 'لا توجد إشعارات بعد',
            emptyText: 'سنخبرك هنا فور وصول أي جديد.',
            // نص العنوان الفرعي حين لا يوجد غير مقروء — يختلف بين الأدوار
            subtitleIdle: 'كل جديدك هنا'
        }, options || {});

        const list = document.querySelector(opts.mount);
        if (!list) return;
        const toolbar = document.querySelector(opts.toolbar);
        const toastEl = document.querySelector(opts.toast);
        const subtitleEl = opts.subtitle ? document.querySelector(opts.subtitle) : null;

        let allItems = [];
        let currentPage = 1;
        let totalPages = 1;
        let filter = 'all';
        let toastTimer = null;

        const authHeader = () =>
            (window.Auth && window.Auth.getAuthHeader)
                ? window.Auth.getAuthHeader()
                : { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') };

        const httpGet = (url, init) =>
            (window.fetchWithRetry || window.fetch)(url, init);

        function toast(msg) {
            if (!toastEl) return;
            toastEl.textContent = msg;
            toastEl.classList.add('show');
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
        }

        function skeleton(n) {
            let h = '';
            for (let i = 0; i < n; i++) {
                h += '<div class="wn-skel">' +
                    '<span style="width:42px;height:42px;border-radius:13px;flex-shrink:0"></span>' +
                    '<div style="flex:1">' +
                    '<span style="width:55%;height:13px;margin-bottom:9px"></span>' +
                    '<span style="width:88%;height:11px;margin-bottom:6px"></span>' +
                    '<span style="width:64%;height:11px"></span>' +
                    '</div></div>';
            }
            return h;
        }

        function emptyState(icon, title, text, actions) {
            return '<div class="wn-empty">' +
                '<div class="wn-empty-icon"><i class="bi ' + icon + '"></i></div>' +
                '<h5>' + esc(title) + '</h5>' +
                '<p>' + esc(text) + '</p>' +
                (actions || '') + '</div>';
        }

        function itemHtml(n) {
            const v = visualFor(n.type || 'system');
            const date = new Date(n.createdAt);
            // وجهة تشير لهذه الصفحة نفسها ليست وجهة — لا نوهم بالنقر.
            // المقارنة على اسم الملف كاملاً لا بـ indexOf: اسم صفحة العميل
            // 'notifications.html' سلسلة فرعية من 'captain-notifications.html'،
            // فالمطابقة الجزئية كانت تُلغي رابطاً صحيحاً.
            const here = location.pathname.split('/').pop();
            const target = n.url ? n.url.split('?')[0].split('/').pop() : '';
            const url = (n.url && target !== here) ? n.url : '';

            return '<button type="button" class="wn-item ' +
                (n.isRead ? '' : 'is-unread ') + (url ? 'is-tappable' : '') + '"' +
                ' data-id="' + esc(n._id) + '" data-url="' + esc(url) + '">' +
                '<span class="wn-icon" style="background:' + v.bg + ';color:' + v.fg + '">' +
                '<i class="bi ' + v.icon + '"></i></span>' +
                '<span class="wn-body">' +
                '<span class="wn-head">' +
                '<span class="wn-title">' + esc(n.title) + '</span>' +
                '<span class="wn-time">' + esc(timeLabel(date)) + '</span>' +
                '</span>' +
                '<span class="wn-msg">' + esc(n.message) + '</span>' +
                '</span>' +
                (url ? '<i class="bi bi-chevron-left wn-go"></i>' : '') +
                '</button>';
        }

        function render() {
            const items = filter === 'unread' ? allItems.filter(n => !n.isRead) : allItems;

            if (!items.length) {
                list.innerHTML = filter === 'unread'
                    ? emptyState('bi-check2-circle', 'لا شيء غير مقروء', 'اطّلعت على كل إشعاراتك.')
                    : emptyState('bi-bell-slash', opts.emptyTitle, opts.emptyText);
                return;
            }

            let html = '';
            let lastGroup = null;
            for (const n of items) {
                const g = groupOf(new Date(n.createdAt));
                if (g !== lastGroup) {
                    html += '<div class="wn-group-title">' + g + '</div>';
                    lastGroup = g;
                }
                html += itemHtml(n);
            }
            if (currentPage < totalPages) {
                html += '<button type="button" class="wn-more" id="wnMore">عرض إشعارات أقدم</button>';
            }
            list.innerHTML = html;
        }

        function refreshCounts() {
            const unread = allItems.filter(n => !n.isRead).length;
            const countEl = document.getElementById('unreadCount');
            if (countEl) countEl.textContent = unread;
            const markBtn = document.getElementById('markAllReadBtn');
            if (markBtn) markBtn.disabled = unread === 0;
            if (subtitleEl) {
                subtitleEl.textContent = unread
                    ? 'لديك ' + unread + ' إشعار غير مقروء'
                    : opts.subtitleIdle;
            }
            if (window.renderUnreadBadge) window.renderUnreadBadge(unread);
        }

        async function load(page, append) {
            if (!append) list.innerHTML = skeleton(5);
            try {
                const base = window.API_URL || '';
                const res = await httpGet(base + '/api/notifications?page=' + page + '&limit=20',
                    { headers: authHeader() });
                const data = await res.json();
                const batch = Array.isArray(data) ? data : (data.notifications || []);

                currentPage = data.currentPage || page;
                totalPages = data.totalPages || 1;
                allItems = append ? allItems.concat(batch) : batch;

                if (toolbar) toolbar.hidden = false;
                render();
                refreshCounts();
            } catch (err) {
                console.error(err);
                if (!append) {
                    list.innerHTML = emptyState('bi-wifi-off', 'تعذّر تحميل الإشعارات',
                        'تحقّق من اتصالك ثم أعد المحاولة.',
                        '<button type="button" class="wn-more" id="wnRetry">إعادة المحاولة</button>');
                }
            }
        }

        function markRead(id) {
            const base = window.API_URL || '';
            return httpGet(base + '/api/notifications/' + id + '/read',
                { method: 'PUT', headers: authHeader() }).catch(() => {});
        }

        // تفويض واحد بدل onclick مضمّن في كل بطاقة
        list.addEventListener('click', async (e) => {
            const more = e.target.closest('#wnMore');
            if (more) {
                more.disabled = true;
                more.textContent = 'جارٍ التحميل…';
                await load(currentPage + 1, true);
                return;
            }
            if (e.target.closest('#wnRetry')) { load(1, false); return; }

            const el = e.target.closest('.wn-item');
            if (!el) return;

            const id = el.dataset.id;
            const url = el.dataset.url;
            const item = allItems.find(n => String(n._id) === id);

            if (item && !item.isRead) {
                item.isRead = true;
                el.classList.remove('is-unread');
                refreshCounts();
                markRead(id);
            }

            if (url) window.location.href = url;
            // بلا وجهة: نفتح النص كاملاً بدل نقرة لا تفعل شيئاً
            else el.classList.toggle('is-open');
        });

        const markBtn = document.getElementById('markAllReadBtn');
        if (markBtn) {
            markBtn.addEventListener('click', async () => {
                markBtn.disabled = true;
                const original = markBtn.innerHTML;
                markBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>جارٍ…';
                try {
                    const base = window.API_URL || '';
                    await httpGet(base + '/api/notifications/mark-all-read',
                        { method: 'PUT', headers: authHeader() });
                    allItems.forEach(n => { n.isRead = true; });
                    render();
                    refreshCounts();
                    toast('تم تحديد الكل كمقروء');
                } catch (err) {
                    console.error(err);
                    toast('تعذّر التحديث — حاول مجدداً');
                    markBtn.disabled = false;
                }
                markBtn.innerHTML = original;
            });
        }

        if (toolbar) {
            toolbar.addEventListener('click', (e) => {
                const chip = e.target.closest('.wn-chip');
                if (!chip) return;
                filter = chip.dataset.filter;
                toolbar.querySelectorAll('.wn-chip').forEach(c => {
                    c.setAttribute('aria-pressed', String(c === chip));
                });
                render();
            });
        }

        function start() {
            if (!localStorage.getItem('token')) {
                if (toolbar) toolbar.hidden = true;
                let actions = '<div class="d-flex gap-2 justify-content-center">' +
                    '<a href="' + opts.loginUrl + '" class="btn btn-success rounded-pill px-4">تسجيل الدخول</a>';
                if (opts.registerUrl) {
                    actions += '<a href="' + opts.registerUrl +
                        '" class="btn btn-outline-success rounded-pill px-4">إنشاء حساب</a>';
                }
                actions += '</div>';
                list.innerHTML = emptyState('bi-bell-slash', opts.guestTitle, opts.guestText, actions);
                return;
            }
            load(1, false);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start);
        } else {
            start();
        }

        // إشعار جديد وصل والصفحة مفتوحة — بلا هذا يرى المستخدم التوست
        // ثم قائمةً قديمة تحته حتى يعيد التحميل
        window.addEventListener('wajeez:new-notification', () => load(1, false));
    }

    return { init, visualFor, timeLabel, groupOf, esc };
})();
