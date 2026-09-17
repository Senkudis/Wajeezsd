/**
 * قاعدة بيانات حقيقية للاختبارات.
 *
 * لماذا حقيقية: كل ما يهمّ في الطبقة المالية والمخزنية سلوكُ MongoDB نفسه —
 * الذرّية في `findOneAndUpdate` بشرط، والفهرس الفريد الجزئي الذي يمنع القيد
 * المزدوج، وما يحدث حين يفشل الإدراج بعد أن تغيّر الرصيد. لا شيء من هذا
 * يظهر في اختبارٍ يقرأ نصّ المصدر، ولا في محاكاةٍ نكتبها نحن — فالمحاكاة
 * تُصدّق ما نظنّه، والعطل يسكن في ما لا نظنّه.
 *
 * من أين تأتي القاعدة، بالترتيب:
 *   ١. `TEST_MONGO_URI` إن ضُبط — هذا ما يستعمله CI (خدمة mongo في العامل).
 *   ٢. mongodb-memory-server إن استطاع أن يبدأ.
 *
 * وإن تعذّر الاثنان تُتخطّى المجموعة برسالةٍ صريحة بدل أن تخضرّ كاذبة.
 * ⚠️ لا تصل هذه الاختبارات إلى قاعدة الإنتاج أبداً: `MONGO_URI` لا يُقرأ هنا.
 */
'use strict';

const mongoose = require('mongoose');

let memoryServer = null;
let state = null;

/**
 * يستبدل اسم القاعدة في الـURI باسمٍ فريد لهذا الملف.
 * يُبقي سلسلة الاستعلام كما هي (replicaSet وغيرها تعيش فيها).
 */
function withUniqueDb(uri) {
    const tag = `${process.env.VITEST_WORKER_ID || '0'}_${Date.now().toString(36)}`
        + `_${Math.random().toString(36).slice(2, 8)}`;
    const q = uri.indexOf('?');
    const query = q === -1 ? '' : uri.slice(q);
    const base = q === -1 ? uri : uri.slice(0, q);
    // بعد المضيف: إما اسم قاعدة فيُستبدل، أو لا شيء فيُضاف
    const afterScheme = base.indexOf('://') + 3;
    const slash = base.indexOf('/', afterScheme);
    const host = slash === -1 ? base : base.slice(0, slash);
    return `${host}/wajeez_ci_${tag}${query}`;
}

/** يفتح اتصالاً ويُعيد سبب التعذّر إن تعذّر — لا يرمي. */
async function startMongo() {
    if (state) return state;

    const uri = process.env.TEST_MONGO_URI;
    if (uri && uri.trim()) {
        // 🔴 قاعدةٌ خاصّة بكل ملف اختبار. vitest يشغّل الملفات متوازية،
        //    وكلها تشير إلى TEST_MONGO_URI نفسه — فـ clearMongo في ملفٍ كان
        //    يمسح بيانات ملفٍ آخر في منتصف اختباره، فيسقط بـ 401 «المستخدم
        //    غير موجود» بلا أي خللٍ في الكود المفحوص. العزل هنا لا هناك.
        await mongoose.connect(withUniqueDb(uri), { serverSelectionTimeoutMS: 15000 });
        state = { ok: true, source: 'TEST_MONGO_URI', isolated: true };
        return state;
    }

    try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        memoryServer = await MongoMemoryServer.create();
        await mongoose.connect(memoryServer.getUri(), { serverSelectionTimeoutMS: 15000 });
        state = { ok: true, source: 'mongodb-memory-server' };
        return state;
    } catch (err) {
        state = {
            ok: false,
            reason: `لا قاعدة بيانات للاختبار: اضبط TEST_MONGO_URI أو أتِح تنزيل mongod (${err.message})`
        };
        return state;
    }
}

async function stopMongo() {
    // القاعدة المؤقّتة تُسقَط، وإلا تراكمت قاعدةٌ لكل ملفٍ في كل بناء
    if (state && state.isolated && mongoose.connection.readyState === 1) {
        await mongoose.connection.dropDatabase().catch(() => {});
    }
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    if (memoryServer) { await memoryServer.stop(); memoryServer = null; }
    state = null;
}

/** بين كل اختبارٍ وآخر: قاعدةٌ نظيفة، فلا يورّث اختبارٌ حالته لمن بعده. */
async function clearMongo() {
    const cols = await mongoose.connection.db.collections();
    await Promise.all(cols.map(c => c.deleteMany({})));
}

/**
 * الفهارس تُبنى كسولاً في mongoose، والفهرس الفريد الذي يمنع القيد المزدوج
 * لا يوجد حتى يُبنى — فاختبارٌ يعتمد عليه ينجح كذباً إن لم يُنتظر بناؤه.
 */
async function syncIndexes(...models) {
    for (const m of models) await m.syncIndexes();
}

/**
 * التخطّي الصامت هو العطل الذي تحرس منه هذه الاختبارات نفسها: مجموعةٌ
 * خضراء لم تُشغَّل. في CI لا يُسمح به — إن غابت القاعدة، يسقط البناء.
 */
function assertRanInCI(state) {
    if (process.env.CI && !(state && state.ok)) {
        throw new Error(
            'CI بلا قاعدة بيانات — اختبارات القاعدة تُخطّت صامتةً. '
            + 'اضبط TEST_MONGO_URI في سير العمل. ' + ((state && state.reason) || '')
        );
    }
}

module.exports = { startMongo, stopMongo, clearMongo, syncIndexes, assertRanInCI };
