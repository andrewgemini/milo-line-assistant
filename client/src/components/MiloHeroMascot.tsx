import { MILO_MASCOT_SRC } from "@/lib/miloMascotAsset";

type MiloHeroMascotProps = { className?: string };

/** Hero mascot: always render the exact supplied Milo reference artwork. */
export function MiloHeroMascot({ className = "" }: MiloHeroMascotProps) {
  return (
    <div
      className={`relative h-[350px] w-[350px] ${className}`}
      aria-label="ไมโล แมวผู้ช่วย"
      data-milo-hero-reference="exact-uploaded-milo"
    >
      <img
        src={MILO_MASCOT_SRC}
        alt="ไมโล แมวผู้ช่วย"
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
