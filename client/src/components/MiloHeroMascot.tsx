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
      <div className="absolute -left-3 -top-1 z-20 whitespace-nowrap rounded-2xl rounded-bl-md border border-[#c8eddf] bg-white px-4 py-2 text-center text-sm font-bold text-[#246357] shadow-lg">
        สวัสดีครับ 👋
        <br />
        <span className="font-normal text-[#5e837b]">ผมไมโล ยินดีต้อนรับ!</span>
      </div>
      <img
        src={MILO_MASCOT_SRC}
        alt="ไมโล แมวผู้ช่วย AI"
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
