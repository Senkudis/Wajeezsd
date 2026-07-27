/**
 * متطلبات القبول في App Store — فحص آلي للشروط التي تُرفض النسخة بدونها.
 *
 * لماذا: هذه الشروط لا يكشفها أي اختبار وظيفي، ولا تظهر إلا في رسالة رفض بعد
 * أيام من الانتظار (حذف الحساب، رابط خصوصية مكسور، أيقونة بقناة ألفا، أصل CORS
 * ناقص فلا يعمل التطبيق على الآيفون أصلاً). كلها ثابتة يمكن التحقق منها هنا.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('حذف الحساب (App Store 5.1.1(v))', () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../routes/auth'));

    it('المسار موجود ومحمي — بلا توكن يردّ 401 لا 404', async () => {
        const res = await request(app).delete('/api/auth/me');
        expect(res.status).toBe(401);
    });

    it('واجهة الحذف مربوطة في صفحات الأدوار الثلاثة', () => {
        for (const page of ['index.html', 'captain-profile.html', 'merchant-profile.html']) {
            const html = read(path.join('public_html', page));
            expect(html).toContain('openDeleteAccount');
            // الوحدة نفسها يجب أن تكون محمَّلة، وإلا كان الزر يرمي خطأ عند اللمس
            expect(html).toMatch(/js\/delete-account\.js/);
        }
    });
});

describe('سياسة الخصوصية', () => {
    it('الصفحة موجودة فعلاً (الرابط في القائمة كان يشير لملف غير موجود)', () => {
        const link = read('public_html/index.html')
            .match(/https:\/\/wajeezsd\.com\/([\w-]+\.html)"[^>]*>\s*<i[^>]*><\/i>\s*سياسة الخصوصية/);
        const file = link ? link[1] : 'privacy-policy.html';
        expect(fs.existsSync(path.join(ROOT, 'public_html', file))).toBe(true);
    });

    it('تذكر كيفية حذف الحساب — يسأل عنها مراجع Apple', () => {
        expect(read('public_html/privacy-policy.html')).toContain('حذف الحساب');
    });
});

describe('تهيئة iOS', () => {
    it('أصل WebView الخاص بالآيفون مسموح في CORS', () => {
        const cfg = JSON.parse(read('capacitor.config.json'));
        const scheme = cfg.server.iosScheme || 'capacitor';
        const expected = `${scheme}://${cfg.server.hostname}`;
        expect(read('index.js')).toContain(expected);
    });

    it('ملف Universal Links يُخدَم من نفس مسارات روابط أندرويد', () => {
        const idx = read('index.js');
        expect(idx).toContain('/.well-known/apple-app-site-association');
        expect(idx).toContain('APPLE_TEAM_ID');
        for (const prefix of ['/s/*', '/p/*']) expect(idx).toContain(prefix);
    });

    it('بيان الخصوصية موجود وبلا تتبّع إعلاني', () => {
        const manifest = read('resources/ios/PrivacyInfo.xcprivacy');
        expect(manifest).toContain('NSPrivacyTracking');
        expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
        expect(manifest).toContain('NSPrivacyCollectedDataTypePreciseLocation');
    });

    it('سكربت Info.plist يغطي كل أوصاف الأذونات المستخدمة', () => {
        const src = read('scripts/patch-ios-plist.js');
        for (const key of [
            'NSLocationWhenInUseUsageDescription',
            'NSLocationAlwaysAndWhenInUseUsageDescription',
            'NSCameraUsageDescription',
            'NSPhotoLibraryUsageDescription',
            'UIBackgroundModes',
            'ITSAppUsesNonExemptEncryption'
        ]) expect(src).toContain(key);
    });
});

describe('أيقونة App Store', () => {
    // نقرأ رأس PNG مباشرة (IHDR) بلا أي مكتبة: العرض والارتفاع ثم نوع اللون.
    // colorType 2 = RGB بلا قناة ألفا، و6 = RGBA (مرفوضة من App Store).
    function pngHeader(file) {
        const buf = fs.readFileSync(path.join(ROOT, file));
        return {
            width: buf.readUInt32BE(16),
            height: buf.readUInt32BE(20),
            colorType: buf.readUInt8(25)
        };
    }

    it('1024×1024 بلا قناة ألفا', () => {
        const { width, height, colorType } = pngHeader('resources/ios/icon.png');
        expect([width, height]).toEqual([1024, 1024]);
        expect(colorType).toBe(2);
    });

    it('شاشة البداية 2732×2732 بلا شفافية', () => {
        for (const f of ['resources/ios/splash.png', 'resources/ios/splash-dark.png']) {
            const { width, height, colorType } = pngHeader(f);
            expect([width, height]).toEqual([2732, 2732]);
            expect(colorType).toBe(2);
        }
    });
});
