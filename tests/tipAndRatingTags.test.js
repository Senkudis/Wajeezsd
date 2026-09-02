import { describe, it, expect } from 'vitest';

const ratingTags = require('../utils/ratingTags');
const Order = require('../models/Order');
const Rating = require('../models/Rating');
const Settings = require('../models/Settings');
const User = require('../models/User');
const { resolvePushUrl } = require('../utils/pushRouting');

describe('💚 إكرامية الكابتن', () => {

    describe('1. مخطّط الطلب', () => {
        it('يحمل حقل tip بصفر افتراضي وبلا وقت إضافة', () => {
            const doc = new Order({
                client: '507f1f77bcf86cd799439011',
                pickup:  { address: 'أ', contactName: 'س', contactPhone: '0900000000' },
                dropoff: { address: 'ب', receiverName: 'ص', receiverPhone: '0900000001' },
                distanceType: 'short',
                price: 5000,
                city: 'Khartoum'
            });
            expect(doc.tip.amount).toBe(0);
            expect(doc.tip.addedAt).toBeNull();
        });

        it('يرفض إكرامية سالبة', () => {
            const doc = new Order({
                client: '507f1f77bcf86cd799439011',
                pickup:  { address: 'أ', contactName: 'س', contactPhone: '0900000000' },
                dropoff: { address: 'ب', receiverName: 'ص', receiverPhone: '0900000001' },
                distanceType: 'short',
                price: 5000,
                city: 'Khartoum',
                tip: { amount: -100 }
            });
            const err = doc.validateSync();
            expect(err?.errors?.['tip.amount']).toBeDefined();
        });

        it('🔑 الإكرامية منفصلة عن price — فلا تدخل وعاء حساب العمولة', () => {
            // العمولة تُحسب من price/appFee (routes/orders.js — معالج التسليم).
            // لو طُويت الإكرامية في price لاقتطعت المنصّة نسبتها من هديّة العميل.
            const paths = Object.keys(Order.schema.paths);
            expect(paths).toContain('price');
            expect(paths).toContain('appFee');
            expect(paths).toContain('tip.amount');
            expect(Order.schema.path('tip.amount')).not.toBe(Order.schema.path('price'));
        });
    });

    describe('2. سقف الإكرامية في الإعدادات', () => {
        it('maxTipAmount موجود بقيمة افتراضية 20000', () => {
            const schema = Settings.schema.paths;
            expect(schema.maxTipAmount).toBeDefined();
            expect(schema.maxTipAmount.defaultValue).toBe(20000);
        });

        it('صفر مقبول (تعطيل الميزة) والسالب مرفوض', () => {
            const okDoc  = new Settings({ city: 'Khartoum', maxTipAmount: 0 });
            const badDoc = new Settings({ city: 'Khartoum', maxTipAmount: -1 });
            expect(okDoc.validateSync()?.errors?.maxTipAmount).toBeUndefined();
            expect(badDoc.validateSync()?.errors?.maxTipAmount).toBeDefined();
        });
    });

    describe('3. المبلغ المستحق نقداً', () => {
        // النسخة نفسها الموجودة في routes/orders.js — الاختبار يحرس المعادلة
        const { totalDueFromClient } = require('../routes/orders');

        it('الأجرة ناقص الخصم زائد الإكرامية', () => {
            expect(totalDueFromClient({ price: 5000, discountAmount: 500, tip: { amount: 1000 } })).toBe(5500);
        });

        it('بلا إكرامية = السلوك القديم تماماً', () => {
            expect(totalDueFromClient({ price: 5000, discountAmount: 500 })).toBe(4500);
        });

        it('خصمٌ يفوق الأجرة لا يُنتج مبلغاً سالباً', () => {
            expect(totalDueFromClient({ price: 1000, discountAmount: 9999, tip: { amount: 200 } })).toBe(200);
        });

        it('يتحمّل طلباً فارغاً بلا انفجار', () => {
            expect(totalDueFromClient({})).toBe(0);
            expect(totalDueFromClient(null)).toBe(0);
        });
    });

    describe('4. توجيه إشعار الإكرامية', () => {
        it('order_tip يقود الكابتن إلى شاشة مهامّه', () => {
            expect(resolvePushUrl('captain', 'order_tip', '507f1f77bcf86cd799439011'))
                .toBe('/captain-missions.html');
        });
    });
});

