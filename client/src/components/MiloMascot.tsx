import type { CSSProperties } from "react";
import { MILO_MASCOT_SRC } from "@/lib/miloMascotAsset";

type MiloMascotProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-12 w-12",
  md: "h-40 w-40",
  lg: "h-80 w-80",
};

/** Keep the supplied Milo artwork unchanged for small/decorative placements. */
export function MiloMascot({ className = "", size = "lg" }: MiloMascotProps) {
  return (
    <div className={`relative ${sizes[size]} ${className}`} aria-label="ไมโล แมวผู้ช่วย AI">
      <style>{`
        @keyframes miloHello { 0%,100% { opacity: 0; transform: translateY(8px) scale(.94); } 15%,80% { opacity: 1; transform: translateY(0) scale(1); } }
        .milo-hello { animation: miloHello 4.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .milo-hello { animation: none; } }
      `}</style>
      {size !== "sm" && (
        <div className="milo-hello absolute -right-8 -top-2 z-20 whitespace-nowrap rounded-2xl rounded-bl-md border border-[#c8eddf] bg-white px-4 py-2 text-center text-sm font-bold text-[#246357] shadow-lg">
          สวัสดีครับ 👋<br /><span className="font-normal text-[#5e837b]">ผมไมโล ยินดีต้อนรับ!</span>
        </div>
      )}
      <div className="relative h-full w-full">
        <img src={MILO_MASCOT_SRC} alt="ไมโล แมวผู้ช่วย AI" className="h-full w-full object-contain" draggable={false} />
      </div>
    </div>
  );
}

export const miloMascotStyle: CSSProperties = { willChange: "transform" };
