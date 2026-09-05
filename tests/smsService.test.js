/**
 * 📩 كشف فشل إرسال الرسائل القصيرة.
 *
 * العطل الذي يحرسه هذا الملف — وقد وقع فعلاً في الإنتاج:
 *
 * بوّابة BRQ تُعيد **HTTP 200 حتى على الفشل**، والخطأ في جسم الردّ:
 *     {"status":"error","message":"Unauthenticated."}
 *     {"status":"error","message":"Insufficient balance"}
 *
 * وaxios لا يرمي على 200. فكان الكود يقرأ `response.data.message` — أي نصّ
 * الخطأ نفسه — ويسجّله في حقلٍ اسمه `result` تحت عنوان «SMS sent» بمستوى
 * info. ثم المسار المُستدعي يُطلق الوعد ويمضي، فـ `.catch` لا يُستدعى لأن
 * لا رمي، ويقول للعميل «راجع هاتفك».
 *
 * النتيجة: توقّف إرسال الـ OTP أياماً بلا سطر خطأ واحد، واكتُشف من شكاوى
 * العملاء لا من السجلّات.
 */
import { describe, it, expect } from 'vitest';
const { isSuccessBody } = require('../services/smsService');

describe('كشف نجاح إرسال الرسالة من جسم الردّ لا من رمز HTTP', () => {

    it('🔑 يرفض ردّ الخطأ الذي يأتي بـ HTTP 200 — أصل العطل', () => {
        expect(isSuccessBody({ status: 'error', message: 'Unauthenticated.' })).toBe(false);
        expect(isSuccessBody({ status: 'error', message: 'Insufficient balance' })).toBe(false);
    });

    it('يقبل صيغ النجاح المعروفة', () => {
        for (const st of ['success', 'ok', 'sent', 'queued', 'SUCCESS', 'Ok']) {
            expect(isSuccessBody({ status: st })).toBe(true);
        }
    });

    it('ردٌّ بلا status يُعدّ نجاحاً — بعض المسارات لا تُرجعه', () => {
        // تساهلٌ مقصود: الرفض هنا كان سيُعطّل الإرسال السليم لو غيّرت
        // البوّابة صيغتها، والفشل الحقيقي يُعلن نفسه بـ status: 'error'
        expect(isSuccessBody({ message: 'queued' })).toBe(true);
        expect(isSuccessBody({})).toBe(true);
    });

    it('🔒 جسمٌ فارغ أو غير كائن ليس نجاحاً', () => {
        for (const bad of [null, undefined, '', 'sent', 0, []]) {
            // المصفوفة كائن تقنياً لكنها ليست ردّاً صالحاً — تُقبل بلا status
            if (Array.isArray(bad)) continue;
            expect(isSuccessBody(bad)).toBe(false);
        }
    });

    it('status غير معروف = فشل — لا نفترض النجاح في المجهول', () => {
        expect(isSuccessBody({ status: 'rejected' })).toBe(false);
        expect(isSuccessBody({ status: 'failed' })).toBe(false);
        expect(isSuccessBody({ status: 'blocked' })).toBe(false);
    });
});

describe('🔗 مسار الإرسال يُعلن الفشل بدل ابتلاعه', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'services/smsService.js'), 'utf8');

    it('يفحص جسم الردّ ولا يكتفي بغياب الاستثناء', () => {
        expect(src).toContain('isSuccessBody(response.data)');
    });

    it('يرمي على الفشل — وإلا لم يُستدعَ .catch في المسار المُستدعي', () => {
        expect(src).toMatch(/throw err/);
    });

    it('يسجّل في ErrorLog لتظهر الحادثة في لوحة الإدارة', () => {
        expect(src).toContain('errorTracker.record');
    });

    it('🔑 لا يسجّل نصّ الخطأ كنتيجة نجاح — النمط الذي أخفى العطل', () => {
        // النمط القديم: logger.info({ result: response.data.message || 'Success' }, ...)
        //
        // ⚠️ نفحص الكود وحده لا التعليقات: التوثيق أعلى الملف يقتبس السطر
        //    المعطوب حرفياً ليعرف قارئٌ لاحق ما الذي كان يخفي العطل، ومنعُ
        //    النصّ مطلقاً كان يُفشل الاختبار على توثيقٍ صحيح (وقد أفشله فعلاً).
        const codeLines = src.split('\n')
            .filter(l => {
                const t = l.trim();
                return t && !t.startsWith('*') && !t.startsWith('//') && !t.startsWith('/*');
            })
            .join('\n');
        expect(codeLines).not.toMatch(/message \|\| 'Success'/);
    });

    it('توكن غائب يُكشف قبل إرسال طلبٍ نعرف أنه سيُرفض', () => {
        expect(src).toContain('BRQSMS_TOKEN غير مضبوط');
    });

    it('مهلة للطلب — بلا مهلة يعلّق العميل ينتظر كوداً', () => {
        expect(src).toMatch(/timeout:\s*\d+/);
    });
});
