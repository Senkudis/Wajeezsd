// المكوّنات المشتركة: العنوان الآمن، المعيّن، الصورة، الهاتف، وطبقة المنطقة الآمنة.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fitText } from "@remotion/layout-utils";
import { C, EASE_OUT, F, H, HEADLINE_BASELINE, SAFE, SAFE_W, W, clamp } from "./theme";

// خط Alarabiya يرسم «؟» كأنها «١» و«…» فراغاً — هاتان العلامتان بخط Arabic Modern
export const Rich: React.FC<{ text: string; font: string }> = ({ text, font }) => (
  <>
    {text.split(/([؟…])/).map((s, i) =>
      s === "؟" || s === "…" ? <span key={i} style={{ fontFamily: F.sup }}>{s}</span> : <span key={i} style={{ fontFamily: font }}>{s}</span>,
    )}
  </>
);

// ── العنوان: سطرٌ واحد، يُقاس فلا يتجاوز عرض المنطقة الآمنة أبداً ─────────
export const Headline: React.FC<{
  text: string;
  delay?: number;
  color?: string;
  max?: number;
  font?: string;
  baseline?: number;
  sub?: string;
  subColor?: string;
}> = ({ text, delay = 0, color = C.white, max = 120, font = F.head, baseline = HEADLINE_BASELINE, sub, subColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const size = Math.min(max, Math.floor(fitText({ text, withinWidth: SAFE_W * 0.96, fontFamily: font }).fontSize));
  const k = spring({ frame: frame - delay, fps, config: { damping: 200, stiffness: 180 } });
  const subSize = sub ? Math.min(64, Math.floor(fitText({ text: sub, withinWidth: SAFE_W, fontFamily: F.sup }).fontSize)) : 0;
  const ks = spring({ frame: frame - delay - 6, fps, config: { damping: 200, stiffness: 180 } });
  return (
    <>
      {/* قناعٌ بارتفاع السطر: الكلمة تصعد من تحته — لا تلاشٍ */}
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: baseline - size * 1.15, height: size * 1.5, overflow: "hidden" }}>
        <div
          style={{
            direction: "rtl", textAlign: "right", fontFamily: font, fontSize: size, lineHeight: `${size * 1.5}px`, color, whiteSpace: "nowrap",
            translate: `0 ${(1 - k) * size * 1.4}px`,
          }}
        >
          <Rich text={text} font={font} />
        </div>
      </div>
      {sub ? (
        <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: baseline + 30, height: subSize * 1.5, overflow: "hidden" }}>
          <div
            style={{
              direction: "rtl", textAlign: "right", fontFamily: F.sup, fontSize: subSize, lineHeight: `${subSize * 1.5}px`, color: subColor || color, whiteSpace: "nowrap",
              translate: `0 ${(1 - ks) * subSize * 1.4}px`,
            }}
          >
            <Rich text={sub} font={F.sup} />
          </div>
        </div>
      ) : null}
    </>
  );
};

// ── المعيّن ◇ — إطار الإعلان الوحيد ─────────────────────────────────
export const DIAMOND = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
// مقاسٌ يغطّي اللوحة كلها حين يتمركز فيها
export const DIAMOND_COVER = (W / 2 + H / 2) * 2 + 40;

export const Diamond: React.FC<{ size: number; cx?: number; cy?: number; children?: React.ReactNode; style?: React.CSSProperties }> = ({
  size, cx = W / 2, cy = H / 2, children, style,
}) => (
  <div style={{ position: "absolute", left: cx - size / 2, top: cy - size / 2, width: size, height: size, clipPath: DIAMOND, overflow: "hidden", ...style }}>
    {/* المحتوى ثابتٌ على اللوحة، والمعيّن نافذةٌ عليه */}
    <div style={{ position: "absolute", left: -(cx - size / 2), top: -(cy - size / 2), width: W, height: H }}>{children}</div>
  </div>
);

