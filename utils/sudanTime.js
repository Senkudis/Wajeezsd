/**
 * 🕑 توقيت السودان — مصدرٌ واحد لحدود «اليوم» في كل الإحصاءات.
 *
 * السودان على UTC+2 (Africa/Khartoum) منذ 1 نوفمبر 2017، بلا توقيت صيفي.
 * كان الرقم «+3» مكتوباً يدوياً في خمسة مواضع (DailyStat، PlaceSearchStat،
 * تقارير التاجر، إحصاءات البحث، التحليلات)، فيبدأ «اليوم» الساعة 11 مساءً
 * من الليلة السابقة — وتظهر أرقام «اليوم» قبل أن يبدأ. وإحصاءات النطاق كانت
 * تعدّ «اليوم» آخر 24 ساعة وتجمّع الأيام بتوقيت غرينتش.
 */
const TZ = 'Africa/Khartoum';
const OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** بداية اليوم السوداني الذي يقع فيه `d` — كلحظة UTC */
function startOfSudanDay(d = new Date()) {
    const local = new Date(d.getTime() + OFFSET_MS);
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_MS);
}

/** مفتاح اليوم 'YYYY-MM-DD' بتوقيت السودان */
function sudanDayKey(d = new Date()) {
    return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** مفاتيح كل الأيام من `from` حتى `to` (شاملةً) — لسلاسلٍ بلا فجوات */
function sudanDayKeys(from, to = new Date()) {
    const keys = [];
    for (let t = startOfSudanDay(from).getTime(); t <= to.getTime(); t += DAY_MS) keys.push(sudanDayKey(new Date(t)));
    return keys;
}

module.exports = { TZ, OFFSET_MS, DAY_MS, startOfSudanDay, sudanDayKey, sudanDayKeys };
