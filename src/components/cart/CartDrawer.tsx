import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { ShoppingBag, X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { formatPriceCents } from "@/lib/catalogQueries";
import { withCampaignQuery } from "@/lib/utmTracking";
import { ProductCover, toneForCategory } from "@/components/catalog/ProductCover";
import { Button } from "@/components/ui/button";

/**
 * Drawer lateral do carrinho — Etapa 2. Usa @radix-ui/react-dialog
 * diretamente (não src/components/ui/dialog.tsx: aquele wrapper é um modal
 * central com cores do tema antigo/tarô — "ink"/"gold", não definidas no
 * tailwind.config.js atual — e este drawer precisa ser lateral e na
 * paleta teal/slate institucional). Controlado inteiramente por
 * CartContext (isOpen/closeCart) — nenhum estado próprio.
 */
export function CartDrawer() {
  const { items, itemCount, subtotalCents, removeItem, isOpen, closeCart } = useCart();

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-[80] flex h-full w-full max-w-[420px] flex-col bg-white shadow-[-8px_0_40px_-12px_rgba(15,23,42,0.35)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:duration-200 data-[state=open]:duration-300"
        >
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <DialogPrimitive.Title className="text-[17px] font-extrabold tracking-tight text-slate-900">
              Seu carrinho
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Fechar carrinho"
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:border-teal-300 hover:text-teal-700"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
              </button>
            </DialogPrimitive.Close>
          </div>

          {itemCount === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-slate-50 text-slate-400">
                <ShoppingBag className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[15px] font-semibold text-slate-800">Seu carrinho está vazio.</p>
                <p className="mt-1 text-[13.5px] text-slate-500">Explore nossos materiais.</p>
              </div>
              <DialogPrimitive.Close asChild>
                <Link
                  to={withCampaignQuery("/")}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-[13.5px] font-semibold text-slate-700 transition-colors hover:border-teal-300 hover:text-teal-700"
                >
                  Ver materiais
                </Link>
              </DialogPrimitive.Close>
            </div>
          ) : (
            <>
              <ul role="list" className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                {items.map((item) => (
                  <li
                    key={item.slug}
                    className="flex items-center gap-3 border-b border-slate-100 py-3.5 last:border-b-0"
                  >
                    <div className="h-14 w-[70px] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                      {item.coverUrl ? (
                        <img src={item.coverUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <ProductCover tone={toneForCategory(item.category)} className="h-full w-full rounded-none border-0" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-slate-900">{item.name}</p>
                      <p className="mt-1 text-[13px] font-bold text-teal-700">{formatPriceCents(item.priceCents, "BRL")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.slug)}
                      aria-label={`Remover ${item.name} do carrinho`}
                      className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="border-t border-slate-200 px-5 py-5 sm:px-6">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Subtotal</span>
                  <span className="text-[1.3rem] font-extrabold text-slate-900">{formatPriceCents(subtotalCents, "BRL")}</span>
                </div>
                <DialogPrimitive.Close asChild>
                  <Button asChild size="lg" full className="mt-4">
                    <Link to={withCampaignQuery("/carrinho")}>Ir para pagamento</Link>
                  </Button>
                </DialogPrimitive.Close>
                <DialogPrimitive.Close asChild>
                  <Link
                    to={withCampaignQuery("/")}
                    className="mt-3 block text-center text-[13.5px] font-semibold text-slate-500 transition-colors hover:text-teal-700"
                  >
                    Continuar comprando
                  </Link>
                </DialogPrimitive.Close>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
