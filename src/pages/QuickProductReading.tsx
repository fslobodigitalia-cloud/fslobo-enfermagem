import * as React from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import {
  brand,
  getQuickProductBySlug,
  quickProductPath,
  quickProducts,
  sectionIds,
  type QuickProduct,
} from "@/config/site";
import { useDocumentMeta } from "@/lib/seo";
import { scrollToId } from "@/lib/scroll";
import { withCampaignQuery } from "@/lib/utmTracking";

import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/common/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/common/Reveal";
import { QuickProductFunnel } from "@/components/QuickProductFunnel";
import { Footer } from "@/components/Footer";
import { ConsentBanner } from "@/components/ConsentBanner";

export default function QuickProductReading() {
  const { slug } = useParams<{ slug: string }>();
  const product = slug ? getQuickProductBySlug(slug) : undefined;

  if (!product) return <Navigate to="/404" replace />;
  return <QuickProductPage product={product} />;
}

function QuickProductPage({ product }: { product: QuickProduct }) {
  useDocumentMeta({
    title: product.page.seoTitle,
    description: product.page.seoDescription,
    path: quickProductPath(product),
  });

  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [product.id]);

  const otherProduct = quickProducts.find((item) => item.id !== product.id);

  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-gold focus:px-4 focus:py-3 focus:text-ink"
      >
        Ir para o conteúdo
      </a>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-gold/20 bg-ink/80 backdrop-blur-xl">
        <div className="shell flex h-[72px] items-center justify-between gap-4">
          <Link to={withCampaignQuery("/")} aria-label={`${brand.name} — voltar ao início`}>
            <Logo size={34} className="sm:hidden" />
            <Logo size={42} className="hidden sm:inline-flex" />
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to={withCampaignQuery("/")}
              className="hidden min-h-[44px] items-center gap-2 rounded-2xl border border-gold/25 bg-white/[0.03] px-4 text-[14px] text-cream transition-colors hover:border-gold/55 sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />
              Voltar ao início
            </Link>
            <Button size="sm" onClick={() => scrollToId("funil-experiencia")}>
              Continuar
            </Button>
          </div>
        </div>
      </header>

      <main id="conteudo">
        <QuickProductFunnel product={product} />

        {/* ── Outras opções ── */}
        <section aria-labelledby="outras-opcoes-titulo" className="relative py-16 sm:py-20">
          <div className="shell relative z-10">
            <SectionHeading
              eyebrow="Continue explorando"
              title="Outras formas de consultar as cartas"
              titleId="outras-opcoes-titulo"
            />

            <RevealGroup as="ul" className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2">
              {otherProduct && (
                <RevealItem as="li">
                  <Link
                    to={withCampaignQuery(quickProductPath(otherProduct))}
                    className="group flex h-full flex-col justify-between gap-4 rounded-[22px] border border-gold/25 bg-white/[0.03] p-6 transition-colors duration-500 hover:border-gold/55"
                  >
                    <span>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-display text-[1.25rem] text-cream">
                          {otherProduct.name}
                        </span>
                        <span className="font-display text-[1.1rem] gold-text">
                          {otherProduct.priceLabel}
                        </span>
                      </span>
                      <span className="mt-2 block text-[13.5px] leading-relaxed text-dim">
                        {otherProduct.banner.text}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gold-light">
                      Ver esta experiência
                      <ArrowUpRight
                        className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </RevealItem>
              )}

              <RevealItem as="li">
                <Link
                  to={`${withCampaignQuery("/")}#${sectionIds.themes}`}
                  className="group flex h-full flex-col justify-between gap-4 rounded-[22px] border border-gold/25 bg-white/[0.03] p-6 transition-colors duration-500 hover:border-gold/55"
                >
                  <span>
                    <span className="font-display text-[1.25rem] text-cream">
                      Prefere escolher por tema?
                    </span>
                    <span className="mt-2 block text-[13.5px] leading-relaxed text-dim">
                      Amor, decisões, trabalho ou autoconhecimento — leituras mais profundas, com
                      pacotes por quantidade de perguntas.
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gold-light">
                    Ver leituras por tema
                    <ArrowUpRight
                      className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      strokeWidth={1.9}
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </RevealItem>
            </RevealGroup>
          </div>
        </section>
      </main>

      <Footer />
      <ConsentBanner />
    </>
  );
}
