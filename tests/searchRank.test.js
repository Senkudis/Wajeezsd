import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { nameScore, pinInOtherCity, byRelevance, normalizeArabic } = require('../utils/searchRank');

describe('قوّة مطابقة الاسم', () => {
    it('التطابق التام ثم البداية ثم بداية كلمة ثم الوسط', () => {
        expect(nameScore('بيتزا', 'بيتزا')).toBe(100);
        expect(nameScore('بيتزا هت', 'بيتزا')).toBe(80);
        expect(nameScore('مطعم بيتزا الريف', 'بيتزا')).toBe(60);
        expect(nameScore('سوبربيتزا', 'بيتزا')).toBe(40);
        expect(nameScore('مخبز الأمين', 'بيتزا')).toBe(0);
    });

    it('يتسامح في رسم الحروف والتشكيل', () => {
        expect(normalizeArabic('مَخْبَز الأمِيرة')).toBe('مخبز الاميره');
        expect(nameScore('صيدلية الشفاء', 'صيدليه')).toBe(80);
    });
});

describe('حراسة المدينة بالدبوس', () => {
    const khartoum = { lat: 15.55, lng: 32.53 };
    const atbara = { lat: 17.70, lng: 33.98 };

    it('متجرٌ «عطبرة» دبّوسه في الخرطوم لا يُعرض في عطبرة', () => {
        expect(pinInOtherCity(khartoum, 'Atbara')).toBe(true);
        expect(pinInOtherCity(atbara, 'Atbara')).toBe(false);
    });

    it('الموقع المجهول أو خارج كل المدن لا يُحكم عليه', () => {
        expect(pinInOtherCity(null, 'Atbara')).toBe(false);
        expect(pinInOtherCity({ lat: 13.0, lng: 30.0 }, 'Atbara')).toBe(false);
    });
});

describe('ترتيب النتائج', () => {
    it('المطابقة الأقوى تسبق الأقرب', () => {
        const list = [
            { name: 'مطعم الوصف', _score: 10, distanceKm: 0.2 },
            { name: 'بيتزا هت', _score: 80, distanceKm: 3 },
            { name: 'بيتزا', _score: 100, distanceKm: 5 }
        ].sort(byRelevance);
        expect(list.map(x => x.name)).toEqual(['بيتزا', 'بيتزا هت', 'مطعم الوصف']);
    });

    it('عند التساوي: الأقرب أولاً', () => {
        const list = [
            { name: 'أ', _score: 80, distanceKm: 4 },
            { name: 'ب', _score: 80, distanceKm: 1 }
        ].sort(byRelevance);
        expect(list[0].name).toBe('ب');
    });
});
