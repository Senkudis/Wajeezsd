/**
 * 🕑 حدود «اليوم» بتوقيت السودان (UTC+2).
 * كان «+3» مكتوباً في ستة مواضع، فيبدأ اليوم الساعة 11 مساءً من الليلة السابقة،
 * وإحصاءات النطاق كانت «اليوم» فيها آخر 24 ساعة وتُجمّع بتوقيت غرينتش.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const { startOfSudanDay, sudanDayKey, sudanDayKeys, OFFSET_MS } = require('../utils/sudanTime');

describe('utils/sudanTime', () => {
    it('السودان UTC+2', () => {
        expect(OFFSET_MS).toBe(2 * 3600 * 1000);
    });

    it('23:30 في الخرطوم ما زالت اليوم نفسه — لا الغد (خطأ +3)', () => {
        const t = new Date('2026-11-01T21:30:00Z');   // 23:30 الخرطوم
        expect(sudanDayKey(t)).toBe('2026-11-01');
        expect(startOfSudanDay(t).toISOString()).toBe('2026-10-31T22:00:00.000Z');
    });

    it('00:30 في الخرطوم يومٌ جديد وإن كان غرينتش ما زال في الأمس', () => {
        const t = new Date('2026-11-01T22:30:00Z');   // 00:30 الخرطوم يوم 2
        expect(sudanDayKey(t)).toBe('2026-11-02');
        expect(startOfSudanDay(t).toISOString()).toBe('2026-11-01T22:00:00.000Z');
    });

    it('سلسلة الأيام بلا فجوات وتشمل اليوم', () => {
        const to = new Date('2026-11-03T08:00:00Z');
        expect(sudanDayKeys(new Date('2026-10-31T22:00:00Z'), to)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    });
});

describe('لا «+3» يدوي في الإحصاءات', () => {
    const files = ['models/DailyStat.js', 'models/PlaceSearchStat.js', 'models/Place.js', 'routes/places.js',
        'routes/merchant-erp.js', 'routes/admin/subadmins.js', 'routes/admin/dashboard.js'];
    for (const f of files) {
        it(f, () => {
            const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
            expect(src).not.toMatch(/3 \* 60 \* 60 \* 1000|3 \* 3600000|'\+03:00'/);
        });
    }

    it('إحصاءات النطاق: أيامٌ تقويمية بتوقيت السودان، وتجميعٌ بالمنطقة نفسها', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'routes/admin/dashboard.js'), 'utf8');
        const route = src.slice(src.indexOf("router.get('/scoped-stats'"));
        expect(route).toContain('startOfSudanDay(now)');
        expect(route).toContain("timezone: TZ");
        expect(route).not.toMatch(/Date\.now\(\) - days \* 86400000/);
    });
});
