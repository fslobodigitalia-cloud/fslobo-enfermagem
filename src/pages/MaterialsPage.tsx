import * as React from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useDocumentMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { useProductCatalog } from "@/hooks/useProductCatalog";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ProductCard } from "@/components/catalog/ProductCard";
import { HomeFAQ } from "@/components/home/HomeFAQ";
import { ToolsSection } from "@/components/tools/ToolsSection";

/**
 * Catálogo — Fase 2: consome exclusivamente a RPC pública
 * `get_active_product_catalog()` via src/hooks/useProductCatalog.ts (ver
 * src/lib/catalogQueries.ts). Nenhum produto/preço estático — o antigo
 * src/config/catalog.ts foi removido, essa é agora a única fonte.
 *
 * Página principal do site: servida tanto em "/" quanto em "/materiais"
 * (mesmo componente, ver App.tsx). O canonical fica sempre fixo em "/" —
 * independentemente de qual rota renderizou a página — para o Google não
 * ver as duas URLs como conteúdo duplicado. Nenhum redirect de
 * /materiais para "/" foi criado nesta etapa.
 */

const CATALOG_SECTION_ID = "catalogo";
const ALL_CATEGORY = "Todos";
// Mobile: 2 colunas (correção visual mobile) — igual ao que já era usado a
// partir de sm/lg, só o valor base (<640px) mudou de 1 para 2 colunas. gap
// menor no mobile (12px) para caber confortavelmente 2 cards por linha;
// sm/lg preservam exatamente o gap de 28px que já existia.
const GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-7 lg:grid-cols-3";

/** Itens do marquee do hero mobile — sequência duplicada no JSX (ver
 * HeroMarquee) para o loop ficar contínuo, sem tranco ao reiniciar. */
const MARQUEE_ITEMS = [
  "Acesso digital",
  "Consulta no celular",
  "Pagamento via Pix",
  "Liberação automática",
  "Material em PDF",
  "Acesso imediato",
];

/**
 * Marquee horizontal infinito — substitui, só no mobile (`sm:hidden`), a
 * linha estática "Acesso digital • Consulta no celular • ...". A lista é
 * renderizada duas vezes seguidas dentro de uma faixa com `width: max-content`
 * e a animação `animate-marquee` (keyframe em tailwind.config.js) desloca
 * -50% — exatamente a largura de UMA cópia da lista, então o instante em
 * que o loop "reinicia" (100% → 0%) é visualmente idêntico ao quadro
 * anterior, sem nenhum salto perceptível. `motion-reduce:animate-none`
 * (variante nativa do Tailwind, sem CSS extra) desliga a animação para
 * quem tem prefers-reduced-motion. Mask-image nas laterais dá o
 * acabamento "premium" (texto surge/some suavemente, não corta em seco) —
 * degrada bem em navegadores sem suporte (some o fade, mas nada quebra).
 */
function HeroMarquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  const maskImage =
    "linear-gradient(to right, transparent, black 28px, black calc(100% - 28px), transparent)";

  return (
    <div
      className="relative mt-1 overflow-hidden py-2 sm:hidden"
      style={{ WebkitMaskImage: maskImage, maskImage }}
      aria-hidden="true"
    >
      <div className="flex w-max animate-marquee items-center motion-reduce:animate-none">
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className="flex shrink-0 items-center gap-3 px-4">
            <span className="whitespace-nowrap text-[12px] font-semibold tracking-[0.03em] text-slate-200/85">
              {item}
            </span>
            <span aria-hidden="true" className="h-[3px] w-[3px] shrink-0 rounded-full bg-teal-300/50" />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Grão extremamente sutil, gerado só em CSS (sem imagem externa). */
const GRAIN: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
  backgroundSize: "140px 140px",
  opacity: 0.035,
};

function scrollToCatalog() {
  document.getElementById(CATALOG_SECTION_ID)?.scrollIntoView({ behavior: "smooth" });
}

/** Skeleton do grid — mesma estrutura do ProductCard, só sem dados ainda. */
function CatalogSkeleton() {
  return (
    <div className={cn(GRID_CLASS, "mt-10 sm:mt-14")} aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="animate-pulse overflow-hidden rounded-2xl border border-slate-900/[0.05] bg-white">
          <div className="aspect-[4/3] bg-slate-100" />
          <div className="flex flex-col gap-3 p-5">
            <div className="h-3 w-24 rounded-full bg-slate-100" />
            <div className="h-4 w-3/4 rounded-full bg-slate-100" />
            <div className="h-3 w-full rounded-full bg-slate-100" />
            <div className="h-3 w-2/3 rounded-full bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CatalogError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center sm:mt-14">
      <p className="text-[15px] font-semibold text-slate-800">Não foi possível carregar os materiais agora.</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-[13.5px] font-semibold text-slate-700 transition-colors hover:border-teal-300 hover:text-teal-700"
      >
        <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        Tentar novamente
      </button>
    </div>
  );
}

