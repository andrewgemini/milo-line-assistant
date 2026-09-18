import { MiloStandingHero } from "@/components/MiloStandingHero";

type MiloHeroMascotProps = { className?: string };

/** Hero mascot: standing, waving Milo matching the supplied hero reference. */
export function MiloHeroMascot({ className = "" }: MiloHeroMascotProps) {
  return (
    <div
      className={`relative h-[400px] w-[300px] ${className}`}
      aria-label="ไมโล แมวยืนกวักมือ"
      data-milo-hero-reference="standing-waving"
    >
      <MiloStandingHero className="h-full w-full" />
    </div>
  );
}
