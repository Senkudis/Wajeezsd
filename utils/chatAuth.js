/**
 * تفويض رسائل الدردشة — مصدر واحد للحقيقة.
 *
 * كان /api/beacon يحفظ الرسائل بلا أي تفويض إطلاقاً، بينما نظيراه
 * (send_message في السوكت وPOST /api/chat) يفحصان أن المرسِل والمستقبِل
 * طرفان في الطلب وأن الطلب غير مغلق وأن الحساب غير محجوب. هنا نوحّد ذلك.
 *
 * النماذج تُحقن (models) ليبقى المنطق نقياً وقابلاً للاختبار بلا قاعدة بيانات.
 */

/**
 * @param {object} p
 * @param {string} p.sender    معرّف المرسِل (موثّق مسبقاً من التوكن)
 * @param {string} p.receiver  معرّف المستقبِل
 * @param {string} p.order     معرّف الطلب
 * @param {object} models      { User, Order, ShopOrder }
 * @returns {Promise<{ok:boolean, status?:number, error?:string}>}
 */
async function authorizeChatMessage({ sender, receiver, order }, models) {
    const { User, Order, ShopOrder } = models;

    if (!sender || !receiver || !order) {
        return { ok: false, status: 400, error: 'بيانات ناقصة' };
    }
    if (String(sender) === String(receiver)) {
        return { ok: false, status: 400, error: 'لا يمكنك مراسلة نفسك' };
    }

    // 🚫 الكابتن المحجوب (تجاوز الحد الائتماني) ممنوع من الدردشة
    const senderDoc = await User.findById(sender).select('is_blocked').lean();
    if (!senderDoc) {
        return { ok: false, status: 403, error: 'المرسِل غير موجود' };
    }
    if (senderDoc.is_blocked) {
        return { ok: false, status: 403, error: 'حسابك موقوف بسبب تجاوز الحد الائتماني. يرجى السداد أولاً.' };
    }

    // جرّب Order العادي أولاً ثم ShopOrder (دردشة العميل ↔ التاجر)
    const orderDoc = await Order.findById(order).select('client captain status').lean();
    if (orderDoc) {
        const client = orderDoc.client ? String(orderDoc.client) : '';
        const captain = orderDoc.captain ? String(orderDoc.captain) : '';
        if (String(sender) !== client && String(sender) !== captain) {
            return { ok: false, status: 403, error: 'غير مصرح — أنت لست طرفاً في هذا الطلب' };
        }
        if (String(receiver) !== client && String(receiver) !== captain) {
            return { ok: false, status: 403, error: 'المستلم غير صالح' };
        }
        if (orderDoc.status === 'delivered' || orderDoc.status === 'cancelled') {
            return { ok: false, status: 403, error: 'الدردشة مغلقة لهذا الطلب المكتمل' };
        }
        return { ok: true, orderModel: 'Order' };
    }

    const shopDoc = await ShopOrder.findById(order)
        .populate('place', 'ownerId')
        .select('client place status')
        .lean();
    if (!shopDoc) {
        return { ok: false, status: 404, error: 'الطلب غير موجود' };
    }

    const shopClient = shopDoc.client ? String(shopDoc.client) : '';
    const shopMerchant = shopDoc.place && shopDoc.place.ownerId ? String(shopDoc.place.ownerId) : '';
    if (String(sender) !== shopClient && String(sender) !== shopMerchant) {
        return { ok: false, status: 403, error: 'غير مصرح — أنت لست طرفاً في هذا الطلب' };
    }
    if (String(receiver) !== shopClient && String(receiver) !== shopMerchant) {
        return { ok: false, status: 403, error: 'المستلم غير صالح' };
    }
    if (shopDoc.status === 'cancelled') {
        return { ok: false, status: 403, error: 'الدردشة مغلقة لهذا الطلب الملغي' };
    }
    return { ok: true, orderModel: 'ShopOrder' };
}

module.exports = { authorizeChatMessage };
