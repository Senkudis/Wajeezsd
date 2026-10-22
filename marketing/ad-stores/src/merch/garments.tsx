// رسوم الطقم (تيشيرت وكاب) كمكوّنات — نفس رسوم marketing/merch/mockups.html،
// والشعار من ملفات الـ vector نفسها (public/merch). `light` يحرّك لمعة الضوء.
import React from "react";
import { staticFile } from "remotion";

const Defs: React.FC<{ id: string; light: number }> = ({ id, light }) => (
  <defs>
    <filter id={`weave-${id}`} x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="7" result="n" />
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .10 0" result="a" />
      <feComposite in="a" in2="SourceGraphic" operator="in" result="t" />
      <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="t" /></feMerge>
    </filter>
    <filter id={`stitch-${id}`} x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9 0.08" numOctaves="1" seed="3" result="thr" />
      <feColorMatrix in="thr" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .10 0" result="th" />
      <feComposite in="th" in2="SourceGraphic" operator="in" result="tex" />
      <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b" />
      <feOffset in="b" dy="2.5" result="o" />
      <feFlood floodColor="#022a1b" floodOpacity=".55" /><feComposite in2="o" operator="in" result="sh" />
      <feMerge><feMergeNode in="sh" /><feMergeNode in="SourceGraphic" /><feMergeNode in="tex" /></feMerge>
    </filter>
    <filter id={`soft-${id}`}><feGaussianBlur stdDeviation="9" /></filter>
    <linearGradient id={`body-${id}`} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#065F3B" /><stop offset=".2" stopColor="#0A8754" /><stop offset=".5" stopColor="#0C9159" />
      <stop offset=".8" stopColor="#0A8754" /><stop offset="1" stopColor="#055A37" />
    </linearGradient>
    <linearGradient id={`shade-${id}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity=".08" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".22" />
    </linearGradient>
    {/* لمعة ضوءٍ مائلة تتحرّك عبر القماش */}
    <linearGradient id={`sheen-${id}`} x1="0" y1="0" x2="1" y2=".35" gradientUnits="objectBoundingBox">
      <stop offset={Math.max(0, light - 0.18)} stopColor="#fff" stopOpacity="0" />
      <stop offset={Math.min(1, Math.max(0, light))} stopColor="#fff" stopOpacity=".16" />
      <stop offset={Math.min(1, light + 0.18)} stopColor="#fff" stopOpacity="0" />
    </linearGradient>
    <linearGradient id={`crown-${id}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#0D9A60" /><stop offset=".55" stopColor="#0A8754" /><stop offset="1" stopColor="#055A37" />
    </linearGradient>
    <linearGradient id={`brim-${id}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#0B8F59" /><stop offset="1" stopColor="#075E3A" />
    </linearGradient>
  </defs>
);

const TEE_FRONT = "M388 92 Q500 172 612 92 L792 142 Q884 176 948 366 L838 448 L752 338 L758 1036 Q500 1064 242 1036 L248 338 L162 448 L52 366 Q116 176 208 142 Z";
const TEE_BACK = "M388 92 Q500 118 612 92 L792 142 Q884 176 948 366 L838 448 L752 338 L758 1036 Q500 1064 242 1036 L248 338 L162 448 L52 366 Q116 176 208 142 Z";

// reveal: 0..1 — كشف الشعار بمسحٍ من اليمين لليسار (كإبرة التطريز)
export const Tee: React.FC<{ side: "front" | "back"; light?: number; reveal?: number; id: string; width: number }> = ({ side, light = -1, reveal = 1, id, width }) => {
  const d = side === "front" ? TEE_FRONT : TEE_BACK;
  const logo = side === "front" ? { x: 598, y: 262, w: 90, h: 35 } : { x: 368, y: 200, w: 264, h: 102 };
  return (
    <svg viewBox="0 0 1000 1100" width={width} height={width * 1.1} style={{ overflow: "visible" }}>
      <Defs id={id} light={light} />
      <g filter={`url(#weave-${id})`}>
        <path d={d} fill={`url(#body-${id})`} />
        <path d={d} fill={`url(#shade-${id})`} />
      </g>
      <g filter={`url(#soft-${id})`}>
        <path d="M300 420 Q330 700 290 980" stroke="#055B37" strokeOpacity=".22" strokeWidth="30" fill="none" strokeLinecap="round" />
        <path d="M700 460 Q676 720 712 990" stroke="#055B37" strokeOpacity=".18" strokeWidth="26" fill="none" strokeLinecap="round" />
      </g>
      <path d={side === "front" ? "M388 92 Q500 172 612 92" : "M388 92 Q500 118 612 92"} stroke="#066A41" strokeWidth="24" fill="none" strokeLinecap="round" />
      <path d="M74 382 L170 456" stroke="#04553A" strokeWidth="2.4" strokeDasharray="8 6" opacity=".7" fill="none" />
      <path d="M926 382 L830 456" stroke="#04553A" strokeWidth="2.4" strokeDasharray="8 6" opacity=".7" fill="none" />
      <path d="M246 1012 Q500 1040 754 1012" stroke="#04553A" strokeWidth="2.4" strokeDasharray="8 6" opacity=".7" fill="none" />
      <clipPath id={`rev-${id}`}><rect x={logo.x + logo.w * (1 - reveal)} y={logo.y - 10} width={logo.w * reveal + 2} height={logo.h + 20} /></clipPath>
      <g clipPath={`url(#rev-${id})`}>
        <image href={staticFile("merch/lockup.svg")} x={logo.x} y={logo.y} width={logo.w} height={logo.h} filter={`url(#stitch-${id})`} />
      </g>
      <path d={d} fill={`url(#sheen-${id})`} />
    </svg>
  );
};

// الكاب: front أو side
export const Cap: React.FC<{ side: "front" | "side"; light?: number; id: string; width: number }> = ({ side, light = -1, id, width }) => (
  <svg viewBox="0 0 1000 800" width={width} height={width * 0.8} style={{ overflow: "visible" }}>
    <Defs id={id} light={light} />
    {side === "front" ? (
      <g>
        <g filter={`url(#weave-${id})`}><path d="M170 600 C168 300 330 140 500 140 C670 140 832 300 830 600 Z" fill={`url(#crown-${id})`} /></g>
        <path d="M500 146 C470 260 420 430 380 600" stroke="#055B37" strokeWidth="3" fill="none" opacity=".55" />
        <path d="M500 146 C530 260 580 430 620 600" stroke="#055B37" strokeWidth="3" fill="none" opacity=".55" />
        <path d="M500 146 C380 220 250 380 215 600" stroke="#055B37" strokeWidth="3" fill="none" opacity=".35" />
        <path d="M500 146 C620 220 750 380 785 600" stroke="#055B37" strokeWidth="3" fill="none" opacity=".35" />
        <circle cx="300" cy="300" r="8" fill="#04553A" /><circle cx="700" cy="300" r="8" fill="#04553A" />
        <ellipse cx="500" cy="146" rx="26" ry="12" fill="#0B8F59" stroke="#055B37" strokeWidth="2" />
        <path d="M175 590 Q500 540 825 590 L830 600 L170 600 Z" fill="#022a1b" opacity=".25" />
        <image href={staticFile("merch/mark.svg")} x="400" y="300" width="200" height="178" filter={`url(#stitch-${id})`} />
        <path d="M170 600 C168 300 330 140 500 140 C670 140 832 300 830 600 Z" fill={`url(#sheen-${id})`} />
        <path d="M140 598 Q500 528 860 598 Q912 640 846 690 Q500 770 154 690 Q88 640 140 598 Z" fill={`url(#brim-${id})`} />
        <path d="M160 610 Q500 548 840 610" stroke="#0B9A5F" strokeWidth="2" strokeDasharray="7 6" fill="none" opacity=".8" />
        <path d="M154 690 Q500 770 846 690 Q500 790 154 690 Z" fill="#043D27" opacity=".7" />
      </g>
    ) : (
      <g transform="translate(40,0)">
        <g filter={`url(#weave-${id})`}><path d="M260 600 C250 330 400 160 590 160 C780 160 900 330 900 600 Z" fill={`url(#crown-${id})`} /></g>
        <path d="M600 165 C560 300 520 450 500 600" stroke="#055B37" strokeWidth="3" fill="none" opacity=".5" />
        <path d="M600 165 C680 300 740 450 760 600" stroke="#055B37" strokeWidth="3" fill="none" opacity=".4" />
        <circle cx="690" cy="300" r="8" fill="#04553A" />
        <ellipse cx="596" cy="164" rx="22" ry="10" fill="#0B8F59" stroke="#055B37" strokeWidth="2" />
        <image href={staticFile("merch/chevron.svg")} x="600" y="400" width="62" height="104" filter={`url(#stitch-${id})`} />
        <path d="M260 600 C250 330 400 160 590 160 C780 160 900 330 900 600 Z" fill={`url(#sheen-${id})`} />
        <path d="M262 600 L900 600 L900 612 Q600 624 262 612 Z" fill="#043D27" opacity=".55" />
        <path d="M300 572 Q170 590 52 652 Q44 672 84 676 Q210 666 330 616 Q326 594 300 572 Z" fill={`url(#brim-${id})`} />
        <path d="M52 652 Q44 672 84 676 Q210 666 330 616 L332 630 Q212 684 82 688 Q36 684 52 652 Z" fill="#043D27" opacity=".8" />
      </g>
    )}
  </svg>
);
