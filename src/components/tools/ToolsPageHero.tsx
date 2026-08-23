import type { LucideIcon } from "lucide-react";
import { ToolsBreadcrumb } from "@/components/tools/ToolsBreadcrumb";

/**
 * Hero interno compartilhado pelas 4 páginas de ferramentas — identidade
 * visual comum (fundo claro em gradiente sutil, glow teal discreto, ícone
 * pequeno em container refinado) em vez de cada página ter seu próprio
 * cabeçalho isolado. Reaproveita ToolsBreadcrumb (não alterado).
 */
export function ToolsPageHero({
  icon: Icon,
  title,
  subtitle,
  breadcrumbCurrent,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle: string;
  breadcrumbCurrent?: string;
}) {
  return (
    <>
      <ToolsBreadcrumb current={breadcrumbCurrent} />
      <section
        className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white py-10 sm:py-14"
        style={{ backgroundImage: "radial-gradient(rgba(15,23,42,0.025) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      >
        {/* Glow teal — extremamente discreto, mesma disciplina do hero da home. */}
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-teal-200/25 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-teal-100/20 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto flex w-full max-w-[820px] flex-col items-center px-5 text-center sm:px-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700">Ferramenta gratuita</span>
          {Icon && (
            <span className="mt-4 grid h-[42px] w-[42px] place-items-center rounded-2xl border border-teal-100 bg-white text-teal-600 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_20px_-12px_rgba(13,148,136,0.35)]">
              <Icon className="h-[20px] w-[20px]" strokeWidth={1.8} aria-hidden="true" />
            </span>
          )}
          <h1 className={Icon ? "mt-4 text-[1.7rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.1rem]" : "mt-2 text-[1.7rem] font-extrabold tracking-tight text-slate-900 sm:text-[2.1rem]"}>
            {title}
          </h1>
          <p className="mx-auto mt-2.5 max-w-[56ch] text-[14.5px] leading-relaxed text-slate-600 sm:text-[15.5px]">{subtitle}</p>
        </div>
      </section>
    </>
  );
}
