type MiloStandingHeroProps = { className?: string };

const MILO_MANEKI_ORIGINAL_SRC = "/milo-maneki-original.png?v=fc9a2ef4";

/**
 * The hero uses the user-supplied artwork byte-for-byte.
 * Do not redraw, crop, trace, recolor, or otherwise alter this image.
 */
export function MiloStandingHero({ className = "" }: MiloStandingHeroProps) {
  return (
    <img
      src={MILO_MANEKI_ORIGINAL_SRC}
      alt="ไมโล แมวยืนกวักมือ"
      className={`object-contain object-center ${className}`}
      draggable={false}
      data-milo-hero-reference="exact-supplied-artwork"
    />
  );
}
