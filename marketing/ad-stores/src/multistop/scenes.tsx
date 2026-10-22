// إعلان «مشوار واحد… بدل تلاتة» — التوصيل متعدد النقاط من الرئيسية.
// لغة الإعلان: خطٌّ أخضر واحد متّصل (الحل) مقابل خطوطٍ رمادية منفصلة (المشكلة).
import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { fitText } from "@remotion/layout-utils";
import { C, EASE_INOUT, EASE_OUT, F, H, SAFE, SAFE_W, W, clamp } from "../theme";
import { Headline, Phone, PHONE_W, Rich, StatusBar, useSpring } from "../components";

export const GRAY = "#B8B2A4";
const CX = (W - SAFE.right + SAFE.left) / 2; // مركز المنطقة الآمنة أفقياً (515)

// ── الخريطة المبسّطة: المتجر وثلاثة زبائن ───────────────────────────────
const STORE = { x: 540, y: 1010 };
const HOMES = [
  { x: 270, y: 1240, name: "منى" },   // الأقرب — يصير 1
  { x: 250, y: 720, name: "أحمد" },   // 2
  { x: 800, y: 760, name: "سارة" },   // 3
];
// المسار الموحّد بأقصر ترتيب: المتجر ⇐ منى ⇐ أحمد ⇐ سارة (شوارع بزوايا قائمة)
const ROUTE: [number, number][] = [[540, 1010], [540, 1240], [270, 1240], [270, 980], [250, 980], [250, 720], [520, 720], [520, 760], [800, 760]];
// المشاوير المنفصلة: من المتجر لكل بيت
const SEPARATE: [number, number][][] = [
  [[540, 1010], [540, 1240], [270, 1240]],
  [[540, 1010], [540, 880], [250, 880], [250, 720]],
  [[540, 1010], [540, 880], [800, 880], [800, 760]],
];
const plen = (p: [number, number][]) => p.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
function along(p: [number, number][], u: number) {
  let d = Math.max(0, Math.min(1, u)) * plen(p);
  for (let i = 1; i < p.length; i++) {
    const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (d <= l || i === p.length - 1) { const k = l ? Math.min(1, d / l) : 0; return { x: p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, y: p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k }; }
    d -= l;
  }
  return { x: p[0][0], y: p[0][1] };
}

