import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { BadgeCheck, Check, Download, HelpCircle, Loader2, RefreshCw, ShoppingCart, Zap } from "lucide-react";
import { useDocumentMeta } from "@/lib/seo";
import { withCampaignQuery } from "@/lib/utmTracking";
import { useProductCatalog } from "@/hooks/useProductCatalog";
import { formatPriceCents, type PublicCatalogProduct } from "@/lib/catalogQueries";
import { useCart } from "@/context/CartContext";
import { trackCartAddToCart } from "@/lib/cartPixel";
import { trackTikTokAddToCart, trackTikTokViewContent } from "@/lib/tiktokPixel";
import { getProductPageContent } from "@/config/productPageContent";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ProductEditorialHero } from "@/components/product/ProductEditorialHero";
import { ProductPurchaseCard } from "@/components/product/ProductPurchaseCard";
import { ProductInfoGrid } from "@/components/product/ProductInfoGrid";

/**
 * Página de produto — SISTEMA PADRÃO DE PÁGINAS DE PRODUTO ("redesign
 * medicamentos-na-pratica" generalizado para todo o catálogo normal).
 *
 * TODA página /produto/:slug — atual ou futura, qualquer categoria — usa a
 * mesma identidade visual: ProductEditorialHero (hero sem vídeo, painel
 * visual abstrato + marquee) + ProductPurchaseCard (card de compra premium)
 * + ProductInfoGrid (grid visual de informações). Não existe mais branch
 * "if slug === X" — o que muda por produto é só o CONTEÚDO, resolvido por
 * getProductPageContent() (src/config/productPageContent.ts), que sempre
 * devolve algo utilizável mesmo para um produto sem entrada curada (nunca
 * quebra por um produto novo do CRM).
 *
 * EXCEÇÃO: /guia-evolucao-enfermagem é uma landing própria, servida por
 * outra rota (GuiaEvolucaoEnfermagemPage, ver App.tsx) — este arquivo não a
 * renderiza e não foi alterado por causa dela. Se o produto
 * "guia-evolucao-enfermagem" for acessado via /produto/:slug (rota
 * diferente), ele passa pelo mesmo sistema padrão que qualquer outro
 * produto sem conteúdo curado (fallback automático) — não há tratamento
 * especial aqui, de propósito, para nunca confundir as duas rotas.
 *
 * Dados continuam vindo exclusivamente da RPC pública
 * (get_active_product_catalog, via useProductCatalog()) — nenhum dado de
 * produto é inventado. "Adicionar ao carrinho"/"Comprar agora" só
 * escrevem em CartContext (localStorage) e nunca enviam preço a lugar
 * nenhum: a cobrança real (src/pages/CartPage.tsx) sempre manda só slugs.
 */

const GENERIC_FAQ = [
  {
    q: "Como recebo o material depois da compra?",
    a: "O acesso é liberado automaticamente assim que o pagamento via Pix é confirmado.",
  },
  {
    q: "Em qual formato o material é entregue?",
    a: "Arquivo digital em PDF, para consultar no computador, tablet ou celular.",
  },
  {
    q: "O acesso expira?",
    a: "Não. Depois de liberado, o material fica disponível para download sem prazo de expiração.",
  },
];

function LoadingState() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" aria-hidden="true" />
      </main>
      <SiteFooter />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />
      <main className="mx-auto flex min-h-[60vh] w-full max-w-[520px] flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-[15px] font-semibold text-slate-800">Não foi possível carregar este material agora.</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-[13.5px] font-semibold text-slate-700 transition-colors hover:border-teal-300 hover:text-teal-700"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Tentar novamente
        </button>
      </main>
      <SiteFooter />
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-4 px-5 py-24 text-center">
        <h1 className="text-[1.75rem] font-extrabold text-slate-900">Material não encontrado</h1>
        <p className="text-[15px] text-slate-600">
          Não encontramos este material no catálogo. Ele pode ter sido removido ou o endereço está
          incorreto.
        </p>
        <Button asChild className="mt-2">
          <Link to={withCampaignQuery("/")}>Ver todos os materiais</Link>
        </Button>
      </main>
      <SiteFooter />
    </div>
  );
}

