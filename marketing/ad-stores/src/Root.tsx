import React from "react";
import { Composition } from "remotion";
import { StoresAd, TOTAL } from "./Video";
import { FontGate } from "./fonts";
import { MS_TOTAL, MultiStopAd } from "./multistop/Video";
import { FPS, H, W } from "./theme";

const GatedMS: React.FC<{ guide?: boolean }> = (p) => <FontGate><MultiStopAd {...p} /></FontGate>;
const Gated: React.FC<{ guide?: boolean }> = (p) => <FontGate><StoresAd {...p} /></FontGate>;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="StoresAd" component={Gated} width={W} height={H} fps={FPS} durationInFrames={TOTAL} defaultProps={{ guide: false }} />
    {/* نسخة المراجعة: نفس الإعلان وفوقه طبقة المنطقة الآمنة */}
    <Composition id="StoresAdGuide" component={Gated} width={W} height={H} fps={FPS} durationInFrames={TOTAL} defaultProps={{ guide: true }} />
    <Composition id="MultiStopAd" component={GatedMS} width={W} height={H} fps={FPS} durationInFrames={MS_TOTAL} defaultProps={{ guide: false }} />
    <Composition id="MultiStopAdGuide" component={GatedMS} width={W} height={H} fps={FPS} durationInFrames={MS_TOTAL} defaultProps={{ guide: true }} />
  </>
);
