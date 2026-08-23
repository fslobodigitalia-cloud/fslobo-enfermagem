import * as React from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Bandage,
  BookOpen,
  ChevronRight,
  ClipboardList,
  FileText,
  FlaskConical,
  GraduationCap,
  type LucideIcon,
  Pill,
  Stethoscope,
  Syringe,
} from "lucide-react";
import { withCampaignQuery } from "@/lib/utmTracking";
import type { PublicCatalogProduct } from "@/lib/catalogQueries";
import type { ProductPageContent } from "@/config/productPageContent";

/**
 * Hero PADRÃO de todas as páginas normais de produto (/produto/:slug) —
 * substitui o antigo experimento MedicationProductHero (vídeo) por uma
 * identidade visual única, sem vídeo/foto, que funciona para qualquer
 * produto do catálogo (atual ou futuro), alimentada só por dados reais da
 * RPC + o enriquecimento opcional de src/config/productPageContent.ts.
 *
 * NÃO usada por /guia-evolucao-enfermagem (landing própria, rota separada
 * em App.tsx — este componente nem é importado lá).
 *
 * Profundidade visual só com CSS: gradientes, radial glow teal, grade de
 * linhas abstrata muito discreta, arcos decorativos e grão — nenhuma
 * imagem/vídeo externo, nenhum mockup de capa repetido da home.
 */

/** Grão extremamente sutil, gerado só em CSS — mesmo padrão já usado no hero de MaterialsPage. */
const GRAIN: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
  backgroundSize: "140px 140px",
  opacity: 0.04,
};

/** Grade de linhas abstrata, extremamente discreta — textura editorial, não decoração literal de "grid de dados". */
const GRID_LINES: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
  backgroundSize: "44px 44px",
  opacity: 0.045,
};

/**
 * Ícone do painel visual por categoria — heurística por palavra-chave,
 * sempre com fallback seguro (BookOpen) para qualquer categoria nova que
 * o CRM venha a cadastrar. Nunca lança, nunca exige atualização de código
 * para um produto novo aparecer.
 */
function categoryIcon(category: string | null): LucideIcon {
  const c = (category ?? "").toLowerCase();
  if (c.includes("farmacol")) return Pill;
  if (c.includes("exame") || c.includes("diagn")) return FlaskConical;
  if (c.includes("ferida")) return Bandage;
  if (c.includes("concurso") || c.includes("carreira")) return GraduationCap;
  if (c.includes("uti") || c.includes("emergência") || c.includes("emergencia")) return Activity;
  if (c.includes("cardio")) return Stethoscope;
  if (c.includes("imuniz") || c.includes("vacina")) return Syringe;
  if (c.includes("clínica") || c.includes("clinica")) return ClipboardList;
  return BookOpen;
}

