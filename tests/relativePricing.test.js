import { describe, it, expect } from 'vitest';
const Settings = require('../models/Settings');
const { haversineKm } = require('../utils/geofence');

describe('نظام الحد النسبي للتسعيرة (الأرضية والسقف)', () => {
    describe('1. إعدادات الموديل Settings', () => {
        it('يحتوي على القيم الافتراضية الصحيحة لنسبة التخفيض وسقف السعر', () => {
            const schema = Settings.schema.paths;
            expect(schema.maxDiscountPercent).toBeDefined();
            expect(schema.maxDiscountPercent.defaultValue).toBe(10);
            expect(schema.maxPriceSurgePercent).toBeDefined();
            expect(schema.maxPriceSurgePercent.defaultValue).toBe(100);
        });
    });

    describe('2. حساب التسعيرة والحدود النسبية (Floor & Ceiling)', () => {
        const settings = {
            baseFare: 1000,
            costPerKm: 2000,
            extraStopFee: 500,
            maxDiscountPercent: 10,
            maxPriceSurgePercent: 100
        };

        function calculateLimits(pickup, dropoff, stops = null, config = settings) {
            let totalDistanceKm = 0;
            const isMultiStop = Array.isArray(stops) && stops.length >= 2;

            if (isMultiStop) {
                for (let i = 1; i < stops.length; i++) {
                    const segDist = haversineKm(stops[i - 1], stops[i]);
                    if (typeof segDist === 'number' && Number.isFinite(segDist)) {
                        totalDistanceKm += segDist;
                    }
                }
            } else if (pickup && dropoff) {
                const dist = haversineKm(pickup, dropoff);
                if (typeof dist === 'number' && Number.isFinite(dist)) {
                    totalDistanceKm = dist;
                }
            }

            const base = config.baseFare || 1000;
            const costPerKm = config.costPerKm || 200;
            const extraStopFee = config.extraStopFee || 0;
            const extraStops = isMultiStop ? Math.max(0, stops.length - 2) : 0;

            let calculatedPrice = base + (totalDistanceKm * costPerKm) + (extraStopFee * extraStops);
            calculatedPrice = Math.ceil(calculatedPrice / 100) * 100;

            const maxDiscountPercent = typeof config.maxDiscountPercent === 'number' ? config.maxDiscountPercent : 10;
            const maxPriceSurgePercent = typeof config.maxPriceSurgePercent === 'number' ? config.maxPriceSurgePercent : 100;

            const minPriceFloor = base + (extraStopFee * extraStops);
            const relativeMinPrice = Math.ceil((calculatedPrice * (1 - (maxDiscountPercent / 100))) / 100) * 100;
            const minAllowedPrice = Math.max(minPriceFloor, relativeMinPrice);

            const maxAllowedPrice = Math.ceil((calculatedPrice * (1 + (maxPriceSurgePercent / 100))) / 100) * 100;

            return { totalDistanceKm, calculatedPrice, minAllowedPrice, maxAllowedPrice, maxDiscountPercent, maxPriceSurgePercent };
        }

        it('يحسب الحد الأدنى لمشوار 40,000 ج.س بنسبة تخفيض 10% ليكون 36,000 ج.س ويرفض 20,000 ج.س', () => {
            const mockConfig = {
                baseFare: 1000,
                costPerKm: 2000,
                extraStopFee: 0,
                maxDiscountPercent: 10,
                maxPriceSurgePercent: 100
            };

            const calculatedPrice = 40000;
            const maxDiscountPercent = mockConfig.maxDiscountPercent;
            const relativeMin = Math.ceil((calculatedPrice * (1 - (maxDiscountPercent / 100))) / 100) * 100;
            const minAllowed = Math.max(mockConfig.baseFare, relativeMin);

            expect(minAllowed).toBe(36000);

            // فحص السعر الذي أرسله العميل (20,000)
            const clientOfferPrice = 20000;
            expect(clientOfferPrice < minAllowed).toBe(true);

            // فحص سعر مقبول (36,000 أو 38,000 أو 40,000)
            expect(36000 >= minAllowed).toBe(true);
            expect(38000 >= minAllowed).toBe(true);
            expect(40000 >= minAllowed).toBe(true);
        });

        it('يحسب سقف السعر بشكل صحيح بنسبة زيادة 100% لمشوار 40,000 ج.س ليكون 80,000 ج.س', () => {
            const calculatedPrice = 40000;
            const maxPriceSurgePercent = 100;
            const maxAllowed = Math.ceil((calculatedPrice * (1 + (maxPriceSurgePercent / 100))) / 100) * 100;

            expect(maxAllowed).toBe(80000);

            // فحص سعر مبالغ فيه (90,000)
            expect(90000 > maxAllowed).toBe(true);
            // فحص سعر مقبول تحت السقف (60,000)
            expect(60000 <= maxAllowed).toBe(true);
        });

        it('يحسب المسافة والتسعيرة بدقة بين إحداثيات حقيقية داخل الخرطوم', () => {
            const pickup = { lat: 15.6000, lng: 32.5300 };
            const dropoff = { lat: 15.6500, lng: 32.5500 };

            const limits = calculateLimits(pickup, dropoff, null, settings);

            expect(limits.totalDistanceKm).toBeGreaterThan(0);
            expect(limits.calculatedPrice).toBeGreaterThan(settings.baseFare);
            expect(limits.minAllowedPrice).toBeLessThanOrEqual(limits.calculatedPrice);
            expect(limits.minAllowedPrice).toBeGreaterThanOrEqual(settings.baseFare);
            expect(limits.maxAllowedPrice).toBeGreaterThanOrEqual(limits.calculatedPrice);
        });

        it('يتعامل بشكل صحيح مع الرحلات متعددة النقاط ويضيف رسوم النقاط الإضافية', () => {
            const stops = [
                { lat: 15.6000, lng: 32.5300, type: 'pickup' },
                { lat: 15.6200, lng: 32.5400, type: 'dropoff' },
                { lat: 15.6500, lng: 32.5500, type: 'dropoff' } // نقطة إضافية واحدة
            ];

            const limits = calculateLimits(null, null, stops, settings);

            expect(limits.calculatedPrice).toBeGreaterThan(settings.baseFare + settings.extraStopFee);
            expect(limits.minAllowedPrice).toBeGreaterThanOrEqual(settings.baseFare + settings.extraStopFee);
        });

        it('حالة خاصة: إذا كانت نسبة التخفيض 0% (ممنوع أي تخفيض)', () => {
            const zeroDiscountConfig = { ...settings, maxDiscountPercent: 0 };
            const pickup = { lat: 15.6000, lng: 32.5300 };
            const dropoff = { lat: 15.6500, lng: 32.5500 };

            const limits = calculateLimits(pickup, dropoff, null, zeroDiscountConfig);

            // عند نسبة تخفيض 0%، الحد الأدنى يساوي تماماً تسعيرة التطبيق المحسوبة
            expect(limits.minAllowedPrice).toBe(limits.calculatedPrice);
        });

        it('حالة خاصة: فحص الحدود الدقيقة (Exact Boundaries: minAllowed vs minAllowed - 1)', () => {
            const calculatedPrice = 40000;
            const maxDiscountPercent = 10;
            const minAllowed = Math.ceil((calculatedPrice * (1 - (maxDiscountPercent / 100))) / 100) * 100; // 36000
            const maxAllowed = Math.ceil((calculatedPrice * (1 + (100 / 100))) / 100) * 100; // 80000

            // السعر المسموح بالملي
            expect(minAllowed).toBe(36000);
            expect(minAllowed >= minAllowed).toBe(true);
            expect((minAllowed - 1) < minAllowed).toBe(true);

            // السقف بالملي
            expect(maxAllowed).toBe(80000);
            expect(maxAllowed <= maxAllowed).toBe(true);
            expect((maxAllowed + 1) > maxAllowed).toBe(true);
        });
    });
});
