/**
 * 🖼️ ضغط الصور قبل الرفع — في المتصفّح، قبل مغادرة الجهاز.
 *
 * لماذا: حدّ الخادم 5MB لكل ملف (routes/upload.js)، وكاميرا الهاتف الحديثة
 * تُنتج 3-8MB للصورة الواحدة. ونموذج تسجيل الكابتن يرفع **خمس صور** في طلبٍ
 * واحد. فصورةٌ واحدة فوق الحدّ تُفشل الطلب كلّه، ويبقى الكابتن بحسابٍ بلا
 * وثائق — لا تستطيع الإدارة مراجعته ولا يعرف هو السبب.
 *
 * والضغط ليس تحسين أداءٍ فقط: على بيانات الهاتف في السودان، رفع 25MB قد لا
 * ينتهي أصلاً. صورة الهوية المضغوطة إلى ~300KB تبقى مقروءة تماماً للمراجعة.
 *
 * ⚠️ اتجاه الصورة (EXIF): الصور الملتقطة عمودياً تحمل وسم دوران، والرسم على
 *    canvas يتجاهله فتصل الهوية **مقلوبة** إلى المراجع. imageOrientation:
 *    'from-image' يطبّقه. وللمتصفّحات التي لا تدعم createImageBitmap نسقط
 *    إلى <img> — وهو يطبّق الدوران تلقائياً منذ Chrome 81 وSafari 13.4.
 *
 * القاعدة الحاكمة: **لا نمنع المستخدم أبداً**. أي فشل في الضغط يُرجع الملف
 * الأصلي بدل رمي خطأ — الرفع الثقيل أفضل من لا رفع.
 */
(function () {
    'use strict';

    var DEFAULTS = {
        maxDim: 1600,                 // أطول ضلع — يكفي لقراءة رقم هوية أو لوحة
        maxBytes: 1.2 * 1024 * 1024,  // هدفٌ دون حدّ الخادم بهامش واسع
        quality: 0.82,
        minQuality: 0.5               // أدنى جودة نقبلها قبل الاستسلام
    };

    /** يحمّل الملف كـ bitmap مع تطبيق دوران EXIF. */
    function loadBitmap(file) {
        if (typeof createImageBitmap === 'function') {
            // بعض المحرّكات لا تعرف الخيار وترمي — نعيد المحاولة بلا خيارات
            return createImageBitmap(file, { imageOrientation: 'from-image' })
                .catch(function () { return createImageBitmap(file); });
        }
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
            img.src = url;
        });
    }

    function canvasToBlob(canvas, quality) {
        return new Promise(function (resolve) {
            if (canvas.toBlob) canvas.toBlob(function (b) { resolve(b); }, 'image/jpeg', quality);
            else resolve(null);
        });
    }

    /**
     * @param {File} file
     * @param {object} [opts] {maxDim, maxBytes, quality}
     * @returns {Promise<File>} ملفٌ مضغوط، أو الأصل إن تعذّر الضغط.
     */
    async function compress(file, opts) {
        var o = Object.assign({}, DEFAULTS, opts || {});

        if (!file || !file.type || file.type.indexOf('image/') !== 0) return file;
        // GIF قد يكون متحرّكاً — الضغط يُسقط الحركة، ولا داعي له أصلاً هنا
        if (file.type === 'image/gif') return file;
        // صغيرة وبأبعاد معقولة؟ لا نعيد ترميزها فنخسر جودة بلا مقابل
        if (file.size <= 400 * 1024) return file;

        try {
            var bmp = await loadBitmap(file);
            var w = bmp.width || bmp.naturalWidth;
            var h = bmp.height || bmp.naturalHeight;
            if (!w || !h) return file;

            var scale = Math.min(1, o.maxDim / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * scale));
            var ch = Math.max(1, Math.round(h * scale));

            var canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            var ctx = canvas.getContext('2d');
            if (!ctx) return file;
            // خلفية بيضاء: JPEG بلا شفافية، وبدونها تصير المناطق الشفّافة سوداء
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cw, ch);
            ctx.drawImage(bmp, 0, 0, cw, ch);
            if (bmp.close) bmp.close();

            var q = o.quality;
            var blob = await canvasToBlob(canvas, q);
            // خفض الجودة تدريجياً حتى نبلغ الهدف — لا حلقة لا نهائية
            while (blob && blob.size > o.maxBytes && q > o.minQuality) {
                q = Math.max(o.minQuality, q - 0.12);
                blob = await canvasToBlob(canvas, q);
            }
            if (!blob) return file;

            // لم نكسب شيئاً؟ الأصل أولى (يحدث مع صورٍ مضغوطة سلفاً)
            if (blob.size >= file.size) return file;

            var name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
            try {
                return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
            } catch (_) {
                // WebView قديم بلا باني File — Blob يكفي FormData
                blob.name = name;
                return blob;
            }
        } catch (_) {
            return file;   // لا نمنع المستخدم بسبب فشل الضغط
        }
    }

    /** نصّ مقروء لحجم ملف — للعرض بجانب المعاينة. */
    function humanSize(bytes) {
        var b = Number(bytes) || 0;
        if (b < 1024) return b + ' بايت';
        if (b < 1024 * 1024) return Math.round(b / 1024) + ' ك.ب';
        return (b / (1024 * 1024)).toFixed(1) + ' م.ب';
    }

    window.WajeezImage = { compress: compress, humanSize: humanSize };
})();
