/**
 * 📱 إعدادات التحديث لكل منصّة — utils/appConfig.js
 *
 * أندرويد 1.6.2 والآيفون 1.6.1 في وقتٍ واحد. رقمٌ واحد للمنصّتين كان يجعل
 * مستخدمي الآيفون «قدامى» فيعلقون في التحديث الإجباري، وزرّ التحديث يفتح
 * جوجل بلاي على الآيفون.
 */
const fs = require('fs');
const path = require('path');
const { detectPlatform, buildAppConfig, isValidVersion } = require('../utils/appConfig');

const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-A145F Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36';

const SETTINGS = {
    appVersion: '1.6.2', minVersion: '1.6.0',
    iosAppVersion: '1.6.1', iosMinVersion: '1.5.0',
    playStoreLink: 'https://play.google.com/store/apps/details?id=com.wajeezsd.app',
    appStoreLink: 'https://apps.apple.com/app/id6807840888',
    forceUpdate: false
};

// نسخة من منطق AppCore.checkForUpdates — للتحقّق من النتيجة النهائية للمستخدم
const cmp = (v1, v2) => {
    const a = v1.split('.').map(Number), b = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if ((a[i] || 0) > (b[i] || 0)) return 1;
        if ((a[i] || 0) < (b[i] || 0)) return -1;
    }
    return 0;
};
function decide(current, data) {
    const latest = data.appVersion;
    if (!current || !latest) return 'none';
    const min = data.minVersion || latest;
    if (!(cmp(latest, current) > 0)) return 'none';
    return (data.forceUpdate || cmp(min, current) > 0) ? 'forced' : 'optional';
}

describe('المنصّة', () => {
    it('الصريحة أولاً، وإلا من بصمة المتصفّح', () => {
        expect(detectPlatform({ platform: 'ios' }, ANDROID_UA)).toBe('ios');
        expect(detectPlatform({}, IOS_UA)).toBe('ios');
        expect(detectPlatform({}, ANDROID_UA)).toBe('android');
        expect(detectPlatform({ platform: 'web' }, '')).toBe('android');
    });
});

describe('لكل منصّة أرقامها ومتجرها', () => {
    it('الآيفون: أرقام الآيفون، ورابط App Store حتى في حقل النسخ القديمة', () => {
        const c = buildAppConfig(SETTINGS, 'ios');
        expect(c).toMatchObject({ appVersion: '1.6.1', minVersion: '1.5.0' });
        expect(c.storeLink).toContain('apps.apple.com');
        expect(c.playStoreLink).toContain('apps.apple.com');   // النسخ المثبّتة تفتح هذا
    });

    it('أندرويد كما كان', () => {
        const c = buildAppConfig(SETTINGS, 'android');
        expect(c).toMatchObject({ appVersion: '1.6.2', minVersion: '1.6.0' });
        expect(c.storeLink).toContain('play.google.com');
    });

    it('🔑 إصدار الآيفون غير مضبوط ⇒ لا تنبيه — لا احتياط برقم أندرويد', () => {
        const c = buildAppConfig({ ...SETTINGS, iosAppVersion: '', iosMinVersion: '', forceUpdate: true }, 'ios');
        expect(c.appVersion).toBeNull();
        expect(c.forceUpdate).toBe(false);
        expect(decide('1.6.1', c)).toBe('none');
    });
});

describe('ما يراه المستخدم', () => {
    const ios = buildAppConfig(SETTINGS, 'ios');
    const android = buildAppConfig(SETTINGS, 'android');

    it('🔑 آيفون 1.6.1 وأندرويد على 1.6.2 ⇒ الآيفون لا يُطالَب بشيء', () => {
        expect(decide('1.6.1', ios)).toBe('none');
    });

    it('🔑 إصدارٌ أعلى من الحدّ الأدنى يعمل عادياً — تحديثٌ اختياري فقط', () => {
        expect(decide('1.6.1', android)).toBe('optional');   // أعلى من 1.6.0
        expect(decide('1.6.2', android)).toBe('none');       // الأحدث
        expect(decide('1.7.0', android)).toBe('none');       // أعلى من المنشور
    });

    it('ما دون الحدّ الأدنى ⇒ إجباري', () => {
        expect(decide('1.5.9', android)).toBe('forced');
        expect(decide('1.4.3', ios)).toBe('forced');
    });

    it('مفتاح «تحديث إجباري» يُجبر كل من دون الأحدث — لا من فوقه', () => {
        const forced = buildAppConfig({ ...SETTINGS, forceUpdate: true }, 'android');
        expect(decide('1.6.1', forced)).toBe('forced');
        expect(decide('1.6.2', forced)).toBe('none');
        expect(decide('1.7.0', forced)).toBe('none');
    });
});

describe('صيغة الإصدار', () => {
    it('x.y.z مقبولة، وما سواها مرفوض', () => {
        for (const v of ['1.6.2', '1.6', '10.0.12']) expect(isValidVersion(v), v).toBe(true);
        for (const v of ['v1.6', '1.6.2.1', '1.a.2', '', ' ']) expect(isValidVersion(v), v).toBe(false);
        expect(isValidVersion('', { allowEmpty: true })).toBe(true);
    });
});

describe('التطبيق يرسل منصّته ويفتح متجرها', () => {
    const core = fs.readFileSync(path.join(__dirname, '..', 'public_html', 'js', 'app-core.js'), 'utf8');
    it('?platform= ورابط المتجر من storeLink', () => {
        expect(core).toContain('/api/auth/app-config?platform=');
        expect(core).toContain('window.location.href = storeLink;');
        expect(core).not.toContain("window.location.href = data.playStoreLink");
    });
});
