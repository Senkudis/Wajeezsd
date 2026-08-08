/**
 * 🔤 تعبير نمطي عربي متسامح للبحث بالاسم.
 *
 * كان معرَّفاً داخل routes/places.js وحده، ثم احتاجه بحث "اشترِ لي" المشترك
 * (utils/errandSearch.js). نسخُه يعني أن يتحسّن أحدهما ويبقى الآخر — والفرق
 * يظهر كنتائج مختلفة لنفس الكلمة في شاشتين، وهو أسوأ أنواع الأعطال: لا يُبلَّغ عنه.
 */

/**
 * يبني تعبيراً يطابق كل أشكال الحرف العربي ويتجاهل التشكيل والتطويل،
 * فيجد النتائج مهما اختلف رسم الهمزة/التاء/الياء في بيانات القاعدة.
 * @param {string} term
 * @returns {RegExp}
 */
function arabicFlexibleRegex(term) {
    // احذف التشكيل (الحركات) والتطويل (ـ)
    const cleaned = String(term).replace(/[ً-ْٰـ]/g, '').trim();
    // مجموعات الحروف المتكافئة في البحث
    const groups = ['اأإآٱ', 'ةه', 'يىئ', 'وؤ'];
    const classOf = (ch) => {
        for (const g of groups) if (g.includes(ch)) return '[' + g + ']';
        // هروب رموز regex الخاصة
        if (/[.*+?^${}()|[\]\\]/.test(ch)) return '\\' + ch;
        return ch;
    };
    // اسمح بوجود تشكيل اختياري في بيانات القاعدة بين الحروف (مثل "مَطعَم")
    const parts = [];
    for (const ch of cleaned) parts.push(classOf(ch));
    const out = parts.join('[ً-ْٰ]*');
    return new RegExp(out || '.*', 'i');
}

module.exports = { arabicFlexibleRegex };
