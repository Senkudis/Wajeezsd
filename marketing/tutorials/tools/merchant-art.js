/**
 * رسومٌ مسطّحة (SVG) لبيانات التاجر التجريبية: صور المنتجات، غلاف المتجر،
 * إيصال التحويل. كلها data: URLs — getFullImageUrl يمرّرها كما هي.
 */
const uri = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const bg = (a, b) => `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/>`;

const pizza = (top = '#4caf50') => uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${bg('#fff4e0', '#ffd9a8')}
<circle cx="100" cy="104" r="80" fill="#fff" opacity=".7"/>
<circle cx="100" cy="100" r="72" fill="#d98b3a"/><circle cx="100" cy="100" r="62" fill="#e94b2b"/>
<circle cx="100" cy="100" r="58" fill="#f7c948"/>
<g fill="#e94b2b"><circle cx="78" cy="78" r="9"/><circle cx="124" cy="86" r="9"/><circle cx="96" cy="126" r="9"/><circle cx="132" cy="122" r="8"/></g>
<g fill="none" stroke="${top}" stroke-width="5"><circle cx="102" cy="96" r="7"/><circle cx="72" cy="112" r="6"/><circle cx="118" cy="64" r="6"/><circle cx="140" cy="102" r="6"/></g>
<g fill="#3b2a20"><circle cx="88" cy="96" r="4"/><circle cx="112" cy="110" r="4"/><circle cx="70" cy="92" r="3.5"/><circle cx="104" cy="70" r="3.5"/></g>
<g stroke="#c9792d" stroke-width="2" opacity=".55"><line x1="100" y1="38" x2="100" y2="162"/><line x1="38" y1="100" x2="162" y2="100"/><line x1="56" y1="56" x2="144" y2="144"/><line x1="144" y1="56" x2="56" y2="144"/></g></svg>`);

const shawarma = (fill = '#c2703d') => uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${bg('#fff1e6', '#ffd2b0')}
<ellipse cx="100" cy="170" rx="56" ry="9" fill="#000" opacity=".08"/>
<path d="M62 60 Q100 36 138 60 L112 168 Q100 176 88 168 Z" fill="#f1cf8f"/>
<path d="M66 62 Q100 44 134 62 Q120 78 100 76 Q80 78 66 62Z" fill="${fill}"/>
<circle cx="84" cy="62" r="6" fill="#5aa845"/><circle cx="114" cy="58" r="6" fill="#e2463a"/><circle cx="100" cy="64" r="5" fill="#fff"/>
<path d="M72 96 L128 96 L112 168 Q100 176 88 168 Z" fill="#fff"/>
<g stroke="#e2463a" stroke-width="5"><line x1="78" y1="110" x2="122" y2="110"/><line x1="82" y1="128" x2="118" y2="128"/><line x1="86" y1="146" x2="114" y2="146"/></g></svg>`);

const burger = (patty = '#6b3a1f') => uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${bg('#fff6dc', '#ffe08a')}
<ellipse cx="100" cy="164" rx="66" ry="9" fill="#000" opacity=".08"/>
<path d="M38 96 Q40 44 100 42 Q160 44 162 96 Z" fill="#e0953f"/>
<g fill="#fff6dc"><ellipse cx="80" cy="64" rx="4" ry="2.4"/><ellipse cx="104" cy="56" rx="4" ry="2.4"/><ellipse cx="124" cy="70" rx="4" ry="2.4"/><ellipse cx="92" cy="80" rx="4" ry="2.4"/><ellipse cx="66" cy="84" rx="4" ry="2.4"/><ellipse cx="138" cy="86" rx="4" ry="2.4"/></g>
<path d="M34 100 Q48 92 62 100 Q76 108 90 100 Q104 92 118 100 Q132 108 146 100 Q158 94 166 100 L166 108 L34 108Z" fill="#6cc04a"/>
<path d="M40 108 L160 108 L132 124 L68 124Z" fill="#ffc83d"/>
<rect x="36" y="110" width="128" height="22" rx="11" fill="${patty}"/>
<path d="M40 136 L160 136 Q160 156 140 156 L60 156 Q40 156 40 136Z" fill="#d98a35"/></svg>`);

const juice = (c1 = '#ffb020', c2 = '#ff8a00', leaf = false) => uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${bg('#fffbe6', '#ffe9a6')}
<ellipse cx="100" cy="172" rx="40" ry="7" fill="#000" opacity=".08"/>
<rect x="104" y="18" width="8" height="70" rx="4" fill="#ef4444" transform="rotate(14 108 50)"/>
<path d="M62 52 L138 52 L128 166 Q100 174 72 166 Z" fill="#fff" opacity=".85"/>
<path d="M66 74 L134 74 L127 162 Q100 170 73 162 Z" fill="${c2}"/><path d="M66 74 L134 74 L131 98 L69 98Z" fill="${c1}"/>
${leaf ? '<path d="M128 46 Q150 30 160 50 Q140 58 128 46Z" fill="#22a34a"/><path d="M134 54 Q152 52 156 70 Q138 70 134 54Z" fill="#16a34a"/>'
       : '<path d="M130 40 Q160 34 158 62 Q140 66 130 40Z" fill="#ffc21a"/><path d="M146 36 Q150 30 156 32" stroke="#22a34a" stroke-width="4" fill="none"/>'}
<ellipse cx="86" cy="118" rx="5" ry="22" fill="#fff" opacity=".35"/></svg>`);

