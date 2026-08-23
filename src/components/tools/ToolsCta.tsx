import { Link } from "react-router-dom";
import { withCampaignQuery } from "@/lib/utmTracking";
import { Button } from "@/components/ui/button";

/**
 * Bloco comercial discreto ao final de cada página de ferramenta —
 * deliberadamente só texto + um botão, sem preço hardcoded (o preço real
 * vive só no catálogo/Supabase, nunca aqui). Leva para "/#catalogo": a
 * Home (MaterialsPage.tsx) já tem `id="catalogo"` na seção do grid — ver
 * CATALOG_SECTION_ID — e o ScrollToTop global (App.tsx) preserva
 * navegação por hash em vez de forçar o topo, então esse link funciona
 * mesmo vindo de outra rota.
 */
export function ToolsCta({ title, body }: { title: string; body: string }) {
  return (
    <section className="border-t border-slate-200 bg-slate-50 py-14 sm:py-16">
      <div className="mx-auto flex w-full max-w-[680px] flex-col items-center gap-4 px-5 text-center sm:px-6">
        <h2 className="text-[1.3rem] font-extrabold tracking-tight text-slate-900 sm:text-[1.4rem]">{title}</h2>
        <p className="text-[14.5px] leading-relaxed text-slate-600">{body}</p>
        <Button asChild size="lg" className="mt-1">
          <Link to={withCampaignQuery("/#catalogo")}>Ver materiais relacionados</Link>
        </Button>
      </div>
    </section>
  );
}
