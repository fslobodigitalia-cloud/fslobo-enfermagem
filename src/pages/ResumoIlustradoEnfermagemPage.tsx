import * as React from "react";
import { ArrowRight, Check, Lock, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentMeta } from "@/lib/seo";
import { useProductCatalog } from "@/hooks/useProductCatalog";
import { formatCents, guiaEvolucaoBumps } from "@/config/digitalProducts";
import { ProductCheckout } from "@/components/product/ProductCheckout";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/button";

const HUBRASIL_PRODUCT = {
  slug: "resumo-ilustrado-enfermagem",
  name: "Apostila de Resumos de Enfermagem HUBRASIL",
  priceCents: 1990,
};
const OFFER_SECTION_ID = "comprar";
// The existing kit includes Mapas Mentais, so this offer uses individual additions only.
const HUBRASIL_BUMPS = guiaEvolucaoBumps.filter(bump => bump.slug !== "mapa-mental-ilustrado");
const MODULE_PAGES = [
  {
    src: "/resumo-ilustrado-enfermagem/capa-resumo-ilustrado-enfermagem.webp",
    alt: "Capa da Apostila de Resumos de Enfermagem HUBRASIL",
  },
  { src: "/resumo-ilustrado-enfermagem/previas-reais/pagina-real-002.webp", alt: "Página 2 do PDF: História da saúde pública no Brasil" },
  { src: "/resumo-ilustrado-enfermagem/previas-reais/pagina-real-020.webp", alt: "Página 20 do PDF: Saúde do homem" },
  { src: "/resumo-ilustrado-enfermagem/previas-reais/pagina-real-040.webp", alt: "Página 40 do PDF: Eventos adversos e cultura de segurança" },
  { src: "/resumo-ilustrado-enfermagem/previas-reais/pagina-real-060.webp", alt: "Página 60 do PDF: Calendário de vacinação do adolescente" },
  { src: "/resumo-ilustrado-enfermagem/previas-reais/pagina-real-080.webp", alt: "Página 80 do PDF: Atenção Integrada às Doenças Prevalentes na Infância (AIDPI)" },
  { src: "/resumo-ilustrado-enfermagem/previas-reais/pagina-real-100.webp", alt: "Página 100 do PDF: Saúde do idoso" },
];

const SHADOW_SOFT = "shadow-[0_2px_4px_rgba(15,23,42,0.04),0_8px_20px_-14px_rgba(15,23,42,0.12)]";

const SHADOW_MEDIUM = "shadow-[0_4px_8px_rgba(15,23,42,0.05),0_20px_40px_-20px_rgba(15,23,42,0.16)]";

const CTA_BUTTON_CLASS = cn(
  "border-transparent bg-teal-600 text-white transition-all duration-200",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_4px_rgba(15,23,42,0.08),0_10px_24px_-10px_rgba(13,148,136,0.55)]",
  "hover:-translate-y-px hover:border-transparent hover:bg-teal-700",
  "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_4px_10px_rgba(15,23,42,0.10),0_18px_34px_-12px_rgba(13,148,136,0.6)]",
  "active:translate-y-px active:shadow-[inset_0_1px_2px_rgba(15,23,42,0.25)]",
  "disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0",
);

const TEXTURE_TEAL_BLOOM: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(55% 45% at 12% 0%, rgba(13,148,136,0.06), transparent 60%), radial-gradient(45% 40% at 100% 100%, rgba(13,148,136,0.05), transparent 60%)",
};

const OFFER_NAVY_BG: React.CSSProperties = {
  backgroundColor: "#0a1622",
  backgroundImage:
    "radial-gradient(60% 50% at 15% 0%, rgba(13,148,136,0.16), transparent 60%), radial-gradient(50% 45% at 100% 100%, rgba(16,185,129,0.12), transparent 60%)",
};


function scrollToOffer() {
  document.getElementById(OFFER_SECTION_ID)?.scrollIntoView({ behavior: "smooth" });
}

