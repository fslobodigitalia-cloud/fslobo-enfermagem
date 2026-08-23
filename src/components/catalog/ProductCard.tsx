import { Link } from "react-router-dom";
import { ArrowRight, Check, ShoppingCart } from "lucide-react";
import { formatPriceCents, productRoute, type PublicCatalogProduct } from "@/lib/catalogQueries";
import { withCampaignQuery } from "@/lib/utmTracking";
import { useCart } from "@/context/CartContext";
import { trackCartAddToCart } from "@/lib/cartPixel";
import { trackTikTokAddToCart } from "@/lib/tiktokPixel";
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
    // Chamada IRMÃ do trackCartAddToCart acima — mesmo ponto exato, mesma
    // condição de guarda (só quando o produto realmente entra no
    // carrinho). Nunca substitui o Meta.
    trackTikTokAddToCart({
      slug: product.slug,
      name: product.name,
      category: product.category,
      priceCents: product.priceCents,
      currency: product.currency,
    });
  }

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-2xl border border-slate-900/[0.05] bg-white transition-all duration-200 hover:-translate-y-1 ${CARD_SHADOW} ${CARD_SHADOW_HOVER}`}
    >
      <Link to={withCampaignQuery(productRoute(product.slug))} className="flex flex-1 flex-col">
        {/* "Vitrine" da capa — compartimento com fundo próprio, separado do
            corpo branco do card, para a capa nunca ficar branco sobre branco.
            Padding menor no mobile (2 cards por linha não podem ter uma
            moldura grossa em volta da capa); sm+ preserva o valor original. */}
        <div className="bg-slate-50 p-2 sm:p-3.5">
          {product.coverUrl ? (
            <img
              src={product.coverUrl}
              alt={product.name}
              className="aspect-[4/3] w-full rounded-lg border border-slate-900/[0.06] object-cover sm:rounded-xl"
            />
          ) : (
            <ProductCover
              tone={toneForCategory(product.category)}
              label={product.name}
              className="aspect-[4/3] rounded-lg sm:rounded-xl"
            />
          )}
        </div>

        {/* Conteúdo — compacto no mobile (2 colunas): categoria/título
            menores, shortDescription escondida abaixo de sm para o card não
            ficar alto demais (o dado em si nunca é perdido, só não cabe
            visualmente em 2 colunas estreitas). */}
        <div className="flex flex-1 flex-col gap-1.5 p-3 pb-0 sm:gap-2.5 sm:p-5">
          {product.category && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-teal-700 sm:text-[11px]">
              {product.category}
            </span>
          )}
          <h3 className="line-clamp-2 text-[13.5px] font-bold leading-snug text-slate-900 sm:line-clamp-none sm:text-[16.5px]">
            {product.name}
          </h3>
          {summary && (
            <p className="hidden flex-1 text-[14px] leading-relaxed text-slate-600 line-clamp-2 sm:block">
              {summary}
            </p>
          )}
        </div>
      </Link>

      <div className="flex items-center justify-between gap-1.5 p-3 pt-2 sm:gap-2 sm:p-5 sm:pt-3.5">
        <span className="whitespace-nowrap text-[14px] font-extrabold text-slate-900 sm:text-[16px]">
          {formatPriceCents(product.priceCents, product.currency)}
        </span>
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={handleAddToCart}
            aria-label={inCart ? `${product.name} já está no carrinho` : `Adicionar ${product.name} ao carrinho`}
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors sm:h-9 sm:w-9 ${
              inCart
                ? "border-teal-200 bg-teal-50 text-teal-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
            }`}
          >
            {inCart ? (
              <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2.4} aria-hidden="true" />
            ) : (
              <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4" strokeWidth={2} aria-hidden="true" />
            )}
          </button>
          <Link
            to={withCampaignQuery(productRoute(product.slug))}
            className="inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold text-teal-700 sm:text-[13.5px]"
          >
            <span className="hidden sm:inline">Ver material</span>
            <span className="sm:hidden">Ver</span>
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 sm:h-4 sm:w-4"
              strokeWidth={2}
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
