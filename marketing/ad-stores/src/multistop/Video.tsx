// إعلان «مشوار واحد… بدل تلاتة»: ثمانية مشاهد، والانتقال كنسٌ بشريطٍ أخضر
// مائل — الخطّ الواحد نفسه يعبر الشاشة ويكشف المشهد التالي.
import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { C, EASE_INOUT, H, W } from "../theme";
import { SafeGuide } from "../components";
import { BenefitScene, CompareScene, EndScene, HomeScene, HookScene, MergeScene, ProblemScene, RouteScene } from "./scenes";

const LineWipe: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({ children, presentationDirection, presentationProgress }) => {
  if (presentationDirection === "exiting") return <AbsoluteFill>{children}</AbsoluteFill>;
  // حدٌّ مائل يتحرّك من اليمين لليسار (اتجاه القراءة العربية)
  const slope = 420, x = (1 - presentationProgress) * (W + slope + 160) - 80;
  const poly = `${x}px 0px, ${W + slope}px 0px, ${W + slope}px ${H}px, ${x - slope}px ${H}px`;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `polygon(${poly})` }}>{children}</AbsoluteFill>
      {presentationProgress < 1 ? (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <line x1={x} y1={-20} x2={x - slope} y2={H + 20} stroke={C.green} strokeWidth={44} strokeLinecap="round" />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};
const lineWipe = (): TransitionPresentation<Record<string, never>> => ({ component: LineWipe, props: {} });
export const MT = 12;
const timing = () => linearTiming({ durationInFrames: MT, easing: EASE_INOUT });

export const MS_SCENES = { hook: 78, problem: 84 + MT, merge: 66 + MT, home: 162 + MT, route: 90 + MT, compare: 108 + MT, benefit: 60 + MT, end: 72 + MT };
export const MS_TOTAL = Object.values(MS_SCENES).reduce((a, b) => a + b, 0) - MT * 7;

export const MultiStopAd: React.FC<{ guide?: boolean }> = ({ guide }) => (
  <AbsoluteFill style={{ background: C.cream }}>
    <TransitionSeries>
      <TransitionSeries.Sequence name="الخطّاف" durationInFrames={MS_SCENES.hook}><HookScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={lineWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="المشكلة" durationInFrames={MS_SCENES.problem}><ProblemScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={lineWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="التحوّل" durationInFrames={MS_SCENES.merge}><MergeScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={lineWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="الرئيسية" durationInFrames={MS_SCENES.home}><HomeScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={lineWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="أقصر طريق" durationInFrames={MS_SCENES.route}><RouteScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={lineWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="الحساب" durationInFrames={MS_SCENES.compare}><CompareScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={lineWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="الفايدة" durationInFrames={MS_SCENES.benefit}><BenefitScene /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={lineWipe()} timing={timing()} />
      <TransitionSeries.Sequence name="الختام" durationInFrames={MS_SCENES.end}><EndScene /></TransitionSeries.Sequence>
    </TransitionSeries>
    {guide ? <SafeGuide /> : null}
  </AbsoluteFill>
);
