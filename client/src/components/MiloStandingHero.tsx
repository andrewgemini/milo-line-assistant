import type { CSSProperties } from "react";

type MiloStandingHeroProps = { className?: string };

/** Standing/waving Milo hero mascot, drawn as a transparent SVG so the hero never depends on a raster crop. */
export function MiloStandingHero({ className = "" }: MiloStandingHeroProps) {
  const outline: CSSProperties = { stroke: "#2b1818", strokeWidth: 8, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <svg viewBox="0 0 420 560" role="img" aria-label="ไมโล แมวยืนกวักมือ" className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="miloFur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#f4f2ef" /></linearGradient>
        <linearGradient id="miloGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd85a" /><stop offset="1" stopColor="#f2a915" /></linearGradient>
      </defs>

      {/* tail behind body */}
      <path d="M314 392 C383 356 405 402 376 444 C356 472 329 458 315 437" fill="#b9b4b4" {...outline}/>
      <path d="M347 393 C370 390 382 407 372 425" fill="none" stroke="#8e8888" strokeWidth="14" strokeLinecap="round"/>
      <path d="M338 430 C354 428 365 438 365 450" fill="none" stroke="#8e8888" strokeWidth="14" strokeLinecap="round"/>

      {/* body */}
      <path d="M126 298 C112 340 106 398 113 486 C116 523 143 537 172 526 C186 521 193 508 194 488 L226 488 C228 511 238 527 259 528 C288 530 302 512 303 480 L306 353 C303 319 283 298 252 286 Z" fill="url(#miloFur)" {...outline}/>

      {/* legs */}
      <path d="M135 463 C128 493 133 522 158 526 C177 529 188 518 188 496 L187 466" fill="#faf9f7" {...outline}/>
      <path d="M230 465 L230 498 C231 520 245 529 263 527 C286 525 291 507 285 477" fill="#faf9f7" {...outline}/>
      <path d="M146 515 l-5 7 M160 518 l-1 7 M249 519 l-1 7 M264 518 l1 7" fill="none" stroke="#2b1818" strokeWidth="5" strokeLinecap="round"/>

      {/* raised waving arm */}
      <path d="M144 345 C112 327 91 302 79 267 C72 247 62 222 70 207 C77 194 93 191 106 199 C118 207 123 223 129 237 L145 273 C157 296 168 314 181 325" fill="url(#miloFur)" {...outline}/>
      {/* paw */}
      <path d="M69 210 C49 208 34 194 37 177 C39 164 51 154 64 155 C70 143 82 139 94 145 C106 139 120 147 123 159 C134 165 137 180 130 191 C121 206 101 213 83 210 Z" fill="#fff" {...outline}/>
      <ellipse cx="78" cy="181" rx="10" ry="13" fill="#ff8790"/>
      <circle cx="62" cy="170" r="6" fill="#ff8790"/><circle cx="77" cy="163" r="6" fill="#ff8790"/><circle cx="94" cy="165" r="6" fill="#ff8790"/>
      {/* waving motion */}
      <path d="M34 140 l-18 -13 M39 122 l-12 -20 M49 111 l-4 -21" fill="none" stroke="#08ad77" strokeWidth="8" strokeLinecap="round"/>

      {/* head */}
      <path d="M111 122 L108 54 L160 86 C188 73 225 72 258 85 L310 52 L307 128 C324 152 329 193 316 232 C301 278 259 301 210 302 C155 303 113 280 101 234 C91 196 95 153 111 122 Z" fill="url(#miloFur)" {...outline}/>
      {/* ears inner */}
      <path d="M119 70 L119 118 L153 91 Z" fill="#ff9aa0"/>
      <path d="M300 69 L301 119 L267 91 Z" fill="#ff9aa0"/>
      {/* forehead stripes */}
      <path d="M171 86 L183 113 M203 82 L207 113 M234 86 L228 113" fill="none" stroke="#9c9693" strokeWidth="14" strokeLinecap="round"/>
      {/* cheek stripes */}
      <path d="M106 187 l20 7 M105 205 l21 4 M294 188 l18 -5 M295 207 l18 -3" fill="none" stroke="#9c9693" strokeWidth="7" strokeLinecap="round"/>

      {/* face */}
      <path d="M143 159 Q158 145 174 159" fill="none" stroke="#2b1818" strokeWidth="9" strokeLinecap="round"/>
      <path d="M244 159 Q259 145 275 159" fill="none" stroke="#2b1818" strokeWidth="9" strokeLinecap="round"/>
      <ellipse cx="143" cy="194" rx="28" ry="22" fill="#ffb0b5" opacity=".72"/>
      <ellipse cx="278" cy="194" rx="28" ry="22" fill="#ffb0b5" opacity=".72"/>
      <path d="M207 178 q-12 0 -12 10 q0 9 12 11 q12 -2 12 -11 q0 -10 -12 -10Z" fill="#f05f72"/>
      <path d="M207 199 C194 214 193 235 207 242 C221 235 220 214 207 199 Z" fill="#ff6f82" {...outline}/>
      <path d="M207 238 q-10 -2 -18 -9 M207 238 q10 -2 18 -9" fill="none" stroke="#2b1818" strokeWidth="6" strokeLinecap="round"/>

      {/* collar */}
      <path d="M141 277 Q207 306 273 277 L267 300 Q207 329 147 300 Z" fill="#10b878" {...outline}/>
      <circle cx="207" cy="302" r="25" fill="#10b878" {...outline}/>
      <circle cx="207" cy="302" r="15" fill="#f8f8f8"/>
      <circle cx="207" cy="296" r="5" fill="#10b878"/><circle cx="198" cy="305" r="5" fill="#10b878"/><circle cx="216" cy="305" r="5" fill="#10b878"/>

      {/* right paw holding medal */}
      <path d="M264 320 C278 304 297 306 305 320 C312 333 306 348 292 357 C279 365 264 355 258 343 C253 334 257 326 264 320 Z" fill="#fff" {...outline}/>
      <path d="M270 328 q10 -8 18 1" fill="none" stroke="#d9d4d0" strokeWidth="6" strokeLinecap="round"/>

      {/* Milo medal */}
      <path d="M250 347 L285 347 L294 365 L238 365 Z" fill="#10b878" {...outline}/>
      <ellipse cx="267" cy="407" rx="48" ry="60" fill="url(#miloGold)" {...outline}/>
      <text x="267" y="401" textAnchor="middle" fontSize="25" fontWeight="900" fill="#7a4b13">ไมโล</text>
      <circle cx="267" cy="425" r="9" fill="#7a4b13"/>
      <circle cx="252" cy="414" r="5" fill="#7a4b13"/><circle cx="282" cy="414" r="5" fill="#7a4b13"/>
      <path d="M244 438 l-10 4 M289 438 l10 4 M267 441 v10" fill="none" stroke="#7a4b13" strokeWidth="5" strokeLinecap="round"/>

      {/* tiny ground shadow */}
      <ellipse cx="215" cy="538" rx="120" ry="14" fill="#b9ecd9" opacity=".65"/>
    </svg>
  );
}
