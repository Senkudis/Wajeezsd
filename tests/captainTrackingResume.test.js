/**
 * تتبّع الكابتن: لماذا كان يتوقّف والتطبيق مفتوح، وكيف أُصلح (أكتوبر 2026).
 *
 *   ١) captain-service.js كان في لوحة الكابتن وحدها — صفحات التطبيق مستقلّة
 *      فيموت الإرسال حين ينتقل للطلبات أو المهام. الآن في كل صفحات الكابتن،
 *      ويستأنف التتبّع إن كانت الوردية قائمة.
 *   ٢) distanceFilter: 10 = setSmallestDisplacement — الواقف بلا قراءات.
 *   ٣) القراءة القديمة (stale) وتقدير البرج (دقّة كيلومترات) يُرفضان.
 *   ٤) أخطاء الإذن/الموقع المقفول تُعرض بنافذةٍ تفتح مكان الحلّ.
 */
import { describe, it, expect, beforeEach } from 'vitest';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('public_html/js/captain-service.js');

/** يحمّل الخدمة في سياقٍ معزول بنافذةٍ مزيّفة — يُرجع { CS, win, store, calls } */
function load({ native = true, store = {}, bg = true } = {}) {
    const calls = { add: [], remove: [], http: [] };
    let wid = 0;
    const BackgroundGeolocation = {
        addWatcher: async (opts, cb) => { calls.add.push(opts); return 'w' + (++wid); },
        removeWatcher: async ({ id }) => { calls.remove.push(id); },
        openSettings: () => {}
    };
    const win = {
        Capacitor: {
            isNativePlatform: () => native,
            Plugins: {
                ...(bg ? { BackgroundGeolocation } : {}),
                App: { addListener: () => {} },
                CapacitorHttp: { request: (r) => { calls.http.push(r); return Promise.resolve(); } }
            }
        },
        addEventListener: () => {}
    };
    const localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
    };
    const ctx = {
        window: win, localStorage, navigator: { onLine: true }, console: { log() {}, warn() {}, error() {} },
        document: { getElementById: () => null, createElement: () => ({ setAttribute() {}, querySelector: () => ({}) }), head: { appendChild() {} } },
        setTimeout: () => 0, setInterval: () => 1, clearInterval: () => {}, Date, Math, JSON, Number, String, Promise, Buffer,
        API_URL: 'https://wajeezsd.com', module: undefined
    };
    win.window = win;
    vm.runInNewContext(SRC, ctx);
    return { CS: win.CaptainService, win, store, calls };
}

describe('التتبّع في كل صفحات الكابتن', () => {
    it.each(['captain-orders', 'captain-missions', 'captain-notifications', 'captain-wallet',
        'captain-history', 'captain-analytics', 'captain-profile', 'captain-dashboard'])('%s يحمّل الخدمة', (p) => {
        expect(read(`public_html/${p}.html`)).toMatch(/<script type="module" src="js\/captain-service\.js/);
    });

    it('يستأنف إن كانت الوردية قائمة — ويزيل مراقب الصفحة السابقة أولاً', async () => {
        const { calls, store } = load({ store: {
            captain_on_shift: '1', token: 't', userId: 'u1',
            user: JSON.stringify({ _id: 'u1', role: 'captain' }), bg_watcher_id: 'old'
        } });
        await new Promise(r => setImmediate(r));
        expect(calls.remove).toContain('old');
        expect(calls.add.length).toBe(1);
        expect(store.bg_watcher_id).toBe('w1');
    });

    it('لا يستأنف بلا وردية، ولا لغير الكابتن', async () => {
        const a = load({ store: { token: 't', user: JSON.stringify({ _id: 'u1', role: 'captain' }) } });
        const b = load({ store: { captain_on_shift: '1', token: 't', user: JSON.stringify({ _id: 'u1', role: 'client' }) } });
        await new Promise(r => setImmediate(r));
        expect(a.calls.add.length).toBe(0);
        expect(b.calls.add.length).toBe(0);
    });

    it('البدء مرّتين في الصفحة نفسها لا يكرّر المراقب، والإيقاف يمسح الوردية', async () => {
        const { CS, calls, store } = load({ store: { token: 't' } });
        await CS.startTracking('u1');
        await CS.startTracking('u1');
        expect(calls.add.length).toBe(1);
        expect(store.captain_on_shift).toBe('1');
        await CS.stopTracking();
        expect(store.captain_on_shift).toBeUndefined();
        expect(store.bg_watcher_id).toBeUndefined();
        expect(calls.remove).toContain('w1');
    });

    it('الإضافة تسلّم القراءات للواقف أيضاً (distanceFilter: 0)', async () => {
        const { CS, calls } = load({ store: { token: 't' } });
        await CS.startTracking('u1');
        expect(calls.add[0].distanceFilter).toBe(0);
    });
});

describe('رفض القراءات المضلِّلة', () => {
    let CS;
    beforeEach(() => { ({ CS } = load({ native: false })); });

    it('قراءةٌ قديمة (آخر موقعٍ معروف من أمس) تُرفض', () => {
        expect(CS._acceptFix(15.64, 32.48, 10, Date.now() - 3 * 60 * 1000)).toBe(false);
        expect(CS._acceptFix(15.6, 32.53, 10, Date.now() - 5000)).toBe(true);
    });

    it('تقدير البرج (دقّة أسوأ من ١٫٥ كم) يُرفض', () => {
        expect(CS._acceptFix(15.64, 32.48, 3000, Date.now())).toBe(false);
    });

    it('الدقّة المتوسّطة تُرفض إن سبقتها قراءةٌ جيدة حديثة', () => {
        expect(CS._acceptFix(15.6, 32.53, 12, Date.now())).toBe(true);
        expect(CS._acceptFix(15.61, 32.53, 600, Date.now())).toBe(false);
    });

    it('إحداثياتٌ ليست أرقاماً تُرفض', () => {
        expect(CS._acceptFix(NaN, 32.5, 10, Date.now())).toBe(false);
    });
});

describe('نافذة مشاكل الموقع', () => {
    it('لكل مشكلةٍ نصٌّ وزرٌّ يفتح مكان حلّها', () => {
        const { CS } = load();
        for (const k of ['gps_off', 'permission', 'battery', 'stale']) {
            const spec = CS._problemSpec(k);
            expect(spec.title).toBeTruthy();
            expect(typeof spec.go.run).toBe('function');
        }
        expect(CS._problemSpec('nope')).toBe(null);
    });

    it('خطأ الإضافة يفرّق بين الموقع المقفول والإذن المرفوض', () => {
        expect(SRC).toMatch(/const off = \/disabled\/i\.test\(error\.message \|\| ''\);/);
        expect(SRC).toContain("CaptainService.showLocationProblem(off ? 'gps_off' : 'permission')");
    });

    it('الجسر الأصلي يفتح شاشة الموقع والتطبيق والبطارية والتشغيل التلقائي', () => {
        const java = read('android/app/src/main/java/com/wajeezsd/app/MainActivity.java');
        for (const fn of ['isLocationEnabled', 'openLocationSettings', 'isIgnoringBatteryOptimizations', 'openAppSettings', 'openAutoStartSettings']) {
            expect(java).toMatch(new RegExp(`@JavascriptInterface\\s+public \\w+ ${fn}\\(`));
        }
        expect(java).toContain('ACTION_LOCATION_SOURCE_SETTINGS');
    });
});