const cover = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 200">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7b8"/><stop offset="1" stop-color="#ffd08a"/></linearGradient></defs>
<rect width="520" height="200" fill="url(#s)"/>
<rect x="60" y="62" width="400" height="138" fill="#fff8ec"/>
<g>${Array.from({ length: 10 }, (_, i) => `<path d="M${60 + i * 40} 40 h40 v34 q-20 14 -40 0Z" fill="${i % 2 ? '#fff' : '#0a8754'}"/>`).join('')}</g>
<rect x="52" y="30" width="416" height="12" rx="6" fill="#04553a"/>
<rect x="88" y="96" width="140" height="80" rx="8" fill="#bfe3f2"/><rect x="292" y="96" width="140" height="80" rx="8" fill="#bfe3f2"/>
<path d="M88 96 l50 0 -40 80 -10 0Z" fill="#fff" opacity=".35"/><path d="M292 96 l50 0 -40 80 -10 0Z" fill="#fff" opacity=".35"/>
<rect x="240" y="104" width="40" height="96" rx="4" fill="#0a8754"/><circle cx="272" cy="152" r="3" fill="#ffd166"/>
<g transform="translate(110 140)"><circle r="14" fill="#e94b2b"/><circle r="10" fill="#f7c948"/></g>
<g transform="translate(160 150)"><rect x="-10" y="-22" width="20" height="30" rx="3" fill="#ff9f1c"/></g>
<g transform="translate(330 146)"><path d="M-22 6 Q-20 -18 0 -18 Q20 -18 22 6Z" fill="#e0953f"/><rect x="-22" y="6" width="44" height="8" rx="4" fill="#6b3a1f"/></g>
<g transform="translate(392 150)"><path d="M-12 -18 L12 -18 L6 14 L-6 14Z" fill="#f1cf8f"/></g>
<circle cx="30" cy="180" r="26" fill="#22a34a"/><circle cx="490" cy="176" r="30" fill="#22a34a"/><circle cx="508" cy="160" r="18" fill="#16a34a"/></svg>`);

const logo = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="40" fill="#04553a"/>
<circle cx="100" cy="92" r="52" fill="#ffd166"/><path d="M62 92 h76 a38 38 0 0 1 -76 0Z" fill="#e94b2b"/>
<rect x="56" y="150" width="88" height="10" rx="5" fill="#fff"/></svg>`);

// إيصال تحويل عام (بلا شعار جهةٍ حقيقية) — يرفعه العميل ويراجعه التاجر
const receipt = uri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 520" font-family="Arial, Tahoma, sans-serif">
<rect width="300" height="520" fill="#f1f5f9"/><rect x="14" y="14" width="272" height="492" rx="18" fill="#fff"/>
<rect x="14" y="14" width="272" height="96" rx="18" fill="#0b7a4b"/><rect x="14" y="80" width="272" height="30" fill="#0b7a4b"/>
<circle cx="150" cy="110" r="34" fill="#fff"/><circle cx="150" cy="110" r="27" fill="#16a34a"/>
<path d="M136 111 l10 10 l19 -21" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<text x="150" y="56" fill="#fff" font-size="20" font-weight="700" text-anchor="middle">إشعار تحويل</text>
<text x="150" y="178" fill="#0f172a" font-size="19" font-weight="700" text-anchor="middle">تم التحويل بنجاح</text>
<text x="150" y="222" fill="#0b7a4b" font-size="30" font-weight="700" text-anchor="middle">12,500 SDG</text>
<line x1="34" y1="248" x2="266" y2="248" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="6 5"/>
<g font-size="14" fill="#64748b"><text x="266" y="282" text-anchor="end">إلى</text><text x="266" y="330" text-anchor="end">من</text><text x="266" y="378" text-anchor="end">رقم العملية</text><text x="266" y="426" text-anchor="end">التاريخ</text></g>
<g font-size="15" fill="#0f172a" font-weight="700"><text x="34" y="282" text-anchor="start">مطعم الساحة للأغذية</text><text x="34" y="330" text-anchor="start">سارة عبدالله</text><text x="34" y="378" text-anchor="start">48213097</text><text x="34" y="426" text-anchor="start">05/10/2026</text></g>
<line x1="34" y1="452" x2="266" y2="452" stroke="#e2e8f0" stroke-width="2"/>
<text x="150" y="484" fill="#94a3b8" font-size="12" text-anchor="middle">احتفظ بهذا الإشعار كمرجع</text></svg>`);

module.exports = {
    pizzaVeg: pizza('#4caf50'), pizzaMarg: pizza('#2e7d32'),
    shawarmaChicken: shawarma('#d9893f'), shawarmaMeat: shawarma('#7a3b1d'),
    burgerBeef: burger('#5b2f17'), burgerChicken: burger('#c9853f'),
    juiceMango: juice('#ffc21a', '#ff9800'), juiceLemon: juice('#d8f36a', '#a6d93b', true),
    cover, logo, receipt
};
