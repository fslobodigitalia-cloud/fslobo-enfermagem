import * as React from "react";
import { cn } from "@/lib/utils";

/** PRNG determinístico: mesma composição em todo carregamento, sem CLS. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

interface StarFieldProps {
  /** Quantidade no desktop. */
  count?: number;
  /** Quantidade no celular — as demais ficam com display:none. */
  mobileCount?: number;
  seed?: number;
  className?: string;
}

/**
 * Partículas discretas em CSS puro. Nenhum canvas, nenhuma biblioteca.
 * As estrelas excedentes são ocultadas no celular para reduzir o custo de pintura.
 */
export const StarField = React.memo(function StarField({
  count = 34,
  mobileCount = 14,
  seed = 7,
  className,
}: StarFieldProps) {
  const stars = React.useMemo(() => {
    const rand = seeded(seed);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: rand() * 100,
      top: rand() * 100,
      size: 1 + rand() * 2.2,
      delay: rand() * 6,
      duration: 4 + rand() * 6,
      gold: rand() > 0.62,
    }));
  }, [count, seed]);

  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      {stars.map((star, index) => (
        <span
          key={star.id}
          className={cn(
            "absolute rounded-full animate-twinkle",
            index >= mobileCount && "hidden sm:block",
          )}
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            background: star.gold ? "#F3D79A" : "#C4B5FD",
            boxShadow: star.gold
              ? "0 0 6px rgba(243,215,154,0.8)"
              : "0 0 6px rgba(196,181,253,0.7)",
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        />
      ))}
    </div>
  );
});
