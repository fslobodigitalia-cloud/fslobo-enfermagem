import { Link } from "react-router-dom";
import { Check, FileText, ShieldCheck, ShoppingCart, Sparkles, Zap } from "lucide-react";
import { withCampaignQuery } from "@/lib/utmTracking";
import type { PublicCatalogProduct } from "@/lib/catalogQueries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Bloco de compra premium + introdução editorial — PADRÃO de todas as
 * páginas normais de produto (/produto/:slug). Generalizado a partir do
 * experimento MedicationProductPurchase (que era exclusivo de
 * "medicamentos-na-pratica"); agora usado por qualquer produto, sem branch
 * por slug.
 *
 * IMPORTANTE — nenhuma lógica de negócio muda aqui: `onAddToCart` e
 * `onBuyNowClick` são exatamente as mesmas funções já usadas pela página
 * (CartContext, trackCartAddToCart), só passadas como props. O preço vem
 * sempre de `priceLabel` (formatPriceCents sobre product.priceCents), nunca
 * hardcoded.
 */

const PURCHASE_BENEFITS = [
  { icon: FileText, label: "Acesso digital" },
  { icon: Zap, label: "Liberação automática" },
  { icon: ShieldCheck, label: "Consulte quando precisar" },
];

export function ProductPurchaseCard({
  product,
  description,
  priceLabel,
  inCart,
  onAddToCart,
  onBuyNowClick,
}: {
  product: PublicCatalogProduct;
  description: string;
  priceLabel: string;
  inCart: boolean;
  onAddToCart: () => void;
  onBuyNowClick: () => void;
}) {
  const heroText = (product.shortDescription ?? product.description ?? "").trim();
  const aboutText = description.trim();
  // Evita mostrar a mesma descrição duas vezes: se o produto só tem
  // shortDescription (sem description própria), o texto já apareceu no
  // subtítulo da hero — "Sobre este material" só entra quando há um texto
  // realmente diferente para acrescentar.
  const showAbout = aboutText.length > 0 && aboutText !== heroText;

  return (
    <section id="comprar" className="scroll-mt-20 border-b border-slate-200 bg-white py-12 sm:py-16">
      <div
        className={cn(
          "mx-auto grid w-full max-w-[1200px] gap-10 px-5 sm:px-6 lg:gap-14",
          showAbout ? "lg:grid-cols-[1.05fr_0.95fr] lg:items-start" : "lg:max-w-[560px]",
        )}
      >
        {showAbout && (
          <div className="flex flex-col gap-4 lg:pt-2">
            {product.category && (
              <span className="w-fit text-[12px] font-bold uppercase tracking-[0.14em] text-teal-700">
                {product.category}
              </span>
            )}
            <h2 className="text-[1.5rem] font-extrabold tracking-tight text-slate-900 sm:text-[1.7rem]">
              Sobre este material
            </h2>
            <p className="max-w-[58ch] text-[15px] leading-relaxed text-slate-600 sm:text-[15.5px]">{aboutText}</p>
          </div>
        )}

        {/* Card de compra — profundidade em camadas (borda + duas sombras), sem virar "anúncio". */}
        <div className="lg:sticky lg:top-24">
          <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-24px_rgba(15,23,42,0.18)] sm:p-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-teal-100/50 blur-3xl"
            />

            <div className="relative flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-teal-700">
                  <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Material digital
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-[2.6rem] font-extrabold leading-none tracking-tight text-slate-900">
                    {priceLabel}
                  </span>
                </div>
                <span className="text-[13.5px] font-medium text-slate-500">Pagamento único via Pix</span>
              </div>

              <hr className="border-slate-200" />

              {/* Benefícios compactos — grade adaptativa, ícone pequeno + superfície discreta. */}
              <ul role="list" className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
                {PURCHASE_BENEFITS.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 sm:flex-col sm:items-start sm:gap-1.5 sm:px-3 sm:py-3"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-teal-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} aria-hidden="true" />
                    </span>
                    <span className="text-[13px] font-semibold leading-tight text-slate-700">{label}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-3">
                <Button size="lg" full onClick={onAddToCart} variant="outline" className="order-2 sm:order-1">
                  {inCart ? (
                    <>
                      <Check className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
                      Adicionado ao carrinho
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                      Adicionar ao carrinho
                    </>
                  )}
                </Button>
                <Button asChild size="lg" full className="order-1 shadow-[0_1px_2px_rgba(15,23,42,0.08),0_14px_28px_-10px_rgba(13,148,136,0.55)] sm:order-2">
                  <Link to={withCampaignQuery("/carrinho")} onClick={onBuyNowClick}>
                    <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                    Comprar agora
                  </Link>
                </Button>
              </div>

              <p className="text-center text-[12px] text-slate-400 sm:text-left">
                Pagamento seguro via Pix • Liberação após confirmação
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
