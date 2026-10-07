/**
 * Unit tests — utils/captainDispatch: موجات سداسية (H3) من الأقرب للأبعد.
 *
 * يحرس: ترتيب الحلقات، وأن البعيد لا يُشعَر قبل القريب، وأن الوصول للكل
 * مضمون (آخر موجة = البقية)، وأن الموجات تتوقّف لحظة قبول الطلب.
 */
const h3 = require('h3-js');
const { planHexWaves, dispatchInHexWaves, H3_RES, WAVE_GAP_MS } = require('../utils/captainDispatch');

const PICKUP = { lat: 15.5007, lng: 32.5599 }; // الخرطوم
const NOW = Date.parse('2026-10-07T12:00:00Z');
const fresh = (lat, lng) => ({ lat, lng, fixedAt: new Date(NOW - 60 * 1000) });

const c0    = { fcmToken: 'same',  currentLocation: fresh(15.5010, 32.5602) };  // نفس الخليّة تقريباً
const cMid  = { fcmToken: 'mid',   currentLocation: fresh(15.5300, 32.5900) };  // ≈ 4.4 كم
const cFar  = { fcmToken: 'far',   currentLocation: fresh(15.6500, 32.7000) };  // ≈ 22 كم
const noLoc = { fcmToken: 'noloc' };

const ringOf = (p) => h3.gridDistance(h3.latLngToCell(PICKUP.lat, PICKUP.lng, H3_RES), h3.latLngToCell(p.lat, p.lng, H3_RES));

describe('planHexWaves', () => {
    it('الدقّة 8 والحلقة ≈ كيلومتر — الكابتن على 4.4كم في الحلقة 4–6', () => {
        const r = ringOf(cMid.currentLocation);
        expect(r).toBeGreaterThanOrEqual(4);
        expect(r).toBeLessThanOrEqual(6);
    });

    it('الأقرب في أول موجة، والأبعد ومن بلا موقع في آخرها', () => {
        const waves = planHexWaves([cFar, noLoc, cMid, c0], PICKUP, { now: NOW });
        expect(waves.map(w => w.tokens)).toEqual([['same'], ['mid'], ['far', 'noloc']]);
        expect(waves[0].rings).toEqual([0, 1]);
        expect(waves[waves.length - 1].rings).toBeNull();
    });

    it('الحلقات الفارغة تُطوى — لا موجة فارغة ينتظرها أحد', () => {
        const waves = planHexWaves([cMid, cFar], PICKUP, { now: NOW });
        expect(waves.every(w => w.tokens.length > 0)).toBe(true);
        expect(waves[0].tokens).toEqual(['mid']);
    });

    it('كل كابتن مرة واحدة — والوصول للكل مضمون', () => {
        const all = [c0, cMid, cFar, noLoc];
        const tokens = planHexWaves(all, PICKUP, { now: NOW }).flatMap(w => w.tokens);
        expect(tokens.sort()).toEqual(['far', 'mid', 'noloc', 'same']);
    });

    it('توكن مكرّر (جهاز واحد) يُحسب بأقرب موقع', () => {
        const dupFar = { fcmToken: 'same', currentLocation: cFar.currentLocation };
        const waves = planHexWaves([dupFar, c0], PICKUP, { now: NOW });
        expect(waves).toHaveLength(1);
        expect(waves[0].tokens).toEqual(['same']);
    });

    it('موقعٌ أقدم من 30 دقيقة لا يجعل صاحبه «الأقرب»', () => {
        const stale = { fcmToken: 'stale', currentLocation: { lat: 15.5010, lng: 32.5602, fixedAt: new Date(NOW - 2 * 3600 * 1000) } };
        const waves = planHexWaves([stale, cMid], PICKUP, { now: NOW });
        expect(waves[0].tokens).toEqual(['mid']);
        expect(waves[waves.length - 1].tokens).toContain('stale');
    });

    it('بلا إحداثيات استلام ⇒ الكل في موجة واحدة (لا ترتيب ممكن، لا ضياع)', () => {
        const waves = planHexWaves([c0, cMid, cFar], {}, { now: NOW });
        expect(waves).toHaveLength(1);
        expect(waves[0].tokens).toHaveLength(3);
    });

    it('(0,0) ليس موقعاً — يُعامَل كمجهول', () => {
        const zero = { fcmToken: 'zero', currentLocation: { lat: 0, lng: 0, fixedAt: new Date(NOW) } };
        const waves = planHexWaves([zero, c0], PICKUP, { now: NOW });
        expect(waves[0].tokens).toEqual(['same']);
    });

    it('مدخلات فارغة', () => {
        expect(planHexWaves([], PICKUP)).toEqual([]);
        expect(planHexWaves(null, PICKUP)).toEqual([]);
        expect(planHexWaves([{ currentLocation: PICKUP }], PICKUP)).toEqual([]);
    });
});

describe('dispatchInHexWaves', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
    afterEach(() => { vi.useRealTimers(); });

    const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

    it('الأولى فوراً، والتالية كل فاصل — ثم علامة «بُثّ للكل»', async () => {
        const sent = [];
        const onAll = vi.fn(async () => {});
        const res = await dispatchInHexWaves({
            captains: [cFar, cMid, c0],
            pickup: PICKUP,
            send: async (t) => { sent.push(t); return { success: t.length }; },
            stillPending: async () => true,
            onAllDispatched: onAll
        });
        expect(res).toEqual({ waves: 3, first: 1 });
        expect(sent).toEqual([['same']]);

        await vi.advanceTimersByTimeAsync(WAVE_GAP_MS - 1);
        expect(sent).toHaveLength(1);           // البعيد لا يسبق الفاصل
        await vi.advanceTimersByTimeAsync(1);
        await flush();
        expect(sent).toEqual([['same'], ['mid']]);
        expect(onAll).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(WAVE_GAP_MS);
        await flush();
        expect(sent).toEqual([['same'], ['mid'], ['far']]);
        expect(onAll).toHaveBeenCalledTimes(1);
    });

    it('قُبل الطلب ⇒ تتوقّف الموجات ولا يُزعج البعيد', async () => {
        const sent = [];
        let pending = true;
        await dispatchInHexWaves({
            captains: [cFar, cMid, c0],
            pickup: PICKUP,
            send: async (t) => { sent.push(t); return {}; },
            stillPending: async () => pending
        });
        pending = false;    // الأقرب قبل خلال الفاصل
        await vi.advanceTimersByTimeAsync(WAVE_GAP_MS * 5);
        await flush();
        expect(sent).toEqual([['same']]);
    });

    it('موجة واحدة ⇒ العلامة فوراً', async () => {
        const onAll = vi.fn(async () => {});
        await dispatchInHexWaves({
            captains: [c0], pickup: PICKUP,
            send: async () => ({}), stillPending: async () => true, onAllDispatched: onAll
        });
        expect(onAll).toHaveBeenCalledTimes(1);
    });

    it('بلا كباتن ⇒ لا إرسال', async () => {
        const send = vi.fn();
        const res = await dispatchInHexWaves({ captains: [], pickup: PICKUP, send, stillPending: async () => true });
        expect(res).toEqual({ waves: 0, first: 0 });
        expect(send).not.toHaveBeenCalled();
    });
});
