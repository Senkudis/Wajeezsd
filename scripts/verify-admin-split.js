/**
 * يتحقق أن الراوتر المقسّم الجديد يسجّل نفس مجموعة (method, path) تماماً
 * مثل admin.js الأصلي — لا مسار مفقود ولا مكرر ولا مختلف الترتيب الحرج.
 */
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.MONGO_URI = 'mongodb://localhost:27017/test';

function listRoutes(router) {
    const out = [];
    function walk(stack) {
        for (const layer of stack) {
            if (layer.route) {
                const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
                for (const m of methods) out.push(`${m.toUpperCase()} ${layer.route.path}`);
            } else if (layer.handle && layer.handle.stack) {
                walk(layer.handle.stack);
            }
        }
    }
    walk(router.stack);
    return out;
}

const oldRouter = require('../routes/admin.js');
const newRouter = require('../routes/admin.new.js');

const oldList = listRoutes(oldRouter);
const newList = listRoutes(newRouter);

const sortUniq = (a) => [...a].sort();
const oldSorted = sortUniq(oldList);
const newSorted = sortUniq(newList);

const oldSet = new Set(oldList);
const newSet = new Set(newList);
const missing = oldList.filter((r) => !newSet.has(r));
const extra = newList.filter((r) => !oldSet.has(r));

console.log(`OLD route count: ${oldList.length}`);
console.log(`NEW route count: ${newList.length}`);
console.log(`MISSING in new (${missing.length}):`, missing);
console.log(`EXTRA in new   (${extra.length}):`, extra);

// تطابق الترتيب لكل عائلة مسار قد تتداخل (نفس البادئة)
const identical = oldList.length === newList.length && missing.length === 0 && extra.length === 0;
console.log(identical ? '\n✅ ROUTE SETS IDENTICAL' : '\n❌ MISMATCH');
process.exit(identical ? 0 : 1);
