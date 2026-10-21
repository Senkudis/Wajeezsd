// خطوط الهوية (public/fonts — خارج المستودع لأنها مرخّصة).
// العنوان يُقاس بالخط نفسه (fitText) — فلا يُرسم شيءٌ قبل اكتمال تحميلها.
import React, { useEffect, useState } from "react";
import { loadFont } from "@remotion/fonts";
import { continueRender, delayRender, staticFile } from "remotion";

export const fontsReady = Promise.all(
  ([
    ["Alarabiya", "fonts/Alarabiya.ttf"],
    ["ArabicModern", "fonts/ArabicModern.otf"],
    ["IntroBlack", "fonts/IntroBlack.otf"],
    ["IntroBold", "fonts/IntroBold.otf"],
  ] as const).map(([family, file]) => loadFont({ family, url: staticFile(file) })),
);

export const FontGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState(() => delayRender("الخطوط"));
  const [ok, setOk] = useState(false);
  useEffect(() => { fontsReady.then(() => { setOk(true); continueRender(handle); }); }, [handle]);
  return ok ? React.createElement(React.Fragment, null, children) : null;
};
