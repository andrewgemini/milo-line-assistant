import { MILO_MASCOT_SRC } from "@/lib/miloMascotAsset";

type MiloHeroMascotProps = { className?: string };

export function MiloHeroMascot({ className = "" }: MiloHeroMascotProps) {
  return (
    <div
      className={`relative h-[440px] w-[360px] ${className}`}
      aria-label="ไมโล แมวยืนกวักมือ"
      data-milo-hero-reference="supplied-mascot-artwork"
    >
      <div className="absolute left-1/2 top-0 z-20 w-[270px] -translate-x-1/2 rounded-[22px] border border-[#dceee8] bg-white/95 px-5 py-3 text-center shadow-xl backdrop-blur">
        <p className="text-sm font-black leading-6 text-[#12604f]">สวัสดีครับ!</p>
        <p className="text-[11px] font-semibold leading-5 text-[#3f766b]">Milo พร้อมดูแลคุณ</p>
        <p className="text-[11px] font-semibold leading-5 text-[#3f766b]">จัดการร้านค้าได้แล้ว</p>
        <p className="text-[11px] font-semibold leading-5 text-[#3f766b]">วันนี้มีอะไรให้ช่วยบ้าง?</p>
        <span className="mt-2 inline-flex rounded-full bg-[#12b77c] px-4 py-1 text-[10px] font-black text-white">เริ่มใช้งานเลย! ♥</span>
      </div>
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
