import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, Sparkles } from "lucide-react";
import { copy, sectionIds } from "@/config/site";
import { scrollToId } from "@/lib/scroll";
import { useSelection } from "@/context/SelectionContext";
import { Button } from "./ui/button";
import { HeroVideo } from "./HeroVideo";
import { AnimatedMarquee } from "./AnimatedMarquee";
import { StarField } from "./common/StarField";

export function Hero() {
  const { goToOffer } = useSelection();
  const reduced = useReducedMotion();

  const fade = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section id={sectionIds.hero} className="relative isolate overflow-hidden">
      <HeroVideo />
      <StarField count={26} mobileCount={10} seed={11} className="z-[1]" />

      {/* Bloco de conteúdo — hero compacta, sem competir com o vídeo. */}
      <div className="relative z-10 flex min-h-[72svh] flex-col justify-center pb-10 pt-[108px] sm:min-h-[76svh] sm:pb-12 lg:min-h-[80vh] lg:pb-14 lg:pt-[132px]">
        <div className="shell flex flex-col items-center text-center">
          <motion.span
            {...fade(0.05)}
            className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-ink/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-light backdrop-blur-md sm:text-[11px] sm:tracking-[0.24em]"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
            {copy.hero.badge}
          </motion.span>

          <motion.h1
            {...fade(0.14)}
            className="mt-6 max-w-[16ch] font-display text-[clamp(2.3rem,8.6vw,4.4rem)] leading-[1.03] tracking-[-0.015em] text-cream text-balance sm:mt-7"
          >
            {copy.hero.titleStart}{" "}
            <span className="gold-text">{copy.hero.titleHighlight}</span>
            {copy.hero.titleEnd}
          </motion.h1>

          <motion.p
            {...fade(0.22)}
            className="mt-5 max-w-[44ch] text-[15px] leading-relaxed text-dim text-pretty sm:text-[17px]"
          >
            {copy.hero.text}
          </motion.p>

          <motion.div
            {...fade(0.3)}
            className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center"
          >
            <Button onClick={goToOffer} className="w-full sm:w-auto sm:min-w-[240px]">
              {copy.hero.primaryCta}
            </Button>
            <Button
              variant="ghost"
              onClick={() => scrollToId(sectionIds.howItWorks)}
              className="w-full bg-ink/35 backdrop-blur-md sm:w-auto"
            >
              {copy.hero.secondaryCta}
              <ArrowDown className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
            </Button>
          </motion.div>

          <motion.ul
            {...fade(0.38)}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12px] text-dim/90 sm:text-[13px]"
          >
            {copy.hero.trust.map((item, index) => (
              <li key={item} className="flex items-center gap-3">
                {index > 0 && (
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gold/60" />
                )}
                <span>{item}</span>
              </li>
            ))}
          </motion.ul>
        </div>
      </div>

      {/* Faixa infinita fechando a hero. */}
      <div className="relative z-10">
        <AnimatedMarquee />
      </div>
    </section>
  );
}
