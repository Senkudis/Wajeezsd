/**
 * 🗜️ ملف ZIP بلا ضغط (store) — لتنزيل عدّة ملفات دفعةً واحدة.
 *
 * لماذا لا مكتبة: الحاجة صغيرة (صور PNG مضغوطة أصلاً، فالضغط لا يكسب شيئاً)،
 * والنشر هنا يدوي — حزمةٌ جديدة تُنسى على السيرفر فيسقط المسار. ولا
 * zlib.crc32 لأنها لا توجد قبل Node 20.15/22.2.
 *
 * الأسماء بـ UTF-8 (البت 11) — أسماء الأعضاء عربية.
 */

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/** وقت/تاريخ MS-DOS كما يطلبه رأس ZIP */
function dosDateTime(d) {
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
}

/**
 * @param {Array<{name:string, data:Buffer}>} files
 * @param {Date} [when]
 * @returns {Buffer}
 */
function buildZip(files, when = new Date()) {
    const { time, date } = dosDateTime(when);
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const f of files) {
        const name = Buffer.from(f.name, 'utf8');
        const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
        const crc = crc32(data);

        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);  // توقيع الرأس المحلي
        lh.writeUInt16LE(20, 4);          // الإصدار المطلوب
        lh.writeUInt16LE(0x0800, 6);      // UTF-8
        lh.writeUInt16LE(0, 8);           // store
        lh.writeUInt16LE(time, 10);
        lh.writeUInt16LE(date, 12);
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(data.length, 18);
        lh.writeUInt32LE(data.length, 22);
        lh.writeUInt16LE(name.length, 26);
        lh.writeUInt16LE(0, 28);
        locals.push(lh, name, data);

        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0);  // توقيع الدليل المركزي
        ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(0x0800, 8);
        ch.writeUInt16LE(0, 10);
        ch.writeUInt16LE(time, 12);
        ch.writeUInt16LE(date, 14);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(data.length, 20);
        ch.writeUInt32LE(data.length, 24);
        ch.writeUInt16LE(name.length, 28);
        ch.writeUInt32LE(offset, 42);
        centrals.push(ch, name);

        offset += lh.length + name.length + data.length;
    }

    const centralSize = centrals.reduce((s, b) => s + b.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...locals, ...centrals, end]);
}

module.exports = { buildZip, crc32 };
