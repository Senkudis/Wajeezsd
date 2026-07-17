/**
 * مُحلّل استعلام آمن ضد NoSQL injection.
 *
 * في Express 5 صار req.query getter يُرجع كائناً جديداً في كل قراءة، فتعقيمه
 * بعد القراءة (delete) يقع على نسخة تُرمى. الحل الصحيح هو التعقيم عند التحليل:
 * نبني كائن الاستعلام بأنفسنا ونجرّد أي مفتاح عامل Mongo (يبدأ بـ $).
 *
 * المُحلّل البسيط (querystring) يُنتج قيَماً نصية مسطّحة لا كائنات، فالخطر الوحيد
 * هو مفتاح علوي مثل ?$ne=1 أو ?$where=... — وهذا ما نجرّده.
 */
const querystring = require('querystring');

function parseSafeQuery(str) {
    const parsed = querystring.parse(str);
    for (const key of Object.keys(parsed)) {
        if (key.startsWith('$')) delete parsed[key];
    }
    return parsed;
}

module.exports = { parseSafeQuery };