function CatalogEmpty() {
  return (
    <div className="mt-10 rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center sm:mt-14">
      <p className="text-[15px] text-slate-600">Nenhum material disponível no momento.</p>
    </div>
  );
}

export default function MaterialsPage() {
  const { status, products, retry } = useProductCatalog();
  const [activeCategory, setActiveCategory] = React.useState(ALL_CATEGORY);

  useDocumentMeta({
    title: "Materiais de Enfermagem | FSLobo Enfermagem",
    description: "Guias e materiais digitais de enfermagem para estudo, revisão e consulta na prática.",
    path: "/",
  });

  // Categorias únicas presentes nos produtos recebidos — nunca hardcoded.
  const categories = React.useMemo(() => {
    if (!products) return [];
    const seen = new Set<string>();
    for (const product of products) {
      if (product.category) seen.add(product.category);
    }
    return Array.from(seen);
  }, [products]);

  const visibleProducts = React.useMemo(() => {
    if (!products) return [];
    if (activeCategory === ALL_CATEGORY) return products;
    return products.filter((product) => product.category === activeCategory);
  }, [products, activeCategory]);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />

      <main>
        {/* ─────────────────────────── Hero fotográfico ─────────────────────────── */}
        <section className="relative h-[480px] overflow-hidden sm:h-[500px] lg:h-[540px]">
          {/* Base — fica visível se /images/hero-materiais-enfermagem.webp
              ainda não existir ou falhar ao carregar (a camada de imagem
              abaixo simplesmente não pinta nada por cima). */}
          <div
            className="absolute inset-0"
            style={{ backgroundImage: "linear-gradient(115deg, #060d18 0%, #0b1b2b 55%, #16283b 100%)" }}
          />
          {/* Fotografia real — ambiente clínico, sem pessoa posando (ver
              diretriz de conteúdo no histórico desta tarefa). */}
          <div
            className="absolute inset-0 bg-cover bg-[position:70%_center] sm:bg-[position:65%_center] lg:bg-[position:60%_center]"
            style={{ backgroundImage: "url('/images/hero-materiais-enfermagem.webp')" }}
          />
          {/* Overlay direcional: navy forte à esquerda (legibilidade do
              texto), deixando a fotografia respirar à direita. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(6,13,24,0.95) 0%, rgba(6,13,24,0.82) 35%, rgba(6,13,24,0.38) 66%, rgba(6,13,24,0.08) 100%)",
            }}
          />
          {/* Overlay vertical leve — reforça legibilidade sem escurecer tudo. */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 32%, transparent 68%, rgba(0,0,0,0.28) 100%)",
            }}
          />
          {/* Glow teal — extremamente discreto. */}
          <div
            className="pointer-events-none absolute -left-16 top-1/3 h-72 w-72 rounded-full blur-3xl"
            style={{ backgroundColor: "rgba(45,212,191,0.10)" }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute inset-0 mix-blend-overlay" style={GRAIN} />

          {/*
            Cadeia de segurança de largura no mobile, ponta a ponta:
              ROW    (flex row):    w-full max-w-[1200px] min-w-0 px-5
              COLUMN (flex column): w-full max-w-[680px]  min-w-0
              H1/P:                 w-full max-w-full     min-w-0 break-words
            `w-full` em CADA nível é o que importa de verdade: fixa a
            largura em um valor DEFINIDO (100% do pai) em vez de deixar o
            item calcular sua própria largura "sob demanda" a partir do
            conteúdo — é essa segunda forma (largura implícita/intrínseca)
            que, dentro de flexbox, pode ficar maior que o espaço real
            disponível quando o conteúdo é longo (o H1 é um item de um
            flex-column; sem `w-full`, ele tende a ocupar a largura que o
            texto "pede", não a que o container realmente tem). `min-w-0`
            complementa isso removendo o piso mínimo automático que o
            Flexbox aplicaria por padrão a um item com overflow visível.
            `max-w-full`/`max-w-[680px]` seguem só como teto, nunca
            largura-fonte. Com isso a largura do H1 e do parágrafo é
            SEMPRE literalmente igual à do container (nunca maior), então
            a quebra de linha do texto acontece dentro do espaço real —
            não há mais nenhum caminho para o texto "vazar" e ser cortado
            pelo overflow-hidden da <section>.
          */}
          <div className="relative mx-auto flex h-full w-full min-w-0 max-w-[1200px] items-center px-5 sm:px-6">
            <div className="flex w-full min-w-0 max-w-[680px] flex-col gap-5">
              <span className="block w-full max-w-full text-[11.5px] font-bold uppercase tracking-[0.16em] text-teal-300">
                Materiais digitais de enfermagem
              </span>
              {/* clamp() com teto mais conservador (2.2rem) do que a
                  primeira tentativa — folga maior de propósito para nunca
                  chegar perto do limite do container mesmo em fontes/
                  navegadores com métricas de glifo levemente diferentes.
                  overflow-wrap:anywhere é o último recurso (só entra em
                  ação se break-words/word-break normal não bastar para
                  uma palavra específica) — nem break-words nem
                  overflow-wrap:anywhere disparam aqui em uso normal, já
                  que a largura do H1 agora é sempre real (ver nota acima),
                  mas ficam como rede de segurança. */}
              <h1 className="w-full max-w-full min-w-0 break-words text-[clamp(1.9rem,8.5vw,2.2rem)] font-extrabold leading-[1.12] tracking-tight text-white [overflow-wrap:anywhere] sm:text-[3.4rem] sm:leading-[1.08] sm:[overflow-wrap:normal] lg:text-[3.85rem]">
                Materiais de enfermagem para estudar com{" "}
                <span className="text-teal-200">clareza</span> e consultar na prática.
              </h1>
              <p className="w-full max-w-full min-w-0 text-[15px] leading-relaxed text-slate-200/90 sm:max-w-[590px] sm:text-[17px]">
                Guias visuais e conteúdos objetivos para estudantes, técnicos e enfermeiros —
                organizados para facilitar o estudo e a rotina profissional.
              </p>

              <div className="mt-1">
                <button
                  type="button"
                  onClick={scrollToCatalog}
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-teal-500 px-6 text-[15px] font-semibold text-slate-950 shadow-[0_1px_2px_rgba(0,0,0,0.15),0_10px_24px_-8px_rgba(45,212,191,0.55)] transition-all duration-200 hover:-translate-y-px hover:bg-teal-400 hover:shadow-[0_2px_4px_rgba(0,0,0,0.18),0_16px_32px_-10px_rgba(45,212,191,0.65)] active:translate-y-0"
                >
                  Explorar materiais
                  <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                </button>
              </div>

              {/* Mobile: marquee infinito (ver HeroMarquee acima). Desktop
                  (sm+): linha estática original, sem nenhuma mudança. */}
              <HeroMarquee />
              <div className="mt-1 hidden flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-slate-300/80 sm:flex">
                <span>Acesso digital</span>
                <span aria-hidden="true">•</span>
                <span>Consulta no celular</span>
                <span aria-hidden="true">•</span>
                <span>Liberação após o pagamento</span>
              </div>
            </div>
          </div>
        </section>

        {/* Ferramentas gratuitas — logo após a Hero, antes do catálogo. */}
        <ToolsSection />

        {/* ──────────────────────── Catálogo (fundo slate claro) ─────────────────────── */}
        {/* pt define a separação clara com o Hero — nenhum elemento deste
            bloco sobrepõe a seção escura acima. */}
        <section id={CATALOG_SECTION_ID} className="bg-[#f5f7f9] pb-16 pt-10 sm:pb-24 sm:pt-12 lg:pt-14">
          <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-6">
            {/* Toolbar — 100% dentro da seção clara, superfície discreta.
                p-5 (20px) no mobile garante que o primeiro/último chip de
                categoria nunca fica colado na borda do cartão; sm:p-6
                preserva exatamente o desktop. */}
            <div className="rounded-[20px] border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_6px_16px_-10px_rgba(15,23,42,0.08)] sm:p-6">
              <span className="text-[13px] font-bold text-slate-900 sm:mb-4 sm:block">Explore por categoria</span>

              <div className="-mx-1 mt-3.5 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] sm:mt-0 sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
                {[ALL_CATEGORY, ...categories].map((category) => {
                  const active = category === activeCategory;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveCategory(category)}
                      aria-pressed={active}
                      className={cn(
                        "shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-semibold transition-all duration-200",
                        active
                          ? "bg-[#0b1b2b] text-white shadow-[0_2px_6px_rgba(11,27,43,0.35)]"
                          : "bg-transparent text-slate-600 hover:bg-teal-50 hover:text-teal-800",
                      )}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>

            {status === "loading" && <CatalogSkeleton />}
            {status === "error" && <CatalogError onRetry={retry} />}
            {status === "success" && visibleProducts.length === 0 && <CatalogEmpty />}
            {status === "success" && visibleProducts.length > 0 && (
              <div className={cn(GRID_CLASS, "mt-10 sm:mt-14")}>
                {visibleProducts.map((product) => (
                  <ProductCard key={product.slug} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>

        <HomeFAQ />
      </main>

      <SiteFooter />
    </div>
  );
}
