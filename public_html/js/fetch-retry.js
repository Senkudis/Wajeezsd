/**
 * 🌐 fetchWithRetry — Utility for resilient API calls on unstable mobile networks
 *
 * Usage:
 *   const data = await fetchWithRetry(url, options);
 *
 * Features:
 *   - Checks navigator.onLine before attempting
 *   - Retries up to `retries` times with a delay on network/server errors
 *   - Throws a user-friendly Arabic error for "Failed to fetch" scenarios
 */

const FETCH_RETRY_DELAY_MS = 1500; // 1.5 seconds between retries

/**
 * @param {string} url - The API endpoint
 * @param {RequestInit} options - Standard fetch() options (method, headers, body…)
 * @param {number} retries - Maximum number of attempts (default: 3)
 * @returns {Promise<Response>} - Resolves with the successful Response
 * @throws {Error} - Throws after all retries fail, or if offline
 */
async function fetchWithRetry(url, options = {}, retries = 3) {
    // 📡 التحقق من الاتصال قبل المحاولة
    if (!navigator.onLine) {
        const offlineErr = new Error('OFFLINE');
        offlineErr.isNetworkError = true;
        throw offlineErr;
    }

    // 🔒 لا نُعيد المحاولة على طلبات POST/PUT/PATCH/DELETE
    // (لتجنب تكرار إنشاء أو تعديل البيانات)
    const method = (options.method || 'GET').toUpperCase();
    const isSafeMethod = method === 'GET' || method === 'HEAD';
    if (!isSafeMethod) {
        // طلب مباشر بدون retry للطلبات التي تُعدّل البيانات
        try {
            return await fetch(url, options);
        } catch (err) {
            err.isNetworkError = true;
            throw err;
        }
    }

    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, options);

            // ✅ النجاح: إرجاع الـ response مباشرة
            // (يمكن للمستدعي التحقق من res.ok بنفسه)
            return response;

        } catch (err) {
            lastError = err;
            lastError.isNetworkError = true;

            const isLastAttempt = attempt === retries;

            if (isLastAttempt) {
                console.error(`[fetchWithRetry] All ${retries} attempts failed for: ${url}`, err);
                break;
            }

            console.warn(`[fetchWithRetry] Attempt ${attempt}/${retries} failed. Retrying in ${FETCH_RETRY_DELAY_MS}ms…`, err.message);
            await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_DELAY_MS));

            // إعادة التحقق من الاتصال قبل كل محاولة جديدة
            if (!navigator.onLine) {
                lastError = new Error('OFFLINE');
                lastError.isNetworkError = true;
                break;
            }
        }
    }

    throw lastError;
}

/**
 * 📢 showNetworkError — عرض رسالة خطأ الشبكة للمستخدم
 * تتحقق من نوع الخطأ وتعرض الرسالة المناسبة بدل "Failed to fetch"
 *
 * @param {Error} err - الخطأ المُعاد من fetchWithRetry
 * @param {Function} [alertFn] - دالة العرض (Swal.fire أو alert افتراضياً)
 */
function showNetworkError(err, alertFn) {
    const isNetwork = err.isNetworkError ||
        (err.message && (
            err.message.includes('Failed to fetch') ||
            err.message.includes('NetworkError') ||
            err.message === 'OFFLINE'
        ));

    const arabicMessage = isNetwork
        ? 'عفواً، يوجد ضعف في شبكة الإنترنت أو تأخر في استجابة الخادم. يرجى تحديث الصفحة.'
        : (err.message || 'حدث خطأ غير متوقع. يرجى المحاولة مجدداً.');

    if (alertFn) {
        alertFn(arabicMessage);
    } else if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'warning',
            title: '⚠️ مشكلة في الاتصال',
            text: arabicMessage,
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#04553A'
        });
    } else {
        alert(arabicMessage);
    }
}

// تصدير للنطاق العام حتى تستخدمها جميع الصفحات
window.fetchWithRetry = fetchWithRetry;
window.showNetworkError = showNetworkError;

/**
 * 🛡️ Global Safety Net
 * يمسك أي خطأ شبكة (Failed to fetch) لم يُعالج بـ catch في أي صفحة،
 * ويعرض رسالة عربية ودية بدلاً من تعطل الصفحة بدون أي رسالة للمستخدم.
 */
window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const isNetworkErr = reason && (
        reason.isNetworkError ||
        (reason.message && (
            reason.message.includes('Failed to fetch') ||
            reason.message.includes('NetworkError') ||
            reason.message === 'OFFLINE'
        ))
    );

    if (isNetworkErr) {
        // منع الخطأ من الظهور في الـ console كـ Unhandled rejection
        event.preventDefault();
        console.warn('[fetchWithRetry] Unhandled network error caught globally:', reason.message);

        // عرض رسالة ودية بدل تجميد الصفحة
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: '⚠️ مشكلة في الاتصال',
                text: 'عفواً، يوجد ضعف في شبكة الإنترنت أو تأخر في استجابة الخادم. يرجى تحديث الصفحة.',
                confirmButtonText: 'حسناً',
                confirmButtonColor: '#04553A'
            });
        }
    }
});
