import * as React from "react";
import { ArrowRight, BookOpenText, ChevronRight, Download, FileText, Lock, ShoppingCart, Smartphone, Sparkles, SquareCheckBig, Tag, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentMeta } from "@/lib/seo";
import { useProductCatalog } from "@/hooks/useProductCatalog";
import { formatCents, guiaEvolucaoBumps } from "@/config/digitalProducts";
import { BrazilCrossIcon, CalendarSyringeIcon, ElderlyIcon, KidsIcon, MaleIcon, ShieldAlertIcon } from "@/components/product/hubrasilTopicIcons";
import { ProductCheckout } from "@/components/product/ProductCheckout";
import { initHubrasilPixel, trackHubrasilInitiateCheckout, trackHubrasilPurchase } from "@/lib/hubrasilPixel";
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


/**
 * Cartão do carrossel. As páginas de prévia (a partir da 2ª) pesam ~220 KB cada
 * e, só com loading="lazy", o Chrome as baixa já na abertura (a margem nativa
 * é de ~1250 px) e disputam banda com o script do TikTok Pixel e o catálogo.
 * Aqui o `src` só é definido quando o cartão chega perto da tela (500 px na
 * vertical, 100 px na horizontal = o próximo cartão ao deslizar).
 */
function PreviewCard({ page, gated, className }: { page: { src: string; alt: string }; gated: boolean; className: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [near, setNear] = React.useState(!gated || typeof IntersectionObserver === "undefined");

  React.useEffect(() => {
    const node = ref.current;
    if (near || !node) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "500px 100px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);

  return (
    <div ref={ref} className={className}>
      <img
        src={near ? page.src : undefined}
        alt={page.alt}
        width={1200}
        height={1600}
        loading="lazy"
        className="h-full w-full rounded-[16px] object-contain"
      />
    </div>
  );
}

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

  // Meta Pixel: init + PageView + ViewContent, uma vez por visita (ver hubrasilPixel.ts).
  React.useEffect(() => {
    initHubrasilPixel(priceCents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            variant="hubrasil"
            bumps={HUBRASIL_BUMPS}
            bumpIntroduction={`Complemente sua revisão, se quiser. Os adicionais são opcionais: você também pode comprar somente a apostila HUBRASIL por ${formatCents(priceCents)}.`}
            basePriceCents={priceCents}
            onInitiateCheckout={({ totalCents, productSlugs }) => trackHubrasilInitiateCheckout(totalCents, productSlugs)}
            onPurchaseConfirmed={trackHubrasilPurchase}
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

const HERO_BENEFITS = [
  { icon: FileText, label: "108 páginas", width: "max-w-[11cqw]" },
  { icon: Smartphone, label: "Estude pelo celular", width: "max-w-[18.5cqw]" },
  { icon: SquareCheckBig, label: "Conteúdo objetivo", width: "max-w-[18.5cqw]" },
];

const HERO_IMG_SIZES = "(min-width: 640px) 360px, 90vw";

/**
 * Hero. No celular (< 640 px) as medidas usam `cqw` (1% da largura do bloco)
 * para manter as proporções da referência em qualquer largura; a partir de
 * 640 px vira duas colunas, texto à esquerda e a arte à direita.
 * O `sizes` da imagem precisa ser igual ao do preload em index.html.
 */
function Hero({ priceCents }: { priceCents: number }) {
  return (
    <section
      className="relative isolate overflow-hidden text-[#172a3b] selection:bg-[#dcebdc] md:px-8"
      style={{ backgroundColor: "#eaf3fb", backgroundImage: "linear-gradient(160deg, #f4f9fd 10%, #e3eef8 100%)" }}
    >
      <div className="relative isolate mx-auto grid aspect-[390/722] w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-white [container-type:inline-size] md:aspect-auto md:max-w-[1000px] md:grid-cols-[minmax(0,1fr)_330px] md:grid-rows-[1fr_auto_auto_1fr] md:gap-x-10 md:overflow-visible md:bg-transparent md:py-14 lg:max-w-[1120px] lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-x-14">
        {/* Arte: no celular preenche toda a largura (levemente ampliada, sem distorcer); no computador, a 2ª coluna. */}
        <div className="absolute inset-0 -z-10 md:static md:z-0 md:col-start-2 md:row-span-4 md:row-start-1 md:aspect-[4/5] md:overflow-hidden md:rounded-3xl md:shadow-[0_24px_60px_-28px_rgba(7,62,133,0.45)]">
          <img
            src="/resumo-ilustrado-enfermagem/hero-hubrasil-720.webp"
            srcSet="/resumo-ilustrado-enfermagem/hero-hubrasil-480.webp 480w, /resumo-ilustrado-enfermagem/hero-hubrasil-720.webp 720w, /resumo-ilustrado-enfermagem/hero-hubrasil-941.webp 941w"
            sizes={HERO_IMG_SIZES}
            width={941}
            height={1672}
            alt="Tablet mostrando páginas ilustradas da apostila de resumos de enfermagem HUBRASIL"
            fetchPriority="high"
            decoding="async"
            className="absolute left-0 top-[-4.4cqw] h-auto w-full max-w-none md:static md:h-full md:w-full md:object-cover md:object-[50%_58%]"
          />
        </div>

        <div className="row-start-1 px-[6.7cqw] pt-[2.56cqw] md:col-start-1 md:row-start-2 md:p-0">
          <span className="inline-flex h-[6.4cqw] items-center gap-[1.6cqw] rounded-full bg-[#dff0e4] px-[2.8cqw] text-[max(10px,2.7cqw)] font-extrabold uppercase tracking-[0.02em] [word-spacing:0.18em] text-[#1f3b2d] md:h-auto md:gap-2 md:px-3.5 md:py-1.5 md:text-[12px]">
            <BookOpenText className="h-[5cqw] w-[5cqw] text-[#137b3e] md:h-4 md:w-4" aria-hidden="true" />
            Material digital em PDF
          </span>
          <h1 className="mt-[1.5cqw] font-sans text-[10.26cqw] font-extrabold leading-[9.4cqw] tracking-[-0.045em] text-[#06102e] [-webkit-text-stroke:0.035em_currentColor] [text-shadow:0_0_14px_rgba(255,255,255,0.85)] md:mt-4 md:text-[2.9rem] md:leading-[1.08] lg:text-[3.4rem]">
            <span className="block">Resumos de</span>
            <span className="block">Enfermagem</span>
            <span className="block">para a <span className="text-[#0f7a3a]">HUBRASIL.</span></span>
          </h1>
          <p className="mt-[2.6cqw] max-w-[80cqw] text-[3.7cqw] font-medium leading-[4.6cqw] text-[#33445a] md:mt-5 md:max-w-[40ch] md:text-[18px] md:leading-relaxed">
            Organize sua revisão com resumos ilustrados de enfermagem, direto no celular.
          </p>
        </div>

        <div className="row-start-3 px-[4.4cqw] pb-[3cqw] md:col-start-1 md:row-start-3 md:mt-7 md:p-0">
          <div className="text-center md:text-left">
            <span className="block font-sans text-[11.2cqw] font-extrabold leading-none tracking-[-0.04em] text-[#0f7a3a] [-webkit-text-stroke:0.02em_currentColor] md:text-[2.75rem]">{formatCents(priceCents)}</span>
            <span className="mt-0 block text-[3.7cqw] font-medium text-[#2a3a4e] md:mt-1 md:text-sm">Pagamento único</span>
          </div>
          <Button
            size="lg"
            variant="outline"
            full
            className="mt-[2.6cqw] h-[12.6cqw] min-h-0 grid grid-cols-[auto_1fr_auto] items-center gap-[2cqw] rounded-full border-transparent bg-[#0f6b35] bg-gradient-to-b from-[#1c9150] to-[#0b5a2b] px-[5.5cqw] text-[3.9cqw] font-extrabold text-white hover:text-white focus-visible:text-white active:text-white [-webkit-text-stroke:0.02em_currentColor] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_6px_rgba(8,60,30,0.22),0_12px_22px_-8px_rgba(15,107,53,0.65)] transition-[transform,box-shadow] duration-200 hover:border-transparent hover:from-[#18874a] hover:to-[#094e25] focus-visible:from-[#18874a] focus-visible:to-[#094e25] active:from-[#157a43] active:to-[#08461f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f6b35] motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-px motion-reduce:transition-none md:mt-4 md:h-auto md:min-h-[56px] md:max-w-[400px] md:gap-2 md:px-4 md:text-[14px] lg:gap-3 lg:px-6 lg:text-base"
            onClick={scrollToOffer}
          >
            <ShoppingCart className="h-[7cqw] w-[7cqw] md:h-6 md:w-6" aria-hidden="true" />
            <span className="text-center">Quero minha apostila HUBRASIL</span>
            <ChevronRight className="h-[6cqw] w-[6cqw] md:h-5 md:w-5" aria-hidden="true" />
          </Button>
          <ul className="mt-[3.4cqw] flex justify-between px-[1.5cqw] md:max-w-[400px] md:justify-between md:px-0">
            {HERO_BENEFITS.map(({ icon: Icon, label, width }) => (
              <li key={label} className="flex items-center gap-[2.2cqw] md:gap-1.5 lg:gap-2">
                <span className="flex h-[8.7cqw] w-[10.5cqw] shrink-0 items-center justify-center rounded-[2.6cqw] bg-[#e1f2e8] md:h-9 md:w-10 md:rounded-xl lg:h-10 lg:w-11">
                  <Icon className="h-[5.4cqw] w-[5.4cqw] text-[#0b3a2a] md:h-5 md:w-5" aria-hidden="true" />
                </span>
                <span className={cn(width, "text-[3.2cqw] font-semibold leading-[3.9cqw] text-[#172a3b] md:max-w-[11ch] md:text-[11px] md:leading-tight lg:text-[12px]")}>{label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-[2.4cqw] text-center text-[max(10px,2.9cqw)] leading-snug text-[#43566a] md:mt-3 md:text-left md:text-[11px]">Material independente da FSLobo Enfermagem.</p>
        </div>
      </div>
    </section>
  );
}


const TOPIC_CARDS: { lines: string[]; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; tone: "green" | "blue" }[] = [
  { lines: ["História da saúde pública", "no Brasil"], icon: BrazilCrossIcon, tone: "green" },
  { lines: ["Saúde do homem"], icon: MaleIcon, tone: "blue" },
  { lines: ["Segurança do paciente", "e eventos adversos"], icon: ShieldAlertIcon, tone: "green" },
  { lines: ["Calendário de vacinação", "do adolescente"], icon: CalendarSyringeIcon, tone: "blue" },
  { lines: ["Atenção Integrada às Doenças", "Prevalentes na Infância (AIDPI)"], icon: KidsIcon, tone: "green" },
  { lines: ["Saúde do idoso"], icon: ElderlyIcon, tone: "green" },
];

/**
 * Cartão informativo com relevo e luz suaves. Mouse: inclinação (até 3°), elevação (4px) e
 * reflexo que seguem o cursor; toque: só um relevo curto enquanto pressionado. O estado vai
 * direto para variáveis CSS (sem setState a cada movimento), com um quadro por rAF.
 */
function TopicCard({ lines, icon: Icon, tone }: (typeof TOPIC_CARDS)[number]) {
  const ref = React.useRef<HTMLLIElement>(null);
  const frame = React.useRef(0);

  const set = (vars: Record<string, string>, lit: boolean) => {
    const el = ref.current;
    if (!el) return;
    for (const k in vars) el.style.setProperty(k, vars[k]);
    el.dataset.lit = lit ? "true" : "false";
  };
  const reset = () => {
    cancelAnimationFrame(frame.current);
    set({ "--rx": "0deg", "--ry": "0deg", "--ty": "0px", "--glow": "0" }, false);
  };
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const aim = (e: React.PointerEvent<HTMLLIElement>, press: boolean) => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) return set({}, true);
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      set(
        press
          ? { "--rx": "0deg", "--ry": "0deg", "--ty": "-2px", "--mx": px * 100 + "%", "--my": py * 100 + "%", "--glow": "1" }
          : { "--rx": (0.5 - py) * 6 + "deg", "--ry": (px - 0.5) * 6 + "deg", "--ty": "-4px", "--mx": px * 100 + "%", "--my": py * 100 + "%", "--glow": "1" },
        true,
      );
    });
  };

  // Toque/caneta: relevo só enquanto pressionado. O navegador cancela o ponteiro ao começar a rolar.
  React.useEffect(() => {
    const stop = () => reset();
    window.addEventListener("scroll", stop, { passive: true });
    return () => {
      window.removeEventListener("scroll", stop);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <li
      ref={ref}
      data-lit="false"
      onPointerEnter={(e) => e.pointerType === "mouse" && aim(e, false)}
      onPointerMove={(e) => e.pointerType === "mouse" && aim(e, false)}
      onPointerLeave={reset}
      onPointerDown={(e) => e.pointerType !== "mouse" && aim(e, true)}
      onPointerUp={reset}
      onPointerCancel={reset}
      style={{ transform: "perspective(800px) translateY(var(--ty,0px)) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))", transformStyle: "preserve-3d" }}
      className="relative flex min-h-[17.5cqw] items-center rounded-[4cqw] border border-[#d4f0ea] bg-white py-[1.5cqw] pl-[3.9cqw] pr-[3cqw] shadow-[0_0.6cqw_3.4cqw_-0.4cqw_rgba(40,110,120,0.2)] transition-[transform,box-shadow,border-color] duration-[240ms] ease-out data-[lit=true]:border-[#b6e6dc] data-[lit=true]:shadow-[0_1.6cqw_5cqw_-0.8cqw_rgba(30,110,120,0.3)] motion-reduce:transition-colors motion-reduce:duration-200"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[var(--glow,0)] transition-opacity duration-[240ms] ease-out motion-reduce:hidden"
        style={{ background: "radial-gradient(circle at var(--mx,50%) var(--my,50%), rgba(255,255,255,0.85), rgba(150,225,215,0.22) 34%, transparent 62%)" }}
      />
      <span
        className={cn("relative flex h-[14.5cqw] w-[16.4cqw] shrink-0 items-center justify-center rounded-[46%] transition-shadow duration-[240ms] ease-out", tone === "green" ? "bg-[#e3f7ec]" : "bg-[#e5effc]")}
        style={{ transform: "translateZ(calc(var(--glow,0) * 14px))", transition: "transform 240ms ease-out, box-shadow 240ms ease-out", boxShadow: "0 calc(var(--glow,0) * 1.2cqw) calc(var(--glow,0) * 2.4cqw) -0.6cqw rgba(30,100,110,calc(var(--glow,0) * 0.25))" }}
      >
        <Icon className="h-[12cqw] w-[12cqw]" />
      </span>
      <span aria-hidden="true" className="relative ml-[3.1cqw] h-[10.6cqw] w-px shrink-0 bg-[#e0e7ee]" />
      <span className="relative ml-[3.6cqw] text-[3.9cqw] font-bold leading-[4.5cqw] tracking-[-0.01em] text-[#0a2a6b]">
        {lines.map((line, i) => (
          <React.Fragment key={line}>
            {i > 0 && <br />}
            {line}
          </React.Fragment>
        ))}
      </span>
    </li>
  );
}

function TopicsCross({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("pointer-events-none absolute", className)}>
      <path d="M9 1h6v8h8v6h-8v8H9v-8H1V9h8z" fill="currentColor" />
    </svg>
  );
}

/**
 * Seção de temas. As medidas usam `cqw` (1% da largura da coluna, de no máximo
 * 600 px) para reproduzir as proporções da referência de 941 px de largura
 * (1 cqw ≈ 9,41 px da referência) no celular e no computador.
 */
function TopicsSection() {
  return (
    <section aria-labelledby="hubrasil-topics-title" className="relative isolate overflow-hidden bg-white">
      <svg aria-hidden="true" viewBox="0 0 180 400" preserveAspectRatio="none" className="pointer-events-none absolute right-0 top-0 -z-10 h-[min(52vw,230px)] w-[min(24vw,110px)]">
        <defs>
          <linearGradient id="topics-wave-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#cfeaf6" />
            <stop offset="1" stopColor="#7fd6c9" />
          </linearGradient>
        </defs>
        <path d="M40 0h140v200C170 140 120 50 40 0z" fill="url(#topics-wave-a)" opacity="0.9" />
        <path d="M95 0h85v95C165 55 135 20 95 0z" fill="#fff" opacity="0.3" />
      </svg>
      <svg aria-hidden="true" viewBox="0 0 300 460" preserveAspectRatio="none" className="pointer-events-none absolute bottom-0 left-0 -z-10 h-[min(66vw,300px)] w-[min(76vw,340px)]">
        <defs>
          <linearGradient id="topics-wave-b" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#6fd0c0" />
            <stop offset="1" stopColor="#e3f5f3" />
          </linearGradient>
        </defs>
        <path d="M0 90C60 100 110 160 160 230C205 295 255 395 300 460H0Z" fill="url(#topics-wave-b)" opacity="0.6" />
        <path d="M0 220C45 240 85 290 130 345C165 388 215 430 260 460H0Z" fill="url(#topics-wave-b)" opacity="0.5" />
        <path d="M0 340C35 350 70 385 105 425C118 440 132 452 148 460H0Z" fill="#6fd0c0" opacity="0.25" />
      </svg>
      <TopicsCross className="right-[17%] top-[6%] h-[7vw] max-h-[44px] w-[7vw] max-w-[44px] text-[#d7e8f7]" />
      <TopicsCross className="right-[10%] top-[13%] h-[4vw] max-h-[26px] w-[4vw] max-w-[26px] text-[#d7e8f7]" />
      <TopicsCross className="bottom-[3%] left-[3%] h-[4vw] max-h-[26px] w-[4vw] max-w-[26px] text-[#d3f1ec]" />
      <TopicsCross className="bottom-[1.5%] left-[9%] h-[6.5vw] max-h-[40px] w-[6.5vw] max-w-[40px] text-[#d3f1ec]" />

      <div className="mx-auto w-full max-w-[600px] [container-type:inline-size]">
        <div className="px-[4.9cqw] pb-[9cqw] pt-[10.6cqw]">
          <span className="ml-[1.8cqw] inline-flex h-[8.3cqw] items-center gap-[2.6cqw] rounded-full border border-[#c9eee2] bg-[#e6f8f0] px-[4cqw] text-[3.3cqw] font-extrabold uppercase tracking-[0.03em] text-[#0f8a47]">
            <BookOpenText className="h-[5.2cqw] w-[5.2cqw]" strokeWidth={2.2} aria-hidden="true" />
            Conteúdo completo
          </span>
          <h2 id="hubrasil-topics-title" className="ml-[1.8cqw] mt-[3.6cqw] font-sans text-[9cqw] font-extrabold leading-[1.1] tracking-[-0.045em] text-[#0a2f75] [-webkit-text-stroke:0.03em_currentColor]">
            O que você vai{" "}
            <span className="relative inline-block text-[#119a4a]">
              revisar
              <svg aria-hidden="true" viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute -bottom-[1.6cqw] left-0 h-[1.8cqw] w-full">
                <path d="M2 6C25 2 70 1 98 4" stroke="#a6e4cf" strokeWidth="3" strokeLinecap="round" fill="none" vectorEffect="non-scaling-stroke" />
              </svg>
            </span>
          </h2>
          <p className="ml-[1.8cqw] mt-[4cqw] max-w-[88cqw] text-[3.8cqw] leading-[5.3cqw] text-[#5b6b82]">
            Estes são alguns dos temas presentes nas 108 páginas de conteúdo da apostila.
          </p>
          <ul className="mt-[4.6cqw] flex flex-col gap-[1.9cqw]">
            {TOPIC_CARDS.map((card) => (
              <TopicCard key={card.lines.join(" ")} {...card} />
            ))}
          </ul>
        </div>
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
            <PreviewCard key={page.src} page={page} gated className={cn(
              "flex aspect-[3/4] w-[85vw] shrink-0 snap-center items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 p-3 transition-transform duration-200 hover:-translate-y-1.5 hover:rotate-0 sm:w-[280px] lg:w-[300px]",
              SHADOW_SOFT,
              i % 2 === 0 ? "rotate-[0.6deg]" : "-rotate-[0.6deg]",
            )} />
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
    <section id={OFFER_SECTION_ID} className="relative scroll-mt-[76px] overflow-hidden px-3 py-10 sm:px-5 sm:py-24" style={OFFER_NAVY_BG}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" aria-hidden="true" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[720px]">
        <div className="relative isolate overflow-hidden rounded-[28px] bg-white px-4 pb-6 pt-5 shadow-[0_8px_16px_rgba(0,0,0,0.25),0_40px_90px_-30px_rgba(0,0,0,0.65)] sm:rounded-[32px] sm:px-8 sm:pb-8 sm:pt-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full bg-gradient-to-br from-[#d4f1ec] via-[#e9f8f5] to-transparent blur-2xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-20 -z-10 h-64 w-64 rounded-full bg-gradient-to-tr from-[#d9f4ee] to-transparent blur-2xl" />
          <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute right-[9%] top-[2.2%] -z-10 h-9 w-9 text-[#cdeee6] sm:h-12 sm:w-12">
            <path d="M9 1h6v8h8v6h-8v8H9v-8H1V9h8z" fill="currentColor" />
          </svg>

          <span className="relative inline-flex items-center gap-2 rounded-full bg-[#dff5ee] px-4 py-2 text-[12.5px] font-extrabold uppercase tracking-wide text-[#0b6b52]">
            <FileText className="h-4 w-4" aria-hidden="true" /> Sua apostila digital
          </span>
          <h2 className="relative mt-4 max-w-[560px] font-sans text-[1.85rem] font-extrabold leading-[1.1] tracking-tight text-[#0b1f3a] sm:text-[2.4rem]">
            Apostila de Resumos de Enfermagem <span className="text-[#12a05a]">HUBRASIL</span>
          </h2>
          <p className="relative mt-3 max-w-[520px] text-[15.5px] leading-relaxed text-[#4a5b70] sm:text-[17px]">
            Reúna sua revisão para a HUBRASIL em um PDF com 108 páginas de resumos ilustrados de enfermagem.
          </p>

          <div className="relative mt-5 grid grid-cols-[37%_1fr] items-center gap-3 overflow-hidden rounded-[24px] border border-[#cdece5] bg-gradient-to-br from-[#f3fbf9] via-white to-[#eaf8f5] p-3.5 shadow-[0_10px_28px_-18px_rgba(15,138,108,0.5)] sm:grid-cols-[210px_1fr] sm:gap-6 sm:p-6">
            <div className="relative flex justify-center [perspective:900px]">
              <span aria-hidden="true" className="absolute inset-x-[8%] bottom-[-4%] h-[10%] rounded-[50%] bg-[#0b3d3a]/25 blur-md" />
              <div className="relative w-[88%] [transform-style:preserve-3d] [transform:rotateY(-16deg)_rotateX(2deg)]">
                <img
                  src={MODULE_PAGES[0].src}
                  alt={MODULE_PAGES[0].alt}
                  width={900}
                  height={1272}
                  decoding="async"
                  className="h-auto w-full rounded-[3px_8px_8px_3px] shadow-[8px_10px_18px_-6px_rgba(8,50,50,0.55)]"
                />
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-[7%] rounded-l-[3px] bg-gradient-to-r from-black/35 via-white/15 to-transparent" />
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[3px_8px_8px_3px] bg-gradient-to-br from-white/20 via-transparent to-black/10" />
              </div>
            </div>
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#dff5ee] px-2.5 py-1.5 text-[11.5px] font-extrabold text-[#0b6b52] sm:text-[14px]">
                <Tag className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" /> Sua apostila digital por:
              </span>
              <p className="mt-1.5 flex items-start font-sans text-[2.6rem] font-extrabold leading-none tracking-tight text-[#0b1f3a] sm:text-[4rem]">
                <span className="mr-1 mt-[0.35em] text-[0.42em] text-[#0f8a6c]">R$</span>
                {priceDigits}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[12px] font-extrabold uppercase leading-tight tracking-wide text-[#0b1f3a] sm:text-[14px]">
                <FileText className="h-4 w-4 shrink-0 text-[#0f8a6c]" aria-hidden="true" /> Pagamento único · sem mensalidade
              </p>
              <p className="mt-2.5 flex items-start gap-1.5 border-t border-[#d5ebe6] pt-2.5 text-[13px] leading-snug text-[#4a5b70] sm:text-[15px]">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-[#0f8a6c]" aria-hidden="true" /> PDF digital · acesso após a confirmação do Pix
              </p>
            </div>
          </div>

          <div className="relative mt-5">{children}</div>

          <div className="relative mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-[#e3eeee] pt-4 text-[13px] font-semibold text-[#41546b]">
            <span className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-[#0f8a6c]" aria-hidden="true" /> Pagamento via Pix, 100% seguro
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-[#0f8a6c]" aria-hidden="true" /> Download liberado nesta página
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
