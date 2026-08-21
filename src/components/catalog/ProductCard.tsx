import { Link } from "react-router-dom";
import { ArrowRight, Check, ShoppingCart } from "lucide-react";
import { formatPriceCents, productRoute, type PublicCatalogProduct } from "@/lib/catalogQueries";
import { withCampaignQuery } from "@/lib/utmTracking";
import { useCart } from "@/context/CartContext";
import { trackCartAddToCart } from "@/lib/cartPixel";
import { ProductCover, toneForCategory } from "@/components/catalog/ProductCover";

/** Sombra composta (contato + ambiente + longo alcance) — visível, não só sugerida. */
const CARD_SHADOW =
  "shadow-[0_2px_4px_rgba(15,23,42,0.04),0_12px_28px_rgba(15,23,42,0.07),0_32px_60px_-24px_rgba(15,23,42,0.14)]";
const CARD_SHADOW_HOVER =
  "hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_18px_36px_rgba(15,23,42,0.10),0_44px_80px_-28px_rgba(15,23,42,0.20)]";

/**
 * Card reutilizável do catálogo — usado em "/", /materiais e nos
 * relacionados de /produto/:slug. Recebe um PublicCatalogProduct pronto
 * (ver src/lib/catalogQueries.ts), já vindo da RPC pública
 * `get_active_product_catalog()` — nenhum dado hardcoded.
 *
 * Etapa 2: ganhou um botão "Adicionar ao carrinho" (CartContext) sem
 * remover "Ver material". Estrutura HTML deliberadamente mudou de "tudo
 * dentro de um único <Link>" para um <Link> cobrindo só a capa+texto
 * (navegação) + uma linha inferior com o botão de carrinho como elemento
 * IRMÃO do link "Ver material" — nunca um <button> aninhado dentro de
 * <a>, o que seria HTML inválido e quebraria navegação por teclado/leitor
 * de tela.
 */
export function ProductCard({ product }: { product: PublicCatalogProduct }) {
  const summary = product.shortDescription ?? product.description ?? "";
  const cart = useCart();
  const inCart = cart.hasItem(product.slug);

  function handleAddToCart() {
    if (cart.hasItem(product.slug)) return;
    cart.addItem({
      slug: product.slug,
      name: product.name,
      priceCents: product.priceCents,
      coverUrl: product.coverUrl,
      category: product.category,
    });
    trackCartAddToCart({ slug: product.slug, priceCents: product.priceCents });
  }

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-2xl border border-slate-900/[0.05] bg-white transition-all duration-200 hover:-translate-y-1 ${CARD_SHADOW} ${CARD_SHADOW_HOVER}`}
    >
      <Link to={withCampaignQuery(productRoute(product.slug))} className="flex flex-1 flex-col">
        {/* "Vitrine" da capa — compartimento com fundo próprio, separado do
            corpo branco do card, para a capa nunca ficar branco sobre branco. */}
        <div className="bg-slate-50 p-3.5">
          {product.coverUrl ? (
            <img
              src={product.coverUrl}
              alt={product.name}
              className="aspect-[4/3] w-full rounded-xl border border-slate-900/[0.06] object-cover"
            />
          ) : (
            <ProductCover tone={toneForCategory(product.category)} label={product.name} className="aspect-[4/3]" />
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2.5 p-5 pb-0">
          {product.category && (
            <span className="text-[11px] font-bold uppercase tracking-wide text-teal-700">{product.category}</span>
          )}
          <h3 className="text-[16.5px] font-bold leading-snug text-slate-900">{product.name}</h3>
          {summary && <p className="line-clamp-2 flex-1 text-[14px] leading-relaxed text-slate-600">{summary}</p>}
        </div>
      </Link>

      <div className="flex items-center justify-between gap-2 p-5 pt-3.5">
        <span className="text-[16px] font-extrabold text-slate-900">
          {formatPriceCents(product.priceCents, product.currency)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleAddToCart}
            aria-label={inCart ? `${product.name} já está no carrinho` : `Adicionar ${product.name} ao carrinho`}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
              inCart
                ? "border-teal-200 bg-teal-50 text-teal-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
            }`}
          >
            {inCart ? (
              <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
            ) : (
              <ShoppingCart className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            )}
          </button>
          <Link
            to={withCampaignQuery(productRoute(product.slug))}
            className="inline-flex items-center gap-1 whitespace-nowrap text-[13.5px] font-semibold text-teal-700"
          >
            Ver material
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              strokeWidth={2}
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
