import { Link } from "react-router-dom";
import { HeartPulse } from "lucide-react";
import { legalLinks } from "@/config/site";
import { withCampaignQuery } from "@/lib/utmTracking";

/**
 * Rodapé institucional — usado nas páginas novas (Home, /materiais,
 * /produto/:slug). A página do Guia de Evolução de Enfermagem mantém seu
 * próprio rodapé interno e não foi tocada.
 *
 * Navy escuro de propósito: fecha a página com o mesmo peso visual do
 * capítulo escuro do meio da Home, em vez de se misturar com o FAQ claro
 * logo acima.
 */
export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-[#0a1622]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-5 py-14 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-[360px] flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-teal-400">
                <HeartPulse className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="text-[16px] font-extrabold leading-tight tracking-tight text-white">
                FSLobo <span className="text-teal-400">Enfermagem</span>
              </span>
            </div>
            <p className="text-[14px] leading-relaxed text-slate-400">
              Materiais digitais educacionais para apoiar estudantes, técnicos e enfermeiros no
              dia a dia do estudo e da prática profissional.
            </p>
          </div>

          <nav aria-label="Links do rodapé" className="flex flex-col gap-2.5 sm:items-end">
            <Link
              to={withCampaignQuery("/materiais")}
              className="text-[14px] font-medium text-slate-300 transition-colors hover:text-teal-300"
            >
              Materiais
            </Link>
            <Link
              to={withCampaignQuery("/guia-evolucao-enfermagem")}
              className="text-[14px] font-medium text-slate-300 transition-colors hover:text-teal-300"
            >
              Guia de Evolução de Enfermagem
            </Link>
          </nav>
        </div>

        <hr className="border-white/[0.08]" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-slate-500">
            © {new Date().getFullYear()} FSLobo Enfermagem. Todos os direitos reservados.
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link
                  to={withCampaignQuery(link.href)}
                  className="text-[12.5px] text-slate-400 underline-offset-4 transition-colors hover:text-teal-300 hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
