/**
 * 🧨 كل نصٍّ مضمَّن في صفحات الإدارة يجب أن يُحلَّل.
 *
 *   خطأٌ نحويٌّ واحد في `<script>` مضمَّن لا يُعطّل سطره: المتصفّح يرفض
 *   الكتلة كلّها. وصفحة `admin-captains.html` كتلتها واحدة بطول 17 ألف
 *   محرف — أي أن محرفاً واحداً في غير موضعه يُطفئ جافاسكربت الصفحة
 *   بأكملها، فلا تُحمَّل بيانات ولا يعمل زرّ.
 *
 *   وهذا ما حدث فعلاً: في a78bd57 كُتب
 *
 *       onclick="sendApprovalMessage('' + c._id + '')"
 *
 *   والمقصود `\'` مهرَّبةً لتُنتج `sendApprovalMessage('<id>')`. بلا
 *   التهريب تُغلَق السلسلة عند أول `'` فينكسر التحليل، وبقيت الصفحة
 *   معطّلةً بالكامل حتى اكتُشفت.
 *
 *   العيب من صنفٍ لا تكشفه المراجعة بالعين: السطر يبدو سليماً، والصفحة
 *   تُفتح وتُعرَض، ولا شيء يظهر إلا في الكونسول. فيُحرَس آلياً.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public_html');
const files = fs.readdirSync(ROOT).filter(f => /^admin.*\.html$/.test(f));

// النصوص المضمَّنة وحدها — لا التي لها src
const INLINE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

describe('النصوص المضمَّنة في صفحات الإدارة تُحلَّل', () => {
    it.each(files)('%s', (file) => {
        const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const blocks = [...html.matchAll(INLINE)].map(m => m[1]);
        const broken = [];
        blocks.forEach((body, i) => {
            // كتلٌ من نوع application/json أو text/template ليست جافاسكربت
            try {
                new Function(body);
            } catch (e) {
                broken.push(`الكتلة ${i} (${body.length} محرفاً): ${e.name}: ${e.message}`);
            }
        });
        expect(broken, broken.join('\n')).toHaveLength(0);
    });
});

describe('زرّ رسالة القبول — موضع الانكسار', () => {
    const html = fs.readFileSync(path.join(ROOT, 'admin-captains.html'), 'utf8');

    it('الاقتباس مهرَّبٌ فينتج نداءٌ صحيح', () => {
        expect(html).toContain(`sendApprovalMessage(\\'' + c._id + '\\')`);
    });

    it('ولم تعد السلسلة تُغلق عند أول اقتباس', () => {
        expect(html).not.toContain(`sendApprovalMessage('' + c._id + '')`);
    });

    it('والنداء المُنتَج يحمل المعرّف بين اقتباسين', () => {
        const c = { _id: '68f0a1b2c3d4e5f6a7b8c9d0' };
        const produced = '<button type="button" class="wa-send-btn" onclick="sendApprovalMessage(\'' + c._id + '\')">';
        expect(produced).toContain(`sendApprovalMessage('68f0a1b2c3d4e5f6a7b8c9d0')`);
    });
});
