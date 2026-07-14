import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { optimizeStops, haversineKm } = require('../utils/routeOptimizer');

// نقاط حقيقية متباعدة في الخرطوم — تكفي لجعل الترتيب السيئ مكلفاً بوضوح
const P = (type, lat, lng, done = false) => ({ type, lat, lng, done, address: `${type} ${lat},${lng}` });

describe('haversineKm', () => {
    it('يحسب مسافة معقولة بين نقطتين معلومتين', () => {
        // الخرطوم → أم درمان ≈ 8–12 كم
        const d = haversineKm({ lat: 15.5007, lng: 32.5599 }, { lat: 15.6445, lng: 32.4777 });
        expect(d).toBeGreaterThan(8);
        expect(d).toBeLessThan(20);
    });
});

describe('optimizeStops', () => {
    const origin = { lat: 15.50, lng: 32.50 };

    it('يضع كل الاستلامات قبل أي تسليم مهما كان الترتيب المدخل', () => {
        const stops = [
            P('dropoff', 15.60, 32.60),
            P('pickup',  15.51, 32.51),
            P('dropoff', 15.55, 32.55),
            P('pickup',  15.52, 32.52)
        ];
        const { order } = optimizeStops(stops, origin);
        const types = order.map(i => stops[i].type);

        const lastPickup = types.lastIndexOf('pickup');
        const firstDropoff = types.indexOf('dropoff');
        expect(lastPickup).toBeLessThan(firstDropoff);
    });

    it('يعيد ترتيباً أقصر عندما يكون المدخل متعرّجاً', () => {
        // ترتيب متعرّج عمداً: يقفز بعيداً ثم يرجع
        const stops = [
            P('pickup',  15.70, 32.70),   // بعيدة
            P('pickup',  15.51, 32.51),   // قريبة جداً من الكابتن
            P('dropoff', 15.75, 32.75),
            P('dropoff', 15.72, 32.72)
        ];
        const r = optimizeStops(stops, origin);

        expect(r.changed).toBe(true);
        expect(r.optimizedKm).toBeLessThan(r.currentKm);
        expect(r.savedKm).toBeGreaterThan(0);
        // يجب أن يبدأ بأقرب استلام للكابتن لا بالأبعد
        expect(stops[r.order[0]].lat).toBeCloseTo(15.51, 2);
    });

    it('لا يحرّك المحطات المكتملة ويُبقيها في المقدمة', () => {
        const stops = [
            P('pickup',  15.51, 32.51, true),   // تمّت
            P('pickup',  15.70, 32.70, true),   // تمّت
            P('dropoff', 15.75, 32.75),
            P('dropoff', 15.52, 32.52)
        ];
        const { order } = optimizeStops(stops, origin);

        expect(order.slice(0, 2)).toEqual([0, 1]);          // المكتملتان بمواضعهما وترتيبهما
        expect(order.slice(2).sort()).toEqual([2, 3]);      // غير المكتملتين فقط أُعيد ترتيبهما
    });

    it('يُرجع كل الفهارس مرة واحدة بالضبط (لا فقدان ولا تكرار)', () => {
        const stops = [
            P('pickup',  15.51, 32.51),
            P('pickup',  15.62, 32.62),
            P('pickup',  15.55, 32.44),
            P('dropoff', 15.75, 32.75),
            P('dropoff', 15.52, 32.52),
            P('dropoff', 15.68, 32.31)
        ];
        const { order } = optimizeStops(stops, origin);
        expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('لا يقترح تغييراً عندما يكون الترتيب الحالي هو الأمثل أصلاً', () => {
        const stops = [
            P('pickup',  15.51, 32.51),
            P('pickup',  15.52, 32.52),
            P('dropoff', 15.53, 32.53),
            P('dropoff', 15.54, 32.54)
        ];
        const r = optimizeStops(stops, origin);
        expect(r.changed).toBe(false);
        expect(r.savedKm).toBe(0);
    });

    it('يرفض المحطات بلا إحداثيات بدل أن يخترع مساراً', () => {
        const stops = [
            P('pickup', 15.51, 32.51),
            { type: 'dropoff', address: 'بلا إحداثيات', done: false }
        ];
        expect(() => optimizeStops(stops, origin)).toThrow(/إحداثيات/);
    });

    it('يرفض نقطة انطلاق غير صالحة', () => {
        const stops = [P('pickup', 15.51, 32.51), P('dropoff', 15.52, 32.52)];
        expect(() => optimizeStops(stops, { lat: NaN, lng: 32.5 })).toThrow(/الانطلاق/);
    });
});