const MapBase: React.FC<{ zoom?: number }> = ({ zoom = 1 }) => (
  <svg width={W} height={H} style={{ position: "absolute", inset: 0, scale: `${zoom}` }}>
    <rect width={W} height={H} fill="#EEE8DB" />
    {Array.from({ length: 10 }, (_, r) => Array.from({ length: 5 }, (_, c) => (
      <rect key={`${r}-${c}`} x={-80 + c * 270 + (r % 2) * 50} y={470 + r * 170} width={210} height={118} rx={24} fill="#E3DBCB" />
    )))}
  </svg>
);
const StorePin: React.FC<{ k: number }> = ({ k }) => (
  <div style={{ position: "absolute", left: STORE.x - 70, top: STORE.y - 70, width: 140, height: 140, borderRadius: 40, background: C.brand, display: "grid", placeItems: "center", scale: `${k}`, boxShadow: "0 14px 30px rgba(8,57,42,.35)" }}>
    <svg width="74" height="74" viewBox="0 0 24 24"><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5v.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0v-.5M5.5 12.5V20h13v-7.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" /></svg>
  </div>
);
const HomePin: React.FC<{ x: number; y: number; k: number; label?: string; color?: string; done?: number }> = ({ x, y, k, label, color = C.ink, done = 0 }) => (
  <div style={{ position: "absolute", left: x - 50, top: y - 112, width: 100, height: 120, scale: `${k}`, transformOrigin: "50% 95%" }}>
    <svg width="100" height="120" viewBox="-50 -112 100 120" style={{ position: "absolute", inset: 0 }}>
      <path d="M0 0C-44-46-36-96 0-96S44-46 0 0Z" fill={done > 0.5 ? C.green : color} />
    </svg>
    <div style={{ position: "absolute", left: 22, top: 18, width: 56, height: 56, borderRadius: 28, background: "#fff", display: "grid", placeItems: "center", fontFamily: F.latB, fontSize: 30, color: done > 0.5 ? C.green : color }}>
      {done > 0.5 ? "✓" : label}
    </div>
  </div>
);
const Poly: React.FC<{ p: [number, number][]; color: string; w?: number; u?: number; dash?: string; opacity?: number }> = ({ p, color, w = 22, u = 1, dash, opacity = 1 }) => {
  const L = plen(p);
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity }}>
      <polyline points={p.map((q) => q.join(",")).join(" ")} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={dash || `${L}`} strokeDashoffset={dash ? 0 : L * (1 - u)} />
    </svg>
  );
};
// بطاقة «أجرة» — قطعة نقدٍ صغيرة بكلمة
const Fare: React.FC<{ x: number; y: number; k: number; gray?: boolean }> = ({ x, y, k, gray }) => (
  <div style={{ position: "absolute", left: x - 92, top: y - 34, width: 184, height: 68, borderRadius: 34, background: gray ? "#fff" : C.gold, border: `3px solid ${gray ? GRAY : C.gold}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, direction: "rtl", scale: `${k}`, boxShadow: "0 10px 22px rgba(8,40,28,.18)" }}>
    <span style={{ width: 34, height: 34, borderRadius: 17, background: gray ? GRAY : "#fff", display: "grid", placeItems: "center", fontFamily: F.latB, fontSize: 20, color: gray ? "#fff" : C.goldD }}>$</span>
    <span style={{ fontFamily: F.sup, fontSize: 30, color: gray ? C.gray : C.deep }}>أجرة</span>
  </div>
);

// ═══ ١: الخطّاف — ثلاثة طلبات تنزل على تلفون التاجر ═════════════════════
const ORDERS = [
  { who: "سارة", what: "بسبوسة × 2" },
  { who: "أحمد", what: "علبة باسطة" },
  { who: "منى", what: "بسبوسة بالقشطة" },
];
export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = useSpring(0, 22, 140);
  const shake = (at: number) => Math.sin((frame - at) * 2.2) * 6 * Math.max(0, 1 - (frame - at) / 10) * (frame >= at ? 1 : 0);
  const sh = shake(14) + shake(26) + shake(38);
  const count = frame >= 38 ? 3 : frame >= 26 ? 2 : frame >= 14 ? 1 : 0;
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <Headline text="عندك 3 طلبات؟" delay={44} color={C.ink} />
      <div style={{ position: "absolute", left: CX - PHONE_W / 2, top: 520 + (1 - enter) * 900, scale: "0.82", transformOrigin: "50% 0%", translate: `${sh}px 0` }}>
        <Phone>
          <AbsoluteFill style={{ background: `linear-gradient(170deg, #0F5C40, ${C.deep})` }} />
          <StatusBar />
          <div style={{ position: "absolute", top: 120, width: "100%", textAlign: "center", fontFamily: F.latB, fontSize: 120, color: "rgba(255,255,255,.92)" }}>2:00</div>
          {ORDERS.map((o, i) => {
            const at = 14 + i * 12, k = useSpring(at, 16, 200);
            return (
              <div key={i} style={{
                position: "absolute", left: 26, right: 26, top: 330 + (2 - i) * 0 + i * 150 + (1 - k) * -120, height: 132, borderRadius: 34, background: "rgba(255,255,255,.94)",
                opacity: Math.min(1, k * 2), direction: "rtl", display: "flex", alignItems: "center", gap: 20, padding: "0 26px", boxShadow: "0 12px 30px rgba(0,0,0,.25)",
              }}>
                <div style={{ width: 76, height: 76, borderRadius: 20, background: C.green, display: "grid", placeItems: "center", flex: "none" }}>
                  <Img src={staticFile("brand/logo-mark-white.png")} style={{ width: 52 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: F.sup, fontSize: 30, color: C.ink }}>طلب جديد</span>
                    <span style={{ fontFamily: F.sup, fontSize: 22, color: C.gray }}>الآن</span>
                  </div>
                  <div style={{ fontFamily: F.sup, fontSize: 26, color: C.gray, marginTop: 4 }}>{o.who}: {o.what}</div>
                </div>
              </div>
            );
          })}
          {/* عدّاد الطلبات */}
          <div style={{ position: "absolute", left: "50%", top: 830, translate: "-50% 0", direction: "rtl", fontFamily: F.sup, fontSize: 30, color: "rgba(255,255,255,.85)", opacity: count ? 1 : 0 }}>
            <span style={{ fontFamily: F.latB, fontSize: 40, color: C.gold }}>{count}</span> طلبات جديدة
          </div>
        </Phone>
      </div>
    </AbsoluteFill>
  );
};

// ═══ ٢: المشكلة — ثلاثة مشاوير رمادية وثلاث أجرات ═══════════════════════
export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <MapBase zoom={interpolate(frame, [0, 84], [1.04, 1], clamp)} />
      {SEPARATE.map((p, i) => (
        <Poly key={i} p={p} color={GRAY} w={18} u={interpolate(frame, [8 + i * 8, 34 + i * 8], [0, 1], { ...clamp, easing: EASE_INOUT })} />
      ))}
      <StorePin k={useSpring(2, 12, 220)} />
      {HOMES.map((h, i) => <HomePin key={i} x={h.x} y={h.y} k={useSpring(6 + i * 4, 12, 220)} color={GRAY} label="" />)}
      {/* أجرةٌ عند نهاية كل مشوار */}
      {HOMES.map((h, i) => <Fare key={i} x={h.x + (h.x < 500 ? 175 : -175)} y={h.y - 50} k={useSpring(34 + i * 8, 12, 220)} gray />)}
      <TopFade />
      <Headline text="يعني 3 مشاوير… و3 أجرات؟" delay={6} color={C.ink} />
    </AbsoluteFill>
  );
};
const TopFade: React.FC = () => <AbsoluteFill style={{ background: "linear-gradient(180deg, #EEE8DB 0%, #EEE8DB 25%, rgba(238,232,219,0) 34%)" }} />;

