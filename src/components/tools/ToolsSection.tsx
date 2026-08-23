import { ToolsMenuList } from "@/components/tools/ToolsMenuList";

/**
 * "Ferramentas rápidas" — entra logo após a Hero e antes de "Explore por
 * categoria" em MaterialsPage.tsx. Redesenhada para parecer um MENU
 * compacto (uma única superfície com as 3 ferramentas, ver
 * ToolsMenuList), não uma segunda seção de conteúdo — a pessoa precisa
 * continuar chegando rápido ao catálogo logo abaixo.
 */
export function ToolsSection() {
  return (
    <section className="border-t border-slate-200 bg-white py-7 sm:py-10">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-6">
        <div className="mb-4 flex items-baseline justify-between gap-3 sm:mb-5">
          <h2 className="text-[1.15rem] font-extrabold tracking-tight text-slate-900 sm:text-[1.3rem]">
            Ferramentas rápidas
          </h2>
          <p className="hidden text-[13px] text-slate-500 sm:block">Recursos gratuitos para estudo e rotina.</p>
        </div>
        <p className="mb-3 text-[13px] text-slate-500 sm:hidden">Recursos gratuitos para estudo e rotina.</p>

        <ToolsMenuList />
      </div>
    </section>
  );
}
