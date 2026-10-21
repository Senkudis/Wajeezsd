// الإعلان الكامل: تسعة مشاهد، والانتقال بينها مسحٌ بمعيّن (لغة الإعلان الواحدة).
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { C, EASE_INOUT, H, W } from "./theme";
import { ArriveScene, EndScene, GatherScene, ProductScene, RouteScene, StoreScene } from "./scenes";
import { SafeGuide } from "./components";

// ── المسح بالمعيّن: المشهد الداخل يظهر داخل معيّنٍ يتّسع من المركز، بحدٍّ ذهبي ──
const DiamondWipe: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({ children, presentationDirection, presentationProgress }) => {
  if (presentationDirection === "exiting") return <AbsoluteFill>{children}</AbsoluteFill>;
  const r = presentationProgress * (W / 2 + H / 2 + 60);
  const pts = `${W / 2}px ${H / 2 - r}px, ${W / 2 + r}px ${H / 2}px, ${W / 2}px ${H / 2 + r}px, ${W / 2 - r}px ${H / 2}px`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `polygon(${pts})` }}>{children}</AbsoluteFill>
      {presentationProgress < 1 ? (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <polygon points={`${W / 2},${H / 2 - r} ${W / 2 + r},${H / 2} ${W / 2},${H / 2 + r} ${W / 2 - r},${H / 2}`} fill="none" stroke={C.gold} strokeWidth={10} />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};
const diamondWipe = (): TransitionPresentation<Record<string, never>> => ({ component: DiamondWipe, props: {} });
const T = 12; // مدّة كل انتقال بالإطارات
const timing = () => linearTiming({ durationInFrames: T, easing: EASE_INOUT });

// مدد المشاهد (إطارات @30) — كل مشهدٍ بعد الأول يُضاف له زمن انتقاله
export const SCENES = { hook: 72, limo: 60 + T, ocean: 48 + T, bean: 42 + T, gather: 66 + T, store: 132 + T, route: 90 + T, arrive: 60 + T, end: 90 + T };
export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0) - T * 8;

export const StoresAd: React.FC<{ guide?: boolean }> = ({ guide }) => (
  <AbsoluteFill style={{ background: C.cream }}>
    <TransitionSeries>
      <TransitionSeries.Sequence name="قشطوطة" durationInFrames={SCENES.hook}>
        <ProductScene src="shops/qashtouta_3.png" text="نفسك في باسطة؟" dur={SCENES.hook} cuts store="قشطوطة" focus="50% 55%" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={diamondWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="ليمومكس" durationInFrames={SCENES.limo}>
        <ProductScene src="shops/limomix_1.jpg" text="ولا كريمك المفضّل؟" dur={SCENES.limo} store="ليمومكس" focus="50% 60%" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={diamondWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="أوشين" durationInFrames={SCENES.ocean}>
        <ProductScene src="shops/ocean_2.jpg" text="ولا هدية لزول عزيز؟" dur={SCENES.ocean} store="هدايا أوشين" focus="50% 55%" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={diamondWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="بن بينور" durationInFrames={SCENES.bean}>
        <ProductScene src="shops/beanora_1.jpg" text="ولا قهوة الصباح؟" dur={SCENES.bean} store="بن بينور" focus="50% 50%" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={diamondWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="الجمع" durationInFrames={SCENES.gather}><GatherScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={diamondWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="المتجر" durationInFrames={SCENES.store}><StoreScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={diamondWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="الطريق" durationInFrames={SCENES.route}><RouteScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={diamondWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="الوصول" durationInFrames={SCENES.arrive}><ArriveScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={diamondWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="الختام" durationInFrames={SCENES.end}><EndScene /></TransitionSeries.Sequence>
    </TransitionSeries>
    {guide ? <SafeGuide /> : null}
  </AbsoluteFill>
);
export { interpolate };