// ═══ ٣: التحوّل — الخطوط تتوحّد خطاً أخضر واحداً، وأجرةٌ واحدة تبقى ══════
export const MergeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 16], [1, 0], clamp);
  const u = interpolate(frame, [10, 44], [0, 1], { ...clamp, easing: EASE_INOUT });
  const fly = interpolate(frame, [20, 40], [0, 1], { ...clamp, easing: EASE_INOUT });
  return (
    <AbsoluteFill>
      <MapBase />
      {SEPARATE.map((p, i) => <Poly key={i} p={p} color={GRAY} w={18} opacity={fade} />)}
      <Poly p={ROUTE} color="rgba(10,135,84,.2)" w={30} u={1} opacity={1 - fade} />
      <Poly p={ROUTE} color={C.green} w={30} u={u} />
      <StorePin k={1} />
      {HOMES.map((h, i) => <HomePin key={i} x={h.x} y={h.y} k={1} color={u > [0.2, 0.55, 0.95][i] ? C.brand : GRAY} label="" />)}
      {/* أجرتان تطيران خارج الإطار، وتبقى واحدة ذهبية */}
      {HOMES.map((h, i) => {
        const x0 = h.x + (h.x < 500 ? 175 : -175), y0 = h.y - 50;
        if (i === 0) return <Fare key={i} x={interpolate(fly, [0, 1], [x0, STORE.x + 170])} y={interpolate(fly, [0, 1], [y0, STORE.y])} k={1} gray={fly < 0.6} />;
        return <Fare key={i} x={x0 + fly * (h.x < 500 ? -700 : 700)} y={y0 - fly * 300} k={1 - fly * 0.4} gray />;
      })}
      <TopFade />
      <Headline text="في وجيز: مشوار واحد" delay={6} color={C.ink} />
    </AbsoluteFill>
  );
};