export default function ResumoIlustradoEnfermagemPage() {
  const catalog = useProductCatalog();
  const product = catalog.status === "success"
    ? catalog.products.find(item => item.slug === HUBRASIL_PRODUCT.slug)
    : undefined;
  const priceCents = product?.priceCents ?? HUBRASIL_PRODUCT.priceCents;
  const canPurchase = Boolean(product) && catalog.status === "success";
  const availabilityMessage = catalog.status === "loading"
    ? "Consultando a disponibilidade do material…"
    : catalog.status === "error"
      ? "Não foi possível consultar a disponibilidade agora. Tente novamente."
      : "Este material ainda não está disponível para compra.";

  useDocumentMeta({
    title: "Resumo Ilustrado de Enfermagem HUBRASIL | FSlobo Enfermagem",
    description: "Apostila HUBRASIL com 108 páginas de resumos ilustrados de enfermagem em PDF. R$ 19,90, pagamento único.",
    path: `/produto/${HUBRASIL_PRODUCT.slug}`,
  });

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />
      <main>
        <Hero priceCents={priceCents} />
        <TopicsSection />
        <ModulesSection priceCents={priceCents} />
        <OfferSection priceCents={priceCents}>
          <ProductCheckout
            slug={HUBRASIL_PRODUCT.slug}
            name={HUBRASIL_PRODUCT.name}
            inline
            bumps={HUBRASIL_BUMPS}
            bumpIntroduction={`Complemente sua revisão, se quiser. Os adicionais são opcionais: você também pode comprar somente a apostila HUBRASIL por ${formatCents(priceCents)}.`}
            basePriceCents={priceCents}
            canPurchase={canPurchase}
            priceLabel={formatCents(priceCents)}
            availabilityMessage={canPurchase ? undefined : availabilityMessage}
          />
          {catalog.status === "error" && (
            <button type="button" onClick={catalog.retry} className="mt-4 text-sm font-semibold text-teal-700 underline underline-offset-4">Consultar disponibilidade novamente</button>
          )}
        </OfferSection>
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero({ priceCents }: { priceCents: number }) {
  return (
    <section
      className="relative isolate overflow-hidden px-3 py-8 text-[#172a3b] selection:bg-[#dcebdc] sm:px-8 sm:py-14 lg:py-20"
      style={{ backgroundColor: "#eff3ed", backgroundImage: "radial-gradient(ellipse at 0% 0%, rgba(7,62,133,0.09), transparent 65%), linear-gradient(145deg, #f7f8f2 15%, #e8eee8 100%)" }}
    >
      <div className="relative mx-auto w-full max-w-[840px] pb-3">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 bottom-0 top-5 rotate-[0.6deg] rounded-2xl bg-[#dfe8df] shadow-[0_14px_28px_-14px_rgba(18,46,43,0.22)] sm:inset-x-6" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-1 bottom-1 top-3 -rotate-[0.35deg] rounded-2xl bg-[#f6f8f2] shadow-[0_6px_12px_-6px_rgba(18,46,43,0.18)] sm:inset-x-3" />
        <div
          className="relative min-w-0 overflow-hidden rounded-2xl bg-[#fffefa] px-5 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_2px_4px_rgba(23,42,59,0.06),0_18px_36px_-18px_rgba(17,46,59,0.24),0_42px_70px_-38px_rgba(7,62,133,0.25)] sm:px-10 sm:py-12 lg:px-14 lg:py-14"
          style={{ backgroundImage: "linear-gradient(120deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.15) 60%, rgba(19,123,62,0.035) 100%), repeating-linear-gradient(0deg, rgba(39,62,48,0.018) 0px, rgba(39,62,48,0.018) 1px, transparent 1px, transparent 5px)" }}
        >
          <h1 className="relative max-w-[20ch] font-sans text-[2rem] font-extrabold leading-[1.14] tracking-[-0.025em] sm:text-[3rem] lg:text-[3.5rem]">
            <span className="block text-[#073e85] [text-shadow:0_1px_0_rgba(255,255,255,0.9)]">Resumos de Enfermagem</span>
            <span className="mt-2 block">para a <span className="text-[#137b3e]">HUBRASIL.</span></span>
          </h1>
          <p className="relative mt-5 max-w-[48ch] text-[16px] leading-[1.65] text-[#43566a] sm:text-[18px]">
            Organize sua revisão para a HUBRASIL com resumos ilustrados de enfermagem. Estude pelo celular e consulte os conteúdos no seu ritmo.
          </p>
          <p className="relative mt-5 text-sm font-medium text-[#43566a]">PDF digital · 108 páginas · Consulta pelo celular</p>
          <div className="relative mt-7 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-sans text-[2rem] font-extrabold leading-tight tracking-tight text-[#073e85]">{formatCents(priceCents)}</span>
            <span className="text-sm text-[#43566a]">Pagamento único</span>
          </div>
          <Button
            size="lg"
            variant="outline"
            full
            className="relative mt-5 min-h-[56px] max-w-[390px] border-transparent bg-[#073e85] bg-gradient-to-b from-[#1059ae] to-[#073e85] px-4 font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-2px_3px_rgba(3,29,65,0.22),0_3px_5px_rgba(3,29,65,0.17),0_12px_20px_-10px_rgba(7,62,133,0.55)] transition-[transform,box-shadow,background-color] duration-200 hover:border-transparent hover:bg-[#052f67] hover:from-[#1054a0] hover:to-[#052f67] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#073e85] motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-px active:shadow-[inset_0_2px_4px_rgba(3,29,65,0.28),0_3px_5px_rgba(3,29,65,0.12)] motion-reduce:transition-none sm:w-auto sm:px-8"
            onClick={scrollToOffer}
          >
            Quero minha apostila HUBRASIL
          </Button>
          <p className="relative mt-4 text-xs leading-relaxed text-[#53647a]">Material independente da FSLobo Enfermagem.</p>
        </div>
      </div>
    </section>
  );
}


function TopicsSection() {
  const topics = [
    "História da saúde pública no Brasil",
    "Saúde do homem",
    "Segurança do paciente e eventos adversos",
    "Calendário de vacinação do adolescente",
    "Atenção Integrada às Doenças Prevalentes na Infância (AIDPI)",
    "Saúde do idoso",
  ];

  return (
    <section aria-labelledby="hubrasil-topics-title" className="bg-white px-5 py-12 sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-[960px]">
        <h2 id="hubrasil-topics-title" className="font-sans text-[1.9rem] font-extrabold leading-tight tracking-tight text-[#073e85] sm:text-[2.35rem]">O que você vai revisar</h2>
        <p className="mt-3 max-w-[65ch] text-[16px] leading-relaxed text-slate-600">Estes são alguns dos temas presentes nas 108 páginas de conteúdo da apostila.</p>
        <ul className="mt-6 grid gap-x-10 sm:grid-cols-2">
          {topics.map(topic => (
            <li key={topic} className="flex items-start gap-3 border-b border-slate-200 py-4 text-[15px] font-semibold leading-relaxed text-slate-800">
              <Check className="mt-1 h-4 w-4 shrink-0 text-[#137b3e]" strokeWidth={2.5} aria-hidden="true" />
              {topic}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}


function ModulesSection({ priceCents }: { priceCents: number }) {
  return (
    <section className="relative bg-white px-5 py-12 sm:py-24" style={TEXTURE_TEAL_BLOOM}>
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="mx-auto max-w-[640px] text-center">
          <span className={cn("inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            Veja por dentro
          </span>
          <h2 className="mt-4 font-sans text-[1.9rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.35rem] lg:text-[2.65rem]">
            Veja páginas reais <span className="text-teal-600">da sua apostila</span>
          </h2>
        </div>

        <div
          className={cn(
            "relative mx-auto mt-6 flex w-fit items-center gap-3 overflow-hidden rounded-full border border-teal-200 bg-gradient-to-b from-teal-50 to-white px-6 py-3 sm:mt-10",
            SHADOW_SOFT,
          )}
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/70 to-transparent" aria-hidden="true" />
          <Sparkles className="relative h-5 w-5 text-teal-600" aria-hidden="true" />
          <span className="relative font-sans text-[1.05rem] font-extrabold text-teal-800">108 páginas para revisar</span>
        </div>

        <p className="mx-auto mt-5 max-w-[640px] text-center text-[15px] leading-relaxed text-slate-600">Comece pela capa e deslize para ver seis páginas reais do PDF que você recebe na compra.</p>
        <div className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto px-1 pb-6 [&::-webkit-scrollbar]:hidden sm:mt-12" style={{ scrollbarWidth: "none" }}>
          {MODULE_PAGES.map((page, i) => (
            <div
              key={page.src}
              className={cn(
                "flex aspect-[3/4] w-[85vw] shrink-0 snap-center items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-3 transition-transform duration-200 hover:-translate-y-1.5 hover:rotate-0 sm:w-[280px] lg:w-[300px]",
                SHADOW_SOFT,
                i % 2 === 0 ? "rotate-[0.6deg]" : "-rotate-[0.6deg]",
              )}
            >
              <img
                src={page.src}
                alt={page.alt}
                width={1200}
                height={1600}
                loading="lazy"
                className="h-full w-full rounded-[16px] object-contain"
              />
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center justify-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> Arraste para ver o conteúdo
        </p>
        <div className="mt-8 flex justify-center">
          <Button size="lg" variant="outline" full className={cn("max-w-[400px] sm:w-auto sm:px-12", CTA_BUTTON_CLASS)} onClick={scrollToOffer}>
            Quero a apostila por {formatCents(priceCents)}
          </Button>
        </div>
      </div>
    </section>
  );
}

function OfferSection({ children, priceCents }: { children: React.ReactNode; priceCents: number }) {
  const priceDigits = formatCents(priceCents).replace("R$", "").trim();

  return (
    <section id={OFFER_SECTION_ID} className="relative scroll-mt-[76px] overflow-hidden px-5 py-16 sm:py-28" style={OFFER_NAVY_BG}>
      
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" aria-hidden="true" />
      
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[680px]">
        
        <div className={cn("relative overflow-hidden rounded-[28px] border border-white/10 bg-white p-6 sm:p-10", "shadow-[0_8px_16px_rgba(0,0,0,0.2),0_40px_90px_-30px_rgba(0,0,0,0.6)]")}>
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-50/80 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-emerald-50/70 blur-3xl" aria-hidden="true" />

          <span className={cn("relative inline-flex items-center gap-2 rounded-full bg-teal-50 px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-teal-700", SHADOW_SOFT)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Sua apostila digital
          </span>
          <h2 className="relative mt-5 font-sans text-[1.9rem] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[2.15rem]">
            {HUBRASIL_PRODUCT.name}
          </h2>
          <p className="relative mt-3 text-[15.5px] leading-relaxed text-slate-600">
            Reúna sua revisão para a HUBRASIL em um PDF com 108 páginas de resumos ilustrados de enfermagem.
          </p>

          <div
            className={cn(
              "relative mt-7 flex flex-col items-center gap-1 overflow-hidden rounded-[24px] border-2 border-teal-200 bg-gradient-to-b from-teal-50 via-white to-white py-8 text-center ring-1 ring-teal-100",
              SHADOW_MEDIUM,
            )}
          >
            <div className="pointer-events-none absolute -top-10 left-1/2 h-24 w-48 -translate-x-1/2 rounded-full bg-teal-300/25 blur-3xl" aria-hidden="true" />
            <span className="relative text-[13px] font-semibold text-slate-500">Sua apostila digital por:</span>
            <span className="relative flex items-start font-sans text-[3.5rem] font-extrabold leading-none text-slate-900 sm:text-[3.75rem]">
              <span className="mr-1 mt-2.5 text-[1.4rem] text-teal-600">R$</span>
              {priceDigits}
            </span>
            <span className="relative mt-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
              Pagamento único · sem mensalidade
            </span>
            <span className="relative text-[13px] font-medium text-slate-500">
              Material digital em PDF · acesso após a confirmação do Pix
            </span>
          </div>

          <div className="relative mt-8">{children}</div>

          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-5 text-[12.5px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Pagamento via Pix, 100% seguro
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" /> Liberado logo após a confirmação do Pix
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