// ── صورة تملأ الإطار، بتكبيرٍ بطيء وتلوينٍ موحّد ─────────────────────
export const Photo: React.FC<{ src: string; zoomFrom?: number; zoomTo?: number; dur: number; focus?: string; grade?: string }> = ({
  src, zoomFrom = 1.06, zoomTo = 1.14, dur, focus = "50% 50%", grade = "saturate(1.08) contrast(1.05) sepia(0.06) brightness(1.02)",
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%", height: "100%", objectFit: "cover", objectPosition: focus, filter: grade,
          scale: interpolate(frame, [0, dur], [zoomFrom, zoomTo], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

// تعتيمٌ علويّ ناعم: يقرأ العنوان الأبيض فوق أي صورة
export const TopShade: React.FC<{ strength?: number }> = ({ strength = 0.62 }) => (
  <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(8,30,22,${strength}) 0%, rgba(8,30,22,${strength * 0.55}) 22%, rgba(8,30,22,0) 42%)` }} />
);

// ── الهاتف ───────────────────────────────────────────────────────────
export const PHONE_W = 640;
export const PHONE_H = 1316;
export const Phone: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      position: "absolute", width: PHONE_W, height: PHONE_H, borderRadius: 92, background: "#0E1210", padding: 18,
      boxShadow: "0 60px 120px rgba(8,40,28,.35), 0 18px 40px rgba(8,40,28,.25), inset 0 0 0 3px #2A302D", ...style,
    }}
  >
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 76, overflow: "hidden", background: C.paper }}>
      {children}
      {/* الجزيرة */}
      <div style={{ position: "absolute", top: 20, left: "50%", translate: "-50% 0", width: 170, height: 48, borderRadius: 24, background: "#050505" }} />
    </div>
  </div>
);

// شريط الحالة داخل الشاشة
export const StatusBar: React.FC<{ dark?: boolean }> = ({ dark }) => {
  const ink = dark ? C.ink : C.white;
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 88, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 56px 0", direction: "ltr", zIndex: 5 }}>
      <span style={{ fontFamily: "-apple-system, 'Segoe UI', Arial", fontWeight: 600, fontSize: 30, color: ink }}>9:41</span>
      <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
          {[10, 15, 20, 25].map((h) => <span key={h} style={{ width: 6, height: h, background: ink, borderRadius: 2 }} />)}
        </span>
        <span style={{ width: 46, height: 22, border: `3px solid ${ink}`, borderRadius: 7, padding: 2, boxSizing: "border-box" }}>
          <span style={{ display: "block", width: "80%", height: "100%", background: ink, borderRadius: 3 }} />
        </span>
      </span>
    </div>
  );
};

// ── طبقة المنطقة الآمنة (للمراجعة فقط) ───────────────────────────────
export const SafeGuide: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: SAFE.top, background: "rgba(255,0,60,.22)" }} />
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: SAFE.bottom, background: "rgba(255,0,60,.22)" }} />
    <div style={{ position: "absolute", left: 0, top: SAFE.top, bottom: SAFE.bottom, width: SAFE.left, background: "rgba(255,0,60,.22)" }} />
    <div style={{ position: "absolute", right: 0, top: SAFE.top, bottom: SAFE.bottom, width: SAFE.right, background: "rgba(255,0,60,.22)" }} />
    <div style={{ position: "absolute", left: SAFE.left, right: SAFE.right, top: SAFE.top, bottom: SAFE.bottom, outline: "3px dashed rgba(255,0,60,.9)" }} />
  </AbsoluteFill>
);

// نجومٌ للتقييم
export const Stars: React.FC<{ size?: number; value?: number }> = ({ size = 22, value = 5 }) => (
  <span style={{ display: "inline-flex", gap: 2 }}>
    {[0, 1, 2, 3, 4].map((i) => (
      <svg key={i} width={size} height={size} viewBox="0 0 24 24">
        <path d="M12 2l3 6.6 7 .7-5.3 4.8 1.6 7L12 17.4 5.7 21l1.6-7L2 9.3l7-.7z" fill={i < value ? "#F5B301" : "#D9D4C7"} />
      </svg>
    ))}
  </span>
);

// زنبركٌ مختصر
export const useSpring = (delay: number, damping = 200, stiffness = 170) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness } });
};
export const ease = (frame: number, a: number, b: number) => interpolate(frame, [a, b], [0, 1], { ...clamp, easing: EASE_OUT });
