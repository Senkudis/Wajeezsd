/**
 * asyncHandler — يلف أي route handler غير متزامن (async) ويمرر أي خطأ
 * تلقائياً إلى الـ error middleware المركزي عبر next(err).
 *
 * بدلاً من تكرار try/catch في كل endpoint:
 *
 *   router.get('/x', asyncHandler(async (req, res) => { ... }));
 *
 * أي throw أو promise rejection داخل الـ handler يُلتقط ويُمرَّر لـ errorHandler.
 */
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
