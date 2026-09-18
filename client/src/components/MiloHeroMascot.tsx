import { MILO_MASCOT_SRC } from "@/lib/miloMascotAsset";

type MiloHeroMascotProps = { className?: string };

/**
 * Hero mascot uses the supplied Milo artwork directly.
 * Do not redraw, crop, trace, recolor, or replace the mascot artwork.
 */
export function MiloHeroMascot({ className = "" }: MiloHeroMascotProps) {
  return (
    <div
      className={`relative h-[400px] w-[320px] ${className}`}
      aria-label="ไมโล แมวยืนกวักมือ"
      data-milo-hero-reference="exact-supplied-artwork"
    >
      <style>{`
        @keyframes miloHeroFloat {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -5px, 0); }
        }
        @keyframes miloHeroBlink {
          0%, 91%, 96%, 100% { opacity: 1; }
          93.5%, 94.5% { opacity: .72; }
        }
        .milo-hero-float {
          animation: miloHeroFloat 3.2s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .milo-hero-blink {
          animation: miloHeroBlink 4.2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .milo-hero-float,
          .milo-hero-blink { animation: none; }
        }
      `}</style>

      <div className="milo-hero-float relative h-full w-full">
        <div className="absolute -left-3 -top-1 z-20 whitespace-nowrap rounded-2xl rounded-bl-md border border-[#c8eddf] bg-white px-4 py-2 text-center text-sm font-bold text-[#246357] shadow-lg">
          <span>สวัสดีครับ 👋</span>
          <br />
          <span className="font-normal text-[#5e837b]">ผมไมโล ยินดีต้อนรับ!</span>
        </div>

        <div className="milo-hero-blink h-full w-full">
          <img
            key={MILO_MASCOT_SRC}
            src={`${MILO_MASCOT_SRC}?v=1817e71`}
            alt="ไมโล แมวผู้ช่วย AI"
            className="h-full w-full object-contain"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
