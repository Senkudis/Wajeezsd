/**
 * التحقق من رابط صورة الدردشة.
 *
 * لماذا: `imageUrl` يأتي نصاً من العميل بعد الرفع. قبوله كما هو يعني أن أي مستخدم
 * يستطيع حقن رابط خارجي يتجسّس على من فتح المحادثة، أو مسار يشير إلى وثائق كابتن
 * آخر تحت /uploads/documents. هذه الاختبارات تحرس الحاجز الوحيد ضد ذلك.
 */
const {
    sanitizeChatImageUrl,
    isChatImageExpired,
    CHAT_IMAGE_TTL_HOURS,
    CHAT_IMAGE_TTL_MS
} = require('../utils/chatImage');

describe('sanitizeChatImageUrl', () => {
    it('يقبل مسار مجلد الدردشة بامتدادات الصور', () => {
        for (const ok of [
            '/uploads/chat/69cd45d3_1785150000000.jpg',
            '/uploads/chat/a.jpeg',
            '/uploads/chat/b-c_d.png',
            '/uploads/chat/e.webp',
            '/uploads/chat/f.GIF'
        ]) {
            expect(sanitizeChatImageUrl(ok)).toBe(ok);
        }
    });

    it('يرفض أي مجلد آخر — وثائق الكباتن والصور الشخصية ليست صور دردشة', () => {
        for (const bad of [
            '/uploads/documents/license.jpg',
            '/uploads/profiles/me.jpg',
            '/uploads/proofs/receipt.jpg',
            '/uploads/chat.jpg',
            '/chat/x.jpg'
        ]) {
            expect(sanitizeChatImageUrl(bad)).toBeNull();
        }
    });

    it('يرفض الروابط الخارجية — رابط خارجي يكشف من فتح الرسالة ومتى', () => {
        for (const bad of [
            'https://evil.example/pixel.png',
            '//evil.example/x.jpg',
            'http://localhost/uploads/chat/x.jpg'
        ]) {
            expect(sanitizeChatImageUrl(bad)).toBeNull();
        }
    });

    it('يرفض المخططات الخطرة والخروج من المجلد', () => {
        for (const bad of [
            'javascript:alert(1)',
            'data:image/png;base64,AAAA',
            '/uploads/chat/../documents/license.jpg',
            '/uploads/chat/..%2Fdocuments%2Fx.jpg'
        ]) {
            expect(sanitizeChatImageUrl(bad)).toBeNull();
        }
    });

    it('يرفض الامتدادات غير الصورية ولو كانت داخل مجلد الدردشة', () => {
        for (const bad of [
            '/uploads/chat/app.apk',
            '/uploads/chat/doc.pdf',
            '/uploads/chat/shell.php',
            '/uploads/chat/x.jpg.php'
        ]) {
            expect(sanitizeChatImageUrl(bad)).toBeNull();
        }
    });

    it('يرفض ما ليس نصاً أو كان فارغاً بلا أن يرمي', () => {
        for (const bad of [null, undefined, 0, {}, [], '', '   ']) {
            expect(sanitizeChatImageUrl(bad)).toBeNull();
        }
    });

    it('يشذّب المسافات المحيطة', () => {
        expect(sanitizeChatImageUrl('  /uploads/chat/a.jpg  ')).toBe('/uploads/chat/a.jpg');
    });
});

describe('انتهاء صلاحية صورة الدردشة', () => {
    it('المدة 48 ساعة، والمللي ثانية مشتقّة منها', () => {
        expect(CHAT_IMAGE_TTL_HOURS).toBe(48);
        expect(CHAT_IMAGE_TTL_MS).toBe(48 * 60 * 60 * 1000);
    });

    it('صورة قبل 47 ساعة حيّة، وبعد 49 ساعة منتهية', () => {
        const now = Date.now();
        expect(isChatImageExpired(new Date(now - 47 * 3600e3), now)).toBe(false);
        expect(isChatImageExpired(new Date(now - 49 * 3600e3), now)).toBe(true);
    });

    it('عند حدّ الـ 48 ساعة بالضبط تُعتبر منتهية', () => {
        const now = Date.now();
        expect(isChatImageExpired(new Date(now - CHAT_IMAGE_TTL_MS), now)).toBe(true);
    });

    it('بلا تاريخ لا يرمي', () => {
        expect(isChatImageExpired(null)).toBe(false);
    });
});
