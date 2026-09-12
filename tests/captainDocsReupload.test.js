/**
 * 🪪 الكابتن لم يكن يستطيع رفع وثائقه من داخل التطبيق.
 *
 * نموذج التسجيل يرفع خمس صور في طلبٍ واحد. وإن تعثّر الرفع (شبكة ضعيفة، صورة
 * كبيرة) تظهر له رسالة تقول: «سجّل الدخول ثم أعد رفعها من صفحة حسابك» —
 * وصفحة حسابه لم يكن فيها رفعٌ إطلاقاً. فيبقى معلّقاً بلا وثائق، والإدارة
 * ترى طلباً ناقصاً فترفضه، ولا يعرف هو لماذا.
 *
 * المسار موجودٌ أصلاً (`POST /api/upload/captain-docs`) ويقبل الحقول منفردة،
 * فالناقص كان الواجهة وحدها.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const page = fs.readFileSync(path.join(__dirname, '..', 'public_html', 'captain-profile.html'), 'utf8');
const captainRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'captain.js'), 'utf8');
const uploadRoute = fs.readFileSync(path.join(__dirname, '..', 'routes', 'upload.js'), 'utf8');

describe('الخادم يخبر الكابتن بحالة وثائقه', () => {
    it('profile-details يعيد وجود كل وثيقة وحالة الاعتماد', () => {
        const i = captainRoute.indexOf('profile-details');
        const blk = captainRoute.slice(i, i + 2500);
        expect(blk).toContain('documentsStatus');
        expect(blk).toContain('approvalStatus');
        expect(blk).toContain('rejectionReason');
    });

    it('يرسل وجودها لا مساراتها — الملفّات نفسها لا تُعاد إليه', () => {
        const i = captainRoute.indexOf('documentsStatus');
        const blk = captainRoute.slice(i, i + 400);
        expect(blk).toContain('!!(req.user.documents && req.user.documents[k])');
    });

    it('ومسار الرفع يقبل وثيقةً واحدة — لا إعادة الخمس معاً', () => {
        const i = uploadRoute.indexOf("router.post('/captain-docs'");
        const blk = uploadRoute.slice(i, i + 2200);
        for (const f of ['driverLicense', 'profilePhoto', 'vehiclePhoto', 'idImage', 'selfieImage']) {
            expect(blk).toContain(`if (req.files.${f})`);
        }
    });
});

describe('صفحة الكابتن: قسم وثائقي', () => {
    it('موجود ويُظهر كل وثيقة وحالتها', () => {
        expect(page).toContain('id="docsSection"');
        expect(page).toContain('function renderDocs');
        for (const k of ['idImage', 'selfieImage', 'driverLicense', 'vehiclePhoto', 'profilePhoto']) {
            expect(page).toContain(`${k}:`);
        }
        expect(page).toContain('لم تُرفع بعد');
    });

    it('يقول للمعلَّق سبب تعليقه لا «قيد المراجعة» وحدها', () => {
        expect(page).toContain('طلبك لن يُراجَع قبل اكتمال الوثائق الناقصة');
        expect(page).toContain('سبب الرفض:');
    });

    it('الرفع يرسل الحقل الصحيح بـ FormData', () => {
        expect(page).toContain("fd.append(key, toSend)");
        expect(page).toContain('/api/upload/captain-docs');
    });

    it('بلا Content-Type يدوي — يكسر حدود FormData', () => {
        const i = page.indexOf('/api/upload/captain-docs');
        const blk = page.slice(i - 200, i + 400);
        expect(blk).toContain('window.Auth.getAuthHeader()');
        expect(blk).not.toContain("'Content-Type'");
    });

    it('يضغط الصورة قبل الرفع — حدّ الخادم 5MB وكاميرا الهاتف تتجاوزه', () => {
        expect(page).toContain('window.WajeezImage.compress(file)');
        expect(page).toMatch(/<script src="js\/image-compress\.js[^"]*"><\/script>/);
    });

    it('فشل الرفع يُقال صراحةً ويُعاد الزرّ لحاله', () => {
        expect(page).toContain('تعذّر الرفع');
        expect(page).toContain('btn.innerHTML = original');
    });

    it('اختيار الملف نفسه مرّتين يعمل — القيمة تُفرَّغ قبل الفتح', () => {
        const i = page.indexOf('function pickDoc');
        expect(page.slice(i, i + 260)).toContain("input.value = ''");
    });

    it('الحالة تُحدَّث بعد النجاح بلا إعادة تحميل الصفحة', () => {
        expect(page).toContain('_docsState[key] = true;');
        expect(page).toContain('renderDocs(_docsState,');
    });
});
