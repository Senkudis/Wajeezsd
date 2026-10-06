/**
 * 📡 غرف الإدارة في السوكت — كلٌّ يسمع مدنه وحدها.
 *
 * كانت غرفةً واحدة (admin_room) يدخلها كل أدمن، فالإداري المعيَّن على
 * عطبرة يرى لحظياً مواقع كباتن الخرطوم ونجداتهم وشكاوى عملائها وطلباتها —
 * وإن كانت مساراته (HTTP) محصورةً في مدنه. التقييد الذي يُطبَّق على
 * الطلب ويُنسى في البثّ ليس تقييداً.
 *
 *   admin_room          ← الإداري الأكبر وحده: يسمع كل شيء
 *   admin_city_<City>   ← الإداري والموظف: غرفة لكل مدينةٍ من مدنه
 *
 * البثّ: toAdmins(io, city) يصل الأكبر + من يغطي تلك المدينة. حدثٌ بلا
 * مدينةٍ صالحة يصل الأكبر وحده — الافتراض الآمن.
 */
const { CITY_KEYS } = require('../config/cities');

const SUPER_ROOM = 'admin_room';
const cityRoom = (city) => `admin_city_${city}`;

const isSuperIdentity = (u) => !!u && u.role === 'admin' && (!u.adminRole || u.adminRole === 'super_admin');

/** الغرف التي يدخلها هذا الأدمن — مصدرها حسابه في القاعدة لا ما يرسله */
function adminRoomsFor(user) {
    if (!user || user.role !== 'admin') return [];
    if (isSuperIdentity(user)) return [SUPER_ROOM];
    const mine = (Array.isArray(user.cities) ? user.cities : []).filter(c => CITY_KEYS.includes(c));
    const cities = mine.length ? mine : (CITY_KEYS.includes(user.city) ? [user.city] : []);
    return cities.map(cityRoom);
}

/** بثٌّ لمن يشرف على هذه المدينة (والأكبر دائماً) */
function toAdmins(io, city) {
    return CITY_KEYS.includes(city) ? io.to([SUPER_ROOM, cityRoom(city)]) : io.to(SUPER_ROOM);
}

/** بثٌّ لكل الإدارة — لأحداثٍ لا مدينة لها (عطل نظام، بلاغ عام) */
function toAllAdmins(io) {
    return io.to([SUPER_ROOM, ...CITY_KEYS.map(cityRoom)]);
}

module.exports = { SUPER_ROOM, cityRoom, adminRoomsFor, toAdmins, toAllAdmins };
