import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { withCampaignQuery } from "@/lib/utmTracking";
import { TOOLS } from "@/config/toolsCatalog";

/**
 * Menu compacto das 3 ferramentas — UMA superfície única (não 3 cards
 * separados), reaproveitada por ToolsSection (home) e ToolsHubPage
 * (/ferramentas). Mobile: linhas empilhadas com divisores sutis, mesma
 * altura, ícone pequeno + texto + seta. Desktop/tablet (sm+): as mesmas
 * linhas viram 3 colunas uniformes lado a lado (`sm:grid sm:grid-cols-3`),
 * com um divisor vertical entre elas em vez de horizontal — nenhuma
 * marcação nova, é o MESMO elemento só trocando de eixo via CSS.
 */
export function ToolsMenuList() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_32px_-22px_rgba(15,23,42,0.2)] sm:grid sm:grid-cols-3 sm:divide-x sm:divide-slate-100">
      {TOOLS.map((tool, index) => (
        <Link
          key={tool.slug}
          to={withCampaignQuery(tool.path)}
          className={cn(
            "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-teal-50/50 sm:flex-col sm:items-start sm:gap-3 sm:px-5 sm:py-6",
            index > 0 && "border-t border-slate-100 sm:border-t-0",
          )}
        >
          <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600 transition-colors group-hover:bg-teal-100">
            <tool.icon className="h-[19px] w-[19px]" strokeWidth={1.8} aria-hidden="true" />
          </span>

          <span className="min-w-0 flex-1 sm:w-full sm:flex-none">
            <span className="flex items-center gap-1.5">
              <span className="text-[14.5px] font-bold leading-tight text-slate-900">{tool.menuLabel}</span>
              <span className="text-[9px] font-bold uppercase tracking-wide text-teal-600/70">Grátis</span>
            </span>
            <span className="mt-0.5 block truncate text-[12.5px] leading-snug text-slate-500 sm:truncate-none sm:whitespace-normal">
              {tool.menuHint}
            </span>
          </span>

          <ChevronRight
            className="h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-teal-600 sm:hidden"
            strokeWidth={2}
            aria-hidden="true"
          />
        </Link>
      ))}
    </div>
  );
}
