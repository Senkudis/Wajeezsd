/**
 * تخطيط تنبيهات التأخير — أي عتبة تنطبق، وأي عتبات تُستهلك معها.
 *
 * لماذا وحدة مستقلة: المنطق بدا بديهياً فكُتب داخل المجدول مباشرة، وكان
 * خاطئاً. طلبٌ عمره ساعتان كان يُطلق عتبة الـ١٢٠ ثم عتبة الـ٣٠ في الدورة
 * نفسها، فيصل صاحبه رسالتان متتاليتان متناقضتان:
 *     "طلبك يستغرق وقتاً أطول من المعتاد"
 *     "ما زلنا نبحث لك عن كابتن"
 * السبب أن العتبة الأدنى تبقى غير مُعلَّمة بعد إطلاق الأعلى فتنطبق فوراً.
 *
 * الوحدة نقيّة بلا قاعدة بيانات كي يمكن اختبار القاعدة نفسها، لا تشغيلها.
 */

/**
 * يختار العتبة الواجب إطلاقها لعمرٍ معطى.
 *
 * @param {Array<{key: string|number, afterMin: number}>} thresholds العتبات
 * @param {number} ageMin عمر الحالة بالدقائق
 * @param {Array<string|number>} alreadySent المفاتيح المُرسلة سابقاً
 * @returns {{fire: object, consume: Array}|null} العتبة والمفاتيح المستهلَكة معها
 */
function planNudge(thresholds, ageMin, alreadySent = []) {
    if (!Array.isArray(thresholds) || !thresholds.length) return null;
    const sent = new Set(alreadySent);

    // الأعلى أولاً: من تجاوز الساعتين يستحق رسالة الساعتين لا رسالة الثلاثين دقيقة
    const ordered = [...thresholds].sort((a, b) => b.afterMin - a.afterMin);

    for (const t of ordered) {
        if (ageMin < t.afterMin) continue;
        if (sent.has(t.key)) return null; // أعلى عتبة مستحقّة أُرسلت — لا شيء بعدها

        // كل عتبة أدنى أو مساوية تُعلَّم مستهلَكة، فلا تنطلق لاحقاً بأثر رجعي
        const consume = thresholds
            .filter(x => x.afterMin <= t.afterMin && x.key !== t.key)
            .map(x => x.key);

        return { fire: t, consume };
    }
    return null;
}

module.exports = { planNudge };
