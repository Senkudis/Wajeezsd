/**
 * حارس أنواع الإشعارات.
 *
 * لماذا هذا الملف موجود: sendNotification يبدأ بـ Notification.create، فأي
 * نوع خارج enum المخطّط كان يرمي validation error يبتلعه try/catch الخارجي —
 * فلا سجل في قاعدة البيانات، ولا بثّ socket، ولا دفعة FCM. أحد عشر نوعاً
 * مستخدماً في الكود كانت تسقط بصمت تام، منها order_cancelled (العميل لا يعلم
 * أن طلبه أُلغي) وwallet_update (الكابتن لا يعلم أنه حُجب).
 *
 * هذا الاختبار يمسح الكود بحثاً عن كل نوع يُمرَّر فعلياً لإنشاء إشعار،
 * ويتحقق أن المخطّط يقبله — فلا يتكرّر الانحراف بصمت مرة أخرى.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { resolvePushUrl } = require('../utils/pushRouting');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['routes', 'utils', 'services'];
const SCAN_FILES = ['scheduler.js', 'index.js'];

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p));
        else if (entry.isFile() && entry.name.endsWith('.js')) out.push(p);
    }
    return out;
}

/** كل نوع يظهر داخل استدعاء sendNotification(...) أو Notification.create(...) */
function collectTypes() {
    const files = [
        ...SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d))),
        ...SCAN_FILES.map(f => path.join(ROOT, f))
    ];
    const found = new Map(); // type -> ملف أول ظهور

    for (const file of files) {
        const src = fs.readFileSync(file, 'utf8');
        // نافذة بعد كل نداء إنشاء إشعار — تكفي لالتقاط حقل type داخل الكائن
        const callRe = /(sendNotification\s*\(|Notification\.create\s*\()/g;
        let m;
        while ((m = callRe.exec(src)) !== null) {
            const window = src.slice(m.index, m.index + 600);
            const typeMatch = window.match(/\btype:\s*'([a-z_]+)'/);
            if (typeMatch && !found.has(typeMatch[1])) {
                found.set(typeMatch[1], path.relative(ROOT, file));
            }
        }
    }
    return found;
}

describe('أنواع الإشعارات', () => {
    const used = collectTypes();

    it('المسح يعثر على أنواع فعلية (حارس ضد ريجيكس تعطّل بصمت)', () => {
        expect(used.size).toBeGreaterThan(8);
        expect([...used.keys()]).toContain('order_update');
    });

    it('🛡️ كل نوع مستخدم في الكود مقبول في مخطّط Notification', () => {
        const rejected = [];
        for (const [type, file] of used) {
            const doc = new Notification({
                user: new mongoose.Types.ObjectId(),
                title: 't', message: 'm', type
            });
            if (doc.validateSync()) rejected.push(`${type} (${file})`);
        }
        expect(rejected).toEqual([]);
    });

    it('الأنواع الجديدة لرحلة العميل موجودة', () => {
        const enumValues = Notification.schema.path('type').enumValues;
        expect(enumValues).toEqual(expect.arrayContaining([
            'order_searching', 'order_delayed', 'feedback_request', 'order_cancelled'
        ]));
    });

    it('🧭 كل نوع مستخدم له وجهة نقر للعميل ليست صفحة الإشعارات العامة', () => {
        // الأنواع الموجّهة لأدوار أخرى تسقط لصفحة إشعارات دورها — نفحص
        // أنواع رحلة العميل وحدها، فهي موضوع هذا العمل.
        const clientJourney = [
            'order_searching', 'order_delayed', 'order_accepted',
            'order_completed', 'order_cancelled', 'feedback_request'
        ];
        for (const type of clientJourney) {
            const url = resolvePushUrl('client', type, 'ORDER1');
            expect(url, `${type} بلا وجهة مخصّصة`).not.toBe('/notifications.html');
            expect(url).toMatch(/^\//);
        }
    });

    it('طلب الرأي يفتح نموذج التقييم فوق قائمة الطلبات', () => {
        expect(resolvePushUrl('client', 'feedback_request', 'O1'))
            .toBe('/client-my-orders.html?feedback=O1');
    });

    it('البحث عن كابتن والتأخير يفتحان التتبّع بالطلب المحدّد', () => {
        expect(resolvePushUrl('client', 'order_searching', 'O1')).toBe('/tracking.html?orderId=O1');
        expect(resolvePushUrl('client', 'order_delayed', 'O1')).toBe('/tracking.html?orderId=O1');
    });
});