// ═══ ٤: من الرئيسية — إضافة الوجهات ═════════════════════════════════════
const ROW = 82, CARD_TOP = 268;
const Field: React.FC<{ icon: "pickup" | "drop"; text: string; sub?: string; k: number; filled?: boolean }> = ({ icon, text, sub, k, filled = true }) => (
  <div style={{ height: 70, borderRadius: 18, border: `2px solid ${icon === "pickup" ? C.green : "#F0C9C9"}`, background: filled ? "#fff" : "#FAFAF7", display: "flex", alignItems: "center", gap: 14, padding: "0 18px", direction: "rtl", opacity: k, translate: `0 ${(1 - k) * -24}px`, marginBottom: 12 }}>
    {icon === "pickup"
      ? <svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5v.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0v-.5M5.5 12.5V20h13v-7.5" fill="none" stroke={C.green} strokeWidth="2" strokeLinejoin="round" /></svg>
      : <svg width="28" height="28" viewBox="0 0 24 24"><path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="#E04848" stroke="#E04848" strokeWidth="2" strokeLinejoin="round" /></svg>}
    <span style={{ fontFamily: F.sup, fontSize: 27, color: C.ink, flex: 1 }}>{text}</span>
    {sub ? <span style={{ fontFamily: F.sup, fontSize: 22, color: C.gray }}>{sub}</span> : null}
  </div>
);
export const HomeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = useSpring(0, 22, 130);
  const TAP1 = 62, TAP2 = 100;
  const s1 = useSpring(TAP1 + 6, 18, 200), s2 = useSpring(TAP2 + 6, 18, 200), d1 = useSpring(30, 18, 200), p0 = useSpring(18, 18, 200);
  const extras = (frame >= TAP1 + 6 ? 1 : 0) + (frame >= TAP2 + 6 ? 1 : 0);
  const BTN0 = CARD_TOP + 24 + 40 + ROW + 40 + ROW + 8; // زرّ «أضف وجهة» قبل أي إضافة
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <Headline text="أضف وجهات زبائنك" sub="من الشاشة الرئيسية" delay={8} color={C.ink} subColor={C.green} />
      <div style={{ position: "absolute", left: CX - PHONE_W / 2, top: 590 + (1 - enter) * 900, scale: "0.82", transformOrigin: "50% 0%", rotate: `${(1 - enter) * 5}deg` }}>
        <Phone>
          <StatusBar />
          {/* رأس الرئيسية */}
          <div style={{ height: 250, background: `linear-gradient(160deg, #0F5C40, ${C.deep})`, direction: "rtl", padding: "104px 36px 0", display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: F.sup, fontSize: 36, color: "#fff" }}>مرحباً بك</div>
              <div style={{ fontFamily: F.sup, fontSize: 24, color: "#BFE5D2", marginTop: 4 }}>طلبك وين ماشي اليوم؟</div>
            </div>
            <Img src={staticFile("brand/logo-white.png")} style={{ height: 70, marginTop: 6 }} />
          </div>
          {/* بطاقة الطلب */}
          <div style={{ position: "absolute", top: CARD_TOP, left: 22, right: 22, background: "#fff", borderRadius: 30, padding: "24px 22px 20px", boxShadow: "0 10px 30px rgba(8,40,28,.10)", direction: "rtl" }}>
            <div style={{ fontFamily: F.sup, fontSize: 25, color: C.green, height: 40 }}>● من وين؟ <span style={{ color: C.gray, fontSize: 21 }}>(موقع الاستلام)</span></div>
            <Field icon="pickup" text="متجرك" sub="الاستلام" k={p0} />
            <div style={{ fontFamily: F.sup, fontSize: 25, color: "#D64545", height: 40 }}>● لوين؟ <span style={{ color: C.gray, fontSize: 21 }}>(موقع التسليم)</span></div>
            <Field icon="drop" text="سارة — البيت" k={d1} />
            {extras >= 1 ? <Field icon="drop" text="أحمد — الشغل" sub="وجهة 2" k={s1} /> : null}
            {extras >= 2 ? <Field icon="drop" text="منى — البيت" sub="وجهة 3" k={s2} /> : null}
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <div style={{ flex: 1, height: 64, borderRadius: 16, border: `2.5px solid ${C.green}`, display: "grid", placeItems: "center", fontFamily: F.sup, fontSize: 24, color: C.green,
                background: (frame >= TAP1 && frame < TAP1 + 8) || (frame >= TAP2 && frame < TAP2 + 8) ? "#E3F4EA" : "#fff" }}>+ أضف وجهة تسليم</div>
              <div style={{ flex: 1, height: 64, borderRadius: 16, border: "2.5px solid #C9C3B5", display: "grid", placeItems: "center", fontFamily: F.sup, fontSize: 24, color: C.gray }}>+ أضف نقطة استلام</div>
            </div>
            <div style={{ fontFamily: F.sup, fontSize: 19, color: C.gray, marginTop: 12 }}>يمرّ الكابتن على كل نقاط الاستلام أولاً، ثم يوصّل للوجهات بالترتيب</div>
          </div>
          {/* تقدير السعر وزرّ الطلب */}
          <div style={{ position: "absolute", top: CARD_TOP + 410 + extras * ROW, left: 22, right: 22, direction: "rtl" }}>
            <div style={{ background: "#fff", borderRadius: 30, padding: "20px 22px", boxShadow: "0 10px 30px rgba(8,40,28,.10)" }}>
              <div style={{ fontFamily: F.sup, fontSize: 25, color: C.ink, marginBottom: 14 }}>تقدير السعر</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 70, height: 70, borderRadius: 16, background: C.green, color: "#fff", display: "grid", placeItems: "center", fontSize: 40 }}>+</div>
                <div style={{ flex: 1, height: 70, borderRadius: 16, border: `2.5px solid ${C.green}`, background: "#EAF7EF", display: "grid", placeItems: "center", fontFamily: F.sup, fontSize: 26, color: C.green }}>مشوار واحد · {extras + 1} {extras + 1 > 1 ? "وجهات" : "وجهة"}</div>
                <div style={{ width: 70, height: 70, borderRadius: 16, background: C.green, color: "#fff", display: "grid", placeItems: "center", fontSize: 40 }}>−</div>
              </div>
            </div>
            <div style={{ marginTop: 18, height: 88, borderRadius: 44, background: C.deep, display: "grid", placeItems: "center", fontFamily: F.sup, fontSize: 32, color: "#fff" }}>اطلب الكابتن الآن</div>
          </div>
          <Tap x={434} y={BTN0 + 32} at={TAP1} />
          <Tap x={434} y={BTN0 + ROW + 32} at={TAP2} />
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
      <div style={{ position: "absolute", left: x - 34, top: y - 34, width: 68, height: 68, borderRadius: 34, background: "rgba(11,31,23,.28)", border: "3px solid rgba(255,255,255,.9)", opacity: press }} />
      <div style={{ position: "absolute", left: x - 34, top: y - 34, width: 68, height: 68, borderRadius: 34, border: `4px solid ${C.gold}`, opacity: interpolate(t, [0, 16], [0.9, 0], clamp), scale: `${interpolate(t, [0, 16], [1, 2.6], clamp)}` }} />
    </>
  );
};

