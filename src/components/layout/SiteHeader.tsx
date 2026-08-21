import * as React from "react";
import { Link } from "react-router-dom";
import { Menu, ShoppingCart, X } from "lucide-react";
import { withCampaignQuery } from "@/lib/utmTracking";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { cn } from "@/lib/utils";

/**
 * Botão do carrinho — ícone + badge numérico, compartilhado entre o bloco
 * desktop e o menu mobile (evita duplicar o mesmo botão duas vezes com
 * classes de tamanho ligeiramente diferentes). Abre o CartDrawer (ver
 * abaixo); nunca navega.
 */
function CartButton({ className }: { className?: string }) {
  const { itemCount, openCart } = useCart();
  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={itemCount > 0 ? `Carrinho, ${itemCount} ${itemCount === 1 ? "item" : "itens"}` : "Carrinho vazio"}
      className={cn(
        "relative grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-700 transition-colors hover:border-teal-300 hover:text-teal-700",
        className,
      )}
    >
      <ShoppingCart className="h-[19px] w-[19px]" strokeWidth={1.9} aria-hidden="true" />
      {itemCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-teal-600 px-1 text-[11px] font-bold text-white shadow-[0_1px_2px_rgba(15,23,42,0.25)]"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </button>
  );
}

/**
 * Cabeçalho institucional — usado nas páginas novas ("/", /materiais,
 * /produto/:slug). "/" e "/materiais" servem o mesmo componente
 * (MaterialsPage — a Home institucional separada foi removida), por isso
 * logo e "Materiais" apontam os dois para "/". A página do Guia de
 * Evolução de Enfermagem mantém seu próprio cabeçalho interno e não foi
 * tocada.
 *
 * Sombra sutil só aparece depois de rolar (scrolled) — o header "descola"
 * do conteúdo em vez de já nascer com sombra sobre um fundo branco liso.
 */
export function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md transition-shadow duration-300",
        scrolled
          ? "border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_8px_20px_-16px_rgba(15,23,42,0.15)]"
          : "border-transparent shadow-none",
      )}
    >
      <div className="mx-auto flex h-[76px] w-full max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-6">
        <Link
          to={withCampaignQuery("/")}
          aria-label="FSLobo Enfermagem — página inicial"
          className="text-[16px] font-extrabold tracking-tight text-slate-900"
          onClick={() => setOpen(false)}
        >
          FSLobo <span className="text-teal-700">Enfermagem</span>
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          <Link
            to={withCampaignQuery("/")}
            className="text-[14.5px] font-medium text-slate-600 transition-colors hover:text-teal-700"
          >
            Materiais
          </Link>
          <Button asChild size="sm">
            <Link to={withCampaignQuery("/materiais")}>Ver materiais</Link>
          </Button>
          <CartButton />
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <CartButton />
          <button
            type="button"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-slate-700"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden border-t border-slate-200 bg-white transition-[max-height] duration-300 lg:hidden",
          open ? "max-h-40" : "max-h-0 border-t-0",
        )}
      >
        <nav aria-label="Navegação principal (mobile)" className="flex flex-col gap-1 px-5 py-4">
          <Link
            to={withCampaignQuery("/")}
            onClick={() => setOpen(false)}
            className="rounded-xl px-3 py-3 text-[15px] font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-teal-700"
          >
            Materiais
          </Link>
          <Button asChild className="mt-2" onClick={() => setOpen(false)}>
            <Link to={withCampaignQuery("/materiais")}>Ver materiais</Link>
          </Button>
        </nav>
      </div>

      <CartDrawer />
    </header>
  );
}
