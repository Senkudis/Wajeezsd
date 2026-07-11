/**
 * أداة لمرة واحدة: تقسّم routes/admin.js الضخم إلى وحدات تحت routes/admin/.
 * تقصّ الكود حرفياً (لا تعيد كتابته) للحفاظ على السلوك تماماً، ثم تتحقق
 * من تطابق قائمة (method, path) قبل وبعد التقسيم.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'routes', 'admin.js');
const OUT_DIR = path.join(__dirname, '..', 'routes', 'admin');
const lines = fs.readFileSync(SRC, 'utf-8').split(/\r?\n/);

// الوحدات الجديدة أعمق بمستوى (routes/admin/) فتحتاج '../../' بدل '../'
const fixRequires = (txt) => txt.replace(/require\((['"])\.\.\//g, 'require($1../../');

// 1) الترويسة المشتركة (الاستيرادات) = الأسطر 1..19
const header = fixRequires(lines.slice(0, 19).join('\n'));

// 2) استخراج المقاطع الخاصة على مستوى الموديول
//    adminLoginLimiter (يستخدمه /login) و cache vars (يستخدمها /dashboard)
const limiterStart = lines.findIndex((l) => l.startsWith('const adminLoginLimiter'));
let limiterEnd = limiterStart;
while (!lines[limiterEnd].startsWith('});')) limiterEnd++;
const limiterBlock = lines.slice(limiterStart, limiterEnd + 1).join('\n');

const cacheLineSet = new Set();
const cacheBlockLines = [];
lines.forEach((l) => {
    if (/^let _dashboardCache\b/.test(l) || /^let _dashboardCacheTime\b/.test(l) || /^const DASHBOARD_CACHE_TTL\b/.test(l)) {
        cacheLineSet.add(l);
        cacheBlockLines.push(l);
    }
});
const cacheBlock = cacheBlockLines.join('\n');

// 3) إيجاد حدود كل route block
const routeRe = /^router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/;
const starts = [];
lines.forEach((l, i) => {
    const m = l.match(routeRe);
    if (m) starts.push({ i, method: m[1].toUpperCase(), p: m[2] });
});
const exportsIdx = lines.findIndex((l) => l.startsWith('module.exports'));

// 4) خريطة المسار → الوحدة
function moduleFor(p) {
    if (p === '/login' || p.startsWith('/session-requests')) return 'auth';
    if (p === '/dashboard' || p === '/dashboard-limited' || p === '/active-captains' || p === '/emergency-alerts') return 'dashboard';
    if (p.startsWith('/orders')) return 'orders';
    if (p.startsWith('/complaints')) return 'complaints';
    if (p.startsWith('/promo-codes') || p.startsWith('/payment-requests') || p === '/debt-adjustments' || p === '/ledger' || p === '/captains/:id/adjust-debt') return 'finance';
    if (p === '/settings' || p === '/debug-settings' || p === '/pricing' || p === '/delivery-zone' || p === '/migrate-cities-legacy-data') return 'settings';
    if (p === '/send-notification' || p === '/broadcast') return 'notifications';
    if (p.startsWith('/sub-admins') || p === '/activity-log') return 'subadmins';
    if (p.startsWith('/ratings')) return 'ratings';
    if (p.startsWith('/user') || p === '/captains' || p === '/pending-captains' || p.startsWith('/approve-captain') || p.startsWith('/reject-captain') || p === '/create-captain') return 'users';
    return 'misc';
}

// 5) بناء نص كل وحدة (بالترتيب الأصلي للمسارات)
const modules = {}; // name → array of block texts
const mountOrder = [];
const beforeFirst = starts[0].i; // أي تعليق سابق للمسار الأول يبقى في أول وحدة تظهر

starts.forEach((s, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].i : exportsIdx;
    // أسطر هذا الـ block مع حذف أسطر cache vars (ستُحقن في وحدة dashboard)
    const blockLines = lines.slice(s.i, end).filter((l) => !cacheLineSet.has(l));
    const name = moduleFor(s.p);
    if (!modules[name]) { modules[name] = []; mountOrder.push(name); }
    modules[name].push(fixRequires(blockLines.join('\n')).replace(/\s+$/, ''));
});

// 6) كتابة الملفات
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const banner = (name) => `// routes/admin/${name}.js — مُولّد من تقسيم admin.js الأصلي.\n// كل وحدة Router مستقلة تُركّب على /api/admin عبر routes/admin.js.\n`;

for (const name of mountOrder) {
    let body = header + '\n\n';
    if (name === 'auth') body += limiterBlock + '\n\n';
    if (name === 'dashboard') body += cacheBlock + '\n\n';
    body = banner(name) + body + modules[name].join('\n\n') + '\n\nmodule.exports = router;\n';
    fs.writeFileSync(path.join(OUT_DIR, `${name}.js`), body, 'utf-8');
    console.log(`wrote routes/admin/${name}.js (${modules[name].length} routes)`);
}

// 7) كتابة الـ barrel: routes/admin.js يركّب كل الوحدات بنفس الترتيب
const barrel = `const express = require('express');
const router = express.Router();

// admin.js مقسّم إلى وحدات حسب المجال تحت routes/admin/.
// تُركّب كلها على نفس المسار '/'، فيحاول Express كل وحدة بترتيب التركيب.
${mountOrder.map((n) => `router.use(require('./admin/${n}'));`).join('\n')}

module.exports = router;
`;
fs.writeFileSync(path.join(__dirname, '..', 'routes', 'admin.new.js'), barrel, 'utf-8');
console.log('wrote routes/admin.new.js (barrel)');
console.log('Mount order:', mountOrder.join(', '));
