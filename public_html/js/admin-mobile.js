/*
 * ════════════════════════════════════════════════════════════════
 *  admin-mobile.js — تحويل جداول لوحة الإدارة إلى بطاقات على الهاتف
 * ════════════════════════════════════════════════════════════════
 *
 *  المشكلة المقاسة: لوحة الإدارة عشرون صفحة، وأعرض ما فيها جداولٌ من
 *  ست إلى ثماني أعمدة تُقاس بين ٤٨٦ و٧٦٠ بكسل على شاشة عرضها ٣٧٥.
 *  بعضها داخل حاوية تمرير أفقي — فيقرأ الأدمن عموداً ويسحب ليرى الذي
 *  يليه وقد نسي الأول — وبعضها بلا حاوية أصلاً فيُقصّ ويضيع.
 *
 *  الحل: على الشاشات الضيّقة يصير كل صفٍّ بطاقةً مستقلة، وكل خلية سطراً
 *  فيه «العنوان: القيمة». لا تمرير أفقي ولا قصّ، والصفّ يُقرأ كاملاً.
 *
 *  ⚠️ العناوين تُشتقّ من <thead> وقت التشغيل لا تُكتب يدوياً في كل خلية:
 *  صفوف هذه الجداول كلها تُبنى في جافاسكربت (innerHTML عند وصول البيانات)،
 *  فكتابة data-label في كل مولّد صفٍّ في عشرين صفحة تعني عشرين موضعاً
 *  تتباعد بمرور الوقت — ويكفي أن يُضاف عمود في مكان ويُنسى في الآخر حتى
 *  تُنسب القيم لعناوين خاطئة. الاشتقاق من رأس الجدول يبقيهما متطابقين دائماً.
 *
 *  يعمل بلا أي تعديل على صفحات اللوحة: يكفي تضمين هذا الملف مع
 *  css/admin-mobile.css.
 * ════════════════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var BREAKPOINT = 768;

    function isNarrow() { return window.innerWidth <= BREAKPOINT; }

    /**
     * عناوين أعمدة الجدول من صفّ الرأس الأخير.
     * الأخير لا الأول: بعض الجداول تضع صفّاً علوياً مدمجاً (colspan) للعنونة،
     * والعناوين الحقيقية في الصفّ الذي تحته.
     */
    function headerLabels(table) {
        var head = table.tHead;
        if (!head || !head.rows.length) return null;
        var row = head.rows[head.rows.length - 1];
        var out = [];
        for (var i = 0; i < row.cells.length; i++) {
            var c = row.cells[i];
            var span = parseInt(c.getAttribute('colspan') || '1', 10) || 1;
            var text = (c.textContent || '').replace(/\s+/g, ' ').trim();
            // عمودٌ ممتدّ يقابل عدّة خلايا في الجسم — نكرّر عنوانه ليبقى الترتيب صحيحاً
            for (var s = 0; s < span; s++) out.push(text);
        }
        return out.length ? out : null;
    }

    /** جدولٌ تديره مكتبة خارجية (DataTables) لا نلمس بنيته */
    function isManaged(table) {
        return table.classList.contains('dataTable') ||
               !!table.closest('.dataTables_wrapper');
    }

    function stampTable(table) {
        // ⚠️ الإزالة لا التخطّي: DataTables تضيف صنفها **بعد** التهيئة، فجدولٌ
        // وُسم قبلها يبقى موسوماً بعدها فتُحوَّل صفوفٌ تديرها المكتبة (فرز
        // وترقيم) إلى بطاقات — وتنكسر أدواتها. نتراجع عن الوسم صراحةً.
        if (isManaged(table)) { table.removeAttribute('data-adm-cards'); return; }
        var labels = headerLabels(table);
        if (!labels) {
            // بلا رأس لا يمكن اشتقاق عناوين ⇒ نتركه للتمرير الأفقي بدل بطاقات صمّاء
            table.setAttribute('data-adm-cards', 'no');
            return;
        }
        table.setAttribute('data-adm-cards', 'yes');

        var bodies = table.tBodies;
        for (var b = 0; b < bodies.length; b++) {
            var rows = bodies[b].rows;
            for (var r = 0; r < rows.length; r++) {
                var cells = rows[r].cells;
                // صفّ حالةٍ فارغة ("لا توجد بيانات") خليةٌ واحدة ممتدّة — بطاقةٌ
                // بعنوانٍ مضلّل أسوأ من نصٍّ في المنتصف
                if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
                    rows[r].setAttribute('data-adm-empty', '1');
                    continue;
                }
                rows[r].removeAttribute('data-adm-empty');
                for (var i = 0; i < cells.length; i++) {
                    var label = labels[i] || '';
                    if (cells[i].getAttribute('data-label') !== label) {
                        cells[i].setAttribute('data-label', label);
                    }
                }
            }
        }
    }

    function stampAll() {
        var tables = document.querySelectorAll('table');
        for (var i = 0; i < tables.length; i++) {
            try { stampTable(tables[i]); } catch (e) { /* جدولٌ واحد لا يُسقط الصفحة */ }
        }
    }

    // 🔁 الصفوف تصل بعد الاستجابة لا مع تحميل الصفحة، وتُعاد كتابتها عند كل
    // فلترة أو تحديث. مراقبٌ واحد على الجسم أرخص من ربط كل مولّد صفوف على حدة،
    // ويصمد أمام أي شاشة تُضاف لاحقاً بلا أن يعرف بها هذا الملف.
    // ⚠️ مؤقّت لا requestAnimationFrame: rAF لا يُنفَّذ أصلاً حين لا تُركّب
    // الصفحة إطاراتها (تبويب خلفي، نافذة مصغّرة، جهاز يوقف الرسوم). رُصد فعلاً:
    // وصلت صفوفٌ جديدة فلم تُوسَم، فظهرت بلا عناوين — والأسوأ أن الحارس `pending`
    // كان يبقى مشغولاً بنداءٍ لن يُنفَّذ أبداً، فيُهمَل كل تحديثٍ بعده.
    var pending = null;
    function schedule() {
        if (pending) return;
        pending = setTimeout(function () { pending = null; stampAll(); }, 50);
    }

    function boot() {
        stampAll();
        try {
            new MutationObserver(function (muts) {
                for (var i = 0; i < muts.length; i++) {
                    if (muts[i].addedNodes && muts[i].addedNodes.length) { schedule(); return; }
                }
            }).observe(document.body, { childList: true, subtree: true });
        } catch (e) { /* بلا مراقب: الجداول المرسومة أولاً تبقى مضبوطة */ }

        // تغيير الاتجاه أو تدوير الجهاز يعبر نقطة الكسر — والعناوين تبقى صالحة
        // في الحالتين، فيكفي إعادة الوسم بلا إعادة بناء
        window.addEventListener('resize', schedule);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.AdminMobile = { stampAll: stampAll, isNarrow: isNarrow, BREAKPOINT: BREAKPOINT };
})();
