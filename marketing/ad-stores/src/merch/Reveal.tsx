// كشف زيّ كباتن وجيز — 15 ث، 9:16، بإحساس إطلاق منتجٍ فاخر.
// خطٌّ زمنيّ واحد متّصل (لا مشاهد منفصلة): الكاميرا تخرج من قماش الصدر إلى
// التيشيرت كاملاً، ثم يدور للظهر، ثم يدخل الكاب ويدور، ثم الطقم معاً.
import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, EASE_INOUT, EASE_OUT, F, SAFE, SAFE_W, W, clamp } from "../theme";
import { Headline, SafeGuide } from "../components";
import { Cap, Tee } from "./garments";

export const REVEAL_FRAMES = 450;
const CX = (W - SAFE.right + SAFE.left) / 2;
const k = (f: number, a: number, b: number, e = EASE_INOUT) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: e });

// ضوءٌ علويّ مخروطي على خلفيةٍ شبه سوداء خضراء
const Stage: React.FC<{ glow: number }> = ({ glow }) => (
  <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 60% at 50% 46%, #0E3F2B 0%, #06231A 45%, #020C08 100%)" }}>
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 45% 38% at 50% 40%, rgba(120,220,170,${0.16 * glow}), rgba(0,0,0,0) 70%)` }} />
    {/* أرضيةٌ لامعة خفيفة */}
    <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 72%, rgba(10,135,84,.10) 86%, rgba(0,0,0,0) 100%)" }} />
  </AbsoluteFill>
);

export const MerchReveal: React.FC<{ guide?: boolean }> = ({ guide }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── التيشيرت: من القماش إلى الكامل (90–145)، يطفو، يدور للظهر (212–240)، يتنحّى (258–282)
  const out = k(f, 90, 148);
  const teeW = interpolate(out, [0, 1], [5200, 700]);
  // مركز الشعار على الصدر في رسم التيشيرت: (643, 280) من 1000×1100
  const focusX = interpolate(out, [0, 1], [643, 500]), focusY = interpolate(out, [0, 1], [280, 560]);
  const float = Math.sin(f / 22) * 10 * out;
  const flipA = k(f, 212, 226, EASE_INOUT), flipB = k(f, 226, 240, EASE_OUT);
  const teeSide: "front" | "back" = f < 226 ? "front" : "back";
  const flipScale = f < 226 ? 1 - flipA : flipB;
  const exit = k(f, 258, 282);
  const teeY = 1000 + float;
  const reveal = k(f, 22, 74, EASE_INOUT);
  const light = interpolate(f, [110, 200], [-0.3, 1.3], clamp) + (f > 300 ? interpolate(f, [300, 380], [-0.3, 1.3], clamp) - 1.6 : 0);

  // ── الكاب: يسقط (262–300) ويدور لجانبه (318–346)
  const capIn = spring({ frame: f - 262, fps, config: { damping: 14, stiffness: 110 } });
  const capFlipA = k(f, 318, 331), capFlipB = k(f, 331, 346, EASE_OUT);
  const capSide: "front" | "side" = f < 331 ? "front" : "side";
  const capScale = f < 331 ? 1 - capFlipA : capFlipB;

  // ── الختام (352+): الطقم معاً
  const finTee = spring({ frame: f - 356, fps, config: { damping: 200, stiffness: 120 } });
  const finCap = spring({ frame: f - 366, fps, config: { damping: 16, stiffness: 140 } });
  const logo = spring({ frame: f - 392, fps, config: { damping: 200, stiffness: 120 } });

  // إبرة التطريز: شرارةٌ على حافّة الكشف
  const needleX = CX + (598 + 90 * (1 - reveal) - focusX) * (teeW / 1000);

  const open = interpolate(f, [0, 26], [1, 0], clamp); // من الظلام

  return (
    <AbsoluteFill>
      <Stage glow={Math.min(1, f / 60)} />

      {/* التيشيرت (حتى الختام) */}
      {f < 352 ? (
        <div style={{
          position: "absolute", left: CX - (focusX / 1000) * teeW, top: teeY - (focusY / 1000) * teeW,
          translate: `${-exit * 900}px 0`, rotate: `${-exit * 8}deg`, opacity: 1 - exit,
          scale: `${flipScale} 1`, transformOrigin: `${(focusX / 1000) * teeW}px ${(focusY / 1000) * teeW}px`,
          filter: "drop-shadow(0 50px 60px rgba(0,0,0,.55))",
        }}>
          <Tee side={teeSide} id="t1" width={teeW} reveal={teeSide === "front" ? reveal : 1} light={light} />
        </div>
      ) : null}
      {/* شرارة الإبرة أثناء التطريز */}
      {f > 20 && f < 78 ? (
        <div style={{
          position: "absolute", left: needleX - 30, top: teeY - 30, width: 60, height: 60, borderRadius: 30,
          background: "radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(246,180,14,.55) 35%, rgba(246,180,14,0) 70%)",
          opacity: Math.sin(((f - 20) / 58) * Math.PI),
        }} />
      ) : null}

      {/* الكاب */}
      {f >= 258 && f < 352 ? (
        <div style={{
          position: "absolute", left: CX - 400, top: 640 + (1 - capIn) * -1400, width: 800,
          scale: `${capScale} 1`, rotate: `${(1 - capIn) * -10}deg`, filter: "drop-shadow(0 46px 50px rgba(0,0,0,.55))",
        }}>
          <Cap side={capSide} id="c1" width={800} light={light} />
        </div>
      ) : null}

      {/* الختام: الطقم معاً */}
      {f >= 352 ? (
        <>
          <div style={{ position: "absolute", left: CX - 420, top: 540 + (1 - finTee) * 120, opacity: finTee, rotate: "-5deg", filter: "drop-shadow(0 40px 50px rgba(0,0,0,.5))" }}>
            <Tee side="front" id="t2" width={560} light={interpolate(f, [380, 440], [-0.3, 1.3], clamp)} />
          </div>
          <div style={{ position: "absolute", left: CX - 40, top: 810 + (1 - finCap) * 500, opacity: Math.min(1, finCap * 2), rotate: "8deg", filter: "drop-shadow(0 36px 40px rgba(0,0,0,.55))" }}>
            <Cap side="front" id="c2" width={430} light={interpolate(f, [392, 446], [-0.3, 1.3], clamp)} />
          </div>
          <div style={{ position: "absolute", left: CX - 150, top: 1180, width: 300, opacity: logo, translate: `0 ${(1 - logo) * 20}px` }}>
            <Img src={staticFile("brand/logo-white.png")} style={{ width: "100%" }} />
          </div>
        </>
      ) : null}

      {/* العناوين — سطرٌ واحد في أعلى المنطقة الآمنة */}
      {f >= 118 && f < 212 ? <Headline text="الزي الجديد" delay={130 - 118} /> : null}
      {f >= 212 && f < 258 ? <Headline text="لكباتن وجيز" delay={226 - 212} /> : null}
      {f >= 262 && f < 352 ? <Headline text="والكاب يكمّل الطقم" delay={282 - 262} /> : null}
      {f >= 352 ? <Headline text="الزي الرسمي لكباتن وجيز" sub="عرّفهم من بعيد… بالأخضر" subColor={C.gold} delay={372 - 352} /> : null}

      {/* حرفٌ لاتيني صغير متباعد في البداية — توقيع إطلاق */}
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE_W, top: 1250, textAlign: "center", fontFamily: F.latB, fontSize: 28, letterSpacing: 14, color: "rgba(255,255,255,.7)", opacity: interpolate(f, [40, 60, 84, 96], [0, 1, 1, 0], clamp) }}>
        CAPTAIN UNIFORM
      </div>

      {/* الخروج من الظلام، وختامٌ ناعم */}
      <AbsoluteFill style={{ background: "#000", opacity: open }} />
      <AbsoluteFill style={{ background: "#000", opacity: interpolate(f, [438, 450], [0, 0.6], clamp) }} />
      {guide ? <SafeGuide /> : null}
    </AbsoluteFill>
  );
};
