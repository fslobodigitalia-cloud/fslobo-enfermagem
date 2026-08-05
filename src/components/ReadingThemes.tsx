import * as React from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { ArrowUpRight, Briefcase, Compass, Flower2, Heart } from "lucide-react";
import { copy, sectionIds, themePath, themes, type ReadingTheme } from "@/config/site";
import { withCampaignQuery } from "@/lib/utmTracking";
import { SectionHeading } from "./common/SectionHeading";
import { Reveal } from "./common/Reveal";
import { CosmicBackdrop } from "./common/CosmicBackdrop";
import { cn } from "@/lib/utils";

const icons = {
  heart: Heart,
  compass: Compass,
  briefcase: Briefcase,
  lotus: Flower2,
} as const;

/** Velocidade do carrossel, em pixels por segundo. */
const SPEED = 26;

export function ReadingThemes() {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const pausedRef = React.useRef(false);
  const resumeTimer = React.useRef<number>();
  const reduced = useReducedMotion();

  /**
   * Carrossel infinito: a lista é renderizada duas vezes e a rolagem volta ao
   * início ao passar da metade, sem emenda visível. O contêiner continua sendo
   * um elemento rolável de verdade — arrastar com o dedo funciona normalmente.
   */
  React.useEffect(() => {
    if (reduced) return;
    const element = trackRef.current;
    if (!element) return;

    let frame = 0;
    let last = performance.now();

    const step = (now: number) => {
      const delta = now - last;
      last = now;

      if (!pausedRef.current && !document.hidden) {
        element.scrollLeft += (SPEED * delta) / 1000;
      }

      const half = element.scrollWidth / 2;
      if (half > 0) {
        if (element.scrollLeft >= half) element.scrollLeft -= half;
        else if (element.scrollLeft < 0) element.scrollLeft += half;
      }

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  const pause = () => {
    window.clearTimeout(resumeTimer.current);
    pausedRef.current = true;
  };

  const resume = (delay = 0) => {
    window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      pausedRef.current = false;
    }, delay);
  };

  React.useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  return (
    <section id={sectionIds.themes} className="relative scroll-mt-24 py-16 sm:py-20 lg:py-24">
      <CosmicBackdrop variant="section" />

      <div className="shell relative z-10">
        <SectionHeading
          eyebrow={copy.themes.eyebrow}
          title={copy.themes.title}
          text={copy.themes.text}
        />
      </div>

      <Reveal className="relative z-10 mt-10 sm:mt-12">
        <div
          ref={trackRef}
          className={cn(
            "flex gap-4 overflow-x-auto px-[22px] pb-2 sm:gap-5 sm:px-6 lg:px-8",
            "[scroll-behavior:auto] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            // Sem a animação, volta a ser um carrossel comum com scroll-snap.
            reduced && "snap-x snap-mandatory",
          )}
          onPointerEnter={pause}
          onPointerLeave={() => resume()}
          onFocusCapture={pause}
          onBlurCapture={() => resume()}
          onTouchStart={pause}
          onTouchEnd={() => resume(2500)}
        >
          {[0, 1].map((pass) =>
            themes.map((theme) => (
              <ThemeCard
                key={`${pass}-${theme.id}`}
                theme={theme}
                /* A segunda passagem é apenas visual: fica fora da árvore de acessibilidade. */
                clone={pass === 1}
              />
            )),
          )}
        </div>
      </Reveal>
    </section>
  );
}

function ThemeCard({ theme, clone }: { theme: ReadingTheme; clone: boolean }) {
  const Icon = icons[theme.icon];

  return (
    <article
      className={cn("shrink-0 snap-start", "w-[78vw] max-w-[320px] sm:w-[300px] lg:w-[318px]")}
      aria-hidden={clone || undefined}
    >
      <Link
        to={withCampaignQuery(themePath(theme))}
        tabIndex={clone ? -1 : undefined}
        className="group relative block overflow-hidden rounded-[26px] border border-gold/25 transition-all duration-500 hover:border-gold/60 focus-visible:border-gold"
        style={{ boxShadow: "0 26px 70px -44px rgba(0,0,0,0.95)" }}
      >
        {/* Proporção 1080x1350 reservada: nenhuma reflow ao carregar a imagem. */}
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-plum">
          <picture>
            <source srcSet={theme.image.avif} type="image/avif" />
            <img
              src={theme.image.webp}
              alt={clone ? "" : theme.image.alt}
              width={1080}
              height={1350}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.06]"
            />
          </picture>

          {/* Véu de leitura sobre a arte. */}
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(7,4,13,0.1) 0%, rgba(7,4,13,0.05) 38%, rgba(7,4,13,0.72) 72%, rgba(7,4,13,0.96) 100%)",
            }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(70% 50% at 50% 30%, rgba(217,172,91,0.22) 0%, transparent 70%)",
            }}
          />

          {/* Conteúdo do card. */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
            <span
              aria-hidden="true"
              className="grid h-11 w-11 place-items-center rounded-2xl border border-gold/40 bg-ink/50 text-gold backdrop-blur-md transition-colors duration-500 group-hover:border-gold/80"
            >
              <Icon className="h-5 w-5" strokeWidth={1.4} />
            </span>

            <h3 className="font-display text-[1.5rem] leading-tight text-cream">{theme.title}</h3>
            <p className="text-[13.5px] leading-relaxed text-dim">{theme.text}</p>

            <span className="mt-2 inline-flex items-center gap-2 text-[13px] font-semibold text-gold-light">
              {copy.themes.cardCta}
              <ArrowUpRight
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={1.9}
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
