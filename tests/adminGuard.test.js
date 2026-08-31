/**
 * 🛡️ حارس صفحات الإدارة — قراره قبل رسم أي محتوى.
 *
 * كانت 18 صفحة إدارة من 20 بلا فحص صلاحية، وسبع منها بلا فحص توكن. الأدمن
 * المساعد يفتح admin-finance.html بالرابط، فيُرسم الهيكل كاملاً ثم ترجع
 * نداءات البيانات 403 فتبقى جداول فارغة ورسائل خطأ خام — وهو ما بدا
 * "عرضاً غير منسّق".
 *
 * ⚠️ بلا jsdom عمداً: إضافة تبعية بيئة DOM كاملة لأجل ملف واحد مبالغة.
 *    البديل أدناه يغطّي ما يلمسه الحارس فعلاً — وما لا يلمسه لا يُختبَر هنا.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD_SRC = readFileSync(join(ROOT, 'public_html', 'js', 'admin-guard.js'), 'utf8');

/** عنصر بسيط يكفي ما يلمسه الحارس */
function el(tag) {
    const node = {
        tagName: tag, id: '', textContent: '', innerHTML: '',
        children: [], parentNode: null,
        appendChild(child) { child.parentNode = node; node.children.push(child); return child; },
        removeChild(child) {
            const i = node.children.indexOf(child);
            if (i >= 0) node.children.splice(i, 1);
            child.parentNode = null;
            return child;
        },
        setAttribute(k, v) { node['_' + k] = v; },
        getAttribute(k) { return node['_' + k] ?? null; }
    };
    return node;
}

/**
 * يشغّل الحارس في بيئة مصطنعة ويعيد ما فعله.
 * @param {object} opts
 * @param {string|null} opts.perm       قيمة data-perm على وسم السكربت
 * @param {string|null} opts.token      adminToken في التخزين
 * @param {object|null} opts.user       كائن المستخدم المخزَّن
 * @param {boolean} [opts.throwOnStore] يحاكي متصفحاً يمنع الوصول للتخزين
 */
function runGuard({ perm = null, token = 'tok', user = null, throwOnStore = false } = {}) {
    const head = el('head');
    const body = el('body');
    const script = el('script');
    if (perm !== null) script.setAttribute('data-perm', perm);

    const result = { redirectedTo: null, readyHandlers: [] };

    const document = {
        currentScript: script,
        head, body,
        documentElement: el('html'),
        readyState: 'loading',
        createElement: el,
        getElementById: (id) => head.children.find((c) => c.id === id) || null,
        addEventListener: (evt, fn) => { if (evt === 'DOMContentLoaded') result.readyHandlers.push(fn); }
    };

    const store = {
        getItem(k) {
            if (throwOnStore) throw new Error('storage blocked');
            if (k === 'adminToken') return token;
            if (k === 'user') return user === null ? null : JSON.stringify(user);
            return null;
        }
    };

    const location = { replace: (u) => { result.redirectedTo = u; } };

    new Function('document', 'localStorage', 'location', GUARD_SRC)(document, store, location);

    result.hiddenDuringLoad = head.children.some((c) => c.id === 'admin-guard-hide');
    // محاكاة اكتمال تحميل المستند
    document.readyState = 'complete';
    result.readyHandlers.forEach((fn) => fn());

    result.stillHidden = head.children.some((c) => c.id === 'admin-guard-hide');
    result.deniedShown = body.innerHTML.includes('admin-guard-denied');
    result.bodyHtml = body.innerHTML;
    return result;
}

const SUB = (perms) => ({ adminRole: 'sub_admin', permissions: perms });

describe('التوكن', () => {
    it('🔒 بلا توكن ⇒ إعادة توجيه لصفحة الدخول', () => {
        const r = runGuard({ token: null, perm: 'view_finance' });
        expect(r.redirectedTo).toBe('admin-login.html');
    });

    it('🔒 توكن فارغ يُعامَل كغائب', () => {
        expect(runGuard({ token: '' }).redirectedTo).toBe('admin-login.html');
    });

    it('التخزين المحجوب لا يرمي — يُعامَل كغياب توكن', () => {
        const r = runGuard({ throwOnStore: true });
        expect(r.redirectedTo).toBe('admin-login.html');
    });

    it('✅ توكن موجود وصفحة بلا صلاحية مطلوبة ⇒ تُعرض', () => {
        const r = runGuard({ perm: null, token: 'tok' });
        expect(r.redirectedTo).toBeNull();
        expect(r.deniedShown).toBe(false);
        expect(r.stillHidden).toBe(false);
    });
});

