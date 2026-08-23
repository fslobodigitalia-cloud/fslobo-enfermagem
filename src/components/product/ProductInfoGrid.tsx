import { Clock4, FileText, Smartphone, Sparkles, Users } from "lucide-react";
import type { ProductPageContent } from "@/config/productPageContent";

/**
 * Grid visual + faixa editorial — PADRÃO de todas as páginas normais de
 * produto. Generalizado a partir do experimento MedicationProductInfoGrid
 * (exclusivo de "medicamentos-na-pratica"); agora usado por qualquer
 * produto, com o card "Conteúdo" e "Para quem é" alimentados por
 * content.contentSummary/content.audience (ver
 * src/config/productPageContent.ts — sempre resolvido, com fallback seguro
 * para produtos sem entrada curada).
 *
 * "Formato" e "Entrega" continuam genéricos (verdadeiros para qualquer
 * material digital do catálogo: PDF, liberação automática após Pix) — não
 * são dados por produto, então não há por que variar.
 */

const EDITORIAL_INDICATORS = [
  { icon: FileText, label: "PDF digital" },
  { icon: Smartphone, label: "Acesso pelo celular" },
  { icon: Clock4, label: "Liberação automática" },
];

export function ProductInfoGrid({ content }: { content: ProductPageContent }) {
  const infoCards = [
    { icon: Sparkles, title: "Conteúdo", body: content.contentSummary },
    { icon: Users, title: "Para quem é", body: content.audience },
    { icon: Smartphone, title: "Formato", body: "PDF digital para consulta no celular, tablet ou computador." },
    { icon: Clock4, title: "Entrega", body: "Acesso liberado automaticamente após a confirmação do pagamento." },
  ];

  return (
    <>
      {/* Grid 2x2 (desktop) / 1-2 colunas (mobile) — ícones pequenos (18–22px)
          dentro de um container de 36–42px, superfícies e sombras em
          camadas para dar profundidade sem virar cards gigantes. */}
      <section className="border-t border-slate-200 bg-slate-50 py-14 sm:py-16">
        <div className="mx-auto w-full max-w-[1000px] px-5 sm:px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            {infoCards.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_16px_32px_-20px_rgba(15,23,42,0.25)] sm:p-6"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-teal-50/70 blur-2xl"
                />
                <div className="relative flex items-start gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600">
                    <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-slate-500">{title}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-slate-700">{body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Faixa editorial navy — elemento de impacto entre os blocos. */}
      <section className="relative overflow-hidden bg-[#0b1b2b] py-12 sm:py-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-teal-500/10 blur-3xl"
        />
        <div className="relative mx-auto flex w-full max-w-[900px] flex-col items-center gap-6 px-5 text-center sm:px-6">
          <h2 className="max-w-[28ch] text-[1.4rem] font-extrabold leading-snug tracking-tight text-white sm:text-[1.65rem]">
            Consulta rápida para estudo e rotina
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {EDITORIAL_INDICATORS.map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-2 text-[13px] font-semibold text-teal-100/90">
                <Icon className="h-4 w-4 text-teal-300" strokeWidth={1.9} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
