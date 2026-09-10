import type { CSSProperties } from "react";

type MiloMascotProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-12 w-12",
  md: "h-40 w-40",
  lg: "h-64 w-64",
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
        .milo-art-float { animation: miloFloat 3.6s ease-in-out infinite; transform-origin: center bottom; }
        .milo-art-glow { animation: miloGlow 3.6s ease-in-out infinite; }
        .milo-hello { animation: miloHello 4.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .milo-art-float, .milo-art-glow, .milo-hello { animation: none; }
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
      </div>
    </div>
  );
}

export const miloMascotStyle: CSSProperties = { willChange: "transform" };