/** "VIAS DE ADMINISTRAÇÃO" → "Vias de administração", para leitura confortável no painel (o marquee mantém uppercase). */
function toSentenceCase(word: string): string {
  const lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Painel visual abstrato — substitui o mockup/capa repetido da home.
 * Duas composições: chips compactos em linha (mobile/tablet) e card
 * vertical editorial completo (lg+, coluna da direita da hero).
 */
function ProductVisualPanel({ heading, keywords, Icon }: { heading: string; keywords: string[]; Icon: LucideIcon }) {
  const items = keywords.slice(0, 5);

  return (
    <>
      {/* Compacto — visível até "lg", fica abaixo do texto principal. */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-teal-400/10 text-teal-300 ring-1 ring-teal-300/25">
            <Icon className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.13em] text-teal-200">{heading}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {items.slice(0, 4).map((keyword) => (
            <span
              key={keyword}
              className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-slate-200/85"
            >
              {toSentenceCase(keyword)}
            </span>
          ))}
        </div>
      </div>

      {/* Card vertical editorial completo — só lg+, coluna da direita. */}
      <div className="relative hidden overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] p-7 backdrop-blur-sm lg:block">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full border border-teal-300/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full border border-teal-300/[0.06]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-teal-400/10 blur-2xl"
        />

        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-400/10 text-teal-300 ring-1 ring-teal-300/25">
            <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-teal-200">{heading}</span>
        </div>

        <ul role="list" className="relative mt-6 flex flex-col gap-2.5">
          {items.map((keyword) => (
            <li
              key={keyword}
              className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-2.5"
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300" />
              <span className="text-[13.5px] font-semibold text-slate-100/90">{toSentenceCase(keyword)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * Faixa-marquee editorial no rodapé da hero. Reutiliza a keyframe
 * `animate-marquee` já existente em tailwind.config.js — nenhuma animação
 * nova foi criada. `motion-reduce:animate-none` desliga o movimento sob
 * prefers-reduced-motion. `aria-hidden` porque as mesmas palavras já
 * aparecem no painel visual (texto real, acessível) — evita leitura
 * duplicada por leitor de tela.
 */
function HeroTicker({ keywords }: { keywords: string[] }) {
  const items = [...keywords, ...keywords];
  const maskImage = "linear-gradient(to right, transparent, black 44px, black calc(100% - 44px), transparent)";

  return (
    <div
      className="relative overflow-hidden border-t border-white/15 bg-[#060d18]/90 py-4 backdrop-blur-sm sm:py-3.5"
      style={{ WebkitMaskImage: maskImage, maskImage }}
      aria-hidden="true"
    >
      <div className="flex w-max animate-marquee items-center motion-reduce:animate-none">
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className="flex shrink-0 items-center gap-4 px-6 sm:gap-3.5 sm:px-5">
            <span className="whitespace-nowrap text-[clamp(15px,4.2vw,18px)] font-bold uppercase tracking-[0.04em] text-white/90 sm:text-[12.5px] sm:tracking-[0.16em] sm:text-teal-100/85">
              {item}
            </span>
            <span
              aria-hidden="true"
              className="h-[5px] w-[5px] shrink-0 rounded-full bg-teal-300/60 sm:h-1 sm:w-1 sm:bg-teal-300/45"
            />
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProductEditorialHero({
  product,
  content,
}: {
  product: PublicCatalogProduct;
  content: ProductPageContent;
}) {
  const supportText =
    product.shortDescription ?? product.description ?? "Material digital para estudo e prática de enfermagem.";
  const Icon = categoryIcon(product.category);

  return (
    <section className="relative isolate overflow-hidden bg-[#060d18]">
      {/* Camadas de fundo — só CSS, sem imagem/vídeo. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(120% 120% at 12% -10%, rgba(20,42,66,0.9) 0%, #060d18 55%), linear-gradient(160deg, #060d18 0%, #0b1b2b 60%, #0d2131 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0" style={GRID_LINES} aria-hidden="true" />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(45,212,191,0.16)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(45,212,191,0.08)" }}
        aria-hidden="true"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 top-1/3 hidden h-72 w-72 rounded-full border border-teal-300/10 lg:block"
      />
      <div className="pointer-events-none absolute inset-0 mix-blend-overlay" style={GRAIN} aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-[1200px] px-5 pb-6 pt-7 sm:px-6 sm:pb-9 sm:pt-10 lg:pb-12 lg:pt-14">
        {/* Breadcrumb discreto, integrado à hero (nunca mais uma faixa branca acima dela). */}
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-[11.5px] text-teal-100/45 sm:mb-5">
          <Link to={withCampaignQuery("/")} className="transition-colors hover:text-teal-200/80">
            Início
          </Link>
          {product.category && (
            <>
              <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              <span className="truncate">{product.category}</span>
            </>
          )}
        </nav>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14">
          {/* Conteúdo principal */}
          <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
            <span className="w-fit max-w-full rounded-full border border-teal-300/30 bg-teal-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-teal-200">
              {content.eyebrow}
            </span>
            <h1 className="w-full max-w-full min-w-0 break-words text-[clamp(1.85rem,7.5vw,2.5rem)] font-extrabold leading-[1.12] tracking-tight text-white [overflow-wrap:anywhere] sm:text-[2.9rem] sm:leading-[1.08] sm:[overflow-wrap:normal] lg:text-[3.3rem]">
              {product.name}
            </h1>
            <p className="w-full max-w-[54ch] min-w-0 text-[14.5px] leading-relaxed text-slate-200/90 sm:text-[16.5px]">
              {supportText}
            </p>
            <span className="mt-1 inline-flex w-fit items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-teal-200/75">
              <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Material digital • PDF
            </span>
          </div>

          {/* Painel visual abstrato — nunca repete a capa/mockup da home. */}
          <ProductVisualPanel heading={content.panelHeading} keywords={content.keywords} Icon={Icon} />
        </div>
      </div>

      <HeroTicker keywords={content.keywords} />
    </section>
  );
}
