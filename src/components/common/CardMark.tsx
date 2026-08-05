import { cn } from "@/lib/utils";

/**
 * Selo da marca: apenas a carta, sem a escrita.
 * Desenhado a partir do logotipo — moldura dourada dupla, sol radiante e
 * lua crescente sobre roxo profundo. Vetorial, nítido em qualquer tamanho.
 */
export function CardMark({ className, glow = true }: { className?: string; glow?: boolean }) {
  return (
    <svg
      viewBox="0 0 72 100"
      className={cn("h-full w-full", className)}
      aria-hidden="true"
      focusable="false"
      style={glow ? { filter: "drop-shadow(0 4px 18px rgba(217,172,91,0.35))" } : undefined}
    >
      <defs>
        <linearGradient id="marca-corpo" x1="12%" y1="0%" x2="88%" y2="100%">
          <stop offset="0%" stopColor="#341358" />
          <stop offset="48%" stopColor="#1B0B30" />
          <stop offset="100%" stopColor="#090412" />
        </linearGradient>
        <radialGradient id="marca-brilho" cx="50%" cy="40%" r="58%">
          <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#180A2A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="marca-ouro" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F3D79A" />
          <stop offset="46%" stopColor="#D9AC5B" />
          <stop offset="100%" stopColor="#B4863A" />
        </linearGradient>
      </defs>

      <rect x="1.5" y="1.5" width="69" height="97" rx="9" fill="url(#marca-corpo)" />
      <rect x="1.5" y="1.5" width="69" height="97" rx="9" fill="url(#marca-brilho)" />
      <rect
        x="1.5"
        y="1.5"
        width="69"
        height="97"
        rx="9"
        fill="none"
        stroke="url(#marca-ouro)"
        strokeWidth="2.4"
      />
      <rect
        x="7"
        y="7"
        width="58"
        height="86"
        rx="5"
        fill="none"
        stroke="url(#marca-ouro)"
        strokeWidth="0.9"
        opacity="0.55"
      />

      {/* Sol radiante */}
      <g stroke="url(#marca-ouro)" strokeWidth="0.9" strokeLinecap="round" opacity="0.9">
        {Array.from({ length: 20 }).map((_, i) => {
          const angle = (i / 20) * Math.PI * 2;
          const inner = i % 2 === 0 ? 14 : 12;
          const outer = i % 2 === 0 ? 23 : 18;
          return (
            <line
              key={i}
              x1={36 + Math.cos(angle) * inner}
              y1={44 + Math.sin(angle) * inner}
              x2={36 + Math.cos(angle) * outer}
              y2={44 + Math.sin(angle) * outer}
            />
          );
        })}
      </g>

      {/* Lua crescente com estrela */}
      <path d="M41 34a11 11 0 1 0 0 20 8.6 8.6 0 1 1 0-20z" fill="url(#marca-ouro)" />
      <path
        d="M46.5 40 l1 2.6 2.6 1 -2.6 1 -1 2.6 -1 -2.6 -2.6 -1 2.6 -1z"
        fill="url(#marca-ouro)"
      />

      {/* Selo inferior */}
      <g opacity="0.85">
        <path d="M22 74 H50" stroke="url(#marca-ouro)" strokeWidth="0.8" />
        <path
          d="M36 68 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8z"
          fill="url(#marca-ouro)"
        />
      </g>
    </svg>
  );
}
