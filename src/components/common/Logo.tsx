import { cn } from "@/lib/utils";
import { CardMark } from "./CardMark";

interface LogoProps {
  className?: string;
  /** Exibe somente o selo da carta, sem a escrita. */
  markOnly?: boolean;
  /** Altura do selo da carta, em pixels. */
  size?: number;
  /** Escala tipográfica da escrita ao lado do selo. */
  tone?: "default" | "large";
}

/**
 * Marca da Entre Nós Tarô: o selo é apenas a carta e a escrita fica ao lado,
 * em composição editorial — nunca dentro do símbolo.
 */
export function Logo({ className, markOnly = false, size = 40, tone = "default" }: LogoProps) {
  const large = tone === "large";

  return (
    <span className={cn("inline-flex items-center gap-3.5", className)}>
      <span
        className="relative block shrink-0"
        style={{ height: size, width: Math.round(size * 0.72) }}
      >
        {/* Halo dourado discreto atrás da carta. */}
        <span
          aria-hidden="true"
          className="absolute inset-[-32%] rounded-full opacity-70 blur-lg"
          style={{
            background:
              "radial-gradient(circle, rgba(217,172,91,0.32) 0%, rgba(109,40,217,0.18) 52%, transparent 72%)",
          }}
        />
        <CardMark className="relative" />
      </span>

      {!markOnly && (
        <span className="flex flex-col justify-center leading-none">
          <span
            className={cn(
              "font-display font-semibold tracking-[0.16em] text-cream",
              large ? "text-[1.5rem]" : "text-[1.06rem]",
            )}
          >
            ENTRE NÓS
          </span>
          <span
            aria-hidden="true"
            className={cn("mt-[7px] flex items-center gap-2", large ? "gap-2.5" : "gap-2")}
          >
            <span className="h-px w-3 bg-gold/60" />
            <span
              className={cn(
                "font-semibold tracking-[0.42em] text-gold",
                large ? "text-[0.78rem]" : "text-[0.6rem]",
              )}
            >
              TARÔ
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-gold/60 to-transparent" />
          </span>
        </span>
      )}
    </span>
  );
}
