import { cn } from "@/lib/utils";

interface CosmicBackdropProps {
  /** Intensidade dos brilhos de fundo. */
  variant?: "hero" | "section" | "final";
  className?: string;
}

/**
 * Camada de profundidade cinematográfica: gradientes radiais, luzes desfocadas
 * e uma névoa violeta. Puramente decorativa.
 */
export function CosmicBackdrop({ variant = "section", className }: CosmicBackdropProps) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {variant === "hero" && (
        <>
          <div
            className="absolute -top-[22%] left-1/2 h-[120vw] w-[120vw] max-h-[900px] max-w-[900px] -translate-x-1/2 rounded-full opacity-70 blur-[80px]"
            style={{
              background:
                "radial-gradient(circle, rgba(109,40,217,0.42) 0%, rgba(76,29,149,0.18) 45%, transparent 70%)",
            }}
          />
          <div
            className="absolute bottom-[-30%] right-[-18%] h-[80vw] w-[80vw] max-h-[620px] max-w-[620px] rounded-full opacity-50 blur-[90px]"
            style={{
              background:
                "radial-gradient(circle, rgba(217,172,91,0.28) 0%, rgba(217,172,91,0.08) 50%, transparent 72%)",
            }}
          />
        </>
      )}

      {variant === "section" && (
        <div
          className="absolute inset-x-0 top-0 h-[520px] opacity-60"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, rgba(109,40,217,0.16) 0%, transparent 70%)",
          }}
        />
      )}

      {variant === "final" && (
        <>
          <div
            className="absolute left-1/2 top-1/2 h-[130vw] w-[130vw] max-h-[820px] max-w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80 blur-[70px] animate-pulse-halo"
            style={{
              background:
                "radial-gradient(circle, rgba(109,40,217,0.4) 0%, rgba(139,92,246,0.14) 42%, transparent 68%)",
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 h-[70vw] w-[70vw] max-h-[440px] max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-[60px]"
            style={{
              background:
                "radial-gradient(circle, rgba(243,215,154,0.26) 0%, transparent 66%)",
            }}
          />
        </>
      )}

      {/* Véu inferior que funde a seção com o preto profundo do fundo. */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />
    </div>
  );
}

/** Flores roxas discretas nas bordas, em SVG leve. */
export function PurpleBloom({
  className,
  flip = false,
}: {
  className?: string;
  flip?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 220 260"
      className={cn("pointer-events-none absolute opacity-[0.42]", className)}
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
    >
      <defs>
        <radialGradient id="petal" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#6D28D9" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#2E1065" stopOpacity="0.1" />
        </radialGradient>
      </defs>
      {/* Pétalas compostas por elipses sobrepostas — leve e sem detalhe excessivo. */}
      <g fill="url(#petal)">
        <ellipse cx="72" cy="86" rx="44" ry="26" transform="rotate(-38 72 86)" />
        <ellipse cx="120" cy="64" rx="38" ry="22" transform="rotate(12 120 64)" />
        <ellipse cx="150" cy="118" rx="42" ry="25" transform="rotate(58 150 118)" />
        <ellipse cx="104" cy="146" rx="40" ry="24" transform="rotate(-8 104 146)" />
        <ellipse cx="56" cy="184" rx="36" ry="21" transform="rotate(-62 56 184)" />
        <ellipse cx="132" cy="204" rx="32" ry="19" transform="rotate(24 132 204)" />
        <circle cx="110" cy="108" r="13" fillOpacity="0.9" />
      </g>
    </svg>
  );
}
