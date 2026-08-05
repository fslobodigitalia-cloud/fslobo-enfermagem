import { copy } from "@/config/site";

/**
 * Faixa horizontal contínua que encerra a hero. A animação é pausada no hover
 * e desligada por prefers-reduced-motion (regra global em index.css).
 */
export function AnimatedMarquee() {
  const items = copy.marquee;

  return (
    <div
      aria-label="Temas das leituras"
      role="group"
      className="relative bg-ink/55 backdrop-blur-sm"
    >
      <div className="hairline" />
      <div className="group relative overflow-hidden py-4 sm:py-5">
        <div className="mask-fade-x flex w-max animate-marquee gap-0 group-hover:[animation-play-state:paused]">
          {[0, 1].map((copyIndex) => (
            <ul key={copyIndex} aria-hidden={copyIndex === 1} className="flex shrink-0 items-center">
              {items.map((item) => (
                <li key={`${copyIndex}-${item}`} className="flex items-center">
                  <span className="whitespace-nowrap px-5 font-display text-[clamp(1rem,3.2vw,1.5rem)] uppercase tracking-[0.16em] text-cream/85">
                    {item}
                  </span>
                  <span aria-hidden="true" className="text-gold/70">
                    ✦
                  </span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <div className="hairline" />
    </div>
  );
}