// ═══ ٥: أقصر طريق — الترقيم يُعاد بأقصر ترتيب، والكابتن يسلّم واحداً واحداً ═══
export const RouteScene: React.FC = () => {
  const frame = useCurrentFrame();
  const order = frame >= 22 ? [1, 2, 3] : [3, 1, 2]; // قبل الترتيب: بترتيب الإضافة (سارة 1، أحمد 2، منى 3)
  const flip = interpolate(frame, [18, 26], [0, 1], clamp);
  const u = interpolate(frame, [26, 84], [0, 1], { ...clamp, easing: EASE_INOUT });
  const p = along(ROUTE, u);
  const doneAt = [0.25, 0.62, 0.99];
  const pulse = (frame % 30) / 30;
  return (
    <AbsoluteFill>
      <MapBase />
      <Poly p={ROUTE} color="rgba(10,135,84,.22)" w={30} />
      <Poly p={ROUTE} color={C.green} w={30} u={u} />
      <StorePin k={1} />
      {HOMES.map((h, i) => (
        <div key={i} style={{ scale: `${1 - 0.25 * Math.sin(flip * Math.PI)}` }}>
          <HomePin x={h.x} y={h.y} k={1} color={C.brand} label={String(order[i])} done={u >= doneAt[i] ? 1 : 0} />
        </div>
      ))}
      <div style={{ position: "absolute", left: p.x - 54, top: p.y - 54, width: 108, height: 108 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 54, border: `6px solid ${C.green}`, opacity: 1 - pulse, scale: `${1 + pulse * 0.9}` }} />
        <div style={{ position: "absolute", inset: 8, borderRadius: 46, background: C.deep, display: "grid", placeItems: "center", boxShadow: "0 10px 24px rgba(8,40,28,.35)" }}>
          <svg width="44" height="44" viewBox="-12 -12 24 24"><path d="M-4-7 4 0-4 7" fill="none" stroke={C.gold} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>
      <TopFade />
      <Headline text="والتطبيق يرتّبها بأقصر طريق" delay={6} color={C.ink} />
    </AbsoluteFill>
  );
};

