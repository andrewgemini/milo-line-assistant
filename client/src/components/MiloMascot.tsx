import type { CSSProperties } from "react";

type MiloMascotProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-12 w-12",
  md: "h-40 w-40",
  lg: "h-80 w-80",
};

/**
 * Milo mascot source of truth.
 *
 * Keep the supplied official Milo artwork intact instead of redrawing it in SVG.
 * The image is the exact reference artwork; motion is applied only to the wrapper
 * so the mascot itself is never distorted or visually re-created.
 */
export function MiloMascot({ className = "", size = "lg" }: MiloMascotProps) {
  return (
    <div className={`relative ${sizes[size]} ${className}`} aria-label="ไมโล แมวผู้ช่วย AI">
      <style>{`
        @keyframes miloFloat { 0%,100% { transform: translate3d(0,0,0) rotate(-1deg); } 50% { transform: translate3d(0,-8px,0) rotate(1deg); } }
        @keyframes miloGlow { 0%,100% { opacity: .14; transform: scale(.98); } 50% { opacity: .28; transform: scale(1.03); } }
        @keyframes miloHello { 0%,100% { opacity: 0; transform: translateY(8px) scale(.94); } 15%,80% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes miloManeki { 0%,100% { transform: rotate(-16deg); } 50% { transform: rotate(28deg); } }
        .milo-art-float { animation: miloFloat 3.6s ease-in-out infinite; transform-origin: center bottom; }
        .milo-art-glow { animation: miloGlow 3.6s ease-in-out infinite; }
        .milo-hello { animation: miloHello 4.8s ease-in-out infinite; }
        .milo-maneki-paw { transform-origin: 88% 92%; }
        .milo-maneki-arm { animation: miloManeki 1.25s ease-in-out infinite; transform-box: fill-box; transform-origin: 88% 92%; }
        @media (prefers-reduced-motion: reduce) {
          .milo-art-float, .milo-art-glow, .milo-hello, .milo-maneki-arm { animation: none; }
        }
      `}</style>
      {size !== "sm" && (
        <div className="milo-hello absolute -right-8 -top-2 z-20 whitespace-nowrap rounded-2xl rounded-bl-md border border-[#c8eddf] bg-white px-4 py-2 text-center text-sm font-bold text-[#246357] shadow-lg">
          สวัสดีครับ 👋<br /><span className="font-normal text-[#5e837b]">ผมไมโล ยินดีต้อนรับ!</span>
        </div>
      )}
      <div className="milo-art-float relative h-full w-full">
        <div className="milo-art-glow pointer-events-none absolute inset-[8%] rounded-full bg-[#8ee6b8] blur-2xl" aria-hidden="true" />
        <img
          src="/milo-mascot-reference.png"
          alt="ไมโล แมวผู้ช่วย AI"
          className="relative z-10 h-full w-full object-contain drop-shadow-xl"
          draggable={false}
        />
        {size !== "sm" && (
          <div className="milo-maneki-paw pointer-events-none absolute left-[7%] top-[19%] z-30" aria-hidden="true">
            <svg viewBox="0 0 120 150" className="h-[42%] w-auto overflow-visible drop-shadow-lg" role="presentation">
              <g className="milo-maneki-arm">
                <path d="M54 128 C39 108 31 86 34 62 C36 45 46 32 61 34 C76 36 82 49 78 64 L70 94 C68 103 75 111 84 116 L78 140 Z" fill="white" stroke="#3c2925" strokeWidth="5" strokeLinejoin="round" />
                <path d="M39 56 C30 47 30 34 38 28 C45 23 52 28 53 37 C53 27 59 18 67 20 C75 22 76 32 73 41 C79 33 88 34 92 41 C96 49 91 58 82 62 L68 69 Z" fill="white" stroke="#3c2925" strokeWidth="5" strokeLinejoin="round" />
                <ellipse cx="63" cy="47" rx="14" ry="12" fill="#ff9b9f" />
                <circle cx="55" cy="43" r="4" fill="#ff7f86" />
                <circle cx="64" cy="39" r="4" fill="#ff7f86" />
                <circle cx="71" cy="45" r="4" fill="#ff7f86" />
              </g>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

export const miloMascotStyle: CSSProperties = { willChange: "transform" };
