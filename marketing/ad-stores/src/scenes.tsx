// مشاهد الإعلان — كل مشهدٍ بزمنه الداخلي (الإطار 0 = بداية انتقاله).
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, EASE_INOUT, F, H, SAFE, SAFE_W, STORES, W, clamp } from "./theme";
import { Headline, Phone, Photo, PHONE_W, Rich, Stars, StatusBar, TopShade, useSpring } from "./components";
import { fitText } from "@remotion/layout-utils";

// ═══ ١–٤: سؤالٌ لكل متجر — صورة المنتج الحقيقية ملء الشاشة ═══════════
export const ProductScene: React.FC<{ src: string; text: string; dur: number; focus?: string; cuts?: boolean; store: string }> = ({
  src, text, dur, focus, cuts, store,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.deep }}>
      <Photo src={src} dur={dur} focus={focus} />
      {cuts ? <DiamondCuts /> : null}
      <TopShade />
      <Headline text={text} delay={8} />
      {/* اسم المتجر: حبّةٌ صغيرة تحت العنوان */}
      <StoreTag name={store} delay={16} />
      {/* لمعةٌ دافئة تعبر الصورة مرّة */}
      <AbsoluteFill
        style={{
          background: "linear-gradient(115deg, rgba(255,240,200,0) 40%, rgba(255,240,200,.16) 50%, rgba(255,240,200,0) 60%)",
          translate: `${interpolate(frame, [10, dur], [-W, W], clamp)}px 0`,
        }}
      />
    </AbsoluteFill>
  );
};

