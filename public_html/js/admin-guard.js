/**
 * حارس صفحات الإدارة — بوابة موحّدة قبل رسم أي محتوى.
 *
 * المشكلة التي يحلّها: 18 صفحة إدارة من 20 كانت بلا أي فحص صلاحية، وسبع منها
 * بلا فحص توكن أصلاً. الأدمن المساعد يفتح admin-finance.html بالرابط مباشرة،
 * فيُرسم هيكل الصفحة كاملاً، ثم ترجع نداءات البيانات 403، فتبقى جداول فارغة
 * ورسائل خطأ خام. ما بدا "عرضاً غير منسّق" كان عرَضاً لغياب البوابة لا خللاً
 * في التنسيق.
 *
 * الاستعمال — الصلاحية على وسم السكربت نفسه، فيستحيل وضعها في المكان الخطأ:
 *
 *     <script src="js/admin-guard.js" data-perm="view_finance"></script>
 *     <script src="js/admin-guard.js" data-perm="__super__"></script>
 *     <script src="js/admin-guard.js"></script>            <!-- توكن فقط -->
 *
 * يوضع في <head> قبل أي شيء آخر: يخفي الصفحة فوراً، ثم يُظهرها إن سُمح، أو
 * يستبدلها برسالة واضحة إن مُنع. بلا وميض محتوى ممنوع.
 *
 * ⚠️ هذا حارس واجهة لتجربة الاستخدام فقط. الحماية الحقيقية في الخادم
 *    (requirePermission / superAdminOnly)؛ من يعطّل هذا السكربت لا يكسب شيئاً
 *    سوى رؤية هيكل صفحة فارغ.
 */
(function () {
    'use strict';

    var LOGIN_PAGE = 'admin-login.html';
    var SUPER_ONLY = '__super__';

    // الصلاحية من وسم السكربت. document.currentScript متاح دائماً أثناء
    // التنفيذ المتزامن — وهذا السكربت متزامن عمداً.
    var self = document.currentScript;
    var required = self ? (self.getAttribute('data-perm') || '') : '';

    // إخفاء فوري: يمنع ظهور هيكل الصفحة للحظة قبل صدور الحكم.
    var hider = document.createElement('style');
    hider.id = 'admin-guard-hide';
    hider.textContent = 'body{visibility:hidden !important}';
    (document.head || document.documentElement).appendChild(hider);

    function reveal() {
        var el = document.getElementById('admin-guard-hide');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function onReady(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    function readStore(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    // ── 1. التوكن ────────────────────────────────────────────────────────
    var token = readStore('adminToken');
    if (!token) {
        // replace لا href: لا نترك الصفحة الممنوعة في سجلّ الرجوع.
        location.replace(LOGIN_PAGE);
        return;
    }

    // ── 2. المستخدم ──────────────────────────────────────────────────────
    var user = null;
    try { user = JSON.parse(readStore('user') || 'null'); } catch (e) { user = null; }

    // adminRole غائب أو null يعني أدمن قديم من قبل نظام الأدوار — يُعامَل
    // كمسؤول رئيسي، تماماً كما يفعل الخادم في superAdminOnly.
    var isSuper = !user || !user.adminRole || user.adminRole === 'super_admin';
    var perms = (user && Array.isArray(user.permissions)) ? user.permissions : [];

    var allowed = !required ||
                  isSuper ||
                  (required !== SUPER_ONLY && perms.indexOf(required) !== -1);

    if (allowed) {
        onReady(reveal);
        return;
    }

    // ── 3. المنع: رسالة واضحة بدل هيكل مكسور ─────────────────────────────
    var reason = required === SUPER_ONLY
        ? 'هذه الصفحة مخصّصة للمسؤول الرئيسي وحده.'
        : 'لا تملك الصلاحية المطلوبة لفتح هذه الصفحة.';

    onReady(function () {
        document.body.innerHTML =
            '<div id="admin-guard-denied" role="alert" aria-live="assertive">' +
              '<div class="ag-card">' +
                '<div class="ag-icon" aria-hidden="true">&#9888;</div>' +
                '<h1>الوصول غير مسموح</h1>' +
                '<p>' + reason + '</p>' +
                '<p class="ag-hint">إن كنت تحتاجها لعملك، اطلب من المسؤول الرئيسي منحك إيّاها.</p>' +
                '<div class="ag-actions">' +
                  '<a class="ag-btn ag-btn-primary" href="admin.html">العودة للوحة التحكم</a>' +
                  '<a class="ag-btn" href="' + LOGIN_PAGE + '">تسجيل الدخول بحساب آخر</a>' +
                '</div>' +
              '</div>' +
            '</div>';

        var css = document.createElement('style');
        css.textContent = [
            '#admin-guard-denied{position:fixed;inset:0;display:flex;align-items:center;',
            'justify-content:center;padding:24px;background:#f1f5f9;',
            "font-family:'Cairo',system-ui,-apple-system,'Segoe UI',sans-serif;direction:rtl;z-index:99999}",
            '.ag-card{background:#fff;border-radius:16px;padding:40px 32px;max-width:440px;width:100%;',
            'text-align:center;box-shadow:0 10px 40px rgba(15,23,42,.12)}',
            '.ag-icon{font-size:44px;line-height:1;color:#dc2626;margin-bottom:16px}',
            '.ag-card h1{margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a}',
            '.ag-card p{margin:0 0 8px;font-size:15px;line-height:1.7;color:#475569}',
            '.ag-hint{font-size:13.5px;color:#94a3b8}',
            '.ag-actions{display:flex;flex-direction:column;gap:10px;margin-top:24px}',
            '.ag-btn{display:block;padding:12px 20px;border-radius:10px;text-decoration:none;',
            'font-weight:700;font-size:14.5px;border:1px solid #e2e8f0;color:#334155;background:#fff}',
            '.ag-btn-primary{background:#0a8754;border-color:#0a8754;color:#fff}',
            '@media (prefers-color-scheme:dark){',
            '#admin-guard-denied{background:#0f172a}',
            '.ag-card{background:#1e293b}',
            '.ag-card h1{color:#f1f5f9}',
            '.ag-card p{color:#cbd5e1}',
            '.ag-hint{color:#94a3b8}',
            '.ag-btn{background:#1e293b;border-color:#334155;color:#e2e8f0}',
            '.ag-btn-primary{background:#0a8754;border-color:#0a8754;color:#fff}}'
        ].join('');
        document.head.appendChild(css);

        reveal();
    });
})();
