/**
 * يبني الخط الزمني المرئي لحالة الطلب من طوابعه الزمنية.
 *
 * مصدر البيانات هو حقول الطلب نفسها (createdAt/acceptedAt/pickedUpAt/
 * deliveredAt/cancelledAt) لا سجلّ منفصل — فلا كتابة مزدوجة ولا خطر تباين.
 * يُعرض للعميل ليتابع طلبه بشفافية (قُبل ← استُلم ← في الطريق ← سُلّم).
 */

// المراحل بالترتيب المنطقي، وكل مرحلة مرتبطة بطابعها الزمني على الطلب.
const STAGES = [
    { key: 'placed',    label: 'تم إنشاء الطلب', field: 'createdAt' },
    { key: 'accepted',  label: 'قَبِل الكابتن',   field: 'acceptedAt' },
    { key: 'picked_up', label: 'استلم الطلب',    field: 'pickedUpAt' },
    { key: 'delivered', label: 'تم التسليم',     field: 'deliveredAt' }
];

/**
 * @param {object} order مستند طلب (أو lean) فيه الطوابع الزمنية والحالة
 * @returns {{ current:string, cancelled:boolean, steps:Array }}
 */
function buildTimeline(order) {
    if (!order) return { current: 'pending', cancelled: false, steps: [] };

    // ملغى: نعرض ما تحقّق قبل الإلغاء + مرحلة إلغاء نهائية
    if (order.status === 'cancelled') {
        const steps = STAGES
            .filter(s => order[s.field])
            .map(s => ({ key: s.key, label: s.label, at: order[s.field], done: true }));
        steps.push({
            key: 'cancelled',
            label: 'أُلغي الطلب',
            at: order.cancelledAt || null,
            done: true,
            cancelled: true
        });
        return { current: 'cancelled', cancelled: true, steps };
    }

    const statusMap = {
        'pending': 0,
        'scheduled': 0,
        'chat_initiated': 0, // for shop orders
        'accepted': 1,
        'picked_up': 2,
        'delivered': 3
    };
    
    // Some mapped shop orders might use 'realShopStatus' or just 'status'
    const currentStatusIndex = statusMap[order.status] !== undefined ? statusMap[order.status] : -1;

    const steps = STAGES.map((s, index) => {
        // Step is done if it has a timestamp OR if the current order status has logically passed this step
        const isDone = !!order[s.field] || currentStatusIndex >= index;
        return {
            key: s.key,
            label: s.label,
            at: order[s.field] || null,
            done: isDone
        };
    });

    // المرحلة الحالية = آخر مرحلة مُنجَزة
    let current = 'pending';
    for (const s of steps) {
        if (s.done) current = s.key;
    }

    return { current, cancelled: false, steps };
}

module.exports = { buildTimeline, STAGES };
