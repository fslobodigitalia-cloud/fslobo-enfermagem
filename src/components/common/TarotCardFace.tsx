import { cn } from "@/lib/utils";

interface TarotCardFaceProps {
  className?: string;
  /** Sufixo único para os ids de gradiente (evita colisão entre instâncias). */
  uid: string;
  /** A carta em destaque recebe mais detalhe e brilho. */
  hero?: boolean;
}

/**
 * Verso da carta da Entre Nós Tarô, desenhado em SVG a partir do logotipo:
 * moldura dourada dupla, sol radiante e lua crescente sobre roxo profundo.
 */
export function TarotCardFace({ className, uid, hero = false }: TarotCardFaceProps) {
  const g = (name: string) => `${name}-${uid}`;

  return (
    <svg
      viewBox="0 0 260 400"
      className={cn("h-full w-full", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={g("body")} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#2A1049" />
          <stop offset="45%" stopColor="#180A2A" />
          <stop offset="100%" stopColor="#0A0512" />
        </linearGradient>
        <radialGradient id={g("glow")} cx="50%" cy="42%" r="52%">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#6D28D9" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#180A2A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g("gold")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F3D79A" />
          <stop offset="48%" stopColor="#D9AC5B" />
          <stop offset="100%" stopColor="#B98A3E" />
        </linearGradient>
        <linearGradient id={g("edge")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F3D79A" stopOpacity="0.95" />
          <stop offset="50%" stopColor="#C99A4A" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#F3D79A" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="256" height="396" rx="18" fill={`url(#${g("body")})`} />
      <rect x="2" y="2" width="256" height="396" rx="18" fill={`url(#${g("glow")})`} />
      <rect
        x="3"
        y="3"
        width="254"
        height="394"
        rx="17"
        fill="none"
        stroke={`url(#${g("edge")})`}
        strokeWidth="3"
      />
      <rect
        x="16"
        y="16"
        width="228"
        height="368"
        rx="10"
        fill="none"
        stroke={`url(#${g("gold")})`}
        strokeWidth="1"
        opacity="0.65"
      />
      <rect
        x="24"
        y="24"
        width="212"
        height="352"
        rx="6"
        fill="none"
        stroke={`url(#${g("gold")})`}
        strokeWidth="0.6"
        opacity="0.32"
      />

      {/* Ornamentos de canto */}
      <g stroke={`url(#${g("gold")})`} strokeWidth="1.1" fill="none" opacity="0.8">
        <path d="M28 46 L28 32 Q28 28 32 28 L46 28" />
        <path d="M232 46 L232 32 Q232 28 228 28 L214 28" />
        <path d="M28 354 L28 368 Q28 372 32 372 L46 372" />
        <path d="M232 354 L232 368 Q232 372 228 372 L214 372" />
      </g>

      {/* Sol radiante */}
      <g stroke={`url(#${g("gold")})`} strokeWidth="1.1" strokeLinecap="round" opacity="0.85">
        {Array.from({ length: hero ? 32 : 20 }).map((_, i) => {
          const total = hero ? 32 : 20;
          const angle = (i / total) * Math.PI * 2;
          const inner = i % 2 === 0 ? 52 : 46;
          const outer = i % 2 === 0 ? 84 : 68;
          const cx = 130;
          const cy = 168;
          return (
            <line
              key={i}
              x1={cx + Math.cos(angle) * inner}
              y1={cy + Math.sin(angle) * inner}
              x2={cx + Math.cos(angle) * outer}
              y2={cy + Math.sin(angle) * outer}
            />
          );
        })}
      </g>

      <circle
        cx="130"
        cy="168"
        r="40"
        fill="none"
        stroke={`url(#${g("gold")})`}
        strokeWidth="1.2"
        opacity="0.6"
      />

      {/* Lua crescente */}
      <path
        d="M144 142a30 30 0 1 0 0 52 24 24 0 1 1 0-52z"
        fill={`url(#${g("gold")})`}
      />

      {/* Estrelas ao redor da lua */}
      <g fill={`url(#${g("gold")})`} opacity="0.9">
        <path d="M156 156 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4z" />
        <path d="M162 178 l1.7 4.3 4.3 1.7 -4.3 1.7 -1.7 4.3 -1.7 -4.3 -4.3 -1.7 4.3 -1.7z" />
        <path d="M150 190 l1.3 3.3 3.3 1.3 -3.3 1.3 -1.3 3.3 -1.3 -3.3 -3.3 -1.3 3.3 -1.3z" />
      </g>

      {/* Selo inferior */}
      <g opacity="0.85">
        <path d="M84 300 H176" stroke={`url(#${g("gold")})`} strokeWidth="0.8" />
        <path
          d="M130 288 l3.6 9 9 3.6 -9 3.6 -3.6 9 -3.6 -9 -9 -3.6 9 -3.6z"
          fill={`url(#${g("gold")})`}
        />
        <path d="M84 316 H176" stroke={`url(#${g("gold")})`} strokeWidth="0.5" opacity="0.5" />
      </g>

      {/* Poeira de estrelas discreta */}
      {hero && (
        <g fill="#F3D79A" opacity="0.5">
          <circle cx="62" cy="92" r="1.3" />
          <circle cx="200" cy="112" r="1" />
          <circle cx="76" cy="252" r="1.1" />
          <circle cx="192" cy="268" r="1.4" />
          <circle cx="118" cy="72" r="0.9" />
        </g>
      )}
    </svg>
  );
}
