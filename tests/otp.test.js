import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { generateOtpCode, generateReferralCode, REFERRAL_CHARS } = require('../utils/otp.js');

describe('generateOtpCode', () => {
    it('ست خانات رقمية دائماً — لا كود أقصر يُقبَل في واجهة الإدخال', () => {
        for (let i = 0; i < 500; i++) {
            expect(generateOtpCode()).toMatch(/^[0-9]{6}$/);
        }
    });

    it('لا يبدأ بصفر — النطاق يبدأ من 100000', () => {
        for (let i = 0; i < 500; i++) {
            expect(generateOtpCode()[0]).not.toBe('0');
        }
    });

    it('ضمن المدى [100000, 999999]', () => {
        for (let i = 0; i < 500; i++) {
            const n = Number(generateOtpCode());
            expect(n).toBeGreaterThanOrEqual(100000);
            expect(n).toBeLessThanOrEqual(999999);
        }
    });

    it('لا تكرار ملحوظ — 2000 كود تعطي أكثر من 1900 قيمة فريدة', () => {
        const seen = new Set();
        for (let i = 0; i < 2000; i++) seen.add(generateOtpCode());
        expect(seen.size).toBeGreaterThan(1900);
    });
});

describe('generateReferralCode', () => {
    it('صيغة WJZ- متبوعة بأربعة محارف من الأبجدية المعتمدة', () => {
        for (let i = 0; i < 500; i++) {
            expect(generateReferralCode()).toMatch(/^WJZ-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
        }
    });

    it('يحترم الطول المطلوب عند تمريره', () => {
        expect(generateReferralCode(6)).toMatch(/^WJZ-.{6}$/);
        expect(generateReferralCode(8)).toHaveLength(4 + 8);
    });

    it('لا يولّد محارف ملتبسة بصرياً (I، O، 0، 1)', () => {
        for (const ch of 'IO01') expect(REFERRAL_CHARS).not.toContain(ch);
        const codes = Array.from({ length: 500 }, () => generateReferralCode(8));
        for (const c of codes) {
            expect(c.slice(4)).not.toMatch(/[IO01]/);
        }
    });

    it('التوزيع منتظم تقريباً — كل محرف يظهر ولا يهيمن أي محرف', () => {
        const counts = new Map();
        const N = 20000;
        for (let i = 0; i < N; i++) {
            for (const ch of generateReferralCode(1).slice(4)) {
                counts.set(ch, (counts.get(ch) || 0) + 1);
            }
        }
        // كل محرف من الاثنين والثلاثين ظهر
        expect(counts.size).toBe(REFERRAL_CHARS.length);
        const expected = N / REFERRAL_CHARS.length;
        for (const [, c] of counts) {
            // انحراف واسع عمداً: الغرض كشف الانحياز البنيوي لا اختبار إحصائي دقيق
            expect(c).toBeGreaterThan(expected * 0.6);
            expect(c).toBeLessThan(expected * 1.4);
        }
    });
});
