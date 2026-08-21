import { Link, useParams } from "react-router-dom";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Download,
  FileText,
  HelpCircle,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useDocumentMeta } from "@/lib/seo";
import { withCampaignQuery } from "@/lib/utmTracking";
import { useProductCatalog } from "@/hooks/useProductCatalog";
import { formatPriceCents, type PublicCatalogProduct } from "@/lib/catalogQueries";
import { useCart } from "@/context/CartContext";
import { trackCartAddToCart } from "@/lib/cartPixel";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProductMockup } from "@/components/product/ProductMockup";
import { ProductCard } from "@/components/catalog/ProductCard";

/**
 * Página de produto — Etapa 2 (redesign de e-commerce premium). O
 * checkout inline (<ProductCheckout>, antes embutido nesta página) foi
 * removido: comprar agora leva ao carrinho (/carrinho), que concentra todo
 * o fluxo de pagamento — único ou multiproduto — numa única rota. O
 * componente antigo (src/components/product/ProductCheckout.tsx) não foi
 * apagado nem alterado, só deixou de ser importado aqui.
 *
 * Dados continuam vindo exclusivamente da RPC pública
 * (get_active_product_catalog, via useProductCatalog()) — nenhum dado de
 * produto é inventado. "Adicionar ao carrinho"/"Comprar agora" só
 * escrevem em CartContext (localStorage) e nunca enviam preço a lugar
 * nenhum: a cobrança real (src/pages/CartPage.tsx) sempre manda só slugs.
 */

const CHECKOUT_SECTION_ID = "comprar";

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

/**
 * Benefícios e público — texto genérico, verdadeiro para qualquer material
 * do catálogo (não fabricado por produto): a RPC pública não traz campos
 * de "destaques"/"para quem é" por produto, só nome, descrição,
 * categoria, preço e capa.
 */
const GENERIC_HIGHLIGHTS = ["Acesso digital", "Liberação automática após pagamento", "Consulte quando precisar"];

const CONTENT_BLOCKS = (description: string) => [
  { icon: Sparkles, title: "Sobre este material", body: description },
  { icon: FileText, title: "Conteúdo do material", body: description },
  {
    icon: Users,
    title: "Para quem é",
    body: "Para estudantes, técnicos e enfermeiros que buscam objetividade no estudo e na rotina profissional.",
  },
  {
    icon: Package,
    title: "O que você recebe",
    body: "Arquivo em PDF, com acesso liberado automaticamente após a confirmação do pagamento.",
  },
  {
    icon: Zap,
    title: "Acesso e entrega",
    body: "Pagamento via Pix, com liberação automática do acesso assim que a confirmação chega. Sem envio físico — a entrega é sempre digital.",
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

  if (status === "loading") return <LoadingState />;
  if (status === "error") return <ErrorState onRetry={retry} />;
  if (!product) return <NotFoundState />;

  const description = product.description ?? product.shortDescription ?? "Material digital para estudo e prática de enfermagem.";
  const priceLabel = formatPriceCents(product.priceCents, product.currency);
  const inCart = cart.hasItem(product.slug);

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
        {/* Breadcrumb discreto */}
        <div className="border-b border-slate-100">
          <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-1.5 px-5 py-3.5 text-[12.5px] text-slate-400 sm:px-6">
            <Link to={withCampaignQuery("/")} className="transition-colors hover:text-teal-700">
              Início
            </Link>
            {product.category && (
              <>
                <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                <span>{product.category}</span>
              </>
            )}
            <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
            <span className="font-semibold text-slate-600">{product.name}</span>
          </div>
        </div>

        {/* ─────────────────────────── Primeira dobra ─────────────────────────── */}
        <section id={CHECKOUT_SECTION_ID} className="scroll-mt-20 py-8 sm:py-12">
          <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-10 px-5 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14">
            {/* Esquerda — mockup 3D da capa */}
            <ProductMockup coverUrl={product.coverUrl} name={product.name} category={product.category} />

            {/* Direita — informações e compra */}
            <div className="flex flex-col gap-5">
              {product.category && (
                <span className="w-fit text-[12px] font-bold uppercase tracking-[0.14em] text-teal-700">
                  {product.category}
                </span>
              )}
              <h1 className="text-[2rem] font-extrabold leading-[1.12] tracking-tight text-slate-900 sm:text-[2.4rem]">
                {product.name}
              </h1>
              {(product.shortDescription ?? product.description) && (
                <p className="max-w-[54ch] text-[15.5px] leading-relaxed text-slate-600">
                  {product.shortDescription ?? product.description}
                </p>
              )}

              <hr className="my-1 border-slate-200" />

              <div className="flex flex-col gap-2">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-teal-700">
                  <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" /> Material digital
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-[2.5rem] font-extrabold leading-none tracking-tight text-slate-900">{priceLabel}</span>
                </div>
                <span className="text-[13.5px] font-medium text-slate-500">Pagamento único via Pix</span>
              </div>

              <ul role="list" className="flex flex-col gap-2">
                {GENERIC_HIGHLIGHTS.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[14px] font-medium text-slate-700">
                    <Check className="h-4 w-4 shrink-0 text-teal-600" strokeWidth={2.5} aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-2 hidden flex-col gap-3 sm:flex-row sm:gap-3 lg:flex">
                <Button size="lg" full className="sm:w-auto sm:flex-1" onClick={handleAddToCart}>
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
                <Button asChild variant="outline" size="lg" full className="sm:w-auto sm:flex-1">
                  <Link to={withCampaignQuery("/carrinho")} onClick={addProductToCart}>
                    Comprar agora
                  </Link>
                </Button>
              </div>

              {/* Mobile: CTAs empilhados (a barra sticky inferior cobre o "Adicionar ao carrinho" fixo; aqui ficam os dois, para quem não rolou até a barra ainda existir). */}
              <div className="mt-2 flex flex-col gap-3 lg:hidden">
                <Button size="lg" full onClick={handleAddToCart}>
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
                <Button asChild variant="outline" size="lg" full>
                  <Link to={withCampaignQuery("/carrinho")} onClick={addProductToCart}>
                    Comprar agora
                  </Link>
                </Button>
              </div>

              <div className="mt-1 flex items-center gap-2 text-[12.5px] text-slate-400">
                <ShieldCheck className="h-4 w-4 text-teal-600" strokeWidth={1.9} aria-hidden="true" />
                Liberação automática após a confirmação do Pix
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────── Conteúdo do produto ─────────────────────── */}
        <section className="border-t border-slate-200 py-14 sm:py-16">
          <div className="mx-auto w-full max-w-[820px] px-5 sm:px-6">
            <div className="overflow-hidden rounded-[28px] border border-slate-200">
              {CONTENT_BLOCKS(description).map(({ icon: Icon, title, body }, index) => (
                <div
                  key={title}
                  className={index % 2 === 0 ? "bg-white p-6 sm:p-8" : "bg-slate-50 p-6 sm:p-8"}
                >
                  <div className="flex items-start gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600">
                      <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-[1.05rem] font-extrabold text-slate-900">{title}</h2>
                      <p className="mt-1.5 text-[14.5px] leading-relaxed text-slate-600">{body}</p>
                    </div>
                  </div>
                  {index < CONTENT_BLOCKS(description).length - 1 && (
                    <div className="mt-6 border-t border-slate-200/70" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

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