// ═══ ٦: الحساب — أجرة أساسية واحدة بدل تلاتة (بلا أرقام: المنطق وحده) ═══════
const Block: React.FC<{ h: number; color: string; label: string; k: number; ink?: string; size?: number }> = ({ h, color, label, k, ink = "#fff", size = 28 }) => (
  <div style={{ height: h * k, overflow: "hidden", borderRadius: 16, background: color, display: "grid", placeItems: "center", marginTop: 8, opacity: k > 0.02 ? 1 : 0 }}>
    <span style={{ fontFamily: F.sup, fontSize: size, color: ink, whiteSpace: "nowrap" }}>{label}</span>
  </div>
);
export const CompareScene: React.FC = () => {
  const colW = 300, BASE = 150, DIST = 190, STOP = 46;
  const k = (i: number) => useSpring(14 + i * 4, 20, 190);
  const save = useSpring(62, 10, 220);
  const labelSize = (t: string) => Math.min(40, Math.floor(fitText({ text: t, withinWidth: colW, fontFamily: F.sup }).fontSize));
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <Headline text="أجرة أساسية واحدة… بدل تلاتة" sub="والسعر النهائي حسب المسافة ورسوم النقاط في مدينتك" delay={6} color={C.ink} subColor={C.gray} />
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 560, height: 740, display: "flex", justifyContent: "space-around", alignItems: "flex-end", direction: "rtl" }}>
        {/* ٣ مشاوير */}
        <div style={{ width: colW, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <Block h={DIST} color="#D9D2C2" label="المسافة" ink={C.gray} k={k(0)} />
          <Block h={BASE} color={GRAY} label="أجرة أساسية" k={k(1)} />
          <Block h={BASE} color={GRAY} label="أجرة أساسية" k={k(2)} />
          <Block h={BASE} color={GRAY} label="أجرة أساسية" k={k(3)} />
          <div style={{ fontFamily: F.sup, fontSize: labelSize("3 مشاوير"), color: C.gray, textAlign: "center", marginTop: 18 }}>3 مشاوير</div>
        </div>
        {/* مشوار واحد */}
        <div style={{ width: colW, display: "flex", flexDirection: "column", justifyContent: "flex-end", position: "relative" }}>
          <div style={{ position: "absolute", top: -150, left: "50%", translate: "-50% 0", scale: `${save}`, background: C.gold, borderRadius: 999, padding: "12px 30px", fontFamily: F.sup, fontSize: 34, color: C.deep, whiteSpace: "nowrap", boxShadow: "0 12px 26px rgba(201,138,42,.35)" }}>أوفر</div>
          <Block h={DIST} color="#BFE0CC" label="المسافة" ink={C.brand} k={k(5)} />
          <Block h={STOP} color={C.gold} label="نقطة إضافية" ink={C.deep} size={22} k={k(6)} />
          <Block h={STOP} color={C.gold} label="نقطة إضافية" ink={C.deep} size={22} k={k(7)} />
          <Block h={BASE} color={C.green} label="أجرة أساسية" k={k(8)} />
          <div style={{ fontFamily: F.sup, fontSize: labelSize("مشوار واحد"), color: C.green, textAlign: "center", marginTop: 18 }}>مشوار واحد</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══ ٧: الفايدة للتاجر ═══════════════════════════════════════════════════
const BENEFITS = [
  { t: "توصيل أرخص لزبائنك", icon: "M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.7 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3" },
  { t: "طلبات أكتر", icon: "M4 19h16M7 16V10m5 6V6m5 10v-4" },
  { t: "تابع كل نقطة لحظة بلحظة", icon: "M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" },
];
export const BenefitScene: React.FC = () => (
  <AbsoluteFill style={{ background: C.cream }}>
    <Headline text="وفّر في التوصيل… وكسّب أكتر" delay={4} color={C.ink} />
    {BENEFITS.map((b, i) => {
      const k = useSpring(10 + i * 6, 18, 190);
      const size = Math.min(46, Math.floor(fitText({ text: b.t, withinWidth: SAFE_W - 190, fontFamily: F.sup }).fontSize));
      return (
        <div key={i} style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 580 + i * 200, height: 156, borderRadius: 40, background: i === 0 ? C.green : "#fff", display: "flex", alignItems: "center", gap: 30, padding: "0 40px", direction: "rtl", boxShadow: "0 14px 34px rgba(8,40,28,.10)", opacity: k, translate: `${(1 - k) * -160}px 0` }}>
          <div style={{ width: 92, height: 92, borderRadius: 28, background: i === 0 ? "rgba(255,255,255,.16)" : "#E7F4EC", display: "grid", placeItems: "center", flex: "none" }}>
            <svg width="50" height="50" viewBox="0 0 24 24"><path d={b.icon} fill="none" stroke={i === 0 ? "#fff" : C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <span style={{ fontFamily: F.sup, fontSize: size, color: i === 0 ? "#fff" : C.ink, whiteSpace: "nowrap" }}>{b.t}</span>
        </div>
      );
    })}
  </AbsoluteFill>
);

// ═══ ٨: الختام — الخط يرسم سهم الشعار ═══════════════════════════════════
export const EndScene: React.FC = () => {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [0, 22], [0, 1], { ...clamp, easing: EASE_INOUT });
  const logo = useSpring(16, 18, 120);
  const cta = useSpring(24);
  const badges = [useSpring(32, 14, 200), useSpring(36, 14, 200)];
  const ctaText = "وصّل لكل زبائنك في مشوار";
  const ctaSize = Math.min(84, Math.floor(fitText({ text: ctaText, withinWidth: SAFE_W * 0.96, fontFamily: F.head }).fontSize));
  const note = interpolate(frame, [40, 52], [0, 1], clamp);
  const ch = 640; // طول السهم
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at ${CX}px 600px, #0B6B47, ${C.brand} 60%)`, scale: `${interpolate(frame, [0, 72], [1, 1.03], clamp)}` }}>
      {/* السهم يُرسم ثم يتلاشى خلف الشعار */}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 1 - logo * 0.85 }}>
        <polyline points={`${CX - 120},${600 - 220} ${CX + 140},600 ${CX - 120},${600 + 220}`} fill="none" stroke={C.gold} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={ch} strokeDashoffset={ch * (1 - draw)} />
      </svg>
      <Img src={staticFile("brand/logo-white.png")} style={{ position: "absolute", left: CX - 210, top: 600 - 92, width: 420, opacity: Math.min(1, logo * 2), scale: `${0.8 + 0.2 * logo}` }} />
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 900, height: ctaSize * 1.5, overflow: "hidden" }}>
        <div style={{ direction: "rtl", textAlign: "center", fontFamily: F.head, fontSize: ctaSize, lineHeight: `${ctaSize * 1.5}px`, color: "#fff", translate: `0 ${(1 - cta) * ctaSize * 1.4}px`, whiteSpace: "nowrap" }}><Rich text={ctaText} font={F.head} /></div>
      </div>
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 1060, display: "flex", justifyContent: "center", gap: 28, direction: "ltr" }}>
        {[["Google Play", "play"], ["App Store", "apple"]].map(([label, ic], i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", borderRadius: 999, padding: "18px 34px", scale: `${badges[i]}` }}>
            {ic === "play"
              ? <svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 3l15 9-15 9z" fill={C.green} /></svg>
              : <svg width="30" height="30" viewBox="0 0 24 24"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" fill="none" stroke={C.green} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            <span style={{ fontFamily: F.latB, fontSize: 32, color: C.deep }}>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 1205, direction: "rtl", textAlign: "center", fontFamily: F.sup, fontSize: 30, color: C.gold, opacity: note }}>
        وكمان: استلام من أكتر من محل في نفس المشوار
      </div>
    </AbsoluteFill>
  );
};
export { EASE_OUT };
