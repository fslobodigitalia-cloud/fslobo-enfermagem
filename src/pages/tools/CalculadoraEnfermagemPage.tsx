import * as React from "react";
import { ArrowRightLeft, Calculator, Clock, Droplets, FlaskConical, Gauge, Info, Syringe, type LucideIcon } from "lucide-react";
import { useDocumentMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ToolsPageHero } from "@/components/tools/ToolsPageHero";
import { ToolsCta } from "@/components/tools/ToolsCta";
import {
  ConcentracaoCalc,
  ConversoesCalc,
  DoseVolumeCalc,
  GotejamentoCalc,
  TempoInfusaoCalc,
  VolumePorHoraCalc,
} from "@/components/tools/calculators";

/**
 * Calculadora de Enfermagem — /ferramentas/calculadora-enfermagem.
 *
 * Redesign de UX: em vez das 6 ferramentas empilhadas, agora existe um
 * SELETOR ("Escolha o cálculo") e só a ferramenta escolhida é renderizada
 * por vez — a lógica de cada uma (src/components/tools/calculators.tsx,
 * NÃO alterada) continua exatamente a mesma, só a forma de exibir mudou.
 *
 * Ferramenta de APOIO matemático, nunca de decisão clínica — ver aviso de
 * segurança abaixo. Deliberadamente NÃO existe aqui: recomendação de
 * dose, dose pediátrica automática, dose por peso, dose máxima, indicação
 * de medicamento, compatibilidade entre medicamentos, velocidade clínica
 * recomendada, ou qualquer sugestão individualizada.
 */

type CalcKey = "volume-hora" | "tempo-infusao" | "gotejamento" | "dose-volume" | "concentracao" | "conversoes";

const CALC_ORDER: CalcKey[] = ["volume-hora", "tempo-infusao", "gotejamento", "dose-volume", "concentracao", "conversoes"];

const CALC_TOOLS: Record<CalcKey, { label: string; icon: LucideIcon; Component: () => React.JSX.Element }> = {
  "volume-hora": { label: "Volume/hora", icon: Gauge, Component: VolumePorHoraCalc },
  "tempo-infusao": { label: "Tempo de infusão", icon: Clock, Component: TempoInfusaoCalc },
  gotejamento: { label: "Gotejamento", icon: Droplets, Component: GotejamentoCalc },
  "dose-volume": { label: "Dose-volume", icon: Syringe, Component: DoseVolumeCalc },
  concentracao: { label: "Concentração", icon: FlaskConical, Component: ConcentracaoCalc },
  conversoes: { label: "Conversões", icon: ArrowRightLeft, Component: ConversoesCalc },
};

export default function CalculadoraEnfermagemPage() {
  useDocumentMeta({
    title: "Calculadora de Enfermagem | FSlobo Enfermagem",
    description:
      "Calculadora gratuita de enfermagem: volume por hora, tempo de infusão, gotejamento, dose-volume, concentração após diluição e conversões de unidade, com a fórmula sempre visível.",
    path: "/ferramentas/calculadora-enfermagem",
  });

  const [active, setActive] = React.useState<CalcKey>("volume-hora");
  const ActiveCalc = CALC_TOOLS[active].Component;

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />

      <main>
        <ToolsPageHero
          icon={Calculator}
          title="Calculadora de Enfermagem"
          subtitle="Faça cálculos técnicos de forma rápida e confira a fórmula utilizada em cada resultado."
          breadcrumbCurrent="Calculadora de Enfermagem"
        />

        {/* Aviso de segurança — obrigatório, tom profissional, nunca alarmista. */}
        <section className="py-7 sm:py-8">
          <div className="mx-auto w-full max-w-[760px] px-5 sm:px-6">
            <div className="flex items-start gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 sm:p-5">
              <Info className="mt-0.5 h-[18px] w-[18px] shrink-0 text-teal-600" strokeWidth={1.9} aria-hidden="true" />
              <p className="text-[13px] leading-relaxed text-slate-700">
                <span className="font-semibold text-slate-900">Ferramenta de apoio para conferência de cálculos.</span>{" "}
                Sempre confirme prescrição, apresentação do medicamento, fator do equipo e protocolo institucional
                antes da administração.
              </p>
            </div>
          </div>
        </section>

        {/* Seletor — "Escolha o cálculo": só a ferramenta ativa é exibida. */}
        <section className="pb-14 sm:pb-16">
          <div className="mx-auto w-full max-w-[760px] px-5 sm:px-6">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-slate-500">Escolha o cálculo</p>
            <div
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Escolha o cálculo"
            >
              {CALC_ORDER.map((key) => {
                const tool = CALC_TOOLS[key];
                const isActive = key === active;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActive(key)}
                    className={cn(
                      "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-[13.5px] font-semibold transition-all duration-200",
                      isActive
                        ? "border-[#0b1b2b] bg-[#0b1b2b] text-white shadow-[0_2px_6px_rgba(11,27,43,0.35)]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800",
                    )}
                  >
                    <tool.icon className="h-4 w-4" strokeWidth={1.9} aria-hidden="true" />
                    {tool.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-6" role="tabpanel">
              <ActiveCalc />
            </div>
          </div>
        </section>

        <ToolsCta
          title="Quer aprofundar seus estudos?"
          body="Conheça nossos materiais de cálculos, medicamentos e rotina de enfermagem."
        />
      </main>

      <SiteFooter />
    </div>
  );
}
