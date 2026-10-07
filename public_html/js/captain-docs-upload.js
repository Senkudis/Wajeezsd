/**
 * 📎 رفع وثائق الكابتن — كل صورةٍ في طلبها، وكل طلبٍ بمحاولاته.
 *
 * كانت الصور الخمس تُرفع في طلبٍ واحد بلا إعادة: على شبكةٍ ضعيفة يسقط
 * الطلب كلّه (أو ينقطع في منتصفه) فيُنشأ الحساب بلا صورةٍ واحدة، ويظهر
 * للإدارة متقدّمٌ لا يُراجَع. الآن: صورةٌ صورة، وثلاث محاولاتٍ لكلٍّ منها
 * بانتظارٍ متزايد — وما نجح يبقى، فالإعادة ترفع الناقص وحده.
 *
 * الاستعمال: await CaptainDocs.upload(token, { idImage: File, ... }, onStep)
 *   ⇒ { ok: boolean, failed: ['selfieImage', ...] }
 */
(function () {
    const ORDER = ['idImage', 'selfieImage', 'profilePhoto', 'vehiclePhoto', 'driverLicense'];
    const LABELS = {
        idImage: 'صورة الهوية',
        selfieImage: 'السيلفي',
        profilePhoto: 'الصورة الشخصية',
        vehiclePhoto: 'صورة وسيلة التوصيل',
        driverLicense: 'رخصة القيادة'
    };
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    async function uploadOne(token, field, file) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const fd = new FormData();
                fd.append(field, file);
                const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = ctrl ? setTimeout(() => ctrl.abort(), 90000) : null;
                const res = await fetch(`${window.API_URL || ''}/api/upload/captain-docs`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: fd,
                    signal: ctrl ? ctrl.signal : undefined
                });
                if (timer) clearTimeout(timer);
                if (res.ok) return { ok: true };
                // 4xx غير المؤقّت (صورة مرفوضة، توكن منتهٍ) لا تنفعه الإعادة
                if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
                    let msg = '';
                    try { msg = (await res.json()).message || ''; } catch (_) {}
                    return { ok: false, status: res.status, message: msg };
                }
            } catch (_) { /* شبكة — نعيد */ }
            if (attempt < 3) await wait(1500 * attempt);
        }
        return { ok: false };
    }

    async function upload(token, files, onStep) {
        const failed = [];
        let lastMessage = '';
        let tokenExpired = false;
        const keys = ORDER.filter(k => files[k]);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (typeof onStep === 'function') onStep(k, i + 1, keys.length);
            const r = await uploadOne(token, k, files[k]);
            if (!r.ok) {
                failed.push(k);
                if (r.message) lastMessage = r.message;
                if (r.status === 401) tokenExpired = true;
            }
        }
        return { ok: failed.length === 0, failed, message: lastMessage, tokenExpired };
    }

    window.CaptainDocs = { upload, LABELS, ORDER };
})();
