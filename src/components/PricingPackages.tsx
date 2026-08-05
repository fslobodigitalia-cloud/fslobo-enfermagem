import * as React from "react";
import { Check, Sparkles } from "lucide-react";
import { copy, packages, sectionIds, type PackageId, type ReadingPackage } from "@/config/site";
import { trackViewPackages } from "@/lib/metaPixel";
import { useSelection } from "@/context/SelectionContext";
import { SectionHeading } from "./common/SectionHeading";
import { RevealGroup, RevealItem } from "./common/Reveal";
import { CosmicBackdrop } from "./common/CosmicBackdrop";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

/** No celular o pacote em destaque aparece primeiro; no desktop volta ao centro. */
const mobileOrder: Record<PackageId, string> = {
  clareza: "order-1 lg:order-none",
  essencial: "order-2 lg:order-none",
  profunda: "order-3 lg:order-none",
};

export function PricingPackages() {
  const { openQualification } = useSelection();
  const sectionRef = React.useRef<HTMLElement>(null);

  /* ViewContent dispara uma única vez, quando a seção entra na tela. */
  React.useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          trackViewPackages();
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id={sectionIds.packages}
      ref={sectionRef}
      className="relative scroll-mt-24 py-16 sm:py-20 lg:py-28"
    >
      <CosmicBackdrop variant="section" />

      <div className="shell relative z-10">
        <SectionHeading
          eyebrow={copy.packages.eyebrow}
          title={copy.packages.title}
          text={copy.packages.text}
        />

        <RevealGroup
          as="ul"
          className={cn(
            "mt-11 sm:mt-14",
            "snap-row -mx-[22px] items-stretch px-[22px]",
            "lg:mx-0 lg:grid lg:grid-cols-3 lg:items-stretch lg:gap-6 lg:overflow-visible lg:px-0",
          )}
        >
          {packages.map((pkg) => (
            <RevealItem
              as="li"
              key={pkg.id}
              className={cn("snap-item flex lg:w-auto", mobileOrder[pkg.id])}
            >
              <PackageCard pkg={pkg} onChoose={() => openQualification(pkg)} />
            </RevealItem>
          ))}
        </RevealGroup>

        <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-dim sm:mt-11">
          {copy.packages.notes.map((note, index) => (
            <li key={note} className="flex items-center gap-3">
              {index > 0 && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gold/55" />}
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PackageCard({ pkg, onChoose }: { pkg: ReadingPackage; onChoose: () => void }) {
  const featured = pkg.featured;

  return (
    <article
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-[26px] p-6 transition-all duration-500 sm:p-7",
        featured
          ? "glass-strong lg:scale-[1.05] lg:p-8"
          : "glass hover:-translate-y-1 hover:border-gold/45",
      )}
      style={
        featured
          ? {
              boxShadow:
                "0 0 0 1px rgba(217,172,91,0.45), 0 0 70px -22px rgba(109,40,217,0.75), 0 34px 90px -46px rgba(0,0,0,0.95)",
            }
          : undefined
      }
    >
      {featured && (
        <>
          {/* Halo roxo e dourado, discreto e sem piscar. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full opacity-60 blur-[60px] animate-pulse-halo"
            style={{
              background:
                "radial-gradient(circle, rgba(109,40,217,0.7) 0%, rgba(139,92,246,0.2) 50%, transparent 72%)",
            }}
          />
          {/* Brilho que percorre a borda superior. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
            <span className="absolute inset-y-0 w-1/3 animate-sheen bg-gradient-to-r from-transparent via-gold-light to-transparent" />
          </span>
        </>
      )}

      {featured && pkg.badge && (
        <span className="relative mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-gold/45 bg-gold/[0.1] px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-gold-light">
          <Sparkles className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" />
          {pkg.badge}
        </span>
      )}

      <h3 className="relative font-display text-[1.6rem] leading-tight text-cream sm:text-[1.8rem]">
        {pkg.name}
      </h3>

      <p className="relative mt-1.5 text-[13px] font-semibold uppercase tracking-[0.18em] text-gold/90">
        {pkg.questions} perguntas
      </p>

      <p className="relative mt-5 flex items-end gap-2">
        <span
          className={cn(
            "font-display leading-none",
            featured ? "gold-text text-[3.1rem] sm:text-[3.4rem]" : "text-cream text-[2.7rem]",
          )}
        >
          {pkg.priceLabel}
        </span>
      </p>

      <p className="relative mt-4 text-[14px] leading-relaxed text-dim">{pkg.description}</p>

      <span aria-hidden="true" className="relative my-6 h-px w-full gold-rule opacity-60" />

      <ul className="relative flex flex-1 flex-col gap-3">
        {pkg.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-3 text-[14px] leading-snug text-cream/90">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-gold"
              strokeWidth={2.2}
              aria-hidden="true"
            />
            {benefit}
          </li>
        ))}
      </ul>

      <Button
        full
        variant={featured ? "gold" : "ghost"}
        onClick={onChoose}
        className="relative mt-7"
      >
        {pkg.ctaLabel}
      </Button>
    </article>
  );
}
