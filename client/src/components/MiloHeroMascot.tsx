type MiloHeroMascotProps = { className?: string };

/** Hero-only standing maneki-neko. Other MiloMascot placements keep the original artwork. */
export function MiloHeroMascot({ className = "" }: MiloHeroMascotProps) {
  return (
    <div className={`relative h-[350px] w-[350px] ${className}`} aria-label="ไมโล แมวกวักญี่ปุ่นยืนโบกมือเรียกแขก">
      <style>{`
        @keyframes miloHeroFloat { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-5px,0); } }
        @keyframes miloHeroGlow { 0%,100% { opacity:.16; transform:scale(.98); } 50% { opacity:.28; transform:scale(1.03); } }
        @keyframes miloHeroWave { 0%,100% { transform:rotate(-24deg) translateY(2px); } 50% { transform:rotate(34deg) translateY(-3px); } }
        .milo-hero-float { animation:miloHeroFloat 3.2s ease-in-out infinite; transform-origin:center bottom; }
        .milo-hero-glow { animation:miloHeroGlow 3.2s ease-in-out infinite; }
        .milo-hero-paw { animation:miloHeroWave .82s ease-in-out infinite; transform-box:fill-box; transform-origin:50% 92%; will-change:transform; }
        @media (prefers-reduced-motion: reduce) { .milo-hero-float,.milo-hero-glow,.milo-hero-paw { animation:none; } }
      `}</style>
      <div className="milo-hero-float relative h-full w-full">
        <div className="milo-hero-glow pointer-events-none absolute inset-[5%] rounded-full bg-[#8ee6b8] blur-2xl" aria-hidden="true" />
        <svg viewBox="0 0 420 420" className="relative z-10 h-full w-full overflow-visible drop-shadow-xl" role="img" aria-label="ไมโล แมวกวักญี่ปุ่นยืนโบกมือเรียกแขก">
          <defs>
            <radialGradient id="miloHeroCircle" cx="50%" cy="42%" r="58%"><stop offset="0" stopColor="#effff5"/><stop offset=".78" stopColor="#d6f8df"/><stop offset="1" stopColor="#b8edc8"/></radialGradient>
            <linearGradient id="miloHeroBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fffdfb"/><stop offset="1" stopColor="#eeeae6"/></linearGradient>
            <linearGradient id="miloHeroScarf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#18bd79"/><stop offset="1" stopColor="#078c61"/></linearGradient>
          </defs>
          <circle cx="210" cy="210" r="190" fill="url(#miloHeroCircle)" stroke="#73d79b" strokeWidth="8" />
          <circle cx="210" cy="210" r="177" fill="none" stroke="#effff5" strokeWidth="5" />
          <g transform="rotate(-3 210 245) scale(1.04 1.04) translate(-8 -10)">
            <ellipse cx="210" cy="386" rx="105" ry="13" fill="#7bcf99" opacity=".35" />
            <path d="M300 285 C365 263 374 329 341 351 C319 366 297 344 306 326 C315 308 339 315 347 329" fill="#aaa49e" stroke="#3c2925" strokeWidth="6" />
            <path d="M145 242 C132 274 127 320 134 351 C139 376 161 381 184 367 L238 367 C261 382 285 371 289 346 C293 312 283 271 268 242 Z" fill="url(#miloHeroBody)" stroke="#3c2925" strokeWidth="7" />
            <path d="M153 258 C176 279 237 279 261 255 L267 288 C244 305 176 304 150 286 Z" fill="url(#miloHeroScarf)" stroke="#3c2925" strokeWidth="5" />
            <circle cx="208" cy="277" r="8" fill="#fffdfb" /><circle cx="196" cy="269" r="4" fill="#fffdfb" /><circle cx="205" cy="266" r="4" fill="#fffdfb" /><circle cx="214" cy="267" r="4" fill="#fffdfb" /><circle cx="221" cy="271" r="4" fill="#fffdfb" />
            <path d="M168 353 C164 376 173 389 190 389 C205 389 211 378 207 353 Z" fill="#fffdfb" stroke="#3c2925" strokeWidth="6" />
            <path d="M228 353 C224 378 233 390 249 389 C267 388 272 375 267 352 Z" fill="#fffdfb" stroke="#3c2925" strokeWidth="6" />
            <path d="M145 242 C126 216 120 187 128 159 C136 129 165 112 205 111 C247 110 278 129 286 160 C293 190 284 219 267 242 C243 268 169 269 145 242 Z" fill="#fffdfb" stroke="#3c2925" strokeWidth="7" />
            <path d="M143 155 L145 87 L195 128 Z" fill="#eee9e4" stroke="#3c2925" strokeWidth="7" strokeLinejoin="round" />
            <path d="M228 128 L282 87 L279 161 Z" fill="#eee9e4" stroke="#3c2925" strokeWidth="7" strokeLinejoin="round" />
            <path d="M153 119 L151 99 L179 126 Z" fill="#ffb0b0" /><path d="M247 126 L276 99 L274 128 Z" fill="#ffb0b0" />
            <path d="M174 121 C183 104 195 105 202 126 C211 106 224 105 234 125 C242 107 255 108 260 126" fill="none" stroke="#b6b0aa" strokeWidth="16" strokeLinecap="round" />
            <ellipse cx="174" cy="174" rx="25" ry="32" fill="#4b332d" /><circle cx="181" cy="162" r="9" fill="white" />
            <path d="M234 172 C249 158 266 163 272 174 C260 184 245 185 234 172 Z" fill="#4b332d" />
            <ellipse cx="153" cy="210" rx="23" ry="15" fill="#ffb5b5" opacity=".75" /><ellipse cx="265" cy="210" rx="23" ry="15" fill="#ffb5b5" opacity=".75" />
            <path d="M207 192 C198 203 198 213 209 217 C219 213 220 203 211 192 Z" fill="#ee5e62" stroke="#3c2925" strokeWidth="4" />
            <path d="M209 217 C204 230 190 230 184 218 M209 217 C214 230 228 230 234 218" fill="none" stroke="#3c2925" strokeWidth="5" strokeLinecap="round" />
            <g className="milo-hero-paw">
              <path d="M143 252 C119 241 104 218 99 188 C95 162 105 140 123 136 C141 132 154 145 153 165 L151 190 C151 207 162 219 176 227 L164 263 Z" fill="#fffdfb" stroke="#3c2925" strokeWidth="7" />
              <path d="M123 158 C107 151 101 134 108 121 C114 110 126 111 134 123 C132 107 141 96 153 99 C165 102 168 115 164 128 C174 116 187 120 190 132 C193 145 185 157 172 162 L150 172 Z" fill="#fffdfb" stroke="#3c2925" strokeWidth="7" />
              <ellipse cx="148" cy="135" rx="17" ry="15" fill="#ff9da2" /><circle cx="136" cy="131" r="4.5" fill="#ff777e" /><circle cx="148" cy="126" r="4.5" fill="#ff777e" /><circle cx="158" cy="134" r="4.5" fill="#ff777e" />
            </g>
            <path d="M273 252 C297 246 309 257 306 270 C302 284 285 291 269 284 C256 278 256 262 273 252 Z" fill="#fffdfb" stroke="#3c2925" strokeWidth="7" />
          </g>
        </svg>
      </div>
    </div>
  );
}
