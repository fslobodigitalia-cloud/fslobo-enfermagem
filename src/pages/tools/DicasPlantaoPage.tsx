import * as React from "react";
import { Lightbulb, Tag } from "lucide-react";
import { useDocumentMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ToolsPageHero } from "@/components/tools/ToolsPageHero";
import { ToolsCta } from "@/components/tools/ToolsCta";
import { DICAS, DICAS_CATEGORIAS, type DicaCategoria } from "@/config/dicasPlantao";

const ALL_CATEGORY = "Todas";

/** Variação visual muito sutil por categoria — só 3 tons (teal claro, teal
 * escuro, navy) alternados, nunca "arco-íris". Só um traço fino à esquerda
 * do card, nada mais muda entre categorias. */
const CATEGORY_ACCENT: Record<DicaCategoria, string> = {
  Organização: "border-l-teal-300",
  Comunicação: "border-l-slate-300",
  Registros: "border-l-teal-500",
  Medicações: "border-l-[#0b1b2b]",
  Segurança: "border-l-slate-500",
  "Passagem de plantão": "border-l-teal-400",
};

/** Dicas de Plantão — /ferramentas/dicas-de-plantao. Orientações gerais de
 * organização e rotina, nunca protocolo clínico ou conduta individualizada
 * (ver src/config/dicasPlantao.ts, não alterado). */
export default function DicasPlantaoPage() {
  useDocumentMeta({
    title: "Dicas de Plantão | FSlobo Enfermagem",
    description:
      "Dicas rápidas e gratuitas de organização, comunicação, registros, medicações e segurança para o plantão de enfermagem, filtráveis por categoria.",
    path: "/ferramentas/dicas-de-plantao",
  });

  const [activeCategory, setActiveCategory] = React.useState<DicaCategoria | typeof ALL_CATEGORY>(ALL_CATEGORY);

  const visibleDicas = React.useMemo(() => {
    if (activeCategory === ALL_CATEGORY) return DICAS;
    return DICAS.filter((dica) => dica.categoria === activeCategory);
  }, [activeCategory]);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />

      <main>
        <ToolsPageHero
          icon={Lightbulb}
          title="Dicas rápidas para o plantão"
          subtitle="Conteúdos rápidos para ajudar na organização e na rotina profissional."
          breadcrumbCurrent="Dicas de Plantão"
        />

        <section className="py-9 sm:py-11">
          <div className="mx-auto w-full max-w-[1000px] px-5 sm:px-6">
            <div
              className="-mx-1 flex gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Filtrar dicas por categoria"
            >
              {[ALL_CATEGORY, ...DICAS_CATEGORIAS].map((category) => {
                const active = category === activeCategory;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category as DicaCategoria | typeof ALL_CATEGORY)}
                    aria-pressed={active}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-all duration-200",
                      active
                        ? "border-[#0b1b2b] bg-[#0b1b2b] text-white shadow-[0_2px_6px_rgba(11,27,43,0.35)]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800",
                    )}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            {visibleDicas.length === 0 ? (
              <p className="mt-10 text-center text-[14px] text-slate-500">Nenhuma dica encontrada nesta categoria.</p>
            ) : (
              <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleDicas.map((dica) => (
                  <div
                    key={dica.id}
                    className={cn(
                      "flex flex-col gap-2.5 rounded-xl border border-l-[3px] border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-shadow sm:hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.3)]",
                      CATEGORY_ACCENT[dica.categoria],
                    )}
                  >
                    <span className="inline-flex w-fit items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-teal-700">
                      <Tag className="h-[11px] w-[11px]" strokeWidth={2.2} aria-hidden="true" />
                      {dica.categoria}
                    </span>
                    <p className="text-[13.5px] leading-relaxed text-slate-700">{dica.texto}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <ToolsCta title="Continue aprendendo" body="Continue aprendendo com nossos guias digitais." />
      </main>

      <SiteFooter />
    </div>
  );
}
