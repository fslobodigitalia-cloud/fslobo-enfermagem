import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { withCampaignQuery } from "@/lib/utmTracking";
import { TOOLS_HUB_PATH } from "@/config/toolsCatalog";

/** Breadcrumb "Início > Ferramentas > Nome" — usado pelas 4 páginas de
 * ferramentas (hub + 3 ferramentas). Mesmo padrão visual do breadcrumb de
 * ProductPage.tsx (não compartilhado via import para não acoplar as duas
 * áreas — cada uma pode evoluir independente). */
export function ToolsBreadcrumb({ current }: { current?: string }) {
  return (
    <div className="border-b border-slate-100">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-1.5 px-5 py-3.5 text-[12.5px] text-slate-400 sm:px-6">
        <Link to={withCampaignQuery("/")} className="transition-colors hover:text-teal-700">
          Início
        </Link>
        <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        {current ? (
          <Link to={withCampaignQuery(TOOLS_HUB_PATH)} className="transition-colors hover:text-teal-700">
            Ferramentas
          </Link>
        ) : (
          <span className="font-semibold text-slate-600">Ferramentas</span>
        )}
        {current && (
          <>
            <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            <span className="font-semibold text-slate-600">{current}</span>
          </>
        )}
      </div>
    </div>
  );
}
