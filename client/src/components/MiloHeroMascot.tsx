type MiloHeroMascotProps = { className?: string };

/** Hero mascot: Milo based on the supplied reference cat, with a clearly visible Japanese beckoning paw animation. */
export function MiloHeroMascot({ className = "" }: MiloHeroMascotProps) {
  return (
    <div
      className={`relative h-[350px] w-[350px] ${className}`}
      aria-label="ไมโล แมวยืนกวักมือเรียกลูกค้า"
      data-milo-hero-reference="uploaded-milo-standing-cat"
    >
      <style>{`
        @keyframes miloHeroFloat { 0%,100% { transform:translate3d(0,0,0); } 50% { transform:translate3d(0,-4px,0); } }
        @keyframes miloHeroGlow { 0%,100% { opacity:.14; transform:scale(.98); } 50% { opacity:.24; transform:scale(1.02); } }
        @keyframes miloHeroBeckon {
          0%,100% { transform:rotate(-16deg) translate3d(-2px,2px,0); }
          25% { transform:rotate(2deg) translate3d(1px,-1px,0); }
          50% { transform:rotate(30deg) translate3d(7px,-6px,0); }
          75% { transform:rotate(2deg) translate3d(1px,-1px,0); }
        }
        .milo-hero-float { animation:miloHeroFloat 3.2s ease-in-out infinite; transform-origin:center bottom; }
        .milo-hero-glow { animation:miloHeroGlow 3.2s ease-in-out infinite; }
        .milo-hero-beckon { animation:miloHeroBeckon .82s cubic-bezier(.4,0,.2,1) infinite; transform-box:fill-box; transform-origin:50% 92%; will-change:transform; }
        @media (prefers-reduced-motion: reduce) { .milo-hero-float,.milo-hero-glow,.milo-hero-beckon { animation:none; } }
      `}</style>
      <div className="milo-hero-float relative h-full w-full">
        <div className="milo-hero-glow pointer-events-none absolute inset-[4%] rounded-full bg-[#8ee6b8] blur-2xl" aria-hidden="true" />
        <svg viewBox="0 0 420 420" className="relative z-10 h-full w-full overflow-visible drop-shadow-xl" role="img" aria-label="ไมโล แมวยืนกวักมือเรียกลูกค้า">
          <defs>
            <radialGradient id="miloRefCircle" cx="50%" cy="42%" r="60%"><stop offset="0" stopColor="#effff5"/><stop offset=".78" stopColor="#d8f8e2"/><stop offset="1" stopColor="#b7edc9"/></radialGradient>
            <linearGradient id="miloRefBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fffdfb"/><stop offset="1" stopColor="#eeeae7"/></linearGradient>
            <linearGradient id="miloRefGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd95b"/><stop offset=".55" stopColor="#ffc32e"/><stop offset="1" stopColor="#e99b10"/></linearGradient>
            <linearGradient id="miloRefScarf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#19c17d"/><stop offset="1" stopColor="#078d61"/></linearGradient>
          </defs>

          <circle cx="210" cy="210" r="190" fill="url(#miloRefCircle)" stroke="#73d79b" strokeWidth="8" />
          <circle cx="210" cy="210" r="177" fill="none" stroke="#f4fff8" strokeWidth="5" />

          <g transform="rotate(-2 210 250) scale(1.03) translate(-6 -8)">
            <ellipse cx="211" cy="389" rx="112" ry="12" fill="#70c991" opacity=".28" />

            {/* striped tail */}
            <path d="M301 285 C354 266 380 300 368 326 C357 350 331 365 307 351 C294 343 295 329 306 322 C318 314 335 322 343 334 C349 319 342 304 324 303 C315 302 308 299 301 285 Z" fill="#aaa39d" stroke="#3b2925" strokeWidth="7" />
            <path d="M327 297 C345 301 354 312 350 325 C347 334 341 339 337 343" fill="none" stroke="#eeeae7" strokeWidth="14" />
            <path d="M350 313 C357 321 355 332 347 339" fill="none" stroke="#8f8984" strokeWidth="12" />

            {/* standing body */}
            <path d="M145 238 C129 271 127 318 135 354 C140 379 160 385 184 370 L239 370 C263 385 285 376 289 348 C293 312 284 271 269 238 Z" fill="url(#miloRefBody)" stroke="#3b2925" strokeWidth="7" />

            {/* green Japanese scarf */}
            <path d="M151 255 C176 280 238 280 265 254 L269 286 C242 307 177 306 149 284 Z" fill="url(#miloRefScarf)" stroke="#3b2925" strokeWidth="5" />
            <circle cx="210" cy="280" r="27" fill="#12bb79" stroke="#3b2925" strokeWidth="5" />
            <circle cx="210" cy="280" r="18" fill="#22d38d" />
            <circle cx="203" cy="272" r="4" fill="#fffdfb" /><circle cx="211" cy="268" r="4" fill="#fffdfb" /><circle cx="219" cy="273" r="4" fill="#fffdfb" />
            <circle cx="210" cy="284" r="6" fill="#fffdfb" />

            {/* gold lucky charm */}
            <path d="M251 275 C270 267 294 277 300 297 L307 326 C312 347 299 361 278 363 L246 367 C224 369 212 356 215 335 L219 303 C221 288 234 279 251 275 Z" fill="url(#miloRefGold)" stroke="#3b2925" strokeWidth="7" />
            <path d="M246 288 C261 282 280 288 286 301" fill="none" stroke="#fff4b7" strokeWidth="7" strokeLinecap="round" opacity=".8" />
            <text x="259" y="324" textAnchor="middle" fontSize="19" fontWeight="900" fill="#7d4d08">ไมโล</text>
            <path d="M250 337 C258 329 270 329 278 337" fill="none" stroke="#7d4d08" strokeWidth="4" strokeLinecap="round" />
            <circle cx="264" cy="343" r="7" fill="#7d4d08" />

            {/* feet */}
            <path d="M165 351 C160 376 170 390 188 390 C203 390 210 379 206 351 Z" fill="#fffdfb" stroke="#3b2925" strokeWidth="6" />
            <path d="M226 351 C222 379 232 391 249 390 C267 389 272 376 267 351 Z" fill="#fffdfb" stroke="#3b2925" strokeWidth="6" />
            <path d="M174 378 L174 387 M186 379 L186 388 M238 379 L238 388 M251 378 L251 387" stroke="#3b2925" strokeWidth="4" strokeLinecap="round" />

            {/* head */}
            <path d="M145 239 C125 214 119 184 128 153 C137 124 166 108 207 109 C248 110 279 128 287 158 C295 188 285 218 268 240 C245 268 169 269 145 239 Z" fill="#fffdfb" stroke="#3b2925" strokeWidth="7" />
            <path d="M143 153 L145 83 L197 126 Z" fill="#efebe8" stroke="#3b2925" strokeWidth="7" strokeLinejoin="round" />
            <path d="M228 126 L282 83 L279 159 Z" fill="#efebe8" stroke="#3b2925" strokeWidth="7" strokeLinejoin="round" />
            <path d="M153 116 L152 96 L181 126 Z" fill="#ff9fa4" /><path d="M247 124 L276 96 L274 128 Z" fill="#ff9fa4" />
            <path d="M148 145 C166 130 178 112 185 92" fill="none" stroke="#b8b2ad" strokeWidth="15" strokeLinecap="round" />
            <path d="M225 119 C231 103 243 101 252 119 M250 122 C258 106 269 108 275 124" fill="none" stroke="#b8b2ad" strokeWidth="14" strokeLinecap="round" />

            {/* Milo reference face: one bright open eye + one friendly wink */}
            <ellipse cx="171" cy="183" rx="27" ry="34" fill="#4a2b24" stroke="#3b2925" strokeWidth="5" />
            <ellipse cx="178" cy="174" rx="9" ry="12" fill="#fffdfb" />
            <circle cx="165" cy="194" r="5" fill="#9a5b3b" />
            <path d="M232 183 C245 171 260 174 269 184" fill="none" stroke="#3b2925" strokeWidth="10" strokeLinecap="round" />
            <ellipse cx="150" cy="218" rx="27" ry="18" fill="#ff9fa5" opacity=".72" />
            <ellipse cx="271" cy="218" rx="27" ry="18" fill="#ff9fa5" opacity=".72" />
            <path d="M209 192 C200 202 200 213 210 217 C220 213 220 202 211 192 Z" fill="#ef5e64" stroke="#3b2925" strokeWidth="4" />
            <path d="M210 217 C205 230 191 230 185 218 M210 217 C215 230 229 230 235 218" fill="none" stroke="#3b2925" strokeWidth="5" strokeLinecap="round" />

            {/* beckoning arm: isolated so the whole arm visibly waves like a Japanese lucky cat */}
            <g className="milo-hero-beckon">
              <path d="M145 252 C119 242 104 219 99 188 C95 162 105 139 123 135 C141 131 154 145 153 165 L151 190 C151 207 162 220 176 228 L165 264 Z" fill="#fffdfb" stroke="#3b2925" strokeWidth="7" />
              <path d="M123 158 C107 151 101 134 108 121 C114 110 126 111 134 123 C132 107 141 96 153 99 C165 102 168 115 164 128 C174 116 187 120 190 132 C193 145 185 157 172 162 L150 172 Z" fill="#fffdfb" stroke="#3b2925" strokeWidth="7" strokeLinejoin="round" />
              <ellipse cx="148" cy="136" rx="17" ry="15" fill="#ff9da3" />
              <circle cx="136" cy="131" r="4.5" fill="#ff777f" /><circle cx="148" cy="126" r="4.5" fill="#ff777f" /><circle cx="158" cy="134" r="4.5" fill="#ff777f" />
              <path d="M116 177 C107 169 104 158 108 149" fill="none" stroke="#e9e5e1" strokeWidth="6" strokeLinecap="round" />
            </g>

            {/* right paw */}
            <path d="M270 254 C293 247 309 257 306 271 C302 285 285 292 269 284 C256 278 256 262 270 254 Z" fill="#fffdfb" stroke="#3b2925" strokeWidth="7" />
          </g>
        </svg>
      </div>
    </div>
  );
}