describe('🏷️ وسوم التقييم', () => {

    describe('1. تنقية الوسوم الواردة', () => {
        it('يقبل الرموز المعروفة وحدها', () => {
            expect(ratingTags.sanitizeTags(['fast', 'not_a_real_tag', 'polite']))
                .toEqual(['fast', 'polite']);
        });

        it('يحذف التكرار', () => {
            expect(ratingTags.sanitizeTags(['fast', 'fast', 'fast'])).toEqual(['fast']);
        });

        it('يقصّ عند السقف', () => {
            const many = ratingTags.TAG_CODES.slice();
            expect(many.length).toBeGreaterThan(ratingTags.MAX_TAGS_PER_RATING);
            expect(ratingTags.sanitizeTags(many).length).toBe(ratingTags.MAX_TAGS_PER_RATING);
        });

        it('يُرجع مصفوفة فارغة لأي مُدخَل غير صالح — لا null ولا استثناء', () => {
            for (const bad of [null, undefined, 'fast', 42, {}, [null, 7, {}]]) {
                expect(ratingTags.sanitizeTags(bad)).toEqual([]);
            }
        });

        it('🔑 وسمٌ مجهول لا يُسقط بقية الوسوم — نسخة تطبيقٍ أحدث لا تُبطل تقييماً', () => {
            expect(ratingTags.sanitizeTags(['tag_from_future', 'late'])).toEqual(['late']);
        });
    });

    describe('2. سلامة القائمة نفسها', () => {
        it('لا رمز مكرّر بين مجموعتَي الثناء والشكوى', () => {
            expect(new Set(ratingTags.TAG_CODES).size).toBe(ratingTags.TAG_CODES.length);
        });

        it('كل رمز إنجليزي وكل نص عربي غير فارغ', () => {
            for (const t of ratingTags.ALL_TAGS) {
                expect(t.code).toMatch(/^[a-z_]+$/);
                expect((t.label || '').trim().length).toBeGreaterThan(0);
            }
        });

        it('المجموعتان غير فارغتين — واجهة العميل تعتمد عليهما', () => {
            expect(ratingTags.POSITIVE_TAGS.length).toBeGreaterThan(0);
            expect(ratingTags.NEGATIVE_TAGS.length).toBeGreaterThan(0);
        });
    });

    describe('3. مخطّطا Rating و Order', () => {
        it('مخطّط Rating يقبل الرموز المعروفة ويرفض غيرها', () => {
            const base = {
                client: '507f1f77bcf86cd799439011',
                targetType: 'captain',
                targetId: '507f1f77bcf86cd799439012',
                score: 5
            };
            expect(new Rating({ ...base, tags: ['fast', 'polite'] }).validateSync()?.errors).toBeUndefined();
            expect(new Rating({ ...base, tags: ['bogus'] }).validateSync()?.errors?.['tags.0']).toBeDefined();
        });

        it('🔑 enum مخطّط Rating مشتقّ من utils/ratingTags — مصدر واحد لا نسختان', () => {
            const enumVals = Rating.schema.path('tags').caster.enumValues;
            expect([...enumVals].sort()).toEqual([...ratingTags.TAG_CODES].sort());
        });

        it('مخطّط Order يحفظ الوسوم والتعليق مع التقييم', () => {
            const paths = Object.keys(Order.schema.paths);
            expect(paths).toContain('rating.tags');
            expect(paths).toContain('rating.comment');
        });
    });
});

describe('⭐ المتاجر المفضّلة', () => {
    it('favoritePlaces مصفوفة مراجع إلى Place وتبدأ فارغة', () => {
        const path = User.schema.path('favoritePlaces');
        expect(path).toBeDefined();
        expect(path.caster.options.ref).toBe('Place');

        const u = new User({ name: 'ن', phone: '0900000000', password: 'x', city: 'Khartoum' });
        expect(u.favoritePlaces).toHaveLength(0);
    });

    it('يرفض معرّفاً غير صالح بدل حفظه صامتاً', () => {
        const u = new User({
            name: 'ن', phone: '0900000001', password: 'x', city: 'Khartoum',
            favoritePlaces: ['ليس معرّفاً']
        });
        expect(u.validateSync()?.errors?.['favoritePlaces.0']).toBeDefined();
    });
});