const StoreTag: React.FC<{ name: string; delay: number }> = ({ name, delay }) => {
  const k = useSpring(delay);
  return (
    <div style={{ position: "absolute", top: 470, right: SAFE.right, opacity: k, translate: `0 ${(1 - k) * 20}px` }}>
      <div style={{ direction: "rtl", display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,.94)", borderRadius: 999, padding: "10px 26px 10px 18px", boxShadow: "0 10px 30px rgba(0,0,0,.18)" }}>
        <svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5v.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0v-.5M5.5 12.5V20h13v-7.5" fill="none" stroke={C.green} strokeWidth="2" strokeLinejoin="round" /></svg>
        <span style={{ fontFamily: F.sup, fontSize: 40, color: C.ink }}>{name}</span>
        <span style={{ fontFamily: F.sup, fontSize: 28, color: C.green }}>· في وجيز</span>
      </div>
    </div>
  );
};

// تقطيع الباسطة: خطوطٌ ذهبية ترسم شبكة معيّنات فوق الصينية
const DiamondCuts: React.FC = () => {
  const frame = useCurrentFrame();
  const step = 300, slope = 1.4;
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      {[-1, 1].flatMap((dir) =>
        Array.from({ length: 14 }, (_, i) => {
          const c = (i - 7) * step;
          const x1 = -100, x2 = W + 100;
          const y1 = H / 2 + c + dir * (x1 - W / 2) * slope, y2 = H / 2 + c + dir * (x2 - W / 2) * slope;
          const len = Math.hypot(x2 - x1, y2 - y1);
          const k = interpolate(frame, [4 + i * 1.5 + (dir > 0 ? 0 : 6), 22 + i * 1.5 + (dir > 0 ? 0 : 6)], [0, 1], { ...clamp, easing: EASE_INOUT });
          return (
            <line key={`${dir}-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,226,160,.75)" strokeWidth={5} strokeLinecap="round"
              strokeDasharray={len} strokeDashoffset={len * (1 - k)} />
          );
        }),
      )}
    </svg>
  );
};

// ═══ ٥: الجمع — أربعة معيّناتٍ تتراصّ معيّناً واحداً كبيراً ══════════════
const GATHER = [
  { src: "shops/qashtouta_3.png", key: "qashtouta", dx: 0, dy: -1 },
  { src: "shops/limomix_2.jpg", key: "limomix", dx: 1, dy: 0 },
  { src: "shops/ocean_2.jpg", key: "ocean", dx: 0, dy: 1 },
  { src: "shops/beanora_1.jpg", key: "beanora", dx: -1, dy: 0 },
] as const;
export const GatherScene: React.FC = () => {
  const frame = useCurrentFrame();
  const S = 372, CX = W / 2 - (SAFE.right - SAFE.left) / 2, CY = 905;
  const names = GATHER.map((g) => STORES[g.key].short).join("  ·  ");
  const nameSize = Math.min(44, Math.floor(fitText({ text: names, withinWidth: SAFE_W, fontFamily: F.sup }).fontSize));
  const nk = useSpring(30);
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <Headline text="كلهم في وجيز" delay={6} color={C.ink} />
      {GATHER.map((g, i) => {
        const k = useSpring(4 + i * 3, 20, 150);
        const cx = CX + g.dx * S / 2, cy = CY + g.dy * S / 2;
        const size = S * interpolate(k, [0, 1], [0.2, 1]) - 8;
        return (
          <div key={g.key} style={{ position: "absolute", left: cx - size / 2, top: cy - size / 2, width: size, height: size, clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", opacity: Math.min(1, k * 3) }}>
            <Img src={staticFile(g.src)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "saturate(1.08) contrast(1.05) sepia(0.06)", scale: interpolate(frame, [0, 80], [1.25, 1.1], clamp) }} />
          </div>
        );
      })}
      {/* حدٌّ ذهبيّ رفيع حول المعيّن الكبير */}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <polygon points={`${CX},${CY - S} ${CX + S},${CY} ${CX},${CY + S} ${CX - S},${CY}`} fill="none" stroke={C.gold} strokeWidth={4}
          strokeDasharray={4 * S * Math.SQRT2} strokeDashoffset={4 * S * Math.SQRT2 * (1 - interpolate(frame, [14, 40], [0, 1], { ...clamp, easing: EASE_INOUT }))} />
      </svg>
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 1300 - nameSize * 1.4, direction: "rtl", textAlign: "center", fontFamily: F.sup, fontSize: nameSize, color: C.brand, opacity: nk, translate: `0 ${(1 - nk) * 16}px`, whiteSpace: "nowrap" }}>
        {names}
      </div>
    </AbsoluteFill>
  );
};

// ═══ ٦: صفحة متجر قشطوطة داخل الهاتف — الطلب ═══════════════════════════
const PRODUCTS = [
  { name: "باسطة سودانية", price: "18,000", src: "shops/qashtouta_3.png" },
  { name: "بسبوسة", price: "18,000", src: "shops/qashtouta_2.png" },
  { name: "باسطة", price: "18,000", src: "shops/qashtouta_1.png" },
  { name: "خشاف سادة", price: "6,000", src: "shops/qashtouta_4.png" },
];
const PHONE_TOP = 520, PHONE_SCALE = 0.82;
export const StoreScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = useSpring(0, 22, 120);
  const TAP = 46, ADDED = 52, BAR = 56, TAP2 = 96, DONE = 102;
  const added = frame >= ADDED;
  const fly = interpolate(frame, [ADDED - 2, ADDED + 16], [0, 1], { ...clamp, easing: EASE_INOUT });
  const badge = useSpring(ADDED + 16, 9, 260);
  const bar = useSpring(BAR, 20, 160);
  const done = frame >= DONE;
  const cx = (W - SAFE.right + SAFE.left) / 2;
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <Headline text="اختار من متجرك، واطلب" delay={8} color={C.ink} />
      <div style={{ position: "absolute", left: cx - PHONE_W / 2, top: PHONE_TOP + (1 - enter) * 900, scale: `${PHONE_SCALE}`, transformOrigin: "50% 0%", rotate: `${(1 - enter) * 6}deg` }}>
        <Phone>
          <StatusBar />
          {/* رأس المتجر */}
          <div style={{ height: 300, background: `linear-gradient(160deg, #0F5C40, ${C.deep})`, position: "relative", direction: "rtl", padding: "104px 40px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
              <div style={{ width: 120, height: 120, borderRadius: 60, overflow: "hidden", border: "4px solid rgba(255,255,255,.9)", flex: "none" }}>
                <Img src={staticFile(STORES.qashtouta.logo)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div>
                <div style={{ fontFamily: F.sup, fontSize: 38, color: C.white, lineHeight: 1.25, whiteSpace: "nowrap" }}>{STORES.qashtouta.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                  <Stars size={24} />
                  <span style={{ fontFamily: F.latB, fontSize: 24, color: "#F5B301" }}>5.0</span>
                  <span style={{ fontFamily: F.sup, fontSize: 22, color: "#BFE5D2", background: "rgba(255,255,255,.12)", borderRadius: 999, padding: "2px 14px", marginInlineStart: 8 }}>● مفتوح</span>
                </div>
              </div>
            </div>
          </div>
          {/* البحث والتصنيفات */}
          <div style={{ padding: "24px 28px 0", direction: "rtl" }}>
            <div style={{ height: 70, borderRadius: 35, background: C.white, border: `2px solid ${C.line}`, display: "flex", alignItems: "center", padding: "0 26px", fontFamily: F.sup, fontSize: 26, color: "#9AA59F" }}>ابحث في منتجات هذا المتجر…</div>
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              {["الكل", "باسطة", "بسبوسة", "مشروبات"].map((t, i) => (
                <span key={t} style={{ fontFamily: F.sup, fontSize: 24, padding: "10px 24px", borderRadius: 999, background: i === 0 ? C.orange : C.white, color: i === 0 ? "#fff" : C.ink, border: i === 0 ? "none" : `2px solid ${C.line}` }}>{t}</span>
              ))}
            </div>
          </div>
          {/* المنتجات */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, padding: "22px 28px", direction: "rtl" }}>
            {PRODUCTS.map((p, i) => {
              const pk = useSpring(10 + i * 3, 200, 170);
              const isTarget = i === 0;
              return (
                <div key={i} style={{ background: C.white, borderRadius: 26, overflow: "hidden", boxShadow: "0 6px 18px rgba(8,40,28,.08)", opacity: pk, translate: `0 ${(1 - pk) * 40}px` }}>
                  <div style={{ height: 170, overflow: "hidden" }}>
                    <Img src={staticFile(p.src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ padding: "14px 18px 18px" }}>
                    <div style={{ fontFamily: F.sup, fontSize: 28, color: C.ink }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "6px 0 12px" }}>
                      <span style={{ fontFamily: F.latB, fontSize: 30, color: C.green }}>{p.price}</span>
                      <span style={{ fontFamily: F.sup, fontSize: 22, color: C.green }}>ج.س</span>
                    </div>
                    <div style={{
                      height: 60, borderRadius: 16, display: "grid", placeItems: "center", fontFamily: F.sup, fontSize: 25, color: "#fff",
                      background: isTarget && added ? C.green : `linear-gradient(180deg, #F5A623, ${C.orange})`,
                      scale: isTarget ? `${1 - 0.06 * interpolate(frame, [TAP, TAP + 3, TAP + 8], [0, 1, 0], clamp)}` : "1",
                    }}>{isTarget && added ? "في السلة ✓" : "أضف للسلة"}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* شريط الطلب */}
          <div style={{
            position: "absolute", left: 28, right: 28, top: 850 + (1 - bar) * 700, height: 104, borderRadius: 30, direction: "rtl",
            background: done ? C.brand : C.green, boxShadow: "0 18px 40px rgba(8,57,42,.35)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 34px",
            scale: `${1 - 0.04 * interpolate(frame, [TAP2, TAP2 + 3, TAP2 + 8], [0, 1, 0], clamp)}`,
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ width: 52, height: 52, borderRadius: 26, background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center", fontFamily: F.latB, fontSize: 26, color: "#fff", scale: `${badge}` }}>1</span>
              <span style={{ fontFamily: F.sup, fontSize: 34, color: "#fff" }}>{done ? "تم الطلب ✓" : "اطلب الآن"}</span>
            </span>
            <span style={{ fontFamily: F.latB, fontSize: 32, color: "#fff" }}>18,000 <span style={{ fontFamily: F.sup, fontSize: 24 }}>ج.س</span></span>
          </div>
          {/* المنتج يطير معيّناً إلى السلة */}
          {fly > 0 && fly < 1 ? (
            <div style={{
              position: "absolute", width: 120, height: 120, clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
              left: interpolate(fly, [0, 1], [397, 470]), top: interpolate(fly, [0, 1], [520, 860]) - Math.sin(fly * Math.PI) * 160,
              scale: `${interpolate(fly, [0, 1], [1.2, 0.3])}`,
            }}>
              <Img src={staticFile(PRODUCTS[0].src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ) : null}
          {/* لمسات الإصبع */}
          <Tap x={457} y={796} at={TAP} />
          <Tap x={302} y={902} at={TAP2} />
        </Phone>
      </div>
    </AbsoluteFill>
  );
};
const Tap: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -6 || t > 18) return null;
  const press = interpolate(t, [-6, 0, 4, 12], [0, 1, 1, 0], clamp);
  return (
    <>
      <div style={{ position: "absolute", left: x - 34, top: y - 34, width: 68, height: 68, borderRadius: 34, background: "rgba(11,31,23,.28)", border: "3px solid rgba(255,255,255,.9)", opacity: press, scale: `${0.8 + 0.2 * press}` }} />
      <div style={{ position: "absolute", left: x - 34, top: y - 34, width: 68, height: 68, borderRadius: 34, border: `4px solid ${C.gold}`, opacity: interpolate(t, [0, 16], [0.9, 0], clamp), scale: `${interpolate(t, [0, 16], [1, 2.6], clamp)}` }} />
    </>
  );
};

// ═══ ٧: الطريق — خريطة مبسّطة بلا مدينة، والكابتن يرسم مساره ═════════════
const ROUTE = [[250, 1230], [250, 1060], [520, 1060], [520, 840], [800, 840], [800, 640]];
function along(u: number) {
  const seg: number[] = []; let tot = 0;
  for (let i = 1; i < ROUTE.length; i++) { const l = Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]); seg.push(l); tot += l; }
  let d = Math.max(0, Math.min(1, u)) * tot;
  for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = seg[i] ? Math.min(1, d / seg[i]) : 0; return { x: ROUTE[i][0] + (ROUTE[i + 1][0] - ROUTE[i][0]) * k, y: ROUTE[i][1] + (ROUTE[i + 1][1] - ROUTE[i][1]) * k, i, tot }; } d -= seg[i]; }
  return { x: 0, y: 0, i: 0, tot };
}
export const RouteScene: React.FC = () => {
  const frame = useCurrentFrame();
  const u = interpolate(frame, [18, 80], [0, 1], { ...clamp, easing: EASE_INOUT });
  const p = along(u);
  const tot = along(1).tot;
  const ps = useSpring(6, 10, 220), ph = useSpring(12, 10, 220), arrive = useSpring(80, 10, 260);
  const chip = useSpring(24, 20, 160);
  const mins = Math.max(1, Math.round(interpolate(u, [0, 1], [12, 1])));
  const pulse = (frame % 30) / 30;
  return (
    <AbsoluteFill style={{ background: "#EEE8DB" }}>
      {/* شوارع وبلوكات */}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, scale: `${interpolate(frame, [0, 90], [1.06, 1], clamp)}` }}>
        {Array.from({ length: 9 }, (_, r) => Array.from({ length: 5 }, (_, c) => (
          <rect key={`${r}-${c}`} x={-60 + c * 270 + (r % 2) * 40} y={480 + r * 190} width={220} height={140} rx={26} fill="#E2DACA" />
        )))}
        <polyline points={ROUTE.map((q) => q.join(",")).join(" ")} fill="none" stroke="rgba(10,135,84,.18)" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={ROUTE.map((q) => q.join(",")).join(" ")} fill="none" stroke={C.green} strokeWidth={26} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={tot} strokeDashoffset={tot * (1 - u)} />
      </svg>
      {/* المتجر (شعار قشطوطة) والبيت */}
      <div style={{ position: "absolute", left: 250 - 62, top: 1230 - 62, width: 124, height: 124, borderRadius: 62, overflow: "hidden", border: "6px solid #fff", boxShadow: "0 10px 26px rgba(8,40,28,.25)", scale: `${ps}` }}>
        <Img src={staticFile(STORES.qashtouta.logo)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <svg width="150" height="170" viewBox="-75 -150 150 170" style={{ position: "absolute", left: 800 - 75, top: 640 - 150, scale: `${ph * (1 + arrive * 0.2)}`, transformOrigin: "50% 88%" }}>
        <path d="M0 0C-55-58-44-108 0-108S55-58 0 0Z" fill={arrive > 0.5 ? C.gold : C.brand} />
        <path d="M-22-66 0-86 22-66V-44H-22Z" fill="#fff" />
      </svg>
      {/* الكابتن */}
      <div style={{ position: "absolute", left: p.x - 56, top: p.y - 56, width: 112, height: 112 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 56, border: `6px solid ${C.green}`, opacity: 1 - pulse, scale: `${1 + pulse * 0.9}` }} />
        <div style={{ position: "absolute", inset: 8, borderRadius: 48, background: C.brand, display: "grid", placeItems: "center", boxShadow: "0 10px 24px rgba(8,40,28,.35)" }}>
          <svg width="46" height="46" viewBox="-12 -12 24 24"><path d="M-4-7 4 0-4 7" fill="none" stroke={C.gold} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>
      <TopFade />
      <Headline text="والكابتن جايك" delay={6} color={C.ink} />
      {/* شريحة الوقت — داخل المنطقة الآمنة */}
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 1200, display: "flex", justifyContent: "center", opacity: chip, translate: `0 ${(1 - chip) * 30}px` }}>
        <div style={{ direction: "rtl", display: "flex", alignItems: "center", gap: 18, background: C.deep, borderRadius: 999, padding: "20px 40px", boxShadow: "0 16px 36px rgba(8,40,28,.3)" }}>
          <span style={{ width: 18, height: 18, borderRadius: 9, background: "#3DDC97" }} />
          <span style={{ fontFamily: F.sup, fontSize: 40, color: "#fff" }}>{arrive > 0.5 ? "الكابتن وصل" : "الكابتن في الطريق"}</span>
          {arrive > 0.5 ? null : <span style={{ fontFamily: F.latB, fontSize: 38, color: C.gold }}>{mins} <span style={{ fontFamily: F.sup, fontSize: 30 }}>دقيقة</span></span>}
        </div>
      </div>
    </AbsoluteFill>
  );
};
const TopFade: React.FC = () => <AbsoluteFill style={{ background: "linear-gradient(180deg, #EEE8DB 0%, #EEE8DB 26%, rgba(238,232,219,0) 36%)" }} />;

// ═══ ٨: الوصول — كيس وجيز وعليه شعار المتجر ═════════════════════════════
export const ArriveScene: React.FC = () => {
  const frame = useCurrentFrame();
  const open = interpolate(frame, [4, 22], [0, 1], { ...clamp, easing: EASE_INOUT });
  const bag = useSpring(14, 12, 170);
  const cx = (W - SAFE.right + SAFE.left) / 2;
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      {/* ضوءٌ دافئ من الباب */}
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${cx}px 900px, rgba(227,163,59,.28), rgba(227,163,59,0) 55%)`, opacity: open }} />
      <Headline text="لحدّي بابك" delay={8} color={C.ink} />
      {/* الكيس */}
      <div style={{ position: "absolute", left: cx - 230, top: 560 + (1 - bag) * -500, width: 460, height: 640, rotate: `${(1 - bag) * -8}deg` }}>
        <svg width="460" height="640" viewBox="0 0 460 640" style={{ position: "absolute", inset: 0 }}>
          <path d="M150 150V110a80 80 0 0 1 160 0v40" fill="none" stroke={C.brand} strokeWidth="22" strokeLinecap="round" />
          <path d="M40 150h380l26 470H14Z" fill={C.green} />
          <path d="M40 150h380l4 70H36Z" fill={C.brand} opacity=".55" />
        </svg>
        <Img src={staticFile("brand/logo-mark-white.png")} style={{ position: "absolute", left: 230 - 95, top: 250, width: 190 }} />
        <div style={{ position: "absolute", left: 230 - 66, top: 470, width: 132, height: 132, borderRadius: 66, overflow: "hidden", border: "6px solid #fff", boxShadow: "0 8px 20px rgba(0,0,0,.2)" }}>
          <Img src={staticFile(STORES.qashtouta.logo)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      </div>
      {/* درفتا الباب تنزلقان */}
      {[-1, 1].map((s) => (
        <div key={s} style={{ position: "absolute", top: 0, height: H, width: W / 2 + 4, left: s < 0 ? 0 : W / 2 - 4, background: C.brand, translate: `${s * open * (W / 2 + 40)}px 0`, boxShadow: "0 0 60px rgba(0,0,0,.25)" }}>
          <div style={{ position: "absolute", top: 820, [s < 0 ? "right" : "left"]: 40, width: 22, height: 180, borderRadius: 11, background: C.gold }} />
        </div>
      ))}
    </AbsoluteFill>
  );
};

// ═══ ٩: الختام ═══════════════════════════════════════════════════════════
export const EndScene: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = useSpring(4, 18, 120);
  const cta = useSpring(16);
  const badges = [useSpring(26, 14, 200), useSpring(30, 14, 200)];
  const names = "قشطوطة  ·  ليمومكس  ·  هدايا أوشين  ·  بن بينور";
  const nameSize = Math.min(38, Math.floor(fitText({ text: names, withinWidth: SAFE_W, fontFamily: F.sup }).fontSize));
  const ctaText = "حمّل وجيز، واطلب هسّي";
  const ctaSize = Math.min(92, Math.floor(fitText({ text: ctaText, withinWidth: SAFE_W, fontFamily: F.head }).fontSize));
  const nk = useSpring(36);
  const cx = (W - SAFE.right + SAFE.left) / 2;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at ${cx}px 600px, #0B6B47, ${C.brand} 60%)` }}>
      {/* معيّنٌ ذهبيّ يحيط بالشعار — آخر صدى للفكرة */}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <polygon points={`${cx},${600 - 300} ${cx + 300},600 ${cx},${600 + 300} ${cx - 300},600`} fill="none" stroke="rgba(227,163,59,.55)" strokeWidth={4}
          strokeDasharray={1700} strokeDashoffset={1700 * (1 - interpolate(frame, [0, 30], [0, 1], { ...clamp, easing: EASE_INOUT }))} />
      </svg>
      <Img src={staticFile("brand/logo-white.png")} style={{ position: "absolute", left: cx - 210, top: 600 - 92, width: 420, opacity: Math.min(1, logo * 2), scale: `${0.8 + 0.2 * logo}` }} />
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 935, height: ctaSize * 1.5, overflow: "hidden" }}>
        <div style={{ direction: "rtl", textAlign: "center", fontFamily: F.head, fontSize: ctaSize, lineHeight: `${ctaSize * 1.5}px`, color: "#fff", translate: `0 ${(1 - cta) * ctaSize * 1.4}px`, whiteSpace: "nowrap" }}><Rich text={ctaText} font={F.head} /></div>
      </div>
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 1095, display: "flex", justifyContent: "center", gap: 28, direction: "ltr" }}>
        {[["Google Play", "play"], ["App Store", "apple"]].map(([label, ic], i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", borderRadius: 999, padding: "18px 34px", scale: `${badges[i]}` }}>
            {ic === "play"
              ? <svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 3l15 9-15 9z" fill={C.green} /></svg>
              : <svg width="30" height="30" viewBox="0 0 24 24"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" fill="none" stroke={C.green} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            <span style={{ fontFamily: F.latB, fontSize: 32, color: C.deep }}>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 1218, direction: "rtl", textAlign: "center", opacity: nk }}>
        <div style={{ fontFamily: F.sup, fontSize: nameSize, color: C.gold, whiteSpace: "nowrap" }}>{names}</div>
        <div style={{ fontFamily: F.sup, fontSize: 30, color: "rgba(255,255,255,.75)", marginTop: 4 }}>وغيرهم كتير في وجيز</div>
      </div>
    </AbsoluteFill>
  );
};
