import { useDocumentMeta } from "@/lib/seo";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ToolsPageHero } from "@/components/tools/ToolsPageHero";
import { ToolsMenuList } from "@/components/tools/ToolsMenuList";

/**
 * Hub das ferramentas — /ferramentas. Hero compacto (ToolsPageHero, sem
 * ícone — não representa uma ferramenta específica) + o MESMO menu
 * premium usado na home (ToolsMenuList) + um bloco curto explicando o
 * propósito da área, sinalizando espaço para futuras ferramentas.
 */
export default function ToolsHubPage() {
  useDocumentMeta({
    title: "Ferramentas para Enfermagem | FSlobo Enfermagem",
    description:
      "Ferramentas gratuitas para o dia a dia da enfermagem: calculadora de cálculos técnicos, checklist de plantão interativo e dicas rápidas de rotina.",
    path: "/ferramentas",
  });

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />

      <main>
        <ToolsPageHero
          title="Ferramentas para Enfermagem"
          subtitle="Recursos práticos e gratuitos para consultar no celular durante os estudos e na organização da rotina de enfermagem."
        />

        <section className="py-10 sm:py-14">
          <div className="mx-auto w-full max-w-[900px] px-5 sm:px-6">
            <ToolsMenuList />
            <p className="mx-auto mt-6 max-w-[56ch] text-center text-[13px] leading-relaxed text-slate-500">
              Ferramentas gratuitas para apoiar seus estudos e organização profissional. Novos recursos serão
              adicionados aqui com o tempo.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
