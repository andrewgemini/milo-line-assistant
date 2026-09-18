import { MILO_MASCOT_SRC } from "@/lib/miloMascotAsset";

type MiloHeroMascotProps = { className?: string };

/**
 * Hero mascot renders the supplied mascot asset directly.
 * No redraw, trace, recolor, crop, or replacement of the artwork.
 */
export function MiloHeroMascot({ className = "" }: MiloHeroMascotProps) {
  return (
    <div
      className={`relative h-[400px] w-[320px] ${className}`}
      aria-label="ไมโล แมวยืนกวักมือ"
      data-milo-hero-reference="supplied-mascot-artwork"
    >
      <img
        key={MILO_MASCOT_SRC}
        src={`${MILO_MASCOT_SRC}?v=1817e71`}
        alt="ไมโล แมวผู้ช่วย AI"
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