describe('الصلاحيات', () => {
    it('🔒 أدمن مساعد بلا الصلاحية ⇒ شاشة منع لا هيكل مكسور', () => {
        const r = runGuard({ perm: 'view_finance', user: SUB(['view_orders']) });
        expect(r.deniedShown).toBe(true);
        expect(r.bodyHtml).toMatch(/الوصول غير مسموح/);
        expect(r.redirectedTo).toBeNull(); // لا يُطرد، يُخبَر
    });

    it('✅ أدمن مساعد يملك الصلاحية ⇒ تُعرض الصفحة', () => {
        const r = runGuard({ perm: 'view_finance', user: SUB(['view_finance', 'view_orders']) });
        expect(r.deniedShown).toBe(false);
        expect(r.stillHidden).toBe(false);
    });

    it('✅ المسؤول الرئيسي يمرّ على أي صفحة', () => {
        const r = runGuard({ perm: 'view_finance', user: { adminRole: 'super_admin', permissions: [] } });
        expect(r.deniedShown).toBe(false);
    });

    it('✅ أدمن قديم (adminRole غائب) يُعامَل كمسؤول رئيسي — كما يفعل الخادم', () => {
        const r = runGuard({ perm: 'view_finance', user: { permissions: [] } });
        expect(r.deniedShown).toBe(false);
    });

    it('مستخدم مفقود من التخزين يُعامَل كمسؤول رئيسي (الخادم هو الفاصل)', () => {
        const r = runGuard({ perm: 'view_finance', user: null });
        expect(r.deniedShown).toBe(false);
    });
});

describe('صفحات المسؤول الرئيسي وحده', () => {
    it('🔒 __super__ لا تفتحها أي صلاحية مهما كثرت', () => {
        const r = runGuard({
            perm: '__super__',
            user: SUB(['view_finance', 'manage_finance', 'manage_stores', '__super__'])
        });
        expect(r.deniedShown).toBe(true);
        expect(r.bodyHtml).toMatch(/للمسؤول الرئيسي وحده/);
    });

    it('✅ المسؤول الرئيسي يفتحها', () => {
        const r = runGuard({ perm: '__super__', user: { adminRole: 'super_admin' } });
        expect(r.deniedShown).toBe(false);
    });
});

describe('منع وميض المحتوى', () => {
    it('الصفحة مخفيّة فور التنفيذ قبل صدور الحكم', () => {
        expect(runGuard({ perm: 'view_finance', user: SUB([]) }).hiddenDuringLoad).toBe(true);
    });

    it('الإخفاء يُرفع في حالة السماح', () => {
        expect(runGuard({ perm: 'view_finance', user: SUB(['view_finance']) }).stillHidden).toBe(false);
    });

    it('والإخفاء يُرفع في حالة المنع أيضاً — وإلا بقيت الشاشة بيضاء', () => {
        expect(runGuard({ perm: 'view_finance', user: SUB([]) }).stillHidden).toBe(false);
    });
});

describe('تركيب الحارس على الصفحات', () => {
    const { readdirSync } = require('fs');
    const dir = join(ROOT, 'public_html');
    const pages = readdirSync(dir).filter((f) => /^admin.*\.html$/.test(f) && f !== 'admin-login.html');

    it('كل صفحة إدارة تحمل الحارس', () => {
        const missing = pages.filter((f) => !readFileSync(join(dir, f), 'utf8').includes('admin-guard.js'));
        expect(missing).toEqual([]);
    });

    it('الحارس يسبق أي سكربت آخر في الصفحة', () => {
        const late = pages.filter((f) => {
            const html = readFileSync(join(dir, f), 'utf8');
            const guard = html.indexOf('admin-guard.js');
            const firstScript = html.indexOf('<script');
            // موضع أول <script> يجب أن يكون هو وسم الحارس نفسه
            return guard === -1 || html.slice(firstScript, guard) .includes('</script>');
        });
        expect(late).toEqual([]);
    });

    it('صفحة الدخول بلا حارس — وإلا دارت في حلقة إعادة توجيه', () => {
        expect(readFileSync(join(dir, 'admin-login.html'), 'utf8')).not.toContain('admin-guard.js');
    });
});
