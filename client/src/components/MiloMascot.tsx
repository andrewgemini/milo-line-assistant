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

export function MiloMascot({ className = "", size = "lg" }: MiloMascotProps) {
  return (
    <div className={`relative ${sizes[size]} ${className}`} aria-label="ไมโล แมวผู้ช่วย AI">
      <style>{`
        @keyframes miloFloat { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-8px) rotate(1deg); } }
        @keyframes miloWave { 0%,100% { transform: rotate(8deg); } 35% { transform: rotate(34deg); } 65% { transform: rotate(-8deg); } }
        @keyframes miloBlink { 0%,45%,55%,100% { transform: scaleY(1); } 50% { transform: scaleY(.12); } }
        @keyframes miloHello { 0%,100% { opacity: 0; transform: translateY(8px) scale(.94); } 15%,80% { opacity: 1; transform: translateY(0) scale(1); } }
        .milo-float { animation: miloFloat 3.6s ease-in-out infinite; }
        .milo-wave { transform-origin: 78% 67%; animation: miloWave 1.25s ease-in-out infinite; }
        .milo-eye { transform-box: fill-box; transform-origin: center; animation: miloBlink 4.5s ease-in-out infinite; }
        .milo-hello { animation: miloHello 4.8s ease-in-out infinite; }
      `}</style>
      {size !== "sm" && (
        <div className="milo-hello absolute -right-8 -top-2 z-20 whitespace-nowrap rounded-2xl rounded-bl-md border border-[#c8eddf] bg-white px-4 py-2 text-center text-sm font-bold text-[#246357] shadow-lg">
          สวัสดีครับ 👋<br /><span className="font-normal text-[#5e837b]">ผมไมโล ยินดีต้อนรับ!</span>
        </div>
      )}
      <div className="milo-float h-full w-full">
        <svg viewBox="0 0 280 280" className="h-full w-full drop-shadow-xl" role="img" aria-hidden="true">
          <ellipse cx="140" cy="258" rx="82" ry="14" fill="#79cbb4" opacity=".22" />
          <path d="M62 104 72 35c2-13 17-18 27-8l35 32z" fill="#7d7d86" />
          <path d="M218 104 208 35c-2-13-17-18-27-8l-35 32z" fill="#7d7d86" />
          <path d="M73 51 79 79l30-20zM207 51l-6 28-30-20z" fill="#f6a5a8" />
          <ellipse cx="140" cy="132" rx="88" ry="79" fill="#85858d" />
          <path d="M73 126c0-43 29-75 67-75s67 32 67 75c0 44-22 72-67 72s-67-28-67-72z" fill="#fff" />
          <path d="M82 135c-22 6-31 26-20 45 7 12 21 17 33 9l11-8-8-45z" fill="#85858d" />
          <path d="M198 135c22 6 31 26 20 45-7 12-21 17-33 9l-11-8 8-45z" fill="#85858d" />
          <ellipse className="milo-eye" cx="112" cy="126" rx="16" ry="20" fill="#183b39" />
          <ellipse className="milo-eye" cx="168" cy="126" rx="16" ry="20" fill="#183b39" />
          <circle cx="117" cy="120" r="5" fill="#fff" /><circle cx="173" cy="120" r="5" fill="#fff" />
          <path d="M132 151q8-8 16 0-8 12-16 0z" fill="#f27d80" />
          <path d="M140 157q-5 16-18 13M140 157q5 16 18 13" fill="none" stroke="#6b4b4d" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="91" cy="151" rx="18" ry="10" fill="#ffb2b3" opacity=".55" /><ellipse cx="189" cy="151" rx="18" ry="10" fill="#ffb2b3" opacity=".55" />
          <path d="M91 197q49-27 98 0v53H91z" fill="#16a878" />
          <path d="M106 205q34 24 68 0" fill="none" stroke="#bdf3df" strokeWidth="5" opacity=".8" />
          <path d="M122 201v49M158 201v49" stroke="#d7f8ec" strokeWidth="3" opacity=".75" />
          <path className="milo-wave" d="M203 195c25-18 37-7 38 10 1 13-10 20-18 14l-3 15-17-8z" fill="#fff" stroke="#85858d" strokeWidth="5" />
          <circle cx="140" cy="223" r="24" fill="#fff" opacity=".96" />
          <path d="M124 222h32M140 207v32" stroke="#18a979" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export const miloMascotStyle: CSSProperties = { willChange: "transform" };