function RelatedProducts({ products, currentSlug }: { products: PublicCatalogProduct[]; currentSlug: string }) {
  const related = products.filter((p) => p.slug !== currentSlug).slice(0, 4);
  if (related.length === 0) return null;

  return (
    <section className="border-t border-slate-200 bg-slate-50 py-14 sm:py-16">
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-6">
        <h2 className="text-[1.4rem] font-extrabold tracking-tight text-slate-900">Você também pode gostar</h2>
        <div className="mt-8 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-4">
          {related.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ProductPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { status, products, retry } = useProductCatalog();
  const product = products?.find((item) => item.slug === slug);
  const cart = useCart();

  useDocumentMeta({
    title: product ? `${product.name} | FSLobo Enfermagem` : "Material | FSLobo Enfermagem",
    description: product?.shortDescription ?? product?.description ?? "Material digital para estudo e prática de enfermagem.",
    path: `/produto/${slug}`,
  });

  // ViewContent (TikTok) — dispara quando um produto REAL termina de
  // carregar (nunca em loading/erro/"não encontrado"). Precisa vir antes
  // dos `return` condicionais abaixo (regra dos hooks: mesma quantidade de
  // hooks em toda renderização); a guarda `if (!product)` fica dentro do
  // efeito. trackTikTokViewContent() já se protege sozinho contra disparo
  // duplicado (StrictMode) para o mesmo slug — ver src/lib/tiktokPixel.ts.
  React.useEffect(() => {
    if (!product) return;
    trackTikTokViewContent({
      slug: product.slug,
      name: product.name,
      category: product.category,
      priceCents: product.priceCents,
      currency: product.currency,
    });
  }, [product]);

  if (status === "loading") return <LoadingState />;
  if (status === "error") return <ErrorState onRetry={retry} />;
  if (!product) return <NotFoundState />;

  const description = product.description ?? product.shortDescription ?? "Material digital para estudo e prática de enfermagem.";
  const priceLabel = formatPriceCents(product.priceCents, product.currency);
  const inCart = cart.hasItem(product.slug);
  const content = getProductPageContent(product);

  function addProductToCart() {
    if (!product) return;
    if (!cart.hasItem(product.slug)) {
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
      // carrinho). Nunca substitui o Meta, nunca é chamada de outro lugar.
      trackTikTokAddToCart({
        slug: product.slug,
        name: product.name,
        category: product.category,
        priceCents: product.priceCents,
        currency: product.currency,
      });
    }
  }

  function handleAddToCart() {
    addProductToCart();
    cart.openCart();
  }

  return (
    <div className="min-h-screen bg-white pb-24 font-sans text-slate-900 lg:pb-0">
      <SiteHeader />

      <main>
        <ProductEditorialHero product={product} content={content} />

        <ProductPurchaseCard
          product={product}
          description={description}
          priceLabel={priceLabel}
          inCart={inCart}
          onAddToCart={handleAddToCart}
          onBuyNowClick={addProductToCart}
        />

        <ProductInfoGrid content={content} />

        {/* FAQ */}
        <section className="border-t border-slate-200 bg-slate-50 py-14 sm:py-16">
          <div className="mx-auto w-full max-w-[820px] px-5 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600">
                <HelpCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <h2 className="text-[1.3rem] font-extrabold tracking-tight text-slate-900">Dúvidas frequentes</h2>
            </div>
            <Accordion type="single" collapsible className="mt-6 flex flex-col gap-3">
              {GENERIC_FAQ.map((item, index) => (
                <AccordionItem key={item.q} value={`item-${index}`}>
                  <AccordionTrigger>{item.q}</AccordionTrigger>
                  <AccordionContent>{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Confiança / selo */}
        <section className="border-t border-slate-200 py-10">
          <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-5 text-[12.5px] font-semibold text-slate-500 sm:px-6">
            <span className="flex items-center gap-1.5">
              <BadgeCheck className="h-4 w-4 text-teal-600" aria-hidden="true" /> Compra segura
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-teal-600" aria-hidden="true" /> Entrega automática
            </span>
            <span className="flex items-center gap-1.5">
              <Download className="h-4 w-4 text-teal-600" aria-hidden="true" /> Acesso sem expiração
            </span>
          </div>
        </section>

        {products && <RelatedProducts products={products} currentSlug={product.slug} />}
      </main>

      <SiteFooter />

      {/* Barra sticky inferior — só mobile, discreta, some detrás do conteúdo comum */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_-4px_rgba(15,23,42,0.12)] backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] text-slate-500">{product.name}</p>
            <p className="text-[16px] font-extrabold text-slate-900">{priceLabel}</p>
          </div>
          <Button size="sm" onClick={handleAddToCart} className="shrink-0">
            {inCart ? <Check className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /> : <ShoppingCart className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
            {inCart ? "No carrinho" : "Adicionar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
