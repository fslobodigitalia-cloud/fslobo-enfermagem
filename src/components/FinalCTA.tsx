import { copy } from "@/config/site";
import { useSelection } from "@/context/SelectionContext";
import { Reveal } from "./common/Reveal";
import { Button } from "./ui/button";
import { CosmicBackdrop, PurpleBloom } from "./common/CosmicBackdrop";
import { StarField } from "./common/StarField";
import { TarotCardFace } from "./common/TarotCardFace";

export function FinalCTA() {
  const { goToOffer } = useSelection();

  return (
    <section
      aria-labelledby="cta-final-titulo"
      className="relative overflow-hidden py-20 sm:py-24 lg:py-32"
    >
      <CosmicBackdrop variant="final" />
      <StarField count={30} mobileCount={12} seed={23} />
      <PurpleBloom className="-left-14 bottom-0 h-56 w-48 sm:h-72 sm:w-60" />
      <PurpleBloom className="-right-14 top-4 h-52 w-44 sm:h-64 sm:w-56" flip />

      <div className="shell relative z-10 flex flex-col items-center text-center">
        {/* Portal luminoso com a carta central. */}
        <Reveal className="relative mb-10 flex h-[190px] w-[190px] items-center justify-center sm:h-[220px] sm:w-[220px]">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-gold/40"
            style={{ boxShadow: "0 0 60px -10px rgba(217,172,91,0.65), inset 0 0 50px -18px rgba(139,92,246,0.9)" }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-6 rounded-full border border-gold/20 animate-pulse-halo"
          />
          <span
            aria-hidden="true"
            className="absolute inset-[-18%] rounded-full opacity-70 blur-[46px]"
            style={{
              background:
                "radial-gradient(circle, rgba(109,40,217,0.6) 0%, rgba(217,172,91,0.18) 52%, transparent 72%)",
            }}
          />
          <div
            aria-hidden="true"
            className="relative h-[132px] w-[86px] overflow-hidden rounded-[10px] animate-float sm:h-[152px] sm:w-[99px]"
            style={{ boxShadow: "0 0 0 1px rgba(243,215,154,0.4), 0 30px 60px -26px rgba(0,0,0,0.95)" }}
          >
            <TarotCardFace uid="cta-final" hero />
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <h2
            id="cta-final-titulo"
            className="mx-auto max-w-[20ch] font-display text-[clamp(2rem,7vw,3.4rem)] leading-[1.06] text-cream text-balance"
          >
            {copy.finalCta.title}
          </h2>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="mx-auto mt-5 max-w-[48ch] text-[15px] leading-relaxed text-dim text-pretty sm:text-base">
            {copy.finalCta.text}
          </p>
        </Reveal>

        <Reveal delay={0.24} className="mt-9 w-full sm:w-auto">
          <Button size="lg" full onClick={goToOffer} className="sm:w-auto sm:min-w-[280px]">
            {copy.finalCta.button}
          </Button>
        </Reveal>

        <Reveal delay={0.3}>
          <p className="mt-5 text-[13px] text-dim/85">{copy.finalCta.note}</p>
        </Reveal>
      </div>
    </section>
  );
}
