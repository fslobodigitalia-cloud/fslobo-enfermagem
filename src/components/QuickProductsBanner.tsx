import { Link } from "react-router-dom";
import { ArrowUpRight, Calendar, Sparkles } from "lucide-react";
import { copy, quickProductPath, quickProducts, sectionIds, type QuickProduct } from "@/config/site";
import { withCampaignQuery } from "@/lib/utmTracking";
import { RevealGroup, RevealItem } from "./common/Reveal";
import { SectionHeading } from "./common/SectionHeading";

const icons = { sparkles: Sparkles, calendar: Calendar } as const;

/**
 * Duas experiências pontuais, lado a lado — porta de entrada mais rápida que
 * o carrossel de temas, sem escolha de tema ou pacote. Sem auto-scroll: com
 * apenas dois itens, um carrossel infinito ficaria só balançando entre eles.
 */
export function QuickProductsBanner() {
  const { quickProducts: text } = copy;

  return (
    <section
      id={sectionIds.quickProducts}
      aria-labelledby="experiencias-rapidas-titulo"
      className="relative py-12 sm:py-14"
    >
      <div className="shell relative z-10">
        <SectionHeading
          eyebrow={text.eyebrow}
          title={text.title}
          text={text.text}
          titleId="experiencias-rapidas-titulo"
        />

        <RevealGroup as="ul" className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2">
          {quickProducts.map((product) => (
            <RevealItem as="li" key={product.id}>
              <ProductBanner product={product} />
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

function ProductBanner({ product }: { product: QuickProduct }) {
  const Icon = icons[product.banner.icon];
  const { quickProducts: text } = copy;

  return (
    <Link
      to={withCampaignQuery(quickProductPath(product))}
      className="group relative flex items-center gap-5 overflow-hidden rounded-[24px] border border-gold/25 bg-gradient-to-br from-plum/60 via-ink-soft to-ink p-5 transition-all duration-500 hover:border-gold/55 sm:p-6"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-75"
        style={{
          background:
            "radial-gradient(circle, rgba(217,172,91,0.5) 0%, rgba(109,40,217,0.28) 55%, transparent 74%)",
        }}
      />

      <span
        aria-hidden="true"
        className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-gold/35 bg-gold/[0.08] text-gold transition-colors duration-500 group-hover:border-gold/65"
      >
        <Icon className="h-6 w-6" strokeWidth={1.4} />
      </span>

      <span className="relative flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[1.25rem] leading-tight text-cream">
            {product.banner.title}
          </span>
          <span className="shrink-0 font-display text-[1.1rem] gold-text">{product.priceLabel}</span>
        </span>
        <span className="mt-1.5 block text-[13.5px] leading-snug text-dim">{product.banner.text}</span>
        <span className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gold-light">
          {text.cta}
          <ArrowUpRight
            className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={1.9}
            aria-hidden="true"
          />
        </span>
      </span>
    </Link>
  );
}
