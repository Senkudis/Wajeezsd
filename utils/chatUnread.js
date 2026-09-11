/**
 * 🔔 عدّاد الرسائل غير المقروءة — تعريفٌ واحد لا تعريفان.
 *
 * الفخّ الذي أوقع العطل السابق: قائمة المحادثات تجمع **بالطرف الآخر**
 * (محادثة واحدة لكل عميل)، بينما شاشة الدردشة تفتح **طلباً واحداً**
 * (lastOrderId) و POST /api/chat/read يُعلّم ذلك الطلب وحده. فحين كان
 * العدّ يشمل كل طلبات الطرف الآخر، تبقى رسائل طلبٍ أقدم غير مقروءة إلى
 * الأبد — لا تُعرض في شاشة، ولا سبيل لتعليمها ⇒ شارة حمراء عالقة.
 * وهذا يقع حتماً مع كل عميل متكرّر: كل طلب مستند ShopOrder جديد.
 *
 * القاعدة هنا: **يُعدّ ما يمكن فتحه وتعليمه**. فما يُعرَض في الشارة هو
 * بالضبط ما يُطفئه فتح المحادثة. الرسائل الأقدم تبقى في القاعدة بلا مساس
 * (لا تُعلَّم مقروءةً زوراً)، فلو عُرضت المحادثات كاملةً يوماً لم يضِع شيء.
 *
 * تعيش الدالة هنا لا داخل مسارٍ بعينه لأن مُستهلكيها اثنان — قائمة
 * المحادثات وعدّاد الشارة — ونسخةٌ تفترق بينهما تُعيد العطل نفسه.
 */

/**
 * @param {import('mongoose').Model} Message نموذج الرسائل
 * @param {import('mongoose').Types.ObjectId} userObjectId معرّف صاحب الشارة
 * @returns {Promise<{key:(peer,order)=>string, map:Map<string,number>}>}
 *          map مفتاحها "peer|order" وقيمتها عدد غير المقروء على ذلك الطلب.
 */
async function unreadByPeerAndOrder(Message, userObjectId) {
    const rows = await Message.aggregate([
        { $match: { receiver: userObjectId, isRead: false } },
        { $group: { _id: { peer: '$sender', order: '$order' }, n: { $sum: 1 } } }
    ]);
    const key = (peer, order) => String(peer) + '|' + String(order);
    return {
        key,
        map: new Map(rows.map(r => [key(r._id.peer, r._id.order), r.n]))
    };
}

/**
 * مجموع غير المقروء القابل للفتح — لشارة واحدة في شريط التنقل.
 *
 * يُعيد بناء «آخر طلب لكل طرف» بنفس منطق قائمة المحادثات ثم يجمع عليه،
 * فلا يختلف الرقم في الشارة عن مجموع الأرقام في القائمة.
 */
async function totalReachableUnread(Message, userObjectId) {
    const [{ key, map }, lastOrders] = await Promise.all([
        unreadByPeerAndOrder(Message, userObjectId),
        Message.aggregate([
            { $match: { $or: [{ sender: userObjectId }, { receiver: userObjectId }] } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: { $cond: [{ $eq: ['$sender', userObjectId] }, '$receiver', '$sender'] },
                    lastOrderId: { $first: '$order' }
                }
            }
        ])
    ]);

    let total = 0;
    for (const row of lastOrders) {
        total += map.get(key(row._id, row.lastOrderId)) || 0;
    }
    return total;
}

module.exports = { unreadByPeerAndOrder, totalReachableUnread };
